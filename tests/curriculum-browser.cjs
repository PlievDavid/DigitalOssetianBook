const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.ADAM_TEST_URL || 'http://127.0.0.1:60656';
const fixture = JSON.parse(fs.readFileSync(path.join('.run-local', 'curriculum-checks.json'), 'utf8'));
const output = path.join('.run-local', 'curriculum-qa');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const editor = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
    await editor.addCookies([{ name: 'Adam.Identity', value: fixture.cookie, url: base }]);
    const page = await editor.newPage();
    const browserLessonTitle = `Браузерная проверка Ӕ ӕ ${Date.now()}`;
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/editor/curriculum/lesson/new');
    await page.getByRole('textbox', { name: 'Название', exact: true }).waitFor();
    await page.getByLabel('Название', { exact: true }).fill(browserLessonTitle);
    await page.locator('.lesson-description-settings summary').click();
    await page.getByLabel('Описание', { exact: true }).fill('Временная проверка четырёх шаблонов и задания');
    for (const template of ['text', 'rule', 'example', 'comparison']) {
      if (template === 'text') await page.locator('[data-first-template=text]').click();
      else {
        await page.getByRole('button', { name: '+ Добавить карточку', exact: true }).click();
        await page.locator(`[data-picker-theory="${template}"]`).click();
      }
      const card = page.locator('.curriculum-edit-card').last();
      await card.getByLabel('Заголовок', { exact: true }).fill(`Карточка ${template} Ӕ ӕ`);
      await card.getByLabel(template === 'comparison' ? 'Левая колонка' : 'Основной текст', { exact: true }).fill('Ӕ ӕ\n<script>window.curriculumInjected = true</script>');
      if (template === 'example' || template === 'comparison') await card.getByLabel(template === 'example' ? 'Пояснение / проверенный перевод' : 'Правая колонка', { exact: true }).fill('Проверка отображения');
    }
    await page.locator('.curriculum-edit-card').last().getByRole('button', { name: 'Поднять карточку 4', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#curriculum-structure').inputValue(), /comparison/);
    assert.equal(await page.evaluate(() => window.curriculumInjected), undefined);
    const choices = JSON.parse(await page.locator('#curriculum-choices').textContent());
    const translation = choices.find(c => c.kind === 'translation' && fixture.exerciseIds.includes(c.id));
    assert(translation);
    await page.getByRole('button', { name: '+ Добавить карточку', exact: true }).click();
    await page.locator('[data-picker-tab=ready]').click();
    await page.locator('#picker-search').fill(translation.title);
    await page.locator(`[data-material-id="${translation.id}"] button`).click();
    await page.getByRole('button', { name: '+ Добавить карточку', exact: true }).click();
    await page.locator('[data-picker-tab=new]').click();
    await page.locator('#picker-new button[value="create-translation"]').click();
    await page.waitForURL(/\/editor\/new\/translation\?lessonId=/);
    assert.equal(editor.pages().length, 1, 'Редактор открылся в новой вкладке');
    const returnLessonId = new URL(page.url()).searchParams.get('lessonId');
    assert(returnLessonId, 'Контекст урока не передан');
    assert.equal((await editor.request.get(`/editor/new/translation?lessonId=00000000-0000-0000-0000-000000000001`)).status(), 404, 'Чужой или отсутствующий урок принят');
    assert.equal((await editor.request.post(`/editor/curriculum/lesson/${returnLessonId}/edit`, { form: { action: 'create-translation' } })).status(), 400, 'Создание без CSRF принято');
    await page.getByLabel('Фраза на русском').fill('Проверочная фраза');
    await page.getByLabel('Фраза на осетинском').fill('Ӕ ӕ');
    await page.getByLabel('Слова для сборки').fill('Ӕ\nӕ');
    await page.locator('form.editor-form button[type=submit]').last().click();
    await page.waitForURL(/\/editor\/translation\/[^/]+\/preview\?lessonId=/);
    await page.getByRole('link', { name: 'Изменить', exact: true }).click();
    assert.equal(await page.getByLabel('Фраза на русском').inputValue(), 'Проверочная фраза');
    await page.locator('form.editor-form button[type=submit]').last().click();
    await page.waitForURL(/\/preview\?lessonId=/);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.getByRole('link', { name: 'Вернуться в урок', exact: true }).click();
    await page.waitForURL(/\/editor\/curriculum\/lesson\/[^/]+\/edit/);
    assert.equal(await page.getByLabel('Название', { exact: true }).inputValue(), browserLessonTitle);
    assert.equal(await page.locator('.curriculum-card-choice').count(), 6, 'Созданное задание не добавлено');
    assert.match(await page.locator('#curriculum-structure').inputValue(), /Проверочная фраза/);
    await page.locator('.curriculum-edit-card').getByRole('button', { name: 'Удалить', exact: true }).click();
    assert.equal(await page.locator('.curriculum-card-choice').count(), 5);
    await page.locator('.curriculum-card-choice').first().click();
    await page.screenshot({ path: path.join(output, 'editor-wide.png'), fullPage: true });
    for (const width of [360, 600, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
        console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed').slice(0, 12).map(e => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width }))));
        await page.screenshot({ path: path.join(output, 'overflow.png'), fullPage: true });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Переполнение конструктора на ${width}`);
    }
    await page.setViewportSize({ width: 360, height: 900 });
    await page.screenshot({ path: path.join(output, 'editor-narrow.png'), fullPage: true });
    await page.getByRole('button', { name: 'Сохранить и посмотреть', exact: true }).click();
    await page.waitForURL(/\/preview$/);
    const lessonId = page.url().match(/lesson\/([^/]+)\/preview/)[1];
    const guest = await browser.newContext({ baseURL: base });
    assert.match((await guest.request.get('/editor/curriculum')).url(), /account\/login/, 'Гостю открыт редактор');
    assert.equal((await guest.request.get(`/lessons/${lessonId}`)).status(), 404, 'Черновик раскрыт гостю');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.waitForURL(/\/editor\/curriculum\?kind=/);
    await page.goto('/editor/curriculum/course/new');
    await page.getByLabel('Название', { exact: true }).fill('Браузерный курс');
    await page.getByRole('button', { name: 'Добавить мои уроки', exact: true }).click();
    await page.locator('#course-picker-list').getByRole('checkbox').filter({ visible: true }).first().waitFor();
    await page.getByLabel('Поиск урока').fill(browserLessonTitle);
    await page.locator('#course-picker-list').getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Добавить выбранные', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить и посмотреть', exact: true }).click();
    await page.waitForURL(/\/preview$/);
    const courseId = page.url().match(/course\/([^/]+)\/preview/)[1];
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.waitForURL(/\/editor\/curriculum\?kind=/);
    const pupil = await guest.newPage();
    pupil.on('pageerror', e => errors.push(e.message));
    await pupil.goto(`/courses/${courseId}`);
    await pupil.getByRole('button', { name: 'Начать курс', exact: true }).click();
    await pupil.waitForURL(/\/lessons\/runs\//);
    const runUrl = new URL(pupil.url()).pathname;
    const otherGuest = await browser.newContext({ baseURL: base });
    assert.equal((await otherGuest.request.get(runUrl)).status(), 404, 'Чужой гостевой урок раскрыт');
    assert.equal((await guest.request.post(`${runUrl}/next`, { form: { step: 0 } })).status(), 400, 'Нет защиты CSRF');
    await pupil.locator('.lesson-step-list a').nth(4).click();
    await pupil.locator('#exercise-tiles .word-tile').first().waitFor();
    assert.equal(await pupil.locator('.lesson-step-list .is-complete').count(), 0, 'Просмотр будущей карточки отметил прогресс');
    await pupil.locator('.lesson-step-list a').first().click();
    await pupil.locator('.theory-card').waitFor();
    assert.equal(await pupil.locator('.lesson-step-list .is-complete').count(), 0, 'Просмотр карточки изменил прогресс');
    for (let i = 0; i < 4; i++) {
      await pupil.locator('.theory-card').waitFor();
      assert.equal(await pupil.evaluate(() => window.curriculumInjected), undefined);
      if (i === 2) {
        await pupil.setViewportSize({ width: 1440, height: 1000 });
        await pupil.screenshot({ path: path.join(output, 'lesson-wide.png'), fullPage: true });
        await pupil.setViewportSize({ width: 360, height: 800 });
        assert(await pupil.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Переполнение урока');
        await pupil.screenshot({ path: path.join(output, 'lesson-narrow.png'), fullPage: true });
        await pupil.locator('body').evaluate(body => { body.style.fontSize = '200%'; });
        assert(await pupil.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Переполнение при увеличении текста');
      }
      await pupil.getByRole('button', { name: 'Далее →', exact: true }).focus(); await pupil.keyboard.press('Enter');
      await pupil.waitForLoadState('networkidle');
    }
    await pupil.locator('#exercise-tiles .word-tile').first().waitFor();
    await pupil.getByRole('button', { name: 'Завершить урок', exact: true }).click();
    await pupil.getByRole('alert').filter({ hasText: 'Сначала завершите задание' }).waitFor();
    await pupil.locator('#exercise-tiles .word-tile').first().waitFor();
    const savedDraft = pupil.waitForResponse(r => new URL(r.url()).pathname.endsWith('/draft') && r.request().method() === 'PUT' && r.status() === 204);
    await pupil.locator('#exercise-tiles .word-tile').first().click(); await savedDraft;
    await pupil.reload(); await pupil.locator('#exercise-picked .word-tile').waitFor();
    assert.equal(await pupil.locator('#exercise-picked .word-tile').count(), 1, 'Гостевой черновик не восстановлен');
    const draftUrl = (await pupil.locator('#exercise-app').getAttribute('data-start-url')).replace(/\/exercise(?=\?|$)/, '/draft');
    const csrf = await pupil.locator('#api-antiforgery input').inputValue();
    assert.equal((await guest.request.put(`/api/v1${draftUrl}`, { data: 'null', headers: { 'Content-Type': 'application/json', RequestVerificationToken: csrf } })).status(), 400, 'Некорректный черновик не отклонён');
    while (await pupil.locator('#exercise-tiles .word-tile').count()) await pupil.locator('#exercise-tiles .word-tile').first().click();
    await pupil.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    await pupil.locator('#exercise-result').filter({ hasText: 'Правильный ответ' }).waitFor();
    await pupil.reload();
    await pupil.locator('#exercise-result').filter({ hasText: 'Правильный ответ' }).waitFor();
    await pupil.getByRole('button', { name: 'Завершить урок', exact: true }).click();
    await pupil.getByRole('heading', { name: 'Урок пройден!', exact: true }).waitFor();
    // Проверяем оба встроенных плеера по исходной фикстуре с аудио и диалогом.
    await page.goto(`/lessons/${fixture.lessonId}`);
    await page.waitForURL(/\/lessons\/runs\//);
    const oldVersion = (await page.locator('.lesson-player').getAttribute('data-lesson-version')) === '1';
    let safety = 0;
    while (await page.locator('.lesson-next').count()) {
      assert(safety++ < 10);
      if (await page.locator('#exercise-app').count()) {
        await page.locator('#exercise-play:not([hidden])').waitFor();
        const kind = await page.locator('#exercise-app').getAttribute('data-kind');
        if (kind === 'audio') {
          const data = await page.evaluate(async () => await (await fetch(`/api/v1${document.querySelector('#exercise-app').dataset.startUrl}`)).json());
          await page.locator('#exercise-audio').evaluate(audio => audio.play());
          for (const word of data.card.tokens) {
            await page.locator('#exercise-options').getByRole('button', { name: word, exact: true }).click();
          }
          await page.locator('#exercise-result').filter({ hasText: 'Верно!' }).waitFor();
        } else if (!(await page.locator('#exercise-result').textContent()).trim()) {
          while (await page.locator('#exercise-tiles .word-tile').count()) await page.locator('#exercise-tiles .word-tile').first().click();
          await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
          await page.locator('#exercise-result').filter({ hasText: 'Правильный ответ' }).waitFor();
        }
      } else if (await page.locator('#dialog-app').count()) {
        await page.locator('#dialog-play:not([hidden])').waitFor();
        const script = JSON.parse(Object.values(fixture.scripts)[0]);
        for (const turn of script.turns) {
          if (turn.kind === 'choice') await page.locator('#dialog-options').getByRole('button', { name: turn.references[0], exact: true }).click();
          else { await page.locator('#dialog-input').fill(turn.references[0]); await page.getByRole('button', { name: 'Отправить', exact: true }).click(); }
        }
        await page.locator('#dialog-summary:not([hidden])').waitFor();
        await page.reload(); await page.locator('#dialog-summary:not([hidden])').waitFor();
      }
      await page.locator('.lesson-next button').click(); await page.waitForLoadState('networkidle');
    }
    await page.getByRole('heading', { name: 'Урок пройден!', exact: true }).waitFor();
    await page.goto(`/courses/${fixture.courseId}/contents`);
    assert.equal(await page.locator('.course-lesson-list .is-complete').count(), oldVersion ? 0 : 1);
    // Чистый снимок реального конструктора для просмотра результата, без публикации примера.
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto('/editor/curriculum/lesson/new');
    await page.getByLabel('Название', { exact: true }).fill('Осетинский алфавит');
    await page.locator('.lesson-description-settings summary').click();
    await page.getByLabel('Описание', { exact: true }).fill('Знакомство с буквами');
    await page.locator('[data-first-template=text]').click();
    await page.getByLabel('Заголовок', { exact: true }).fill('Буква Ӕ');
    await page.getByLabel('Основной текст', { exact: true }).fill('Ӕ ӕ\n\nЗаглавная и строчная буквы');
    const showcaseChoices = JSON.parse(await page.locator('#curriculum-choices').textContent());
    const audioChoice = showcaseChoices.find(c => c.kind === 'audio' && fixture.exerciseIds.includes(c.id));
    if (audioChoice) { await page.getByRole('button', { name: '+ Добавить карточку', exact: true }).click(); await page.locator('[data-picker-tab=ready]').click(); await page.locator('#picker-search').fill(audioChoice.title); await page.locator(`[data-material-id="${audioChoice.id}"] button`).click(); }
    await page.getByRole('button', { name: '+ Добавить карточку', exact: true }).click();
    await page.locator('[data-picker-tab=theory]').click();
    await page.locator('[data-picker-theory=text]').click();
    await page.getByLabel('Заголовок', { exact: true }).fill('Закрепление');
    await page.getByLabel('Основной текст', { exact: true }).fill('Вернитесь к карточке с буквой и повторите её написание.');
    await page.locator('.curriculum-card-choice').first().click();
    await page.screenshot({ path: path.join(output, 'constructor-preview.png'), fullPage: true });
    assert.deepEqual(errors, [], 'Ошибки JavaScript');
    console.log('Браузер: редактор, 4 шаблона, порядок, публикация, курс, гостевой урок, перевод, аудио, диалог, восстановление, CSRF, изоляция, 6 размеров и клавиатура — OK.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
