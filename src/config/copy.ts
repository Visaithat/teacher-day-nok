/** Every piece of on-screen text that is not a per-student string. */

export interface Chapter {
  /** Scroll position the caption is centred on. */
  readonly p: number;
  readonly text: string;
  /** Sit the caption low (76vh) instead of high (7vh) - used at the gate. */
  readonly low?: boolean;
}

export const COPY = {
  /**
   * The name on the finale card.
   *
   * The source still read "For Teacher Nueng" in COPY, in the markup and in
   * the editor props; the project this was handed over as is for Teacher Nok.
   */
  teacher: 'For Teacher Nok',
  className: 'Class of 2026',

  chapters: [
    { p: 0.295, text: 'The City of Our Dreams' },
    { p: 0.44, text: 'The Gate', low: true },
    { p: 0.535, text: 'Where Every Dream Came True' },
  ] as readonly Chapter[],

  /** Scene 1 */
  giftPrompt: 'A gift is waiting for you, Teacher',
  giftButton: 'Click to open',
  loaderTitle: 'Wrapping your gift…',
  loaderPreparing: 'PREPARING…',

  /** Scene 2 - the title reveals word by word. */
  titleWords: ['Happy', "Teacher's", 'Day'] as readonly string[],
  titleSub: 'With love, from your students',
  scrollHint: 'Scroll down',

  /** Scene 5 - on the panel photograph, inviting the turn to the letter. */
  letterHint: 'Click here to read my letter',
  /** Scene 5 - the way back, in the corner of the letter itself. */
  letterBack: 'back',

  /** Scene 4 */
  musicHint: 'Click to play music',
  nowPlaying: "Now playing · from the gate's music box",
  gateSignTitle: 'THE CITY OF OUR DREAMS',
  gateSignSub: 'WELCOME HOME, TEACHER',

  /** Scene 7 */
  finaleTitle: "Happy Teacher's Day!",
  finaleMessage:
    'Every dream you watered has bloomed. Thank you for believing in us long before we believed in ourselves.',
  replay: 'Replay',

  /** Chrome */
  journeyLabel: 'THE JOURNEY',
  soundOn: 'Sound on',
  soundOff: 'Sound off',
} as const;

/**
 * The five values that were editor-exposed props on the design canvas.
 * Same names, same defaults, except the teacher label (see COPY.teacher).
 */
export interface AppProps {
  /** Multiplies the star count. 0.3 - 1.6. */
  readonly starDensity: number;
  /** Base bloom strength before the white-out ramp. 0 - 1.2. */
  readonly bloomStrength: number;
  readonly grain: boolean;
  readonly teacherLabel: string;
  readonly classLabel: string;
}

export const DEFAULT_PROPS: AppProps = {
  starDensity: 1,
  bloomStrength: 0.34,
  grain: true,
  teacherLabel: COPY.teacher,
  classLabel: COPY.className,
};

/** The class's chosen song, played through a hidden YouTube IFrame player. */
export const YOUTUBE_VIDEO_ID = 'hDU4GB1PTxc';
export const YOUTUBE_VOLUME = 62;
