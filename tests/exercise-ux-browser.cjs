const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let failCatalog = true;
    let failAnswer = true;
    const groupingTile = { index: 0, text: "Ӕвзаг", solved: false };
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/catalog') {
        if (failCatalog) {
          failCatalog = false;
          return route.fulfill({ status: 503, json: { error: 'Тестовый сбой' } });
        }
        return route.fulfill({ json: { exercises: [
          { id: 'audio-fixture', kind: 'audio', russianPrompt: 'Я говорю' },
          { id: 'fixture', kind: 'translation', russianPrompt: 'Я говорю', author: 'Тестовый автор' },
          { id: 'legacy-fixture', kind: 'translation', russianPrompt: 'Я говорю' }
        ] } });
      }
      if (path === '/api/v1/exercises/fixture/attempts') {
        return route.fulfill({ json: { attemptId: 'fixture', card: { russianPrompt: 'Я говорю', tokens: ['ӕз', 'дзурын'], words: [] } } });
      }
      if (path === '/api/v1/attempts/fixture/answer') {
        assert.deepEqual(route.request().postDataJSON(), { tokenIndices: [0, 1] });
        if (failAnswer) {
          failAnswer = false;
          return route.fulfill({ status: 503, json: { error: 'Тестовый сбой' } });
        }
        return route.fulfill({ json: { correct: true, expectedAnswer: 'ӕз дзурын' } });
      }
      if (path === '/api/v1/groupings') return route.fulfill({ json: [{ id: 'fixture', title: 'Группы слов' }] });
      if (path === '/api/v1/groupings/fixture/sessions') {
        return route.fulfill({ json: { sessionId: 'fixture', title: 'Группы слов', groups: ['Языки', 'Другое'],
          tiles: [groupingTile], placed: 0, total: 1, finished: false, words: [] } });
      }
      if (path === '/api/v1/groupings/sessions/fixture/check') {
        assert.deepEqual(route.request().postDataJSON(), { wordIndex: 0, groupIndex: 0 });
        return route.fulfill({ json: { correct: true, tiles: [{ ...groupingTile, solved: true, group: 0 }],
          placed: 1, total: 1, finished: true } });
      }
      return route.continue();
    });
    await page.setViewportSize({ width: 320, height: 700 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base + '/translate');
    await page.getByRole('button', { name: 'Повторить загрузку' }).click();
    const cards = page.locator('#exercise-list .exercise-entry');
    await cards.nth(1).waitFor();
    assert.deepEqual(await cards.locator('.exercise-card-meta').allTextContents(),
      ['№ 1 · Автор: Тестовый автор', '№ 2 · Автор не указан']);
    await cards.first().getByRole('button', { name: 'Начать', exact: true }).press('Enter');
    const tiles = page.locator('#exercise-tiles button');
    await tiles.first().press('Enter');
    assert.equal(await page.locator(':focus').textContent(), 'дзурын');
    await page.keyboard.press('Enter');
    const submit = page.getByRole('button', { name: 'Проверить ответ', exact: true });
    assert.equal(await page.locator(':focus').textContent(), 'Проверить ответ');
    await page.keyboard.press('Enter');
    const result = page.locator('#exercise-picked + #exercise-result');
    await result.getByText('Не удалось проверить ответ. Попробуйте ещё раз.', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('#exercise-picked button').allTextContents(), ['ӕз', 'дзурын']);
    await submit.press('Enter');
    await result.getByText('Верно!', { exact: false }).waitFor();
    assert(!(await result.innerText()).includes('Правильный ответ:'));
    assert(await submit.isHidden());
    assert.equal(await result.evaluate(el => el.getAnimations().length), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(base + '/grouping');
    await page.getByRole('button', { name: 'Начать', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Ӕвзаг', exact: true }).press('Enter');
    assert.equal(await page.locator('.grouping-group.is-target').count(), 2);
    await page.getByRole('button', { name: 'Положить выбранное слово в группу «Языки»' }).press('Enter');
    const placed = page.locator('[data-group="0"] .grouping-placed');
    await placed.waitFor();
    assert.equal(await placed.textContent(), 'Ӕвзаг');
    assert.equal(await placed.evaluate(el => el.getAnimations().length), 0);
    assert.equal(await page.locator('.grouping-group.is-target').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Exercise UX passed: catalog retry, keyboard focus, answer retry, inline result, grouping, reduced motion and 320 px.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
