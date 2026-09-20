import { useCallback, useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { STUDENTS, STUDENT_COUNT } from '../../config/students';
import { GATES, MSG_A, MSG_B, MSG_DRAW } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setAttr, setOpacity, setStyle } from '../../lib/domWrite';
import { clamp, sstep } from '../../lib/math';
import { dayState } from '../../scenes/dayChars';
import { filmAudio } from '../../audio/audio';
import type { FrameState } from '../../state/frame';

/** Scroll between one callout starting to draw and the next one starting. */
const STEP = STUDENT_COUNT > 1 ? (MSG_B - MSG_A - MSG_DRAW) / (STUDENT_COUNT - 1) : MSG_DRAW;

// ---------------------------------------------------------------- placement
//
// Everything here is derived from the head's PROJECTED position, never from
// the ring's constants. Scene 7's layout is art-directed and has been retuned
// repeatedly - the seats are not evenly spaced, `dayRadius` puts the five at
// three different distances from the lens, and the fov has moved. A callout
// that read the ring would silently misplace itself every time any of that
// changed.
//
// Lengths are in units of viewport HEIGHT, because that is what the finale
// scales with: the heads sit on a cone around the optical axis, which projects
// to a circle measured in pixels on BOTH axes once the wider horizontal fov
// divides out. Percentages would be aspect-dependent; this ring is not.

/** A head's radius on screen. */
const HEAD_R = 0.055;
/** ...inflated for the collision tests, so hair counts as head. */
const HEAD_PAD = 1.35;
/** Clear air between the head and where its line starts, in pixels. */
const HEAD_GAP = 10;

/** The outward run of the elbow, then the horizontal segment into the words. */
const RUN = 0.075;
const ELBOW = 0.05;

/** Frame inset the callouts are kept inside. */
const MARGIN = 0.03;
/** Widest and narrowest a sentence column may be. */
const MAX_W = 0.3;
const MIN_W = 0.16;

/**
 * Vertical room reserved for a wrapped sentence, in lines, and the line box.
 *
 * 1.6 rather than the 1.3 a Latin face would want: Lao stacks vowel signs
 * above the consonant and tone marks above those, and stacks other vowels
 * below, so a tight line box clips the marks off both ends of the word.
 * `LINES` is a reservation, not a measurement - it feeds the collision tests,
 * so it is deliberately generous.
 */
const LINES = 4;
const LINE_H = 1.6;

/**
 * Rotations tried, in degrees, when the straight-out placement is blocked.
 *
 * Nearest-first, alternating sides. It stops at 84: past 90 the line would be
 * heading back across the head toward the middle of the ring, which is the
 * thing this layout exists to avoid.
 */
const ROTATIONS = [0, 14, -14, 28, -28, 42, -42, 56, -56, 70, -70, 84, -84];
/** ...and the line lengths tried at each rotation, longest first. */
const SHRINKS = [1, 0.78, 0.58];
/**
 * Which way the elbow turns: toward the nearer screen edge first.
 *
 * The far side is a fallback, not a preference. It exists because on a narrow
 * frame the two widest students sit almost against the edge with nothing
 * outboard of them at all - at 1024x768 one head lands 88px from the frame
 * edge - and a message that cannot be placed is a message nobody reads. The
 * line still leaves the head outward either way; only the horizontal run
 * doubles back.
 */
const SIDES = [1, -1];

/**
 * Rough advance width of the callout type, in ems, for the wrap estimate.
 *
 * Only ever used to REJECT a column too narrow to hold the sentence in
 * `LINES` lines, so the solver prefers a wider one. It is not a measurement
 * and nothing is positioned by it - measuring would mean a layout read from
 * inside the render loop.
 */
const ADVANCE = 0.62;

/** Warm cream, so the line reads against a bright sky without going dark. */
const LINE_INK = '#fff0cd';
const LINE_SHADOW = 'rgba(92,62,16,0.45)';
const TEXT_INK = '#151515';

