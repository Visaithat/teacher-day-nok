import { STUDENT_COUNT } from './students';
import { clamp, sstep } from '../lib/math';

/**
 * ============================================================================
 * THE SCROLL TIMELINE
 * ============================================================================
 *
 * The whole film is one continuous camera move driven by a single normalised
 * scroll progress `p` in [0, 1], read off a 3200vh scroller.
 *
 * Scene 1 (the gift box) sits outside `p` entirely: it has its own scene and
 * camera, the scroller is locked, and it plays on a wall clock from the click.
 * Scroll is released only once the lid animation completes.
 *
 *   p            scene   beat
 *   ------------ ------- --------------------------------------------------
 *   0.000-0.130  2       night sky, camera high, looking up at the moon
 *   0.130-0.200  2       the title lights up word by word
 *   0.200-0.330  3       camera tilts down, the city is revealed below
 *   0.330-0.440  3       drone descent through the clouds, stars fade out
 *   0.440-0.520  4       pitch forward onto the gate; fog, lanterns, garden,
 *                        the music box - the longest held beat in the film
 *   0.520-0.838  5       the street: one camera stop per student
 *   0.838-0.860  6       a walking beat - nobody left to meet, just footsteps
 *   0.860-0.905  6       the white-out (overexposure blows the frame white)
 *   0.905-1.000  7       "waking up": the classroom finale over the white
 *
 * Two comments in the source contradict these constants (they describe a
 * 760vh scroller and a street ending at 0.82). The constants are the truth.
 */

/** Height of the scroll spacer. 32 viewports of travel. */
export const SCROLLER_HEIGHT_VH = 3200;

// ---------------------------------------------------------------- scene 5-7

/** Scene 5 begins: the camera passes through the gate onto the street. */
export const STREET_A = 0.52;
/**
 * Scene 5 ends. Note this is NOT where the white-out starts: the gap from
 * here to WHITE_A is a deliberate walking beat, the camera carrying on down
 * an empty street before the light takes over.
 */
export const STREET_B = 0.838;

/** Scene 6: the overexposure ramp. */
export const WHITE_A = 0.86;
export const WHITE_B = 0.905;

/** Scene 7: eyes opening. The day scene takes over the render at WHITE_B. */
export const WAKE_A = 0.905;
export const WAKE_B = 0.945;

/**
 * Scene 7: the window in which the students' lines are drawn out of their
 * heads, one at a time.
 *
 * `MSG_B` is where the LAST line finishes arriving, not where the first one
 * leaves - nothing leaves any more. Every line stays on screen from its own
 * entrance through to the end of the film.
 */
export const MSG_A = 0.944;
export const MSG_B = 0.988;

/** How much scroll one callout takes to draw itself on. */
export const MSG_DRAW = 0.007;

/** Scene 7: "Happy Teacher's Day!" pops in together. */
export const BIG_A = 0.988;

// ------------------------------------------------------------ street layout

/** World units between students down the street. */
export const STUDENT_SPACING = 24;

/** World Z of student `i`. The street runs toward -Z. */
export function studentZ(index: number): number {
  return 28 - index * STUDENT_SPACING;
}

/** Lateral offset of a figure from the street centreline. */
export const STUDENT_OFFSET_X = 6.6;

/**
 * The last student's slot is stretched by this much.
 *
 * She is the final beat before the white-out, so her hold earns extra scroll -
 * the film slows down before it ends rather than cutting away at the same
 * pace as everyone else.
 */
export const LAST_SLOT_WEIGHT = 1.45;

export interface SlotBound {
  /** Scroll position the slot starts at. */
  readonly a: number;
  /** Width of the slot in scroll units. */
  readonly span: number;
}

/**
 * Divide STREET_A..STREET_B into one slot per student, weighted so the last
 * one is longer. Memoised: both the keyframe builder and `studentPhase` read
 * these same bounds, which is what keeps the camera and the figures in sync.
 */
export const SLOT_BOUNDS: readonly SlotBound[] = (() => {
  const n = STUDENT_COUNT;
  const weights = Array.from({ length: n }, (_, i) => (i === n - 1 ? LAST_SLOT_WEIGHT : 1));
  const total = weights.reduce((x, y) => x + y, 0);
  const room = STREET_B - STREET_A;

  const out: SlotBound[] = [];
  let at = STREET_A;
  for (let i = 0; i < n; i++) {
    const span = room * ((weights[i] as number) / total);
    out.push({ a: at, span });
    at += span;
  }
  return out;
})();

/**
 * The five phases of one student's slot, as fractions of the slot.
 *
 *   0.00 -> walkEnd    WALK       dead centre of the road, eyes ahead
 *   -> noticeEnd       NOTICE     still travelling; the head starts to turn
 *   -> pushEnd         PUSH IN    the turn completes into a medium close-up
 *   -> holdOut         HOLD       the shot their message plays over
 *   -> 1.00            PULL BACK  ease out and face down the street again
 */
export interface SlotShape {
  readonly walkEnd: number;
  readonly noticeEnd: number;
  readonly pushEnd: number;
  readonly holdOut: number;
}

