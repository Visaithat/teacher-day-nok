import { useCallback, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
} from 'three';
import vertexShader from '../../shaders/fireflies.vert.glsl?raw';
import fragmentShader from '../../shaders/fireflies.frag.glsl?raw';
import { useTextures } from '../../textures/TextureProvider';
import { GATES } from '../../config/timeline';
import { makeRandom } from '../../lib/math';
import { useNightUpdate } from '../../scenes/nightVisibility';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import type { FrameState } from '../../state/frame';

/**
 * Fireflies through the garden and down the street.
 *
 * Every part of them lives in the vertex shader — the wander, the blink, the
 * size falloff — so the CPU never touches a position. Roughly 30% drift wide
 * of the path, which stops the swarm reading as a tube along the road.
 */
export function Fireflies(): React.ReactElement {
  const textures = useTextures();
  const quality = useUIStore((s) => s.quality);
  const count = QUALITY[quality].fireflies;

  const geometry = useMemo(() => {
    const rand = makeRandom(0xf13f1e);
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const size = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * (rand() < 0.3 ? 60 : 26);
      pos[i * 3 + 1] = 1 + rand() * 9;
      pos[i * 3 + 2] = 52 - rand() * 400;
      phase[i] = rand() * 6.28;
      size[i] = 0.9 + rand() * 1.4;
    }

    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new BufferAttribute(phase, 1));
    g.setAttribute('aSize', new BufferAttribute(size, 1));
    return g;
  }, [count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uMap: { value: textures.glow },
        },
        vertexShader,
        fragmentShader,
      }),
    [textures.glow],
  );

  const update = useCallback(
    (f: FrameState) => {
      const time = material.uniforms['uTime'];
      const opacity = material.uniforms['uOpacity'];
      if (time) time.value = f.time;
      if (opacity) opacity.value = GATES.fireflies(f.p);
    },
    [material],
  );

  useNightUpdate('night', 'world', update);

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
