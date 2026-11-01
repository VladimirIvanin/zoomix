import { test, expect, ready, openKeyboard, expectClosed, settle } from './helpers.js';

for (const mode of ['inner', 'side', 'lens']) {
  test(`${mode}: mouse clicks preserve hover zoom and its position`, async ({ page }) => {
    const root = await ready(page);
    await root.evaluate((el, mode) => {
      el.dataset.zoomix = mode;
      window.closes = 0;
      window.Zoomix.get(el).on('close', () => window.closes++);
      // Native context menus may take hover away from the page (Firefox).
      el.addEventListener('contextmenu', e => e.preventDefault());
    }, mode);
    await root.hover({ position: { x: 90, y: 70 } });
    const detail = page.locator('.zoomix-detail');
    await expect(detail).toBeVisible();
    const transform = await detail.evaluate(el => el.style.transform);
    for (const button of ['left', 'right', 'middle']) {
      await page.mouse.down({ button });
      await settle(page);
      await expect(detail).toBeVisible();
      await page.mouse.up({ button });
      await settle(page);
      await expect(detail).toBeVisible();
      expect(await detail.evaluate(el => el.style.transform)).toBe(transform);
    }
    expect(await page.evaluate(() => window.closes)).toBe(0);
    await page.mouse.move(0, 0);
    await expectClosed(page);
  });

  test(`${mode}: zoomOn click toggles without reopening on movement`, async ({ page }) => {
    const root = await ready(page);
    await root.evaluate((el, mode) => {
      el.dataset.zoomix = mode;
      el.dataset.zoomOn = 'click';
    }, mode);
    await root.hover();
    await settle(page);
    await expectClosed(page);
    await root.click({ position: { x: 90, y: 70 } });
    const detail = page.locator('.zoomix-detail');
    await expect(page.locator(`.zoomix-${mode}`)).toBeVisible();
    const transform = await detail.evaluate(el => el.style.transform);
    const b = await root.boundingBox();
    await page.mouse.move(b.x + 220, b.y + 150);
    await expect.poll(() => detail.evaluate(el => el.style.transform)).not.toBe(transform);
    await root.click();
    await expectClosed(page);
    await page.mouse.move(b.x + 120, b.y + 80);
    await settle(page);
    await expectClosed(page);
    await root.click();
    await expect(detail).toBeVisible();
    await page.keyboard.press('Escape');
    await expectClosed(page);
    await root.click();
    await expect(detail).toBeVisible();
    await page.mouse.move(0, 0);
    await expectClosed(page);
    await root.hover();
    await settle(page);
    await expectClosed(page);
  });
}

test('zoomOn click ignores drags, cancelled presses and non-primary buttons', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => window.Zoomix.get(el).update({ zoomOn: 'click' }));
  const b = await root.boundingBox();
  await root.hover();
  await page.mouse.down();
  await page.mouse.move(b.x + 70, b.y + 70);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.up();
  await expectClosed(page);
  for (const button of ['right', 'middle']) {
    await root.click({ button });
    await expectClosed(page);
  }
  const pointer = { pointerType: 'mouse', pointerId: 1, isPrimary: true, button: 0, clientX: b.x + 60, clientY: b.y + 60 };
  for (const type of ['pointerdown', 'pointercancel', 'pointerup']) await root.dispatchEvent(type, pointer);
  await expectClosed(page);
  await root.click();
  await expect(page.locator('.zoomix-detail')).toBeVisible();
});

test('JS zoomOn overrides HTML; updates close mouse zoom and preserve keyboard control', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => {
    el.dataset.zoomOn = 'click';
    window.Zoomix.get(el).update({ zoomOn: 'hover' });
  });
  await root.hover();
  await expect(page.locator('.zoomix-detail')).toBeVisible();
  await root.evaluate(el => window.Zoomix.get(el).update({ zoomOn: 'click' }));
  await expectClosed(page);
  expect(await root.evaluate(el => window.Zoomix.get(el).getState().zoomOn)).toBe('click');
  await root.hover({ position: { x: 60, y: 60 } });
  await settle(page);
  await expectClosed(page);
  await openKeyboard(page);
  await page.keyboard.press('Escape');
  await expectClosed(page);
  await root.evaluate(el => window.Zoomix.get(el).update({ zoomOn: 'hover' }));
  await root.hover();
  await expect(page.locator('.zoomix-detail')).toBeVisible();
});

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
