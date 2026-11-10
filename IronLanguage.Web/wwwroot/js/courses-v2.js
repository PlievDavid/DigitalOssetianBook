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
  const run = async (control, task) => { control.disabled = true; try { await task(); } catch (e) { showError(e); } finally { control.disabled = false; } };
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
    const search = field('Поиск по названию', query, value => { query = value; draw(); }, { type: 'search' });
    search.querySelector('input').placeholder = 'Найти курс';
    const clear = button('Очистить поиск', () => { query = ''; search.querySelector('input').value = ''; draw(); search.querySelector('input').focus(); });
    const tools = append(node('div', null, 'cv-tools'), search, clear);
    if (!authored) tools.append(field('Уровень', level, value => { level = value; draw(); }, { values: [{ value: '', label: 'Все уровни' }, 'Начальный', 'Средний', 'Продвинутый'] }));
    root.append(tools, grid);
    if (authored) {
      const library = node('section', null, 'cv-library');
      const tabs = actions(button('Курсы', () => { tools.hidden = false; grid.hidden = false; library.hidden = true; courseTab.setAttribute('aria-current', 'true'); lessonTab.setAttribute('aria-current', 'false'); }), button('Библиотека уроков', async e => run(e.currentTarget, async () => {
        const lessons = await api('/author/lesson-library'); tools.hidden = true; grid.hidden = true; library.hidden = false;
        courseTab.setAttribute('aria-current', 'false'); lessonTab.setAttribute('aria-current', 'true'); library.replaceChildren(node('h2', 'Библиотека уроков'), node('p', 'Сохраните урок через его меню в конструкторе. Затем добавляйте его копию в любые свои курсы. Правки копий независимы.', 'cv-meta'));
        if (!lessons.length) library.append(empty('Пока нет сохранённых уроков', 'В конструкторе нажмите правой кнопкой по уроку → «Сохранить в библиотеку».'));
        lessons.forEach(x => library.append(append(node('article', null, 'cv-author-row'), append(node('div'), node('h3', x.lesson.title), node('p', `${x.lesson.blocks.length} блоков · Сохранён ${new Date(x.createdAt).toLocaleDateString('ru-RU')}`, 'cv-meta')))));
      })), link('Материалы упражнений', '/editor'));
      const [courseTab, lessonTab] = tabs.querySelectorAll('button'); courseTab.setAttribute('aria-current', 'true');
      root.insertBefore(tabs, tools); library.hidden = true; root.append(library);
    }
    function draw() {
      const url = new URL(location.href); query ? url.searchParams.set('q', query) : url.searchParams.delete('q'); level ? url.searchParams.set('level', level) : url.searchParams.delete('level'); history.replaceState(null, '', url);
      clear.hidden = !query; grid.replaceChildren();
      const filtered = rows.filter(x => x.title.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')) && (!level || x.level === level));
      if (!filtered.length) { grid.append(empty(rows.length ? 'Курсы не найдены' : authored ? 'Здесь появится ваш первый курс' : mine ? 'Вы ещё не записались на курс' : 'Курсы готовятся', rows.length ? 'Измените запрос или сбросьте фильтры.' : authored ? 'Начните с названия, затем добавьте модули и уроки.' : 'Выберите опубликованный курс в каталоге.', mine ? link('Открыть каталог', '/courses') : null)); return; }
      filtered.forEach(c => {
        if (authored) {
          const row = node('article', null, 'cv-author-row');
          const state = c.archived ? 'В архиве' : c.published ? 'Опубликован' : 'Черновик';
          const body = append(node('div'), node('span', state, 'cv-author-status'), node('h2', c.title), node('p', `${c.modules || 0} модулей · ${c.lessons || 0} уроков`, 'cv-meta'));
          row.append(body, link('Редактировать курс', `/author/courses/${c.id}`, 'cv-button')); grid.append(row); return;
        }
        const card = node('article', null, 'cv-card'); card.dataset.theme = c.theme || 'sage';
        if (c.coverPath) { const img = node('img', null, 'cv-course-image'); img.src = c.coverPath; img.alt = ''; img.loading = 'lazy'; card.append(img); }
        card.append(append(node('div', null, 'cv-cover'), node('span', authored ? c.archived ? 'В архиве' : c.published ? 'Опубликован' : 'Черновик' : c.level)));
        const body = append(node('div', null, 'cv-card-content'), node('h2', c.title), node('p', c.description.length > 180 ? c.description.slice(0, 180) + '…' : c.description || 'Добавьте описание курса.'));
        if (!authored) body.append(node('span', mine ? `${c.completedBlocks} из ${c.totalBlocks} блоков завершено` : `Уроков: ${c.lessons}`, 'cv-meta'));
        if (c.author) body.append(node('span', c.author, 'cv-meta'));
        body.append(actions(enrolled.has(c.id) ? button('Продолжить', e => run(e.currentTarget, () => continueCourse(c.id)), 'button primary') : link('Открыть курс', `/courses/${c.id}`, 'button primary'))); card.append(body); grid.append(card);
      });
    }
    draw();
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
    if (c.started) status.append(append(node('div'), node('strong', c.completedBlocks === c.totalBlocks ? 'Курс пройден' : 'Обучение начато'), node('span', `Пройдено блоков: ${c.completedBlocks} из ${c.totalBlocks}`, 'cv-meta')));
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
    let selected = new URLSearchParams(location.search).get('block'), state, picked = [];
    shell(false); root.classList.add('cv-lesson-page'); const area = node('div', null, 'cv-player'); root.append(area);
    async function refresh(blockId = null) {
      state = await api(`/course-sessions/${id}${blockId ? '?block=' + encodeURIComponent(blockId) : ''}`); picked = [];
      if (state.updateRequired) { state = await post(`/course-sessions/${id}/update`); blockId = state.block?.id ?? null; }
      if (state.id !== id) { id = state.id; history.replaceState(null, '', '/courses/sessions/' + id); }
      if (state.block?.kind === 'theory' && !state.steps[state.viewStep].completed) {
        blockId = state.block.id;
        await post(`/course-sessions/${id}/next`, { blockId });
        state = await api(`/course-sessions/${id}?block=${blockId}`);
      }
      const url = new URL(location.href); blockId ? url.searchParams.set('block', blockId) : url.searchParams.delete('block'); history.replaceState(null, '', url); draw();
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
        const toggle = button('Содержание ›', () => { mouseEntered = false; openedAt = performance.now(); drawer.showModal(); document.addEventListener('pointermove', trackDrawerMouse); toggle.setAttribute('aria-expanded', 'true'); }, 'cv-content-tab');
        toggle.setAttribute('aria-haspopup', 'dialog'); toggle.setAttribute('aria-expanded', 'false');
        drawer.append(append(node('header'), node('h2', 'Программа курса')));
                function trackDrawerMouse(e) {
          if (e.pointerType !== 'mouse' || !drawer.open || closing || performance.now() - openedAt < 240) return;
          const r = drawer.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (inside) mouseEntered = true;
          else if (mouseEntered) closeDrawer();
        }
        drawer.addEventListener('cancel', e => { e.preventDefault(); closeDrawer(); });
        let moduleName, group;
        state.lessons.forEach(lesson => {
          if (!group || moduleName !== lesson.module) {
            moduleName = lesson.module;
            group = node('section'); group.append(node('h3', moduleName)); drawer.append(group);
          }
          const item = button(`${lesson.completed ? '✓ ' : ''}${lesson.title}`, e => run(e.currentTarget, async () => {
            if (lesson.id === state.lessonId) { await closeDrawer(); return; }
            const session = await post(`/courses/${state.courseId}/lessons/${lesson.id}/sessions`);
            location.href = `/courses/sessions/${session.id}`;
          }), 'cv-drawer-lesson');
          item.disabled = !lesson.available;
          if (lesson.completed) item.setAttribute('aria-label', `${lesson.title}, пройден`);
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
      if (b.kind === 'theory') card.append(window.AdamCourseRichText.render(b));
      else {
        if (b.kind === 'listening') {
          const audio = node('audio'); audio.controls = true; audio.src = b.card.audioPath; audio.preload = 'metadata'; card.append(audio);
        }
        card.append(node('p', b.card.russianPrompt, 'cv-prose'), node('p', b.kind === 'listening' ? 'Прослушайте запись и выберите один ответ.' : 'Соберите осетинский перевод из слов.', 'cv-meta'));
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
    if (parts[0] === 'author' && parts[2]) return studio(parts[2]);
    if (parts[1] === 'sessions') return player(parts[2]);
    if (parts[0] === 'courses' && parts[1]) return details(parts[1]);
    return catalog();
  })().catch(e => { shell(); root.append(heading('Не удалось открыть курсы', 'Попробуйте загрузить страницу ещё раз.'), button('Повторить', () => location.reload())); showError(e); });
})();
