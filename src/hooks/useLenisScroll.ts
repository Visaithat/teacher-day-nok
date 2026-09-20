import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { frame } from '../state/frame';

gsap.registerPlugin(ScrollTrigger);

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
  /** Lock or release the page scroll (Scene 1 holds it locked). */
  setLocked: (locked: boolean) => void;
  /** Jump back to the top, for Replay. */
  scrollToTop: () => void;
}

export function useLenisScroll(): React.RefObject<LenisController | null> {
  const controller = useRef<LenisController | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      // ~1.6 of GSAP scrub worth of easing, matching the original's feel.
      lerp: 0.09,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      smoothWheel: true,
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
      ScrollTrigger.update();
    };

    controller.current = {
      setLocked: (next: boolean) => {
        if (next === locked) return;
        locked = next;
        if (next) {
          lenis.stop();
          document.documentElement.style.overflow = 'hidden';
        } else {
          document.documentElement.style.overflow = '';
          // Releasing the scroll always means "the film starts now", so the
          // offset is zero by definition. Assert it rather than trust it: the
          // refresh below reads the document's real scroll position, and this
          // is the last moment a restore could still be sitting in it.
          toTop();
          lenis.start();
          ScrollTrigger.refresh();
        }
      },
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
