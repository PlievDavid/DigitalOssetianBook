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
    await page.route('**/api/v1/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      const json = pathname.endsWith('/wordle') ? { day: '2026-10-17', nextDay: '2026-10-18T00:00:00Z', revision: 0, rows: [], won: false, finished: false, answer: null, russian: null, countedInStreak: false }
        : pathname.endsWith('/catalog') ? { exercises: [], books: [], words: [] } : [];
      return route.fulfill({ json });
    });
    const bounds = selector => page.locator(selector).evaluate(el => {
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      return [r.left + parseFloat(css.paddingLeft), r.right - parseFloat(css.paddingRight)];
    });
    for (const width of [360, 599, 600, 700, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(base);
      const commonBounds = await bounds('.home-content');
      for (const route of ['/', '/audio-puzzles', '/translate', '/dialogs', '/matching', '/vocabulary', '/word-practice', '/game', '/games', '/games/crosswords', '/games/wordle', '/reading', '/account/login', '/account/register', '/account/access-denied', '/home/privacy', '/home/illustrations']) {
        await page.goto(base + route);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const expected = route === '/games/wordle' && width < 600 ? [commonBounds[0], width - commonBounds[0]] : commonBounds;
        assert.deepEqual(await bounds('#main-content'), expected, `${route} main at ${width}`); checks++;
        if (width >= 600) { assert.deepEqual(await bounds('.header-inner'), expected, `${route} header at ${width}`); checks++; }
        const selector = route === '/' ? '.home-content' : route.startsWith('/account/') && route !== '/account/access-denied' ? '.auth-scene' : '#main-content > .feature-shell';
        assert.deepEqual(await bounds(selector), expected, `${route} shell at ${width}`); checks++;
        if (route === '/account/login' || route === '/account/register') {
          const card = await page.locator('.auth-shell').boundingBox();
          assert(Math.abs(card.width - Math.min(width < 600 ? 440 : 480, expected[1] - expected[0])) < 1, `${route} compact card at ${width}`); checks++;
          assert(Math.abs(card.x + card.width / 2 - (expected[0] + expected[1]) / 2) < 1, `${route} centered card at ${width}`); checks++;
        }
        const playSelector = { '/audio-puzzles': '#exercise-play', '/translate': '#exercise-play', '/dialogs': '#dialog-play', '/matching': '#matching-play', '/game': '.game-play-area', '/games/crosswords': '#cw-play', '/games/wordle': '.wl-shell' }[route];
        if (playSelector) {
          const play = page.locator(playSelector);
          const wasHidden = await play.evaluate(el => { const hidden = el.hidden; el.hidden = false; return hidden; });
          const box = await play.boundingBox();
          const maxWidth = route === '/games/crosswords' ? Infinity : route === '/games/wordle' ? 840 : 760;
          assert(Math.abs(box.width - Math.min(maxWidth, expected[1] - expected[0])) < 1, route + ' lesson width at ' + width); checks++;
          assert(Math.abs(box.x + box.width / 2 - (expected[0] + expected[1]) / 2) < 1, route + ' lesson center at ' + width); checks++;
          await play.evaluate((el, hidden) => { el.hidden = hidden; }, wasHidden);
        }
        if (route === '/reading') {
          assert.deepEqual(await bounds('#reading-library'), expected, `Reading library at ${width}`); checks++;
          const story = page.locator('#reading-story');
          await story.evaluate(el => { el.hidden = false; });
          const [left, right] = await bounds('#reading-story');
          assert(Math.abs(right - left - Math.min(980, expected[1] - expected[0])) < 1, `Reading width at ${width}`); checks++;
          assert(Math.abs((left + right) / 2 - (expected[0] + expected[1]) / 2) < 1, `Reading center at ${width}`); checks++;
          await story.evaluate(el => { el.hidden = true; });
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}`); checks++;
        const before = await bounds('#main-content');
        await page.evaluate(() => { const el = document.createElement('div'); el.style.height = '2000px'; el.id = 'container-probe'; document.querySelector('main').append(el); });
        assert.deepEqual(await bounds('#main-content'), before, `${route} scrollbar shift at ${width}`); checks++;
        await page.locator('#container-probe').evaluate(el => el.remove());
      }
      // Protected shells use real styles with structural fixtures, without creating an account.
      await page.goto(base);
      await page.addStyleTag({ url: base + '/css/profile-public-name.css' });
      for (const shell of [
        '<section class="feature-shell editor-form-shell"></section>',
        '<section class="feature-shell editor-preview-shell"></section>',
        '<section class="feature-shell avatar-shell"></section>',
        '<div class="account-layout profile-page"><nav class="account-navigation"><a href="/profile">Учётная запись</a></nav><section class="profile-content"><h1>Профиль</h1><div class="profile-summary"><span class="profile-portrait"></span><div class="profile-person"><p class="profile-person-name">ОченьДлинноеИмяПользователяБезПробеловДляПроверкиПереноса</p></div></div></section></div>'
      ]) {
        await page.evaluate(html => { document.body.classList.add('editor-page'); document.querySelector('main').innerHTML = html; }, shell);
        assert.deepEqual(await bounds('#main-content > :first-child'), commonBounds, `Protected shell fixture at ${width}`); checks++;
      }
      const profileBounds = await bounds('.profile-content');
      assert(profileBounds[0] >= commonBounds[0] && profileBounds[1] === commonBounds[1], `Profile content at ${width}`); checks++;
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Profile overflow at ${width}`); checks++;
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
