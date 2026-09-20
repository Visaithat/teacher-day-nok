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
   *  request costs the letter its handwriting, never its legibility. */
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
  /** Timmy — a neat, blocky print that still slopes. */
  patrick: {
    family: "'Patrick Hand', 'Bradley Hand', cursive",
    size: 1,
    ink: '#2f3a52',
    leading: 1.62,
    signTilt: -1.6,
  },
  /** Kengkue — loose and fast, the way someone draws rather than writes. */
  caveat: {
    family: "'Caveat', 'Segoe Script', cursive",
    size: 1.34,
    ink: '#2a2f3d',
    leading: 1.3,
    signTilt: 2.4,
  },
  /** Vanhxay — round, evenly spaced, faintly stubborn. */
  indie: {
    family: "'Indie Flower', 'Comic Sans MS', cursive",
    size: 0.98,
    ink: '#33445c',
    leading: 1.72,
    signTilt: -2.8,
  },
  /** Namthip — thin and precise, written with a fine nib. */
  shadows: {
    family: "'Shadows Into Light', 'Segoe Script', cursive",
    size: 1.14,
    ink: '#3a3550',
    leading: 1.66,
    signTilt: 1.4,
  },
  /** Nina — big, bouncy, takes up the whole line. */
  gloria: {
    family: "'Gloria Hallelujah', 'Comic Sans MS', cursive",
    size: 0.84,
    ink: '#2e3b4e',
    leading: 1.82,
    signTilt: -0.9,
  },
};
