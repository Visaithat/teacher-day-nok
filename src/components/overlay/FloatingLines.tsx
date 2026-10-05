import { useCallback, useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { STUDENTS, STUDENT_COUNT } from '../../config/students';
import { GATES, MSG_A, MSG_B, MSG_DRAW } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setAttr, setOpacity, setStyle } from '../../lib/domWrite';
import { clamp, sstep } from '../../lib/math';
import { NARROW_ASPECT, viewport } from '../../state/viewport';
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
// Lengths come in three kinds, and the original conflated them because on a
// landscape frame they are all the same number.
//
//  - RING-DERIVED (`HEAD_R`, `HEAD_PAD`, `HEAD_GAP`) track the projected head.
//    The heads sit on a cone around the optical axis, which projects to a
//    circle measured in pixels on BOTH axes once the horizontal fov divides
//    out - so the unit is viewport HEIGHT, exactly as the original said. It is
//    height corrected for the lens, though: a portrait frame plays Scene 7 on
//    a much wider one and a head is only 68% of its old projected size, so
//    these are scaled by `viewport.ringK`.
//  - GRAPHIC (`RUN`, `ELBOW`, `MARGIN` across the frame) are the drawn leader,
//    a pure design quantity. Their unit is `min(w, h)`, which IS height on any
//    landscape frame and so leaves every wide window untouched.
//  - TYPOGRAPHIC (the column measure) belongs in ems of the live type size,
//    not in frame units at all. `MIN_W`/`MAX_W` below are kept for landscape;
//    `MIN_COL_EM`/`MAX_COL_EM` are the same measures re-expressed, and are
//    what a narrow frame uses.
//
// Keyed to height alone, the budget on a 390x844 phone is 339px of reach and
// column inside 195px of half-frame, so nothing ever placed - and because the
// chime is gated behind a placement, the film ended in silence as well as in
// blank space. Both iPad portrait sizes failed too.

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
/** Widest and narrowest a sentence column may be, on a landscape frame. */
const MAX_W = 0.3;
const MIN_W = 0.16;

/**
 * ...and on a narrow one, in ems of the live type size.
 *
 * These are today's desktop values re-expressed: 173px and 324px at 1920x1080,
 * where `fs` solves to 18.36. Deliberately NOT used on landscape as well, even
 * though they agree there today - `fs` is clamped at 24, so above a 1412px-tall
 * window the two forms part company and a 4K desktop would change.
 */
const MIN_COL_EM = 9.4;
const MAX_COL_EM = 17.6;

/**
 * Below this aspect the ladder below is the INTENDED layout, not a rescue, and
 * the elbow search is skipped entirely.
 *
 * Between it and 1, the elbow is tried first and the ladder is a fallback -
 * which is the iPad-portrait case, where the em-based column is usually enough
 * to let the elbow place after all.
 */
const LADDER_ASPECT = 0.75;

/**
 * How far into a callout's own entrance a blocked elbow waits before latching
 * to the ladder.
 *
 * The camera breathes (`DayScene` moves it on a slow sine), so a placement can
 * be blocked for a handful of frames and then clear on its own. Latching at
 * the first failure would make the layout flip about; latching never would
 * leave a message unread.
 */
