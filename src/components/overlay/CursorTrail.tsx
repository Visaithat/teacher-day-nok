import { useCallback, useEffect, useRef } from 'react';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle } from '../../lib/domWrite';
import { lerp } from '../../lib/math';
import { isMobileDevice } from '../../config/quality';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import type { FrameState } from '../../state/frame';

/** How far behind the cursor each blob lags. Biggest and slowest first. */
const LAGS = [0.07, 0.14, 0.28] as const;

const BLOBS = [
  { size: 220, colour: 'rgba(180,205,255,0.20)', stop: '68%' },
  { size: 120, colour: 'rgba(210,225,255,0.22)', stop: '66%' },
  { size: 54, colour: 'rgba(255,255,255,0.32)', stop: '64%' },
] as const;

/**
 * Three soft blobs chasing the cursor during the sky beat.
 *
 * Each lags further behind than the last, which turns a mouse into a comet.
 * They only exist while the camera is up among the stars - once the city is
 * below us the frame is busy enough - and never on touch or reduced motion.
 */
export function CursorTrail(): React.ReactElement | null {
  const wrapRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trail = useRef([
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]);
  const pointer = useRef({ x: -9999, y: -9999 });
  const reduced = useReducedMotion();
  const mobile = isMobileDevice();

  useEffect(() => {
    if (mobile || reduced) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = e.clientX;
      pointer.current.y = e.clientY;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [mobile, reduced]);

  const update = useCallback(
    (f: FrameState) => {
      const strength = GATES.cursorTrail(f.p) * (f.opened ? 1 : 0);
      setOpacity(wrapRef.current, mobile || reduced ? 0 : strength);
      if (strength <= 0.01 || pointer.current.x < -900) return;

      for (let i = 0; i < LAGS.length; i++) {
        const t = trail.current[i];
        const el = blobRefs.current[i];
        if (!t || !el) continue;
        t.x = lerp(t.x, pointer.current.x, LAGS[i] as number);
        t.y = lerp(t.y, pointer.current.y, LAGS[i] as number);
        setStyle(el, 'transform', `translate3d(${t.x.toFixed(1)}px,${t.y.toFixed(1)}px,0)`);
      }
    },
    [mobile, reduced],
  );

  useUpdate('overlay', update, !mobile && !reduced);

  if (mobile || reduced) return null;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0 }}
    >
      {BLOBS.map((b, i) => (
        <div
          key={b.size}
          ref={(el) => {
            blobRefs.current[i] = el;
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: b.size,
            height: b.size,
            margin: `${-b.size / 2}px 0 0 ${-b.size / 2}px`,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${b.colour}, ${b.colour.replace(/[\d.]+\)$/, '0)')} ${b.stop})`,
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
}
