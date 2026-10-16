(() => {
  const root = document.getElementById('matching-builder');
  if (!root) return;
  const el = id => document.getElementById(id);
  const rows = text => text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const sourcePairs = rows(el('PairsText').value);
  // Do not normalize malformed input: it must reach server validation without data loss.
  if (sourcePairs.some(row => row.split('|').length !== 2)) {
    root.querySelectorAll('section').forEach(section => section.remove());
    const warning = document.createElement('p');
    warning.className = 'form-error'; warning.setAttribute('role', 'alert');
    warning.textContent = 'В исходных парах есть строка без разделителя «|» или с лишним разделителем. Данные сохранены без изменений. Исправьте текст ниже и сохраните черновик; сервер проверит его, после чего снова откроется конструктор.';
    root.prepend(warning);
    for (const [id, title] of [['PairsText', 'Пары: слово | его пара'], ['DistractorsText', 'Отвлекающие слова (каждое с новой строки)']]) {
      const input = el(id), label = document.createElement('label'), textarea = document.createElement('textarea');
      label.className = 'editor-field-label'; label.textContent = title;
      textarea.id = id; textarea.name = input.name; textarea.value = input.value; textarea.rows = 6;
      label.append(textarea); input.replaceWith(label);
    }
    return;
  }
  const pairs = sourcePairs.map(row => {
    const [left, right] = row.split('|').map(x => x.trim());
    return { left, right };
  });
  const distractors = rows(el('DistractorsText').value);
  const invalidText = value => /[A-Za-z|\r\n]/.test(value);
  const key = value => {
    let text = value.normalize('NFC').replace(/[\u00a0\u202f]/g, ' ').replace(/[‘’ʼ`]/g, "'")
      .replace(/[“”«»]/g, '"').replace(/[‐‑‒–—−]/g, '-').replace(/[Ææ]/g, 'ӕ')
      .replace(/\s+/g, ' ').trim().replace(/[.,?!]+$/, '');
    while (text.length > 1 && /["')\]]$/.test(text)) {
      const last = text.at(-1), opening = last === ')' ? '(' : last === ']' ? '[' : last;
      if (!text.startsWith(opening)) break;
      text = text.slice(1, -1).replace(/[.,?!]+$/, '');
    }
    return text.toLocaleLowerCase('ru');
  };
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action, label) => {
    const node = element('button', text, 'builder-small-button'); node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', action); return node;
  };
  const sync = () => {
    el('PairsText').value = pairs.map(p => `${p.left} | ${p.right}`).join('\n');
    el('DistractorsText').value = distractors.join('\n');
  };
  const field = (value, onInput, placeholder, ariaLabel) => {
    const input = document.createElement('input');
    input.dataset.ossetian = ''; input.value = value; input.maxLength = 200;
    input.placeholder = placeholder; input.autocomplete = 'off';
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('input', () => onInput(input.value));
    return input;
  };
  const renderPairs = () => {
    sync();
    const container = el('builder-pairs'); container.replaceChildren();
    if (!pairs.length) container.append(element('p', 'Добавьте хотя бы две пары «слово | его пара».', 'builder-empty'));
    pairs.forEach((pair, i) => {
      const card = element('article', undefined, 'builder-line');
      const heading = element('div', undefined, 'builder-heading');
      heading.append(element('strong', `Пара ${i + 1}`));
      const actions = element('div', undefined, 'builder-actions');
      const up = button('↑', () => { [pairs[i], pairs[i - 1]] = [pairs[i - 1], pairs[i]]; renderPairs(); el('builder-pairs').children[i - 1].querySelector('input').focus(); }, `Поднять пару ${i + 1}`);
      up.disabled = i === 0;
      const down = button('↓', () => { [pairs[i], pairs[i + 1]] = [pairs[i + 1], pairs[i]]; renderPairs(); el('builder-pairs').children[i + 1].querySelector('input').focus(); }, `Опустить пару ${i + 1}`);
      down.disabled = i === pairs.length - 1;
      const remove = button('Удалить', () => { pairs.splice(i, 1); renderPairs(); el('add-pair').focus(); }, `Удалить пару ${i + 1}`);
      remove.disabled = pairs.length <= 2;
      if (remove.disabled) remove.title = 'Нужно минимум две пары';
      actions.append(up, down, remove); heading.append(actions); card.append(heading);
      const row = element('div', undefined, 'builder-pair-row');
      row.append(
        field(pair.left, value => { pairs[i].left = value; sync(); }, 'Слово', `Левое слово ${i + 1}`),
        element('span', '—', 'builder-pair-separator'),
        field(pair.right, value => { pairs[i].right = value; sync(); }, 'Его пара', `Правая часть пары ${i + 1}`));
      card.append(row); container.append(card);
    });
  };
  const renderDistractors = () => {
    sync();
    const container = el('builder-distractors'); container.replaceChildren();
    if (!distractors.length) container.append(element('p', 'Отвлекающие слова необязательны.', 'builder-empty'));
    distractors.forEach((value, i) => {
      const row = element('div', undefined, 'builder-answer-row');
      const label = element('label', `Слово ${i + 1}`);
      label.append(field(value, next => { distractors[i] = next; sync(); }, 'Отвлекающее слово', `Отвлекающее слово ${i + 1}`));
      row.append(label);
      const remove = button('×', () => { distractors.splice(i, 1); renderDistractors(); el('add-distractor').focus(); }, `Удалить отвлекающее слово ${i + 1}`);
      remove.disabled = false; row.append(remove); container.append(row);
    });
  };
  el('add-pair').addEventListener('click', () => {
    pairs.push({ left: '', right: '' }); renderPairs();
    el('builder-pairs').lastElementChild.querySelector('input').focus();
  });
  el('add-distractor').addEventListener('click', () => {
    distractors.push(''); renderDistractors();
    el('builder-distractors').lastElementChild.querySelector('input').focus();
  });
  root.closest('form').addEventListener('submit', sync);
  renderPairs(); renderDistractors();
})();
