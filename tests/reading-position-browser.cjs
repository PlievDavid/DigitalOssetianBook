// Exercise the real reader against token/position fixtures without changing a database.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const script = fs.readFileSync(path.join(__dirname, '../IronLanguage.Web/wwwroot/js/reading.js'), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><section id="reading-app">
<p id="reading-status"></p><div id="reading-library"><span id="reading-count"></span><div id="reading-library-grid"></div></div>
<article id="reading-story" hidden><h1 id="reading-title" tabindex="-1"></h1><p id="reading-authors"></p>
<div id="reading-chapters"></div><p id="reading-draft-notice"></p><div id="reading-flow"></div>
<button id="reading-back">К чтению</button><button id="reading-smaller">А−</button><button id="reading-larger">А+</button></article>
<aside id="reading-word-panel" hidden><h2 id="reading-word-title"></h2><div id="reading-word-definition"></div><button id="reading-word-close">Закрыть</button></aside></section>`;
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [390, 1280]) {
      for (const [index, expected] of [[0, null], [1, 1], [2, 2], [3, 4], [5, 4]]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.setContent(html);
        await page.evaluate(index => {
          const tokens = ['Ӕз', ',', ' ', '\n', 'Фӕлмӕн', '\n'].map(text => ({ text, wordId: null }));
          const book = { id: 'book', title: 'Проверка', authors: 'Автор', translationReviewed: true, illustrations: [],
            chapters: [{ id: 'chapter', title: 'Глава', tokens, translation: '' }] };
          window.AdamAuthenticated = true;
          window.AdamBookCover = { create: () => document.createElement('div') };
          window.savedRequests = [];
          window.AdamApi = async (url, options) => {
            if (options) { savedRequests.push({ url, options }); return {}; }
            if (url === '/books') return [book];
            if (url === '/words') return [];
            if (url.endsWith('/position')) return { chapterId: 'chapter', tokenIndex: index };
            return book;
          };
          window.restoredToken = null;
          const scroll = Element.prototype.scrollIntoView;
          Element.prototype.scrollIntoView = function(options) { window.restoredToken = Number(this.dataset.tokenIndex); scroll.call(this, options); };
        }, index);
        await page.addScriptTag({ content: script });
        await page.locator('.reading-card').click();
        await page.locator('#reading-story').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => restoredToken), expected, `Wrong restored token: ${index}, width ${width}`);
        assert.equal(await page.locator('#reading-flow [data-token-index="1"]').textContent(), ',');
        assert.equal(await page.locator('#reading-flow [data-token-index="2"]').textContent(), ' ');
        assert.equal(await page.locator('#reading-flow [data-token-index="1"]').getAttribute('role'), null);
        assert.equal(await page.locator('#reading-flow [data-token-index="2"]').getAttribute('tabindex'), null);
        assert.equal(await page.locator('.reading-word').count(), 2);
        assert.deepEqual(await page.evaluate(() => savedRequests), []);
        await page.locator('.reading-word').last().focus(); await page.keyboard.press('Enter');
        await page.locator('#reading-word-panel').waitFor({ state: 'visible' });
        assert.equal((await page.evaluate(() => savedRequests))[0].options.method, 'PUT');
        assert.equal(JSON.parse((await page.evaluate(() => savedRequests))[0].options.body).tokenIndex, 4);
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
    console.log('Reading position passed: word, punctuation, whitespace, newline, trailing newline, two widths and keyboard vocabulary/save behavior.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
