import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  ShaderMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TextureLoader,
} from 'three';
import vertexShader from '../../shaders/moonRim.vert.glsl?raw';
import fragmentShader from '../../shaders/moonRim.frag.glsl?raw';
import { useTextures } from '../../textures/TextureProvider';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import type { FrameState } from '../../state/frame';

/** NASA-derived lunar map. The procedural moon stands in until it arrives. */
const MOON_MAP_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/textures/planets/moon_1024.jpg';

/** One rotation every five minutes - present, but never caught in the act. */
const ROTATION_PERIOD = 300;

/**
 * The moon the film opens on.
 *
 * Lit by its own point light rather than the scene's, which is what gives it
 * a real gibbous terminator instead of a flat disc, and bump-mapped with the
 * same texture as its colour so the craters catch that light. A fresnel shell
 * 5% larger adds the thin atmospheric rim, and a wide faint sprite gives
 * bloom something to work with.
 */
export function Moon(): React.ReactElement {
  const textures = useTextures();

  const bodyMat = useMemo(
    () =>
      new MeshStandardMaterial({
        map: textures.moon,
        bumpMap: textures.moon,
        bumpScale: 3.2,
        roughness: 0.97,
        metalness: 0,
        envMapIntensity: 0.12,
        fog: false,
        transparent: true,
        opacity: 1,
      }),
    [textures.moon],
  );

  // Swap in the photographic map if the CDN serves it; the procedural one is
  // already on screen, so a failure here is invisible.
  useEffect(() => {
    let cancelled = false;
    new TextureLoader().load(
      MOON_MAP_URL,
      (tex) => {
        if (cancelled) return;
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = 8;
        bodyMat.map = tex;
        bodyMat.bumpMap = tex;
        bodyMat.needsUpdate = true;
      },
      undefined,
      () => {
        /* keep the procedural surface */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bodyMat]);

  const rimMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: FrontSide,
        uniforms: {
          uOpacity: { value: 0.3 },
          uColor: { value: new Color('#cfdcff') },
        },
        vertexShader,
        fragmentShader,
      }),
    [],
  );

  const haloMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#a8c0f0'),
        transparent: true,
        opacity: 0.055,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    [textures.glow],
  );

  const bodyRef = useRef<Mesh>(null);
  const keyRef = useRef<PointLight>(null);
  const haloRef = useRef<Sprite>(null);

  const update = useCallback(
    (f: FrameState) => {
      const fade = GATES.moonFade(f.p);
      haloMat.opacity = GATES.moonHalo(f.p);
      bodyMat.opacity = fade;
      if (bodyRef.current) {
        bodyRef.current.rotation.y = f.time * ((Math.PI * 2) / ROTATION_PERIOD);
      }
      if (keyRef.current) keyRef.current.intensity = 5.6 * fade;
      const rimOpacity = rimMat.uniforms['uOpacity'];
      if (rimOpacity) rimOpacity.value = 0.3 * fade;
    },
    [bodyMat, haloMat, rimMat],
  );

  useUpdate('world', update);

  return (
    <group position={[-64, 318, -500]}>
      <mesh ref={bodyRef} material={bodyMat}>
        <sphereGeometry args={[46, 160, 120]} />
      </mesh>

      {/* the sun, effectively - a single local key gives the terminator */}
      <pointLight
        ref={keyRef}
        color="#fff8f0"
        intensity={5.6}
        distance={300}
        decay={0}
        position={[66, 22, 96]}
      />
      {/* cool earthshine on the dark limb */}
      <pointLight
        color="#6f88c4"
        intensity={0.22}
        distance={260}
        decay={0}
        position={[-70, -20, 20]}
      />

      <mesh material={rimMat}>
        <sphereGeometry args={[48.2, 72, 54]} />
      </mesh>

      <sprite ref={haloRef} material={haloMat} scale={[96, 96, 1]} />
    </group>
  );
}
