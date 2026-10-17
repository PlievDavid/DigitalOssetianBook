const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const artwork = ['family', 'home', 'nature', 'weather', 'table', 'garden', 'pets', 'wildlife', 'person', 'clothing'];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const output = path.resolve(__dirname, '../.run-local/crossword-cards');
    fs.mkdirSync(output, { recursive: true });
    const response = await page.request.get(`${base}/api/v1/crosswords`);
    assert.equal(response.status(), 200);
    const levels = await response.json();
    assert.equal(levels.length, 10);
    async function ready() {
      await page.goto(`${base}/games/crosswords`);
      await page.waitForFunction(() => document.querySelectorAll('.cw-card').length === 10);
      await page.evaluate(() => document.fonts.ready);
    }
    for (const width of [320, 390, 600, 768, 920, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await ready();
      const cards = page.locator('.cw-card');
      for (let index = 0; index < levels.length; index++) {
        const card = cards.nth(index);
        const image = card.locator('img');
        await card.scrollIntoViewIfNeeded();
        await image.evaluate(image => image.decode());
        assert.equal(await image.getAttribute('src'), `/images/crosswords/${artwork[levels[index].id - 1]}-v1.png`);
        assert.equal(await image.getAttribute('alt'), '');
        assert.equal(await image.getAttribute('aria-hidden'), 'true');
        assert.equal(await card.locator('strong').innerText(), levels[index].title);
        assert.equal(await card.locator('.cw-card-count').innerText(), `${levels[index].solved} из ${levels[index].total} слов`);
        assert.equal(await card.locator('.cw-stars').getAttribute('data-rating'), String(levels[index].stars));
      }
      for (const scale of [1, 2]) {
        if (scale === 2) await cards.locator('.cw-card-copy > *').evaluateAll(elements => {
          for (const element of elements) element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 2}px`;
        });
        const geometry = await cards.evaluateAll(elements => elements.map(element => {
          const card = element.getBoundingClientRect();
          const copy = element.querySelector('.cw-card-copy').getBoundingClientRect();
          const art = element.querySelector('img').getBoundingClientRect();
          return { left: card.left, top: card.top, right: card.right, copyRight: copy.right, artLeft: art.left,
            inside: copy.left >= card.left && copy.bottom <= card.bottom && art.right <= card.right && art.bottom <= card.bottom,
            clipped: element.scrollWidth > element.clientWidth };
        }));
        assert(geometry.every(card => card.inside && !card.clipped && card.copyRight <= card.artLeft), `No art/text overlap at ${width}px, text ${scale}x`);
        assert.equal(geometry.filter(card => card.top === geometry[0].top).length, width <= 599 ? 1 : width <= 850 ? 2 : 3);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.evaluate(() => window.scrollTo(0, 0));
        if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(output, `${width}-${scale}x.png`), fullPage: true });
      }
    }
    await ready();
    await page.locator('.cw-card').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('#cw-play').waitFor({ state: 'visible' });
    assert.match(await page.locator('#cw-title').innerText(), /^1\./);
    await page.locator('#cw-back').click();
    assert(await page.locator('.cw-card').first().evaluate(element => element === document.activeElement));
    const art = page.locator('.cw-card').last().locator('img');
    await art.scrollIntoViewIfNeeded();
    const bounds = await art.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.locator('#cw-play').waitFor({ state: 'visible' });
    assert.match(await page.locator('#cw-title').innerText(), /^10\./);
    await page.route('**/images/crosswords/family-v1.png', route => route.fulfill({ status: 404, body: '' }));
    await ready();
    await page.waitForFunction(() => !document.querySelector('.cw-card').classList.contains('has-art'));
    assert.equal(await page.locator('.cw-card').first().locator('img').count(), 0);
    assert.equal(await page.locator('.cw-card').first().locator('strong').innerText(), levels[0].title);
    await page.locator('.cw-card').first().click();
    await page.locator('#cw-play').waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log('Crossword cards passed: 10 real levels and assets, 7 widths, doubled text, art/text geometry, keyboard, image click and missing-image fallback.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
