import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MultiplyBlending,
  Object3D,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { surf } from '../students/proportions';
import { mat } from '../../lib/materials';
import { makeRandom, clamp } from '../../lib/math';
import { gltfLoader } from '../../lib/modelPipeline';
import {
  drawAIPanel,
  drawArtistCanvas,
  drawBusinessScreen,
  drawCodePanel,
  drawCodeScreen,
  drawFieldNotebook,
  drawKeyboard,
  drawSpecimenTray,
  drawTrainingLog,
  drawWindowPanes,
  makeTexture,
} from './propTextures';
import { assetUrl, type PropKind, type StudentConfig } from '../../config/students';
import type { TextureLibrary } from '../../textures/library';

export interface PropContext {
  /** The student's own group — most kits parent here. */
  readonly host: Group;
  /** The easel group; only the artist's kit builds onto it. */
  readonly easel: Group;
  readonly side: -1 | 1;
  readonly student: StudentConfig;
  readonly textures: TextureLibrary;
  /**
   * Upload and compile a fetched model before it is shown. The street's to
   * supply, because it holds the renderer; without it a model goes in as it
   * arrives and pays for itself on its first frame.
   */
  readonly stage?: ((root: Object3D) => Promise<void>) | undefined;
}

export interface PropRig {
  /** Called each frame with wall time and the owner's focus strength. */
  update: (time: number, focus: number) => void;
  dispose: () => void;
}

const CYAN = '#7fe6ff';

function put(
  parent: Object3D,
  geometry: BufferGeometry,
  material: Material,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}

