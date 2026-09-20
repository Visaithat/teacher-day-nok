import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FlowerBeds, inBed } from './FlowerBeds';
import { createWindMaterial, createWindUniforms } from '../../shaders/wind';
import { createPetalField, SpriteField, useFieldPixelScale } from '../fx/SpriteField';
import { useTextures } from '../../textures/TextureProvider';
import { mat } from '../../lib/materials';
import { makeRandom } from '../../lib/math';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import type { FrameState } from '../../state/frame';

/** Where the brick path runs: an S-curve from the landing point to the gate. */
function pathCentre(t: number): number {
  return Math.sin(t * Math.PI) * 3.4;
}

const LANTERN_COUNT = 7;
const BRICK_CAPACITY = 340;
const TREE_POSITIONS: readonly (readonly [number, number])[] = [
  [-16, 58],
  [15, 62],
  [-21, 76],
  [20, 78],
];

/**
 * The garden the camera lands in before the gate.
 *
 * This is the film's one moment of stillness: the descent ends, the camera
 * settles at walking height, and everything here exists to reward looking —
 * flowers moving in wind, petals coming down, lanterns pooling on the path,
 * a pond reflecting the sky.
 *
 * Everything repeated is instanced or merged. The lanterns alone were 70
 * separate meshes in the source and are five instanced batches here.
 */
