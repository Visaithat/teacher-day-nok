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
 * All five are the students' own, in Lao, copied in as they wrote them. `wish`
 * is the line the letter closes on, and is signed with the student's own name
 * automatically.
 */
export interface Letter {
  /** The opening line, if the student wrote their own. Defaults to "Dear Teacher,". */
  readonly greeting?: string;
  /**
   * The paragraphs. The card does not scroll; a long letter is set smaller
   * until it fits (see `LetterCard`), so the shorter the bigger.
   */
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
   * Scene 7: nudge this student's callout up, as a fraction of frame height.
   *
   * Portrait only - it moves a row of the ladder, and the ladder is the layout
   * a tall frame uses. The wide frame's elbow solver picks its own spot out of
   * 78 candidates and has no row to nudge.
   *
   * Positive is up. It is applied before the row is clamped into its half of
   * the frame, so it can never push a message into the band reserved for the
   * closing card - ask for more lift than there is room for and you simply get
   * all there was.
   */
  readonly dayLabelLift?: number;

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

  /**
   * Scene 7 seat on a PORTRAIT frame. Omit to keep the wide-frame seat.
   *
   * The finale is the one shot in the film that cannot be rescued by the lens.
   * The camera lies at the centre of the ring, so a head's distance from it is
   * set by body height and lean alone - `dayRadius` never enters it. That has
   * two consequences: a head's size on screen depends only on the fov, and
   * every seat sits 25 to 44 degrees off the optical axis. A portrait frame at
   * fov 74 sees +/-19 degrees horizontally, so four of the five are simply
   * outside it, which is the limitation `PERFORMANCE.md` recorded and left as
   * an art decision.
   *
   * Neither knob alone closes it. A lens wide enough to hold the authored ring
   * is fov 133 - a peephole. Scaling the ring up cannot work at all: `ndc.x`
   * tends to a limit of 2.27 for the widest seat, so it never reaches the
   * frame however large the ring gets. Scaling it down to 0.4 does fit, and
   * puts the whole class inside a 0.8 m circle around your head.
   *
   * So portrait is a SECOND SHOT, and these are its seats - solved by
   * inverting the projection from where each face should land in the frame,
   * because that is the way round this ring was art-directed in the first
   * place. Kengkue sits at bottom centre; the other four climb the frame in a
   * stagger rather than a mirror-symmetric ring, which is what trades
   * horizontal off-axis angle for the vertical room a tall frame has going
   * spare.
   *
   * The radii were re-solved once already. The first set framed the FACES
   * correctly and still looked terrible, because a face was never what filled
   * the screen - the hips sit three times nearer the lens than the heads, so
   * one student's shoulders covered 283% of the frame width. The fix was to
   * raise the whole ring (`RING_LIFT_NARROW` in `DayScene.tsx`); these radii
   * are the same composition re-solved at that new distance, which is why they
   * are all roughly 1.8x their first values and the NDC targets are unchanged.
   *
   * They were solved a THIRD time to get out from behind the closing card.
   * `Finale.tsx` puts "Happy Teacher's Day!" across the middle of the frame,
   * and on a phone that block is nearly the full width - so Vanhxay, sitting
   * at NDC y -0.02, was dead centre behind the lettering, with Timmy and Nina
   * partly under it too. The film's own intent (see the header of
   * `FloatingLines.tsx`) is five faces around a clear gap in the middle, and
   * the wide shot gets that gap from the ring's geometry for free. Portrait
   * has to be told: the band is |ndc.y| < 0.379, a face is 0.082 of NDC tall,
   * so every seat is placed past 0.461. Three across the bottom, two across
   * the top.
   *
   * Composed against `DAY_FOV_NARROW` (96) at aspect 0.462, with the ring
   * lifted 2.6 m. Change either of those without re-solving these and every
   * face moves - `_finale.mjs` is what catches it.
   */
  readonly dayAngleNarrow?: number;
  /** Scene 7 portrait radius, as a multiple of the base 3.9 m. */
  readonly dayRadiusNarrow?: number;

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
      greeting: 'ເຖິງ Teacher Nok ແລະ ອາຈານທຸກໆຄົນ ❤️',
      body: [
        'ຫຼານຢາກຂອບໃຈອາຈານທຸກຄົນສຳລັບທຸກໆຄຳສອນ, ຄຳແນະນຳ ແລະ ຄວາມຫ່ວງໃຍ. ທຸກສິ່ງທີ່ອາຈານເຄີຍສອນ ໄດ້ຄ່ອຍໆຫຼໍ່ຫຼອມໃຫ້ຫຼານມາຮອດຈຸດນີ້.',
        'ມື້ນີ້ ຫຼານໄດ້ເຮັດໜຶ່ງໃນເປົ້າໝາຍສຳຄັນຂອງຊີວິດສຳເລັດ ຄື ການໄດ້ຮັບທຶນໄປຮຽນຕໍ່. ເວັບໄຊນ້ອຍໆທີ່ຫຼານສ້າງນີ້ ຈຶ່ງຢາກໃຫ້ເປັນຂອງຂວັນນ້ອຍໆ ແທນຄຳຂອບໃຈຈາກໃຈ ❤️',
        'ເຖິງຕໍ່ໄປພວກເຮົາອາດຈະບໍ່ໄດ້ພົບກັນເລື້ອຍໆ ແຕ່ບໍ່ວ່າຫຼານຈະໄປຢູ່ໃສ ຫຼານຈະຈື່ສະເໝີວ່າ ຫຼານແມ່ນດາວດວງໜຶ່ງຈາກໂຮງຮຽນດາວດວງນ້ອຍ ⭐️ ແລະຈະພະຍາຍາມເປັ່ງແສງໃຫ້ດີທີ່ສຸດ!',
        'ຂອບໃຈອາຈານທຸກຄົນສຳລັບທຸກຢ່າງ. ຂໍໃຫ້ອາຈານທຸກຄົນສຸຂະພາບແຂງແຮງ, ມີຄວາມສຸກ ແລະ ຢູ່ດີມີແຮງໄປດົນໆເດີ ❤️',
      ],
      wish: 'Love Love ອາຈານທຸກຄົນ! 😂❤️',
    },
    hand: 'patrick',
    doodle: 'robot',
    modelUrl: 'uploads/timmy_web.glb',
    lodUrl: 'uploads/timmy_lod.glb',
    dayModelUrl: 'uploads/timmy_day.glb',
    dayAngle: 72.811,
    dayAngleNarrow: 24.02,
    dayRadiusNarrow: 1.224,
    // He stands left of centre, so his line would default to leaving left.
    dayLabelSide: 'right',
    // Asked for: his line sat low against the frame edge.
    dayLabelLift: 0.05,
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
      greeting: 'ເຖິງ Teacher Nok ແລະ ອາຈານທຸກໆຄົນ ❤️',
      body: [
        'ຕອນນີ້ ຫຼານກຳລັງເດີນຕາມເປົ້າໝາຍຂອງຫຼານຢູ່ທີ່ປະເທດຈີນ. ເຖິງບາງຄັ້ງມັນຈະຍາກ ແລະ ມີຫຼາຍອຸປະສັກ ແຕ່ຫຼານຈະບໍ່ຍອມແພ້ ແລະ ຈະພະຍາຍາມເດີນຕໍ່ໄປໃຫ້ເຖິງຄວາມຝັນ.',
        'ຈາກສ່ວນເລິກຂອງຫົວໃຈ ຫຼານຢາກຂອບໃຈອາຈານທຸກຄົນ ສຳລັບຄຳສອນ, ຄຳແນະນຳ ແລະ ທຸກໆສິ່ງທີ່ອາຈານເຄີຍມອບໃຫ້. ຖ້າບໍ່ມີອາຈານ ຫຼານອາດຈະບໍ່ໄດ້ມາຮອດຈຸດນີ້.',
        'ຂໍໃຫ້ອາຈານທຸກຄົນສຸຂະພາບແຂງແຮງ, ມີຄວາມສຸກ, ສອນນັກຮຽນແບບມີຄວາມສຸກ ແລະ ຢ່າລືມພັກຜ່ອນກັນແດ່ເດີ 😂❤️',
        'ຂອບໃຈສຳລັບທຸກຢ່າງ. ຫຼານຈະພະຍາຍາມເຮັດໃຫ້ອາຈານພູມໃຈໃນຕົວຫຼານ. ❤️',
      ],
      wish: 'ຮັກອາຈານທຸກຄົນເດີ້',
    },
    hand: 'caveat',
    doodle: 'palette',
    modelUrl: 'uploads/kengkue_web.glb',
    lodUrl: 'uploads/kengkue_lod.glb',
    dayModelUrl: 'uploads/kengkue_day.glb',
    dayAngle: 0.811,
    dayAngleNarrow: 0.0,
    dayRadiusNarrow: 1.556,
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
      greeting: 'ເຖິງ Teacher Nok ແລະ ອາຈານທຸກໆຄົນ ❤️',
      body: [
        'ເອົາຕົງໆ ຫຼານບໍ່ຄ່ອຍເກັ່ງໃນການເວົ້າຄວາມຮູ້ສຶກ 😅 ແຕ່ຄັ້ງນີ້ຢາກຈະບອກອາຈານຈາກໃຈວ່າ ຂອບໃຈຫຼາຍໆ.',
        'ຂອບໃຈອາຈານທີ່ຄອຍແນະນຳ, ຄອຍຊີ້ທາງ ແລະ ໃຫ້ຄຳແນະນຳດີໆກັບຫຼານຢູ່ຫຼາຍຄັ້ງ. ບາງຄຳແນະນຳອາດເປັນພຽງຄຳເວົ້າສັ້ນໆສຳລັບອາຈານ ແຕ່ສຳລັບຫຼານ ມັນກັບເປັນສິ່ງທີ່ຫຼານຈື່ໄວ້ໄດ້ດົນ.',
        'ຫຼານດີໃຈຫຼາຍທີ່ເຄີຍໄດ້ເປັນສ່ວນໜຶ່ງຂອງ ໂຮງຮຽນດາວດວງນ້ອຍ. ມັນເປັນບ່ອນທີ່ຫຼານໄດ້ຮຽນຮູ້ຫຼາຍຢ່າງ ບໍ່ແມ່ນພຽງແຕ່ຈາກປຶ້ມ ແຕ່ຍັງໄດ້ຮຽນຈາກຄົນຮອບຂ້າງ ແລະ ຈາກອາຈານທຸກຄົນ.',
        'ສຸດທ້າຍ ຫຼານຂໍໃຫ້ອາຈານທຸກຄົນມີຮອຍຍິ້ມຫຼາຍໆໃນທຸກໆມື້, ມີລູກສິດດີໆທີ່ບໍ່ເຮັດໃຫ້ປວດຫົວ 😂 ແລະ ຂໍໃຫ້ທຸກໆວັນຂອງອາຈານເຕັມໄປດ້ວຍຄວາມສຸກ.',
      ],
      wish: 'ຮັກອາຈານທຸກໆຄົນສະເໝີເດີ້ ❤️',
    },
    hand: 'indie',
    doodle: 'bug',
    modelUrl: 'uploads/vanhxay_web.glb',
    lodUrl: 'uploads/vanhxay_lod.glb',
    dayModelUrl: 'uploads/vanhxay_day.glb',
    dayAngle: 288.811,
    dayAngleNarrow: 335.20,
    dayRadiusNarrow: 1.230,
    // He stands right of centre, so his line would default to leaving right.
    dayLabelSide: 'left',
    // Asked for: his line sat below his own face rather than beside it.
    dayLabelLift: 0.05,
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
    finaleMsg: "ເລີດມາກຄ່ະເຊີ້ນົກ",
    photo: 'uploads/namthip_photo.jpg',
    panelPhoto: 'uploads/namthip_panel.jpg',
    letter: {
      body: [
        'ສຸກສັນວັນຄູເນີ້ເຊີ້ ຂໍອວຍພອນໃຫ້ເຊີ້ແລະຄູອາຈານທຸກຄົນມີສຸຂະພາບແຂງແຮງ, ສຸກສົມຫວັງກັບສິ່ງທີ່ຕ້ອງການ.',
        'ພວກຫຼານກໍກຳລັງອອກໄປໃຊ້ຊີວິດ, ໄປຊອກຮູ້ປະສົບການໃຫ້ຕົນເອງ, ໄດ້ພົບເຈີກັບຜູ້ຄົນທີ່ຫຼາກຫຼາຍ ແຕ່ກະຫວັງວ່າພວກເຮົາຈະໄດ້ໄປກິນຊີ້ນດາດພ້ອມໜ້າພ້ອມຕາກັນໄວໆນີ້ເດີ້ເຊີ້ 😆',
      ],
      wish: 'ຫວັງວ່າອາຈານທຸກຄົນຈະຍັງສະບາຍດີ, ແຂງແຮງ, ມ່ວນຊື່ນກັບນ້ອງໆນັກຮຽນສະເໝີມາ 🫶',
    },
    hand: 'shadows',
    doodle: 'flask',
    modelUrl: 'uploads/namthip_web.glb',
    lodUrl: 'uploads/namthip_lod.glb',
    dayModelUrl: 'uploads/namthip_day.glb',
    dayAngle: 216.811,
    dayAngleNarrow: 196.27,
    dayRadiusNarrow: 1.523,
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
      greeting: 'ເຖິງ Teacher Nok ແລະ ອາຈານທຸກໆຄົນ ❤️',
      body: [
        'ກ່ອນອື່ນເລີຍ ຫຼານຢາກຂອບໃຈອາຈານສຳລັບທຸກໆຢ່າງທີ່ຜ່ານມາ. ທັງຄຳສອນ, ຄຳແນະນຳ, ຄວາມຫ່ວງໃຍ ແລະ ຄວາມຊົງຈຳດີໆ ທີ່ອາຈານເຄີຍມອບໃຫ້.',
        'ຕອນນີ້ ຫຼານກຳລັງເດີນຕາມຄວາມຝັນຂອງຕົນເອງ ຄືການໄປຮຽນຕໍ່ຕ່າງປະເທດ ເຫມືອນກັບໝູ່ໆອີກຫຼາຍຄົນ. ອາດຈະມີທັງຄວາມຕື່ນເຕັ້ນ, ຄວາມກັງວົນ ແລະ ຄວາມຄິດຮອດ, ແຕ່ຫຼານກໍຈະພະຍາຍາມເດີນຕໍ່ໄປໃຫ້ດີທີ່ສຸດ.',
        'ສິ່ງໜຶ່ງທີ່ຫຼານຮູ້ແນ່ນອນຄື ຫຼານຈະ ຄິດຮອດໂຮງຮຽນດາວດວງນ້ອຍ. ເພາະບ່ອນນີ້ບໍ່ແມ່ນພຽງໂຮງຮຽນທີ່ໃຫ້ຄວາມຮູ້ ແຕ່ເປັນບ່ອນທີ່ຄ່ອຍໆຫຼໍ່ຫຼອມຫຼານ ແລະ ເຮັດໃຫ້ຫຼານກາຍເປັນຫຼານໃນມື້ນີ້.',
        'ບໍ່ວ່າຫຼານຈະໄປໄກປານໃດ ຫຼານຈະຍັງຈື່ຈຳອາຈານ ແລະ ຄວາມຊົງຈຳຢູ່ດາວດວງນ້ອຍສະເໝີ. ❤️',
        'ຂໍໃຫ້ອາຈານທຸກຄົນມີແຕ່ສິ່ງດີໆເຂົ້າມາໃນຊີວິດ, ມີຄວາມສຸກກັບທຸກໆມື້ ແລະ ຂໍໃຫ້ອາຈານຍັງຄົງເປັນ “ຄົນຈຸດດາວ” ໃຫ້ນັກຮຽນຮຸ່ນຕໍ່ໆໄປອີກຫຼາຍໆຄົນເດີ ⭐️',
        'ຂອບໃຈສຳລັບທຸກຢ່າງ.',
      ],
      wish: 'ຮັກ ແລະ ຄິດຮອດອາຈານທຸກຄົນ ❤️',
    },
    hand: 'gloria',
    doodle: 'sprout',
    modelUrl: 'uploads/nina_web.glb',
    lodUrl: 'uploads/nina_lod.glb',
    dayModelUrl: 'uploads/nina_day.glb',
    dayAngle: 144.811,
    dayAngleNarrow: 157.58,
    dayRadiusNarrow: 1.211,
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