export const SLOT: SlotShape = {
  walkEnd: 0.3,
  noticeEnd: 0.44,
  pushEnd: 0.54,
  holdOut: 0.9,
};

/**
 * The first student is the first person we meet after the garden. A shorter
 * walk and a longer turn give the discovery room to land, so it reads as
 * noticing someone rather than as another beat in a rhythm.
 */
export const FIRST_SLOT: SlotShape = {
  walkEnd: 0.22,
  noticeEnd: 0.46,
  pushEnd: 0.58,
  holdOut: 0.9,
};

export function slotShape(index: number): SlotShape {
  return index === 0 ? FIRST_SLOT : SLOT;
}

/** Which student owns this scroll position, and how deep into their beat. */
export interface StudentPhase {
  /** Index into STUDENTS, or -1 when the camera is not on the street. */
  readonly idx: number;
  /** 0..1 strength of the held close-up. Drives the message panel. */
  readonly hold: number;
  /** 0..1 strength of "the camera has noticed you". Drives the head turn. */
  readonly notice: number;
  /** 0..1 how much the camera is walking rather than framing someone. */
  readonly walk: number;
}

const OFF_STREET: StudentPhase = { idx: -1, hold: 0, notice: 0, walk: 0 };

export function studentPhase(p: number): StudentPhase {
  if (p < STREET_A || p >= STREET_B) return OFF_STREET;

  let idx = STUDENT_COUNT - 1;
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const slot = SLOT_BOUNDS[i] as SlotBound;
    if (p < slot.a + slot.span) {
      idx = i;
      break;
    }
  }

  const slot = SLOT_BOUNDS[idx] as SlotBound;
  const t = clamp((p - slot.a) / slot.span, 0, 1);
  const s = slotShape(idx);

  const hold = sstep(s.noticeEnd, s.pushEnd, t) * (1 - sstep(s.holdOut, 0.985, t));
  const notice = sstep(s.walkEnd, s.noticeEnd, t) * (1 - sstep(s.holdOut, 0.985, t));
  const walk =
    (1 - sstep(s.walkEnd * 0.7, s.noticeEnd, t)) * sstep(0, 0.06, t) +
    sstep(s.holdOut, 0.97, t);

  return { idx, hold, notice: Math.max(notice, hold), walk: clamp(walk, 0, 1) };
}

/**
 * How much the camera should bob and roll as if on foot.
 *
 * On the street this follows the slot phase, but it also stays at full
 * strength through the walking beat between the last student and the
 * white-out — otherwise the footsteps would stop dead just as the camera
 * carries on down the empty street.
 */
export function walkAmount(p: number, phaseWalk: number): number {
  if (p > STREET_A && p < STREET_B) return phaseWalk;
  if (p >= STREET_B && p < WHITE_A) return 1;
  return 0;
}

// ------------------------------------------------------------------- gates
/**
 * Every per-subsystem visibility/intensity envelope, in one place, as pure
 * functions of `p`. Retiming a beat means editing here, not hunting through
 * the render code.
 */
