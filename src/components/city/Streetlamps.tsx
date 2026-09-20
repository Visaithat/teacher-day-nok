import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  InstancedMesh,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
} from 'three';
import { useTextures } from '../../textures/TextureProvider';

/** Lamp posts every 18 units, both sides, down the whole street. */
function lampPositions(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let z = 46; z > -320; z -= 18) {
    for (const sx of [-1, 1]) out.push({ x: sx * 8.6, z });
  }
  return out;
}

/**
 * Streetlamps: post, glowing head, and a soft halo.
 *
 * There are no real lights here at all - forty-two point lights down a street
 * would be ruinous. The heads are emissive and the halos additive, and the
 * bloom pass turns them into light. It reads identically and costs nothing.
 *
 * The source built three meshes per lamp (126 draw calls); posts and heads are
 * instanced here, and the halos collapse into a single Points field.
 */
export function Streetlamps(): React.ReactElement {
  const textures = useTextures();
  const positions = useMemo(lampPositions, []);
  const poleRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const haloRef = useRef<Points>(null);

  const poleGeo = useMemo(() => new CylinderGeometry(0.16, 0.22, 7, 8), []);
  const headGeo = useMemo(() => new SphereGeometry(0.42, 14, 14), []);

  const haloGeo = useMemo(() => {
    const arr = new Float32Array(positions.length * 3);
    positions.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = 7.2;
      arr[i * 3 + 2] = p.z;
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(arr, 3));
    return g;
  }, [positions]);

  const haloMat = useMemo(
    () =>
      new PointsMaterial({
        map: textures.glow,
        color: new Color('#ffb265'),
        transparent: true,
        opacity: 0.22,
        blending: AdditiveBlending,
        depthWrite: false,
        size: 4.6,
        sizeAttenuation: true,
      }),
    [textures.glow],
  );

  useLayoutEffect(() => {
    const dummy = new Object3D();
    positions.forEach((p, i) => {
      dummy.position.set(p.x, 3.5, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleRef.current?.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, 7.2, p.z);
      dummy.updateMatrix();
      headRef.current?.setMatrixAt(i, dummy.matrix);
    });

    for (const mesh of [poleRef.current, headRef.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
    }
    if (haloRef.current) {
      haloRef.current.matrixAutoUpdate = false;
      haloRef.current.updateMatrix();
    }
  }, [positions]);

  return (
    <group>
      <instancedMesh
        ref={poleRef}
        args={[poleGeo, undefined, positions.length]}
        frustumCulled
      >
        <meshStandardMaterial color="#2b2b36" roughness={0.7} />
      </instancedMesh>

      <instancedMesh
        ref={headRef}
        args={[headGeo, undefined, positions.length]}
        frustumCulled
      >
        <meshStandardMaterial
          color="#ffca82"
          emissive="#ffb45e"
          emissiveIntensity={1.5}
          roughness={0.4}
        />
      </instancedMesh>

      <points ref={haloRef} geometry={haloGeo} material={haloMat} frustumCulled={false} />
    </group>
  );
}
