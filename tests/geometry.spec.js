import { test, expect, ready, openKeyboard, settle, hd } from './helpers.js';

// Known rectangles for the 320x200 source; these expectations do not call geometry().
const fits = [
  ['contain', 'center', 320, 260, 0, 30, 320, 200],
  ['contain', 'right 12px bottom 8px', 320, 260, -12, 52, 320, 200],
  ['cover', 'right 12px bottom 8px', 320, 260, -108, -8, 416, 260],
  ['cover', 'calc(100% - 12px) 25%', 320, 260, -108, 0, 416, 260],
  ['fill', 'center', 320, 260, 0, 0, 320, 260],
  ['none', '25% 75%', 320, 260, 0, 45, 320, 200],
  ['scale-down', 'center', 400, 300, 40, 50, 320, 200],
];

for (const mode of ['inner', 'lens', 'side']) {
  test(`${mode}: raster geometry respects fit, edge offsets, padding and borders`, async ({ page }) => {
    const root = await ready(page);
    await root.evaluate((el, mode) => {
      el.dataset.zoomix = mode;
      el.style.cssText = 'padding:11px;border:5px solid black;';
      const img = el.querySelector('img');
      img.src = '/tests/fixtures/landscape-small.png';
      img.dataset.zoomSrc = '/tests/fixtures/landscape-hd.png';
    }, mode);
    await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.naturalWidth)).toBe(320);
    for (const [fit, position, w, h, ox, oy, iw, ih] of fits) {
      await page.mouse.move(0, 0);
      const img = root.locator('img:not(.zoomix-detail)');
      await img.evaluate((el, [fit, position, w, h]) => {
        el.style.cssText = `width:${w}px;height:${h}px;object-fit:${fit};object-position:${position};padding:7px 9px;border:3px solid red;box-sizing:content-box`;
      }, [fit, position, w, h]);
      const b = await img.boundingBox();
      const x = b.x + 12, y = b.y + 10; // border + padding, independent content origin
      const left = Math.max(0, ox), top = Math.max(0, oy);
      const right = Math.min(w, ox + iw), bottom = Math.min(h, oy + ih);
      const p = { x: x + (left + right) / 2, y: y + (top + bottom) / 2 };
      await page.mouse.move(p.x, p.y);
      const detail = page.locator('.zoomix-detail');
      await expect(detail, `${fit}, ${position}`).toBeVisible();
      await expect.poll(async () => {
        const d = await detail.boundingBox(), v = await page.locator('.zoomix-view').boundingBox();
        if (!d || !v) return Infinity;
        // The source pixel under the centre of the visible crop stays under the viewing point.
        const expectedX = mode === 'side' ? v.x + v.width / 2 : p.x;
        const expectedY = mode === 'side' ? v.y + v.height / 2 : p.y;
        return Math.max(Math.abs(d.width - iw * 2), Math.abs(d.height - ih * 2),
          Math.abs(d.x + (p.x - x - ox) * 2 - expectedX),
          Math.abs(d.y + (p.y - y - oy) * 2 - expectedY));
      }, { message: `${fit}, ${position}` }).toBeLessThan(1.1);
      if (mode === 'inner') {
        const view = await page.locator('.zoomix-view').boundingBox();
        expect(view.x).toBeCloseTo(x + left, 0);
        expect(view.y).toBeCloseTo(y + top, 0);
        expect(view.width).toBeCloseTo(right - left, 0);
        expect(view.height).toBeCloseTo(bottom - top, 0);
      }
    }
  });
}

for (const order of ['before', 'after']) {
  test(`storefront image reset ${order} the library CSS does not constrain detail`, async ({ page }) => {
    const root = await ready(page);
    await page.evaluate(order => {
      const reset = document.createElement('style');
      reset.textContent = 'img { max-width:100%;height:auto;max-height:120px;box-sizing:border-box } picture img { vertical-align:middle }';
      if (order === 'before') document.head.prepend(reset); else document.head.append(reset);
    }, order);
    await root.locator('img:not(.zoomix-detail)').evaluate((el, hd) => { el.dataset.zoomSrc = hd; el.style.maxHeight = 'none'; }, hd);
    for (const mode of ['inner', 'lens', 'side']) {
      await root.evaluate((el, mode) => { new window.Zoomix(el).close(); el.dataset.zoomix = mode; }, mode);
      await openKeyboard(page);
      const box = await page.locator('.zoomix-detail').boundingBox();
      expect(box.width).toBe(640);
      expect(box.height).toBe(400);
    }
  });
}

test('raster native resolution and invalid scales never create a false active state', async ({ page }) => {
  const root = await ready(page);
  for (const scale of ['0', '1', '-2']) {
    await root.evaluate((el, scale) => { el.dataset.zoomScale = scale; }, scale);
    await root.focus(); await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.zoomix-view')).toHaveCount(0);
  }
  await root.locator('img:not(.zoomix-detail)').evaluate(img => img.src = '/tests/fixtures/landscape-small.png');
  await expect.poll(() => root.locator('img:not(.zoomix-detail)').evaluate(img => img.naturalWidth)).toBe(320);
  await root.evaluate(el => el.dataset.zoomScale = '20');
  await root.focus(); await page.keyboard.press('Enter');
  await settle(page);
  await expect(root).toHaveAttribute('aria-pressed', 'false');
  await root.locator('img:not(.zoomix-detail)').evaluate((img, hd) => img.dataset.zoomSrc = hd, hd);
  await root.evaluate(el => el.dataset.zoomScale = 'nonsense');
  await openKeyboard(page);
  expect((await page.locator('.zoomix-detail').boundingBox()).width).toBe(640);
  await page.keyboard.press('Escape');
  await root.evaluate(el => el.dataset.zoomScale = '20');
  await openKeyboard(page);
  expect((await page.locator('.zoomix-detail').boundingBox()).width).toBe(2400);
});

test('side target larger than HD has stable nonnegative crop and follows nested scrolling', async ({ page }) => {
  const root = await ready(page);
  await root.evaluate(el => {
    new window.Zoomix(el).destroy();
    const scroller = document.createElement('div');
    scroller.id = 'scroller'; scroller.style.cssText = 'width:1000px;height:450px;overflow:auto;position:relative;border:7px solid black';
    const content = document.createElement('div'); content.style.cssText = 'width:1400px;height:1000px;padding:30px;position:relative';
    el.parentElement.append(scroller); scroller.append(content); content.append(el);
    const target = document.createElement('div');
    target.id = 'target'; target.style.cssText = 'width:800px;height:600px;border:5px solid red';
    content.append(target);
    new window.Zoomix(el, { mode: 'side', sideTarget: target });
  });
  await openKeyboard(page);
  const view = page.locator('#target .zoomix-side');
  for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
    for (let i = 0; i < 12; i++) await page.keyboard.press(key);
    const v = await view.boundingBox(), d = await view.locator('img').boundingBox();
    expect(v.width).toBe(640); expect(v.height).toBe(400);
    expect(d.x).toBeCloseTo(v.x, 0); expect(d.y).toBeCloseTo(v.y, 0);
  }
  await page.locator('#scroller').evaluate(el => { el.scrollLeft = 30; el.scrollTop = 80; });
  await expect.poll(async () => {
    const v = await view.boundingBox(), t = await page.locator('#target').boundingBox();
    return Math.abs(v.x - t.x - 5) + Math.abs(v.y - t.y - 5);
  }).toBeLessThan(1.1);
});
