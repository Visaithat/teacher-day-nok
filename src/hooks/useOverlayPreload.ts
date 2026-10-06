import { useEffect } from 'react';
import { HANDS } from '../components/overlay/letterHands';
import { STUDENTS, assetUrl } from '../config/students';
import { useUIStore } from '../state/useUIStore';

/** Held so the browser keeps what it fetched and decoded. */
const held: HTMLImageElement[] = [];

/**
 * Fetch what the student cards will need before the street asks for it.
 *
 * Each card is a photograph and a letter in that student's own handwriting.
 * Left alone, both are requested the moment the card first appears - which is
 * the moment the camera is easing onto the student - and the handwriting face
 * arriving a beat later re-lays the letter out a second time. None of it is
 * large; it only has to be early. So once the loader has gone and the browser
 * has a spare moment, all five are fetched: the photographs, and for each hand
 * exactly the glyphs its letter uses, which is how the Lao face (split into
 * unicode ranges, fetched per range) gets loaded for the right ranges.
 */
export function useOverlayPreload(): void {
  const booted = useUIStore((s) => s.booted);

  useEffect(() => {
    if (!booted) return;

    const run = (): void => {
      for (const s of STUDENTS) {
        const src = s.panelPhoto || s.photo;
        if (src) {
          const img = new Image();
          img.decoding = 'async';
          img.src = assetUrl(src);
          // A failure here is the card's to report, when it asks for itself.
          img.decode?.().catch(() => undefined);
          held.push(img);
        }

        const letter = [s.letter.greeting, ...s.letter.body, s.letter.wish, s.en].join(' ');
        void document.fonts.load(`16px ${HANDS[s.hand].family}`, letter).catch(() => undefined);
        // The finale's callouts: Patrick Hand over the same Lao fallback.
        void document.fonts
          .load(`16px ${HANDS.patrick.family}`, s.finaleMsg)
          .catch(() => undefined);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 800);
    return () => window.clearTimeout(id);
  }, [booted]);
}
