import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/examples/');
  await expect(page.locator('.zoomix-root')).toHaveCount(1);
});

test('geometry follows source detail across modes, fit, position and resize', async ({ page }) => {
  const root = page.locator('[data-zoomix]');
  for (const mode of ['inner', 'lens', 'side']) {
    await page.getByRole('button').filter({ hasText: {inner:'В кадре',lens:'Лупа',side:'Рядом'}[mode] }).click();
    for (const [fit, w, h, ox, oy] of [['contain',320,260,0,15], ['cover',320,260,-72,0], ['cover',280,220,-54,0]]) {
      const img = root.locator('picture img');
      await img.evaluate((el, [w,h,fit]) => Object.assign(el.style,{width:w+'px',height:h+'px',objectFit:fit,objectPosition:'75% 25%'}), [w,h,fit]);
      const b = await img.boundingBox();
      const iw = fit === 'cover' ? h * 1.6 : w;
      const ih = iw / 1.6;
      const top = Math.max(0, oy), bottom = Math.min(h, oy+ih);
      if (fit === 'contain') {
        await page.mouse.move(b.x+10,b.y+2);
        await expect(page.locator('.zoomix-view')).toHaveCount(0);
      }
      for (const [x,y] of [[2,top+2],[w/2,(top+bottom)/2],[w-2,bottom-2]]) {
        await page.mouse.move(b.x+x,b.y+y);
        const detail = page.locator('.zoomix-detail');
        await expect(detail).toBeVisible();
        await expect.poll(async () => {
          const d = await detail.boundingBox();
          const v = await page.locator('.zoomix-view').boundingBox();
          if (!d || !v) return Infinity;
          // At edges the side viewport clamps its crop to the available pixels.
          const expectedX = mode === 'side' ? v.x - Math.max(0,Math.min(iw*2-v.width,(x-ox)*2-v.width/2)) : b.x+x-(x-ox)*2;
          const expectedY = mode === 'side' ? v.y - Math.max(0,Math.min(ih*2-v.height,(y-oy)*2-v.height/2)) : b.y+y-(y-oy)*2;
          return Math.max(Math.abs(d.x-expectedX),Math.abs(d.y-expectedY),Math.abs(d.width-iw*2));
        }).toBeLessThan(2.1);
      }
    }
  }
});

test('keyboard, shared instance, teardown and declarative remount', async ({ page }) => {
  const root = page.locator('[data-zoomix]');
  await root.focus();
  await page.keyboard.press('Enter');
  const detail = root.locator('.zoomix-detail');
  await expect(detail).toBeVisible();
  const before = await detail.boundingBox();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await detail.boundingBox()).x).toBeLessThan(before.x);
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Space');
  await expect(detail).toBeVisible();
  expect(await root.evaluate(async el => {
    const {Zoomix} = await import('/dist/zoomix.js');
    const zoom = new Zoomix(el);
    const shared = zoom === new window.Zoomix(el);
    zoom.destroy();
    return shared && !el.hasAttribute('tabindex') && !el.hasAttribute('role') && !el.querySelector('.zoomix-view');
  })).toBeTruthy();
  await root.evaluate(el => el.replaceWith(el.cloneNode(true)));
  await expect(root).toHaveAttribute('role','button');
});

test('lazy high resolution source, race and failed original', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => release = resolve);
  let started = false;
  await page.route('**/slow.svg', async route => { started=true; await gate; await route.fulfill({path:'public/optic.svg'}); });
  await page.route('**/broken.svg', route => route.abort());
  const root = page.locator('[data-zoomix]');
  const img = root.locator('picture img');
  await img.evaluate(el => el.dataset.zoomSrc='/slow.svg');
  expect(started).toBe(false);
  await root.hover();
  await expect.poll(() => started).toBe(true);
  await expect(root.locator('.zoomix-view')).toHaveCount(0);
  await img.evaluate(el => { el.src='/optic.svg?new'; el.dataset.zoomSrc='/broken.svg'; });
  await expect(root.locator('.zoomix-detail')).toHaveAttribute('src',/optic.svg\?new/);
  release();
  await page.waitForLoadState('networkidle');
  await expect(root.locator('.zoomix-detail')).toHaveAttribute('src',/optic.svg\?new/);
});

test('side window escapes clipping, flips and falls back; explicit target', async ({ page }) => {
  const root = page.locator('[data-zoomix]');
  await root.evaluate(el => { el.dataset.zoomix='side'; el.parentElement.style.cssText='margin-left:auto;overflow:hidden'; });
  await root.hover();
  const side = page.locator('body > .zoomix-side');
  await expect(side).toBeVisible();
  expect((await side.boundingBox()).x).toBeLessThan((await root.boundingBox()).x);
  await page.setViewportSize({width:520,height:800});
  await root.hover();
  await expect(root.locator('.zoomix-inner')).toBeVisible();
  await root.evaluate(el => {
    new window.Zoomix(el).destroy();
    const target = document.createElement('div');
    target.id='target'; target.style.cssText='width:180px;height:140px'; el.after(target);
    new window.Zoomix(el,{mode:'side',sideTarget:target});
  });
  await page.mouse.move(0,0);
  await root.hover();
  await expect(page.locator('#target .zoomix-side')).toBeVisible();
});

test('scale respects native pixels; portal tracks scroll and teardown', async ({ page }) => {
  const root = page.locator('[data-zoomix]');
  await root.evaluate(el => {
    el.dataset.zoomix='side';
    el.dataset.zoomScale='20';
    document.body.style.minHeight='200vh';
  });
  await root.focus();
  await page.keyboard.press('Enter');
  const side = page.locator('body > .zoomix-side');
  const detail = side.locator('img');
  await expect(detail).toBeVisible();
  expect((await detail.boundingBox()).width).toBe(1600);
  await page.evaluate(()=>scrollBy(0,100));
  await expect.poll(async()=>Math.abs((await side.boundingBox()).y-(await root.boundingBox()).y)).toBeLessThan(1.1);
  await root.evaluate(el => el.remove());
  await expect(side).toHaveCount(0);
});

test('canceled contact and compatibility click leave zoom closed', async ({page}) => {
  const root=page.locator('[data-zoomix]');
  const b=await root.boundingBox();
  const pointer={pointerId:1,pointerType:'touch',isPrimary:true,clientX:b.x+50,clientY:b.y+50};
  for(const type of ['pointerdown','pointercancel','pointerup']) await root.dispatchEvent(type,pointer);
  await root.dispatchEvent('click');
  await expect(root).toHaveAttribute('aria-pressed','false');
});
