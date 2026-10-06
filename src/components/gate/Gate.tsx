import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  SpotLight,
  SpriteMaterial,
} from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useTextures } from '../../textures/TextureProvider';
import { mat } from '../../lib/materials';
import { GATES } from '../../config/timeline';
import { useNightUpdate } from '../../scenes/nightVisibility';
import { makeRandom } from '../../lib/math';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import type { FrameState } from '../../state/frame';

const ARCH_RADIUS = 8.0;
const ARCH_Y = 14.6;
const SIGN_Y = ARCH_Y + ARCH_RADIUS + 2.5; // 25.1
const SIGN_W = 12.6;
const SIGN_H = 3.4;
const MARQUEE_BULBS = 18;

/**
 * The gate: the threshold of the whole film.
 *
 * Everything about it is built to be looked up at. The sign sits in the upper
 * third of frame at the camera's held position, the pillars are uplit from
 * below so they read against a black sky, and the two lanterns throw real
 * light down onto the path — the only place in the night where the film
 * spends shadow-casting spotlights, because this is the shot that earns them.
 *
 * The lanterns flicker on two sine octaves at once, fast and faster, which is
 * what makes them read as flame rather than as a dimmer.
 */
export function Gate(): React.ReactElement {
  const scene = useThree((s) => s.scene);
  const textures = useTextures();
  const quality = useUIStore((s) => s.quality);
  const settings = QUALITY[quality];

  const gateFillRef = useRef<PointLight>(null);
  const uplightRefs = useRef<(SpotLight | null)[]>([]);
  const lampRefs = useRef<(PointLight | null)[]>([]);
  const throwRefs = useRef<(SpotLight | null)[]>([]);
  const bulbMatRefs = useRef<MeshStandardMaterial[]>([]);
  const marqueeRef = useRef<InstancedMesh>(null);

  const phases = useMemo(() => {
    const rand = makeRandom(0x1a27e2);
    return [rand() * 6.3, rand() * 6.3];
  }, []);

  // ------------------------------------------------------------- materials
  const stoneDark = useMemo(
    () => new MeshStandardMaterial({ color: '#2a272e', roughness: 0.92, envMapIntensity: 0.4 }),
    [],
  );
  const brickMat = useMemo(
    () => new MeshStandardMaterial({ color: '#5c4a44', roughness: 0.88, envMapIntensity: 0.45 }),
    [],
  );
  const mossMat = useMemo(() => new MeshStandardMaterial({ color: '#3b4a2e', roughness: 1 }), []);
  const ironMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#23242b',
        roughness: 0.55,
        metalness: 0.85,
        envMapIntensity: 1.0,
      }),
    [],
  );
  const brassMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#c9a24a',
        roughness: 0.32,
        metalness: 0.95,
        envMapIntensity: 1.3,
        emissive: new Color('#3a2a08'),
        emissiveIntensity: 0.25,
      }),
    [],
  );
  const stone = useMemo(
    () => new MeshStandardMaterial({ color: '#33313c', roughness: 0.85 }),
    [],
  );
  const trim = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#6b5232',
        roughness: 0.5,
        metalness: 0.4,
        emissive: new Color('#3a2508'),
        emissiveIntensity: 0.6,
      }),
    [],
  );

  const bulbMats = useMemo(
    () =>
      [0, 1].map(() => {
        const m = new MeshStandardMaterial({
          color: '#ffd7a0',
          emissive: new Color('#ffb347'),
          emissiveIntensity: 3.4,
          roughness: 0.4,
        });
        return m;
      }),
    [],
  );
  bulbMatRefs.current = bulbMats;

  const beamMats = useMemo(
    () =>
      [0, 1].map(
        () =>
          new SpriteMaterial({
            map: textures.glow,
            color: new Color('#ffb265'),
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
      ),
    [textures.glow],
  );

  const uplightGlowMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#ffb265'),
        transparent: true,
        opacity: 0.18,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );

  const signHaloMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#ffb866'),
        transparent: true,
        opacity: 0.22,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );

  // ------------------------------------------------------------- geometry
  /** Mortar courses and cap tiers, merged per pillar side. */
  const pillarDressing = useMemo(() => {
    const darkParts = [];
    const stoneParts = [];
    const trimParts = [];

    for (const sx of [-1, 1]) {
      const px = sx * 9;
      for (let r = 0; r < 6; r++) {
        const s = 3.05 - r * 0.06;
        const g = new BoxGeometry(s, 0.08, s);
        g.translate(px, 2.6 + r * 2.1, 0);
        darkParts.push(g);
      }
      const capA = new BoxGeometry(3.6, 0.5, 3.6);
      capA.translate(px, 15.3, 0);
      const capC = new BoxGeometry(3.2, 0.6, 3.2);
      capC.translate(px, 16.25, 0);
      stoneParts.push(capA, capC);

      const capB = new BoxGeometry(4.2, 0.4, 4.2);
      capB.translate(px, 15.75, 0);
      trimParts.push(capB);
    }

    const merge = (parts: BoxGeometry[]) => {
      const m = BufferGeometryUtils.mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      return m;
    };
    return { dark: merge(darkParts), stone: merge(stoneParts), trim: merge(trimParts) };
  }, []);

  /** The arch ribs and their brass beads, merged into two geometries. */
  const archDressing = useMemo(() => {
    const ribParts = [];
    const beadParts = [];
    for (let k = 0; k <= 10; k++) {
      const a = (k / 10) * Math.PI;
      const rib = new BoxGeometry(0.18, 1.1, 0.7);
      const o = new Object3D();
      o.position.set(
        Math.cos(a) * (ARCH_RADIUS - 0.55),
        ARCH_Y + Math.sin(a) * (ARCH_RADIUS - 0.55),
        0,
      );
      o.rotation.set(0, 0, a - Math.PI / 2);
      o.updateMatrix();
      rib.applyMatrix4(o.matrix);
      ribParts.push(rib);

      const bead = new SphereGeometry(0.14, 10, 8);
      bead.translate(
        Math.cos(a) * (ARCH_RADIUS + 0.55),
        ARCH_Y + Math.sin(a) * (ARCH_RADIUS + 0.55),
        0.3,
      );
      beadParts.push(bead);
    }
    const ribs = BufferGeometryUtils.mergeGeometries(ribParts);
    const beads = BufferGeometryUtils.mergeGeometries(beadParts);
    ribParts.forEach((g) => g.dispose());
    beadParts.forEach((g) => g.dispose());
    return { ribs, beads };
  }, []);

  const marqueeGeo = useMemo(() => new SphereGeometry(0.11, 10, 8), []);

  useLayoutEffect(() => {
    const mesh = marqueeRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    let i = 0;
    for (let k = 0; k < MARQUEE_BULBS; k++) {
      const bx = -SIGN_W / 2 + (k + 0.5) * (SIGN_W / MARQUEE_BULBS);
      for (const sy of [1, -1]) {
        dummy.position.set(bx, sy * (SIGN_H / 2 + 0.28), 0.32);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
  }, []);

  // The throw lights need their targets in the scene graph.
  useLayoutEffect(() => {
    const added: Object3D[] = [];
    for (const light of [...uplightRefs.current, ...throwRefs.current]) {
      if (!light) continue;
      scene.add(light.target);
      added.push(light.target);
    }
    return () => {
      for (const t of added) scene.remove(t);
    };
  }, [scene]);

  // Allocate the lantern's shadow map now; the update below holds it still
  // while the lantern is dark. See the walk light in `NightWorld`.
  useEffect(() => {
    if (!settings.shadows) return;
    for (const light of throwRefs.current) {
      if (light?.castShadow) light.shadow.needsUpdate = true;
    }
  }, [settings.shadows]);

  // ---------------------------------------------------------------- update
  const update = useCallback(
    (f: FrameState) => {
      const { p, time } = f;
      const on = GATES.gateOn(p);

      uplightRefs.current.forEach((light, k) => {
        if (light) light.intensity = 120 * on * (1 + Math.sin(time * 7 + k) * 0.04);
      });

      if (gateFillRef.current) gateFillRef.current.intensity = GATES.gateFill(p);

      const beam = GATES.lanternBeam(p);
      for (let i = 0; i < 2; i++) {
        const ph = phases[i] ?? 0;
        // Two octaves of flicker: the slow one is the flame moving, the fast
        // one is it guttering.
        const fl =
          1 + Math.sin(time * 9.1 + ph) * 0.05 + Math.sin(time * 23.7 + ph * 2) * 0.03;

        const lamp = lampRefs.current[i];
        if (lamp) lamp.intensity = 90 * fl * on;
        const thrown = throwRefs.current[i];
        if (thrown) {
          thrown.intensity = 140 * fl * on;
          // Off until the descent reaches the gate; see the walk light.
          thrown.shadow.autoUpdate = thrown.intensity > 0;
        }
        const bulb = bulbMatRefs.current[i];
        if (bulb) bulb.emissiveIntensity = 3.4 * fl * on;
        const bm = beamMats[i];
        if (bm) bm.opacity = beam * fl;
      }
    },
    [beamMats, phases],
  );

  useNightUpdate('garden', 'gate', update);

  const woodPlate = useMemo(() => mat('wood', '#2a1a10'), []);

  return (
    <group position={[0, 0, 46]}>
      <pointLight
        ref={gateFillRef}
        color="#ffc98c"
        intensity={0}
        distance={90}
        decay={2}
        position={[0, 9, 10]}
      />

      {/* ------------------------------------------------------- pillars */}
      {[-1, 1].map((sx, side) => {
        const px = sx * 9;
        const lx = sx * 5.2;
        const ly = 12.6;
        const lz = 0.9;
        const bulb = bulbMats[side] as MeshStandardMaterial;
        const beam = beamMats[side] as SpriteMaterial;
        return (
          <group key={sx}>
            <mesh position={[px, 0.45, 0]} material={stoneDark}>
              <boxGeometry args={[4.6, 0.9, 4.6]} />
            </mesh>
            <mesh position={[px, 1.15, 0]} material={stone}>
              <boxGeometry args={[4.0, 0.5, 4.0]} />
            </mesh>
            <mesh
              position={[px, 8.2, 0]}
              rotation-y={Math.PI / 4}
              material={brickMat}
              castShadow={settings.shadows}
            >
              <cylinderGeometry args={[1.35, 1.65, 13.6, 4, 1]} />
            </mesh>
            <mesh position={[px, 2.2, 0]} rotation-y={Math.PI / 4} material={mossMat}>
              <cylinderGeometry args={[1.7, 1.78, 1.6, 4, 1]} />
            </mesh>
            <mesh position={[px, 17.0, 0]} material={brassMat}>
              <sphereGeometry args={[0.55, 16, 12]} />
            </mesh>

            {/* uplight washing the column */}
            <spotLight
              ref={(el) => {
                uplightRefs.current[side] = el;
              }}
              color="#ffb865"
              intensity={0}
              distance={24}
              angle={0.55}
              penumbra={0.8}
              decay={2}
              position={[px + sx * -2.4, 0.6, 2.6]}
            />
            <sprite
              material={uplightGlowMat}
              scale={[3.2, 9, 1]}
              position={[px + sx * -1.6, 5.5, 1.4]}
            />

            {/* ---------------------------------------------- lantern */}
            <mesh position={[lx, ly + 1.6, lz]} material={brassMat}>
              <cylinderGeometry args={[0.05, 0.05, 1.6, 8]} />
            </mesh>
            <mesh position={[lx, ly + 0.78, lz]} material={trim}>
              <boxGeometry args={[1.02, 0.16, 1.02]} />
            </mesh>
            <mesh position={[lx, ly - 0.78, lz]} material={trim}>
              <boxGeometry args={[1.06, 0.14, 1.06]} />
            </mesh>
            <mesh position={[lx, ly, lz]}>
              <boxGeometry args={[0.86, 1.4, 0.86]} />
              <meshPhysicalMaterial
                color="#ffe3bd"
                roughness={0.08}
                metalness={0}
                transparent
                opacity={0.22}
                transmission={0.85}
                thickness={0.3}
                envMapIntensity={1.2}
              />
            </mesh>
            <mesh position={[lx, ly, lz]} material={bulb}>
              <sphereGeometry args={[0.24, 18, 14]} />
            </mesh>
            <pointLight
              ref={(el) => {
                lampRefs.current[side] = el;
              }}
              color="#ffb347"
              intensity={0}
              distance={46}
              decay={2}
              position={[lx, ly, lz]}
            />
            <spotLight
              ref={(el) => {
                throwRefs.current[side] = el;
              }}
              color="#ffb347"
              intensity={0}
              distance={44}
              angle={0.72}
              penumbra={0.9}
              decay={2}
              position={[lx, ly - 0.3, lz]}
              // Only one lantern casts shadows - two would double the cost
              // for a difference nobody can see.
              castShadow={settings.shadows && sx > 0}
              shadow-mapSize-width={settings.shadowMapSize}
              shadow-mapSize-height={settings.shadowMapSize}
              shadow-bias={-0.0015}
            />
            {/* the beam only exists because of the fog */}
            <sprite
              material={beam}
              scale={[7, 13, 1]}
              position={[lx * 0.86, ly - 5.4, lz + 1.4]}
            />
          </group>
        );
      })}

      <mesh geometry={pillarDressing.dark} material={stoneDark} />
      <mesh geometry={pillarDressing.stone} material={stone} />
      <mesh geometry={pillarDressing.trim} material={trim} />

      {/* ---------------------------------------------------------- arch */}
      <mesh position={[0, ARCH_Y, 0]} material={ironMat} castShadow={settings.shadows}>
        <torusGeometry args={[ARCH_RADIUS, 0.55, 12, 40, Math.PI]} />
      </mesh>
      <mesh position={[0, ARCH_Y, 0]} material={ironMat}>
        <torusGeometry args={[6.9, 0.22, 10, 40, Math.PI]} />
      </mesh>
      <mesh geometry={archDressing.ribs} material={ironMat} />
      <mesh geometry={archDressing.beads} material={brassMat} />
      <mesh position={[0, ARCH_Y, 0]} material={ironMat}>
        <boxGeometry args={[18.4, 0.5, 0.5]} />
      </mesh>

      {/* shoulder scrollwork */}
      {[-1, 1].map((sx) => (
        <group key={`scroll${sx}`}>
          <mesh
            position={[sx * (ARCH_RADIUS - 1.6), ARCH_Y + 1.2, 0]}
            rotation-z={sx > 0 ? Math.PI : -Math.PI / 2}
            material={brassMat}
          >
            <torusGeometry args={[0.9, 0.12, 8, 24, Math.PI * 1.5]} />
          </mesh>
          <mesh
            position={[sx * (ARCH_RADIUS - 2.9), ARCH_Y + 2.6, 0]}
            rotation-z={sx > 0 ? -Math.PI / 2 : 0}
            material={brassMat}
          >
            <torusGeometry args={[0.5, 0.1, 8, 20, Math.PI * 1.5]} />
          </mesh>
        </group>
      ))}

      {/* ---------------------------------------------------- sign panel */}
      <group position={[0, SIGN_Y, 0]}>
        <mesh material={ironMat} castShadow={settings.shadows}>
          <boxGeometry args={[13.2, 4.0, 0.5]} />
        </mesh>
        <mesh material={brassMat}>
          <boxGeometry args={[12.8, 3.6, 0.56]} />
        </mesh>
        <mesh material={woodPlate}>
          <boxGeometry args={[12.6, 3.4, 0.62]} />
        </mesh>
        <mesh position={[0, 0, 0.36]}>
          <planeGeometry args={[12.2, 3.3]} />
          <meshStandardMaterial
            map={textures.gateSign}
            emissiveMap={textures.gateSign}
            emissive="#ffb84a"
            emissiveIntensity={1.6}
            transparent
            roughness={0.3}
            metalness={0.7}
            depthWrite={false}
          />
        </mesh>

        <instancedMesh
          ref={marqueeRef}
          args={[marqueeGeo, undefined, MARQUEE_BULBS * 2]}
        >
          <meshStandardMaterial
            color="#fff0c8"
            emissive="#ffcb6a"
            emissiveIntensity={2.2}
            roughness={0.4}
          />
        </instancedMesh>

        <sprite material={signHaloMat} scale={[SIGN_W + 6, SIGN_H + 5, 1]} position={[0, 0, -0.4]} />
        <pointLight color="#ffc477" intensity={60} distance={26} decay={2} position={[0, -1.2, 2.4]} />
      </group>

      {/* brass hanger posts */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`post${sx}`}
          position={[sx * 9, 16.8 + (SIGN_Y - 16.8) / 2, 0]}
          material={brassMat}
        >
          <cylinderGeometry args={[0.16, 0.2, SIGN_Y - 16.8, 10]} />
        </mesh>
      ))}
    </group>
  );
}
