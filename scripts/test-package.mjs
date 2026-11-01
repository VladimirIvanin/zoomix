import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const temporaryRoot = realpathSync(tmpdir());
const directory = mkdtempSync(join(temporaryRoot, 'zoomix-package-'));
const npm = process.env.npm_execpath;
assert(npm && existsSync(npm), 'Run this check with npm run test:package');
function run(file, args, cwd) {
  return execFileSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

try {
  const [packed] = JSON.parse(run(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], project));
  const files = packed.files.map(file => file.path);
  for (const file of ['dist/zoomix.js', 'dist/zoomix.min.js', 'dist/zoomix.css', 'dist/index.d.ts']) assert(files.includes(file), file);
  assert(!files.some(file => /^(tests|node_modules|src)\//.test(file)), 'Do not ship tests, sources or dependencies');

  const consumer = join(directory, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run(npm, ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', join(directory, packed.filename)], consumer);
  const smoke = `
    import assert from 'node:assert/strict';
    import { existsSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    import Zoomix, { Zoomix as NamedZoomix } from 'zoomix';
    assert.equal(typeof document, 'undefined');
    assert.equal(Zoomix, NamedZoomix);
    assert.equal(typeof Zoomix, 'function');
    for (const path of ['zoomix/style.css', 'zoomix/browser']) {
      assert(existsSync(fileURLToPath(import.meta.resolve(path))), path);
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '--eval', smoke], { cwd: consumer, stdio: 'pipe' });
  writeFileSync(join(consumer, 'consumer.ts'), `
    import Zoomix, { ZoomixScope, type ZoomixOptions, type ZoomMode, type ZoomixState } from 'zoomix';
    const mode: ZoomMode = 'side';
    const options: ZoomixOptions = { mode, scale: 2, sideTarget: document.createElement('div') };
    const zoom = new Zoomix(document.createElement('div'), options);
    const scope: ZoomixScope = Zoomix.mount(document.createElement('section'), {
      selector: '.photo', options: el => ({ scale: 2, sideTarget: el.parentElement })
    });
    scope.on('open', event => event.instance?.close(), { signal: scope.signal });
    const state: ZoomixState = zoom.getState();
    zoom.on('load', event => console.log(event.source, event.fallback));
    zoom.update({ enabled: true, sideTarget: null }); zoom.open();
    zoom.close(); zoom.refresh(); zoom.destroy(); scope.destroy();
  `);
  run(join(project, 'node_modules/typescript/bin/tsc'), ['--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.ts'], consumer);
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules/zoomix/package.json'), 'utf8'));
  assert.equal(installed.name, 'zoomix');
  console.log('Package check passed: tarball contents, offline install, SSR import, exports and consumer TypeScript.');
} finally {
  // Only remove the fresh temporary directory created above, never the temp root itself.
  assert.equal(dirname(resolve(directory)), temporaryRoot);
  assert(directory.startsWith(join(temporaryRoot, 'zoomix-package-')));
  rmSync(directory, { recursive: true, force: true });
}
