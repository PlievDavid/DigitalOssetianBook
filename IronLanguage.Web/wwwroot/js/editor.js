(() => {
  const tabs = document.querySelectorAll('[data-editor-tab]');
  const filter = document.getElementById('editor-kind-filter');
  if (tabs.length && filter) {
    let active = 'drafts';
    const refresh = () => {
      tabs.forEach(tab => { const selected = tab.dataset.editorTab === active; tab.classList.toggle('is-active', selected); tab.setAttribute('aria-selected', String(selected)); });
      for (const group of ['drafts', 'published', 'archived']) {
        const panel = document.getElementById(`editor-${group}`); panel.hidden = group !== active;
        let visible = 0;
        panel.querySelectorAll('.editor-item').forEach(item => { item.hidden = filter.value !== 'all' && item.dataset.kind !== filter.value; if (!item.hidden) visible++; });
        panel.querySelector('.editor-empty').hidden = visible > 0;
      }
    };
    tabs.forEach(tab => tab.addEventListener('click', () => { active = tab.dataset.editorTab; refresh(); }));
    filter.addEventListener('change', refresh); refresh();
    document.querySelectorAll('form[data-confirm]').forEach(form => form.addEventListener('submit', event => {
      if (!window.confirm(form.dataset.confirm)) event.preventDefault();
    }));
  }

  const formRoot = document.getElementById('editor-form-app');
  if (!formRoot) return;
  const kind = formRoot.dataset.kind;
  const words = JSON.parse(document.getElementById('editor-words-data').textContent);
  const byId = new Map(words.map(word => [word.id, word]));
  const wordKey = text => text.trim().replaceAll('æ', 'ӕ').replaceAll('Æ', 'Ӕ').replace(/\u0301/g, '').normalize('NFC').toLocaleLowerCase('ru');
  const fileInput = document.getElementById('editor-audio');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0], label = document.getElementById('editor-file-name'), player = document.getElementById('editor-audio-preview');
      label.textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} МБ` : 'Файл не выбран';
      if (file) { player.src = URL.createObjectURL(file); player.hidden = false; }
    });
  }

  if (kind === 'audio' || kind === 'translation') {
    const search = document.getElementById('word-search'), results = document.getElementById('word-results');
    const selectedEl = document.getElementById('selected-words'), hidden = document.getElementById('WordIdsCsv');
    const selected = new Set((hidden.value || '').split(',').filter(Boolean));
    const render = () => {
      hidden.value = [...selected].join(','); selectedEl.replaceChildren(); results.replaceChildren();
      for (const id of selected) {
        const word = byId.get(id); if (!word) continue;
        const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'editor-word-chip';
        chip.textContent = `${word.ossetian} ×`; chip.setAttribute('aria-label', `Убрать ${word.ossetian}`);
        chip.addEventListener('click', () => { selected.delete(id); render(); }); selectedEl.append(chip);
      }
      const query = search.value.trim().toLocaleLowerCase();
      if (!query) return;
      words.filter(word => !selected.has(word.id) && `${word.ossetian} ${word.russian}`.toLocaleLowerCase().includes(query)).slice(0, 8).forEach(word => {
        const item = document.createElement('button'); item.type = 'button'; item.textContent = `${word.ossetian} — ${word.russian}`;
        item.addEventListener('click', () => { selected.add(word.id); search.value = ''; render(); search.focus(); }); results.append(item);
      });
    };
    search.addEventListener('input', render); render();
  }

  if (kind === 'book') {
    const hidden = document.getElementById('ChaptersJson'), container = document.getElementById('editor-chapters');
    let chapters; try { chapters = JSON.parse(hidden.value || '[]'); } catch { chapters = []; }
    if (!Array.isArray(chapters)) chapters = [];
    const tokenize = text => Array.from(text.matchAll(/\s+|[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*|[^\s\p{L}\p{M}\p{N}]+/gu), match => ({ text: match[0], wordId: null }));
    const blank = () => ({ id: crypto.randomUUID(), number: chapters.length + 1, title: '', tokens: [] });
    if (chapters.length === 0) chapters.push(blank());
    const sync = () => { chapters.forEach((chapter, index) => { chapter.number = index + 1; }); hidden.value = JSON.stringify(chapters); };
    const render = () => {
      sync(); container.replaceChildren();
      chapters.forEach((chapter, index) => {
        const section = document.createElement('section'); section.className = 'editor-chapter';
        const header = document.createElement('div'); header.className = 'editor-chapter-header';
        const h = document.createElement('h3'); h.textContent = `Глава ${index + 1}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить главу'; remove.disabled = chapters.length === 1;
        remove.addEventListener('click', () => { chapters.splice(index, 1); render(); }); header.append(h, remove);
        const titleLabel = document.createElement('label'); titleLabel.textContent = 'Название главы';
        const title = document.createElement('input'); title.value = chapter.title || ''; title.required = true;
        title.addEventListener('input', () => { chapter.title = title.value; sync(); }); titleLabel.append(title);
        const textLabel = document.createElement('label'); textLabel.textContent = 'Текст главы';
        const textarea = document.createElement('textarea'); textarea.rows = 8; textarea.required = true;
        textarea.value = (chapter.tokens || []).map(token => token.text).join('');
        textarea.addEventListener('input', () => {
          const next = tokenize(textarea.value);
          next.forEach((token, i) => { if (chapter.tokens[i]?.text === token.text) token.wordId = chapter.tokens[i].wordId || null; });
          chapter.tokens = next; sync();
        });
        textLabel.append(textarea);
        section.append(header, titleLabel, textLabel); container.append(section);
      });
    };
    document.getElementById('add-chapter').addEventListener('click', () => { chapters.push(blank()); render(); });
    formRoot.querySelector('form').addEventListener('submit', sync);
    render();
  }
})();
