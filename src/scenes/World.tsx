import { useEffect, useRef } from 'react';
import { GiftScene } from './GiftScene';
import { NightWorld } from './NightWorld';
import { DayScene } from './DayScene';
import { prewarmBoot, rewarmNight } from './prewarm';
import { QUALITY } from '../config/quality';
import { TEXTURE_SHARE, useTextures } from '../textures/TextureProvider';
import { useUIStore } from '../state/useUIStore';

/**
 * Everything inside the Canvas that depends on the texture library.
 *
 * Mounted only once generation has finished. The loader stays up a moment
 * longer while every scene is drawn once behind it (`prewarm`); when that is
 * done the experience becomes interactive and the loader fades.
 */
export function World(): React.ReactElement {
  const textures = useTextures();
  const setBooted = useUIStore((s) => s.setBooted);
  const setProgress = useUIStore((s) => s.setProgress);
  const unlocked = useUIStore((s) => s.unlocked);
  const shadows = useUIStore((s) => QUALITY[s.quality].shadows);

  // An effect, so it runs after every child's: by now each scene has built
  // what it is going to build and published itself to `renderTargets`.
  useEffect(() => {
    let cancelled = false;
    void prewarmBoot(textures.all, (f) => {
      if (!cancelled) setProgress(TEXTURE_SHARE + f * (1 - TEXTURE_SHARE));
    }).finally(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [textures, setBooted, setProgress]);

  // Shadows going on or off re-keys every lit program in the night.
  const warmedFor = useRef(shadows);
  useEffect(() => {
    if (warmedFor.current === shadows) return;
    warmedFor.current = shadows;
    rewarmNight();
  }, [shadows]);

  return (
    <>
      {/* The gift box lives in its own scene and is dropped for good once
          the burst hands over to the night sky. */}
      {!unlocked && <GiftScene />}
      {/* Both stay mounted for the whole film. The night is not drawn once
          the day takes over the render, and its updates stop with it (see
          `nightVisibility`); tearing it down bought nothing and cost a full
          rebuild and recompile on Replay or a scroll back up. */}
      <NightWorld />
      {/* Built at boot: its seats must exist before the street starts
          fetching finale meshes into them. */}
      <DayScene />
    </>
  );
}
