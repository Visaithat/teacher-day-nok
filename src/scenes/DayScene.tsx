import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal, useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  BackSide,
  Box3,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SpriteMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { attachModelHeadAnchor, buildBlockyRig } from '../components/students/blockyRig';
import { HIP_Y, P } from '../components/students/proportions';
import { createPetalField, SpriteField, useFieldPixelScale } from '../components/fx/SpriteField';
import { useTextures } from '../textures/TextureProvider';
import { STUDENTS, STUDENT_COUNT, assetUrl, wakeGestureFor } from '../config/students';
import { GATES, WAKE_B } from '../config/timeline';
import { useUpdate } from '../lib/updateBus';
import { sstep } from '../lib/math';
import { QUALITY } from '../config/quality';
import { useUIStore } from '../state/useUIStore';
import { DAY_FOV, DAY_FOV_NARROW, NARROW_ASPECT } from '../state/viewport';
import { renderTargets } from './renderTargets';
import { dayState, type DayChar } from './dayChars';
import { frame as frameState, type FrameState } from '../state/frame';

const MODEL_TARGET_H = 3.42;

// ---------------------------------------------------------------- the shot

/** Flat on your back on the grass, looking straight up. */
const CAMERA_Y = 0.5;
/**
 * The authored lens. A portrait frame plays `DAY_FOV_NARROW` instead, against
 * the roster's `dayAngleNarrow` seats — see the long note on that field, and
 * the re-seating effect below.
 */
const CAMERA_FOV = DAY_FOV;

// ---------------------------------------------------------------- the ring
//
// The ring is the film's, not a derivation. An earlier version here solved for
// a scale and a radius that put every head on one 30 degree cone, which is
// tidy and wrong: five identical heads at five even angles reads as a diagram.
// The film authors the ring instead — one big scale, one base radius, and a
// per-student multiplier that pulls some faces in over the lens and leaves the
// rest out at the frame edge. That unevenness is the shot.

/** Metres from the lens on the ground plane, before `dayRadius`. */
const RING_BASE_RADIUS = STUDENT_COUNT <= 6 ? 3.9 : 4.6;

/**
 * One scale for all five, and a large one: at 1.3 a head sits 3.28 m above the
 * lens and fills a good part of the frame, which is what makes the finale read
 * as people leaning over you rather than as figures on a horizon.
 *
 * `buildBlockyRig` leaves a slightly non-uniform scale for build variation;
 * the finale overwrites it so nobody ends up subtly wider than anybody else.
 */
const RING_SCALE = 1.3;

/**
 * Forward tilt over the lens, from the hips.
 *
 * Positive is forward here because the holder is yawed so the figure's face
 * (the +Z material of the head cube) points at the lens, and a positive
 * rotation about local X carries the top of the body toward local +Z.
 *
 * Do not swap this for `lookAt` on the holder. `lookAt` aims -Z at its target,
 * which turns every student's back to the camera and then leans them away from
 * it — that is exactly the "everyone is facing the wrong way" fault.
 *
 * The roster's `dayLean` is added to this per student. In the film that field
 * was set at build time and then overwritten by the first frame of the wake,
 * so it never once reached the screen; here the per-student value travels on
 * the `DayChar` and the wake ramp scales THAT, so it actually holds.
 */
const RING_TILT = 0.34;

/** Height of the head's centre above the feet, on an unscaled rig. */
const HEAD_LOCAL_Y = HIP_Y + P.torsoH + P.neckH + P.headS / 2;
/** ...and how much of that sits above the hip joint, which is what tilts. */
const HEAD_ABOVE_HIP = HEAD_LOCAL_Y - HIP_Y;

/**
 * How far out the students start, and how they arrive.
 *
 * Everyone slides in from `radius + 2.4` over their own window of the wake
 * ramp, so the ring closes around the lens as vision returns instead of being
 * there the whole time. The stagger is `((i * 7) % 5) / 5`, which orders the
 * five 0, 3, 1, 4, 2 — no two neighbours arrive together. The last window to
 * open is 0.71, and 0.71 + 0.28 = 0.99, so the ring is fully closed a shade
 * before the wake ramp ends; nobody is still travelling when the text lands.
 */
