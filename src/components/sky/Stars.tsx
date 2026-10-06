import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
} from 'three';
import vertexShader from '../../shaders/stars.vert.glsl?raw';
import fragmentShader from '../../shaders/stars.frag.glsl?raw';
import { makeRandom } from '../../lib/math';
import { GATES } from '../../config/timeline';
import { useNightUpdate } from '../../scenes/nightVisibility';
import { useUIStore } from '../../state/useUIStore';
import { QUALITY } from '../../config/quality';
import { DEFAULT_PROPS } from '../../config/copy';
import type { FrameState } from '../../state/frame';

/**
 * Stellar classes: `[r, g, b, share]`. Mostly white, a good number of
 * blue-white, some warm, a few faint gold - a real sky is not monochrome, and
 * the colour is most of what sells it at this distance.
 */
const CLASSES: readonly (readonly [number, number, number, number])[] = [
  [0.72, 0.8, 1.0, 0.16],
  [1.0, 1.0, 1.0, 0.52],
  [1.0, 0.95, 0.86, 0.22],
  [1.0, 0.84, 0.62, 0.1],
];

const BAND_TILT = 0.46;
const BAND_YAW = 0.7;
/** Share of stars packed into the Milky Way band. */
const BAND_SHARE = 0.42;

function buildGeometry(count: number): BufferGeometry {
  const rand = makeRandom(0x57a25);
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const r = 1000 + rand() * 700;
    const inBand = rand() < BAND_SHARE;
    const th = rand() * Math.PI * 2;

    // Band stars cluster tightly around the galactic plane; the rest are
    // spread evenly over the sphere (asin keeps the density uniform rather
    // than bunching at the poles).
    const lat = inBand
      ? ((rand() + rand() + rand() - 1.5) / 1.5) * 0.17
      : Math.asin(rand() * 1.9 - 0.95);

    const x = Math.cos(lat) * Math.cos(th);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.sin(th);

    // Tilt the band, then yaw it, so it crosses the frame diagonally.
    const cy = Math.cos(BAND_TILT);
    const sy = Math.sin(BAND_TILT);
    const y2 = y * cy - z * sy;
    let z2 = y * sy + z * cy;
    const cz = Math.cos(BAND_YAW);
    const sz = Math.sin(BAND_YAW);
    const x2 = x * cz - z2 * sz;
    z2 = x * sz + z2 * cz;

    pos[i * 3] = x2 * r;
    // Mirrored into the upper hemisphere and lifted, so the field is a dome
    // over the city rather than a sphere the camera sits inside.
    pos[i * 3 + 1] = Math.abs(y2 * r) * 0.9 + 90;
    pos[i * 3 + 2] = z2 * r;

    let k = rand();
    let pick = CLASSES[1] as readonly [number, number, number, number];
    for (const c of CLASSES) {
      if (k < c[3]) {
        pick = c;
        break;
      }
      k -= c[3];
    }
    color[i * 3] = pick[0];
    color[i * 3 + 1] = pick[1];
    color[i * 3 + 2] = pick[2];

    phase[i] = rand() * 6.28;
    // Band stars are finer and dimmer, so the band reads as haze rather than
    // as confetti. 3% get a size boost and become the named stars.
    size[i] =
      (inBand ? 0.5 + rand() * 0.9 : 0.8 + rand() * 1.9) * (rand() < 0.03 ? 2.2 : 1);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new BufferAttribute(phase, 1));
  g.setAttribute('aSize', new BufferAttribute(size, 1));
  g.setAttribute('aColor', new BufferAttribute(color, 3));
  return g;
}

export function Stars({ starDensity = DEFAULT_PROPS.starDensity }: { starDensity?: number }) {
  const quality = useUIStore((s) => s.quality);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const count = Math.round(QUALITY[quality].stars * starDensity);

  const geometry = useMemo(() => buildGeometry(count), [count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 1 },
          // Set from the canvas below, not from the device. See the effect.
          uDpr: { value: 1 },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  /**
   * The canvas's pixel ratio, not the device's.
   *
   * This was `Math.min(window.devicePixelRatio, 2)`, memoised with an empty
   * dependency list - so on a phone reporting a ratio of 3, where the quality
   * ladder clamps the canvas to 1, every star was drawn at twice the size it
   * was meant to be. A blown-out, confetti sky and a fill-rate bill, on
   * exactly the devices least able to pay it. The tier can also change
   * mid-film, which is the other half of why this cannot be read once.
   */
  useLayoutEffect(() => {
    const u = material.uniforms['uDpr'];
    if (u) u.value = gl.getPixelRatio();
  }, [material, gl, quality, size]);

  const ref = useRef<Points>(null);

  const update = useCallback(
    (f: FrameState) => {
      const u = material.uniforms;
      const time = u['uTime'];
      const opacity = u['uOpacity'];
      if (time) time.value = f.time;
      if (opacity) opacity.value = GATES.starOpacity(f.p);
    },
    [material],
  );

  useNightUpdate('sky', 'world', update);

  return (
    <points ref={ref} geometry={geometry} material={material} frustumCulled={false} />
  );
}
