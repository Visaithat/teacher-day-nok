import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import { makeRandom } from '../../lib/math';

type Ctx = CanvasRenderingContext2D;

/**
 * Screens, prints and papers for the staged props.
 *
 * These are generated with the students rather than in the boot pass: they
 * are small, there are only a handful, and by the time a figure is built the
 * fonts are already resident.
 */
export function makeTexture(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2d canvas context unavailable');
  draw(g, w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const MONO = 'ui-monospace, Menlo, monospace';

/** The canvas leaning against Kengkue's easel: a sunset, roughly blocked in. */
export function drawArtistCanvas(g: Ctx, w: number, h: number): void {
  const rand = makeRandom(0xa27157);
  g.fillStyle = '#f2ead8';
  g.fillRect(0, 0, w, h);

  const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#f6c877');
  sky.addColorStop(1, '#e88a3c');
  g.fillStyle = sky;
  g.fillRect(28, 28, w - 56, h * 0.52);

  g.fillStyle = '#c2452f';
  g.beginPath();
  g.moveTo(28, h * 0.56);
  g.lineTo(w * 0.42, h * 0.3);
  g.lineTo(w * 0.7, h * 0.56);
  g.closePath();
  g.fill();

  g.fillStyle = '#8a4a22';
  g.fillRect(28, h * 0.56, w - 56, h * 0.1);

  // Loose strokes in the foreground - it should look unfinished.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(224,99,47,${0.1 + rand() * 0.3})`;
    g.fillRect(28 + rand() * (w - 76), h * 0.62 + rand() * (h * 0.3), 10, 6);
  }

  g.strokeStyle = 'rgba(90,60,30,0.5)';
  g.lineWidth = 6;
  g.strokeRect(24, 24, w - 48, h - 48);
}

/** A laptop keyboard seen from above. */
export function drawKeyboard(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#23252c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#33363f';
  for (let y = 18; y < h * 0.66; y += 22) {
    for (let x = 12; x < w - 18; x += 22) g.fillRect(x, y, 17, 16);
  }
  g.fillStyle = '#2b2e36';
  g.fillRect(w * 0.28, h * 0.72, w * 0.44, h * 0.22);
}

/** Vanhxay's editor: syntax-coloured runs, a gutter, and a live caret. */
export function drawCodeScreen(g: Ctx, w: number, h: number): void {
  const rand = makeRandom(0xc0de51);
  g.fillStyle = '#0d1420';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#161f2e';
  g.fillRect(0, 0, w, 26);
  ['#ff6a5e', '#f5c451', '#57c96a'].forEach((c, k) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(20 + k * 20, 13, 6, 0, 6.3);
    g.fill();
  });

  const palette = ['#6fd3ff', '#9ae6a1', '#ffd479', '#c9a7ff', '#7fe3d0'];
  for (let ln = 0; ln < 13; ln++) {
    const y = 48 + ln * 20;
    g.fillStyle = 'rgba(120,140,170,0.55)';
    g.font = `13px ${MONO}`;
    g.textAlign = 'left';
    g.fillText(String(ln + 1).padStart(2, '0'), 12, y);

    let x = 44 + (ln % 3) * 16;
    const runs = 2 + (ln % 3);
    for (let r = 0; r < runs; r++) {
      const wd = 34 + rand() * 90;
      g.globalAlpha = 0.75;
      g.fillStyle = palette[(ln + r) % palette.length] as string;
      g.fillRect(x, y - 10, wd, 9);
      g.globalAlpha = 1;
      x += wd + 12;
      if (x > w - 60) break;
    }
  }
  g.fillStyle = '#7fe3d0';
  g.fillRect(44, 48 + 13 * 20 - 10, 9, 12);
}

