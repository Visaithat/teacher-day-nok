import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  LOD,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  Object3D,
  PlaneGeometry,
  PointLight,
  Raycaster,
  SpotLight,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { attachModelHeadAnchor, buildBlockyRig } from './blockyRig';
import { animateStudent, type StudentInstance } from './animateStudent';
import { buildProps, type PropRig } from '../props/buildProps';
import { useTextures } from '../../textures/TextureProvider';
import { mat } from '../../lib/materials';
import { clamp } from '../../lib/math';
import {
  ACTIVE_HOLD_THRESHOLD,
  GATES,
  MOUNT,
  STUDENT_OFFSET_X,
  studentZ,
} from '../../config/timeline';
import { STUDENTS, assetUrl, sideFor } from '../../config/students';
import { useUpdate } from '../../lib/updateBus';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import { frame as frameState, type FrameState } from '../../state/frame';
import { dayState } from '../../scenes/dayChars';

/** How far the sign stands off the chest. */
const SIGN_OUT = 0.18;
/** The built figure's total height; loaded models are scaled to match. */
const MODEL_TARGET_H = 3.42;
/** Distance at which the low-poly model takes over. */
const LOD_DISTANCE = 26;

const scratchWorld = new Vector3();
const scratchNdc = new Vector2();

interface StreetStudent extends StudentInstance {
  readonly signMat: MeshStandardMaterial;
  readonly props: PropRig | null;
  readonly fitFrame: (aspect: number) => void;
}

/**
 * Fetch this student's finale mesh and hang it on their ring rig.
 *
 * Deliberately fire-and-forget: the street must not wait on it, and a failure
 * must not disturb the street model that has just been attached. If the finale
 * export is missing or fails, the street mesh is cloned instead — that shares
 * geometry and materials, so it costs no extra fetch and the ring is never
 * left showing a blocky stand-in.
 */
async function attachFinaleModel(
  c: StreetStudent,
  loader: GLTFLoader,
  prep: (root: Object3D) => Object3D,
  streetHolder: Object3D,
): Promise<void> {
  const day = dayState.chars.find((d) => d.name === c.config.en);
  if (!day || day.rig.model) return;

  let mesh: Object3D | null = null;
  if (c.config.dayModelUrl) {
    try {
      mesh = prep((await loader.loadAsync(assetUrl(c.config.dayModelUrl))).scene);
    } catch (err) {
      console.warn(`finale model failed for ${c.config.en} — cloning the street mesh`, err);
    }
  }
  // Raced by the finale's own catch-up loader, or the rig was rebuilt.
  if (day.rig.model) return;
  if (!mesh) {
    // Clone the detailed level, not the LOD wrapper: a cloned LOD would never
    // be registered for distance updates and would sit at level 0 anyway, so
    // the wrapper is dead weight. The finale camera is close regardless.
    const source = streetHolder instanceof LOD ? (streetHolder.levels[0]?.object ?? streetHolder) : streetHolder;
    mesh = source.clone(true);
  }

  const wrap = new Group();
  wrap.position.y = -day.rig.hipY;
  day.rig.upper.add(wrap);
  wrap.add(mesh);
  for (const m of day.rig.bodyMeshes) m.visible = false;
  day.rig.torso = wrap;
  day.rig.torsoBase = [1, 1];
  day.rig.headAnchor = attachModelHeadAnchor(wrap);
  day.rig.model = mesh;
}

/**
 * The street: five people, each waiting to be walked past.
 *
 * Everything a student needs travels with them — the sign in their hands, the
 * framed photo on an easel beside them, the name plate above, the pool of
 * light they stand in, and their own staged set of props. The two real lights
 * (a rim and a key at 45°) are shared and moved to whoever is being framed,
 * because only one person is ever in shot.
 *
 * The generated models are fetched lazily: nothing downloads until the camera
 * is well into the descent, and only one at a time, so the request for the
 * student you are about to meet is never queued behind four others.
 */