/**
 * How far the whole ring is raised on a portrait frame, in world metres.
 *
 * This is the ONLY lever that makes a figure smaller, and it took a bad shot
 * to work that out. Two that look like they should work do not:
 *
 *  - `dayRadius` cannot resize a head. The lens sits at the centre of the
 *    ring, so a head's distance from it is body height and lean alone. Radius
 *    slides a face around the frame; it never scales it.
 *  - Scaling the figures DOWN makes the heads bigger. At scale k the head sits
 *    at 2.907k with the lens at 0.5, so the depth 2.907k - 0.5 shrinks faster
 *    than the head does.
 *
 * What was actually filling a phone screen was never the heads: the hips are
 * three times nearer the lens than the faces, and shoulders are 1.61 m across
 * against a half-frame of 0.57 m at that depth - 283% of the frame width, per
 * figure. Raising the ring 2.6 m puts faces at 35% of the width and shoulders
 * at 85%, which is people leaning in over you with their bodies running off
 * the edges, rather than a wall of uniform.
 *
 * Raised rather than dropping the camera, which is geometrically the same for
 * the figures: the lawn is a `circleGeometry` at y=0 with a default `FrontSide`
 * material, and putting the lens underneath it would leave the shot relying on
 * backface culling to hide the ground. The feet go out of frame either way.
 *
 * `students.ts`'s `dayRadiusNarrow` table is solved against this number. Change
 * one and the other has to be re-solved - `_finale.mjs` is what checks it.
 */
const RING_LIFT_NARROW = 2.6;

const RING_ENTER_FROM = 2.4;
const RING_ENTER_SPAN = 0.28;

function enterAt(index: number): number {
  return 0.15 + (((index * 7) % STUDENT_COUNT) / STUDENT_COUNT) * 0.7;
}

/**
 * Where the finale's own model loader gives up waiting.
 *
 * By here the street is over, so nothing it fetches can compete with the
 * street's own downloads.
 */
const CATCH_UP_FROM = 0.86;

/**
 * When to audit the ring. By here the wake ramp is over and every loader has
 * had its chance, so a figure still missing its model is a real fault.
 */
const AUDIT_AT = WAKE_B;

/** Head position, without touching the scene graph. For the audit log. */
function headAt(c: DayChar, out: Vector3): Vector3 {
  const ground = c.radius - RING_SCALE * HEAD_ABOVE_HIP * Math.sin(c.lean);
  return out.set(
    Math.sin(c.angle) * ground,
    RING_SCALE * (HIP_Y + HEAD_ABOVE_HIP * Math.cos(c.lean)),
    Math.cos(c.angle) * ground,
  );
}

/**
 * Scene 7 — waking up.
 *
 * The camera is lying on its back looking straight up, and the class stands in
 * an even circle around it, leaning in over the lens. That single inversion is
 * the whole idea: the film has spent eight minutes walking toward these
 * people, and now they are looking down at you.
 *
 * Everyone is present, opaque and at full size for every frame of the scene.
 * There is no entrance ramp and no fade — an earlier version staggered them in
 * over the wake ramp, and because the last seat's ramp did not finish before
 * the scroll did, one student never fully arrived.
 */
