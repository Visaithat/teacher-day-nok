import { Group, Mesh, MeshStandardMaterial, Object3D, type Material } from 'three';
import { BODY_H, HIP_Y, MODEL_HEAD_Y, P, bevelBox, surf } from './proportions';
import { buildHair } from './hair';
import { clothe } from './clothing';
import { blockyAccessories } from './accessories';
import type { FaceMood } from '../../textures/draw';
import type { FaceSet } from '../../textures/library';
import type { StudentConfig } from '../../config/students';

/** The resting carry: both hands down at the waist, holding the sign. */
export interface HoldPose {
  readonly shX: number;
  readonly shZ: number;
  readonly elX: number;
}

export const HOLD: HoldPose = { shX: -0.1, shZ: 0.34, elX: -0.92 };

export interface RigArms {
  shL: Group;
  elL: Group;
  handL: Mesh;
  shR: Group;
  elR: Group;
  handR: Mesh;
}

export interface BlockyRig {
  readonly grp: Group;
  readonly upper: Group;
  /** The object breathing scales. Repointed at the model once one loads. */
  torso: Object3D;
  readonly head: Mesh;
  /**
   * Where a DOM callout should point to find this person's face.
   *
   * The built head is a cube a quarter of the body tall, so its centre is a
   * long way below the top of the figure; a loaded GLB puts a human head much
   * higher up. The finale's leader lines anchor here rather than on `head` so
   * the dot lands on the face that is actually on screen. Repointed by
   * whichever loader attaches the model.
   */
  headAnchor: Object3D;
  readonly arms: RigArms;
  readonly legs: { L: Group; R: Group };
  /** Raycast target for hover. */
  readonly hit: Mesh;
  readonly headY0: number;
  torsoBase: [number, number];
  readonly hipY: number;
  readonly bodyH: number;
  readonly handW: number;
  readonly boardMax: number;
  readonly hold: HoldPose;
  /** Every mesh of the built body, so a loaded model can hide them all. */
  readonly bodyMeshes: Mesh[];
  mood: FaceMood;
  setFace: (mood: FaceMood) => void;
  /** Set once a GLB has replaced the built figure. */
  model: Object3D | null;
  dispose: () => void;
}

export interface BuildRigOptions {
  readonly faces: FaceSet;
  readonly castShadow: boolean;
  /** Force the school uniform, as the finale does for everyone. */
  readonly uniform?: boolean;
}

/**
 * Build one figure.
 *
 * The skeleton is deliberately shallow — hips, torso, head, and a two-bone
 * arm each side. Everything the animation needs is a rotation on one of
 * those; nothing is skinned. That is what makes it cheap enough to have five
 * on screen with full clothing detail, and it is also why a loaded GLB can
 * simply be hung off the hips and inherit the same motion.
 *
 * The face is the front (+Z) material of the head cube, index 4 of a
 * six-material array. Swapping expressions is one texture assignment.
 */
