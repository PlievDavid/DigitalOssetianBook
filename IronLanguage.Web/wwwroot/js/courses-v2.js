(() => {
  'use strict';
  const root = document.querySelector('#courses-workspace');
  if (!root) return;
  const api = window.AdamApi, path = location.pathname, editor = root.dataset.editor === 'true';
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
  function shell(showTabs = true) {
    root.replaceChildren();
    if (!showTabs) { root.append(message); return; }
    const nav = node('nav', null, 'cv-tabs'); nav.setAttribute('aria-label', 'Разделы курсов');
    [['Каталог', '/courses'], ...(window.AdamAuthenticated ? [['Мои курсы', '/my-courses']] : [])].forEach(([t, href]) => {
      const a = link(t, href, ''); if (path === href) a.setAttribute('aria-current', 'page'); nav.append(a);
    });
    root.append(nav, message);
  }
  async function continueCourse(courseId, lessonId = null) {
    if (!lessonId) {
      const course = await api(`/courses/${courseId}`);
      const lessons = course.modules.flatMap(m => m.lessons);
      lessonId = course.resumeLessonId || lessons.find(l => l.available && !l.completed)?.id || lessons.find(l => l.available)?.id;
    }
    if (!lessonId) { location.href = `/courses/${courseId}`; return; }
    const session = await post(`/courses/${courseId}/lessons/${lessonId}/sessions`);
    location.href = `/courses/sessions/${session.id}`;
  }
  const courseLevels = ['', 'Начальный', 'Средний', 'Продвинутый'];
  function levelFilter(level, onChange) {
    const label = node('span', 'Уровень');
    label.id = 'cv-level-label';
    const value = node('span');
    value.id = 'cv-level-value';
    const menu = node('div', null, 'cv-level-menu');
    menu.id = 'cv-level-menu';
    menu.popover = 'auto';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-labelledby', label.id);
    const trigger = button(null, () => {
      if (menu.matches(':popover-open')) menu.hidePopover();
      else open();
    }, 'cv-level-trigger');
    trigger.setAttribute('aria-labelledby', label.id + ' ' + value.id);
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', menu.id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.append(value, icon('m6 9 6 6 6-6'));
    const items = courseLevels.map(option => {
      const item = button(null, () => {
        update(option);
        menu.hidePopover();
        trigger.focus();
        onChange(option);
      }, 'cv-level-option');
      item.append(node('span', option || 'Все уровни'), icon('m5 12 4 4L19 6'));
      item.setAttribute('role', 'menuitemradio');
      item.tabIndex = -1;
      return item;
    });
    menu.append(...items);
    function update(option) {
      level = option;
      value.textContent = option || 'Все уровни';
      items.forEach((item, index) => item.setAttribute('aria-checked', String(courseLevels[index] === option)));
    }
    function position() {
      const rect = trigger.getBoundingClientRect();
      const below = innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const flip = below < menu.scrollHeight && above > below;
      menu.style.width = rect.width + 'px';
      menu.style.maxHeight = Math.max(0, flip ? above : below) + 'px';
      menu.style.left = rect.left + 'px';
      menu.style.top = (flip ? rect.top - menu.offsetHeight - 8 : rect.bottom + 8) + 'px';
      menu.classList.toggle('is-above', flip);
    }
    function open(index = courseLevels.indexOf(level)) {
      menu.showPopover({ source: trigger });
      position();
      trigger.setAttribute('aria-expanded', 'true');
      items[index].focus();
    }
    menu.addEventListener('toggle', event => {
      if (event.newState === 'open') {
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position);
      } else {
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position);
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      open(event.key === 'ArrowUp' ? items.length - 1 : 0);
    });
    menu.addEventListener('keydown', event => {
      const index = items.indexOf(document.activeElement);
      const next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index + items.length - 1) % items.length, Home: 0, End: items.length - 1 }[event.key];
      if (typeof next === 'number') {
        event.preventDefault();
        items[next].focus();
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        menu.hidePopover();
        trigger.focus();
      }
    });
    update(level);
    return append(node('div', null, 'cv-field cv-level-filter'), label, trigger, menu);
  }
  async function catalog(mine = false, authored = false) {
    const rows = await api(authored ? '/author/courses' : mine ? '/me/courses' : '/courses');
    const enrolled = new Set(!authored && window.AdamAuthenticated ? (mine ? rows : await api('/me/courses')).map(c => c.id) : []);
    if (!authored) root.classList.add('cv-material-catalog');
    if (authored) { root.replaceChildren(message); root.append(link('← Каталог курсов', '/courses', 'back-link')); } else shell();
    const create = button('Создать курс', e => run(e.currentTarget, async () => {
      const course = await post('/author/courses', { title: 'Новый курс', description: '', modules: [] });
      location.href = `/author/courses/${course.id}`;
    }), 'button primary');
    if (authored) root.append(heading(authored ? 'Преподавание' : mine ? 'Мои курсы' : 'Курсы осетинского языка', authored
      ? 'Ваши курсы и библиотека уроков для повторного использования.'
      : mine ? 'Возвращайтесь к своей программе и продолжайте с сохранённого места.' : 'Изучайте язык последовательно: объяснение, практика и новый шаг.', authored ? create : null));
    const grid = node('div', null, authored ? 'cv-author-list' : 'cv-grid'); const params = new URLSearchParams(location.search);
    let query = params.get('q') || '', level = params.get('level') || '';
    if (authored || !courseLevels.includes(level)) level = '';
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
    searchField.append(searchLabel, append(node('div', null, 'cv-search-control'), input, clear));
    const tools = append(node('div', null, 'cv-tools'), searchField);
    if (!authored) tools.append(levelFilter(level, value => { level = value; draw(); }));
    const resultsStatus = node('div', null, 'cv-results-status');
    resultsStatus.setAttribute('role', 'status');
    root.append(tools, resultsStatus, grid);
    if (authored) {
      const library = node('section', null, 'cv-library');
      const tabs = actions(button('Курсы', () => { tools.hidden = false; grid.hidden = false; library.hidden = true; courseTab.setAttribute('aria-current', 'true'); lessonTab.setAttribute('aria-current', 'false'); }), button('Библиотека уроков', async e => run(e.currentTarget, async () => {
        const lessons = await api('/author/lesson-library'); tools.hidden = true; grid.hidden = true; library.hidden = false;
        courseTab.setAttribute('aria-current', 'false'); lessonTab.setAttribute('aria-current', 'true'); library.replaceChildren(node('h2', 'Библиотека уроков'), node('p', 'Сохраните урок через его меню в конструкторе. Затем добавляйте его копию в любые свои курсы. Правки копий независимы.', 'cv-meta'));
        if (!lessons.length) library.append(empty('Пока нет сохранённых уроков', 'В конструкторе нажмите правой кнопкой по уроку → «Сохранить в библиотеку».'));
        lessons.forEach(x => library.append(append(node('article', null, 'cv-author-row'),
          append(node('div'), node('h3', x.lesson.title), node('p', `${x.lesson.blocks.length} блоков · Сохранён ${new Date(x.createdAt).toLocaleDateString('ru-RU')}`, 'cv-meta')),
          actions(x.sourceAvailable ? link('Открыть оригинал', `/author/courses/${x.sourceCourseId}?lesson=${x.sourceLessonId}`)
            : node('span', 'Исходный курс удалён', 'cv-meta'),
            button('Обновить курсы', e => run(e.currentTarget, () => updateLinkedCourses(x)))))));
      })), link('Материалы упражнений', '/editor'));
      const [courseTab, lessonTab] = tabs.querySelectorAll('button'); courseTab.setAttribute('aria-current', 'true');
      root.insertBefore(tabs, tools); library.hidden = true; root.append(library);
      if (params.has('library')) lessonTab.click();
    }
    function draw() {
      clearTimeout(searchTimer);
      const url = new URL(location.href); query ? url.searchParams.set('q', query) : url.searchParams.delete('q'); level ? url.searchParams.set('level', level) : url.searchParams.delete('level'); history.replaceState(null, '', url);
      const term = query.trim().toLocaleLowerCase('ru');
      const filtered = rows.filter(x => x.title.toLocaleLowerCase('ru').includes(term) && (!level || x.level === level));
      if (displayed?.length === filtered.length && displayed.every((row, index) => row === filtered[index])) return;
      if (displayed) {
        resultsStatus.textContent = filtered.length ? `Курсов найдено: ${filtered.length}` : 'Курсы не найдены';
        resultMotion?.cancel();
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
          resultMotion = grid.animate([{ opacity: 0.45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' });
      }
      displayed = filtered;
      grid.replaceChildren();
      if (!filtered.length) { grid.append(empty(rows.length ? 'Курсы не найдены' : authored ? 'Здесь появится ваш первый курс' : mine ? 'Вы ещё не записались на курс' : 'Курсы готовятся', rows.length ? 'Измените запрос или сбросьте фильтры.' : authored ? 'Начните с названия, затем добавьте модули и уроки.' : 'Выберите опубликованный курс в каталоге.', mine ? link('Открыть каталог', '/courses') : null)); return; }
      filtered.forEach(c => {
        if (authored) {
          const row = node('article', null, 'cv-author-row');
          const state = c.blockReason ? 'Заблокирован' : c.archived ? 'В архиве' : c.published ? 'Опубликован' : 'Черновик';
          const body = append(node('div'), node('span', state, c.blockReason ? 'cv-author-status cv-blocked-status' : 'cv-author-status'),
            node('h2', c.title), node('p', `${c.modules || 0} модулей · ${c.lessons || 0} уроков`, 'cv-meta'),
            c.blockReason ? node('p', 'Причина: ' + c.blockReason, 'cv-blocked-status') : null);
          row.append(body, actions(link('Редактировать курс', `/author/courses/${c.id}`, 'cv-button'),
            c.published ? link('Результаты учеников', `/author/courses/${c.id}/analytics`, 'cv-button') : null)); grid.append(row); return;
        }
        const card = node('article', null, 'cv-card'); card.dataset.theme = c.theme || 'sage';
        if (c.coverPath) { const img = node('img', null, 'cv-course-image'); img.src = c.coverPath; img.alt = ''; img.loading = 'lazy'; card.append(img); }
        card.append(append(node('div', null, 'cv-cover'), node('span', authored ? c.archived ? 'В архиве' : c.published ? 'Опубликован' : 'Черновик' : c.level)));
        const body = append(node('div', null, 'cv-card-content'), node('h2', c.title), node('p', c.description.length > 180 ? c.description.slice(0, 180) + '…' : c.description || 'Добавьте описание курса.'));
        if (!authored) body.append(node('span', mine || enrolled.has(c.id) ? `${c.completedBlocks} из ${c.totalBlocks} блоков завершено` : `Блоков: ${c.totalBlocks}`, 'cv-meta'));
        if (c.author) body.append(node('span', c.author, 'cv-meta'));
        body.append(actions(enrolled.has(c.id) ? button('Продолжить', e => run(e.currentTarget, () => continueCourse(c.id)), 'button primary') : link('Открыть курс', `/courses/${c.id}`, 'button primary'))); card.append(body); grid.append(card);
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
    shell(false);
    const params = new URLSearchParams(location.search);
    const report = await api(`/author/courses/${id}/analytics?` + params);
    const overviewParams = new URLSearchParams(params);
    overviewParams.delete('learner');
    const overviewUrl = `/author/courses/${id}/analytics` + (overviewParams.size ? '?' + overviewParams : '');
    root.append(report.student
      ? link('← Результаты курса', overviewUrl, 'back-link')
      : link('← Преподавание', '/courses/teaching', 'back-link'));
    const date = value => value ? new Date(value).toLocaleString('ru-RU') : '—';
    function table(labels, rows) {
      const head = append(node('thead'), append(node('tr'), ...labels.map(label => node('th', label))));
      const body = node('tbody');
      rows.forEach(cells => body.append(append(node('tr'), ...cells.map(cell => cell instanceof Node ? append(node('td'), cell) : node('td', String(cell))))));
      const scroll = node('div', null, 'cv-report-table'); scroll.tabIndex = 0;
      return append(scroll, append(node('table'), head, body));
    }
    if (report.student) {
      root.append(heading(report.student.name, report.title),
        node('p', `${report.student.status} · ${report.student.counts.completedBlocks} из ${report.student.counts.totalBlocks} блоков`));
      if (report.student.finishedAt) root.append(node('p', 'Первое завершение: ' + date(report.student.finishedAt), 'cv-meta'));
      report.modules.forEach(module => {
        root.append(node('h2', module.title));
        module.lessons.forEach(lesson => {
          root.append(node('h3', lesson.title), table(['Блок', 'Статус', 'Попытки', 'Верные', 'Последняя активность'],
            lesson.blocks.map(b => [b.title, b.completed ? 'Пройден' : 'Не пройден', b.attempts, b.correct, date(b.lastSeen)])));
        });
      });
      return;
    }
    root.append(heading('Результаты учеников', report.title), node('p',
      `Начали: ${report.started}. Завершили актуальную программу: ${report.finished}. Средний прогресс: ${report.averageProgress}%.`));
    const period = field('Период', String(report.days), days => { params.set('days', days); params.delete('page'); location.search = params; }, {
      values: [{ value: '7', label: '7 дней' }, { value: '30', label: '30 дней' }, { value: '90', label: '90 дней' }]
    });
    root.append(period, node('p', `За период начали: ${report.startedInPeriod}. Завершили: ${report.finishedInPeriod}.`, 'cv-meta'));
    root.append(node('h2', 'Ученики'));
    if (!report.students.length) root.append(node('p', 'Курс пока никто не начал.'));
    else root.append(table(['Ученик', 'Прогресс', 'Статус', 'Начало', 'Активность'], report.students.map(student => {
      const target = new URLSearchParams(overviewParams);
      target.set('learner', student.id);
      const name = link(student.name, '?' + target, 'cv-report-student');
      return [name, `${student.counts.completedBlocks}/${student.counts.totalBlocks} · ${student.counts.percent}%`, student.status, date(student.startedAt), date(student.lastActive)];
    })));
    const page = Number(params.get('page')) || 1;
    const pageLink = (number, label) => { const next = new URLSearchParams(params); next.set('page', number); return link(label, '?' + next); };
    root.append(actions(page > 1 ? pageLink(page - 1, 'Назад') : null, report.hasMore ? pageLink(page + 1, 'Дальше') : null),
      node('h2', 'Блоки актуальной программы'),
      table(['Блок', 'Открыли', 'Завершили', 'Попытки', 'Верно с первого ответа'], report.blocks.map(b =>
        [b.title, b.opened, b.completed, b.attempts, b.firstCorrectPercent == null ? '—' : b.firstCorrectPercent + '%'])));
  }
  async function details(id) {
    await import('/js/course-rich-text.js');
    const c = await api(`/courses/${id}`); shell(false); root.append(link('← Каталог курсов', '/courses', 'back-link'));
    root.classList.add('cv-course-detail');
    const lessons = c.modules.flatMap(m => m.lessons), completed = lessons.filter(l => l.completed).length;
    const next = lessons.find(l => l.id === c.resumeLessonId && l.available) || lessons.find(l => l.available && !l.completed) || lessons[0];
    const start = lesson => async e => run(e.currentTarget, async () => { const session = await post(`/courses/${id}/lessons/${lesson.id}/sessions`); location.href = `/courses/sessions/${session.id}`; });
    const hero = node('section', null, 'cv-material-hero');
    root.dataset.theme = c.theme || 'sage';
    if (c.coverPath) { const img = node('img', null, 'cv-hero-image'); img.src = c.coverPath; img.alt = ''; hero.append(img); }
    hero.append(append(node('div', null, 'cv-course-chips'), node('span', c.level), node('span', `Уроков: ${lessons.length}`)), heading(c.title, c.author || 'Автор курса'), window.AdamCourseRichText.render({ text: c.description, richText: c.descriptionRichText }));
    if (c.outcomes) hero.append(append(node('div', null, 'cv-course-outcomes'), node('h2', 'Чему вы научитесь'), node('p', c.outcomes)));
    const status = node('div', null, 'cv-course-status');
    if (next) status.append(button(c.resumeLessonId ? 'Продолжить' : c.completedBlocks === c.totalBlocks ? 'Повторить курс' : c.started ? 'Продолжить' : 'Начать курс', start(next), 'button primary'));
    if (c.started || c.firstCompletedAt) status.append(append(node('div'),
      node('strong', c.percent === 100 ? 'Курс пройден' : c.firstCompletedAt ? 'Добавлены новые блоки' : 'Обучение начато'),
      node('span', `Пройдено блоков: ${c.completedBlocks} из ${c.totalBlocks} · ${c.percent}%`, 'cv-meta')));
    hero.append(status);
    if (!window.AdamAuthenticated) hero.append(node('p', 'Войдите, чтобы сохранить прогресс между посещениями.', 'cv-meta'));
    root.append(hero);
    const program = append(node('section', null, 'cv-course-program'), node('h2', 'Программа курса'));
    let number = 0;
    c.modules.forEach(m => {
      const section = append(node('section', null, 'cv-material-module'), node('h3', m.title));
      m.lessons.forEach(l => {
        const b = button(l.started ? 'Продолжить урок' : l.completed ? 'Повторить' : 'Открыть урок', start(l), 'cv-lesson-action'); b.disabled = !l.available;
        const marker = node('span', l.completed ? '✓' : String(++number), 'cv-lesson-marker' + (l.completed ? ' is-complete' : '')); marker.setAttribute('aria-hidden', 'true');
        if (l.completed) number++;
        section.append(append(node('div', null, 'cv-material-lesson'), marker, append(node('div', null, 'cv-lesson-copy'), node('h4', l.title), node('span', l.started ? 'Можно продолжить' : l.completed ? 'Завершён' : l.available ? 'Не начат' : 'Сначала завершите предыдущий урок', 'cv-meta')), b));
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
    let selected = new URLSearchParams(location.search).get('block'), state, picked = [], practiceFeedback = '', refreshing = false;
    shell(false); root.classList.add('cv-lesson-page'); const area = node('div', null, 'cv-player'); root.append(area);
    async function refresh(blockId = null) {
      refreshing = true;
      try {
      const blockQuery = blockId ? '?block=' + encodeURIComponent(blockId) : '';
      state = await api(`/course-sessions/${id}${blockQuery}`); picked = [];
      const updated = state.updateRequired;
      if (updated) {
        state = await post(`/course-sessions/${id}/update${blockQuery}`);
        if (state.courseRedirect) { location.replace('/courses/' + state.courseRedirect); return; }
        blockId = state.block?.id ?? null;
      }
      if (state.id !== id) { id = state.id; history.replaceState(null, '', '/courses/sessions/' + id); }
      if (state.block?.kind === 'theory' && !state.steps[state.viewStep].completed) {
        blockId = state.block.id;
        await post(`/course-sessions/${id}/next`, { blockId });
        state = await api(`/course-sessions/${id}?block=${blockId}`);
      }
      const url = new URL(location.href); blockId ? url.searchParams.set('block', blockId) : url.searchParams.delete('block'); history.replaceState(null, '', url); draw();
      if (updated) notice('Программа курса обновилась. Зачёт неизменённых блоков сохранён.');
      if (window.AdamAuthenticated && !state.preview && state.block && !state.block.unavailable)
        post(`/course-sessions/${id}/view`, { blockId: state.block.id }).catch(() => {});
      } finally { refreshing = false; }
    }
    function exerciseAudio(src) {
      const status = node('p', null, 'cv-meta'); status.setAttribute('role', 'status');
      const audio = node('audio'); audio.controls = true; audio.src = src; audio.preload = 'metadata';
      audio.addEventListener('error', () => { status.textContent = 'Не удалось загрузить запись. Обновите страницу или вернитесь к упражнению позже.'; });
      return append(node('div'), audio, status);
    }
    function practiceBlock(card, block) {
      const { board, revision, complete } = block.practice;
      const status = node('p', practiceFeedback, 'cv-meta'); status.setAttribute('role', 'status');
      practiceFeedback = '';
      async function answer(trigger, value) {
        await run(trigger, async () => {
          const result = await post(`/course-sessions/${id}/practice`, { blockId: block.id, revision, ...value });
          practiceFeedback = result.stale ? 'Упражнение обновлено.' : result.correct ? 'Верно!' : 'Пока неверно. Попробуйте ещё раз.';
          if (result.hint && typeof result.hint === 'string') practiceFeedback += ' ' + result.hint;
          if (result.hint?.prefix) practiceFeedback += ' Начало реплики: ' + result.hint.prefix;
          if (result.hint?.expected) practiceFeedback += ' Подсказка: ' + result.hint.expected;
          if (result.expected && !result.correct) practiceFeedback += ' Ответ: ' + result.expected;
          await refresh(block.id);
        });
      }
      if (complete) {
        card.append(node('p', 'Упражнение выполнено.', 'cv-result'));
        return;
      }
      if (block.kind === 'matching') {
        let left;
        const leftGroup = node('div', null, 'cv-tokens'), rightGroup = node('div', null, 'cv-tokens');
        const leftButtons = board.left.map(tile => {
          const control = button(tile.text, () => {
            left = tile.index;
            leftButtons.forEach(x => x.setAttribute('aria-pressed', String(x === control)));
            rightButtons.forEach((x, index) => { x.disabled = board.right[index].matched; });
          }, 'cv-token');
          control.disabled = tile.matched; control.setAttribute('aria-pressed', 'false'); return control;
        });
        const rightButtons = board.right.map(tile => {
          const control = button(tile.text, e => answer(e.currentTarget, { pair: { left, right: tile.index } }), 'cv-token');
          control.disabled = true; return control;
        });
        leftGroup.append(...leftButtons); rightGroup.append(...rightButtons);
        card.append(node('p', 'Выберите слово в первом ряду и его пару во втором.'), leftGroup, rightGroup, node('p', `Пар собрано: ${board.matched} из ${board.total}`, 'cv-meta'));
      } else if (block.kind === 'dialogue') {
        board.lines.forEach(line => card.append(node('p', [line.name, line.text].filter(Boolean).join(' · '), 'cv-prose')));
        const turn = board.turn;
        if (turn) {
          const submit = (event, value, skip = false) => answer(event.currentTarget, { dialogue: { turnId: turn.line, value, skip } });
          if (turn.options.length) card.append(actions(...turn.options.map(option => button(option, e => submit(e, option), 'cv-token'))));
          else {
            const control = field('Ваша реплика', '', () => {});
            card.append(control, button('Ответить', e => submit(e, control.querySelector('input').value), 'button primary'));
          }
          if (turn.skippable) card.append(button('Пропустить реплику', e => submit(e, null, true), 'cv-button'));
        }
      } else {
        if (block.kind === 'picture') {
          const image = node('img'); image.src = board.picturePath; image.alt = 'Назовите предмет на изображении'; image.style.maxWidth = '100%';
          image.addEventListener('error', () => { status.textContent = 'Не удалось загрузить изображение.'; });
          card.append(image);
        } else card.append(node('p', board.prompt, 'cv-prose'));
        if (board.options.length) card.append(actions(...board.options.map((option, index) => button(option, e => answer(e.currentTarget, { choice: { index } }), 'cv-token'))));
        else {
          const control = field('Ваш ответ', '', () => {});
          card.append(control, button('Проверить ответ', e => answer(e.currentTarget, { choice: { text: control.querySelector('input').value } }), 'button primary'));
        }
      }
      card.append(status);
    }
    function draw() {
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
            const session = await post(`/courses/${state.courseId}/lessons/${lesson.id}/sessions`);
            location.href = `/courses/sessions/${session.id}`;
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
          : nextLesson ? button('Продолжить курс', e => run(e.currentTarget, () => continueCourse(state.courseId, nextLesson.id)), 'button primary')
          : link('К программе курса', `/courses/${state.courseId}`, 'button primary');
        area.append(empty('Урок пройден', nextLesson ? 'Переходите к следующему уроку программы.' : 'Вы завершили все уроки курса.', action)); return;
      }
      const b = state.block, card = append(node('section', null, 'cv-player-card'), node('h2', b.title));
      const next = button('Продолжить', e => run(e.currentTarget, async () => {
        if (state.steps[state.viewStep].completed) { await refresh(state.steps[state.viewStep + 1]?.id ?? null); return; }
        await post(`/course-sessions/${id}/next`, { blockId: b.id }); await refresh(state.steps[state.viewStep + 1]?.id ?? null);
      }), 'button primary');
      if (b.unavailable) {
        card.append(node('p', 'Материал недоступен. Вы можете открыть другой блок урока.', 'cv-notice'));
        next.hidden = true;
      }
      else if (b.kind === 'theory') append(card, window.AdamCourseRichText.render(b), renderTheoryMedia(b.theoryMedia, node));
      else if (b.practice) {
        practiceBlock(card, b);
        next.hidden = !b.practice.complete; next.disabled = next.hidden;
      }
      else {
        if (b.kind === 'listening' || b.kind === 'audio') card.append(exerciseAudio(b.card.audioPath));
        if (b.kind !== 'audio') card.append(node('p', b.card.russianPrompt, 'cv-prose'));
        const instructions = { listening: 'Прослушайте запись и выберите один ответ.', audio: 'Прослушайте запись и соберите фразу из слов.', translation: 'Соберите осетинский перевод из слов.' };
        card.append(node('p', instructions[b.kind], 'cv-meta'));
        const selected = node('div', null, 'cv-picked'), tokens = node('div', null, 'cv-tokens');
        selected.setAttribute('aria-label', 'Собранная фраза'); tokens.setAttribute('aria-label', 'Доступные слова');
        const check = button('Проверить ответ', e => run(e.currentTarget, async () => {
          await post(`/course-sessions/${id}/answers`, { blockId: b.id, attemptId: b.attemptId, tokenIndices: picked }); await refresh(b.id);
        }), 'button primary');
        function renderTokens() {
          selected.replaceChildren(); tokens.replaceChildren();
          if (!picked.length) selected.append(node('span', 'Выберите слова ниже', 'cv-meta'));
          picked.forEach((index, position) => selected.append(button(b.card.tokens[index], () => { picked.splice(position, 1); renderTokens(); }, 'cv-token')));
          b.card.tokens.forEach((text, index) => { const t = button(text, () => { if (b.kind === 'listening') picked = [index]; else picked.push(index); renderTokens(); }, 'cv-token'); t.disabled = picked.includes(index); tokens.append(t); });
          check.disabled = !picked.length;
        }
        if (!b.result) { renderTokens(); card.append(selected, tokens, check); next.disabled = true; next.hidden = true; }
        else {
          card.append(append(node('div', null, `cv-result${b.result.correct ? '' : ' incorrect'}`), node('strong', b.result.correct ? 'Верно!' : 'Пока неверно. Попробуйте ещё раз'), node('p', b.result.expectedAnswer), b.result.explanation ? node('p', b.result.explanation) : null));
          if (!b.result.correct) {
            next.hidden = true; next.disabled = true;
            card.append(button('Попробовать снова', e => run(e.currentTarget, async () => {
              await post(`/course-sessions/${id}/retry`, { blockId: b.id, attemptId: b.attemptId }); await refresh(b.id);
              area.querySelector('.cv-token')?.focus();
            }), 'button primary'));
          }
        }
      }
      card.append(actions(next)); area.append(card);
    }
    await refresh(selected);
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden || state?.preview || refreshing || picked.length || area.querySelector('dialog[open], button[aria-busy="true"]') ||
          [...area.querySelectorAll('input, textarea')].some(input => input.value)) return;
      const current = state;
      try {
        const latest = await api(`/course-sessions/${id}`);
        if (latest.updateRequired && state === current && !refreshing && !picked.length &&
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
