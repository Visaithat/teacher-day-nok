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

    /**
     * A finger is only a pointer while it is down.
     *
     * `pointerdown` is here because a clean tap can reach `click` without a
     * `pointermove` ever landing, and the music box only opens if the hover
     * raycast has already run - so the first tap on it did nothing at all.
     *
     * `pointerup` matters as much: `pointerleave` never fires on a touch
     * screen, so without this the last place somebody touched went on being
     * "the cursor" for the rest of the film, leaving a student lit up and the
     * music box primed long after the finger had gone.
     */
    const onDown = (e: PointerEvent) => {
      measure();
      onMove(e);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') frame.hasPointer = false;
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointerup', onUp, { passive: true });
    el.addEventListener('pointercancel', onUp, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
}
