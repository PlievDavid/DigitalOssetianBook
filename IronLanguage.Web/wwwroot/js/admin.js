(() => {
    const toggle = document.querySelector('.nav-toggle');
    const navigation = document.querySelector('#admin-navigation');
    function setMenu(open) {
        toggle.setAttribute('aria-expanded', String(open));
        navigation.classList.toggle('is-open', open);
    }
    toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !navigation?.classList.contains('is-open') || !toggle?.offsetWidth) return;
        setMenu(false);
        toggle.focus();
    });
    const search = document.querySelector('#q');
    const clear = document.querySelector('.clear-search');
    search?.addEventListener('input', () => { clear.hidden = search.value.length === 0; });
    clear?.addEventListener('click', () => { search.value = ''; clear.hidden = true; search.focus(); search.form.requestSubmit(); });
    const form = document.querySelector('.admin-change');
    const dialog = document.querySelector('#admin-confirm');
    if (!form || !dialog) return;
    const error = document.querySelector('.validation-summary-errors');
    error?.focus();
    let submitting = false;
    let opener;
    form.addEventListener('submit', event => {
        if (submitting) return;
        event.preventDefault();
        opener = document.activeElement;
        const action = form.querySelector('#action');
        dialog.querySelector('#confirm-description').textContent = `${action.selectedOptions[0].textContent}: ${form.dataset.target}. Причина: ${form.querySelector('#reason').value.trim() || 'не указана'}.`;
        dialog.querySelector('[data-confirm]').textContent = action.selectedOptions[0].textContent;
        dialog.showModal();
        dialog.querySelector('[data-cancel]').focus();
    });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => opener?.focus());
    dialog.querySelector('[data-confirm]').addEventListener('click', () => {
        if (submitting) return;
        submitting = true;
        dialog.close();
        form.setAttribute('aria-busy', 'true');
        form.querySelector('button[type="submit"]').disabled = true;
        form.requestSubmit();
    });
})();
