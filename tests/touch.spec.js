import { test, expect, ready, expectClosed, settle } from './helpers.js';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 770 } });

test('touch uses inner mode, ignores compatibility mouse, and cleans cloned active slides', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => el.dataset.zoomix = 'side');
  await root.tap();
  await expect(root.locator('.zoomix-inner')).toBeVisible();
  await root.dispatchEvent('pointermove', { pointerType: 'mouse', clientX: 0, clientY: 0 });
  await expect(root).toHaveClass(/zoomix-touch/);
  await root.evaluate(el => { const clone = el.cloneNode(true); clone.id = 'clone'; el.after(clone); });
  await expect(page.locator('#clone')).not.toHaveClass(/zoomix-touch/);
  await expect(page.locator('#clone .zoomix-view')).toHaveCount(0);
  await root.tap();
  await expectClosed(page);
  await page.locator('#clone').tap();
  await expect(page.locator('#clone .zoomix-inner')).toBeVisible();
});

test.describe('native multi-event touch sequences', () => {
  test.beforeEach(async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Multi-event touch injection requires Chromium CDP; WebKit still runs native tap regressions.');
  });

  async function contact(page) {
    const root = await ready(page), b = await root.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const point = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), id: 1 };
    const send = (type, points = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    return { root, point, send };
  }

  test('pan clamps at all edges outside the root; cancel restores the next tap and page scroll', async ({ page }) => {
    const { root, point, send } = await contact(page);
    await root.evaluate(el => { document.body.style.minHeight = '2500px'; });
    await root.tap();
    await expect(root.locator('.zoomix-detail')).toBeVisible();
    const warnings = [];
    page.on('console', msg => { if (/passive|cancelable=false/i.test(msg.text())) warnings.push(msg.text()); });
    for (const [dx, dy] of [[600,600],[-600,-600],[600,-600],[-600,600]]) {
      await send('touchStart', [point]);
      await send('touchMove', [{ ...point, x: point.x + dx, y: point.y + dy }]);
      await settle(page);
      await send('touchEnd');
      const d = await root.locator('.zoomix-detail').boundingBox(), v = await root.locator('.zoomix-view').boundingBox();
      expect(d.x).toBeGreaterThanOrEqual(v.x - 320 - 1);
      expect(d.x).toBeLessThanOrEqual(v.x + 1);
      expect(d.y).toBeGreaterThanOrEqual(v.y - 200 - 1);
      expect(d.y).toBeLessThanOrEqual(v.y + 1);
    }
    await send('touchStart', [point]);
    await send('touchCancel');
    await root.tap();
    await expectClosed(page);
    await send('touchStart', [point]);
    for (let i = 1; i <= 8; i++) await send('touchMove', [{ ...point, y: point.y - 15 * i }]);
    await send('touchEnd');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(30);
    expect(warnings).toEqual([]);
  });

  test('a second finger and a long press cannot accidentally toggle zoom', async ({ page }) => {
    const { root, point, send } = await contact(page);
    const second = { ...point, x: point.x + 40, id: 2 };
    for (const active of [false, true]) {
      if (active) { await root.tap(); await expect(root.locator('.zoomix-detail')).toBeVisible(); }
      await send('touchStart', [point]);
      await send('touchStart', [point, second]);
      await send('touchEnd', [second]);
      await send('touchEnd');
      await settle(page);
      await expect(root).toHaveAttribute('aria-pressed', String(active));
      await send('touchStart', [point]);
      await page.waitForTimeout(400); // Deliberately exceed the documented tap recognizer's duration.
      await send('touchEnd');
      await expect(root).toHaveAttribute('aria-pressed', String(active));
    }
    await root.tap(); await expectClosed(page);
  });

  test('losing pointer capture cancels the contact instead of toggling on its later pointerup', async ({ page }) => {
    const { root, point, send } = await contact(page);
    await root.tap();
    await expect(root.locator('.zoomix-detail')).toBeVisible();
    await root.evaluate(el => el.addEventListener('pointerdown', e => window.lastPointerId = e.pointerId));
    await send('touchStart', [point]);
    // Capture becomes active on the next pointer event.
    await send('touchMove', [{ ...point, x: point.x + 1 }]);
    expect(await root.evaluate(el => el.hasPointerCapture(window.lastPointerId))).toBe(true);
    await root.evaluate(el => el.releasePointerCapture(window.lastPointerId));
    await send('touchMove', [{ ...point, x: point.x + 2 }]);
    await send('touchEnd');
    await settle(page);
    await expect(root).toHaveAttribute('aria-pressed', 'true');
    await root.tap(); await expectClosed(page);
  });
});
