import { test, expect, ready, delayedImage, settle } from './helpers.js';

async function managed(page) {
  await ready(page);
  await page.evaluate(() => {
    const photo = document.querySelector('#photo');
    Zoomix.get(photo).destroy(); photo.removeAttribute('data-zoomix'); photo.classList.add('managed');
    window.scope = Zoomix.mount(document.querySelector('#stage'), { selector: '.managed', options: { scale: 2 } });
    window.zoom = Zoomix.get(photo);
  });
}

test('instance API: identity, visible events, update, disable and lifetime', async ({ page }) => {
  await managed(page);
  await page.evaluate(() => {
    window.events = [];
    for (const type of ['open', 'close', 'destroy']) zoom.on(type, e => events.push([e.type, e.state.visible, e.state.destroyed]));
    zoom.open();
  });
  await expect(page.locator('.zoomix-view')).toBeVisible();
  expect(await page.evaluate(() => zoom === Zoomix.get(zoom.element) && scope === Zoomix.mount(scope.element, { selector: '.other' }))).toBe(true);
  await page.evaluate(() => zoom.update({ mode: 'lens', scale: 3 }));
  await expect(page.locator('.zoomix-lens')).toBeVisible();
  await page.evaluate(() => zoom.disable());
  await page.locator('#photo').hover();
  await page.locator('#photo').dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: 50, clientY: 50 });
  await page.locator('#photo').dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: 50, clientY: 50 });
  await page.locator('#photo').focus(); await page.keyboard.press('Enter');
  await page.evaluate(() => zoom.open());
  await expect(page.locator('.zoomix-view')).toHaveCount(0);
  await page.evaluate(() => { zoom.enable(); zoom.open(); });
  await expect(page.locator('.zoomix-view')).toBeVisible();
  await page.evaluate(() => { scope.destroy(); scope.destroy(); zoom.open(); zoom.update({ enabled: true }); });
  expect(await page.evaluate(() => [zoom.signal.aborted, scope.signal.aborted, Zoomix.get(zoom.element), Zoomix.getScope(scope.element)])).toEqual([true, true, undefined, undefined]);
  expect(await page.evaluate(() => events)).toEqual([['open', true, false], ['close', false, false], ['open', true, false], ['close', false, false], ['destroy', false, true]]);
});

test('subscriptions: disposer, once, abort, exceptions and no pointer event spam', async ({ page }) => {
  await managed(page);
  await page.evaluate(() => {
    window.counts = [0, 0, 0];
    const controller = new AbortController();
    const off = zoom.on('open', () => counts[0]++); off();
    zoom.on('open', () => counts[1]++, { once: true });
    zoom.on('open', () => counts[2]++, { signal: controller.signal }); controller.abort();
    zoom.on('open', () => { throw new Error('isolated listener'); });
    zoom.open();
  });
  await expect(page.locator('.zoomix-view')).toBeVisible();
  await page.evaluate(() => { zoom.close(); zoom.open(); });
  await expect(page.locator('.zoomix-view')).toBeVisible();
  expect(await page.evaluate(() => counts)).toEqual([0, 1, 0]);
});

test('scope tracks clones, persistent options, moves and independent owners', async ({ page }) => {
  await managed(page);
  await page.evaluate(() => {
    scope.update({ scale: 3 });
    const second = document.createElement('section'); second.id = 'second'; document.body.append(second);
    window.other = Zoomix.mount(second, { selector: '.managed', options: { scale: 4 } });
    const clone = zoom.element.cloneNode(true); clone.id = 'clone'; scope.element.append(clone);
  });
  await expect.poll(() => page.evaluate(() => scope.getInstances().length)).toBe(2);
  expect(await page.evaluate(() => Zoomix.get(document.querySelector('#clone')).getState().scale)).toBe(3);
  await page.evaluate(() => { window.old = Zoomix.get(document.querySelector('#clone')); other.element.append(old.element); });
  await expect.poll(() => page.evaluate(() => other.getInstances().length)).toBe(1);
  expect(await page.evaluate(() => [old.signal.aborted, other.getInstances()[0].getState().scale, scope.getInstances().length])).toEqual([true, 4, 1]);
  await page.evaluate(() => { other.destroy(); scope.element.hidden = true; });
  await settle(page);
  expect(await page.evaluate(() => scope.signal.aborted)).toBe(false);
  await page.evaluate(() => { scope.element.hidden = false; document.body.append(scope.element); });
  await settle(page);
  expect(await page.evaluate(() => Zoomix.get(zoom.element) === zoom)).toBe(true);
});

test('scope removal aborts external subscriptions and clears external side panel', async ({ page }) => {
  await managed(page);
  await page.evaluate(() => {
    const panel = document.createElement('div'); panel.id = 'panel'; panel.style.cssText = 'width:200px;height:180px'; document.body.append(panel);
    scope.update({ mode: 'side', sideTarget: panel });
    window.cleaned = 0; scope.signal.addEventListener('abort', () => cleaned++);
    zoom.open();
  });
  await expect(page.locator('#panel .zoomix-view')).toBeVisible();
  await page.evaluate(() => scope.element.remove());
  await expect(page.locator('.zoomix-view')).toHaveCount(0);
  expect(await page.evaluate(() => [cleaned, zoom.signal.aborted, scope.getInstances().length])).toEqual([1, true, 0]);
});

test('cancelled pending open and destroyed scope ignore late responses', async ({ page }) => {
  const pending = await delayedImage(page, '/api-pending.png');
  await managed(page);
  await page.evaluate(() => {
    window.loads = 0; zoom.element.querySelector('img').dataset.zoomSrc = '/api-pending.png';
    scope.on('load', () => loads++); zoom.open();
  });
  await expect.poll(pending.count).toBe(1);
  await page.evaluate(() => { zoom.close(); scope.element.remove(); });
  await expect.poll(() => page.evaluate(() => scope.signal.aborted)).toBe(true);
  pending.release(false); await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => [loads, zoom.getState().loading, zoom.getState().visible])).toEqual([0, false, false]);
});

