import { test, expect, ready, openKeyboard, expectClosed, settle, landscape, portrait } from './helpers.js';

for (const mode of ['inner', 'lens', 'side']) {
  test(`cloning an open ${mode} slide creates one independent closed instance`, async ({ page }) => {
    const root = await ready(page);
    await root.evaluate((el, mode) => el.dataset.zoomix = mode, mode);
    await openKeyboard(page);
    await root.evaluate(el => {
      const clone = el.cloneNode(true); clone.id = 'clone'; el.after(clone);
    });
    const clone = page.locator('#clone');
    await expect(clone).toHaveAttribute('aria-pressed', 'false');
    await expect(clone.locator('.zoomix-view, .zoomix-mark')).toHaveCount(0);
    await expect(root).toHaveAttribute('aria-pressed', 'true');
    await openKeyboard(page, clone);
    await expect(root).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.zoomix-view')).toHaveCount(1);
    await clone.evaluate(el => el.remove());
    await expect(page.locator('.zoomix-view, .zoomix-mark')).toHaveCount(0);
    await openKeyboard(page);
  });
}

test('moving a connected root preserves identity; detach and remount release old state', async ({ page }) => {
  const root = await ready(page);
  await openKeyboard(page);
  expect(await root.evaluate(el => {
    const zoom = new window.Zoomix(el), destination = document.createElement('div');
    document.body.append(destination); destination.append(el);
    window.previousZoom = zoom;
    return zoom === new window.Zoomix(el);
  })).toBe(true);
  await settle(page);
  expect(await root.evaluate(el => window.previousZoom === new window.Zoomix(el))).toBe(true);
  await root.evaluate(el => { window.savedRoot = el; el.remove(); });
  await expect(page.locator('.zoomix-view, .zoomix-mark')).toHaveCount(0);
  await page.evaluate(() => document.querySelector('#stage').append(window.savedRoot));
  await expect(root).toHaveAttribute('role', 'button');
  expect(await root.evaluate(el => window.previousZoom !== new window.Zoomix(el))).toBe(true);
  await openKeyboard(page);
});

test('replacement of img and picture follows new pixels and refreshes the accessible name', async ({ page }) => {
  const root = await ready(page);
  await openKeyboard(page);
  await root.evaluate((el, portrait) => {
    el.innerHTML = `<picture><source type="image/png" srcset="${portrait}"><img src="/missing.png" alt="Portrait camera"></picture>`;
  }, portrait);
  await expect(page.locator('.zoomix-detail')).toHaveAttribute('src', new URL(portrait, page.url()).href);
  await expect(root).toHaveAttribute('aria-label', 'Увеличить: Portrait camera');
  await root.locator('picture').evaluate(el => el.remove());
  await expectClosed(page);
  await root.evaluate((el, landscape) => el.innerHTML = `<img src="${landscape}" alt="New camera">`, landscape);
  await openKeyboard(page);
  await expect(root).toHaveAttribute('aria-label', 'Увеличить: New camera');
});

test('repeated mount and destroy balances global listeners and restores author attributes', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => {
    new window.Zoomix(el).destroy();
    el.setAttribute('role', 'img'); el.tabIndex = 3; el.setAttribute('aria-label', 'Author label');
    el.setAttribute('aria-pressed', 'mixed'); el.className = 'author-class zoomix-anchor';
    window.listenerBalance = 0;
    const add = window.addEventListener, remove = window.removeEventListener;
    window.addEventListener = function(type, listener, options) {
      if (type === 'scroll' || type === 'resize') window.listenerBalance++;
      return add.call(this, type, listener, options);
    };
    window.removeEventListener = function(type, listener, options) {
      if (type === 'scroll' || type === 'resize') window.listenerBalance--;
      return remove.call(this, type, listener, options);
    };
  });
  for (let i = 0; i < 12; i++) {
    expect(await root.evaluate(el => {
      const zoom = new window.Zoomix(el, { scale: 2 });
      return zoom === new window.Zoomix(el, { scale: 20 });
    })).toBe(true);
    await openKeyboard(page);
    expect((await page.locator('.zoomix-detail').boundingBox()).width).toBe(640);
    await root.evaluate(el => { const zoom = new window.Zoomix(el); zoom.destroy(); zoom.destroy(); zoom.close(); zoom.refresh(); });
    await settle(page);
    await expect(page.locator('.zoomix-view, .zoomix-mark')).toHaveCount(0);
    await expect(root).toHaveAttribute('role', 'img');
    await expect(root).toHaveAttribute('tabindex', '3');
    await expect(root).toHaveAttribute('aria-label', 'Author label');
    await expect(root).toHaveAttribute('aria-pressed', 'mixed');
    await expect(root).toHaveClass('author-class zoomix-anchor');
    expect(await page.evaluate(() => window.listenerBalance)).toBe(0);
  }
});

test('closing one zoom does not remove positioning required by another shared side target', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(async el => {
    const { Zoomix } = await import('/dist/zoomix.js');
    new window.Zoomix(el).destroy();
    const clone = el.cloneNode(true); clone.id = 'clone'; clone.style.display = 'inline-block'; el.after(clone);
    const target = document.createElement('div'); target.id = 'target';
    target.style.cssText = 'width:200px;height:150px;margin-left:180px;margin-top:40px';
    document.body.append(target);
    new window.Zoomix(el, { mode: 'side', sideTarget: target });
    new Zoomix(clone, { mode: 'side', sideTarget: target });
  });
  await openKeyboard(page);
  await page.locator('#clone').hover();
  await expect(page.locator('#target .zoomix-view')).toHaveCount(2);
  await root.evaluate(el => new window.Zoomix(el).close());
  await expect(page.locator('#target .zoomix-view')).toHaveCount(1);
  await expect.poll(async () => {
    const v = await page.locator('#target .zoomix-view').boundingBox(), t = await page.locator('#target').boundingBox();
    return Math.abs(v.x - t.x) + Math.abs(v.y - t.y);
  }).toBeLessThan(1.1);
  await page.locator('#clone').evaluate(el => new window.Zoomix(el).destroy());
  await expect(page.locator('#target')).not.toHaveClass(/zoomix-anchor/);
});

test('author-supplied side target anchor survives close and destroy', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => {
    new window.Zoomix(el).destroy();
    const target = document.createElement('div'); target.id = 'target'; target.className = 'zoomix-anchor';
    target.style.cssText = 'width:200px;height:150px'; document.body.append(target);
    new window.Zoomix(el, { mode: 'side', sideTarget: target });
  });
  await openKeyboard(page);
  await root.evaluate(el => new window.Zoomix(el).destroy());
  await expect(page.locator('#target')).toHaveClass('zoomix-anchor');
});
