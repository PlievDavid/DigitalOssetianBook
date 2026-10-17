// Real guest crossword animation checks; no database progress is written.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const levels = JSON.parse(fs.readFileSync(path.join(__dirname, '../IronLanguage.Web/Data/crosswords/levels.json'), 'utf8'));
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
            motionCalls.push({ frames, options, target: this.id || this.className });
            return original.call(this, frames, options);
          };
        });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/games/crosswords');
        await page.locator('.cw-card').first().click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => motionCalls.length), 0, 'Opening a level does not replay effects.');
        const words = levels[0].words;
        async function pasteWord(word, text = word.answer) {
          await page.locator(`.cw-clue[data-id="${word.id}"]`).click();
          await page.locator(`input[data-key="${word.row},${word.column}"]`).evaluate((input, text) => {
            const data = new DataTransfer(); data.setData('text', text);
            input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
          }, text);
        }
        await pasteWord(words[0]);
        let calls = await page.evaluate(() => motionCalls);
        assert.equal(calls.filter(call => call.options.duration === 140).length, reducedMotion === 'reduce' ? 0 : words[0].answer.length);
        await page.evaluate(() => { window.motionCalls = []; });
        const idle = () => page.waitForFunction(() => document.querySelector('#cw-play').getAttribute('aria-busy') === 'false');
        await page.locator('#cw-check').click(); await idle();
        calls = await page.evaluate(() => motionCalls);
        if (reducedMotion === 'reduce') assert.equal(calls.length, 0);
        else {
          assert(calls.some(call => call.options.duration === 300), 'Only server-verified words celebrate.');
          assert(calls.some(call => call.target === 'cw-progress'));
        }
        await page.evaluate(() => { window.motionCalls = []; });
        await page.locator('#cw-check').click(); await idle();
        assert.equal(await page.evaluate(() => motionCalls.length), 0, 'Repeated checking does not replay solved effects.');
        for (const word of words.slice(1)) await pasteWord(word);
        await page.evaluate(() => { window.motionCalls = []; });
        await page.locator('#cw-check').click(); await idle();
        assert.equal(await page.locator('#cw-progress .cw-star.is-earned').count(), 3);
        calls = await page.evaluate(() => motionCalls);
        if (reducedMotion === 'reduce') assert.equal(calls.length, 0);
        else assert(calls.some(call => call.target === 'cw-progress' && call.frames.some(frame => frame.transform === 'translateY(-4px)')));
        await page.locator('#cw-back').click();
        await page.evaluate(() => { window.motionCalls = []; });
        await page.locator('.cw-card').first().click(); await page.locator('#cw-play').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => motionCalls.length), 0, 'Reopening a solved level does not replay effects.');
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
    console.log('Crossword motion passed: typing, server verification, repeated check, completion, reopen and reduced motion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
