(() => {
  'use strict';
  const $ = id => document.getElementById(`cw-${id}`);
  const api = window.AdamApi;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const drafts = new Map();
  const cardArt = new Map([
    [1, 'family'], [2, 'home'], [3, 'nature'], [4, 'weather'], [5, 'table'],
    [6, 'garden'], [7, 'pets'], [8, 'wildlife'], [9, 'person'], [10, 'clothing']
  ]);
  let levels = [], level = null, cells = {}, solved = new Set(), selected = null, activeKey = null, busy = false;
  const key = (w, i) => `${w.row + (w.down ? i : 0)},${w.column + (w.down ? 0 : i)}`;
  const keys = w => Array.from({ length: w.length }, (_, i) => key(w, i));
  const normalize = text => text.toLowerCase().replace(/æ/g, 'ӕ').replace(/\u0301/g, '').normalize('NFC');
  const stars = count => count === 0 ? 0 : count === level.words.length ? 3 : count * 2 >= level.words.length ? 2 : 1;
  function message(text) { $('status').textContent = text; }
  function animate(element, frames, options) {
    if (!reducedMotion.matches && element?.animate) element.animate(frames, options);
  }
  function animateErasedLetter(cell, letter) {
    if (!letter || reducedMotion.matches || !cell?.animate) return;
    const ghost = document.createElement('span'); ghost.className = 'cw-letter-exit';
    ghost.textContent = letter.toUpperCase(); ghost.setAttribute('aria-hidden', 'true'); cell.append(ghost);
    const animation = ghost.animate([{ opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'translateY(3px) scale(.65)' }], { duration: 180, easing: 'ease-out' });
    animation.finished.then(() => ghost.remove(), () => ghost.remove());
  }
  function celebrate(newWords, previousFixed) {
    const newCells = [...new Set(newWords.flatMap(keys))].filter(k => !previousFixed.has(k));
    newCells.forEach((k, index) => animate(inputAt(k)?.closest('.cw-cell'),
      [{ transform: 'scale(1)', backgroundColor: '#edf3e9' }, { transform: 'scale(1.06)', backgroundColor: '#dcebd5' }, { transform: 'scale(1)', backgroundColor: '#edf3e9' }],
      { duration: 300, delay: Math.min(index, 12) * 25, easing: 'ease-out' }));
    if (newWords.length) animate($('progress'),
      [{ transform: 'translateY(0)' }, { transform: `translateY(-${solved.size === level.words.length ? 4 : 2}px)` }, { transform: 'translateY(0)' }],
      { duration: 340, easing: 'ease-out' });
  }
  function rating(n) {
    const group = document.createElement('span'); group.className = 'cw-stars'; group.dataset.rating = n;
    group.setAttribute('role', 'img'); group.setAttribute('aria-label', `${n} из 3 звёзд`);
    for (let i = 0; i < 3; i++) {
      const star = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      star.setAttribute('viewBox', '0 0 24 24'); star.setAttribute('aria-hidden', 'true'); star.setAttribute('focusable', 'false');
      star.setAttribute('class', `cw-star${i < n ? ' is-earned' : ''}`);
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      shape.setAttribute('d', 'M10.9 3.8Q12 1.6 13.1 3.8L15.1 7.9Q15.4 8.5 16.1 8.6L20.6 9.2Q23 9.5 21.3 11.2L18 14.4Q17.5 14.9 17.6 15.6L18.4 20.1Q18.8 22.5 16.6 21.3L12.6 19.2Q12 18.9 11.4 19.2L7.4 21.3Q5.2 22.5 5.6 20.1L6.4 15.6Q6.5 14.9 6 14.4L2.7 11.2Q1 9.5 3.4 9.2L7.9 8.6Q8.6 8.5 8.9 7.9Z');
      star.append(shape); group.append(star);
    }
    return group;
  }
  function remember() {
    if (!level) return;
    drafts.set(`${level.id}/${level.version}`, { cells: { ...cells }, solved: [...solved] });
    const card = levels.find(x => x.id === level.id && x.version === level.version);
    if (card) { card.solved = solved.size; card.stars = stars(solved.size); }
  }
  function cards() {
    $('levels').replaceChildren();
    for (const item of levels) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cw-card';
      button.innerHTML = '<span class="cw-card-copy"><span class="cw-card-top"></span><strong></strong><span class="cw-card-count"></span></span>';
      button.querySelector('.cw-card-top').textContent = `КРОССВОРД ${String(item.id).padStart(2, '0')}`;
      button.querySelector('strong').textContent = item.title;
      button.querySelector('.cw-card-count').textContent = `${item.solved} из ${item.total} слов`;
      button.querySelector('.cw-card-copy').append(rating(item.stars));
      const artwork = cardArt.get(item.id);
      if (artwork) {
        const image = document.createElement('img');
        image.className = 'cw-card-art';
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.width = 256;
        image.height = 256;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
          image.remove();
          button.classList.remove('has-art');
        }, { once: true });
        image.src = `/images/crosswords/${artwork}-v1.webp`;
        button.classList.add('has-art');
        button.append(image);
      }
      button.addEventListener('click', () => open(item));
      $('levels').append(button);
    }
  }
  function lock(value) {
    busy = value;
    $('play').setAttribute('aria-busy', String(value));
    $('check').disabled = value || solved.size === level?.words.length;
    $('back').disabled = value;
    $('letter').disabled = value || solved.size === level?.words.length;
    $('grid').querySelectorAll('input').forEach(el => el.disabled = value);
    $('play').querySelectorAll('.cw-clue').forEach(el => el.disabled = value);
  }
  function select(word, focus = false) {
    if (busy) return;
    selected = word;
    $('answer-label').textContent = `${word.number}. ${word.clue} · ${word.down ? 'по вертикали' : 'по горизонтали'} · ${word.length} букв`;
    paint();
    if (focus) {
      const fixed = fixedCells();
      const wordKeys = keys(word);
      focusCell(wordKeys.find(k => !fixed.has(k) && !cells[k]) || wordKeys.find(k => !fixed.has(k)) || wordKeys[0]);
    }
  }
  const fixedCells = () => new Set(level.words.filter(w => solved.has(w.id)).flatMap(keys));
  const inputAt = k => $('grid').querySelector(`input[data-key="${k}"]`);
  function focusCell(k) { activeKey = k; const input = inputAt(k); input.focus(); if (!input.readOnly) input.select(); }
  function chooseCell(k, toggle = false, down = null) {
    const choices = level.words.filter(w => keys(w).includes(k));
    const word = down !== null ? choices.find(w => w.down === down) : null;
    select(word || (toggle ? choices[(choices.indexOf(selected) + 1) % choices.length] : choices.includes(selected) ? selected : choices.find(w => !solved.has(w.id)) || choices[0]));
    activeKey = k;
  }
  function writeText(text, start = activeKey) {
    if (busy || !selected || !start) return;
    const answer = normalize(text.trim());
    if (!answer || !/^[а-яёӕ]+$/u.test(answer)) { paint(); return; }
    const wordKeys = keys(selected), first = wordKeys.indexOf(start), fixed = fixedCells();
    if (first < 0 || answer.length > wordKeys.length - first) { message('В слове недостаточно клеток для вставки.'); paint(); return; }
    const target = wordKeys.slice(first, first + answer.length);
    if (target.some((k, i) => fixed.has(k) && cells[k] !== answer[i])) { message('Проверенные буквы на пересечении менять нельзя.'); paint(); return; }
    const changed = target.filter((k, i) => !fixed.has(k) && cells[k] !== answer[i]);
    target.forEach((k, i) => cells[k] = answer[i]);
    remember(); paint(); message('');
    changed.forEach(k => animate(inputAt(k)?.closest('.cw-cell'),
      [{ transform: 'scale(.94)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
      { duration: 140, easing: 'ease-out' }));
    const next = wordKeys.slice(first + answer.length).find(k => !fixed.has(k));
    focusCell(next || [...target].reverse().find(k => !fixed.has(k)) || start);
  }
  function erase(k, backward) {
    if (busy || !selected) return;
    const fixed = fixedCells();
    if (fixed.has(k)) return;
    let target = k;
    if (backward && !cells[k]) {
      const wordKeys = keys(selected);
      target = wordKeys.slice(0, wordKeys.indexOf(k)).reverse().find(candidate => !fixed.has(candidate)) || k;
    }
    const erasedLetter = cells[target];
    delete cells[target]; remember(); paint(); focusCell(target);
    animateErasedLetter(inputAt(target)?.closest('.cw-cell'), erasedLetter);
  }
  function paint() {
    const active = new Set(selected ? keys(selected) : []), fixed = new Set(level.words.filter(w => solved.has(w.id)).flatMap(keys));
    $('grid').querySelectorAll('.cw-cell').forEach(el => {
      el.querySelectorAll('.cw-letter-exit').forEach(ghost => ghost.remove());
      const input = el.querySelector('input');
      input.value = (cells[el.dataset.key] || '').toUpperCase();
      input.readOnly = fixed.has(el.dataset.key);
      el.classList.toggle('is-selected', active.has(el.dataset.key));
      el.classList.toggle('is-solved', fixed.has(el.dataset.key));
      input.setAttribute('aria-label', `Строка ${Number(el.dataset.key.split(',')[0]) + 1}, столбец ${Number(el.dataset.key.split(',')[1]) + 1}: ${cells[el.dataset.key] || 'пусто'}${fixed.has(el.dataset.key) ? ', верно' : ''}`);
    });
    $('play').querySelectorAll('.cw-clue').forEach(el => {
      el.classList.toggle('is-selected', Number(el.dataset.id) === selected?.id);
      el.classList.toggle('is-solved', solved.has(Number(el.dataset.id)));
      el.setAttribute('aria-pressed', String(Number(el.dataset.id) === selected?.id));
    });
    $('progress').replaceChildren(rating(stars(solved.size)), document.createTextNode(`· ${solved.size} из ${level.words.length} слов`));
    $('check').disabled = busy || solved.size === level.words.length;
  }
  function render() {
    $('title').textContent = `${level.id}. ${level.title}`;
    $('grid').replaceChildren(); $('across').replaceChildren(); $('down').replaceChildren();
    $('grid').style.setProperty('--columns', level.columns);
    const occupied = new Map();
    for (const word of level.words) {
      keys(word).forEach((k, i) => occupied.set(k, { number: i === 0 ? word.number : occupied.get(k)?.number }));
      const clue = document.createElement('button'); clue.type = 'button'; clue.className = 'cw-clue'; clue.dataset.id = word.id;
      clue.textContent = `${word.number}. ${word.clue} (${word.length})`;
      clue.addEventListener('click', () => select(word, true));
      $(word.down ? 'down' : 'across').append(clue);
    }
    for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.columns; c++) {
      const k = `${r},${c}`, cell = occupied.get(k);
      const el = document.createElement(cell ? 'div' : 'span');
      if (cell) {
        el.className = 'cw-cell'; el.dataset.key = k;
        const number = document.createElement('small'); number.textContent = cell.number || ''; el.append(number);
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'cw-cell-input'; input.dataset.key = k;
        input.autocomplete = 'off'; input.autocapitalize = 'none'; input.spellcheck = false;
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('aria-describedby', 'cw-answer-label');
        el.append(input);
        input.addEventListener('pointerdown', () => {
          if (!busy) chooseCell(k, document.activeElement === input);
        });
        input.addEventListener('focus', () => { if (!busy) { chooseCell(k); if (!input.readOnly) input.select(); } });
        input.addEventListener('click', () => { if (!input.readOnly) input.select(); });
        input.addEventListener('beforeinput', event => {
          if (!event.isComposing && event.inputType?.startsWith('delete') && event.cancelable) {
            event.preventDefault(); erase(k, event.inputType === 'deleteContentBackward');
          }
        });
        input.addEventListener('input', event => {
          if (event.isComposing) return;
          if (input.readOnly || busy) { paint(); return; }
          if (event.inputType?.startsWith('delete')) { erase(k, false); return; }
          writeText(event.data || input.value, k);
        });
        input.addEventListener('paste', event => { event.preventDefault(); writeText(event.clipboardData.getData('text'), k); });
        input.addEventListener('keydown', event => {
          if (busy || event.isComposing) return;
          const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
          if (delta) {
            event.preventDefault();
            let y = r + delta[0], x = c + delta[1];
            while (y >= 0 && y < level.rows && x >= 0 && x < level.columns) {
              const nextKey = `${y},${x}`;
              if (inputAt(nextKey)) { chooseCell(nextKey, false, delta[0] !== 0); focusCell(nextKey); break; } y += delta[0]; x += delta[1];
            }
          } else if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            erase(k, event.key === 'Backspace');
          } else if (event.key === 'Enter') { event.preventDefault(); chooseCell(k, true); focusCell(k); }
        });
      } else { el.className = 'cw-void'; el.setAttribute('aria-hidden', 'true'); }
      $('grid').append(el);
    }
    select(level.words.find(w => !solved.has(w.id)) || level.words[0]);
    lock(false);
  }
  async function open(item) {
    if (busy) return;
    busy = true; $('levels').setAttribute('aria-busy', 'true'); message('Открываем кроссворд…');
    try {
      level = await api(`/crosswords/${item.id}/${item.version}`);
      const draft = drafts.get(`${level.id}/${level.version}`);
      cells = { ...draft?.cells }; solved = new Set(draft?.solved || []);
      for (const word of level.words) if (word.solved) { solved.add(word.id); keys(word).forEach((k, i) => cells[k] = word.answer[i]); }
      busy = false; render(); $('levels').hidden = true; $('play').hidden = false;
      message('Впишите осетинские слова по русским подсказкам. Нажмите «Проверить», когда будете готовы.'); $('title').focus();
    } catch (error) { message(error.message); }
    finally { busy = false; $('levels').setAttribute('aria-busy', 'false'); }
  }
  $('letter').addEventListener('click', () => {
    if (!selected || busy) return;
    const fixed = fixedCells();
    const k = keys(selected).includes(activeKey) && !fixed.has(activeKey) ? activeKey : keys(selected).find(k => !fixed.has(k));
    if (k) writeText('ӕ', k);
  });
  $('check').addEventListener('click', async () => {
    if (busy) return;
    const previousFixed = fixedCells();
    lock(true); message('Проверяем ответы…');
    try {
      const result = await api(`/crosswords/${level.id}/${level.version}/check`, { method: 'POST', body: JSON.stringify({ cells }) });
      const newWords = level.words.filter(word => !solved.has(word.id) && result.solved.some(answer => answer.id === word.id));
      for (const word of result.solved) {
        solved.add(word.id); keys(level.words.find(w => w.id === word.id)).forEach((k, i) => cells[k] = word.answer[i]);
      }
      remember(); paint();
      celebrate(newWords, previousFixed);
      message(solved.size === level.words.length ? 'Кроссворд решён! Все три звезды ваши.' : `Верно ${solved.size} из ${level.words.length}. Остальные слова можно исправить и проверить ещё раз.`);
    } catch (error) { message(`${error.message} Ответы остались на поле, проверку можно повторить.`); }
    finally { lock(false); if (selected) select(selected); }
  });
  $('back').addEventListener('click', () => {
    if (busy) return; remember(); $('play').hidden = true; $('levels').hidden = false; cards();
    message('');
    [...$('levels').children].find((_, i) => levels[i].id === level.id)?.focus();
  });
  async function load() {
    $('retry').hidden = true;
    try { levels = await api('/crosswords'); cards(); message(''); }
    catch (error) { message(error.message); $('retry').hidden = false; }
  }
  $('retry').addEventListener('click', load);
  load();
})();
