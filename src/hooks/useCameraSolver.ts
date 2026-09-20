import { useCallback, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { CameraSolver, makeCameraPose } from '../config/cameraKeys';
import { STEP_FREQUENCY, walkAmount } from '../config/timeline';
import { useUpdate } from '../lib/updateBus';
import type { FrameState } from '../state/frame';

/**
 * Drives the journey camera along the keyframe timeline.
 *
 * On top of the solved pose sits the handheld layer that makes the shot feel
 * operated rather than animated: a slow figure-of-eight drift always, plus -
 * only while the camera is actually walking down the street - a step bob and
 * a matching roll at the walk frequency. All of it is suppressed under
 * prefers-reduced-motion.
 */
export function useCameraSolver(): void {
  const camera = useThree((s) => s.camera);
  const solver = useMemo(() => new CameraSolver(), []);
  const pose = useMemo(makeCameraPose, []);

  const update = useCallback(
    (f: FrameState) => {
      if (!(camera instanceof PerspectiveCamera)) return;

      const { p, time } = f;
      solver.solve(p, pose, f.reduced);

      const drift = f.reduced ? 0 : 1;
      const walkAmt = walkAmount(p, f.phase.walk);
      const stepF = time * STEP_FREQUENCY;

      camera.position.set(
        pose.pos[0] + Math.sin(time * 0.23) * 0.7 * drift + Math.sin(stepF * 0.5) * 0.24 * walkAmt * drift,
        pose.pos[1] + Math.sin(time * 0.31) * 0.5 * drift + Math.abs(Math.sin(stepF)) * 0.1 * walkAmt * drift,
        pose.pos[2],
      );

      camera.lookAt(
        pose.look[0],
        pose.look[1] + Math.sin(time * 0.19) * 0.25 * drift,
        pose.look[2],
      );
      // A touch of roll on the footfall. Applied after lookAt, which clears it.
      camera.rotateZ(Math.sin(stepF * 0.5) * 0.012 * walkAmt * drift);

      if (Math.abs(camera.fov - pose.fov) > 0.01) {
        camera.fov = pose.fov;
        camera.updateProjectionMatrix();
      }

      f.cameraZ = camera.position.z;
    },
    [camera, solver, pose],
  );

  useUpdate('camera', update);
}
