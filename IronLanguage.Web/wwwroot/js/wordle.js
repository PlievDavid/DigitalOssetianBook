(() => {
  'use strict';
  const $ = id => document.getElementById(`wl-${id}`);
  const api = window.AdamApi;
  const input = $('input');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const phoneInput = window.matchMedia('(max-width: 599px) and (pointer: coarse)');
  const syncInputMode = () => { input.inputMode = phoneInput.matches ? 'none' : 'text'; };
  syncInputMode(); phoneInput.addEventListener('change', syncInputMode);
  const keyboard = ['йцукенгшщзхъ', 'фывапролджэ', 'ӕячсмитьбю'];
  const markLabels = { correct: 'на своём месте', present: 'есть в другом месте', absent: 'нет в слове' };
  let state = null, busy = true, typed = '', pending = null;
  const normalize = text => text.toLowerCase().replace(/æ/g, 'ӕ').replace(/\u0301/g, '').replace(/[^а-яёӕ]/gu, '').slice(0, 5);
  const errorText = error => error.status ? error.message : 'Не удалось связаться с сервером. Попробуйте ещё раз.';
  function message(text) { $('status').textContent = text; }
  function animate(element, frames, options) {
    if (!reducedMotion.matches && element?.animate) element.animate(frames, options);
  }
  const rowCells = row => [...$('board').children].slice(row * 5, row * 5 + 5);
  function shakeRow() {
    rowCells(state.revision).forEach(cell => animate(cell,
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'ease-out' }));
  }
  function revealRow(row) {
    rowCells(row).forEach((cell, index) => {
      const style = getComputedStyle(cell);
      const front = { backgroundColor: '#f0f4e9', color: '#244e39', borderColor: '#709578' };
      const back = { backgroundColor: style.backgroundColor, color: style.color, borderColor: style.borderColor };
      animate(cell, [
        { ...front, transform: 'perspective(400px) rotateX(0deg)', offset: 0 },
        { ...front, transform: 'perspective(400px) rotateX(90deg)', offset: .45 },
        { ...back, transform: 'perspective(400px) rotateX(90deg)', offset: .55 },
        { ...back, transform: 'perspective(400px) rotateX(0deg)', offset: 1 }
      ], { duration: 360, delay: index * 65, easing: 'ease-in-out', fill: 'backwards' });
      if (state.won) animate(cell,
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }],
        { duration: 320, delay: 680 + index * 55, easing: 'ease-in-out' });
    });
    if (state.finished) animate($('result'),
      [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 240, delay: 620, easing: 'ease-out', fill: 'backwards' });
  }
  function lock(value) {
    busy = value;
    $('board').setAttribute('aria-busy', String(value));
    input.disabled = value || !state || state.finished;
    $('keyboard').querySelectorAll('button').forEach(button => button.disabled = value || !state || state.finished);
  }
  function render() {
    const ranks = { absent: 1, present: 2, correct: 3 }, letters = {};
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) {
      const row = state?.rows[r], letter = row ? row.word[c] : state && !state.finished && r === state.revision ? typed[c] || '' : '';
      const cell = $('board').children[r * 5 + c] || document.createElement('span');
      cell.className = 'wl-cell'; cell.textContent = letter.toUpperCase(); cell.onclick = null;
      let description = `Попытка ${r + 1}, буква ${c + 1}: ${letter || 'пусто'}`;
      if (row) {
        const mark = row.marks[c]; cell.classList.add(`is-${mark}`); description += `, ${markLabels[mark]}`;
        if ((ranks[letters[letter]] || 0) < ranks[mark]) letters[letter] = mark;
      } else if (state && !state.finished && r === state.revision) {
        cell.classList.add('is-current');
        if (c === Math.min(typed.length, 4)) cell.classList.add('is-cursor');
        cell.onclick = () => { if (!busy) input.focus(); };
      }
      cell.setAttribute('aria-label', description);
      if (!cell.parentNode) $('board').append(cell);
    }
    for (const button of $('keyboard').querySelectorAll('[data-letter]')) {
      const letter = button.dataset.letter;
      button.className = 'wl-key';
      if (letters[letter]) button.classList.add(`is-${letters[letter]}`);
      button.setAttribute('aria-label', `${letter.toUpperCase()}${letters[letter] ? `, ${markLabels[letters[letter]]}` : ''}`);
    }
    input.value = typed;
    input.hidden = !!state?.finished;
    $('result').hidden = !state?.finished;
    if (state?.finished) {
      $('result-title').textContent = state.won ? state.countedInStreak ? 'Верно! День в серии засчитан' : 'Верно!' : 'Сегодня не получилось';
      $('answer').textContent = `${state.answer.toUpperCase()} — ${state.russian}`;
      $('next').textContent = `Следующее слово — в ${new Date(state.nextDay).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (state) {
      $('date').textContent = new Date(`${state.day}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
      $('date').dateTime = state.day;
    }
  }
  function updateTyped(value) {
    if (busy || !state || state.finished) return;
    const previousLength = typed.length;
    typed = normalize(value); pending = null; render(); message('');
    rowCells(state.revision).slice(previousLength, typed.length).forEach(cell => animate(cell,
      [{ transform: 'scale(.92)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 140, easing: 'ease-out' }));
  }
  function type(letter) { updateTyped(typed + letter); }
  function backspace() { updateTyped(typed.slice(0, -1)); }
  async function load() {
    lock(true); $('retry').hidden = true;
    try {
      state = await api('/wordle'); typed = ''; pending = null; render(); message('');
    } catch (error) { message(errorText(error)); $('retry').hidden = false; }
    finally { lock(false); }
  }
  async function submit() {
    if (busy || !state || state.finished) return;
    if (typed.length !== 5) { message('Нужно пять букв.'); shakeRow(); return; }
    const wasInputFocused = document.activeElement === input;
    pending ??= { day: state.day, revision: state.revision, guess: typed };
    const previousRevision = state.revision;
    lock(true); message('Проверяем…');
    try {
      state = await api('/wordle/guess', { method: 'POST', body: JSON.stringify(pending) });
      typed = ''; pending = null; render(); message('');
      if (state.revision > previousRevision) revealRow(previousRevision);
      if (state.countedInStreak) document.dispatchEvent(new Event('adam-progress-changed'));
    } catch (error) {
      message(errorText(error));
      if (error.status === 400 || error.status === 422) shakeRow();
      if (error.status === 409) { await load(); message(error.message); }
    } finally { lock(false); if (wasInputFocused && !state?.finished) input.focus(); }
  }
  keyboard.forEach((row, i) => {
    const container = document.createElement('div'); container.className = 'wl-key-row';
    const addAction = (label, action) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'wl-key is-wide'; button.textContent = label; button.addEventListener('click', action); container.append(button); };
    if (i === 2) addAction('Ввод', submit);
    for (const letter of row) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'wl-key'; button.textContent = letter.toUpperCase(); button.dataset.letter = letter;
      button.addEventListener('click', () => type(letter)); container.append(button);
    }
    if (i === 2) { addAction('⌫', backspace); container.lastChild.setAttribute('aria-label', 'Удалить букву'); }
    $('keyboard').append(container);
  });
  input.addEventListener('input', event => { if (!event.isComposing) updateTyped(input.value); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
  document.addEventListener('keydown', event => {
    if (busy || $('stats-dialog').open || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.target === input || event.target.closest('input,textarea,select,a')) return;
    if (event.key === 'Enter' && (event.target.tagName !== 'BUTTON' || event.target.matches('.wl-key[data-letter]'))) { event.preventDefault(); submit(); }
    else if (event.key === 'Backspace') { event.preventDefault(); backspace(); }
    else if (event.key.length === 1 && /^[а-яёӕæ]$/iu.test(event.key)) { event.preventDefault(); type(event.key); }
  });
  $('retry').addEventListener('click', load);
  $('statistics').addEventListener('click', async () => {
    $('stats-dialog').showModal(); $('stats-content').hidden = true;
    if (!window.AdamAuthenticated) { $('stats-status').textContent = 'Войдите в аккаунт, чтобы сохранять результаты и видеть статистику.'; return; }
    $('stats-status').textContent = 'Загружаем статистику…';
    try {
      const stats = await api('/wordle/statistics'); $('stats-metrics').replaceChildren();
      for (const [label, value] of [['Завершено игр', stats.played], ['Побед', stats.won], ['Процент побед', `${stats.winRate}%`], ['Серия занятий', stats.streak]]) {
        const metric = document.createElement('div'); metric.className = 'wl-stat'; const number = document.createElement('strong'); number.textContent = value; const text = document.createElement('span'); text.textContent = label; metric.append(number, text); $('stats-metrics').append(metric);
      }
      $('distribution').replaceChildren(); const max = Math.max(1, ...stats.distribution);
      stats.distribution.forEach((count, i) => { const row = document.createElement('div'), label = document.createElement('span'), bar = document.createElement('span'); label.textContent = i + 1; bar.className = 'wl-bar'; bar.textContent = count; bar.style.width = `${Math.max(8, count / max * 85)}%`; row.setAttribute('aria-label', `${i + 1} попыток: ${count} побед`); row.append(label, bar); $('distribution').append(row); });
      $('stats-status').textContent = ''; $('stats-content').hidden = false;
    } catch (error) { $('stats-status').textContent = errorText(error); }
  });
  $('stats-close').addEventListener('click', () => $('stats-dialog').close());
  $('stats-dialog').addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  $('stats-dialog').addEventListener('click', event => { if (event.target === $('stats-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
  $('share').addEventListener('click', async () => {
    if (!state?.finished) return;
    const marks = { correct: '🟩', present: '🟨', absent: '⬜' };
    const text = `Адам · Пять букв ${state.day} ${state.won ? state.revision : 'X'}/6\n${state.rows.map(row => row.marks.map(mark => marks[mark]).join('')).join('\n')}`;
    try { await navigator.clipboard.writeText(text); message('Результат скопирован.'); }
    catch { message('Не удалось скопировать результат. Разрешите доступ к буферу обмена.'); }
  });
  // Date checks use the server's next-day timestamp. A resumed tab refreshes before another guess.
  const checkDay = () => { if (state && !busy && Date.now() >= Date.parse(state.nextDay)) load(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  setInterval(checkDay, 30000);
  $('guest').hidden = !!window.AdamAuthenticated;
  render(); load();
})();
