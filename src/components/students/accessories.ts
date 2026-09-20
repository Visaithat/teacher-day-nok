import {
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { P, bevelBox, surf } from './proportions';
import type { StudentConfig } from '../../config/students';

const TOP = P.headS / 2;

/**
 * The one object that belongs to each person and nobody else.
 *
 * These are dispatched by name rather than by profession, because they are
 * not costume — they are the detail that makes a blocky figure recognisably
 * a particular person: Vanhxay's glasses, Timmy's headset, Kengkue's brush
 * tucked in his sash, Namthip's headwrap and leaf garland, Nina's crown.
 */
export function blockyAccessories(
  head: Object3D,
  upper: Object3D,
  s: StudentConfig,
): Mesh[] {
  const out: Mesh[] = [];
  const dark = surf('leather', '#22232a');
  const silver = surf('metal', '#dfe4ea');
  const pearlM = surf('pearl', '#fbf8f2');
  const cloth = surf('fabric', '#f9f7f2');

  const add = (parent: Object3D, mesh: Mesh, shadow = true): Mesh => {
    mesh.castShadow = shadow;
    parent.add(mesh);
    out.push(mesh);
    return mesh;
  };

  switch (s.en) {
    case 'Vanhxay': {
      for (const sx of [-1, 1]) {
        const rim = new Mesh(new TorusGeometry(0.14, 0.022, 8, 18), dark);
        rim.position.set(sx * 0.17, -0.02, P.headS / 2 + 0.02);
        add(head, rim);
        const temple = new Mesh(bevelBox(0.022, 0.022, 0.3, 0.005), dark);
        temple.position.set(sx * 0.33, -0.02, P.headS / 2 - 0.16);
        add(head, temple);
      }
      const bridge = new Mesh(bevelBox(0.1, 0.022, 0.022, 0.005), dark);
      bridge.position.set(0, -0.02, P.headS / 2 + 0.02);
      add(head, bridge);
      break;
    }

    case 'Timmy': {
      const band = new Mesh(new TorusGeometry(0.5, 0.045, 8, 20, Math.PI), dark);
      band.position.set(0, TOP - 0.06, 0);
      band.rotation.y = Math.PI / 2;
      add(head, band);
      for (const sx of [-1, 1]) {
        const cup = new Mesh(bevelBox(0.1, 0.24, 0.24, 0.05), dark);
        cup.position.set(sx * 0.48, -0.02, 0);
        add(head, cup);
      }
      break;
    }

    case 'Kengkue': {
      // A brush through the sash, still wet.
      const shaft = new Mesh(bevelBox(0.05, 0.46, 0.05, 0.015), surf('wood', '#b0783c'));
      shaft.position.set(-0.56, 0.3, P.torsoD / 2 + 0.06);
      shaft.rotation.z = 0.26;
      add(upper, shaft);
      const head2 = new Mesh(bevelBox(0.07, 0.13, 0.07, 0.02), dark);
      head2.position.set(-0.62, 0.07, P.torsoD / 2 + 0.06);
      add(upper, head2);
      break;
    }

    case 'Namthip': {
      const wrap = new Mesh(bevelBox(P.headS + 0.16, 0.46, P.headS + 0.16, 0.14), cloth);
      wrap.position.set(0, TOP + 0.14, 0);
      add(head, wrap);
      const upperWrap = new Mesh(bevelBox(P.headS + 0.08, 0.26, P.headS + 0.08, 0.1), cloth);
      upperWrap.position.set(0, TOP + 0.38, 0);
      add(head, upperWrap);
      const tail = new Mesh(bevelBox(0.28, 0.66, 0.24, 0.08), cloth);
      tail.position.set(-0.5, -0.06, -0.24);
      tail.rotation.z = 0.14;
      add(head, tail);

      // Eighteen leaves around the crown, in three alternating colours.
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2;
        const colour = k % 3 === 0 ? '#c9a23a' : k % 3 === 1 ? '#9c2b2b' : '#c96a2b';
        const leaf = new Mesh(bevelBox(0.16, 0.1, 0.12, 0.03), surf('fabric', colour));
        leaf.position.set(
          Math.cos(a) * (P.headS / 2 + 0.1),
          TOP + 0.06,
          Math.sin(a) * (P.headS / 2 + 0.1),
        );
        leaf.rotation.set(0.3, a, 0.2);
        add(head, leaf, false);
      }
      break;
    }

    case 'Nina': {
      const body = new Mesh(new CylinderGeometry(0.56, 0.5, 0.46, 16, 1, true), silver);
      body.position.set(0, TOP + 0.32, 0);
      add(head, body);
      const ring = new Mesh(new CylinderGeometry(0.58, 0.58, 0.05, 16), silver);
      ring.position.set(0, TOP + 0.1, 0);
      add(head, ring);

      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const spire = new Mesh(new ConeGeometry(0.1, 0.34, 4), silver);
        spire.position.set(Math.cos(a) * 0.46, TOP + 0.68, Math.sin(a) * 0.46);
        spire.rotation.y = a;
        add(head, spire, false);
      }
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        const pearl = new Mesh(new SphereGeometry(0.055, 8, 6), pearlM);
        pearl.position.set(Math.cos(a) * 0.54, TOP + 0.06, Math.sin(a) * 0.54);
        add(head, pearl, false);
      }
      for (const sx of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          const strand = new Mesh(new SphereGeometry(0.04, 8, 6), pearlM);
          strand.position.set(sx * 0.5, TOP - 0.04 - k * 0.14, 0.14);
          add(head, strand, false);
        }
        const pom = new Mesh(new SphereGeometry(0.11, 10, 8), cloth);
        pom.position.set(sx * 0.5, TOP - 0.76, 0.14);
        add(head, pom, false);
        const tassel = new Mesh(bevelBox(0.12, 0.4, 0.12, 0.04), cloth);
        tassel.position.set(sx * 0.5, TOP - 1.02, 0.14);
        add(head, tassel, false);
      }
      break;
    }

    default:
      break;
  }

  return out;
}
