/**
 * ===========================================================================
 * THE ROSTER — the single place to edit the five students.
 * ===========================================================================
 *
 * Order matters: entry 1 is the first student met on the street. Adding or
 * removing an entry automatically adds or removes a full camera stop
 * (walk -> notice -> push-in -> hold -> pull-back) and a finale ring slot.
 *
 * TODO(you): the five `finaleMsg` lines are still placeholders. They are the
 * lines that float into the sky in Scene 7 — the last thing anyone reads.
 * Everything else is written.
 */

/** Drives the built blocky figure's hair. */
export type HairStyle = 'spikySwept' | 'longWavy' | 'wrapHair';

/** Drives the built blocky figure's clothing. The finale forces 'uniform'. */
export type Outfit = 'leather' | 'robeRed' | 'robeGold' | 'textile' | 'sequin' | 'uniform';

/** The greeting played once the camera settles on a student. */
export type Greeting = 'thumbs_jump' | 'lift' | 'wave_shuffle' | 'bow' | 'wave_surprise';

/** Which staged prop set is built around the student. */
export type PropKind = 'artist' | 'programmer' | 'researcher' | 'business' | 'ai';

/** Scene 7 reaction, assigned round-robin by ring index. */
export type WakeGesture = 'smile' | 'wave' | 'thumbs' | 'reach' | 'laugh';

/**
 * Whose handwriting the letter is in. One per student, never shared — five
 * letters in the same hand would read as one person pretending to be five.
 * The faces themselves are in `letterHands.tsx`.
 */
export type Hand = 'patrick' | 'caveat' | 'indie' | 'shadows' | 'gloria';

/** The little drawing in the corner of the letter. See `letterHands.tsx`. */
export type Doodle = 'robot' | 'palette' | 'bug' | 'flask' | 'sprout';

/**
 * The handwritten note on the back of the panel photo.
 *
 * TODO(you): the memories in `body` are written, not remembered — they are
 * plausible for each student's subject and nothing more. Swap in the real
 * ones; that is the whole point of the card. `wish` is the blessing the
 * letter closes on, and is signed with the student's own name automatically.
 */
export interface Letter {
  /** Two short paragraphs. Keep them short — the card does not scroll. */
  readonly body: readonly string[];
  /** The last line: the blessing. */
  readonly wish: string;
}

export interface StudentConfig {
  /** Name shown on the label, the sign and the side panel. */
  readonly en: string;
  /** Profession, shown after the em dash on the label. */
  readonly roleEn: string;
  readonly greeting: Greeting;
  /** The line on their street sign in Scene 5. */
  readonly msg: string;
  /** The line that floats into the sky in Scene 6. PLACEHOLDER. */
  readonly finaleMsg: string;

  /** The plate on the street easel. */
  readonly photo: string;
  /** The shot in the side panel — a tighter crop of the same person. */
  readonly panelPhoto: string;

  /** What is written on the back of that panel photo, once it is turned over. */
  readonly letter: Letter;
  /** The face that letter is written in. */
  readonly hand: Hand;
  /** The drawing in its corner. */
  readonly doodle: Doodle;

  /** Generated GLB that replaces the built figure. */
  readonly modelUrl: string;
  /** Lower-poly GLB, swapped in by THREE.LOD past ~26 units. */
  readonly lodUrl: string;
  /** The Scene 7 finale mesh. Falls back to cloning the street model. */
  readonly dayModelUrl: string;

  /** Optional extra PBR maps for the model, applied when present. */
  readonly normalMap?: string;
  readonly roughnessMap?: string;
  readonly metalnessMap?: string;