export function DayScene(): React.ReactElement {
  const textures = useTextures();
  const size = useThree((s) => s.size);
  const mainCamera = useThree((s) => s.camera);
  // Which of the two finale shots is live. `DayScene` already re-renders on
  // `size`, so this costs nothing beyond the resize it was going to do anyway.
  const narrow = size.width / Math.max(1, size.height) < NARROW_ASPECT;
  const dayFov = narrow ? DAY_FOV_NARROW : CAMERA_FOV;
  const quality = useUIStore((s) => s.quality);
  const settings = QUALITY[quality];

  const scene = useMemo(() => {
    const s = new Scene();
    s.background = new Color('#7fb6ee');
    return s;
  }, []);

  const camera = useMemo(() => {
    const c = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);
    c.position.set(0, CAMERA_Y, 0);
    // Flat on your back: the world's "up" on screen runs away from you.
    // `lookAt` cannot derive a roll when the view direction is parallel to the
    // default up, so it has to be given one; which one only rolls the image.
    c.up.set(0, 0, -1);
    c.lookAt(0, 30, 0);
    c.updateMatrixWorld();
    return c;
  }, []);

  const domeRef = useRef<Mesh>(null);
  const loadedRef = useRef(new Set<string>());
  // Read inside the loader, which no longer re-runs when the tier changes.
  const shadowsRef = useRef(settings.characterShadows);
  shadowsRef.current = settings.characterShadows;

  useEffect(() => {
    renderTargets.dayScene = scene;
    renderTargets.dayCamera = camera;
    dayState.camera = camera;
    return () => {
      renderTargets.dayScene = null;
      renderTargets.dayCamera = null;
      dayState.camera = null;
    };
  }, [scene, camera]);

  // ---------------------------------------------------------------- ring
  const ring = useMemo(() => {
    const root = new Group();
    const chars: DayChar[] = [];

    STUDENTS.forEach((s, i) => {
      const faces = textures.faces[i];
      if (!faces) return;

      const angle = MathUtils.degToRad(s.dayAngle);
      const radius = RING_BASE_RADIUS * (s.dayRadius ?? 1);

      // Shadows are applied separately, below. Building the rig must NOT
      // depend on the quality tier: a tier change mid-scene would rebuild
      // every figure and throw away the models already attached to them.
      const rig = buildBlockyRig(s, { faces, castShadow: true, uniform: true });

      const holder = new Group();
      // Seat, measured from +Z. Yaw only — the lean belongs to the hips. The
      // distance is re-set every frame by the entrance ramp; this is where it
      // ends up.
      holder.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      holder.rotation.set(0, angle + Math.PI, 0);
      root.add(holder);

      // Their own tilt over the lens, not the ring's. Read once here and
      // carried on the DayChar, because the wake ramp rewrites this rotation
      // every frame from `c.lean` - setting it only here would last exactly
      // one frame.
      const lean = RING_TILT + (s.dayLean ?? 0);
      rig.upper.rotation.x = lean;
      rig.grp.scale.setScalar(RING_SCALE);
      rig.grp.visible = true;
      holder.add(rig.grp);

      // Hands resting forward, as if propped on something.
      rig.arms.shL.rotation.set(-0.4, 0, -0.3);
      rig.arms.elL.rotation.x = -0.9;
      rig.arms.shR.rotation.set(-0.4, 0, 0.3);
      rig.arms.elR.rotation.x = -0.9;

      chars.push({
        index: i,
        name: s.en,
        rig,
        holder,
        angle,
        radius,
        lean,
        enter: enterAt(i),
        gesture: wakeGestureFor(i),
        say: 0,
      });
    });

    return { root, chars };
  }, [textures]);

  // ---- the ring is short a student, or short a model ---------------------
  //
  // Two different ways the finale can come up with four people instead of
  // five, and both have happened: a seat can be dropped at build time when a
  // face texture is missing, and a seat that IS built can still be wearing the
  // blocky stand-in because its GLB never arrived. Neither throws, and neither
  // is obvious on screen — the ring just looks a little empty on one side.
  const auditedRef = useRef(false);

  /**
   * Put the ring on the seats this frame shape calls for.
   *
   * Deliberately NOT part of the ring memo above. Rebuilding five rigs on a
   * resize would throw away the finale models already attached to them; but
   * the entrance ramp in the update loop re-derives `holder.position` from
   * `c.angle` and `c.radius` every frame anyway, so re-seating is those two
   * numbers plus the yaw, which is the one thing set once at build time.
   */
  useLayoutEffect(() => {
    for (const c of ring.chars) {
      const s = STUDENTS[c.index];
      if (!s) continue;
      const deg = (narrow ? s.dayAngleNarrow : undefined) ?? s.dayAngle;
      const mul = (narrow ? s.dayRadiusNarrow : undefined) ?? s.dayRadius ?? 1;
      c.angle = MathUtils.degToRad(deg);
      c.radius = RING_BASE_RADIUS * mul;
      c.holder.rotation.set(0, c.angle + Math.PI, 0);
    }
    // Everybody, further off. See the note on the constant: this is the only
    // thing that changes how big a figure is on screen.
    ring.root.position.y = narrow ? RING_LIFT_NARROW : 0;
    // ...and on a phone, nobody at all. However the portrait seats were
    // solved, five figures and five callouts on a 390px frame came out as a
    // crowd around the closing card, so that frame plays the ending as the sky
    // and the card alone; `FloatingLines` drops the callouts to match and
    // `Finale` brings the card in early. The seats above are kept, so this is
    // one line to undo.
    ring.root.visible = !narrow;

    // The shot changed, so the DEV audit should look at the new one.
    auditedRef.current = false;

    camera.aspect = size.width / Math.max(1, size.height);
    camera.fov = dayFov;
    camera.updateProjectionMatrix();
  }, [camera, size, ring, narrow, dayFov]);

  const audit = useCallback(() => {
    if (auditedRef.current) return;
    auditedRef.current = true;

    const seated = ring.chars.length;
    const missingSeat = STUDENTS.filter((s) => !ring.chars.some((c) => c.name === s.en)).map(
      (s) => s.en,
    );
    const missingModel = ring.chars.filter((c) => !c.rig.model).map((c) => c.name);

    if (seated < STUDENT_COUNT || missingModel.length > 0) {
      console.error(
        `[finale] ${seated - missingModel.length} of ${STUDENT_COUNT} students rendered.` +
          (missingSeat.length ? ` No ring seat built for: ${missingSeat.join(', ')}.` : '') +
          (missingModel.length
            ? ` Still on the blocky stand-in: ${missingModel.join(', ')}.`
            : ''),
      );
    } else if (import.meta.env.DEV) {
      const probe = new Vector3();
      camera.updateMatrixWorld();
      // The live values, not the authored ones: this log is the tool you tune
      // the portrait seat table with, and it has to describe the shot on
      // screen. `headNdc` is the head's CENTRE — a face is about 0.47 of NDC
      // wide on a portrait frame, so read the margin, not just the sign.
      console.info(
        `[finale] all ${seated} students rendered — ${narrow ? 'portrait' : 'wide'} shot, ` +
          `aspect ${camera.aspect.toFixed(3)}, fov ${camera.fov.toFixed(1)}, ` +
          `scale ${RING_SCALE}, base radius ${RING_BASE_RADIUS} m`,
        ring.chars.map((c) => {
          const pos = c.holder.position;
          const ndc = headAt(c, probe).clone().project(camera);
          return {
            name: c.name,
            position: [+pos.x.toFixed(3), 0, +pos.z.toFixed(3)],
            yawDeg: +MathUtils.radToDeg(c.holder.rotation.y).toFixed(1),
            tiltDeg: +MathUtils.radToDeg(c.lean).toFixed(1),
            headNdc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3)],
          };
        }),
      );
    }
  }, [ring, camera, narrow]);

  // Shadow casting is a per-mesh flag, so the quality tier can toggle it on
  // the figures that already exist rather than forcing a rebuild.
  useEffect(() => {
    ring.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.castShadow = settings.characterShadows;
    });
  }, [ring, settings.characterShadows]);

  useEffect(() => {
    dayState.chars = ring.chars;
    return () => {
      dayState.chars = [];
    };
  }, [ring]);

  useEffect(
    () => () => {
      for (const c of ring.chars) c.rig.dispose();
    },
    [ring],
  );

  // ---- the finale models, loaded during the white-out --------------------
  useEffect(() => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let cancelled = false;

    const load = async (c: DayChar): Promise<boolean> => {
      const s = STUDENTS[c.index];
      // The street mesh is the understudy: if the finale export is missing or
      // fails, wearing the street model is far better than standing in the
      // ring as a blocky placeholder.
      const url = s?.dayModelUrl || s?.modelUrl;
      if (!url) return false;

      const gltf = await loader.loadAsync(assetUrl(url));
      // Cancelled, or the rig was rebuilt under us — either way this model
      // has nowhere to go, so report failure and let a later pass retry.
      if (cancelled || c.rig.model) return false;

      const root = gltf.scene;
      const box = new Box3().setFromObject(root);
      const height = box.getSize(new Vector3()).y;
      const k = height > 0.01 ? MODEL_TARGET_H / height : 1;
      root.scale.setScalar(k);
      root.position.y = -box.min.y * k;
      root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = shadowsRef.current;
        // These are scanned shells of thousands of islands; culling each one
        // costs more than it saves.
        mesh.frustumCulled = false;
        if (!mesh.geometry.attributes['normal']) mesh.geometry.computeVertexNormals();

        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of materials) {
          const std = m as MeshStandardMaterial;
          // Photogrammetry shells are thin and often single-sided the wrong
          // way round; without this you see through people.
          std.side = DoubleSide;
          std.flatShading = false;
          // Fully opaque, and it stays that way: the finale never fades a
          // student, so nothing here may leave one half-there.
          std.transparent = false;
          std.opacity = 1;
          std.depthWrite = true;
          std.needsUpdate = true;
        }
      });

      const wrap = new Group();
      wrap.position.y = -c.rig.hipY;
      c.rig.upper.add(wrap);
      wrap.add(root);
      for (const mesh of c.rig.bodyMeshes) mesh.visible = false;
      c.rig.torso = wrap;
      c.rig.torsoBase = [1, 1];
      c.rig.headAnchor = attachModelHeadAnchor(wrap);
      c.rig.model = root;
      return true;
    };

    // A catch-up, not the main path.
    //
    // Normally every finale mesh is already attached by the time this runs:
    // `StudentRow` fetches each one off the back of that student's street
    // model, minutes of scrolling earlier. This exists for the cases where
    // that never happened — the street was skipped, or a fetch failed — and
    // it deliberately waits until the white-out so it cannot compete with the
    // street's downloads for bandwidth.
    //
    // A student is recorded as done only once their model is actually
    // attached. Marking on dispatch would strand anyone hit by an
    // interruption as a blocky stand-in for good, because the retry would
    // skip them.
    const catchUp = async (): Promise<void> => {
      for (const c of ring.chars) {
        if (cancelled) return;
        if (loadedRef.current.has(c.name) || c.rig.model) continue;
        try {
          if (await load(c)) loadedRef.current.add(c.name);
        } catch (err) {
          console.warn(`finale model failed for ${c.name} — keeping the built figure`, err);
        }
      }
    };

    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (frameState.p < CATCH_UP_FROM) return;
      window.clearInterval(timer);
      void catchUp();
    }, 400);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // Deliberately not keyed on the quality tier: re-running this mid-download
    // is what stranded a student on the blocky figure. The shadow effect above
    // picks up loaded meshes too, since they hang off the rigs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring]);

  // -------------------------------------------------------------- petals
  const petals = useMemo(
    () =>
      createPetalField({
        count: QUALITY[quality].wakePetals,
        map: textures.glow,
        colours: ['#ffe0a8', '#ffb7cc'],
        spread: [8, 9, -4, 8],
        fall: [0.72, 1.92],
        size: [0.14, 0.28],
        span: 12.4,
        floor: 0.6,
        seed: 0x0e7a15,
      }),
    [quality, textures.glow],
  );

  // The finale petals are seen through the day camera.
  useFieldPixelScale(petals.uniforms.uPixelScale, dayFov);

  // Unlit, and it has to stay that way. This is a radius-400 sphere rendered
  // from the inside, so a lit material would be multiplied by the hemisphere,
  // sun, rim and up-key together and clip to white — the sky stops being sky
  // and the whole scene reads as fog.
  const domeMat = useMemo(
    () =>
      new MeshBasicMaterial({
        map: textures.daySky,
        side: BackSide,
        fog: false,
      }),
    [textures.daySky],
  );

  const glareMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#fff2c8'),
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );
  const flareMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#ffd7a0'),
        transparent: true,
        opacity: 0.35,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );

  useEffect(
    () => () => {
      domeMat.dispose();
      glareMat.dispose();
      flareMat.dispose();
    },
    [domeMat, glareMat, flareMat],
  );

  // ---------------------------------------------------------------- update
  const update = useCallback(
    (f: FrameState) => {
      if (!GATES.isDay(f.p)) return;
      const { time } = f;

      if (f.p >= AUDIT_AT) audit();

      // The camera breathes. It is a person on their back, not a tripod.
      camera.position.set(
        Math.sin(time * 0.21) * 0.05,
        CAMERA_Y + Math.sin(time * 0.9) * 0.02,
        Math.cos(time * 0.17) * 0.05,
      );
      camera.up.set(Math.sin(time * 0.11) * 0.03, 0, -1);
      camera.lookAt(Math.sin(time * 0.13) * 0.4, 30, Math.cos(time * 0.1) * 0.4);

      // Both together: a DPR-only change republishes the aspect without
      // re-running the effect above, and a camera holding one shot's fov with
      // the other shot's aspect is four students out of frame.
      const aspect = (mainCamera as PerspectiveCamera).aspect;
      const wantFov = aspect < NARROW_ASPECT ? DAY_FOV_NARROW : CAMERA_FOV;
      if (camera.aspect !== aspect || camera.fov !== wantFov) {
        camera.aspect = aspect;
        camera.fov = wantFov;
        camera.updateProjectionMatrix();
      }
      if (domeRef.current) domeRef.current.rotation.y = time * 0.004;

      const wake = GATES.wake(f.p);

      for (const c of ring.chars) {
        const r = c.rig;

        // Arriving: out at the frame edge as the blur clears, closing in over
        // the lens by the end of the wake ramp. `e` is this student's own
        // progress through that, and it scales the lean and the gestures too,
        // so somebody still travelling is not already posed.
        const e = sstep(c.enter, Math.min(1, c.enter + RING_ENTER_SPAN), wake);
        // A fixed 2.4 m run is most of a portrait seat's whole radius — the
        // nearest student would start out at four times their final distance
        // and the wake would read as a stampede rather than a gathering.
        const enterFrom = Math.min(RING_ENTER_FROM, c.radius * 0.7);
        const rad = c.radius + (1 - e) * enterFrom;
        c.holder.position.set(Math.sin(c.angle) * rad, 0, Math.cos(c.angle) * rad);
        r.grp.visible = e > 0.01;

        r.upper.rotation.x = c.lean * e + Math.sin(time * 1.2 + c.index) * 0.03 * e;
        // The neck carries the last of the look-down, on top of the hip tilt.
        r.head.rotation.x = 0.2 * e + Math.sin(time * 0.8 + c.index) * 0.03;
        r.head.rotation.y = Math.sin(time * 0.35 + c.index * 1.7) * 0.12;

        const cycle = 3 + (c.index % 5) * 0.5;
        const bt = (time + c.index * 0.7) % cycle;
        const closed = bt < 0.13 ? Math.sin((bt / 0.13) * Math.PI) : 0;
        const say = c.say;
        r.setFace(
          closed > 0.5 ? 'blink' : c.gesture === 'laugh' || say > 0.4 ? 'grin' : 'smile',
        );

        // Reacting to their own line as it floats up.
        r.head.rotation.x += Math.sin(Math.min(say, 1) * Math.PI) * 0.16;
        r.upper.rotation.x += Math.abs(Math.sin(time * 3 + c.index)) * 0.05 * say;
        if (c.gesture === 'smile' || c.gesture === 'reach') {
          r.arms.shL.rotation.x = -0.4 - 1.4 * say;
        }

        switch (c.gesture) {
          case 'wave':
            r.arms.shR.rotation.set(-2.3 * e, 0, 0.5 * e);
            r.arms.elR.rotation.z = Math.sin(time * 5) * 0.45 * e;
            break;
          case 'thumbs':
            r.arms.shR.rotation.set(-1.6 * e, 0, 0.2);
            r.arms.elR.rotation.x = -1.1 * e;
            break;
          case 'reach':
            r.arms.shR.rotation.set(0.9 * e, 0, 0.1);
            r.arms.elR.rotation.x = -0.2;
            r.arms.shL.rotation.set(0.7 * e, 0, -0.15);
            break;
          case 'laugh':
            r.upper.rotation.x += Math.abs(Math.sin(time * 3.2 + c.index)) * 0.06 * e;
            r.head.rotation.x -= 0.15 * e;
            break;
          default:
            r.arms.shL.rotation.set(-0.4, 0, -0.3 - Math.sin(time * 0.7 + c.index) * 0.05);
            break;
        }

        r.torso.scale.set(
          r.torsoBase[0],
          1 + Math.sin(time * 1.5 + c.index) * 0.016,
          r.torsoBase[1],
        );
      }

      petals.uniforms.uTime.value = time;
      petals.uniforms.uOpacity.value = 0.9 * GATES.dayPetals(f.p);
    },
    [audit, camera, mainCamera, petals, ring],
  );

  useUpdate('day', update);

  return createPortal(
    <>
      <mesh ref={domeRef} material={domeMat} rotation-z={0.4}>
        <sphereGeometry args={[400, 32, 24]} />
      </mesh>

      {/* The sun sits just outside the frame, so it flares rather than glares. */}
      <sprite material={glareMat} scale={[260, 260, 1]} position={[120, 300, -140]} />
      <sprite material={flareMat} scale={[22, 22, 1]} position={[-3, 30, 6]} />

      <hemisphereLight args={['#cfe4ff', '#d3b58a', 1.2]} />
      {/*
        At the lens, so the faces leaning in are lit from the viewer's side.

        `decay: 2` is inverse-square, so this has to follow `RING_LIFT_NARROW`.
        Raising the ring 2.6 m takes the faces from 3.28 m to 5.88 m, which is
        31% of the light — so portrait needs MORE, not less. 7 × (5.88/3.28)²
        ≈ 22. The old 1.8 was tuned when the portrait ring was nearer than the
        wide one, and pointed the wrong way.
      */}
      <pointLight
        color="#ffe6c4"
        intensity={narrow ? 22 : 7}
        distance={16}
        decay={2}
        position={[0, 0.8, 0]}
      />
      <directionalLight color="#fff0d8" intensity={1.3} position={[0, -6, 0]} />
      <directionalLight
        color="#fff1d6"
        intensity={2.6}
        position={[18, 40, -14]}
        castShadow={settings.shadows}
        shadow-mapSize-width={settings.shadowMapSize}
        shadow-mapSize-height={settings.shadowMapSize}
        shadow-bias={-0.001}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <directionalLight color="#ffe9c4" intensity={1.3} position={[-14, 26, 16]} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[60, 40]} />
        <meshStandardMaterial color="#4b7a3a" roughness={0.95} />
      </mesh>

      <primitive object={ring.root} />
      <SpriteField geometry={petals.geometry} material={petals.material} />
    </>,
    scene,
  );
}
