import { test, expect } from '@playwright/test';

test('documentation tabs, copying, and live zoom modes', async ({ page, browserName }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/docs/');
  await page.getByRole('tab', { name: 'HTML', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'ESM / TypeScript' })).toBeFocused();
  await expect(page.locator('#panel-esm')).toBeVisible();
  await expect(page.locator('#panel-html')).toBeHidden();
  if (browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#panel-esm .copy').first().click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm install zoomix');
  }
  const photo = page.locator('#demo-photo');
  for (const mode of ['inner', 'side', 'lens']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await photo.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`.zoomix-${mode}`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.zoomix-view')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('side demo uses the adjacent panel when an automatic window would not fit', async ({ page }) => {
  await page.goto('/docs/');
  for (const width of [980, 800]) {
    await page.setViewportSize({ width, height: 800 });
    await page.locator('[data-mode="side"]').click();
    const photo = page.locator('#demo-photo');
    await photo.hover();
    const side = page.locator('.demo-description .zoomix-side');
    await expect(side).toBeVisible();
    await expect(photo.locator('.zoomix-inner')).toHaveCount(0);
    const sourceBox = await photo.boundingBox();
    const sideBox = await side.boundingBox();
    expect(sideBox.x).toBeGreaterThan(sourceBox.x + sourceBox.width);
    expect(sideBox.x + sideBox.width).toBeLessThanOrEqual(width);
    await page.mouse.move(0, 0);
    await expect(side).toHaveCount(0);
  }
});

test('mobile contents navigate without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/docs/');
  const contents = page.locator('.contents');
  await expect(contents).not.toHaveAttribute('open');
  await contents.locator('summary').click();
  await contents.getByRole('link', { name: '03 Параметры' }).click();
  await expect(page).toHaveURL(/#options$/);
  await expect(contents).not.toHaveAttribute('open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Открыть демо' }).click();
  await expect(page).toHaveURL(/\/examples\/$/);
  await page.getByRole('link', { name: 'Документация' }).click();
  await expect(page).toHaveURL(/\/docs\/$/);
});

test('side demo ratio control resizes both window and marker', async ({ page }) => {
  await page.goto('/docs/');
  const control = page.getByLabel('Пропорции окна и рамки');
  await expect(control).toBeHidden();
  await page.locator('[data-mode="side"]').click();
  await expect(control).toBeVisible();
  for (const ratio of ['1', '1.3333333333333333', '0.75', '1.7777777777777777']) {
    await control.selectOption(ratio);
    await page.locator('#demo-photo').hover();
    for (const selector of ['.zoomix-side', '.zoomix-mark']) {
      await expect.poll(async () => {
        const b = await page.locator(selector).boundingBox();
        return b ? Math.abs(b.width / b.height - Number(ratio)) : Infinity;
      }).toBeLessThan(0.01);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('[data-mode="inner"]').click();
  await expect(control).toBeHidden();
});
