const imageLimit = 5 * 1024 * 1024;
const videoLimit = 80 * 1024 * 1024;
const imagePattern = /\.(?:jpe?g|png|webp)$/i;
const videoPattern = /\.(?:mp4|webm)$/i;

export function renderTheoryMedia(media, node) {
  if (!media) return null;
  const figure = node('figure', null, 'cv-theory-media');
  const asset = node(media.video ? 'video' : 'img');
  const error = node('p', null, 'cv-theory-media-error');
  error.setAttribute('role', 'status');
  error.hidden = true;
  if (media.video) {
    asset.controls = true;
    asset.playsInline = true;
    asset.preload = 'metadata';
    asset.setAttribute('aria-label', media.caption || 'Видео к объяснению');
  } else {
    asset.alt = media.alt || '';
    asset.decoding = 'async';
  }
  asset.addEventListener('error', () => {
    asset.hidden = true;
    error.textContent = media.video ? 'Видео не удалось открыть. Попробуйте MP4 с кодеком H.264 или WebM.' : 'Изображение не удалось открыть.';
    error.hidden = false;
  });
  asset.src = media.url;
  figure.append(asset, error);
  if (media.caption) figure.append(node('figcaption', media.caption));
  return figure;
}

export function authorTheoryMedia(media, node) {
  return media ? renderTheoryMedia({ ...media, video: videoPattern.test(media.file), url: '/api/v1/author/theory-media/' + encodeURIComponent(media.file) }, node) : null;
}

export function editTheoryMedia(courseId, media, update, { node, action, field, actions, busy }) {
  const section = node('section', null, 'cs-theory-media');
  const preview = node('div');
  const metadata = node('div', null, 'cs-theory-media-fields');
  const feedback = node('p', null, 'cs-theory-media-feedback');
  feedback.setAttribute('role', 'status');
  const input = node('input');
  input.type = 'file';
  input.accept = '.jpg,.jpeg,.png,.webp,.mp4,.webm';
  input.hidden = true;
  const progress = node('progress');
  progress.max = 100;
  progress.setAttribute('aria-label', 'Загрузка вложения');
  progress.hidden = true;
  let request;
  const choose = action('', () => input.click(), 'plus', 'cs-save-button');
  const remove = action('Убрать вложение', () => {
    media = null;
    update(null);
    draw();
    feedback.textContent = 'Вложение убрано из черновика.';
    choose.focus();
  });
  const cancel = action('Отменить загрузку', () => request?.abort());
  cancel.hidden = true;
  const controls = actions(choose, remove, cancel);
  section.append(node('h3', 'Фото или видео'), node('p', 'JPEG, PNG и WebP до 5 МБ. MP4 и WebM до 80 МБ.', 'cs-help'),
    preview, input, controls, progress, feedback, metadata);

  function draw() {
    const figure = authorTheoryMedia(media, node);
    preview.replaceChildren(...(figure ? [figure] : []));
    metadata.replaceChildren();
    choose.querySelector('span').textContent = media ? 'Заменить файл' : 'Выбрать файл';
    remove.hidden = !media || Boolean(request);
    if (!media) return;
    const caption = field('Подпись к вложению', media.caption, value => {
      media.caption = value;
      update({ ...media });
      let label = figure.querySelector('figcaption');
      if (!label && value) { label = node('figcaption'); figure.append(label); }
      if (label) label.textContent = value;
      figure.querySelector('video')?.setAttribute('aria-label', value || 'Видео к объяснению');
    }, { max: 300 });
    metadata.append(caption);
    if (!videoPattern.test(media.file)) {
      const alt = field('Описание изображения', media.alt, value => {
        media.alt = value;
        update({ ...media });
        figure.querySelector('img').alt = value;
      }, { max: 300 });
      alt.querySelector('input').setAttribute('aria-required', 'true');
      metadata.append(alt, node('p', 'Кратко опишите, что на изображении. Описание нужно для публикации.', 'cs-help'));
    }
  }

  function status(message, failed = false) {
    feedback.textContent = message;
    feedback.classList.toggle('cv-theory-media-error', failed);
  }

  input.addEventListener('change', () => {
    const file = input.files[0];
    input.value = '';
    if (!file || request) return;
    const video = videoPattern.test(file.name);
    if (!video && !imagePattern.test(file.name)) { status('Выберите JPEG, PNG, WebP, MP4 или WebM.', true); return; }
    if (file.size === 0 || file.size > (video ? videoLimit : imageLimit)) {
      status(video ? 'Выберите непустое видео размером до 80 МБ.' : 'Выберите непустое фото размером до 5 МБ.', true);
      return;
    }
    const payload = new FormData();
    payload.append('file', file);
    const upload = new XMLHttpRequest();
    request = upload;
    busy(true);
    upload.open('POST', `/api/v1/author/courses/${courseId}/theory-media`);
    const token = document.querySelector('#api-antiforgery input[name="__RequestVerificationToken"]')?.value;
    if (token) upload.setRequestHeader('RequestVerificationToken', token);
    choose.disabled = true;
    remove.hidden = true;
    cancel.hidden = false;
    progress.hidden = false;
    progress.removeAttribute('value');
    status('Загружаем ' + file.name + '…');
    upload.upload.addEventListener('progress', e => { if (e.lengthComputable) progress.value = e.loaded / e.total * 100; });
    upload.addEventListener('load', () => {
      let response;
      try { response = JSON.parse(upload.responseText); } catch { /* A transport error may return an empty response. */ }
      if (upload.status !== 200 || !response?.file) {
        status(response?.error ?? 'Не удалось загрузить файл. Выберите его ещё раз.', true);
        return;
      }
      media = { file: response.file, caption: media?.caption ?? '', alt: '' };
      update({ ...media });
      draw();
      status(video ? 'Видео добавлено.' : 'Фото добавлено.');
    });
    upload.addEventListener('error', () => status('Связь прервалась. Попробуйте загрузить файл ещё раз.', true));
    upload.addEventListener('abort', () => status('Загрузка отменена.'));
    upload.addEventListener('loadend', () => {
      request = null;
      busy(false);
      choose.disabled = false;
      remove.hidden = !media;
      cancel.hidden = true;
      progress.hidden = true;
      if (section.isConnected && document.activeElement === document.body) choose.focus();
    });
    upload.send(payload);
  });

  draw();
  return { section, abort: () => request?.abort() };
}
