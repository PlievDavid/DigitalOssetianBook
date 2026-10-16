(() => {
  if (!document.getElementById("progress-app")) return;
  AdamApi("/progress").then(data => {
    document.getElementById("progress-points").textContent = data.points;
    document.getElementById("progress-streak").textContent = data.streak;
    const list = document.getElementById("progress-achievements");
    const names = { first: "Первое занятие", "streak-7": "7 дней подряд", "streak-30": "30 дней подряд" };
    data.achievements.forEach(code => { const li = document.createElement("li"); li.textContent = names[code] || code; list.append(li); });
    if (!data.achievements.length) { const empty = document.createElement("li"); empty.textContent = "Пока нет наград. Продолжайте заниматься, чтобы получить первую."; list.append(empty); }
    document.getElementById("progress-status").textContent = data.achievements.length ? "Продолжайте заниматься!" : "Первая награда появится после завершения занятия.";
    if (document.getElementById("progress-app").classList.contains("mobile-profile-results")) document.getElementById("progress-status").textContent = "";
  }).catch(error => { document.getElementById("progress-status").textContent = error.message; });
})();
