import { useEffect, useState } from 'react';

/**
 * The frame shape, for the DOM overlay layer.
 *
 * Deliberately separate from `state/viewport.ts`, which is driven by R3F's
 * canvas size and answers questions about projection. This one answers "what
 * shape is this UI", in the terms CSS already thinks in, and it is a hook
 * because the overlays are React and want to re-render on a rotation.
 *
 * It exists because `isMobileDevice()` in `config/quality.ts` is read once at
 * render with no subscription: rotating a tablet across the 820px boundary
 * never re-evaluated it, and its only consumer in the DOM was `CursorTrail`.
 */
export type FrameSize = 'phone' | 'tablet' | 'desktop';

export interface Viewport {
  size: FrameSize;
  portrait: boolean;
  /** A touch screen, or any other pointer that cannot hover. */
  coarse: boolean;
  /**
   * True where the student panel has to stop being a card at the side of the
   * frame and become a sheet across the bottom of it.
   *
   * Not simply `size === 'phone'`: a 700px-wide portrait window has the same
   * problem, and `min(380px, 30vw)` gives it a 210px card.
   *
   * Tablets get it too, whatever their width or orientation: a touch screen
   * is driven by a finger, so it gets the phone's button-and-dialog rather
   * than a desktop card that is read by hovering and clicking. "Touch" is the
   * primary pointer being coarse AND unable to hover, so a touch-screen laptop
   * driven by its trackpad keeps the desktop card.
   */
  sheet: boolean;
  /**
   * A phone or tablet: the primary pointer is a finger, coarse and unable to
   * hover. Such a screen does not scroll the film - it plays it stop to stop
   * (see `stepStops`). A narrow desktop window, or a touch laptop driven by
   * its trackpad, still scrolls.
   */
  touch: boolean;
}

const QUERIES = {
  phone: '(max-width: 640px)',
  tablet: '(min-width: 641px) and (max-width: 1024px)',
  portrait: '(orientation: portrait)',
  coarse: '(pointer: coarse)',
  sheet:
    '(max-width: 640px), (orientation: portrait) and (max-width: 760px), (pointer: coarse) and (hover: none)',
  touch: '(pointer: coarse) and (hover: none)',
} as const;

function measure(): Viewport {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return { size: 'desktop', portrait: false, coarse: false, sheet: false, touch: false };
  }
  const phone = window.matchMedia(QUERIES.phone).matches;
  const tablet = window.matchMedia(QUERIES.tablet).matches;
  return {
    size: phone ? 'phone' : tablet ? 'tablet' : 'desktop',
    portrait: window.matchMedia(QUERIES.portrait).matches,
    coarse: window.matchMedia(QUERIES.coarse).matches,
    sheet: window.matchMedia(QUERIES.sheet).matches,
    touch: window.matchMedia(QUERIES.touch).matches,
  };
}

let current: Viewport = measure();
let listening = false;

/**
 * The same answer, without a subscription.
 *
 * For the update-bus callbacks, which run inside the render loop and outside
 * React entirely - `StudentPanel` reads it there to decide whether the
 * per-frame side-swap still means anything.
 */
export function readViewport(): Viewport {
  if (!listening && typeof window !== 'undefined' && window.matchMedia) {
    listening = true;
    const refresh = (): void => {
      current = measure();
    };
    for (const q of Object.values(QUERIES)) {
      window.matchMedia(q).addEventListener('change', refresh);
    }
    refresh();
  }
  return current;
}

/**
 * Whether hover is a state this pointer can actually leave again.
 *
 * `pointerenter`/`pointerleave` both fire on a touch screen, but the leave
 * only arrives on the next tap somewhere else - so a handler that paints a
 * hover colour latches it on for the rest of the film.
 */
export function canHover(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(hover: hover)').matches;
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => readViewport());

  useEffect(() => {
    const mqs = Object.values(QUERIES).map((q) => window.matchMedia(q));
    const onChange = (): void => {
      current = measure();
      setVp(current);
    };
    for (const mq of mqs) mq.addEventListener('change', onChange);
    // A query can have flipped between the first render and this effect.
    onChange();
    return () => {
      for (const mq of mqs) mq.removeEventListener('change', onChange);
    };
  }, []);

  return vp;
}
