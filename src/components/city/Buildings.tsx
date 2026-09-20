import { useLayoutEffect, useMemo, useRef } from 'react';
import { InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { useTextures } from '../../textures/TextureProvider';
import { WINDOW_TINTS } from '../../textures/jobs';
import { makeRandom } from '../../lib/math';

/** Instances per batch. Three batches, one per window tint. */
const CAPACITY = 150;

/**
 * The city skyline: three instanced batches, one per window tint, so the
 * blocks are not all the same colour temperature.
 *
 * Two exclusion zones keep the geometry honest — nothing is allowed to grow
 * across the main street, and nothing within 78 units of the gate, which is
 * what keeps the garden an open clearing rather than a courtyard.
 *
 * Each batch takes two different window canvases for `map` and `emissiveMap`.
 * That mismatch is deliberate: the lit cells do not line up with the emissive
 * ones, so windows shimmer slightly against their own glow and read as
 * occupied flats rather than a printed texture.
 */
export function Buildings(): React.ReactElement {
  const textures = useTextures();
  const refs = useRef<(InstancedMesh | null)[]>([]);

  const materials = useMemo(
    () =>
      WINDOW_TINTS.map((_, i) => {
        const map = textures.windows[i * 2];
        const emissiveMap = textures.windows[i * 2 + 1];
        return new MeshStandardMaterial({
          color: '#1b1c26',
          roughness: 0.72,
          ...(map ? { map } : {}),
          ...(emissiveMap ? { emissiveMap } : {}),
          emissive: '#ffffff',
          emissiveIntensity: 1.15,
        });
      }),
    [textures.windows],
  );

  useLayoutEffect(() => {
    const rand = makeRandom(0xc17ba5);
    const dummy = new Object3D();
    const counts = [0, 0, 0];

    for (let gx = -8; gx <= 8; gx++) {
      for (let gz = -16; gz <= 8; gz++) {
        const x = gx * 22 + (rand() - 0.5) * 6;
        const z = gz * 22 - 30 + (rand() - 0.5) * 6;

        // Keep the main street clear all the way down.
        if (Math.abs(x) < 13 && z > -340 && z < 60) continue;
        // Keep the gate garden an open clearing.
        if (z > -62 && Math.sqrt(x * x + (z - 46) * (z - 46)) < 78) continue;

        const b = Math.floor(rand() * 3);
        const count = counts[b] as number;
        if (count >= CAPACITY) continue;

        // Taller downtown core, lower outskirts.
        const h = 8 + rand() * (Math.abs(x) < 60 ? 34 : 18);
        const w = 7 + rand() * 8;
        const d = 7 + rand() * 8;

        dummy.position.set(x, h / 2, z);
        dummy.scale.set(w, h, d);
        dummy.rotation.set(0, (rand() - 0.5) * 0.4, 0);
        dummy.updateMatrix();

        refs.current[b]?.setMatrixAt(count, dummy.matrix);
        counts[b] = count + 1;
      }
    }

    refs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.count = counts[i] as number;
      mesh.instanceMatrix.needsUpdate = true;
      // The skyline never moves.
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
    });
  }, []);

  return (
    <group>
      {materials.map((material, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          args={[undefined, undefined, CAPACITY]}
          material={material}
          frustumCulled
        >
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      ))}
    </group>
  );
}