export function StudentRow(): React.ReactElement {
  const textures = useTextures();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const quality = useUIStore((s) => s.quality);
  const settings = QUALITY[quality];

  const rimRef = useRef<PointLight>(null);
  const keyRef = useRef<SpotLight>(null);
  const raycaster = useMemo(() => new Raycaster(), []);
  const loadedRef = useRef(new Set<string>());
  const busyRef = useRef(false);
  const lodsRef = useRef<LOD[]>([]);
  const shadowsRef = useRef(settings.characterShadows);
  shadowsRef.current = settings.characterShadows;

  // ---------------------------------------------------------------- build
  const built = useMemo(() => {
    const root = new Group();
    const students: StreetStudent[] = [];

    STUDENTS.forEach((s, i) => {
      const side = sideFor(i);
      const z = studentZ(i);

      const group = new Group();
      group.position.set(side * STUDENT_OFFSET_X, 0, z);
      group.scale.setScalar(1.3);
      group.rotation.y = side < 0 ? 0.5 : -0.5;
      root.add(group);

      const faces = textures.faces[i];
      if (!faces) return;

      // Shadows are toggled separately. Rebuilding a rig on a tier change
      // would discard any model already attached to it.
      const rig = buildBlockyRig(s, { faces, castShadow: true });
      group.add(rig.grp);

      // ---- the sign, measured from the posed hands ----------------------
      const signTexture = textures.signs[i];
      const signMat = new MeshStandardMaterial({
        ...(signTexture ? { map: signTexture } : {}),
        roughness: 0.42,
        metalness: 0.03,
        envMapIntensity: 0.8,
        emissive: new Color('#ffffff'),
        emissiveIntensity: 0,
      });

      group.updateMatrixWorld(true);
      const vL = rig.upper.worldToLocal(rig.arms.handL.getWorldPosition(new Vector3()));
      const vR = rig.upper.worldToLocal(rig.arms.handR.getWorldPosition(new Vector3()));
      const span = Math.abs(vR.x - vL.x);
      const bw = clamp((span - 0.06) * 1.32, 0.8, rig.boardMax * 1.7);
      const bh = bw / 1.62;

      const sign = new Group();
      const cy = (vL.y + vR.y) / 2 - 0.04;
      sign.position.set((vL.x + vR.x) / 2, cy, (vL.z + vR.z) / 2 - 0.02 + SIGN_OUT);
      sign.rotation.set(-0.46, 0, 0.02);
      rig.upper.add(sign);

      const woodSide = mat('wood', '#6d4c2c');
      const boardMats: Material[] = [
        woodSide,
        woodSide,
        woodSide,
        woodSide,
        signMat,
        woodSide,
      ];
      const board = new Mesh(new BoxGeometry(bw, bh, 0.06), boardMats);
      board.castShadow = settings.characterShadows;
      sign.add(board);

      const edge = new Mesh(new BoxGeometry(bw + 0.08, bh + 0.08, 0.045), woodSide);
      edge.position.z = -0.035;
      sign.add(edge);
      const batten = new Mesh(new BoxGeometry(bw + 0.1, 0.1, 0.05), mat('wood', '#5a3d22'));
      batten.position.set(0, -bh * 0.36, -0.06);
      sign.add(batten);

      // ---- the framed photograph on its easel ---------------------------
      const photoFrame = new Group();
      photoFrame.rotation.set(0.1, side * 0.34, 0);
      group.add(photoFrame);

      const photoTexture = textures.photos[i];
      const photoMat = new MeshStandardMaterial({
        ...(photoTexture ? { map: photoTexture } : {}),
        roughness: 0.6,
        envMapIntensity: 0.5,
      });

      const unit = new BoxGeometry(1, 1, 0.16);
      const fr = new Mesh(unit, mat('wood', '#7a5a38'));
      fr.castShadow = settings.characterShadows;
      const mount = new Mesh(new BoxGeometry(1, 1, 0.02), mat('coat', '#f4efe4'));
      mount.position.z = 0.085;
      const backing = new Mesh(new BoxGeometry(1, 1, 0.03), mat('wood', '#4d3722'));
      backing.position.z = -0.085;
      const photo = new Mesh(new PlaneGeometry(1, 1), photoMat);
      photo.position.z = 0.1;
      const glass = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshStandardMaterial({
          color: '#dbe9ff',
          roughness: 0.06,
          metalness: 0,
          transparent: true,
          opacity: 0.07,
          envMapIntensity: 0.6,
          depthWrite: false,
        }),
      );
      glass.position.z = 0.115;
      const gleam = new Mesh(
        new PlaneGeometry(0.62, 1),
        new MeshBasicMaterial({
          map: textures.gleam,
          transparent: true,
          opacity: 0.12,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      gleam.rotation.z = 0.42;
      photoFrame.add(fr, mount, backing, photo, glass, gleam);

      const easel = new Group();
      easel.position.set(side * 1.9, 0, 1.5);
      easel.rotation.y = side * 0.34;
      group.add(easel);
      const legMat = mat('wood', '#6a4a2b');
      for (const [lx, lz] of [
        [-0.42, 0.16],
        [0.42, 0.16],
        [0, -0.5],
      ] as const) {
        const leg = new Mesh(new CylinderGeometry(0.055, 0.07, 2.0, 8), legMat);
        leg.position.set(lx, 0.98, lz);
        leg.rotation.set(-lz * 0.3, 0, lx * 0.16);
        leg.castShadow = settings.characterShadows;
        easel.add(leg);
      }
      const ledge = new Mesh(new BoxGeometry(1.9, 0.1, 0.24), legMat);
      ledge.position.set(0, 1.9, 0.14);
      easel.add(ledge);

      /** Resize the frame around whatever aspect the real photo turns out to be. */
      const fitFrame = (aspect: number): void => {
        let pw = 2.0 * aspect;
        let ph = 2.0;
        if (pw > 2.4) {
          pw = 2.4;
          ph = 2.4 / aspect;
        }
        const mw = pw + 0.22;
        const mh = ph + 0.32;
        const fw = pw + 0.4;
        const fh = ph + 0.5;
        photo.scale.set(pw, ph, 1);
        mount.scale.set(mw, mh, 1);
        glass.scale.set(mw, mh, 1);
        backing.scale.set(pw + 0.26, ph + 0.36, 1);
        fr.scale.set(fw, fh, 1);
        gleam.scale.set(1, mh, 1);
        gleam.position.set(-mw * 0.275, 0, 0.12);
        photoFrame.position.set(side * 1.9, 1.95 + fh / 2, 1.42);
        ledge.scale.x = Math.max(1, (fw - 0.1) / 1.9);
      };
      fitFrame(0.8);

      // ---- ground contact, light pool, name plate ------------------------
      // A multiply disc under the feet. Without it the figures float, and no
      // amount of real shadow map fixes that at this scale.
      const ao = new Mesh(
        new CircleGeometry(1.5, 24),
        new MeshBasicMaterial({
          map: textures.glow,
          color: '#000000',
          transparent: true,
          opacity: 0.42,
          blending: MultiplyBlending,
          depthWrite: false,
        }),
      );
      ao.rotation.x = -Math.PI / 2;
      ao.position.y = 0.035;
      ao.renderOrder = -1;
      group.add(ao);

      const poolMat = new MeshBasicMaterial({
        map: textures.glow,
        color: '#ffd08a',
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const pool = new Mesh(new CircleGeometry(3.0, 28), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.06;
      group.add(pool);

      const spotMat = new SpriteMaterial({
        map: textures.glow,
        color: new Color('#ffe0ab'),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const spot = new Sprite(spotMat);
      spot.scale.set(5.5, 9, 1);
      spot.position.set(0, 3.4, -0.6);
      group.add(spot);

      const labelTexture = textures.labels[i];
      const labelMat = new SpriteMaterial({
        ...(labelTexture ? { map: labelTexture } : {}),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
      });
      const label = new Sprite(labelMat);
      label.scale.set(2.4, 0.6, 1);
      label.position.set(-side * 0.8, 5.35, 0);
      label.renderOrder = 5;
      group.add(label);

      // ---- the staged props ---------------------------------------------
      const props = s.props ? buildProps(s.props, { host: group, easel, side, student: s, textures }) : null;

      students.push({
        index: i,
        config: s,
        group,
        rig,
        sign,
        signY0: cy,
        frame: photoFrame,
        side,
        baseRot: group.rotation.y,
        // The arm away from the camera is the one that is free to move.
        waveArm: side < 0 ? 'L' : 'R',
        gesture: s.greeting,
        hit: rig.hit,
        poolMat,
        spotMat,
        labelMat,
        label,
        idlePhase: i * 2.37 + (i % 3) * 0.9,
        idleSpeed: 0.9 + ((i * 37) % 21) / 100,
        speed: 0.9 + ((i * 37) % 21) / 100,
        phase: (i * 2.399) % 6.28,
        focus: 0,
        notice: 0,
        headWeight: 0,
        bodyWeight: 0,
        leaving: false,
        arriveAt: undefined,
        leftAt: undefined,
        expression: 'neutral',
        signMat,
        props,
        fitFrame,
      });
    });

    return { root, students };
  }, [textures]);

  // Shadow casting is a per-mesh flag: the tier can toggle it on the figures
  // that already exist, loaded models included, without a rebuild.
  useEffect(() => {
    built.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.castShadow = settings.characterShadows;
    });
  }, [built, settings.characterShadows]);

  // ---- real photographs replace the placeholder prints -------------------
  useEffect(() => {
    const loader = new TextureLoader();
    let cancelled = false;
    built.students.forEach((c) => {
      const src = c.config.photo;
      if (!src) return;
      loader.load(
        assetUrl(src),
        (tex) => {
          if (cancelled) return;
          tex.colorSpace = SRGBColorSpace;
          const target = c.frame.children.find(
            (o) => (o as Mesh).isMesh && ((o as Mesh).material as MeshStandardMaterial).map,
          ) as Mesh | undefined;
          void target;
          const photoMesh = c.frame.children[3] as Mesh | undefined;
          if (photoMesh) {
            const m = photoMesh.material as MeshStandardMaterial;
            m.map = tex;
            m.needsUpdate = true;
          }
          if (tex.image) c.fitFrame(tex.image.width / tex.image.height);
        },
        undefined,
        () => {
          /* keep the labelled placeholder */
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [built]);

  // ---- the generated models, fetched one at a time ----------------------
  const loadModel = useCallback(
    async (c: StreetStudent): Promise<void> => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);

      const urls = [c.config.modelUrl, c.config.lodUrl].filter(Boolean).map(assetUrl);
      const gltfs = await Promise.all(urls.map((u) => loader.loadAsync(u)));

      /** Scale to the built figure's height and plant the feet on the ground. */
      const prep = (root: Object3D): Object3D => {
        const box = new Box3().setFromObject(root);
        const size = box.getSize(new Vector3());
        const k = size.y > 0.01 ? MODEL_TARGET_H / size.y : 1;
        root.scale.setScalar(k);
        root.position.y = -box.min.y * k;

        root.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = shadowsRef.current;
          mesh.receiveShadow = shadowsRef.current;
          // These are scanned shells with thousands of islands; culling them
          // individually costs more than it saves.
          mesh.frustumCulled = false;
          if (!mesh.geometry.attributes['normal']) mesh.geometry.computeVertexNormals();

          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of materials) {
            const std = m as MeshStandardMaterial;
            std.flatShading = false;
            std.transparent = false;
            std.opacity = 1;
            std.depthWrite = true;
            // Gold trim needs a little metal to catch the lanterns.
            std.roughness = c.config.goldAccents ? 0.58 : 0.66;
            std.metalness = c.config.goldAccents ? 0.22 : 0.04;
            std.envMapIntensity = c.config.goldAccents ? 1.15 : 0.85;
            std.needsUpdate = true;
          }
        });
        return root;
      };

      let holder: Object3D;
      if (gltfs.length > 1 && gltfs[0] && gltfs[1]) {
        const lod = new LOD();
        lod.addLevel(prep(gltfs[0].scene), 0);
        lod.addLevel(prep(gltfs[1].scene), LOD_DISTANCE);
        lodsRef.current.push(lod);
        holder = lod;
      } else if (gltfs[0]) {
        holder = prep(gltfs[0].scene);
      } else {
        return;
      }

      // Hang it off the hips, so bow, sway and breathing still drive it.
      const wrap = new Group();
      wrap.position.y = -c.rig.hipY;
      c.rig.upper.add(wrap);
      wrap.add(holder);

      // The same student's finale mesh is fetched here, off the back of the
      // street load, rather than by the finale itself. The finale is reached
      // in the last few percent of the scroll; starting five more downloads
      // then would mean a ring of blocky stand-ins while they arrived. This
      // way they are attached and waiting minutes before anyone sees them.
      void attachFinaleModel(c, loader, prep, holder);

      for (const mesh of c.rig.bodyMeshes) mesh.visible = false;
      c.rig.torso = wrap;
      c.rig.torsoBase = [1, 1];
      c.rig.model = holder;
    },
    [],
  );

  // ---- per frame ---------------------------------------------------------
  const update = useCallback(
    (f: FrameState) => {
      const { p, phase, time } = f;
      const active = phase.hold > ACTIVE_HOLD_THRESHOLD ? phase.idx : -1;

      // Queue the next model once the descent is underway.
      if (p > MOUNT.modelLoadStart && !busyRef.current) {
        const next = built.students.find(
          (c) => c.config.modelUrl && !loadedRef.current.has(c.config.en) && !c.rig.model,
        );
        if (next) {
          busyRef.current = true;
          loadModel(next)
            .then(() => {
              // Recorded only on success. Marking on dispatch would strand a
              // student on the blocky stand-in for good after any hiccup.
              loadedRef.current.add(next.config.en);
            })
            .catch((err: unknown) => {
              console.warn(`model load failed for ${next.config.en} — keeping the built figure`, err);
            })
            .finally(() => {
              busyRef.current = false;
            });
        }
      }

      for (const lod of lodsRef.current) lod.update(camera);

      // Hover, desktop only, and only while we are actually on the street.
      let hovered = -1;
      if (f.hasPointer && GATES.studentsInteractive(p) && !f.reduced) {
        scratchNdc.set(f.ndcX, f.ndcY);
        raycaster.setFromCamera(scratchNdc, camera);
        for (const c of built.students) {
          if (raycaster.intersectObject(c.hit, false).length > 0) {
            hovered = c.index;
            break;
          }
        }
      }
      f.hoverStudent = hovered;

      let focusTarget = 26;

      for (const c of built.students) {
        const focus = phase.idx === c.index ? phase.hold : 0;
        c.notice = phase.idx === c.index ? phase.notice : 0;
        const lit = Math.max(focus, hovered === c.index ? 0.8 : 0);
        c.focus = focus;

        const boost = c.config.rimBoost ?? 1;
        c.poolMat.opacity = lit * 0.5;
        c.spotMat.opacity = lit * 0.05 * boost;
        c.signMat.emissiveIntensity = lit * 0.1;

        animateStudent(c, lit, time, camera, f.reduced);

        const labelOn = clamp(focus * 1.4, 0, 1);
        c.labelMat.opacity = labelOn * 0.95;
        c.label.position.y = 5.35 + (1 - labelOn) * 0.35;

        if (focus > 0.05) {
          const cx = c.group.position.x;
          const cz = c.group.position.z;
          const rim = rimRef.current;
          if (rim) {
            rim.position.set(cx * 1.35, 6.4, cz - 3.4);
            rim.intensity = focus * 34 * boost;
          }
          const key = keyRef.current;
          if (key) {
            // Key light at 45 degrees on whichever side the camera is.
            const ang =
              Math.atan2(camera.position.x - cx, camera.position.z - cz) +
              (c.side < 0 ? -0.79 : 0.79);
            key.position.set(cx + Math.sin(ang) * 4.6, 6.6, cz + Math.cos(ang) * 4.6);
            key.target.position.set(cx, 3.5, cz);
            key.target.updateMatrixWorld();
            key.intensity = focus * 42 * boost;
          }
          c.group.getWorldPosition(scratchWorld);
          focusTarget = Math.max(4, camera.position.distanceTo(scratchWorld) + 1.2);
        }

        // Props fade with their owner's focus.
        c.props?.update(time, focus);
      }

      if (active < 0) {
        if (rimRef.current) rimRef.current.intensity = 0;
        if (keyRef.current) keyRef.current.intensity = 0;
      }
      frameState.dofFocusTarget = focusTarget;
    },
    [built, camera, loadModel, raycaster],
  );

  useUpdate('students', update);

  useEffect(() => {
    const key = keyRef.current;
    if (!key) return;
    scene.add(key.target);
    return () => {
      scene.remove(key.target);
    };
  }, [scene]);

  useEffect(
    () => () => {
      for (const c of built.students) {
        c.rig.dispose();
        // The props hold their own textures and, for the artist, a
        // several-megabyte artwork mesh. The street unmounts just as the
        // finale is loading its five models, so this is exactly the wrong
        // moment to be holding GPU memory nobody can see.
        c.props?.dispose();
      }
    },
    [built],
  );

  return (
    <>
      <primitive object={built.root} />
      <pointLight ref={rimRef} color="#ffe0b8" intensity={0} distance={26} decay={2} />
      <spotLight
        ref={keyRef}
        color="#fff0d8"
        intensity={0}
        distance={22}
        angle={0.85}
        penumbra={0.95}
        decay={2}
      />
    </>
  );
}
