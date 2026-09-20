import { MeshStandardMaterial, type ColorRepresentation } from 'three';

/**
 * The film's material vocabulary.
 *
 * Every surface in the world is one of these seven presets. Keeping them in
 * one table is what makes the night read as a single lit space: skin, cloth
 * and brass all respond to the same environment map with consistent
 * roughness and reflectivity.
 */
export type MaterialKind =
  | 'skin'
  | 'fabric'
  | 'coat'
  | 'hair'
  | 'metal'
  | 'glass'
  | 'wood';

interface Preset {
  readonly roughness: number;
  readonly metalness: number;
  readonly envMapIntensity: number;
  readonly transparent?: boolean;
  readonly opacity?: number;
}

const PRESETS: Record<MaterialKind, Preset> = {
  skin: { roughness: 0.58, metalness: 0.0, envMapIntensity: 0.35 },
  fabric: { roughness: 0.86, metalness: 0.02, envMapIntensity: 0.5 },
  coat: { roughness: 0.7, metalness: 0.0, envMapIntensity: 0.65 },
  hair: { roughness: 0.72, metalness: 0.06, envMapIntensity: 0.45 },
  metal: { roughness: 0.24, metalness: 0.94, envMapIntensity: 1.2 },
  glass: { roughness: 0.05, metalness: 0.0, envMapIntensity: 1.5, transparent: true, opacity: 0.22 },
  wood: { roughness: 0.62, metalness: 0.04, envMapIntensity: 0.5 },
};

/**
 * Build a material from a preset.
 *
 * The source allocated a fresh material on every call, so a twelve-strong
 * street carried well over a hundred near-identical materials. Here identical
 * (kind, colour) pairs are shared from a cache, which cuts both the material
 * count and the number of shader programs three.js has to manage.
 */
const cache = new Map<string, MeshStandardMaterial>();

export function mat(kind: MaterialKind, color: ColorRepresentation): MeshStandardMaterial {
  const key = `${kind}|${String(color)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const p = PRESETS[kind];
  const m = new MeshStandardMaterial({
    color,
    roughness: p.roughness,
    metalness: p.metalness,
    envMapIntensity: p.envMapIntensity,
    ...(p.transparent === undefined ? {} : { transparent: p.transparent }),
    ...(p.opacity === undefined ? {} : { opacity: p.opacity }),
  });
  cache.set(key, m);
  return m;
}

/** Release every shared material. Called when the experience unmounts. */
export function disposeMaterialCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
