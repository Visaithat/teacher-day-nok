import { clamp } from '../lib/math';

/**
 * ============================================================================
 * THE SHAPE OF THE WINDOW
 * ============================================================================
 *
 * A plain mutable singleton, for the same reason `frame.ts` is one: these are
 * read inside `useFrame` and inside the update-bus overlay callbacks, dozens
 * of times a frame, by code that must not re-render when the window resizes.
 *
 * Unlike `frame.ts` these change only on resize, so every transcendental is
 * computed once in `publishViewport` and the hot paths read plain floats.
 *
 * Rule: only `ViewportProbe` writes this.
 *
 * ---------------------------------------------------------------------------
 *
 * The film was framed on a wide desktop window. Three's `fov` is VERTICAL, so
 * a portrait viewport keeps the vertical framing intact and collapses the
 * horizontal one: at vfov 48 the horizontal half-angle is ~38 degrees on 16:9
 * and ~11.6 at aspect 0.46. Everything here exists to buy that back.
 */

/** The aspect the film was framed on. At or above it, nothing below fires. */
export const FOV_REF_ASPECT = 16 / 9;

/**
 * How much of the horizontal field a narrow frame wins back by widening the
 * lens, as an exponent: 0 is today, 1 is a full horizontal fit.
 *
 * It is deliberately small. A FULL fit of the hold key's fov 46 at aspect
 * 0.462 is **vfov 117** - a fish-eye that bends the street into a bowl, and
 * with `near: 0.5` it puts the near plane through the street geometry at the
 * push-in. 0.30 gives vfov 65 there, which leaves about a fifth of the frame
 * as margin around the subject group while keeping its on-screen height at
 * two thirds of the desktop shot.
 *
 * The lens is the SECOND fix, not the first: see `composeGain`.
 */
export const FIT_STRENGTH = 0.3;

/** A guard, not a knob. Only the sky keys could reach it, and they opt out. */
export const MAX_JOURNEY_FOV = 70;

/**
 * Where the street stops stop composing to the rule of thirds.
 *
 * The authored `look` on a student stop sits at `sx * 0.68` while the student
 * stands at `sx` - the subject is deliberately pushed right of centre so the
 * message panel can own the left of the frame. On a 390-wide phone there is no
 * left of frame to give away, and that offset alone (not the fov) is what
 * throws the subject off screen: at aspect 0.46 the hold shot's subject group
 * spans NDC x 0.578 to 2.118. Sliding the aim onto the subject brings it back
 * to -0.541..0.898 with no lens change at all.
 */
export const COMPOSE_A = 1.3;
export const COMPOSE_B = 0.8;

/**
 * Below this aspect Scene 7 plays its portrait shot instead.
 *
 * 1.10 is where `PERFORMANCE.md` already put the failure, and the projection
 * agrees: at aspect 1.10 the worst head is at NDC x 1.10.
 */
export const NARROW_ASPECT = 1.1;

/** Scene 7's authored lens, and the portrait one. See `students.ts`. */
export const DAY_FOV = 74;
export const DAY_FOV_NARROW = 96;

const DEG = Math.PI / 180;

export interface ViewportState {
  w: number;
  h: number;
  aspect: number;
  /**
   * `min(w, h)`. The unit for drawn lengths that are a design quantity rather
   * than a projection - it equals `h` on every landscape frame, so anything
   * keyed to it is unchanged on a desktop by construction.
   */
  u: number;
  /** True while the frame is taller than it is wide. */
  narrow: boolean;
  /** `(REF / aspect) ^ FIT_STRENGTH`. 1 at and above the reference aspect. */
  fovGain: number;
  /** 0..1 blend of a shot's look target onto its subject. */
  composeGain: number;
  /** Scene 7's live vertical fov. */
  dayFov: number;
  /**
   * How much the finale's projected head shrank under the portrait lens,
   * `tan(37) / tan(dayFov / 2)`.
   *
   * `FloatingLines` sizes its head-avoidance discs off this. Without it the
   * portrait lens makes every disc a 47% over-estimate and the solver starts
   * refusing placements that are wide open.
   */
  ringK: number;
}

export const viewport: ViewportState = {
  w: 1,
  h: 1,
  aspect: FOV_REF_ASPECT,
  u: 1,
  narrow: false,
  fovGain: 1,
  composeGain: 0,
  dayFov: DAY_FOV,
  ringK: 1,
};

/** `(REF / aspect) ^ FIT_STRENGTH`, for code that has an aspect but no probe. */
export function fovGainFor(aspect: number): number {
  return aspect >= FOV_REF_ASPECT ? 1 : Math.pow(FOV_REF_ASPECT / aspect, FIT_STRENGTH);
}

export function publishViewport(w: number, h: number): void {
  const aspect = w / Math.max(1, h);
  viewport.w = w;
  viewport.h = h;
  viewport.aspect = aspect;
  viewport.u = Math.min(w, h);
  viewport.narrow = w < h;
  viewport.fovGain = fovGainFor(aspect);
  viewport.composeGain = clamp((COMPOSE_A - aspect) / (COMPOSE_A - COMPOSE_B), 0, 1);
  viewport.dayFov = aspect < NARROW_ASPECT ? DAY_FOV_NARROW : DAY_FOV;
  viewport.ringK = Math.tan(37 * DEG) / Math.tan((viewport.dayFov * DEG) / 2);
}

/**
 * The fitted vertical fov for an authored one.
 *
 * `gain` rides the precomputed `fovGain`; a key that wants a different fit
 * strength passes `Math.pow(viewport.fovGain, fit / FIT_STRENGTH)`, which is
 * `(REF / aspect) ^ fit` without recomputing the ratio.
 */
export function fitFov(nominal: number, gain = viewport.fovGain, cap = MAX_JOURNEY_FOV): number {
  if (gain === 1) return nominal;
  const fitted = (2 * Math.atan(Math.tan((nominal * DEG) / 2) * gain)) / DEG;
  return fitted > cap ? cap : fitted;
}

// The film is never server-rendered, but the module is imported by config that
// runs before the canvas mounts, and a 1x1 viewport would make the first
// solved pose wrong for one frame.
if (typeof window !== 'undefined') publishViewport(window.innerWidth, window.innerHeight);
