(() => {
    const root = document.getElementById("progress-app");
    if (!root) return;

    const status = document.getElementById("progress-status");
    const retry = document.getElementById("progress-retry");
    const awards = document.getElementById("progress-awards");
    const list = document.getElementById("progress-achievements");
    const empty = document.getElementById("progress-empty");
    const template = document.getElementById("progress-award-template");
    const names = new Map([
        ["first", "Первое занятие"],
        ["streak-7", "7 дней подряд"],
        ["streak-30", "30 дней подряд"]
    ]);

    function showAwards(codes) {
        if (!awards) return;
        const items = codes.map(code => {
            const item = template.content.cloneNode(true);
            item.querySelector("strong").textContent = names.get(code) ?? code;
            return item;
        });
        list.replaceChildren(...items);
        list.hidden = items.length === 0;
        empty.hidden = items.length > 0;
        awards.hidden = false;
    }

    async function load() {
        if (retry?.getAttribute("aria-disabled") === "true") return;
        retry?.setAttribute("aria-disabled", "true");
        status.textContent = "Загружаем результаты…";
        try {
            const data = await AdamApi("/progress");
            document.getElementById("progress-points").textContent = data.points;
            document.getElementById("progress-streak").textContent = data.streak;
            showAwards(data.achievements);
            status.textContent = "";
            if (retry) {
                if (document.activeElement === retry) root.querySelector("h1").focus();
                retry.hidden = true;
            }
        } catch {
            status.textContent = "Не удалось загрузить результаты.";
            if (retry) retry.hidden = false;
        } finally {
            retry?.removeAttribute("aria-disabled");
        }
    }

    retry?.addEventListener("click", load);
    load();
})();