test('scope rejects auto markup and overlapping ownership without harming existing owner', async ({ page }) => {
  await managed(page);
  expect(await page.evaluate(() => {
    try { Zoomix.mount(document.body, { selector: '.managed' }); return false; } catch { return true; }
  })).toBe(true);
  expect(await page.evaluate(() => scope.getInstances()[0] === zoom)).toBe(true);
  expect(await page.evaluate(() => {
    const auto = document.createElement('div'); auto.dataset.zoomix = 'inner'; document.body.append(auto);
    try { Zoomix.mount(auto, { selector: '[data-zoomix]' }); return false; } catch { return true; }
  })).toBe(true);
});

test('side target replacement releases previous target and preserves subscriptions', async ({ page }) => {
  await managed(page);
  await page.evaluate(() => {
    for (const id of ['a', 'b']) { const el = document.createElement('div'); el.id = id; el.style.cssText = 'width:200px;height:160px'; document.body.append(el); }
    zoom.update({ mode: 'side', sideTarget: document.querySelector('#a') }); zoom.open();
  });
  await expect(page.locator('#a .zoomix-view')).toBeVisible();
  await page.evaluate(() => { zoom.update({ sideTarget: document.querySelector('#b') }); zoom.open(); });
  await expect(page.locator('#b .zoomix-view')).toBeVisible();
  await expect(page.locator('#a')).not.toHaveClass(/zoomix-anchor/);
  await page.evaluate(() => { zoom.update({ sideTarget: null }); zoom.open(); });
  await expect(page.locator('#b')).not.toHaveClass(/zoomix-anchor/);
});

test('scope forwards new photo events, snapshot mutation is harmless and pointer motion does not spam', async ({ page }) => {
  await managed(page);
  await page.evaluate(() => {
    window.states = 0; window.opened = [];
    scope.on('statechange', () => states++);
    scope.on('open', e => opened.push(e.element.id));
    const clone = zoom.element.cloneNode(true); clone.id = 'later'; clone.style.display = 'inline-block'; scope.element.append(clone);
    const snapshot = scope.getInstances(); snapshot.length = 0;
    const state = zoom.getState(); state.enabled = false;
  });
  await expect.poll(() => page.evaluate(() => scope.getInstances().length)).toBe(2);
  await page.locator('#later').hover();
  await expect(page.locator('#later .zoomix-view')).toBeVisible();
  const count = await page.evaluate(() => states);
  await page.locator('#later').hover({ position: { x: 50, y: 50 } });
  await settle(page);
  expect(await page.evaluate(() => states)).toBe(count);
  expect(await page.evaluate(() => [opened, zoom.getState().enabled])).toEqual([['later'], true]);
});

test('auto photos and ESM/browser scopes coexist and preserve identity', async ({ page }) => {
  await managed(page);
  await page.evaluate(async () => {
    const { default: ESM } = await import('/dist/zoomix.js');
    window.esmIdentity = ESM.get(zoom.element) === zoom && ESM.getScope(scope.element) === scope;
    const auto = zoom.element.cloneNode(true); auto.id = 'auto'; auto.classList.remove('managed'); auto.dataset.zoomix = 'lens'; document.body.append(auto);
  });
  await expect(page.locator('#auto')).toHaveAttribute('role', 'button');
  expect(await page.evaluate(() => esmIdentity)).toBe(true);
  await page.evaluate(() => { scope.destroy(); Zoomix.get(document.querySelector('#auto')).open(); });
  await expect(page.locator('#auto .zoomix-lens')).toBeVisible();
});

test('loading event order and fallback describe actual source without replay', async ({ page }) => {
  await managed(page);
  await page.route('**/bad-api.png', route => route.abort());
  await page.evaluate(() => {
    window.sequence = [];
    zoom.element.querySelector('img').dataset.zoomSrc = '/bad-api.png';
    for (const type of ['loadstart', 'error', 'load', 'open']) zoom.on(type, e => sequence.push([type, e.fallback, e.source]));
    zoom.open();
  });
  await expect(page.locator('.zoomix-view')).toBeVisible();
  expect(await page.evaluate(() => sequence.map(e => e[0]))).toEqual(['loadstart', 'error', 'load', 'open']);
  expect(await page.evaluate(() => sequence.slice(0, 3).map(e => e[1]))).toEqual([false, true, true]);
  expect(await page.evaluate(() => sequence[2][2])).toContain('landscape.png');
  expect(await page.evaluate(() => { let count = 0; zoom.on('open', () => count++); return count; })).toBe(0);
});

test('destroy inside state callback cannot publish load events or create layers', async ({ page }) => {
  await managed(page);
  expect(await page.evaluate(() => {
    let loads = 0;
    zoom.on('loadstart', () => loads++);
    zoom.on('statechange', e => { if (e.state.active) zoom.destroy(); });
    zoom.open();
    return [loads, zoom.signal.aborted];
  })).toEqual([0, true]);
  await settle(page);
  await expect(page.locator('.zoomix-view')).toHaveCount(0);
});


test('individual destroy immediately releases scope membership and refresh can remount', async ({ page }) => {
  await managed(page);
  expect(await page.evaluate(() => {
    zoom.destroy();
    const count = scope.getInstances().length;
    scope.refresh();
    return [count, scope.getInstances().length, Zoomix.get(zoom.element) !== zoom];
  })).toEqual([0, 1, true]);
});
