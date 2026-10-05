import type { Hand } from '../../config/students';

/**
 * ===========================================================================
 * THE FIVE HANDS — how each student's letter is written.
 * ===========================================================================
 *
 * The roster picks a `hand` by name; everything about how it looks lives here,
 * so `students.ts` stays about what the five people actually say. The drawings
 * are next door in `letterDoodles.tsx` — they are markup, and a module that
 * exports both components and constants loses fast refresh.
 */

export interface HandStyle {
  /** Family stack. Every entry ends in a generic cursive so a failed webfont
   *  request costs the letter its handwriting, never its legibility. None of
   *  the five hands has Lao glyphs, so each one names the Looped face second:
   *  the Lao in a letter falls through to it, the Latin stays handwritten. */
  readonly family: string;
  /**
   * Multiplier on the card's base size.
   *
   * These faces are drawn to wildly different x-heights — Caveat sets tiny for
   * its point size and Gloria Hallelujah enormous — so a single font-size
   * would make one letter unreadable and another overflow the card.
   */
  readonly size: number;
  /** Ink. All five are dark enough on paper; none of them is pure black. */
  readonly ink: string;
  /** Line height. The loopier hands need the extra air or they tangle. */
  readonly leading: number;
  /** Degrees the signature sits off square, so no two are signed alike. */
  readonly signTilt: number;
}

export const HANDS: Record<Hand, HandStyle> = {
  /** Timmy — a neat, blocky print that still slopes. His letter is the
   *  longest, in Lao, so the leading is the 1.5 the Lao face is comfortable at
   *  rather than the 1.62 this hand had for English: every bit of line height
   *  given back is font size the fit in `LetterCard` does not have to take. */
  patrick: {
    family: "'Patrick Hand', 'Noto Sans Lao Looped', 'Bradley Hand', cursive",
    size: 1,
    ink: '#2f3a52',
    leading: 1.5,
    signTilt: -1.6,
  },
  /** Kengkue — loose and fast, the way someone draws rather than writes. His
   *  letter is in Lao, and the 1.3 this hand had for English let the stacked
   *  vowel signs of one line touch the next; 1.5 is the Lao face's. */
  caveat: {
    family: "'Caveat', 'Noto Sans Lao Looped', 'Segoe Script', cursive",
    size: 1.34,
    ink: '#2a2f3d',
    leading: 1.5,
    signTilt: 2.4,
  },
  /** Vanhxay — round, evenly spaced, faintly stubborn. His letter is in Lao;
   *  1.5 is the Lao face's leading, and the 1.72 this hand had for English
   *  cost his letter most of a pixel of font size on every card. */
  indie: {
    family: "'Indie Flower', 'Noto Sans Lao Looped', 'Comic Sans MS', cursive",
    size: 0.98,
    ink: '#33445c',
    leading: 1.5,
    signTilt: -2.8,
  },
  /** Namthip — thin and precise, written with a fine nib. Her letter is in
   *  Lao, which Shadows Into Light has no glyphs for, so the Lao falls through
   *  to the Looped face index.html already loads for the finale. The leading
   *  is set for that face, not this one: 1.5 is as tight as Lao goes before
   *  the stacked vowel signs touch. */
  shadows: {
    family: "'Shadows Into Light', 'Noto Sans Lao Looped', 'Segoe Script', cursive",
    size: 1.14,
    ink: '#3a3550',
    leading: 1.5,
    signTilt: 1.4,
  },
  /** Nina — big, bouncy, takes up the whole line. Her letter is the longest
   *  of the five and in Lao; at the 1.82 this hand had for English it set at
   *  7px on a small laptop's card, at the Lao face's 1.5 it sets at 8. */
  gloria: {
    family: "'Gloria Hallelujah', 'Noto Sans Lao Looped', 'Comic Sans MS', cursive",
    size: 0.84,
    ink: '#2e3b4e',
    leading: 1.5,
    signTilt: -0.9,
  },
};
