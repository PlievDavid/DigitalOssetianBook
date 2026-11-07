(() => {
  const root = document.getElementById('reading-app');
  if (!root) return;
  const element = id => document.getElementById(id);
  const flow = element('reading-flow'), grid = element('reading-library-grid');
  const panel = element('reading-word-panel'), status = element('reading-status');
  const narrow = matchMedia('(max-width: 700px)');
  const key = text => text.normalize('NFC').toLocaleLowerCase('ru').replaceAll('æ', 'ӕ').replace(/\u0301/g, '').trim();
  let book, chapter, activeCard, activeWord, generation = 0, textSize = 20, catalogScroll = 0;
  let language = narrow.matches ? 'os' : 'both', words = [], meanings = new Map();
  let pendingSave = Promise.resolve();

  function closeWord(restoreFocus = false) {
    panel.hidden = true;
    activeWord?.classList.remove('is-current');
    if (restoreFocus && activeWord?.isConnected) activeWord.focus({ preventScroll: true });
    activeWord = null;
  }

  function setLanguage(value) {
    language = chapter?.translation ? value : 'os';
    root.dataset.language = language;
    root.querySelectorAll('[data-reading-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.readingLanguage === language));
      button.hidden = button.dataset.readingLanguage !== 'os' && !chapter?.translation;
    });
    closeWord();
  }

  function savePosition(tokenIndex) {
    if (!AdamAuthenticated) return;
    const path = `/books/${book.id}/position`, input = { chapterId: chapter.id, tokenIndex };
    pendingSave = pendingSave.then(() => AdamApi(path, { method: 'PUT', body: JSON.stringify(input) }))
      .catch(() => { status.textContent = 'Позицию чтения не удалось сохранить.'; });
  }

  function showWord(token, index, target) {
    closeWord();
    activeWord = target;
    target.classList.add('is-current');
    element('reading-word-title').textContent = token.text;
    const definition = element('reading-word-definition');
    definition.replaceChildren();
    const appendMeaning = (heading, note, path, audioPath) => {
      const entry = document.createElement('section');
      const title = document.createElement('strong'); title.textContent = heading; entry.append(title);
      if (note) { const text = document.createElement('p'); text.textContent = note; entry.append(text); }
      if (audioPath) { const audio = document.createElement('audio'); audio.controls = true; audio.src = audioPath; entry.append(audio); }
      if (AdamAuthenticated) {
        const save = document.createElement('button'); save.type = 'button'; save.className = 'button secondary'; save.textContent = 'В мой словарь';
        save.onclick = async () => {
          save.disabled = true;
          try { await AdamApi(path, { method: 'POST' }); save.textContent = 'Сохранено'; }
          catch (error) { status.textContent = error.message; save.disabled = false; }
        };
        entry.append(save);
      }
      definition.append(entry);
    };
    const word = words.find(item => item.id === token.wordId) || words.find(item => key(item.ossetian) === key(token.text));
    if (word) appendMeaning(`${word.ossetian} — ${word.russian}`, word.example, `/vocabulary/${word.id}`, word.audioPath);
    for (const match of token.matches || []) {
      const meaning = meanings.get(match.senseId);
      if (meaning) appendMeaning(`${match.approximate ? 'Возможно: ' : ''}${meaning.ossetian} — ${meaning.russianHeadword}`,
        meaning.note, `/vocabulary/dictionary/${meaning.id}`);
    }
    if (!definition.childElementCount) definition.textContent = 'Перевод пока не найден в словаре.';
    else if (definition.childElementCount > 1) {
      const entries = [...definition.children];
      definition.replaceChildren();
      entries.forEach((entry, index) => {
        const details = document.createElement('details'); details.className = 'reading-meaning'; details.open = index === 0;
        const summary = document.createElement('summary'); summary.append(entry.firstElementChild);
        details.append(summary, ...entry.childNodes);
        details.addEventListener('toggle', () => {
          if (details.open) [...definition.children].forEach(other => { if (other !== details) other.open = false; });
        });
        definition.append(details);
      });
    }
    panel.hidden = false;
    panel.scrollTop = 0;
    savePosition(index);
  }

  function makeLines() {
    const lines = [document.createElement('div')];
    chapter.tokens.forEach((token, index) => {
      token.text.split('\n').forEach((part, partIndex) => {
        if (partIndex) lines.push(document.createElement('div'));
        if (!part) return;
        const word = document.createElement('span'); word.textContent = part; word.dataset.tokenIndex = index;
        if (/[\p{L}\p{M}]/u.test(part)) {
          word.className = 'reading-word'; word.tabIndex = 0;
          word.setAttribute('role', 'button'); word.setAttribute('aria-label', 'Словарная подсказка: ' + part);
          word.onclick = () => showWord(token, index, word);
          word.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); word.click(); }
          };
        }
        lines.at(-1).append(word);
      });
    });
    lines.forEach(line => { line.className = 'reading-line-original'; line.lang = 'os'; });
    return lines;
  }

  function appendIllustrations(afterLine, container = flow) {
    for (const illustration of book.illustrations || []) {
      if (illustration.chapterId !== chapter.id || illustration.afterLine !== afterLine) continue;
      const figure = document.createElement('figure'); figure.className = 'reading-illustration';
      const image = document.createElement('img'); image.src = illustration.imagePath;
      image.alt = illustration.description; image.loading = 'lazy'; image.decoding = 'async';
      image.width = 1536; image.height = 1024;
      figure.append(image); container.append(figure);
    }
  }

  function showChapter(selected, tokenIndex = 0) {
    chapter = selected;
    setLanguage(narrow.matches ? language : 'both');
    element('reading-draft-notice').hidden = !chapter.translation || book.translationReviewed;
    closeWord(); flow.replaceChildren();
    const originals = makeLines(), translations = (chapter.translation || '').replace(/\r\n?/g, '\n').split('\n');
    const aligned = originals.length === translations.length;
    if (!aligned && chapter.translation) {
      const columns = document.createElement('div'); columns.className = 'reading-line-pair';
      const originalColumn = document.createElement('div'); originalColumn.className = 'reading-line-original';
      const translationColumn = document.createElement('div'); translationColumn.className = 'reading-line-translation'; translationColumn.lang = 'ru';
      originals.forEach((original, index) => { appendIllustrations(index, originalColumn); originalColumn.append(original); });
      appendIllustrations(originals.length, originalColumn); translationColumn.textContent = chapter.translation;
      columns.append(originalColumn, translationColumn); flow.append(columns);
    } else {
    originals.forEach((original, index) => {
      appendIllustrations(index);
      const pair = document.createElement('div'); pair.className = 'reading-line-pair'; pair.dataset.line = index + 1;
      if (!original.textContent.trim()) pair.classList.add('is-stanza-break');
      const translated = document.createElement('div'); translated.className = 'reading-line-translation'; translated.lang = 'ru';
      translated.textContent = aligned ? translations[index] : '';
      translated.classList.toggle('needs-review', translated.textContent.includes('⚠'));
      pair.append(original, translated); flow.append(pair);
    });
    appendIllustrations(originals.length);
    }
    root.querySelectorAll('[data-chapter-id]').forEach(button => button.setAttribute('aria-current', button.dataset.chapterId === chapter.id ? 'true' : 'false'));
    const renderedTokens = [...flow.querySelectorAll('[data-token-index]')];
    const savedToken = renderedTokens.find(token => Number(token.dataset.tokenIndex) >= tokenIndex) || renderedTokens.at(-1);
    if (tokenIndex > 0 && savedToken) savedToken.scrollIntoView({ block: 'center' });
    else window.scrollTo(0, 0);
  }

  async function openBook(item, card) {
    const request = ++generation;
    status.textContent = 'Открываем произведение…';
    try {
      const loaded = await AdamApi(`/books/${item.id}`);
      const saved = AdamAuthenticated ? await AdamApi(`/books/${item.id}/position`).catch(() => null) : null;
      if (request !== generation) return;
      book = loaded; activeCard = card; catalogScroll = window.scrollY;
      meanings = new Map((book.dictionary || []).map(meaning => [meaning.id, meaning]));
      element('reading-title').textContent = book.title;
      element('reading-authors').textContent = book.authors;
      const chapters = element('reading-chapters'); chapters.replaceChildren(); chapters.hidden = book.chapters.length < 2;
      for (const part of book.chapters) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = part.title;
        button.dataset.chapterId = part.id; button.onclick = () => showChapter(part); chapters.append(button);
      }
      element('reading-library').hidden = true; element('reading-story').hidden = false;
      status.textContent = '';
      history.replaceState(null, '', '#' + book.id);
      element('reading-title').focus({ preventScroll: true });
      showChapter(book.chapters.find(part => part.id === saved?.chapterId) || book.chapters[0], saved?.tokenIndex || 0);
    } catch (error) { if (request === generation) status.textContent = error.message; }
  }

  async function load() {
    status.textContent = 'Загружаем произведения…';
    try {
      const catalog = await AdamApi('/books');
      words = await AdamApi('/words').catch(() => []);
      grid.replaceChildren(); element('reading-count').textContent = catalog.length ? `Произведений: ${catalog.length}` : '';
      for (const item of catalog) {
        const card = document.createElement('button'); card.type = 'button'; card.className = 'reading-card'; card.dataset.bookId = item.id;
        card.append(AdamBookCover.create(item));
        const title = document.createElement('strong'); title.textContent = item.title;
        const author = document.createElement('span'); author.textContent = item.authors;
        card.append(title, author); card.onclick = () => openBook(item, card); grid.append(card);
      }
      status.textContent = catalog.length ? '' : 'Произведения пока не опубликованы.';
      const initial = catalog.find(item => '#' + item.id === location.hash);
      if (initial) await openBook(initial, [...grid.children].find(card => card.dataset.bookId === initial.id));
    } catch (error) { status.textContent = error.message; }
  }

  element('reading-back').onclick = () => {
    generation++; closeWord(); element('reading-story').hidden = true; element('reading-library').hidden = false;
    history.replaceState(null, '', location.pathname + location.search); status.textContent = '';
    activeCard?.focus({ preventScroll: true }); window.scrollTo(0, catalogScroll);
  };
  root.querySelectorAll('[data-reading-language]').forEach(button => button.onclick = () => setLanguage(button.dataset.readingLanguage));
  function setTextSize(value) {
    textSize = Math.max(16, Math.min(28, value)); root.style.setProperty('--reading-font-size', textSize + 'px');
    element('reading-smaller').disabled = textSize === 16; element('reading-larger').disabled = textSize === 28;
  }
  element('reading-smaller').onclick = () => setTextSize(textSize - 2);
  element('reading-larger').onclick = () => setTextSize(textSize + 2);
  element('reading-word-close').onclick = () => closeWord(true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeWord(true); });
  narrow.addEventListener('change', event => setLanguage(event.matches ? 'os' : 'both'));
  load();
})();
