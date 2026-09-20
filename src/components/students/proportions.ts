import { BoxGeometry, MeshStandardMaterial, type ColorRepresentation } from 'three';

/**
 * The figures are built from one proportion table, not from measurements per
 * character. Arms and legs each total exactly the torso height, and limb
 * thickness equals torso depth, so every joint lines up flush and the whole
 * body reads as carved from one block rather than assembled from parts.
 */
export const P = {
  torsoW: 1.24,
  torsoH: 1.24,
  torsoD: 0.62,
  headS: 0.82,
  neckH: 0.12,
  neckW: 0.3,
  /* arm total == torso height; thickness == torso depth */
  armT: 0.62,
  uArm: 0.6,
  lArm: 0.44,
  handH: 0.2,
  /* leg total == torso height */
  legT: 0.62,
  uLeg: 0.6,
  lLeg: 0.44,
  footH: 0.2,
} as const;

/** Hip height, and the total height of a figure at scale 1. */
export const HIP_Y = P.footH + P.lLeg + P.uLeg; // 1.24
export const BODY_H = HIP_Y + P.torsoH + P.neckH + P.headS; // 3.42

/**
 * Where a loaded GLB's head sits, in the model's own space.
 *
 * Every model is normalised to `BODY_H` with its feet on y = 0 by the loaders,
 * so this is one shared number rather than a per-model measurement. A human
 * head is roughly a seventh of a body, so its centre is half of that below the
 * crown. Nudge this if the finale's leader dots sit high or low on the face -
 * it is the only thing that positions them.
 */
export const MODEL_HEAD_Y = BODY_H * (14 / 15); // 3.19

/**
 * A box with its corners pulled in.
 *
 * Not a true bevel — every one of the eight corners is drawn toward the
 * centre by `r/2` on each axis, which shrinks the box slightly and leaves the
 * faces very subtly non-planar. Recomputing normals afterwards keeps the
 * faceted shading; that faceting is what makes a stack of boxes read as a
 * carved figure instead of as primitives.
 */
export function bevelBox(w: number, h: number, d: number, r = 0.05): BoxGeometry {
  const rr = Math.min(r, Math.min(w, h, d) * 0.4);
  const g = new BoxGeometry(w, h, d);
  const pos = g.attributes['position'];
  if (!pos) return g;

  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) - Math.sign(pos.getX(i)) * rr * 0.5,
      pos.getY(i) - Math.sign(pos.getY(i)) * rr * 0.5,
      pos.getZ(i) - Math.sign(pos.getZ(i)) * rr * 0.5,
    );
  }
  g.computeVertexNormals();
  return g;
}

/** The surface vocabulary the figures are dressed in. */
export type SurfaceKind =
  | 'skin'
  | 'leather'
  | 'fabric'
  | 'silk'
  | 'sequin'
  | 'metal'
  | 'pearl'
  | 'rubber'
  | 'hair'
  | 'wood'
  | 'seam';

interface Surface {
  readonly roughness: number;
  readonly metalness: number;
  readonly envMapIntensity: number;
}

const SURFACES: Record<SurfaceKind, Surface> = {
  skin: { roughness: 0.6, metalness: 0.0, envMapIntensity: 0.4 },
  leather: { roughness: 0.38, metalness: 0.14, envMapIntensity: 1.05 },
  fabric: { roughness: 0.88, metalness: 0.02, envMapIntensity: 0.45 },
  silk: { roughness: 0.52, metalness: 0.06, envMapIntensity: 0.75 },
  sequin: { roughness: 0.28, metalness: 0.62, envMapIntensity: 1.45 },
  metal: { roughness: 0.24, metalness: 0.94, envMapIntensity: 1.35 },
  pearl: { roughness: 0.18, metalness: 0.1, envMapIntensity: 1.2 },
  rubber: { roughness: 0.92, metalness: 0.0, envMapIntensity: 0.25 },
  hair: { roughness: 0.34, metalness: 0.18, envMapIntensity: 0.95 },
  wood: { roughness: 0.62, metalness: 0.04, envMapIntensity: 0.5 },
  seam: { roughness: 0.95, metalness: 0.0, envMapIntensity: 0.1 },
};

/**
 * Build a figure surface.
 *
 * The source allocated a new material per call, which meant a street of five
 * characters carried several hundred near-duplicates. These are cached by
 * (kind, colour): the figures share, and the shader programs collapse.
 */
const cache = new Map<string, MeshStandardMaterial>();

export function surf(kind: SurfaceKind, color: ColorRepresentation): MeshStandardMaterial {
  const key = `${kind}|${String(color)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const s = SURFACES[kind] ?? { roughness: 0.8, metalness: 0, envMapIntensity: 1 };
  const m = new MeshStandardMaterial({
    color,
    roughness: s.roughness,
    metalness: s.metalness,
    envMapIntensity: s.envMapIntensity,
  });
  cache.set(key, m);
  return m;
}

export function disposeSurfaces(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
