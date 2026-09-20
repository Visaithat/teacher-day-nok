import {
  CylinderGeometry,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from 'three';
import { P, bevelBox, surf } from './proportions';
import type { BlockyRig } from './blockyRig';
import type { StudentConfig } from '../../config/students';

const { torsoW: TW, torsoH: TH, torsoD: TD, armT, uArm, lArm, legT, uLeg, lLeg } = P;

type Put = (
  parent: Object3D,
  w: number,
  h: number,
  d: number,
  m: Material,
  x: number,
  y: number,
  z: number,
  rx?: number,
  ry?: number,
  rz?: number,
  r?: number,
) => Mesh;

/**
 * Dress a figure.
 *
 * Clothing here is geometry, not texture: a jacket is a slightly larger box
 * around the torso, a collar is two angled slabs, a sash is a band with two
 * hanging ties. That is why the outfits read at a distance and still hold up
 * in the close-up the camera pushes into.
 *
 * Every outfit finishes with `jointAO`, a set of thin near-black rings at the
 * shoulders, elbows and knees. They are the one thing keeping the limbs from
 * melting into the torso under the street's low, warm light.
 */
export function clothe(rig: BlockyRig, s: StudentConfig): Mesh[] {
  const out: Mesh[] = [];
  const { upper, arms, legs } = rig;
  const seam = surf('seam', '#0b0b0e');

  const put: Put = (parent, w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.05) => {
    const mesh = new Mesh(bevelBox(w, h, d, r), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    out.push(mesh);
    return mesh;
  };

  const add = (parent: Object3D, mesh: Mesh): Mesh => {
    parent.add(mesh);
    out.push(mesh);
    return mesh;
  };

  const jointAO = (): void => {
    for (const side of ['L', 'R'] as const) {
      put(arms[`sh${side}`], armT + 0.03, 0.05, armT + 0.03, seam, 0, -0.02, 0, 0, 0, 0, 0.02);
      put(arms[`el${side}`], armT + 0.02, 0.05, armT + 0.02, seam, 0, 0.01, 0, 0, 0, 0, 0.02);
      const leg = legs[side];
      put(leg, legT + 0.03, 0.05, legT + 0.03, seam, 0, -0.01, 0, 0, 0, 0, 0.02);
      put(leg, legT + 0.02, 0.05, legT + 0.02, seam, 0, -uLeg, 0, 0, 0, 0, 0.02);
    }
  };

  switch (s.outfit) {
    case 'leather': {
      const jacket = surf('leather', '#17161a');
      const shirt = surf('fabric', '#111013');
      const metal = surf('metal', '#b9bec6');
      const rubber = surf('rubber', '#f4f4f2');
      const trouser = surf('fabric', '#131216');

      put(upper, TW + 0.1, TH - 0.06, TD + 0.1, jacket, 0, TH / 2 + 0.02, 0, 0, 0, 0, 0.07);
      put(upper, 0.52, TH - 0.16, TD * 0.6, shirt, 0, TH / 2, TD * 0.24, 0, 0, 0, 0.04);
      for (let k = 0; k < 4; k++) {
        put(upper, 0.05, 0.05, 0.04, metal, 0, TH * 0.82 - k * 0.22, TD * 0.55, 0, 0, 0, 0.01);
      }
      for (const sx of [-1, 1]) {
        put(upper, 0.34, TH - 0.1, 0.1, jacket, sx * 0.34, TH / 2, TD / 2 + 0.06, 0, sx * -0.16, 0, 0.04);
        put(upper, 0.3, 0.34, 0.11, jacket, sx * 0.3, TH - 0.16, TD / 2 + 0.09, 0.1, sx * -0.2, sx * 0.5, 0.04);
        put(upper, 0.26, 0.24, 0.14, jacket, sx * 0.26, TH - 0.02, TD / 2 + 0.02, 0.2, 0, sx * 0.4, 0.04);
        put(upper, 0.24, 0.03, 0.03, seam, sx * 0.36, TH * 0.42, TD / 2 + 0.11, 0, 0, sx * 0.18, 0.01);

        const cord = new Mesh(new CylinderGeometry(0.022, 0.022, 0.46, 6), shirt);
        cord.position.set(sx * 0.17, TH * 0.62, TD / 2 + 0.1);
        cord.castShadow = false;
        add(upper, cord);
        const aglet = new Mesh(new SphereGeometry(0.035, 8, 6), metal);
        aglet.position.set(sx * 0.17, TH * 0.62 - 0.25, TD / 2 + 0.1);
        add(upper, aglet);
      }
      put(upper, 0.72, 0.2, 0.5, jacket, 0, TH + 0.02, -0.02, 0.16, 0, 0, 0.05);
      put(upper, TW + 0.14, 0.15, TD + 0.14, surf('leather', '#0e0d10'), 0, 0.07, 0, 0, 0, 0, 0.03);
      put(upper, 0.2, 0.16, 0.07, metal, 0, 0.07, TD / 2 + 0.09, 0, 0, 0, 0.02);

      for (const side of ['L', 'R'] as const) {
        put(arms[`sh${side}`], armT + 0.07, uArm + 0.04, armT + 0.07, jacket, 0, -uArm / 2, 0, 0, 0, 0, 0.07);
        put(arms[`el${side}`], armT + 0.03, lArm - 0.14, armT + 0.03, jacket, 0, -(lArm - 0.14) / 2, 0, 0, 0, 0, 0.06);
      }

      for (const side of ['L', 'R'] as const) {
        const leg = legs[side];
        put(leg, legT + 0.14, uLeg + 0.02, legT + 0.12, trouser, 0, -uLeg / 2, 0);
        put(leg, legT + 0.16, lLeg, legT + 0.14, trouser, 0, -uLeg - lLeg / 2, 0.01);
        put(leg, legT + 0.18, 0.04, legT + 0.16, seam, 0, -uLeg - 0.06, 0.01, 0, 0, 0, 0.01);
        put(leg, legT + 0.06, 0.2, 0.74, rubber, 0, -uLeg - lLeg - 0.06, 0.1);
        put(leg, legT + 0.1, 0.09, 0.78, rubber, 0, -uLeg - lLeg - 0.17, 0.1);
        for (let q = 0; q < 3; q++) {
          put(leg, 0.26, 0.045, 0.05, rubber, 0, -uLeg - lLeg - 0.02 + q * 0.07, 0.4, 0, 0, 0, 0.01);
        }
      }

      // A beaded bracelet on the right wrist, and a small pendant.
      const beadMat = surf('fabric', '#16161c');
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const bead = new Mesh(new SphereGeometry(0.045, 8, 6), beadMat);
        bead.position.set(
          Math.cos(a) * (armT / 2 + 0.02),
          -lArm + 0.06,
          Math.sin(a) * (armT / 2 + 0.02),
        );
        bead.castShadow = false;
        add(arms.elR, bead);
      }
      put(arms.elR, 0.04, 0.13, 0.02, metal, 0, -lArm - 0.04, armT / 2 + 0.04, 0, 0, 0, 0.01);
      put(arms.elR, 0.09, 0.04, 0.02, metal, 0, -lArm - 0.01, armT / 2 + 0.04, 0, 0, 0, 0.01);
      break;
    }

    case 'robeRed':
    case 'robeGold': {
      const gold = s.outfit === 'robeGold';
      const robe = surf('silk', '#1a191e');
      const trimM = surf('silk', gold ? '#d8ab52' : '#b3242b');
      const sashM = surf('fabric', gold ? '#c69a45' : '#a81f28');

      put(upper, TW + 0.12, TH - 0.04, TD + 0.12, robe, 0, TH / 2 + 0.02, 0, 0, 0, 0, 0.07);
      for (const sx of [-1, 1]) {
        // The crossed collar is the whole read of the garment.
        put(upper, 0.42, 0.9, 0.12, robe, sx * 0.24, TH * 0.62, TD / 2 + 0.07, 0, 0, sx * 0.34, 0.04);
        put(upper, 0.13, 0.92, 0.13, trimM, sx * 0.42, TH * 0.62, TD / 2 + 0.08, 0, 0, sx * 0.34, 0.03);
        put(upper, 0.1, 0.62, 0.05, sashM, sx * 0.12, -0.2, TD / 2 + 0.1, 0.06, 0, sx * 0.06, 0.02);
        put(upper, 0.14, 0.16, 0.06, sashM, sx * 0.2, 0.06, TD / 2 + 0.12, 0, 0, sx * 0.7, 0.03);
      }
      put(upper, 0.3, 0.16, 0.5, robe, 0, TH + 0.02, -0.04, 0.14, 0, 0, 0.05);
      put(upper, TW + 0.16, 0.2, TD + 0.16, sashM, 0, 0.12, 0);

      for (const side of ['L', 'R'] as const) {
        put(arms[`sh${side}`], armT + 0.1, uArm + 0.02, armT + 0.09, robe, 0, -uArm / 2, 0, 0, 0, 0, 0.07);
        put(arms[`el${side}`], armT + 0.05, lArm - 0.16, armT + 0.05, robe, 0, -(lArm - 0.16) / 2, 0, 0, 0, 0, 0.07);
        put(arms[`el${side}`], armT + 0.06, 0.07, armT + 0.06, trimM, 0, -(lArm - 0.14), 0, 0, 0, 0, 0.03);
      }

      for (const side of ['L', 'R'] as const) {
        const leg = legs[side];
        put(leg, legT + 0.2, uLeg + 0.5, legT + 0.18, robe, 0, -uLeg / 2 - 0.2, 0, 0, 0, 0, 0.06);
        put(leg, legT + 0.16, lLeg - 0.1, legT + 0.16, surf('fabric', '#151419'), 0, -uLeg - lLeg / 2 - 0.06, 0);
        if (gold) {
          put(leg, legT + 0.22, 0.06, legT + 0.2, trimM, 0, 0.04, 0, 0, 0, 0, 0.02);
          put(leg, legT + 0.18, lLeg, 0.06, seam, 0, -uLeg - lLeg / 2, legT / 2 + 0.09, 0, 0, 0, 0.01);
          put(leg, legT + 0.04, 0.2, 0.66, surf('fabric', '#0f0e12'), 0, -uLeg - lLeg - 0.06, 0.08);
        } else {
          // Barefoot: the artist works standing in his studio.
          put(leg, legT, 0.2, 0.62, surf('skin', s.skin), 0, -uLeg - lLeg - 0.06, 0.08);
          for (let q = 0; q < 4; q++) {
            put(leg, 0.1, 0.09, 0.1, surf('skin', s.skin), -0.18 + q * 0.12, -uLeg - lLeg - 0.04, 0.36, 0, 0, 0, 0.02);
          }
        }
      }
      break;
    }

    case 'textile': {
      const blouse = surf('fabric', '#faf8f3');
      const silver = surf('metal', '#cdd3da');
      const beadM = surf('pearl', '#eef1f5');
      const bandM = surf('fabric', '#8f2226');
      const beltM = surf('fabric', '#17141a');

      put(upper, TW + 0.1, TH * 0.56, TD + 0.1, blouse, 0, TH * 0.72, 0, 0, 0, 0, 0.07);
      put(upper, TW * 0.9, TH * 0.34, TD * 0.94, surf('skin', s.skin), 0, TH * 0.28, 0, 0, 0, 0, 0.06);
      for (const sx of [-1, 1]) {
        put(upper, 0.06, 0.3, 0.04, blouse, sx * 0.08, TH * 0.34, TD / 2 + 0.06, 0, 0, sx * 0.1, 0.02);
        put(arms[sx < 0 ? 'shL' : 'shR'], armT + 0.1, uArm * 0.62, armT + 0.09, blouse, 0, -uArm * 0.3, 0, 0, 0, 0, 0.08);
        put(arms[sx < 0 ? 'shL' : 'shR'], armT + 0.06, 0.1, armT + 0.05, bandM, 0, -uArm * 0.62, 0, 0, 0, 0, 0.03);
      }

      // A beaded collar: a torus with twenty-two drops hanging off it.
      const collar = new Mesh(new TorusGeometry(0.4, 0.07, 8, 22), silver);
      collar.position.set(0, TH - 0.02, 0.04);
      collar.rotation.x = Math.PI / 2;
      add(upper, collar);
      for (let k = 0; k < 22; k++) {
        const a = -0.3 + (k / 21) * (Math.PI + 0.6);
        const rx = Math.cos(a) * 0.42;
        const rz = Math.sin(a) * 0.24;
        const pearl = new Mesh(new SphereGeometry(0.035, 8, 6), beadM);
        pearl.position.set(rx, TH - 0.12, rz + 0.06);
        pearl.castShadow = false;
        add(upper, pearl);
        const drop = new Mesh(new CylinderGeometry(0.001, 0.03, 0.14, 6), beadM);
        drop.position.set(rx * 0.94, TH - 0.26, rz * 0.94 + 0.06);
        drop.castShadow = false;
        add(upper, drop);
      }

      put(upper, TW + 0.14, 0.16, TD + 0.14, beltM, 0, 0.1, 0, 0, 0, 0, 0.04);
      for (let k = 0; k < 16; k++) {
        const coin = new Mesh(new CylinderGeometry(0.045, 0.045, 0.02, 10), silver);
        coin.position.set(-TW / 2 - 0.02 + (k + 0.5) * ((TW + 0.1) / 16), -0.06, TD / 2 + 0.07);
        coin.rotation.x = Math.PI / 2;
        coin.castShadow = false;
        add(upper, coin);
      }

      const bangle = new Mesh(new TorusGeometry(0.18, 0.04, 8, 16), surf('fabric', '#8f2226'));
      bangle.position.set(0, -lArm + 0.04, 0);
      bangle.rotation.x = Math.PI / 2;
      add(arms.elL, bangle);

      for (const side of ['L', 'R'] as const) {
        const leg = legs[side];
        put(leg, legT + 0.16, uLeg + 0.06, legT + 0.14, surf('fabric', '#17141a'), 0, -uLeg / 2, 0);
        put(leg, legT + 0.14, 0.08, legT + 0.12, surf('fabric', '#e8dfd0'), 0, -uLeg - lLeg + 0.06, 0, 0, 0, 0, 0.02);
        put(leg, legT + 0.02, 0.2, 0.62, surf('fabric', '#d9cbb2'), 0, -uLeg - lLeg - 0.06, 0.08);
      }
      break;
    }

    case 'sequin': {
      const dress = surf('sequin', '#dfe4ea');
      const silver = surf('metal', '#d6dce4');
      const pearlM = surf('pearl', '#fbf9f5');

      put(upper, TW + 0.12, TH - 0.02, TD + 0.12, dress, 0, TH / 2 + 0.02, 0, 0, 0, 0, 0.07);

      for (let k = 0; k < 3; k++) {
        const chain = new Mesh(new TorusGeometry(0.3 - k * 0.045, 0.022, 6, 22), silver);
        chain.position.set(0, TH - 0.06 - k * 0.09, 0.06);
        chain.rotation.x = Math.PI / 2;
        chain.castShadow = false;
        add(upper, chain);
      }
      for (let k = 0; k < 9; k++) {
        const a = -0.2 + (k / 8) * (Math.PI + 0.4);
        const pearl = new Mesh(new SphereGeometry(0.03, 8, 6), pearlM);
        pearl.position.set(Math.cos(a) * 0.24, TH - 0.34, Math.sin(a) * 0.14 + 0.08);
        add(upper, pearl);
      }

      for (const side of ['L', 'R'] as const) {
        put(arms[`sh${side}`], armT + 0.11, uArm + 0.02, armT + 0.1, dress, 0, -uArm / 2, 0, 0, 0, 0, 0.08);
        put(arms[`el${side}`], armT + 0.04, lArm - 0.15, armT + 0.04, dress, 0, -(lArm - 0.15) / 2, 0, 0, 0, 0, 0.07);
        const leg = legs[side];
        put(leg, legT + 0.22, uLeg + lLeg * 0.8, legT + 0.2, dress, 0, -uLeg / 2 - 0.28, 0, 0, 0, 0, 0.06);
        put(leg, legT + 0.02, 0.2, 0.62, surf('fabric', '#e9edf2'), 0, -uLeg - lLeg - 0.06, 0.08);
      }

      const gold = new Mesh(new TorusGeometry(0.18, 0.045, 8, 16), surf('metal', '#d8b45c'));
      gold.position.set(0, -lArm + 0.04, 0);
      gold.rotation.x = Math.PI / 2;
      add(arms.elR, gold);
      break;
    }

    default: {
      // 'uniform' — what the finale puts everyone back into.
      const shirt = surf('fabric', '#f8f7f3');
      const navy = surf('fabric', '#23324f');
      const tieM = surf('fabric', '#8e2b3a');

      put(upper, TW + 0.08, TH - 0.04, TD + 0.08, shirt, 0, TH / 2 + 0.02, 0, 0, 0, 0, 0.06);
      for (const sx of [-1, 1]) {
        put(upper, 0.34, 0.3, 0.12, navy, sx * 0.26, TH - 0.06, TD / 2 + 0.06, 0.1, 0, sx * 0.45, 0.04);
      }
      put(upper, 0.16, 0.5, 0.06, tieM, 0, TH * 0.52, TD / 2 + 0.09, 0.04, 0, 0, 0.03);
      put(upper, 0.13, 0.13, 0.07, tieM, 0, TH * 0.84, TD / 2 + 0.1, 0, 0, 0, 0.03);
      put(upper, TW + 0.12, 0.14, TD + 0.12, navy, 0, 0.08, 0, 0, 0, 0, 0.04);

      for (const side of ['L', 'R'] as const) {
        put(arms[`sh${side}`], armT + 0.07, uArm * 0.72, armT + 0.06, shirt, 0, -uArm * 0.34, 0, 0, 0, 0, 0.06);
        const leg = legs[side];
        put(leg, legT + 0.18, uLeg + 0.1, legT + 0.16, navy, 0, -uLeg / 2 - 0.04, 0);
        put(leg, legT + 0.02, 0.2, 0.62, surf('fabric', '#1b1b22'), 0, -uLeg - lLeg - 0.06, 0.08);
      }
      break;
    }
  }

  jointAO();
  return out;
}