function glowSprite(map: PropContext['textures']['glow'], colour: string, opacity: number, sx: number, sy: number): Sprite {
  const m = new SpriteMaterial({
    map,
    color: new Color(colour),
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const s = new Sprite(m);
  s.scale.set(sx, sy, 1);
  return s;
}

/**
 * A drifting panel that only exists while its owner is being framed.
 *
 * The `lead` stagger means the three panels of a set do not all appear at
 * once — they arrive in sequence as the camera settles, which reads as the
 * work coming to life rather than a UI switching on.
 */
interface Floater {
  readonly sprite: Sprite;
  readonly y0: number;
  readonly phase: number;
  readonly amp: number;
  readonly lead: number;
}

function updateFloaters(floaters: Floater[], time: number, focus: number): void {
  for (const f of floaters) {
    f.sprite.position.y = f.y0 + Math.sin(time * 0.5 + f.phase) * f.amp;
    f.sprite.material.rotation = Math.sin(time * 0.3 + f.phase) * 0.05;
    f.sprite.material.opacity = clamp(focus * 1.5 - f.lead, 0, 1) * 0.9;
  }
}

const NOOP: PropRig = { update: () => undefined, dispose: () => undefined };

/** Build the staged set that belongs to one profession. */
export function buildProps(kind: PropKind, ctx: PropContext): PropRig {
  switch (kind) {
    case 'artist':
      return artistProps(ctx);
    case 'programmer':
      return programmerProps(ctx);
    case 'researcher':
      return researcherProps(ctx);
    case 'business':
      return businessProps(ctx);
    case 'ai':
      return aiProps(ctx);
    default:
      return NOOP;
  }
}

/**
 * Where a fetched model stands, in whatever group it is hung on.
 *
 * Positions are in the parent's own local space, because that is the space
 * each kit already thinks in — the ground under a student for the artist's
 * canvas, the surface of the crate desk for the programmer's doll.
 */
interface Placement {
  readonly x: number;
  /** Height of the surface it stands on. Ground is 0. */
  readonly y: number;
  readonly z: number;
  /** Turned off-square, generally back toward the lens. */
  readonly yaw: number;
  /** Tipped forward or back. Positive tips the top away. */
  readonly lean?: number;
  /** Overall height in parent units. The built figure is 3.42 for scale. */
  readonly height: number;
  /** Radius of the contact disc under it. */
  readonly contact: number;
  readonly contactOpacity?: number;
}

/**
 * Fetch a generated model and stand it somewhere in a staged set.
 *
 * The fetch is deliberately fire-and-forget, and deliberately not part of the
 * sequential student-model queue: every set is complete without its centre-
 * piece, so a slow or failed fetch costs one prop and nothing else.
 *
 * It is also deliberately started from the returned rig's first `update`
 * rather than from here. Prop kits are built inside a `useMemo`, and under
 * StrictMode that factory runs twice — so half the rigs built are thrown away
 * before they are ever rendered, and anything attached asynchronously has an
 * even chance of landing on the discarded one. `update` only ever reaches the
 * rig that was actually committed, which is why the student models are loaded
 * from a frame callback too.
 */
function addModel(
  parent: Group,
  url: string,
  place: Placement,
  textures: PropContext['textures'],
  label: string,
  stage: PropContext['stage'],
): PropRig {
  const stand = new Group();
  stand.position.set(place.x, place.y, place.z);
  stand.rotation.set(place.lean ?? 0, place.yaw, 0);
  parent.add(stand);

  // A multiply disc underneath. Without it the model floats, exactly as the
  // figures do without theirs — and these cast no shadow, so there is nothing
  // else grounding them.
  const contactMat = new MeshBasicMaterial({
    map: textures.glow,
    color: '#000000',
    transparent: true,
    opacity: place.contactOpacity ?? 0.4,
    blending: MultiplyBlending,
    depthWrite: false,
  });
  const contactGeo = new CircleGeometry(place.contact, 20);
  const contact = new Mesh(contactGeo, contactMat);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(place.x, place.y + place.contact * 0.04, place.z);
  contact.renderOrder = -1;
  parent.add(contact);

  let started = false;
  const owned: { dispose: () => void }[] = [contactGeo, contactMat];

  const fetchOnce = (): void => {
    if (started) return;
    started = true;
    gltfLoader()
      .loadAsync(assetUrl(url))
      .then((gltf) => {
        const root = gltf.scene;

        // Scale by height and plant the base on the surface, so the placement
        // above stays readable when the export changes.
        const box = new Box3().setFromObject(root);
        const size = box.getSize(new Vector3());
        const k = size.y > 0.001 ? place.height / size.y : 1;
        root.scale.setScalar(k);
        root.position.y = -box.min.y * k;

        root.traverse((o) => {
          const mesh = o as Mesh;
          if (!mesh.isMesh) return;
          // Lit by the same key and rim as its owner. Shadows stay off: these
          // are tens of thousands of triangles for a contact patch the disc
          // above already draws, and the shadow tier is toggled on a traversal
          // that ran long before this arrived.
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          owned.push(mesh.geometry);
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of materials) {
            const std = m as MeshStandardMaterial;
            std.envMapIntensity = 0.9;
            std.needsUpdate = true;
            owned.push(std);
          }
        });

        // Uploaded and compiled before it is shown, like the figures.
        return (stage ? stage(root) : Promise.resolve()).then(() => {
          stand.add(root);
        });
      })
      .catch((err: unknown) => {
        console.warn(`${label} failed to load (${url}) — the set stands without it`, err);
      });
  };

  return {
    update: fetchOnce,
    // Frees what has been uploaded; it does not detach anything. Under
    // StrictMode this runs once on a live rig that is about to be re-mounted,
    // so unparenting the model here would lose it for good — and there is
    // nothing to unparent for on a real unmount, since the whole street group
    // is dropped with it. A fetch still in flight lands on that dead group and
    // is collected with it, having never reached the GPU.
    dispose: () => {
      for (const o of owned) o.dispose();
    },
  };
}

/**
 * Kengkue's finished piece, propped on the ground in front of him.
 *
 * The student group's space is the useful one here: +Z is the way the figure
 * faces, which is also where the camera holds, and +X is the side the easel,
 * the stool and the framed photograph already occupy. So a negative X puts the
 * canvas clear of all three, and a positive Z sets it forward of the light
 * pool under the figure's feet (radius 1.5) rather than on top of it. In frame
 * that lands it in the empty lower-left of the held shot — the half of the
 * composition that is otherwise nothing but road — with the sign still
 * legible beside it.
 *
 * The figure next to it stands 3.42 local units tall, so 1.7 reads as a large
 * canvas a person could just about carry, not a billboard.
 */
const ARTWORK: Placement = {
  x: -2.15,
  y: 0,
  z: 1.75,
  yaw: 0.16,
  /** Tipped back on its frame, the way a canvas rests against a wall. */
  lean: -0.14,
  height: 1.7,
  contact: 1,
};

/** Kengkue: a working easel, spattered, with a stool and a jar of brushes. */
function artistProps({ host, easel, side, student, textures, stage }: PropContext): PropRig {
  const rand = makeRandom(0xa27157);
  const warm = ['#e0632f', '#f0a72c', '#d8b23c', '#c2452f', '#e88a3c', '#f2d06b'] as const;
  const wood = mat('wood', '#7a5836');
  const timbers = [
    [-0.42, 0.16],
    [0.42, 0.16],
    [0, -0.5],
  ] as const;

  // Paint on the timbers and along the ledge — the tell that it is used.
  for (let k = 0; k < 22; k++) {
    const m = surf('fabric', warm[k % 6] as string);
    let bx: number;
    let by: number;
    let bz: number;
    if (k % 4 === 3) {
      bx = (rand() - 0.5) * 1.7;
      by = 1.9 + (rand() - 0.5) * 0.06;
      bz = 0.26;
    } else {
      const L = timbers[k % 3] as readonly [number, number];
      bx = L[0] + (rand() - 0.5) * 0.07;
      by = 0.45 + rand() * 1.35;
      bz = L[1] + 0.055;
    }
    const blob = put(easel, new SphereGeometry(0.028 + rand() * 0.03, 8, 6), m, bx, by, bz);
    blob.scale.set(1, 1.35, 0.35);
    blob.castShadow = false;
  }

  const canvasTex = makeTexture(384, 480, drawArtistCanvas);
  const canvasMat = new MeshStandardMaterial({ map: canvasTex, roughness: 0.85, envMapIntensity: 0.5 });
  put(easel, new BoxGeometry(1.15, 1.45, 0.06), canvasMat, -0.72, 0.86, -0.16, 0, side * 0.5, 0.1);
  put(easel, new BoxGeometry(1.24, 1.54, 0.05), wood, -0.75, 0.86, -0.2, 0, side * 0.5, 0.1);

  const stool = new Group();
  stool.position.set(side * 1.5, 0, -0.5);
  easel.add(stool);
  for (const [lx, lz] of [
    [-0.3, -0.3],
    [0.3, -0.3],
    [-0.3, 0.3],
    [0.3, 0.3],
  ] as const) {
    put(stool, new CylinderGeometry(0.045, 0.05, 1.1, 8), wood, lx, 0.55, lz).castShadow = true;
  }
  put(stool, new CylinderGeometry(0.52, 0.52, 0.09, 16), wood, 0, 1.14, 0);

  const jarMat = new MeshStandardMaterial({
    color: '#cfd8e2',
    roughness: 0.18,
    metalness: 0.1,
    envMapIntensity: 1.2,
    transparent: true,
    opacity: 0.55,
  });
  put(stool, new CylinderGeometry(0.17, 0.15, 0.4, 14), jarMat, -0.16, 1.38, 0.04);

  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    put(
      stool,
      new CylinderGeometry(0.017, 0.017, 0.62, 6),
      mat('wood', '#b0783c'),
      -0.16 + Math.cos(a) * 0.06,
      1.72,
      0.04 + Math.sin(a) * 0.06,
      Math.sin(a) * 0.16,
      0,
      Math.cos(a) * 0.16,
    );
    put(
      stool,
      new CylinderGeometry(0.028, 0.02, 0.13, 6),
      surf('fabric', warm[k % 6] as string),
      -0.16 + Math.cos(a) * 0.11,
      2.02,
      0.04 + Math.sin(a) * 0.11,
      Math.sin(a) * 0.16,
      0,
      Math.cos(a) * 0.16,
    );
  }

  const palette = put(
    stool,
    new CylinderGeometry(0.34, 0.34, 0.035, 20),
    mat('wood', '#8a6a42'),
    0.26,
    1.2,
    -0.06,
    0,
    0,
    0.06,
  );
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const blob = put(
      palette,
      new SphereGeometry(0.055, 10, 8),
      surf('fabric', warm[k] as string),
      Math.cos(a) * 0.19,
      0.03,
      Math.sin(a) * 0.19,
    );
    blob.scale.y = 0.45;
    blob.castShadow = false;
  }

  const artwork = student.artworkUrl
    ? addModel(host, student.artworkUrl, ARTWORK, textures, 'artwork', stage)
    : null;

  return {
    update: (time, focus) => artwork?.update(time, focus),
    dispose: () => {
      canvasTex.dispose();
      artwork?.dispose();
    },
  };
}

