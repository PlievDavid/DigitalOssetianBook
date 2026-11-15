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
    let loseNext = false;
    let holdNext = false;
    let heldCheck = null;
    let sessionSeq = 0;
    let reusedSubmission = false;
    const submissions = new Map();
    await page.route('**/api/v1/grammars**', async route => {
      const url = new URL(route.request().url()).pathname;
      if (url === '/api/v1/grammars') return route.fulfill({ json: [{ id: 'fixture', title: 'Винительный падеж' }] });
      if (url.endsWith('/sessions')) {
        attempts = 0;
        submissions.clear();
        sessionSeq += 1;
        return route.fulfill({ json: {
          sessionId: 'session-' + sessionSeq, materialId: 'fixture', version: 1, title: 'Винительный падеж',
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
        const key = body.submissionId || 'anon-' + attempts;
        if (submissions.has(key)) reusedSubmission = true;
        if (!submissions.has(key)) {
          attempts += 1;
          const correct = body.optionIndex === 0;
          const finished = correct || attempts >= 2;
          submissions.set(key, {
            correct, finished, attempts,
            correctForm: finished ? 'амбар' : null,
            showRule: true, rule: 'винительный падеж',
            words: finished ? [{ id: 'word-1', ossetian: 'амбар', russian: 'сарай' }] : [],
            sentence: finished
              ? [{ text: 'Читам', position: 0, matches: [] }, { text: 'амбар', position: 6, matches: [] }]
              : [{ text: 'Читам', position: 0, matches: [] }],
            dictionary: []
          });
          // Сервер принял ответ, но клиент потеряет его: повтор должен вернуть прежний результат.
          if (loseNext) { loseNext = false; return route.abort('failed'); }
        }
        const json = submissions.get(key);
        // Ответ удерживается и отдаётся позже — как запоздалый ответ прошлого занятия.
        if (holdNext) { holdNext = false; heldCheck = { route, json }; return; }
        return route.fulfill({ json });
      }
      throw new Error('Unexpected fixture API: ' + url);
    });
    const start = async () => {
      await page.goto(base + '/grammar');
      await page.getByRole('button', { name: 'Начать →' }).click();
      await page.locator('#grammar-sentence').waitFor();
    };
    // Ждёт, пока фикстура удержит запрос /check (ответ отдаётся позже).
    const waitForHeld = async () => {
      const deadline = Date.now() + 5000;
      while (!heldCheck) {
        if (Date.now() > deadline) throw new Error('удерживаемый запрос /check не пришёл');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
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

      // Path 3: lost response — retrying the same choice must not burn the second attempt.
      await start();
      loseNext = true;
      await page.getByRole('button', { name: 'амбару', exact: true }).click();
      await page.locator('#grammar-result').waitFor();
      assert(await page.locator('#grammar-result.is-incorrect').isVisible());
      assert.equal(await page.locator('#grammar-options .grammar-option:disabled').count(), 0);
      await page.getByRole('button', { name: 'амбару', exact: true }).click();
      await page.locator('#grammar-rule').waitFor();
      assert.match(await page.locator('#grammar-result').innerText(), /Пока неверно/);
      assert(await page.locator('#grammar-rule').isVisible());
      assert.equal(await page.locator('#grammar-options .grammar-option.is-correct').count(), 0);
      assert.equal(await page.locator('#grammar-options .grammar-option:disabled').count(), 1);
      assert.equal(await page.locator('#grammar-result .grammar-result-actions').count(), 0);
      assert.equal((await page.locator('#grammar-sentence').innerText()).trim(), 'Читам «___».');
      assert(reusedSubmission);

      // Path 4: поздний ответ прошлого занятия не сбрасывает submissionId текущей отправки.
      reusedSubmission = false;
      await start();
      holdNext = true;
      await page.getByRole('button', { name: 'амбару', exact: true }).click();
      await waitForHeld();
      // Возврат к списку и новое занятие — без перезагрузки страницы, чтобы запрос остался висеть.
      await page.locator('#grammar-back-link').click();
      await page.getByRole('button', { name: 'Начать →' }).click();
      await page.locator('#grammar-sentence').waitFor();
      loseNext = true;
      await page.getByRole('button', { name: 'амбару', exact: true }).click();
      await page.locator('#grammar-result').waitFor();
      assert(await page.locator('#grammar-result.is-incorrect').isVisible());
      // Отпускаем ответ старого занятия уже после начала нового.
      const held = heldCheck; heldCheck = null;
      await held.route.fulfill({ json: held.json });
      await page.waitForTimeout(150);
      // Повтор в новом занятии должен использовать тот же submissionId и не сжечь вторую попытку.
      await page.getByRole('button', { name: 'амбару', exact: true }).click();
      await page.locator('#grammar-rule').waitFor();
      assert(reusedSubmission);
      assert.match(await page.locator('#grammar-result').innerText(), /Пока неверно/);
      assert(await page.locator('#grammar-rule').isVisible());
      assert.equal(await page.locator('#grammar-options .grammar-option:disabled').count(), 1);
      assert.equal(await page.locator('#grammar-options .grammar-option.is-correct').count(), 0);
      assert.equal(await page.locator('#grammar-result .grammar-result-actions').count(), 0);
      assert.equal((await page.locator('#grammar-sentence').innerText()).trim(), 'Читам «___».');

      if (width === 1280) await page.screenshot({ path: path.join(__dirname, '../.run-local/grammar/' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Grammar exercise passed: two attempts, hint after first wrong, insert form, three widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
