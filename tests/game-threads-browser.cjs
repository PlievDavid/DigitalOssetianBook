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
      for (const name of ['site', 'brand', 'features', 'theme-green', 'sections-green', 'game', 'layout'])
        await page.addStyleTag({ content: read(`IronLanguage.Web/wwwroot/css/${name}.css`) });
      await page.evaluate(({ count, authenticated }) => {
        window.AdamAuthenticated = authenticated;
        // Deliberately synthetic labels, not learning content or proposed translations.
        window.fixtures = Array.from({ length: count }, (_, i) => ({ id: i + 1, wordId: i + 1, ossetian: `Ӕӕ ${i + 1}`, russian: `Тест ${i + 1}` }));
        window.calls = []; window.fail = false; window.failLoad = false;
        window.AdamApi = async (url, options) => {
          calls.push({ url, options });
          await new Promise(resolve => setTimeout(resolve, 100));
          if (!options) { if (window.failLoad) { window.failLoad = false; throw new Error('Ошибка загрузки слов'); } return fixtures; }
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
    const socket = locator => locator.evaluate(element => {
      const style = getComputedStyle(element, '::after');
      return { border: style.borderTopColor, fill: style.backgroundColor };
    });
    const idle = () => page.waitForFunction(() => document.querySelector('#game-board').getAttribute('aria-busy') === 'false');
    await page.setViewportSize({ width: 1280, height: 900 });
    await setup();
    assert((await page.locator('.game-play-area').boundingBox()).width <= 760, 'Compact playing field');
    assert((await left(1).boundingBox()).width <= 240, 'Short words do not fill half the page');
    assert.notEqual(await left(1).evaluate(el => getComputedStyle(el).backgroundColor), await right(1).evaluate(el => getComputedStyle(el).backgroundColor), 'Language columns have distinct colors');
    assert.equal(await left(1).evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(237, 243, 248)', 'Unmatched words are pale blue, not success green');
    assert(await page.locator('.game-translation').evaluateAll(elements => elements.every(element => !element.style.getPropertyValue('--thread-color'))), 'Right sockets reveal no pair colors before confirmation');
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
    assert.equal(await page.locator('.game-thread-wrong').evaluate(element => getComputedStyle(element).stroke), 'rgb(180, 35, 24)', 'Wrong answers keep the red dashed thread');
    assert.equal(await page.locator('.game-thread-matched').count(), 0);
    assert(await left(1).isEnabled()); assert.match(await page.locator('#game-status').innerText(), /Тест 1/);
    // Pointer dragging checks a pair and keeps its thread after release.
    const a = await left(1).boundingBox(), b = await right(1).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
    assert.equal(await page.locator('.game-thread-active').count(), 1);
    const firstColor = await page.locator('.game-thread-active').evaluate(element => getComputedStyle(element).stroke);
    assert.notEqual(firstColor, 'rgb(180, 35, 24)', 'Pair colors do not use the error color');
    await page.mouse.up(); await idle();
    assert.equal(await page.locator('.game-thread-matched').count(), 1);
    assert.equal(await page.locator('.game-thread-matched').evaluate(element => getComputedStyle(element).stroke), firstColor, 'The confirmed pair keeps its dragging color');
    assert.deepEqual(await socket(left(1)), { border: firstColor, fill: firstColor });
    assert.deepEqual(await socket(right(1)), { border: firstColor, fill: firstColor });
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
        assert.equal(await page.locator('.game-thread-matched').first().evaluate(element => getComputedStyle(element).stroke), firstColor, 'Resize and enlarged text preserve the color');
        assert.deepEqual(await socket(left(1)), { border: firstColor, fill: firstColor });
        assert.deepEqual(await socket(right(1)), { border: firstColor, fill: firstColor });
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
    const colors = await page.locator('.game-thread-matched').evaluateAll(elements => elements.map(element => getComputedStyle(element).stroke));
    assert.equal(new Set(colors).size, 5, 'All five pairs have different colors regardless of matching order');
    assert.equal(colors[0], firstColor);
    for (const [index, id] of [1, 2, 3, 4, 5].entries()) {
      assert.deepEqual(await socket(left(id)), { border: colors[index], fill: colors[index] });
      assert.deepEqual(await socket(right(id)), { border: colors[index], fill: colors[index] });
    }
    assert.equal(await page.evaluate(() => calls.filter(x => x.options).length), 7);
    assert.match(await page.locator('#game-status').innerText(), /Все пары/);
    assert(await page.locator('#game-restart').evaluate(el => el === document.activeElement));
    fs.mkdirSync(path.join(root, '.run-local/game-threads'), { recursive: true });
    await page.screenshot({ path: path.join(root, '.run-local/game-threads/desktop.png'), fullPage: true });
    await page.evaluate(() => window.failLoad = true);
    await page.locator('#game-restart').click(); await idle();
    assert.match(await page.locator('#game-status').innerText(), /Ошибка загрузки слов/);
    assert.equal(await page.locator('#game-board').locator('*').count(), 0, 'Failed restart clears stale tiles and SVG');
    assert(await page.locator('#game-restart').isEnabled());
    await page.locator('#game-restart').click(); await idle();
    assert.equal(await page.locator('.game-thread').count(), 0); assert.equal(await page.locator('.game-word:enabled').count(), 5);
    assert(await page.locator('.game-translation').evaluateAll(elements => elements.every(element => !element.style.getPropertyValue('--thread-color'))), 'Restart removes confirmed right-side colors');
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
    // Native vertical touch must scroll when it starts on an unmatched left tile.
    await setup();
    await page.evaluate(() => { document.body.style.minHeight = '2000px'; window.scrollTo(0, 0); });
    const scrollTile = await left(1).boundingBox();
    const tx = scrollTile.x + scrollTile.width / 2, ty = scrollTile.y + scrollTile.height / 2;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    for (let dy = 15; dy <= 120; dy += 15) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx, y: ty - dy }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => scrollY > 30);
    assert.equal(await page.evaluate(() => calls.filter(x => x.options).length), 0, 'Scrolling never submits an answer');
    assert.equal(await page.locator('.game-thread-active').count(), 0, 'Cancelled touch leaves no thread');
    await setup(2, true); await left(1).click(); await right(1).click(); await idle();
    assert.equal(await page.evaluate(() => calls.at(-1).url), '/vocabulary/1/review');
    for (const count of [0, 1]) { await setup(count); assert(await page.locator('#game-find-words').isVisible()); assert.equal(await page.locator('.game-word').count(), 0); }
    assert.deepEqual(errors, []);
    console.log('Game threads: five stable colors, red errors, mouse, touch, keyboard, Escape, retry, request lock, completion, restart, 0/1/2/5 words, guest/account API, seven widths and 200% text passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
