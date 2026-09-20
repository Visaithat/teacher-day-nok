import { useCallback, useRef, useState } from 'react';
import { useUpdate } from '../lib/updateBus';
import type { FrameState } from '../state/frame';
import { frame } from '../state/frame';

/**
 * Mount a subtree only while the scroll is inside a window.
 *
 * Scene subsystems are invisible outside their own beat — the stars once the
 * city is below us, the garden once we are down the street — so keeping them
 * in the scene is pure cost. This watches `p` on the shared update pass and
 * re-renders only on the two frames where the answer actually flips, never
 * per frame.
 */
export function useScrollWindow(inside: (p: number) => boolean, sticky = false): boolean {
  const [active, setActive] = useState(() => inside(frame.p));
  const activeRef = useRef(active);

  const update = useCallback(
    (f: FrameState) => {
      // Sticky windows never close again. Used where tearing down would mean
      // re-downloading assets — scrubbing back over the boundary and forward
      // again should not put the scene through a second load.
      if (sticky && activeRef.current) return;
      const next = inside(f.p);
      if (next === activeRef.current) return;
      activeRef.current = next;
      setActive(next);
    },
    [inside, sticky],
  );

  useUpdate('camera', update);

  return active;
}
