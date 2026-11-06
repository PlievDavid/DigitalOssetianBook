const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL || 'http://127.0.0.1:60656';
const fixture = JSON.parse(fs.readFileSync('.run-local/curriculum-checks.json', 'utf8'));
const output = '.run-local/curriculum-qa';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: 'Adam.Auth', value: fixture.cookie, url: base }]);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/editor/curriculum/course/new');
    await page.getByLabel('Название', { exact: true }).fill('Знакомство с осетинским языком');
    await page.getByLabel('Описание', { exact: true }).fill('Пример оформления курса: описание и последовательно расположенные уроки.');
    await page.getByLabel('Чему научится ученик').fill('Здесь автор описывает результаты обучения.');
    await page.getByLabel('Для кого курс').fill('Для тех, кто начинает знакомство с языком.');
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await page.waitForURL(/\/course\/[^/]+\/edit$/);
    const editUrl = new URL(page.url()).pathname;
    const id = editUrl.split('/')[4];
    assert.equal(await page.getByLabel('Чему научится ученик').inputValue(), 'Здесь автор описывает результаты обучения.');
    assert.equal(await page.locator('.curriculum-sidebar').count(), 0, 'В редакторе курса лишняя боковая панель');
    const add = page.getByRole('button', { name: 'Добавить мои уроки', exact: true });
    await add.focus(); await page.keyboard.press('Enter');
    await page.getByLabel('Поиск урока').fill('несуществующий урок 123456');
    assert.equal(await page.locator('#course-picker-list input').count(), 0);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.id === "curriculum-open-picker");
    await add.click();
    await page.locator('#course-picker-list input').first().waitFor();
    const choices = await page.locator('#course-picker-list input').count();
    for (let i = 0; i < Math.min(3, choices); i++) await page.locator('#course-picker-list input').nth(i).check();
    await page.getByRole('button', { name: 'Добавить выбранные', exact: true }).click();
    const structure = JSON.parse(await page.locator('#curriculum-structure').inputValue());
    assert(structure.length > 0);
    await page.getByRole('button', { name: /Убрать из курса:/ }).first().click();
    assert.equal((await context.request.get(`/editor/curriculum/lesson/${structure[0]}/edit`)).status(), 200, 'Удаление связи удалило урок');
    await add.click();
    await page.locator('#course-picker-list input').first().check();
    await page.getByRole('button', { name: 'Добавить выбранные', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await page.waitForLoadState('networkidle');
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Редактор курса: ${width}`);
      await page.screenshot({ path: `${output}/course-editor-${width}.png`, fullPage: true });
    }
    await page.getByRole('button', { name: 'Сохранить и посмотреть', exact: true }).click();
    await page.waitForURL(/\/preview$/);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.waitForURL(/\/editor\/curriculum\?kind=/);
    for (const [route, name] of [[`/courses/${id}/about`, 'about'], [`/courses/${id}/contents`, 'course'], ['/courses', 'catalog'], ['/editor/curriculum', 'author']]) {
      await page.goto(route);
      assert.equal(await page.locator('h1').count(), 1);
      if (name === 'about') await page.getByText('Здесь автор описывает результаты обучения.', { exact: true }).waitFor();
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: ${width}`);
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    console.log('Курс: пустой черновик, описание, свои уроки, поиск, удаление связи, публикация, клавиатура и адаптивность — OK.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
