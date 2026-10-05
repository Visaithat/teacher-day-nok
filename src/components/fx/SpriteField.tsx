import { useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  ShaderMaterial,
  type IUniform,
} from 'three';
import petalVert from '../../shaders/petals.vert.glsl?raw';
import petalFrag from '../../shaders/petals.frag.glsl?raw';
import moteVert from '../../shaders/motes.vert.glsl?raw';
import moteFrag from '../../shaders/motes.frag.glsl?raw';
import { makeRandom } from '../../lib/math';
import { FIT_STRENGTH, fitFov, fovGainFor } from '../../state/viewport';
import type { Texture } from 'three';

/**
 * Point-based replacements for the film's four sprite swarms.
 *
 * The source ran garden petals, finale petals, gift motes and music-box motes
 * as individual `Sprite` objects — around two hundred of them, each with its
 * own material, all repositioned on the CPU every frame. Each swarm is one
 * draw call here, with the falling, drifting, spinning and recycling done in
 * the vertex shader.
 *
 * Sizes are in pixels rather than world units, so `pixelScale` converts: it
 * is roughly `viewportHeight / (2 * tan(fov/2))` for the scene's field of
 * view, which keeps a petal the same apparent size as the sprite it replaced.
 */

export interface PetalFieldUniforms {
  readonly uTime: IUniform<number>;
  readonly uOpacity: IUniform<number>;
  readonly uMap: IUniform<Texture | null>;
  readonly uSpan: IUniform<number>;
  readonly uFloor: IUniform<number>;
  readonly uPixelScale: IUniform<number>;
}

export interface PetalFieldOptions {
  readonly count: number;
  readonly map: Texture;
  /** Two alternating tints, as the source did. */
  readonly colours: readonly [string, string];
  /** Spawn box: x spread, y range, z start and depth. */
  readonly spread: readonly [number, number, number, number];
  /** Fall speed range in world units per second. */
  readonly fall: readonly [number, number];
  readonly size: readonly [number, number];
  /** Height a petal falls through before recycling. */
  readonly span: number;
  readonly floor: number;
  readonly seed: number;
  readonly pixelScale?: number;
}

export function createPetalField(o: PetalFieldOptions): {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  uniforms: PetalFieldUniforms;
} {
  const rand = makeRandom(o.seed);
  const n = o.count;
  const pos = new Float32Array(n * 3);
  const colour = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const size = new Float32Array(n);
  const fall = new Float32Array(n);

  const tint = [new Color(o.colours[0]), new Color(o.colours[1])];
  const [sx, sy, sz, sd] = o.spread;

  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() - 0.5) * sx;
    pos[i * 3 + 1] = o.floor + rand() * sy;
    pos[i * 3 + 2] = sz + rand() * sd;

    const c = tint[i % 2] as Color;
    colour[i * 3] = c.r;
    colour[i * 3 + 1] = c.g;
    colour[i * 3 + 2] = c.b;

    phase[i] = rand() * 6.3;
    size[i] = o.size[0] + rand() * (o.size[1] - o.size[0]);
    fall[i] = o.fall[0] + rand() * (o.fall[1] - o.fall[0]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colour, 3));
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aFall', new BufferAttribute(fall, 1));

  const uniforms: PetalFieldUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uMap: { value: o.map },
    uSpan: { value: o.span },
    uFloor: { value: o.floor },
    uPixelScale: { value: o.pixelScale ?? 900 },
  };

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    uniforms: uniforms as unknown as Record<string, IUniform>,
    vertexShader: petalVert,
    fragmentShader: petalFrag,
  });

  return { geometry, material, uniforms };
}

export interface MoteFieldUniforms {
  readonly uTime: IUniform<number>;
  readonly uOpacity: IUniform<number>;
  readonly uMap: IUniform<Texture | null>;
  readonly uColor: IUniform<Color>;
  readonly uRise: IUniform<number>;
  readonly uFloor: IUniform<number>;
  readonly uSway: IUniform<number>;
  readonly uPixelScale: IUniform<number>;
}

export interface MoteFieldOptions {
  readonly count: number;
  readonly map: Texture;
  readonly colour: string;
  readonly spread: readonly [number, number];
  readonly size: readonly [number, number];
  readonly speed: readonly [number, number];
  readonly rise: number;
  readonly floor: number;
  readonly sway: number;
  readonly seed: number;
  readonly pixelScale?: number;
}

export function createMoteField(o: MoteFieldOptions): {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  uniforms: MoteFieldUniforms;
} {
  const rand = makeRandom(o.seed);
  const n = o.count;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const size = new Float32Array(n);
  const speed = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rand() - 0.5) * o.spread[0];
    pos[i * 3 + 1] = 0;
    pos[i * 3 + 2] = (rand() - 0.5) * o.spread[1];
    phase[i] = rand();
    size[i] = o.size[0] + rand() * (o.size[1] - o.size[0]);
    speed[i] = o.speed[0] + rand() * (o.speed[1] - o.speed[0]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('aPhase', new BufferAttribute(phase, 1));
  geometry.setAttribute('aSize', new BufferAttribute(size, 1));
  geometry.setAttribute('aSpeed', new BufferAttribute(speed, 1));

  const uniforms: MoteFieldUniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uMap: { value: o.map },
    uColor: { value: new Color(o.colour) },
    uRise: { value: o.rise },
    uFloor: { value: o.floor },
    uSway: { value: o.sway },
    uPixelScale: { value: o.pixelScale ?? 900 },
  };

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: uniforms as unknown as Record<string, IUniform>,
    vertexShader: moteVert,
    fragmentShader: moteFrag,
  });

  return { geometry, material, uniforms };
}

/**
 * Match a point field's on-screen size to the sprites it replaced.
 *
 * `gl_PointSize` is in framebuffer pixels, while the sprites these stand in
 * for were sized in world units. The conversion is
 * `bufferHeight / (2 · tan(fov / 2))`, which depends on both the viewport and
 * the camera — and the four fields render through three different cameras
 * (the gift box at fov 34, the journey at ~48, the finale at 74), so a single
 * constant cannot be right for all of them. Recomputed on resize and on any
 * device-pixel-ratio change.
 *
 * `fit` is for the fields seen through the JOURNEY camera, whose fov is no
 * longer the authored constant on a narrow frame - pass the key's fit strength
 * and the widening is applied here, where the aspect is already a dependency.
 * Without it a phone draws every petal and mote about a third too large.
 */
export function useFieldPixelScale(
  uniform: IUniform<number>,
  fov: number,
  fit?: number,
): void {
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);

  // The DPR is a dependency in its own right, not just a value read inside
  // the effect: the quality ladder changes it mid-film without changing
  // `size` or the renderer's identity, and the header above already promised
  // this was recomputed on any device-pixel-ratio change.
  const dpr = gl.getPixelRatio();

  useLayoutEffect(() => {
    const bufferHeight = size.height * dpr;
    const aspect = size.width / Math.max(1, size.height);
    const live =
      fit === undefined
        ? fov
        : fitFov(fov, Math.pow(fovGainFor(aspect), fit / FIT_STRENGTH));
    uniform.value = bufferHeight / (2 * Math.tan((live * Math.PI) / 360));
  }, [uniform, fov, fit, size, gl, dpr]);
}

/** Convenience wrapper so callers can drop a field straight into the scene. */
export function SpriteField({
  geometry,
  material,
}: {
  geometry: BufferGeometry;
  material: ShaderMaterial;
}): React.ReactElement {
  const key = useMemo(() => geometry.uuid, [geometry]);
  return <points key={key} geometry={geometry} material={material} frustumCulled={false} />;
}
