// Read-only geometry checks; API responses are empty fixtures, no progress is written.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let checks = 0;
  try {
    const page = await browser.newPage();
    await page.route('**/api/v1/**', route => route.fulfill({ json: route.request().url().endsWith('/catalog') ? { exercises: [], books: [], words: [] } : [] }));
    const bounds = selector => page.locator(selector).evaluate(el => {
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      return [r.left + parseFloat(css.paddingLeft), r.right - parseFloat(css.paddingRight)];
    });
    for (const width of [360, 599, 600, 700, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(base);
      const expected = await bounds('.home-content');
      for (const route of ['/', '/audio-puzzles', '/translate', '/dialogs', '/matching', '/vocabulary', '/word-practice', '/game', '/books', '/account/login', '/account/register', '/account/access-denied', '/home/privacy', '/home/illustrations']) {
        await page.goto(base + route, { waitUntil: 'networkidle' });
        assert.deepEqual(await bounds('#main-content'), expected, `${route} main at ${width}`); checks++;
        assert.deepEqual(await bounds('.header-inner'), expected, `${route} header at ${width}`); checks++;
        const selector = route === '/' ? '.home-content' : route === '/books' ? '.books-catalog' : route.startsWith('/account/') && route !== '/account/access-denied' ? '.auth-scene' : '#main-content > .feature-shell';
        assert.deepEqual(await bounds(selector), expected, `${route} shell at ${width}`); checks++;
        if (route === '/account/login' || route === '/account/register') {
          const card = await page.locator('.auth-shell').boundingBox();
          assert(Math.abs(card.width - Math.min(480, expected[1] - expected[0])) < 1, `${route} compact card at ${width}`); checks++;
          assert(Math.abs(card.x + card.width / 2 - (expected[0] + expected[1]) / 2) < 1, `${route} centered card at ${width}`); checks++;
        }
        const playSelector = { '/audio-puzzles': '#exercise-play', '/translate': '#exercise-play', '/dialogs': '#dialog-play', '/matching': '#matching-play', '/game': '.game-play-area' }[route];
        if (playSelector) {
          const play = page.locator(playSelector);
          const wasHidden = await play.evaluate(el => { const hidden = el.hidden; el.hidden = false; return hidden; });
          const box = await play.boundingBox();
          assert(Math.abs(box.width - Math.min(760, expected[1] - expected[0])) < 1, route + ' lesson width at ' + width); checks++;
          assert(Math.abs(box.x + box.width / 2 - (expected[0] + expected[1]) / 2) < 1, route + ' lesson center at ' + width); checks++;
          await play.evaluate((el, hidden) => { el.hidden = hidden; }, wasHidden);
        }
        if (route === '/books') {
          // Inspect all three book shells, including states normally opened via API data.
          for (const id of ['book-detail', 'book-reader']) {
            await page.locator('#' + id).evaluate(el => { el.hidden = false; });
            assert.deepEqual(await bounds('#' + id), expected, `${id} at ${width}`); checks++;
            await page.locator('#' + id).evaluate(el => { el.hidden = true; });
          }
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}`); checks++;
        const before = await bounds('#main-content');
        await page.evaluate(() => { const el = document.createElement('div'); el.style.height = '2000px'; el.id = 'container-probe'; document.querySelector('main').append(el); });
        assert.deepEqual(await bounds('#main-content'), before, `${route} scrollbar shift at ${width}`); checks++;
        await page.locator('#container-probe').evaluate(el => el.remove());
      }
      // Protected shells use real styles with structural fixtures, without creating an account.
      await page.goto(base);
      for (const shell of ['<section class="feature-shell editor-form-shell"></section>', '<section class="feature-shell editor-preview-shell"></section>', '<section class="feature-shell avatar-shell"></section>', '<div class="account-layout"><nav class="account-navigation"></nav><section class="feature-shell profile-shell"></section></div>']) {
        await page.evaluate(html => { document.body.classList.add('editor-page'); document.querySelector('main').innerHTML = html; }, shell);
        assert.deepEqual(await bounds('#main-content > :first-child'), expected, `Protected shell fixture at ${width}`); checks++;
      }
    }
    await page.goto(base + '/dialogs');
    await page.keyboard.press('Tab');
    assert(await page.locator('.skip-link').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Enter');
    assert(await page.locator('main').evaluate(el => el === document.activeElement));
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.fonts.check('16px "Golos Text"', 'Ӕӕ')));
    console.log(`${checks} app container checks passed at eight widths; keyboard and Ossetian font passed. Protected pages checked with structural fixtures.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