export const GATES = {
  /** Stars fade out as the city lights come up. */
  starOpacity: (p: number) => 1 - sstep(0.28, 0.48, p),
  /** Moon halo. Peaks at 0.1, not the 0.055 the source initialises it to. */
  moonHalo: (p: number) => 0.1 * (1 - sstep(0.26, 0.46, p)),
  /** Moon body, key light and fresnel rim all share one fade. */
  moonFade: (p: number) => 1 - sstep(0.3, 0.5, p),
  moonLight: (p: number) => 1.05 - sstep(0.28, 0.52, p) * 0.6,
  /** Shooting stars only streak while we are still up in the sky. */
  shootingStarsActive: (p: number) => p < 0.3,
  /** Clouds dissolve once we are down at street level. */
  cloudFade: (p: number) => 1 - sstep(0.5, 0.585, p),

  /** Warm city bounce, rising through the descent. */
  cityAmbient: (p: number) => sstep(0.2, 0.46, p) * 130,
  /** The travelling spot that lights whoever we are walking past. */
  walkLight: (p: number) => sstep(0.515, 0.56, p) * 170 * (1 - sstep(0.86, 0.9, p)),

  groundFog: (p: number) => 0.075 * sstep(0.36, 0.46, p),
  fireflies: (p: number) => sstep(0.4, 0.47, p) * (1 - sstep(0.86, 0.9, p)),

  /** Gate lanterns and pillar uplights come on as we drop toward the gate. */
  gateOn: (p: number) => sstep(0.3, 0.42, p),
  gateFill: (p: number) => 230 * sstep(0.3, 0.42, p) * (1 - sstep(0.6, 0.7, p)),
  lanternBeam: (p: number) => 0.16 * sstep(0.3, 0.42, p) * (1 - sstep(0.62, 0.72, p)),

  /** The garden beat: wind, petals and the amber bounce off the flower beds. */
  gardenGlow: (p: number) => sstep(0.3, 0.42, p) * (1 - sstep(0.53, 0.6, p)),

  /** Music box proximity - drives its glow, inner light and the click hint. */
  musicBoxNear: (p: number) => sstep(0.4, 0.46, p) * (1 - sstep(0.55, 0.62, p)),
  musicBoxInteractive: (p: number) => p > 0.36 && p < 0.62,
  studentsInteractive: (p: number) => p > 0.52 && p < 0.86,

  /** Depth of field only bites once we are among the students. */
  dofAperture: (p: number) => 0.00042 * sstep(0.52, 0.575, p) * (1 - sstep(0.85, 0.88, p)),

  /** Scene 6 overexposure ramp (drives exposure and bloom). */
  blowout: (p: number) => sstep(WHITE_A, WHITE_B, p),
  /**
   * The DOM white flash starts later than the exposure ramp, so the frame is
   * already blooming out before the overlay finishes the job.
   */
  whiteFlash: (p: number) => sstep(WHITE_A + 0.02, WHITE_B, p),
  /** Scene 7 wake-up ramp. */
  wake: (p: number) => sstep(WAKE_A, WAKE_B, p),
  /** The day scene takes over the render slightly before the white peaks. */
  isDay: (p: number) => p >= WHITE_B - 0.002,

  // -------------------------------------------------------------- overlays
  titleIn: (p: number) => sstep(0.012, 0.045, p) * (1 - sstep(0.185, 0.225, p)),
  /** Word `i` of the title lights up like a star switching on. */
  titleWord: (p: number, i: number, isSub: boolean) => {
    const a = isSub ? 0.12 : 0.02 + i * 0.032;
    return sstep(a, a + 0.022, p) * (1 - sstep(0.185, 0.225, p));
  },
  scrollHint: (p: number) => sstep(0.145, 0.175, p) * (1 - sstep(0.195, 0.23, p)),
  chapter: (p: number, cp: number) =>
    sstep(cp - 0.03, cp, p) * (1 - sstep(cp + 0.045, cp + 0.075, p)),
  /** The student panel is cut before the white-out, not faded through it. */
  panelOut: (p: number) => 1 - sstep(0.85, 0.87, p),

  progressRail: (p: number) => 1 - sstep(WHITE_A + 0.02, WHITE_B, p),
  cursorTrail: (p: number) => 1 - sstep(0.18, 0.3, p),

  dayPetals: (p: number) => sstep(MSG_A, MSG_A + 0.01, p),
  /**
   * No upper bound, deliberately. The callouts are permanent once drawn, so
   * this layer stays up to p = 1 alongside the closing card. It used to cut at
   * BIG_A, which also clipped the fifth line mid-fade - that line ran to
   * p = 0.9895 against a gate that closed at 0.988.
   */
  floatingLinesOn: (p: number) => p >= WHITE_B && p >= MSG_A - 0.004,
  finaleTitle: (p: number) => sstep(BIG_A, BIG_A + 0.007, p),
  finaleMessage: (p: number) => sstep(0.994, 0.999, p),
  finaleCredit: (p: number) => sstep(0.997, 1.0, p),
  replayButton: (p: number) => sstep(0.998, 1.0, p),
} as const;

// --------------------------------------------------------------- constants

/** Scroll smoothing coefficient. See `damp` - this is the 60fps-equivalent k. */
export const SCROLL_DAMP = 0.055;
export const SCROLL_DAMP_REDUCED = 0.22;

/** Seconds the gift box lid takes to open before the scroll unlocks. */
export const GIFT_OPEN_SECONDS = 1.9;
/** Seconds the music box lid takes to open. */
export const MUSIC_BOX_OPEN_SECONDS = 1.4;
/** Walk cycle rate - about 1.55 steps per second. */
export const STEP_FREQUENCY = 3.1;

/** A student is "active" (panel showing, lights up) past this hold strength. */
export const ACTIVE_HOLD_THRESHOLD = 0.22;

/**
 * Mount windows. Each subsystem is unmounted outside its window; it is
 * invisible there anyway, so this removes cost without changing a frame.
 * Windows overlap the gates above so nothing pops in mid-fade.
 */
export const MOUNT = {
  nightWorld: (p: number) => p < 0.92,
  /**
   * The finale ring is built at boot, not when it is reached.
   *
   * Its five rigs have to exist while the street models are downloading,
   * because that is when each student's finale mesh is fetched and attached
   * (see `StudentRow`). Waiting until the white-out would mean starting five
   * more downloads a fraction of a scroll before the ring is on screen, and
   * showing blocky stand-ins until they arrived.
   *
   * Building them mid-scroll instead would just move the problem: three
   * hundred meshes is a visible hitch wherever it lands. It belongs on the
   * loader, with everything else. The scene is separate and only rendered
   * from `WHITE_B`, so until then it costs memory and nothing else.
   */
  dayScene: () => true,
  sky: (p: number) => p < 0.62,
  gardenAndGate: (p: number) => p < 0.7,
  street: (p: number) => p > 0.44 && p < 0.9,
  /** Only students within this many slots of the active one stay mounted. */
  studentRadius: 2,
  /** Models start downloading once the descent is underway. */
  modelLoadStart: 0.3,
} as const;
