(() => {
  if (!document.getElementById("progress-app")) return;
  AdamApi("/progress").then(data => {
    document.getElementById("progress-points").textContent = data.points;
    document.getElementById("progress-streak").textContent = data.streak;
    const list = document.getElementById("progress-achievements");
    const names = { first: "Первое занятие", "streak-7": "7 дней подряд", "streak-30": "30 дней подряд" };
    data.achievements.forEach(code => { const li = document.createElement("li"); li.textContent = names[code] || code; list.append(li); });
    document.getElementById("progress-status").textContent = data.achievements.length ? "Продолжайте заниматься!" : "Первая награда появится после завершения занятия.";
  }).catch(error => { document.getElementById("progress-status").textContent = error.message; });
})();
