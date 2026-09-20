import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Object3D,
  SphereGeometry,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three';
import { createWindMaterial, type WindUniforms } from '../../shaders/wind';
import { makeRandom } from '../../lib/math';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';

interface Species {
  readonly name: string;
  readonly count: number;
  readonly petal: string;
  readonly core: string;
  /** Stem height range. */
  readonly height: readonly [number, number];
  readonly headRadius: number;
}

const SPECIES: readonly Species[] = [
  { name: 'sunflower', count: 260, petal: '#f7b32b', core: '#5a3a1a', height: [1.5, 2.4], headRadius: 0.34 },
  { name: 'marigold', count: 340, petal: '#ff8c34', core: '#c25a12', height: [0.7, 1.1], headRadius: 0.2 },
  { name: 'rose', count: 300, petal: '#e8628a', core: '#a83a5c', height: [0.8, 1.3], headRadius: 0.2 },
  { name: 'tulip', count: 300, petal: '#ffb3c7', core: '#e07d9a', height: [0.9, 1.4], headRadius: 0.18 },
  { name: 'lavender', count: 420, petal: '#9d7bd8', core: '#7a5cb8', height: [0.6, 1.0], headRadius: 0.12 },
];

/**
 * Where flowers are allowed to grow: two broad borders either side of the
 * brick path, following its S-curve, stopping short of the lawn edge. The
 * 4.6-unit inner margin is what keeps the path walkable rather than
 * overgrown.
 */
export function inBed(x: number, z: number): boolean {
  if (z < 44 || z > 96) return false;
  const t = Math.min(1, Math.max(0, (92 - z) / 44));
  const cx = Math.sin(t * Math.PI) * 3.4;
  const d = Math.abs(x - cx);
  return d > 4.6 && d < 30;
}

function headGeometry(sp: Species): BufferGeometry {
  if (sp.name === 'lavender') return new ConeGeometry(sp.headRadius, 0.5, 7);
  // A tulip is an open cup, not a ball - the partial sphere is the whole tell.
  if (sp.name === 'tulip') {
    return new SphereGeometry(sp.headRadius, 9, 7, 0, 6.3, 0, 1.9);
  }
  return new SphereGeometry(sp.headRadius, 10, 8);
}

interface Batch {
  readonly species: Species;
  readonly stems: BufferGeometry;
  readonly heads: BufferGeometry;
  readonly cores: BufferGeometry;
  readonly leaves: BufferGeometry;
  readonly stemMat: MeshStandardMaterial;
  readonly petalMat: MeshStandardMaterial;
  readonly coreMat: MeshStandardMaterial;
  readonly count: number;
}

/**
 * Five species of flower, each a set of four instanced batches - stem, head,
 * core and a leaf.
 *
 * Every batch uses the shared wind material, so the whole bed sways from two
 * numbers written once a frame, and all sixteen materials compile to a single
 * program. Placement is rejection-sampled against `inBed`, which is why the
 * beds hug the path instead of tiling a rectangle.
 */
export function FlowerBeds({ uniforms }: { uniforms: WindUniforms }): React.ReactElement {
  const quality = useUIStore((s) => s.quality);
  const scale = QUALITY[quality].flowerScale;
  const refs = useRef<Record<string, (InstancedMesh | null)[]>>({});

  const batches = useMemo<Batch[]>(
    () =>
      SPECIES.map((sp) => {
        const stemMat = createWindMaterial(uniforms, { color: '#3f6b34' });
        return {
          species: sp,
          count: Math.max(1, Math.round(sp.count * scale)),
          stems: new CylinderGeometry(0.03, 0.045, 1, 5),
          heads: headGeometry(sp),
          cores: new SphereGeometry(sp.headRadius * 0.42, 8, 6),
          leaves: new SphereGeometry(0.16, 7, 5),
          stemMat,
          petalMat: createWindMaterial(uniforms, { color: sp.petal }),
          coreMat: createWindMaterial(uniforms, { color: sp.core }),
        };
      }),
    [uniforms, scale],
  );

  useLayoutEffect(() => {
    const dummy = new Object3D();

    batches.forEach((batch, bi) => {
      const rand = makeRandom(0xb100 + bi * 7717);
      const slots = refs.current[batch.species.name];
      if (!slots) return;
      const [stems, heads, cores, leaves] = slots;

      let placed = 0;
      let guard = 0;
      const limit = batch.count * 40;

      while (placed < batch.count && guard++ < limit) {
        const x = (rand() - 0.5) * 62;
        const z = 44 + rand() * 52;
        if (!inBed(x, z)) continue;

        const h = batch.species.height[0] + rand() * (batch.species.height[1] - batch.species.height[0]);
        const s = 0.85 + rand() * 0.35;
        const yaw = rand() * 6.28;
        const tilt = (rand() - 0.5) * 0.22;

        dummy.position.set(x, h / 2, z);
        dummy.rotation.set(tilt, yaw, tilt * 0.6);
        dummy.scale.set(s, h, s);
        dummy.updateMatrix();
        stems?.setMatrixAt(placed, dummy.matrix);

        // Tulips look up; everything else nods over.
        dummy.position.set(x, h + 0.04, z);
        dummy.rotation.set(batch.species.name === 'tulip' ? 0.1 : 0.6, yaw, tilt);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        heads?.setMatrixAt(placed, dummy.matrix);

        dummy.position.set(x, h + 0.1, z + 0.06);
        dummy.updateMatrix();
        cores?.setMatrixAt(placed, dummy.matrix);

        dummy.position.set(x + Math.cos(yaw) * 0.18, h * 0.42, z + Math.sin(yaw) * 0.18);
        dummy.rotation.set(0.4, yaw, 0.3);
        dummy.scale.set(s * 1.5, s * 0.4, s * 0.9);
        dummy.updateMatrix();
        leaves?.setMatrixAt(placed, dummy.matrix);

        placed++;
      }

      for (const mesh of slots) {
        if (!mesh) continue;
        mesh.count = placed;
        mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }, [batches]);

  return (
    <group>
      {batches.map((batch) => {
        refs.current[batch.species.name] ??= [null, null, null, null];
        const slots = refs.current[batch.species.name] as (InstancedMesh | null)[];
        const parts = [
          { geo: batch.stems, mat: batch.stemMat },
          { geo: batch.heads, mat: batch.petalMat },
          { geo: batch.cores, mat: batch.coreMat },
          { geo: batch.leaves, mat: batch.stemMat },
        ];
        return (
          <group key={batch.species.name}>
            {parts.map((part, pi) => (
              <instancedMesh
                key={pi}
                ref={(el) => {
                  slots[pi] = el;
                }}
                args={[part.geo, part.mat, batch.count]}
                castShadow={false}
                receiveShadow={false}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}