  /** Multiplier on the focus rim light — raise it for dark outfits. */
  readonly rimBoost?: number;
  /** Lifts the model's metalness a little so gold trim catches the lamps. */
  readonly goldAccents?: boolean;
  /** The staged prop set built around them on the street. */
  readonly props?: PropKind;
  /**
   * A finished piece staged on the ground in front of them, loaded lazily by
   * the prop kit. Only the artist's kit reads it.
   */
  readonly artworkUrl?: string;
  /**
   * A figurine standing on their desk, loaded lazily by the prop kit. Only
   * the programmer's kit reads it.
   */
  readonly dollUrl?: string;

  /**
   * Scene 7 ring seat, in degrees around Y measured from +Z.
   *
   * The film's own seats. It places student `i` at `i / 5 * 2pi + 0.3` radians
   * measured from +X, and reads that off as `(cos a, 0, sin a)`; this scene
   * measures from +Z and reads `(sin t, 0, cos t)`, so `t = 90 - a` degrees.
   * That is where the .811 comes from — it is 90 minus the film's 0.3 rad
   * offset, and it runs the ring the other way round, which is what puts
   * Kengkue at the bottom of frame and Namthip at the top.
   *
   * Written out rather than derived from the index so a seat can be swapped
   * without moving anybody else, and so the layout reads off this file alone.
   */
  readonly dayAngle: number;

  /**
   * Scene 7: which side of this student their message is written on.
   *
   * By default a callout leaves toward the nearer edge of the frame, which is
   * whichever side of centre the student is standing on. Set this to override
   * that for one person. The line still exits outward from the head; only the
   * horizontal run of the elbow, and the words on the end of it, change sides.
   *
   * It is a preference, not a command: if the forced side leaves no room, or
   * would put the words over somebody's face, the solver falls back to the
   * other one rather than dropping the message.
   */
  readonly dayLabelSide?: 'left' | 'right';

  /**
   * Scene 7: extra forward tilt over the lens, in radians, on top of the
   * ring's shared 0.34 (about 19 degrees). Omit for none.
   *
   * Tipping somebody further forward turns their face down toward the camera,
   * and also swings their head inward - the tilt pivots at the hips, so the
   * head travels toward the middle of the frame as it comes down. Roughly 0.16
   * here moves a head about 0.06 of the frame height inward, which the callout
   * solver picks up on its own.
   */
  readonly dayLean?: number;

  /**
   * Scene 7 ring radius, as a multiple of the ring's base 3.9 m. Omit for 1.
   *
   * This is what keeps the ring from reading as a diagram: pulling somebody in
   * makes them loom over the lens while the far seats hang back at the frame
   * edge. Kengkue at 0.66 is the closest face in the film.
   */
  readonly dayRadius?: number;

  /** The reference avatar the appearance was traced from. Never rendered. */
  readonly ref?: string;

  // ---- appearance: drives the built blocky figure -------------------------
  readonly skin: string;
  readonly hair: string;
  readonly hairStyle: HairStyle;
  /** 1.0 is the baseline; 0.92-1.06 reads as natural variation. */
  readonly height: number;
  readonly outfit: Outfit;
  /** Main garment colour. */
  readonly color: string;
  /** Trim / embroidery colour. */
  readonly accent: string;
  /** Draws lipstick on the face decal. */
  readonly lips?: boolean;
  readonly iris?: string;
  readonly hairTip?: string;
}

