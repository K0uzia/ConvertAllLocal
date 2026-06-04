function getScrollTop(): number {
  return document.body.scrollTop || document.documentElement.scrollTop || window.scrollY || 0;
}

export function initHeaderScroll(): void {
  const end = document.querySelector<HTMLElement>('.header__end');
  if (!end) return;

  const threshold = 16;
  const scrollRoot = document.body;

  const onScroll = (): void => {
    end.classList.toggle('is-scrolled', getScrollTop() > threshold);
  };

  if (scrollRoot.dataset.headerScrollBound !== 'true') {
    scrollRoot.dataset.headerScrollBound = 'true';
    scrollRoot.addEventListener('scroll', onScroll, { passive: true });
  }

  onScroll();
}
