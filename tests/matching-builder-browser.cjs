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
    const partial = read('IronLanguage.Web/Views/EditorWorkflow/_MatchingBuilder.cshtml')
      .replace(/^@model.*$/m, '').replace(/asp-for="([^"]+)"/g, 'id="$1" name="$1"');
    const load = async seed => {
      await page.setContent(`<body class="green-theme editor-page"><div class="site-frame"><main><section class="feature-shell editor-form-shell"><h1>Конструктор соотнесения</h1><form class="editor-form">${partial}<button class="button primary" type="submit">Сохранить черновик</button></form></section></main></div></body>`);
      for (const css of ['site', 'brand', 'features', 'editor', 'theme-green', 'avatar', 'sections-green']) {
        await page.addStyleTag({ content: read(`IronLanguage.Web/wwwroot/css/${css}.css`) });
      }
      if (seed) await page.evaluate(seed => {
        for (const [id, value] of Object.entries(seed)) document.getElementById(id).value = value;
      }, seed);
      await page.addScriptTag({ content: read('IronLanguage.Web/wwwroot/js/letter-keys.js') });
      await page.addScriptTag({ content: read('IronLanguage.Web/wwwroot/js/matching-builder.js') });
    };
    for (const width of [360, 768, 902, 1280]) {
      await page.setViewportSize({ width, height: 800 }); await load();
      // Empty start: two empty pair cards + one empty distractor row after add.
      assert.equal(await page.locator('#builder-pairs article').count(), 0);
      await page.locator('#add-pair').click(); await page.locator('#add-pair').click();
      assert.equal(await page.locator('#builder-pairs article').count(), 2);
      assert(await page.locator('#builder-pairs article input').first().evaluate(input => input === document.activeElement));
      await page.locator('#builder-pairs article input').nth(0).fill('Салам');
      await page.locator('#builder-pairs article input').nth(1).fill('Привет');
      await page.locator('#builder-pairs article input').nth(2).fill('Нувард дзүуд?');
      await page.locator('#builder-pairs article input').nth(3).fill('Как дела?');
      // letter-keys must work inside pair inputs
      await page.locator('#add-distractor').click();
      await page.locator('#builder-distractors input').fill('Фэн');
      const distractorRow = page.locator('.builder-answer-row').first();
      await distractorRow.getByRole('button', { name: 'Вставить букву Ӕ', exact: true }).click();
      assert.equal(await page.locator('#builder-distractors input').inputValue(), 'ФэнӔ');
      await page.locator('#builder-distractors input').fill('До свидания');
      assert.equal(await page.locator('#PairsText').inputValue(), 'Салам | Привет\nНувард дзүуд? | Как дела?');
      assert.equal(await page.locator('#DistractorsText').inputValue(), 'До свидания');
      // Delete must be disabled below two pairs: with two remaining after delete of the third.
      await page.locator('#add-pair').click();
      await page.locator('#builder-pairs article input').nth(4).fill('Махуыр');
      await page.locator('#builder-pairs article input').nth(5).fill('Спасибо');
      await page.getByRole('button', { name: 'Удалить пару 3', exact: true }).click();
      assert.equal(await page.locator('#builder-pairs article').count(), 2);
      assert(await page.getByRole('button', { name: 'Удалить пару 1', exact: true }).isDisabled());
      assert(await page.getByRole('button', { name: 'Удалить пару 2', exact: true }).isDisabled());
      await page.locator('#add-pair').click();
      await page.locator('#builder-pairs article input').nth(2).fill('Махуыр');
      await page.locator('#builder-pairs article input').nth(3).fill('Спасибо');
      // Reorder
      await page.getByRole('button', { name: 'Опустить пару 1', exact: true }).click();
      assert.match(await page.locator('#PairsText').inputValue(), /^Нувард дзүуд\? \| Как дела\?\nСалам \| Привет/);
      await page.getByRole('button', { name: 'Поднять пару 2', exact: true }).click();
      assert.match(await page.locator('#PairsText').inputValue(), /^Салам \| Привет\nНувард дзүуд\?/);
      // Submit must carry transport values byte-for-byte.
      await page.locator('form').evaluate(form => {
        form.addEventListener('submit', event => { event.preventDefault(); window.submittedMatching = Object.fromEntries(new FormData(form)); });
      });
      await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
      const submitted = await page.evaluate(() => window.submittedMatching);
      assert.equal(submitted.PairsText, 'Салам | Привет\nНувард дзүуд? | Как дела?\nМахуыр | Спасибо');
      assert.equal(submitted.DistractorsText, 'До свидания');
      // Responsive: no horizontal overflow, pair row stacks on narrow width.
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const pairRow = page.locator('.builder-pair-row').first();
      const boxes = await pairRow.evaluate(row => [...row.children].map(child => {
        const rect = child.getBoundingClientRect(); return { x: rect.x, right: rect.right, width: rect.width, height: rect.height };
      }));
      if (width <= 599) {
        assert(boxes[1].x >= boxes[0].x && boxes[1].y > boxes[0].y, 'Pair row must stack vertically on narrow screens');
      } else {
        assert(boxes[0].right <= boxes[1].x && boxes[1].right <= boxes[2].x, 'Pair controls overlap');
        assert(boxes[0].width >= 140 && boxes[2].width >= 140, `Pair inputs too narrow at ${width}`);
      }
      await page.addStyleTag({ content: 'body {font-size:200%}' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.addStyleTag({ content: 'body {font-size:16px}' });
      if (process.env.MATCHING_BUILDER_SCREENSHOTS) {
        fs.mkdirSync(process.env.MATCHING_BUILDER_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.MATCHING_BUILDER_SCREENSHOTS}/builder-${width}.png`, fullPage: true });
      }
    }
    // Malformed transport data must survive initialization and submit byte-for-byte.
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const broken of [
        { PairsText: 'Салам\nНувард дзүуд? | Как дела?' },
        { PairsText: 'Салам | Привет | лишнее\nНувард дзүуд? | Как дела?' }
      ]) {
        const values = { PairsText: broken.PairsText, DistractorsText: '' };
        await load(values);
        assert.match(await page.locator('#matching-builder [role=alert]').innerText(), /Данные сохранены/);
        for (const [id, value] of Object.entries(values)) assert.equal(await page.locator(`#${id}`).inputValue(), value);
        await page.locator('form').evaluate(form => {
          form.addEventListener('submit', event => { event.preventDefault(); window.submittedBroken = Object.fromEntries(new FormData(form)); });
        });
        await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.submittedBroken), values);
        // Fixing the transport data re-enables the builder on next load.
        await page.locator('#PairsText').fill('Салам | Привет\nНувард дзүуд? | Как дела?');
        await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
        const corrected = await page.evaluate(() => window.submittedBroken);
        await load(corrected);
        assert.equal(await page.locator('#builder-pairs article').count(), 2);
        assert.equal(await page.locator('#matching-builder [role=alert]').count(), 0);
      }
    }
    assert.deepEqual(errors, []);
    console.log('Matching builder: four widths, letter keys, reorder, delete guard, malformed input preservation and recovery, responsive pair row, text 200% passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
