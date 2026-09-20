import { useCallback, useRef, useState } from 'react';
import { COPY } from '../../config/copy';
import { STUDENTS, assetUrl, sideFor } from '../../config/students';
import { ACTIVE_HOLD_THRESHOLD, GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle, setText } from '../../lib/domWrite';
import { clamp } from '../../lib/math';
import { useUIStore } from '../../state/useUIStore';
import { frame, type FrameState } from '../../state/frame';
import { DoodleMark } from './letterDoodles';
import { HANDS } from './letterHands';

/**
 * How solid the card has to be before it will take a click.
 *
 * The panel sits over the far side of the road, and while it is fading it is
 * still a rectangle in front of the canvas. Below this it stays transparent to
 * the pointer, so a half-faded card can never eat a hover on the student.
 */
const CLICKABLE_AT = 0.86;

/**
 * The card that slides in beside a student while the camera holds on them.
 *
 * It always sits on the opposite side of the frame from the student, so it
 * never covers the person it is describing, and it slides in from that same
 * side. Its strength tracks the camera hold rather than a timer, so scrubbing
 * the scroll back and forth moves it in and out exactly with the shot.
 *
 * The photograph turns over. On the back is a letter to the teacher in that
 * student's own handwriting — which is why the roster carries a `hand` and a
 * `doodle` per person, and why this is the one overlay that re-renders: the
 * letter is real markup rather than a string swapped into a node, and it
 * changes exactly five times in the whole film.
 */
export function StudentPanel(): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const photoLabelRef = useRef<HTMLSpanElement>(null);
  const roleRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const shownRef = useRef(-1);
  const setActiveStudent = useUIStore((s) => s.setActiveStudent);
  const active = useUIStore((s) => s.activeStudent);
  const [flipped, setFlipped] = useState(false);
  const [flippedFor, setFlippedFor] = useState(active);

  // A letter belongs to one person, so the card turns back over when the
  // subject changes — the next student is met face-first, never mid-note.
  //
  // Adjusted during the render that notices the change rather than from an
  // effect: an effect would commit one frame showing the new student's photo
  // already flipped to the old one's letter, and then flip it back.
  if (flippedFor !== active) {
    setFlippedFor(active);
    setFlipped(false);
  }

  const update = useCallback(
    (f: FrameState) => {
      const { p, phase } = f;
      const shown = phase.hold > ACTIVE_HOLD_THRESHOLD ? phase.idx : -1;

      // Swap the contents only when the subject actually changes.
      if (shown >= 0 && shown !== shownRef.current) {
        shownRef.current = shown;
        const s = STUDENTS[shown];
        if (s) {
          setText(roleRef.current, s.roleEn.toUpperCase());
          setText(nameRef.current, s.en);
          setText(textRef.current, s.msg);
          setText(photoLabelRef.current, `photo — ${s.en.toLowerCase()}`);

          const src = s.panelPhoto || s.photo;
          if (src) {
            setStyle(photoRef.current, 'backgroundImage', `url("${assetUrl(src)}")`);
            setOpacity(photoLabelRef.current, 0);
          } else {
            setOpacity(photoLabelRef.current, 1);
          }

          // Sit opposite the student so the card never covers them.
          const onLeft = sideFor(shown) > 0;
          setStyle(panelRef.current, 'left', onLeft ? '5vw' : 'auto');
          setStyle(panelRef.current, 'right', onLeft ? 'auto' : '5vw');
        }
        setActiveStudent(shown);
      } else if (shown < 0 && shownRef.current !== -1) {
        shownRef.current = -1;
        setActiveStudent(-1);
      }

      const strength = clamp((shown >= 0 ? phase.hold : 0) * 1.5, 0, 1);
      frame.panelStrength = strength;

      const slideFrom = shown >= 0 && sideFor(shown) > 0 ? -1 : 1;
      const visible = strength * GATES.panelOut(p);
      setOpacity(panelRef.current, visible);
      setStyle(
        panelRef.current,
        'transform',
        `translateY(-50%) translateX(${((1 - strength) * 34 * slideFrom).toFixed(1)}px)`,
      );
      setStyle(cardRef.current, 'pointerEvents', visible > CLICKABLE_AT ? 'auto' : 'none');
    },
    [setActiveStudent],
  );

  useUpdate('overlay', update);

  const first = STUDENTS[0];
  // Before the first hold there is no subject; dress the card as Timmy so it
  // is never a blank rectangle for a frame.
  const student = STUDENTS[active] ?? first;
  const hand = student ? HANDS[student.hand] : null;
  const leading = hand?.leading ?? 1.6;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        left: '5vw',
        top: '52%',
        width: 'min(380px, 30vw)',
        maxHeight: 'calc(100vh - 260px)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        padding: 26,
        border: '1px solid rgba(255,214,160,0.22)',
        borderRadius: 3,
        background: 'linear-gradient(160deg, rgba(22,16,11,0.72), rgba(12,9,7,0.62))',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
        opacity: 0,
        transform: 'translateY(-50%)',
        pointerEvents: 'none',
        willChange: 'transform, opacity',
      }}
    >
      <div
        ref={cardRef}
        className="panel-card"
        role="button"
        tabIndex={0}
        aria-label={
          flipped
            ? `Turn ${student?.en ?? 'the'} photograph back over`
            : `Read ${student?.en ?? 'the'} letter`
        }
        aria-pressed={flipped}
        onClick={() => setFlipped((v) => !v)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          setFlipped((v) => !v);
        }}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 5',
          flex: '1 1 auto',
          minHeight: 0,
          perspective: '1400px',
          cursor: 'pointer',
          outlineOffset: 3,
          pointerEvents: 'none',
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
            ref={photoRef}
            style={{
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              border: '1px solid rgba(255,214,160,0.18)',
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(255,214,160,0.09) 0 8px, rgba(255,214,160,0) 8px 16px)',
              backgroundSize: 'cover',
              backgroundPosition: 'center top',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 14,
              overflow: 'hidden',
            }}
          >
            <span
              ref={photoLabelRef}
              style={{
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,226,186,0.6)',
              }}
            >
              {`photo — ${first?.en.toLowerCase() ?? ''}`}
            </span>

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
                {COPY.letterHint}
              </span>
            </span>
          </div>

          {/* ---- back: the letter ---------------------------------------- */}
          <div
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
              fontSize: `calc(clamp(9.5px, 4.1cqh, 14px) * ${hand?.size ?? 1})`,
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
              Dear Teacher,
              {/* The way back. Small, in the writer's own ink, so it reads as
                  part of the page rather than as chrome laid over it. */}
              <span
                aria-hidden="true"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66em' }}
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

      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span
          ref={roleRef}
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: '#ffce8a',
          }}
        >
          {first?.roleEn.toUpperCase() ?? ''}
        </span>
        <span
          ref={nameRef}
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(22px, 2.4vw, 32px)',
            fontWeight: 600,
            lineHeight: 1.3,
            color: '#fff6e8',
          }}
        >
          {first?.en ?? ''}
        </span>
        <p
          ref={textRef}
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', serif",
            fontWeight: 400,
            fontSize: 'clamp(15px, 1.5vw, 20px)',
            lineHeight: 1.62,
            color: 'rgba(255,244,228,0.92)',
            textWrap: 'pretty',
          }}
        >
          {first?.msg ?? ''}
        </p>
      </div>
    </div>
  );
}
