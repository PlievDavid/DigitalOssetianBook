(() => {
  'use strict';
  const $ = id => document.getElementById(`cw-${id}`);
  const api = window.AdamApi;
  const drafts = new Map();
  let levels = [], level = null, cells = {}, solved = new Set(), selected = null, busy = false;
  const key = (w, i) => `${w.row + (w.down ? i : 0)},${w.column + (w.down ? 0 : i)}`;
  const keys = w => Array.from({ length: w.length }, (_, i) => key(w, i));
  const normalize = text => text.toLowerCase().replace(/æ/g, 'ӕ').replace(/\u0301/g, '').normalize('NFC');
  const stars = count => count === 0 ? 0 : count === level.words.length ? 3 : count * 2 >= level.words.length ? 2 : 1;
  function message(text) { $('status').textContent = text; }
  function rating(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
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
      button.className = 'cw-card';
      button.innerHTML = '<span class="cw-card-top"></span><strong></strong><span class="cw-card-count"></span><span class="cw-stars"></span>';
      button.querySelector('.cw-card-top').textContent = `КРОССВОРД ${String(item.id).padStart(2, '0')}`;
      button.querySelector('strong').textContent = item.title;
      button.querySelector('.cw-card-count').textContent = `${item.solved} из ${item.total} слов`;
      const star = button.querySelector('.cw-stars'); star.textContent = rating(item.stars); star.setAttribute('aria-label', `${item.stars} из 3 звёзд`);
      button.addEventListener('click', () => open(item));
      $('levels').append(button);
    }
  }
  function lock(value) {
    busy = value;
    $('play').setAttribute('aria-busy', String(value));
    $('check').disabled = value || solved.size === level?.words.length;
    $('back').disabled = value;
    $('entry').querySelectorAll('input,button').forEach(el => el.disabled = value || !!selected && solved.has(selected.id));
    $('grid').querySelectorAll('button').forEach(el => el.disabled = value);
    $('play').querySelectorAll('.cw-clue').forEach(el => el.disabled = value);
  }
  function select(word, focus = false) {
    if (busy) return;
    selected = word;
    $('answer-label').textContent = `${word.number}. ${word.clue} · ${word.down ? 'по вертикали' : 'по горизонтали'} · ${word.length} букв`;
    $('answer').maxLength = word.length;
    $('answer').value = keys(word).map(k => cells[k] || ' ').join('').trimEnd();
    $('answer').placeholder = `${word.length} букв по-осетински`;
    $('entry').querySelectorAll('input,button').forEach(el => el.disabled = solved.has(word.id));
    paint();
    if (focus && !solved.has(word.id)) $('answer').focus();
  }
  function paint() {
    const active = new Set(selected ? keys(selected) : []), fixed = new Set(level.words.filter(w => solved.has(w.id)).flatMap(keys));
    $('grid').querySelectorAll('.cw-cell').forEach(el => {
      el.querySelector('.cw-cell-letter').textContent = (cells[el.dataset.key] || '').toUpperCase();
      el.classList.toggle('is-selected', active.has(el.dataset.key));
      el.classList.toggle('is-solved', fixed.has(el.dataset.key));
      el.setAttribute('aria-label', `Строка ${Number(el.dataset.key.split(',')[0]) + 1}, столбец ${Number(el.dataset.key.split(',')[1]) + 1}: ${cells[el.dataset.key] || 'пусто'}${fixed.has(el.dataset.key) ? ', верно' : ''}`);
    });
    $('play').querySelectorAll('.cw-clue').forEach(el => {
      el.classList.toggle('is-selected', Number(el.dataset.id) === selected?.id);
      el.classList.toggle('is-solved', solved.has(Number(el.dataset.id)));
      el.setAttribute('aria-pressed', String(Number(el.dataset.id) === selected?.id));
    });
    $('progress').textContent = `${rating(stars(solved.size))} · ${solved.size} из ${level.words.length} слов`;
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
      const el = document.createElement(cell ? 'button' : 'span');
      if (cell) {
        el.type = 'button'; el.className = 'cw-cell'; el.dataset.key = k;
        const number = document.createElement('small'); number.textContent = cell.number || ''; el.append(number);
        const letter = document.createElement('span'); letter.className = 'cw-cell-letter'; el.append(letter);
        el.addEventListener('click', () => {
          const choices = level.words.filter(w => keys(w).includes(k));
          select(choices[(choices.indexOf(selected) + 1) % choices.length]);
        });
        el.addEventListener('keydown', event => {
          const delta = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
          if (delta) {
            event.preventDefault();
            let y = r + delta[0], x = c + delta[1];
            while (y >= 0 && y < level.rows && x >= 0 && x < level.columns) {
              const next = $('grid').querySelector(`[data-key="${y},${x}"]`);
              if (next) { next.focus(); next.click(); break; } y += delta[0]; x += delta[1];
            }
          } else if (event.key === 'Enter') { event.preventDefault(); el.click(); if (!solved.has(selected.id)) $('answer').focus(); }
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
      message('Переведите подсказки на осетинский. Проверяйте ответы, когда будете готовы.'); $('title').focus();
    } catch (error) { message(error.message); }
    finally { busy = false; $('levels').setAttribute('aria-busy', 'false'); }
  }
  $('entry').addEventListener('submit', event => {
    event.preventDefault(); if (busy || !selected || solved.has(selected.id)) return;
    const answer = normalize($('answer').value.trim());
    if (answer.length !== selected.length || !/^[а-яёӕ]+$/u.test(answer)) { message(`Нужно ${selected.length} букв осетинского слова.`); return; }
    const fixed = new Set(level.words.filter(w => solved.has(w.id)).flatMap(keys));
    if (keys(selected).some((k, i) => fixed.has(k) && cells[k] !== answer[i])) { message('Ответ расходится с уже проверенным словом на пересечении.'); return; }
    keys(selected).forEach((k, i) => cells[k] = answer[i]); remember(); paint();
    message('Слово вписано. Нажмите «Проверить», чтобы зачесть верные ответы.');
  });
  $('letter').addEventListener('click', () => {
    const input = $('answer'); input.setRangeText('ӕ', input.selectionStart, input.selectionEnd, 'end'); input.focus();
  });
  $('check').addEventListener('click', async () => {
    if (busy) return;
    lock(true); message('Проверяем ответы…');
    try {
      const result = await api(`/crosswords/${level.id}/${level.version}/check`, { method: 'POST', body: JSON.stringify({ cells }) });
      for (const word of result.solved) {
        solved.add(word.id); keys(level.words.find(w => w.id === word.id)).forEach((k, i) => cells[k] = word.answer[i]);
      }
      remember(); paint();
      message(solved.size === level.words.length ? 'Кроссворд решён! Все три звезды ваши.' : `Верно ${solved.size} из ${level.words.length}. Остальные слова можно исправить и проверить ещё раз.`);
    } catch (error) { message(`${error.message} Ответы остались на поле, проверку можно повторить.`); }
    finally { lock(false); if (selected) select(selected); }
  });
  $('back').addEventListener('click', () => {
    if (busy) return; remember(); $('play').hidden = true; $('levels').hidden = false; cards();
    message('Выберите любой кроссворд. Проверенные слова отмечены звёздами.');
    [...$('levels').children].find((_, i) => levels[i].id === level.id)?.focus();
  });
  async function load() {
    $('retry').hidden = true;
    try { levels = await api('/crosswords'); cards(); message('10 тем — начните с той, что вам интереснее.'); }
    catch (error) { message(error.message); $('retry').hidden = false; }
  }
  $('retry').addEventListener('click', load);
  $('guest').hidden = !!window.AdamAuthenticated;
  load();
})();
