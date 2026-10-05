import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY } from '../../config/copy';
import { STUDENTS } from '../../config/students';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle } from '../../lib/domWrite';
import { clamp } from '../../lib/math';
import { hasRead, useUIStore } from '../../state/useUIStore';
import { useViewport } from '../../hooks/useViewport';
import { viewport } from '../../state/viewport';
import type { FrameState } from '../../state/frame';
import { LetterCard } from './LetterCard';

/**
 * How solid the button has to be before it will take a tap.
 *
 * The same rule, and the same number, as the desktop panel's card: while it is
 * fading it is still a target in front of the street, and a half-faded button
 * must not eat a tap meant for the scene.
 */
const CLICKABLE_AT = 0.86;

/**
 * Margins the anchor is kept inside, as fractions of the frame.
 *
 * The button is CLAMPED into the frame rather than hidden when the anchor
 * drifts off it. `FloatingLines` hides an off-frame anchor, which is right for
 * a label and wrong for a control: on a phone this button is the only way to
 * reach the message, and one that has wandered past an edge is a letter nobody
 * can read. The top margin also keeps it clear of the chapter caption at 7dvh.
 */
const EDGE_X = 0.1;
const EDGE_Y_TOP = 0.16;
const EDGE_Y_BOTTOM = 0.74;

/**
 * The phone's way into a student's message: a button on the person, and a card
 * in the middle of the frame.
 *
 * The desktop panel puts its card at the side of the frame, opposite whoever is
 * speaking, and a phone has no side to spare. A bottom sheet was tried first
 * and was worse than the problem — see the note in `StudentPanel`. So on a
 * phone nothing appears over the street except a 44px button on the figure,
 * with a dot on it while the message is unread, and the card opens only when
 * it is pressed.
 *
 * The scroll is held while the card is open. The film is scroll-driven, so
 * without that a thumb moving behind the card would change which student the
 * reader is in the middle of — and `setPaused` exists rather than `setLocked`
 * precisely so closing the card does not cost them their place.
 */
