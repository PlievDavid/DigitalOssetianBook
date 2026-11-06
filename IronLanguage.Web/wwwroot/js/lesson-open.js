(() => {
  const form = document.getElementById('lesson-open');
  if (form?.dataset.autoOpen === 'true') { form.hidden = true; form.requestSubmit(); }
})();
