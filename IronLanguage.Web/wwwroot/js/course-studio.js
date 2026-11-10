window.AdamCourseStudio = async function (ui) {
  'use strict';
  const { root, api, post, node, append, link, button, actions, field, confirm, run, showError, notice, message, setDirty } = ui;
  await import('/js/course-cover-crop.js');
  await import('/js/course-rich-text.js'); await window.AdamCourseRichText.load();
  const { authorTheoryMedia, editTheoryMedia } = await import('/js/course-theory-media.js');
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/css/course-studio.css'; document.head.append(style);
  const id = location.pathname.split('/').pop();
  const course = await api(`/author/courses/${id}`);
  const materials = new Map((course.materials ?? []).map(material => [material.id, material]));
  const exerciseTypes = { translation: 'Собери фразу', listening: 'Аудирование', audio: 'Аудиопазл',
    matching: 'Соотнесение', picture: 'Картинка и слово', grammar: 'Форма слова', dialogue: 'Диалог' };
  let draft = JSON.parse(course.draftJson), stamp = course.draftStamp, changed = 0, saved = 0, saving, timer, conflict = false;
  let tab = 'program', selectedLesson = new URLSearchParams(location.search).get('lesson') ?? draft.modules[0]?.lessons[0]?.id, selectedBlock = null, showProgram = false;
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
  const publish = action('Опубликовать', openPublication, null, 'cs-primary');
  let uploadingTheory = false;
  let abortTheoryUpload;
  const accessBadge = node('span', null, 'cs-badge');
  const accessNotice = node('div', null, 'cv-notice error');
  accessNotice.setAttribute('role', 'alert');
  function renderAccess() {
    publish.disabled = uploadingTheory || course.archived || Boolean(course.blockReason);
    accessBadge.textContent = course.blockReason ? 'Заблокирован' : course.archived ? 'В архиве' : course.publishedVersionId ? 'Есть опубликованная версия' : 'Черновик';
    accessBadge.classList.toggle('cv-blocked-status', Boolean(course.blockReason));
    const warning = course.blockReason ? 'Администратор заблокировал курс. Причина: ' + course.blockReason : '';
    if (accessNotice.textContent !== warning) accessNotice.textContent = warning;
  }
  let accessRequest;
  function refreshAccess() {
    return accessRequest ??= api(`/author/courses/${id}/access`).then(result => {
      course.archived = result.archived;
      course.blockReason = result.blockReason;
      renderAccess();
    }).catch(() => { /* A temporary failure leaves the last confirmed status visible. */ }).finally(() => { accessRequest = null; });
  }
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
    d.setAttribute('aria-label', titleText);
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
    try { await save(); await post(`/author/courses/${id}/lessons/${lesson.id}/library`, { stamp }); notice('Версия урока сохранена. Обновления можно применить в библиотеке преподавания.'); }
    catch (e) { showError(e); }
  }
  async function fromLibrary(module) {
    try {
      const lessons = await api('/author/lesson-library');
      modal('Добавить урок из библиотеки', (d, close) => {
        d.append(node('p', 'Связанный урок можно обновлять из библиотеки. Независимую копию можно редактировать в курсе.', 'cs-help'));
        const list = node('div');
        const draw = query => { list.replaceChildren(); const found = lessons.filter(x => x.lesson.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
          if (!found.length) list.append(node('p', lessons.length ? 'Уроки не найдены.' : 'Сначала сохраните урок в библиотеку через меню урока.', 'cs-help'));
          const add = lesson => { mutate(() => { module.lessons.push(lesson); selectedLesson = lesson.id; selectedBlock = null; showProgram = false; }); close(); };
          found.forEach(x => list.append(append(node('article', null, 'cs-material-item'), node('strong', x.lesson.title),
            node('p', `${x.lesson.blocks.length} блоков · ${new Date(x.createdAt).toLocaleString('ru-RU')}`, 'cs-help'),
            actions(action('Независимая копия', () => {
              const copy = structuredClone(x.lesson); copy.id = uuid(); copy.blocks.forEach(b => b.id = uuid()); add(copy);
            }, 'plus', 'cs-library-choice'), action('Связанный урок', e => run(e.currentTarget, async () => {
              add(await api(`/author/lesson-library/${x.id}/inclusion`));
            }), 'book')))));
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
        const add = material => {
          const type = material?.kind ?? kind;
          mutate(() => { const block = { id: uuid(), kind: type, title: exerciseTypes[type] ?? label, text: '', materialId: material?.id ?? null }; lesson.blocks.push(block); selectedBlock = block.id; });
          canvas.querySelector('.cs-block-edit input')?.focus();
        };
        const b = button('', () => { close(); if (kind === 'theory') add(); else chooseMaterial(kind, add, true); }, 'cs-block-choice');
        b.append(icon(glyph), append(node('span'), node('strong', label), node('small', description))); return b;
      };
      d.append(choice('Объяснение', 'Правило, пример или короткая инструкция', 'theory', 'text'));
      Object.entries(exerciseTypes).forEach(([kind, label]) => d.append(choice(label, 'Упражнение из библиотеки', kind, 'tiles')));
    });
  }
  function chooseMaterial(kind, select, canChangeType = false) {
    modal('Библиотека упражнений', (dialog, close) => {
      let own = true, query = '', page = 1, request = 0, timer;
      const list = node('div', null, 'cs-material-results');
      const feedback = node('p', 'Загружаем упражнения…', 'cs-help');
      feedback.setAttribute('role', 'status');
      const ownButton = action('Мои материалы', () => changeScope(true));
      const sharedButton = action('Доступные мне', () => changeScope(false));
      const search = field('Найти упражнение', '', value => {
        query = value; page = 1; request++;
        clearTimeout(timer); timer = setTimeout(load, 300);
      });
      const input = search.querySelector('input');
      function changeScope(value) { own = value; page = 1; clearTimeout(timer); load(); }
      const clear = action('Очистить поиск', () => { input.value = ''; query = ''; page = 1; clearTimeout(timer); load(); input.focus(); });
      const create = link('Создать упражнение', '/editor/new/' + kind, 'cs-text-link');
      create.target = '_blank'; create.rel = 'noopener';
      const type = canChangeType ? field('Тип упражнения', kind, value => {
        kind = value;
        page = 1;
        create.hidden = !kind;
        create.href = '/editor/new/' + kind;
        clearTimeout(timer);
        load();
      }, { values: [{ value: '', label: 'Все типы' }, ...Object.entries(exerciseTypes).map(([value, label]) => ({ value, label }))] })
        : node('p', exerciseTypes[kind], 'cs-help');
      dialog.append(type, actions(ownButton, sharedButton), search, clear, feedback, list, create);
      async function load() {
        const currentRequest = ++request;
        ownButton.setAttribute('aria-pressed', String(own));
        sharedButton.setAttribute('aria-pressed', String(!own));
        list.replaceChildren();
        feedback.textContent = 'Загружаем упражнения…';
        try {
          const result = await api('/author/course-materials?' + new URLSearchParams({ kind, own, q: query, page }));
          if (!dialog.open || request !== currentRequest) return;
          feedback.textContent = result.items.length ? `Страница ${page}` : 'Нет подходящих опубликованных упражнений.';
          result.items.forEach(item => {
            const entry = append(node('article', null, 'cs-material-item'), node('strong', item.title), node('p', `${exerciseTypes[item.kind]} · ${item.author}`, 'cs-help'));
            const preview = node('details');
            preview.append(node('summary', 'Предпросмотр'), node('p', item.fragment));
            if (item.audioPath) { const audio = node('audio'); audio.controls = true; audio.preload = 'none'; audio.src = item.audioPath; preview.append(audio); }
            if (item.imagePath) { const img = node('img'); img.src = item.imagePath; img.alt = 'Изображение из упражнения'; preview.append(img); }
            entry.append(preview, action('Добавить', () => { materials.set(item.id, item); close(); select(item); }));
            list.append(entry);
          });
          if (page > 1 || result.hasMore) list.append(actions(
            page > 1 ? action('Назад', () => { page--; load(); }) : null,
            result.hasMore ? action('Дальше', () => { page++; load(); }) : null));
        } catch {
          if (!dialog.open || request !== currentRequest) return;
          feedback.textContent = 'Не удалось загрузить упражнения.';
          list.append(action('Повторить загрузку', load));
        }
      }
      queueMicrotask(() => { input.focus(); load(); });
    });
  }
  async function openPublication() {
    await refreshAccess();
    if (publish.disabled) return;
    let issues;
    try {
      await save();
      issues = await api(`/author/courses/${id}/publication-issues`);
    } catch (e) { showError(e); return; }
    if (issues.length) {
      modal('Проверьте курс перед публикацией', (dialog, close) => {
        const list = node('ul');
        issues.forEach(issue => list.append(append(node('li'), node('p', issue.message), action('Исправить', () => {
          close();
          tab = issue.lessonId ? 'program' : 'settings';
          if (issue.lessonId) { selectedLesson = issue.lessonId; selectedBlock = issue.blockId; }
          draw();
          canvas.querySelector('.cs-block-edit input, input, button')?.focus();
        }))));
        dialog.append(list);
      });
      return;
    }
    modal(course.publishedVersionId ? 'Опубликовать изменения' : 'Курс готов к публикации?', (d, close) => {
      const lessons = draft.modules.flatMap(m => m.lessons);
      d.append(append(node('div', null, 'cs-publish-summary'), icon('book'), append(node('div'), node('strong', draft.title), node('p', `${draft.modules.length} модулей · ${lessons.length} уроков · ${lessons.reduce((n, l) => n + l.blocks.length, 0)} блоков`))));
      d.append(node('p', 'После публикации ученики получат новую программу. Зачёт неизменённых блоков сохранится.', 'cs-help'));
      const check = document.createElement('input'); check.type = 'checkbox';
      d.append(append(node('label', null, 'cv-check'), check, node('span', 'Я проверил учебные тексты, переводы и права на материалы.')));
      const error = node('p', null, 'cs-form-error'); error.setAttribute('role', 'alert'); d.append(error);
      const commit = action('Опубликовать курс', async e => {
        if (!check.checked) { error.textContent = 'Подтвердите проверку содержания и прав.'; check.focus(); return; }
        e.currentTarget.disabled = true;
        try {
          const version = await post(`/author/courses/${id}/publish`, { stamp, reviewed: true });
          course.publishedVersionId = version.id; renderAccess(); close(); notice(`Версия ${version.number} опубликована.`);
          modal('Курс опубликован', (success, done) => { success.append(node('p', 'Теперь ученики могут открыть вашу программу и начать обучение.', 'cs-help'), actions(link('Посмотреть курс', `/courses/${id}`, 'cs-primary'), action('Продолжить редактирование', done))); });
        } catch (e) { error.textContent = e.message; await refreshAccess(); commit.disabled = publish.disabled; }
      }, null, 'cs-primary'); d.append(commit);
    });
  }
  async function preview(e) {
    const { lesson } = current(); if (!lesson) return;
    await run(e.currentTarget, async () => { await save(); const session = await post(`/author/courses/${id}/preview/${lesson.id}`); location.href = `/courses/sessions/${session.id}`; });
  }
  async function showVersions() {
    try {
      const result = await api(`/author/courses/${id}/versions`);
      modal('История публикаций', (dialog, close) => {
        if (!result.versions.length) dialog.append(node('p', 'У курса пока нет публикаций.', 'cs-help'));
        result.versions.forEach(version => {
          const row = append(node('section', null, 'cs-material-item'),
            node('h3', `Версия ${version.number}. ${version.title}`),
            node('p', `${new Date(version.publishedAt).toLocaleString('ru-RU')} · ${result.author}`, 'cs-help'),
            node('p', `Добавлено: ${version.added}. Изменено: ${version.changed}. Удалено: ${version.removed}.`, 'cs-help'));
          const lessons = node('details');
          lessons.append(node('summary', 'Предпросмотр уроков'));
          version.lessons.forEach(lesson => lessons.append(action(lesson.title, e => run(e.currentTarget, async () => {
            await save();
            const session = await post(`/author/courses/${id}/preview/${lesson.id}?version=${version.id}`);
            location.href = `/courses/sessions/${session.id}`;
          }), 'eye')));
          row.append(lessons, action('Восстановить в черновик', async () => {
            close();
            if (!await confirm('Восстановить версию?', 'Текущий черновик будет заменён. Опубликованный курс останется доступен ученикам.', 'Восстановить')) return;
            try {
              await save();
              await post(`/author/courses/${id}/versions/${version.id}/restore`, { stamp });
              location.reload();
            } catch (error) { showError(error); }
          }));
          dialog.append(row);
        });
      });
    } catch (error) { showError(error); }
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
    abortTheoryUpload?.(); abortTheoryUpload = null;
    canvas.replaceChildren(); const { module, lesson } = current();
    if (!lesson) {
      const empty = append(node('div', null, 'cs-start'), icon('book'), node('h2', 'Начните с первого урока'), node('p', 'Объедините уроки одной темы в модуль. Внутри урока можно добавить объяснение и практику.'), action('Добавить модуль', newModule, 'plus', 'cs-primary'));
      canvas.append(empty); return;
    }
    if (lesson.libraryVersionId) {
      canvas.append(node('h2', lesson.title), node('p', 'Связанный урок · ' + lesson.blocks.length + ' блоков', 'cs-help'),
        actions(action('Открыть оригинал', e => run(e.currentTarget, async () => {
          await save();
          const source = (await api('/author/lesson-library')).find(x => x.id === lesson.libraryVersionId);
          if (!source) throw new Error('Версия урока недоступна.');
          if (!source.sourceAvailable) throw new Error('Исходный курс удалён. Сохранённая версия урока доступна в библиотеке.');
          location.href = `/author/courses/${source.sourceCourseId}?lesson=${source.sourceLessonId}`;
        })), link('Обновить из библиотеки', '/courses/teaching?library=1', 'cs-action'),
        action('Сделать независимой копией', () => mutate(() => { lesson.libraryVersionId = null; }))));
      lesson.blocks.forEach(block => canvas.append(append(node('article', null, 'cs-block'), node('h3', block.title),
        block.kind === 'theory' ? window.AdamCourseRichText.render(block) : node('p', exerciseTypes[block.kind]),
        block.kind === 'theory' ? authorTheoryMedia(block.theoryMedia, node) : null)));
      return;
    }
    const lessonTitle = document.createElement('input'); lessonTitle.value = lesson.title; lessonTitle.maxLength = 150; lessonTitle.className = 'cs-lesson-title'; lessonTitle.setAttribute('aria-label', 'Название урока');
    lessonTitle.addEventListener('input', () => { lesson.title = lessonTitle.value; dirty(); const active = sidebar.querySelector('.cs-lesson[aria-current="true"] span:last-child'); if (active) active.textContent = lesson.title; });
    canvas.append(append(node('header', null, 'cs-lesson-heading'), append(node('div'), node('p', module.title, 'cs-breadcrumb'), lessonTitle, node('p', `${lesson.blocks.length} блоков · Изменения сохраняются автоматически`, 'cs-help')), iconButton('Настройки урока', () => lessonSettings(module, lesson))));
    if (!lesson.blocks.length) canvas.append(append(node('div', null, 'cs-lesson-empty'), icon('text'), node('h2', 'Чему посвящён этот урок?'), node('p', 'Начните с короткого объяснения, а затем предложите ученику попробовать самому.')));
    lesson.blocks.forEach((b, bi) => {
      const editing = selectedBlock === b.id;
      const card = node('article', null, `cs-block${editing ? ' cs-block-edit' : ''}`);
      card.append(append(node('div', null, 'cs-block-head'), append(node('span', null, 'cs-block-type'), icon(b.kind === 'theory' ? 'text' : 'tiles'), node('span', b.kind === 'theory' ? 'Объяснение' : exerciseTypes[b.kind]), node('small', String(bi + 1))), actions(editing ? null : action('Редактировать', () => { selectedBlock = b.id; drawLesson(); canvas.querySelector('.cs-block-edit input')?.focus(); }), iconButton('Действия с блоком ' + (bi + 1), () => blockMenu(lesson, b)))));
      if (editing) {
        const done = action('Готово', () => { selectedBlock = null; drawLesson(); save().catch(showError); }, 'check', 'cs-done');
        card.append(field('Заголовок блока', b.title, v => { b.title = v; dirty(); }, { max: 150 }));
        if (b.kind === 'theory') {
          const attachment = editTheoryMedia(id, b.theoryMedia, media => { b.theoryMedia = media; dirty(); }, {
            node, action, field, actions, busy: value => {
              uploadingTheory = value;
              done.disabled = value;
              previewButton.disabled = value || !current().lesson;
              renderAccess();
            }
          });
          abortTheoryUpload = attachment.abort;
          card.append(window.AdamCourseRichText.editor(b, (text, richText) => { b.text = text; b.richText = richText; dirty(); }), attachment.section);
        } else {
          const material = materials.get(b.materialId);
          card.append(node('p', material?.title ?? (b.materialId ? 'Сведения об упражнении недоступны' : 'Выберите упражнение'), 'cs-block-body'),
            material ? node('p', material.author, 'cs-help') : null,
            actions(action(b.materialId ? 'Заменить' : 'Выбрать упражнение', () => chooseMaterial(b.kind, item => mutate(() => { b.materialId = item.id; }))),
              material?.own ? link('Открыть оригинал', `/editor/${b.kind}/${b.materialId}/preview`, 'cs-text-link') : null));
        }
        card.append(done);
      } else {
        append(card, node('h3', b.title), b.kind === 'theory' ? window.AdamCourseRichText.render(b) : node('p', materials.get(b.materialId)?.title ?? (b.materialId ? 'Упражнение выбрано' : 'Выберите упражнение'), 'cs-block-body'),
          b.kind === 'theory' ? authorTheoryMedia(b.theoryMedia, node) : null);
      }
      canvas.append(card);
    });
    canvas.append(action('Добавить блок', () => addBlock(lesson), 'plus', 'cs-add-block'));
  }
  function drawSettings() {
    abortTheoryUpload?.(); abortTheoryUpload = null;
    canvas.replaceChildren();
    const heading = append(node('header', null, 'cs-settings-heading'), node('h2', 'О курсе'), node('p', 'Помогите ученику понять, чему он научится и подойдёт ли ему ваша программа.', 'cs-help'));
    const form = node('div', null, 'cs-settings-form');
    form.append(field('Название курса', draft.title, v => { draft.title = v; title.textContent = v || 'Новый курс'; dirty(); }, { max: 150 }), field('Описание', draft.description, v => { draft.description = v; dirty(); }, { multiline: true, max: 10000 }), field('Результаты обучения', draft.outcomes || '', v => { draft.outcomes = v; dirty(); }, { multiline: true, max: 3000 }));
    form.querySelectorAll(':scope > .cv-field').forEach((label, index) => {
      if (index > 1) return;
      const marker = node('span', ' *', 'cs-required'); marker.setAttribute('aria-hidden', 'true');
      label.querySelector('span').append(marker);
      label.querySelector('input,textarea').setAttribute('aria-required', 'true');
    });
    const descriptionEditor = window.AdamCourseRichText.editor({ text: draft.description, richText: draft.descriptionRichText }, (text, richText) => { draft.description = text; draft.descriptionRichText = richText; dirty(); });
    descriptionEditor.querySelector('.cr-label').textContent = 'Описание';
    descriptionEditor.querySelector('.cr-label').append(node('span', ' *', 'cs-required'));
    descriptionEditor.querySelector('[role="textbox"]').setAttribute('aria-label', 'Описание');
    descriptionEditor.querySelector('[role="textbox"]').setAttribute('aria-required', 'true');
    form.children[1].replaceWith(descriptionEditor);
    heading.append(node('p', '* Обязательно для публикации. Черновик можно сохранить с пустым описанием.', 'cs-required-note'));
    const options = node('div', null, 'cs-settings-options');
    options.append(field('Уровень', draft.level || 'Начальный', v => { draft.level = v; dirty(); }, { values: ['Начальный', 'Средний', 'Продвинутый'] }), field('Порядок уроков', draft.sequential ? 'sequential' : 'free', v => { draft.sequential = v === 'sequential'; dirty(); }, { values: [{ value: 'free', label: 'Любой урок' }, { value: 'sequential', label: 'Строго по порядку' }] })); form.append(options);
    canvas.dataset.theme = draft.theme || 'sage';
    const cover = node('section', null, 'cs-cover-settings'); cover.append(node('h3', 'Обложка курса'));
    if (draft.coverPath) { const img = node('img'); img.src = draft.coverPath; img.alt = 'Обложка курса'; cover.append(img); }
    const upload = node('input'); upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp'; upload.setAttribute('aria-label', 'Загрузить обложку курса');
    upload.addEventListener('change', async () => {
      const file = upload.files[0]; if (!file) return;
      if (file.size > 5000000) { showError(new Error('Обложка должна быть не больше 5 МБ.')); return; }
      upload.disabled = true;
      try {
        const data = new FormData(); const cropped = await window.AdamCropCover(file); if (!cropped) return; data.append('file', cropped, 'cover.jpg');
        const token = document.querySelector('#api-antiforgery input').value;
        const response = await fetch(`/api/v1/author/courses/${id}/cover`, { method: 'POST', body: data, headers: { RequestVerificationToken: token } });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Не удалось загрузить обложку.');
        draft.coverPath = result.path; dirty(); drawSettings();
      } catch (e) { showError(e); } finally { upload.disabled = false; }
    });
    upload.hidden = true; const choose = action(draft.coverPath ? 'Заменить обложку' : 'Выбрать изображение', () => upload.click(), 'plus', 'button primary');
    cover.append(choose, upload, node('p', 'PNG, JPEG или WebP до 5 МБ. После выбора настройте кадр 16:9.', 'cs-help'));
    if (draft.coverPath) cover.append(action('Убрать обложку', () => { draft.coverPath = null; dirty(); drawSettings(); }));
    cover.append(field('Оформление страницы', draft.theme || 'sage', v => { draft.theme = v; dirty(); canvas.dataset.theme = v; }, { values: [{ value: 'sage', label: 'Шалфей' }, { value: 'sky', label: 'Небо' }, { value: 'sand', label: 'Песок' }] }));
    form.prepend(cover);
    canvas.append(heading, form);
  }
  function draw() {
    content.dataset.tab = tab; content.dataset.program = String(showProgram);
    tabs.querySelectorAll('button[data-tab]').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === tab)));
    previewButton.disabled = uploadingTheory || !current().lesson;
    if (tab === 'settings') drawSettings(); else { drawTree(); drawLesson(); }
  }
  root.classList.add('course-studio'); root.replaceChildren();
  const context = append(node('div', null, 'cs-context'), link('← Преподавание', '/courses/teaching', 'cs-back'), status);
  const previewButton = action('Предпросмотр', preview, 'eye');
  previewButton.setAttribute('aria-label', 'Предпросмотр'); previewButton.title = 'Предпросмотр';
  const saveButton = action('Сохранить', e => run(e.currentTarget, save), null, 'cs-save-button');
  function confirmCourseDeletion() {
    modal('Удалить курс навсегда?', (dialog, close) => {
      dialog.classList.add('cs-delete-dialog');
      const feedback = node('p', null, 'cs-form-error');
      feedback.setAttribute('role', 'alert');
      const cancel = action('Отмена', close);
      const remove = action('Удалить навсегда', e => run(e.currentTarget, async () => {
        feedback.textContent = '';
        cancel.disabled = true;
        clearTimeout(timer);
        try {
          await saving?.catch(() => {});
          await api(`/author/courses/${id}`, { method: 'DELETE', body: JSON.stringify({ stamp }) });
          clearTimeout(timer);
          abortTheoryUpload?.();
          setDirty(false);
          location.href = '/courses/teaching';
        } catch (error) {
          feedback.textContent = error.status === 404 ? 'Курс уже удалён или недоступен.' : error.message;
          if (changed !== saved && !conflict) timer = setTimeout(() => save().catch(showError), 900);
          cancel.disabled = false;
        }
      }), null, 'cs-primary cs-delete-course');
      dialog.querySelector('.cs-dialog-head button').remove();
      cancel.autofocus = true;
      dialog.addEventListener('cancel', event => {
        if (!remove.disabled) return;
        event.stopImmediatePropagation();
        event.preventDefault();
      }, { capture: true });
      dialog.append(node('p', `«${draft.title}» будет удалён вместе с черновиком, всеми публикациями и прогрессом учеников по этому курсу.`),
        node('p', 'Восстановить курс не получится. Уроки из библиотеки и самостоятельные упражнения останутся.', 'cs-help'),
        feedback, actions(cancel, remove));
    });
  }
  const courseMenu = iconButton('Действия с курсом', () => modal('Действия с курсом', (d, close) => {
    d.append(action('Сохранить изменения', async e => { await run(e.currentTarget, save); close(); }));
    if (course.publishedVersionId) d.append(link('Открыть опубликованный курс', `/courses/${id}`, 'cs-action'));
    if (course.publishedVersionId) d.append(action('История публикаций', () => { close(); showVersions(); }));
    d.append(action('Архивировать курс', async () => {
      close(); if (await confirm('Архивировать курс?', 'Курс исчезнет из каталога. Записанные ученики смогут продолжить обучение.', 'Архивировать')) {
        try { await save(); await post(`/author/courses/${id}/archive`); location.href = '/author/courses'; } catch (e) { showError(e); }
      }
    }), action('Удалить курс', () => { close(); confirmCourseDeletion(); }, null, 'cs-action cs-danger'));
  }));
  const head = append(node('header', null, 'cs-header'), append(node('div'), title, accessBadge), actions(saveButton, previewButton, publish, courseMenu));
  const tabs = node('nav', null, 'cs-tabs'); tabs.setAttribute('aria-label', 'Редактирование курса');
  [['program', 'Программа'], ['settings', 'О курсе']].forEach(([key, label]) => { const b = action(label, () => { tab = key; draw(); }); b.dataset.tab = key; tabs.append(b); });
  const programButton = action('Модули и уроки', () => { showProgram = !showProgram; draw(); }, 'book', 'cs-program-toggle'); tabs.append(programButton);
  notice(''); root.append(context, head, accessNotice, tabs, message);
  renderAccess();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAccess(); });
  window.addEventListener('focus', refreshAccess);
  setInterval(() => { if (!document.hidden) refreshAccess(); }, 30_000);
  recovery.append(node('p', 'Этот курс изменён в другой вкладке. Скачайте свои правки перед загрузкой актуальной версии.'), actions(action('Скачать правки', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })); const a = link('Скачать', url); a.download = 'course-draft.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }), action('Загрузить сохранённое', async () => { if (await confirm('Загрузить сохранённый курс?', 'Локальные изменения будут заменены. Убедитесь, что скачали нужные правки.', 'Загрузить')) { setDirty(false); location.reload(); } })));
  append(content, sidebar, canvas); root.append(recovery, content);
  if (!draft.modules.length) tab = 'settings';
  draw();
};
