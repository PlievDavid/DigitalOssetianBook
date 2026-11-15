const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = path.resolve(__dirname, '../.run-local/home-navigation');
  fs.mkdirSync(output, { recursive: true });
  const routes = ['/audio-puzzles', '/listening', '/dialogs', '/translate', '/grammar', '/matching', '/picture', '/grouping'];
  try {
    for (const [width, dpr] of [[320, 1], [390, 2], [768, 1], [1242, 1]]) {
      const page = await browser.newPage({ viewport: { width, height: 667 }, deviceScaleFactor: dpr });
      page.setDefaultTimeout(7000);
      const errors = [];
      const images = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/kurt-tag-watercolor|\/green\/hero\.png/.test(request.url())) images.push(new URL(request.url()).pathname);
      });
      const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const pressLink = async (link, route) => {
        await link.focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(base + route);
      };
      await page.goto(base);
      const hero = page.locator('.home-hero');
      assert(await hero.getByRole('heading', { level: 1 }).isVisible());
      const image = hero.locator('img');
      assert(await image.evaluate(async img => { await img.decode(); return img.naturalWidth > 0 && img.fetchPriority === 'high'; }));
      assert.equal(images.length, 1);
      assert(images[0].endsWith(dpr === 2 ? '-880.webp' : '-440.webp'), images[0]);
      assert.equal(await hero.locator('.hero-actions').evaluate(el => getComputedStyle(el).animationName), 'home-arrive');
      const reading = page.locator('.home-reading');
      await reading.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.home-reading').classList.contains('home-arrived') ||
        document.querySelector('.home-reading').getBoundingClientRect().height + scrollY <= innerHeight);
      await page.evaluate(() => window.scrollTo(0, 0));
      await noOverflow();
      await page.screenshot({ path: path.join(output, `home-${width}.png`), animations: 'disabled' });
      await pressLink(hero.getByRole('link', { name: 'Начать заниматься' }), '/exercises');
      const catalog = page.locator('.exercises-shell');
      assert(await catalog.getByRole('heading', { name: 'Задания', level: 1 }).isVisible());
      assert.deepEqual(await catalog.getByRole('heading', { level: 2 }).allTextContents(),
        ['Понимание на слух', 'Построение фраз', 'Словарный запас']);
      assert.equal(await catalog.locator('.exercises-motif text').textContent(), 'Ӕ');
      assert.deepEqual(await catalog.locator('.exercise-catalog-card').evaluateAll(cards => cards.map(card => card.pathname)), routes);
      await noOverflow();
      await page.screenshot({ path: path.join(output, `exercises-${width}.png`), fullPage: true });
      await pressLink(catalog.locator('a[href="/picture"]'), '/picture');
      await pressLink(page.getByRole('link', { name: 'К заданиям' }), '/exercises');
      const homeLink = catalog.locator('a.back-link');
      assert.equal(await homeLink.isVisible(), width < 600);
      await pressLink(width < 600 ? homeLink : page.getByRole('banner').getByRole('link', { name: 'Адам — главная' }), '/');
      if (width < 600) {
        await pressLink(page.locator('.mobile-bottom-nav a[href="/exercises"]'), '/exercises');
        assert.equal(await page.locator('.mobile-bottom-nav a[aria-current="page"]').innerText(), 'Задания');
      } else if (width < 1024) {
        await page.locator('.mobile-menu-toggle').click();
        await pressLink(page.locator('.tablet-nav-group a[href="/exercises"]'), '/exercises');
      } else {
        const nav = page.locator('[aria-controls="practice-menu"]');
        await nav.focus();
        await page.keyboard.press('ArrowDown');
        assert(await page.locator('#practice-menu a').first().evaluate(el => document.activeElement === el));
        await page.keyboard.press('Escape');
        await pressLink(nav, '/exercises');
        assert.equal(await nav.getAttribute('aria-current'), 'page');
      }
      assert.deepEqual(errors, []);
      console.log(`${width}px @${dpr}x: ${images[0]}, layout and keyboard navigation passed`);
      await page.goto(base + '/courses');
      await page.locator('.cm-discover h1').waitFor();
      await noOverflow();
      await page.screenshot({ path: path.join(output, `courses-${width}.png`), animations: 'disabled' });
      await page.close();
    }
    const reduced = await browser.newPage({ reducedMotion: 'reduce' });
    await reduced.goto(base);
    await reduced.locator('.home-reading').scrollIntoViewIfNeeded();
    assert.equal(await reduced.locator('.hero-actions').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await reduced.locator('.home-arrived').count(), 0);
    await reduced.goto(base + '/exercises');
    assert.equal(await reduced.locator('.exercises-motif').evaluate(el => getComputedStyle(el).animationName), 'none');
    await reduced.close();
    console.log('Reduced motion passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
