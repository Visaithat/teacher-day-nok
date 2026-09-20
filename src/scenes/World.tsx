import { useEffect } from 'react';
import { GiftScene } from './GiftScene';
import { NightWorld } from './NightWorld';
import { DayScene } from './DayScene';
import { MOUNT } from '../config/timeline';
import { useScrollWindow } from '../hooks/useScrollWindow';
import { useUIStore } from '../state/useUIStore';

/**
 * Everything inside the Canvas that depends on the texture library.
 *
 * Mounted only once generation has finished, which is also the moment the
 * experience becomes interactive and the loader fades.
 */
export function World(): React.ReactElement {
  const setBooted = useUIStore((s) => s.setBooted);
  const unlocked = useUIStore((s) => s.unlocked);

  useEffect(() => {
    setBooted(true);
  }, [setBooted]);

  const showNight = useScrollWindow(MOUNT.nightWorld);
  // Sticky: the finale pulls down five more models, so scrubbing back over
  // the boundary must not throw them away and fetch them again.
  const showDay = useScrollWindow(MOUNT.dayScene, true);

  return (
    <>
      {/* The gift box lives in its own scene and is dropped for good once
          the burst hands over to the night sky. */}
      {!unlocked && <GiftScene />}
      {showNight && <NightWorld />}
      {/* Built during the white-out, so the cut into it is seamless. */}
      {showDay && <DayScene />}
    </>
  );
}
