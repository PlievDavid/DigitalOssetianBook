const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL || 'http://127.0.0.1:60657';
const fixture = JSON.parse(fs.readFileSync('.run-local/curriculum-checks.json', 'utf8'));
const output = '.run-local/curriculum-qa';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ baseURL: base });
    await context.addCookies([{ name: 'Adam.Auth', value: fixture.cookie, url: base }]);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const [route, name] of [['/courses', 'catalog'], ['/editor/curriculum', 'teaching'], ['/editor', 'materials'], ['/editor/curriculum/lesson/new', 'lesson-empty']]) {
      await page.goto(route);
      for (const width of [360, 768, 1024, 1246, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: ${width}`);
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      }
      if (name === 'catalog') {
        assert.equal(await page.getByRole('link', { name: 'Отдельные уроки', exact: true }).count(), 0);
        assert.equal(await page.locator('.course-resume').count(), 0);
        await page.locator('#main-navigation').getByRole('link', { name: 'Преподавание', exact: true }).waitFor();
      }
      if (name === 'materials') {
        assert.equal(await page.locator('.editor-create-groups h3').count(), 3);
        await page.getByRole('tab', { name: 'Опубликовано', exact: true }).click();
        await page.locator('#editor-search').fill('несуществующий материал 123456');
        assert.equal(await page.locator('#editor-published .editor-item:visible').count(), 0);
        await page.locator('#editor-search').fill('');
        await page.locator('#editor-kind-filter').selectOption('audio');
        const kinds = await page.locator('#editor-published .editor-item:visible').evaluateAll(xs => xs.map(x => x.dataset.kind));
        assert(kinds.every(kind => kind === 'audio'));
        await page.locator('#editor-kind-filter').selectOption('all');
        await page.locator('#editor-sort').selectOption('title-asc');
        const titles = await page.locator('#editor-published .editor-item:visible h3').allTextContents();
        assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, 'ru')));
      }
      if (name === 'lesson-empty') {
        assert.equal(await page.locator('.curriculum-workspace').isVisible(), false);
        await page.locator('[data-first-template=text]').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.curriculum-workspace').isVisible(), true);
        assert.equal(await page.locator('#lesson-first-card').isVisible(), false);
        await page.getByLabel('Заголовок', { exact: true }).fill('Буква Ӕ');
        await page.getByLabel('Основной текст', { exact: true }).fill('Ӕ ӕ');
        assert.match(await page.locator('#curriculum-canvas').textContent(), /Ӕ ӕ/);
        await page.getByRole('button', { name: 'Сравнение', exact: true }).click();
        await page.getByLabel('Заголовок', { exact: true }).fill('Заглавная и строчная буквы');
        await page.getByLabel('Левая колонка', { exact: true }).fill('Ӕ');
        await page.getByLabel('Правая колонка', { exact: true }).fill('ӕ');
        const columns = await page.locator('#curriculum-canvas .theory-copy').evaluateAll(xs => xs.map(x => ({ top: x.getBoundingClientRect().top, height: x.getBoundingClientRect().height, padding: getComputedStyle(x).padding, background: getComputedStyle(x).backgroundColor })));
        assert(Math.abs(columns[0].top - columns[1].top) < 1 && Math.abs(columns[0].height - columns[1].height) < 1, 'Колонки сравнения не выровнены');
        assert.equal(columns[0].padding, columns[1].padding);
        assert.notEqual(columns[0].background, columns[1].background);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${output}/comparison-preview.png`, fullPage: true });
        await page.getByRole('button', { name: 'Правило', exact: true }).click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${output}/rule-preview.png`, fullPage: true });
        await page.getByRole('button', { name: 'Удалить', exact: true }).click();
        assert.equal(await page.locator('#lesson-first-card').isVisible(), true);
      }
    }
    assert.deepEqual(errors, []);
    console.log('UX: преподавание, каталог без лишнего раздела, группы материалов, поиск, тип, сортировка, первая карточка и 5 ширин — OK.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
