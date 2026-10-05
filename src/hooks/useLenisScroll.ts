import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { frame } from '../state/frame';

gsap.registerPlugin(ScrollTrigger);

/**
 * A mobile URL bar collapsing is a resize, and with `invalidateOnRefresh` set
 * on the timeline below every one of them recomputes `max` against a 3200vh
 * spacer that just changed height - so the film jumps mid-scroll, repeatedly,
 * for the whole of a phone's first swipe. The scroll extent in CSS pixels has
 * not really changed, so ignoring that particular resize is not a compromise.
 *
 * It is global config rather than a trigger option, which is why it is here
 * beside the plugin registration and not in the timeline.
 */
ScrollTrigger.config({ ignoreMobileResize: true });

/**
 * The single source of scroll for the whole film.
 *
 * Lenis owns smooth scrolling; ONE GSAP timeline is scrubbed by it and its
 * only job is writing normalised progress into `frame.target`. Everything
 * downstream - camera, world gates, characters, overlays - reads that one
 * number. No component anywhere else creates a ScrollTrigger.
 *
 * Two things the source did are deliberately not done here:
 *
 *  - It read `scrollHeight - clientHeight` inside the scroll handler on every
 *    scroll event, while the render loop was writing inline styles every
 *    frame. That is a forced-synchronous-layout loop and was the single
 *    biggest source of the reported stutter. ScrollTrigger caches the scroll
 *    extent and recomputes it only on refresh/resize.
 *  - It smoothed with a raw per-frame factor, making camera velocity depend
 *    on refresh rate. Smoothing now happens in `useCameraSolver` with a
 *    dt-corrected damp.
 */
export interface LenisController {
  /**
   * Lock or release the page scroll. Scene 1 holds it locked.
   *
   * RELEASING REWINDS. For this control "unlock" means "the film starts now",
   * so it asserts the offset back to zero on the way out. That is the gift
   * handoff, not a general-purpose resume - see `setPaused`.
   */
  setLocked: (locked: boolean) => void;
  /**
   * Freeze the film where it stands, and carry on from exactly there.
   *
   * The phone's message dialog holds this while it is open: the film is
   * scroll-driven, so without it a scroll behind the card would change which
   * student the reader is looking at. Touches neither the offset nor the
   * scrubbed timeline, so closing the card does not cost the viewer their
   * place.
   */
  setPaused: (paused: boolean) => void;
  /**
   * Take the scroll away from the finger, for good, on a touch screen.
   *
   * A phone does not scroll this film; it plays between stops on a swipe or a
   * button (see `stepStops`). That is a third hold, independent of the other
   * two, so closing the message dialog - which releases `paused` - can never
   * hand finger-scrolling back.
   */
  setStepped: (stepped: boolean) => void;
  /**
   * Play the film to progress `p` over `duration` seconds, or jump there.
   *
   * Driven through the real scroll offset rather than by writing
   * `frame.target`, so the timeline, every gate and every later
   * `ScrollTrigger.refresh` all agree on where the film is. Works while held.
   */
  scrollToProgress: (p: number, opts?: { duration?: number; immediate?: boolean }) => void;
  /** Jump back to the top, for Replay. */
  scrollToTop: () => void;
}

