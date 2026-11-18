(() => {
    if (!('IntersectionObserver' in window) || !matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('home-arrived');
            observer.unobserve(entry.target);
        }
    });

    for (const section of document.querySelectorAll('.home-motion-section')) {
        if (section.getBoundingClientRect().top >= window.innerHeight) observer.observe(section);
    }
})();
