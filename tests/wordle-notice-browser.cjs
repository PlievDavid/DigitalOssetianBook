const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date('2026-10-17T12:00:00Z') });
    await page.addInitScript(() => {
      window.noticeAppearances = [];
      new MutationObserver(() => {
        const notice = document.querySelector('#wl-notice');
        if (notice && !notice.hidden) window.noticeAppearances.push(notice.textContent.trim());
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output = path.resolve(__dirname, '../.run-local/wordle-notices');
    fs.mkdirSync(output, { recursive: true });
    await page.route('**/api/v1/wordle', route => route.fulfill({ json: {
      day: '2026-10-17', nextDay: '2026-10-18T00:00:00Z', revision: 0, rows: [], won: false, finished: false, answer: null, russian: null, countedInStreak: false
    } }));
    let failure = 400, requestReady, releaseRequest;
    await page.route('**/api/v1/wordle/guess', async route => {
      await new Promise(resolve => { releaseRequest = resolve; requestReady(); });
      if (['accepted', 'won', 'lost'].includes(failure)) {
        const won = failure === 'won';
        const finished = failure !== 'accepted';
        return route.fulfill({ json: {
          day: '2026-10-17', nextDay: '2026-10-18T00:00:00Z', revision: failure === 'lost' ? 6 : 1,
          rows: Array.from({ length: failure === 'lost' ? 6 : 1 }, () => ({ word: 'хӕдон', marks: Array(5).fill(won ? 'correct' : 'absent') })),
          won, finished, answer: finished ? 'хӕдон' : null, russian: finished ? 'рубашка' : null, countedInStreak: false
        } });
      }
      if (failure === 'network') return route.abort('failed');
      return route.fulfill({ status: failure, json: { error: failure === 400 ? 'Этого слова нет в нашем словаре. Попытка не потрачена.' : failure === 409 ? 'Игра изменилась в другой вкладке. Загружаем актуальные попытки.' : 'Не удалось проверить слово. Попробуйте ещё раз.' } });
    });
    const stable = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = () => page.evaluate(() => ['wl-board', 'wl-keyboard'].map(id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    }));
    const idle = () => page.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'false');
    const checkNotice = async () => {
      const position = await page.evaluate(() => {
        const board = document.querySelector('#wl-board').getBoundingClientRect();
        const notice = document.querySelector('#wl-notice').getBoundingClientRect();
        return { horizontal: notice.x + notice.width / 2 - board.x - board.width / 2,
          vertical: notice.y + notice.height / 2 - board.y - board.height / 2, width: notice.width };
      });
      assert(Math.abs(position.horizontal) <= 1, 'Notice is horizontally centered on the board');
      assert(Math.abs(position.vertical) <= 1, 'Notice is vertically centered on the board, not the whole game card');
      assert(Math.abs(position.width - 190) <= 1, 'Notice is compact');
    };
    for (const [width, height] of [[1242, 668], [1280, 720], [320, 568], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + '/games/wordle'); await idle();
      await page.evaluate(() => document.fonts.ready); await stable();
      assert(await page.locator('#wl-notice').isHidden(), 'Opening the game does not show a warning');
      assert.deepEqual(await page.evaluate(() => window.noticeAppearances), []);
      const before = await geometry();
      await page.locator('#wl-input').press('Enter');
      assert(await page.locator('#wl-notice').isVisible());
      assert.match(await page.locator('#wl-status').innerText(), /пять букв/);
      await checkNotice();
      assert.deepEqual(await geometry(), before, `Short input does not move the game at ${width}`);
      await page.clock.fastForward(3100);
      assert(await page.locator('#wl-notice').isHidden());
      assert(await page.locator('#wl-input').evaluate(el => el === document.activeElement));
      assert.deepEqual(await geometry(), before, `Automatic dismissal does not move the game at ${width}`);
      await page.locator('#wl-input').press('Enter');
      await page.clock.fastForward(2500);
      await page.locator('#wl-input').press('Enter');
      await page.clock.fastForward(1500);
      assert(await page.locator('#wl-notice').isVisible(), 'A new message restarts the timer');
      await page.clock.fastForward(1600);
      assert(await page.locator('#wl-notice').isHidden());
      for (failure of [400, 500, 'network', 409]) {
        await page.locator('#wl-input').fill('ааааа'); await stable();
        const typed = await geometry();
        const ready = new Promise(resolve => { requestReady = resolve; });
        await page.locator('#wl-input').press('Enter'); await ready;
        assert(await page.locator('#wl-notice').isHidden());
        await page.clock.fastForward(4000);
        assert(await page.locator('#wl-notice').isHidden(), 'Pending requests do not show a warning');
        assert.deepEqual(await geometry(), typed, `Pending request does not move the game at ${width}`);
        releaseRequest(); await idle(); await stable();
        assert(await page.locator('#wl-notice').isVisible());
        assert(await page.locator('#wl-input').isEnabled());
        await checkNotice();
        assert.deepEqual(await geometry(), before, `${failure} does not move the game at ${width}`);
        if (failure === 400) {
          assert.equal(await page.locator('#wl-notice-title').innerText(), 'Нет такого слова');
          assert.equal(await page.locator('#wl-notice-detail').innerText(), 'Попытка не потрачена');
          await page.screenshot({ path: path.join(output, `invalid-${width}.png`), fullPage: true });
          await page.setViewportSize({ width: width + 24, height: height + 80 }); await stable();
          await checkNotice();
          await page.setViewportSize({ width, height }); await stable();
        }
        if (failure === 400) await page.clock.fastForward(3100);
        else await page.keyboard.press('Escape');
        assert(await page.locator('#wl-notice').isHidden());
        assert.deepEqual(await geometry(), before, `Dismissing does not move the game at ${width}`);
      }
      await page.locator('#wl-input').fill('а'); await page.locator('#wl-input').press('Enter');
      assert(await page.locator('#wl-notice').isVisible());
      await page.locator('[data-letter="ӕ"]').click();
      assert(await page.locator('#wl-notice').isHidden());
      assert.equal(await page.locator('#wl-input').inputValue(), 'аӕ');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width >= 850) {
        const key = await page.locator('.wl-key').first().boundingBox();
        assert(key.height >= 34);
        assert((await page.locator('#wl-keyboard').boundingBox()).width > 420);
      }
      for (failure of ['accepted', 'won', 'lost']) {
        await page.goto(base + '/games/wordle'); await idle(); await stable();
        await page.locator('#wl-input').fill('хӕдон');
        await stable();
        const beforeFinish = await geometry();
        const ready = new Promise(resolve => { requestReady = resolve; });
        await page.locator('#wl-input').press('Enter'); await ready;
        assert(await page.locator('#wl-notice').isHidden());
        assert(await page.locator('#wl-input').isDisabled());
        await page.clock.fastForward(4000);
        assert(await page.locator('#wl-notice').isHidden());
        releaseRequest(); await idle(); await stable();
        assert.deepEqual(await geometry(), beforeFinish, `${failure} does not resize or move the board/keyboard at ${width}`);
        assert(await page.locator('#wl-notice').isHidden());
        assert.deepEqual(await page.evaluate(() => window.noticeAppearances), [], `${failure} never flashes a warning at ${width}`);
        if (failure !== 'accepted') {
          await page.locator('#wl-result').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#wl-board .is-correct').count(), failure === 'won' ? 5 : 0);
          assert.equal(await page.locator('#wl-translation').innerText(), 'рубашка');
          await page.screenshot({ path: path.join(output, `${failure}-${width}.png`), fullPage: true });
          await page.locator('#wl-result-close').focus(); await page.keyboard.press('Shift+Tab');
          assert(await page.locator('#wl-result-statistics').evaluate(element => element === document.activeElement));
          await page.keyboard.press('Tab');
          assert(await page.locator('#wl-result-close').evaluate(element => element === document.activeElement));
          await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
            configurable: true, value: { writeText: async () => {} }
          }));
          await page.locator('#wl-share').click();
          assert.equal(await page.locator('#wl-share').innerText(), 'Скопировано');
          assert.deepEqual(await page.evaluate(() => window.noticeAppearances), []);
          await page.clock.fastForward(3100);
          assert.equal(await page.locator('#wl-share').innerText(), 'Поделиться');
          await page.keyboard.press('Escape');
          assert(await page.locator('#wl-result').isHidden());
          assert(await page.locator('#wl-statistics').evaluate(element => element === document.activeElement));
          assert.deepEqual(await geometry(), beforeFinish, 'Closing the result does not change board geometry');
          await page.locator('#wl-statistics').click();
          assert(await page.locator('#wl-result').isVisible());
          await page.locator('#wl-result-statistics').click();
          assert(await page.locator('#wl-result').isHidden());
          assert(await page.locator('#wl-stats-dialog').isVisible());
          await page.keyboard.press('Escape');
          await page.locator('#wl-statistics').click(); await page.locator('#wl-result-close').click();
          assert.deepEqual(await geometry(), beforeFinish);
        } else {
          assert(await page.locator('#wl-result').isHidden());
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('Wordle notices/results passed: no warning on accepted guesses, stable board/keyboard before and after win/loss, separate result dialog, focus trap/Escape/reopen/statistics, compact centered errors, 3-second dismissal and ӕ at four viewports.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
