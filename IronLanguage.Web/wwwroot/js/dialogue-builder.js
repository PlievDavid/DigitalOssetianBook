(() => {
  const root = document.getElementById('dialogue-builder');
  if (!root) return;
  const el = id => document.getElementById(id);
  const rows = text => text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const characters = rows(el('CharactersText').value).map(row => {
    const [name, color] = row.split('|').map(x => x.trim());
    return { name, color: color || '#203f34' };
  });
  const turns = new Map(rows(el('TurnsText').value).map(row => {
    const [number, kind, references, options, threshold, skip] = row.split('|').map(x => x.trim());
    return [Number(number), { kind, references: (references || '').split(';').map(x => x.trim()).filter(Boolean),
      options: (options || '').split(';').map(x => x.trim()).filter(Boolean), threshold: threshold || '2', skippable: /^(да|yes|true)$/i.test(skip) }];
  }));
  const lines = rows(el('LinesText').value).map((row, i) => {
    const colon = row.indexOf(':');
    return { speaker: row.slice(0, colon).trim(), text: row.slice(colon + 1).trim(), turn: turns.get(i + 1) };
  });
  const student = name => name.toLocaleLowerCase('ru') === 'ученик';
  // Match the server's comparison when locating the correct option in existing material.
  const answerKey = value => {
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
    el('CharactersText').value = characters.map(c => `${c.name} | ${c.color}`).join('\n');
    el('LinesText').value = lines.map(line => `${line.speaker}: ${line.text}`).join('\n');
    el('TurnsText').value = lines.flatMap((line, i) => line.turn ? [
      `${i + 1} | ${line.turn.kind} | ${line.turn.references.join('; ')} | ${line.turn.options.join('; ')} | ${line.turn.threshold} | ${line.turn.skippable ? 'да' : 'нет'}`
    ] : []).join('\n');
  };
  const invalidText = value => /[A-Za-z|\r\n]/.test(value);
  let characterIndex = -1, lineIndex = -1, opener;
  const open = (dialog, trigger) => { opener = trigger; dialog.showModal(); };
  for (const dialog of [el('character-dialog'), el('line-dialog')]) {
    // Modal drafts are independent of the material form, including native validation.
    dialog.querySelectorAll('input, select, textarea').forEach(control => control.setAttribute('form', 'dialogue-modal-fields'));
    dialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
    // Enter in a modal must never submit the outer draft form.
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button, input, select, textarea, [tabindex]')]
          .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox' && event.target.type !== 'radio') {
        event.preventDefault(); el(dialog.id === 'character-dialog' ? 'save-character' : 'save-line').click();
      }
    });
  }
  const editCharacter = (index, trigger) => {
    characterIndex = index;
    el('character-name').value = characters[index]?.name || '';
    el('character-color').value = characters[index]?.color || '#203f34';
    el('character-error').textContent = '';
    el('character-dialog-title').textContent = index < 0 ? 'Добавить персонажа' : 'Настройки персонажа';
    el('save-character').textContent = index < 0 ? 'Добавить персонажа' : 'Сохранить изменения';
    open(el('character-dialog'), trigger); el('character-name').focus();
  };
  const render = () => {
    sync();
    const cast = el('builder-characters'), conversation = el('builder-lines');
    cast.replaceChildren(); conversation.replaceChildren();
    if (!characters.length) cast.append(element('p', 'Здесь появятся персонажи диалога.', 'builder-empty'));
    characters.forEach((c, i) => {
      const card = element('div', undefined, 'builder-character');
      const dot = element('span', c.name.slice(0, 1), 'builder-avatar'); dot.style.backgroundColor = c.color;
      const actions = element('div', undefined, 'builder-actions');
      actions.append(button('Настроить', event => editCharacter(i, event.currentTarget), `Настроить персонажа ${c.name}`));
      const remove = button('Удалить', () => { characters.splice(i, 1); render(); el('add-character').focus(); }, `Удалить персонажа ${c.name}`);
      remove.disabled = lines.some(l => l.speaker === c.name);
      if (remove.disabled) remove.title = 'Сначала удалите или измените реплики этого персонажа';
      actions.append(remove); card.append(dot, element('strong', c.name), actions); cast.append(card);
    });
    if (!lines.length) conversation.append(element('p', 'Добавьте первую реплику собеседника или ответ ученика.', 'builder-empty'));
    lines.forEach((line, i) => {
      const card = element('article', undefined, `builder-line${student(line.speaker) ? ' is-student' : ''}`);
      const heading = element('div', undefined, 'builder-heading');
      heading.append(element('strong', `${i + 1}. ${line.speaker}`));
      const actions = element('div', undefined, 'builder-actions');
      actions.append(button('Изменить', event => editLine(i, event.currentTarget), `Изменить реплику ${i + 1}`));
      const move = delta => { [lines[i], lines[i + delta]] = [lines[i + delta], lines[i]]; render();
        el('builder-lines').children[i + delta].querySelector('button').focus(); };
      const up = button('↑', () => move(-1), `Поднять реплику ${i + 1}`); up.disabled = i === 0;
      const down = button('↓', () => move(1), `Опустить реплику ${i + 1}`); down.disabled = i === lines.length - 1;
      actions.append(up, down, button('Удалить', () => { lines.splice(i, 1); render(); el('add-line').focus(); }, `Удалить реплику ${i + 1}`));
      heading.append(actions); card.append(heading);
      if (line.text) card.append(element('p', line.text));
      if (line.turn) {
        card.append(element('p', line.turn.kind === 'choice' ? 'Выбор из вариантов' : 'Ввод текста', 'field-help'));
        const answers = element('ul', undefined, 'builder-answer-preview');
        (line.turn.kind === 'choice' ? line.turn.options : line.turn.references).forEach(answer => {
          answers.append(element('li', `${line.turn.references.includes(answer) ? '✓ ' : ''}${answer}`));
        });
        card.append(answers);
      }
      conversation.append(card);
    });
  };
  el('add-character').addEventListener('click', event => editCharacter(-1, event.currentTarget));
  el('save-character').addEventListener('click', () => {
    const name = el('character-name').value.trim();
    const error = !name ? 'Укажите имя персонажа.' : invalidText(name) || /[:;]/.test(name) ? 'Используйте имя без латинских букв, двоеточия и разделителей.' :
      student(name) ? 'Ученик уже добавлен. Выберите его при создании реплики.' :
      characters.some((c, i) => i !== characterIndex && c.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')) ? 'Персонаж с таким именем уже есть.' : '';
    el('character-error').textContent = error;
    if (error) { el('character-name').focus(); return; }
    const c = { name, color: el('character-color').value };
    if (characterIndex < 0) characters.push(c);
    else { const old = characters[characterIndex].name; lines.forEach(l => { if (l.speaker === old) l.speaker = name; }); characters[characterIndex] = c; }
    render(); el('character-dialog').close(); el('add-character').focus();
  });

  let choiceAnswers = [], freeAnswers = [], correct = 0;
  const choice = () => el('line-kind').value === 'choice';
  const renderAnswers = () => {
    const answers = choice() ? choiceAnswers : freeAnswers;
    const container = el('line-answers'); container.replaceChildren();
    el('answer-help').textContent = choice() ? 'Добавьте 2–4 варианта и отметьте один правильный.' : 'Добавьте 1–3 допустимые формулировки ответа.';
    el('add-answer').textContent = choice() ? 'Добавить вариант' : 'Добавить допустимый ответ';
    el('add-answer').disabled = answers.length >= (choice() ? 4 : 3);
    answers.forEach((answer, i) => {
      const row = element('div', undefined, 'builder-answer-row');
      if (choice()) {
        const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'builder-correct'; radio.checked = i === correct;
        radio.setAttribute('form', 'dialogue-modal-fields');
        radio.setAttribute('aria-label', `Вариант ${i + 1} правильный`);
        radio.addEventListener('change', () => { correct = i; }); row.append(radio);
      }
      const label = element('label', choice() ? `Вариант ${i + 1}` : `Допустимый ответ ${i + 1}`);
      const input = document.createElement('input'); input.value = answer; input.maxLength = choice() ? 200 : 300;
      input.setAttribute('form', 'dialogue-modal-fields');
      input.addEventListener('input', () => { answers[i] = input.value; }); label.append(input); row.append(label);
      const remove = button('×', () => {
        answers.splice(i, 1); if (correct === i) correct = 0; else if (correct > i) correct--;
        renderAnswers(); el('add-answer').focus();
      }, `Удалить ответ ${i + 1}`);
      remove.disabled = answers.length <= (choice() ? 2 : 1); row.append(remove); container.append(row);
    });
  };
  const updateSpeaker = () => { const isStudent = student(el('line-speaker').value);
    el('student-settings').hidden = !isStudent;
    el('line-text-label').firstChild.textContent = isStudent ? 'Текст реплики ученика (необязательно)' : 'Текст реплики';
  };
  const editLine = (index, trigger) => {
    lineIndex = index;
    const line = lines[index], turn = line?.turn;
    const select = el('line-speaker'); select.replaceChildren();
    [...characters.map(c => c.name), 'Ученик'].forEach(name => { const option = element('option', name); option.value = name; select.append(option); });
    select.value = line?.speaker || characters[0]?.name || 'Ученик';
    el('line-text').value = line?.text || '';
    el('line-kind').value = turn?.kind || 'choice';
    choiceAnswers = turn?.kind === 'choice' ? [...turn.options] : ['', ''];
    freeAnswers = turn?.kind === 'free' ? [...turn.references] : [''];
    correct = Math.max(0, choiceAnswers.findIndex(answer => turn?.references[0] !== undefined && answerKey(answer) === answerKey(turn.references[0])));
    el('line-threshold').value = turn?.threshold || '2'; el('line-skippable').checked = turn?.skippable || false;
    el('line-error').textContent = '';
    el('line-dialog-title').textContent = index < 0 ? 'Добавить реплику' : `Реплика ${index + 1}`;
    el('save-line').textContent = index < 0 ? 'Добавить реплику' : 'Сохранить изменения';
    updateSpeaker(); renderAnswers(); open(el('line-dialog'), trigger); select.focus();
  };
  el('add-line').addEventListener('click', event => editLine(-1, event.currentTarget));
  el('line-speaker').addEventListener('change', updateSpeaker);
  el('line-kind').addEventListener('change', renderAnswers);
  el('add-answer').addEventListener('click', () => { (choice() ? choiceAnswers : freeAnswers).push(''); renderAnswers();
    el('line-answers').lastElementChild.querySelector('label input').focus(); });
  el('save-line').addEventListener('click', () => {
    const speaker = el('line-speaker').value, text = el('line-text').value.trim(), isStudent = student(speaker);
    const answers = (choice() ? choiceAnswers : freeAnswers).map(x => x.trim());
    const threshold = Number(el('line-threshold').value);
    let error = !text && !isStudent ? 'Введите текст реплики.' : invalidText(text) ? 'Реплика должна быть на одной строке, без латинских букв и разделителя |.' : '';
    if (isStudent && !error) {
      if (answers.some(x => !x || invalidText(x) || x.includes(';'))) error = 'Заполните ответы без латинских букв и разделителей.';
      else if (new Set(answers.map(answerKey)).size !== answers.length) error = 'Варианты ответа должны различаться.';
      else if (!Number.isInteger(threshold) || threshold < 1 || threshold > 2147483647) error = 'Укажите номер попытки от 1.';
    }
    el('line-error').textContent = error; if (error) return;
    const line = { speaker, text, turn: isStudent ? { kind: el('line-kind').value,
      references: choice() ? [answers[correct]] : answers, options: choice() ? answers : [], threshold: String(threshold), skippable: el('line-skippable').checked } : null };
    if (lineIndex < 0) lines.push(line); else lines[lineIndex] = line;
    render(); el('line-dialog').close(); el('add-line').focus();
  });
  root.closest('form').addEventListener('submit', event => {
    if (el('character-dialog').open || el('line-dialog').open) { event.preventDefault(); return; }
    sync();
  });
  render();
})();
