import { test, expect } from '@playwright/test';
test.use({ viewport: {width:390,height:770}, hasTouch:true, isMobile:true });

for (const name of ['splide','swiper','tvist']) {
  test(name + ' touch, loop, programmatic move and dynamic slides', async ({page,browserName}) => {
    await page.goto('/examples/sliders.html');
    const section = page.locator('#'+name);
    const gallery = section.locator('.gallery');
    await gallery.scrollIntoViewIfNeeded();
    const index = () => section.evaluate(s => s.galleryController.index());
    const center = async () => {
      const b = await gallery.boundingBox();
      return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};
    };
    const cdp = browserName==='chromium' ? await page.context().newCDPSession(page) : null;
    async function swipe(dx,dy) {
      const p = await center();
      p.x -= dx / 2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});
      for (let step=1;step<=8;step++) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+dx*step/8,y:p.y+dy*step/8}]});
        await page.waitForTimeout(18);
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    async function tap() { const p=await center(); await page.touchscreen.tap(p.x,p.y); }
    const detail = gallery.locator('.zoomix-detail');
    if (cdp) {
      const start = await index();
      await swipe(-285,0);
      await expect.poll(index).not.toBe(start);
      await expect(detail).toHaveCount(0);
      await page.waitForTimeout(600);
    }
    await tap();
    await expect(detail).toBeVisible();
    const active = await index();
    if (cdp) {
      const before = await detail.boundingBox();
      await swipe(65,10);
      expect(await index()).toBe(active);
      await expect.poll(async() => (await detail.boundingBox()).x).toBeGreaterThan(before.x+20);
    }
    await tap();
    await expect(detail).toHaveCount(0);
    if (cdp) {
      await swipe(-285,0);
      await expect.poll(index).not.toBe(active);
      await page.waitForTimeout(600);
      const top = await page.evaluate(()=>scrollY);
      await swipe(0,top > 100 ? 90 : -90);
      await expect.poll(()=>page.evaluate(initial=>Math.abs(scrollY-initial),top)).toBeGreaterThan(30);
      await gallery.scrollIntoViewIfNeeded();
    }
    await section.locator('[data-add]').click();
    await expect(gallery.locator('img[alt$="кадр 5"]').first()).toBeAttached();
    const seen = new Set();
    for(let i=0;i<6;i++) {
      await gallery.scrollIntoViewIfNeeded();
      await tap();
      await expect(detail).toBeVisible();
      seen.add(await detail.getAttribute('src'));
      if (i===0) await section.locator('[data-next]').click();
      else await section.evaluate(s=>s.galleryController.next());
      await expect(detail).toHaveCount(0);
      await page.waitForTimeout(550);
    }
    expect(seen.size).toBe(5);
  });
}
