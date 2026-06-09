function setMenuOpen(btn: HTMLButtonElement, panel: HTMLElement, open: boolean): void {
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
  panel.hidden = !open;
  btn.classList.toggle('header__menu-btn--open', open);
}

function bindHeaderMenu(header: HTMLElement): void {
  if (header.dataset.headerMenuBound === 'true') return;

  const btn = header.querySelector<HTMLButtonElement>('[data-header-menu-btn]');
  const panel = header.querySelector<HTMLElement>('[data-header-mobile-nav]');
  if (!btn || !panel) return;

  header.dataset.headerMenuBound = 'true';
  setMenuOpen(btn, panel, false);

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    setMenuOpen(btn, panel, panel.hidden);
  });

  panel.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(btn, panel, false));
  });
}

export function initHeaderMenu(): void {
  document.querySelectorAll<HTMLElement>('.header').forEach(bindHeaderMenu);

  if (document.documentElement.dataset.headerMenuDocBound === 'true') return;
  document.documentElement.dataset.headerMenuDocBound = 'true';

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll<HTMLElement>('.header').forEach((header) => {
      const btn = header.querySelector<HTMLButtonElement>('[data-header-menu-btn]');
      const panel = header.querySelector<HTMLElement>('[data-header-mobile-nav]');
      if (!btn || !panel || panel.hidden) return;
      setMenuOpen(btn, panel, false);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    document.querySelectorAll<HTMLElement>('.header').forEach((header) => {
      const btn = header.querySelector<HTMLButtonElement>('[data-header-menu-btn]');
      const panel = header.querySelector<HTMLElement>('[data-header-mobile-nav]');
      if (!btn || !panel || panel.hidden) return;
      if (header.contains(target)) return;
      setMenuOpen(btn, panel, false);
    });
  });

  const desktopMenuQuery = window.matchMedia('(min-width: 768px)');

  const closeMenusOnDesktop = (): void => {
    if (!desktopMenuQuery.matches) return;
    document.querySelectorAll<HTMLElement>('.header').forEach((header) => {
      const btn = header.querySelector<HTMLButtonElement>('[data-header-menu-btn]');
      const panel = header.querySelector<HTMLElement>('[data-header-mobile-nav]');
      if (!btn || !panel || panel.hidden) return;
      setMenuOpen(btn, panel, false);
    });
  };

  desktopMenuQuery.addEventListener('change', closeMenusOnDesktop);
  closeMenusOnDesktop();
}
