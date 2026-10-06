import { LinearFilter, SRGBColorSpace, Texture } from 'three';
import {
  drawCloudPuff,
  drawDaySky,
  drawFace,
  drawFog,
  drawGateSign,
  drawGleam,
  drawGlow,
  drawLabel,
  drawMoon,
  drawNightEnv,
  drawPhoto,
  drawSign,
  drawWindows,
  FACE_MOODS,
  type Ctx2D,
  type FaceMood,
} from './draw';
import { buildJobList, WINDOW_TINTS, type TextureJobId, type TextureJob } from './jobs';
import { STUDENTS } from '../config/students';

/** The five expressions baked for one student's head. */
export type FaceSet = Readonly<Record<FaceMood, Texture>>;

/** Every texture the film needs, built once and shared. */
export interface TextureLibrary {
  readonly glow: Texture;
  readonly moon: Texture;
  readonly gleam: Texture;
  readonly cloudPuff: Texture;
  readonly fog: Texture;
  readonly daySky: Texture;
  readonly nightEnv: Texture;
  /** Six maps: [map, emissiveMap] per city building batch. */
  readonly windows: readonly Texture[];
  /** One painted sign board per student. */
  readonly signs: readonly Texture[];
  readonly labels: readonly Texture[];
  /** Placeholder easel prints, used until the real photograph loads. */
  readonly photos: readonly Texture[];
  /** Five face moods per student. */
  readonly faces: readonly FaceSet[];
  readonly gateSign: Texture;
  /** Every texture above, flat, for uploading the lot ahead of first use. */
  readonly all: readonly Texture[];
  dispose(): void;
}

function finish(tex: Texture): Texture {
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: Ctx2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');
  return { canvas, g };
}

function paint(w: number, h: number, draw: (g: Ctx2D, w: number, h: number) => void): Texture {
  const { canvas, g } = makeCanvas(w, h);
  draw(g, w, h);
  return finish(new Texture(canvas));
}

/**
 * Copy a worker bitmap onto an ordinary 2D canvas, and hand three.js that.
 *
 * The bitmaps `transferToImageBitmap()` hands back are GPU-backed, and Chrome
 * is free to evict them under memory pressure. Evicted is not detached: the
 * object stays alive and the right size, `drawImage` still succeeds, and every
 * pixel comes back zero. Nothing throws and nothing warns — the city simply
 * loses every lit window, the sky dome and the environment map go black, and
 * the night reads as unlit.
 *
 * The eviction reliably lands while the next stage of the build paints the
 * forty-odd student canvases, so it happened on every boot, not as a race.
 *
 * Copying to a canvas costs one `drawImage` per texture and puts these on
 * exactly the same footing as the signs and faces, which are canvas-backed and
 * were never affected. It also means both halves of `generateBaseTextures` —
 * worker and main-thread fallback — now return the same kind of texture.
 */
function adopt(bitmap: ImageBitmap): Texture {
  const { canvas, g } = makeCanvas(bitmap.width, bitmap.height);
  g.drawImage(bitmap, 0, 0);
  // The pixels are ours now; let the GPU copy go.
  bitmap.close();
  return finish(new Texture(canvas));
}

/** Yield to the browser so the loader can repaint between chunks of work. */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    // A macrotask, not rAF: rAF never fires in a hidden document and boot
    // would deadlock in a background tab.
    setTimeout(resolve, 0);
  });
}

function runJobOnMainThread(job: TextureJob): Texture {
  const { width: w, height: h } = job;
  switch (job.id) {
    case 'glow':
      return paint(w, h, drawGlow);
    case 'moon':
      return paint(w, h, drawMoon);
    case 'gleam':
      return paint(w, h, drawGleam);
    case 'cloudPuff':
      return paint(w, h, drawCloudPuff);
    case 'fog':
      return paint(w, h, drawFog);
    case 'daySky':
      return paint(w, h, drawDaySky);
    case 'nightEnv':
      return paint(w, h, drawNightEnv);
    default:
      return paint(w, h, (g, ww, hh) =>
        drawWindows(g, ww, hh, job.tint ?? '#ffffff', job.seed ?? 1),
      );
  }
}

function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

