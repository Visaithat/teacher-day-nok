import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type IUniform,
} from 'three';
import { useTextures } from '../../textures/TextureProvider';
import { GATES } from '../../config/timeline';
import { makeRandom } from '../../lib/math';
import { useNightUpdate } from '../../scenes/nightVisibility';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import type { FrameState } from '../../state/frame';

interface Layer {
  /** Height of the layer. */
  readonly y: number;
  readonly count: number;
  /** Cloud size range. */
  readonly size: readonly [number, number];
  /** Horizontal spread. */
  readonly spread: number;
  readonly opacity: number;
  /**
   * The lowest layer is laid out as a corridor down the camera's descent
   * path, so clouds actually pass the lens on the way down instead of
   * sitting off to the sides.
   */
  readonly corridor?: boolean;
}

const LAYERS: readonly Layer[] = [
  { y: 226, count: 6, size: [78, 150], spread: 760, opacity: 0.2 },
  { y: 158, count: 6, size: [56, 110], spread: 470, opacity: 0.36 },
  { y: 102, count: 5, size: [42, 84], spread: 330, opacity: 0.42 },
  { y: 62, count: 4, size: [36, 70], spread: 150, opacity: 0.5, corridor: true },
];

interface Puff {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  rot: number;
  spin: number;
  phase: number;
  alpha: number;
  drift: number;
  colour: Color;
}

function buildPuffs(scale: number): Puff[] {
  const rand = makeRandom(0xc10d5);
  const out: Puff[] = [];

  LAYERS.forEach((layer, li) => {
    const clouds = Math.max(1, Math.round(layer.count * scale));
    for (let i = 0; i < clouds; i++) {
      const cx = layer.corridor ? (rand() - 0.5) * 84 : (rand() - 0.5) * layer.spread;
      const cz = layer.corridor
        ? 132 - i * 42 - rand() * 26
        : (rand() - 0.5) * layer.spread + 40;
      const cy = layer.y + (rand() - 0.5) * 26;

      const base = layer.size[0] + rand() * (layer.size[1] - layer.size[0]);
      // Clouds drift, each at its own speed, and wrap around the world.
      const drift = (0.22 + rand() * 0.4) * 0.72;
      const puffs = 9 + Math.floor(rand() * 6);

      for (let k = 0; k < puffs; k++) {
        // Puffs higher in the cluster catch the moonlight; the ones
        // underneath stay blue-grey. That vertical gradient is what makes a
        // cluster of blobs read as a cloud.
        const up = rand();
        const colour =
          up > 0.5 ? '#edf3fd' : up > 0.24 ? '#c6d2e8' : '#9dabc6';
        const s = base * (0.5 + rand() * 0.55);

        out.push({
          x: cx + (rand() - 0.5) * base * 1.55,
          y: cy + (up - 0.4) * base * 0.4,
          z: cz + (rand() - 0.5) * base * 0.85,
          w: s,
          h: s * 0.74,
          rot: rand() * 6.28,
          spin: (rand() - 0.5) * 0.5 * 0.048,
          phase: rand() * 6.28,
          alpha: layer.opacity * (0.55 + rand() * 0.45),
          drift,
          colour: new Color(colour),
        });
      }
    }
    void li;
  });

  return out;
}

/**
 * Four layers of soft cloud, each a cluster of camera-facing puffs.
 *
 * The source built these as individual Sprites - around 230 of them, each
 * with its own material, all repositioned and rescaled on the CPU every
 * frame. Here they are one instanced batch: the billboarding, the drift, the
 * slow breathing and the spin all happen in the vertex shader, so the whole
 * sky costs one draw call and no per-frame JavaScript at all.
 */
export function CloudLayers(): React.ReactElement {
  const textures = useTextures();
  const quality = useUIStore((s) => s.quality);
  const puffs = useMemo(() => buildPuffs(QUALITY[quality].cloudScale), [quality]);
  const meshRef = useRef<InstancedMesh>(null);

  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 } as IUniform<number>,
      uFade: { value: 1 } as IUniform<number>,
    }),
    [],
  );

  const material = useMemo(() => {
    const m = new MeshBasicMaterial({
      map: textures.cloudPuff,
      transparent: true,
      depthWrite: false,
    });

    m.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = uniforms.uTime;
      shader.uniforms['uFade'] = uniforms.uFade;

      shader.vertexShader = `
        uniform float uTime;
        attribute vec2 aSize;
        attribute float aRot;
        attribute float aSpin;
        attribute float aPhase;
        attribute float aAlpha;
        attribute float aDrift;
        varying float vAlpha;
      ${shader.vertexShader}`;

      // Replace the standard projection with a view-space billboard, so every
      // puff faces the lens no matter where the camera swings.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
        vAlpha = aAlpha;
        vec4 cloudWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Drift sideways forever, wrapping the world rather than respawning.
        cloudWorld.x = mod(cloudWorld.x + aDrift * uTime + 360.0, 720.0) - 360.0;
        vec4 mvPosition = modelViewMatrix * cloudWorld;

        float breath = 1.0 + sin(uTime * 0.16 + aPhase) * 0.05;
        float ang = aRot + aSpin * uTime;
        float cs = cos(ang);
        float sn = sin(ang);
        vec2 quad = position.xy * aSize * breath;
        mvPosition.xy += vec2(quad.x * cs - quad.y * sn, quad.x * sn + quad.y * cs);

        gl_Position = projectionMatrix * mvPosition;
        `,
      );

      shader.fragmentShader = `
        uniform float uFade;
        varying float vAlpha;
      ${shader.fragmentShader}`;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.a *= vAlpha * uFade;`,
      );
    };

    // Without a stable key three compiles a fresh program for this material.
    m.customProgramCacheKey = () => 'cloudPuff';
    return m;
  }, [textures.cloudPuff, uniforms]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new Object3D();
    const size = new Float32Array(puffs.length * 2);
    const rot = new Float32Array(puffs.length);
    const spin = new Float32Array(puffs.length);
    const phase = new Float32Array(puffs.length);
    const alpha = new Float32Array(puffs.length);
    const drift = new Float32Array(puffs.length);

    puffs.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.colour);

      size[i * 2] = p.w;
      size[i * 2 + 1] = p.h;
      rot[i] = p.rot;
      spin[i] = p.spin;
      phase[i] = p.phase;
      alpha[i] = p.alpha;
      drift[i] = p.drift;
    });

    mesh.geometry.setAttribute('aSize', new InstancedBufferAttribute(size, 2));
    mesh.geometry.setAttribute('aRot', new InstancedBufferAttribute(rot, 1));
    mesh.geometry.setAttribute('aSpin', new InstancedBufferAttribute(spin, 1));
    mesh.geometry.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1));
    mesh.geometry.setAttribute('aAlpha', new InstancedBufferAttribute(alpha, 1));
    mesh.geometry.setAttribute('aDrift', new InstancedBufferAttribute(drift, 1));

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The billboard is computed in the shader, so the bounding sphere three
    // derives from the instance matrices would cull clouds that are on screen.
    mesh.frustumCulled = false;
  }, [puffs]);

  const update = useCallback(
    (f: FrameState) => {
      uniforms.uTime.value = f.time;
      uniforms.uFade.value = GATES.cloudFade(f.p);
    },
    [uniforms],
  );

  useNightUpdate('night', 'world', update);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, puffs.length]}
      frustumCulled={false}
    />
  );
}
