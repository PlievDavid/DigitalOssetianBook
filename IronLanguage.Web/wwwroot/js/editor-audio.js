(() => {
  const studio = document.getElementById('editor-audio-studio');
  if (!studio) return;
  const get = id => document.getElementById(id);
  const input = get('editor-audio'), player = get('editor-audio-preview');
  const record = get('audio-record'), stop = get('audio-stop'), edit = get('audio-edit'), replace = get('audio-replace');
  const status = get('audio-studio-status'), trim = get('audio-trim');
  const start = get('audio-trim-start'), end = get('audio-trim-end');
  const rangeStart = get('audio-range-start'), rangeEnd = get('audio-range-end');
  const waveform = get('audio-waveform'), canvas = get('audio-waveform-canvas');
  const original = player.getAttribute('src');
  const maxSeconds = 120, sampleRate = 24000;
  let recorder, stream, timer, buffer, sourceFile, objectUrl, audioContext;
  let busy = false, recording = false, dirty = false, generation = 0, fragmentEnd = null, previewIsSource = true;
  let cropFrom = 0;
  let replacing = false;
  const message = text => { status.textContent = text; };
  const time = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const releaseMic = () => {
    clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop()); stream = null;
  };
  const update = () => {
    const hasAudio = Boolean(input.files[0] || original);
    record.hidden = recording || (hasAudio && !replacing);
    if (replace) { replace.hidden = !hasAudio || recording || replacing; replace.disabled = busy; }
    record.disabled = busy || recording || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
    stop.hidden = !recording;
    input.disabled = busy || recording;
    edit.disabled = busy || recording;
    studio.querySelectorAll('#audio-trim button, #audio-trim input').forEach(el => { el.disabled = busy || recording; });
    studio.dataset.recording = String(recording);
  };
  const preview = file => {
    player.pause(); fragmentEnd = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = file ? URL.createObjectURL(file) : null;
    if (objectUrl || original) player.src = objectUrl || original;
    else player.removeAttribute('src');
    player.hidden = !objectUrl && !original;
    edit.hidden = player.hidden;
    get('editor-file-name').textContent = file
      ? `${file.name} · ${(file.size / 1024 / 1024).toLocaleString('ru', { maximumFractionDigits: 1 })} МБ`
      : original ? 'Текущая запись сохранена' : 'Файл не выбран';
  };
  const attach = file => {
    if (file.size > 10_000_000) throw new Error('Фрагмент больше 10 МБ. Уменьшите его длину.');
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
    preview(file); previewIsSource = false;
  };
  const decode = async blob => {
    audioContext = new AudioContext();
    try { return await audioContext.decodeAudioData(await blob.arrayBuffer()); }
    finally { await audioContext.close(); audioContext = null; }
  };
  const bounds = () => {
    const from = Number(start.value), to = Number(end.value);
    if (start.value === '' || end.value === '' || !Number.isFinite(from) || !Number.isFinite(to) ||
        from < 0 || to > buffer.duration + 0.001 || to - from < 0.1)
      throw new Error('Укажите начало и конец: фрагмент должен быть не короче 0,1 секунды и находиться внутри записи.');
    return [from, Math.min(to, buffer.duration)];
  };
  const syncSelection = () => {
    if (!buffer || !waveform) return;
    const from = Math.max(0, Math.min(Number(start.value) || 0, buffer.duration));
    const to = Math.max(from, Math.min(Number(end.value) || 0, buffer.duration));
    rangeStart.max = rangeEnd.max = String(buffer.duration);
    rangeStart.value = String(from); rangeEnd.value = String(to);
    const format = value => `${value.toLocaleString('ru', { maximumFractionDigits: 2 })} сек.`;
    rangeStart.setAttribute('aria-valuetext', format(from)); rangeEnd.setAttribute('aria-valuetext', format(to));
    const width = waveform.clientWidth, travel = Math.max(0, width - 18);
    const selection = get('audio-waveform-selection');
    selection.style.left = `${9 + travel * from / buffer.duration}px`;
    selection.style.right = `${9 + travel * (1 - to / buffer.duration)}px`;
    get('audio-selection-duration').textContent = `Выбрано: ${format(to - from)}`;
  };
  const drawWaveform = () => {
    if (!buffer || !canvas || trim.hidden || !waveform.clientWidth) return;
    const width = waveform.clientWidth, height = waveform.clientHeight, scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = '#46735e';
    const samples = buffer.getChannelData(0), bars = Math.max(1, Math.floor((width - 18) / 3));
    for (let bar = 0; bar < bars; bar++) {
      const first = Math.floor(bar * samples.length / bars), last = Math.floor((bar + 1) * samples.length / bars);
      let peak = 0;
      for (let i = first; i < last; i++) peak = Math.max(peak, Math.abs(samples[i]));
      const amplitude = Math.max(2, Math.min(height - 16, peak * (height - 16)));
      ctx.fillRect(9 + bar * 3, (height - amplitude) / 2, 2, amplitude);
    }
    const ruler = get('audio-waveform-ruler'); ruler.replaceChildren();
    for (let tick = 0; tick <= 4; tick++) {
      const label = document.createElement('span');
      label.textContent = `${(buffer.duration * tick / 4).toLocaleString('ru', { maximumFractionDigits: 1 })} с`;
      ruler.append(label);
    }
    syncSelection();
  };
  const wav = async (from, to) => {
    const frames = Math.max(1, Math.round((to - from) * sampleRate));
    if (frames * 2 + 44 > 10_000_000) throw new Error('Фрагмент больше 10 МБ. Уменьшите его длину.');
    const offline = new OfflineAudioContext(1, frames, sampleRate);
    const source = offline.createBufferSource(); source.buffer = buffer; source.connect(offline.destination);
    source.start(0, from, to - from);
    const samples = (await offline.startRendering()).getChannelData(0);
    const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
    const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((value, i) => { const v = Math.max(-1, Math.min(1, value)); view.setInt16(44 + i * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true); });
    return new File([bytes], 'ossetian-recording.wav', { type: 'audio/wav' });
  };
  const showTrim = () => {
    start.value = '0'; end.value = String(Math.floor(buffer.duration * 1000) / 1000);
    start.max = end.max = String(buffer.duration); dirty = false; trim.hidden = false;
    drawWaveform();
  };
  const report = error => message(/[а-яё]/i.test(error.message || '') ? error.message : 'Не удалось обработать запись. Попробуйте другой файл.');
  const stopRecording = () => {
    if (recorder?.state === 'recording') recorder.stop();
    releaseMic(); recording = false; busy = true; update();
    message('Подготавливаем запись…');
  };
  record.addEventListener('click', async () => {
    busy = true; update(); message('Разрешите доступ к микрофону в браузере.');
    const current = ++generation;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation) { releaseMic(); return; }
      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      let failed = false;
      recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('error', () => { failed = true; releaseMic(); recording = busy = false; update(); message('Запись прервалась. Попробуйте ещё раз.'); });
      recorder.addEventListener('stop', async () => {
        releaseMic(); recording = false;
        if (failed || current !== generation) return;
        busy = true; update();
        try {
          const decoded = await decode(new Blob(chunks, { type: recorder.mimeType }));
          if (current !== generation) return;
          buffer = decoded;
          const file = await wav(0, Math.min(buffer.duration, maxSeconds));
          buffer = await decode(file);
          attach(file); sourceFile = file; previewIsSource = true; replacing = false; showTrim();
          message('Запись готова. Прослушайте её или оставьте нужный фрагмент.');
        } catch (error) { report(error); }
        finally { busy = false; update(); }
      });
      recorder.start(250); busy = false; recording = true; trim.hidden = true; player.pause(); update();
      const began = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - began) / 1000;
        message(`Идёт запись · ${time(elapsed)} / ${time(maxSeconds)}`);
        if (elapsed >= maxSeconds) stopRecording();
      };
      tick(); timer = setInterval(tick, 250);
    } catch (error) {
      releaseMic(); busy = recording = false; update();
      message(error.name === 'NotAllowedError' ? 'Доступ к микрофону закрыт. Разрешите его в настройках браузера или выберите файл.'
        : error.name === 'NotFoundError' ? 'Микрофон не найден. Подключите его или выберите файл.' : 'Не удалось включить микрофон. Проверьте устройство или выберите файл.');
    }
  });
  stop.addEventListener('click', stopRecording);
  replace?.addEventListener('click', () => { replacing = true; update(); record.focus(); });
  input.addEventListener('change', () => {
    generation++; buffer = null; sourceFile = input.files[0]; dirty = false; replacing = false; trim.hidden = true;
    preview(sourceFile); previewIsSource = true; message('');
    update();
  });
  edit.addEventListener('click', async () => {
    if (buffer) { trim.hidden = !trim.hidden; drawWaveform(); return; }
    busy = true; update(); message('Открываем запись для обрезки…');
    const current = generation;
    try {
      let file = sourceFile;
      if (!file) { const response = await fetch(original); if (!response.ok) throw new Error('Не удалось загрузить сохранённую запись.'); file = await response.blob(); }
      if (file.size > 10_000_000) throw new Error('Для обрезки выберите файл до 10 МБ.');
      const decoded = await decode(file);
      if (current !== generation) return;
      buffer = decoded; showTrim(); message('Выберите границы фрагмента.');
    } catch (error) { report(error); }
    finally { busy = false; update(); }
  });
  const selectionChanged = () => { dirty = true; fragmentEnd = null; player.pause(); syncSelection(); message('Прослушайте фрагмент и примените обрезку.'); };
  [start, end].forEach(field => field.addEventListener('input', selectionChanged));
  rangeStart?.addEventListener('input', () => { start.value = String(Math.max(0, Math.min(Number(rangeStart.value), Number(end.value) - .1))); selectionChanged(); });
  rangeEnd?.addEventListener('input', () => { end.value = String(Math.min(buffer.duration, Math.max(Number(rangeEnd.value), Number(start.value) + .1))); selectionChanged(); });
  get('audio-trim-listen').addEventListener('click', async () => {
    try {
      const [from, to] = bounds();
      // The preview may currently contain a cropped file: audition the full source.
      if (!previewIsSource) { preview(sourceFile); previewIsSource = true; }
      if (player.readyState < 1) await new Promise((resolve, reject) => {
        player.addEventListener('loadedmetadata', resolve, { once: true });
        player.addEventListener('error', () => reject(new Error('Не удалось прослушать запись.')), { once: true });
      });
      player.currentTime = from; fragmentEnd = to; await player.play();
    } catch (error) { report(error); }
  });
  player.addEventListener('timeupdate', () => {
    if (fragmentEnd !== null && player.currentTime >= fragmentEnd) { player.pause(); fragmentEnd = null; }
    if (buffer && waveform) {
      const head = get('audio-waveform-playhead'); head.hidden = false;
      const position = Math.min(1, (player.currentTime + (previewIsSource ? 0 : cropFrom)) / buffer.duration);
      head.style.left = `${9 + Math.max(0, waveform.clientWidth - 18) * position}px`;
    }
  });
  get('audio-trim-apply').addEventListener('click', async () => {
    try {
      const [from, to] = bounds(); busy = true; update(); player.pause();
      attach(await wav(from, to)); cropFrom = from; dirty = false;
      message(`Оставлен фрагмент ${from.toLocaleString('ru')}–${to.toLocaleString('ru')} сек. Сохраните черновик.`);
    } catch (error) { report(error); }
    finally { busy = false; update(); }
  });
  get('audio-trim-reset').addEventListener('click', () => {
    start.value = '0'; end.value = String(Math.floor(buffer.duration * 1000) / 1000); dirty = true;
    syncSelection();
    message('Выбрана вся запись. Нажмите «Применить обрезку», чтобы сохранить её целиком.');
  });
  studio.closest('form').addEventListener('submit', event => {
    if (recording || busy || dirty) {
      event.preventDefault(); message(recording ? 'Сначала остановите запись.' : busy ? 'Подождите окончания обработки записи.' : 'Сначала примените выбранные границы обрезки.');
      (recording ? stop : dirty ? get('audio-trim-apply') : status).focus();
    }
  });
  const cleanup = () => { generation++; releaseMic(); if (recorder?.state === 'recording') recorder.stop(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  window.addEventListener('pagehide', cleanup);
  if (waveform) new ResizeObserver(drawWaveform).observe(waveform);
  document.addEventListener('visibilitychange', () => { if (document.hidden && recording) stopRecording(); });
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) message('Запись с микрофона недоступна в этом браузере. Можно загрузить готовый файл.');
  preview(null); update();
})();
