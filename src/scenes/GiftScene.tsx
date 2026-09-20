import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
} from 'three';
import { useTextures } from '../textures/TextureProvider';
import { createMoteField, SpriteField, useFieldPixelScale } from '../components/fx/SpriteField';
import { clamp, sstep } from '../lib/math';
import { GIFT_OPEN_SECONDS } from '../config/timeline';
import { useUpdate } from '../lib/updateBus';
import { renderTargets } from './renderTargets';
import { QUALITY } from '../config/quality';
import { useUIStore } from '../state/useUIStore';
import type { FrameState } from '../state/frame';

/**
 * Scene 1 - the gift box.
 *
 * A warm, close, hand-held little scene that exists only to be opened. It has
 * its own scene, its own camera and its own lighting, and the scroll stays
 * locked until the lid has finished lifting. When the burst blows the frame
 * to white, the night sky is already behind it.
 */
export function GiftScene(): React.ReactElement {
  const textures = useTextures();
  const quality = useUIStore((s) => s.quality);
  const size = useThree((s) => s.size);

  const scene = useMemo(() => {
    const s = new Scene();
    s.background = new Color('#1a1008');
    s.fog = new FogExp2('#1a1008', 0.05);
    return s;
  }, []);

  const camera = useMemo(() => {
    const c = new PerspectiveCamera(34, 1, 0.1, 100);
    c.position.set(0.8, 1.7, 7.2);
    c.lookAt(0, 0.55, 0);
    return c;
  }, []);

  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
  }, [camera, size]);

  useEffect(() => {
    renderTargets.giftScene = scene;
    renderTargets.giftCamera = camera;
    return () => {
      renderTargets.giftScene = null;
      renderTargets.giftCamera = null;
    };
  }, [scene, camera]);

  const paper = useMemo(
    () => new MeshStandardMaterial({ color: '#f5cd86', roughness: 0.5, metalness: 0.05 }),
    [],
  );
  const ribbon = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#fff6e2',
        roughness: 0.18,
        metalness: 0.35,
        emissive: new Color('#7a5520'),
        emissiveIntensity: 0.85,
      }),
    [],
  );

  const innerMat = useMemo(
    () => new MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0 }),
    [],
  );
  const burstMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#fff0cf'),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );

  // Dust in the air around the box. One draw call, risen on the GPU.
  const motes = useMemo(
    () =>
      createMoteField({
        count: QUALITY[quality].giftMotes,
        map: textures.glow,
        colour: '#ffd9a0',
        spread: [6, 4],
        size: [0.06, 0.16],
        speed: [0.06, 0.14],
        rise: 3.6,
        floor: -0.6,
        sway: 0.15,
        seed: 0x91470,
      }),
    [quality, textures.glow],
  );

  // The gift box has its own camera, much longer than the journey's.
  useFieldPixelScale(motes.uniforms.uPixelScale, 34);

  const boxRef = useRef<Group>(null);
  const lidRef = useRef<Group>(null);
  const knotRef = useRef<Mesh>(null);
  const bowLRef = useRef<Mesh>(null);
  const bowRRef = useRef<Mesh>(null);
  const v1Ref = useRef<Mesh>(null);
  const v2Ref = useRef<Mesh>(null);
  const burstRef = useRef<Sprite>(null);

  const update = useCallback(
    (f: FrameState) => {
      const { time } = f;
      const oa = f.opened ? clamp((time - f.openedAt) / GIFT_OPEN_SECONDS, 0, 1) : 0;
      f.giftOpen = oa;
      // Once the burst has whited out the frame, the night scene has taken
      // over and there is nothing here worth animating.
      if (f.opened && oa >= 1) return;

      const box = boxRef.current;
      if (box) {
        box.rotation.y = time * 0.22;
        box.position.y = 0.2 + Math.sin(time * 1.1) * 0.07;
      }
      if (knotRef.current) knotRef.current.rotation.y = time * 0.9;

      const lift = sstep(0.05, 0.6, oa);
      const lid = lidRef.current;
      if (lid) {
        lid.position.y = 0.5 + lift * 2.3;
        lid.rotation.z = lift * 0.5;
      }
      if (bowLRef.current) bowLRef.current.rotation.z = 0.5 + lift * 1.6;
      if (bowRRef.current) bowRRef.current.rotation.z = -0.5 - lift * 1.6;
      // The vertical ribbons collapse as the lid rises, as if they had been
      // holding it shut.
      const squash = 1 - lift * 0.95;
      if (v1Ref.current) v1Ref.current.scale.y = squash;
      if (v2Ref.current) v2Ref.current.scale.y = squash;

      innerMat.opacity = sstep(0.2, 0.8, oa);
      burstMat.opacity = sstep(0.25, 0.75, oa) * 0.95;
      if (burstRef.current) burstRef.current.scale.setScalar(2 + sstep(0.25, 1, oa) * 26);

      motes.uniforms.uTime.value = time;
      motes.uniforms.uOpacity.value = 0.5;

      camera.position.x = 0.6 + Math.sin(time * 0.3) * 0.25;
      camera.lookAt(0, 0.55 + oa * 0.6, 0);
    },
    [camera, innerMat, burstMat, motes],
  );

  useUpdate('camera', update);

  return createPortal(
    <>
      <hemisphereLight args={['#ffe6c0', '#3a240f', 1.15]} />
      <directionalLight color="#fff3dc" intensity={3.4} position={[3.4, 5.5, 4.5]} />
      <directionalLight color="#ffcf9a" intensity={1.2} position={[-4, 2.4, 3]} />
      <pointLight color="#ffb066" intensity={26} distance={14} position={[-2.6, 1.8, -2.4]} />

      <group ref={boxRef} position={[0, 0.2, 0]}>
        <mesh material={paper} position={[0, -0.1, 0]}>
          <boxGeometry args={[1.6, 1.05, 1.6]} />
        </mesh>

        <group ref={lidRef} position={[0, 0.5, 0]}>
          <mesh material={paper}>
            <boxGeometry args={[1.74, 0.3, 1.74]} />
          </mesh>
          <mesh material={ribbon}>
            <boxGeometry args={[0.2, 0.32, 1.78]} />
          </mesh>
          <mesh material={ribbon} rotation-y={Math.PI / 2}>
            <boxGeometry args={[0.2, 0.32, 1.78]} />
          </mesh>
          <mesh ref={knotRef} material={ribbon} position={[0, 0.26, 0]}>
            <torusKnotGeometry args={[0.19, 0.062, 64, 12]} />
          </mesh>
          <mesh
            ref={bowLRef}
            material={ribbon}
            position={[-0.24, 0.24, 0]}
            rotation={[Math.PI / 2, 0, 0.5]}
          >
            <torusGeometry args={[0.2, 0.055, 10, 26]} />
          </mesh>
          <mesh
            ref={bowRRef}
            material={ribbon}
            position={[0.24, 0.24, 0]}
            rotation={[Math.PI / 2, 0, -0.5]}
          >
            <torusGeometry args={[0.2, 0.055, 10, 26]} />
          </mesh>
        </group>

        <mesh ref={v1Ref} material={ribbon} position={[0, -0.1, 0]}>
          <boxGeometry args={[0.2, 1.1, 1.62]} />
        </mesh>
        <mesh ref={v2Ref} material={ribbon} position={[0, -0.1, 0]} rotation-y={Math.PI / 2}>
          <boxGeometry args={[0.2, 1.1, 1.62]} />
        </mesh>

        {/* the light waiting inside */}
        <mesh material={innerMat} rotation-x={-Math.PI / 2} position={[0, 0.4, 0]}>
          <planeGeometry args={[1.5, 1.5]} />
        </mesh>
        <sprite ref={burstRef} material={burstMat} scale={[2, 2, 1]} position={[0, 0.5, 0]} />
      </group>

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.68, 0]}>
        <circleGeometry args={[9, 40]} />
        <meshStandardMaterial color="#2a1a0c" roughness={0.9} />
      </mesh>

      <SpriteField geometry={motes.geometry} material={motes.material} />
    </>,
    scene,
  );
}
