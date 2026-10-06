import type {
  Camera,
  Light,
  LOD,
  Material,
  Mesh,
  Object3D,
  Scene,
  Texture,
  WebGLRenderer,
} from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { NIGHT_COMBOS, NIGHT_GROUPS, nightGroups, nightVis } from './nightVisibility';
import { enqueue } from '../lib/gpuQueue';
import { renderTargets } from './renderTargets';

/**
 * Pay for first use behind the loader.
 *
 * three does nothing until it has to. A shader is compiled on the first frame
 * a material is drawn; a texture is uploaded on the first frame it is
 * sampled; a shadow map, the transmission buffer and every post-processing
 * target are allocated on the frame that first needs them. And "a material's
 * shader" is not one program: the lights in the scene are baked into it, so
 * every time a part of the night comes on stage or leaves it, every lit
 * material in view needs a program it has never had.
 *
 * Left alone, all of that lands mid-film, a few hundred milliseconds at a
 * time, on frames where the camera is moving. So before the loader lifts,
 * the film is drawn once in every configuration it will ever be in - each
 * combination of sky, garden and street, then the finale, then the gift box -
 * with culling off, so things that start out of shot are paid for too.
 *
 * Real renders rather than `renderer.compile()`. `compile` cannot reach the
 * depth materials the shadow and bokeh passes draw with, compiles against
 * whichever framebuffer happens to be bound (the composer's is linear, the
 * canvas is not, and that is part of the program key), and uploads nothing.
 * Drawing the frame is the only thing that warms what drawing the frame uses.
 */
export interface PrewarmRig {
  readonly gl: WebGLRenderer;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bokeh: BokehPass;
  readonly opaque: ShaderPass;
  /** The night: R3F's own scene and camera. */
  readonly scene: Scene;
  readonly camera: Camera;
}

let rig: PrewarmRig | null = null;

/** `Renderer` owns the composer; it lends it here for as long as it lives. */
export function bindPrewarm(next: PrewarmRig | null): void {
  rig = next;
}

/** A macrotask, not rAF: rAF never fires in a hidden tab and boot would hang. */
const breathe = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Forced {
  readonly object: Object3D;
  readonly visible: boolean;
  readonly culled: boolean;
}

/**
 * Make everything under `root` drawable for one render, and say how to undo it.
 *
 * Lights are left exactly as they are - which lights are on is the thing
 * being warmed for - and so are the night's three stage groups, whose
 * visibility is the configuration. Everything else is shown and unculled:
 * figures waiting for their cue, the low-poly stand-ins, a finale ring that a
 * portrait frame keeps hidden.
 */
function forceDrawn(root: Object3D, keep: ReadonlySet<Object3D>): () => void {
  const forced: Forced[] = [];
  const lods: LOD[] = [];
  root.traverse((object) => {
    if ((object as Light).isLight || keep.has(object)) return;
    forced.push({ object, visible: object.visible, culled: object.frustumCulled });
    object.visible = true;
    object.frustumCulled = false;
    // A LOD picks one level per render and hides the rest; hold it still.
    const lod = object as LOD;
    if (lod.isLOD && lod.autoUpdate) {
      lod.autoUpdate = false;
      lods.push(lod);
    }
  });
  return () => {
    for (const f of forced) {
      f.object.visible = f.visible;
      f.object.frustumCulled = f.culled;
    }
    for (const lod of lods) lod.autoUpdate = true;
  };
}

function refreshShadows(root: Object3D): void {
  root.traverseVisible((object) => {
    const light = object as Light;
    if (light.isLight && light.castShadow && light.shadow) light.shadow.needsUpdate = true;
  });
}

/**
 * Draw one scene through the whole post chain, twice.
 *
 * Twice because the shadow pass runs before a render has counted its lights:
 * its depth programs are keyed on the frame before. The second pass is the
 * one that compiles what every later frame will use. It also swaps the bokeh
 * pass for its stand-in, so both are warm.
 */
