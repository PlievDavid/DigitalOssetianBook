// Read-only checks against the published book; altered API responses are browser fixtures only.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const open = async () => {
      await page.goto(base + '/books');
      await page.locator('.book-card').first().click();
      const response = page.waitForResponse(r => /\/api\/v1\/books\/[^/]+$/.test(new URL(r.url()).pathname));
      await page.locator('#detail-read').click();
      const book = await (await response).json();
      await page.locator('#book-text .reader-word').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      return book;
    };
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const book = await open();
    const original = book.chapters[0].tokens.map(token => token.text).join('');
    assert(book.literaryTranslation && original.split('\n').length === book.literaryTranslation.split('\n').length);
    for (const width of [360, 600, 768, 1024, 1280, 1480, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      for (const size of [null, '40px']) {
        const style = size ? await page.addStyleTag({ content: `.green-theme .book-page .reader-text {font-size:${size}}` }) : null;
        await settle();
        assert.equal(await page.locator('#book-text').textContent(), original, 'Original text/spacing changed');
        assert.equal(await page.locator('#book-literary-text').textContent(), book.literaryTranslation, 'Translation changed');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
        if (width > 700) {
          const geometry = await page.evaluate(() => {
            const boxes = id => [...document.querySelectorAll(`#${id} > .reader-line`)].map(el => { const r = el.getBoundingClientRect(); return [r.top, r.height]; });
            return [boxes('book-text'), boxes('book-literary-text')];
          });
          assert(geometry[0].length > 1);
          geometry[0].forEach((row, index) => row.forEach((value, i) => assert(Math.abs(value - geometry[1][index][i]) < 1, `Misaligned row ${index} at ${width}/${size}`)));
        } else {
          assert(await page.locator('#book-text > .reader-line').first().evaluate(el => !el.style.minHeight));
        }
        if (style) await style.evaluate(el => el.remove());
      }
    }
    await page.locator('#book-text .reader-word').first().focus();
    await page.keyboard.press('Enter');
    assert(await page.locator('#word-popup').isVisible());
    assert.equal(await page.locator('.reader-current').count(), 1);
    await page.keyboard.press('Escape');
    assert(await page.locator('#word-popup').isHidden());
    assert.equal(await page.locator('.reader-current').count(), 0);
    // A local row change should not measure every pair in a long chapter.
    await page.setViewportSize({ width: 1280, height: 800 }); await settle();
    await page.evaluate(() => {
      window.rowMeasurements = 0;
      const original = Element.prototype.getBoundingClientRect;
      window.restoreRowMeasurements = () => { Element.prototype.getBoundingClientRect = original; };
      Element.prototype.getBoundingClientRect = function () {
        if (this.classList.contains('reader-line-content')) window.rowMeasurements++;
        return original.call(this);
      };
      document.querySelector('#book-text .reader-line-content').style.minHeight = '150px';
    });
    await page.waitForFunction(() => window.rowMeasurements > 0); await settle();
    assert((await page.evaluate(() => window.rowMeasurements)) <= 4, 'A row resize measures only its pair');
    await page.evaluate(() => { window.restoreRowMeasurements(); document.querySelector('#book-text .reader-line-content').style.minHeight = ''; });
    // Unequal line counts and absent translation must keep the original reading flow.
    for (const translation of [book.literaryTranslation.split('\n').slice(0, -1).join('\n'), null]) {
      await page.route('**/api/v1/books/*', route => route.fulfill({ json: { ...book, literaryTranslation: translation } }));
      await open(); await settle();
      assert.equal(await page.locator('#book-text').textContent(), original);
      assert.equal(await page.locator('#book-text > .reader-line').count(), 0);
      assert.equal(await page.locator('#book-literary').isVisible(), !!translation);
      await page.unroute('**/api/v1/books/*');
    }
    assert.deepEqual(errors, []);
    console.log('Reader lines: seven widths, text 40px, exact whitespace, aligned rows, keyboard popup and translation fallbacks passed. No database writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
