import { STUDENTS, STUDENT_COUNT, sideFor } from './students';
import {
  SLOT_BOUNDS,
  STREET_B,
  STUDENT_OFFSET_X,
  STUDENT_SPACING,
  WHITE_B,
  slotShape,
  studentZ,
  type SlotBound,
} from './timeline';
import { lerp, sstep } from '../lib/math';

/** A camera keyframe. The film is a list of these, smoothstep-interpolated. */
export interface CameraKey {
  /** Scroll position this pose is reached at. */
  readonly p: number;
  readonly pos: readonly [number, number, number];
  /** World point the camera looks at. */
  readonly look: readonly [number, number, number];
  readonly fov: number;
}

/**
 * The intro: sky hold, title, tilt down, descent, garden landing, gate.
 *
 * Duplicated near-identical pairs are deliberate "hold" zones where the camera
 * barely moves. The sky (0.000-0.105) and the garden/gate (0.472-0.506) hold
 * the longest - those are the beats the title and the gate sign play over.
 */
export const INTRO_KEYS: readonly CameraKey[] = [
  { p: 0.0,   pos: [0, 262, 232], look: [0, 330, -170], fov: 52 }, // sky, held
  { p: 0.105, pos: [2, 261, 227], look: [0, 327, -166], fov: 52 }, // hold drift
  { p: 0.15,  pos: [5, 258, 214], look: [0, 306, -152], fov: 52 },
  { p: 0.205, pos: [7, 253, 199], look: [0, 246, -96],  fov: 52 },
  { p: 0.225, pos: [7, 252, 196], look: [0, 236, -86],  fov: 52 }, // hold before tilt
  { p: 0.3,   pos: [2, 216, 168], look: [0, 40, 14],    fov: 51 }, // tilt down
  { p: 0.375, pos: [0, 132, 128], look: [0, 8, 12],     fov: 50 }, // descent
  { p: 0.425, pos: [0, 46, 104],  look: [0, 8, 52],     fov: 48 },
  { p: 0.455, pos: [0, 14, 90],   look: [0, 10, 54],    fov: 47 }, // lands in the garden
  { p: 0.472, pos: [0, 5.4, 86],  look: [0, 12.5, 48],  fov: 48 }, // path leads to the gate
  { p: 0.5,   pos: [0, 5.2, 83],  look: [0, 12.2, 47],  fov: 48 }, // gate sign in the upper third
  { p: 0.506, pos: [0, 5.1, 81],  look: [0, 11.6, 46],  fov: 48 },
  { p: 0.52,  pos: [0, 4.6, 52],  look: [0, 3.9, 38],   fov: 46 }, // through the gate
];

/**
 * The full timeline: intro, then one six-key stop per student, then the walk
 * into the white-out.
 *
 * Per student the six keys are:
 *   1-2  WALK       dead centre of the road, eyes straight ahead. The two keys
 *                   are equidistant in both p and z so there is no easing bump
 *                   in the middle of a constant-speed walk.
 *   3    NOTICE     still travelling; the head begins to turn toward them
 *   4    PUSH IN    the turn completes into a medium close-up
 *   5    HOLD       barely moves - this is the shot their message plays over
 *   6    PULL BACK  ease out and face down the street again
 *
 * Slot widths come from `SLOT_BOUNDS` (the last student's is stretched) and
 * the phase fractions from `slotShape` (the first student's turn is longer).
 */
