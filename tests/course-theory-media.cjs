const { randomUUID: uuid } = require('node:crypto');

module.exports = async function checkTheoryMedia({ api, base, page, student, author, learner, guest, browser, login, fixture, check, out }) {
  const block = { id: uuid(), kind: 'theory', title: 'Объяснение с медиа', text: '' };
  const lesson = { id: uuid(), title: 'Вложения в теории', blocks: [block] };
  const draft = { title: 'Теория с вложениями', description: 'Проверка фото и видео', modules: [{ id: uuid(), title: 'Теория', lessons: [lesson] }] };
  const created = (await api(page, '/author/courses', 'POST', draft)).data;
  const url = '/author/courses/' + created.id;
  const open = async () => { await page.goto(base + url); await page.getByRole('button', { name: 'Редактировать', exact: true }).click(); };
  const save = async () => {
    await page.getByRole('button', { name: 'Готово', exact: true }).click();
    await page.getByText('Все изменения сохранены', { exact: true }).waitFor();
    return (await api(page, url)).data;
  };
  const publish = saved => api(page, url + '/publish', 'POST', { stamp: saved.draftStamp, reviewed: true });
  const start = async () => (await api(student, `/courses/${created.id}/lessons/${lesson.id}/sessions`, 'POST', {})).data.id;
  await open();
  const media = page.locator('.cs-theory-media');
  const file = media.locator('input[type=file]');
  await file.setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await media.getByRole('status').filter({ hasText: 'не соответствует' }).waitFor();
  check(true, 'Проверяется содержимое файла, а не только расширение');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
  const rejectedUpload = await author.request.post(base + '/api/v1' + url + '/theory-media', {
    multipart: { file: { name: 'theory.png', mimeType: 'image/png', buffer: png } }
  });
  check(rejectedUpload.status() === 400, 'Загрузка принимает запрос без CSRF');
  await file.setInputFiles({ name: 'theory.png', mimeType: 'image/png', buffer: png });
  await media.getByRole('status').filter({ hasText: 'Фото добавлено.' }).waitFor();
  let saved = await save();
  const issues = (await api(page, url + '/publication-issues')).data;
  check(issues.some(issue => issue.blockId === block.id && issue.message.includes('описание изображения')), 'Фото можно опубликовать без описания');
  const storedImage = JSON.parse(saved.draftJson).modules[0].lessons[0].blocks[0].theoryMedia;
  const authorImage = base + '/api/v1/author/theory-media/' + storedImage.file;
  check((await author.request.get(authorImage)).status() === 200, 'Автор не может открыть своё фото');
  check((await learner.request.get(authorImage)).status() === 403, 'Ученик открыл файл из черновика');
  const other = await browser.newContext();
  try {
    const colleague = await other.newPage();
    await login(colleague, fixture.other);
    await colleague.goto(base + '/courses/teaching');
    check((await other.request.get(authorImage)).status() === 404, 'Чужой автор открыл файл из черновика');
    block.theoryMedia = { ...storedImage, alt: 'Чужое фото' };
    check((await api(colleague, '/author/courses', 'POST', draft)).status === 400, 'Чужой автор прикрепил файл по известному имени');
    delete block.theoryMedia;
  } finally { await other.close(); }
  await open();
  await media.getByLabel('Описание изображения').fill('Изображение для проверки');
  await media.getByLabel('Подпись к вложению').fill('Подпись к фото');
  saved = await save();
  check((await publish(saved)).status === 200, 'Фото с описанием не публикуется без текста');
  await student.goto(base + '/courses/sessions/' + await start());
  const image = student.getByRole('img', { name: 'Изображение для проверки' });
  await image.waitFor();
  await student.waitForFunction(() => document.querySelector('.cv-theory-media img')?.naturalWidth > 0);
  const imageUrl = await image.getAttribute('src');
  check((await guest.request.get(base + imageUrl)).status() === 404, 'Чужая сессия открывает фото');

  await open();
  check(await media.getByLabel('Подпись к вложению').inputValue() === 'Подпись к фото', 'Подпись не сохранилась после перезагрузки');
  // A synthetic two-frame, 80×48 VP8 clip with a duration of half a second.
  const clip = Buffer.from('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZ0DKFUmpZqAq17GDD0JARImIQH9AAAAAAABNgIRBZGFtV0GEQWRhbRZUrmubrpnXgQFzxYEBg4EBhoVWX1ZQOOCGsIFQuoEwH0O2dUB/54EAo7yBAACAkAMAnQEqUAAwAD6RSKFMpaQjIiIoALASCWkAABBoVZyELjfEAAD+8LAX/4i0tzdUrkOpRQAAAACjvIEA+oCwAwCdASpQADAAPpFIoEylpCMiIigAsBIJaQDT2AY7jfU1AFdQAAD+9DUSGZNZcwvAohWEqIAAAA==', 'base64');
  await file.setInputFiles({ name: 'theory.webm', mimeType: 'video/webm', buffer: clip });
  await media.getByRole('status').filter({ hasText: 'Видео добавлено.' }).waitFor();
  await media.getByLabel('Подпись к вложению').fill('Подпись к видео');
  await page.setViewportSize({ width: 390, height: 840 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Вложение переполняет мобильный редактор');
  await page.screenshot({ path: out + '/theory-media-editor-phone.png', fullPage: true });
  saved = await save();
  check((await publish(saved)).status === 200, 'Видео не публикуется');
  check((await api(student, '/courses/' + created.id)).data.completedBlocks === 0, 'Замена вложения сохранила зачёт изменённого блока');
  check((await learner.request.get(base + imageUrl)).status() === 200, 'Новая публикация сломала вложение исторической сессии');
  await student.goto(base + '/courses/sessions/' + await start());
  const video = student.locator('.cv-theory-media video');
  await video.waitFor();
  await student.waitForFunction(() => document.querySelector('.cv-theory-media video')?.readyState >= 1);
  const videoUrl = await video.getAttribute('src');
  check((await learner.request.get(base + videoUrl, { headers: { Range: 'bytes=0-15' } })).status() === 206, 'Видео не поддерживает загрузку по частям');
  check(await video.evaluate(player => player.controls && !player.autoplay), 'Воспроизведение видео нельзя контролировать');
  check(await video.evaluate(async player => {
    player.muted = true;
    await player.play();
    player.pause();
    const seeked = new Promise(resolve => player.addEventListener('seeked', resolve, { once: true }));
    player.currentTime = 0.25;
    const reached = await Promise.race([seeked.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 2000))]);
    return reached && player.currentTime >= 0.2;
  }), 'Видео не воспроизводится или не перематывается');
  await student.screenshot({ path: out + '/theory-media-learner-phone.png', fullPage: true });
  await open();
  await media.getByRole('button', { name: 'Убрать вложение', exact: true }).click();
  saved = await save();
  check(JSON.parse(saved.draftJson).modules[0].lessons[0].blocks[0].theoryMedia === null &&
    (await learner.request.get(base + videoUrl)).status() === 200, 'Удаление из черновика затронуло опубликованное видео');
};
