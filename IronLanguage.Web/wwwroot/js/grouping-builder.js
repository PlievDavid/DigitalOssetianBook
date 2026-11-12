(() => {
  const root = document.getElementById('grouping-builder');
  if (!root) return;
  const el = id => document.getElementById(id);
  const rows = text => text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const groupsInput = el('GroupingGroupsText');
  const wordsInput = el('GroupingWordsText');
  const status = el('grouping-builder-status');

  // Malformed text is shown as plain textareas and reaches server validation unchanged.
  const groups = rows(groupsInput.value);
  const sourceWords = rows(wordsInput.value);
  const malformed = sourceWords.some(row => {
    const parts = row.split('|').map(part => part.trim());
    if (parts.length !== 2 || !/^[1-9]\d*$/.test(parts[1])) return true;
    const group = Number(parts[1]);
    return !Number.isSafeInteger(group) || group > groups.length;
  });
  if (malformed) {
    for (const [input, title] of [[groupsInput, 'Группы (название каждой с новой строки)'], [wordsInput, 'Слова: слово | номер группы']]) {
      const label = document.createElement('label');
      const textarea = document.createElement('textarea');
      label.className = 'editor-field-label';
      label.textContent = title;
      textarea.id = input.id;
      textarea.name = input.name;
      textarea.value = input.value;
      textarea.rows = 8;
      input.replaceWith(label);
      label.append(textarea);
    }
    const warning = document.createElement('p');
    warning.className = 'form-error';
    warning.setAttribute('role', 'alert');
    warning.textContent = 'В сохранённых словах есть строка без разделителя «|», с лишним разделителем или с неверным номером группы. Данные не изменены: исправьте текст ниже и сохраните черновик, после проверки сервер снова откроет конструктор.';
    root.prepend(warning);
    return;
  }

  const words = sourceWords.map(row => {
    const [text, number] = row.split('|').map(part => part.trim());
    return { text, group: Number.parseInt(number, 10) - 1 };
  });
  if (!groups.length) groups.push('', '');

  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action, label) => {
    const node = element('button', text, 'builder-small-button');
    node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', action);
    return node;
  };
  const field = (value, onInput, placeholder, ariaLabel, maxLength) => {
    const input = document.createElement('input');
    input.dataset.ossetian = '';
    input.value = value;
    input.maxLength = maxLength;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('input', () => onInput(input.value));
    return input;
  };
  const sync = () => {
    groupsInput.value = groups.map(title => title.trim()).join('\n');
    wordsInput.value = words.map(word => `${word.text.trim()} | ${word.group + 1}`).join('\n');
  };
  const groupName = index => groups[index]?.trim() || `Группа ${index + 1}`;
  const refreshGroupOptions = () => {
    root.querySelectorAll('select[data-group-select]').forEach(select => {
      [...select.options].forEach((option, index) => {
        option.textContent = `${index + 1}. ${groupName(index)}`;
      });
    });
  };
  const refreshLimits = () => {
    const addGroup = el('grouping-add-group');
    const addWord = el('grouping-add-word');
    addGroup.disabled = groups.length >= 6;
    addGroup.title = addGroup.disabled ? 'Можно добавить не больше шести групп' : '';
    addWord.disabled = words.length >= 30;
    addWord.title = addWord.disabled ? 'Можно добавить не больше тридцати слов' : '';
  };

  const renderGroups = () => {
    sync();
    const container = el('grouping-groups');
    container.replaceChildren();
    groups.forEach((title, index) => {
      const card = element('article', undefined, 'builder-line editor-grouping-group');
      const heading = element('div', undefined, 'builder-heading');
      heading.append(element('strong', `Группа ${index + 1}`));
      const actions = element('div', undefined, 'builder-actions');
      const remove = button('Удалить', () => {
        if (groups.length <= 2) return;
        groups.splice(index, 1);
        let moved = false;
        words.forEach(word => {
          if (word.group === index) { word.group = 0; moved = true; }
          else if (word.group > index) word.group--;
        });
        status.textContent = moved ? 'Слова из удалённой группы перенесены в первую группу. Проверьте их назначение.' : '';
        renderGroups();
        renderWords();
        el('grouping-add-group').focus();
      }, `Удалить группу ${index + 1}`);
      remove.disabled = groups.length <= 2;
      if (remove.disabled) remove.title = 'Нужно минимум две группы';
      actions.append(remove);
      heading.append(actions);
      card.append(heading);
      card.append(field(title, value => { groups[index] = value; sync(); refreshGroupOptions(); }, 'Например: Существительные', `Название группы ${index + 1}`, 100));
      container.append(card);
    });
    refreshLimits();
  };

  const renderWords = () => {
    sync();
    const container = el('grouping-words');
    container.replaceChildren();
    if (!words.length) container.append(element('p', 'Добавьте слова и выберите для каждого группу.', 'builder-empty'));
    words.forEach((word, index) => {
      const card = element('article', undefined, 'builder-line grouping-word');
      const heading = element('div', undefined, 'builder-heading');
      heading.append(element('strong', `Слово ${index + 1}`));
      const actions = element('div', undefined, 'builder-actions');
      actions.append(button('Удалить', () => {
        words.splice(index, 1);
        renderWords();
        el('grouping-add-word').focus();
      }, `Удалить слово ${index + 1}`));
      heading.append(actions);
      card.append(heading);

      const row = element('div', undefined, 'grouping-word-row');
      const text = field(word.text, value => { word.text = value; sync(); }, 'Слово', `Слово ${index + 1}`, 200);
      const select = document.createElement('select');
      select.dataset.groupSelect = '';
      select.setAttribute('aria-label', `Группа для слова ${index + 1}`);
      groups.forEach((_, groupIndex) => {
        const option = document.createElement('option');
        option.value = String(groupIndex);
        option.textContent = `${groupIndex + 1}. ${groupName(groupIndex)}`;
        select.append(option);
      });
      select.value = String(word.group);
      select.addEventListener('change', () => { word.group = Number.parseInt(select.value, 10); sync(); });
      row.append(text, select);
      card.append(row);
      container.append(card);
    });
    refreshLimits();
  };

  el('grouping-add-group').addEventListener('click', () => {
    if (groups.length >= 6) return;
    groups.push('');
    status.textContent = '';
    renderGroups();
    renderWords();
    el('grouping-groups').lastElementChild.querySelector('input').focus();
  });
  el('grouping-add-word').addEventListener('click', () => {
    if (words.length >= 30) return;
    words.push({ text: '', group: 0 });
    status.textContent = '';
    renderWords();
    el('grouping-words').lastElementChild.querySelector('input').focus();
  });
  root.closest('form').addEventListener('submit', sync);
  renderGroups();
  renderWords();
})();
