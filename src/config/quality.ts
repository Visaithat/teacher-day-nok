/**
 * Quality tiers.
 *
 * The source had a single hard `mobile` branch decided once at load. Here that
 * becomes the starting point of a three-tier ladder that Drei's
 * <PerformanceMonitor> can walk up and down at runtime, so a mid-range laptop
 * that drops frames during the street sequence recovers instead of staying
 * stuttery for the rest of the film.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualitySettings {
  /** Device pixel ratio clamp passed to the R3F canvas. */
  readonly dpr: readonly [number, number];
  /** Star count before `starDensity` is applied. */
  readonly stars: number;
  /** Multiplier on every flower species' instance count. */
  readonly flowerScale: number;
  readonly grass: number;
  readonly fireflies: number;
  /** Garden petals, Scene 7 petals, gift motes, music box motes. */
  readonly gardenPetals: number;
  readonly wakePetals: number;
  readonly giftMotes: number;
  readonly musicBoxMotes: number;
  readonly groundFogPlanes: number;
  /** Puffs per cloud layer are scaled by this. */
  readonly cloudScale: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  readonly depthOfField: boolean;
  readonly bloomResolutionScale: number;
  /** Cast shadows from individual character meshes. */
  readonly characterShadows: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: {
    dpr: [1, 1.5],
    stars: 11000,
    flowerScale: 1,
    grass: 900,
    fireflies: 88,
    gardenPetals: 90,
    wakePetals: 60,
    giftMotes: 30,
    musicBoxMotes: 22,
    groundFogPlanes: 7,
    cloudScale: 1,
    shadows: true,
    shadowMapSize: 1024,
    depthOfField: true,
    bloomResolutionScale: 0.5,
    characterShadows: true,
  },
  medium: {
    dpr: [1, 1.25],
    stars: 6000,
    flowerScale: 0.6,
    grass: 520,
    fireflies: 52,
    gardenPetals: 54,
    wakePetals: 36,
    giftMotes: 20,
    musicBoxMotes: 16,
    groundFogPlanes: 5,
    cloudScale: 0.7,
    shadows: true,
    shadowMapSize: 512,
    depthOfField: true,
    bloomResolutionScale: 0.35,
    characterShadows: false,
  },
  low: {
    dpr: [1, 1],
    stars: 3400,
    flowerScale: 0.35,
    grass: 300,
    fireflies: 24,
    gardenPetals: 26,
    wakePetals: 20,
    giftMotes: 14,
    musicBoxMotes: 10,
    groundFogPlanes: 3,
    cloudScale: 0.45,
    shadows: false,
    shadowMapSize: 512,
    depthOfField: false,
    bloomResolutionScale: 0.25,
    characterShadows: false,
  },
};

const LADDER: readonly QualityTier[] = ['low', 'medium', 'high'];

/** The source's own mobile test, kept verbatim. */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 820px), (pointer: coarse)').matches;
}

/**
 * `?perf&tier=low` holds the film on one tier, for measurement.
 *
 * The ladder moves with the frame rate, so two runs of the same build can end
 * on different tiers and stop being comparable - and a screenshot diff across
 * a change of pixel ratio compares nothing at all. Only honoured alongside
 * `?perf`, so no ordinary link can pin a visitor's quality.
 */
export function pinnedTier(): QualityTier | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const tier = q.get('tier');
  if (!q.has('perf') || !tier) return null;
  return (LADDER as readonly string[]).includes(tier) ? (tier as QualityTier) : null;
}

export function initialTier(): QualityTier {
  return pinnedTier() ?? (isMobileDevice() ? 'low' : 'high');
}

export function stepTier(current: QualityTier, direction: 1 | -1): QualityTier {
  const i = LADDER.indexOf(current);
  const next = Math.min(LADDER.length - 1, Math.max(0, i + direction));
  return LADDER[next] as QualityTier;
}
