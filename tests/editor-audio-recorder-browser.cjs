// Real browser MediaRecorder with a synthetic microphone; no accounts or database writes.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'IronLanguage.Web/wwwroot', file), 'utf8');
const trimming = fs.readFileSync(path.join(root, 'IronLanguage.Web/Views/EditorWorkflow/Form.cshtml'), 'utf8')
  .match(/<fieldset id="audio-trim"[\s\S]*?<\/fieldset>/)[0];
const html = `<html lang="ru"><head><meta charset="utf-8"></head><body class="green-theme editor-page"><div class="site-frame"><main id="main-content"><section class="feature-shell"><form class="editor-form">
<div class="editor-audio-field" id="editor-audio-studio"><span>Осетинская запись</span>
<div class="editor-audio-actions"><button type="button" id="audio-record">Записать с микрофона</button>
<button type="button" id="audio-stop" hidden>Остановить запись</button><label for="editor-audio">Выбрать файл</label>
<input type="file" name="Audio" id="editor-audio"></div><span id="editor-file-name"></span>
<button type="button" id="audio-replace" hidden>Заменить запись</button><p id="audio-studio-status" role="status"></p><audio id="editor-audio-preview" controls hidden></audio>
<button type="button" id="audio-edit" hidden>Обрезать запись</button>
${trimming}</div><button type="submit" id="save">Сохранить черновик</button></form></section></main></div></body></html>`;
const output = async page => page.locator('#editor-audio').evaluate(async input => {
  const file = input.files[0], bytes = await file.arrayBuffer(), v = new DataView(bytes);
  return { name: file.name, type: file.type, size: file.size, riff: new TextDecoder().decode(bytes.slice(0, 4)),
    channels: v.getUint16(22, true), rate: v.getUint32(24, true), seconds: v.getUint32(40, true) / v.getUint32(28, true) };
});
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://localhost/recorder-check');
    for (const css of ['site', 'brand', 'features', 'editor', 'theme-green', 'avatar', 'sections-green', 'layout'])
      await page.addStyleTag({ content: read(`css/${css}.css`) });
    await page.evaluate(() => {
      const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => { window.testStream = await acquire(options); return window.testStream; };
    });
    await page.addScriptTag({ content: read('js/editor-audio.js') });
    await page.locator('#audio-record').click();
    await page.locator('#audio-stop').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#audio-record').isVisible(), false);
    await page.waitForTimeout(1500);
    await page.locator('#audio-stop').click();
    await page.locator('#audio-trim').waitFor({ state: 'visible' });
    await page.locator('#audio-range-start').focus(); await page.keyboard.press('ArrowRight');
    assert(Number(await page.locator('#audio-trim-start').inputValue()) > 0);
    await page.locator('#audio-waveform').scrollIntoViewIfNeeded();
    const visibleWave = await page.locator('#audio-waveform').boundingBox();
    const endBeforeDrag = Number(await page.locator('#audio-trim-end').inputValue());
    // Drag the end handle using real pointer input.
    await page.mouse.move(visibleWave.x + visibleWave.width - 9, visibleWave.y + 50);
    await page.mouse.down(); await page.mouse.move(visibleWave.x + visibleWave.width * .8, visibleWave.y + 50, { steps: 8 }); await page.mouse.up();
    assert(Number(await page.locator('#audio-trim-end').inputValue()) < endBeforeDrag - .1, 'Dragging the end handle must change the selected time.');
    const full = await output(page);
    assert.equal(await page.locator('#audio-record').isVisible(), false);
    assert.equal(await page.locator('#audio-replace').isVisible(), true);
    assert.equal(await page.locator('#audio-trim legend').count(), 0);
    assert.equal(full.riff, 'RIFF'); assert.equal(full.rate, 24000); assert.equal(full.channels, 1);
    assert(full.seconds >= 1 && full.seconds < 5);
    assert(await page.evaluate(() => testStream.getTracks().every(t => t.readyState === 'ended')));
    await page.locator('#audio-trim-start').fill('0.2'); await page.locator('#audio-trim-end').fill('0.6');
    await page.locator('#audio-trim-listen').click();
    await page.waitForFunction(() => document.querySelector('audio').paused, { timeout: 5000 });
    await page.locator('#audio-trim-apply').click();
    await page.waitForFunction(() => document.querySelector('#audio-studio-status').textContent.includes('Оставлен фрагмент'));
    assert(Math.abs((await output(page)).seconds - 0.4) < .001);
    // A second trim uses the original source, rather than cropping the crop.
    await page.locator('#audio-trim-start').fill('0.8'); await page.locator('#audio-trim-end').fill('1.1');
    await page.locator('#audio-trim-apply').click();
    await page.waitForFunction(() => document.querySelector('#audio-studio-status').textContent.includes('0,8'));
    assert(Math.abs((await output(page)).seconds - .3) < .001);
    const unchanged = (await output(page)).size;
    await page.locator('#audio-trim-end').fill('0.1'); await page.locator('#audio-trim-apply').click();
    assert.match(await page.locator('#audio-studio-status').textContent(), /не короче/);
    assert.equal((await output(page)).size, unchanged);
    await page.locator('#audio-trim-reset').click(); await page.locator('#audio-trim-apply').click();
    await page.waitForFunction(() => document.querySelector('#audio-studio-status').textContent.includes('Оставлен'));
    assert(Math.abs((await output(page)).seconds - full.seconds) < .002);
    const recorded = await page.locator('#editor-audio').evaluate(async input => [...new Uint8Array(await input.files[0].arrayBuffer())]);
    if (process.env.EDITOR_AUDIO_SCREENSHOTS) fs.writeFileSync(path.join(process.env.EDITOR_AUDIO_SCREENSHOTS, 'audio-studio-test.wav'), Buffer.from(recorded));
    await page.locator('#editor-audio').setInputFiles({ name: 'uploaded.wav', mimeType: 'audio/wav', buffer: Buffer.from(recorded) });
    await page.locator('#audio-edit').click(); await page.locator('#audio-trim').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#audio-trim-start').inputValue(), '0');
    // Capture form transport: no upload happens before normal draft submission.
    const uploaded = await page.locator('form').evaluate(form => { const f = new FormData(form).get('Audio'); return { name: f.name, size: f.size }; });
    assert.equal(uploaded.name, 'uploaded.wav'); assert(uploaded.size > 44);
    assert(await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))));
    await page.locator('#audio-trim-start').fill('0.1');
    const blocked = await page.locator('form').evaluate(form => !form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
    assert(blocked); assert.match(await page.locator('#audio-studio-status').textContent(), /примените/);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (process.env.EDITOR_AUDIO_SCREENSHOTS) {
        fs.mkdirSync(process.env.EDITOR_AUDIO_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: path.join(process.env.EDITOR_AUDIO_SCREENSHOTS, `audio-studio-${width}.png`), fullPage: true });
      }
    }
    await page.locator('#audio-trim-start').focus(); await page.keyboard.press('Tab');
    assert(await page.locator('#audio-trim-end').evaluate(el => el === document.activeElement));
    // Permission denial retains the existing selection and allows uploading.
    const savedName = await page.locator('#editor-audio').evaluate(el => el.files[0].name);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    await page.locator('#audio-replace').click();
    await page.locator('#audio-record').click();
    await page.waitForFunction(() => document.querySelector('#audio-studio-status').textContent.includes('Доступ к микрофону закрыт'));
    assert.equal(await page.locator('#editor-audio').evaluate(el => el.files[0].name), savedName);
    assert.equal(await page.locator('#editor-audio').isDisabled(), false);
    // A late microphone permission response after pagehide must not leave the form busy.
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.finishPermission = resolve; }); });
    await page.locator('#audio-record').click();
    assert.equal(await page.locator('#editor-audio').isDisabled(), true);
    await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.finishPermission(new MediaStream()); });
    await page.waitForFunction(() => !document.querySelector('#editor-audio').disabled);
    assert.equal(await page.locator('#audio-record').isDisabled(), false);
    assert.deepEqual(errors, []);
    console.log('Audio studio passed: real MediaRecorder with synthetic microphone, released tracks, WAV, repeated/non-destructive trim, audition, invalid bounds, upload transport, pending trim, permission denial, keyboard and two widths.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
