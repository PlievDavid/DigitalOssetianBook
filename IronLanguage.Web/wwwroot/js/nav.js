(() => {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const toggle = header.querySelector('.mobile-menu-toggle');
    const games = document.querySelector('.bottom-games');
    const menus = [...header.querySelectorAll('.nav-menu')];
    const compact = window.matchMedia('(max-width: 1023px)');
    const closeMenus = () => {
        games.setAttribute('aria-expanded', 'false');
        menus.forEach(menu => {
            menu.classList.remove('is-open');
            menu.querySelector('.nav-menu-trigger').setAttribute('aria-expanded', 'false');
        });
    };
    const setMobile = open => {
        header.classList.toggle('mobile-is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
        games.setAttribute('aria-expanded', String(open && header.querySelector('.nav-menu-games.is-open') !== null));
        if (!open) closeMenus();
    };
    menus.forEach(menu => {
        const trigger = menu.querySelector('.nav-menu-trigger');
        const setMenu = open => {
            closeMenus();
            menu.classList.toggle('is-open', open);
            trigger.setAttribute('aria-expanded', String(open));
            games.setAttribute('aria-expanded', String(compact.matches && open && menu.classList.contains('nav-menu-games')));
        };
        trigger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
        menu.addEventListener('pointerenter', event => {
            if (!compact.matches && event.pointerType === 'mouse') setMenu(true);
        });
        menu.addEventListener('pointerleave', event => {
            if (!compact.matches && event.pointerType === 'mouse' && !menu.contains(document.activeElement)) setMenu(false);
        });
        menu.addEventListener('focusout', event => {
            if (!menu.contains(event.relatedTarget)) setMenu(false);
        });
    });
    toggle.addEventListener('click', () => setMobile(!header.classList.contains('mobile-is-open')));
    games.addEventListener('click', () => {
        const open = games.getAttribute('aria-expanded') !== 'true';
        setMobile(open);
        if (open) {
            closeMenus();
            const menu = header.querySelector('.nav-menu-games');
            menu.classList.add('is-open');
            menu.querySelector('.nav-menu-trigger').setAttribute('aria-expanded', 'true');
            games.setAttribute('aria-expanded', 'true');
            menu.querySelector('.nav-menu-trigger').focus();
            header.scrollIntoView({ block: 'start' });
        }
    });
    document.addEventListener('click', event => {
        if (!header.contains(event.target) && !games.contains(event.target)) setMobile(false);
        if (header.querySelector('.main-nav').contains(event.target) && event.target.closest('a')) setMobile(false);
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const activeMenu = menus.find(menu => menu.contains(document.activeElement));
        const wasMobileOpen = header.classList.contains('mobile-is-open');
        setMobile(false);
        if (wasMobileOpen) toggle.focus();
        else if (activeMenu) activeMenu.querySelector('.nav-menu-trigger').focus();
    });
    compact.addEventListener('change', () => setMobile(false));
    document.querySelector('.hero-actions a[href="#first-lesson"]')?.addEventListener('click', () => {
        document.getElementById('first-lesson').focus({ preventScroll: true });
    });
})();
