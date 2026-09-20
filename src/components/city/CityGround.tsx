import { useMemo } from 'react';
import { BoxGeometry, PlaneGeometry } from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The ground plane, the road, its centre line and the kerbs.
 *
 * The 29 centre dashes were 29 separate meshes in the source. They never move
 * and share one material, so they are merged into a single geometry here -
 * one draw call instead of twenty-nine, for an identical picture.
 */
export function CityGround(): React.ReactElement {
  const dashes = useMemo(() => {
    const parts: BoxGeometry[] = [];
    for (let z = 44; z > -330; z -= 13) {
      const g = new BoxGeometry(0.5, 0.001, 4);
      g.translate(0, 0, z);
      parts.push(g);
    }
    const merged = BufferGeometryUtils.mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    return merged;
  }, []);

  const groundGeo = useMemo(() => new PlaneGeometry(1400, 1400), []);
  const streetGeo = useMemo(() => new PlaneGeometry(15, 620), []);

  return (
    <group>
      <mesh geometry={groundGeo} rotation-x={-Math.PI / 2} receiveShadow>
        <meshStandardMaterial color="#0b0c14" roughness={0.95} />
      </mesh>

      <mesh
        geometry={streetGeo}
        rotation-x={-Math.PI / 2}
        position={[0, 0.02, -170]}
        receiveShadow
      >
        <meshStandardMaterial color="#191a24" roughness={0.6} metalness={0.15} />
      </mesh>

      <mesh geometry={dashes} position={[0, 0.05, 0]}>
        <meshBasicMaterial color="#5a4a30" />
      </mesh>

      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 9, 0.14, -170]}>
          <boxGeometry args={[3, 0.28, 620]} />
          <meshStandardMaterial color="#22232e" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}