export function StudentMessage({
  onHold,
}: {
  /** Freeze the film while the card is open. Wired to Lenis by `App`. */
  onHold: (held: boolean) => void;
}): React.ReactElement | null {
  const trackerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLParagraphElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const active = useUIStore((s) => s.activeStudent);
  const readMask = useUIStore((s) => s.readMask);
  const markRead = useUIStore((s) => s.markRead);
  const { sheet, coarse } = useViewport();

  const [openFor, setOpenFor] = useState(-1);
  const [flipped, setFlipped] = useState(false);
  const [subject, setSubject] = useState(-1);

  const open = openFor >= 0;

  // The person the card is about. STICKY while it is open: `active` falls back
  // to -1 as the hold decays, and the scroll damp is still running for a beat
  // after the pause, so it can reach -1 with the card still on screen. Neither
  // may blank a letter somebody is reading.
  const want = open ? openFor : active;

  // Render-time reconciliation, in the idiom `StudentPanel` already uses for
  // its flip: an effect would commit one wrong frame first and then correct it.
  if (subject !== want) {
    setSubject(want);
    // A letter belongs to one person.
    setFlipped(false);
  }
  // The dialog is a phone shape. Rotating into a desktop frame hands the film
  // back to the side card, so the dialog has to go with it - otherwise the
  // reader is left on a layout with no way back and a frozen scroll.
  if (!sheet && open) setOpenFor(-1);
  // A DIFFERENT person taking the frame closes the card. `active` also drops to
  // -1 on its own as the hold decays, and that must not - see `want` above.
  if (open && active >= 0 && active !== openFor) setOpenFor(-1);

  const student = STUDENTS[subject] ?? STUDENTS[0];
  const unread = !hasRead(readMask, active);

  // ---- the button rides the figure ---------------------------------------
  const update = useCallback((f: FrameState) => {
    const el = trackerRef.current;
    if (!el) return;

    const strength = clamp(f.phase.hold * 1.5, 0, 1) * GATES.panelOut(f.p);
    // Behind the lens `project` mirrors the point, so that one case hides.
    const visible = f.subjectOn ? strength : 0;
    setOpacity(el, visible);
    setStyle(el, 'pointerEvents', visible > CLICKABLE_AT ? 'auto' : 'none');
    if (visible <= 0) return;

    // `transform` and `opacity` only, per `domWrite`'s rule - both composite
    // on the GPU and never trigger layout. The frame box comes from the
    // viewport singleton, which is republished on resize, so there is no
    // layout read in here.
    const x = clamp(f.subjectX, EDGE_X, 1 - EDGE_X) * viewport.w;
    const y = clamp(f.subjectY, EDGE_Y_TOP, EDGE_Y_BOTTOM) * viewport.h;
    setStyle(el, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`);
  }, []);

  useUpdate('overlay', update, sheet);

  // ---- holding the film ---------------------------------------------------
  //
  // One subscription with a cleanup, so that every way out of the card -
  // the close button, the backdrop, Escape, a rotation, the reconciliation
  // above, an unmount - resumes the scroll exactly once.
  useEffect(() => {
    if (!open) return;
    onHold(true);
    return () => onHold(false);
  }, [open, onHold]);

  // Focus in, and back out again.
  //
  // `{ preventScroll: true }` is not optional: `.focus()` scrolls its element
  // into view by default, and on a 3200vh scroll-driven document that yanks
  // the film to a different scene. It would look exactly like the scroll lock
  // having failed.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus({ preventScroll: true });
    return () => buttonRef.current?.focus({ preventScroll: true });
  }, [open]);

  const close = useCallback(() => setOpenFor(-1), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // The iOS scroll guard.
  //
  // `overflow: hidden` on <html> is the classic unreliable lock on iOS, and
  // `.stage`'s `touch-action: manipulation` explicitly PERMITS panning. This
  // has to be imperative and explicitly non-passive: React attaches touchmove
  // at the root as a passive listener, so `preventDefault` from an
  // `onTouchMove` prop is a silent no-op.
  useEffect(() => {
    if (!open) return;
    const el = backdropRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent): void => {
      const t = e.target as Node | null;
      if (t && scrollerRef.current?.contains(t)) return;
      e.preventDefault();
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [open]);

  const openCard = useCallback(
    (i: number) => {
      if (i < 0) return;
      // On open, not on close: the dot means "you have not looked at this",
      // and that stops being true the moment the card is up.
      markRead(i);
      setOpenFor(i);
    },
    [markRead],
  );

  if (!sheet) return null;

  const who = student?.en ?? 'this student';

  return (
    <>
      {/* The tracker is the thing that moves; the button inside it is the
          thing that is styled, so an animation on the dot never fights the
          transform that follows the figure. */}
      <div ref={trackerRef} className="msg-anchor" style={{ opacity: 0 }}>
        <button
          ref={buttonRef}
          type="button"
          className="msg-button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={
            unread ? `${COPY.messageButton} ${who} — unread` : `${COPY.messageButton} ${who}`
          }
          onClick={(e) => {
            e.stopPropagation();
            openCard(active);
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.5 11.7a7.7 7.7 0 0 1-8.3 7.7 8.6 8.6 0 0 1-3.4-.8L3.5 20l1.4-4.6a7.5 7.5 0 0 1-1-3.7 7.7 7.7 0 0 1 8.3-7.6 7.7 7.7 0 0 1 8.3 7.6Z" />
            <path d="M8.9 11.8h.01M12 11.8h.01M15.1 11.8h.01" />
          </svg>
          {/* The state travels in the label too: a colour is not a message. */}
          {unread ? <span className="msg-dot" aria-hidden="true" /> : null}
        </button>
      </div>

      {open ? (
        <div
          ref={backdropRef}
          className="msg-scrim"
          // Never let a tap on the scrim reach the stage, which opens the gift
          // and the music box.
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={who}
            tabIndex={-1}
            className="msg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="msg-close tap-target" onClick={close} aria-label={COPY.close}>
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>

            <LetterCard
              student={student}
              flipped={flipped}
              onToggle={() => setFlipped((v) => !v)}
              coarse={coarse}
              // A definite height on BOTH faces. `containerType: 'size'` implies
              // `contain: size`, so this box can no longer be sized by what is
              // inside it - the sheet only got away with leaving it to flex
              // because a parent was pushing on it. The letter face is taller
              // because the handwriting is the one thing here that cannot be
              // made smaller; at this size its `4.1cqh` pins at its 14px
              // ceiling instead of the 9.5px floor the sheet hit.
              boxStyle={{
                width: '100%',
                height: flipped ? 'min(62dvh, 520px)' : 'min(40dvh, 340px)',
                transition: 'height 0.45s cubic-bezier(0.2, 0.72, 0.18, 1)',
                pointerEvents: 'auto',
              }}
            />

            {flipped ? null : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.22em',
                    textTransform: 'uppercase',
                    color: '#ffce8a',
                  }}
                >
                  {student?.roleEn.toUpperCase() ?? ''}
                </span>
                <span
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 'clamp(21px, 5.6vw, 30px)',
                    fontWeight: 600,
                    lineHeight: 1.3,
                    color: '#fff6e8',
                  }}
                >
                  {who}
                </span>
                <p
                  ref={scrollerRef}
                  style={{
                    margin: 0,
                    overflowY: 'auto',
                    minHeight: 0,
                    touchAction: 'pan-y',
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 'clamp(13.5px, 3.8vw, 18px)',
                    lineHeight: 1.62,
                    color: 'rgba(255,244,228,0.92)',
                    textWrap: 'pretty',
                  }}
                >
                  {student?.msg ?? ''}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