/** Run the font-free jobs in a worker, falling back to the main thread. */
async function generateBaseTextures(onUnit: () => void): Promise<Map<TextureJobId, Texture>> {
  const jobs = buildJobList();
  const out = new Map<TextureJobId, Texture>();

  if (!workerSupported()) {
    for (const job of jobs) {
      out.set(job.id, runJobOnMainThread(job));
      onUnit();
      await yieldToBrowser();
    }
    return out;
  }

  const worker = new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });

  try {
    await new Promise<void>((resolve, reject) => {
      let remaining = jobs.length;
      const timeout = window.setTimeout(() => reject(new Error('texture worker timed out')), 20000);

      worker.addEventListener(
        'message',
        (e: MessageEvent<{ id: TextureJobId; bitmap?: ImageBitmap; error?: string }>) => {
          const { id, bitmap, error } = e.data;
          if (bitmap) {
            out.set(id, adopt(bitmap));
          } else {
            console.warn(`texture "${id}" failed in worker (${error}); painting inline`);
            const job = jobs.find((j) => j.id === id);
            if (job) out.set(id, runJobOnMainThread(job));
          }
          onUnit();
          remaining--;
          if (remaining === 0) {
            window.clearTimeout(timeout);
            resolve();
          }
        },
      );

      worker.addEventListener('error', (err) => {
        window.clearTimeout(timeout);
        reject(new Error(`texture worker failed: ${err.message}`));
      });

      worker.postMessage({ jobs });
    });
  } catch (err) {
    console.warn('texture worker unavailable, painting on the main thread', err);
    for (const job of jobs) {
      if (out.has(job.id)) continue;
      out.set(job.id, runJobOnMainThread(job));
      onUnit();
      await yieldToBrowser();
    }
  } finally {
    worker.terminate();
  }

  return out;
}

/**
 * Build the whole texture library.
 *
 * `onProgress` reports 0..1 across every unit of work, so the loader shows
 * real progress rather than a scripted animation.
 */
export async function buildTextureLibrary(
  onProgress: (fraction: number) => void,
): Promise<TextureLibrary> {
  const baseCount = buildJobList().length;
  // sign + label + photo + five face moods, per student, plus the gate sign
  const perStudent = 3 + FACE_MOODS.length;
  const total = baseCount + STUDENTS.length * perStudent + 1;
  let done = 0;
  const tick = (): void => {
    done++;
    onProgress(Math.min(1, done / total));
  };

  // Painted signs measure text, so the real faces must be resident first or
  // every board would be typeset against a fallback and reflow on reload.
  try {
    await Promise.all([
      document.fonts.load('600 44px "Playfair Display"'),
      document.fonts.load('500 40px "Playfair Display"'),
      document.fonts.load('400 30px Poppins'),
      document.fonts.load('600 24px Poppins'),
    ]);
    await document.fonts.ready;
  } catch {
    // Fall through: the fallback face is worse but never fatal.
  }

  const base = await generateBaseTextures(tick);

  const need = (id: TextureJobId): Texture => {
    const t = base.get(id);
    if (!t) throw new Error(`texture "${id}" missing`);
    return t;
  };

  const signs: Texture[] = [];
  const labels: Texture[] = [];
  const photos: Texture[] = [];
  const faces: FaceSet[] = [];

  for (const s of STUDENTS) {
    signs.push(paint(768, 384, (g, w, h) => drawSign(g, w, h, s)));
    tick();
    labels.push(paint(512, 128, (g, w, h) => drawLabel(g, w, h, s)));
    tick();
    photos.push(paint(320, 400, (g, w, h) => drawPhoto(g, w, h, s)));
    tick();
    await yieldToBrowser();

    const set: Partial<Record<FaceMood, Texture>> = {};
    for (const mood of FACE_MOODS) {
      set[mood] = paint(512, 512, (g, w, h) => drawFace(g, w, h, s, mood));
      tick();
      await yieldToBrowser();
    }
    faces.push(set as FaceSet);
  }

  const gateSign = paint(1512, 408, drawGateSign);
  tick();

  const windows: Texture[] = [];
  for (let i = 0; i < WINDOW_TINTS.length * 2; i++) {
    windows.push(need(`windows:${i}`));
  }

  const all: Texture[] = [
    ...base.values(),
    ...signs,
    ...labels,
    ...photos,
    ...faces.flatMap((set) => Object.values(set)),
    gateSign,
  ];

  return {
    glow: need('glow'),
    moon: need('moon'),
    gleam: need('gleam'),
    cloudPuff: need('cloudPuff'),
    fog: need('fog'),
    daySky: need('daySky'),
    nightEnv: need('nightEnv'),
    windows,
    signs,
    labels,
    photos,
    faces,
    gateSign,
    all,
    dispose: () => {
      for (const t of all) t.dispose();
    },
  };
}
