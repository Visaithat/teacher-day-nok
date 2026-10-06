import { Suspense, lazy, useCallback, useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { pinnedTier, stepTier } from '../config/quality';
import { frame } from '../state/frame';
import { useUIStore } from '../state/useUIStore';

// Only pulled into the bundle when the overlay is actually asked for.
const Perf = lazy(async () => {
  const mod = await import('r3f-perf');
  return { default: mod.Perf };
});

/** `?perf` on the URL turns the HUD on in any build, including production. */
export function perfRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('perf');
}

function perfMode(): string | null {
  return new URLSearchParams(window.location.search).get('perf');
}

/**
 * Draw calls, triangles and frame time, on demand.
 *
 * Kept out of the default bundle and off by default — add `?perf` to the URL
 * to switch it on. It is the honest way to check the numbers in
 * PERFORMANCE.md on your own machine rather than taking mine.
 */
export function PerfHud(): React.ReactElement | null {
  if (!perfRequested()) return null;
  return (
    <>
      <FrameLog />
      {/* `?perf=log` keeps the record and drops the HUD, whose own draw would
          otherwise be part of every frame it is measuring. */}
      {perfMode() === 'log' ? null : (
        <Suspense fallback={null}>
          <Perf position="top-left" minimal={false} />
        </Suspense>
      )}
    </>
  );
}

/** A frame slower than this is logged. Two 60Hz frames. */
const LONG_FRAME_MS = 32;

interface LongFrame {
  /** Milliseconds since the previous frame. */
  ms: number;
  p: number;
  /** Programs and textures created since the previous frame. */
  programs: number;
  textures: number;
}

interface PerfLog {
  /** Every frame: `p` and its duration, interleaved. */
  frames: number[];
  long: LongFrame[];
  /** Live totals, for checking that nothing compiles or leaks mid-film. */
  programs: number;
  textures: number;
  geometries: number;
}

/**
 * The record behind the HUD: which frames ran long, where in the film, and
 * whether a shader compile or a texture upload landed on them.
 *
 * `window.__perfLog` under `?perf`. A long frame that also shows `programs`
 * or `textures` above zero was caused by first use of something; one that
 * shows neither is the frame's own work.
 */
function FrameLog(): null {
  const gl = useThree((s) => s.gl);
  const last = useRef({ at: 0, programs: 0, textures: 0 });

  useEffect(() => {
    const log: PerfLog = { frames: [], long: [], programs: 0, textures: 0, geometries: 0 };
    (window as unknown as { __perfLog: PerfLog }).__perfLog = log;
    (window as unknown as { __gpuJobs: number[] }).__gpuJobs = [];
  }, []);

  useFrame(() => {
    const log = (window as unknown as { __perfLog?: PerfLog }).__perfLog;
    if (!log) return;
    const now = performance.now();
    const programs = gl.info.programs?.length ?? 0;
    const { textures, geometries } = gl.info.memory;
    const prev = last.current;
    if (prev.at > 0) {
      const ms = now - prev.at;
      log.frames.push(frame.p, ms);
      if (ms > LONG_FRAME_MS) {
        log.long.push({
          ms: Math.round(ms),
          p: +frame.p.toFixed(4),
          programs: programs - prev.programs,
          textures: textures - prev.textures,
        });
      }
    }
    log.programs = programs;
    log.textures = textures;
    log.geometries = geometries;
    prev.at = now;
    prev.programs = programs;
    prev.textures = textures;
  });

  return null;
}

/**
 * Walks the quality ladder up and down with the measured frame rate.
 *
 * The tier scales device pixel ratio, star and flower counts, shadows and
 * depth of field. It moves one step at a time and waits for the reading to
 * settle, so a single heavy frame — a model finishing its upload, say — never
 * drops the whole film to low quality for the rest of the scroll.
 */
export function AdaptiveQuality(): React.ReactElement | null {
  // Held on one tier for a measurement run. Constant for the page's life, so
  // returning ahead of the hooks below never changes their order.
  if (pinnedTier()) return null;
  return <QualityLadder />;
}

/** Tier changes allowed before the ladder gives up and settles on low. */
const MAX_TIER_CHANGES = 3;

function QualityLadder(): React.ReactElement {
  const quality = useUIStore((s) => s.quality);
  const setQuality = useUIStore((s) => s.setQuality);
  const lastChange = useRef(0);
  const changes = useRef(0);
  const held = useRef(false);

  const settle = useCallback(
    (direction: 1 | -1) => {
      if (held.current) return;
      const now = performance.now();
      // Two seconds between changes: quality should never visibly pump.
      if (now - lastChange.current < 2000) return;
      const next = stepTier(quality, direction);
      // Already at that end of the ladder. Nothing to do - and, see below,
      // nothing to count.
      if (next === quality) return;
      lastChange.current = now;
      // After three changes, stop adjusting entirely and hold the cheapest.
      if (++changes.current > MAX_TIER_CHANGES) {
        held.current = true;
        setQuality('low');
        return;
      }
      setQuality(next);
    },
    [quality, setQuality],
  );

  // No `flipflops` here, deliberately. drei counts every incline and every
  // decline it reports toward that limit, including the ones that change
  // nothing: a machine running flat out on the top tier "inclines" every two
  // and a half seconds, and four of those were enough to trip the fallback
  // and drop it to the lowest tier for good - a rebuild mid-film as the
  // reward for running well. The limit is kept above, on changes that were
  // actually made.
  return <PerformanceMonitor onDecline={() => settle(-1)} onIncline={() => settle(1)} />;
}