/** One of the code panels drifting beside him. */
export function drawCodePanel(g: Ctx, w: number, h: number, seed: number): void {
  const rand = makeRandom(seed);
  g.clearRect(0, 0, w, h);
  const r = 16;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(w, 0, w, h, r);
  g.arcTo(w, h, 0, h, r);
  g.arcTo(0, h, 0, 0, r);
  g.arcTo(0, 0, w, 0, r);
  g.closePath();
  g.fillStyle = 'rgba(14,22,34,0.72)';
  g.fill();
  g.strokeStyle = 'rgba(140,200,255,0.4)';
  g.lineWidth = 2;
  g.stroke();

  const palette = ['#6fd3ff', '#9ae6a1', '#ffd479', '#c9a7ff'];
  for (let ln = 0; ln < 5; ln++) {
    const y = 20 + ln * 24;
    let x = 22;
    const runs = 2 + (ln % 2);
    for (let q = 0; q < runs; q++) {
      const wd = 26 + rand() * 70;
      g.globalAlpha = 0.8;
      g.fillStyle = palette[(ln + q) % palette.length] as string;
      g.fillRect(x, y, wd, 8);
      g.globalAlpha = 1;
      x += wd + 10;
      if (x > w - 40) break;
    }
  }
}

/** Timmy's training log, mid-run. */
export function drawTrainingLog(g: Ctx, w: number, h: number): void {
  const cyan = '#7fe6ff';
  g.fillStyle = '#08121c';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#0f2030';
  g.fillRect(0, 0, w, 26);
  g.fillStyle = cyan;
  g.font = `600 13px ${MONO}`;
  g.textAlign = 'left';
  g.fillText('train.py — epoch 47/50', 14, 18);

  let loss = 0.412;
  for (let ln = 0; ln < 11; ln++) {
    const y = 52 + ln * 23;
    g.font = `12px ${MONO}`;
    g.fillStyle = 'rgba(120,150,175,0.6)';
    g.fillText(`epoch ${36 + ln}`, 16, y);
    g.fillStyle = '#9ae6a1';
    g.fillText(`loss ${loss.toFixed(4)}`, 118, y);
    g.fillStyle = '#ffd479';
    g.fillText(`acc ${(0.902 + ln * 0.008).toFixed(3)}`, 244, y);

    g.fillStyle = 'rgba(127,230,255,0.18)';
    g.fillRect(358, y - 9, 132, 9);
    g.fillStyle = cyan;
    g.fillRect(358, y - 9, 132 * Math.min(1, 0.34 + ln * 0.07), 9);
    loss *= 0.93;
  }
  g.fillStyle = cyan;
  g.fillRect(16, 52 + 11 * 23 - 9, 9, 11);
}

const AI_HEADINGS = ['inference', 'val accuracy', 'attention'] as const;

