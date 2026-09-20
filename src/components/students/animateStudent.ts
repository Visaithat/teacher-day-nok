import type { Camera, Group, Mesh, SpriteMaterial } from 'three';
import type { MeshBasicMaterial } from 'three';
import { clamp, lerp } from '../../lib/math';
import type { BlockyRig } from './blockyRig';
import type { FaceMood } from '../../textures/draw';
import type { Greeting, StudentConfig } from '../../config/students';

/**
 * How long each greeting holds before it settles back into the carry.
 *
 * Vanhxay's shuffle runs longest because it has two beats — the wave, then
 * the little foot shuffle after it. Everything releases over 0.6s.
 */
const GREETING_SECONDS: Record<Greeting | 'default', number> = {
  thumbs_jump: 2.7,
  lift: 2.6,
  wave_shuffle: 3.8,
  bow: 2.6,
  wave_surprise: 2.6,
  default: 2.4,
};

const RELEASE = 0.6;

/** One student on the street, with everything the loop needs to drive them. */
export interface StudentInstance {
  readonly index: number;
  readonly config: StudentConfig;
  readonly group: Group;
  readonly rig: BlockyRig;
  readonly sign: Group;
  readonly signY0: number;
  readonly frame: Group;
  readonly side: -1 | 1;
  readonly baseRot: number;
  /** Which arm is free to gesture: the one away from the camera. */
  readonly waveArm: 'L' | 'R';
  readonly gesture: Greeting;
  readonly hit: Mesh;
  readonly poolMat: MeshBasicMaterial;
  readonly spotMat: SpriteMaterial;
  readonly labelMat: SpriteMaterial;
  readonly label: { position: { y: number } };
  /** Deterministic per-character clock offsets. */
  readonly idlePhase: number;
  readonly idleSpeed: number;
  readonly speed: number;
  readonly phase: number;

  // --- mutable per-frame state ---
  /** Focus strength, published for props and the DOF to read. */
  focus: number;
  notice: number;
  /** Damped head weight (fast) and body weight (slow). */
  headWeight: number;
  bodyWeight: number;
  leaving: boolean;
  arriveAt: number | undefined;
  leftAt: number | undefined;
  expression: FaceMood;
}

/**
 * Animate one student for one frame.
 *
 * The whole performance is two damped weights. `headWeight` moves fast, so
 * the head notices you before the body does; `bodyWeight` moves slowly, so
 * turning to face the camera lags behind the glance. That gap between the two
 * is what makes it read as a person registering someone rather than a model
 * snapping to a target.
 *
 * The greeting itself is a one-shot: it starts when the body weight crosses
 * 0.5, plays for its own duration, then releases — so scrubbing the scroll
 * back and forth replays it rather than freezing it mid-wave.
 */