/**
 * The figurine on Vanhxay's desk, in the desk group's own local space.
 *
 * The desktop is 1.78 by 1.08 with its surface at y 1.185, and most of it is
 * already spoken for: the laptop sits across the middle (roughly x ±0.51 once
 * its own yaw is taken into account) and the mug is at +0.55. That leaves the
 * strip from -0.89 to -0.51, which is also the side the camera sees past the
 * open lid rather than behind it.
 *
 * Height 0.58 is about 29 cm at the film's scale — a shade taller than the
 * laptop screen beside it, which is what makes it read as a figurine somebody
 * chose to keep there rather than as set dressing.
 */
const DESK_DOLL: Placement = {
  x: -0.63,
  y: 1.185,
  z: 0.32,
  /** Very nearly facing the lens; the rest of the turn is the desk's own. */
  yaw: 0.25,
  height: 0.58,
  /** Tight to the feet. Anything wider reads as a puddle at this crop. */
  contact: 0.14,
  contactOpacity: 0.34,
};

/** Vanhxay: a crate desk, an open laptop lighting his face, drifting code. */
function programmerProps({ host, side, student, textures, stage }: PropContext): PropRig {
  const wood = mat('wood', '#5a4432');
  const dark = surf('leather', '#1e2027');

  const desk = new Group();
  desk.position.set(-side * 1.5, 0, 1.15);
  desk.rotation.y = side * 0.55;
  host.add(desk);

  put(desk, new BoxGeometry(1.7, 1.1, 1.0), wood, 0, 0.55, 0);
  put(desk, new BoxGeometry(1.78, 0.09, 1.08), mat('wood', '#6d5540'), 0, 1.14, 0);
  for (let k = 0; k < 3; k++) {
    put(desk, new BoxGeometry(1.72, 0.04, 0.05), surf('seam', '#3a2c20'), 0, 0.3 + k * 0.3, 0.51);
  }

  const lap = new Group();
  lap.position.set(0, 1.19, 0.06);
  lap.rotation.y = side * 0.35;
  desk.add(lap);
  put(lap, new BoxGeometry(0.86, 0.05, 0.6), dark, 0, 0.03, 0);

  const kbTex = makeTexture(256, 192, drawKeyboard);
  put(lap, new PlaneGeometry(0.82, 0.56), new MeshStandardMaterial({ map: kbTex, roughness: 0.7 }), 0, 0.06, 0, -Math.PI / 2);

  const screenTex = makeTexture(512, 320, drawCodeScreen);
  const screenMat = new MeshStandardMaterial({
    map: screenTex,
    emissiveMap: screenTex,
    emissive: new Color('#ffffff'),
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });
  const lid = new Group();
  lid.position.set(0, 0.05, -0.29);
  lid.rotation.x = -1.16;
  lap.add(lid);
  put(lid, new BoxGeometry(0.86, 0.58, 0.035), dark, 0, 0.29, 0);
  put(lid, new PlaneGeometry(0.78, 0.5), screenMat, 0, 0.29, 0.022);

  // The screen is a real light — that cold wash on his face is the point.
  const screenLight = new PointLight('#8fd0ff', 9.5, 7, 2);
  screenLight.position.set(0, 0.5, 0.3);
  lap.add(screenLight);
  const bounce = glowSprite(textures.glow, '#8fd0ff', 0.2, 2.2, 1.6);
  bounce.position.set(0, 0.6, 0.5);
  lap.add(bounce);

  const cup = new Group();
  cup.position.set(side * -0.55, 1.19, 0.24);
  desk.add(cup);
  const porcelain = surf('pearl', '#f2ece1');
  put(cup, new CylinderGeometry(0.11, 0.09, 0.24, 14), porcelain, 0, 0.12, 0);
  put(cup, new CylinderGeometry(0.095, 0.095, 0.02, 14), surf('fabric', '#4a2c1c'), 0, 0.23, 0);
  put(cup, new TorusGeometry(0.06, 0.018, 8, 14), porcelain, 0.12, 0.13, 0, 0, Math.PI / 2);

  const floaters: Floater[] = [];
  const textiles: ReturnType<typeof makeTexture>[] = [kbTex, screenTex];
  for (let k = 0; k < 3; k++) {
    const tex = makeTexture(320, 160, (g, w, h) => drawCodePanel(g, w, h, 0xc0de + k * 977));
    textiles.push(tex);
    const sprite = new Sprite(
      new SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }),
    );
    sprite.scale.set(1.5, 0.75, 1);
    sprite.position.set(-side * (0.15 + k * 0.45), 3.05 + k * 0.62, 0.75 - k * 0.2);
    host.add(sprite);
    floaters.push({ sprite, y0: sprite.position.y, phase: k * 2.1, amp: 0.22 + k * 0.06, lead: k * 0.12 });
  }

  const doll = student.dollUrl
    ? addModel(desk, student.dollUrl, DESK_DOLL, textures, 'desk doll', stage)
    : null;

  return {
    update: (time, focus) => {
      updateFloaters(floaters, time, focus);
      doll?.update(time, focus);
    },
    dispose: () => {
      textiles.forEach((t) => t.dispose());
      doll?.dispose();
    },
  };
}

