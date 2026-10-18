const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const state = { day: '2026-10-18', nextDay: '2099-10-19T00:00:00Z', revision: 0, rows: [], won: false, finished: false };
    let requests = 0, release;
    await page.route('**/api/v1/wordle', async route => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, json: { error: 'Повторите загрузку' } });
      await new Promise(resolve => { release = resolve; });
      return route.fulfill({ json: state });
    });
    await page.goto(base + '/games/wordle');
    await page.locator('#wl-retry').waitFor({ state: 'visible' });
    await page.locator('#wl-retry').click();
    await page.waitForFunction(() => document.querySelector('#wl-board').getAttribute('aria-busy') === 'true');
    await page.evaluate(() => {
      for (let i = 0; i < 4; i++) document.querySelector('#wl-retry').dispatchEvent(new MouseEvent('click'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // A same-origin fetch is a barrier for the already dispatched requests.
    await page.request.get(base + '/games');
    assert.equal(requests, 2, 'Concurrent retry triggers share one GET');
    assert(await page.locator('#wl-input').isDisabled());
    release();
    await page.waitForFunction(() => !document.querySelector('#wl-input').disabled);
    await page.locator('#wl-input').fill('ӕрвон');
    let postRelease;
    await page.route('**/api/v1/wordle/guess', async route => {
      await new Promise(resolve => { postRelease = resolve; });
      return route.fulfill({ status: 409, json: { error: 'Состояние изменилось' } });
    });
    const posted = page.waitForRequest('**/api/v1/wordle/guess');
    await page.locator('#wl-input').press('Enter');
    await posted;
    const refreshed = page.waitForRequest('**/api/v1/wordle');
    postRelease();
    await refreshed;
    assert(await page.locator('#wl-input').isDisabled(), 'Conflict refresh keeps input locked');
    await page.evaluate(() => document.querySelector('#wl-retry').dispatchEvent(new MouseEvent('click')));
    await page.request.get(base + '/games');
    assert.equal(requests, 3, 'Conflict refresh shares its GET with retry');
    release();
    await page.waitForFunction(() => !document.querySelector('#wl-input').disabled);
    assert.equal(await page.locator('#wl-input').inputValue(), '');
    await page.unroute('**/api/v1/wordle');
    await page.route('**/api/v1/wordle', route => route.fulfill({ json: state }));
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['/games', '/games/crosswords', '/games/wordle']) {
        await page.goto(base + route);
        assert(await page.locator('.guest-notice').isVisible(), `Guest notice ${route} at ${width}`);
        assert.equal(new URL(await page.locator('.guest-notice a').getAttribute('href'), base).searchParams.get('ReturnUrl'), route);
      }
      await page.goto(base + '/');
      await page.locator('#games').focus();
      const focus = await page.locator('#games').evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, active: document.activeElement === el }));
      assert(focus.active && focus.outline !== 'none', 'Games section has visible keyboard focus');
    }
    console.log('PR51 refresh checks passed: concurrent retries, conflict recovery, busy input, guest notice and keyboard focus at phone/desktop widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
