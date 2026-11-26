(() => {
  const confirmation = document.querySelector(".editor-publish-form [name=confirmReviewed]");
  if (!confirmation) return;
  window.addEventListener("pageshow", () => { confirmation.checked = false; });
})();
