import { Vector2, Vector3 } from 'three';

/** Clamp `v` into [a, b]. Mirrors `Component.clamp` in the source. */
export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

/**
 * Smoothstep. Mirrors `Component.sstep` in the source, including the
 * `(b - a) || 1e-6` guard — consecutive camera keyframes share identical `p`
 * at student-slot boundaries and would otherwise divide by zero.
 */
export function sstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Linear interpolation. Mirrors `Component.lerp` in the source. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Frame-rate-independent form of the source's `x += (target - x) * k` idiom.
 *
 * The original ran that raw per frame, so the approach speed scaled with the
 * refresh rate and every dropped frame changed the camera's velocity — the
 * single largest contributor to the reported stutter. `k` here is still the
 * original per-frame constant; at 60fps the result is identical.
 */
export function damp(current: number, target: number, k: number, dt: number): number {
  return current + (target - current) * (1 - Math.pow(1 - k, dt * 60));
}

/** Shared scratch vectors. Never hold a reference across a frame boundary. */
export const scratchV3 = /*#__PURE__*/ new Vector3();
export const scratchV3b = /*#__PURE__*/ new Vector3();
export const scratchV2 = /*#__PURE__*/ new Vector2();

/** Deterministic pseudo-random in [0, 1) — same sequence on every load. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
