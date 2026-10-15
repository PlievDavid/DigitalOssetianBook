(() => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const toggle = header.querySelector('.mobile-menu-toggle');
    const backdrop = document.querySelector('.menu-backdrop');
    const outside = [...document.querySelectorAll('#main-content, .site-footer, .mobile-bottom-nav')];
    const menus = [...header.querySelectorAll('.nav-menu')];
    let suppressFocusOpen = false;
    const compact = window.matchMedia('(max-width: 1023px)');
    const closeMenus = () => {
        menus.forEach(menu => {
            menu.classList.remove('is-open', 'is-pinned');
            menu.querySelector('.nav-menu-trigger').setAttribute('aria-expanded', String(compact.matches && header.classList.contains('mobile-is-open') && menu.classList.contains('nav-menu-section')));
        });
    };
    const setMobile = open => {
        header.classList.toggle('mobile-is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        document.body.classList.toggle('mobile-nav-open', open && compact.matches);
        backdrop.hidden = !open || !compact.matches;
        outside.forEach(element => { element.inert = open && compact.matches; });
        toggle.querySelector('svg').innerHTML = open ? '<path d="m6 6 12 12M18 6 6 18"/>' : '<path d="M3 6h18M3 12h18M3 18h18"/>';
        menus.filter(menu => menu.classList.contains('nav-menu-section')).forEach(menu => {
            menu.querySelector('.nav-menu-trigger').setAttribute('aria-expanded', String(open));
        });
        if (!open) closeMenus();
    };
    menus.forEach(menu => {
        const trigger = menu.querySelector('.nav-menu-trigger');
        const setMenu = (open, pinned = false) => {
            closeMenus();
            menu.classList.toggle('is-open', open);
            menu.classList.toggle('is-pinned', open && pinned);
            trigger.setAttribute('aria-expanded', String(open || (compact.matches && header.classList.contains('mobile-is-open') && menu.classList.contains('nav-menu-section'))));
        };
        if (trigger.tagName === 'BUTTON') trigger.addEventListener('click', () => {
            const open = !menu.classList.contains('is-pinned');
            setMenu(open, open);
        });
        trigger.addEventListener('keydown', event => {
            if (event.key !== 'ArrowDown') return;
            event.preventDefault();
            setMenu(true, true);
            menu.querySelector('.nav-menu-panel a')?.focus();
        });
        trigger.addEventListener('focus', () => {
            if (!suppressFocusOpen && !compact.matches && trigger.matches(':focus-visible')) setMenu(true);
        });
        menu.addEventListener('pointerenter', event => {
            if (!compact.matches && event.pointerType === 'mouse' && !menu.classList.contains('is-pinned')) setMenu(true);
        });
        menu.addEventListener('pointerleave', event => {
            if (!compact.matches && event.pointerType === 'mouse' && !menu.classList.contains('is-pinned') && !menu.contains(document.activeElement)) setMenu(false);
        });
        menu.addEventListener('focusout', event => {
            if (!menu.contains(event.relatedTarget)) setMenu(false);
        });
    });
    toggle.addEventListener('click', () => setMobile(!header.classList.contains('mobile-is-open')));
    backdrop.addEventListener('click', () => { setMobile(false); toggle.focus(); });
    document.addEventListener('click', event => {
        if (!event.composedPath().includes(header)) setMobile(false);
        if (header.querySelector('.main-nav').contains(event.target) && event.target.closest('a')) setMobile(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Tab' && compact.matches && header.classList.contains('mobile-is-open')) {
            const focusable = [...header.querySelectorAll('a, button')].filter(el => el.getClientRects().length && !el.closest('[hidden]'));
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        if (event.key !== 'Escape') return;
        const activeMenu = menus.find(menu => menu.contains(document.activeElement));
        const wasMobileOpen = header.classList.contains('mobile-is-open');
        setMobile(false);
        if (wasMobileOpen) toggle.focus();
        else if (activeMenu) {
            suppressFocusOpen = true;
            activeMenu.querySelector('.nav-menu-trigger').focus();
            suppressFocusOpen = false;
        }
    });
    compact.addEventListener('change', () => setMobile(false));
    document.querySelector('.hero-actions a[href="#practice-formats"]')?.addEventListener('click', () => {
        document.getElementById('practice-formats').focus({ preventScroll: true });
    });
})();
