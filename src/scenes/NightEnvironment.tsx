import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { EquirectangularReflectionMapping, PMREMGenerator } from 'three';
import { useTextures } from '../textures/TextureProvider';

/**
 * The night sky as an environment map.
 *
 * Every PBR surface in the world — brass on the gate, the pond, the lacquer
 * on a sign board — reflects this. It is a painted equirectangular canvas
 * rather than a captured HDRI: a sky gradient, the orange sodium wash of the
 * city along the horizon, scattered lit windows and the moon. Cheap, and it
 * matches the scene it is meant to be reflecting exactly, which a stock HDRI
 * never would.
 */
export function NightEnvironment(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const textures = useTextures();

  useEffect(() => {
    try {
      const source = textures.nightEnv;
      source.mapping = EquirectangularReflectionMapping;

      const pmrem = new PMREMGenerator(gl);
      const target = pmrem.fromEquirectangular(source);
      scene.environment = target.texture;
      scene.environmentIntensity = 0.55;
      pmrem.dispose();

      return () => {
        scene.environment = null;
        target.dispose();
      };
    } catch (err) {
      console.warn('env map unavailable', err);
      return;
    }
  }, [gl, scene, textures.nightEnv]);

  return null;
}