export function Garden(): React.ReactElement {
  const textures = useTextures();
  const quality = useUIStore((s) => s.quality);
  const settings = QUALITY[quality];

  // One uniform pair drives every wind material in the garden.
  const windUniforms = useMemo(createWindUniforms, []);
  const grassMat = useMemo(
    () => createWindMaterial(windUniforms, { color: '#375c2e' }),
    [windUniforms],
  );

  const glowRef = useRef<PointLight>(null);
  const brickRef = useRef<InstancedMesh>(null);
  const grassRef = useRef<InstancedMesh>(null);

  // ---------------------------------------------------------------- bricks
  const brickGeo = useMemo(() => new BoxGeometry(1.5, 0.12, 0.9), []);

  useLayoutEffect(() => {
    const mesh = brickRef.current;
    if (!mesh) return;
    const rand = makeRandom(0xb21c4);
    const dummy = new Object3D();
    let i = 0;

    for (let t = 0; t <= 1 && i < BRICK_CAPACITY; t += 0.0125) {
      const z = 92 - t * 44;
      const cx = pathCentre(t);
      for (let k = -2; k <= 2 && i < BRICK_CAPACITY; k++) {
        dummy.position.set(cx + k * 1.55 + (rand() - 0.5) * 0.12, 0.06, z);
        dummy.rotation.set(0, Math.cos(t * Math.PI) * 0.12 + (rand() - 0.5) * 0.05, 0);
        dummy.scale.setScalar(0.96 + rand() * 0.08);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }

    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
  }, []);

  // ----------------------------------------------------------------- grass
  const grassGeo = useMemo(() => new ConeGeometry(0.07, 0.7, 4), []);
  const grassCount = settings.grass;

  useLayoutEffect(() => {
    const mesh = grassRef.current;
    if (!mesh) return;
    const rand = makeRandom(0x64a55);
    const dummy = new Object3D();
    let placed = 0;
    let guard = 0;

    while (placed < grassCount && guard++ < 40000) {
      const x = (rand() - 0.5) * 70;
      const z = 42 + rand() * 56;
      // Mostly in the beds, but a quarter of the strays are kept so the
      // planting does not stop at a hard edge.
      if (!inBed(x, z) && rand() > 0.25) continue;
      dummy.position.set(x, 0.35, z);
      dummy.rotation.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3);
      dummy.scale.setScalar(0.7 + rand() * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed++, dummy.matrix);
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
  }, [grassCount]);

  // ----------------------------------------------------------------- trees
  const trees = useMemo(() => {
    const rand = makeRandom(0x77ee5);
    // Trunks and branches merge into one geometry; the blossom puffs into
    // another, so four trees cost two draw calls instead of eighty-eight.
    const woodParts = [];
    const puffParts = [];

    for (const [tx, tz] of TREE_POSITIONS) {
      const trunk = new CylinderGeometry(0.34, 0.62, 6.4, 9);
      trunk.translate(tx, 3.2, tz);
      woodParts.push(trunk);

      for (let b = 0; b < 5; b++) {
        const a = (b / 5) * 6.28;
        const branch = new CylinderGeometry(0.1, 0.24, 3.2, 6);
        const o = new Object3D();
        o.position.set(tx + Math.cos(a) * 1.1, 5.4, tz + Math.sin(a) * 1.1);
        o.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        o.updateMatrix();
        branch.applyMatrix4(o.matrix);
        woodParts.push(branch);
      }

      for (let k = 0; k < 16; k++) {
        const a = rand() * 6.28;
        const rr = rand() * 2.9;
        const puff = new SphereGeometry(1.5 + rand() * 1.1, 9, 7);
        puff.scale(1, 0.78, 1);
        puff.translate(tx + Math.cos(a) * rr, 6.6 + rand() * 2.4, tz + Math.sin(a) * rr);
        puffParts.push(puff);
      }
    }

    const wood = BufferGeometryUtils.mergeGeometries(woodParts);
    const puffs = BufferGeometryUtils.mergeGeometries(puffParts);
    woodParts.forEach((g) => g.dispose());
    puffParts.forEach((g) => g.dispose());
    return { wood, puffs };
  }, []);

  // -------------------------------------------------------------- lanterns
  const lanterns = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < LANTERN_COUNT; i++) {
      const t = i / (LANTERN_COUNT - 1);
      const z = 90 - t * 42;
      const cx = pathCentre(t);
      for (const sx of [-1, 1]) out.push({ x: cx + sx * 5.4, z });
    }
    return out;
  }, []);

  const lanternRefs = useRef<(InstancedMesh | null)[]>([]);
  const lanternGeos = useMemo(
    () => [
      new CylinderGeometry(0.11, 0.15, 1.5, 8), // post
      new ConeGeometry(0.42, 0.34, 8), // cap
      new SphereGeometry(0.17, 12, 10), // bulb
      new CircleGeometry(2.6, 20), // ground pool
    ],
    [],
  );
  const lanternOffsets = useMemo(
    () => [
      { y: 0.75, rotX: 0 },
      { y: 1.78, rotX: 0 },
      { y: 1.52, rotX: 0 },
      { y: 0.09, rotX: -Math.PI / 2 },
    ],
    [],
  );

  useLayoutEffect(() => {
    const dummy = new Object3D();
    lanternRefs.current.forEach((mesh, part) => {
      if (!mesh) return;
      const offset = lanternOffsets[part];
      if (!offset) return;
      lanterns.forEach((l, i) => {
        dummy.position.set(l.x, offset.y, l.z);
        dummy.rotation.set(offset.rotX, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
    });
  }, [lanterns, lanternOffsets]);

  // ---------------------------------------------------------------- petals
  const petals = useMemo(
    () =>
      createPetalField({
        count: settings.gardenPetals,
        map: textures.glow,
        colours: ['#ffd9a8', '#f9c9d8'],
        spread: [66, 12, 44, 50],
        fall: [0.72, 2.04],
        size: [0.16, 0.3],
        span: 14.8,
        floor: 0.2,
        seed: 0x9e7a10,
      }),
    [settings.gardenPetals, textures.glow],
  );

  // The garden is seen through the journey camera, which holds near fov 48
  // across this beat.
  useFieldPixelScale(petals.uniforms.uPixelScale, 48);

  // ---------------------------------------------------------------- update
  const update = useCallback(
    (f: FrameState) => {
      const glow = GATES.gardenGlow(f.p);
      windUniforms.uTime.value = f.time;
      // Never fully dark: the beds keep a base read even off the garden beat.
      windUniforms.uLit.value = Math.max(glow, 0.3);
      if (glowRef.current) glowRef.current.intensity = 42 * glow;

      petals.uniforms.uTime.value = f.time;
      petals.uniforms.uOpacity.value = 0.85 * glow;
    },
    [windUniforms, petals],
  );

  useUpdate('gate', update);

  const stoneMat = useMemo(() => mat('fabric', '#4a4038'), []);
  const woodMat = useMemo(() => mat('wood', '#4b3524'), []);
  const blossomMat = useMemo(() => mat('fabric', '#f7c3d4'), []);
  const benchMat = useMemo(() => mat('wood', '#6a4a2b'), []);

  const poolMat = useMemo(
    () =>
      new MeshBasicMaterial({
        map: textures.glow,
        color: '#ffbb72',
        transparent: true,
        opacity: 0.22,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );

  return (
    <group>
      {/* lawn */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 52]} receiveShadow={settings.shadows}>
        <circleGeometry args={[84, 56]} />
        <meshStandardMaterial color="#1d2a1c" roughness={0.95} envMapIntensity={0.4} />
      </mesh>

      {/* brick path */}
      <instancedMesh
        ref={brickRef}
        args={[brickGeo, undefined, BRICK_CAPACITY]}
        receiveShadow={settings.shadows}
      >
        <meshStandardMaterial color="#8a6a4c" roughness={0.8} envMapIntensity={0.5} />
      </instancedMesh>

      <FlowerBeds uniforms={windUniforms} />

      <instancedMesh
        ref={grassRef}
        args={[grassGeo, grassMat, grassCount]}
        castShadow={false}
        receiveShadow={false}
      />

      {/* blossom trees */}
      <mesh geometry={trees.wood} material={woodMat} castShadow={settings.shadows} />
      <mesh geometry={trees.puffs} material={blossomMat} />

      {/* garden lanterns */}
      {lanternGeos.map((geo, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            lanternRefs.current[i] = el;
          }}
          args={[geo, undefined, lanterns.length]}
          castShadow={i === 0 && settings.shadows}
        >
          {i === 2 ? (
            <meshStandardMaterial
              color="#ffdcab"
              emissive="#ffb45e"
              emissiveIntensity={2.6}
              roughness={0.5}
              fog={false}
            />
          ) : i === 3 ? (
            <primitive object={poolMat} attach="material" />
          ) : (
            <primitive object={stoneMat} attach="material" />
          )}
        </instancedMesh>
      ))}

      {/* benches */}
      {(
        [
          [-9.5, 84, 0.2],
          [10.5, 70, -0.3],
        ] as const
      ).map(([x, z, ry]) => (
        <group key={`${x}`} position={[x, 0, z]} rotation-y={ry}>
          <mesh position={[0, 0.86, 0]} material={benchMat} castShadow={settings.shadows}>
            <boxGeometry args={[3.4, 0.16, 1.1]} />
          </mesh>
          <mesh position={[0, 1.36, -0.48]} rotation-x={-0.14} material={benchMat}>
            <boxGeometry args={[3.4, 0.9, 0.14]} />
          </mesh>
          {[-1.4, 1.4].map((lx) => (
            <mesh
              key={lx}
              position={[lx, 0.43, 0]}
              material={benchMat}
              castShadow={settings.shadows}
            >
              <boxGeometry args={[0.16, 0.86, 0.9]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* reflecting pond - the only mirror in the night, so it carries the sky */}
      <group position={[-14, 0, 92]}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
          <circleGeometry args={[5.2, 36]} />
          <meshStandardMaterial
            color="#16222c"
            roughness={0.04}
            metalness={0.9}
            envMapIntensity={1.6}
          />
        </mesh>
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0.18, 0]}
          material={stoneMat}
          castShadow={settings.shadows}
        >
          <torusGeometry args={[5.4, 0.34, 8, 40]} />
        </mesh>
      </group>

      <SpriteField geometry={petals.geometry} material={petals.material} />

      {/* amber bounce off the beds */}
      <pointLight ref={glowRef} color="#ffb066" intensity={0} distance={90} decay={2} position={[0, 5, 70]} />
    </group>
  );
}