/** Namthip: a field bench — a lit specimen case, jars, a microscope. */
function researcherProps({ host, side, textures }: PropContext): PropRig {
  const wood = mat('wood', '#6b5238');
  const steel = surf('metal', '#c3c9d2');
  const paper = surf('fabric', '#f4efe0');

  const bench = new Group();
  bench.position.set(-side * 1.55, 0, 1.1);
  bench.rotation.y = side * 0.5;
  host.add(bench);

  put(bench, new BoxGeometry(2.0, 0.1, 0.94), mat('wood', '#7a5f42'), 0, 1.16, 0);
  put(bench, new BoxGeometry(1.94, 0.07, 0.86), wood, 0, 1.08, 0);
  for (const [lx, lz] of [
    [-0.82, 0.34],
    [0.82, 0.34],
    [-0.82, -0.34],
    [0.82, -0.34],
  ] as const) {
    put(bench, new CylinderGeometry(0.055, 0.062, 1.08, 8), wood, lx, 0.54, lz).castShadow = true;
  }

  // The specimen case is the practical: green light up onto her face.
  const caseGroup = new Group();
  caseGroup.position.set(-0.6, 1.21, -0.02);
  bench.add(caseGroup);
  const caseMat = new MeshStandardMaterial({
    color: '#cfe8d8',
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
    envMapIntensity: 1.2,
    depthWrite: false,
  });
  put(caseGroup, new BoxGeometry(0.56, 0.5, 0.42), caseMat, 0, 0.25, 0);
  put(caseGroup, new BoxGeometry(0.6, 0.05, 0.46), steel, 0, 0.52, 0);
  put(caseGroup, new BoxGeometry(0.6, 0.04, 0.46), steel, 0, 0.02, 0);
  const specimen = put(caseGroup, new SphereGeometry(0.11, 12, 10), surf('fabric', '#7fd8a0'), 0, 0.2, 0);
  specimen.scale.set(1, 0.7, 1);
  const caseLight = new PointLight('#8ff0c0', 6.5, 6, 2);
  caseLight.position.set(0, 0.26, 0.1);
  caseGroup.add(caseLight);
  const caseGlow = glowSprite(textures.glow, '#8ff0c0', 0.24, 1.5, 1.3);
  caseGlow.position.set(0, 0.28, 0.14);
  caseGroup.add(caseGlow);

  const jarMat = new MeshStandardMaterial({
    color: '#e2eee8',
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
    envMapIntensity: 1.1,
  });
  ['#8fd8a8', '#d8c46a', '#c98a6a'].forEach((cc, k) => {
    const jx = 0.1 + k * 0.26;
    put(bench, new CylinderGeometry(0.1, 0.1, 0.34, 14), jarMat, jx, 1.38, 0.2);
    put(bench, new CylinderGeometry(0.095, 0.095, 0.14, 14), surf('fabric', cc), jx, 1.3, 0.2);
    put(bench, new CylinderGeometry(0.105, 0.105, 0.03, 14), steel, jx, 1.56, 0.2);
  });

  const scope = new Group();
  scope.position.set(0.72, 1.21, -0.22);
  scope.rotation.y = -side * 0.4;
  bench.add(scope);
  put(scope, new CylinderGeometry(0.16, 0.19, 0.06, 14), steel, 0, 0.03, 0);
  put(scope, new BoxGeometry(0.08, 0.42, 0.09), steel, -0.04, 0.25, -0.04);
  put(scope, new BoxGeometry(0.2, 0.04, 0.16), steel, 0.03, 0.2, 0.02);
  put(scope, new CylinderGeometry(0.045, 0.05, 0.3, 12), steel, 0.03, 0.5, 0.02, 0.35);
  put(scope, new CylinderGeometry(0.035, 0.045, 0.08, 12), surf('pearl', '#eef3f8'), 0.03, 0.66, 0.08, 0.35);

  const trayTex = makeTexture(256, 160, drawSpecimenTray);
  put(bench, new BoxGeometry(0.78, 0.05, 0.5), new MeshStandardMaterial({ map: trayTex, roughness: 0.85, envMapIntensity: 0.4 }), -0.02, 1.23, 0.3);
  put(bench, new BoxGeometry(0.82, 0.06, 0.54), wood, -0.02, 1.19, 0.3);

  const notebook = new Group();
  notebook.position.set(0.66, 1.22, 0.3);
  notebook.rotation.y = -side * 0.3;
  bench.add(notebook);
  put(notebook, new BoxGeometry(0.52, 0.03, 0.38), paper, 0, 0.02, 0);
  put(notebook, new BoxGeometry(0.54, 0.02, 0.4), surf('fabric', '#6b4a2c'), 0, 0, 0);
  const noteTex = makeTexture(192, 144, drawFieldNotebook);
  put(notebook, new PlaneGeometry(0.48, 0.34), new MeshStandardMaterial({ map: noteTex, roughness: 0.9 }), 0, 0.036, 0, -Math.PI / 2);
  put(notebook, new CylinderGeometry(0.014, 0.014, 0.3, 6), mat('wood', '#c8a24a'), 0.1, 0.05, 0.16, 0, 0, 1.4);

  const lens = new Group();
  lens.position.set(-0.98, 1.22, 0.3);
  lens.rotation.set(-Math.PI / 2, 0, side * 0.4);
  bench.add(lens);
  put(lens, new TorusGeometry(0.12, 0.022, 8, 20), steel, 0, 0, 0);
  put(
    lens,
    new PlaneGeometry(0.22, 0.22),
    new MeshStandardMaterial({
      color: '#dfeef0',
      roughness: 0.05,
      transparent: true,
      opacity: 0.3,
      envMapIntensity: 1.3,
    }),
    0,
    0,
    0.001,
  );
  put(lens, new BoxGeometry(0.05, 0.18, 0.03), surf('fabric', '#3a2c1e'), 0, -0.2, 0);

  return {
    update: () => undefined,
    dispose: () => {
      trayTex.dispose();
      noteTex.dispose();
    },
  };
}

