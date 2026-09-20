import { makeRandom } from '../lib/math';
import { fitLines } from './fitLines';
import { COPY } from '../config/copy';
import type { StudentConfig } from '../config/students';

/**
 * Every procedural texture in the film, as pure draw functions.
 *
 * They take a 2D context rather than creating one, so the font-independent
 * ones can run on an OffscreenCanvas inside a worker while the ones that
 * measure text stay on the main thread (worker FontFaceSet support is not
 * portable, and a sign rendered in a fallback face is immediately obvious).
 *
 * All randomness is seeded. The source used `Math.random()`, so the city
 * skyline and flower beds were reshuffled on every load; seeding them costs
 * nothing visually and makes before/after profiling comparable frame to frame.
 */

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// ---------------------------------------------------------------- font-free

/** The workhorse sprite map: every halo, glow, pool, mote and petal uses it. */
export function drawGlow(g: Ctx2D, w: number, h: number): void {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.28, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/** Lit apartment windows. One per building batch, tinted warm or cool. */
export function drawWindows(g: Ctx2D, w: number, h: number, tint: string, seed: number): void {
  const rand = makeRandom(seed);
  g.fillStyle = '#101018';
  g.fillRect(0, 0, w, h);
  for (let y = 6; y < h - 8; y += 16) {
    for (let x = 6; x < w - 8; x += 16) {
      const lit = rand() > 0.42;
      g.globalAlpha = lit ? 0.55 + rand() * 0.45 : 1;
      g.fillStyle = lit ? tint : 'rgba(24,26,38,1)';
      g.fillRect(x, y, 8, 9);
    }
  }
  g.globalAlpha = 1;
}

/**
 * The lunar surface: dark maria, bright ejecta rays around fresh craters, and
 * a dusting of regolith speckle. Used as both colour map and bump map, which
 * is what gives the terminator its real relief.
 */
export function drawMoon(g: Ctx2D, w: number, h: number): void {
  const rand = makeRandom(0x1f0f0f);
  g.fillStyle = '#b9b4ac';
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const y = h * 0.18 + rand() * h * 0.64;
    const r = 60 + rand() * 190;
    const grad = g.createRadialGradient(x, y, r * 0.2, x, y, r);
    grad.addColorStop(0, 'rgba(108,106,104,0.85)');
    grad.addColorStop(1, 'rgba(108,106,104,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  }

  const crater = (x: number, y: number, r: number): void => {
    const rim = g.createRadialGradient(x, y, r * 0.55, x, y, r * 1.25);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(0.55, 'rgba(245,243,238,0.55)');
    rim.addColorStop(1, 'rgba(245,243,238,0)');
    g.fillStyle = rim;
    g.beginPath();
    g.arc(x, y, r * 1.25, 0, 6.3);
    g.fill();

    const bowl = g.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
    bowl.addColorStop(0, 'rgba(92,90,88,0.75)');
    bowl.addColorStop(0.7, 'rgba(126,123,120,0.5)');
    bowl.addColorStop(1, 'rgba(150,147,143,0)');
    g.fillStyle = bowl;
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  };

  for (let i = 0; i < 300; i++) {
    crater(rand() * w, rand() * h, 2 + Math.pow(rand(), 3) * 30);
  }

  for (let i = 0; i < 900; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(60,58,56,0.05)';
    g.beginPath();
    g.arc(rand() * w, rand() * h, 1 + rand() * 3, 0, 6.3);
    g.fill();
  }
}

/** A narrow diagonal specular streak, raked across the framed photo glass. */
export function drawGleam(g: Ctx2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, h, w, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0)');
  grad.addColorStop(0.52, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/** A soft cluster blob. Clouds are built from these, so they have no edges. */
export function drawCloudPuff(g: Ctx2D, w: number, h: number): void {
  const rand = makeRandom(0x0c10d5);
  g.clearRect(0, 0, w, h);

  const blob = (x: number, y: number, r: number, a: number): void => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.45, `rgba(255,255,255,${a * 0.55})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  };

  blob(128, 132, 116, 0.72);
  for (let i = 0; i < 14; i++) {
    const a = rand() * 6.3;
    const d = rand() * 52;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.7, 34 + rand() * 46, 0.3 + rand() * 0.3);
  }
}

/** Ground fog: overlapping soft patches on a transparent plane. */
export function drawFog(g: Ctx2D, w: number, h: number): void {
  const rand = makeRandom(0xf0607);
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 30 + rand() * 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.32)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  }
}

/** Scene 7's sky dome: a clear morning with soft cumulus, sun out of frame. */
export function drawDaySky(g: Ctx2D, w: number, h: number): void {
  const rand = makeRandom(0x5a9ae6);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#5a9ae6');
  grad.addColorStop(0.55, '#8ec3f2');
  grad.addColorStop(1, '#dbeeff');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 46; i++) {
    const x = rand() * w;
    const y = h * 0.25 + rand() * h * 0.55;
    const r = 26 + rand() * 70;
    for (let k = 0; k < 6; k++) {
      const cx = x + (rand() - 0.5) * r;
      const cy = y + (rand() - 0.5) * r * 0.5;
      const puff = g.createRadialGradient(cx, cy, 0, x, y, r);
      puff.addColorStop(0, 'rgba(255,255,255,0.55)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = puff;
      g.beginPath();
      g.arc(x, y, r, 0, 6.3);
      g.fill();
    }
  }
}

/**
 * The night environment map: horizon sky gradient, the orange sodium glow of
 * the city below, scattered lit windows and the moon. Feeds the PMREM that
 * every PBR material in the night scene reflects.
 */
export function drawNightEnv(g: Ctx2D, w: number, h: number): void {
  const rand = makeRandom(0x0e1a2b);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#05070f');
  sky.addColorStop(0.42, '#0a0e1c');
  sky.addColorStop(0.62, '#1b1a24');
  sky.addColorStop(0.78, '#2e2116');
  sky.addColorStop(1, '#150e08');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  const glow = g.createLinearGradient(0, h * 0.56, 0, h * 0.8);
  glow.addColorStop(0, 'rgba(255,150,70,0)');
  glow.addColorStop(0.5, 'rgba(255,150,70,0.55)');
  glow.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = glow;
  g.fillRect(0, h * 0.56, w, h * 0.24);

  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    const y = h * 0.6 + rand() * h * 0.18;
    const r = 4 + rand() * 16;
    const spot = g.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, 'rgba(255,190,120,0.7)');
    spot.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = spot;
    g.beginPath();
    g.arc(x, y, r, 0, 6.3);
    g.fill();
  }

  const moon = g.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, 90);
  moon.addColorStop(0, 'rgba(200,220,255,0.85)');
  moon.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = moon;
  g.beginPath();
  g.arc(w * 0.3, h * 0.2, 90, 0, 6.3);
  g.fill();
}

// ----------------------------------------------------------- font-dependent

/** The five expressions a figure's face decal can hold. */
export type FaceMood = 'neutral' | 'smile' | 'grin' | 'surprised' | 'blink';

export const FACE_MOODS: readonly FaceMood[] = [
  'neutral',
  'smile',
  'grin',
  'surprised',
  'blink',
];

/**
 * A student's face, painted flat onto the front of the head cube.
 *
 * All five moods are baked at build time and swapped by changing one map, so
 * blinking and reacting cost nothing at runtime. The features are drawn rather
 * than modelled, which is what lets a box read as a person: the eyes carry an
 * iris, a pupil and a catchlight, and the lash line is the heaviest stroke on
 * the face because at this scale it is what the eye actually reads.
 */
export function drawFace(g: Ctx2D, w: number, h: number, s: StudentConfig, mood: FaceMood): void {
  const cx = w / 2;
  const ex = 92; // eye offset from centre
  const ey = 244;
  const my = 372; // mouth line
  const iris = s.iris ?? '#4a2d1c';
  const lips = s.lips === true;

  g.fillStyle = s.skin;
  g.fillRect(0, 0, w, h);

  // A soft vertical gradient down the bridge of the nose. Without it the
  // face reads as a flat sticker.
  const nose = g.createLinearGradient(cx - 26, 250, cx + 26, 320);
  nose.addColorStop(0, 'rgba(150,100,70,0.10)');
  nose.addColorStop(1, 'rgba(150,100,70,0)');
  g.fillStyle = nose;
  g.fillRect(cx - 30, 250, 60, 80);

  for (const sx of [-1, 1]) {
    const blush = g.createRadialGradient(cx + sx * 150, 300, 4, cx + sx * 150, 300, 62);
    blush.addColorStop(0, 'rgba(196,116,102,0.16)');
    blush.addColorStop(1, 'rgba(196,116,102,0)');
    g.fillStyle = blush;
    g.beginPath();
    g.arc(cx + sx * 150, 300, 62, 0, 6.3);
    g.fill();
  }

  // Eyebrows. Raised on 'surprised' - that lift is most of the expression.
  g.fillStyle = s.hair;
  const by = mood === 'surprised' ? 168 : 186;
  for (const sx of [-1, 1]) {
    const bx = cx + sx * ex;
    g.beginPath();
    g.moveTo(bx - sx * 46, by + 16);
    g.quadraticCurveTo(bx, by - 12, bx + sx * 44, by + 4);
    g.quadraticCurveTo(bx, by + 4, bx - sx * 46, by + 24);
    g.closePath();
    g.fill();
  }

  if (mood === 'blink') {
    g.strokeStyle = '#3b2a20';
    g.lineWidth = 9;
    g.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const cxx = cx + sx * ex;
      g.beginPath();
      g.moveTo(cxx - 42, ey + 6);
      g.quadraticCurveTo(cxx, ey + 20, cxx + 42, ey + 6);
      g.stroke();
    }
  } else {
    const openY = mood === 'surprised' ? 1.18 : mood === 'grin' ? 0.78 : 1;
    const rw = 40;
    const rh = 34 * openY;

    for (const sx of [-1, 1]) {
      const cxx = cx + sx * ex;

      g.save();
      g.beginPath();
      g.ellipse(cxx, ey, rw, rh, 0, 0, 6.3);
      g.clip();

      g.fillStyle = '#fbf9f7';
      g.fillRect(cxx - rw, ey - rh, rw * 2, rh * 2);

      g.fillStyle = iris;
      g.beginPath();
      g.arc(cxx + sx * 3, ey + 3, 23, 0, 6.3);
      g.fill();

      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.arc(cxx + sx * 3, ey + 3, 11, 0, 6.3);
      g.fill();

      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(cxx + sx * 3 - 9, ey - 8, 6.5, 0, 6.3);
      g.fill();

      // The upper lid casts onto the eyeball; without it the eye floats.
      g.fillStyle = 'rgba(120,80,60,0.22)';
      g.fillRect(cxx - rw, ey - rh, rw * 2, 12);
      g.restore();

      g.strokeStyle = '#241812';
      g.lineWidth = lips ? 11 : 8;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cxx - rw - 2, ey - rh * 0.5);
      g.quadraticCurveTo(cxx, ey - rh - 5, cxx + rw + 2, ey - rh * 0.5);
      g.stroke();

      if (lips) {
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(cxx + sx * (rw - 2), ey - rh * 0.5);
        g.lineTo(cxx + sx * (rw + 16), ey - rh - 4);
        g.stroke();
      }

      g.strokeStyle = 'rgba(60,40,30,0.35)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cxx - rw + 4, ey + rh + 4);
      g.quadraticCurveTo(cxx, ey + rh + 12, cxx + rw - 4, ey + rh + 4);
      g.stroke();
    }
  }

  drawMouth(g, cx, my, mood, lips);
}

function drawMouth(g: Ctx2D, cx: number, my: number, mood: FaceMood, lips: boolean): void {
  if (lips) {
    const lip = '#c05f66';
    const lipD = '#a34a53';

    if (mood === 'grin') {
      g.fillStyle = lipD;
      g.beginPath();
      g.ellipse(cx, my + 4, 66, 40, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = '#fffaf6';
      g.beginPath();
      g.ellipse(cx, my - 4, 60, 20, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = lip;
      g.beginPath();
      g.ellipse(cx, my - 6, 66, 14, 0, Math.PI, 0);
      g.fill();
      return;
    }

    if (mood === 'surprised') {
      g.fillStyle = lipD;
      g.beginPath();
      g.ellipse(cx, my, 30, 36, 0, 0, 6.3);
      g.fill();
      return;
    }

    g.fillStyle = lip;
    g.beginPath();
    g.moveTo(cx - 56, my);
    g.quadraticCurveTo(cx, my + (mood === 'smile' ? 40 : 22), cx + 56, my);
    g.quadraticCurveTo(cx, my - 16, cx - 56, my);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath();
    g.ellipse(cx, my - 4, 22, 5, 0, 0, 6.3);
    g.fill();
    return;
  }

  g.strokeStyle = '#8d5a50';
  g.lineCap = 'round';

  if (mood === 'grin') {
    g.fillStyle = '#6f3a34';
    g.beginPath();
    g.ellipse(cx, my + 2, 54, 30, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = '#fff8f2';
    g.beginPath();
    g.ellipse(cx, my - 6, 48, 13, 0, 0, Math.PI);
    g.fill();
    return;
  }

  if (mood === 'surprised') {
    g.fillStyle = '#6f3a34';
    g.beginPath();
    g.ellipse(cx, my, 24, 30, 0, 0, 6.3);
    g.fill();
    return;
  }

  if (mood === 'smile') {
    g.lineWidth = 9;
    g.beginPath();
    g.arc(cx, my - 22, 42, 0.38, Math.PI - 0.38);
    g.stroke();
    return;
  }

  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(cx - 38, my);
  g.quadraticCurveTo(cx, my + 8, cx + 38, my);
  g.stroke();
}

/**
 * The hand-painted acrylic sign board each student holds.
 *
 * Wood base with brushed grain, a painted panel inset with an accent border,
 * the profession in small caps, the message set as large as it will go, and
 * the student's name signed underneath.
 */
export function drawSign(g: Ctx2D, w: number, h: number, s: StudentConfig): void {
  const rand = makeRandom(hashString(s.en));

  g.fillStyle = '#8d6841';
  g.fillRect(0, 0, w, h);

  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(60,38,20,${0.03 + rand() * 0.07})`;
    g.lineWidth = 1 + rand() * 3;
    const y = rand() * h;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(
      w * 0.3,
      y + (rand() - 0.5) * 14,
      w * 0.7,
      y + (rand() - 0.5) * 14,
      w,
      y + (rand() - 0.5) * 8,
    );
    g.stroke();
  }

  g.fillStyle = 'rgba(226,215,193,0.96)';
  g.fillRect(20, 20, w - 40, h - 40);
  g.strokeStyle = s.accent;
  g.lineWidth = 5;
  g.strokeRect(20, 20, w - 40, h - 40);

  g.textAlign = 'center';

  g.fillStyle = '#8a5c3a';
  g.font = '600 26px Poppins, sans-serif';
  g.fillText(s.roleEn.toUpperCase(), w / 2, 74);

  g.fillStyle = '#2c1e15';
  const fit = fitLines(g, s.msg, w - 84, (sz) => `600 ${sz}px Poppins, sans-serif`, 82, 46, 3);
  g.font = `600 ${fit.size}px Poppins, sans-serif`;
  const lh = Math.round(fit.size * 1.42);
  const top = h / 2 - ((fit.lines.length - 1) * lh) / 2 + 6;
  fit.lines.forEach((line, i) => g.fillText(line, w / 2, top + i * lh));

  g.fillStyle = '#a9755c';
  g.font = '400 26px Poppins, sans-serif';
  g.fillText(`— ${s.en}`, w / 2, h - 38);
}

/** The floating name plate that fades in above a student on the hold. */
export function drawLabel(g: Ctx2D, w: number, h: number, s: StudentConfig): void {
  g.clearRect(0, 0, w, h);

  const r = 22;
  const x0 = 12;
  const y0 = 18;
  const x1 = w - 12;
  const y1 = h - 14;
  g.beginPath();
  g.moveTo(x0 + r, y0);
  g.arcTo(x1, y0, x1, y1, r);
  g.arcTo(x1, y1, x0, y1, r);
  g.arcTo(x0, y1, x0, y0, r);
  g.arcTo(x0, y0, x1, y0, r);
  g.closePath();
  g.fillStyle = 'rgba(14,10,8,0.62)';
  g.fill();
  g.strokeStyle = 'rgba(255,206,138,0.32)';
  g.lineWidth = 2;
  g.stroke();

  g.textAlign = 'center';
  g.fillStyle = '#fff6e8';
  const fit = fitLines(
    g,
    `${s.en} — ${s.roleEn}`,
    w - 96,
    (sz) => `600 ${sz}px "Playfair Display", serif`,
    42,
    22,
    1,
  );
  g.font = `600 ${fit.size}px "Playfair Display", serif`;
  g.fillText(fit.lines[0] ?? s.en, w / 2, 74);
}

/**
 * The stand-in print for the easel, used until the real photograph loads.
 *
 * It is deliberately obviously a placeholder rather than a blank rectangle,
 * so a missing file reads as a missing file.
 */
export function drawPhoto(g: Ctx2D, w: number, h: number, s: StudentConfig): void {
  g.fillStyle = '#efe6d3';
  g.fillRect(0, 0, w, h);

  g.strokeStyle = 'rgba(58,36,22,0.5)';
  g.lineWidth = 9;
  for (let i = -h; i < w + h; i += 26) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + h, h);
    g.stroke();
  }

  g.fillStyle = 'rgba(46,30,20,0.9)';
  g.fillRect(0, h / 2 - 46, w, 92);
  g.textAlign = 'center';
  g.fillStyle = '#f6efe2';
  g.font = '600 24px ui-monospace, Menlo, monospace';
  g.fillText('STUDENT', w / 2, h / 2 - 10);
  g.fillText('PHOTO', w / 2, h / 2 + 22);

  g.fillStyle = 'rgba(38,24,16,0.94)';
  g.fillRect(0, h - 62, w, 62);
  g.fillStyle = '#ffd9a8';
  g.font = '500 22px Poppins, sans-serif';
  g.fillText(s.en, w / 2, h - 24);

  g.strokeStyle = 'rgba(46,30,20,0.55)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
}

/**
 * The gate sign. Struck twice, two pixels apart, so the gold letters read as
 * raised metal catching the lantern light rather than flat type.
 */
export function drawGateSign(g: Ctx2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  g.textAlign = 'center';

  const fit = fitLines(
    g,
    COPY.gateSignTitle,
    w - 260,
    (sz) => `600 ${sz}px "Playfair Display", serif`,
    128,
    60,
    1,
  );
  const title = fit.lines[0] ?? COPY.gateSignTitle;
  g.font = `600 ${fit.size}px "Playfair Display", serif`;
  g.letterSpacing = '0.12em';

  g.shadowColor = 'rgba(255,190,90,0.9)';
  g.shadowBlur = 28;
  g.fillStyle = '#ffd36a';
  g.fillText(title, w / 2, 212);

  g.shadowBlur = 0;
  g.fillStyle = '#fff1c2';
  g.fillText(title, w / 2, 210);

  g.letterSpacing = '0.32em';
  g.font = '400 40px Poppins, sans-serif';
  g.fillStyle = '#ffe8c4';
  g.fillText(COPY.gateSignSub, w / 2, 318);
  g.letterSpacing = '0em';
}

function hashString(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
