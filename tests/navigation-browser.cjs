// Read-only regression for mobile overlays, detached SVG click targets and desktop navigation.
// Run with ADAM_TEST_URL pointing to a local preview, Playwright and Edge installed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Set ADAM_TEST_URL to a local preview.');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let checks = 0;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [360, 587, 768]) {
      await page.setViewportSize({ width, height: 668 });
      await page.goto(base);
      assert.deepEqual(await page.locator('.mobile-bottom-nav a span').allTextContents(), ['Задания', 'Слова', 'Книги', 'Профиль']);
      assert.equal(await page.locator('#main-navigation a[href="/Home/Privacy"], #main-navigation a[href="/Home/Illustrations"]').count(), 0);
      checks += 2;
      const toggle = page.locator('.mobile-menu-toggle');
      // Click the SVG itself: its paths are replaced while the event is still bubbling.
      await toggle.locator('svg').click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert(await page.locator('#main-content').evaluate(element => element.inert));
      assert(await page.locator('#main-navigation').isVisible());
      assert(await page.locator('#main-navigation').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight));
      await toggle.focus();
      await page.keyboard.press('Tab');
      assert(await page.locator('.brand').evaluate(element => element === document.activeElement));
      await page.keyboard.press('Shift+Tab');
      assert(await toggle.evaluate(element => element === document.activeElement));
      await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert(await page.locator('#main-content').evaluate(element => !element.inert));
      assert(await toggle.evaluate(element => element === document.activeElement));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width <= 700) assert(await page.locator('.site-footer').isHidden());
      checks += width <= 700 ? 11 : 10;
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(base);
    const section = page.locator('a[aria-controls="practice-menu"]');
    await section.focus();
    await page.keyboard.press('ArrowDown');
    assert(await page.locator('#practice-menu a').first().evaluate(element => element === document.activeElement));
    await page.keyboard.press('Escape');
    assert(await section.evaluate(element => element === document.activeElement));
    assert.equal(await section.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    checks += 4;
    console.log('Navigation browser checks passed: ' + checks);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