/** Slow out of the stop, slow into the next one. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function useLenisScroll(): React.RefObject<LenisController | null> {
  const controller = useRef<LenisController | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      // ~1.6 of GSAP scrub worth of easing, matching the original's feel.
      lerp: 0.09,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      smoothWheel: true,
      // Stated rather than inherited. Touch scrolling stays native and Lenis
      // only observes it: hijacking it would fight the browser's own
      // fling physics and, on iOS, the URL-bar collapse that rides on them.
      syncTouch: false,
    });

    const onLenisScroll = () => ScrollTrigger.update();
    lenis.on('scroll', onLenisScroll);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    // GSAP's lag smoothing fights Lenis and produces exactly the kind of
    // velocity jump we are trying to remove.
    gsap.ticker.lagSmoothing(0);

    // The one timeline. A single tween on a proxy, scrubbed across the whole
    // document, publishing progress to the frame singleton.
    const proxy = { value: 0 };
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: document.documentElement,
        start: 0,
        end: 'max',
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
    tl.to(proxy, {
      value: 1,
      ease: 'none',
      onUpdate: () => {
        frame.target = proxy.value;
      },
    });

    let locked = false;
    /** A dialog holding the film still. Independent of `locked`. */
    let paused = false;
    /** A touch screen, playing stop to stop. Independent of both. */
    let stepped = false;
    /**
     * Where `scrollToProgress` last sent the film. A rotation changes the
     * viewport height, and with it how many pixels one unit of progress is,
     * so a stepped film is put back here after every refresh.
     */
    let parkedAt = 0;

    /**
     * Put the document, Lenis, the timeline and the frame all back at zero.
     *
     * All four, together: resetting only the scroll offset leaves the scrubbed
     * proxy where it was, and resetting only the proxy leaves the offset for
     * Lenis to sync back to on the first wheel event. `force` is required
     * because Scene 1 has already called `lenis.stop()`, and a stopped Lenis
     * ignores `scrollTo` without it.
     */
    const toTop = (): void => {
      lenis.scrollTo(0, { immediate: true, force: true });
      window.scrollTo(0, 0);
      proxy.value = 0;
      frame.target = 0;
      frame.p = 0;
      parkedAt = 0;
      ScrollTrigger.update();
    };

    /** The scroll offset that is progress `p`, at today's viewport height. */
    const offsetFor = (p: number): number =>
      p * Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const scrollToProgress = (
      p: number,
      { duration, immediate = false }: { duration?: number; immediate?: boolean } = {},
    ): void => {
      parkedAt = p;
      lenis.scrollTo(offsetFor(p), {
        immediate,
        ...(duration === undefined ? {} : { duration }),
        easing: easeInOutCubic,
        // A held Lenis ignores `scrollTo` without it, and a stepped film is
        // always held. Lenis still advances the animation while stopped.
        force: true,
      });
    };

    const onRefresh = (): void => {
      if (stepped && !locked) scrollToProgress(parkedAt, { immediate: true });
    };
    ScrollTrigger.addEventListener('refresh', onRefresh);

    /**
     * Apply the three independent holds.
     *
     * Scene 1's lock, the dialog's pause and a touch screen's stepping know
     * nothing about each other; only this does. Keeping them separate is what
     * stops a pause from ever reaching `toTop()` - and stops a resume from
     * starting Lenis behind Scene 1's back while it still holds the film at
     * the gift box.
     *
     * `overflow: hidden` is the part that actually stops a finger. Lenis runs
     * with `syncTouch: false`, so touch scrolling is native and `lenis.stop()`
     * only blocks the virtual wheel path. (On iOS it is not enough on its own;
     * a stepped page also gets `touch-action: none` on the stage, in CSS.)
     */
    const applyHold = (): void => {
      if (locked || paused || stepped) {
        lenis.stop();
        document.documentElement.style.overflow = 'hidden';
      } else {
        document.documentElement.style.overflow = '';
        lenis.start();
        // `update`, never `refresh`. Nothing a refresh recomputes has changed,
        // and with `invalidateOnRefresh` on a 3200vh spacer it is exactly the
        // mid-scroll jump `ignoreMobileResize` above exists to suppress.
        ScrollTrigger.update();
      }
    };

    controller.current = {
      setLocked: (next: boolean) => {
        if (next === locked) return;
        locked = next;
        if (next) {
          applyHold();
          return;
        }
        document.documentElement.style.overflow = '';
        // Releasing the scroll always means "the film starts now", so the
        // offset is zero by definition. Assert it rather than trust it: the
        // refresh below reads the document's real scroll position, and this
        // is the last moment a restore could still be sitting in it.
        toTop();
        applyHold();
        ScrollTrigger.refresh();
      },
      setPaused: (next: boolean) => {
        if (next === paused) return;
        paused = next;
        applyHold();
      },
      setStepped: (next: boolean) => {
        if (next === stepped) return;
        stepped = next;
        document.documentElement.classList.toggle('stepped', next);
        applyHold();
      },
      scrollToProgress,
      scrollToTop: toTop,
    };

    // Scene 1 holds the scroll until the gift box is open.
    controller.current.setLocked(true);

    // ...and it starts at the beginning, whatever the browser remembered.
    //
    // `history.scrollRestoration = 'manual'` in `main.tsx` covers the reload
    // case, but it is advisory: a back/forward restore from the bfcache puts
    // the old offset back regardless, and fires `pageshow` rather than
    // re-running any of this. `load` catches a restore that lands after mount.
    toTop();

    // Only while Scene 1 still holds the scroll. Once the film is running the
    // offset is the user's, and a late restore event must not yank it back.
    // The restore can also land a frame AFTER `load`, hence the second pass.
    const resetIfLocked = (): void => {
      if (!locked) return;
      toTop();
      requestAnimationFrame(() => {
        if (locked) toTop();
      });
    };
    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted) resetIfLocked();
    };
    window.addEventListener('load', resetIfLocked);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      controller.current = null;
      window.removeEventListener('load', resetIfLocked);
      window.removeEventListener('pageshow', onPageShow);
      ScrollTrigger.removeEventListener('refresh', onRefresh);
      document.documentElement.classList.remove('stepped');
      lenis.off('scroll', onLenisScroll);
      gsap.ticker.remove(raf);
      tl.scrollTrigger?.kill();
      tl.kill();
      lenis.destroy();
      document.documentElement.style.overflow = '';
    };
  }, []);

  return controller;
}
