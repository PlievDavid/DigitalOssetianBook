(() => {
  'use strict';
  const root = document.querySelector('#courses-workspace');
  if (!root) return;
  const api = window.AdamApi, path = location.pathname;
  let dirty = false;
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const append = (parent, ...children) => { parent.append(...children.filter(Boolean)); return parent; };
  const link = (text, href, cls = 'cv-button') => { const a = node('a', text, cls); a.href = href; return a; };
  const button = (text, action, cls = 'cv-button') => { const b = node('button', text, cls); b.type = 'button'; b.addEventListener('click', action); return b; };
  const icon = path => {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(namespace, 'path');
    line.setAttribute('d', path);
    svg.append(line);
    return svg;
  };
  const actions = (...items) => append(node('div', null, 'cv-actions'), ...items);
  const message = node('div', null, 'cv-notice'); message.setAttribute('role', 'status');
  const showError = e => { message.className = 'cv-notice error'; message.textContent = e.message || 'Не удалось выполнить действие.'; message.scrollIntoView({ block: 'nearest' }); };
  const notice = text => { message.className = 'cv-notice'; message.textContent = text; };
  const post = (url, data = {}) => api(url, { method: 'POST', body: JSON.stringify(data) });
  const heading = (title, subtitle, side) => append(node('header', null, 'cv-heading'), append(node('div'), node('h1', title), subtitle ? node('p', subtitle) : null), side);
  const empty = (title, text, control) => append(node('div', null, 'cv-empty'), node('h2', title), node('p', text), control);
  const field = (label, value, oninput, options = {}) => {
    const wrapper = node('label', null, 'cv-field'); wrapper.append(node('span', label));
    const input = document.createElement(options.multiline ? 'textarea' : options.values ? 'select' : 'input');
    input.setAttribute('aria-label', label);
    if (options.values) options.values.forEach(v => { const o = node('option', v.label ?? v); o.value = v.value ?? v; input.append(o); });
    input.value = value ?? ''; if (options.max) input.maxLength = options.max;
    if (options.type) input.type = options.type;
    input.addEventListener(options.values ? 'change' : 'input', () => oninput(input.value)); wrapper.append(input);
    return wrapper;
  };
  const confirm = (title, description, label = 'Продолжить') => new Promise(resolve => {
    const dialog = node('dialog', null, 'cv-dialog'); const previous = document.activeElement;
    const finish = value => { dialog.close(); dialog.remove(); previous?.focus(); resolve(value); };
    append(dialog, node('h2', title), node('p', description), actions(button('Отмена', () => finish(false)), button(label, () => finish(true), 'button primary')));
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(false); }); document.body.append(dialog); dialog.showModal();
  });
  const run = async (control, task) => { control.disabled = true; control.setAttribute('aria-busy', 'true'); try { await task(); } catch (e) { showError(e); } finally { control.disabled = false; control.removeAttribute('aria-busy'); } };
  function shell() { root.replaceChildren(message); }
  async function continueCourse(courseId, lessonId = null, entryStep = null) {
    if (!lessonId) {
      const course = await api(`/courses/${courseId}`);
      const lessons = course.modules.flatMap(m => m.lessons);
      const first = lessons.find(l => l.available)?.id;
      lessonId = entryStep === 'first' ? first : course.resumeLessonId || lessons.find(l => l.available && !l.completed)?.id || first;
    }
    if (!lessonId) { location.href = `/courses/${courseId}`; return; }
    const session = await post(`/courses/${courseId}/lessons/${lessonId}/sessions`);
    const query = entryStep === 'first' ? '?start=1' : entryStep === 'last' ? '?start=last' : '';
    location.href = `/courses/sessions/${session.id}${query}`;
  }
  const courseLevels = ['', 'Начальный', 'Средний', 'Продвинутый'];
  function levelFilter(level, onChange) {
    const group = node('div', null, 'cv-level-options');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Уровень курса');
    for (const value of courseLevels) {
      const input = node('input');
      input.type = 'radio';
      input.name = 'course-level';
      input.value = value;
      input.checked = value === level;
      input.addEventListener('change', () => { if (input.checked) onChange(value); });
      group.append(append(node('label', null, 'cv-level-option'), input, node('span', value || 'Все уровни')));
    }
    return group;
  }

  const myCourseIcons = {
    book: 'M12 6a8 8 0 0 0-9-2v14a8 8 0 0 1 9 2 8 8 0 0 1 9-2V4a8 8 0 0 0-9 2v14',
    active: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    done: 'm8 12 3 3 5-6m5 3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    arrow: 'M4 12h15m-6-6 6 6-6 6'
  };
  function coursePhoneNavigation() {
    if (!window.AdamAuthenticated) return null;
    const nav = node('nav', null, 'cm-phone-navigation');
    nav.setAttribute('aria-label', 'Навигация по курсам');
    for (const [label, href] of [['Каталог', '/courses'], ['Мои курсы', '/my-courses']]) {
      const item = link(label, href, '');
      if (path === href) item.setAttribute('aria-current', 'page');
      nav.append(item);
    }
    return nav;
  }
  function courseIntro(title, description, discovery = false) {
    const copy = append(node('div', null, 'cm-intro-copy'), node('h1', title), node('p', description));
    return append(node('header', null, discovery ? 'cm-intro cm-discover' : 'cm-intro'), copy, coursePhoneNavigation());
  }
  function myCourseState(course) {
    if (course.totalBlocks > 0 && course.completedBlocks >= course.totalBlocks) return 'done';
    return course.completedBlocks > 0 ? 'active' : 'new';
  }
  function courseArtwork(course, thumbnail = false) {
    const art = node('div', null, 'cm-art');
    art.setAttribute('aria-hidden', 'true');
    art.dataset.theme = course.theme || 'sage';
    art.append(node('span', 'Ӕ', 'cm-monogram'));
    if (course.coverPath) {
      const image = node('img');
      image.alt = '';
      if (thumbnail) image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), { once: true });
      image.src = course.coverPath;
      art.append(image);
    }
    return art;
  }
  function myCourseProgress(course) {
    const { completedBlocks: completed, totalBlocks: total } = course;
    const percent = total > 0 ? Math.min(completed >= total ? 100 : 99, Math.round(100 * completed / total)) : 0;
    const detail = completed + ' из ' + total + ' блоков';
    const label = append(node('div', null, 'cm-progress-label'), node('span', detail), node('strong', percent + '%'));
    label.setAttribute('aria-hidden', 'true');
    const track = append(node('div', null, 'cm-track'), node('span'));
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Прогресс: ' + course.title);
    track.setAttribute('aria-valuenow', percent);
    track.setAttribute('aria-valuetext', percent + '%, ' + detail);
    track.style.setProperty('--cm-progress', percent / 100);
    return append(node('div', null, 'cm-progress'), label, track);
  }
  function myCourseAction(course, featured) {
    const state = myCourseState(course);
    const title = { new: 'Начать курс', active: 'Продолжить', done: featured ? 'Продолжить' : 'Повторить курс' }[state];
    const control = button(title, e => run(e.currentTarget, () => continueCourse(course.id, null, state === 'active' ? null : 'first')), featured ? 'cm-cta' : 'cm-row-action');
    control.setAttribute('aria-label', title + ': ' + course.title);
    return control;
  }
  function myCourseOverview(rows) {
    const done = rows.filter(course => myCourseState(course) === 'done').length;
    const focus = rows.find(course => myCourseState(course) === 'active') || rows.find(course => myCourseState(course) === 'new') || rows[0];
    root.append(courseIntro('Мои курсы', 'Продолжайте учиться и следите за своим прогрессом.'));
    if (!focus) {
      const mark = append(node('div', null, 'cm-empty-icon'), icon(myCourseIcons.book));
      root.append(append(node('section', null, 'cm-welcome'), mark, node('h2', 'Вы ещё не записались на курс'),
        node('p', 'Выберите курс в каталоге — здесь появятся ваши уроки и прогресс.'),
        append(link('Открыть каталог', '/courses', 'cm-cta'), icon(myCourseIcons.arrow))));
      return;
    }
    const state = myCourseState(focus);
    const kicker = { new: 'Готов к старту', active: 'Продолжить обучение', done: 'Курс завершён' }[state];
    const feature = node('article', null, 'cm-feature');
    feature.dataset.state = state;
    const copy = append(node('div', null, 'cm-feature-copy'),
      append(node('p', null, 'cm-kicker'), icon(myCourseIcons[state === 'done' ? 'done' : 'book']), node('span', kicker)),
      node('h2', focus.title), myCourseProgress(focus),
      actions(myCourseAction(focus, true), link('О курсе', '/courses/' + focus.id, 'cm-feature-link')));
    feature.append(copy, courseArtwork(focus));
    const stats = node('dl', null, 'cm-stats');
    for (const [key, label, count] of [['book', 'Всего курсов', rows.length], ['active', 'Активные', rows.length - done], ['done', 'Завершённые', done]]) {
      const symbol = append(node('span', null, 'cm-stat-icon is-' + key), icon(myCourseIcons[key]));
      stats.append(append(node('div', null, 'cm-stat'), node('dt', label), node('dd', count), symbol));
    }
    root.append(append(node('div', null, 'cm-overview'), feature,
      append(node('section', null, 'cm-summary'), node('h2', 'Ваш прогресс'), stats)));
  }
  function myCourseRow(course) {
    const state = myCourseState(course);
    const row = node('article', null, 'cm-row');
    row.dataset.state = state;
    const status = { new: 'Не начат', active: 'В процессе', done: 'Завершён' }[state];
    const detail = append(node('div', null, 'cm-row-copy'),
      append(node('h3'), link(course.title, '/courses/' + course.id, 'cm-course-name')),
      append(node('div', null, 'cm-row-meta'), node('span', status, 'cm-status'), course.level ? node('span', course.level) : null));
    const info = append(node('div', null, 'cm-row-info'), courseArtwork(course, true), detail);
    row.append(info, myCourseProgress(course), myCourseAction(course, false));
    return row;
  }
  function catalogCard(course, enrolled) {
    const card = link(null, '/courses/' + course.id, 'cm-catalog-card');
    const state = myCourseState(course);
    const meta = append(node('div', null, 'cm-catalog-meta'), course.level ? node('span', course.level, 'cm-catalog-level') : null,
      enrolled ? node('span', { new: 'В моих курсах', active: 'В процессе', done: 'Завершён' }[state], 'cm-status') : node('span', 'Уроков: ' + course.lessons));
    const title = node('h3', course.title);
    title.id = 'cm-catalog-course-' + course.id;
    card.setAttribute('aria-labelledby', title.id);
    const description = (course.description || '').trim();
    const body = append(node('div', null, 'cm-catalog-copy'), meta, title,
      description ? node('p', description, 'cm-catalog-description') : null,
      course.author ? node('span', course.author, 'cm-catalog-author') : null);
    card.dataset.state = enrolled ? state : '';
    return append(card, courseArtwork(course, true), body);
  }
  async function catalog(mine = false, authored = false) {
    const rows = await api(authored ? '/author/courses' : mine ? '/me/courses' : '/courses');
    const enrolled = new Set(!authored && window.AdamAuthenticated ? (mine ? rows : await api('/me/courses')).map(c => c.id) : []);
    if (!authored) root.classList.add('cv-material-catalog');
    if (authored) {
      root.classList.add('cv-teaching');
      root.replaceChildren(message, link('← Профиль', '/profile', 'back-link'));
    } else shell();
    if (mine) {
      root.classList.add('cm-home');
      myCourseOverview(rows);
      if (!rows.length) return;
    } else if (!authored) {
      root.classList.add('cm-catalog');
      root.append(courseIntro('Каталог курсов', 'Выберите курс по осетинскому языку и учитесь в своём темпе.', true));
    }
    const create = button('Создать курс', e => run(e.currentTarget, async () => {
      const trigger = e.currentTarget;
      await import('/js/course-rich-text.js');
      await window.AdamCourseRichText.load();
      const dialog = node('dialog', null, 'cv-dialog cv-create-dialog');
      const title = node('h2', 'Новый курс');
      title.id = 'cv-new-course-title';
      dialog.setAttribute('aria-labelledby', title.id);
      const titleField = field('Название курса', '', () => {}, { max: 150 });
      const titleInput = titleField.querySelector('input');
      titleInput.required = true;
      let outcomes = '', outcomesRichText = null;
      const outcomesEditor = window.AdamCourseRichText.editor({}, (text, document) => {
        outcomes = text;
        outcomesRichText = document;
      }, 'Результаты обучения', { showHint: false });
      const form = node('form');
      const error = node('p', null, 'cv-notice error');
      error.setAttribute('role', 'alert');
      const submit = node('button', 'Создать черновик', 'button primary');
      const cancel = button('Отмена', () => dialog.close(), 'cv-create-cancel');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const title = titleInput.value.trim();
        if (!title) {
          error.textContent = 'Введите название курса.';
          titleInput.focus();
          return;
        }
        if (submit.disabled) return;
        submit.disabled = cancel.disabled = true;
        error.textContent = '';
        try {
          const course = await post('/author/courses', { title, description: '', outcomes, outcomesRichText, modules: [] });
          location.href = `/author/courses/${course.id}`;
        } catch (problem) {
          error.textContent = problem.message;
          submit.disabled = cancel.disabled = false;
        }
      });
      dialog.addEventListener('cancel', event => { if (submit.disabled) event.preventDefault(); });
      dialog.addEventListener('close', () => { dialog.remove(); trigger.focus(); });
      form.append(titleField, outcomesEditor, error, actions(cancel, submit));
      dialog.append(title, form);
      document.body.append(dialog);
      dialog.showModal();
      titleInput.focus();
    }), 'button primary');
    if (authored) root.append(append(node('section', null, 'cv-teaching-hero cv-report-banner'),
      heading('Преподавание', 'Управляйте своими курсами, сохраняйте уроки и следите за результатами учеников.', create)));
    const grid = node('div', null, mine ? 'cm-list' : authored ? 'cv-author-list' : 'cm-catalog-grid'); const params = new URLSearchParams(location.search);
    let query = params.get('q') || '', level = params.get('level') || '';
    let status = mine && ['active', 'done'].includes(params.get('status')) ? params.get('status') : '';
    if (mine || authored || !courseLevels.includes(level)) level = '';
    let searchTimer, displayed, resultMotion;
    const input = node('input');
    input.type = 'search';
    input.id = 'cv-catalog-query';
    input.value = query;
    input.placeholder = 'Найти курс';
    input.addEventListener('input', () => {
      query = input.value;
      syncClear();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(draw, 160);
    });
    const clear = button(null, () => {
      input.focus();
      input.value = query = '';
      syncClear();
      draw();
    }, 'cv-search-clear');
    clear.setAttribute('aria-label', 'Очистить поиск');
    clear.title = 'Очистить поиск';
    clear.append(icon('m6 6 12 12M18 6 6 18'));
    function syncClear() { clear.inert = !query; }
    syncClear();
    // Keep the clear action outside the input label while reserving its space inside the field.
    const searchField = node('div', null, 'cv-field cv-catalog-search');
    const searchLabel = node('label', 'Поиск по названию');
    searchLabel.htmlFor = input.id;
    if (!authored) {
      searchLabel.id = 'cv-catalog-query-label';
      searchLabel.hidden = true;
      input.setAttribute('aria-labelledby', searchLabel.id);
    }
    searchField.append(searchLabel, append(node('div', null, 'cv-search-control'), input, clear));
    const tools = append(node('div', null, 'cv-tools'), searchField);
    const levels = mine || authored ? null : levelFilter(level, value => { level = value; draw(); });
    const resultsStatus = node('div', null, 'cv-results-status');
    resultsStatus.setAttribute('role', 'status');
    const catalogPanel = authored
      ? append(node('section', null, 'cv-report-panel cv-teaching-panel'), node('h2', 'Ваши курсы'), tools, resultsStatus, grid)
      : null;
    if (catalogPanel) root.append(catalogPanel);
    else if (mine) {
      const filters = node('div', null, 'cm-filters');
      filters.setAttribute('role', 'group');
      filters.setAttribute('aria-label', 'Статус курса');
      for (const [key, label] of [['', 'Все курсы'], ['active', 'Активные'], ['done', 'Завершённые']]) {
        const filter = button(label, () => {
          if (status === key) return;
          status = key;
          for (const child of filters.children) child.setAttribute('aria-pressed', String(child === filter));
          draw();
        }, 'cm-filter');
        filter.setAttribute('aria-pressed', String(status === key));
        filters.append(filter);
      }
      const library = node('section', null, 'cm-library');
      const title = node('h2', 'Ваши курсы');
      title.id = 'cm-library-title';
      library.setAttribute('aria-labelledby', title.id);
      append(library, append(node('header', null, 'cm-library-heading'), title,
        append(node('div', null, 'cm-library-toolbar'), filters, tools)), resultsStatus, grid);
      root.append(library);
    } else {
      const title = node('h2', 'Все курсы');
      title.id = 'cm-library-title';
      const library = append(node('section', null, 'cm-library cm-catalog-library'),
        append(node('header', null, 'cm-library-heading'), title, tools, levels), resultsStatus, grid);
      library.setAttribute('aria-labelledby', title.id);
      root.append(library);
    }
    if (authored) {
      const library = node('section', null, 'cv-report-panel cv-teaching-panel cv-library');
      const libraryTitle = node('h2', 'Библиотека уроков');
      const libraryIntro = node('p', 'Добавляйте сохранённые уроки в свои курсы как независимые копии или связанные уроки.', 'cv-meta');
      const lessonGrid = node('div', null, 'cv-author-list');
      library.append(libraryTitle, libraryIntro, lessonGrid);
      catalogPanel.id = 'cv-teaching-courses';
      library.id = 'cv-teaching-library';
      let libraryIsOpen = false;
      function showSection(showLibrary) {
        libraryIsOpen = showLibrary;
        catalogPanel.hidden = showLibrary;
        library.hidden = !showLibrary;
        (showLibrary ? lessonTab : courseTab).setAttribute('aria-current', 'true');
        (showLibrary ? courseTab : lessonTab).removeAttribute('aria-current');
        const url = new URL(location.href);
        if (showLibrary) url.searchParams.set('library', '1'); else url.searchParams.delete('library');
        history.replaceState(null, '', url);
      }
      const courseTab = button('Курсы', () => showSection(false));
      const lessonTab = button('Библиотека уроков', e => {
        showSection(true);
        lessonGrid.replaceChildren(node('p', 'Загружаем уроки…', 'cv-meta'));
        return run(e.currentTarget, async () => {
          const lessons = await api('/author/lesson-library');
          if (!libraryIsOpen) return;
          lessonGrid.replaceChildren();
          if (!lessons.length) lessonGrid.append(empty('Пока нет сохранённых уроков', 'В меню урока выберите «Сохранить в библиотеку».'));
          lessons.forEach(x => lessonGrid.append(append(node('article', null, 'cv-author-row'),
            append(node('div', null, 'cv-author-copy'), node('h3', x.lesson.title), node('p',
              `Блоков: ${x.lesson.blocks.length} · ${new Date(x.createdAt).toLocaleDateString('ru-RU')}`, 'cv-meta')),
            actions(x.sourceAvailable ? link('Открыть оригинал', `/author/courses/${x.sourceCourseId}?lesson=${x.sourceLessonId}`, 'cv-button cv-teaching-primary')
              : node('span', 'Исходный курс удалён', 'cv-meta'),
              button('Обновить курсы', e => run(e.currentTarget, () => updateLinkedCourses(x)))))));
        });
      });
      courseTab.setAttribute('aria-controls', catalogPanel.id);
      lessonTab.setAttribute('aria-controls', library.id);
      const tabs = append(node('nav', null, 'cv-teaching-nav'),
        append(node('div', null, 'cv-teaching-switch'), courseTab, lessonTab),
        link('Материалы упражнений', '/editor', 'cv-teaching-materials'));
      tabs.setAttribute('aria-label', 'Разделы преподавания');
      root.insertBefore(tabs, catalogPanel);
      root.append(library);
      if (params.has('library')) lessonTab.click(); else showSection(false);
    }
    function draw() {
      clearTimeout(searchTimer);
      const url = new URL(location.href); query ? url.searchParams.set('q', query) : url.searchParams.delete('q'); level ? url.searchParams.set('level', level) : url.searchParams.delete('level');
      if (mine) status ? url.searchParams.set('status', status) : url.searchParams.delete('status');
      history.replaceState(null, '', url);
      const term = query.trim().toLocaleLowerCase('ru');
      const filtered = rows.filter(x => x.title.toLocaleLowerCase('ru').includes(term) && (!level || x.level === level) &&
        (!status || (myCourseState(x) === 'done') === (status === 'done')));
      if (displayed?.length === filtered.length && displayed.every((row, index) => row === filtered[index])) return;
      if (displayed) {
        resultsStatus.textContent = filtered.length ? `Курсов найдено: ${filtered.length}` : 'Курсы не найдены';
        resultMotion?.cancel();
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
          resultMotion = grid.animate([{ opacity: 0.45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
      }
      displayed = filtered;
      grid.replaceChildren();
      if (mine) {
        if (filtered.length) {
          for (const course of filtered) grid.append(myCourseRow(course));
        } else grid.append(empty('Курсы не найдены', 'Измените запрос или сбросьте фильтры.', link('Сбросить фильтры', '/my-courses')));
        return;
      }
      if (!filtered.length) {
        grid.append(empty(rows.length ? 'Курсы не найдены' : authored ? 'Здесь появится ваш первый курс' : 'Курсы готовятся',
          rows.length ? 'Измените запрос или сбросьте фильтры.' : authored ? 'Начните с названия, затем добавьте модули и уроки.' : 'Опубликованные курсы появятся здесь.',
          rows.length && !authored ? link('Сбросить фильтры', '/courses') : null));
        return;
      }
      filtered.forEach(c => {
        if (authored) {
          const row = node('article', null, 'cv-author-row');
          const state = c.blockReason ? 'Заблокирован' : c.archived ? 'В архиве' : c.published ? 'Опубликован' : 'Черновик';
          const body = append(node('div', null, 'cv-author-copy'), node('span', state, c.blockReason ? 'cv-report-badge cv-blocked-status' : 'cv-report-badge' + (state === 'Опубликован' ? ' is-done' : '')),
            node('h3', c.title), node('p', `Модулей: ${c.modules || 0} · Уроков: ${c.lessons || 0}`, 'cv-meta'),
            c.blockReason ? node('p', 'Причина: ' + c.blockReason, 'cv-blocked-status') : null);
          row.append(body, actions(link('Редактировать курс', `/author/courses/${c.id}`, 'cv-button cv-teaching-primary'),
            c.published ? link('Результаты учеников', `/author/courses/${c.id}/analytics`, 'cv-button') : null)); grid.append(row); return;
        }
        grid.append(catalogCard(c, enrolled.has(c.id)));
      });
    }
    draw();
  }
  async function updateLinkedCourses(version) {
    const rows = await api(`/author/lesson-library/${version.id}/uses`);
    const previous = document.activeElement;
    const dialog = node('dialog', null, 'cv-dialog');
    dialog.setAttribute('aria-label', 'Обновить связанные уроки');
    dialog.addEventListener('close', () => { dialog.remove(); previous?.focus(); });
    dialog.append(node('h2', 'Обновить связанные уроки'), node('p', rows.length ? 'Выберите курсы. Новая версия урока попадёт в их черновики.' : 'Курсов с более ранней версией этого урока нет.'));
    const choices = rows.map(row => {
      const input = node('input'); input.type = 'checkbox';
      dialog.append(append(node('label', null, 'cv-check'), input, node('span', `${row.title} · ${row.count} включений`)));
      return { input, row };
    });
    const feedback = node('div'); feedback.setAttribute('role', 'status');
    const commit = button('Обновить выбранные', async e => {
      const chosen = choices.filter(x => x.input.checked);
      if (!chosen.length) { feedback.textContent = 'Выберите хотя бы один курс.'; return; }
      const control = e.currentTarget;
      control.disabled = true;
      try {
        const results = await post(`/author/lesson-library/${version.id}/update`, { courses: chosen.map(({ row }) => ({ courseId: row.id, stamp: row.draftStamp })) });
        feedback.replaceChildren(...results.map(row => node('p', `${rows.find(x => x.id === row.id)?.title}: ${row.saved ? 'черновик обновлён' : row.error}`)));
        choices.filter(x => results.some(row => row.id === x.row.id && row.saved)).forEach(x => { x.input.checked = false; x.input.disabled = true; });
      } catch (error) { feedback.textContent = error.message; }
      finally { control.disabled = false; }
    }, 'button primary');
    dialog.append(feedback, actions(button('Закрыть', () => dialog.close()), rows.length ? commit : null));
    document.body.append(dialog); dialog.showModal();
  }
  async function analytics(id) {
    shell();
    root.classList.add('cv-report');
    const params = new URLSearchParams(location.search);
    const report = await api(`/author/courses/${id}/analytics?` + params);
    const overviewParams = new URLSearchParams(params);
    overviewParams.delete('learner');
    const overviewUrl = `/author/courses/${id}/analytics` + (overviewParams.size ? '?' + overviewParams : '');
    root.append(report.student
      ? link('← Результаты курса', overviewUrl, 'back-link')
      : link('← Преподавание', '/courses/teaching', 'back-link'));
    const date = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
    function table(labels, rows, label) {
      const head = append(node('thead'), append(node('tr'), ...labels.map(label => {
        const cell = node('th', label);
        cell.scope = 'col';
        return cell;
      })));
      const body = node('tbody');
      rows.forEach(cells => {
        const row = node('tr');
        row.setAttribute('role', 'row');
        cells.forEach((value, index) => {
          const cell = value instanceof Node ? append(node('td'), value) : node('td', String(value));
          cell.setAttribute('role', 'cell');
          if (index) {
            const mobileLabel = node('span', labels[index], 'cv-report-cell-label');
            mobileLabel.setAttribute('aria-hidden', 'true');
            cell.prepend(mobileLabel);
          }
          row.append(cell);
        });
        body.append(row);
      });
      const scroll = node('div', null, 'cv-report-table'); scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', label);
      const data = append(node('table'), head, body);
      data.setAttribute('role', 'table');
      head.setAttribute('role', 'rowgroup');
      body.setAttribute('role', 'rowgroup');
      head.firstElementChild.setAttribute('role', 'row');
      head.querySelectorAll('th').forEach(cell => cell.setAttribute('role', 'columnheader'));
      return append(scroll, data);
    }
    function metric(label, value, detail, glyph) {
      return append(node('div', null, 'cv-report-metric'), append(node('span', null, 'cv-report-icon'), icon(glyph)),
        node('strong', value), node('span', label), detail ? node('small', detail) : null);
    }
    function progress(counts) {
      const bar = node('progress');
      bar.max = 100;
      bar.value = counts.percent;
      bar.setAttribute('aria-label', 'Прогресс обучения');
      return append(node('div', null, 'cv-report-progress'),
        node('strong', counts.percent + '%'), bar, node('small', `${counts.completedBlocks} из ${counts.totalBlocks} блоков`));
    }
    function badge(text, done) {
      return node('span', text, 'cv-report-badge' + (done ? ' is-done' : ''));
    }
    function panel(title, ...content) {
      return append(node('section', null, 'cv-report-panel'), node('h2', title), ...content);
    }
    if (report.student) {
      root.append(append(node('section', null, 'cv-report-banner'), heading(report.student.name, report.title),
        badge(report.student.status, report.student.counts.percent === 100), progress(report.student.counts),
        report.student.finishedAt ? node('p', 'Первое завершение: ' + date(report.student.finishedAt), 'cv-meta') : null));
      report.modules.forEach(module => {
        const section = panel(module.title);
        module.lessons.forEach(lesson => {
          section.append(node('h3', lesson.title), table(['Блок', 'Статус', 'Попытки', 'Верные', 'Последняя активность'],
            lesson.blocks.map(b => [b.title, badge(b.completed ? 'Пройден' : 'Не пройден', b.completed), b.attempts, b.correct, date(b.lastSeen)]), lesson.title));
        });
        root.append(section);
      });
      return;
    }
    const period = field('Период', String(report.days), days => { params.set('days', days); params.delete('page'); location.search = params; }, {
      values: [{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '90', label: '90 дней' }]
    });
    root.append(append(node('section', null, 'cv-report-banner'), heading('Результаты учеников', report.title, period)),
      append(node('div', null, 'cv-report-metrics'),
        metric('Начали курс', report.started, `За период: ${report.startedInPeriod}`, 'M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6m-3-3h6'),
        metric('Завершили программу', report.finished, `За период: ${report.finishedInPeriod}`, 'M4 12l5 5L20 6'),
        metric('Средний прогресс', report.averageProgress + '%', 'По всем начавшим курс', 'M4 19V5m0 14h16M8 15l4-4 3 2 5-6')));
    const students = panel('Ученики');
    if (!report.students.length) students.append(node('p', 'Курс пока никто не начал.', 'cv-meta'));
    else students.append(table(['Ученик', 'Прогресс', 'Статус', 'Начало', 'Активность'], report.students.map(student => {
      const target = new URLSearchParams(overviewParams);
      target.set('learner', student.id);
      const name = link(student.name, '?' + target, 'cv-report-student');
      return [name, progress(student.counts), badge(student.status, student.counts.percent === 100), date(student.startedAt), date(student.lastActive)];
    }), 'Результаты учеников'));
    const page = Number(params.get('page')) || 1;
    const pageLink = (number, label) => { const next = new URLSearchParams(params); next.set('page', number); return link(label, '?' + next); };
    if (page > 1 || report.hasMore) students.append(actions(page > 1 ? pageLink(page - 1, 'Назад') : null, report.hasMore ? pageLink(page + 1, 'Дальше') : null));
    root.append(students, panel('Блоки актуальной программы',
      table(['Блок', 'Открыли', 'Завершили', 'Попытки', 'Верно с первого ответа'], report.blocks.map(b =>
        [b.title, b.opened, b.completed, b.attempts, b.firstCorrectPercent == null ? '—' : b.firstCorrectPercent + '%']), 'Блоки актуальной программы')));
  }
  async function details(id) {
    await import('/js/course-rich-text.js');
    const c = await api(`/courses/${id}`); shell(); root.append(link('← Каталог курсов', '/courses', 'back-link'));
    root.classList.add('cv-course-detail');
    const lessons = c.modules.flatMap(m => m.lessons), completed = lessons.filter(l => l.completed).length;
    const first = lessons.find(l => l.available);
    const next = lessons.find(l => l.id === c.resumeLessonId && l.available) || lessons.find(l => l.available && !l.completed) || first;
    const repeat = c.totalBlocks > 0 && c.completedBlocks === c.totalBlocks;
    const start = (lesson, entryStep) =>
      e => run(e.currentTarget, () => continueCourse(id, lesson.id, entryStep));
    const hero = node('section', null, 'cv-material-hero');
    root.dataset.theme = c.theme || 'sage';
    const intro = append(node('div', null, 'cv-hero-intro'), append(node('div', null, 'cv-course-chips'),
      node('span', c.level), node('span', `Уроков: ${lessons.length}`)), heading(c.title, c.author || 'Автор курса'));
    const copy = append(node('div', null, 'cv-hero-copy'), window.AdamCourseRichText.render({ text: c.description, richText: c.descriptionRichText }));
    if (c.outcomes) copy.append(append(node('div', null, 'cv-course-outcomes'), node('h2', 'Чему вы научитесь'),
      window.AdamCourseRichText.render({ text: c.outcomes, richText: c.outcomesRichText })));
    const status = node('div', null, 'cv-course-status');
    const entry = !c.started || repeat ? first : next;
    if (entry) status.append(button(repeat ? 'Повторить курс' : c.started ? 'Продолжить' : 'Начать курс', start(entry, !c.started || repeat ? 'first' : null), 'button primary'));
    if (c.started || c.firstCompletedAt) status.append(append(node('div'),
      node('strong', c.percent === 100 ? 'Курс пройден' : c.firstCompletedAt ? 'Добавлены новые блоки' : 'Обучение начато'),
      node('span', `Пройдено блоков: ${c.completedBlocks} из ${c.totalBlocks} · ${c.percent}%`, 'cv-meta')));
    copy.append(status);
    if (!window.AdamAuthenticated) copy.append(node('p', 'Войдите, чтобы сохранить прогресс между посещениями.', 'cv-meta'));
    hero.append(append(node('div', null, 'cv-hero-text'), intro, copy));
    if (c.coverPath) { const img = node('img', null, 'cv-hero-image'); img.src = c.coverPath; img.alt = ''; hero.append(img); }
    root.append(hero);
    const program = append(node('section', null, 'cv-course-program'), node('h2', 'Программа курса'));
    let number = 0;
    c.modules.forEach(m => {
      const section = append(node('section', null, 'cv-material-module'), node('h3', m.title));
      m.lessons.forEach(l => {
        number++;
        const entryStep = l.completed ? 'last' : l.started ? null : 'first';
        const row = l.available ? button(null, start(l, entryStep), 'cv-material-lesson') : node('div', null, 'cv-material-lesson');
        const marker = node('span', l.completed ? '✓' : String(number), 'cv-lesson-marker' + (l.completed ? ' is-complete' : ''));
        marker.setAttribute('aria-hidden', 'true');
        const title = node('span', l.title, 'cv-lesson-title');
        const progress = node('span', l.completed ? 'Завершён' : l.started ? 'Можно продолжить' : l.available ? 'Не начат' : 'Сначала завершите предыдущий урок', 'cv-meta');
        if (l.available) {
          title.id = 'cv-lesson-title-' + l.id;
          progress.id = 'cv-lesson-state-' + l.id;
          row.setAttribute('aria-labelledby', title.id);
          row.setAttribute('aria-describedby', progress.id);
        }
        section.append(append(row, marker, append(node('span', null, 'cv-lesson-copy'), title, progress)));
      }); program.append(section);
    });
    root.append(program);
  }
  async function studio() {
    await import('/js/course-studio.js');
    return window.AdamCourseStudio({ root, api, post, node, append, link, button, actions, field, confirm, run, showError, notice, message, setDirty: value => dirty = value });
  }
  async function player(id) {
    await import('/js/course-rich-text.js');
    const { renderTheoryMedia } = await import('/js/course-theory-media.js');
    const entry = new URLSearchParams(location.search);
    let state, disposePlayer, refreshing = false, pendingExerciseRequests = 0;
    shell(); root.classList.add('cv-lesson-page'); const area = node('div', null, 'cv-player'); root.append(area);
    async function refresh(blockId = null, showCompletion = false, entryStep = null) {
      refreshing = true;
      try {
      const blockQuery = blockId ? '?block=' + encodeURIComponent(blockId) : '';
      state = await api(`/course-sessions/${id}${blockQuery}`);
      const updated = state.updateRequired;
      if (updated) {
        state = await post(`/course-sessions/${id}/update${blockQuery}`);
        if (state.courseRedirect) { location.replace('/courses/' + state.courseRedirect); return; }
        blockId = state.block?.id ?? null;
      }
      if (state.id !== id) { id = state.id; history.replaceState(null, '', '/courses/sessions/' + id); }
      const entryBlock = entryStep === 'first' ? state.steps[0]
        : !showCompletion && state.completed && (entryStep === 'last' || !state.block) ? state.steps.at(-1) : null;
      if (entryBlock) {
        blockId = entryBlock.id;
        if (state.block?.id !== blockId) state = await api(`/course-sessions/${id}?block=${blockId}`);
      }
      if (state.block?.kind === 'theory' && !state.steps[state.viewStep].completed) {
        blockId = state.block.id;
        await post(`/course-sessions/${id}/next`, { blockId });
        state = await api(`/course-sessions/${id}?block=${blockId}`);
      }
      const url = new URL(location.href); url.searchParams.delete('start'); blockId ? url.searchParams.set('block', blockId) : url.searchParams.delete('block'); history.replaceState(null, '', url); draw();
      if (updated) notice('Программа курса обновилась. Зачёт неизменённых блоков сохранён.');
      if (window.AdamAuthenticated && !state.preview && state.block && !state.block.unavailable)
        post(`/course-sessions/${id}/view`, { blockId: state.block.id }).catch(() => {});
      } finally { refreshing = false; }
    }
    function mountExercise(host, block, next, replay) {
      const template = document.getElementById('course-exercise-' + block.kind);
      const player = window.AdamExercisePlayers?.[block.kind];
      if (!template || !player) throw new Error('Не удалось загрузить задание.');
      const sessionPath = `/course-sessions/${id}`;
      let revision = block.practice?.revision;
      const titles = { matching: 'Соотнесение', grammar: 'Форма слова', picture: 'Картинка и слово' };
      const practiceData = practice => ({ title: titles[block.kind], sessionId: block.attemptId, ...practice.board });
      const request = async action => {
        pendingExerciseRequests++;
        try { return await action(); }
        finally { pendingExerciseRequests--; }
      };
      function allowNext() {
        if (!host.isConnected || state.block?.id !== block.id) return;
        state.steps[state.viewStep].completed = true;
        const step = area.querySelector('.cv-step[aria-current="step"]');
        if (step && !step.classList.contains('is-complete')) {
          step.classList.add('is-complete');
          step.setAttribute('aria-label', step.getAttribute('aria-label') + ', пройден');
          step.title += ' — пройден';
        }
        next.disabled = next.hidden = false;
      }
      function offerRetry(action) {
        const footer = next.parentElement;
        if (!host.isConnected || footer.querySelector('.cv-exercise-retry')) return;
        footer.prepend(button('Попробовать снова', event => run(event.currentTarget, action), 'button primary cv-exercise-retry'));
      }
      const reload = () => refresh(block.id);
      if (block.result && !block.result.correct) offerRetry(retryAttempt);
      async function retryAttempt() {
        await post(sessionPath + '/retry', { blockId: block.id, attemptId: block.attemptId });
        await reload();
      }
      if (replay) {
        replay.hidden = !block.result?.correct;
        replay.addEventListener('click', event => run(event.currentTarget, async () => {
          await retryAttempt();
          area.querySelector('#exercise-tiles button')?.focus({ preventScroll: true });
        }));
      }
      const embedded = {
        load: () => block.practice ? practiceData(block.practice) : {
          card: block.card, attemptId: block.attemptId, draftIndices: block.draftIndices,
          completed: Boolean(block.result), result: block.result
        },
        resync: async () => {
          const latest = await api(sessionPath + '?block=' + block.id);
          const practice = latest.block?.practice;
          if (!practice) throw new Error('Не удалось обновить задание.');
          revision = practice.revision;
          if (practice.complete) allowNext();
          return practiceData(practice);
        },
        saveDraft: tokenIndices => request(() => api(sessionPath + '/draft', {
          method: 'PUT', body: JSON.stringify({ blockId: block.id, attemptId: block.attemptId, tokenIndices })
        })),
        answer: payload => request(async () => {
          if (!block.practice) {
            let result = await post(sessionPath + '/answers', { blockId: block.id, attemptId: block.attemptId, tokenIndices: payload });
            if (block.kind === 'listening') {
              const latest = await api(sessionPath + '?block=' + block.id);
              result = latest.block?.result;
              if (!result) throw new Error('Не удалось обновить результат аудирования.');
            }
            if (result.correct) {
              allowNext();
              if (replay && host.isConnected) replay.hidden = false;
            } else offerRetry(retryAttempt);
            return result;
          }
          let input;
          if (block.kind === 'matching') input = { pair: payload };
          if (block.kind === 'picture') input = { choice: { index: payload.optionIndex, text: payload.answer } };
          if (block.kind === 'grammar') input = { choice: { index: payload.optionIndex } };
          if (block.kind === 'dialogue') input = { dialogue: payload };
          const result = await post(sessionPath + '/practice', { blockId: block.id, revision, ...input });
          if (result.stale) {
            if (host.isConnected) await reload();
            throw new Error('Задание обновилось.');
          }
          revision++;
          if (result.finished && (result.correct || block.kind === 'dialogue')) allowNext();
          else if (result.finished && (block.kind === 'picture' || block.kind === 'grammar')) offerRetry(reload);
          return result;
        })
      };
      host.prepend(template.content.cloneNode(true));
      disposePlayer = player(host.firstElementChild, embedded);
    }
    function draw() {
      disposePlayer?.();
      disposePlayer = null;
      area.replaceChildren(); root.dataset.theme = state.theme || "sage";
      area.append(link(state.preview ? '← В конструктор' : '← К программе курса', state.preview ? `/author/courses/${state.courseId}` : `/courses/${state.courseId}`, 'back-link'));
      if (state.preview) area.append(node('p', 'Предпросмотр. Прогресс и очки не сохраняются.', 'cv-notice'));
      else if (!window.AdamAuthenticated) area.append(node('p', 'Гостевое занятие. Войдите, чтобы сохранять прогресс между посещениями.', 'cv-notice'));
      const header = node('section', null, 'cv-player-header');
      const top = append(node('div', null, 'cv-player-top'), heading(state.title, state.block ? `Шаг ${state.viewStep + 1} из ${state.count}` : 'Урок завершён'));
      if (!state.preview) {
        const drawer = node('dialog', null, 'cv-course-drawer');
        drawer.setAttribute('aria-label', 'Программа курса');
        let closing = false, mouseEntered = false, openedAt = 0;
        const closeDrawer = async () => { if (!drawer.open || closing) return; closing = true; if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await drawer.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }], { duration: 180, easing: 'ease-in' }).finished; drawer.close(); closing = false; };
        const toggle = button(null, () => { mouseEntered = false; openedAt = performance.now(); drawer.showModal(); document.addEventListener('pointermove', trackDrawerMouse); toggle.setAttribute('aria-expanded', 'true'); }, 'cv-content-tab');
        toggle.append(node('span', 'Содержание'), icon('m9 5 7 7-7 7'));
        toggle.setAttribute('aria-haspopup', 'dialog'); toggle.setAttribute('aria-expanded', 'false');
        drawer.append(append(node('header'), node('h2', 'Программа курса')));
        if (state.courseProgress) {
          const { completedBlocks, totalBlocks } = state.courseProgress;
          const progress = node('progress', null, 'cv-drawer-course-progress');
          progress.max = totalBlocks || 1;
          progress.value = completedBlocks;
          progress.setAttribute('aria-label', 'Прогресс по курсу');
          progress.setAttribute('aria-valuetext', `Пройдено ${completedBlocks} из ${totalBlocks} блоков`);
          const summary = append(node('div', null, 'cv-drawer-progress-summary'), node('span', 'Пройдено блоков'), node('strong', `${completedBlocks} / ${totalBlocks}`));
          drawer.append(append(node('div', null, 'cv-drawer-progress'), summary, progress));
        }
        function trackDrawerMouse(e) {
          if (e.pointerType !== 'mouse' || !drawer.open || closing || performance.now() - openedAt < 240) return;
          const r = drawer.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (inside) mouseEntered = true;
          else if (mouseEntered) closeDrawer();
        }
        drawer.addEventListener('cancel', e => { e.preventDefault(); closeDrawer(); });
        let moduleId, group;
        state.lessons.forEach(lesson => {
          const moduleKey = lesson.moduleId ?? lesson.module;
          if (!group || moduleId !== moduleKey) {
            moduleId = moduleKey;
            group = node('section'); group.append(node('h3', lesson.module)); drawer.append(group);
          }
          const item = button(null, e => run(e.currentTarget, async () => {
            if (lesson.id === state.lessonId) { await closeDrawer(); return; }
            await continueCourse(state.courseId, lesson.id, 'first');
          }), 'cv-drawer-lesson');
          item.append(node('span', lesson.title, 'cv-drawer-lesson-name'));
          if (lesson.totalBlocks != null) {
            const meter = node('span', null, 'cv-drawer-lesson-meter');
            meter.style.setProperty('--cv-lesson-fill', (lesson.totalBlocks ? 100 * lesson.completedBlocks / lesson.totalBlocks : 0) + '%');
            meter.setAttribute('aria-hidden', 'true');
            const count = node('span', `${lesson.completedBlocks}/${lesson.totalBlocks}`, 'cv-drawer-lesson-count');
            count.setAttribute('aria-hidden', 'true');
            item.prepend(meter);
            item.append(count);
            item.setAttribute('aria-label', `${lesson.title}. Пройдено ${lesson.completedBlocks} из ${lesson.totalBlocks} блоков`);
          }
          item.disabled = !lesson.available;
          if (lesson.id === state.lessonId) item.setAttribute('aria-current', 'page');
          if (!lesson.available) item.title = 'Сначала завершите предыдущие уроки';
          group.append(item);
        });
        drawer.addEventListener('close', () => { document.removeEventListener('pointermove', trackDrawerMouse); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
        drawer.addEventListener('click', e => { if (e.target === drawer) { const r = drawer.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDrawer(); } });
        area.append(drawer, toggle);
      }
      const steps = node('nav', null, 'cv-steps'); steps.setAttribute('aria-label', 'Шаги урока');
      state.steps.forEach((step, index) => {
        const b = button(String(index + 1), e => run(e.currentTarget, () => refresh(step.id)), 'cv-step' + (step.completed ? ' is-complete' : ''));
        b.disabled = !step.available; b.title = `${step.title}${step.completed ? ' — пройден' : step.available ? '' : ' — сначала завершите предыдущие шаги'}`;
        b.setAttribute('aria-label', `Шаг ${index + 1}: ${step.title}${step.completed ? ', пройден' : ''}`); if (index === state.viewStep) b.setAttribute('aria-current', 'step'); steps.append(b);
      }); header.append(top, steps); area.append(header);
      if (state.completed && !state.block) {
        const nextLesson = state.lessons.slice(state.lessons.findIndex(l => l.id === state.lessonId) + 1).find(l => l.available);
        const action = state.preview ? link('Вернуться в конструктор', `/author/courses/${state.courseId}`, 'button primary')
          : nextLesson ? button('Продолжить курс', e => run(e.currentTarget, () => continueCourse(state.courseId, nextLesson.id, 'first')), 'button primary')
          : link('К программе курса', `/courses/${state.courseId}`, 'button primary');
        area.append(empty('Урок пройден', nextLesson ? 'Переходите к следующему уроку программы.' : 'Вы завершили все уроки курса.', action)); return;
      }
      const b = state.block, card = append(node('section', null, 'cv-player-card'), node('h2', b.title));
      const next = button('Продолжить', e => run(e.currentTarget, async () => {
        const nextBlock = state.steps[state.viewStep + 1]?.id ?? null;
        if (!state.steps[state.viewStep].completed) await post(`/course-sessions/${id}/next`, { blockId: b.id });
        await refresh(nextBlock, !nextBlock);
        const heading = area.querySelector('h2');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        }
      }), 'button primary');
      if (b.unavailable) {
        card.append(node('p', 'Материал недоступен. Вы можете открыть другой блок урока.', 'cv-notice'));
        next.hidden = true;
      }
      else if (b.kind === 'theory') {
        const body = append(node('div', null, 'cr-block-content'), window.AdamCourseRichText.render(b), renderTheoryMedia(b.theoryMedia, node));
        body.dataset.alignment = b.alignment || '';
        card.append(body);
      }
      else {
        const host = node('div', null, 'cv-course-exercise');
        card.classList.add('cv-exercise-block');
        next.disabled = next.hidden = !state.steps[state.viewStep].completed;
        const replay = b.kind === 'translation' ? node('button', 'Собрать заново', 'button secondary') : null;
        if (replay) { replay.type = 'button'; replay.hidden = true; }
        const footer = actions(next, replay);
        footer.classList.add('cv-exercise-actions');
        card.append(host, footer);
        area.append(card);
        mountExercise(host, b, next, replay);
        return;
      }
      card.append(actions(next)); area.append(card);
    }
    const startAt = entry.get('start');
    const entryStep = entry.has('block') ? null : startAt === '1' ? 'first' : startAt === 'last' ? 'last' : null;
    await refresh(entry.get('block'), false, entryStep);
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden || state?.preview || refreshing || pendingExerciseRequests || area.querySelector('dialog[open], button[aria-busy="true"]') ||
          [...area.querySelectorAll('input, textarea')].some(input => input.value)) return;
      const current = state;
      try {
        const latest = await api(`/course-sessions/${id}`);
        if (latest.updateRequired && state === current && !refreshing && !pendingExerciseRequests &&
            ![...area.querySelectorAll('input, textarea')].some(input => input.value)) await refresh(state.block?.id);
      } catch (error) { showError(error); }
    });
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  root.addEventListener('click', async e => {
    const a = e.target.closest('a'); if (!a || !dirty || e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); if (await confirm('Выйти из конструктора?', 'Есть несохранённые изменения. Останьтесь и сохраните курс, если хотите продолжить позже.', 'Выйти')) { dirty = false; location.href = a.href; }
  });
  (async () => {
    const parts = path.split('/').filter(Boolean);
    if (path === '/author/courses' || path === '/courses/teaching') return catalog(false, true);
    if (path === '/my-courses') return catalog(true);
    if (parts[0] === 'author' && parts[3] === 'analytics') return analytics(parts[2]);
    if (parts[0] === 'author' && parts[2]) return studio(parts[2]);
    if (parts[1] === 'sessions') return player(parts[2]);
    if (parts[0] === 'courses' && parts[1]) return details(parts[1]);
    return catalog();
  })().catch(e => { shell(); root.append(heading('Не удалось открыть курсы', 'Попробуйте загрузить страницу ещё раз.'), button('Повторить', () => location.reload())); showError(e); });
})();
