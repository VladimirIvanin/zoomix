import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

for (const [entry, file, format] of [
  ['index.ts', 'zoomix.js', 'esm'],
  ['browser.ts', 'zoomix.min.js', 'iife'],
  ['style.css', 'zoomix.css', 'esm'],
]) {
  const outfile = 'dist/' + file;
  await build({ entryPoints: ['src/' + entry], outfile, format, bundle: true, minify: true, target: 'es2020' });
  const bytes = gzipSync(readFileSync(outfile)).length;
  const limit = file.endsWith('.css') ? 2048 : 8192;
  console.log(file, bytes, 'bytes gzip');
  if (bytes > limit) throw new Error(file + ' exceeds ' + limit + ' bytes gzip');
}