export function buildBlockyRig(student: StudentConfig, options: BuildRigOptions): BlockyRig {
  const s: StudentConfig = options.uniform ? { ...student, outfit: 'uniform' } : student;
  const castShadow = options.castShadow;
  const owned: Material[] = [];
  const bodyMeshes: Mesh[] = [];

  const add = (
    parent: Object3D,
    geometry: ReturnType<typeof bevelBox>,
    material: Material | Material[],
    x = 0,
    y = 0,
    z = 0,
  ): Mesh => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    mesh.userData['body'] = true;
    parent.add(mesh);
    return mesh;
  };

  const skinM = surf('skin', s.skin);
  const grp = new Group();

  // ------------------------------------------------------------------ legs
  const legsGrp = new Group();
  grp.add(legsGrp);
  const legs = { L: new Group(), R: new Group() };
  ([-1, 1] as const).forEach((sx) => {
    const hip = sx < 0 ? legs.L : legs.R;
    hip.position.set(sx * (P.legT / 2 + 0.02), HIP_Y, 0);
    legsGrp.add(hip);
    add(hip, bevelBox(P.legT, P.uLeg, P.legT, 0.06), skinM, 0, -P.uLeg / 2, 0);
    add(hip, bevelBox(P.legT - 0.02, P.lLeg, P.legT - 0.02, 0.06), skinM, 0, -P.uLeg - P.lLeg / 2, 0);
    add(hip, bevelBox(P.legT, P.footH, P.legT + 0.04, 0.06), skinM, 0, -P.uLeg - P.lLeg - P.footH / 2 - 0.04, 0.08);
  });

  // ----------------------------------------------------------------- torso
  const upper = new Group();
  upper.position.y = HIP_Y;
  grp.add(upper);

  const torso = add(upper, bevelBox(P.torsoW, P.torsoH, P.torsoD, 0.07), skinM, 0, P.torsoH / 2, 0);
  add(upper, bevelBox(P.neckW, P.neckH + 0.04, P.neckW, 0.04), skinM, 0, P.torsoH + P.neckH / 2 - 0.02, 0);

  // ------------------------------------------------------------------ head
  const headM = new MeshStandardMaterial({
    map: options.faces.neutral,
    roughness: 0.6,
    envMapIntensity: 0.4,
  });
  owned.push(headM);
  // Index 4 is +Z: the face is painted only on the front.
  const headMaterials: Material[] = [skinM, skinM, skinM, skinM, headM, skinM];
  const head = add(
    upper,
    bevelBox(P.headS, P.headS, P.headS, 0.1),
    headMaterials,
    0,
    P.torsoH + P.neckH + P.headS / 2,
    0,
  );

  // ------------------------------------------------------------------ arms
  const arms = {} as RigArms;
  ([-1, 1] as const).forEach((sx) => {
    const side = sx < 0 ? 'L' : 'R';
    const shoulder = new Group();
    shoulder.position.set(sx * (P.torsoW / 2 + P.armT / 2), P.torsoH - P.armT / 2, 0);
    upper.add(shoulder);
    add(shoulder, bevelBox(P.armT, P.uArm, P.armT, 0.06), skinM, 0, -P.uArm / 2, 0);

    const elbow = new Group();
    elbow.position.y = -P.uArm;
    shoulder.add(elbow);
    add(elbow, bevelBox(P.armT - 0.02, P.lArm, P.armT - 0.02, 0.06), skinM, 0, -P.lArm / 2, 0);

    const hand = add(
      elbow,
      bevelBox(P.armT - 0.02, P.handH, P.armT - 0.04, 0.07),
      skinM,
      0,
      -P.lArm - P.handH / 2 + 0.01,
      0,
    );

    // Four fingers curled a little more the further out they sit, plus a
    // thumb angled across — enough to read as a hand holding something.
    const fw = (P.armT - 0.08) / 4;
    for (let q = 0; q < 4; q++) {
      const finger = add(
        hand,
        bevelBox(fw - 0.015, 0.16, P.armT - 0.1, 0.03),
        skinM,
        -(P.armT - 0.09) / 2 + q * fw + fw / 2,
        -P.handH / 2 - 0.06,
        0.01,
      );
      finger.rotation.x = -0.34 - q * 0.03;
    }
    const thumb = add(
      hand,
      bevelBox(0.09, 0.15, 0.09, 0.03),
      skinM,
      sx * -(P.armT / 2 - 0.05),
      -0.02,
      (P.armT - 0.04) / 2 + 0.02,
    );
    thumb.rotation.set(-0.9, 0, sx * 0.5);

    arms[`sh${side}`] = shoulder;
    arms[`el${side}`] = elbow;
    arms[`hand${side}`] = hand;
  });

  // -------------------------------------------------------------- dressing
  buildHair(head, s);
  const rigShell = { upper, arms, legs } as unknown as BlockyRig;
  clothe(rigShell, s);
  blockyAccessories(head, upper, s);

  // Taller students are also very slightly broader, so height reads as build
  // rather than as a stretched copy.
  const h = s.height;
  grp.scale.set(0.99 + (h - 1) * 0.35, h, 0.99 + (h - 1) * 0.35);

  // Rest pose: both arms down, holding the board at the waist.
  arms.shL.rotation.set(HOLD.shX, 0, HOLD.shZ);
  arms.elL.rotation.x = HOLD.elX;
  arms.shR.rotation.set(HOLD.shX, 0, -HOLD.shZ);
  arms.elR.rotation.x = HOLD.elX;

  grp.traverse((o) => {
    if ((o as Mesh).isMesh) bodyMeshes.push(o as Mesh);
  });

  const rig: BlockyRig = {
    grp,
    upper,
    torso,
    head,
    arms,
    legs,
    hit: torso,
    headAnchor: head,
    headY0: head.position.y,
    torsoBase: [1, 1],
    hipY: HIP_Y,
    bodyH: BODY_H,
    handW: P.armT,
    boardMax: 1.3,
    hold: HOLD,
    bodyMeshes,
    mood: 'neutral',
    model: null,
    setFace(mood: FaceMood) {
      if (rig.mood === mood) return;
      rig.mood = mood;
      // No `needsUpdate`: one face for another leaves the program key as it
      // was, and three reads `map` afresh on every frame it draws the head.
      headM.map = options.faces[mood];
    },
    dispose() {
      grp.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      for (const m of owned) m.dispose();
    },
  };

  return rig;
}

/**
 * Mark where a just-attached GLB's face is, for the finale's leader lines.
 *
 * `wrap` is the group the loaders hang the model from, with the model's feet
 * at its origin - so the anchor is a fixed height in that space. Returns the
 * anchor to assign to `rig.headAnchor`.
 */
export function attachModelHeadAnchor(wrap: Object3D): Object3D {
  const anchor = new Object3D();
  anchor.position.y = MODEL_HEAD_Y;
  wrap.add(anchor);
  return anchor;
}