export function buildKeys(): CameraKey[] {
  const keys: CameraKey[] = INTRO_KEYS.slice();
  const sp = STUDENT_SPACING;

  STUDENTS.forEach((_student, i) => {
    const side = sideFor(i);
    const z = studentZ(i);
    const sx = side * STUDENT_OFFSET_X;
    const { a, span } = SLOT_BOUNDS[i] as SlotBound;
    const s = slotShape(i);

    keys.push({
      p: a,
      pos: [0, 4.5, z + sp * 0.95],
      look: [0, 4.1, z + sp * 0.95 - 34],
      fov: 50,
    });
    keys.push({
      p: a + span * s.walkEnd,
      pos: [0, 4.5, z + sp * 0.34],
      look: [0, 4.1, z + sp * 0.34 - 34],
      fov: 50,
    });
    keys.push({
      p: a + span * s.noticeEnd,
      pos: [side * 0.9, 4.5, z + 14.5],
      look: [sx * 0.34, 4.0, z + 5.5],
      fov: 48,
    });
    keys.push({
      p: a + span * s.pushEnd,
      pos: [side * 1.9, 4.4, z + 11.2],
      look: [sx * 0.66, 3.7, z + 0.2],
      fov: 46,
    });
    keys.push({
      p: a + span * s.holdOut,
      pos: [side * 2.1, 4.45, z + 10.7],
      look: [sx * 0.68, 3.65, z - 0.5],
      fov: 46,
    });
    keys.push({
      p: a + span,
      pos: [0, 4.5, z + 1.5],
      look: [0, 4.1, z - 32],
      fov: 50,
    });
  });

  // Keep walking forward past the last student; the white-out rides on top.
  // The final two keys are identical, so the camera is frozen from WHITE_B
  // onward - the whole finale is the day scene plus the DOM layer.
  const zl = studentZ(STUDENT_COUNT - 1);
  keys.push({ p: STREET_B, pos: [0, 4.5, zl - 9],  look: [0, 4.4, zl - 34], fov: 46 });
  keys.push({ p: WHITE_B,  pos: [0, 4.9, zl - 40], look: [0, 5.2, zl - 66], fov: 45 });
  keys.push({ p: 1.0,      pos: [0, 4.9, zl - 40], look: [0, 5.2, zl - 66], fov: 45 });

  return keys;
}

/** Mutable output of the solver. One instance, reused every frame. */
export interface CameraPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

export function makeCameraPose(): CameraPose {
  return { pos: [0, 0, 0], look: [0, 0, 0], fov: 50 };
}

/**
 * Solve the camera pose at scroll position `p`.
 *
 * Segments are interpolated linearly, but the parameter is remapped through
 * smoothstep first, so the camera eases in and out of every keyframe. That
 * easing is what makes each student stop feel like a deliberate camera move
 * rather than a lerp, and it is why this is not a spline - a spline would
 * round off the deliberate holds.
 *
 * `lastIndex` caches the segment between calls: `p` moves monotonically most
 * of the time, so the search is normally zero iterations instead of the
 * from-scratch scan over every key the source did each frame.
 */
export class CameraSolver {
  private readonly keys: readonly CameraKey[];
  private lastIndex = 0;

  constructor(keys: readonly CameraKey[] = buildKeys()) {
    this.keys = keys;
  }

  get keyCount(): number {
    return this.keys.length;
  }

  solve(p: number, out: CameraPose, reduced: boolean): CameraPose {
    const keys = this.keys;
    const max = keys.length - 2;

    let i = this.lastIndex;
    if (i > max) i = max;
    // Walk backwards first (scrubbing up), then forwards.
    while (i > 0 && p < (keys[i] as CameraKey).p) i--;
    while (i < max && p > (keys[i + 1] as CameraKey).p) i++;
    this.lastIndex = i;

    const a = keys[i] as CameraKey;
    const b = keys[i + 1] as CameraKey;

    // Reduced motion: hold each pose and cross-fade across the segment
    // midpoint rather than sweeping the camera through it.
    const t = reduced ? sstep(0.42, 0.58, (p - a.p) / (b.p - a.p || 1e-6)) : sstep(a.p, b.p, p);

    for (let k = 0; k < 3; k++) {
      out.pos[k] = lerp(a.pos[k] as number, b.pos[k] as number, t);
      out.look[k] = lerp(a.look[k] as number, b.look[k] as number, t);
    }
    out.fov = lerp(a.fov, b.fov, t);
    return out;
  }
}
