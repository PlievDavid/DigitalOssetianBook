// Read-only browser check. Additional chapter variants use intercepted API responses.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const overflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
    const capture = async name => {
      if (!process.env.BOOK_SCREENSHOTS) return;
      fs.mkdirSync(process.env.BOOK_SCREENSHOTS, { recursive: true });
      await page.screenshot({ path: `${process.env.BOOK_SCREENSHOTS}/${name}.png`, fullPage: true });
    };
    for (const width of [360, 600, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/books`);
      await page.locator('.book-card').first().waitFor();
      await overflow();
      await page.locator('.book-card').first().click();
      await page.locator('#detail-chapters button').first().waitFor();
      await overflow();
      if (width === 1280) await capture('book-detail');
      await page.locator('#detail-read').click();
      await page.locator('#book-text .reader-word').first().waitFor();
      assert(await page.locator('.site-header').isVisible());
      assert(await page.locator('#original-heading').isVisible());
      await overflow();
      if ([360, 1280].includes(width)) await capture(`reader-${width}`);
      const text = await page.locator('#book-text').textContent();
      assert(/[ӕӔæÆ]/u.test(text), 'Ossetian letters missing');
      await page.evaluate(() => document.fonts.ready);
      assert(await page.evaluate(() => document.fonts.check('20px "Golos Text"', 'Ӕӕ')));
      const word = page.locator('#book-text .reader-word').first();
      await word.focus(); await page.keyboard.press('Enter');
      await page.locator('#word-popup').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.reader-current').count(), 1);
      assert.equal(await page.locator('#word-popup button.theme-button').count(), 0, 'Guest save button');
      await page.locator('#word-popup button[aria-label="Закрыть перевод"]').focus();
      await page.keyboard.press('Escape');
      assert(await page.locator('#word-popup').isHidden());
      assert.equal(await page.locator('.reader-current').count(), 0);
      assert(await word.evaluate(node => node === document.activeElement));
      await page.addStyleTag({ content: '.green-theme .book-page .reader-text { font-size: 40px; }' });
      await overflow();
      await page.locator('#books-back').click();
      assert(await page.locator('#book-detail').isVisible());
    }
    // Exercise chapter controls and the no-translation layout without modifying the database.
    await page.route('**/api/v1/books/*', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.chapters = [data.chapters[0], { ...data.chapters[0], id: 'second-chapter', title: 'Проверка второй главы' }];
      data.literaryTranslation = null;
      await route.fulfill({ response, json: data });
    });
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/books`);
      await page.locator('.book-card').first().click();
      await page.locator('#detail-chapters button').nth(1).click();
      await page.locator('#book-text .reader-word').first().waitFor();
      assert(await page.locator('#chapter-next').isDisabled());
      assert(await page.locator('#book-literary').isHidden());
      assert(await page.locator('#reader-columns').evaluate(node => node.classList.contains('single')));
      await page.locator('#chapter-previous').click();
      assert(await page.locator('#chapter-previous').isDisabled());
      if (width === 360) {
        await page.locator('#chapter-select').selectOption('second-chapter');
      } else {
        await page.locator('#chapter-buttons button').nth(1).click();
      }
      assert(await page.locator('#chapter-next').isDisabled());
      await overflow(); await capture(`chapters-${width}`);
    }
    assert.deepEqual(errors, []);
    console.log('Books: six viewport widths, real book, keyboard, popup, chapter controls and single-column layout passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
