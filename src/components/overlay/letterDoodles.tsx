import type { Doodle } from '../../config/students';

/**
 * The doodle in the corner of the letter.
 *
 * Drawn rather than typed so it inherits the writer's ink and so it survives
 * at any size. Everything is stroked in `currentColor` with round caps and a
 * deliberately uneven line — a perfectly circular circle reads as clip art,
 * not as something biro'd into a margin.
 */
const DOODLES: Record<Doodle, React.ReactElement> = {
  /** Timmy: a small robot, plainly fond of you. */
  robot: (
    <>
      <path d="M32 9c0 4-1 6-1 8" />
      <path d="M28.6 7.4c1.6-2.6 5.2-1.4 3.4 1.2-1.8-2.6-5-1.4-3.4-1.2Z" />
      <path d="M35.4 7.4c-1.6-2.6-5.2-1.4-3.4 1.2 1.8-2.6 5-1.4 3.4-1.2Z" />
      <rect x="14" y="17" width="36" height="28" rx="7" />
      <circle cx="25" cy="28" r="2.6" />
      <circle cx="39" cy="28" r="2.6" />
      <path d="M25 36c3.6 3.4 10.4 3.4 14 0" />
      <path d="M14 27H9m41 0h5" />
      <path d="M23 45v7m18-7v7" />
    </>
  ),
  /** Kengkue: a palette, still wet, with the brush laid across it. */
  palette: (
    <>
      <path d="M31 12c11 0 20 7.6 20 17 0 5.4-4.2 7.4-7.6 7.4-2.6 0-4.4-1-6.4-1-2.2 0-3.4 1.6-3.4 3.6 0 3-2.6 5-5.2 5C18.6 44 11 37 11 28.4 11 19.4 20 12 31 12Z" />
      <circle cx="22" cy="23" r="2.4" />
      <circle cx="31" cy="20" r="2.4" />
      <circle cx="39" cy="24" r="2.4" />
      <circle cx="21" cy="33" r="2.4" />
      <path d="M40 52 56 34" />
      <path d="m38.4 50.6 3.2 3 3.4-3.8-3.2-3Z" />
    </>
  ),
  /** Vanhxay: the bug. Friendly, and finally caught. */
  bug: (
    <>
      <ellipse cx="32" cy="33" rx="13" ry="16" />
      <path d="M32 17v32" />
      <path d="M19 24 8 18m11 15H6m13 9-11 7" />
      <path d="m45 24 11-6m-11 15h13m-13 9 11 7" />
      <path d="M26 16c-2-3-4-4.6-7-5m17 5c2-3 4-4.6 7-5" />
      <circle cx="27.5" cy="25" r="1.5" />
      <circle cx="36.5" cy="25" r="1.5" />
    </>
  ),
  /** Namthip: the jar on the windowsill, and what grew in it. */
  flask: (
    <>
      <path d="M26 10h12" />
      <path d="M28.5 10v14L16.5 46c-2 3.6.4 8 4.6 8h21.8c4.2 0 6.6-4.4 4.6-8L35.5 24V10" />
      <path d="M22 38h20" />
      <circle cx="27" cy="45" r="2.4" />
      <circle cx="35.5" cy="48" r="1.7" />
      <circle cx="38" cy="42" r="1.2" />
      <path d="M32 10c0-5 3.6-7.4 7.6-7.6C39.4 6.8 36.4 10 32 10Z" />
    </>
  ),
  /** Nina: something small, planted, coming up anyway. */
  sprout: (
    <>
      <path d="M20 38h24l-2.6 15c-.3 1.8-1.9 3-3.7 3H26.3c-1.8 0-3.4-1.2-3.7-3Z" />
      <path d="M17.5 33h29v5h-29z" />
      <path d="M32 33V17" />
      <path d="M32 24c-1.6-6-6.2-8.6-11-8.4C21.4 21.4 26 25 32 24Z" />
      <path d="M32 20c1.4-5.2 5.4-7.4 9.6-7.2C41.2 18.2 37.2 21 32 20Z" />
      <path d="m50 15 1.4 3.4 3.6.4-2.7 2.4.8 3.5-3.1-1.9-3.1 1.9.8-3.5-2.7-2.4 3.6-.4Z" />
    </>
  ),
};

/** Draw one student's doodle. Inherits ink from `color` on the parent. */
export function DoodleMark({
  kind,
  size,
}: {
  kind: Doodle;
  /** Any CSS length. `em` keeps it in step with the handwriting beside it. */
  size: string;
}): React.ReactElement {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DOODLES[kind]}
    </svg>
  );
}
