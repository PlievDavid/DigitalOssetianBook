const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const output = path.resolve(__dirname, '../.run-local/pr51-review');
    fs.mkdirSync(output, { recursive: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let finished = false, saved = 0, rejectSave = true;
    const state = () => ({ day: '2026-10-17', nextDay: '2026-10-18T00:00:00Z', revision: finished ? 1 : 0, rows: finished ? [{ word: 'хӕдон', marks: Array(5).fill('correct') }] : [], won: finished, finished, answer: finished ? 'хӕдон' : null, russian: finished ? 'рубашка' : null, countedInStreak: finished });
    await page.route('**/games/wordle', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('data-authenticated="false"', 'data-authenticated="true"') });
    });
    await page.route('**/api/v1/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/wordle/vocabulary') {
        saved++;
        assert.deepEqual(route.request().postDataJSON(), { day: '2026-10-17' });
        assert(route.request().headers().requestverificationtoken);
        await new Promise(resolve => setTimeout(resolve, 100));
        return route.fulfill(rejectSave ? { status: 503, json: { error: 'Попробуйте позже.' } } : { status: 200, body: '' });
      }
      if (pathname === '/api/v1/wordle/guess') finished = true;
      return route.fulfill({ json: pathname.startsWith('/api/v1/wordle') ? state() : {} });
    });
    for (const [width, height] of [[320, 568], [360, 800], [1024, 600], [1242, 668], [1280, 800]]) {
      finished = false; saved = 0; rejectSave = true;
      await page.setViewportSize({ width, height });
      await page.goto(base + '/games/wordle');
      await page.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
      await page.evaluate(() => document.fonts.ready);
      const geometry = () => page.locator('#wl-board, #wl-keyboard').evaluateAll(elements => elements.map(element => {
        const bounds = element.getBoundingClientRect();
        return [bounds.x + scrollX, bounds.y + scrollY, bounds.width, bounds.height];
      }));
      const before = await geometry();
      assert(await page.locator('#wl-save').isHidden());
      await page.locator('#wl-input').fill('хӕдон');
      await page.locator('#wl-input').press('Enter');
      const save = page.locator('#wl-save');
      await save.waitFor({ state: 'visible' });
      await save.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#wl-save-status').textContent === 'Попробуйте позже.');
      assert(await save.isEnabled());
      rejectSave = false;
      await save.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#wl-save').textContent === 'В словаре');
      assert(await save.isDisabled());
      assert.equal(saved, 2);
      assert.match(await page.locator('#wl-save-status').innerText(), /добавлено/);
      assert.deepEqual(await geometry(), before, 'Saving or retrying in the permanent result never moves the board or keyboard');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.evaluate(() => document.fonts.check('16px "Golos Text"', 'Ӕӕ')));
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      await page.screenshot({ path: path.join(output, `wordle-saved-${width}.png`), fullPage: true });
      if (width < 600) assert(await page.evaluate(() => document.querySelector('#wl-keyboard').getBoundingClientRect().bottom < document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top), 'Result actions leave the keyboard above navigation');
      else assert(await page.locator('#wl-result').evaluate(element => element.getBoundingClientRect().bottom <= element.closest('.wl-game').getBoundingClientRect().bottom), 'Saved result remains inside the game');
    }
    assert.deepEqual(errors, []);
    console.log('Wordle vocabulary UI passed: reveal only, keyboard, CSRF header, failure/retry, duplicate lock, mobile/desktop and Ossetian letters. API responses are isolated fixtures.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
