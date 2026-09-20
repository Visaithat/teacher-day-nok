/**
 * Meshopt-compress the student models.
 *
 * The five students ship as three GLBs each — a 120k-triangle street mesh, a
 * 90k finale mesh and a 16k LOD — about 40 MB in total. They already carry
 * `KHR_mesh_quantization` and WebP textures, so the textures are left exactly
 * as they are; this only reorders and re-encodes vertex data through
 * `EXT_meshopt_compression`, which the renderer decodes back to the same
 * geometry. The picture does not change, the download shrinks by roughly 3x.
 *
 * Originals are kept in `assets-src/` so the step is repeatable and the
 * uncompressed meshes are never lost.
 *
 *   node scripts/compress-models.mjs            compress anything stale
 *   node scripts/compress-models.mjs --force    recompress everything
 */

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const served = path.join(root, 'public', 'uploads');
const originals = path.join(root, 'assets-src', 'uploads');
const force = process.argv.includes('--force');

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

async function main() {
  await MeshoptEncoder.ready;

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
  });

  await mkdir(originals, { recursive: true });

  const files = (await readdir(served)).filter((f) => f.endsWith('.glb')).sort();
  if (files.length === 0) {
    console.log('No .glb files in public/uploads — nothing to do.');
    return;
  }

  let before = 0;
  let after = 0;
  let skipped = 0;

  for (const file of files) {
    const servedPath = path.join(served, file);
    const originalPath = path.join(originals, file);

    // First run for this file: stash the pristine copy.
    if (!existsSync(originalPath)) {
      await copyFile(servedPath, originalPath);
    } else if (!force) {
      // Already compressed in a previous run — the served copy is smaller
      // than the original we kept.
      const [s, o] = await Promise.all([stat(servedPath), stat(originalPath)]);
      if (s.size < o.size) {
        before += o.size;
        after += s.size;
        skipped++;
        continue;
      }
    }

    const sourceSize = (await stat(originalPath)).size;
    const document = await io.read(originalPath);

    await document.transform(
      // 'medium' keeps the quantization these exports already use; 'high'
      // would filter normals and UVs harder and is visibly lossy on skin.
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );

    await io.write(servedPath, document);

    const outSize = (await stat(servedPath)).size;
    before += sourceSize;
    after += outSize;
    const pct = ((1 - outSize / sourceSize) * 100).toFixed(1);
    console.log(`  ${file.padEnd(22)} ${mb(sourceSize)} -> ${mb(outSize)}  (-${pct}%)`);
  }

  if (skipped > 0) console.log(`  (${skipped} already compressed; pass --force to redo)`);
  console.log(
    `\nTotal ${mb(before)} -> ${mb(after)}  (-${((1 - after / before) * 100).toFixed(1)}%)`,
  );
  console.log('Originals kept in assets-src/uploads/.');
}

main().catch((err) => {
  console.error('Model compression failed:', err);
  process.exitCode = 1;
});
