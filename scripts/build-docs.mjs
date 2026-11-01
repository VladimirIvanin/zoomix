import { build } from 'vite';
import { resolve } from 'node:path';
import { cpSync, writeFileSync, readFileSync } from 'node:fs';
await build({
  configFile: false,
  base: '/zoomix/',
  build: {
    outDir: 'site',
    emptyOutDir: true,
    rollupOptions: { input: {
      docs: resolve('docs/index.html'),
      examples: resolve('examples/index.html'),
      sliders: resolve('examples/sliders.html'),
    } },
  },
});
// Non-module browser script and downloadable integration sample stay unbundled.
cpSync('dist', 'site/dist', { recursive: true });
cpSync('examples/insales.js', 'site/examples/insales.js');
writeFileSync('site/index.html', '<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./docs/"><title>Zoomix</title><a href="./docs/">Zoomix — документация</a></html>');
writeFileSync('site/.nojekyll', '');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const docsPath = 'site/docs/index.html';
writeFileSync(docsPath, readFileSync(docsPath, 'utf8').replace(/class="version">v[^<]+/, `class="version">v${pkg.version}`));
