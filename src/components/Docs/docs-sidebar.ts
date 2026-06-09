/** Mémorise l’ouverture des guides dans la sidebar doc (plusieurs peuvent rester ouverts). */
const STORAGE_KEY = 'docs-sidebar-open';

function readOpenSlugs(): string[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return null;
  }
}

function writeOpenSlugs(slugs: string[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    /* quota ou mode privé */
  }
}

function isMobileSidebar(): boolean {
  return window.matchMedia('(max-width: 1023px)').matches;
}

function syncDetailsState(nav: HTMLElement): void {
  const stored = readOpenSlugs();
  const groups = [...nav.querySelectorAll<HTMLDetailsElement>('.docs__sidebar-group')];
  const mobile = isMobileSidebar();

  if (stored) {
    const openSet = new Set(stored);
    for (const group of groups) {
      const slug = group.querySelector<HTMLElement>('[id^="docs-nav-"]')?.id.replace('docs-nav-', '');
      if (!slug) continue;
      group.open = openSet.has(slug);
    }
    return;
  }

  if (mobile) {
    for (const group of groups) {
      group.open = group.classList.contains('is-active');
    }
    return;
  }

  for (const group of groups) {
    group.open = true;
  }
}

function bindArticleLinkToggle(nav: HTMLElement): void {
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('.docs__sidebar-article-link')];

  for (const link of links) {
    if (link.dataset.docsSidebarLinkBound === 'true') continue;
    link.dataset.docsSidebarLinkBound = 'true';

    link.addEventListener('click', (event) => {
      if (isMobileSidebar()) {
        const group = link.closest<HTMLDetailsElement>('.docs__sidebar-group');
        if (!group) return;
        event.preventDefault();
        event.stopPropagation();
        group.open = !group.open;
        return;
      }

      event.stopPropagation();
    });
  }
}

function bindDetailsPersistence(nav: HTMLElement): void {
  const groups = [...nav.querySelectorAll<HTMLDetailsElement>('.docs__sidebar-group')];

  for (const group of groups) {
    if (group.dataset.docsSidebarBound === 'true') continue;
    group.dataset.docsSidebarBound = 'true';

    group.addEventListener('toggle', () => {
      const openSlugs = groups
        .filter((item) => item.open)
        .map((item) => item.querySelector<HTMLElement>('[id^="docs-nav-"]')?.id.replace('docs-nav-', ''))
        .filter((slug): slug is string => Boolean(slug));
      writeOpenSlugs(openSlugs);
    });
  }
}

export function initDocsSidebar(): void {
  const nav = document.querySelector<HTMLElement>('.docs__sidebar-nav');
  if (!nav) return;

  syncDetailsState(nav);
  bindArticleLinkToggle(nav);
  bindDetailsPersistence(nav);
}