/** Nina: a standing desk, a briefcase, and a lit window behind her. */
function businessProps({ host, side, textures }: PropContext): PropRig {
  const steel = surf('metal', '#b8bfc9');
  const dark = surf('leather', '#221f28');
  const tan = surf('leather', '#7a5236');

  const desk = new Group();
  desk.position.set(-side * 1.5, 0, 1.12);
  desk.rotation.y = side * 0.52;
  host.add(desk);

  put(desk, new BoxGeometry(1.5, 0.08, 0.78), surf('pearl', '#eceff3'), 0, 1.72, 0);
  put(desk, new BoxGeometry(1.42, 0.05, 0.7), dark, 0, 1.67, 0);
  put(desk, new CylinderGeometry(0.09, 0.09, 1.64, 12), steel, 0, 0.84, 0);
  put(desk, new BoxGeometry(0.9, 0.07, 0.56), steel, 0, 0.04, 0);
  put(desk, new BoxGeometry(1.2, 0.5, 0.05), surf('metal', '#9fa7b3'), 0, 1.34, -0.3);

  const folio = new Group();
  folio.position.set(-0.34, 1.77, 0.04);
  folio.rotation.y = -side * 0.28;
  desk.add(folio);
  put(folio, new BoxGeometry(0.62, 0.05, 0.44), tan, 0, 0.02, 0);
  put(folio, new BoxGeometry(0.56, 0.02, 0.4), surf('fabric', '#f6f2e8'), 0, 0.05, 0);
  put(folio, new BoxGeometry(0.09, 0.012, 0.14), steel, 0.26, 0.055, 0);

  const stand = new Group();
  stand.position.set(0.4, 1.76, -0.02);
  stand.rotation.y = side * 0.42;
  desk.add(stand);
  put(stand, new BoxGeometry(0.34, 0.03, 0.24), steel, 0, 0.02, 0);
  const screenTex = makeTexture(320, 448, drawBusinessScreen);
  const slab = new Group();
  slab.position.set(0, 0.04, -0.06);
  slab.rotation.x = -0.32;
  stand.add(slab);
  put(slab, new BoxGeometry(0.42, 0.58, 0.02), dark, 0, 0.28, 0);
  put(
    slab,
    new PlaneGeometry(0.37, 0.52),
    new MeshStandardMaterial({
      map: screenTex,
      emissiveMap: screenTex,
      emissive: new Color('#ffffff'),
      emissiveIntensity: 0.9,
      roughness: 0.28,
    }),
    0,
    0.28,
    0.013,
  );

  const briefcase = new Group();
  briefcase.position.set(side * 0.72, 0, 0.28);
  briefcase.rotation.y = -side * 0.3;
  desk.add(briefcase);
  put(briefcase, new BoxGeometry(0.86, 0.62, 0.18), tan, 0, 0.36, 0, 0, 0, 0.06);
  put(briefcase, new BoxGeometry(0.88, 0.06, 0.2), surf('leather', '#5f3f28'), 0, 0.4, 0, 0, 0, 0.06);
  put(briefcase, new BoxGeometry(0.14, 0.09, 0.05), steel, 0, 0.42, 0.11);
  put(briefcase, new TorusGeometry(0.1, 0.02, 8, 16, Math.PI), tan, 0, 0.7, 0, 0, Math.PI / 2);

  put(desk, new CylinderGeometry(0.075, 0.06, 0.22, 14), surf('pearl', '#f4f1ea'), 0.62, 1.86, 0.2);
  put(desk, new CylinderGeometry(0.08, 0.08, 0.03, 14), surf('fabric', '#3a2c22'), 0.62, 1.98, 0.2);

  // The window is the practical: a cool wash from behind and to one side.
  const window = new Group();
  window.position.set(-side * 5.2, 0, -1.6);
  window.rotation.y = side * 0.42;
  host.add(window);
  const paneTex = makeTexture(256, 384, drawWindowPanes);
  put(window, new BoxGeometry(3.4, 5.0, 0.22), surf('metal', '#8a93a0'), 0, 3.2, 0);
  put(
    window,
    new PlaneGeometry(3.0, 4.6),
    new MeshStandardMaterial({
      map: paneTex,
      emissiveMap: paneTex,
      emissive: new Color('#ffffff'),
      emissiveIntensity: 1.25,
      roughness: 0.25,
      envMapIntensity: 1.1,
    }),
    0,
    3.2,
    0.13,
  );
  const windowLight = new PointLight('#dcebff', 16, 15, 2);
  windowLight.position.set(0, 3.2, 1.4);
  window.add(windowLight);
  const windowGlow = glowSprite(textures.glow, '#dcebff', 0.16, 7, 8);
  windowGlow.position.set(0, 3.2, 1.0);
  window.add(windowGlow);

  return {
    update: () => undefined,
    dispose: () => {
      screenTex.dispose();
      paneTex.dispose();
    },
  };
}

