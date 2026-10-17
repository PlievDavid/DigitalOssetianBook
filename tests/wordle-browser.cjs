// The real server validates guesses; guest sessions never write learning progress to PostgreSQL.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'IronLanguage.Web/Data/wordle/words.json'), 'utf8'));
const base = process.env.ADAM_TEST_URL || 'http://127.0.0.1:58328';
assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    const ready = async target => { await target.goto(`${base}/games/wordle`); await target.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false'); };
    const idle = () => page.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
    await ready(page);
    assert.deepEqual(await page.locator('.mobile-bottom-nav a span').allTextContents(), ['Задания', 'Слова', 'Книги', 'Профиль']);
    assert.equal(await page.locator('.mobile-bottom-nav .is-current').getAttribute('href'), '/');
    assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').count(), 0);
    assert.equal(await page.locator('.wl-cell').count(), 30);
    assert.equal(await page.locator('#wl-keyboard').evaluate(el => getComputedStyle(el).userSelect), 'none');
    assert(await page.locator('#wl-save').isHidden());
    const initial = await (await page.request.get(`${base}/api/v1/wordle`)).json();
    assert.equal((await page.request.get(`${base}/Data/wordle/words.json`)).status(), 404, 'Answer list is not a public static asset');
    assert.equal(initial.answer, null); assert.equal(initial.russian, null); assert.equal(initial.revision, 0);
    const index = ((Date.parse(initial.day) - Date.parse(data.startDate)) / 86400000 % 300 + 300) % 300;
    const answer = data.answers[index].word;
    const wrong = data.allowed.filter(x => x !== answer);
    const csrf = await page.locator('#api-antiforgery input').inputValue();
    assert.equal((await page.request.post(`${base}/api/v1/wordle/guess`, { data: { day: initial.day, revision: 0, guess: answer } })).status(), 400);
    assert.equal((await page.request.get(`${base}/api/v1/wordle/statistics`)).status(), 401);
    assert.equal((await page.request.post(`${base}/api/v1/wordle/vocabulary`, { headers: { RequestVerificationToken: csrf }, data: { day: initial.day } })).status(), 401);
    assert.equal((await page.request.post(`${base}/api/v1/wordle/guess`, { headers: { RequestVerificationToken: csrf }, data: { day: '2020-01-01', revision: 0, guess: answer } })).status(), 409);
    // Statistics are separate; dialog traps focus, closes with Escape and restores its trigger.
    assert(await page.locator('#wl-stats-content').isHidden());
    await page.locator('#wl-statistics').focus(); await page.keyboard.press('Enter');
    assert(await page.locator('#wl-stats-dialog').isVisible());
    assert.match(await page.locator('#wl-stats-status').innerText(), /Войдите/);
    await page.keyboard.press('Tab'); assert(await page.evaluate(() => document.querySelector('#wl-stats-dialog').contains(document.activeElement)));
    await page.keyboard.press('Escape'); assert(await page.locator('#wl-stats-dialog').isHidden());
    assert(await page.locator('#wl-statistics').evaluate(el => el === document.activeElement));
    // Unknown words don't use a guess; keyboard letters are normalized including Latin æ.
    await page.locator('#wl-input').fill('ааааа'); await page.locator('#wl-input').press('Enter'); await idle();
    assert.match(await page.locator('#wl-status').innerText(), /Нет такого слова/);
    assert.equal((await (await page.request.get(`${base}/api/v1/wordle`)).json()).revision, 0);
    await page.locator('#wl-input').fill(wrong[0]); await page.locator('#wl-input').press('Enter'); await idle();
    assert.equal(await page.locator('.wl-cell.is-absent,.wl-cell.is-correct,.wl-cell.is-present').count(), 5);
    await ready(page); assert.equal((await (await page.request.get(`${base}/api/v1/wordle`)).json()).revision, 1, 'Guest reload resumes bounded server session');
    // A failed request retains the draft, and rapid retries cannot consume two attempts.
    await page.locator('#wl-input').fill(answer.toUpperCase().replaceAll('Ӕ', 'Æ'));
    await page.route('**/wordle/guess', route => route.abort(), { times: 1 });
    await page.locator('#wl-input').press('Enter'); await idle();
    assert.equal(await page.locator('#wl-input').inputValue(), answer);
    let requests = 0; page.on('request', request => { if (request.url().endsWith('/wordle/guess')) requests++; });
    await page.getByRole('button', { name: 'Ввод', exact: true }).evaluate(el => { el.click(); el.click(); }); await idle();
    assert.equal(requests, 1); assert(await page.locator('#wl-result').isVisible());
    assert.equal(await page.locator('.wl-cell.is-correct').count() >= 5, true);
    assert.match(await page.locator('#wl-result-title').innerText(), /^Верно!$/);
    assert(await page.locator('#wl-input').isHidden());
    const complete = await (await page.request.get(`${base}/api/v1/wordle`)).json();
    assert.equal(complete.revision, 2); assert.equal(complete.won, true); assert.equal(complete.countedInStreak, false);
    // Capture this page's clipboard request without replacing the user's system clipboard.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => { window.sharedResult = text; } }
    }));
    await page.locator('#wl-share').click();
    const shared = await page.evaluate(() => window.sharedResult);
    assert(shared.startsWith(`Адам · Пять букв ${complete.day} 2/6\n`));
    assert(shared.endsWith(`\n\n${new URL('/games/wordle', base).href}`), 'Share includes the current platform link without query parameters.');
    for (const row of shared.split('\n').slice(1, 3)) assert.equal(Array.from(row).length, 5, 'Share keeps the five-cell result grid.');
    for (const letter of new Set(answer)) assert(await page.locator(`[data-letter="${letter}"]`).evaluate(el => el.classList.contains('is-correct')), 'Keyboard never downgrades a correct letter');
    await page.setViewportSize({ width: 1280, height: 1000 });
    const output = path.join(root, '.run-local/wordle'); fs.mkdirSync(output, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(output, 'desktop-win.png'), fullPage: true });
    // A separate visitor gets a fresh isolated game and can exhaust exactly six guesses.
    const separate = await browser.newContext(); const lost = await separate.newPage(); lost.on('pageerror', error => errors.push(error.message));
    await ready(lost);
    assert.equal((await (await lost.request.get(`${base}/api/v1/wordle`)).json()).revision, 0);
    for (const word of wrong.slice(0, 6)) {
      await lost.locator('#wl-input').fill(word); await lost.locator('#wl-input').press('Enter');
      await lost.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
    }
    assert.match(await lost.locator('#wl-result-title').innerText(), /не получилось/);
    assert.match(await lost.locator('#wl-answer').innerText(), new RegExp(answer.toUpperCase()));
    assert.equal((await (await lost.request.get(`${base}/api/v1/wordle`)).json()).revision, 6);
    await separate.close();
    // All breakpoints and 200% text retain a centered board and reachable keyboard.
    for (const width of [320, 360, 500, 600, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      if (width < 600) assert.equal(await page.locator('.mobile-games-nav').count(), 0, 'No separate mobile games navigation');
      for (const scale of [1, 2]) {
        await page.locator('.wl-key').evaluateAll((keys, scale) => keys.forEach(key => key.style.fontSize = `${(key.classList.contains('is-wide') ? 10 : 13) * scale}px`), scale);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${width}/${scale}`);
        assert((await page.locator('.wl-shell').boundingBox()).width <= 720);
      }
    }
    const touch = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
    const mobile = await touch.newPage(); mobile.on('pageerror', error => errors.push(error.message)); await ready(mobile);
    await mobile.locator('[data-letter="ӕ"]').tap();
    assert.equal(await mobile.locator('#wl-input').inputValue(), 'ӕ');
    await mobile.getByRole('button', { name: 'Удалить букву' }).tap();
    assert.equal(await mobile.locator('#wl-input').inputValue(), '');
    for (const letter of answer) await mobile.locator(`[data-letter="${letter}"]`).tap();
    await mobile.getByRole('button', { name: 'Ввод', exact: true }).tap();
    await mobile.locator('#wl-result').waitFor({ state: 'visible' });
    await mobile.evaluate(() => scrollTo(0, 0)); await mobile.screenshot({ path: path.join(output, 'mobile-win.png'), fullPage: true });
    await touch.close();
    // Phone game, messages and completed result all fit above the bottom navigation without page scrolling.
    const compactContext = await browser.newContext({ isMobile: true, hasTouch: true });
    const compact = await compactContext.newPage(); compact.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[320, 568], [360, 640], [390, 668], [500, 668], [390, 844], [430, 932]]) {
      await compactContext.clearCookies(); await compact.setViewportSize({ width, height }); await ready(compact);
      const fits = async label => assert(await compact.evaluate(() => {
        const board = document.querySelector('#wl-board').getBoundingClientRect();
        const keys = document.querySelector('#wl-keyboard').getBoundingClientRect();
        const nav = document.querySelector('.mobile-bottom-nav').getBoundingClientRect();
        return document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth && board.top >= 0 && keys.bottom < nav.top && keys.top >= board.bottom;
      }), `One screen ${width}×${height}: ${label}`);
      await fits('active');
      assert.equal(await compact.locator('#wl-input').getAttribute('inputmode'), 'none', 'Custom keyboard avoids opening a second phone keyboard');
      await compact.locator('#wl-input').fill('ааааа'); await compact.locator('#wl-input').press('Enter');
      await compact.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
      await fits('error');
      await compact.locator('#wl-input').fill(answer); await compact.locator('#wl-input').press('Enter');
      await compact.locator('#wl-result').waitFor({ state: 'visible' }); await fits('won');
    }
    await compactContext.close();
    assert.deepEqual(errors, []);
    console.log('Wordle browser passed: real guesses, hidden answers, six attempts, guests, reload, retry, request lock, best keyboard marks, separate statistics, Escape/focus, touch/ӕ, 8 widths, enlarged text, CSRF and one-screen phone layouts from 320×568 to 430×932.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
