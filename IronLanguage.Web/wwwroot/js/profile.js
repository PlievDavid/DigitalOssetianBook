(() => {
    const dialog = document.getElementById("profile-name-dialog");
    const form = document.getElementById("profile-name-form");
    const trigger = document.getElementById("profile-name-trigger");
    const cancel = document.getElementById("profile-name-cancel");
    const field = document.getElementById("public-name");
    if (typeof dialog?.showModal !== "function" || !form || !trigger || !cancel || !field) return;

    dialog.append(form);
    trigger.hidden = false;
    cancel.hidden = false;

    function openName() {
        dialog.showModal();
        field.focus();
    }

    trigger.addEventListener("click", openName);
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
        form.reset();
        trigger.focus();
    });
    if (field.getAttribute("aria-invalid") === "true") openName();
})();