export function animateStudent(
  c: StudentInstance,
  lit: number,
  wall: number,
  camera: Camera,
  reduced: boolean,
): void {
  const r = c.rig;
  const time = wall * c.speed + c.phase;
  const idleTime = time * c.idleSpeed + c.idlePhase;

  // ---- always on, even under reduced motion: breathing and weight shift --
  const breath = 1 + Math.sin(idleTime * 1.5) * 0.016;
  r.torso.scale.set(r.torsoBase[0], breath, r.torsoBase[1]);
  r.upper.position.x = Math.sin(time * 0.62) * 0.035;
  r.upper.rotation.z = Math.sin(time * 0.62) * 0.02;

  // ---- blink: a texture swap, on a period unique to each student ---------
  const cycle = 3 + (c.index % 5) * 0.6;
  const bt = (time + c.index * 0.7) % cycle;
  const closed = bt < 0.13 ? Math.sin((bt / 0.13) * Math.PI) : 0;
  r.setFace(closed > 0.5 ? 'blink' : c.expression);

  if (reduced) return;

  // ---- damped attention --------------------------------------------------
  const previousBody = c.bodyWeight;
  c.headWeight = lerp(c.headWeight, Math.max(lit, c.notice), 0.11);
  c.bodyWeight = lerp(previousBody, lit, 0.045);
  const g = c.bodyWeight;
  const hw = c.headWeight;
  c.leaving = lit < previousBody - 0.002;

  const toCam = Math.atan2(
    camera.position.x - c.group.position.x,
    camera.position.z - c.group.position.z,
  );
  c.group.rotation.y = lerp(c.baseRot, toCam, g);

  // Out of focus they glance around on their own; in focus the glance is
  // overridden by actually looking at you.
  const idleGlance = Math.sin(time * 0.31) * 0.28 + Math.sin(time * 0.083) * 0.2;
  const headYaw =
    clamp((toCam - c.group.rotation.y) * 1.25, -0.8, 0.8) * hw + idleGlance * (1 - hw);
  r.head.rotation.y = lerp(r.head.rotation.y, headYaw, 0.09);
  // Posture straightens a touch on recognition.
  r.upper.scale.y = 1 + hw * 0.02;
  r.head.position.y = r.headY0 + hw * 0.02;

  // ---- greeting envelope -------------------------------------------------
  const H = r.hold;
  const sway = Math.sin(time * 1.05 + c.index) * 0.03;
  const free = c.waveArm;
  const freeDir = free === 'L' ? -1 : 1;
  const busy = free === 'L' ? 'R' : 'L';
  const busyDir = busy === 'L' ? -1 : 1;

  r.arms[`sh${busy}`].rotation.set(H.shX + sway, 0, busyDir * H.shZ);
  r.arms[`el${busy}`].rotation.x = H.elX;

  if (g > 0.5 && c.arriveAt === undefined) c.arriveAt = wall;
  if (g < 0.1) c.arriveAt = undefined;
  const since = c.arriveAt === undefined ? 99 : wall - c.arriveAt;

  const duration = GREETING_SECONDS[c.gesture] ?? GREETING_SECONDS.default;
  const act = g * clamp(1 - (since - duration) / RELEASE, 0, 1);
  const bye = c.leaving ? clamp(previousBody * 1.6, 0, 1) * (1 - g) : 0;
  /** A window that opens at `a` and closes at `b`, both over 0.35s. */
  const win = (a: number, b: number): number =>
    clamp((since - a) / 0.35, 0, 1) * clamp(1 - (since - b) / 0.35, 0, 1);

  let shX = H.shX + sway;
  let shZ = freeDir * H.shZ;
  let elX = H.elX;
  let elZ = 0;
  let bowX = 0;
  let hop = 0;
  let wave = 0;
  let shuffle = 0;
  let squash = 0;
  let liftArm = 0;
  let signZ = 0.02;
  let signX = 0;
  let signY = c.signY0;
  let expression: FaceMood = 'neutral';

  switch (c.gesture) {
    case 'bow': {
      // Holds the bow until 1.5s, then comes back up.
      bowX = 0.3 * act * clamp(1 - (since - 1.5) / 0.5, 0, 1);
      expression = act > 0.3 && since > 1.5 ? 'smile' : 'neutral';
      break;
    }
    case 'thumbs_jump': {
      const th = act * clamp(1 - (since - 1.3) / 0.4, 0, 1);
      shX = H.shX * (1 - th) - 1.25 * th;
      shZ = freeDir * (H.shZ - th * 0.2);
      elX = H.elX * (1 - th) - 0.9 * th;
      signZ = 0.02 + th * freeDir * 0.08;
      signX = th * -freeDir * 0.05;
      // Thumbs up first, then he jumps — and lands with a squash.
      const jt = clamp((since - 1.55) / 0.7, 0, 1);
      hop = Math.sin(jt * Math.PI) * 0.5 * act;
      squash =
        since > 2.2 && since < 2.55 ? Math.sin(((since - 2.2) / 0.35) * Math.PI) * 0.07 : 0;
      expression = act > 0.3 ? 'grin' : 'neutral';
      break;
    }
    case 'lift': {
      // Raises the whole board rather than a hand.
      signY = c.signY0 + act * 0.5;
      liftArm = act * 0.55;
      expression = act > 0.3 ? 'grin' : 'neutral';
      break;
    }
    case 'wave_shuffle': {
      wave = act * clamp(1 - (since - 1.6) / 0.4, 0, 1);
      shuffle = act * win(1.7, 3.4);
      expression = act > 0.3 ? 'smile' : 'neutral';
      break;
    }
    case 'wave_surprise': {
      wave = act;
      // Caught off guard, then delighted.
      expression = act > 0.3 ? (since < 0.8 ? 'surprised' : 'grin') : 'neutral';
      break;
    }
    default:
      wave = act;
      break;
  }

  // The farewell reuses the wave at reduced strength.
  wave = Math.max(wave, bye * 0.6);
  if (wave > 0.001) {
    shX = lerp(shX, -0.15 + sway, wave);
    shZ = lerp(shZ, freeDir * (H.shZ + 1.9), wave);
    elX = lerp(elX, -0.28, wave);
    elZ = Math.sin(time * 5.4) * 0.5 * wave;
    signZ += wave * freeDir * 0.09;
    signX += wave * -freeDir * 0.06;
  }

  r.arms[`sh${busy}`].rotation.x = H.shX + sway - liftArm;
  r.arms[`sh${free}`].rotation.set(shX - liftArm, 0, shZ);
  r.arms[`el${free}`].rotation.x = elX;
  r.arms[`el${free}`].rotation.z = elZ;

  r.upper.rotation.x = bowX - 0.04 * wave;
  r.upper.scale.y = (1 + hw * 0.02) * (1 - squash);
  r.upper.rotation.z += Math.sin(time * 6) * 0.12 * shuffle;
  r.grp.position.x = Math.sin(time * 3) * 0.16 * shuffle;
  r.legs.L.rotation.x = Math.sin(time * 6) * 0.3 * shuffle;
  r.legs.R.rotation.x = -Math.sin(time * 6) * 0.3 * shuffle;
  c.group.position.y = hop;
  c.expression = expression;

  // ---- head extras and the goodbye nod -----------------------------------
  const nod = bye * Math.sin(Math.min(wall - (c.leftAt ?? wall), 1) * Math.PI) * 0.18;
  if (c.leaving && c.leftAt === undefined) c.leftAt = wall;
  if (!c.leaving) c.leftAt = undefined;

  r.head.rotation.x =
    (c.gesture === 'bow' ? -0.24 : -0.06) * act + nod + Math.sin(time * 0.9) * 0.02;
  // An attentive tilt, but only after the greeting has finished.
  r.head.rotation.z = 0.06 * g * (1 - act) * freeDir;
  r.upper.rotation.y = Math.sin(time * 0.5) * 0.05 * (1 - g);

  // ---- the sign and the framed photo -------------------------------------
  // Fidget only while unobserved; it settles the moment they are noticed.
  const fidget = (1 - hw) * (0.5 + 0.5 * Math.sin(time * 0.17));
  c.sign.rotation.z = signZ + Math.sin(time * 0.7) * 0.012 * fidget;
  c.sign.position.x = signX + Math.sin(time * 0.43) * 0.02 * fidget;
  // The board tips up toward the lens as they are framed.
  c.sign.rotation.x = lerp(-0.1, -0.02, g);
  c.sign.position.y = lerp(signY, signY + 0.06, g) + Math.sin(time * 1.5) * 0.006;
  c.frame.rotation.y = c.side * 0.34 - g * c.side * 0.2;
}
