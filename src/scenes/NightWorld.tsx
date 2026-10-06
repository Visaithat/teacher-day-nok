import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, DirectionalLight, FogExp2, Group, PointLight, SpotLight } from 'three';
import { Stars } from '../components/sky/Stars';
import { Moon } from '../components/sky/Moon';
import { ShootingStars } from '../components/sky/ShootingStars';
import { CloudLayers } from '../components/sky/CloudLayers';
import { CityGround } from '../components/city/CityGround';
import { Buildings } from '../components/city/Buildings';
import { Streetlamps } from '../components/city/Streetlamps';
import { Garden } from '../components/garden/Garden';
import { Gate } from '../components/gate/Gate';
import { MusicBox } from '../components/musicbox/MusicBox';
import { StudentRow } from '../components/students/StudentRow';
import { GroundFog } from '../components/fx/GroundFog';
import { Fireflies } from '../components/fx/Fireflies';
import { NightEnvironment } from './NightEnvironment';
import { GATES } from '../config/timeline';
import { useNightUpdate, useNightVisibility } from './nightVisibility';
import { QUALITY } from '../config/quality';
import { useUIStore } from '../state/useUIStore';
import type { FrameState } from '../state/frame';

/**
 * Scenes 2 to 6 — the night. Everything from the sky the film opens on down
 * to the street it walks along.
 *
 * The lighting here is almost all fake. There are exactly two real lights
 * that matter: the moon, and a spot that travels with the camera down the
 * street. Everything else — streetlamps, gate lanterns, lit windows — is
 * emissive geometry plus additive halos, and the bloom pass turns it into
 * light. That is the only way a city block of lamps runs at frame rate.
 */
export function NightWorld(): React.ReactElement {
  const scene = useThree((s) => s.scene);
  const quality = useUIStore((s) => s.quality);
  const settings = QUALITY[quality];

  const cityAmbRef = useRef<PointLight>(null);
  const moonLightRef = useRef<DirectionalLight>(null);
  const walkLightRef = useRef<SpotLight>(null);

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    scene.background = new Color('#04050c');
    // Exponential fog, very thin: it is doing depth cueing down a long street
    // rather than weather.
    scene.fog = new FogExp2('#05060e', 0.0042);
    return () => {
      scene.background = previousBackground;
      scene.fog = previousFog;
    };
  }, [scene]);

  // The walking spot needs a target object in the scene to aim at.
  useEffect(() => {
    const light = walkLightRef.current;
    if (!light) return;
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [scene]);

  // The update below stops the walk light's shadow map refreshing while the
  // light is dark, which it is from boot. One forced pass here allocates the
  // map up front, so the frame the light comes on is not also the frame its
  // render target is created.
  useEffect(() => {
    const light = walkLightRef.current;
    if (light && settings.shadows) light.shadow.needsUpdate = true;
  }, [settings.shadows]);

  const update = useCallback((f: FrameState) => {
    const { p } = f;

    if (cityAmbRef.current) cityAmbRef.current.intensity = GATES.cityAmbient(p);
    if (moonLightRef.current) moonLightRef.current.intensity = GATES.moonLight(p);

    const walk = walkLightRef.current;
    if (walk) {
      // Rides just ahead of the camera so whoever we are passing is lit.
      const z = f.cameraZ;
      walk.position.set(0, 15, z - 9);
      walk.target.position.set(0, 0, z - 15);
      walk.target.updateMatrixWorld();
      walk.intensity = GATES.walkLight(p);
      // Dark until the street and again after it, and a light that adds
      // nothing has no use for a fresh shadow map. Not `castShadow`: that is
      // part of every lit material's program key, and flipping it would
      // recompile the scene.
      walk.shadow.autoUpdate = walk.intensity > 0;
    }
  }, []);

  useNightUpdate('night', 'world', update);

  // Three parts of the night are only on stage for a stretch of the scroll:
  // the sky is behind the camera once the descent finishes, the garden and
  // gate once it is down the street, and the students exist only for their
  // stretch of it. All three are built here, once, and hidden outside their
  // windows - see `nightVisibility` for why they are no longer unmounted.
  const skyRef = useRef<Group>(null);
  const gardenRef = useRef<Group>(null);
  const streetRef = useRef<Group>(null);
  const groups = useMemo(() => ({ sky: skyRef, garden: gardenRef, street: streetRef }), []);
  useNightVisibility(groups);

  return (
    <>
      <NightEnvironment />

      <hemisphereLight args={['#8aa6ff', '#1a1206', 0.32]} />
      <directionalLight
        ref={moonLightRef}
        color="#c9d8ff"
        intensity={1.05}
        position={[-90, 200, -160]}
      />
      <pointLight
        ref={cityAmbRef}
        color="#ffb066"
        intensity={0}
        distance={260}
        position={[0, 26, 0]}
      />
      <spotLight
        ref={walkLightRef}
        color="#ffd2a4"
        intensity={0}
        distance={70}
        angle={0.95}
        penumbra={0.75}
        decay={1.4}
        position={[0, 15, 0]}
        castShadow={settings.shadows}
        shadow-mapSize-width={settings.shadowMapSize}
        shadow-mapSize-height={settings.shadowMapSize}
        shadow-bias={-0.0012}
        shadow-camera-near={2}
        shadow-camera-far={60}
      />

      <group ref={skyRef}>
        <Stars />
        <Moon />
        <ShootingStars />
      </group>
      <CloudLayers />

      <CityGround />
      <Buildings />
      <Streetlamps />

      <group ref={gardenRef}>
        <Garden />
        <Gate />
        <MusicBox />
      </group>

      <group ref={streetRef}>
        <StudentRow />
      </group>

      <GroundFog />
      <Fireflies />
    </>
  );
}