const scratch = new Vector3();

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Metrics {
  w: number;
  h: number;
  /** Type size, in CSS pixels. Scales with the frame, like everything here. */
  fs: number;
}

/** Closest approach of a segment to a point, squared. */
function segNearSq(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((cx - ax) * dx + (cy - ay) * dy) / l2, 0, 1) : 0;
  const px = ax + t * dx - cx;
  const py = ay + t * dy - cy;
  return px * px + py * py;
}

function rectHitsDisc(r: Rect, cx: number, cy: number, rad: number): boolean {
  const nx = clamp(cx, r.x0, r.x1);
  const ny = clamp(cy, r.y0, r.y1);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < rad * rad;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * The finale: each student's line led out of their head, and left there.
 *
 * A short two-segment callout - straight out from the head, then a horizontal
 * run into the words - starting clear of the face rather than on it, and
 * always pointing away from the middle of the ring. The words fade in at the
 * far end, and then both stay put for the rest of the film. Nothing floats and
 * nothing fades out: the ending is five people and five sentences all readable
 * at once, with the closing card in the gap in the middle.
 *
 * Every line and every label is tested against all five faces and against the
 * callouts already placed this frame. A blocked one rotates further outward,
 * then shortens, and only then gives up and waits for the next frame - it will
 * not draw itself across somebody's face.
 *
 * Each one strikes a chime as it appears, and re-arms if you scroll back past
 * it, so the finale can be replayed rather than spent.
 */
export function FloatingLines(): React.ReactElement {
  const layerRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const shadowRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRefs = useRef<(SVGCircleElement | null)[]>([]);
  const chimed = useRef<boolean[]>(new Array(STUDENT_COUNT).fill(false));
  const metrics = useRef<Metrics>({ w: 1, h: 1, fs: 16 });
  /** Last accepted rotation/length per student, so a solved line stays put. */
  const choice = useRef<number[]>(new Array(STUDENT_COUNT).fill(0));

  // Scratch, reused every frame - this runs inside the render loop.
  const heads = useRef<{ x: number; y: number; on: boolean }[]>(
    Array.from({ length: STUDENT_COUNT }, () => ({ x: 0, y: 0, on: false })),
  );
  const placed = useRef<Rect[]>([]);

  // ---- measure once, and on resize --------------------------------------
  //
  // Nothing in the update loop reads layout. It cannot: a layout read from
  // inside the render loop, next to the style writes, is exactly the
  // forced-reflow trap `domWrite.ts` was written to close. So the frame's own
  // box is cached here and refreshed on resize, and the sentence column is
  // sized by reserving width rather than by measuring what the text used.
  useEffect(() => {
    const measure = (): void => {
      const layer = layerRef.current;
      if (!layer) return;
      const m = metrics.current;
      m.w = layer.clientWidth;
      m.h = layer.clientHeight;
      m.fs = clamp(m.h * 0.017, 15, 24);
      const stroke = Math.max(1.2, m.h * 0.0013).toFixed(2);
      const dot = Math.max(2.6, m.h * 0.0034).toFixed(2);
      for (let i = 0; i < STUDENT_COUNT; i++) {
        setAttr(pathRefs.current[i] ?? null, 'stroke-width', stroke);
        setAttr(shadowRefs.current[i] ?? null, 'stroke-width', stroke);
        setAttr(dotRefs.current[i] ?? null, 'r', dot);
        setStyle(labelRefs.current[i] ?? null, 'fontSize', `${m.fs.toFixed(1)}px`);
      }
    };

    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
    };
  }, []);

  const update = useCallback((f: FrameState) => {
    const { p } = f;
    const on = GATES.floatingLinesOn(p) && dayState.chars.length > 0;

    setOpacity(layerRef.current, on ? 1 : 0);
    if (!on) {
      for (const c of dayState.chars) c.say = 0;
      return;
    }

    const camera = dayState.camera;
    if (!(camera instanceof PerspectiveCamera)) return;

    for (const c of dayState.chars) c.say = 0;

    const { w, h, fs } = metrics.current;
    const m = MARGIN * h;
    const headR = HEAD_R * h;
    const guard = headR * HEAD_PAD;
    const vHalf = (LINES * fs * LINE_H) / 2;

    // ---- every face on screen first: they are what everything avoids ------
    for (let i = 0; i < STUDENT_COUNT; i++) {
      const slot = heads.current[i];
      if (!slot) continue;
      const c = dayState.chars.find((d) => d.index === i);
      if (!c) {
        slot.on = false;
        continue;
      }
      c.rig.headAnchor.getWorldPosition(scratch);
      scratch.project(camera);
      slot.on = scratch.z <= 1;
      slot.x = (scratch.x * 0.5 + 0.5) * w;
      slot.y = (-scratch.y * 0.5 + 0.5) * h;
    }

    placed.current.length = 0;

    for (let i = 0; i < STUDENT_COUNT; i++) {
      const label = labelRefs.current[i];
      const path = pathRefs.current[i];
      const shadow = shadowRefs.current[i];
      const dot = dotRefs.current[i];
      const student = STUDENTS[i];
      const head = heads.current[i];
      // By identity, not array position: the ring can in principle be built
      // with a student missing, and tethering a line to the wrong face would
      // be a quietly awful bug to ship.
      const c = dayState.chars.find((d) => d.index === i);

      if (!label || !path || !shadow || !dot || !student || !c || !head) continue;

      const hide = (): void => {
        setOpacity(label, 0);
        setOpacity(path, 0);
        setOpacity(shadow, 0);
        setOpacity(dot, 0);
      };

      // `t` runs 0 -> 1 as the line draws, then keeps climbing and is never
      // bounded again. That is the whole "never disappears" behaviour: only
      // scrolling back below the entrance takes a callout off screen.
      const t = (p - (MSG_A + i * STEP)) / MSG_DRAW;
      if (t < 0) {
        hide();
        chimed.current[i] = false;
        continue;
      }
      if (!head.on) {
        hide();
        continue;
      }

      const hx = head.x;
      const hy = head.y;

      // Outward: from the middle of the ring, through this head, and onward.
      // Never the other way - the head is the innermost point of the figure,
      // so this is the direction that leads the line off the face instead of
      // back across it.
      let ox = hx - w / 2;
      let oy = hy - h / 2;
      const ol = Math.hypot(ox, oy) || 1;
      ox /= ol;
      oy /= ol;

      // The nearer screen edge, which for an outward direction is always the
      // side the student is already on. `dayLabelSide` overrides which side
      // the words end up; it does not change which way the line leaves the
      // head, and it is still only a preference - the far side stays in the
      // search below, so a forced side that cannot be placed falls back
      // rather than dropping the message.
      const outSign = hx < w / 2 ? -1 : 1;
      const forced = student.dayLabelSide;
      const prefer = forced === 'left' ? -1 : forced === 'right' ? 1 : outSign;
      const chars = (student.finaleMsg || student.msg).length;

      // ---- solve ---------------------------------------------------------
      //
      // Straight out at full length first, then rotated off it, then shorter.
      // Whatever was accepted last frame is tried first, so a line that is
      // still clear does not hop between equally good answers and shimmer.
      let sx = 0;
      let sy = 0;
      let cx = 0;
      let cy = 0;
      let ex = 0;
      let ey = 0;
      let box: Rect | null = null;
      let allow = 0;
      let left = prefer < 0;

      const order = choice.current[i] ?? 0;
      const perSide = ROTATIONS.length * SHRINKS.length;
      const total = SIDES.length * perSide;

      for (let n = 0; n < total && !box; n++) {
        const k = (order + n) % total;
        const side = prefer * (SIDES[Math.floor(k / perSide)] ?? 1);
        const rem = k % perSide;
        const rot = ROTATIONS[Math.floor(rem / SHRINKS.length)] ?? 0;
        const shrink = SHRINKS[rem % SHRINKS.length] ?? 1;
        const wantLeft = side < 0;

        // Rotate away from the frame's centre line, never across it.
        const a = ((rot * Math.PI) / 180) * -outSign;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const dx = ox * ca - oy * sa;
        const dy = ox * sa + oy * ca;

        // Clear of the guard, not just of the head: starting at `headR + gap`
        // puts the line inside its own collision circle, and then nothing ever
        // places.
        const tsx = hx + dx * (guard + HEAD_GAP);
        const tsy = hy + dy * (guard + HEAD_GAP);
        const tcx = tsx + dx * RUN * h * shrink;
        const tcy = tsy + dy * RUN * h * shrink;
        const tex = tcx + side * ELBOW * h * shrink;
        const tey = tcy;

        // Reserve the column rather than measure it: whatever room is left
        // between the elbow and the frame edge becomes the sentence's
        // max-width, so it can never overflow and never has to be read back.
        const room = wantLeft ? tex - m : w - m - tex;
        if (room < MIN_W * h) continue;
        const col = Math.min(MAX_W * h, room);
        // Too narrow to hold the sentence in the space reserved for it.
        if (Math.ceil((chars * ADVANCE * fs) / col) > LINES) continue;

        const r: Rect = {
          x0: wantLeft ? tex - col : tex,
          y0: tey - vHalf,
          x1: wantLeft ? tex : tex + col,
          y1: tey + vHalf,
        };
        if (r.y0 < m || r.y1 > h - m) continue;

        // Against every face, including this student's own.
        let clear = true;
        for (let j = 0; j < STUDENT_COUNT && clear; j++) {
          const o = heads.current[j];
          if (!o || !o.on) continue;
          if (rectHitsDisc(r, o.x, o.y, guard)) clear = false;
          else if (segNearSq(tsx, tsy, tcx, tcy, o.x, o.y) < guard * guard) clear = false;
          else if (segNearSq(tcx, tcy, tex, tey, o.x, o.y) < guard * guard) clear = false;
        }
        // ...and against the callouts already placed this frame.
        for (let j = 0; j < placed.current.length && clear; j++) {
          const q = placed.current[j];
          if (q && rectsOverlap(r, q)) clear = false;
        }
        if (!clear) continue;

        sx = tsx;
        sy = tsy;
        cx = tcx;
        cy = tcy;
        ex = tex;
        ey = tey;
        box = r;
        allow = col;
        left = wantLeft;
        choice.current[i] = k;
      }

      if (!box) {
        // Nothing clears at this moment. Wait for the next frame rather than
        // drawing a line across somebody's face.
        hide();
        continue;
      }
      placed.current.push(box);

      if (!chimed.current[i]) {
        chimed.current[i] = true;
        filmAudio.chime(i);
      }

      // ---- draw ------------------------------------------------------------
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
      setAttr(path, 'd', d);
      // A second copy underneath, nudged down, instead of a `drop-shadow`
      // filter: a filter would re-blur the whole layer on every frame that `d`
      // changes, and `d` changes on every frame the camera breathes.
      setAttr(shadow, 'd', d);
      setStyle(shadow, 'transform', 'translate(0.8px, 1.4px)');

      const run = Math.hypot(cx - sx, cy - sy) + Math.hypot(ex - cx, ey - cy);
      const drawn = sstep(0, 1, clamp(t, 0, 1));
      const dash = run.toFixed(1);
      const offset = (run * (1 - drawn)).toFixed(1);
      setAttr(path, 'stroke-dasharray', dash);
      setAttr(path, 'stroke-dashoffset', offset);
      setAttr(shadow, 'stroke-dasharray', dash);
      setAttr(shadow, 'stroke-dashoffset', offset);

      setAttr(dot, 'cx', sx.toFixed(1));
      setAttr(dot, 'cy', sy.toFixed(1));

      const lineOn = sstep(0, 0.12, t);
      setOpacity(dot, sstep(0, 0.18, t) * 0.95);
      setOpacity(path, lineOn * 0.9);
      setOpacity(shadow, lineOn * 0.5);

      // The words arrive as the line lands, not with it.
      setOpacity(label, sstep(0.55, 1, t));
      setStyle(label, 'maxWidth', `${(Math.round(allow / 8) * 8).toFixed(0)}px`);
      setStyle(label, 'textAlign', left ? 'left' : 'right');
      setStyle(
        label,
        'transform',
        `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) translate(${left ? '-100%' : '0'}, -50%)`,
      );

      // ---- the reaction ----------------------------------------------------
      //
      // `say` is read by DayScene on the `day` stage, one stage after this
      // one, and drives the grin and a 3 Hz torso bounce. It CANNOT be the
      // label's opacity any more: the label never fades, so the student would
      // end the film frozen mid-grin and shaking. It gets its own pulse
      // instead - up as the sentence lands, and gone shortly after.
      c.say = sstep(0.6, 1, t) * (1 - sstep(1, 2.4, t));
    }
  }, []);

  useUpdate('overlay', update);

  return (
    <div
      ref={layerRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0 }}
    >
      {/*
        The project's only SVG, and it earns it: a two-segment leader re-solved
        against five moving faces every frame, with a draw-on reveal, is not
        reachable with the CSS-stalk trick used for the music-box hint. No
        viewBox, so user units are CSS pixels and the update loop writes screen
        coordinates straight in.
      */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        pointerEvents="none"
        aria-hidden="true"
      >
        {STUDENTS.map((s, i) => (
          <path
            key={`shadow-${s.en}`}
            ref={(el) => {
              shadowRefs.current[i] = el;
            }}
            fill="none"
            stroke={LINE_SHADOW}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0 }}
          />
        ))}
        {STUDENTS.map((s, i) => (
          <g key={s.en}>
            <path
              ref={(el) => {
                pathRefs.current[i] = el;
              }}
              fill="none"
              stroke={LINE_INK}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0 }}
            />
            <circle
              ref={(el) => {
                dotRefs.current[i] = el;
              }}
              fill={LINE_INK}
              style={{ opacity: 0 }}
            />
          </g>
        ))}
      </svg>

      {STUDENTS.map((s, i) => (
        <div
          key={s.en}
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            // Hugs its own text, so a short sentence sits against the elbow
            // instead of floating at the far end of a reserved column. The
            // reserved width is still the cap, and is what the collision tests
            // are run against.
            width: 'max-content',
            // Two faces, picked per character: Patrick Hand has no Lao glyphs,
            // so the Lao falls through to the Looped face and the Latin inside
            // a couple of the lines stays handwritten. See index.html.
            fontFamily: "'Patrick Hand', 'Noto Sans Lao Looped', 'Phetsarath OT', sans-serif",
            lineHeight: LINE_H,
            // Lao is written without spaces between every word. Browsers break
            // it with a dictionary, but a long unbroken run would otherwise
            // push straight out of a narrow column.
            overflowWrap: 'break-word',
            color: TEXT_INK,
            // A soft white halo, because a sentence can cross a dark model on
            // its way out, and because the stage vignette darkens the sky at
            // the frame edge - which is exactly where these sit.
            textShadow: '0 0 10px rgba(255,252,245,0.95), 0 1px 2px rgba(255,252,245,0.9)',
            textWrap: 'pretty',
            opacity: 0,
            willChange: 'transform, opacity',
          }}
          lang="lo"
        >
          {s.finaleMsg || s.msg}
        </div>
      ))}
    </div>
  );
}
