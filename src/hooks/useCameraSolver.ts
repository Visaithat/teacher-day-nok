import { useCallback, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera } from 'three';
import { CameraSolver, makeCameraPose } from '../config/cameraKeys';
import { STEP_FREQUENCY, walkAmount } from '../config/timeline';
import { lerp } from '../lib/math';
import { useUpdate } from '../lib/updateBus';
import { FIT_STRENGTH, fitFov, viewport } from '../state/viewport';
import type { FrameState } from '../state/frame';

/**
 * Drives the journey camera along the keyframe timeline.
 *
 * On top of the solved pose sits the handheld layer that makes the shot feel
 * operated rather than animated: a slow figure-of-eight drift always, plus -
 * only while the camera is actually walking down the street - a step bob and
 * a matching roll at the walk frequency. All of it is suppressed under
 * prefers-reduced-motion.
 *
 * On a frame narrower than the one the film was framed for, two corrections
 * ride on top of the solved pose - see `state/viewport.ts` for why, and why in
 * this order. The aim slides off the authored rule-of-thirds onto the shot's
 * actual subject, which is the correction that does most of the work; then the
 * lens widens a little. Both are exactly identity at and above 16:9, so the
 * desktop shot is bit-for-bit the one that was authored.
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

      // Recentring. `compose` is 0 on anything 1.3:1 or wider, so this is the
      // authored aim on every desktop window and the ternaries fold away.
      const compose = viewport.composeGain;
      const lookX = compose > 0 ? lerp(pose.look[0], pose.subject[0], compose) : pose.look[0];
      const lookY = compose > 0 ? lerp(pose.look[1], pose.subject[1], compose) : pose.look[1];
      const lookZ = compose > 0 ? lerp(pose.look[2], pose.subject[2], compose) : pose.look[2];

      camera.lookAt(lookX, lookY + Math.sin(time * 0.19) * 0.25 * drift, lookZ);
      // A touch of roll on the footfall. Applied after lookAt, which clears it.
      camera.rotateZ(Math.sin(stepF * 0.5) * 0.012 * walkAmt * drift);

      // `fovGain` is `(REF / aspect) ^ FIT_STRENGTH`, computed once per resize;
      // raising it to `fit / FIT_STRENGTH` re-expresses it at this key's own
      // strength without touching the ratio again. Gain 1 short-circuits.
      const gain = viewport.fovGain;
      const wantFov =
        gain === 1 ? pose.fov : fitFov(pose.fov, Math.pow(gain, pose.fit / FIT_STRENGTH));

      if (Math.abs(camera.fov - wantFov) > 0.01) {
        camera.fov = wantFov;
        camera.updateProjectionMatrix();
      }

      // Flush the matrices now rather than leaving them a frame behind.
      //
      // three refreshes `matrixWorld`/`matrixWorldInverse` inside
      // `renderer.render`, which is `<Renderer>`'s useFrame at priority 1 -
      // and every update-bus stage runs at priority 0, before it. So without
      // this line the whole film works from last frame's camera: the hover
      // raycast, the music box's hit test and its projected hint, `lod.update`,
      // and the phone's message button, which would visibly trail the student
      // through the push-in. One matrix compose and one 4x4 invert.
      camera.updateMatrixWorld();

      f.cameraZ = camera.position.z;
    },
    [camera, solver, pose],
  );

  useUpdate('camera', update);
}
