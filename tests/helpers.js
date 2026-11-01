import { test as base, expect } from '@playwright/test';

export { expect };
export const fixture = '/tests/fixtures/zoom.html';
export const landscape = '/tests/fixtures/landscape.png';
export const hd = '/tests/fixtures/landscape-hd.png';
export const portrait = '/tests/fixtures/portrait.png';

// Catch browser exceptions in every new regression, including late load handlers.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    expect(errors, 'uncaught browser exceptions').toEqual([]);
  },
});

export async function ready(page) {
  await page.goto(fixture);
  await expect(page.locator('#photo')).toHaveAttribute('role', 'button');
  await expect.poll(() => page.locator('#photo > img').evaluate(img => img.complete && img.naturalWidth)).toBe(1600);
  return page.locator('#photo');
}

export async function openKeyboard(page, root = page.locator('#photo')) {
  await root.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.zoomix-detail')).toBeVisible();
}

export async function settle(page) {
  // Flush load/mutation/resize work without assuming a wall-clock delay.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function expectClosed(page, root = page.locator('#photo')) {
  await expect(root).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.zoomix-view, .zoomix-mark')).toHaveCount(0);
  await expect(root).not.toHaveClass(/zoomix-touch/);
}

export async function delayedImage(page, url) {
  let release, started = 0;
  const gate = new Promise(resolve => release = resolve);
  await page.route('**' + url, async route => {
    started++;
    const fail = await gate;
    if (fail) await route.abort();
    else await route.fulfill({ path: 'tests/fixtures/landscape-hd.png', contentType: 'image/png' });
  });
  return { release, count: () => started };
}
