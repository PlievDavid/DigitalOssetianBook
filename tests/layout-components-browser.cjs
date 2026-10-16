// Real styles and scripts with header/editor fixtures; no account or database writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'IronLanguage.Web/Views/Shared/_Layout.cshtml'), 'utf8');
// Parse the slot as HTML in the browser so whitespace and nested markup may change.
const headerStart = layout.indexOf('<header');
const header = layout.slice(headerStart, layout.indexOf('</header>', headerStart) + '</header>'.length);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let checks = 0;
  try {
    const page = await browser.newPage();
    const slot = await page.evaluate(markup => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const slot = doc.querySelector('.header-streak-slot');
      if (!slot) throw new Error('Missing streak slot in shared layout');
      slot.querySelectorAll('[src^="~/"]').forEach(el => el.setAttribute('src', el.getAttribute('src').slice(1)));
      return slot.outerHTML;
    }, header);
    for (const width of [360, 600, 768, 1024, 1280, 1480, 1920]) {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ['/account/login', '/account/register']) {
        await page.goto(base + route);
        const box = await page.locator('.auth-shell').boundingBox();
        assert(box.width <= 480.5, `Auth card at ${width}`); checks++;
      }
      await page.goto(base + '/books');
      await page.locator('.book-card').first().waitFor();
      if (width > 700) {
        for (const card of await page.locator('.book-card').all()) {
          assert((await card.boundingBox()).width <= 240.5, `Book card at ${width}`); checks++;
        }
      }
      await page.goto(base);
      await page.evaluate(() => {
        document.body.classList.add('editor-page');
        document.querySelector('main').innerHTML = '<section class="feature-shell editor-preview-shell"><div class="editor-preview-actions"><a class="button secondary" href="#">Изменить</a><form class="editor-publish-form"><label><input type="checkbox"> Я проверил текст, перевод и права на публикацию</label><button class="button primary">Опубликовать</button></form></div></section>';
      });
      for (const button of await page.locator('.editor-preview-actions .button').all()) {
        assert((await button.boundingBox()).width < 230, `Preview button at ${width}`); checks++;
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); checks++;
      if (width < 1024) continue;
      for (const count of [0, 3, 12, 365, 9999, null]) {
        await page.goto(base);
        await page.evaluate(markup => {
          document.querySelector('.header-actions').innerHTML = markup + '<a class="profile-action" href="/profile" aria-label="Профиль"><span style="display:block;width:37px;height:37px"></span></a>';
          window.AdamApi = () => new Promise((resolve, reject) => { window.resolveProgress = resolve; window.rejectProgress = reject; });
        }, slot);
        await page.addScriptTag({ path: path.join(root, 'IronLanguage.Web/wwwroot/js/streak.js') });
        const positions = () => page.locator('.brand, .main-nav, .header-inner, .profile-action').evaluateAll(nodes => nodes.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
        const before = await positions();
        await page.evaluate(value => value === null ? window.rejectProgress(new Error('offline')) : window.resolveProgress({ streak: value }), count);
        assert.deepEqual(await positions(), before, `Streak shifted header at ${width}, count=${count}`); checks++;
        assert.equal(await page.locator('#header-streak').isVisible(), count !== null && count > 0); checks++;
      }
    }
    console.log(`${checks} component checks passed: compact auth/editor controls, delayed streak, zero streak and API failure.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
