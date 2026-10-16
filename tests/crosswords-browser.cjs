// Real application and server checks. Requires the local site; no guest progress is stored in the DB.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const levels = JSON.parse(fs.readFileSync(path.join(root, 'IronLanguage.Web/Data/crosswords/levels.json'), 'utf8'));
const url = process.env.ADAM_TEST_URL || 'http://127.0.0.1:58326';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const output = path.join(root, '.run-local/crosswords'); fs.mkdirSync(output, { recursive: true });
    async function ready() { await page.goto(`${url}/games/crosswords`); await page.waitForFunction(() => document.querySelectorAll('.cw-card').length === 10); }
    await ready();
    assert.equal(await page.locator('.nav-menu-words .is-current').count(), 0, 'Games do not activate Words');
    assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').getAttribute('href'), '/games/crosswords');
    const csrf = await page.locator('#api-antiforgery input').inputValue();
    let response = await page.request.post(`${url}/api/v1/crosswords/1/1/check`, { data: { cells: {} } });
    assert.equal(response.status(), 400, 'CSRF is required for guests');
    response = await page.request.get(`${url}/api/v1/crosswords/1/1`);
    const opened = await response.json(); assert(opened.words.every(w => w.answer === null), 'Unsolved answers are hidden');
    response = await page.request.post(`${url}/api/v1/crosswords/999/1/check`, { headers: { RequestVerificationToken: csrf }, data: { cells: {} } });
    assert.equal(response.status(), 404);
    response = await page.request.post(`${url}/api/v1/crosswords/1/999/check`, { headers: { RequestVerificationToken: csrf }, data: { cells: {} } });
    assert.equal(response.status(), 404);
    response = await page.request.post(`${url}/api/v1/crosswords/1/1/check`, { headers: { RequestVerificationToken: csrf }, data: { cells: null } });
    assert.equal(response.status(), 400);
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: path.join(output, 'catalog-desktop.png'), fullPage: true });
    // Any level is available, including the last one.
    await page.locator('.cw-card').last().click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
    assert.match(await page.locator('#cw-title').innerText(), /10\./);
    await page.locator('#cw-back').click();
    await page.locator('.cw-card').first().focus(); await page.keyboard.press('Enter');
    await page.locator('#cw-play').waitFor({ state: 'visible' });
    const words = levels[0].words;
    await page.locator('.cw-cell').first().focus();
    await page.keyboard.press('ArrowRight');
    assert(await page.locator('.cw-cell:focus').count(), 'Arrow keys navigate the grid');
    // Select a clue from the keyboard, enter a wrong answer, check, and retry.
    await page.locator(`.cw-clue[data-id="${words[0].id}"]`).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#cw-answer').evaluate(el => el === document.activeElement), true);
    await page.locator('#cw-answer').fill('а'.repeat(words[0].answer.length));
    await page.locator('#cw-entry button[type="submit"]').click();
    await page.locator('#cw-check').click();
    await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#cw-progress').innerText(), /☆☆☆/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      await page.locator(`.cw-clue[data-id="${word.id}"]`).click();
      await page.locator('#cw-answer').fill(word.answer.toUpperCase().replaceAll('Ӕ', 'Æ'));
      await page.locator('#cw-entry button[type="submit"]').click();
      if (i === 0 || i === 1) {
        await page.locator('#cw-check').click();
        await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
        assert.match(await page.locator('#cw-progress').innerText(), i === 0 ? /★☆☆/ : /★★☆/);
      }
    }
    // Network failure leaves the board intact; rapid clicks send only one request.
    await page.route('**/crosswords/1/1/check', route => route.abort(), { times: 1 });
    await page.locator('#cw-check').click();
    await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#cw-status').innerText(), /повторить/);
    let checks = 0; page.on('request', request => { if (request.url().endsWith('/1/1/check')) checks++; });
    await page.locator('#cw-check').evaluate(el => { el.click(); el.click(); });
    await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
    assert.equal(checks, 1); assert.match(await page.locator('#cw-progress').innerText(), /★★★/);
    assert(await page.locator('#cw-check').isDisabled());
    await page.locator('#cw-back').click(); assert.match(await page.locator('.cw-card').first().innerText(), /★★★/);
    await page.locator('.cw-card').first().click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
    assert.match(await page.locator('#cw-progress').innerText(), /★★★/);
    await ready(); assert.match(await page.locator('.cw-card').first().innerText(), /☆☆☆/, 'Guest reload resets progress');
    // All grids across breakpoints and doubled text, including осетинская ӕ.
    for (const width of [320, 360, 600, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const textScale of [1, 2]) {
        await page.addStyleTag({ content: `#crosswords-app { font-size:${16 * textScale}px; } #crosswords-app .cw-clue { font-size:${15 * textScale}px; }` });
        for (let i = 0; i < 10; i++) {
          await page.locator('.cw-card').nth(i).click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow ${width}/${textScale}/${i}`);
          assert.equal(await page.locator('.cw-clue').count(), levels[i].words.length);
          await page.locator('#cw-back').click();
        }
      }
    }
    await page.setViewportSize({ width: 360, height: 1000 });
    await ready(); await page.locator('.cw-card').first().click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
    const brother = words.find(w => w.clue === 'Брат');
    await page.locator(`.cw-clue[data-id="${brother.id}"]`).click(); await page.locator('#cw-letter').click();
    assert.equal(await page.locator('#cw-answer').inputValue(), 'ӕ');
    await page.locator('#cw-answer').fill(brother.answer); await page.locator('#cw-entry button[type="submit"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'puzzle-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'puzzle-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Crossword browser checks passed: all 10 levels, 7 widths, doubled text, keyboard, ӕ, stars, retry, guest reset, hidden answers, version/level validation and CSRF.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
