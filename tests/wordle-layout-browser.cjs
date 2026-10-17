const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output = path.resolve(__dirname, '../.run-local/wordle-layout');
    fs.mkdirSync(output, { recursive: true });
    let mode = 'active';
    await page.route('**/api/v1/wordle', route => route.fulfill({ json: {
      day: '2026-10-17', nextDay: '2026-10-18T00:00:00Z', revision: mode === 'active' ? 0 : mode === 'won' ? 1 : 6,
      rows: mode === 'active' ? [] : Array.from({ length: mode === 'won' ? 1 : 6 }, () => ({ word: 'хӕдон', marks: Array(5).fill(mode === 'won' ? 'correct' : 'absent') })),
      won: mode === 'won', finished: mode !== 'active', answer: mode === 'active' ? null : 'хӕдон', russian: mode === 'active' ? null : 'рубашка', countedInStreak: false
    } }));
    let checks = 0;
    for (const [width, height] of [[1242, 668], [1280, 720], [1366, 768], [1920, 1080], [920, 668], [1024, 600], [768, 1024], [600, 800], [320, 568], [360, 640], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/dialogs');
      const expectedPadding = await page.locator('#main-content > .feature-shell').evaluate(el => getComputedStyle(el).paddingTop);
      const expectedFooter = await page.locator('.site-footer').evaluate(el => getComputedStyle(el).display);
      for (mode of ['active', 'won', 'lost']) {
        await page.goto(base + '/games/wordle');
        await page.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
        await page.evaluate(() => document.fonts.ready);
        assert(await page.locator('.wl-back').isVisible(), `Back visible at ${width}/${mode}`);
        assert.equal(await page.locator('.wl-back').getAttribute('href'), '/games');
        assert.equal(await page.locator('#wordle-app').evaluate(el => getComputedStyle(el).paddingTop), width < 600 ? '0px' : expectedPadding);
        assert.equal(await page.locator('.site-footer').evaluate(el => getComputedStyle(el).display), expectedFooter, `Shared footer at ${width}`);
        const geometry = await page.evaluate(() => {
          const board = document.querySelector('#wl-board').getBoundingClientRect();
          const keyboard = document.querySelector('#wl-keyboard').getBoundingClientRect();
          const navigation = document.querySelector('.mobile-bottom-nav');
          const bottom = getComputedStyle(navigation).display === 'none' ? innerHeight : navigation.getBoundingClientRect().top;
          return { board: [board.top, board.bottom], keyboard: [keyboard.top, keyboard.bottom], bottom, height: innerHeight, scrollHeight: document.documentElement.scrollHeight, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert(!geometry.overflow, `No horizontal overflow ${width}/${mode}`);
        assert(geometry.board[0] >= 0 && geometry.board[1] < geometry.bottom, `Board visible ${width}/${mode}`);
        assert(geometry.keyboard[0] >= 0 && geometry.keyboard[1] < geometry.bottom, `Keyboard visible ${width}/${mode}`);
        assert(geometry.keyboard[0] >= geometry.board[1], `Keyboard below board ${width}/${mode}`);
        assert.equal(await page.locator('#wl-guest').count(), 0);
        if (mode === 'active') {
          await page.locator('[data-letter="ӕ"]').click();
          assert.equal(await page.locator('#wl-input').inputValue(), 'ӕ');
          await page.locator('#wl-input').focus(); await page.keyboard.press('Backspace');
          assert.equal(await page.locator('#wl-input').inputValue(), '');
        }
        if ([1242, 1280, 920, 360].includes(width) && mode !== 'lost') await page.screenshot({ path: path.join(output, `${width}-${mode}.png`), fullPage: true });
        checks += 6;
      }
    }
    await page.locator('.wl-back').focus(); await page.keyboard.press('Enter');
    await page.waitForURL(base + '/games');
    assert.deepEqual(errors, []);
    console.log(`${checks} Wordle layout checks passed: eleven viewports, active/won/lost, visible back, board and keyboard without scrolling, mouse/physical keyboard and Ossetian input.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
