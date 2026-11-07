document.querySelectorAll("[data-markdown-field]").forEach(field => {
    const input = field.querySelector("textarea");
    const tools = field.querySelector(".markdown-tools");
    tools.hidden = false;

    tools.addEventListener("click", event => {
        const button = event.target.closest("button[data-format]");
        if (!button) return;
        let start = input.selectionStart;
        let end = input.selectionEnd;
        const mode = button.dataset.format;
        let replacement;
        let selectionStart;
        let selectionEnd;
        if (mode === "bold" || mode === "italic") {
            const mark = mode === "bold" ? "**" : "*";
            const selected = input.value.slice(start, end) || "текст";
            replacement = mark + selected + mark;
            selectionStart = start + mark.length;
            selectionEnd = selectionStart + selected.length;
        } else {
            start = start > 0 ? input.value.lastIndexOf("\n", start - 1) + 1 : 0;
            const lineEnd = input.value.indexOf("\n", end > start && input.value[end - 1] === "\n" ? end - 1 : end);
            end = lineEnd < 0 ? input.value.length : lineEnd;
            const prefix = mode === "heading" ? "## " : "- ";
            const selected = input.value.slice(start, end) || "текст";
            replacement = selected.split("\n").map(line => prefix + line).join("\n");
            selectionStart = start + prefix.length;
            selectionEnd = start + replacement.length;
        }
        input.focus();
        if (input.value.length - (end - start) + replacement.length > input.maxLength) return;
        input.setRangeText(replacement, start, end, "end");
        input.setSelectionRange(selectionStart, selectionEnd);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
});
