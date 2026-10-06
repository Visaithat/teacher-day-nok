import { frame } from '../state/frame';

/**
 * Uploads to the GPU, done when nobody is looking.
 *
 * Uploading a 2048x2048 texture is a single synchronous call that cannot be
 * split, and it takes longer than a frame. A model brings three of them, and
 * left to three.js all three land - with the mesh itself - on the first frame
 * the model is drawn: a freeze of a tenth of a second or more, in the middle
 * of whatever the camera was doing.
 *
 * The work cannot be made smaller, so it is moved. Each upload is a job here,
 * and the renderer runs jobs one at a time at moments that hide a slow frame:
 *
 *  - while the frame is covered by the white-out, as many as fit, because
 *    nothing on screen can be seen moving;
 *  - while the camera is at rest, one every few frames. A dropped frame of a
 *    held shot is not something anyone sees;
 *  - and failing both, once the camera has been moving for a while with no
 *    sign of stopping, one at a time and well apart, so the worst case is a
 *    few isolated slow frames instead of one long one.
 *
 * A job can also be `urgent`: what it uploads is about to be on screen, and
 * the alternative to running it now is three.js running all of it at once in
 * a moment. Urgent jobs go one per frame, moving or not.
 */
interface Job {
  readonly run: () => void;
  readonly done: () => void;
  /** Held back until this says so. For work that depends on where the film is. */
  readonly when: (() => boolean) | undefined;
  readonly urgent: (() => boolean) | undefined;
}

const jobs: Job[] = [];
let lastRun = 0;
/** When the camera was last seen at rest. */
let lastRest = 0;

/** Scroll still has this far to travel before the camera counts as at rest. */
const REST_EPSILON = 0.0004;
/** Milliseconds between jobs while the camera rests. About three frames. */
const REST_GAP_MS = 50;
/** The camera has to have been moving this long before work runs under it... */
const MOVING_PATIENCE_MS = 1500;
/** ...and then never closer together than this. */
const MOVING_GAP_MS = 240;
/** Per-frame budget while the frame is covered. */
const COVERED_BUDGET_MS = 14;

export interface JobTiming {
  /** Hold the job back until this is true. */
  when?: () => boolean;
  /** True once what the job uploads is about to be on screen. */
  urgent?: () => boolean;
}

/**
 * Queue one piece of GPU work. Resolves once it has run.
 *
 * Jobs run in order, except that one whose `when` is not yet true is stepped
 * over rather than holding up the ones behind it.
 */
export function enqueue(run: () => void, timing: JobTiming = {}): Promise<void> {
  return new Promise((resolve) => {
    jobs.push({ run, done: resolve, when: timing.when, urgent: timing.urgent });
  });
}

const eligible = (job: Job): boolean => !job.when || job.when();

function take(only?: (job: Job) => boolean): Job | null {
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i] as Job;
    if (!eligible(job) || (only && !only(job))) continue;
    jobs.splice(i, 1);
    return job;
  }
  return null;
}

function runOne(now: number, only?: (job: Job) => boolean): boolean {
  const job = take(only);
  if (!job) return false;
  try {
    job.run();
    // Under `?perf`: how long each job really took, for tuning the gaps.
    (globalThis as { __gpuJobs?: number[] }).__gpuJobs?.push(performance.now() - now);
  } catch (err) {
    // The work is an optimisation; three does the same upload itself on
    // first draw if this one did not happen.
    console.warn('gpu job failed', err);
  }
  // From when it finished, not when it started: the gaps are there to let
  // frames through between jobs, and a job can outlast a gap on its own.
  lastRun = performance.now();
  job.done();
  return true;
}

/**
 * Run what the moment allows. Called once per frame, before the render.
 *
 * `covered` is the renderer's to say: it is true while nothing drawn this
 * frame will be seen moving.
 */
export function drainGpuQueue(covered: boolean): void {
  const now = performance.now();
  const resting = Math.abs(frame.target - frame.p) < REST_EPSILON;
  // Tracked whether or not there is work: how long the camera has been
  // moving is a fact about the camera, not about the queue.
  if (resting || lastRest === 0) lastRest = now;
  if (jobs.length === 0) return;

  if (covered) {
    while (performance.now() - now < COVERED_BUDGET_MS && runOne(now)) {
      /* keep going while there is budget */
    }
    return;
  }

  if (runOne(now, (job) => job.urgent?.() === true)) return;

  const sinceLast = now - lastRun;
  if (resting) {
    if (sinceLast >= REST_GAP_MS) runOne(now);
    return;
  }

  // Someone scrolling straight through never rests. Waiting for them to would
  // only push every upload up against the moment it is needed.
  if (now - lastRest >= MOVING_PATIENCE_MS && sinceLast >= MOVING_GAP_MS) runOne(now);
}
