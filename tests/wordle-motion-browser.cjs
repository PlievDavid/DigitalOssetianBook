// Real guest game: animation behavior and reduced motion, without database writes.
// Run with ADAM_TEST_URL set to a local preview; requires Playwright and Edge.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../IronLanguage.Web/Data/wordle/words.json'), 'utf8'));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ reducedMotion, viewport: { width: 390, height: 844 } });
      try {
        await context.addInitScript(() => {
          window.motionCalls = [];
          const original = Element.prototype.animate;
          Element.prototype.animate = function (frames, options) {
            window.motionCalls.push({ frames, options, target: this.id || this.className });
            return original.call(this, frames, options);
          };
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/games/wordle');
        const idle = () => page.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
        await idle();
        assert.equal(await page.evaluate(() => motionCalls.length), 0, 'Opening a saved game does not animate.');
        const initial = await (await page.request.get(base + '/api/v1/wordle')).json();
        const index = ((Date.parse(initial.day) - Date.parse(data.startDate)) / 86400000 % 300 + 300) % 300;
        const answer = data.answers[index].word;
        await page.evaluate(() => { window.firstCell = document.querySelector('.wl-cell'); });
        await page.locator('#wl-input').fill('а');
        assert(await page.evaluate(() => firstCell === document.querySelector('.wl-cell')), 'Typing preserves cells and their running effects.');
        await page.locator('#wl-input').press('Enter');
        assert.equal(await page.locator('#wl-status').textContent(), 'Нужно пять букв.');
        let calls = await page.evaluate(() => motionCalls);
        if (reducedMotion === 'reduce') assert.equal(calls.length, 0);
        else {
          assert(calls.some(call => call.options.duration === 140), 'New letters have a small pop.');
          assert.equal(calls.filter(call => call.options.duration === 220).length, 5, 'Invalid input shakes only the current row.');
        }
        await page.locator('#wl-input').fill(answer);
        await page.evaluate(() => { window.motionCalls = []; });
        await page.locator('#wl-input').press('Enter'); await idle();
        assert.equal(await page.locator('#wl-board .is-correct').count(), 5);
        assert(await page.locator('#wl-notice').isHidden());
        calls = await page.evaluate(() => motionCalls);
        assert.equal(calls.filter(call => call.target === 'wl-notice').length, 0, 'Victory never animates a warning.');
        if (reducedMotion === 'reduce') assert.equal(calls.length, 0, 'Reduced motion skips all game effects.');
        else {
          const flips = calls.filter(call => call.options.duration === 360);
          assert.deepEqual(flips.map(call => call.options.delay), [0, 65, 130, 195, 260]);
          assert(flips.every(call => call.frames.some(frame => frame.transform?.includes('rotateX(90deg)'))));
          assert.equal(calls.filter(call => call.options.duration === 320).length, 5, 'Victory wave follows the reveal.');
          assert.equal(calls.filter(call => call.target === 'wl-result').length, 1);
        }
        await page.reload(); await idle();
        assert.equal(await page.evaluate(() => motionCalls.length), 0, 'Reload does not replay celebrations.');
        assert.equal(await page.locator('#wl-board .is-correct').count(), 5);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('Wordle motion passed: typing, stable cells, invalid input, staggered reveal, victory, reduced motion, reload and no overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
