(() => {
  const badge = document.getElementById('header-streak');
  if (!badge) return;
  AdamApi('/progress').then(progress => {
    if (!Number.isInteger(progress.streak) || progress.streak < 1) return;
    document.getElementById('header-streak-value').textContent = progress.streak;
    const lastTwo = progress.streak % 100;
    const last = progress.streak % 10;
    const day = lastTwo >= 11 && lastTwo <= 14 ? 'дней' : last === 1 ? 'день' : last >= 2 && last <= 4 ? 'дня' : 'дней';
    document.getElementById('header-streak-label').textContent = `${day} подряд`;
    badge.setAttribute('aria-label', `Серия занятий: ${progress.streak} ${day} подряд`);
    badge.hidden = false;
  }).catch(() => {});
})();