/** Timmy: a workbench, a training run, and a hologram he is clearly proud of. */
function aiProps({ host, side, textures }: PropContext): PropRig {
  const dark = surf('leather', '#1b1d24');
  const steel = surf('metal', '#aeb6c2');

  const desk = new Group();
  desk.position.set(-side * 1.5, 0, 1.14);
  desk.rotation.y = side * 0.52;
  host.add(desk);

  put(desk, new BoxGeometry(1.66, 0.08, 0.86), mat('wood', '#54463a'), 0, 1.2, 0);
  put(desk, new BoxGeometry(1.58, 0.05, 0.78), dark, 0, 1.15, 0);
  for (const [lx, lz] of [
    [-0.72, 0.3],
    [0.72, 0.3],
    [-0.72, -0.3],
    [0.72, -0.3],
  ] as const) {
    put(desk, new CylinderGeometry(0.05, 0.055, 1.12, 8), steel, lx, 0.56, lz).castShadow = true;
  }

  const lap = new Group();
  lap.position.set(-0.2, 1.24, 0.04);
  lap.rotation.y = side * 0.34;
  desk.add(lap);
  put(lap, new BoxGeometry(0.84, 0.05, 0.58), dark, 0, 0.03, 0);

  const logTex = makeTexture(512, 320, drawTrainingLog);
  const logMat = new MeshStandardMaterial({
    map: logTex,
    emissiveMap: logTex,
    emissive: new Color('#ffffff'),
    emissiveIntensity: 1.45,
    roughness: 0.3,
  });
  const lid = new Group();
  lid.position.set(0, 0.05, -0.28);
  lid.rotation.x = -1.14;
  lap.add(lid);
  put(lid, new BoxGeometry(0.84, 0.56, 0.035), dark, 0, 0.28, 0);
  put(lid, new PlaneGeometry(0.76, 0.48), logMat, 0, 0.28, 0.022);

  const screenLight = new PointLight(CYAN, 9, 7.5, 2);
  screenLight.position.set(0, 0.5, 0.32);
  lap.add(screenLight);
  const bounce = glowSprite(textures.glow, CYAN, 0.2, 2.2, 1.6);
  bounce.position.set(0, 0.6, 0.5);
  lap.add(bounce);

  // The holographic plot: additive, unlit, floating above the bench.
  const holo = new Group();
  holo.position.set(0.5, 2.35, 0.02);
  holo.rotation.y = side * 0.3;
  desk.add(holo);
  const axisMat = new MeshBasicMaterial({
    color: new Color(CYAN),
    transparent: true,
    opacity: 0.5,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  put(holo, new BoxGeometry(0.9, 0.008, 0.008), axisMat, 0, -0.3, 0);
  put(holo, new BoxGeometry(0.008, 0.62, 0.008), axisMat, -0.45, 0.01, 0);
  put(holo, new TorusGeometry(0.5, 0.006, 6, 40), axisMat, 0, 0.02, -0.06, 1.35);
  const holoGlow = glowSprite(textures.glow, CYAN, 0.14, 1.9, 1.5);
  holoGlow.position.set(0, 0.05, -0.05);
  holo.add(holoGlow);

  const barValues = [0.3, 0.46, 0.4, 0.62, 0.78, 0.9];
  const bars = barValues.map((v, k) => {
    const m = new MeshBasicMaterial({
      color: new Color(CYAN),
      transparent: true,
      opacity: 0.36,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const bar = put(holo, new BoxGeometry(0.075, 1, 0.03), m, -0.36 + k * 0.145, -0.3, 0);
    return { bar, value: v, phase: k * 0.7, material: m };
  });

  const floaters: Floater[] = [];
  const owned = [logTex];
  for (let k = 0; k < 3; k++) {
    const tex = makeTexture(320, 168, (g, w, h) => drawAIPanel(g, w, h, k));
    owned.push(tex);
    const sprite = new Sprite(
      new SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }),
    );
    sprite.scale.set(1.5, 0.79, 1);
    sprite.position.set(-side * (0.2 + k * 0.42), 3.15 + k * 0.6, 0.7 - k * 0.18);
    host.add(sprite);
    floaters.push({ sprite, y0: sprite.position.y, phase: k * 1.9, amp: 0.2 + k * 0.06, lead: k * 0.12 });
  }


  return {
    update: (time, focus) => {
      const fo = clamp(focus * 1.5, 0, 1);
      for (const b of bars) {
        // Each bar breathes around its value, so the plot reads as live data.
        const v = b.value * (0.82 + Math.sin(time * 1.4 + b.phase) * 0.18);
        const height = Math.max(0.001, v * 0.6 * fo);
        b.bar.scale.y = height;
        b.bar.position.y = -0.3 + height / 2;
        b.material.opacity = 0.36 * fo;
      }
      updateFloaters(floaters, time, focus);
    },
    dispose: () => owned.forEach((t) => t.dispose()),
  };
}
