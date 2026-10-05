import { forwardRef, useLayoutEffect, useRef } from 'react';
import { COPY, prompt } from '../../config/copy';
import { assetUrl, type StudentConfig } from '../../config/students';
import { DoodleMark } from './letterDoodles';
import { HANDS, type HandStyle } from './letterHands';

/**
 * The photograph, and the letter on the back of it.
 *
 * Pulled out of `StudentPanel` when the phone stopped using a side card: the
 * desktop panel and the phone's dialog show the same object, and a letter
 * styled in two places would drift apart the first time either is touched.
 *
 * The caller owns two things. `boxStyle` sizes the card - a side card is sized
 * by the flex column it sits in, a centred dialog has to be told outright,
 * because `containerType: 'size'` means this box can no longer be sized by
 * what is inside it. And `flipped`/`onToggle` stay with the caller so the
 * subject and the flip reset together.
 */
export interface LetterCardProps {
  student: StudentConfig | undefined;
  flipped: boolean;
  onToggle: () => void;
  /** True where the pointer cannot hover, so the prompt says "tap". */
  coarse: boolean;
  /** Sizing for the card box. Required: see above. */
  boxStyle: React.CSSProperties;
}

/**
 * The smallest the letter is allowed to shrink to, as a fraction of its hand's
 * own size. Timmy's, the longest, needs about 0.7 on a 1024px window's card;
 * below this it would stop being something anyone could read, so a letter
 * that still does not fit is clipped rather than shrunk further.
 */
const MIN_FIT = 0.55;

/**
 * Sets the letter as large as its hand allows and then, only if it runs off
 * the bottom of the page, smaller until it does not.
 *
 * The letters are the students' own and run anywhere from three lines to
 * five paragraphs, and the card is anything from 255x319 on a small laptop to
 * 303x520 on a phone. No single size suits both ends of both ranges - fixing
 * one to the longest letter on the smallest card would set every other letter
 * on every other card needlessly small. So the size is solved per card, by
 * bisecting a multiplier (`--fit`) on the font size against the page's own
 * overflow.
 *
 * Measured on the back face even while it is turned away: `backface-visibility`
 * hides it from paint, not from layout, so it is ready before the flip lands.
 *
 * Refit on every turn of the card as well as on a new letter or hand. A
 * resize and a font load are caught below, but a change to the page that
 * leaves its box the same size - a new leading, say - is not, and the letter
 * then stays at the size it was fitted at and runs off the bottom. Fitting
 * again as the card turns over means the one moment it is read is the one
 * moment it is guaranteed to have just been measured.
 */
function useFitLetter(
  page: React.RefObject<HTMLDivElement | null>,
  student: StudentConfig | undefined,
  hand: HandStyle | null,
  flipped: boolean,
) {
  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return;

    const overflows = (fit: number) => {
      el.style.setProperty('--fit', String(fit));
      return el.scrollHeight > el.clientHeight;
    };
    const fit = () => {
      if (!overflows(1)) return;
      let lo = MIN_FIT;
      let hi = 1;
      // Seven halvings land within 0.004 of the edge - well under a pixel.
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (overflows(mid)) hi = mid;
        else lo = mid;
      }
      el.style.setProperty('--fit', String(lo));
    };

    fit();
    // Font size is set off the card's own height (`cqh`), and the phone's
    // dialog animates that height on the flip, so a resize is a refit. The
    // page is absolutely positioned, so the refit itself never resizes it.
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // The Lao face is split by unicode-range and fetched only once Lao is
    // first laid out - i.e. after the first fit, which measured a fallback.
    document.fonts.addEventListener('loadingdone', fit);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [page, student, hand, flipped]);
}

