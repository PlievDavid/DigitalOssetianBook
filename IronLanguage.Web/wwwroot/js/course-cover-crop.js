export async function cropCoursePhoto(file, editor, signal) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    image.alt = '';
    try { await image.decode(); }
    catch { throw new Error('Не удалось прочитать изображение. Выберите PNG, JPEG или WebP.'); }
    if (signal.aborted) return null;

    const width = image.naturalWidth, height = image.naturalHeight;
    const max = Math.min(width, height), min = Math.min(40, max);
    let size = max, x = (width - size) / 2, y = (height - size) / 2;
    const clamp = (n, from, to) => Math.max(from, Math.min(to, n));
    const stage = document.createElement('div');
    stage.className = 'cs-crop-stage';
    stage.style.maxWidth = `${Math.min(100, 42 * width / height)}vh`;
    const hint = document.createElement('p');
    hint.className = 'cs-help';
    hint.textContent = 'Перетащите квадрат или потяните за его угол. С клавиатуры используйте стрелки, а для размера — Shift и стрелки.';
    const frame = document.createElement('div');
    frame.className = 'cs-crop-frame';
    frame.tabIndex = 0;
    frame.setAttribute('role', 'group');
    frame.setAttribute('aria-label', 'Квадрат кадрирования');
    const handle = document.createElement('span');
    handle.className = 'cs-crop-handle';
    handle.setAttribute('aria-hidden', 'true');
    frame.append(handle);
    stage.append(image, frame);

    function draw() {
      x = clamp(x, 0, width - size);
      y = clamp(y, 0, height - size);
      Object.assign(frame.style, {
        left: `${100 * x / width}%`, top: `${100 * y / height}%`,
        width: `${100 * size / width}%`, height: `${100 * size / height}%`
      });
    }
    frame.addEventListener('keydown', event => {
      const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
      if (!direction) return;
      event.preventDefault();
      const [dx, dy] = direction, step = Math.max(1, max / 50);
      if (event.shiftKey) size = clamp(size + (dx || dy) * step, min, Math.min(width - x, height - y));
      else { x += dx * step; y += dy * step; }
      draw();
    });
    let drag;
    frame.addEventListener('pointerdown', event => {
      if (drag || event.button !== 0) return;
      frame.focus();
      frame.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, left: event.clientX, top: event.clientY, x, y, size, resize: event.target === handle };
    });
    frame.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      const rect = stage.getBoundingClientRect();
      const dx = (event.clientX - drag.left) * width / rect.width;
      const dy = (event.clientY - drag.top) * height / rect.height;
      if (drag.resize) size = clamp(drag.size + (Math.abs(dx) > Math.abs(dy) ? dx : dy), min, Math.min(width - x, height - y));
      else { x = drag.x + dx; y = drag.y + dy; }
      draw();
    });
    frame.addEventListener('lostpointercapture', () => { drag = null; });

    return await new Promise((resolve, reject) => {
      const actions = document.createElement('div'); actions.className = 'cv-actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отмена'; cancel.className = 'cv-button';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Применить кадр'; save.className = 'button primary';
      cancel.onclick = () => resolve(null);
      save.onclick = () => {
        save.disabled = true;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = Math.min(1200, Math.max(1, Math.round(size)));
          canvas.getContext('2d').drawImage(image, x, y, size, size, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось сохранить кадр.')), 'image/jpeg', .9);
        } catch (error) { reject(error); }
      };
      signal.addEventListener('abort', () => resolve(null), { once: true });
      actions.append(cancel, save);
      editor.replaceChildren(hint, stage, actions);
      draw();
      frame.focus();
    });
  } finally {
    URL.revokeObjectURL(url);
    editor.replaceChildren();
  }
}
