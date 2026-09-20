import type { StudentPhase } from '../config/timeline';

/**
 * Per-frame state.
 *
 * This is a plain mutable singleton, deliberately NOT a React store: it is
 * written and read dozens of times per frame inside `useFrame`, and routing
 * that through React (or through zustand's subscribe machinery) would cost a
 * re-render per frame for values no component needs to re-render on.
 *
 * Anything that legitimately changes the DOM tree - opened, muted, the active
 * student's identity - lives in `useUIStore` instead.
 *
 * Rule: only touch this from inside a `useFrame` callback or an event handler.
 */
export interface FrameState {
  /** Smoothed scroll progress, 0..1. What the whole film is a function of. */
  p: number;
  /** Raw scroll progress from Lenis, before damping. */
  target: number;
  /** Wall clock seconds since boot. */
  time: number;
  /** Delta seconds, clamped to 0.05 to survive tab-outs. */
  dt: number;

  /** Which student the camera is framing, and how deep into the beat. */
  phase: StudentPhase;
  /** Index of the student under the cursor, or -1. */
  hoverStudent: number;
  /** True while the cursor is over the music box's hit proxy. */
  hoverMusicBox: boolean;
  /** Pointer in normalised device coords, or null if it has never moved. */
  ndcX: number;
  ndcY: number;
  hasPointer: boolean;

  /** Scene 1: set on click, drives the lid animation off the wall clock. */
  opened: boolean;
  openedAt: number;
  /** 0..1 progress of the gift-open animation. */
  giftOpen: number;
  /** Set once the handoff completes and the scroll is released. */
  unlocked: boolean;

  /** Scene 4: set on click, drives the music box lid off the wall clock. */
  musicBoxOpen: boolean;
  musicBoxOpenedAt: number;

  /**
   * The camera's world Z, published by the solver so subsystems that follow
   * the camera (the travelling street light, the fog) can read it without
   * reaching for the camera object.
   */
  cameraZ: number;

  /**
   * 0..1 presence of the student message panel. The chapter caption yields to
   * it, so the two never fight for the same corner of the frame.
   */
  panelStrength: number;

  /**
   * Distance the depth of field should focus at. The street sequence sets it
   * to the student being framed so the shot has a real focal subject; the
   * renderer eases toward it rather than snapping.
   */
  dofFocusTarget: number;

  /** True when prefers-reduced-motion is set. */
  reduced: boolean;
}

const OFF_STREET: StudentPhase = { idx: -1, hold: 0, notice: 0, walk: 0 };

export const frame: FrameState = {
  p: 0,
  target: 0,
  time: 0,
  dt: 0,
  phase: OFF_STREET,
  hoverStudent: -1,
  hoverMusicBox: false,
  ndcX: 0,
  ndcY: 0,
  hasPointer: false,
  opened: false,
  openedAt: -1,
  giftOpen: 0,
  unlocked: false,
  musicBoxOpen: false,
  musicBoxOpenedAt: 0,
  cameraZ: 232,
  panelStrength: 0,
  dofFocusTarget: 26,
  reduced: false,
};

/** Reset everything the Replay button should undo. */
export function resetFrame(): void {
  frame.p = 0;
  frame.target = 0;
  frame.phase = OFF_STREET;
  frame.hoverStudent = -1;
  frame.hoverMusicBox = false;
  frame.musicBoxOpen = false;
  frame.musicBoxOpenedAt = 0;
}

// TEMP DEV PROBE — removed before hand-off.
if (import.meta.env.DEV) (globalThis as unknown as Record<string, unknown>)['__frame'] = frame;
