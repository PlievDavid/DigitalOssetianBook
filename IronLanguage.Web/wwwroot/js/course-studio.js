window.AdamCourseStudio = async function (ui) {
  'use strict';
  const { root, api, post, node, append, link, button, actions, field, confirm, run, showError, notice, message, setDirty } = ui;
  await import('/js/course-rich-text.js'); await window.AdamCourseRichText.load();
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/css/course-studio.css'; document.head.append(style);
  const id = location.pathname.split('/').pop();
  const course = await api(`/author/courses/${id}`), materials = await api('/author/course-materials');
  let draft = JSON.parse(course.draftJson), stamp = course.draftStamp, changed = 0, saved = 0, saving, timer, conflict = false;
  let tab = 'program', selectedLesson = draft.modules[0]?.lessons[0]?.id, selectedBlock = null, showProgram = false;
  const icon = name => {
    const paths = { plus: 'M12 5v14M5 12h14', dots: 'M5 12h.01M12 12h.01M19 12h.01', text: 'M5 5h14M12 5v14M8 19h8', tiles: 'M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6', book: 'M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM14 7h6v12h-6', check: 'M5 12l4 4L19 6', arrow: 'M14 6l-6 6 6 6', chevron: 'M8 10l4 4 4-4' };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', paths[name] || paths.book); svg.append(p); return svg;
  };
  const action = (label, handler, glyph, cls = 'cs-action') => { const b = button('', handler, cls); if (glyph) b.append(icon(glyph)); b.append(node('span', label)); return b; };
  const iconButton = (label, handler, glyph = 'dots') => { const b = button('', handler, 'cs-icon'); b.setAttribute('aria-label', label); b.title = label; b.append(icon(glyph)); return b; };
  const uuid = () => crypto.randomUUID();
  const status = node('span', 'Все изменения сохранены', 'cs-save-state'); status.setAttribute('role', 'status');
  const canvas = node('div', null, 'cs-canvas'), sidebar = node('aside', null, 'cs-program'), content = node('div', null, 'cs-workspace');
  const title = node('h1', draft.title, 'cs-course-title');
  const recovery = node('div', null, 'cv-notice error'); recovery.hidden = true;
  const publish = action('Опубликовать', openPublication, null, 'cs-primary'); publish.disabled = course.archived;
  const dirty = () => {
    changed++; setDirty(true); status.textContent = 'Сохраняем изменения…'; status.dataset.state = 'pending';
    clearTimeout(timer); timer = setTimeout(() => save().catch(showError), 900);
  };
  async function save() {
    clearTimeout(timer);
    if (conflict) throw new Error('Курс изменён в другой вкладке. Сначала сохраните копию своих правок.');
    if (saving) { await saving; if (changed !== saved) return save(); return; }
    if (changed === saved) return;
    const revision = changed;
    saving = api(`/author/courses/${id}/draft`, { method: 'PATCH', body: JSON.stringify({ stamp, draft }) }).then(result => {
      stamp = result.draftStamp; saved = revision; setDirty(saved !== changed);
      status.textContent = saved === changed ? 'Все изменения сохранены' : 'Сохраняем изменения…'; status.dataset.state = saved === changed ? 'saved' : 'pending';
    }).catch(e => { status.textContent = 'Не удалось сохранить'; status.dataset.state = 'error'; conflict = e.status === 409; if (conflict) recovery.hidden = false; throw e; }).finally(() => saving = null);
    await saving; if (saved !== changed) return save();
  }
  function modal(titleText, build) {
    const before = document.activeElement, d = node('dialog', null, 'cs-dialog');
    const close = () => { d.close(); d.remove(); before?.isConnected && before.focus(); };
    const head = append(node('div', null, 'cs-dialog-head'), node('h2', titleText), action('Закрыть', close));
    d.append(head); build(d, close); document.body.append(d); d.showModal();
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    return d;
  }
  function current() {
    for (const module of draft.modules) { const lesson = module.lessons.find(l => l.id === selectedLesson); if (lesson) return { module, lesson }; }
    return {};
  }
  const mutate = fn => { fn(); dirty(); draw(); };
  const ordered = (array, item, delta) => { const i = array.indexOf(item), j = i + delta; if (j >= 0 && j < array.length) [array[i], array[j]] = [array[j], array[i]]; };
  function newLesson(module) {
    mutate(() => { const lesson = { id: uuid(), title: 'Новый урок', blocks: [] }; module.lessons.push(lesson); selectedLesson = lesson.id; selectedBlock = null; showProgram = false; });
    canvas.querySelector('[aria-label="Название урока"]')?.focus();
  }
  async function saveToLibrary(lesson) {
    try { await save(); await post(`/author/courses/${id}/lessons/${lesson.id}/library`, { stamp }); notice('Урок сохранён в библиотеке преподавания. Его можно добавить в другой курс.'); }
    catch (e) { showError(e); }
  }
  async function fromLibrary(module) {
    try {
      const lessons = await api('/author/lesson-library');
      modal('Добавить урок из библиотеки', (d, close) => {
        d.append(node('p', 'Добавится независимая копия. Изменения в этом курсе не затронут библиотеку и другие курсы.', 'cs-help'));
        const list = node('div');
        const draw = query => { list.replaceChildren(); const found = lessons.filter(x => x.lesson.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
          if (!found.length) list.append(node('p', lessons.length ? 'Уроки не найдены.' : 'Сначала сохраните урок в библиотеку через меню урока.', 'cs-help'));
          found.forEach(x => list.append(action(`${x.lesson.title} · ${x.lesson.blocks.length} блоков`, () => {
            mutate(() => { const copy = structuredClone(x.lesson); copy.id = uuid(); copy.blocks.forEach(b => b.id = uuid()); module.lessons.push(copy); selectedLesson = copy.id; selectedBlock = null; showProgram = false; }); close();
          }, 'plus', 'cs-library-choice')));
        };
        d.append(field('Найти урок', '', draw), list); draw('');
      });
    } catch (e) { showError(e); }
  }
  function newModule() {
    let name = 'Новый модуль';
    modal('Добавить модуль', (d, close) => {
      d.append(field('Название модуля', name, v => name = v, { max: 150 }), node('p', 'Объедините в модуль уроки одной темы.', 'cs-help'), action('Добавить модуль', () => {
        if (!name.trim()) return;
        mutate(() => { const module = { id: uuid(), title: name.trim(), lessons: [] }; draft.modules.push(module); const lesson = { id: uuid(), title: 'Первый урок', blocks: [] }; module.lessons.push(lesson); selectedLesson = lesson.id; showProgram = false; }); close();
      }, 'plus', 'cs-primary'));
    });
  }
  function moduleSettings(module) {
    let name = module.title;
    modal('Настройки модуля', (d, close) => {
      const commitName = () => { if (!name.trim()) return; mutate(() => module.title = name.trim()); close(); };
      d.append(field('Название модуля', name, v => name = v, { max: 150 }), action('Сохранить название', commitName, null, 'cs-primary'));
      d.append(node('hr'), actions(action('Переместить выше', () => { mutate(() => ordered(draft.modules, module, -1)); close(); }), action('Переместить ниже', () => { mutate(() => ordered(draft.modules, module, 1)); close(); })));
      d.append(action('Удалить модуль', async () => {
        close(); if (await confirm('Удалить модуль?', 'Все его уроки будут удалены из черновика. Опубликованная версия сохранится.', 'Удалить')) mutate(() => { draft.modules = draft.modules.filter(m => m.id !== module.id); selectedLesson = draft.modules[0]?.lessons[0]?.id; });
      }, null, 'cs-action cs-danger'));
    });
  }
  function duplicateLesson(module, lesson) {
    mutate(() => { const copy = structuredClone(lesson); copy.id = uuid(); copy.title = `${copy.title.slice(0, 138)} — копия`; copy.blocks.forEach(b => b.id = uuid()); module.lessons.splice(module.lessons.indexOf(lesson) + 1, 0, copy); selectedLesson = copy.id; selectedBlock = null; });
  }
  async function deleteLesson(module, lesson) {
    if (await confirm('Удалить урок?', `«${lesson.title}» будет удалён только из черновика курса. Опубликованная версия сохранится.`, 'Удалить')) {
      mutate(() => { const index = module.lessons.indexOf(lesson); module.lessons.splice(index, 1); if (selectedLesson === lesson.id) { selectedLesson = module.lessons[Math.min(index, module.lessons.length - 1)]?.id ?? draft.modules.flatMap(m => m.lessons)[0]?.id; selectedBlock = null; } });
      sidebar.querySelector('.cs-lesson[aria-current="true"]')?.focus();
    }
  }
  function lessonMenu(module, lesson, anchor, point) {
    document.querySelector('.cs-lesson-menu')?.remove();
    const menu = node('div', null, 'cs-lesson-menu'); menu.popover = 'auto';
    menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Действия с уроком ' + lesson.title);
    anchor.setAttribute('aria-expanded', 'true');
    const close = () => { menu.hidePopover(); if (anchor.isConnected) anchor.focus(); };
    const item = (label, handler, danger = false) => {
      const b = action(label, () => { close(); return handler(); }, null, 'cs-action' + (danger ? ' cs-danger' : ''));
      b.setAttribute('role', 'menuitem'); b.tabIndex = -1; menu.append(b);
    };
    item('Переименовать / настройки', () => lessonSettings(module, lesson));
    item('Дублировать', () => duplicateLesson(module, lesson));
    item('Сохранить в библиотеку', () => saveToLibrary(lesson));
    item('Переместить выше', () => mutate(() => ordered(module.lessons, lesson, -1)));
    menu.lastChild.disabled = module.lessons.indexOf(lesson) === 0;
    item('Переместить ниже', () => mutate(() => ordered(module.lessons, lesson, 1)));
    menu.lastChild.disabled = module.lessons.indexOf(lesson) === module.lessons.length - 1;
    item('Удалить урок', () => deleteLesson(module, lesson), true);
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('button:not(:disabled)')], index = items.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
    });
    menu.addEventListener('toggle', e => { if (e.newState === 'closed') { anchor.setAttribute('aria-expanded', 'false'); menu.remove(); } });
    document.body.append(menu); menu.showPopover();
    const rect = anchor.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(point?.x ?? rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(point?.y ?? rect.bottom, innerHeight - menu.offsetHeight - 8)) + 'px';
    menu.querySelector('button:not(:disabled)').focus();
  }
  function lessonSettings(module, lesson) {
    modal('Настройки урока', (d, close) => {
      let name = lesson.title;
      d.append(action('Сохранить в библиотеку', async () => { close(); await saveToLibrary(lesson); }));
      d.append(field('Название урока', name, v => name = v, { max: 150 }), action('Сохранить название', () => { if (!name.trim()) return; mutate(() => lesson.title = name.trim()); close(); }, null, 'cs-primary'));
      if (draft.modules.length > 1) d.append(field('Модуль', module.id, value => { const destination = draft.modules.find(m => m.id === value); mutate(() => { module.lessons = module.lessons.filter(l => l.id !== lesson.id); destination.lessons.push(lesson); }); close(); }, { values: draft.modules.map(m => ({ label: m.title, value: m.id })) }));
      d.append(node('hr'), actions(action('Выше', () => { mutate(() => ordered(module.lessons, lesson, -1)); close(); }), action('Ниже', () => { mutate(() => ordered(module.lessons, lesson, 1)); close(); }), action('Дублировать', () => {
        duplicateLesson(module, lesson); close();
      })));
      d.append(action('Удалить урок', async () => { close(); await deleteLesson(module, lesson); }, null, 'cs-action cs-danger'));
    });
  }
  function blockMenu(lesson, block) {
    modal('Действия с блоком', (d, close) => {
      d.append(actions(action('Переместить выше', () => { mutate(() => ordered(lesson.blocks, block, -1)); close(); }), action('Переместить ниже', () => { mutate(() => ordered(lesson.blocks, block, 1)); close(); }), action('Дублировать', () => {
        mutate(() => { const copy = { ...structuredClone(block), id: uuid() }; lesson.blocks.splice(lesson.blocks.indexOf(block) + 1, 0, copy); selectedBlock = copy.id; }); close();
      })));
      d.append(action('Удалить блок', async () => { close(); if (await confirm('Удалить блок?', 'Опубликованные версии курса останутся прежними.', 'Удалить')) mutate(() => { lesson.blocks = lesson.blocks.filter(b => b.id !== block.id); selectedBlock = null; }); }, null, 'cs-action cs-danger'));
    });
  }
  function addBlock(lesson) {
    modal('Что добавить в урок?', (d, close) => {
      d.append(node('p', 'Чередуйте объяснения с практикой. Порядок можно изменить в любой момент.', 'cs-help'));
      const choice = (label, description, kind, glyph) => {
        const b = button('', () => { mutate(() => { const block = { id: uuid(), kind, title: label, text: '', materialId: kind === 'translation' ? materials[0]?.id : null }; lesson.blocks.push(block); selectedBlock = block.id; }); close(); canvas.querySelector('.cs-block-edit input')?.focus(); }, 'cs-block-choice');
        b.append(icon(glyph), append(node('span'), node('strong', label), node('small', description))); return b;
      };
      d.append(choice('Объяснение', 'Правило, пример или короткая инструкция', 'theory', 'text'));
      const exercise = choice('Собери фразу', 'Практика с проверкой ответа из вашей библиотеки', 'translation', 'tiles'); exercise.disabled = !materials.length; d.append(exercise);
      if (!materials.length) d.append(node('p', 'Сначала опубликуйте задание «Собери фразу» в библиотеке материалов.', 'cs-help'), link('Открыть библиотеку', '/editor', 'cs-text-link'));
    });
  }
  async function openPublication() {
    try { await save(); } catch (e) { showError(e); return; }
    modal(course.publishedVersionId ? 'Опубликовать изменения' : 'Курс готов к публикации?', (d, close) => {
      const lessons = draft.modules.flatMap(m => m.lessons);
      d.append(append(node('div', null, 'cs-publish-summary'), icon('book'), append(node('div'), node('strong', draft.title), node('p', `${draft.modules.length} модулей · ${lessons.length} уроков · ${lessons.reduce((n, l) => n + l.blocks.length, 0)} блоков`))));
      d.append(node('p', 'Курс появится в каталоге сразу после проверки заполнения. Ученики, уже начавшие обучение, сохранят свою программу.', 'cs-help'));
      const check = document.createElement('input'); check.type = 'checkbox';
      d.append(append(node('label', null, 'cv-check'), check, node('span', 'Я проверил учебные тексты, переводы и права на материалы.')));
      const error = node('p', null, 'cs-form-error'); error.setAttribute('role', 'alert'); d.append(error);
      const commit = action('Опубликовать курс', async e => {
        if (!check.checked) { error.textContent = 'Подтвердите проверку содержания и прав.'; check.focus(); return; }
        e.currentTarget.disabled = true;
        try {
          const version = await post(`/author/courses/${id}/publish`, { stamp, reviewed: true });
          course.publishedVersionId = version.id; close(); notice(`Версия ${version.number} опубликована.`);
          modal('Курс опубликован', (success, done) => { success.append(node('p', 'Теперь ученики могут открыть вашу программу и начать обучение.', 'cs-help'), actions(link('Посмотреть курс', `/courses/${id}`, 'cs-primary'), action('Продолжить редактирование', done))); });
        } catch (e) { error.textContent = e.message; commit.disabled = false; }
      }, null, 'cs-primary'); d.append(commit);
    });
  }
  async function preview(e) {
    const { lesson } = current(); if (!lesson) return;
    await run(e.currentTarget, async () => { await save(); const session = await post(`/author/courses/${id}/preview/${lesson.id}`); location.href = `/courses/sessions/${session.id}`; });
  }
  function drawTree() {
    sidebar.replaceChildren(); sidebar.append(append(node('div', null, 'cs-program-head'), node('h2', 'Программа'), iconButton('Добавить модуль', newModule, 'plus')));
    draft.modules.forEach((m, mi) => {
      const section = node('section', null, 'cs-module');
      section.append(append(node('div', null, 'cs-module-head'), append(node('div'), node('small', `Модуль ${mi + 1}`), node('strong', m.title)), iconButton('Настройки модуля ' + m.title, () => moduleSettings(m))));
      m.lessons.forEach((l, li) => {
        const b = button('', () => { selectedLesson = l.id; selectedBlock = null; showProgram = false; draw(); }, 'cs-lesson');
        b.setAttribute('aria-current', String(l.id === selectedLesson)); b.append(node('span', String(li + 1), 'cs-lesson-number'), node('span', l.title));
        const more = iconButton('Действия с уроком ' + l.title, () => lessonMenu(m, l, more)); more.classList.add('cs-touch-menu'); more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false');
        const row = append(node('div', null, 'cs-lesson-row'), b, more);
        b.setAttribute('aria-haspopup', 'menu');
        row.addEventListener('contextmenu', e => { e.preventDefault(); lessonMenu(m, l, b, { x: e.clientX, y: e.clientY }); });
        row.addEventListener('keydown', e => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); lessonMenu(m, l, b); } });
        section.append(row);
      });
      section.append(action('Добавить урок', () => newLesson(m), 'plus', 'cs-add-lesson'), action('Из библиотеки', () => fromLibrary(m), 'book', 'cs-add-lesson')); sidebar.append(section);
    });
    sidebar.append(action('Добавить модуль', newModule, 'plus', 'cs-add-module'));
  }
  function drawLesson() {
    canvas.replaceChildren(); const { module, lesson } = current();
    if (!lesson) {
      const empty = append(node('div', null, 'cs-start'), icon('book'), node('h2', 'Начните с первого урока'), node('p', 'Объедините уроки одной темы в модуль. Внутри урока можно добавить объяснение и практику.'), action('Добавить модуль', newModule, 'plus', 'cs-primary'));
      canvas.append(empty); return;
    }
    const lessonTitle = document.createElement('input'); lessonTitle.value = lesson.title; lessonTitle.maxLength = 150; lessonTitle.className = 'cs-lesson-title'; lessonTitle.setAttribute('aria-label', 'Название урока');
    lessonTitle.addEventListener('input', () => { lesson.title = lessonTitle.value; dirty(); const active = sidebar.querySelector('.cs-lesson[aria-current="true"] span:last-child'); if (active) active.textContent = lesson.title; });
    canvas.append(append(node('header', null, 'cs-lesson-heading'), append(node('div'), node('p', module.title, 'cs-breadcrumb'), lessonTitle, node('p', `${lesson.blocks.length} блоков · Изменения сохраняются автоматически`, 'cs-help')), iconButton('Настройки урока', () => lessonSettings(module, lesson))));
    if (!lesson.blocks.length) canvas.append(append(node('div', null, 'cs-lesson-empty'), icon('text'), node('h2', 'Чему посвящён этот урок?'), node('p', 'Начните с короткого объяснения, а затем предложите ученику попробовать самому.')));
    lesson.blocks.forEach((b, bi) => {
      const editing = selectedBlock === b.id;
      const card = node('article', null, `cs-block${editing ? ' cs-block-edit' : ''}`);
      card.append(append(node('div', null, 'cs-block-head'), append(node('span', null, 'cs-block-type'), icon(b.kind === 'theory' ? 'text' : 'tiles'), node('span', b.kind === 'theory' ? 'Объяснение' : 'Собери фразу'), node('small', String(bi + 1))), actions(editing ? null : action('Редактировать', () => { selectedBlock = b.id; drawLesson(); canvas.querySelector('.cs-block-edit input')?.focus(); }), iconButton('Действия с блоком ' + (bi + 1), () => blockMenu(lesson, b)))));
      if (editing) {
        card.append(field('Заголовок блока', b.title, v => { b.title = v; dirty(); }, { max: 150 }));
        if (b.kind === 'theory') card.append(window.AdamCourseRichText.editor(b, (text, richText) => { b.text = text; b.richText = richText; dirty(); }));
        else card.append(field('Упражнение из библиотеки', b.materialId || '', v => { b.materialId = v; dirty(); }, { values: [{ value: '', label: 'Выберите упражнение' }, ...materials.map(m => ({ value: m.id, label: m.title }))] }), node('p', 'Правильный ответ и правила проверки берутся из опубликованного задания.', 'cs-help'));
        card.append(action('Готово', () => { selectedBlock = null; drawLesson(); save().catch(showError); }, 'check', 'cs-done'));
      } else {
        card.append(node('h3', b.title), b.kind === 'theory' ? window.AdamCourseRichText.render(b) : node('p', materials.find(m => m.id === b.materialId)?.title || 'Выберите упражнение', 'cs-block-body'));
      }
      canvas.append(card);
    });
    canvas.append(action('Добавить блок', () => addBlock(lesson), 'plus', 'cs-add-block'));
  }
  function drawSettings() {
    canvas.replaceChildren();
    const heading = append(node('header', null, 'cs-settings-heading'), node('h2', 'О курсе'), node('p', 'Помогите ученику понять, чему он научится и подойдёт ли ему ваша программа.', 'cs-help'));
    const form = node('div', null, 'cs-settings-form');
    form.append(field('Название курса', draft.title, v => { draft.title = v; title.textContent = v || 'Новый курс'; dirty(); }, { max: 150 }), field('Описание', draft.description, v => { draft.description = v; dirty(); }, { multiline: true, max: 10000 }), field('Результаты обучения', draft.outcomes || '', v => { draft.outcomes = v; dirty(); }, { multiline: true, max: 3000 }));
    const options = node('div', null, 'cs-settings-options');
    options.append(field('Уровень', draft.level || 'Начальный', v => { draft.level = v; dirty(); }, { values: ['Начальный', 'Средний', 'Продвинутый'] }), field('Порядок уроков', draft.sequential ? 'sequential' : 'free', v => { draft.sequential = v === 'sequential'; dirty(); }, { values: [{ value: 'free', label: 'Любой урок' }, { value: 'sequential', label: 'Строго по порядку' }] })); form.append(options);
    canvas.append(heading, form);
  }
  function draw() {
    content.dataset.tab = tab; content.dataset.program = String(showProgram);
    tabs.querySelectorAll('button[data-tab]').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    previewButton.disabled = !current().lesson;
    if (tab === 'settings') drawSettings(); else { drawTree(); drawLesson(); }
  }
  root.classList.add('course-studio'); root.replaceChildren();
  const context = append(node('div', null, 'cs-context'), link('← Преподавание', '/courses/teaching', 'cs-back'), status);
  const previewButton = action('Предпросмотр', preview, 'eye');
  previewButton.setAttribute('aria-label', 'Предпросмотр'); previewButton.title = 'Предпросмотр';
  const saveButton = action('Сохранить', e => run(e.currentTarget, save), null, 'cs-save-button');
  const courseMenu = iconButton('Действия с курсом', () => modal('Действия с курсом', (d, close) => {
    d.append(action('Сохранить изменения', async e => { await run(e.currentTarget, save); close(); }));
    if (course.publishedVersionId) d.append(link('Открыть опубликованный курс', `/courses/${id}`, 'cs-action'));
    d.append(action('Архивировать курс', async () => {
      close(); if (await confirm('Архивировать курс?', 'Курс исчезнет из каталога. Записанные ученики смогут продолжить обучение.', 'Архивировать')) {
        try { await save(); await post(`/author/courses/${id}/archive`); location.href = '/author/courses'; } catch (e) { showError(e); }
      }
    }, null, 'cs-action cs-danger'));
  }));
  const head = append(node('header', null, 'cs-header'), append(node('div'), title, node('span', course.archived ? 'В архиве' : course.publishedVersionId ? 'Есть опубликованная версия' : 'Черновик', 'cs-badge')), actions(saveButton, previewButton, publish, courseMenu));
  const tabs = node('nav', null, 'cs-tabs'); tabs.setAttribute('aria-label', 'Редактирование курса');
  [['program', 'Программа'], ['settings', 'О курсе']].forEach(([key, label]) => { const b = action(label, () => { tab = key; draw(); }); b.dataset.tab = key; tabs.append(b); });
  const programButton = action('Модули и уроки', () => { showProgram = !showProgram; draw(); }, 'book', 'cs-program-toggle'); tabs.append(programButton);
  notice(''); root.append(context, head, tabs, message);
  recovery.append(node('p', 'Этот курс изменён в другой вкладке. Скачайте свои правки перед загрузкой актуальной версии.'), actions(action('Скачать правки', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })); const a = link('Скачать', url); a.download = 'course-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }), action('Загрузить сохранённое', async () => { if (await confirm('Загрузить сохранённый курс?', 'Локальные изменения будут заменены. Убедитесь, что скачали нужные правки.', 'Загрузить')) { setDirty(false); location.reload(); } })));
  append(content, sidebar, canvas); root.append(recovery, content);
  if (!draft.modules.length) tab = 'settings';
  draw();
};
