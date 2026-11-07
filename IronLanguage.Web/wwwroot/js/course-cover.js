(() => {
  const input = document.getElementById('course-cover');
  if (!input) return;
  const preview = document.getElementById('course-cover-preview');
  const image = document.getElementById('course-cover-image');
  const remove = document.getElementById('course-cover-remove');
  const original = image.getAttribute('src');
  let objectUrl = null;
  input.addEventListener('change', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = input.files.length ? URL.createObjectURL(input.files[0]) : null;
    if (objectUrl) remove.checked = false;
    image.hidden = remove.checked;
    image.src = objectUrl || original || '';
    preview.hidden = !objectUrl && !original;
  });
  remove.addEventListener('change', () => {
    if (remove.checked) { input.value = ''; if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null; image.src = original || ''; }
    image.hidden = remove.checked;
  });
})();