function warm(r: PrewarmRig, scene: Scene, camera: Camera, toScreen: boolean): void {
  const { composer, renderPass, bokeh, opaque } = r;
  const was = {
    scene: renderPass.scene,
    camera: renderPass.camera,
    bokehScene: bokeh.scene,
    bokehCamera: bokeh.camera,
    bokeh: bokeh.enabled,
    opaque: opaque.enabled,
    toScreen: composer.renderToScreen,
  };
  renderPass.scene = scene;
  renderPass.camera = camera;
  bokeh.scene = scene;
  bokeh.camera = camera;
  composer.renderToScreen = toScreen;
  try {
    for (const withBokeh of [true, false]) {
      bokeh.enabled = withBokeh;
      opaque.enabled = !withBokeh;
      refreshShadows(scene);
      composer.render();
    }
  } finally {
    renderPass.scene = was.scene;
    renderPass.camera = was.camera;
    bokeh.scene = was.bokehScene;
    bokeh.camera = was.bokehCamera;
    bokeh.enabled = was.bokeh;
    opaque.enabled = was.opaque;
    composer.renderToScreen = was.toScreen;
  }
}

/** The night under one combination of its stage groups, then back as it was. */
function warmNightCombo(r: PrewarmRig, combo: (typeof NIGHT_COMBOS)[number], toScreen: boolean): void {
  const roots = new Set<Object3D>();
  const before: boolean[] = [];
  for (const part of NIGHT_GROUPS) {
    const group = nightGroups[part];
    if (!group) continue;
    roots.add(group);
    before.push(group.visible);
    group.visible = combo[part];
  }
  const restore = forceDrawn(r.scene, roots);
  try {
    warm(r, r.scene, r.camera, toScreen);
  } finally {
    restore();
    let i = 0;
    for (const part of NIGHT_GROUPS) {
      const group = nightGroups[part];
      if (group) group.visible = before[i++] ?? nightVis[part];
    }
  }
}

function warmDay(r: PrewarmRig, toScreen: boolean): void {
  const { dayScene, dayCamera } = renderTargets;
  if (!dayScene || !dayCamera) return;
  const restore = forceDrawn(dayScene, new Set());
  try {
    warm(r, dayScene, dayCamera, toScreen);
  } finally {
    restore();
  }
}

function warmGift(r: PrewarmRig): void {
  const { giftScene, giftCamera } = renderTargets;
  if (!giftScene || !giftCamera) return;
  // Straight to the canvas, as `Renderer` draws it: no composer, and so a
  // different output encoding and a different set of programs.
  const restore = forceDrawn(giftScene, new Set());
  const target = r.gl.getRenderTarget();
  try {
    r.gl.setRenderTarget(null);
    r.gl.render(giftScene, giftCamera);
  } finally {
    r.gl.setRenderTarget(target);
    restore();
  }
}

/**
 * Warm everything, behind the loader.
 *
 * Yields between configurations so the loader's bar and spinner keep moving.
 * Never rejects: a film that hitches is better than one that does not start.
 */
export async function prewarmBoot(
  textures: readonly Texture[],
  onProgress: (fraction: number) => void,
): Promise<void> {
  const r = rig;
  if (!r) return;
  const steps = textures.length / 8 + NIGHT_COMBOS.length + 2;
  let done = 0;
  // Under `?perf`: what each stage of this cost, since it is all loader time.
  const timings: [string, number][] = [];
  let mark = performance.now();
  const tick = (label: string): void => {
    done++;
    onProgress(Math.min(1, done / steps));
    const now = performance.now();
    timings.push([label, Math.round(now - mark)]);
    mark = now;
  };

  try {
    // Every library texture, including the ones nothing is wearing yet: four
    // of each student's five faces are only reached by a blink or a smile.
    for (let i = 0; i < textures.length; i += 8) {
      for (const texture of textures.slice(i, i + 8)) r.gl.initTexture(texture);
      tick('textures');
      await breathe();
    }
    for (const combo of NIGHT_COMBOS) {
      warmNightCombo(r, combo, true);
      tick(`night ${NIGHT_GROUPS.filter((part) => combo[part]).join('+') || 'bare'}`);
      await breathe();
    }
    warmDay(r, true);
    tick('day');
    await breathe();
    // Last, so the canvas is left holding the frame the loader lifts on.
    warmGift(r);
    tick('gift');
  } catch (err) {
    console.warn('prewarm stopped early; the film will compile as it goes', err);
  }
  const probe = globalThis as { __perfLog?: unknown; __prewarm?: unknown };
  if (probe.__perfLog) probe.__prewarm = timings;
}

