(() => {
    const rating = document.querySelector("#course-rating");
    const form = rating?.querySelector("form");
    if (!form) return;

    const stars = Array.from(form.querySelectorAll("button[name=score]"));
    const status = form.querySelector("[data-rating-status]");
    const summary = rating.querySelector("[data-rating-summary]");
    const own = form.querySelector("[data-rating-own]");
    const format = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    let saving = false;

    function preview(score) {
        if (saving) return;
        form.classList.toggle("is-previewing", score > 0);
        stars.forEach(star => star.classList.toggle("is-preview", Number(star.value) <= score));
    }

    stars.forEach(star => star.addEventListener("pointerenter", () => preview(Number(star.value))));
    form.querySelector(".course-rating-stars").addEventListener("pointerleave", () => preview(0));

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const star = event.submitter;
        if (saving || !stars.includes(star)) return;
        preview(0);
        saving = true;
        form.setAttribute("aria-busy", "true");
        status.textContent = "";
        try {
            const response = await fetch(form.action, {
                method: "POST",
                headers: { Accept: "application/json" },
                body: new FormData(form, star),
                redirect: "error"
            });
            if (!response.ok) throw new Error();
            const result = await response.json();
            stars.forEach(button => {
                const value = Number(button.value);
                button.classList.toggle("is-filled", value <= result.userScore);
                button.setAttribute("aria-pressed", String(value === result.userScore));
            });
            own.textContent = "Ваша оценка: " + result.userScore + " из 5";
            summary.textContent = "★ " + format.format(result.average) + " из 5 · оценок: " + result.count;
            star.classList.remove("is-confirmed");
            requestAnimationFrame(() => star.classList.add("is-confirmed"));
        } catch {
            status.textContent = "Не удалось сохранить. Попробуйте ещё раз.";
        } finally {
            saving = false;
            form.removeAttribute("aria-busy");
        }
    });
})();
