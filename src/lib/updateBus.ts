import { useEffect } from 'react';
import type { FrameState } from '../state/frame';

/**
 * A tiny ordered update bus.
 *
 * The source ran one `loop()` whose statement order was load-bearing: the
 * camera solves before the world reads `camera.position`, characters animate
 * before the raycast tests them, the DOM overlay pass runs after the active
 * student is known, and the day scene takes over the render last.
 *
 * React mount order does not reproduce that reliably, and giving every
 * subsystem its own `useFrame` would scatter the ordering across twenty files.
 * Instead each subsystem registers a callback against a named stage, and one
 * `useFrame` in <Orchestrator> walks the stages in this fixed order.
 */
export const STAGES = [
  'camera',
  'world',
  'gate',
  'musicbox',
  'students',
  'raycast',
  'overlay',
  'day',
] as const;

export type Stage = (typeof STAGES)[number];

export type UpdateFn = (f: FrameState) => void;

const registry: Record<Stage, Set<UpdateFn>> = {
  camera: new Set(),
  world: new Set(),
  gate: new Set(),
  musicbox: new Set(),
  students: new Set(),
  raycast: new Set(),
  overlay: new Set(),
  day: new Set(),
};

export function runStages(f: FrameState): void {
  for (let i = 0; i < STAGES.length; i++) {
    const set = registry[STAGES[i] as Stage];
    for (const fn of set) fn(f);
  }
}

/**
 * Register a per-frame callback against a stage.
 *
 * `fn` must be stable across renders (wrap it in `useCallback`, or better,
 * write it as a closure over refs so it never needs to change).
 */
export function useUpdate(stage: Stage, fn: UpdateFn, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const set = registry[stage];
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }, [stage, fn, enabled]);
}
