(() => {
  const root = document.getElementById('books-app');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const status = $('books-status');
  let selectedItem, book, chapter, position = 0;
  let words = new Map(), wordsByText = new Map(), meanings = new Map();
  const key = text => text.trim().replaceAll('æ', 'ӕ').replaceAll('Æ', 'Ӕ').replace(/\u0301/g, '')
    .normalize('NFC').toLocaleLowerCase('ru').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

  function showView(view) {
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

  function openDetail(item) {
    selectedItem = item;
    $('detail-title').textContent = item.title;
    $('detail-authors').textContent = item.authors || 'Автор не указан';
    $('detail-difficulty').textContent = item.difficulty || 'Сложность не указана';
    $('detail-description').textContent = item.description;
    cover($('detail-cover'), item);
    showView('detail');
  }

  async function startReading() {
    try {
      book = await AdamApi(`/books/${selectedItem.id}`);
      meanings = new Map((book.dictionary || []).map(x => [x.id, x]));
      $('book-title').textContent = book.title;
      $('book-author').textContent = book.authors ? ` · ${book.authors}` : '';
      $('book-literary').hidden = !book.literaryTranslation;
      $('reader-columns').classList.toggle('single', !book.literaryTranslation);
      $('book-literary-text').textContent = book.literaryTranslation || '';
      showView('reader');
      let saved = null;
      try { saved = await AdamApi(`/books/${book.id}/position`); } catch { /* guests can read */ }
      showChapter(book.chapters.find(x => x.id === saved?.chapterId) || book.chapters[0], saved?.tokenIndex || 0);
    } catch (error) { status.textContent = error.message; }
  }

  function closeWord() {
    $('word-popup').hidden = true;
    $('book-text').querySelectorAll('.reader-current').forEach(x => x.classList.remove('reader-current'));
  }

  function showChapter(value, savedIndex) {
    if (!value) return;
    chapter = value;
    position = Math.min(savedIndex, Math.max(0, chapter.tokens.length - 1));
    const buttons = $('chapter-buttons');
    buttons.replaceChildren();
    buttons.hidden = book.chapters.length <= 1;
    book.chapters.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'book-text-button';
      button.textContent = item.title;
      button.setAttribute('aria-current', item.id === chapter.id ? 'true' : 'false');
      button.onclick = () => showChapter(item, 0);
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
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть перевод');
    close.onclick = closeWord;
    header.append(heading, close); popup.append(header);
    const appendSave = (container, path) => {
      const save = document.createElement('button'); save.type = 'button'; save.className = 'book-text-button';
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
    popup.hidden = false;
    popup.scrollTop = 0;
  }

  $('detail-back').onclick = () => showView('catalog');
  $('detail-read').onclick = startReading;
  $('books-back').onclick = () => { closeWord(); showView('detail'); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeWord();
  });
  load();
})();
