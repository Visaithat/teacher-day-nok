import { useCallback, useEffect, useRef } from 'react';
import { stepSeconds, stepStops, type StepStop } from '../config/timeline';
import { frame } from '../state/frame';
import { NARROW_ASPECT } from '../state/viewport';
import { useUIStore } from '../state/useUIStore';
import { useViewport } from './useViewport';
import type { LenisController } from './useLenisScroll';

/** How far a finger has to travel, vertically, to count as a swipe. */
const SWIPE_MIN_PX = 50;
/**
 * ...and how quickly. Anything slower is someone resting a thumb. Generous,
 * because nothing else on a stepped page wants a vertical drag: the page
 * does not scroll, so an unhurried swipe still means "move on".
 */
const SWIPE_MAX_MS = 1000;
/** A `click` this soon after a swipe is the swipe's own, and is dropped. */
const SWIPE_CLICK_GUARD_MS = 350;

/**
 * The stops for the shot on screen now. Read at call time, never cached.
 *
 * Off the window, not `viewport.aspect`: that is published from inside the
 * canvas a frame or more after a rotation, and `StepNav` re-renders on the
 * rotation itself - so it would draw the old shot's row of dots. The stage
 * fills the window, so the two agree once the canvas catches up.
 */
export function currentStops(): readonly StepStop[] {
  return stepStops(window.innerWidth / Math.max(1, window.innerHeight) < NARROW_ASPECT);
}

export interface StepNav {
  /** True on a phone or tablet - the film plays stop to stop there. */
  touch: boolean;
  next: () => void;
  back: () => void;
  /** True while a just-finished swipe's trailing `click` may still arrive. */
  swipedJustNow: () => boolean;
}

/**
 * The film's controls on a touch screen.
 *
 * A phone does not scroll this film (see `stepStops`). This takes the scroll
 * away from the finger (`setStepped`), plays to the title as soon as the gift
 * has opened, and then moves one stop at a time on Next / Back or a vertical
 * swipe on the stage - up for next, down for back, the way a finger already
 * expects to move down a page.
 *
 * `held` is the message dialog being open. Nothing moves the film then: the
 * dialog pauses it precisely so the student behind the card stays put.
 */
export function useStepNav(
  scroll: React.RefObject<LenisController | null>,
  stage: React.RefObject<HTMLDivElement | null>,
  held: React.RefObject<boolean>,
): StepNav {
  const { touch } = useViewport();
  const unlocked = useUIStore((s) => s.unlocked);
  const stepIndex = useUIStore((s) => s.stepIndex);
  const setStepIndex = useUIStore((s) => s.setStepIndex);
  const lastSwipeAt = useRef(-Infinity);

  useEffect(() => {
    scroll.current?.setStepped(touch);
  }, [scroll, touch]);

  const goTo = useCallback(
    (i: number) => {
      const stops = currentStops();
      const at = Math.max(0, Math.min(stops.length - 1, i));
      const stop = stops[at];
      if (!stop) return;
      scroll.current?.scrollToProgress(stop.p, { duration: stepSeconds(frame.p, stop) });
      setStepIndex(at);
    },
    [scroll, setStepIndex],
  );

  const next = useCallback(() => {
    if (held.current) return;
    const i = useUIStore.getState().stepIndex;
    if (i < currentStops().length - 1) goTo(i + 1);
  }, [goTo, held]);

  const back = useCallback(() => {
    if (held.current) return;
    const i = useUIStore.getState().stepIndex;
    if (i > 0) goTo(i - 1);
  }, [goTo, held]);

  // Straight to the title once the gift is open, and again after Replay
  // (which puts the film back at 0 and the index back to -1).
  useEffect(() => {
    if (touch && unlocked && stepIndex === -1) goTo(0);
  }, [touch, unlocked, stepIndex, goTo]);

  // Swipes, on the stage. The overlay lives inside it, so gestures on the
  // controls arrive here too: a tap on Next travels nowhere near 50px, and a
  // drag inside the message dialog is ignored because the dialog holds the
  // film (`held`) for as long as it is open.
  useEffect(() => {
    const el = stage.current;
    if (!touch || !el) return;
    let start: { x: number; y: number; t: number; id: number } | null = null;

    const onDown = (e: PointerEvent): void => {
      if (!e.isPrimary) return;
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    };
    const onUp = (e: PointerEvent): void => {
      const s = start;
      start = null;
      if (!s || e.pointerId !== s.id) return;
      if (!useUIStore.getState().unlocked) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (performance.now() - s.t > SWIPE_MAX_MS) return;
      if (Math.abs(dy) < SWIPE_MIN_PX || Math.abs(dy) <= Math.abs(dx)) return;
      lastSwipeAt.current = performance.now();
      if (dy < 0) next();
      else back();
    };
    const onCancel = (): void => {
      start = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [touch, stage, next, back]);

  const swipedJustNow = useCallback(
    () => performance.now() - lastSwipeAt.current < SWIPE_CLICK_GUARD_MS,
    [],
  );

  return { touch, next, back, swipedJustNow };
}