/** How long to wait on the GPU's compiler before attaching a model anyway. */
const LINK_TIMEOUT_MS = 4000;

interface CompiledProgram {
  isReady(): boolean;
}

/**
 * Compile a model's shaders before it is attached, and wait for them.
 *
 * A model arrives long after boot, so the warm renders above never saw it.
 * `compile` is the right tool here where it was not there: the model is not
 * in the scene yet, so there is nothing to draw, and the depth programs it
 * will be drawn into shadows with are shared with meshes already warmed.
 *
 * Compiled against the composer's buffer, which is what the model will really
 * be drawn into, and - for the street - once per combination of stage groups
 * the street appears in, so the stage changing around a student later costs
 * nothing either. With `KHR_parallel_shader_compile` the compiling happens on
 * the driver's own threads; this resolves when it has finished.
 */
export async function warmModel(model: Object3D, where: 'night' | 'day'): Promise<void> {
  const r = rig;
  if (!r) return;

  const target = r.gl.getRenderTarget();
  try {
    r.gl.setRenderTarget(r.composer.readBuffer);
    if (where === 'day') {
      const { dayScene, dayCamera } = renderTargets;
      if (dayScene && dayCamera) r.gl.compile(model, dayCamera, dayScene);
    } else {
      for (const combo of NIGHT_COMBOS) {
        if (!combo.street) continue;
        const before: boolean[] = [];
        for (const part of NIGHT_GROUPS) {
          const group = nightGroups[part];
          before.push(group?.visible ?? false);
          if (group) group.visible = combo[part];
        }
        try {
          r.gl.compile(model, r.camera, r.scene);
        } finally {
          let i = 0;
          for (const part of NIGHT_GROUPS) {
            const group = nightGroups[part];
            const was = before[i++];
            if (group && was !== undefined) group.visible = was;
          }
        }
      }
    }
  } catch (err) {
    console.warn('model shaders will compile on first draw instead', err);
    return;
  } finally {
    r.gl.setRenderTarget(target);
  }

  const programs = new Set<CompiledProgram>();
  model.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const props = r.gl.properties.get(material) as
        | { programs?: Map<string, CompiledProgram> }
        | undefined;
      for (const program of props?.programs?.values() ?? []) programs.add(program);
    }
  });

  const deadline = performance.now() + LINK_TIMEOUT_MS;
  while (performance.now() < deadline) {
    let pending = false;
    for (const program of programs) {
      if (!program.isReady()) pending = true;
    }
    if (!pending) return;
    await breathe(30);
  }
}

let rewarming = 0;

/**
 * Warm the night again after something changed every lit program's key.
 *
 * Turning shadows on or off does that - the quality ladder, between its two
 * lower tiers. The old programs are no use and the new ones would otherwise
 * be compiled one stage change at a time for the rest of the film, each on
 * the frame the stage changes, which is by definition a frame the camera is
 * moving on. Drawn off screen instead, one combination per `gpuQueue` job, so
 * each lands on a held shot if there is one before it is needed.
 */
export function rewarmNight(): void {
  const run = ++rewarming;
  for (const combo of NIGHT_COMBOS) {
    void enqueue(() => {
      const r = rig;
      // A newer change has taken over, or the renderer has gone.
      if (run !== rewarming || !r) return;
      // The stage the film is on right now has been drawn since anyway.
      if (NIGHT_GROUPS.every((part) => combo[part] === nightVis[part])) return;
      warmNightCombo(r, combo, false);
    });
  }
}
