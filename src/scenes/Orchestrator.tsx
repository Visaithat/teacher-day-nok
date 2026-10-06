import { useFrame } from '@react-three/fiber';
import { frame, frameDebug } from '../state/frame';
import { runStages } from '../lib/updateBus';
import { studentPhase, SCROLL_DAMP, SCROLL_DAMP_REDUCED } from '../config/timeline';
import { damp } from '../lib/math';

/**
 * The one `useFrame` for the whole film.
 *
 * Advances the clock, smooths scroll, resolves which student owns this scroll
 * position, then walks the ordered update stages. Must be mounted before any
 * subsystem so its priority-0 callback runs first.
 */
export function Orchestrator(): null {
  useFrame((_state, delta) => {
    // The source clamped dt to 0.05 so a tab-out could not fling the camera.
    const dt = Math.min(0.05, delta);
    frame.dt = dt;
    frame.time = frameDebug.freezeTime ?? frame.time + dt;

    // Frame-rate-independent form of the source's `p += (target - p) * k`.
    const k = frame.reduced ? SCROLL_DAMP_REDUCED : SCROLL_DAMP;
    frame.p = damp(frame.p, frame.target, k, dt);

    frame.phase = studentPhase(frame.p);

    runStages(frame);
  });

  return null;
}
