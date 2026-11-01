import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const banner = `/*! Zoomix v${pkg.version} | MIT | https://github.com/VladimirIvanin/zoomix */`;

for (const [entry, file, format] of [
  ['index.ts', 'zoomix.js', 'esm'],
  ['browser.ts', 'zoomix.min.js', 'iife'],
  ['style.css', 'zoomix.css', 'esm'],
]) {
  const outfile = 'dist/' + file;
  await build({ entryPoints: ['src/' + entry], outfile, format, bundle: true, minify: true, target: 'es2020', banner: file.endsWith('.css') ? { css: banner } : { js: banner } });
  const bytes = gzipSync(readFileSync(outfile)).length;
  const limit = file.endsWith('.css') ? 2048 : 8192;
  console.log(file, bytes, 'bytes gzip');
  if (bytes > limit) throw new Error(file + ' exceeds ' + limit + ' bytes gzip');
}

mkdirSync('browser-build', { recursive: true });
for (const name of ['zoomix.min.js', 'zoomix.css']) copyFileSync('dist/' + name, 'browser-build/' + name);
writeFileSync('browser-build/zoomix.min.js.gz', gzipSync(readFileSync('browser-build/zoomix.min.js')));
