import type { Mesh, Object3D } from 'three';
import { Mesh as ThreeMesh } from 'three';
import { P, bevelBox, surf } from './proportions';
import type { StudentConfig } from '../../config/students';

const TOP = P.headS / 2;

/**
 * Hair, built as clumps of shrunken boxes parented to the head.
 *
 * Three styles, each a different silhouette rather than a different texture:
 * a swept spiky cut, long waves, and the little that shows under a headwrap.
 * The tip colour is used on the outermost clumps only, so the ends catch
 * light differently from the mass — that is most of what sells it.
 */
export function buildHair(head: Object3D, s: StudentConfig): Mesh[] {
  const hairMat = surf('hair', s.hair);
  const tipMat = surf('hair', s.hairTip ?? s.hair);
  const out: Mesh[] = [];

  const clump = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
    material = hairMat,
  ): Mesh => {
    const mesh = new ThreeMesh(bevelBox(w, h, d, 0.07), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    head.add(mesh);
    out.push(mesh);
    return mesh;
  };

  const style = s.hairStyle;

  if (style === 'longWavy') {
    clump(0, TOP - 0.02, -0.02, P.headS + 0.16, 0.34, P.headS + 0.16);
    clump(0, TOP + 0.08, -0.06, P.headS + 0.02, 0.2, P.headS + 0.06, -0.06);
    for (const sx of [-1, 1]) {
      // centre-parted fringe
      clump(sx * 0.2, TOP - 0.04, 0.4, 0.34, 0.3, 0.16, 0, 0, sx * 0.34);
      // the waves themselves, alternating the tilt down the length
      for (let k = 0; k < 4; k++) {
        clump(
          sx * (0.44 + (k % 2) * 0.05),
          TOP - 0.34 - k * 0.42,
          0.06 - (k % 2) * 0.1,
          0.28,
          0.5,
          0.34,
          0,
          0,
          sx * (k % 2 ? 0.12 : -0.1),
        );
      }
    }
    clump(0, TOP - 0.6, -0.3, P.headS + 0.06, 1.0, 0.34, 0.08);
    clump(0, TOP - 1.24, -0.24, 0.66, 0.5, 0.3, 0.14);
    return out;
  }

  if (style === 'wrapHair') {
    // Only what escapes the headwrap.
    for (const sx of [-1, 1]) {
      clump(sx * 0.4, TOP - 0.3, 0.16, 0.16, 0.5, 0.4, 0, 0, sx * 0.06);
      clump(sx * 0.3, TOP - 0.62, -0.2, 0.3, 0.4, 0.36, 0.1);
    }
    clump(0, TOP - 0.5, -0.34, 0.7, 0.6, 0.26, 0.1);
    clump(0, TOP - 0.06, 0.38, 0.6, 0.18, 0.14, 0.2, 0, 0.04);
    return out;
  }

  // spikySwept
  clump(0, TOP - 0.04, -0.01, P.headS + 0.2, 0.42, P.headS + 0.2);
  clump(0.03, TOP + 0.17, -0.03, P.headS + 0.08, 0.3, P.headS + 0.08, -0.04, 0, 0.03);

  // fringe: five clumps sweeping across the brow, the last one tipped
  const fringe: readonly (readonly [number, number])[] = [
    [-0.3, -0.5],
    [-0.12, -0.34],
    [0.08, -0.16],
    [0.26, 0.1],
    [0.4, 0.32],
  ];
  fringe.forEach(([fx, roll], k) => {
    clump(
      fx,
      TOP - 0.06 + (k % 2) * 0.03,
      0.42 - Math.abs(fx) * 0.12,
      0.3,
      0.24 + (k % 2) * 0.06,
      0.2,
      -0.2,
      0,
      roll,
      k === 4 ? tipMat : hairMat,
    );
  });

  for (const sx of [-1, 1]) {
    clump(sx * 0.44, TOP - 0.1, 0.2, 0.16, 0.34, 0.4, 0, 0, sx * 0.2);
    clump(sx * 0.42, TOP - 0.34, 0.06, 0.12, 0.22, 0.3, 0, 0, sx * 0.1);
  }
  clump(0, TOP - 0.2, -0.42, P.headS, 0.5, 0.24, 0.1);

  // The spikes on top, in the tip colour and stretched slightly.
  const spikes: readonly (readonly [number, number])[] = [
    [-0.28, -0.14],
    [-0.06, 0.06],
    [0.18, -0.2],
    [0.34, 0.16],
    [-0.36, 0.2],
    [0.06, -0.36],
  ];
  spikes.forEach(([sx2, sz], k) => {
    const c = clump(sx2, TOP + 0.2, sz, 0.2, 0.26, 0.18, -0.3 + (k % 3) * 0.2, 0, sx2 * 0.9, tipMat);
    c.scale.set(1, 1 + (k % 2) * 0.25, 1);
  });

  return out;
}
