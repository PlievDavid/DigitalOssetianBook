const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.route('**/api/v1/wordle', route => route.fulfill({ json: {
      day: '2026-10-17', nextDay: '2026-10-18T00:00:00Z', revision: 0, rows: [], won: false, finished: false, answer: null, russian: null, countedInStreak: false
    } }));
    const stable = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = () => page.locator('#wl-board, #wl-board .wl-cell').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return [bounds.x + scrollX, bounds.y + scrollY, bounds.width, bounds.height];
    }));
    for (const [width, height] of [[1242, 668], [1280, 720], [768, 1024], [320, 568], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/games');
      await page.locator('#games-catalog a[href="/games/wordle"]').click();
      await page.locator('#wl-input').waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('#wl-input').disabled);
      await page.evaluate(() => document.fonts.ready); await stable();
      const initial = await geometry();
      await page.locator('.wl-game').scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 160); await stable();
      await page.locator('#wl-input').pressSequentially('ӕ'); await stable();
      assert.deepEqual(await geometry(), initial, `First letter after link entry and scrolling preserves every cell at ${width}`);
      await page.locator('#wl-input').pressSequentially('а'); await stable();
      assert.deepEqual(await geometry(), initial, `Second letter preserves every cell at ${width}`);
      await page.locator('[data-letter="р"]').click(); await stable();
      assert.deepEqual(await geometry(), initial, `On-screen key preserves every cell at ${width}`);
      await page.locator('#wl-input').press('End');
      await page.locator('#wl-input').press('Backspace'); await stable();
      assert.deepEqual(await geometry(), initial, `Deleting a letter preserves every cell at ${width}`);
      assert.equal(await page.locator('#wl-input').inputValue(), 'ӕа');
    }
    console.log('Wordle first-input stability passed: real catalog link, scroll, first/second physical letters, on-screen key, Backspace and identical board/cell geometry at five viewports.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
