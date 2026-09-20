import { Suspense, lazy, useCallback, useRef } from 'react';
import { PerformanceMonitor } from '@react-three/drei';
import { stepTier } from '../config/quality';
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
    <Suspense fallback={null}>
      <Perf position="top-left" minimal={false} />
    </Suspense>
  );
}

/**
 * Walks the quality ladder up and down with the measured frame rate.
 *
 * The tier scales device pixel ratio, star and flower counts, shadows and
 * depth of field. It moves one step at a time and waits for the reading to
 * settle, so a single heavy frame — a model finishing its upload, say — never
 * drops the whole film to low quality for the rest of the scroll.
 */
export function AdaptiveQuality(): React.ReactElement {
  const quality = useUIStore((s) => s.quality);
  const setQuality = useUIStore((s) => s.setQuality);
  const lastChange = useRef(0);

  const settle = useCallback(
    (direction: 1 | -1) => {
      const now = performance.now();
      // Two seconds between changes: quality should never visibly pump.
      if (now - lastChange.current < 2000) return;
      const next = stepTier(quality, direction);
      if (next === quality) return;
      lastChange.current = now;
      setQuality(next);
    },
    [quality, setQuality],
  );

  return (
    <PerformanceMonitor
      onDecline={() => settle(-1)}
      onIncline={() => settle(1)}
      flipflops={3}
      // After three reversals, stop adjusting entirely and hold what we have.
      onFallback={() => setQuality('low')}
    />
  );
}
