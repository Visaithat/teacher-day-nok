import { useEffect, type RefObject } from 'react';
import { frame } from '../state/frame';

/**
 * Tracks the pointer in normalised device coordinates for the hover raycasts.
 *
 * The bounding rect is cached and refreshed on resize/scroll-refresh rather
 * than read per pointer event, so moving the mouse never forces a layout.
 */
export function usePointerTracking(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let rect = el.getBoundingClientRect();
    const measure = () => {
      rect = el.getBoundingClientRect();
    };

    const onMove = (e: PointerEvent) => {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      frame.ndcX = (x / rect.width) * 2 - 1;
      frame.ndcY = -(y / rect.height) * 2 + 1;
      frame.hasPointer = true;
    };

    const onLeave = () => {
      frame.hasPointer = false;
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
}
