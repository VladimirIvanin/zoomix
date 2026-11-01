import { test, expect, ready, openKeyboard, expectClosed, settle } from './helpers.js';

test('rapid mouse leave and re-entry and keyboard dismissal stay usable', async ({ page }) => {
  const root = await ready(page);
  const b = await root.boundingBox();
  for (let i = 0; i < 30; i++) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.move(b.x - 2, b.y - 2);
  }
  await root.hover();
  await expect(page.locator('.zoomix-detail')).toBeVisible();
  await page.mouse.move(0, 0);
  await expectClosed(page);
  for (let i = 0; i < 20; i++) {
    await root.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  }
  await expectClosed(page);
  await openKeyboard(page);
});

test('key repeat does not toggle; arrows clamp to all four edges; Tab releases focus', async ({ page }) => {
  const root = await ready(page);
  await openKeyboard(page);
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  // The first non-repeated keydown closes; repeated keydowns cannot reopen.
  await expectClosed(page);
  await openKeyboard(page);
  for (const [key, axis, value] of [['ArrowLeft','x',0], ['ArrowUp','y',0], ['ArrowRight','x',-320], ['ArrowDown','y',-200]]) {
    for (let i = 0; i < 15; i++) await page.keyboard.press(key);
    await expect.poll(() => page.locator('.zoomix-detail').evaluate((el, axis) => {
      const m = new DOMMatrix(getComputedStyle(el).transform); return axis === 'x' ? m.m41 : m.m42;
    }, axis)).toBe(value);
  }
  await page.keyboard.press('Tab');
  await expect(page.locator('#after')).toBeFocused();
  await expectClosed(page);
});

test('decorative detail is hidden from accessibility and existing labelledby survives', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => {
    new window.Zoomix(el).destroy();
    el.setAttribute('aria-labelledby', 'before');
    new window.Zoomix(el);
  });
  await expect(root).toHaveAccessibleName('Before photo');
  await openKeyboard(page);
  await expect(page.getByRole('img', { name: 'Camera' })).toHaveCount(1);
  expect(await page.locator('.zoomix-detail').evaluate(el => el.closest('[aria-hidden="true"]') !== null && el.alt === '')).toBe(true);
  await root.locator('img:not(.zoomix-detail)').evaluate(img => img.alt = 'Updated camera');
  await root.evaluate(el => new window.Zoomix(el).refresh());
  await expect(root).toHaveAccessibleName('Before photo');
  await root.evaluate(el => new window.Zoomix(el).destroy());
  await expect(root).toHaveAttribute('aria-labelledby', 'before');
});

test('open and close preserve smooth page scrolling and wheel remains native', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => {
    document.documentElement.style.scrollBehavior = 'smooth';
    document.body.style.minHeight = '3000px';
    el.parentElement.style.marginTop = '650px';
    el.dataset.zoomix = 'side';
    window.scrollTo({ top: 500, behavior: 'instant' });
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(500);
  await openKeyboard(page);
  expect(await page.evaluate(() => scrollY)).toBe(500);
  await page.keyboard.press('Escape');
  await settle(page);
  expect(await page.evaluate(() => scrollY)).toBe(500);
  await root.hover();
  await expect(page.locator('.zoomix-detail')).toBeVisible();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(550);
  await root.evaluate(el => new window.Zoomix(el).close());
  await expectClosed(page);
});
