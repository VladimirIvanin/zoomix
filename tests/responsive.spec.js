import { test, expect, ready, openKeyboard, landscape, hd } from './helpers.js';

test('picture uses the selected source even when src is a different fallback', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => el.innerHTML = `<picture><source type="image/png" srcset="/tests/fixtures/landscape.png?selected"><img src="/tests/fixtures/landscape-small.png" alt="Responsive camera"></picture>`);
  await expect.poll(() => root.locator('picture img').evaluate(img => img.currentSrc)).toContain('?selected');
  await openKeyboard(page);
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', /landscape\.png\?selected$/);
  await root.locator('picture img').evaluate(img => img.dataset.zoomSrc = '/bad-hd.png');
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', /landscape\.png\?selected$/);
});

for (const dpr of [1, 2]) {
  test.describe(`density ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test('srcset picks the correct raster candidate', async ({ page }) => {
      const root = await ready(page);
      await root.locator('img:not(.zoomix-detail)').evaluate((img, landscape) => {
        img.style.cssText = 'width:160px;height:100px';
        img.src = '/tests/fixtures/landscape-small.png?density=1';
        // Fresh URLs prevent Chromium preferring an already cached 2x candidate at DPR 1.
        img.srcset = `/tests/fixtures/landscape-small.png?density=1 1x, ${landscape}?density=2 2x`;
      }, landscape);
      const selected = dpr === 1 ? /landscape-small\.png\?density=1$/ : /landscape\.png\?density=2$/;
      await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.currentSrc)).toMatch(selected);
      await openKeyboard(page);
      await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', selected);
      await expect.poll(async () => (await page.locator('.zoomix-detail').boundingBox()).width).toBe(320);
    });
  });
}

test('changing picture media source while open updates detail without pointer re-entry', async ({ page }) => {
  const root = await ready(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await root.evaluate(el => el.innerHTML = `<picture><source media="(prefers-color-scheme: dark)" srcset="/tests/fixtures/landscape-hd.png?dark"><img src="/tests/fixtures/landscape.png?light" alt="Camera"></picture>`);
  await openKeyboard(page);
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', /\?light$/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => root.locator('picture img').evaluate(img => img.currentSrc)).toContain('?dark');
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', /\?dark$/);
  await root.locator('source').evaluate(el => el.media = '(min-width: 9999px)');
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', /\?light$/);
});

test('width descriptors and sizes react to viewport changes while open', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  const root = await ready(page);
  await root.locator('img:not(.zoomix-detail)').evaluate((img, hd) => {
    img.style.cssText = 'width:160px;height:100px';
    img.sizes = '(max-width: 600px) 160px, 1600px';
    img.srcset = `/tests/fixtures/landscape-small.png 320w, ${hd} 2400w`;
  }, hd);
  await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.currentSrc)).toContain('landscape-small.png');
  await openKeyboard(page);
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.currentSrc)).toContain('landscape-hd.png');
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', /landscape-hd\.png$/);
});
