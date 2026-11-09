window.AdamCropCover = async file => {
  const url = URL.createObjectURL(file), img = new Image();
  try { img.src = url; await img.decode(); } catch { URL.revokeObjectURL(url); throw new Error('Не удалось прочитать изображение. Выберите PNG, JPEG или WebP.'); }
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'cs-crop-dialog'; dialog.setAttribute('aria-label', 'Кадрирование обложки');
    const title = document.createElement('h2'); title.textContent = 'Обложка курса';
    const hint = document.createElement('p'); hint.textContent = 'Этот кадр будет показан в карточке и на странице курса. Настройте масштаб и положение.';
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720; canvas.setAttribute('aria-label', 'Предпросмотр кадра 16:9');
    const ctx = canvas.getContext('2d');
    const controls = {};
    dialog.append(title, hint, canvas);
    for (const [key, text, min, max, value] of [['zoom', 'Масштаб', 1, 3, 1], ['x', 'По горизонтали', 0, 100, 50], ['y', 'По вертикали', 0, 100, 50]]) {
      const label = document.createElement('label'); label.textContent = text;
      const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = key === 'zoom' ? .01 : 1; input.value = value; input.setAttribute('aria-label', text);
      controls[key] = input; input.addEventListener('input', draw); label.append(input); dialog.append(label);
    }
    function draw() {
      const scale = Math.max(1280 / img.naturalWidth, 720 / img.naturalHeight) * Number(controls.zoom.value);
      const w = 1280 / scale, h = 720 / scale;
      ctx.drawImage(img, (img.naturalWidth - w) * controls.x.value / 100, (img.naturalHeight - h) * controls.y.value / 100, w, h, 0, 0, 1280, 720);
    }
    const actions = document.createElement('div'); actions.className = 'cv-actions';
    const cancel = document.createElement('button'); cancel.textContent = 'Отмена'; cancel.className = 'cv-button'; cancel.onclick = () => finish(null);
    const save = document.createElement('button'); save.textContent = 'Применить обложку'; save.className = 'button primary'; save.onclick = () => { save.disabled = true; canvas.toBlob(blob => finish(blob), 'image/jpeg', .9); };
    actions.append(cancel, save); dialog.append(actions);
    let done = false;
    function finish(blob) { if (done) return; done = true; dialog.close(); dialog.remove(); URL.revokeObjectURL(url); resolve(blob); }
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    document.body.append(dialog); draw(); dialog.showModal();
  });
};
