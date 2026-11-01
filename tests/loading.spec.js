import { test, expect, ready, openKeyboard, settle, expectClosed, delayedImage, landscape, hd } from './helpers.js';

test.use({ hasTouch: true });

for (const dismiss of ['api', 'escape', 'mouseleave', 'touch']) {
  test(`pending HD can be closed by ${dismiss} without reopening on load`, async ({ page }) => {
    const pending = await delayedImage(page, '/pending.png');
    const root = await ready(page);
    await root.locator('img:not(.zoomix-detail)').evaluate(img => img.dataset.zoomSrc = '/pending.png');
    if (dismiss === 'mouseleave') await root.hover();
    else if (dismiss === 'touch') await root.tap();
    else { await root.focus(); await page.keyboard.press('Enter'); }
    await expect.poll(pending.count).toBe(1);
    if (dismiss === 'mouseleave') await page.mouse.move(0, 0);
    else if (dismiss === 'escape') await page.keyboard.press('Escape');
    else if (dismiss === 'touch') await root.tap();
    else await root.evaluate(el => new window.Zoomix(el).close());
    await expectClosed(page);
    pending.release(false);
    await page.waitForLoadState('networkidle');
    await settle(page);
    await expectClosed(page);
    await openKeyboard(page);
    await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', '/pending.png');
  });
}

for (const remove of [false, true]) {
  for (const fail of [false, true]) {
    test(`${remove ? 'DOM removal' : 'destroy'} invalidates a pending ${fail ? 'failed' : 'successful'} load`, async ({ page }) => {
      const pending = await delayedImage(page, '/pending.png');
      const root = await ready(page);
      await root.locator('img:not(.zoomix-detail)').evaluate(img => img.dataset.zoomSrc = '/pending.png');
      await root.focus();
      await page.keyboard.press('Enter');
      await expect.poll(pending.count).toBe(1);
      await root.evaluate((el, remove) => {
        if (remove) { window.removedPhoto = el; el.remove(); }
        else { new window.Zoomix(el).destroy(); el.querySelector('img').removeAttribute('data-zoom-src'); }
      }, remove);
      if (remove) await expect(root).toHaveCount(0);
      else await expect(root).not.toHaveAttribute('role');
      pending.release(fail);
      await page.waitForLoadState('networkidle');
      await settle(page);
      await expect(page.locator('.zoomix-view, .zoomix-mark')).toHaveCount(0);
      if (remove) await page.evaluate(() => {
        window.removedPhoto.querySelector('img').removeAttribute('data-zoom-src');
        document.querySelector('#stage').append(window.removedPhoto);
      });
      else await root.evaluate(el => new window.Zoomix(el));
      await openKeyboard(page);
      await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', new URL(landscape, page.url()).href);
    });
  }
}

for (const fail of [false, true]) {
  test(`stale ${fail ? 'error' : 'success'} cannot replace or close the new source`, async ({ page }) => {
    const pending = await delayedImage(page, '/old.png');
    const root = await ready(page);
    await root.locator('img:not(.zoomix-detail)').evaluate(img => img.dataset.zoomSrc = '/old.png');
    await root.focus(); await page.keyboard.press('Enter');
    await expect.poll(pending.count).toBe(1);
    await root.locator('img:not(.zoomix-detail)').evaluate((img, hd) => { img.src += '?new'; img.dataset.zoomSrc = hd; }, hd);
    await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', hd);
    pending.release(fail);
    await page.waitForLoadState('networkidle');
    await settle(page);
    await expect(root).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', hd);
  });
}

for (const failure of ['404', 'invalid bytes']) {
  test(`HD ${failure} falls back to preview and can be retried with a new source`, async ({ page }) => {
    await page.route('**/broken.png', route => route.fulfill({ status: failure === '404' ? 404 : 200, contentType: 'image/png', body: 'not an image' }));
    const root = await ready(page);
    await root.locator('img:not(.zoomix-detail)').evaluate(img => img.dataset.zoomSrc = '/broken.png');
    await openKeyboard(page);
    await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', new URL(landscape, page.url()).href);
    await root.locator('img:not(.zoomix-detail)').evaluate((img, hd) => img.dataset.zoomSrc = hd, hd);
    await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', hd);
  });
}

test('broken preview and HD leave no active state and recover after replacement', async ({ page }) => {
  await page.route('**/broken*.png', route => route.abort());
  const root = await ready(page);
  await root.locator('img:not(.zoomix-detail)').evaluate(img => { img.src = '/broken-preview.png'; img.dataset.zoomSrc = '/broken-hd.png'; });
  await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.complete && img.naturalWidth === 0)).toBe(true);
  await root.focus(); await page.keyboard.press('Enter');
  await settle(page);
  await expectClosed(page);
  await root.locator('img:not(.zoomix-detail)').evaluate((img, landscape) => { img.src = landscape; img.removeAttribute('data-zoom-src'); }, landscape);
  await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.naturalWidth)).toBe(1600);
  await openKeyboard(page);
});

test('lazy preview below the fold can load HD from a cold cache', async ({ page }) => {
  const preview = await delayedImage(page, '/lazy-preview.png');
  const root = await ready(page);
  await root.evaluate((el, hd) => {
    el.parentElement.style.marginTop = '1800px';
    el.innerHTML = `<img loading="lazy" src="/lazy-preview.png" data-zoom-src="${hd}" width="320" height="200" alt="Lazy camera">`;
  }, hd);
  await root.scrollIntoViewIfNeeded();
  await expect.poll(preview.count).toBe(1);
  await root.focus(); await page.keyboard.press('Enter');
  preview.release(false);
  await expect(page.locator('.zoomix-detail')).toBeVisible();
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', hd);
  await expect(page.locator('.zoomix-detail')).not.toHaveAttribute('loading');
});

test('Escape cancels keyboard activation before a lazy preview has loaded', async ({ page }) => {
  const preview = await delayedImage(page, '/lazy-preview.png');
  const root = await ready(page);
  await root.locator('img:not(.zoomix-detail)').evaluate(img => { img.loading = 'lazy'; img.src = '/lazy-preview.png'; });
  await expect.poll(preview.count).toBe(1);
  await root.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  preview.release(false);
  await page.waitForLoadState('networkidle');
  await settle(page);
  await expectClosed(page);
  await openKeyboard(page);
});

test('repeated cached opens and refreshes do not multiply layers or in-flight requests', async ({ page }) => {
  const pending = await delayedImage(page, '/pending.png');
  const root = await ready(page);
  await root.locator('img:not(.zoomix-detail)').evaluate(img => img.dataset.zoomSrc = '/pending.png');
  await root.focus(); await page.keyboard.press('Enter');
  await expect.poll(pending.count).toBe(1);
  for (let i = 0; i < 12; i++) await root.dispatchEvent('pointermove', { pointerType: 'mouse', clientX: 100, clientY: 100 });
  expect(pending.count()).toBe(1);
  pending.release(false);
  await expect(page.locator('.zoomix-detail')).toBeVisible();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Escape');
    await expectClosed(page);
    await openKeyboard(page);
    await expect(page.locator('.zoomix-view')).toHaveCount(1);
    await root.evaluate(el => new window.Zoomix(el).refresh());
    await expect(page.locator('.zoomix-detail')).toBeVisible();
  }
});
