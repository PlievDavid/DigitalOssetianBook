// Actual Razor page and styles, isolated API fixtures; no material or progress writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let sequence = 0, calls = 0, fail = false, held = null, hold = false, pairCount = 2;
    const states = new Map();
    await page.route('**/api/v1/matching**', async route => {
      const url = new URL(route.request().url()).pathname;
      if (url === '/api/v1/matching') return route.fulfill({ json: [{ id: 'fixture', title: 'Проверка соединений' }] });
      if (url.endsWith('/sessions')) {
        const id = 'session-' + (++sequence); states.set(id, new Set());
        return route.fulfill({ json: { sessionId: id, materialId: 'fixture', title: 'Проверка соединений', matched: 0, total: pairCount, finished: false, words: [],
          left: Array.from({ length: pairCount }, (_, index) => ({ index, text: `Ӕӕ ${index + 1}`, matched: false })),
          right: [...Array.from({ length: pairCount }, (_, index) => ({ index, text: `Тест ${index + 1}`, matched: false })).reverse(), { index: pairCount, text: 'Лишний вариант', matched: false }]
        } });
      }
      if (url.endsWith('/check')) {
        calls++;
        const sid = url.split('/').at(-2), { leftIndex, rightIndex } = route.request().postDataJSON();
        if (hold) { hold = false; await new Promise(resolve => { held = resolve; }); }
        if (fail) { fail = false; return route.fulfill({ status: 503, json: { error: 'Ошибка тестовой сети' } }); }
        const solved = states.get(sid), correct = leftIndex === rightIndex;
        if (correct) solved.add(leftIndex);
        return route.fulfill({ json: { correct, matched: solved.size, total: pairCount, finished: solved.size === pairCount } });
      }
      throw new Error('Unexpected fixture API: ' + url);
    });
    const left = i => page.locator('#matching-left [data-index="' + i + '"]');
    const right = i => page.locator('#matching-right [data-index="' + i + '"]');
    const socket = locator => locator.evaluate(element => {
      const style = getComputedStyle(element, '::after');
      return { border: style.borderTopColor, fill: style.backgroundColor };
    });
    const start = async () => { await page.goto(base + '/matching'); await page.getByRole('button', { name: 'Начать →' }).click(); await left(0).waitFor(); };
    const idle = () => page.waitForFunction(() => document.querySelector('#matching-board').getAttribute('aria-busy') === 'false');
    fs.mkdirSync(path.join(__dirname, '../.run-local/matching-threads'), { recursive: true });
    for (const width of [320, 360, 600, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await start();
      await page.mouse.move(1, 1);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#matching-left button')).backgroundColor === 'rgb(237, 243, 248)');
      assert(await page.locator('.section-symbol svg rect').count() >= 2, 'Matching heading has a card icon');
      assert((await page.locator('#matching-play').boundingBox()).width <= 760.5);
      assert.notEqual(await left(0).evaluate(el => getComputedStyle(el).backgroundColor), await right(0).evaluate(el => getComputedStyle(el).backgroundColor));
      assert.equal(await left(0).evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(237, 243, 248)');
      assert(await page.locator('#matching-right button').evaluateAll(elements => elements.every(element => !element.style.getPropertyValue('--thread-color'))), 'Right sockets stay neutral until the server confirms a pair');
      await left(0).focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
      assert.equal(await left(0).getAttribute('aria-pressed'), 'false');
      await left(0).click(); await right(2).click(); await idle();
      assert.match(await page.locator('#matching-result').innerText(), /Не подходит/);
      assert.equal(await page.locator('.game-thread-matched').count(), 0);
      const a = await left(0).boundingBox(), b = await right(0).boundingBox();
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
      const firstColor = await page.locator('.game-thread-active').evaluate(element => getComputedStyle(element).stroke);
      await page.mouse.up(); await idle();
      assert.equal(await page.locator('.game-thread-matched').count(), 1);
      assert.equal(await page.locator('.game-thread-matched').evaluate(element => getComputedStyle(element).stroke), firstColor, 'Pair keeps its color after confirmation');
      assert.deepEqual(await socket(left(0)), { border: firstColor, fill: firstColor });
      assert.deepEqual(await socket(right(0)), { border: firstColor, fill: firstColor });
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#matching-left .matched')).backgroundColor === 'rgb(220, 235, 220)');
      if ([360, 1280].includes(width)) await page.screenshot({ path: path.join(__dirname, `../.run-local/matching-threads/partial-${width}.png`), fullPage: true });
      assert(await left(0).isDisabled()); assert(await right(0).isDisabled());
      assert(await left(1).evaluate(el => el === document.activeElement));
      await page.keyboard.press('Enter'); await right(1).focus(); await page.keyboard.press('Space'); await idle();
      assert.equal(await page.locator('.game-thread-matched').count(), 2);
      assert.equal(new Set(await page.locator('.game-thread-matched').evaluateAll(elements => elements.map(element => getComputedStyle(element).stroke))).size, 2, 'Pairs use different colors');
      assert(await page.locator('#matching-summary').isVisible());
      await page.locator('.matching-tile').evaluateAll(nodes => nodes.forEach(el => el.style.fontSize = '32px'));
      await page.waitForTimeout(50);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No overflow with 200% tile text');
      const endpoints = await page.locator('.game-thread-matched').first().evaluate(el => { const p = el.getPointAtLength(0); return [p.x, p.y]; });
      const expected = await left(0).evaluate(el => { const r = el.getBoundingClientRect(), b = el.closest('#matching-board').getBoundingClientRect(); return [r.right - b.left, r.top + r.height / 2 - b.top]; });
      assert(endpoints.every((value, i) => Math.abs(value - expected[i]) < 1), 'Threads follow enlarged text');
      assert.equal(await page.locator('.game-thread-matched').first().evaluate(element => getComputedStyle(element).stroke), firstColor, 'Enlarged text preserves the color');
      assert.deepEqual(await socket(left(0)), { border: firstColor, fill: firstColor });
      assert.deepEqual(await socket(right(0)), { border: firstColor, fill: firstColor });
      if ([360, 1280].includes(width)) await page.screenshot({ path: path.join(__dirname, '../.run-local/matching-threads/' + width + '.png'), fullPage: true });
    }
    // Network retry keeps selection; pending old response never unlocks a new board.
    await start(); fail = true;
    await left(0).click(); await right(0).click(); await idle();
    assert.equal(await left(0).getAttribute('aria-pressed'), 'true');
    await right(0).click(); await idle(); assert.equal(await page.locator('.game-thread-matched').count(), 1);
    hold = true; await left(1).click(); await right(1).click();
    await page.locator('#matching-back-link').click(); await page.getByRole('button', { name: 'Начать →' }).click();
    await left(0).click(); await right(0).click(); await idle();
    assert.equal(await page.locator('.game-thread-matched').count(), 1);
    held(); await page.waitForTimeout(150);
    assert.equal(await page.locator('.game-thread-matched').count(), 1);
    assert(await left(1).isEnabled());
    // Native touch drag and vertical scroll on the same left tile.
    await page.setViewportSize({ width: 360, height: 900 }); await start();
    const client = await page.context().newCDPSession(page);
    let a = await left(0).boundingBox(), b = await right(0).boundingBox();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await idle();
    assert.equal(await page.locator('.game-thread-matched').count(), 1);
    await page.evaluate(() => { document.body.style.minHeight = '2400px'; window.scrollTo(0, 0); });
    a = await left(1).boundingBox();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }] });
    for (let dy = 15; dy <= 120; dy += 15) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 - dy }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForFunction(() => scrollY > 30);
    assert.equal(await page.locator('.game-thread-active').count(), 0);
    pairCount = 10;
    await page.setViewportSize({ width: 1280, height: 1200 }); await start();
    const solveOrder = [9, 0, 8, 1, 7, 2, 6, 3, 5, 4];
    for (const index of solveOrder) {
      await left(index).click(); await right(index).click(); await idle();
    }
    const colors = await page.locator('.game-thread-matched').evaluateAll(elements => elements.map(element => getComputedStyle(element).stroke));
    assert.equal(new Set(colors).size, 10, 'The maximum board uses ten different colors');
    assert(!colors.includes('rgb(180, 35, 24)'), 'Red is reserved for errors');
    for (const [position, index] of solveOrder.entries()) {
      assert.deepEqual(await socket(left(index)), { border: colors[position], fill: colors[position] });
      assert.deepEqual(await socket(right(index)), { border: colors[position], fill: colors[position] });
    }
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 1200 });
      await page.waitForTimeout(50);
      assert.deepEqual(await page.locator('.game-thread-matched').evaluateAll(elements => elements.map(element => getComputedStyle(element).stroke)), colors, 'Resize preserves every assigned color');
      await page.screenshot({ path: path.join(__dirname, `../.run-local/matching-threads/colors-${width}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('Matching threads passed: ten stable colors, seven widths, mouse/touch drag, keyboard, Escape, wrong answer, network retry, session race, completion and vertical scrolling.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
