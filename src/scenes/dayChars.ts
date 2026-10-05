import type { Group, Object3D } from 'three';
import type { BlockyRig } from '../components/students/blockyRig';
import type { WakeGesture } from '../config/students';

/** One student in the finale ring. */
export interface DayChar {
  readonly index: number;
  readonly name: string;
  readonly rig: BlockyRig;
  readonly holder: Group;
  /**
   * Seat on the ring, in radians clockwise from +Z.
   *
   * Not readonly: a portrait frame plays a different shot with a different
   * seat table (`dayAngleNarrow` in the roster), and `DayScene` re-seats the
   * ring on resize rather than rebuilding it. The per-frame entrance ramp
   * already derives `holder.position` from this, so a re-seat is two numbers
   * and the yaw.
   */
  angle: number;
  /** Metres from the lens on the ground plane, once they have arrived. */
  radius: number;
  /** Forward tilt over the lens, in radians. The same for everyone. */
  readonly lean: number;
  /** Point in the wake ramp where this student starts sliding in. */
  readonly enter: number;
  readonly gesture: WakeGesture;
  /** 0..1 presence of this student's floating line — drives their reaction. */
  say: number;
}

/**
 * The finale ring, published for the floating lines to read.
 *
 * The lines are DOM elements anchored to each student's head in screen space,
 * so the overlay needs the heads and the day camera. Passing them through
 * React would re-render the overlay every frame; this is a handle instead.
 */
export const dayState: {
  chars: DayChar[];
  camera: Object3D | null;
} = {
  chars: [],
  camera: null,
};