const LADDER_AFTER = 0.3;

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
  /** `min(w, h)`: the unit for the drawn leader. Equals `h` on landscape. */
  u: number;
  /** Viewport height corrected for Scene 7's live lens. See the note above. */
  ring: number;
  /** Type size, in CSS pixels. Scales with the frame, like everything here. */
  fs: number;
  /** Taller than wide. Selects the column measure and arms the ladder. */
  narrow: boolean;
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
  const metrics = useRef<Metrics>({ w: 1, h: 1, u: 1, ring: 1, fs: 16, narrow: false });
  /** 0 = elbow, 1 = ladder. Latched per student until they scroll off. */
  const mode = useRef<Uint8Array>(new Uint8Array(STUDENT_COUNT));
  /** Which ladder row each student owns this frame, within their zone. */
  const row = useRef<Int32Array>(new Int32Array(STUDENT_COUNT));
  /** 0 = above the closing card, 1 = below it. */
  const zone = useRef<Int32Array>(new Int32Array(STUDENT_COUNT));
  /** How many students ended up in each zone, so rows can be spaced. */
  const zoneN = useRef<Int32Array>(new Int32Array(2));
  const rowScratch = useRef<Int32Array>(new Int32Array(STUDENT_COUNT));
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
      m.u = Math.min(m.w, m.h);
      m.ring = m.h * viewport.ringK;
      m.narrow = m.w < m.h;
      // A 17px floor on a tall frame. This is handwriting, in Lao, on a
      // 390px screen, and it was sized when the layout was fighting for every
      // pixel. It no longer is - see the note on the reserved band below. All
      // five messages still wrap to two lines at 17px.
      m.fs = clamp(m.h * 0.017, m.narrow ? 17 : 15, 24);
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
    // None on the portrait shot. It plays Scene 7 as the sky and the closing
    // card alone - the ring is hidden there too (see `DayScene`), so there is
    // nobody for a line to come out of.
    const portrait = viewport.aspect < NARROW_ASPECT;
    const on = !portrait && GATES.floatingLinesOn(p) && dayState.chars.length > 0;

    setOpacity(layerRef.current, on ? 1 : 0);
    if (!on) {
      for (const c of dayState.chars) c.say = 0;
      return;
    }

    const camera = dayState.camera;
    if (!(camera instanceof PerspectiveCamera)) return;

    for (const c of dayState.chars) c.say = 0;

    const { w, h, u, fs, ring, narrow } = metrics.current;
    // `mx` and `my` are the same number on every landscape frame, because
    // `u === h` there. Only a tall frame tells them apart.
    const mx = MARGIN * u;
    const my = MARGIN * h;
    const headR = HEAD_R * ring;
    const guard = headR * HEAD_PAD;
    const runLen = RUN * u;
    const elbowLen = ELBOW * u;
    const minCol = narrow ? MIN_COL_EM * fs : MIN_W * h;
    const maxCol = narrow ? MAX_COL_EM * fs : MAX_W * h;
    const vHalf = (LINES * fs * LINE_H) / 2;
    const ladderOnly = viewport.aspect < LADDER_ASPECT;

    // The band down the middle that belongs to the closing card.
    //
    // This file's own header says what the ending is supposed to be: five
    // people and five sentences readable at once, "with the closing card in
    // the gap in the middle". On a wide frame the ring's geometry opens that
    // gap by itself. On a phone it does not, and nothing here knew the gap was
    // meant to exist - so the callouts walked straight over "Happy Teacher's
    // Day!". The timing makes it certain rather than unlucky: `floatingLinesOn`
    // has no upper bound and `finaleTitle` fires at `BIG_A`, so from 0.988 to
    // the end of the film both are always up together.
    //
    // Sized like the card is: `Finale.tsx` stacks a clamped title, a message
    // and a credit row, which is about 220px on a phone and proportionally
    // less on anything bigger.
    // The two halves of the frame the ladder hands rows out in.
    //
    // This used to reserve a 320px band down the middle for the closing card,
    // which was a third of a phone's height spent on something that is no
    // longer there at the same time: a portrait frame no longer draws the
    // callouts at all (see the top of `update`). Splitting at
    // the midline instead gives every row about 148px for a 54px label, and
    // the crowding this was meant to solve is solved by there simply being
    // three times the room.
    const bandTop = h / 2;
    const bandBottom = h / 2;

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
      slot.x = (scratch.x * 0.5 + 0.5) * w;
      slot.y = (-scratch.y * 0.5 + 0.5) * h;
      // In front of the lens AND somewhere near the frame. The z test alone
      // let a head that had left the frame entirely go on being an anchor,
      // so a label could be positioned for a face nobody could see.
      slot.on =
        scratch.z <= 1 &&
        slot.x > -guard &&
        slot.x < w + guard &&
        slot.y > -guard &&
        slot.y < h + guard;
    }

    // Ladder rows are handed out by head height, so the leaders never cross
    // and the reading order matches the visual one. Insertion sort over five
    // preallocated slots: this runs inside the render loop.
    {
      const idx = rowScratch.current;
      for (let i = 0; i < STUDENT_COUNT; i++) idx[i] = i;
      for (let i = 1; i < STUDENT_COUNT; i++) {
        const v = idx[i] as number;
        const vy = (heads.current[v] as { y: number }).y;
        let j = i - 1;
        while (j >= 0 && (heads.current[idx[j] as number] as { y: number }).y > vy) {
          idx[j + 1] = idx[j] as number;
          j--;
        }
        idx[j + 1] = v;
      }
      // Each student goes above or below the card depending on where their
      // own head is, and is ranked within that side. Splitting the ladder in
      // two is what keeps it out of the card AND stops two rows clamping onto
      // the same y, which the old single evenly-spaced ladder could do.
      let up = 0;
      let down = 0;
      for (let r = 0; r < STUDENT_COUNT; r++) {
        const si = idx[r] as number;
        const above = (heads.current[si] as { y: number }).y < h / 2;
        zone.current[si] = above ? 0 : 1;
        row.current[si] = above ? up++ : down++;
      }
      zoneN.current[0] = up;
      zoneN.current[1] = down;
    }

    placed.current.length = 0;

    // Seed the corner chrome, so the rect test below keeps messages off it.
    //
    // All three of these are live at the end of the film and none of them was
    // ever visible to this solver: the replay button sits top-right, the mute
    // pill bottom-left, and the now-playing chip bottom-right for anyone who
    // opened the music box - it has no scroll gate at all. The ladder's own
    // margin let a row reach y 819, straight through the bottom two.
    //
    // Sized from the same `clamp()` the components use, and deliberately a
    // little generous: over-reserving costs a few pixels of a row we have
    // plenty of, under-reserving puts a sentence under a button.
    if (ladderOnly) {
      const edge = clamp(w * 0.03, 12, 22);
      placed.current.push(
        { x0: w - edge - 104, y0: 0, x1: w, y1: edge + 46 },
        { x0: 0, y0: h - edge - 46, x1: edge + 126, y1: h },
        { x0: w - edge - 142, y0: h - edge - 42, x1: w, y1: h },
      );
    }

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
        // Re-arm the layout too: scrolling back is how the finale is replayed,
        // and a latched ladder would outlive the frame shape that caused it.
        mode.current[i] = 0;
        continue;
      }

      // `ladderOnly` is the frames where this IS the layout. Everywhere else
      // the elbow is tried first and the ladder is the fallback below - on a
      // desktop the elbow places on the first frame, so it never runs.
      const ladder = ladderOnly || mode.current[i] === 1;
      // A head off the frame normally means "wait" - but in ladder mode the
      // column is anchored to the frame edge, not to the head, so one bad
      // frame of projection must not cost a message and its chime.
      if (!head.on && !ladder) {
        hide();
        continue;
      }

      const hx = head.on ? head.x : clamp(head.x, mx + guard, w - mx - guard);
      const hy = head.on ? head.y : clamp(head.y, my + guard, h - my - guard);

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

      for (let n = 0; n < total && !box && !ladder; n++) {
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
        const tcx = tsx + dx * runLen * shrink;
        const tcy = tsy + dy * runLen * shrink;
        const tex = tcx + side * elbowLen * shrink;
        const tey = tcy;

        // Reserve the column rather than measure it: whatever room is left
        // between the elbow and the frame edge becomes the sentence's
        // max-width, so it can never overflow and never has to be read back.
        const room = wantLeft ? tex - mx : w - mx - tex;
        if (room < minCol) continue;
        const col = Math.min(maxCol, room);
        // Too narrow to hold the sentence in the space reserved for it.
        if (Math.ceil((chars * ADVANCE * fs) / col) > LINES) continue;

        const r: Rect = {
          x0: wantLeft ? tex - col : tex,
          y0: tey - vHalf,
          x1: wantLeft ? tex : tex + col,
          y1: tey + vHalf,
        };
        if (r.y0 < my || r.y1 > h - my) continue;

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

      // ---- the ladder ------------------------------------------------------
      //
      // The elbow layout needs room OUTBOARD of a head, and a tall frame has
      // none: the reach plus the narrowest column is wider than the half-frame
      // it has to fit in. So a narrow frame lays the callouts out as a ladder
      // instead - one row each, handed out by head height, each column
      // anchored to a frame edge and led to by a stem down (or up) from the
      // head and then a straight run across.
      //
      // It cannot fail, which is the point. The elbow search can come back
      // empty and simply wait for a better frame; on a phone that wait never
      // ends, and the chime below never fires.
      if (!box && (ladder || t > LADDER_AFTER)) {
        mode.current[i] = 1;

        // The ladder always measures its column in ems, on every frame shape.
        //
        // `maxCol` is a fraction of HEIGHT on a landscape frame, and a phone
        // held sideways is wide but only 390px tall - that caps the column at
        // 117px, which turns a 44-character message into four lines and 96px
        // of text inside a 73px row. The em measure gives it 264px and two
        // lines. Only the elbow search keeps the height-based bound, because
        // that one has to stay bit-identical on a desktop.
        const col = Math.min(MAX_COL_EM * fs, w - 2 * mx);

        // Reserve only the lines the sentence needs. The elbow path keeps the
        // deliberately generous flat reservation - it is choosing between
        // candidates and wants slack - but the ladder has already committed,
        // and a flat four lines is most of a phone row spent on white space.
        const estLines = Math.min(
          LINES,
          Math.max(1, Math.ceil((chars * ADVANCE * fs) / col)),
        );
        const half = (estLines * fs * LINE_H) / 2;

        // The row, inside this student's own half of the frame.
        const zi = zone.current[i] ?? 0;
        const zTop = zi === 0 ? my : bandBottom;
        const zBot = zi === 0 ? bandTop : h - my;
        const n = Math.max(1, zoneN.current[zi] ?? 1);
        const rowH = Math.max(2 * half, (zBot - zTop) / n);
        // The clamp is what keeps a lift honest: it can move a row within this
        // student's own half of the frame, never into the band the closing
        // card owns.
        const lift = (student.dayLabelLift ?? 0) * h;
        const ry = clamp(
          zTop + rowH * ((row.current[i] ?? 0) + 0.5) - lift,
          Math.min(zTop + half, h - my - half),
          Math.max(zBot - half, my + half),
        );

        // Two candidate anchors, scored. The NEAR edge first - the one the
        // student is already standing on, which is what the elbow path uses
        // and what `dayLabelSide` pins for Timmy and Vanhxay. The ladder used
        // to prefer the FAR edge, the opposite polarity, so three of the five
        // messages crossed the whole frame and came to rest beside somebody
        // else's face. That is what made them read as swapped.
        const nearLeft = prefer < 0;
        let wantLeft = nearLeft;
        let bestScore = Infinity;
        for (let c2 = 0; c2 < 2; c2++) {
          const tryLeft = c2 === 0 ? nearLeft : !nearLeft;
          const tx0 = tryLeft ? mx : w - mx - col;
          const tr: Rect = { x0: tx0, y0: ry - half, x1: tx0 + col, y1: ry + half };
          let score = 0;
          for (let j = 0; j < STUDENT_COUNT; j++) {
            const o = heads.current[j];
            if (o && o.on && rectHitsDisc(tr, o.x, o.y, guard)) score += 1;
          }
          // Sitting on another message is worse than sitting on a face: a face
          // is still a face underneath, two sentences on top of each other are
          // neither. The elbow path has always tested this; the ladder never
          // did, which is the other half of what the screenshot showed.
          for (let j = 0; j < placed.current.length; j++) {
            const q = placed.current[j];
            if (q && rectsOverlap(tr, q)) score += 4;
          }
          if (score < bestScore) {
            bestScore = score;
            wantLeft = tryLeft;
          }
          if (score === 0) break;
        }

        const x0 = wantLeft ? mx : w - mx - col;
        // `ex` is where the words are anchored: their right edge when they are
        // set to the left of it, their left edge otherwise. Same contract the
        // draw block below already has.
        const tex = wantLeft ? x0 + col : x0;

        // A stem out of the head toward the row, then a straight run to the
        // words. Vertical first, not outward: the column is on the far side
        // of the frame, and an outward stub would set off in the wrong
        // direction and have to come back across the face.
        const dirY = ry >= hy ? 1 : -1;
        const tsy = hy + dirY * (guard + HEAD_GAP);
        const tcy = dirY * (ry - tsy) > 0 ? ry : tsy;

        sx = hx;
        sy = tsy;
        cx = hx;
        cy = tcy;
        ex = tex;
        ey = ry;
        box = { x0, y0: ry - half, x1: x0 + col, y1: ry + half };
        allow = col;
        left = wantLeft;
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
      // The ragged edge goes AWAY from the leader, so a wrapped sentence stays
      // visually attached to its own line. `left` means the words sit to the
      // left of the anchor, so their right edge is the one at the elbow.
      setStyle(label, 'textAlign', left ? 'right' : 'left');
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
