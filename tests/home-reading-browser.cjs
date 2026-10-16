// Read-only checks of the actual homepage, without replacing its markup or styles.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [320, 360, 600, 700, 768, 1024, 1480, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.locator('.reading-flow').evaluate(el => {
        const typography = selector => [...el.querySelectorAll(selector)].map(node => { const s = getComputedStyle(node); return [s.fontSize, s.lineHeight]; });
        return { paragraphs: typography('article p, aside p'), headings: typography('h3'), buttons: [...el.querySelectorAll('.theme-button')].map(node => [node.getBoundingClientRect().width, node.parentElement.getBoundingClientRect().width]) };
      });
      assert.deepEqual(geometry.paragraphs[0], geometry.paragraphs[1]);
      assert.deepEqual(geometry.headings[0], geometry.headings[1]);
      for (const [button, card] of geometry.buttons) assert(button < 300 && button < card - 20, `Stretched button at ${width}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
    }
    assert.deepEqual(await page.locator('.reading-flow a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), ['/books', '/word-practice']);
    await page.setViewportSize({ width: 360, height: 900 });
    await page.addStyleTag({ content: '.green-theme .reading-flow h3 {font-size:40px!important}.green-theme .reading-flow p {font-size:30px!important}' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.reading-flow a').first().focus();
    await page.keyboard.press('Tab');
    assert(await page.locator('.reading-flow a').last().evaluate(node => node === document.activeElement));
    console.log('Homepage reading flow: eight widths, matching typography, compact buttons, links, enlarged text and keyboard passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
