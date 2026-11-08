(() => {
  const input = document.getElementById('course-cover');
  if (!input) return;
  const form = input.form, preview = document.getElementById('course-cover-preview');
  const image = document.getElementById('course-cover-image'), remove = document.getElementById('course-cover-remove');
  const crop = document.getElementById('course-cover-crop'), canvas = document.getElementById('course-cover-canvas');
  const zoom = document.getElementById('course-cover-zoom'), x = document.getElementById('course-cover-x'), y = document.getElementById('course-cover-y');
  const error = document.getElementById('course-cover-error'), original = image.getAttribute('src');
  let objectUrl = null, source = null, generation = 0, preparing = false, ready = false;
  function showError(message) { error.textContent = message; error.hidden = !message; }
  function draw(target) {
    const ctx = target.getContext('2d'), scale = Math.max(target.width / source.naturalWidth, target.height / source.naturalHeight) * Number(zoom.value) / 100;
    const w = source.naturalWidth * scale, h = source.naturalHeight * scale;
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, (target.width - w) * Number(x.value) / 100, (target.height - h) * Number(y.value) / 100, w, h);
  }
  function resetFile() {
    generation++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; source = null; crop.hidden = true;
    image.src = original || ''; image.hidden = remove.checked || !original;
    preview.hidden = !original && !remove.checked;
    showError('');
  }
  input.addEventListener('change', () => {
    ready = false; resetFile();
    const file = input.files[0];
    if (!file) return;
    remove.checked = false;
    preview.hidden = false; image.hidden = true;
    if (file.size > 5000000) { showError('Выберите изображение не больше 5 МБ.'); return; }
    objectUrl = URL.createObjectURL(file);
    const candidate = new Image(), current = ++generation;
    candidate.onload = () => {
      if (current !== generation) return;
      source = candidate; zoom.value = '100'; x.value = y.value = '50';
      crop.hidden = false; draw(canvas);
    };
    candidate.onerror = () => { if (current === generation) showError('Не удалось открыть изображение. Выберите PNG, JPEG или WebP.'); };
    candidate.src = objectUrl;
  });
  [zoom, x, y].forEach(control => control.addEventListener('input', () => { if (source) draw(canvas); }));
  remove.addEventListener('change', () => {
    if (remove.checked) { input.value = ''; resetFile(); }
    image.hidden = remove.checked || !original;
    preview.hidden = !original && !remove.checked;
  });
  form.addEventListener('submit', async event => {
    if (ready || !input.files.length) return;
    event.preventDefault();
    if (preparing) return;
    if (!source) {
      if (error.hidden) showError('Дождитесь загрузки изображения или выберите другой файл.');
      input.focus();
      return;
    }
    preparing = true;
    const submitter = event.submitter, output = document.createElement('canvas'), current = generation;
    output.width = 800; output.height = 1000;
    try {
      draw(output);
      const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
      if (current !== generation) return;
      if (!blob || blob.size > 5000000) throw new Error();
      const data = new DataTransfer();
      data.items.add(new File([blob], 'cover.png', { type: 'image/png' }));
      input.files = data.files; ready = true;
      form.requestSubmit(submitter);
    } catch {
      showError('Не удалось подготовить обложку. Попробуйте другое изображение.');
      input.focus();
    } finally { preparing = false; }
  });
})();
