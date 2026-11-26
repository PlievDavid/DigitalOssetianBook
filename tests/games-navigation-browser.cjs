const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output = path.resolve(__dirname, '../.run-local/games-navigation');
    fs.mkdirSync(output, { recursive: true });
    const routes = ['/games/crosswords', '/games/wordle', '/game'];
    const backStyle = locator => locator.evaluate(element => {
      const style = getComputedStyle(element);
      return ['fontSize', 'fontWeight', 'paddingTop', 'paddingBottom', 'minHeight', 'color']
        .map(property => style[property]);
    });
    const overflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1242, 668]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/game');
      const expectedBack = await backStyle(page.locator('#game-app > .back-link'));
      await page.goto(base + '/games');
      assert.deepEqual(await page.locator('#games-catalog .format-card').evaluateAll(elements => elements.map(element => element.getAttribute('href'))), routes);
      await overflow();
      await page.screenshot({ path: path.join(output, `catalog-${width}.png`), fullPage: true });
      for (const route of routes) {
        const card = page.locator(`#games-catalog a[href="${route}"]`);
        await card.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + route);
        const back = page.locator('#main-content > .feature-shell > a.back-link');
        assert.equal(await back.innerText(), '← К играм');
        assert.equal(await back.getAttribute('href'), '/games');
        assert.deepEqual(await backStyle(back), expectedBack, `Shared return link at ${width}/${route}`);
        assert((await back.boundingBox()).y + (await back.boundingBox()).height <= (await page.locator('h1').boundingBox()).y, 'Return link is above the heading');
        if (width < 600) {
          assert.equal(await page.locator('.mobile-bottom-nav a').count(), 3);
          assert.equal(await page.locator('.mobile-bottom-nav .is-current').getAttribute('href'), '/');
        }
        await overflow();
        await page.screenshot({ path: path.join(output, `${route.split('/').at(-1)}-${width}.png`), fullPage: true });
        await back.focus(); await page.keyboard.press('Enter'); await page.waitForURL(base + '/games');
      }
      for (const route of ['/word-practice', '/vocabulary']) {
        await page.goto(base + route);
        assert.equal(new URL(page.url()).pathname, '/account/login');
        assert.equal(new URL(page.url()).searchParams.get('ReturnUrl'), route);
        assert.equal(await page.locator('#words-menu, .tablet-nav-group[aria-label="Слова"], .guest-notice').count(), 0);
      }
      await overflow();
      await page.goto(base);
      const gamesHeading = page.getByRole('heading', { name: 'Игры со словами', level: 2 });
      assert.equal(await gamesHeading.getByRole('link').count(), 0);
      assert.deepEqual(await page.locator('#games a').evaluateAll(elements => elements.map(element => element.getAttribute('href'))), routes);
      assert.equal(await page.locator('.hero-actions a[href="/exercises"]').count(), 1);
      await page.goto(base + '/exercises');
      assert.equal(await page.locator('.exercises-shell a[href="/picture"]').count(), 1);
      await page.goto(base + '/picture');
      assert.equal(await page.locator('#practice-menu a[href="/picture"]').count(), 1);
      assert.equal(await page.locator('.tablet-nav-group[aria-label="Задания"] a[href="/picture"]').count(), 1);
      assert(await page.locator('[aria-controls="practice-menu"]').evaluate(element => element.classList.contains('is-current')));
      if (width < 600) {
        assert.equal(await page.locator('.mobile-bottom-nav a').count(), 3);
        assert.equal(await page.locator('.mobile-bottom-nav .is-current').getAttribute('href'), '/');
      }
      await page.goto(base + '/games');
      await page.addStyleTag({ content: 'body { font-size: 200%; }' }); await overflow();
    }
    assert.deepEqual(errors, []);
    console.log('Games navigation passed: shared text return links above headings, keyboard navigation, guest access and redirects, three mobile items, tablet/desktop menus and no overflow at four viewports and 200% text.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