/** One of the three holographic UI panels above Timmy's bench. */
export function drawAIPanel(g: Ctx, w: number, h: number, k: number): void {
  const rand = makeRandom(0xa1900 + k * 31);
  g.clearRect(0, 0, w, h);
  const r = 16;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(w, 0, w, h, r);
  g.arcTo(w, h, 0, h, r);
  g.arcTo(0, h, 0, 0, r);
  g.arcTo(0, 0, w, 0, r);
  g.closePath();
  g.fillStyle = 'rgba(8,22,34,0.7)';
  g.fill();
  g.strokeStyle = 'rgba(127,230,255,0.5)';
  g.lineWidth = 2;
  g.stroke();

  g.fillStyle = '#7fe6ff';
  g.font = `600 15px ${MONO}`;
  g.textAlign = 'left';
  g.fillText(AI_HEADINGS[k % 3] as string, 18, 30);

  if (k % 3 === 1) {
    g.strokeStyle = '#9ae6a1';
    g.lineWidth = 4;
    g.beginPath();
    [0.2, 0.44, 0.38, 0.62, 0.76, 0.88].forEach((v, q) => {
      const x = 22 + q * 52;
      const y = h - 22 - v * (h - 70);
      if (q === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    return;
  }

  if (k % 3 === 2) {
    for (let r2 = 0; r2 < 4; r2++) {
      for (let c2 = 0; c2 < 8; c2++) {
        g.fillStyle = `rgba(127,230,255,${(0.12 + rand() * 0.6).toFixed(3)})`;
        g.fillRect(20 + c2 * 35, 48 + r2 * 26, 30, 21);
      }
    }
    return;
  }

  const palette = ['#7fe6ff', '#9ae6a1', '#ffd479'];
  for (let ln = 0; ln < 3; ln++) {
    const y = 50 + ln * 26;
    let x = 20;
    for (let q = 0; q < 3; q++) {
      const wd = 30 + rand() * 70;
      g.globalAlpha = 0.75;
      g.fillStyle = palette[(ln + q) % 3] as string;
      g.fillRect(x, y, wd, 9);
      g.globalAlpha = 1;
      x += wd + 10;
      if (x > w - 40) break;
    }
  }
}

/** Namthip's pressed-specimen tray. */
export function drawSpecimenTray(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#efe7d2';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(70,50,30,0.35)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, w - 12, h - 12);

  ['#5f7a3a', '#7b8f42', '#4f6a33'].forEach((c, k) => {
    const bx = 40 + k * 74;
    g.strokeStyle = c;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(bx, h - 26);
    g.lineTo(bx + 6, 34);
    g.stroke();
    g.lineWidth = 3;
    for (let q = 0; q < 6; q++) {
      const y = 44 + q * 16;
      g.beginPath();
      g.moveTo(bx + 3, y);
      g.lineTo(bx - 12, y - 8);
      g.moveTo(bx + 3, y);
      g.lineTo(bx + 18, y - 8);
      g.stroke();
    }
  });

  g.fillStyle = '#fdfbf5';
  g.fillRect(14, h - 34, 96, 22);
  g.fillStyle = 'rgba(60,42,26,0.85)';
  g.font = `600 13px ${MONO}`;
  g.textAlign = 'left';
  g.fillText('SPECIMEN 04', 20, h - 18);
}

/** Her field notebook, open at a sketch. */
export function drawFieldNotebook(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#f6f1e2';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(90,70,45,0.4)';
  g.lineWidth = 2;
  for (let y = 18; y < h; y += 16) {
    g.beginPath();
    g.moveTo(10, y);
    g.lineTo(w - 10, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(60,80,45,0.7)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(w - 62, 44);
  g.lineTo(w - 54, 96);
  g.stroke();
  for (let q = 0; q < 4; q++) {
    const y = 54 + q * 12;
    g.beginPath();
    g.moveTo(w - 58, y);
    g.lineTo(w - 74, y - 7);
    g.moveTo(w - 58, y);
    g.lineTo(w - 42, y - 7);
    g.stroke();
  }
}

/** Nina's tablet: a quarterly chart that is clearly going the right way. */
export function drawBusinessScreen(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#f7f9fc';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d2b40';
  g.fillRect(0, 0, w, 46);
  g.fillStyle = '#8fb4e8';
  g.fillRect(18, 18, 96, 10);

  const values = [0.34, 0.52, 0.44, 0.7, 0.86];
  const base = h - 70;
  values.forEach((v, k) => {
    g.fillStyle = k === 4 ? '#2f7de0' : '#a9c6ea';
    const bh = v * (h * 0.42);
    g.fillRect(30 + k * 54, base - bh, 36, bh);
  });

  g.strokeStyle = '#2f7de0';
  g.lineWidth = 5;
  g.beginPath();
  [0.3, 0.46, 0.42, 0.66, 0.9].forEach((v, k) => {
    const x = 48 + k * 54;
    const y = base - v * (h * 0.44);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();

  g.fillStyle = '#4a5566';
  g.fillRect(30, 84, 150, 12);
  g.fillRect(30, 108, 104, 10);
  g.fillStyle = '#e8edf4';
  g.fillRect(0, h - 36, w, 36);
}

/** The lit office window behind her. */
export function drawWindowPanes(g: Ctx, w: number, h: number): void {
  g.fillStyle = '#e8f1fb';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#cfe0f2';
  for (let y = 24; y < h; y += 92) {
    for (let x = 18; x < w; x += 74) g.fillRect(x, y, 52, 66);
  }
  g.strokeStyle = '#9fb4cc';
  g.lineWidth = 7;
  for (let y = 12; y < h; y += 92) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  for (let x = 8; x < w; x += 74) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
  }
}
