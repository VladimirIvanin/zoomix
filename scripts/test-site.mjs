import assert from 'node:assert/strict';
import { preview } from 'vite';
import { chromium } from '@playwright/test';
const server = await preview({ configFile: false, base: '/zoomix/', build: { outDir: 'site' }, preview: { host: '127.0.0.1', port: 4191, strictPort: true } });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  for (const path of ['', 'docs/', 'examples/', 'examples/sliders.html']) {
    await page.goto(`http://127.0.0.1:4191/zoomix/${path}`);
    await page.waitForLoadState('networkidle');
    if (path.includes('sliders')) await page.locator('.gallery .zoomix-root').first().waitFor();
    if (path === 'examples/') await page.locator('[data-zoomix].zoomix-root').waitFor();
    if (path === 'docs/') {
      await page.locator('#demo-photo.zoomix-root').waitFor();
      await page.locator('.demo-link').click();
      assert.equal(new URL(page.url()).pathname, '/zoomix/examples/');
    }
  }
  const sample = await page.request.get('http://127.0.0.1:4191/zoomix/examples/insales.js');
  assert(sample.ok());
  assert((await sample.text()).includes('mountProductGallery'));
  assert.deepEqual(failures, []);
  console.log('Production site passed: project base URL, documentation, demos, sliders and downloadable sample.');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
