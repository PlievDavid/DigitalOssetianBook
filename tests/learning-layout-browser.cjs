// Local layout regression. Guest dialogue sessions stay in memory; no database writes.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const root = path.resolve(__dirname, '..');
const proof = process.env.LEARNING_LAYOUT_SCREENSHOTS;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const overflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const capture = async name => { if (proof) { fs.mkdirSync(proof, { recursive: true }); await page.screenshot({ path: `${proof}/${name}.png`, fullPage: true }); } };
    for (const width of [360, 600, 768, 1024, 1159, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${base}/dialogs`);
      await page.locator('#dialog-list .exercise-entry').first().waitFor();
      for (const card of await page.locator('#dialog-list .exercise-entry').all()) {
        const geometry = await card.evaluate(card => {
          const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
          return { card: rect(card), copy: rect(card.querySelector('.exercise-entry-copy')), title: rect(card.querySelector('h2')), button: rect(card.querySelector('button')) };
        });
        assert(geometry.copy.width >= geometry.card.width - 55, `Copy compressed at ${width}`);
        assert(geometry.title.width >= 130, `Title compressed at ${width}`);
        assert(geometry.button.width >= 135 && geometry.button.height <= 80, `Button compressed at ${width}`);
        assert(geometry.button.right <= geometry.card.right && geometry.button.bottom <= geometry.card.bottom);
      }
      await overflow();
      if ([360, 1159].includes(width)) await capture(`dialogs-${width}`);
      await page.addStyleTag({ content: 'body {font-size:200%}' }); await overflow();
    }
    // The published choices/free-input dialogues can start without creating user progress.
    for (const index of [0, 1]) {
      await page.setViewportSize({ width: index ? 360 : 1280, height: 800 });
      await page.goto(`${base}/dialogs`);
      await page.locator('#dialog-list button').nth(index).click();
      await page.locator('#dialog-play').waitFor({ state: 'visible' });
      assert(await page.locator('#dialog-feed .dialog-line').count() > 0);
      assert(await page.locator('#dialog-composer').isVisible());
      await overflow(); await capture(`dialog-play-${index}`);
      await page.locator('#dialog-back-link').click();
      assert(await page.locator('#dialog-list').isVisible());
    }
    // Exercise the actual vocabulary renderer with a saved-word fixture, without an account.
    for (const width of [360, 768, 1159]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent('<body class="green-theme"><div class="site-frame"><main><section class="feature-shell vocabulary-shell" id="vocabulary-app"><h1>Мои слова</h1><div id="vocabulary-status"></div><section class="vocabulary-section"><h2>Сохранено</h2><div id="saved-words" class="vocabulary-list"></div></section><section class="vocabulary-section"><h2>Доступные слова</h2><div id="available-words" class="vocabulary-list"></div></section></section></main></div></body>');
      for (const css of ['site', 'brand', 'features', 'editor', 'theme-green', 'avatar', 'sections-green']) await page.addStyleTag({ content: fs.readFileSync(`${root}/IronLanguage.Web/wwwroot/css/${css}.css`, 'utf8') });
      await page.evaluate(() => {
        window.AdamAuthenticated = true;
        window.AdamApi = async route => route === '/vocabulary' ? [{ wordId: 'saved', ossetian: 'Гогыз', russian: 'Индюк' }] : [];
      });
      await page.addScriptTag({ path: `${root}/IronLanguage.Web/wwwroot/js/vocabulary.js` });
      const card = page.locator('#saved-words .vocabulary-row'); await card.waitFor();
      const geometry = await card.evaluate(card => {
        const text = card.querySelector('.vocabulary-row-copy').getBoundingClientRect();
        const action = card.querySelector('button').getBoundingClientRect();
        return { height: card.getBoundingClientRect().height, textRight: text.right, actionLeft: action.x, textTop: text.top, textBottom: text.bottom, actionTop: action.top, actionBottom: action.bottom };
      });
      assert(geometry.height <= 90, `Word card too tall at ${width}`);
      assert(geometry.textRight <= geometry.actionLeft);
      assert(geometry.actionTop < geometry.textBottom && geometry.actionBottom > geometry.textTop);
      await overflow(); await capture(`vocabulary-${width}`);
      await page.addStyleTag({ content: 'body {font-size:200%}' }); await overflow();
    }
    assert.deepEqual(errors, []);
    console.log('Learning layouts passed: dialogue cards at six widths, two guest starts, compact saved words at three widths, text 200%.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
