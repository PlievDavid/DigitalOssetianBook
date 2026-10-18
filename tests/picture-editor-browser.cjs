const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
assert(process.env.ADAM_TEST_EDITOR_EMAIL && process.env.ADAM_TEST_EDITOR_PASSWORD, 'Provide a local test editor account through environment variables.');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output = path.resolve(__dirname, '../.run-local/picture-editor');
    fs.mkdirSync(output, { recursive: true });
    await page.goto(base + '/account/login?ReturnUrl=' + encodeURIComponent('/editor/new/picture'));
    await page.locator('#Email').fill(process.env.ADAM_TEST_EDITOR_EMAIL);
    await page.locator('#Password').fill(process.env.ADAM_TEST_EDITOR_PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(base + '/editor/new/picture');
    const labelStyle = locator => locator.evaluate(element => {
      const style = getComputedStyle(element);
      return [style.display, style.rowGap, style.fontSize, style.fontWeight, style.color];
    });
    for (const width of [320, 390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base + '/editor/new/word');
      const expectedLabel = await labelStyle(page.locator('.editor-form > label').first());
      await page.goto(base + '/editor/new/picture');
      await page.evaluate(() => document.fonts.ready);
      assert.match(await page.locator('h1').innerText(), /Добавить задание «Картинка и слово»/);
      for (const label of await page.locator('#picture-editor .editor-field').all()) assert.deepEqual(await labelStyle(label), expectedLabel);
      assert.equal(await page.locator('#picture-editor').evaluate(element => getComputedStyle(element).rowGap), await page.locator('.editor-form').evaluate(element => getComputedStyle(element).rowGap));
      assert(await page.locator('#picture-image-preview').isHidden());
      assert(await page.locator('#picture-distractors-block').isVisible());
      await page.locator('#PictureWord').fill('ӕ');
      const wordField = page.locator('#PictureWord').locator('..');
      await wordField.getByRole('button', { name: 'Вставить букву Ӕ', exact: true }).click();
      assert.equal(await page.locator('#PictureWord').inputValue(), 'ӕӔ');
      await page.locator('#PictureDistractor1').fill('Проверка 1');
      await page.locator('#PictureDistractor2').fill('Проверка 2');
      await page.locator('#picture-mode').selectOption('free');
      assert(await page.locator('#picture-distractors-block').isHidden());
      assert(await page.locator('#picture-mode-hint').isVisible());
      assert(!(await page.locator('#picture-mode-hint').getAttribute('class')).includes('form-error'));
      await page.locator('#picture-mode').selectOption('choice');
      assert.equal(await page.locator('#PictureDistractor1').inputValue(), 'Проверка 1');
      assert(await page.locator('#picture-mode-hint').isHidden());
      await page.locator('#picture-image').focus();
      assert.equal(await page.locator('.editor-image-field .editor-file-button').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
      await page.keyboard.press('Tab');
      assert(await page.locator('#PictureWord').evaluate(element => element === document.activeElement));
      await page.locator('#picture-image').setInputFiles({ name: 'проверка.png', mimeType: 'image/png', buffer: pixel });
      await page.waitForFunction(() => document.querySelector('#picture-image-preview').naturalWidth === 1);
      assert.match(await page.locator('#picture-file-name').innerText(), /проверка\.png/);
      await page.locator('#PictureTitle').fill('Проверка оформления');
      const transport = await page.locator('form.editor-form').evaluate(form => {
        const data = new FormData(form);
        return { mode: data.get('PictureMode'), word: data.get('PictureWord'), image: data.get('PictureImage').name, csrf: !!data.get('__RequestVerificationToken') };
      });
      assert.deepEqual(transport, { mode: 'choice', word: 'ӕӔ', image: 'проверка.png', csrf: true });
      for (const fontSize of ['100%', '200%']) {
        await page.addStyleTag({ content: `body { font-size: ${fontSize}; }` });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}/${fontSize}`);
        for (const input of await page.locator('#picture-editor input[type="text"]').all()) assert((await input.boundingBox()).width >= 80);
      }
      await page.addStyleTag({ content: 'body { font-size: 100%; }' });
      await page.locator('#picture-mode').focus();
      if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(output, `${width}.png`), fullPage: true });
      await page.locator('#picture-image').setInputFiles([]);
      assert(await page.locator('#picture-image-preview').isHidden());
      assert.equal(await page.locator('#picture-file-name').innerText(), 'Файл не выбран');
    }
    const existingImage = 'data:image/png;base64,' + pixel.toString('base64');
    await page.route('**/editor/new/picture', async route => {
      const response = await route.fetch();
      const html = (await response.text()).replace(/<img\b(?=[^>]*id="picture-image-preview")[^>]*>/, tag => tag.replace(/\s(?:src|hidden)="[^"]*"/g, '').replace(/\s+hidden(?=\s|\/?>)/g, '').replace(/\/?>(?=$)/, ` src="${existingImage}" />`));
      await route.fulfill({ response, body: html });
    });
    await page.goto(base + '/editor/new/picture');
    await page.locator('#picture-image-preview').waitFor({ state: 'visible' });
    await page.locator('#picture-image').setInputFiles({ name: 'замена.png', mimeType: 'image/png', buffer: pixel });
    await page.locator('#picture-image').setInputFiles([]);
    assert.equal(await page.locator('#picture-image-preview').getAttribute('src'), existingImage);
    assert(await page.locator('#picture-image-preview').isVisible());
    assert.equal(await page.locator('#picture-file-name').innerText(), 'Текущая картинка сохранена');
    assert.deepEqual(errors, []);
    console.log('Picture editor passed: actual protected Razor, shared field styles, five widths, 200% text, ӕ/Ӕ, keyboard file selection, preview/reset/existing image, choice/free modes and unchanged form transport. No material was saved.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
