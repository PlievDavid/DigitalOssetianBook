// Local UI regression. No accounts or database records are created.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
const read = path => fs.readFileSync(`${root}/${path}`, 'utf8');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const partial = read('IronLanguage.Web/Views/EditorWorkflow/_DialogueBuilder.cshtml')
      .replace(/^@model.*$/m, '').replace(/asp-for="([^"]+)"/g, 'id="$1" name="$1"');
    const load = async seed => {
      await page.setContent(`<body class="green-theme editor-page"><div class="site-frame"><main><section class="feature-shell editor-form-shell"><h1>Конструктор диалога</h1><form class="editor-form">${partial}<button class="button primary" type="submit">Сохранить черновик</button></form></section></main></div></body>`);
      for (const css of ['site', 'brand', 'features', 'editor', 'theme-green', 'avatar', 'sections-green']) {
        await page.addStyleTag({ content: read(`IronLanguage.Web/wwwroot/css/${css}.css`) });
      }
      if (seed) await page.evaluate(seed => {
        for (const [id, value] of Object.entries(seed)) document.getElementById(id).value = value;
      }, seed);
      await page.addScriptTag({ content: read('IronLanguage.Web/wwwroot/js/dialogue-builder.js') });
    };
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 }); await load();
      await page.getByRole('button', { name: 'Добавить персонажа', exact: true }).first().click();
      await page.locator('#character-name').fill('Алан');
      await page.locator('#save-character').click();
      await page.locator('#add-line').click();
      await page.locator('#line-text').fill('Дӕ бон хорз!'); await page.locator('#save-line').click();
      await page.locator('#add-line').click(); await page.locator('#line-speaker').selectOption('Ученик');
      await page.locator('#line-answers label input').nth(0).fill('Дӕ бон хорз!');
      await page.locator('#line-answers label input').nth(1).fill('Фӕндараст!');
      await page.locator('#line-answers input[type=radio]').nth(0).check();
      await page.locator('#line-skippable').check(); await page.locator('#save-line').click();
      assert.match(await page.locator('#TurnsText').inputValue(), /^2 \| choice \| Дӕ бон хорз! \|/);
      // Moving the student's answer must move its turn, too.
      await page.getByRole('button', { name: 'Поднять реплику 2', exact: true }).click();
      assert.match(await page.locator('#TurnsText').inputValue(), /^1 \| choice/);
      await page.getByRole('button', { name: 'Настроить персонажа Алан' }).click();
      await page.locator('#character-name').fill('Сослан'); await page.locator('#save-character').click();
      assert.match(await page.locator('#LinesText').inputValue(), /Сослан: Дӕ бон хорз!/);
      assert(await page.getByRole('button', { name: 'Удалить персонажа Сослан', exact: true }).isDisabled());
      await page.getByRole('button', { name: 'Изменить реплику 1', exact: true }).click();
      await page.locator('#line-kind').selectOption('free');
      await page.locator('#line-answers label input').fill('Дӕ бон хорз!');
      await page.locator('#save-line').click();
      assert.match(await page.locator('#TurnsText').inputValue(), /^1 \| free \| Дӕ бон хорз! \|  \| 2 \| да$/);
      if (process.env.DIALOGUE_BUILDER_SCREENSHOTS) {
        fs.mkdirSync(process.env.DIALOGUE_BUILDER_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.DIALOGUE_BUILDER_SCREENSHOTS}/builder-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Изменить реплику 1', exact: true }).click();
        await page.screenshot({ path: `${process.env.DIALOGUE_BUILDER_SCREENSHOTS}/answer-${width}.png` });
        await page.keyboard.press('Escape');
      }
      // Cancel must discard uncommitted changes and release focus.
      await page.getByRole('button', { name: 'Изменить реплику 1', exact: true }).click();
      await page.locator('#line-threshold').fill('');
      await page.keyboard.press('Escape');
      assert(await page.locator('form').evaluate(form => form.checkValidity()));
      assert.equal(await page.locator('#TurnsText').inputValue(), '1 | free | Дӕ бон хорз! |  | 2 | да');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#add-character').click();
      await page.locator('#character-name').fill('Ученик'); await page.locator('#save-character').click();
      assert(await page.locator('#character-error').innerText());
      assert(await page.locator('#character-dialog').isVisible());
      await page.keyboard.press('Escape');
      // Open modal traps Tab and remains inside the viewport at 200% text.
      await page.addStyleTag({ content: 'body {font-size:200%}' });
      await page.locator('#add-line').click();
      for (let i = 0; i < 18; i++) {
        await page.keyboard.press('Tab');
        assert(await page.evaluate(() => document.activeElement.closest('dialog')?.id === 'line-dialog'));
      }
      assert(await page.locator('#line-dialog').evaluate(d => d.scrollWidth <= d.clientWidth));
      await page.keyboard.press('Escape');
    }
    // Existing published material must round-trip without losing student text or turn settings.
    const seeds = JSON.parse(read('IronLanguage.Web/Data/dialogues/dialogues.json'));
    for (const seed of seeds) {
      const values = { CharactersText: seed.characters, LinesText: seed.lines, TurnsText: seed.turns };
      await load(values);
      const clean = text => text.split('\n').map(x => x.trim()).filter(Boolean).join('\n');
      for (const [id, value] of Object.entries(values)) assert.equal(clean(await page.locator(`#${id}`).inputValue()), clean(value));
    }
    await load({ CharactersText: 'Собеседник | #203f34', LinesText: 'Собеседник: Дӕ бон хорз!\nУченик:',
      TurnsText: '2 | choice | «Дӕ бон хорз»! | Фӕндараст; Дæ бон хорз | 2 | нет' });
    await page.getByRole('button', { name: 'Изменить реплику 2', exact: true }).click();
    assert(await page.locator('#line-answers input[type=radio]').nth(1).isChecked());
    assert.deepEqual(errors, []);
    console.log('Dialogue builder: three widths, character rename, turns and reordering, cancel, keyboard, text 200%, two seed round-trips passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
