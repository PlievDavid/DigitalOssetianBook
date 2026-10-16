// Real game view, scripts and styles, with isolated API fixtures; no database writes.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    async function setup(count = 5, authenticated = false) {
      await page.setContent('<body class="green-theme">' + read('IronLanguage.Web/Views/Practice/Game.cshtml').match(/<section[\s\S]*<\/section>/)[0] + '</body>');
      for (const name of ['site', 'brand', 'features', 'theme-green', 'sections-green'])
        await page.addStyleTag({ content: read(`IronLanguage.Web/wwwroot/css/${name}.css`) });
      await page.evaluate(({ count, authenticated }) => {
        window.AdamAuthenticated = authenticated;
        // Deliberately synthetic labels, not learning content or proposed translations.
        window.fixtures = Array.from({ length: count }, (_, i) => ({ id: i + 1, wordId: i + 1, ossetian: `Ӕӕ ${i + 1}`, russian: `Тест ${i + 1}` }));
        window.calls = []; window.fail = false;
        window.AdamApi = async (url, options) => {
          calls.push({ url, options });
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!options) return fixtures;
          if (window.fail) { window.fail = false; throw new Error('Ошибка тестовой сети'); }
          const id = Number(url.split('/')[2]), expected = fixtures.find(x => x.wordId === id).russian;
          return { correct: JSON.parse(options.body).translation === expected, expected };
        };
      }, { count, authenticated });
      await page.addScriptTag({ content: read('IronLanguage.Web/wwwroot/js/game.js') });
      await page.waitForFunction(() => document.querySelector('#game-board').getAttribute('aria-busy') === 'false');
    }
    const left = id => page.getByRole('button', { name: `Ӕӕ ${id}`, exact: true });
    const right = id => page.getByRole('button', { name: `Тест ${id}`, exact: true });
    const idle = () => page.waitForFunction(() => document.querySelector('#game-board').getAttribute('aria-busy') === 'false');
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup();
    await right(1).click(); assert.match(await page.locator('#game-status').innerText(), /Сначала/);
    assert.equal(await page.evaluate(() => calls.length), 1);
    // Selection preserves DOM focus; Escape cancels without a request.
    await left(1).focus(); await page.keyboard.press('Enter');
    assert.equal(await left(1).getAttribute('aria-pressed'), 'true');
    assert(await left(1).evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape'); assert.equal(await left(1).getAttribute('aria-pressed'), 'false');
    await left(1).click(); await right(2).click();
    assert.equal(await page.locator('#game-board').getAttribute('aria-busy'), 'true');
    assert(await page.locator('#game-restart').isDisabled());
    await idle(); assert.equal(await page.locator('.game-thread-wrong').count(), 1);
    assert.equal(await page.locator('.game-thread-matched').count(), 0);
    assert(await left(1).isEnabled()); assert.match(await page.locator('#game-status').innerText(), /Тест 1/);
    // Pointer dragging checks a pair and keeps its thread after release.
    const a = await left(1).boundingBox(), b = await right(1).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    assert.equal(await page.locator('.game-thread-active').count(), 1);
    await page.mouse.up(); await idle();
    assert.equal(await page.locator('.game-thread-matched').count(), 1);
    assert(await left(1).isDisabled()); assert(await right(1).isDisabled());
    // Resize and increased text must keep endpoints on the actual buttons.
    for (const width of [320, 360, 600, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const scale of [1, 2]) {
        await page.locator('#game-board button').evaluateAll((buttons, scale) => buttons.forEach(b => b.style.fontSize = `${16 * scale}px`), scale);
        await page.waitForTimeout(50);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow: ${width}/${scale}`);
        const expected = await left(1).evaluate(el => { const a = el.getBoundingClientRect(), b = el.closest('#game-board').getBoundingClientRect(); return [a.right - b.left, a.top + a.height / 2 - b.top]; });
        const actual = await page.locator('.game-thread-matched').evaluate(el => { const p = el.getPointAtLength(0); return [p.x, p.y]; });
        assert(Math.abs(actual[0] - expected[0]) < 1 && Math.abs(actual[1] - expected[1]) < 1, 'Thread follows word after resize');
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.fail = true);
    await left(2).click(); await right(2).click(); await idle();
    assert.match(await page.locator('#game-status').innerText(), /Ошибка тестовой сети/);
    assert.equal(await left(2).getAttribute('aria-pressed'), 'true');
    // Keyboard completion; rapid double dispatch creates a single review request.
    for (const id of [2, 3, 4, 5]) {
      if (id !== 2) { await left(id).focus(); await page.keyboard.press('Enter'); }
      await right(id).focus(); await page.keyboard.press('Space');
      await right(id).evaluate(el => el.click()); await idle();
    }
    assert.equal(await page.locator('.game-thread-matched').count(), 5);
    assert.equal(await page.evaluate(() => calls.filter(x => x.options).length), 7);
    assert.match(await page.locator('#game-status').innerText(), /Все пары/);
    assert(await page.locator('#game-restart').evaluate(el => el === document.activeElement));
    fs.mkdirSync(path.join(root, '.run-local/game-threads'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.run-local/game-threads/desktop.png'), fullPage: true });
    await page.locator('#game-restart').click(); await idle();
    assert.equal(await page.locator('.game-thread').count(), 0); assert.equal(await page.locator('.game-word:enabled').count(), 5);
    // Drop outside the board never submits; the selection can be reused.
    const c = await left(1).boundingBox();
    await page.mouse.move(c.x + 10, c.y + 10); await page.mouse.down(); await page.mouse.move(2, 2, { steps: 4 }); await page.mouse.up();
    assert.equal(await page.locator('.game-thread').count(), 0);
    assert.equal(await left(1).getAttribute('aria-pressed'), 'true');
    // Touch pointer path, using Chromium's native touch input.
    await page.setViewportSize({ width: 360, height: 900 });
    const client = await page.context().newCDPSession(page);
    const t1 = await left(1).boundingBox(), t2 = await right(1).boundingBox();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: t1.x + t1.width / 2, y: t1.y + t1.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: t2.x + t2.width / 2, y: t2.y + t2.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await idle();
    assert.equal(await page.locator('.game-thread-matched').count(), 1);
    await page.screenshot({ path: path.join(root, '.run-local/game-threads/mobile.png'), fullPage: true });
    await setup(2, true); await left(1).click(); await right(1).click(); await idle();
    assert.equal(await page.evaluate(() => calls.at(-1).url), '/vocabulary/1/review');
    for (const count of [0, 1]) { await setup(count); assert(await page.locator('#game-find-words').isVisible()); assert.equal(await page.locator('.game-word').count(), 0); }
    assert.deepEqual(errors, []);
    console.log('Game threads: mouse, touch, keyboard, Escape, wrong answer, retry, request lock, completion, restart, 0/1/2/5 words, guest/account API, seven widths and 200% text passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
