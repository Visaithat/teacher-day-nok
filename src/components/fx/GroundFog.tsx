import { useCallback, useMemo, useRef } from 'react';
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { useTextures } from '../../textures/TextureProvider';
import { GATES } from '../../config/timeline';
import { makeRandom } from '../../lib/math';
import { useUpdate } from '../../lib/updateBus';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import type { FrameState } from '../../state/frame';

/**
 * Low fog lying across the garden and the gate.
 *
 * A handful of big soft planes drifting sideways past each other at different
 * rates. They are what make the lantern beams visible at all - without
 * something in the air, a light cone has nothing to catch on.
 */
export function GroundFog(): React.ReactElement {
  const textures = useTextures();
  const quality = useUIStore((s) => s.quality);
  const count = QUALITY[quality].groundFogPlanes;

  const planes = useMemo(() => {
    const rand = makeRandom(0xf0611);
    return Array.from({ length: count }, (_, i) => ({
      x: (rand() - 0.5) * 40,
      y: 0.35 + rand() * 0.7,
      z: 40 - i * 26,
      speed: 0.5 + rand(),
    }));
  }, [count]);

  const geometry = useMemo(() => new PlaneGeometry(80, 80), []);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: textures.fog,
        color: '#e2c9a4',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [textures.fog],
  );

  const groupRef = useRef<Group>(null);

  const update = useCallback(
    (f: FrameState) => {
      material.opacity = GATES.groundFog(f.p);
      const group = groupRef.current;
      if (!group) return;
      for (let i = 0; i < group.children.length; i++) {
        const plane = group.children[i] as Mesh | undefined;
        const spec = planes[i];
        if (!plane || !spec) continue;
        plane.position.x = Math.sin(f.time * 0.09 * spec.speed + i) * 18;
      }
    },
    [material, planes],
  );

  useUpdate('world', update);

  return (
    <group ref={groupRef}>
      {planes.map((p, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          rotation-x={-Math.PI / 2}
          position={[p.x, p.y, p.z]}
        />
      ))}
    </group>
  );
}
