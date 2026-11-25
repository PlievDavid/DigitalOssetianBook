const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const base = process.env.ADAM_TEST_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = path.resolve(__dirname, '../.run-local/home-navigation');
  fs.mkdirSync(output, { recursive: true });
  const routes = ['/audio-puzzles', '/listening', '/dialogs', '/translate', '/grammar', '/matching', '/picture', '/grouping'];
  try {
    for (const [width, dpr] of [[320, 1], [390, 2], [516, 1], [768, 1], [1242, 1]]) {
      const page = await browser.newPage({ viewport: { width, height: 667 }, deviceScaleFactor: dpr });
      page.setDefaultTimeout(7000);
      const errors = [];
      const images = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/kurt-tag-watercolor|\/green\/hero\.png/.test(request.url())) images.push(new URL(request.url()).pathname);
      });
      const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const pressLink = async (link, route) => {
        await link.focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(base + route);
      };
      await page.goto(base);
      const hero = page.locator('.home-hero');
      assert(await hero.getByRole('heading', { level: 1 }).isVisible());
      const image = hero.locator('.home-hero-art');
      assert(await image.evaluate(async img => { await img.decode(); return img.naturalWidth > 0 && img.fetchPriority === 'high'; }));
      assert.equal(images.length, 1);
      assert(images[0].endsWith('-440.webp'), images[0]);
      assert.equal(await hero.locator('.hero-actions').evaluate(el => getComputedStyle(el).animationName), 'home-arrive');
      if (width < 600) {
        const shortcuts = page.locator('#practice-formats .format-card');
        assert.deepEqual(await shortcuts.evaluateAll(cards => cards.map(card => card.pathname)),
          ['/courses', '/exercises', '/reading']);
        const lastShortcut = await shortcuts.last().boundingBox();
        const nav = await page.locator('.mobile-bottom-nav').boundingBox();
        assert(lastShortcut.y + lastShortcut.height < nav.y, 'Shortcuts fit above the bottom menu');
      }
      const reading = page.locator('.home-reading');
      await reading.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.home-reading').classList.contains('home-arrived') ||
        document.querySelector('.home-reading').getBoundingClientRect().height + scrollY <= innerHeight);
      await page.evaluate(() => window.scrollTo(0, 0));
      await noOverflow();
      await page.screenshot({ path: path.join(output, `home-${width}.png`), animations: 'disabled' });
      await pressLink(hero.getByRole('link', { name: 'Начать заниматься' }), '/exercises');
      const catalog = page.locator('.exercises-shell');
      assert(await catalog.getByRole('heading', { name: 'Задания', level: 1 }).isVisible());
      assert.deepEqual(await catalog.getByRole('heading', { level: 2 }).allTextContents(),
        ['На слух', 'Фразы', 'Слова']);
      assert.equal(await catalog.locator('.exercises-heading svg').count(), 0);
      assert(await catalog.locator('.exercises-heading, .exercise-category').evaluateAll(groups =>
        groups.every(group => getComputedStyle(group).borderTopWidth === '0px')));
      assert.deepEqual(await catalog.locator('.exercise-catalog-link').evaluateAll(cards => cards.map(card => card.pathname)), routes);
      const groups = catalog.locator('.exercise-category');
      assert.deepEqual(await groups.evaluateAll(items => items.map(el => getComputedStyle(el).animationDelay)),
        ['0.055s', '0.105s', '0.155s']);
      assert.equal(await groups.first().evaluate(el => getComputedStyle(el).animationName), 'catalog-enter');
      assert(await groups.evaluateAll(items => items.every((el, index) =>
        index === 0 || items[index - 1].offsetTop < el.offsetTop)));
      await noOverflow();
      await page.screenshot({ path: path.join(output, `exercises-${width}.png`), animations: 'disabled', fullPage: true });
      await pressLink(catalog.locator('a[href="/picture"]'), '/picture');
      await pressLink(page.getByRole('link', { name: 'К заданиям' }), '/exercises');
      const homeTab = page.locator('.mobile-bottom-nav a[href="/"]');
      await pressLink(width < 600 ? homeTab : page.getByRole('banner').getByRole('link', { name: 'Адам — главная' }), '/');
      if (width < 600) {
        assert.equal(await homeTab.getAttribute('aria-current'), 'page');
        const coursesTab = page.locator('.mobile-bottom-nav a[href="/courses"]');
        await pressLink(coursesTab, '/courses');
        assert.equal(await coursesTab.getAttribute('aria-current'), 'page');
        await pressLink(homeTab, '/');
        await pressLink(page.locator('#practice-formats a[href="/reading"]'), '/reading');
      } else if (width < 1024) {
        await page.locator('.mobile-menu-toggle').click();
        await pressLink(page.locator('.tablet-nav-group a[href="/exercises"]'), '/exercises');
      } else {
        const nav = page.locator('[aria-controls="practice-menu"]');
        await nav.focus();
        await page.keyboard.press('ArrowDown');
        assert(await page.locator('#practice-menu a').first().evaluate(el => document.activeElement === el));
        await page.keyboard.press('Escape');
        await pressLink(nav, '/exercises');
        assert.equal(await nav.getAttribute('aria-current'), 'page');
      }
      assert.deepEqual(errors, []);
      for (const route of ['/account/login', '/account/register']) {
        await page.goto(base + route);
        const form = page.locator('.auth-shell');
        const box = await form.boundingBox();
        assert(box.width <= 480.5, `Auth form at ${width}`);
        assert(await form.evaluate(el => {
          const scene = getComputedStyle(el.parentElement);
          const shell = getComputedStyle(el);
          const heading = el.querySelector('h1').getBoundingClientRect();
          const fields = el.querySelector('form').getBoundingClientRect();
          return scene.backgroundImage === 'none' && shell.boxShadow === 'none' &&
            shell.borderTopWidth === '0px' && Math.abs(heading.left - fields.left) < 1;
        }), `Plain auth layout at ${width}`);
        await form.locator('input').first().focus();
        await page.keyboard.press('Tab');
        assert(await form.locator('input').nth(1).evaluate(el => el === document.activeElement));
        await noOverflow();
      }
      console.log(`${width}px @${dpr}x: layout, account forms and keyboard navigation passed`);
      await page.goto(base + '/courses');
      await page.locator('.cm-discover h1').waitFor();
      assert.equal(await page.locator('.cm-discover').evaluate(el => getComputedStyle(el).animationName), 'catalog-enter');
      await noOverflow();
      await page.screenshot({ path: path.join(output, `courses-${width}.png`), animations: 'disabled' });
      await page.close();
    }
    for (const width of [1212, 575, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 678 } });
      await page.goto(base + '/exercises');
      const rows = page.locator('.exercise-catalog-link');
      assert.equal(await rows.count(), 8);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const data = await page.evaluate(async () => {
        const read = async path => {
          const response = await fetch('/api/v1/' + path);
          if (!response.ok) throw new Error('Catalog API returned ' + response.status);
          return response.json();
        };
        const [catalog, listening, dialogue, grammar, matching, picture, grouping] =
          await Promise.all(['catalog', 'listening', 'dialogs', 'grammars', 'matching', 'pictures', 'groupings'].map(read));
        return [catalog.exercises.filter(x => x.kind === 'audio').length, listening.length, dialogue.length,
          catalog.exercises.filter(x => x.kind === 'translation').length, grammar.length, matching.length, picture.length, grouping.length];
      });
      const labels = await rows.locator('.exercise-catalog-count').allTextContents();
      assert.deepEqual(labels, data.map(String));
      assert(await rows.evaluateAll(links => {
        const firstTitle = links[0].querySelector('.exercise-catalog-title').offsetLeft;
        return links.every(link => {
          const title = link.querySelector('.exercise-catalog-title');
          const quantity = link.querySelector('.exercise-quantity');
          return title.offsetLeft === firstTitle && title.offsetLeft < quantity.offsetLeft &&
            Math.abs(quantity.getBoundingClientRect().right - link.getBoundingClientRect().right +
              parseFloat(getComputedStyle(link).paddingRight)) < 1;
        });
      }));
      const firstRow = rows.first();
      await firstRow.focus();
      for (let index = 1; index < 8; index++) {
        await page.keyboard.press('Tab');
        assert(await rows.nth(index).evaluate(el => el === document.activeElement));
      }
      await page.keyboard.press('Shift+Tab');
      assert(await rows.nth(6).evaluate(el => el === document.activeElement));
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.scrollTo(0, 0);
      });
      assert(await page.locator('.exercises-heading h1').evaluate(el => {
        const main = document.querySelector('#main-content');
        const left = main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft);
        return Math.abs(el.getBoundingClientRect().left - left) <= 1;
      }));
      assert.equal(await page.locator('.exercises-heading h1').evaluate(el => getComputedStyle(el).fontSize), width >= 600 ? '30px' : '28px');
      assert(await rows.evaluateAll(links => links.every(link => link.offsetHeight >= 44)));
      const animation = page.locator('.exercise-category').last();
      await animation.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      if (width >= 390) {
        const last = await rows.last().boundingBox();
        const visibleBottom = width >= 600 ? 678 : (await page.locator('.mobile-bottom-nav').boundingBox()).y;
        assert(last.y + last.height <= visibleBottom, `Last row clipped at ${width}`);
        assert.equal(await page.evaluate(() => scrollY), 0);
      } else {
        await page.addStyleTag({ content: 'html { font-size: 175%; }' });
        await rows.nth(6).focus();
        await page.keyboard.press('Tab');
        assert(await rows.last().evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await page.screenshot({ path: path.join(output, `exercise-acceptance-${width}.png`), animations: 'disabled' });
      await page.close();
    }
    console.log('Exercise counts match all eight lists and align on the right; target viewports fit and the 320px focused layout reflows.');
    const reduced = await browser.newPage({ reducedMotion: 'reduce' });
    await reduced.goto(base);
    await reduced.locator('.home-reading').scrollIntoViewIfNeeded();
    assert.equal(await reduced.locator('.hero-actions').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await reduced.locator('.home-arrived').count(), 0);
    await reduced.goto(base + '/exercises');
    assert.equal(await reduced.locator('.exercise-catalog-link').first().evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    assert.equal(await reduced.locator('.exercise-category').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await reduced.close();
    console.log('Reduced motion passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
