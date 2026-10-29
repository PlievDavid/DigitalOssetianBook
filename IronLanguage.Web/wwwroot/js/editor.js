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

  if (kind === 'picture') {
    const section = document.getElementById('picture-editor');
    const mode = document.getElementById('picture-mode');
    const updateMode = () => {
      const free = mode.value === 'free';
      document.getElementById('picture-distractors-block').hidden = free;
      document.getElementById('picture-mode-hint').hidden = !free;
      section.dataset.mode = mode.value;
    };
    mode.addEventListener('change', updateMode); updateMode();
    const imageInput = document.getElementById('picture-image');
    const imagePreview = document.getElementById('picture-image-preview');
    const existingImage = imagePreview.getAttribute('src');
    let imageUrl = null;
    imageInput.addEventListener('change', () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const image = imageInput.files[0];
      imageUrl = image ? URL.createObjectURL(image) : null;
      document.getElementById('picture-file-name').textContent = image
        ? `${image.name} · ${(image.size / 1024 / 1024).toFixed(1)} МБ`
        : existingImage ? 'Текущая картинка сохранена' : 'Файл не выбран';
      if (imageUrl || existingImage) imagePreview.src = imageUrl || existingImage;
      else imagePreview.removeAttribute('src');
      imagePreview.hidden = !imageUrl && !existingImage;
    });
  }

  const coverInput = document.getElementById('editor-cover');
  if (coverInput) {
    const coverLabel = document.getElementById('editor-cover-name');
    const coverPreview = document.getElementById('editor-cover-preview');
    const existingCover = coverPreview.getAttribute('src');
    let coverUrl = null;
    coverInput.addEventListener('change', () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl);
      const cover = coverInput.files[0];
      coverUrl = cover ? URL.createObjectURL(cover) : null;
      coverLabel.textContent = cover
        ? `${cover.name} · ${(cover.size / 1024 / 1024).toFixed(1)} МБ`
        : existingCover ? 'Текущая обложка сохранена' : 'Файл не выбран';
      if (coverUrl || existingCover) coverPreview.src = coverUrl || existingCover;
      else coverPreview.removeAttribute('src');
      coverPreview.hidden = !coverUrl && !existingCover;
    });
  }

  if (kind === 'audio' || kind === 'translation' || kind === 'matching' || kind === 'picture' || kind === 'grammar') {
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

  if (kind === 'audio') {
    const tokensArea = document.getElementById('TokensText'), hidden = document.getElementById('DistractorsText');
    const container = document.getElementById('editor-steps');
    let pairs = (hidden.value || '').split('\n').map(line => line.split('|').map(part => part.trim()));
    const wordsOf = () => (tokensArea.value || '').split('\n').map(word => word.trim()).filter(Boolean);
    const sync = () => {
      const words = wordsOf();
      hidden.value = words.map((_, i) => (pairs[i] || []).join(' | ')).join('\n');
    };
    const render = () => {
      sync(); container.replaceChildren();
      wordsOf().forEach((word, i) => {
        const row = document.createElement('div'); row.className = 'editor-step-row';
        const number = document.createElement('span'); number.className = 'editor-step-number'; number.textContent = `${i + 1}.`;
        const correct = document.createElement('span'); correct.className = 'editor-step-word'; correct.textContent = word;
        row.append(number, correct);
        for (let variant = 0; variant < 2; variant++) {
          const input = document.createElement('input'); input.type = 'text'; input.autocomplete = 'off'; input.dataset.ossetian = '';
          input.placeholder = `Отвлекающее слово ${variant + 1}`; input.value = (pairs[i] || [])[variant] || '';
          input.setAttribute('aria-label', `Шаг ${i + 1}, ${word}: отвлекающий вариант ${variant + 1}`);
          input.addEventListener('input', () => {
            if (!pairs[i]) pairs[i] = ['', ''];
            pairs[i][variant] = input.value; sync();
          });
          row.append(input);
        }
        container.append(row);
      });
      if (!wordsOf().length) { const empty = document.createElement('p'); empty.className = 'field-help'; empty.textContent = 'Добавьте слова предложения — варианты появятся здесь.'; container.append(empty); }
    };
    tokensArea.addEventListener('input', render);
    formRoot.querySelector('form').addEventListener('submit', sync);
    render();
  }

  if (kind === 'book') {
    document.getElementById('clear-legacy-translation')?.addEventListener('click', event => {
      document.getElementById('LiteraryTranslation').value = '';
      event.currentTarget.closest('details').hidden = true;
    });
    const hidden = document.getElementById('ChaptersJson'), container = document.getElementById('editor-chapters');
    let chapters; try { chapters = JSON.parse(hidden.value || '[]'); } catch { chapters = []; }
    if (!Array.isArray(chapters)) chapters = [];
    const tokenize = text => Array.from(text.matchAll(/\s+|[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*|[^\s\p{L}\p{M}\p{N}]+/gu), match => ({ text: match[0], wordId: null }));
    const blank = () => ({ id: crypto.randomUUID(), number: chapters.length + 1, title: '', tokens: [] });
    if (chapters.length === 0) chapters.push(blank());
    const illustrationInput = document.getElementById('IllustrationsJson');
    const illustrationChapter = document.getElementById('IllustrationChapterId');
    let illustrations; try { illustrations = JSON.parse(illustrationInput.value || '[]'); } catch { illustrations = []; }
    const sync = () => {
      chapters.forEach((chapter, index) => { chapter.number = index + 1; }); hidden.value = JSON.stringify(chapters);
      illustrationInput.value = JSON.stringify(illustrations);
      const selected = illustrationChapter.value;
      illustrationChapter.replaceChildren();
      chapters.forEach((chapter, index) => {
        const option = document.createElement('option'); option.value = chapter.id; option.textContent = chapter.title || `Часть ${index + 1}`;
        illustrationChapter.append(option);
      });
      if (chapters.some(chapter => chapter.id === selected)) illustrationChapter.value = selected;
    };
    const renderIllustrations = () => {
      const list = document.getElementById('editor-illustrations'); list.replaceChildren();
      illustrations.forEach((illustration, index) => {
        const entry = document.createElement('section'); entry.className = 'editor-reading-illustration';
        const image = document.createElement('img'); image.src = illustration.imagePath; image.alt = illustration.description; entry.append(image);
        const chapterLabel = document.createElement('label'); chapterLabel.textContent = 'Часть произведения';
        const select = document.createElement('select');
        chapters.forEach(chapter => { const option = document.createElement('option'); option.value = chapter.id; option.textContent = chapter.title; select.append(option); });
        select.value = illustration.chapterId; select.onchange = () => { illustration.chapterId = select.value; sync(); }; chapterLabel.append(select);
        const lineLabel = document.createElement('label'); lineLabel.textContent = 'После строки';
        const line = document.createElement('input'); line.type = 'number'; line.min = '0'; line.value = illustration.afterLine;
        line.oninput = () => { illustration.afterLine = Number(line.value); sync(); }; lineLabel.append(line);
        const descriptionLabel = document.createElement('label'); descriptionLabel.textContent = 'Описание рисунка';
        const description = document.createElement('input'); description.maxLength = 400; description.required = true; description.value = illustration.description;
        description.oninput = () => { illustration.description = description.value; sync(); }; descriptionLabel.append(description);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button secondary'; remove.textContent = 'Убрать рисунок';
        remove.onclick = () => { illustrations.splice(index, 1); sync(); renderIllustrations(); };
        entry.append(chapterLabel, lineLabel, descriptionLabel, remove); list.append(entry);
      });
    };
    let interiorUrl;
    document.getElementById('InteriorImage').onchange = event => {
      if (interiorUrl) URL.revokeObjectURL(interiorUrl);
      const file = event.target.files[0], preview = document.getElementById('interior-image-preview');
      document.getElementById('interior-image-file-name').textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toLocaleString('ru', { maximumFractionDigits: 1 })} МБ` : 'Файл не выбран';
      interiorUrl = file ? URL.createObjectURL(file) : null;
      preview.hidden = !file;
      if (interiorUrl) preview.src = interiorUrl; else preview.removeAttribute('src');
    };
    const render = () => {
      sync(); container.replaceChildren();
      chapters.forEach((chapter, index) => {
        const section = document.createElement('section'); section.className = 'editor-chapter';
        const header = document.createElement('div'); header.className = 'editor-chapter-header';
        const h = document.createElement('h3'); h.textContent = `Глава ${index + 1}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить главу'; remove.disabled = chapters.length === 1;
        remove.addEventListener('click', () => { illustrations = illustrations.filter(illustration => illustration.chapterId !== chapter.id); chapters.splice(index, 1); render(); }); header.append(h, remove);
        const titleLabel = document.createElement('label'); titleLabel.textContent = 'Название главы';
        const title = document.createElement('input'); title.value = chapter.title || ''; title.required = true; title.dataset.ossetian = '';
        title.addEventListener('input', () => { chapter.title = title.value; sync(); }); titleLabel.append(title);
        const textLabel = document.createElement('label'); textLabel.textContent = 'Текст главы';
        const textarea = document.createElement('textarea'); textarea.rows = 8; textarea.required = true; textarea.dataset.ossetian = '';
        textarea.value = (chapter.tokens || []).map(token => token.text).join('');
        textarea.addEventListener('input', () => {
          const next = tokenize(textarea.value);
          next.forEach((token, i) => { if (chapter.tokens[i]?.text === token.text) token.wordId = chapter.tokens[i].wordId || null; });
          chapter.tokens = next; sync();
        });
        textLabel.append(textarea);
        const translationLabel = document.createElement('label'); translationLabel.textContent = 'Перевод главы';
        const translationHelp = document.createElement('span'); translationHelp.className = 'field-help';
        translationHelp.textContent = 'Необязательно. Проверяется вместе с текстом перед публикацией.';
        const translation = document.createElement('textarea'); translation.rows = 6; translation.maxLength = 50000; translation.lang = 'ru';
        translation.value = chapter.translation || '';
        translation.addEventListener('input', () => { chapter.translation = translation.value; sync(); });
        translationLabel.append(translationHelp, translation);
        section.append(header, titleLabel, textLabel, translationLabel); container.append(section);
      });
      renderIllustrations();
    };
    document.getElementById('add-chapter').addEventListener('click', () => { chapters.push(blank()); render(); });
    formRoot.querySelector('form').addEventListener('submit', sync);
    render();
  }
})();
