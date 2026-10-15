// Actual editor scripts and CSS; no server, accounts or database writes.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'IronLanguage.Web/wwwroot', file), 'utf8');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 360, 600, 768, 899, 900, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<body class="green-theme editor-page"><div class="site-frame"><main>
        <section id="editor-form-app" class="feature-shell editor-form-shell" data-kind="audio"><form class="editor-form">
        <textarea id="TokensText">Дӕ\nбон\nхорз!</textarea><input id="DistractorsText" type="hidden">
        <div id="editor-steps"></div><input id="WordIdsCsv" type="hidden"><input id="word-search">
        <div id="word-results"></div><div id="selected-words"></div></form></section></main></div>
        <script id="editor-words-data" type="application/json">[]</script></body>`);
      for (const css of ['site', 'brand', 'features', 'editor', 'theme-green', 'avatar', 'sections-green'])
        await page.addStyleTag({ content: read(`css/${css}.css`) });
      for (const js of ['letter-keys', 'editor']) await page.addScriptTag({ content: read(`js/${js}.js`) });
      for (const fontSize of ['100%', '200%']) {
        await page.addStyleTag({ content: `body {font-size:${fontSize}}` });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}/${fontSize}`);
        for (const field of await page.locator('.editor-step-row .letter-field').all()) {
          const geometry = await field.evaluate(field => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
            return { field: rect(field), row: rect(field.closest('.editor-step-row')), input: rect(field.querySelector('input')), keys: rect(field.querySelector('.letter-keys')) };
          });
          assert(geometry.field.width >= 190, `Collapsed letter field at ${width}/${fontSize}`);
          assert(geometry.input.width >= 80 && geometry.input.right <= geometry.keys.left + 1);
          assert(geometry.field.left >= geometry.row.left && geometry.field.right <= geometry.row.right + 1);
        }
      }
      const first = page.locator('.editor-step-row .letter-field').first();
      await first.getByRole('button', { name: 'Вставить букву ӕ', exact: true }).click();
      await first.getByRole('button', { name: 'Вставить букву Ӕ', exact: true }).click();
      assert.equal(await first.locator('input').inputValue(), 'ӕӔ');
      assert.equal((await page.locator('#DistractorsText').inputValue()).split('\n')[0].split('|')[0].trim(), 'ӕӔ');
      await first.locator('input').focus();
      await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      assert.equal(await first.locator('input').inputValue(), 'ӕӔӕ');
      if (process.env.EDITOR_AUDIO_SCREENSHOTS) {
        fs.mkdirSync(process.env.EDITOR_AUDIO_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: `${process.env.EDITOR_AUDIO_SCREENSHOTS}/audio-${width}.png`, fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    console.log('Audio editor: nine widths, text 200%, letter field geometry, ӕ/Ӕ input, keyboard and transport passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
