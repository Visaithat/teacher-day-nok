import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector2 } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { renderTargets } from './renderTargets';
import { frame } from '../state/frame';
import { GATES, WHITE_B } from '../config/timeline';
import { lerp } from '../lib/math';
import { DEFAULT_PROPS } from '../config/copy';
import { QUALITY } from '../config/quality';
import { useUIStore } from '../state/useUIStore';

/**
 * Owns the render.
 *
 * Which scene is on screen is a story decision, not a React one, so this
 * takes rendering over from R3F entirely and switches the composer's passes
 * between the gift box, the night world and the day scene at the exact scroll
 * positions the cut happens.
 *
 * Two effects carry the film's biggest transitions and both live here:
 *
 *  - The white-out is not a white rectangle fading in. Exposure is pushed
 *    from 0.9 to 8.4 and bloom strength from 0.34 to nearly 3, so the lamps
 *    and windows bloom out and swallow the frame from the inside. Only then
 *    does a DOM layer finish the job.
 *  - Depth of field rides the student being framed. Focus eases toward their
 *    real distance, so the street behind them falls away rather than the
 *    whole shot being uniformly soft.
 *
 * three's own BokehPass and UnrealBloomPass are used rather than the pmndrs
 * equivalents specifically to keep the look identical to the design.
 */
export function Renderer(): null {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const quality = useUIStore((s) => s.quality);
  const settings = QUALITY[quality];

  const rig = useMemo(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Shallow-ish: the focus rides the nearest student, the street falls off.
    const bokeh = new BokehPass(scene, camera, {
      focus: 14,
      aperture: 0.00028,
      maxblur: 0.006,
    });
    composer.addPass(bokeh);

    const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.32, 0.42, 0.9);
    bloom.strength = DEFAULT_PROPS.bloomStrength;
    composer.addPass(bloom);

    composer.addPass(new OutputPass());

    return { composer, renderPass, bokeh, bloom };
  }, [gl, scene, camera]);

  // `dpr` is read during render so it can be a dependency. It currently only
  // ever changes alongside `bloomResolutionScale`, which is what has been
  // keeping this effect honest by accident - a future tier that shared a bloom
  // scale would leave the composer rendering at the old ratio and quietly
  // throw away the whole benefit of having dropped it.
  const dpr = gl.getPixelRatio();

  useEffect(() => {
    rig.composer.setSize(size.width, size.height);
    rig.composer.setPixelRatio(dpr);
    rig.bloom.resolution.set(
      Math.max(1, Math.round(size.width * settings.bloomResolutionScale)),
      Math.max(1, Math.round(size.height * settings.bloomResolutionScale)),
    );
  }, [rig, size, gl, dpr, settings.bloomResolutionScale]);

  useEffect(
    () => () => {
      rig.composer.dispose();
    },
    [rig],
  );

  useFrame(() => {
    const { p } = frame;
    const { composer, renderPass, bokeh, bloom } = rig;
    const uniforms = bokeh.materialBokeh.uniforms;

    // ---- Scene 1: the gift box, before the burst hands over ----------------
    const giftScene = renderTargets.giftScene;
    const giftCamera = renderTargets.giftCamera;
    if (giftScene && giftCamera && frame.giftOpen < 0.62) {
      gl.toneMappingExposure = 0.9;
      gl.render(giftScene, giftCamera);
      return;
    }

    const blow = GATES.blowout(p);
    const wake = GATES.wake(p);

    // ---- Scene 7: waking up ------------------------------------------------
    const dayScene = renderTargets.dayScene;
    const dayCamera = renderTargets.dayCamera;
    if (p >= WHITE_B - 0.002 && dayScene && dayCamera) {
      // Eyes adjusting: the frame starts blown out and settles to normal.
      //
      // Halved (was 3.2 and 1.4). At the old values the first two thirds of
      // the finale sat at 3-4x exposure under 1.6 bloom, which is the haze
      // that read as fog: the sky desaturated to grey-white and the models
      // lost their shading into it. The blow-out still reads as waking up,
      // but the blue and the faces survive it now.
      gl.toneMappingExposure = 1.0 + (1 - wake) * 1.6;
      bloom.strength = 0.25 + (1 - wake) * 0.7;
      renderPass.scene = dayScene;
      renderPass.camera = dayCamera;
      bokeh.scene = dayScene;
      bokeh.camera = dayCamera;

      const focus = uniforms['focus'];
      const aperture = uniforms['aperture'];
      const maxblur = uniforms['maxblur'];
      if (focus) focus.value = 7.5;
      // Vision swimming into focus is the whole point of this cut, so it
      // runs on every tier — unlike the street's DOF, which is a luxury.
      // Halved with the exposure and bloom: defocus over a blown-out frame is
      // the third of the three things that were flattening the models.
      if (aperture) aperture.value = 0.0006 * (1 - wake);
      if (maxblur) maxblur.value = 0.02;

      composer.render();
      return;
    }

    // ---- Scenes 2-6: the night journey -------------------------------------
    renderPass.scene = scene;
    renderPass.camera = camera;
    bokeh.scene = scene;
    bokeh.camera = camera;

    // The overexposure that becomes the white-out.
    gl.toneMappingExposure = 0.9 + blow * blow * 7.5;
    bloom.strength = DEFAULT_PROPS.bloomStrength + blow * 2.6;

    const focus = uniforms['focus'];
    const aperture = uniforms['aperture'];
    const maxblur = uniforms['maxblur'];
    if (maxblur) maxblur.value = 0.006;
    if (focus) focus.value = lerp(focus.value as number, frame.dofFocusTarget, 0.06);
    if (aperture) aperture.value = settings.depthOfField ? GATES.dofAperture(p) : 0;

    composer.render();
  }, 1);

  return null;
}