export const LetterCard = forwardRef<HTMLDivElement, LetterCardProps>(function LetterCard(
  { student, flipped, onToggle, coarse, boxStyle },
  ref,
) {
  const hand = student ? HANDS[student.hand] : null;
  const leading = hand?.leading ?? 1.6;
  const src = student?.panelPhoto || student?.photo;
  const photo = src ? assetUrl(src) : '';
  const pageRef = useRef<HTMLDivElement>(null);
  useFitLetter(pageRef, student, hand, flipped);

  return (
    <div
      ref={ref}
      className="panel-card"
      role="button"
      tabIndex={0}
      aria-label={
        flipped
          ? `Turn ${student?.en ?? 'the'} photograph back over`
          : `Read ${student?.en ?? 'the'} letter`
      }
      aria-pressed={flipped}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onToggle();
      }}
      style={{
        position: 'relative',
        minHeight: 0,
        perspective: '1400px',
        cursor: 'pointer',
        outlineOffset: 3,
        // The side panel drives this from its render loop, so it starts off
        // and is turned on once the card is solid enough to take a click. The
        // dialog has no loop and turns it on through `boxStyle` - which is why
        // the spread comes AFTER this, not before.
        pointerEvents: 'none',
        // Sizing is the caller's: a side card lets flex give it the room that
        // is left, a centred dialog has to state a height outright, because
        // `containerType: 'size'` below means this box can no longer be sized
        // by what is inside it.
        ...boxStyle,
        // The letter is sized in `cqh` off this box. The card's width tracks
        // the viewport width and its height is capped against the viewport
        // height, so a font sized off either axis alone overflows on a short
        // wide window — measuring against the card itself is the only size
        // that holds at every shape.
        containerType: 'size',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.78s cubic-bezier(0.2, 0.72, 0.18, 1)',
          transform: `rotateY(${flipped ? 180 : 0}deg)`,
          willChange: 'transform',
        }}
      >
        {/* ---- front: the photograph, and the invitation to turn it ---- */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            border: '1px solid rgba(255,214,160,0.18)',
            backgroundImage: photo
              ? `url("${photo}")`
              : 'repeating-linear-gradient(135deg, rgba(255,214,160,0.09) 0 8px, rgba(255,214,160,0) 8px 16px)',
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            paddingBottom: 14,
            overflow: 'hidden',
          }}
        >
          {/* Only when there is no photograph to show. */}
          {photo ? null : (
            <span
              style={{
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,226,186,0.6)',
              }}
            >
              {`photo — ${student?.en.toLowerCase() ?? ''}`}
            </span>
          )}

          {/* The corner already lifting, so the card looks like paper that
              wants turning before the words say so. */}
          <span className="panel-peel" aria-hidden="true" />

          <span className="panel-hint" aria-hidden="true">
            <span>
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15.2 3.6 5.2 5.2L8.6 20.6l-6 .8.8-6z" />
                <path d="m13.4 5.4 5.2 5.2" />
              </svg>
              {prompt('letterHint', coarse)}
            </span>
          </span>
        </div>

        {/* ---- back: the letter ---------------------------------------- */}
        <div
          ref={pageRef}
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5em',
            padding: '7% 8% 6%',
            overflow: 'hidden',
            color: hand?.ink ?? '#2f3a52',
            // Paper: a warm sheet, a faint rule stepped to this hand's own
            // leading, and one soft shadow in the gutter so it reads as a
            // page rather than as a white rectangle.
            background: `linear-gradient(105deg, rgba(0,0,0,0.09) 0 3%, rgba(0,0,0,0) 12%), repeating-linear-gradient(180deg, rgba(60,70,95,0) 0 ${leading}em, rgba(60,70,95,0.07) ${leading}em calc(${leading}em + 1px)), linear-gradient(150deg, #fffdf6, #f4efe1)`,
            boxShadow: 'inset 0 0 40px rgba(120,100,70,0.14)',
            border: '1px solid rgba(255,214,160,0.18)',
            fontFamily: hand?.family ?? 'cursive',
            // `--fit` is `useFitLetter`'s, and is 1 unless the letter is long.
            fontSize: `calc(clamp(9.5px, 4.1cqh, 14px) * ${hand?.size ?? 1} * var(--fit, 1))`,
            lineHeight: leading,
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
              opacity: 0.78,
            }}
          >
            {student?.letter.greeting ?? 'Dear Teacher,'}
            {/* The way back. Small, in the writer's own ink, so it reads as
                part of the page rather than as chrome laid over it. */}
            <span
              aria-hidden="true"
              // Never shrunk: a greeting long enough to wrap would otherwise
              // squeeze the arrow and the word onto separate lines.
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66em', flexShrink: 0 }}
            >
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
              </svg>
              {COPY.letterBack}
            </span>
          </span>

          {student?.letter.body.map((line) => (
            <p key={line} style={{ margin: 0, textWrap: 'pretty' }}>
              {line}
            </p>
          ))}

          <p style={{ margin: 0, textWrap: 'pretty' }}>{student?.letter.wish}</p>

          <span
            style={{
              marginTop: 'auto',
              display: 'inline-block',
              alignSelf: 'flex-start',
              fontSize: '1.28em',
              transform: `rotate(${hand?.signTilt ?? 0}deg)`,
              transformOrigin: 'left bottom',
            }}
          >
            — {student?.en ?? ''}
          </span>

          {/* Taken out of the flow on purpose. In the column it was one more
              thing competing for the last line, and on the longest letter it
              pushed the signature off the bottom of the page. */}
          <span
            style={{
              position: 'absolute',
              right: '7%',
              bottom: '5%',
              opacity: 0.8,
              lineHeight: 0,
              pointerEvents: 'none',
            }}
          >
            {student ? <DoodleMark kind={student.doodle} size="3.2em" /> : null}
          </span>
        </div>
      </div>
    </div>
  );
});
