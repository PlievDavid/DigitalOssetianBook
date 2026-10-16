(() => {
  const root = document.getElementById('books-app');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $('books-status');
  let selectedItem, book, chapter, activeWord, position = 0, detailRequest = 0, viewRequest = 0;
  let words = new Map(), wordsByText = new Map(), meanings = new Map();
  const key = text => text.trim().replaceAll('æ', 'ӕ').replaceAll('Æ', 'Ӕ').replace(/\u0301/g, '')
    .normalize('NFC').toLocaleLowerCase('ru').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

  function showView(view) {
    ++viewRequest;
    closeWord();
    $('books-catalog').hidden = view !== 'catalog';
    $('book-detail').hidden = view !== 'detail';
    $('book-reader').hidden = view !== 'reader';
    root.classList.toggle('is-reading', view === 'reader');
    document.body.classList.toggle('is-reading-book', view === 'reader');
    status.textContent = '';
    window.scrollTo(0, 0);
  }

  function cover(container, item) {
    container.replaceChildren();
    if (item.coverImagePath) {
      const image = document.createElement('img');
      image.src = item.coverImagePath;
      image.alt = `Обложка «${item.title}»`;
      container.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'book-cover-placeholder';
      placeholder.textContent = item.title.slice(0, 1);
      container.append(placeholder);
    }
  }

  async function load() {
    try {
      const [books, allWords] = await Promise.all([AdamApi('/books'), AdamApi('/words')]);
      words = new Map(allWords.map(x => [x.id, x]));
      wordsByText = new Map(allWords.map(x => [key(x.ossetian), x]));
      $('books-list').replaceChildren();
      for (const item of books) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'book-card';
        const art = document.createElement('span'); art.className = 'book-card-cover'; cover(art, item);
        const copy = document.createElement('span'); copy.className = 'book-card-copy';
        const difficulty = document.createElement('span'); difficulty.className = 'book-difficulty'; difficulty.textContent = item.difficulty || 'Книга';
        const title = document.createElement('strong'); title.textContent = item.title;
        const authors = document.createElement('span'); authors.className = 'book-card-authors'; authors.textContent = item.authors || 'Автор не указан';
        const description = document.createElement('span'); description.className = 'book-card-description'; description.textContent = item.description;
        const read = document.createElement('span'); read.className = 'book-card-open'; read.textContent = 'О книге →';
        copy.append(difficulty, title, authors, description, read);
        card.append(art, copy);
        card.onclick = () => openDetail(item);
        $('books-list').append(card);
      }
      status.textContent = books.length ? '' : 'Книг пока нет.';
    } catch (error) { status.textContent = error.message; }
  }

  async function openDetail(item) {
    const request = ++detailRequest;
    selectedItem = item;
    $('detail-title').textContent = item.title;
    $('detail-authors').textContent = item.authors || 'Автор не указан';
    $('detail-difficulty').textContent = item.difficulty || 'Сложность не указана';
    $('detail-description').textContent = item.description;
    cover($('detail-cover'), item);
    $('detail-chapters-section').hidden = true;
    $('detail-chapters').replaceChildren();
    showView('detail');
    $('detail-back').focus({ preventScroll: true });
    try {
      const contents = await AdamApi(`/books/${item.id}`);
      if (request !== detailRequest || selectedItem !== item) return;
      contents.chapters.forEach(value => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'book-text-button'; button.textContent = value.title;
        button.onclick = () => startReading(value.id);
        $('detail-chapters').append(button);
      });
      $('detail-chapters-section').hidden = !contents.chapters.length;
    } catch (error) { if (request === detailRequest) status.textContent = error.message; }
  }

  async function startReading(chapterId) {
    const request = viewRequest;
    const item = selectedItem;
    try {
      const loaded = await AdamApi(`/books/${item.id}`);
      if (request !== viewRequest || item !== selectedItem) return;
      book = loaded;
      meanings = new Map((book.dictionary || []).map(x => [x.id, x]));
      $('book-title').textContent = book.title;
      $('book-author').textContent = book.authors || '';
      $('book-literary').hidden = !book.literaryTranslation;
      $('reader-columns').classList.toggle('single', !book.literaryTranslation);
      $('book-literary-text').textContent = book.literaryTranslation || '';
      showView('reader');
      const readerRequest = viewRequest;
      let saved = null;
      try { if (AdamAuthenticated) saved = await AdamApi(`/books/${book.id}/position`); } catch { /* guests can read */ }
      if (readerRequest !== viewRequest) return;
      showChapter(book.chapters.find(x => x.id === (chapterId || saved?.chapterId)) || book.chapters[0], chapterId ? 0 : saved?.tokenIndex || 0);
      $('book-title').focus({ preventScroll: true });
    } catch (error) { if (request === viewRequest) status.textContent = error.message; }
  }

  function closeWord() {
    const returnFocus = $('word-popup').contains(document.activeElement);
    $('word-popup').hidden = true;
    $('book-text').querySelectorAll('.reader-current').forEach(x => x.classList.remove('reader-current'));
    if (returnFocus && activeWord?.isConnected) activeWord.focus({ preventScroll: true });
    activeWord = null;
  }

  function showChapter(value, savedIndex) {
    if (!value) return;
    chapter = value;
    position = Math.min(savedIndex, Math.max(0, chapter.tokens.length - 1));
    const buttons = $('chapter-buttons');
    buttons.replaceChildren();
    const hasChapters = book.chapters.length > 1;
    $('reader-chapter-panel').hidden = !hasChapters;
    $('book-reader').classList.toggle('has-chapters', hasChapters);
    $('reader-pagination').hidden = !hasChapters;
    const chapterIndex = book.chapters.indexOf(chapter);
    $('chapter-previous').disabled = chapterIndex === 0;
    $('chapter-next').disabled = chapterIndex === book.chapters.length - 1;
    const select = $('chapter-select');
    select.replaceChildren();
    book.chapters.forEach(item => {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; option.selected = item.id === chapter.id; select.append(option);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'book-text-button';
      button.textContent = item.title;
      button.setAttribute('aria-current', item.id === chapter.id ? 'true' : 'false');
      button.onclick = () => changeChapter(item);
      buttons.append(button);
    });
    $('book-text').replaceChildren();
    closeWord();
    chapter.tokens.forEach((token, i) => {
      const span = document.createElement('span');
      span.textContent = token.text;
      const isWord = /[\p{L}\p{M}]/u.test(token.text);
      if (isWord) {
        span.className = 'reader-word';
        span.tabIndex = 0;
        span.setAttribute('role', 'button');
        span.setAttribute('aria-label', `Перевод слова ${token.text}`);
      }
      if (isWord) {
        span.onclick = () => {
          position = i;
          $('book-text').querySelectorAll('.reader-current').forEach(x => x.classList.remove('reader-current'));
          span.classList.add('reader-current');
          activeWord = span;
          showWord(token);
        };
        span.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); span.click(); }
        };
      }
      $('book-text').append(span);
    });
  }

  function showWord(token) {
    const popup = $('word-popup');
    popup.replaceChildren();
    const header = document.createElement('div'); header.className = 'reader-popup-header';
    const heading = document.createElement('strong'); heading.textContent = token.text;
    const label = document.createElement('p'); label.className = 'reader-popup-label'; label.textContent = 'Словарная подсказка'; popup.append(label);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть перевод');
    close.onclick = closeWord;
    header.append(heading, close); popup.append(header);
    const appendSave = (container, path) => {
      if (!AdamAuthenticated) return;
      const save = document.createElement('button'); save.type = 'button'; save.className = 'theme-button theme-button-primary';
      save.textContent = 'В мой словарь';
      save.onclick = async () => {
        try { await AdamApi(path, { method: 'POST' }); save.textContent = 'Сохранено'; save.disabled = true; }
        catch (error) { status.textContent = error.message; }
      };
      container.append(save);
    };
    const word = words.get(token.wordId) || wordsByText.get(key(token.text));
    if (word) {
      const entry = document.createElement('div'); entry.className = 'reader-meaning';
      const title = document.createElement('strong'); title.textContent = `${word.ossetian} — ${word.russian}`;
      entry.append(title);
      if (word.example) { const example = document.createElement('p'); example.textContent = word.example; entry.append(example); }
      if (word.audioPath) { const audio = document.createElement('audio'); audio.controls = true; audio.src = word.audioPath; entry.append(audio); }
      appendSave(entry, `/vocabulary/${word.id}`);
      popup.append(entry);
    }
    const matches = (token.matches || []).map(match => ({ match, meaning: meanings.get(match.senseId) })).filter(x => x.meaning);
    for (const { match, meaning } of matches) {
      const entry = document.createElement('div'); entry.className = 'reader-meaning';
      const title = document.createElement('strong');
      title.textContent = `${match.approximate ? 'Возможно: ' : ''}${meaning.ossetian} — ${meaning.russianHeadword}`;
      entry.append(title);
      if (meaning.note) { const note = document.createElement('p'); note.textContent = meaning.note; entry.append(note); }
      appendSave(entry, `/vocabulary/dictionary/${meaning.id}`);
      popup.append(entry);
    }
    if (!word && !matches.length) {
      const missing = document.createElement('p');
      missing.textContent = 'Перевод пока не найден в словаре.';
      popup.append(missing);
    }
    if (!AdamAuthenticated) {
      const login = document.createElement('a'); login.href = '/account/login?ReturnUrl=%2Fbooks'; login.className = 'reader-login'; login.textContent = 'Войдите, чтобы сохранять слова'; popup.append(login);
    }
    popup.hidden = false;
    popup.scrollTop = 0;
  }

  function changeChapter(value) {
    if (!value) return;
    showChapter(value, 0);
    $('book-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  $('chapter-select').onchange = event => changeChapter(book.chapters.find(x => x.id === event.target.value));
  $('chapter-previous').onclick = () => changeChapter(book.chapters[book.chapters.indexOf(chapter) - 1]);
  $('chapter-next').onclick = () => changeChapter(book.chapters[book.chapters.indexOf(chapter) + 1]);
  $('detail-back').onclick = () => { ++detailRequest; showView('catalog'); $('books-list .book-card')?.focus(); };
  $('detail-read').onclick = () => startReading();
  $('books-back').onclick = () => { showView('detail'); $('detail-read').focus({ preventScroll: true }); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeWord();
  });
  load();
})();
