import { useCallback, useRef, useState } from 'react';
import { STUDENTS, sideFor } from '../../config/students';
import { ACTIVE_HOLD_THRESHOLD, GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle, setText } from '../../lib/domWrite';
import { clamp } from '../../lib/math';
import { useUIStore } from '../../state/useUIStore';
import { useViewport } from '../../hooks/useViewport';
import { frame, type FrameState } from '../../state/frame';
import { LetterCard } from './LetterCard';

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
 *
 * ---------------------------------------------------------------------------
 *
 * All of that needs a frame wide enough to HAVE two sides, and a phone has not
 * got one: `min(380px, 30vw)` is 117px there, and 26px of padding either side
 * leaves 65px for a name set at a 22px floor. A bottom sheet was tried and was
 * worse — it covered the street the film is about, the corner chrome painted
 * straight over it, and the photograph came out at 143px with its own prompt
 * clipped in half.
 *
 * So on a phone this renders nothing and `StudentMessage` takes over, with a
 * button on the figure and a dialog in the middle of the frame. The update
 * loop below still runs there, deliberately: it is what keeps `activeStudent`
 * and `frame.panelStrength` current for everything else, including the dialog.
 */
export function StudentPanel(): React.ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLSpanElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const shownRef = useRef(-1);
  const setActiveStudent = useUIStore((s) => s.setActiveStudent);
  const active = useUIStore((s) => s.activeStudent);
  const { sheet, coarse } = useViewport();
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

      // On a phone every ref below is null and `domWrite` no-ops on null, so
      // the rest of this costs nothing there. It is not guarded, because the
      // two writes above are the ones the phone needs.
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

  // After every hook, never before: the loop above has to keep running on a
  // phone even though nothing here is rendered.
  if (sheet) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        left: '5vw',
        top: '52%',
        width: 'min(380px, 30vw)',
        // `100vh` disagrees with the visible frame while a mobile URL bar is
        // showing, and on a short window the old fixed 260px reservation left
        // almost no card at all.
        maxHeight: 'calc(100dvh - clamp(90px, 22dvh, 260px))',
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
      <LetterCard
        ref={cardRef}
        student={student}
        flipped={flipped}
        onToggle={() => setFlipped((v) => !v)}
        coarse={coarse}
        boxStyle={{ flex: '1 1 auto', width: '100%', aspectRatio: '4 / 5' }}
      />

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
