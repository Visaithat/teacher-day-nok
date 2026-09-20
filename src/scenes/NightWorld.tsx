import { useCallback, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, DirectionalLight, FogExp2, PointLight, SpotLight } from 'three';
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
import { GATES, MOUNT } from '../config/timeline';
import { useUpdate } from '../lib/updateBus';
import { useScrollWindow } from '../hooks/useScrollWindow';
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
    }
  }, []);

  useUpdate('world', update);

  // The sky is behind the camera once the descent finishes; unmounting it
  // frees 11,000 points and a 160-segment moon for the rest of the film.
  const showSky = useScrollWindow(MOUNT.sky);
  // The garden and gate are behind the camera once it is down the street.
  const showGarden = useScrollWindow(MOUNT.gardenAndGate);
  // The students exist only for their stretch of the street.
  const showStreet = useScrollWindow(MOUNT.street);

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

      {showSky && (
        <>
          <Stars />
          <Moon />
          <ShootingStars />
        </>
      )}
      <CloudLayers />

      <CityGround />
      <Buildings />
      <Streetlamps />

      {showGarden && (
        <>
          <Garden />
          <Gate />
          <MusicBox />
        </>
      )}

      {showStreet && <StudentRow />}

      <GroundFog />
      <Fireflies />
    </>
  );
}
