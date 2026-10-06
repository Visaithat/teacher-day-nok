import { useEffect, useLayoutEffect, useMemo } from 'react';
import type { Object3D } from 'three';
import { MOUNT } from '../config/timeline';
import { useUpdate, type Stage, type UpdateFn } from '../lib/updateBus';
import { frame, type FrameState } from '../state/frame';

/**
 * Which parts of the night are on stage.
 *
 * These used to be mount windows: the sky, the garden and the street were each
 * built when the scroll reached them and torn down when it left. That put the
 * most expensive work in the film - building five figures, compiling every
 * shader again for a new set of lights, disposing a few hundred buffers - on
 * frames in the middle of a camera move, and did it all again on the way back
 * up.
 *
 * Now everything is built once, behind the loader, and a part that is out of
 * its window is only hidden. Hidden costs what unmounted did - three does not
 * draw an invisible subtree, does not count its lights, and (see `park`) does
 * not walk its matrices - but coming back is a flag, not a rebuild.
 */
export type NightPart = 'sky' | 'garden' | 'street' | 'night';

export const nightVis: Record<NightPart, boolean> = {
  sky: true,
  garden: true,
  street: false,
  night: true,
};

/** The windows themselves stay in `MOUNT`; this only reads them. */
export function nightPartsAt(p: number): Record<NightPart, boolean> {
  return {
    sky: MOUNT.sky(p),
    garden: MOUNT.gardenAndGate(p),
    street: MOUNT.street(p),
    night: MOUNT.nightWorld(p),
  };
}

const PARTS: readonly NightPart[] = ['sky', 'garden', 'street', 'night'];
/** The parts that are a subtree to hide; `night` is the whole scene. */
export const NIGHT_GROUPS = ['sky', 'garden', 'street'] as const;
export type NightGroup = (typeof NIGHT_GROUPS)[number];

/**
 * Every combination of sky, garden and street the film passes through.
 *
 * Each one is a different set of lights, and so a different shader program for
 * every lit material. Derived by walking the windows rather than written out,
 * so retiming a window in `MOUNT` cannot leave this stale.
 */
export const NIGHT_COMBOS: readonly Record<NightGroup, boolean>[] = (() => {
  const seen = new Map<string, Record<NightGroup, boolean>>();
  for (let i = 0; i <= 1000; i++) {
    const at = nightPartsAt(i / 1000);
    if (!at.night) continue;
    const combo = { sky: at.sky, garden: at.garden, street: at.street };
    seen.set(`${combo.sky}${combo.garden}${combo.street}`, combo);
  }
  return [...seen.values()];
})();

/**
 * The three group objects themselves, once `NightWorld` has built them.
 *
 * For `prewarm`, which has to put the night into each of `NIGHT_COMBOS` in
 * turn from outside React.
 */
export const nightGroups: Record<NightGroup, Object3D | null> = {
  sky: null,
  garden: null,
  street: null,
};

interface Edge {
  onShow?: () => void;
  onHide?: () => void;
}

const edges: Record<NightPart, Set<Edge>> = {
  sky: new Set(),
  garden: new Set(),
  street: new Set(),
  night: new Set(),
};

/**
 * Stop three walking a hidden subtree's matrices.
 *
 * `visible = false` keeps a subtree out of the draw list, but
 * `updateMatrixWorld` still recurses into it - once per `render`, and there
 * are two or three of those a frame. The street alone is several hundred
 * objects. Nothing reads a hidden object's world matrix, and the first update
 * after it is shown recomputes all of them, so skipping the walk is free.
 */
export function park(group: Object3D): void {
  const update = group.updateMatrixWorld.bind(group);
  group.updateMatrixWorld = (force?: boolean) => {
    if (group.visible) update(force);
  };
}

/**
 * Drive the three groups, and `nightVis`, from the scroll.
 *
 * On the `camera` stage, like the mount windows it replaces: first in the
 * frame, so everything downstream sees this frame's answer.
 */
export function useNightVisibility(
  groups: Record<NightGroup, React.RefObject<Object3D | null>>,
): void {
  const apply = useMemo(
    () =>
      (p: number, announce: boolean): void => {
        const next = nightPartsAt(p);
        for (const part of PARTS) {
          const on = next[part] && next.night;
          if (part !== 'night') {
            const group = groups[part].current;
            if (group) group.visible = on;
          }
          if (nightVis[part] === on) continue;
          nightVis[part] = on;
          if (!announce) continue;
          for (const edge of edges[part]) (on ? edge.onShow : edge.onHide)?.();
        }
      },
    [groups],
  );

  // Before the first paint, and before any update has run: nothing has seen
  // the old state, so there are no edges to announce.
  useLayoutEffect(() => {
    for (const part of NIGHT_GROUPS) {
      const group = groups[part].current;
      if (group) park(group);
      nightGroups[part] = group;
    }
    apply(frame.p, false);
    return () => {
      for (const part of NIGHT_GROUPS) nightGroups[part] = null;
    };
  }, [apply, groups]);

  const update = useMemo(() => (f: FrameState) => apply(f.p, true), [apply]);
  useUpdate('camera', update);
}

/**
 * A per-frame update that only runs while its part of the night is on stage.
 *
 * What unmounting used to do for free. An update that kept running while
 * hidden would go on writing to the frame state and the DOM for something
 * nobody can see - the music box's hint, the student under the cursor.
 */
export function useNightUpdate(part: NightPart, stage: Stage, fn: UpdateFn): void {
  const gated = useMemo<UpdateFn>(
    () => (f) => {
      if (nightVis[part]) fn(f);
    },
    [part, fn],
  );
  useUpdate(stage, gated);
}

/**
 * Run something as a part comes on stage or leaves it.
 *
 * For state that used to be reset by being rebuilt. `handlers` must be stable.
 */
export function useNightEdge(part: NightPart, handlers: Edge): void {
  useEffect(() => {
    const set = edges[part];
    set.add(handlers);
    return () => {
      set.delete(handlers);
    };
  }, [part, handlers]);
}