export const STUDENTS: readonly StudentConfig[] = [
  {
    en: 'Timmy',
    roleEn: 'AI Engineer',
    greeting: 'thumbs_jump',
    msg: 'I build AI now. Still not as smart as you.',
    finaleMsg: 'ເຊີ້ຫຼານອົກຫັກນ່ະ ມາຟັງຫຼານຈົ່ມຈັກບາດແນ່ T-T',
    photo: 'uploads/timmy_photo.jpg',
    panelPhoto: 'uploads/timmy_panel.jpg',
    letter: {
      body: [
        'You never told me a question was stupid. You just said go and find out — and then stayed late while I did.',
        'I teach machines to learn for a living now. None of them learn the way you taught me to.',
      ],
      wish: 'May every year ahead be as patient with you as you were with me.',
    },
    hand: 'patrick',
    doodle: 'robot',
    modelUrl: 'uploads/timmy_web.glb',
    lodUrl: 'uploads/timmy_lod.glb',
    dayModelUrl: 'uploads/timmy_day.glb',
    dayAngle: 72.811,
    // He stands left of centre, so his line would default to leaving left.
    dayLabelSide: 'right',
    // ADDED: aiProps was written for him but never wired up in the source.
    props: 'ai',
    ref: 'uploads/pasted-1788861151353-0.png',
    skin: '#f3cfae',
    hair: '#141118',
    hairStyle: 'spikySwept',
    height: 1.0,
    outfit: 'leather',
    color: '#17161a',
    accent: '#c9333a',
  },
  {
    en: 'Kengkue',
    roleEn: 'Artist',
    greeting: 'lift',
    msg: 'You called my doodles talent. Nobody else did.',
    finaleMsg: 'ເຊີ້ ມີຫຍັງໃຫ້ຫຼານຊ່ວຍບໍ່',
    photo: 'uploads/kengkue_photo.jpg',
    panelPhoto: 'uploads/kengkue_panel.jpg',
    letter: {
      body: [
        'You caught me drawing in the margins of my maths book. You did not take it away — you asked me what it was.',
        'That was the first time anyone called it art instead of a mess. I have not stopped since.',
      ],
      wish: 'May your days stay as full of colour as the ones you gave us.',
    },
    hand: 'caveat',
    doodle: 'palette',
    modelUrl: 'uploads/kengkue_web.glb',
    lodUrl: 'uploads/kengkue_lod.glb',
    dayModelUrl: 'uploads/kengkue_day.glb',
    dayAngle: 0.811,
    dayRadius: 0.66,
    // He is the closest face in the film; tipping him further over the lens is
    // what makes him read as leaning right down into it.
    dayLean: 0.16,
    // mostly-black outfit: lift the rim light so he keeps a silhouette
    rimBoost: 1.6,
    props: 'artist',
    // The piece he is standing over: the five of us, on graduation day.
    artworkUrl: 'uploads/kengkue_artwork.glb',
    ref: 'uploads/pasted-1788861158635-0.png',
    skin: '#f6d6b4',
    hair: '#12101a',
    hairStyle: 'spikySwept',
    height: 1.04,
    outfit: 'robeRed',
    color: '#1b1a1f',
    accent: '#b3242b',
  },
  {
    en: 'Vanhxay',
    roleEn: 'Programmer',
    greeting: 'wave_shuffle',
    msg: 'You debugged me long before I could code.',
    finaleMsg: 'ເຊີ້ສົນໃຈຊື້ໄອດີເກມ freefire ຫຼານບໍ່ 555555',
    photo: 'uploads/vanhxay_photo.jpg',
    panelPhoto: 'uploads/vanhxay_panel.jpg',
    letter: {
      body: [
        'I broke the school computer twice. Both times you sat down beside me and made me find the fault myself.',
        'That is still exactly how I work: find what is broken, stay until it runs.',
      ],
      wish: 'May everything in your life run clean, and nothing you love ever crash.',
    },
    hand: 'indie',
    doodle: 'bug',
    modelUrl: 'uploads/vanhxay_web.glb',
    lodUrl: 'uploads/vanhxay_lod.glb',
    dayModelUrl: 'uploads/vanhxay_day.glb',
    dayAngle: 288.811,
    // He stands right of centre, so his line would default to leaving right.
    dayLabelSide: 'left',
    // near-black outfit: same rim treatment as Kengkue
    rimBoost: 1.6,
    // gold emblems are the only thing separating him from the dark street
    goldAccents: true,
    props: 'programmer',
    // The little figure that keeps him company next to the laptop.
    dollUrl: 'uploads/vanhxay_doll.glb',
    ref: 'uploads/pasted-1788861163518-0.png',
    skin: '#f4d2b0',
    hair: '#131017',
    hairStyle: 'spikySwept',
    height: 1.02,
    outfit: 'robeGold',
    color: '#1a1a1e',
    accent: '#d3a44a',
  },
  {
    en: 'Namthip',
    roleEn: 'Natural Science Researcher',
    greeting: 'bow',
    msg: 'I have a lab now. You gave me the curiosity.',
    finaleMsg: "what's up Sir. ເບິ່ງແຜນວຽກໃຫ້ຫຼານແດ່",
    photo: 'uploads/namthip_photo.jpg',
    panelPhoto: 'uploads/namthip_panel.jpg',
    letter: {
      body: [
        'You let me keep a jar of pond water on the windowsill for a month, just to see whether anything would grow in it.',
        'Something did. I have been looking down a microscope ever since, and it still feels the same.',
      ],
      wish: 'May you keep finding small wonderful things, the way you taught us to.',
    },
    hand: 'shadows',
    doodle: 'flask',
    modelUrl: 'uploads/namthip_web.glb',
    lodUrl: 'uploads/namthip_lod.glb',
    dayModelUrl: 'uploads/namthip_day.glb',
    dayAngle: 216.811,
    dayRadius: 0.82,
    // ADDED: researcherProps was written for her but never wired up.
    props: 'researcher',
    ref: 'uploads/pasted-1788861169910-0.png',
    skin: '#eec6a2',
    hair: '#3a2419',
    hairStyle: 'wrapHair',
    height: 0.96,
    lips: true,
    iris: '#33210f',
    outfit: 'textile',
    color: '#f6f2ea',
    accent: '#9c2b2b',
  },
  {
    en: 'Nina',
    roleEn: 'Businesswoman',
    greeting: 'wave_surprise',
    msg: 'Best investment of my life: your patience.',
    finaleMsg: 'ເຊີ້ມື້ນີ້ຫຼານງາມບໍ່',
    photo: 'uploads/nina_photo.jpg',
    panelPhoto: 'uploads/nina_panel.jpg',
    letter: {
      body: [
        'I was the loud one at the back. Instead of a punishment you handed me the class register to look after.',
        'You were the first person who ever trusted me with something. I have built everything on that.',
      ],
      wish: 'May everything you gave away without counting come back to you twice over.',
    },
    hand: 'gloria',
    doodle: 'sprout',
    modelUrl: 'uploads/nina_web.glb',
    lodUrl: 'uploads/nina_lod.glb',
    dayModelUrl: 'uploads/nina_day.glb',
    dayAngle: 144.811,
    dayRadius: 0.82,
    // ADDED: businessProps was written for her but never wired up.
    props: 'business',
    ref: 'uploads/pasted-1788861175785-0.png',
    skin: '#f0c8a4',
    hair: '#5a3b27',
    hairTip: '#6d4a31',
    hairStyle: 'longWavy',
    height: 0.98,
    lips: true,
    iris: '#4d2f1e',
    outfit: 'sequin',
    color: '#dfe3e8',
    accent: '#cfd6de',
  },
];

export const STUDENT_COUNT = STUDENTS.length;

/** Scene 7 gestures, assigned by ring index exactly as the source does. */
const WAKE_GESTURES: readonly WakeGesture[] = ['smile', 'wave', 'thumbs', 'reach', 'laugh'];

export function wakeGestureFor(index: number): WakeGesture {
  return WAKE_GESTURES[index % WAKE_GESTURES.length] as WakeGesture;
}

/**
 * Which side of the street a student stands on: even indices left (-1), odd
 * right (+1). Drives the camera slot, the message-panel side flip, the
 * figure's resting yaw and which arm is free to wave.
 */
export function sideFor(index: number): -1 | 1 {
  return index % 2 === 0 ? -1 : 1;
}

/** Resolve a roster asset path against the served root. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
