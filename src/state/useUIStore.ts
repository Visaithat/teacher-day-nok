import { create } from 'zustand';
import { initialTier, type QualityTier } from '../config/quality';

/**
 * Discrete UI state - the only things allowed to trigger a React render.
 *
 * Continuous per-frame values live in `frame.ts` and never pass through here.
 */
export interface UIState {
  /** Texture generation progress, 0..1, shown on the loader. */
  progress: number;
  /** True once the world is built and the loop is running. */
  booted: boolean;
  /** True once the user has clicked the gift box. */
  opened: boolean;
  /** True once the gift lid animation has finished and scroll is released. */
  unlocked: boolean;
  /** True once the music box has been opened and the song has started. */
  musicOn: boolean;
  muted: boolean;
  /** Index of the student whose message panel is showing, or -1. */
  activeStudent: number;
  quality: QualityTier;
  /** A click that landed while the world was still building. */
  pendingOpen: boolean;
  /**
   * Which students' messages have been opened, one bit each.
   *
   * A bitmask rather than an array or a Set because it compares by value: the
   * five bits fit in a number, so `markRead` can no-op an already-read student
   * the way `setActiveStudent` no-ops an unchanged index, and there is no
   * array identity to churn a render. The phone's message button wears an
   * unread dot until its bit is set.
   */
  readMask: number;
  /**
   * On a touch screen, the stop (`stepStops`) the film is parked at or
   * playing toward, or -1 before it has gone to the first one.
   */
  stepIndex: number;

  setProgress: (v: number) => void;
  setBooted: (v: boolean) => void;
  setOpened: (v: boolean) => void;
  setUnlocked: (v: boolean) => void;
  setMusicOn: (v: boolean) => void;
  toggleMuted: () => void;
  setActiveStudent: (i: number) => void;
  setQuality: (q: QualityTier) => void;
  setPendingOpen: (v: boolean) => void;
  markRead: (i: number) => void;
  setStepIndex: (i: number) => void;
  /** Reset everything the Replay button should undo. */
  replay: () => void;
}

/** Has student `i`'s message been opened? The bit arithmetic lives here only. */
export function hasRead(mask: number, i: number): boolean {
  return i >= 0 && (mask & (1 << i)) !== 0;
}

export const useUIStore = create<UIState>((set) => ({
  progress: 0.04,
  booted: false,
  opened: false,
  unlocked: false,
  musicOn: false,
  muted: false,
  activeStudent: -1,
  quality: initialTier(),
  pendingOpen: false,
  readMask: 0,
  stepIndex: -1,

  setProgress: (v) => set({ progress: v }),
  setBooted: (v) => set({ booted: v }),
  setOpened: (v) => set({ opened: v }),
  setUnlocked: (v) => set({ unlocked: v }),
  setMusicOn: (v) => set({ musicOn: v }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setActiveStudent: (i) => set((s) => (s.activeStudent === i ? s : { activeStudent: i })),
  setQuality: (q) => set((s) => (s.quality === q ? s : { quality: q })),
  setPendingOpen: (v) => set({ pendingOpen: v }),
  markRead: (i) =>
    set((s) => (s.readMask & (1 << i) ? s : { readMask: s.readMask | (1 << i) })),
  setStepIndex: (i) => set((s) => (s.stepIndex === i ? s : { stepIndex: i })),

  // The dots come back too: a replayed film has five unread messages again.
  replay: () => set({ musicOn: false, activeStudent: -1, readMask: 0, stepIndex: -1 }),
}));
