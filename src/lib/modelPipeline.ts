import {
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { DecodeRequest, DecodeResponse } from './meshoptWorker';
import { enqueue, type JobTiming } from './gpuQueue';

/**
 * Getting a model from the network onto the screen without a dropped frame.
 *
 * A GLB costs three separate things, and left alone each one lands on
 * whichever frame happens to be running: decompressing the geometry, decoding
 * and uploading its textures, and compiling its shaders. This module is where
 * each of those is moved somewhere it cannot be seen.
 */

/** How many models decompress at once: a detailed mesh and its stand-in. */
const DECODE_WORKERS = 2;

interface Pending {
  resolve: (value: Uint8Array) => void;
  /** Kept so a worker that fails can be covered for on this thread. */
  retry: () => Uint8Array;
}

/**
 * A meshopt decoder that does its work in module workers.
 *
 * Shaped like three's own - `GLTFLoader` only asks for `supported` and
 * `decodeGltfBufferAsync` - with the main-thread decoder behind it as the
 * fallback for a browser that will not start a worker, or one that dies.
 */
function workerDecoder(): typeof MeshoptDecoder {
  const pending = new Map<number, Pending>();
  const workers: Worker[] = [];
  let next = 0;
  let broken = typeof Worker === 'undefined';

  const giveUp = (): void => {
    broken = true;
    for (const w of workers) w.terminate();
    workers.length = 0;
    // Whatever was in flight is decoded here instead; nothing is dropped.
    const stranded = [...pending.values()];
    pending.clear();
    void MeshoptDecoder.ready.then(() => {
      for (const job of stranded) job.resolve(job.retry());
    });
  };

  const spawn = (): Worker => {
    const worker = new Worker(new URL('./meshoptWorker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<DecodeResponse>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data.value);
      else job.resolve(job.retry());
    });
    worker.addEventListener('error', giveUp);
    return worker;
  };

  const decodeGltfBufferAsync = (
    count: number,
    size: number,
    source: Uint8Array,
    mode: string,
    filter: string,
  ): Promise<Uint8Array> => {
    const here = (): Uint8Array => {
      const target = new Uint8Array(count * size);
      MeshoptDecoder.decodeGltfBuffer(target, count, size, source, mode, filter);
      return target;
    };
    if (broken) return MeshoptDecoder.ready.then(here);

    try {
      while (workers.length < DECODE_WORKERS) workers.push(spawn());
    } catch {
      giveUp();
      return MeshoptDecoder.ready.then(here);
    }

    return new Promise((resolve) => {
      const id = next++;
      pending.set(id, { resolve, retry: here });
      // Copied, not transferred: `source` is a view into the whole GLB, which
      // the loader is still reading the textures out of.
      const request: DecodeRequest = { id, count, size, source: source.slice(), mode, filter };
      (workers[id % workers.length] as Worker).postMessage(request, [request.source.buffer]);
    });
  };

  return { ...MeshoptDecoder, decodeGltfBufferAsync } as unknown as typeof MeshoptDecoder;
}

let loader: GLTFLoader | null = null;

/**
 * The one GLTF loader, shared by every call site.
 *
 * Shared so that the decode workers are too: the models are 90,000 to 120,000
 * triangles each and arrive while the camera is moving, and a pool per call
 * site would be three pools.
 */
export function gltfLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(workerDecoder());
  }
  return loader;
}

/**
 * Resolve once a loaded texture's image is decoded.
 *
 * `TextureLoader` hands back an `<img>` that has been fetched but not
 * necessarily decoded, and the browser then decodes it synchronously inside
 * the upload - on the render thread, on whatever frame first draws it.
 * `decode()` does that work ahead of time and off the main thread. A browser
 * without it, or an image it rejects, simply falls back to the old behaviour.
 */
export async function decoded<T extends Texture>(texture: T): Promise<T> {
  const image = texture.image as { decode?: () => Promise<void> } | undefined;
  if (image && typeof image.decode === 'function') {
    try {
      await image.decode();
    } catch {
      /* upload will decode it instead */
    }
  }
  return texture;
}

/** Every texture a model's materials reach, once each. */
export function texturesOf(root: Object3D): Texture[] {
  const found = new Set<Texture>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if ((value as Texture | null)?.isTexture) found.add(value as Texture);
      }
    }
  });
  return [...found];
}

let probe: { target: WebGLRenderTarget; scene: Scene; camera: PerspectiveCamera } | null = null;

/**
 * Upload a model's vertex buffers without showing it.
 *
 * three has no call for this - buffers go up when an object is first
 * projected for drawing - so the model is drawn, once, into a single pixel
 * with a flat material. Every attribute is uploaded whatever the material
 * reads, the fill cost is one pixel, and its own shaders are not touched.
 */
function uploadGeometry(gl: WebGLRenderer, root: Object3D): void {
  probe ??= {
    target: new WebGLRenderTarget(1, 1),
    scene: Object.assign(new Scene(), { overrideMaterial: new MeshBasicMaterial() }),
    camera: new PerspectiveCamera(),
  };
  const { target, scene, camera } = probe;
  const culled: [Object3D, boolean][] = [];
  root.traverse((o) => {
    culled.push([o, o.frustumCulled]);
    o.frustumCulled = false;
  });
  const parent = root.parent;
  const before = gl.getRenderTarget();
  scene.add(root);
  try {
    gl.setRenderTarget(target);
    gl.render(scene, camera);
  } finally {
    gl.setRenderTarget(before);
    scene.remove(root);
    parent?.add(root);
    for (const [o, was] of culled) o.frustumCulled = was;
  }
}

/**
 * Put everything a model needs on the GPU, one piece at a time, before it is
 * shown. Resolves when the last piece is up.
 *
 * Each texture is its own job and the geometry is another, so `gpuQueue` can
 * place them one by one. Attach the model after this and its first frame
 * draws from memory that is already there.
 */
export async function stageModel(
  gl: WebGLRenderer,
  root: Object3D,
  timing: JobTiming = {},
): Promise<void> {
  for (const texture of texturesOf(root)) {
    await enqueue(() => gl.initTexture(texture), timing);
  }
  await enqueue(() => uploadGeometry(gl, root), timing);
}
