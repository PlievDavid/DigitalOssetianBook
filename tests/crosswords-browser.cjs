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
    const cell = (w, i = 0) => page.locator(`.cw-cell-input[data-key="${w.row + (w.down ? i : 0)},${w.column + (w.down ? 0 : i)}"]`);
    async function assertRating(n, selector = '#cw-progress .cw-stars') {
      const rating = page.locator(selector);
      assert.equal(await rating.locator('svg').count(), 3);
      assert.equal(await rating.locator('.is-earned').count(), n);
      assert.equal(await rating.getAttribute('aria-label'), `${n} из 3 звёзд`);
    }
    async function pasteWord(word, text = word.answer) {
      await page.locator(`.cw-clue[data-id="${word.id}"]`).click();
      await cell(word).evaluate((input, text) => {
        const data = new DataTransfer(); data.setData('text', text);
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      }, text);
    }
    await ready();
    assert.equal(await page.locator('.nav-menu-words .is-current').count(), 0, 'Games do not activate Words');
    assert.equal(await page.locator('.mobile-bottom-nav .is-current').getAttribute('href'), '/');
    assert.equal(await page.locator('.mobile-bottom-nav [aria-current="page"]').count(), 0);
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
    const inputStyle = await page.locator('.cw-cell-input').first().evaluate(el => ({ caret: getComputedStyle(el).caretColor, selection: getComputedStyle(el, '::selection').backgroundColor }));
    assert.equal(inputStyle.caret, 'rgba(0, 0, 0, 0)');
    assert.equal(inputStyle.selection, 'rgba(0, 0, 0, 0)');
    assert.match(await page.locator('#cw-title').innerText(), /10\./);
    await page.locator('#cw-back').click();
    await page.locator('.cw-card').first().focus(); await page.keyboard.press('Enter');
    await page.locator('#cw-play').waitFor({ state: 'visible' });
    const words = levels[0].words;
    await page.locator('.cw-cell-input').first().focus();
    await page.keyboard.press('ArrowRight');
    assert(await page.locator('.cw-cell-input:focus').count(), 'Arrow keys navigate the grid');
    // Select a clue from the keyboard, enter a wrong answer, check, and retry.
    await page.locator(`.cw-clue[data-id="${words[0].id}"]`).focus(); await page.keyboard.press('Enter');
    assert.equal(await cell(words[0]).evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator('#cw-entry').count(), 0, 'No separate entry form');
    await page.keyboard.type('а'.repeat(words[0].answer.length));
    await page.locator('#cw-check').click();
    await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
    await assertRating(0);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      await pasteWord(word, word.answer.toUpperCase().replaceAll('Ӕ', 'Æ'));
      if (i === 0 || i === 1) {
        await page.locator('#cw-check').click();
        await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
        await assertRating(i === 0 ? 1 : 2);
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
    assert.equal(checks, 1); await assertRating(3);
    assert(await page.locator('#cw-check').isDisabled());
    await page.locator('#cw-back').click(); await assertRating(3, '.cw-card:first-child .cw-stars');
    await page.locator('.cw-card').first().click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
    await assertRating(3);
    await ready(); await assertRating(0, '.cw-card:first-child .cw-stars');
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
    assert.equal(await cell(brother).inputValue(), 'Ӕ');
    assert(await cell(brother, 1).evaluate(el => el === document.activeElement), 'ӕ advances cursor');
    await page.keyboard.press('Backspace');
    assert.equal(await cell(brother).inputValue(), '', 'Backspace moves back from empty cell');
    await page.keyboard.insertText('ӕ');
    await page.keyboard.insertText('ф');
    assert.equal(await cell(brother, 1).inputValue(), 'Ф');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    assert.equal(await cell(brother, 1).inputValue(), '', 'Delete clears current cell');
    await pasteWord(brother);
    const crossing = words.find(w => w.id !== brother.id && w.column >= brother.column && w.column < brother.column + brother.answer.length && w.down);
    const crossingCell = cell(brother, crossing.column - brother.column);
    await crossingCell.click();
    await crossingCell.click();
    assert.match(await page.locator('#cw-answer-label').innerText(), /по вертикали/, 'Click intersection switches direction');
    await page.locator('#cw-check').click();
    await page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
    assert(await cell(brother).evaluate(el => el.readOnly), 'Verified letters are protected');
    await pasteWord(brother, 'а'.repeat(brother.answer.length));
    assert.equal(await cell(brother).inputValue(), 'Ӕ', 'Paste cannot overwrite verified intersections');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'puzzle-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'puzzle-desktop.png'), fullPage: true });
    const touchContext = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
    const touchPage = await touchContext.newPage();
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.goto(`${url}/games/crosswords`);
    await touchPage.locator('.cw-card').first().tap();
    await touchPage.locator(`.cw-clue[data-id="${brother.id}"]`).tap();
    const touchCell = i => touchPage.locator(`.cw-cell-input[data-key="${brother.row},${brother.column + i}"]`);
    await touchCell(0).tap();
    await touchPage.keyboard.insertText('ӕ');
    assert.equal(await touchCell(0).inputValue(), 'Ӕ');
    assert(await touchCell(1).evaluate(el => el === document.activeElement), 'Touch entry advances to the next native input');
    await touchCell(1).evaluate(el => el.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })));
    assert.equal(await touchCell(0).inputValue(), '', 'Mobile Backspace moves back from an empty cell');
    await touchPage.keyboard.insertText('ӕф');
    assert.equal(await touchCell(1).inputValue(), 'Ф', 'Mobile multi-character input fills consecutive cells');
    await touchPage.locator('#cw-back').tap();
    await touchPage.locator('.cw-card').first().tap();
    assert.equal(await touchCell(0).inputValue(), 'Ӕ', 'Inline draft survives level navigation');
    await touchContext.close();
    assert.deepEqual(errors, []);
    console.log('Crossword browser checks passed: all 10 levels, 7 widths, doubled text, inline typing, touch input, paste, Backspace/Delete, intersections, protected letters, ӕ, stars, retry, guest reset, hidden answers, version/level validation and CSRF.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
