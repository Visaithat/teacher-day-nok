/**
 * Turn a raw generated GLB into something the film can actually ship.
 *
 * The text-to-3D exports arrive as one 500,000-triangle shell with three
 * 2048px PNG maps — 25-35 MB for a prop that ends up a couple of hundred
 * pixels tall. This is the step between the download and `public/uploads`:
 *
 *   weld + dedup   merge the split vertices the exporter leaves behind, so
 *                  the simplifier sees a connected surface instead of a
 *                  polygon soup it refuses to collapse
 *   simplify       down to `--tris`, error-bounded rather than ratio-blind
 *   prune          drop whatever the simplify left unreferenced
 *   textures       resize to `--tex` and re-encode as WebP
 *   quantize       KHR_mesh_quantization, matching the student exports
 *
 * The result is written to `assets-src/uploads/<name>.glb` — the pristine
 * copy `compress-models.mjs` keeps — and then meshopt-compressed into
 * `public/uploads/<name>.glb`, which is what the browser fetches. Running
 * `npm run compress:models` afterwards is a no-op on it, by design.
 *
 *   node scripts/prep-prop.mjs <input.glb> <name> [--tris 40000] [--tex 1024]
 *
 * `<name>` is the served basename without the extension, e.g. `vanhxay_doll`.
 */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  quantize,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}

/** Triangles across every primitive in the file. */
function triangleCount(document) {
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      tris += (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return Math.round(tris);
}

async function main() {
  const [input, name] = process.argv.slice(2);
  if (!input || !name || name.startsWith('--')) {
    console.error('usage: node scripts/prep-prop.mjs <input.glb> <name> [--tris N] [--tex N]');
    process.exitCode = 1;
    return;
  }

  const targetTris = flag('tris', 40000);
  const targetTex = flag('tex', 1024);

  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
  });

  const originalPath = path.join(root, 'assets-src', 'uploads', `${name}.glb`);
  const servedPath = path.join(root, 'public', 'uploads', `${name}.glb`);
  await mkdir(path.dirname(originalPath), { recursive: true });
  await mkdir(path.dirname(servedPath), { recursive: true });

  const sourceSize = (await stat(input)).size;
  const document = await io.read(input);
  const before = triangleCount(document);

  await document.transform(
    weld(),
    dedup(),
    // `ratio` is the floor and `error` the budget — the simplifier stops at
    // whichever it reaches first, so a shape that cannot lose this much
    // without visibly deforming keeps the triangles it needs.
    simplify({ simplifier: MeshoptSimplifier, ratio: targetTris / before, error: 0.0012 }),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [targetTex, targetTex],
    }),
    // 'medium' is what the student exports already carry; anything harder is
    // visibly lossy on skin and cloth.
    quantize(),
  );

  await io.write(originalPath, document);
  const originalSize = (await stat(originalPath)).size;

  await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(servedPath, document);
  const servedSize = (await stat(servedPath)).size;

  console.log(`  ${path.basename(input)}`);
  console.log(`  triangles  ${before.toLocaleString()} -> ${triangleCount(document).toLocaleString()}`);
  console.log(`  textures   -> ${targetTex}px webp`);
  console.log(`  source     ${mb(sourceSize)}`);
  console.log(`  assets-src ${mb(originalSize)}   ${path.relative(root, originalPath)}`);
  console.log(`  served     ${mb(servedSize)}   ${path.relative(root, servedPath)}`);
}

main().catch((err) => {
  console.error('Prop preparation failed:', err);
  process.exitCode = 1;
});
