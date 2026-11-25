const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.ADAM_TEST_URL;
assert(base && new URL(base).hostname === '127.0.0.1');
const fixture = JSON.parse(process.env.ADAM_COURSE_FIXTURE);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let checks = 0; const errors = [];
  const check = (value, message) => { assert(value, message); checks++; };
  const out = path.resolve('.run-local/course-v2-checks'); fs.mkdirSync(out, { recursive: true });
  const author = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const learner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await author.newPage(); page.on('pageerror', e => errors.push(e.message));
  const student = await learner.newPage(); student.on('pageerror', e => errors.push(e.message));
  async function login(p, email) {
    await p.goto(base + '/account/login'); await p.locator('#Email').fill(email); await p.locator('#Password').fill(fixture.password);
    await Promise.all([p.waitForURL(url => !url.pathname.startsWith('/account/login')), p.locator('form button[type=submit]').click()]);
  }
  async function api(p, url, method = 'GET', body) {
    return p.evaluate(async ({ url, method, body }) => {
      const token = document.querySelector('#api-antiforgery input')?.value;
      const r = await fetch('/api/v1' + url, { method, headers: { 'Content-Type': 'application/json', RequestVerificationToken: token }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = null; } return { status: r.status, data };
    }, { url, method, body });
  }
  try {
    const guestPage = await guest.newPage(); await guestPage.goto(base + '/courses');
    await guestPage.getByLabel('Поиск по названию', { exact: true }).waitFor(); check(true, 'Гостевой каталог');
    await login(page, fixture.owner);
    {
      const preview = '/editor/matching/' + fixture.previewMatchingId + '/preview';
      const startPreview = '/editor/preview/matching/' + fixture.previewMatchingId + '/sessions';
      const denied = await api(guestPage, startPreview, 'POST');
      check([401, 403, 404].includes(denied.status), 'Гость получил черновик редактора');
      await page.goto(base + preview);
      const play = page.locator('#matching-play');
      const review = page.getByRole('checkbox', { name: /Я проверил текст/ });
      const island = page.locator('.editor-publish-form');
      const left = play.getByRole('group', { name: 'Слова слева' });
      const right = play.getByRole('group', { name: 'Пары' });
      await left.getByRole('button', { name: 'Дом', exact: true }).waitFor();
      check(!(await review.isChecked()) && await island.getByRole('link', { name: 'Изменить' }).isVisible(), 'Подтверждение и редактирование в нижней панели');
      check((await page.evaluate(path => fetch('/api/v1' + path, { method: 'POST' }).then(r => r.status), startPreview)) === 400, 'Начало предпросмотра без CSRF');
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        for (const container of [play, island]) {
          check(await container.evaluate(node => {
            const rect = node.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth && node.scrollWidth <= node.clientWidth;
          }), 'Предпросмотр выходит за экран при ширине ' + width);
        }
      }
      await left.getByRole('button', { name: 'Дом', exact: true }).press('Enter');
      await right.getByRole('button', { name: 'дуар', exact: true }).press('Enter');
      await play.getByText('Не подходит. Попробуйте другую пару.').waitFor();
      await left.getByRole('button', { name: 'Дом', exact: true }).press('Enter');
      await right.getByRole('button', { name: 'хӕдзар', exact: true }).press('Enter');
      await play.getByText('Найдено: 1 из 2').waitFor();
      await left.getByRole('button', { name: 'Кровать', exact: true }).press('Enter');
      await right.getByRole('button', { name: 'хуыссӕн', exact: true }).press('Enter');
      await play.getByText('Все пары найдены: 2 из 2.').waitFor();
      check(await play.locator('svg path').count() === 2, 'После проверки пары соединены нитками');
      await play.getByRole('button', { name: 'Пройти заново' }).click();
      await play.getByText('Найдено: 0 из 2').waitFor();
      const ownerBoard = (await api(page, startPreview, 'POST')).data;
      const attemptPath = '/editor/preview/matching/sessions/' + ownerBoard.sessionId + '/check';
      const otherEditor = await browser.newPage();
      await login(otherEditor, fixture.other);
      check((await api(otherEditor, startPreview, 'POST')).status === 404, 'Другой редактор получил черновик');
      check((await api(otherEditor, attemptPath, 'POST', { leftIndex: 0, rightIndex: 0 })).status === 404, 'Другой редактор получил попытку предпросмотра');
      await otherEditor.close();
      check((await api(page, '/matching/sessions/' + ownerBoard.sessionId)).status === 404, 'Предпросмотр доступен через учебный API');
      await review.check();
      await page.reload();
      check(!(await review.isChecked()), 'Галочка восстановилась после обновления');
      await island.getByRole('button', { name: 'Опубликовать' }).click();
      check(await review.evaluate(input => input.validity.valueMissing), 'Форма допускает публикацию без галочки');
      await review.check();
      await island.getByRole('button', { name: 'Опубликовать' }).click();
      await page.getByRole('button', { name: 'Создать новую версию' }).click();
      await page.waitForURL(/\/editor\/revisions\/.+\/edit/);
      await page.locator('form').getByRole('button', { name: /сохранить/i }).click();
      await page.waitForURL(/\/editor\/revisions\/.+\/preview/);
      await left.getByRole('button', { name: 'Дом', exact: true }).waitFor();
      check(!(await review.isChecked()), 'У новой версии нет ручного подтверждения');
      check(true, 'Предпросмотр черновика и новой версии соотнесения');
    }
    await page.goto(base + '/author/courses');
    const create = page.getByRole('button', { name: 'Создать курс', exact: true });
    const courseCount = (await api(page, '/author/courses')).data.length;
    await create.click();
    const createDialog = page.getByRole('dialog', { name: 'Новый курс' });
    await createDialog.waitFor();
    check(await createDialog.locator('.cs-help').count() === 0, 'В окне нового курса осталась подсказка под редактором');
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      check(await createDialog.evaluate(dialog => {
        const bounds = dialog.getBoundingClientRect();
        const text = dialog.querySelector('.ql-container').getBoundingClientRect();
        const buttons = dialog.querySelector('.cv-actions').getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth && text.bottom < buttons.top;
      }), 'Диалог выходит за пределы экрана при ширине ' + width);
      await createDialog.screenshot({ path: path.join(out, `new-course-${width}.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await createDialog.getByRole('button', { name: 'Создать черновик' }).click();
    await createDialog.press('Escape');
    check((await api(page, '/author/courses')).data.length === courseCount, 'Пустая или отменённая форма создала курс');
    await create.click();
    await createDialog.getByLabel('Название курса').fill('Проверка создания курса');
    const initialOutcomes = createDialog.getByRole('textbox', { name: 'Результаты обучения' });
    await initialOutcomes.fill('Результаты при создании Ӕ ӕ');
    await initialOutcomes.press('ControlOrMeta+a');
    await createDialog.getByRole('button', { name: 'Курсив', exact: true }).click();
    await initialOutcomes.press('Escape');
    await createDialog.getByRole('button', { name: 'Создать черновик' }).click();
    await page.waitForURL(/author\/courses\/[0-9a-f-]+$/);
    check((await api(page, '/author/courses')).data.length === courseCount + 1, 'Именованный черновик должен создаться один раз');
    const id = new URL(page.url()).pathname.split('/').pop();
    check(JSON.parse((await api(page, '/author/courses/' + id)).data.draftJson).outcomesRichText.ops
      .some(op => op.attributes?.italic && op.insert.includes('Ӕ ӕ')), 'Форма создания потеряла оформление результатов');
    const photo = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#176348'; ctx.fillRect(0, 0, 420, 240);
      ctx.fillStyle = '#89b4d4'; ctx.fillRect(210, 0, 210, 240);
      return canvas.toDataURL().split(',')[1];
    });
    await page.getByLabel('Загрузить главное фото курса').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
    const frame = page.getByRole('group', { name: 'Квадрат кадрирования' });
    await frame.waitFor();
    check(await page.locator('.cs-crop-editor input[type=range], .cs-crop-editor dialog').count() === 0, 'Обрезка открылась с ползунками или отдельным окном');
    const originalFrame = await frame.boundingBox();
    await frame.press('Shift+ArrowLeft');
    await frame.press('ArrowRight');
    const adjustedFrame = await frame.boundingBox();
    check(adjustedFrame.width < originalFrame.width && adjustedFrame.x > originalFrame.x, 'Клавиатура не перемещает и не изменяет квадрат');
    await frame.scrollIntoViewIfNeeded();
    const handle = await frame.locator('.cs-crop-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 - 24, handle.y + handle.height / 2 - 24);
    await page.mouse.up();
    const smaller = await frame.boundingBox();
    check(smaller.width < adjustedFrame.width - 12, 'Угол рамки не изменяет размер при перетаскивании');
    await page.mouse.move(smaller.x + smaller.width / 3, smaller.y + smaller.height / 3);
    await page.mouse.down();
    await page.mouse.move(smaller.x + smaller.width / 3 + 15, smaller.y + smaller.height / 3);
    await page.mouse.up();
    check((await frame.boundingBox()).x > smaller.x + 8, 'Рамка не перемещается мышью');
    await page.locator('.cs-crop-editor').screenshot({ path: path.join(out, 'course-photo-crop.png') });
    await page.getByRole('button', { name: 'Применить кадр', exact: true }).click();
    await page.locator('.cs-course-photo').evaluate(async img => img.decode());
    check(await page.locator('.cs-course-photo').evaluate(img => img.naturalWidth === img.naturalHeight), 'Сохранённое главное фото не квадратное');
    await page.getByLabel('Оформление страницы', { exact: true }).selectOption('sky');
    check(true, 'Обложка загружена, тема выбрана');
    await page.getByLabel('Название курса', { exact: true }).fill('Проверка курса Ӕ/ӕ');
    await page.getByLabel('Описание', { exact: true }).fill('Проверка конструктора, сохранения и опубликованной программы.');
    await page.getByLabel('Результаты обучения', { exact: true }).fill('Познакомиться с устройством учебного курса.');
    await page.getByLabel('Результаты обучения', { exact: true }).press('ControlOrMeta+a');
    await page.getByRole('button', { name: 'Жирный', exact: true }).click();
    await page.getByLabel('Результаты обучения', { exact: true }).press('Escape');
    await page.getByRole('button', { name: 'Программа', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить модуль', exact: true }).first().click();
    await page.getByLabel('Название модуля', { exact: true }).fill('Первый модуль');
    await page.locator('dialog').getByRole('button', { name: 'Добавить модуль', exact: true }).click();
    await page.getByLabel('Название урока', { exact: true }).fill('Первый урок');
    const addBlock = page.getByRole('button', { name: 'Добавить блок', exact: true });
    for (const width of [1600, 390]) {
      await page.setViewportSize({ width, height: 844 });
      check(await addBlock.evaluate(button => {
        const canvas = button.parentElement;
        const b = button.getBoundingClientRect(), c = canvas.getBoundingClientRect();
        return Math.abs((b.left + b.right) / 2 - (c.left + c.right) / 2) < 2;
      }), `Кнопка добавления блока не по центру при ширине ${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
    await page.locator('dialog').getByRole('button', { name: /Объяснение/ }).click();
    await page.getByLabel('Текст объяснения', { exact: true }).fill('Прочитайте объяснение, затем выполните задание. Ӕ ӕ');
    await page.getByLabel('Текст объяснения', { exact: true }).press('ControlOrMeta+a');
    await page.getByRole('toolbar', { name: 'Оформление выделенного текста' }).waitFor();
    await page.getByRole('button', { name: 'Жирный', exact: true }).click();
    await page.getByRole('button', { name: 'Курсив', exact: true }).click();
    await page.getByRole('button', { name: 'Зачёркнутый', exact: true }).click();
    await page.getByLabel('Цвет текста', { exact: true }).selectOption('#173f32');
    await page.getByLabel('Размер текста', { exact: true }).selectOption('22px');
    await page.getByLabel('Шрифт', { exact: true }).selectOption('golos');
    await page.getByLabel('Выравнивание абзаца', { exact: true }).selectOption('center');
    await page.getByLabel('Отступ абзаца', { exact: true }).selectOption('2');
    await page.screenshot({ path: path.join(out, 'rich-editor-wide.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Панель выделения выходит за экран');
    await page.screenshot({ path: path.join(out, 'rich-editor-phone.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('Текст объяснения', { exact: true }).press('Escape');
    await page.getByLabel('Выравнивание содержимого блока').selectOption('right');
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
    await page.locator('dialog').getByRole('button', { name: /Собери фразу/ }).click();
    const materialDialog = page.getByRole('dialog', { name: 'Библиотека упражнений' });
    await materialDialog.getByLabel('Тип упражнения').selectOption('listening');
    await materialDialog.locator('.cs-material-item strong').filter({ hasText: 'Проверка записи' }).waitFor();
    await materialDialog.getByLabel('Тип упражнения').selectOption('translation');
    await materialDialog.getByPlaceholder('Название или номер задания').fill(fixture.phraseId);
    await materialDialog.getByText('Найдено по номеру в ваших и доступных материалах.').waitFor();
    const phrase = materialDialog.locator('.cs-material-item').filter({ hasText: fixture.phraseTitle });
    await phrase.getByText('Предпросмотр', { exact: true }).click();
    check(await phrase.getByText('Тип задания: Собери фразу', { exact: true }).isVisible(), 'Предпросмотр не показывает тип');
    check(await phrase.getByText(fixture.expected, { exact: true }).isVisible(), 'Предпросмотр не показывает ответ');
    await phrase.getByRole('button', { name: 'Добавить', exact: true }).click();
    check(true, 'Фильтр типов упражнений работает в библиотеке');
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    // Context actions target the clicked lesson, including when another lesson is selected.
    await page.locator('.cs-lesson').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Дублировать', exact: true }).click();
    check(await page.locator('.cs-lesson').count() === 2, 'Контекстное меню не дублирует урок');
    await page.locator('.cs-lesson').first().click();
    await page.locator('.cs-lesson').last().click({ button: 'right' });
    await page.keyboard.press('End');
    check(await page.getByRole('menuitem', { name: 'Удалить урок', exact: true }).evaluate(el => el === document.activeElement), 'Клавиатура не выбирает удаление');
    await page.keyboard.press('Escape');
    check(await page.getByRole('menu').count() === 0, 'Escape не закрывает меню');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Модули и уроки', exact: true }).click();
    await page.getByRole('button', { name: 'Действия с уроком Первый урок — копия', exact: true }).click();
    check(await page.getByRole('menu').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), 'Меню выходит за экран');
    await page.getByRole('menuitem', { name: 'Удалить урок', exact: true }).click();
    await page.locator('dialog').getByRole('button', { name: 'Удалить', exact: true }).click();
    check(await page.locator('.cs-lesson').count() === 1, 'Удалён неверный урок');
    await page.setViewportSize({ width: 1440, height: 1000 });
    check(await page.getByLabel('Название урока', { exact: true }).inputValue() === 'Первый урок', 'Удаление другого урока сбросило выбранный');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByText('Все изменения сохранены', { exact: true }).waitFor();
    check((await api(page, '/author/courses/' + id)).status === 200, 'Автор видит черновик');
    await page.screenshot({ path: path.join(out, 'editor-wide.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Редактор выходит за мобильный экран');
    await page.screenshot({ path: path.join(out, 'editor-phone.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const saved = (await api(page, '/author/courses/' + id)).data;
    const draft = JSON.parse(saved.draftJson), lesson = draft.modules[0].lessons[0];
    check(lesson.blocks.length === 2 && lesson.blocks[1].materialId === fixture.phraseId, 'Редактор не сохранил структуру');
    check(lesson.blocks[0].richText.ops.some(op => op.attributes?.bold && op.attributes?.color === '#173f32' && op.attributes?.size === '22px'), 'Оформление выделения не сохранено');
    check(lesson.blocks[0].richText.ops.some(op => op.attributes?.italic && op.attributes?.strike && op.attributes?.font === 'golos'), 'Курсив, зачёркивание или шрифт не сохранены');
    check(lesson.blocks[0].richText.ops.some(op => op.attributes?.align === 'center' && op.attributes?.indent === 2), 'Выравнивание и отступ абзаца не сохранены');
    check(lesson.blocks[0].alignment === 'right', 'Выравнивание блока не сохранено');
    check(draft.outcomesRichText.ops.some(op => op.attributes?.bold), 'Оформление результатов обучения не сохранено');
    await addBlock.click();
    await page.getByRole('dialog').getByRole('button', { name: /Собери фразу/ }).click();
    await materialDialog.getByRole('button', { name: 'Создать упражнение' }).click();
    await page.waitForURL(url => url.pathname === '/editor/new/translation' && url.searchParams.get('lessonId') === lesson.id);
    await page.locator('#RussianPrompt').fill('Проверка возврата к уроку');
    await page.locator('#OssetianAnswer').fill('Ӕ ӕ');
    await page.locator('#TokensText').fill('Ӕ\nӕ');
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.waitForURL(/\/editor\/translation\/.+\/preview/);
    await page.locator('.editor-publish-form input[type=checkbox]').check();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.getByRole('button', { name: 'Создать новую версию' }).click();
    await page.waitForURL(url => /\/editor\/revisions\/.+\/edit/.test(url.pathname) && url.searchParams.get('lessonId') === lesson.id);
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.waitForURL(url => /\/editor\/revisions\/.+\/preview/.test(url.pathname) && url.searchParams.get('courseId') === id);
    await page.getByRole('link', { name: 'Изменить', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить черновик' }).click();
    await page.locator('.editor-publish-form input[type=checkbox]').check();
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.waitForURL(url => /\/editor\/translation\/.+\/preview/.test(url.pathname) && url.searchParams.get('lessonId') === lesson.id);
    await page.getByRole('link', { name: 'Вернуться к выбору задания' }).click();
    await page.waitForURL(url => url.pathname === '/author/courses/' + id && url.searchParams.get('lesson') === lesson.id);
    await materialDialog.getByRole('strong').filter({ hasText: /^Проверка возврата к уроку$/ }).waitFor();
    check((await api(page, '/author/courses')).data.length === courseCount + 1, 'Создание задания создало лишний курс');
    await materialDialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
    check(await page.locator('.cs-touch-menu:visible').count() === 0, 'На компьютере остались кнопки меню строк');
    await page.locator('.cs-lesson').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Сохранить в библиотеку', exact: true }).click();
    await page.getByText('Версия урока сохранена. Обновления можно применить в библиотеке преподавания.', { exact: true }).waitFor();
    const library = (await api(page, '/author/lesson-library')).data;
    check(library.length === 1 && library[0].lesson.blocks.length === 2, 'Библиотека не сохранила урок');
    await api(page, `/author/courses/${id}/lessons/${lesson.id}/library`, 'POST', { stamp: saved.draftStamp });
    check((await api(page, '/author/lesson-library')).data.length === 1, 'Повтор создал дубль урока');
    const second = (await api(page, '/author/courses', 'POST', { title: 'Другой курс', description: '', modules: [{ id: require('node:crypto').randomUUID(), title: 'Модуль', lessons: [] }] })).data;
    await page.goto(base + '/author/courses/' + second.id);
    await page.getByRole('button', { name: 'Из библиотеки', exact: true }).click();
    await page.locator('dialog').getByRole('button', { name: 'Независимая копия', exact: true }).click();
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByText('Все изменения сохранены', { exact: true }).waitFor();
    const reused = JSON.parse((await api(page, '/author/courses/' + second.id)).data.draftJson).modules[0].lessons[0];
    check(reused.id !== lesson.id && reused.blocks[0].id !== lesson.blocks[0].id && reused.blocks[0].text === lesson.blocks[0].text, 'Копия не независима');
    await page.getByLabel('Название урока', { exact: true }).fill('Изменённая копия');
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await page.getByText('Все изменения сохранены', { exact: true }).waitFor();
    check((await api(page, '/author/lesson-library')).data[0].lesson.title === 'Первый урок', 'Правка копии изменила библиотеку');
    const colleague = await browser.newContext(); const colleaguePage = await colleague.newPage();
    await login(colleaguePage, fixture.other);
    check((await api(colleaguePage, '/author/lesson-library')).data.length === 0, 'Другому автору видна чужая библиотека');
    check((await api(colleaguePage, `/author/courses/${id}/lessons/${lesson.id}/library`, 'POST', { stamp: saved.draftStamp })).status === 404, 'Другой автор сохранил чужой урок');
    await page.goto(base + '/profile');
    await page.getByRole('region', { name: 'Настройки' }).getByRole('link', { name: /Преподавание/ }).press('Enter');
    await page.waitForURL(base + '/courses/teaching');
    await page.getByRole('heading', { name: 'Преподавание', exact: true }).waitFor();
    const teaching = page.getByRole('navigation', { name: 'Разделы преподавания' });
    const switcher = teaching.locator('.cv-teaching-switch');
    check(await switcher.evaluate(el => parseFloat(getComputedStyle(el, '::before').transitionDuration) > 0), 'Индикатор вкладок не анимируется');
    const coursesSection = page.locator('#cv-teaching-courses');
    await coursesSection.getByRole('link', { name: 'Редактировать курс', exact: true }).first().waitFor();
    await page.screenshot({ path: path.join(out, 'teaching-courses-wide.png'), fullPage: true });
    await teaching.getByRole('button', { name: 'Библиотека уроков', exact: true }).press('Enter');
    await page.locator('.cv-library').getByRole('heading', { name: 'Первый урок', exact: true }).waitFor();
    check(!await coursesSection.isVisible() && new URL(page.url()).searchParams.has('library'), 'Библиотека не скрыла курсы или не сохранила вкладку в адресе');
    for (const width of [320, 390, 1176]) {
      await page.setViewportSize({ width, height: 844 });
      check(await switcher.evaluate(group => {
        const tab = group.lastElementChild;
        const text = document.createRange();
        text.selectNodeContents(tab);
        const line = text.getBoundingClientRect(), button = tab.getBoundingClientRect();
        return text.getClientRects().length === 1 && line.left >= button.left && line.right <= button.right &&
          button.height >= 44 && button.height <= 46;
      }), 'Подпись библиотеки перенеслась или кнопка потеряла компактность при ширине ' + width);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.join(out, 'teaching-wide.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Преподавание выходит за мобильный экран');
    await page.screenshot({ path: path.join(out, 'teaching-phone.png'), fullPage: true });
    await page.reload();
    await page.locator('.cv-library').getByRole('heading', { name: 'Первый урок', exact: true }).waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check(await switcher.evaluate(el => getComputedStyle(el, '::before').transitionDuration === '0s'), 'Настройка уменьшенного движения не отключила анимацию вкладок');
    await teaching.getByRole('button', { name: 'Курсы', exact: true }).press('Enter');
    check(await coursesSection.isVisible() && !await page.locator('.cv-library').isVisible() &&
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Мобильный список курсов не открывается или выходит за экран');
    await page.screenshot({ path: path.join(out, 'teaching-courses-phone.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[aria-controls="courses-menu"]').hover();
    const courseMenu = page.locator('#courses-menu');
    await courseMenu.getByRole('link', { name: 'Мои курсы', exact: true }).waitFor({ state: 'visible' });
    check(await courseMenu.getByRole('link', { name: 'Преподавание', exact: true }).count() === 0,
      'В меню курсов осталась ссылка на преподавание');
    await page.goto(base + '/author/courses/' + id);
    await page.getByLabel('Название урока', { exact: true }).waitFor();
    const exerciseCard = page.locator('.cs-block').filter({ has: page.locator('.cs-block-body').filter({ hasText: fixture.phraseTitle }) });
    check(await exerciseCard.count() === 1, 'Название материала потерялось после открытия черновика');
    await exerciseCard.getByRole('button', { name: 'Редактировать', exact: true }).click();
    check(await page.locator('.cs-block-edit').getByRole('button', { name: 'Открыть оригинал' }).isVisible(), 'Не восстановилось действие для своего материала');
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    check(await page.locator('.cr-text s').first().evaluate(el => getComputedStyle(el).fontSize === '22px'), 'Оформление не восстановилось');
    const preview = await api(page, `/author/courses/${id}/preview/${lesson.id}`, 'POST', {});
    check(preview.status === 200, 'Предпросмотр не запустился');
    const previewState = (await api(page, `/course-sessions/${preview.data.id}`)).data;
    check(previewState.preview === true, 'Предпросмотр стал реальным занятием');
    await page.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await page.getByText('Я проверил учебные тексты, переводы и права на материалы.', { exact: true }).click();
    await page.getByRole('button', { name: 'Опубликовать курс', exact: true }).click();
    await page.getByRole('heading', { name: 'Курс опубликован', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
    await login(student, fixture.learner); await student.goto(base + '/courses/' + id);
    await student.getByRole('heading', { name: 'Проверка курса Ӕ/ӕ' }).waitFor();
    check(await student.locator('.cv-course-outcomes .cr-text span').evaluate(el => getComputedStyle(el).fontWeight === '700'),
      'Результаты обучения потеряли оформление после публикации');
    check(await student.getByText('Автор курса видит ваше имя и учебные результаты по этому курсу.', { exact: true }).count() === 0, 'На странице курса остался баннер');
    check(await student.locator('.cv-tabs').count() === 0, 'На странице курса остались вкладки каталога');
    check(await student.locator('.cv-summary, progress').count() === 0, 'На странице курса осталась боковая карточка прогресса');
    check((await api(student, '/author/courses/' + id)).status === 403, 'Ученик получил авторский доступ');
    check((await api(student, '/author/lesson-library')).status === 403, 'Ученик получил библиотеку автора');
    const noCsrf = await student.request.post(base + `/api/v1/courses/${id}/enroll`, { data: {} }); check(noCsrf.status() === 400, 'Нет CSRF-защиты');
    await student.getByRole('button', { name: 'Начать курс', exact: true }).click(); await student.waitForURL(/courses\/sessions\//);
    const sessionId = new URL(student.url()).pathname.split('/').pop();
    await student.getByRole('button', { name: 'Продолжить', exact: true }).waitFor();
    check(await student.locator('.cv-step[aria-current="step"]').textContent() === '1', 'Новый курс открылся не с первого блока');
    await student.goto(base + '/courses/' + id);
    await student.locator('.cv-course-status').getByRole('button', { name: 'Продолжить', exact: true }).waitFor();
    check(await student.getByRole('button', { name: 'Начать курс', exact: true }).count() === 0, 'Начатый курс снова предлагает начать');
    await student.screenshot({ path: path.join(out, 'course-started-phone.png'), fullPage: true });
    await student.locator('.cv-course-status').getByRole('button', { name: 'Продолжить', exact: true }).click();
    await student.waitForURL(base + '/courses/sessions/' + sessionId);
    check(true, 'Продолжение создало прежнюю сессию');
    const restarts = await Promise.all([1, 2, 3].map(() => api(student, `/courses/${id}/lessons/${lesson.id}/sessions`, 'POST', {})));
    check(restarts.every(r => r.status === 200 && r.data.id === sessionId), 'Повторный запуск создал дубликат');
    check(await student.locator('.cv-tabs, .cv-player progress:visible').count() === 0, 'В занятии остались вкладки или полоска вне содержания');
    check(await student.getByText('Автор курса видит ваше имя и учебные результаты по этому курсу.', { exact: true }).count() === 0, 'В проигрывателе остался баннер');
    check(await student.locator('.cv-step').nth(1).isEnabled(), 'Свободный переход к блоку заблокирован');
    const initial = (await api(student, `/course-sessions/${sessionId}`)).data;
    check(initial.theme === 'sky', 'Палитра не передана в занятие');
    check((await api(student, `/course-sessions/${sessionId}?block=${initial.steps[1].id}`)).status === 200, 'Просмотр блока недоступен');
    await student.locator('.cv-step').first().click();
    check(await student.locator('.cr-text s').first().evaluate(el => {
      const style = getComputedStyle(el), paragraph = getComputedStyle(el.parentElement);
      return style.fontSize === '22px' && style.fontStyle === 'italic' && style.fontSynthesisStyle === 'auto'
        && style.textDecorationLine.includes('line-through') && style.backgroundImage === 'none'
        && paragraph.textAlign === 'center' && parseFloat(paragraph.paddingInlineStart) > 0;
    }), 'Публикация потеряла курсив, зачёркивание или оформление абзаца');
    check(await student.locator('.cr-block-content').evaluate(el => getComputedStyle(el).textAlign === 'right'),
      'Выравнивание блока не дошло до проигрывателя');
    await student.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await student.getByRole('button', { name: 'Проверить ответ', exact: true }).waitFor();
    await student.locator('.cv-step').first().click();
    await student.locator('.cr-text').waitFor();
    check(await student.locator('.cv-step').first().evaluate(el => el.classList.contains('is-complete')), 'Пройденный квадрат не зелёный');
    await student.reload(); await student.locator('.cr-text').waitFor();
    check((await api(student, `/course-sessions/${sessionId}`)).data.step === 1, 'Просмотр предыдущего шага сбросил прогресс');
    await student.locator('.cv-step').nth(1).click();
    await student.getByRole('button', { name: 'Проверить ответ', exact: true }).waitFor();
    await student.reload(); await student.getByRole('button', { name: 'Проверить ответ', exact: true }).waitFor();
    const resumed = (await api(student, `/course-sessions/${sessionId}`)).data;
    check(resumed.step === 1 && resumed.block.result === null, 'Не восстановлен незавершённый блок');
    const drawerToggle = student.getByRole('button', { name: 'Содержание', exact: true });
    const contents = student.getByRole('dialog', { name: 'Программа курса' });
    const courseMeter = contents.getByRole('progressbar', { name: 'Прогресс по курсу' });
    await drawerToggle.click();
    check(await courseMeter.evaluate(el => el.value === 1 && el.max === 2), 'Общий прогресс не учитывает частично пройденный урок');
    const lessonMeter = contents.getByRole('button', { name: /Первый урок\. Пройдено 1 из 2 блоков/ }).locator('.cv-drawer-lesson-meter');
    check(await lessonMeter.evaluate(el => el.style.getPropertyValue('--cv-lesson-fill') === '50%'), 'Шкала урока не заполнена наполовину');
    await contents.screenshot({ path: path.join(out, 'drawer-progress-phone.png'), animations: 'disabled' });
    await student.keyboard.press('Escape');
    await contents.waitFor({ state: 'hidden' });
    check(!JSON.stringify(resumed).includes('expectedAnswer'), 'Эталон раскрыт до ответа');
    const foreign = await api(page, `/course-sessions/${sessionId}`); check(foreign.status === 404, 'Чужая сессия доступна');
    check(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Урок выходит за мобильный экран');
    await student.screenshot({ path: path.join(out, 'lesson-phone.png'), fullPage: true });
    // A failed attempt remains in history, but must not complete a course block.
    const tiles = student.locator('#exercise-tiles button');
    const draftRequest = student.waitForResponse(response => response.request().method() === 'PUT' &&
      response.url().endsWith('/draft') && response.status() === 204);
    await tiles.first().click();
    await draftRequest;
    const selectedWord = await student.locator('#exercise-picked button').textContent();
    await student.reload();
    await student.locator('#exercise-picked button').waitFor();
    check(await student.locator('#exercise-picked button').textContent() === selectedWord, 'Выбранное слово не восстановилось');
    await student.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    await student.locator('#exercise-result.is-incorrect').waitFor();
    check(await student.locator('#exercise-picked.is-correct').count() === 0, 'Неверная фраза подсвечена зелёным');
    const repeated = await api(student, `/course-sessions/${sessionId}/answers`, 'POST', { blockId: lesson.blocks[1].id, tokenIndices: [0] });
    check(repeated.status === 200 && repeated.data.alreadySubmitted, 'Повтор ответа создал новый результат');
    check((await api(student, `/course-sessions/${sessionId}/next`, 'POST', { blockId: lesson.blocks[1].id })).status === 409, 'Неверный ответ завершил блок');
    await student.getByRole('button', { name: 'Попробовать снова', exact: true }).click();
    await student.getByRole('button', { name: 'Проверить ответ', exact: true }).waitFor();
    for (const word of fixture.expected.split(/\s+/)) await student.locator('#exercise-tiles').getByRole('button', { name: word, exact: true }).first().click();
    const phraseResult = student.locator('#exercise-result');
    check(await student.locator('#exercise-picked.is-correct').count() === 0, 'Фраза подсвечена до проверки');
    const feedbackOffset = () => phraseResult.evaluate(el =>
      el.getBoundingClientRect().top - el.closest('.cv-exercise-block').getBoundingClientRect().top);
    const beforeFeedback = await feedbackOffset();
    await student.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    await student.locator('#exercise-result.is-correct').waitFor();
    check(await student.locator('#exercise-picked.is-correct + #exercise-result.is-correct').isVisible() &&
      (await phraseResult.innerText()).includes('Отлично! Фраза собрана верно.') &&
      !(await student.locator('#exercise-result').innerText()).includes('Правильный ответ:') &&
      !await student.locator('#exercise-submit').isVisible(), 'Верный ответ в уроке показывается отдельно от собранной фразы');
    check(Math.abs((await feedbackOffset()) - beforeFeedback) < 1, 'Результат меняет положение после проверки');
    const phraseUrl = `/course-sessions/${sessionId}?block=${lesson.blocks[1].id}`;
    const completedPhrase = (await api(student, phraseUrl)).data;
    const exerciseFooter = student.locator('.cv-exercise-block > .cv-exercise-actions');
    const replay = exerciseFooter.getByRole('button', { name: 'Собрать заново', exact: true });
    check(await replay.isVisible() && await exerciseFooter.getByRole('button', { name: 'Продолжить', exact: true }).isVisible() &&
      await student.locator('#exercise-result button').count() === 0,
      'Действия после ответа должны остаться в нижней панели');
    await student.reload();
    await student.locator('#exercise-result.is-correct').waitFor();
    check(await phraseResult.evaluate(el => el.getAnimations().length === 0 &&
      !el.previousElementSibling.classList.contains('show-correct-transition')),
      'Восстановленный результат проигрывает анимацию снова');
    await replay.press('Enter');
    await student.locator('#exercise-result.is-correct').waitFor({ state: 'hidden' });
    const replayedPhrase = (await api(student, phraseUrl)).data;
    check(replayedPhrase.completed && replayedPhrase.steps[1].completed && !replayedPhrase.block.result &&
      replayedPhrase.block.attemptId !== completedPhrase.block.attemptId, 'Повтор фразы сбросил зачёт или не открыл новую попытку');
    check(await student.locator('#exercise-picked button').count() === 0 &&
      await student.locator('#exercise-tiles button').first().evaluate(el => el === document.activeElement),
      'Повтор фразы не очистил ответ или не вернул фокус');
    for (const word of fixture.expected.split(/\s+/)) {
      await student.locator('#exercise-tiles').getByRole('button', { name: word, exact: true }).first().click();
    }
    await student.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    await replay.waitFor();
    await student.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await student.getByRole('heading', { name: 'Урок пройден', exact: true }).waitFor();
    await drawerToggle.click();
    check(await courseMeter.evaluate(el => el.value === 2 && el.max === 2), 'Общий прогресс не обновился после ответа');
    await student.keyboard.press('Escape');
    await contents.waitFor({ state: 'hidden' });
    await student.goto(base + '/courses/' + id); await student.getByText('Курс пройден', { exact: true }).waitFor();
    const heroPhoto = student.locator('.cv-hero-image');
    for (const width of [320, 390, 531]) {
      await student.setViewportSize({ width, height: 844 });
      check(await heroPhoto.evaluate(img => {
        const image = img.getBoundingClientRect();
        const intro = img.parentElement.querySelector('.cv-hero-intro').getBoundingClientRect();
        const copy = img.parentElement.querySelector('.cv-hero-copy').getBoundingClientRect();
        return Math.abs(image.width - image.height) < 1 && image.width <= 112 &&
          image.left >= intro.right && image.top < intro.bottom && copy.top >= image.bottom &&
          document.documentElement.scrollWidth <= innerWidth + 1;
      }), 'Фото вытеснило текст или вышло за экран при ширине ' + width);
      if (width === 531) await student.screenshot({ path: path.join(out, 'course-compact-531.png'), fullPage: true });
    }
    await student.setViewportSize({ width: 390, height: 844 });
    await student.screenshot({ path: path.join(out, 'course-completed-phone.png'), fullPage: true });
    await student.setViewportSize({ width: 1440, height: 1000 });
    check(await heroPhoto.evaluate(img => {
      const image = img.getBoundingClientRect();
      const title = img.parentElement.querySelector('.cv-hero-text').getBoundingClientRect();
      return Math.abs(image.width - image.height) < 1 && image.left > title.right;
    }), 'На широком экране фото не справа от текста');
    await student.screenshot({ path: path.join(out, 'course-completed-wide.png'), fullPage: true });
    await student.setViewportSize({ width: 390, height: 844 });
    const completedLesson = student.locator('.cv-course-program').getByRole('button', { name: lesson.title, exact: true });
    check(await completedLesson.getAttribute('aria-describedby') !== null, 'В строке урока недоступен статус прохождения');
    await completedLesson.press('Enter');
    await student.waitForURL(url => url.pathname.includes('/courses/sessions/') && url.searchParams.get('block') === lesson.blocks[1].id);
    check(await student.locator('.cv-step[aria-current="step"]').textContent() === '2', 'Повторное открытие показало не последний блок');
    await student.goto(base + '/courses/' + id);
    await student.getByRole('button', { name: 'Повторить курс', exact: true }).click();
    await student.waitForURL(url => url.pathname.includes('/courses/sessions/') && url.searchParams.get('block') === lesson.blocks[0].id);
    check(await student.locator('.cv-step[aria-current="step"]').textContent() === '1' &&
      (await api(student, `/course-sessions/${sessionId}`)).data.completed, 'Повтор курса не открыл начало или сбросил прогресс');
    await student.goto(base + '/my-courses');
    const myCourse = student.locator('.cm-list').getByRole('progressbar', { name: 'Прогресс: Проверка курса Ӕ/ӕ', exact: true });
    await myCourse.waitFor();
    check(await myCourse.getAttribute('aria-valuetext') === '100%, 2 из 2 блоков', 'Прогресс моих курсов');
    await student.goto(base + '/profile');
    await student.getByRole('heading', { name: 'Профиль', exact: true }).waitFor();
    check(await student.getByRole('link', { name: /Преподавание/ }).count() === 0, 'У ученика виден преподавательский раздел');
    await student.goto(base + '/my-courses?level=' + encodeURIComponent('Продвинутый'));
    await myCourse.waitFor();
    check(await student.getByRole('radiogroup', { name: 'Уровень курса' }).count() === 0 &&
      !new URL(student.url()).searchParams.has('level'), 'Личные курсы всё ещё фильтруются по уровню');
    const phoneCourseNav = student.getByRole('navigation', { name: 'Навигация по курсам' });
    check(await phoneCourseNav.getByRole('link', { name: 'Мои курсы', exact: true }).getAttribute('aria-current') === 'page', 'Личные курсы не отмечены в мобильной навигации');
    await phoneCourseNav.getByRole('link', { name: 'Каталог', exact: true }).press('Enter');
    await student.getByRole('heading', { name: 'Каталог курсов', exact: true }).waitFor();
    check(await phoneCourseNav.getByRole('link', { name: 'Каталог', exact: true }).getAttribute('aria-current') === 'page', 'Каталог не отмечен в мобильной навигации');
    await student.setViewportSize({ width: 768, height: 840 });
    await student.getByRole('button', { name: 'Открыть меню' }).click();
    await student.locator('.tablet-navigation').getByRole('link', { name: 'Мои курсы' }).click();
    await student.getByRole('heading', { name: 'Мои курсы', exact: true }).waitFor();
    await student.setViewportSize({ width: 390, height: 844 });
    // Save from two tabs: the stale draft must lose, while the published version remains pinned.
    const stale = (await api(page, '/author/courses/' + id)).data;
    const updated = JSON.parse(stale.draftJson); updated.title = 'Новая публикация';
    const changed = await api(page, '/author/courses/' + id + '/draft', 'PATCH', { stamp: stale.draftStamp, draft: updated }); check(changed.status === 200, 'Изменение курса');
    check((await api(page, '/author/courses/' + id + '/draft', 'PATCH', { stamp: stale.draftStamp, draft })).status === 409, 'Устаревшая вкладка перезаписала данные');
    check((await api(page, '/author/courses/' + id + '/publish', 'POST', { stamp: changed.data.draftStamp, reviewed: true })).status === 200, 'Новая публикация');
    check((await api(student, '/courses/' + id)).data.title === 'Новая публикация', 'Программа ученика не обновилась');
    const versions = (await api(page, `/author/courses/${id}/versions`)).data.versions;
    check(versions.length === 2 && versions[0].title === 'Новая публикация', 'Не видна история публикаций');
    const historic = await api(page, `/author/courses/${id}/preview/${lesson.id}?version=${versions[1].id}`, 'POST', {});
    check(historic.status === 200 && (await api(page, `/course-sessions/${historic.data.id}`)).data.preview, 'Исторический предпросмотр не открылся');
    check((await api(page, `/author/courses/${id}/versions/${versions[1].id}/restore`, 'POST', { stamp: changed.data.draftStamp })).status === 200, 'Версия не восстановлена');
    check((await api(student, '/courses/' + id)).data.title === 'Новая публикация', 'Восстановление изменило публикацию');
    const restored = (await api(page, `/author/courses/${id}`)).data;
    const linkedVersion = (await api(page, `/author/courses/${id}/lessons/${lesson.id}/library`, 'POST', { stamp: restored.draftStamp })).data;
    const linkedCourses = [];
    for (let i = 0; i < 2; i++) {
      const inclusion = (await api(page, `/author/lesson-library/${library[0].id}/inclusion`)).data;
      const response = await api(page, '/author/courses', 'POST', { title: 'Связанный курс ' + i, description: 'Проверка', modules: [
        { id: require('node:crypto').randomUUID(), title: 'Модуль', lessons: [inclusion] }
      ] });
      check(response.status === 201, 'Связанный урок не сохранён');
      linkedCourses.push(response.data);
    }
    const changes = await api(page, `/author/lesson-library/${linkedVersion.id}/update`, 'POST', { courses: [{ courseId: linkedCourses[0].id, stamp: 0 }] });
    check(changes.status === 200 && changes.data[0].saved, 'Связанный черновик не обновился');
    const included = async course => JSON.parse((await api(page, `/author/courses/${course.id}`)).data.draftJson).modules[0].lessons[0];
    const firstLink = await included(linkedCourses[0]); const secondLink = await included(linkedCourses[1]);
    check(firstLink.libraryVersionId === linkedVersion.id && secondLink.libraryVersionId === library[0].id && firstLink.blocks[0].id !== secondLink.blocks[0].id, 'Обновились чужие включения или совпали ID блоков');
    check((await api(student, `/author/courses/${id}/analytics`)).status === 403, 'Ученик видит отчёт автора');
    await page.goto(base + `/author/courses/${id}/analytics?days=7`);
    await page.getByRole('heading', { name: 'Результаты учеников', exact: true }).waitFor();
    await page.locator('.cv-report-student').first().waitFor();
    check(await page.locator('.cv-report-table img').count() === 0, 'В отчёте остались аватары');
    check((await api(page, `/author/courses/${id}/analytics`)).data.students.every(student => !('avatar' in student)), 'Отчёт передаёт данные аватара');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Отчёт переполняет экран шириной ' + width);
      if (width === 390) await page.screenshot({ path: path.join(out, 'analytics-phone.png'), fullPage: true });
    }
    await page.screenshot({ path: path.join(out, 'analytics-wide.png'), fullPage: true });
    await page.locator('.cv-report-student').first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('link', { name: '← Результаты курса', exact: true }).waitFor();
    check(await page.locator('#courses-workspace .back-link').count() === 1, 'В карточке ученика две ссылки назад');
    check((await page.locator('#courses-workspace .back-link').getAttribute('href')).endsWith('?days=7'), 'Возврат сбрасывает период отчёта');
    await guestPage.goto(base + '/courses/' + id); await guestPage.getByRole('heading', { name: 'Новая публикация' }).waitFor();
    await guestPage.getByRole('button', { name: 'Начать курс', exact: true }).click(); await guestPage.waitForURL(/courses\/sessions\//);
    await guestPage.getByRole('button', { name: 'Продолжить', exact: true }).click(); await guestPage.getByRole('button', { name: 'Проверить ответ', exact: true }).waitFor();
    const guestSessionUrl = guestPage.url();
    await guestPage.goto(base + '/courses/' + id);
    await guestPage.locator('.cv-course-status').getByRole('button', { name: 'Продолжить', exact: true }).click();
    await guestPage.waitForURL(url => url.pathname === new URL(guestSessionUrl).pathname); check(true, 'Гость продолжает начатую сессию');
    check(true, 'Гостевое прохождение');
    await page.goto(base + '/courses');
    const catalogSearch = page.getByLabel('Поиск по названию', { exact: true });
    const clearSearch = page.getByRole('button', { name: 'Очистить поиск' });
    const levelFilter = page.getByRole('radiogroup', { name: 'Уровень курса' });
    const allLevels = levelFilter.getByRole('radio', { name: 'Все уровни' });
    const advanced = levelFilter.getByRole('radio', { name: 'Продвинутый' });
    const searchBounds = await catalogSearch.boundingBox();
    check(await allLevels.isChecked() && await levelFilter.getByRole('radio').count() === 4, 'Варианты уровня доступны сразу');
    await catalogSearch.fill('Новая публикация');
    await page.waitForURL(url => url.searchParams.get('q') === 'Новая публикация');
    const catalogCard = page.getByRole('link', { name: 'Новая публикация', exact: true });
    check(await catalogCard.isVisible() && await page.locator('.cm-catalog-grid a').count() === 1 &&
      (await catalogSearch.boundingBox()).width === searchBounds.width, 'Поиск не отфильтровал карточки или изменил ширину поля');
    await clearSearch.click();
    check(await catalogSearch.inputValue() === '' && await catalogSearch.evaluate(el => el === document.activeElement), 'Сброс не вернул фокус полю');
    await allLevels.press('ArrowLeft');
    await page.waitForURL(url => url.searchParams.get('level') === 'Продвинутый');
    await page.reload();
    check(await advanced.isChecked(), 'Уровень не восстановился из ссылки');
    await page.screenshot({ path: path.join(out, 'catalog-filter-wide.png') });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check(await levelFilter.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
    }), 'Фильтр выходит за экран');
    await allLevels.check();
    await page.waitForURL(url => !url.searchParams.has('level'));
    await catalogSearch.fill('Новая публикация');
    await page.waitForURL(url => url.searchParams.get('q') === 'Новая публикация');
    await page.screenshot({ path: path.join(out, 'catalog-filter-phone.png') });
    await catalogCard.press('Enter');
    await page.waitForURL(base + '/courses/' + id);
    await page.getByRole('heading', { name: 'Новая публикация', exact: true }).waitFor();
    check(true, 'Карточка открывает программу курса с клавиатуры');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Switching lessons within a free-order course preserves the unfinished session.
    const secondDraft = (await api(page, '/author/courses/' + second.id)).data;
    const nextDraft = JSON.parse(secondDraft.draftJson);
    const nextLesson = {
      id: require('node:crypto').randomUUID(), title: 'Следующее занятие',
      blocks: ['Объяснение', 'Закрепление'].map(title => ({
        id: require('node:crypto').randomUUID(), kind: 'theory', title, text: 'Текст проверки'
      }))
    };
    nextDraft.description = 'Проверка переходов'; nextDraft.modules[0].lessons.push(nextLesson);
    const savedSecond = (await api(page, '/author/courses/' + second.id + '/draft', 'PATCH', { stamp: secondDraft.draftStamp, draft: nextDraft })).data;
    check((await api(page, '/author/courses/' + second.id + '/publish', 'POST', { stamp: savedSecond.draftStamp, reviewed: true })).status === 200, 'Курс для переходов не опубликован');
    await student.goto(base + '/courses/' + second.id); await student.getByRole('button', { name: 'Начать курс', exact: true }).click();
    const contentsToggle = student.getByRole('button', { name: 'Содержание', exact: true });
    await contentsToggle.waitFor(); const firstSessionUrl = student.url();
    await contentsToggle.click(); await student.locator('.cv-drawer-lesson').filter({ hasText: nextLesson.title }).click();
    await student.getByRole('heading', { name: 'Следующее занятие', exact: true }).waitFor();
    await student.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await student.getByRole('button', { name: 'Шаг 2: Закрепление, пройден', exact: true }).waitFor();
    const completedSession = new URL(student.url()).pathname;
    await contentsToggle.click(); await student.waitForTimeout(350); check(await student.locator('.cv-course-drawer').evaluate(e => e.open), 'Панель свернулась сразу после открытия'); await student.locator('.cv-course-drawer').hover(); await student.mouse.move(student.viewportSize().width - 20, 300); await student.locator('.cv-course-drawer').waitFor({ state: 'hidden' }); check(true, 'Панель закрылась при уходе мыши'); await contentsToggle.click(); await student.keyboard.press('Escape'); await student.locator('.cv-course-drawer').waitFor({ state: 'hidden' }); check(await student.locator('.cv-course-drawer').evaluate(e => !e.open), 'Панель не закрывается Escape'); await contentsToggle.click(); await student.locator('.cv-drawer-lesson').first().click();
    await student.waitForURL(url => url.pathname === new URL(firstSessionUrl).pathname); check(true, 'Переход вернул сохранённую сессию');
    await contentsToggle.click();
    await student.getByRole('button', { name: /Следующее занятие\. Пройдено 2 из 2 блоков/ }).click();
    await student.waitForURL(url => url.pathname === completedSession && url.searchParams.get('block') === nextLesson.blocks[0].id);
    check(await student.locator('.cv-step[aria-current="step"]').textContent() === '1' &&
      await student.locator('.cv-step.is-complete').count() === 2, 'Переход в завершённый урок открыл последний блок или изменил прогресс');
    await student.goto(base + '/courses');
    const enrolledCard = student.getByRole('link', { name: 'Другой курс', exact: true });
    await enrolledCard.locator('.cm-art').click();
    await student.waitForURL(base + '/courses/' + second.id);
    await student.locator('.cv-course-status').getByRole('button', { name: 'Продолжить', exact: true }).click();
    await student.waitForURL(/\/courses\/sessions\//);
    check(true, 'Щелчок по миниатюре открывает программу, из которой можно продолжить курс');
    await student.goto(firstSessionUrl);
    await student.setViewportSize({ width: 1440, height: 1000 });
    await student.getByRole('heading', { name: 'Изменённая копия', exact: true }).waitFor();
    check(await student.locator('.cv-player').evaluate(el => el.getBoundingClientRect().width > 1000), 'Контейнер остался узким');
    await student.screenshot({ path: path.join(out, 'lesson-wide.png'), fullPage: true });
    await page.keyboard.press('Tab'); check(await page.evaluate(() => document.activeElement !== document.body), 'Нет клавиатурного фокуса');
    await page.goto(base + '/courses');
    await page.locator('.cm-catalog-card').first().waitFor();
    await page.screenshot({ path: path.join(out, 'catalog-wide.png'), fullPage: true });
    await page.goto(base + '/courses/teaching');
    await page.getByRole('link', { name: 'Материалы упражнений', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/editor');
    await page.getByRole('heading', { name: 'Что вы хотите добавить?' }).waitFor();
    check(await page.locator('.editor-choices > a').count() === 10 &&
      await page.locator('.editor-choices a[href="/editor/new/grouping"]').isVisible(), 'При объединении потерялись типы материалов');
    await page.screenshot({ path: path.join(out, 'materials-wide.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Материалы выходят за экран');
    await page.screenshot({ path: path.join(out, 'materials-phone.png'), fullPage: true });

    const uuid = require('node:crypto').randomUUID;
    const mediaBlock = { id: uuid(), kind: 'listening', title: 'Запись', text: '', materialId: fixture.missingAudioId };
    const mediaLesson = { id: uuid(), title: 'Аудирование', blocks: [mediaBlock] };
    const mediaDraft = { title: 'Курс с записью', description: 'Проверка медиа', modules: [{ id: uuid(), title: 'Программа', lessons: [mediaLesson] }],
      coverPath: '/media/course-covers/' + uuid().replaceAll('-', '') + '.png' };
    const mediaCourse = (await api(page, '/author/courses', 'POST', mediaDraft)).data;
    const mediaAuthorUrl = '/author/courses/' + mediaCourse.id;
    const publicationIssues = await api(page, mediaAuthorUrl + '/publication-issues');
    check(publicationIssues.status === 200 && publicationIssues.data.some(issue => issue.message.includes('Главное фото')), 'Проверка пропустила отсутствующее главное фото');
    check(publicationIssues.data.some(issue => issue.blockId === mediaBlock.id && issue.lessonId === mediaLesson.id), 'Проверка не указала блок с отсутствующей записью');
    mediaDraft.coverPath = null;
    const withoutCover = await api(page, mediaAuthorUrl + '/draft', 'PATCH', { stamp: mediaCourse.draftStamp, draft: mediaDraft });
    check(withoutCover.status === 200 && (await api(page, mediaAuthorUrl + '/publish', 'POST', { stamp: withoutCover.data.draftStamp, reviewed: true })).status === 400, 'Курс опубликовался с отсутствующей записью');
    check((await api(guestPage, '/courses/' + mediaCourse.id)).status === 404, 'Неудачная публикация открыла черновик');

    mediaBlock.materialId = fixture.playableAudioId;
    const withAudio = await api(page, mediaAuthorUrl + '/draft', 'PATCH', { stamp: withoutCover.data.draftStamp, draft: mediaDraft });
    check(withAudio.status === 200 && (await api(page, mediaAuthorUrl + '/publish', 'POST', { stamp: withAudio.data.draftStamp, reviewed: true })).status === 200, 'Курс с существующей записью не опубликовался');
    check((await author.request.get(base + fixture.audioPath)).status() === 200, 'Автор не может открыть свою запись');
    check((await guest.request.get(base + fixture.audioPath)).status() === 404 && (await learner.request.get(base + fixture.audioPath)).status() === 404, 'Прямая ссылка открывает личную запись');
    const mediaStart = await api(student, `/courses/${mediaCourse.id}/lessons/${mediaLesson.id}/sessions`, 'POST', {});
    check(mediaStart.status === 200, 'Ученик не может начать аудирование');
    await student.goto(base + '/courses/sessions/' + mediaStart.data.id);
    await student.locator('audio').waitFor();
    await student.waitForFunction(() => document.querySelector('audio')?.readyState >= 1);
    const streamUrl = await student.locator('audio').getAttribute('src');
    check(streamUrl.startsWith('/api/v1/course-sessions/') && streamUrl !== fixture.audioPath, 'Плеер использует прямую ссылку вместо защищённой');
    const range = await learner.request.get(base + streamUrl, { headers: { Range: 'bytes=0-43' } });
    check(range.status() === 206 && (await range.body()).subarray(0, 4).toString() === 'RIFF', 'Плеер не может загружать запись по частям');
    check((await guest.request.get(base + streamUrl)).status() === 404 && (await author.request.get(base + streamUrl)).status() === 404, 'Чужая сессия открывает запись');
    const listeningOptions = student.locator('#listening-options button');
    check(await listeningOptions.count() === 4 && await student.locator('#listening-transcript-block').isHidden(), 'У аудирования неверный формат или открыт текст записи до ответа');
    await listeningOptions.nth(2).click();
    await student.locator('#listening-result.is-correct').waitFor();
    check(await listeningOptions.nth(2).evaluate(option => option.classList.contains('is-correct')), 'Правильный вариант аудирования не выделен');
    check(await student.getByRole('button', { name: 'Продолжить', exact: true }).isVisible(), 'Верный ответ аудирования не завершил блок');


    const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await admin.newPage();
    await login(adminPage, fixture.admin);
    await adminPage.goto(base + '/profile');
    const accountLinks = adminPage.getByRole('navigation', { name: 'Учётная запись' }).getByRole('link');
    check((await accountLinks.allTextContents()).map(text => text.trim()).join('|') ===
        'Учётная запись|Мои результаты|Панель администратора', 'Неверный порядок пунктов меню аккаунта');
    const nameForm = adminPage.locator('.profile-public-name');
    const publicName = nameForm.getByLabel('Имя', { exact: true });
    const existingName = await adminPage.locator('.profile-person-name').innerText();
    const nameTrigger = adminPage.getByRole('button', { name: /Публичное имя/ });
    await nameTrigger.click();
    check(await adminPage.getByRole('link', { name: 'Панель администратора', exact: true }).locator('svg').isVisible(), 'В профиле нет иконки админки');
    check(await publicName.getAttribute('required') !== null, 'Публичное имя не отмечено обязательным');
    await publicName.fill('   ');
    await nameForm.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await nameForm.getByRole('alert').filter({ hasText: 'Введите имя.' }).waitFor();
    check(await publicName.inputValue() === '   ' &&
        await adminPage.locator('.profile-person-name').innerText() === existingName &&
        await publicName.getAttribute('aria-invalid') === 'true', 'Ошибка имени потеряла введённое или сохранённое значение');
    await adminPage.setViewportSize({ width: 390, height: 800 });
    check(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Форма профиля переполняет мобильный экран');
    await publicName.press('Escape');
    await adminPage.waitForFunction(() => document.activeElement?.id === 'profile-name-trigger');
    check(await nameForm.isHidden(), 'Диалог имени не закрылся клавишей Escape');
    await adminPage.getByRole('link', { name: 'Все результаты' }).waitFor();
    await adminPage.waitForFunction(() => document.getElementById('progress-points')?.textContent !== '—');
    const profileLayouts = [];
    for (const width of [320, 390, 538, 1280]) {
        await adminPage.setViewportSize({ width, height: 800 });
        profileLayouts.push(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    check(profileLayouts.every(Boolean), 'Профиль переполняет экран');
    await adminPage.emulateMedia({ reducedMotion: 'reduce' });
    check(await adminPage.locator('.profile-summary').evaluate(node => getComputedStyle(node).animationName === 'none'),
        'Профиль игнорирует настройку уменьшения движения');
    await nameTrigger.click();
    await publicName.fill('Имя Ӕ ӕ');
    await nameForm.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await adminPage.getByRole('status').filter({ hasText: 'Имя сохранено.' }).waitFor();
    check(await adminPage.locator('.profile-person-name').innerText() === 'Имя Ӕ ӕ', 'Новое имя не отобразилось в профиле');

    await page.goto(base + mediaAuthorUrl);
    const publishButton = page.getByRole('button', { name: 'Опубликовать', exact: true });
    await publishButton.waitFor();
    const blockReason = 'Проверка уведомления автора';
    await adminPage.goto(base + '/admin/courses/' + mediaCourse.id);
    await adminPage.getByLabel('Причина').fill(blockReason);
    await adminPage.getByRole('button', { name: 'Заблокировать курс', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Разблокировать курс', exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.locator('#courses-workspace [role=alert]').filter({ hasText: blockReason }).waitFor();
    check(await publishButton.isDisabled(), 'Открытый редактор не отреагировал на блокировку');
    check((await api(page, mediaAuthorUrl + '/publish', 'POST', { stamp: withAudio.data.draftStamp, reviewed: true })).data.error.includes(blockReason), 'Сервер скрыл причину при попытке публикации');
    await page.goto(base + '/courses/teaching');
    await page.locator('.cv-author-row').filter({ hasText: mediaDraft.title }).getByText('Причина: ' + blockReason).waitFor();
    check(true, 'Причина блокировки видна в списке автора');
    await page.goto(base + mediaAuthorUrl);
    await publishButton.waitFor();
    await adminPage.getByLabel('Причина').fill('Проверка снятия блокировки');
    await adminPage.getByRole('button', { name: 'Разблокировать курс', exact: true }).click();
    await adminPage.getByRole('button', { name: 'Заблокировать курс', exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('.cs-header .cs-primary')?.disabled === false);
    check(await publishButton.isEnabled(), 'После снятия блокировки нельзя опубликовать курс');
    await admin.close();

    const deleteBody = { stamp: withAudio.data.draftStamp };
    check((await api(colleaguePage, mediaAuthorUrl, 'DELETE', deleteBody)).status === 404, 'Другой преподаватель может удалить курс');
    await colleague.close();
    const deleteWithoutCsrf = await author.request.delete(base + '/api/v1' + mediaAuthorUrl, { data: deleteBody });
    check(deleteWithoutCsrf.status() === 400, 'Удаление не защищено от CSRF');
    check((await api(page, mediaAuthorUrl, 'DELETE', { stamp: deleteBody.stamp + 1 })).status === 409, 'Курс удаляется из устаревшей вкладки');
    const savedLesson = await api(page, mediaAuthorUrl + '/lessons/' + mediaLesson.id + '/library', 'POST', deleteBody);
    check(savedLesson.status === 200, 'Урок не сохранён в личной библиотеке');
    const courseActions = page.getByRole('button', { name: 'Действия с курсом', exact: true });
    const deleteAction = page.getByRole('button', { name: 'Удалить курс', exact: true });
    const confirmDeletion = page.getByRole('dialog', { name: 'Удалить курс навсегда?' });
    await page.setViewportSize({ width: 390, height: 844 });
    await courseActions.click();
    await deleteAction.click();
    check(await confirmDeletion.getByRole('button', { name: 'Отмена', exact: true }).evaluate(el => el === document.activeElement), 'Подтверждение не ставит фокус на отмену');
    await confirmDeletion.screenshot({ path: path.join(out, 'delete-course-phone.png') });
    await page.keyboard.press('Escape');
    await confirmDeletion.waitFor({ state: 'hidden' });
    check((await api(page, mediaAuthorUrl)).status === 200, 'Отмена удалила курс');
    await courseActions.click();
    await deleteAction.click();
    await confirmDeletion.getByRole('button', { name: 'Удалить навсегда', exact: true }).click();
    await page.waitForURL(base + '/courses/teaching');
    check((await api(guestPage, '/courses/' + mediaCourse.id)).status === 404 &&
        (await api(student, '/course-sessions/' + mediaStart.data.id)).status === 404 &&
        (await learner.request.get(base + streamUrl)).status() === 404, 'Старые ссылки открывают удалённый курс, урок или запись');
    for (const [viewer, list] of [[page, '/author/courses'], [student, '/me/courses'], [guestPage, '/courses']]) {
      check(!(await api(viewer, list)).data.some(course => course.id === mediaCourse.id), 'Удалённый курс остался в списке ' + list);
    }
    const libraryAfterDeletion = (await api(page, '/author/lesson-library')).data.find(entry => entry.id === savedLesson.data.id);
    check(libraryAfterDeletion?.sourceAvailable === false && libraryAfterDeletion.lesson.title === mediaLesson.title, 'Удаление затронуло сохранённый урок библиотеки');
    await page.setViewportSize({ width: 1440, height: 1000 });

    await require('./course-theory-media.cjs')({ api, base, page, student, author, learner, guest, browser, login, fixture, check, out });
    const shared = await guest.newPage();
    shared.on('pageerror', error => errors.push(error.message));
    await shared.goto(base + '/courses/' + fixture.practiceCourseId);
    const practice = await api(shared, `/courses/${fixture.practiceCourseId}/lessons/${fixture.practiceLessonId}/sessions`, 'POST', {});
    check(practice.status === 200, 'Гостевая сессия для общих проигрывателей не открылась: ' + practice.status);
    const practiceUrl = '/course-sessions/' + practice.data.id;
    const practiceState = (await api(shared, practiceUrl)).data;
    const media = await author.request.get(base + fixture.audioPath);
    const wave = await media.body();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=', 'base64');
    await shared.route('**/api/v1' + practiceUrl + '/media/*', route => {
      const audioBlock = route.request().url().endsWith(practiceState.steps[0].id);
      return route.fulfill({ contentType: audioBlock ? 'audio/wav' : 'image/png', body: audioBlock ? wave : png });
    });
    await shared.goto(base + '/courses/sessions/' + practice.data.id);
    const audioOptions = shared.locator('#exercise-options');
    await audioOptions.getByRole('button', { name: 'А', exact: true }).click();
    check(await audioOptions.getByRole('button', { name: 'А', exact: true }).isDisabled() &&
      await shared.locator('#exercise-hint').isVisible(), 'Аудиопазл не обрабатывает неверный выбор по шагам');
    await audioOptions.getByRole('button', { name: 'Ӕ', exact: true }).click();
    await audioOptions.getByRole('button', { name: 'ӕ', exact: true }).click();
    await shared.locator('#exercise-result.is-correct').waitFor();
    const nextShared = shared.getByRole('button', { name: 'Продолжить', exact: true });
    await nextShared.click();

    const match = (side, name) => shared.locator('#matching-' + side).getByRole('button', { name, exact: true });
    await match('left', 'А').click();
    await match('right', 'Б').click();
    const matchedThread = shared.locator('#matching-threads .game-thread-matched');
    // A horizontal SVG path has a zero-height bounding box, even with a visible stroke.
    await matchedThread.waitFor({ state: 'attached' });
    await shared.reload();
    await matchedThread.waitFor({ state: 'attached' });
    check(await match('left', 'А').isDisabled(), 'Сохранённая пара потерялась после перезагрузки');
    await match('left', 'В').click();
    await match('right', 'Г').click();
    await nextShared.click();

    const picture = shared.locator('#picture-play');
    await picture.getByRole('textbox', { name: 'Осетинское слово' }).fill('Ӕ');
    await picture.getByRole('button', { name: 'Проверить ответ' }).click();
    await picture.locator('#picture-result.is-correct').waitFor();
    await nextShared.click();

    const grammar = shared.locator('#grammar-play');
    await grammar.getByRole('button', { name: 'А', exact: true }).click();
    await grammar.locator('#grammar-rule').waitFor();
    check((await grammar.locator('#grammar-rule').textContent()).includes('Правило'), 'Форма слова не показала подсказку');
    await grammar.getByRole('button', { name: 'ӕ', exact: true }).click();
    await grammar.locator('.grammar-inserted').waitFor();
    check((await grammar.locator('.grammar-inserted').textContent()) === 'ӕ', 'Форма слова не вставлена в предложение');
    await nextShared.click();

    const dialog = shared.locator('#dialog-play');
    await dialog.locator('#dialog-options').getByRole('button', { name: 'ӕ', exact: true }).click();
    await dialog.locator('#dialog-summary').waitFor();
    await nextShared.click();
    await shared.getByRole('heading', { name: 'Урок пройден', exact: true }).waitFor();
    check(await shared.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Общий проигрыватель выходит за экран телефона');
    await shared.close();
    check(errors.length === 0, 'Ошибки JavaScript: ' + errors.join('; '));
    console.log(`Course browser checks: ${checks} passed.`);
  } catch (e) {
    console.error('Ошибки страницы:', errors.join('; '));
    console.error('Состояние занятия:', await student.locator('#courses-workspace').innerText().catch(() => 'Страница недоступна'));
    await student.screenshot({ path: path.join(out, 'failure-student.png'), fullPage: true }).catch(() => {});
    throw e;
  } finally { await browser.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
