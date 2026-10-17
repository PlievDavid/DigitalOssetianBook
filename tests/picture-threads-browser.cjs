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
    let mode = 'choice';
    // Фикстура отдаёт /media/pictures/1.png — подменяем картинку, чтобы #picture-image загрузился.
    await page.route('**/media/pictures/**', route => route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
    }));
    await page.route('**/api/v1/pictures**', async route => {
      const url = new URL(route.request().url()).pathname;
      if (url === '/api/v1/pictures') return route.fulfill({ json: [{ id: 'fixture', title: 'Проверка картинки' }] });
      if (url.endsWith('/sessions')) {
        if (mode === 'choice') {
          return route.fulfill({ json: {
            sessionId: 'session-1', materialId: 'fixture', version: 1, title: 'Проверка картинки',
            picturePath: '/media/pictures/1.png', mode: 'choice',
            options: ['Амбар', 'Уырды', 'Ныхас'], answered: false, correct: false, correctWord: null, words: []
          } });
        }
        return route.fulfill({ json: {
          sessionId: 'session-2', materialId: 'fixture', version: 1, title: 'Проверка картинки',
          picturePath: '/media/pictures/1.png', mode: 'free',
          options: [], answered: false, correct: false, correctWord: null, words: []
        } });
      }
      if (url.endsWith('/check')) {
        const body = route.request().postDataJSON();
        if (mode === 'choice') {
          const correct = body.optionIndex === 0;
          return route.fulfill({ json: { correct, correctWord: 'Амбар', finished: true, options: null, words: [] } });
        }
        const correct = String(body.answer || '').trim().toLowerCase() === 'амбар';
        return route.fulfill({ json: { correct, correctWord: 'Амбар', finished: true, options: null, words: [] } });
      }
      throw new Error('Unexpected fixture API: ' + url);
    });
    const start = async () => { await page.goto(base + '/picture'); await page.getByRole('button', { name: 'Начать →' }).click(); await page.locator('#picture-image').waitFor(); };
    fs.mkdirSync(path.join(__dirname, '../.run-local/picture'), { recursive: true });
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      mode = 'choice'; await start();
      assert.equal(await page.locator('#picture-options .picture-option').count(), 3);
      assert(await page.locator('#picture-free-form').isHidden());
      assert.equal(await page.locator('#picture-image').getAttribute('src'), '/media/pictures/1.png');
      assert(await page.locator('#picture-play').isVisible());
      await page.getByRole('button', { name: 'Уырды', exact: true }).click();
      await page.locator('#picture-result').waitFor();
      assert.match(await page.locator('#picture-result').innerText(), /Пока неверно.*Амбар/);
      assert(await page.locator('#picture-result.is-incorrect').isVisible());
      assert(await page.locator('#picture-options .picture-option.is-correct').count() === 1);
      assert.match(await page.locator('#picture-options .picture-option.is-correct').innerText(), /Амбар/);
      assert(await page.locator('#picture-options .picture-option.is-wrong').count() === 1);
      assert.match(await page.locator('#picture-options .picture-option.is-wrong').innerText(), /Уырды/);
      assert.equal(await page.locator('#picture-result .picture-result-actions button').count(), 2);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      mode = 'free'; await start();
      assert(await page.locator('#picture-options').isHidden());
      assert(await page.locator('#picture-free-form').isVisible());
      await page.locator('#picture-answer').fill('амбар');
      await page.locator('#picture-submit').click();
      await page.locator('#picture-result').waitFor();
      assert.match(await page.locator('#picture-result').innerText(), /Верно/);
      assert(await page.locator('#picture-result.is-correct').isVisible());
      assert.equal((await page.locator('#picture-answer-word').innerText()).trim(), 'Амбар');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 1280) await page.screenshot({ path: path.join(__dirname, '../.run-local/picture/' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Picture exercise passed: choice and free modes, wrong answer, correct free input, three widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
