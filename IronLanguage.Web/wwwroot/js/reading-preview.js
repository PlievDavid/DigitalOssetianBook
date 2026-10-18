(() => {
  const root = document.getElementById('reading-preview');
  if (!root) return;
  const element = id => document.getElementById(id);
  const drafts = JSON.parse(element('reading-draft-data').textContent);
  const grid = element('reading-library-grid');
  const flow = element('reading-flow');
  const panel = element('reading-word-panel');
  const narrow = matchMedia('(max-width: 700px)');
  let language = narrow.matches ? 'os' : 'both';
  let textSize = 20;
  let activeCard, activeWord, wordRequest = 0, dictionaryPromise;
  let catalogScroll = 0;

  const normalized = value => value.normalize('NFC').toLocaleLowerCase('ru')
    .replaceAll('æ', 'ӕ').replace(/\u0301/g, '');

  function setLanguage(value) {
    language = value;
    root.dataset.language = value;
    flow.dataset.language = value;
    root.querySelectorAll('[data-reading-language]').forEach(button =>
      button.setAttribute('aria-pressed', String(button.dataset.readingLanguage === value)));
    closeWord(false);
  }

  function closeWord(returnFocus) {
    wordRequest++;
    panel.hidden = true;
    activeWord?.classList.remove('is-current');
    if (returnFocus && activeWord?.isConnected) activeWord.focus({ preventScroll: true });
    activeWord = null;
  }

  async function showWord(word, target) {
    closeWord(false);
    const request = ++wordRequest;
    activeWord = target;
    target.classList.add('is-current');
    element('reading-word-title').textContent = word;
    element('reading-word-definition').textContent = 'Ищем в опубликованных словах…';
    panel.hidden = false;
    try {
      dictionaryPromise ??= AdamApi('/words').catch(error => { dictionaryPromise = null; throw error; });
      const words = await dictionaryPromise;
      if (request !== wordRequest) return;
      const matches = words.filter(item => normalized(item.ossetian) === normalized(word));
      element('reading-word-definition').textContent = matches.length
        ? matches.map(item => item.russian).join('; ')
        : 'Точного совпадения среди опубликованных слов пока нет.';
    } catch {
      if (request === wordRequest)
        element('reading-word-definition').textContent = 'Не удалось загрузить словарную подсказку. Попробуйте ещё раз.';
    }
  }

  function originalLine(text) {
    const container = document.createElement('div');
    container.className = 'reading-line-original';
    container.lang = 'os';
    const fragments = text.matchAll(/[\p{L}\p{M}]+(?:[-ʼ’][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu);
    for (const fragment of fragments) {
      if (!/[\p{L}\p{M}]/u.test(fragment[0])) {
        container.append(document.createTextNode(fragment[0]));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'reading-word';
      word.textContent = fragment[0];
      word.tabIndex = 0;
      word.setAttribute('role', 'button');
      word.setAttribute('aria-label', 'Словарная подсказка: ' + fragment[0]);
      word.onclick = () => showWord(fragment[0], word);
      word.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          word.click();
        }
      };
      container.append(word);
    }
    return container;
  }

  function illustration(draft) {
    const figure = document.createElement('figure');
    figure.className = 'reading-illustration';
    if (!draft.illustrationReady) {
      figure.classList.add('is-pending');
      const caption = document.createElement('figcaption');
      caption.textContent = 'Здесь будет отдельная иллюстрация';
      const description = document.createElement('p');
      description.textContent = draft.illustrationDescription;
      figure.append(caption, description);
      return figure;
    }
    const image = document.createElement('img');
    image.src = draft.illustrationImagePath;
    image.alt = draft.illustrationDescription;
    image.width = 1536;
    image.height = 1024;
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.append(image);
    return figure;
  }

  function openDraft(draft, card) {
    if (!element('reading-library').hidden) catalogScroll = window.scrollY;
    activeCard = card;
    closeWord(false);
    element('reading-title').textContent = draft.title;
    element('reading-ossetian-title').textContent = draft.ossetianTitle;
    element('reading-review-notes').textContent = draft.reviewNotes;
    element('reading-source').href = draft.sourceUrl;
    root.querySelector('.reading-review').open = false;
    flow.replaceChildren();
    const original = draft.original.split('\n');
    const translation = draft.translation.split('\n');
    original.forEach((line, index) => {
      if (index === draft.illustrationAfterLine) flow.append(illustration(draft));
      const pair = document.createElement('div');
      pair.className = 'reading-line-pair' + (line.trim() ? '' : ' is-stanza-break');
      pair.dataset.line = String(index + 1);
      const translated = document.createElement('div');
      translated.className = 'reading-line-translation';
      translated.lang = 'ru';
      translated.textContent = translation[index];
      translated.classList.toggle('needs-review', translation[index].includes('⚠'));
      pair.append(originalLine(line), translated);
      flow.append(pair);
    });
    if (draft.illustrationAfterLine === original.length) flow.append(illustration(draft));
    element('reading-library').hidden = true;
    element('reading-story').hidden = false;
    history.replaceState(null, '', '#' + draft.slug);
    window.scrollTo(0, 0);
    element('reading-title').focus({ preventScroll: true });
  }

  for (const draft of drafts) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'reading-card';
    card.dataset.slug = draft.slug;
    const image = document.createElement('img');
    image.src = draft.coverImagePath;
    image.alt = '';
    image.width = 1024;
    image.height = 1024;
    image.loading = 'lazy';
    image.decoding = 'async';
    const title = document.createElement('strong');
    title.textContent = draft.title;
    const authors = document.createElement('span');
    authors.textContent = draft.authors;
    if (draft.coverReady) {
      card.append(image);
    } else {
      const pending = document.createElement('span');
      pending.className = 'reading-cover-pending';
      pending.textContent = 'Обложка ещё не готова';
      card.append(pending);
    }
    card.append(title, authors);
    card.onclick = () => openDraft(draft, card);
    grid.append(card);
  }
  element('reading-back').onclick = () => {
    closeWord(false);
    element('reading-story').hidden = true;
    element('reading-library').hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    activeCard?.focus({ preventScroll: true });
    window.scrollTo(0, catalogScroll);
  };
  root.querySelectorAll('[data-reading-language]').forEach(button =>
    button.onclick = () => setLanguage(button.dataset.readingLanguage));
  function setTextSize(size) {
    textSize = Math.max(16, Math.min(28, size));
    root.style.setProperty('--reading-font-size', textSize + 'px');
    element('reading-smaller').disabled = textSize === 16;
    element('reading-larger').disabled = textSize === 28;
  }
  element('reading-smaller').onclick = () => setTextSize(textSize - 2);
  element('reading-larger').onclick = () => setTextSize(textSize + 2);
  element('reading-word-close').onclick = () => closeWord(true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) closeWord(true);
  });
  narrow.addEventListener('change', event => {
    if (event.matches && language === 'both') setLanguage('os');
  });
  setLanguage(language);
  const initial = drafts.find(draft => '#' + draft.slug === location.hash);
  if (initial) openDraft(initial, [...grid.children].find(card => card.dataset.slug === initial.slug));
})();
