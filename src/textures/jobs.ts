/** The shared job vocabulary between the main thread and the texture worker. */

export type TextureJobId =
  | 'glow'
  | 'moon'
  | 'gleam'
  | 'cloudPuff'
  | 'fog'
  | 'daySky'
  | 'nightEnv'
  | `windows:${number}`;

export interface TextureJob {
  readonly id: TextureJobId;
  readonly width: number;
  readonly height: number;
  /** Only set for `windows:*`. */
  readonly tint?: string;
  readonly seed?: number;
}

/** Warm window tints, one per city building batch. */
export const WINDOW_TINTS: readonly string[] = [
  'rgba(255,186,110,1)',
  'rgba(255,214,150,1)',
  'rgba(190,214,255,1)',
];

/**
 * The font-independent textures, in the order they are needed.
 *
 * The source generated all of these synchronously on the main thread behind
 * two `setTimeout(0)` yields, which produced multi-hundred-millisecond long
 * tasks during boot. They run in a worker now.
 *
 * Note the six window maps for three batches: the source called its window
 * generator twice per batch, so `map` and `emissiveMap` are different random
 * grids. That mismatch is why the lit windows shimmer slightly against their
 * own emissive - it reads as flickering apartment light, so it is preserved
 * deliberately rather than tidied up.
 */
export function buildJobList(): TextureJob[] {
  const jobs: TextureJob[] = [
    { id: 'glow', width: 128, height: 128 },
    { id: 'moon', width: 1024, height: 512 },
    { id: 'gleam', width: 256, height: 320 },
    { id: 'cloudPuff', width: 256, height: 256 },
    { id: 'fog', width: 256, height: 256 },
    { id: 'daySky', width: 1024, height: 512 },
    { id: 'nightEnv', width: 1024, height: 512 },
  ];
  for (let i = 0; i < WINDOW_TINTS.length * 2; i++) {
    jobs.push({
      id: `windows:${i}`,
      width: 128,
      height: 128,
      tint: WINDOW_TINTS[i % WINDOW_TINTS.length] as string,
      seed: 0x77 + i * 7919,
    });
  }
  return jobs;
}

export interface WorkerRequest {
  readonly jobs: readonly TextureJob[];
}

export interface WorkerResponse {
  readonly id: TextureJobId;
  readonly bitmap: ImageBitmap;
}
