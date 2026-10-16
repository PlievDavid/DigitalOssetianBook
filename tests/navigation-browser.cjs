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
    for (const width of [360, 478, 599]) {
      await page.setViewportSize({ width, height: 668 });
      await page.goto(base);
      assert(await page.locator('.site-header').isHidden());
      assert(await page.locator('.mobile-menu-toggle').isHidden());
      assert(await page.locator('#main-navigation').isHidden());
      assert(await page.locator('.mobile-bottom-nav').isVisible());
      assert.deepEqual(await page.locator('.mobile-bottom-nav a span').allTextContents(), ['Задания', 'Слова', 'Книги', 'Профиль']);
      assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').count(), 1);
      assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').getAttribute('href'), '/');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      checks += 6;
      for (const route of ['/games/crosswords', '/games/wordle']) {
        const card = page.locator(`#games a[href="${route}"]`);
        assert.equal(await card.count(), 1);
        await card.focus(); await page.keyboard.press('Enter');
        await page.waitForURL(base + route);
        assert.deepEqual(await page.locator('.mobile-bottom-nav a span').allTextContents(), ['Задания', 'Слова', 'Книги', 'Профиль']);
        assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').getAttribute('href'), '/');
        const back = page.locator(route.endsWith('wordle') ? '.wl-back' : '.cw-back-to-tasks');
        assert(await back.isVisible());
        await back.focus(); await page.keyboard.press('Enter');
        await page.waitForURL(base + '/#games');
        assert(await page.locator('#games').isVisible());
        checks += 5;
      }
    }
    for (const width of [600, 768, 1023]) {
      await page.setViewportSize({ width, height: 668 });
      await page.goto(base);
      assert(await page.locator('.site-header').isVisible());
      assert.deepEqual(await page.locator('.mobile-bottom-nav a span').allTextContents(), ['Задания', 'Слова', 'Книги', 'Профиль']);
      assert.equal(await page.locator('#main-navigation a[href="/Home/Privacy"], #main-navigation a[href="/Home/Illustrations"]').count(), 0);
      checks += 3;
      const toggle = page.locator('.mobile-menu-toggle');
      // Click the SVG itself: its paths are replaced while the event is still bubbling.
      await toggle.locator('svg').click();
      assert(await page.locator('.mobile-bottom-nav').isHidden());
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert(await page.locator('#main-content').evaluate(element => element.inert));
      assert(await page.locator('#main-navigation').isVisible());
      const headerBottom = await page.locator('.site-header').evaluate(element => element.getBoundingClientRect().bottom);
      const menuTop = await page.locator('#main-navigation').evaluate(element => element.getBoundingClientRect().top);
      assert(Math.abs(menuTop - headerBottom - 12) < 1, 'Tablet menu has a 12px gap below the actual header.');
      const headings = await page.locator('.tablet-nav-title').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
      assert(Math.abs(headings[0] - headings[1]) < 1, 'Mobile section headings share the same top edge.');
      assert.deepEqual(await page.locator('.tablet-nav-title span').allTextContents(), ['Задания', 'Слова', 'Игры', 'Книги']);
      assert(await page.locator('.tablet-account-actions a[href="/account/login"]').isVisible());
      assert(await page.locator('.tablet-account-actions a[href="/account/register"]').isVisible());
      checks += 3;
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
      checks += width <= 700 ? 14 : 13;
    }
    await page.locator('.mobile-menu-toggle').click();
    await page.setViewportSize({ width: 478, height: 668 });
    assert.equal(await page.locator('.mobile-menu-toggle').getAttribute('aria-expanded'), 'false');
    assert(await page.locator('#main-content').evaluate(element => !element.inert));
    assert(await page.locator('.menu-backdrop').isHidden());
    assert(await page.evaluate(() => !document.body.classList.contains('mobile-nav-open')));
    checks += 4;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(base);
    assert(await page.locator('.site-header').isVisible());
    const section = page.locator('a[aria-controls="practice-menu"]');
    await section.focus();
    await page.keyboard.press('ArrowDown');
    assert(await page.locator('#practice-menu a').first().evaluate(element => element === document.activeElement));
    await page.keyboard.press('Escape');
    assert(await section.evaluate(element => element === document.activeElement));
    assert.equal(await section.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    checks += 5;
    console.log('Navigation browser checks passed: ' + checks);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
