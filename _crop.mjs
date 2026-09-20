/** Crop and upscale a region of a screenshot, for looking closely at a prop.
 *    node _crop.mjs <in.png> <out.png> <left> <top> <w> <h> [scale] */
import sharp from 'sharp';
const [inp, out, l, t, w, h, scale = 3] = process.argv.slice(2);
await sharp(inp)
  .extract({ left: +l, top: +t, width: +w, height: +h })
  .resize({ width: +w * +scale, kernel: 'nearest' })
  .toFile(out);
console.log('wrote', out);
