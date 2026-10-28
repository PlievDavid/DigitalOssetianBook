// Actual Razor page and styles, isolated API fixtures; no material or progress writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let attempts = 0;
    await page.route('**/api/v1/grammars**', async route => {
      const url = new URL(route.request().url()).pathname;
      if (url === '/api/v1/grammars') return route.fulfill({ json: [{ id: 'fixture', title: 'Винительный падеж' }] });
      if (url.endsWith('/sessions')) {
        attempts = 0;
        return route.fulfill({ json: {
          sessionId: 'session-1', materialId: 'fixture', version: 1, title: 'Винительный падеж',
          prompt: 'Читам «___».', blank: '«___»',
          options: ['амбар', 'амбаре', 'амбары', 'амбару'],
          answered: false, correct: false, attempts: 0, correctForm: null, showRule: false, rule: '',
          words: [],
          sentence: [{ text: 'Читам', position: 0, matches: [] }],
          dictionary: []
        } });
      }
      if (url.endsWith('/check')) {
        const body = route.request().postDataJSON();
        attempts += 1;
        const correct = body.optionIndex === 0;
        const finished = correct || attempts >= 2;
        return route.fulfill({ json: {
          correct, finished, attempts,
          correctForm: finished ? 'амбар' : null,
          showRule: true, rule: 'винительный падеж',
          words: finished ? [{ id: 'word-1', ossetian: 'амбар', russian: 'сарай' }] : [],
          sentence: finished
            ? [{ text: 'Читам', position: 0, matches: [] }, { text: 'амбар', position: 6, matches: [] }]
            : [{ text: 'Читам', position: 0, matches: [] }],
          dictionary: []
        } });
      }
      throw new Error('Unexpected fixture API: ' + url);
    });
    const start = async () => {
      await page.goto(base + '/grammar');
      await page.getByRole('button', { name: 'Начать →' }).click();
      await page.locator('#grammar-sentence').waitFor();
    };
    fs.mkdirSync(path.join(__dirname, '../.run-local/grammar'), { recursive: true });
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });

      // Path 1: two wrong attempts → finished with correct form in sentence.
      await start();
      assert.equal(await page.locator('#grammar-options .grammar-option').count(), 4);
      assert.equal((await page.locator('#grammar-sentence').innerText()).trim(), 'Читам «___».');
      assert(await page.locator('#grammar-rule').isHidden());
      assert(await page.locator('#grammar-play').isVisible());
      await page.getByRole('button', { name: 'амбару', exact: true }).click();
      await page.locator('#grammar-rule').waitFor();
      assert.match(await page.locator('#grammar-result').innerText(), /Пока неверно/);
      assert(await page.locator('#grammar-result.is-incorrect').isVisible());
      assert(await page.locator('#grammar-rule').isVisible());
      assert.match(await page.locator('#grammar-rule').innerText(), /Подсказка: винительный падеж/);
      assert.equal(await page.locator('#grammar-options .grammar-option.is-correct').count(), 0);
      assert.equal(await page.locator('#grammar-options .grammar-option:disabled').count(), 1);
      assert.equal((await page.locator('#grammar-sentence').innerText()).trim(), 'Читам «___».');

      // Second wrong → finished, form inserted.
      await page.getByRole('button', { name: 'амбары', exact: true }).click();
      await page.locator('#grammar-result .grammar-result-actions').waitFor();
      assert.equal(await page.locator('#grammar-options .grammar-option.is-correct').count(), 1);
      assert.match(await page.locator('#grammar-options .grammar-option.is-correct').innerText(), /амбар/);
      assert.equal(await page.locator('#grammar-options .grammar-option.is-wrong').count(), 2);
      assert.equal(await page.locator('#grammar-options .grammar-option:disabled').count(), 4);
      assert.equal((await page.locator('#grammar-sentence').innerText()).trim(), 'Читам амбар.');
      assert(await page.locator('.grammar-inserted').isVisible());
      assert.equal(await page.locator('#grammar-result .grammar-result-actions button').count(), 2);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

      // Path 2: correct on first try.
      await start();
      await page.getByRole('button', { name: 'амбар', exact: true }).click();
      await page.locator('#grammar-result').waitFor();
      assert.match(await page.locator('#grammar-result').innerText(), /Верно/);
      assert(await page.locator('#grammar-result.is-correct').isVisible());
      assert.equal((await page.locator('#grammar-sentence').innerText()).trim(), 'Читам амбар.');
      assert(await page.locator('.grammar-inserted').isVisible());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

      if (width === 1280) await page.screenshot({ path: path.join(__dirname, '../.run-local/grammar/' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Grammar exercise passed: two attempts, hint after first wrong, insert form, three widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
