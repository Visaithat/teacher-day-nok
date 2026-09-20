import {
  drawCloudPuff,
  drawDaySky,
  drawFog,
  drawGleam,
  drawGlow,
  drawMoon,
  drawNightEnv,
  drawWindows,
} from './draw';
import type { TextureJob, WorkerRequest } from './jobs';

/**
 * Generates the font-independent textures off the main thread.
 *
 * The moon alone is 1024x512 with 300 layered crater gradients and 900
 * speckles; the night environment map and the day sky dome are the same size
 * again. Doing this work here is what keeps the loader responsive and removes
 * the long tasks that used to land during boot.
 */

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<WorkerRequest>) => void): void;
}

const scope = self as unknown as WorkerScope;

function render(job: TextureJob): ImageBitmap {
  const canvas = new OffscreenCanvas(job.width, job.height);
  const g = canvas.getContext('2d');
  if (!g) throw new Error(`no 2d context for ${job.id}`);

  const { width: w, height: h } = job;
  if (job.id === 'glow') drawGlow(g, w, h);
  else if (job.id === 'moon') drawMoon(g, w, h);
  else if (job.id === 'gleam') drawGleam(g, w, h);
  else if (job.id === 'cloudPuff') drawCloudPuff(g, w, h);
  else if (job.id === 'fog') drawFog(g, w, h);
  else if (job.id === 'daySky') drawDaySky(g, w, h);
  else if (job.id === 'nightEnv') drawNightEnv(g, w, h);
  else drawWindows(g, w, h, job.tint ?? '#ffffff', job.seed ?? 1);

  return canvas.transferToImageBitmap();
}

scope.addEventListener('message', (e) => {
  for (const job of e.data.jobs) {
    try {
      const bitmap = render(job);
      scope.postMessage({ id: job.id, bitmap }, [bitmap]);
    } catch (err) {
      scope.postMessage({ id: job.id, error: String(err) });
    }
  }
});
