/** Survol hero : calque accent du motif géométrique. */
type HeroGeoHaloState = {
  onMove: () => void;
  onLeave: () => void;
};

let activeHalo: HeroGeoHaloState | null = null;

function teardown(): void {
  if (!activeHalo) return;
  document.removeEventListener('mousemove', activeHalo.onMove);
  document.documentElement.removeEventListener('mouseleave', activeHalo.onLeave);
  document.documentElement.style.removeProperty('--hero-geo-halo-opacity');
  activeHalo = null;
}

export function initHeroGeoHalo(): void {
  teardown();

  if (!document.querySelector('.hero-geo__halo')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const root = document.documentElement;

  const onMove = (): void => {
    const strength =
      getComputedStyle(root).getPropertyValue('--hero-geo-halo-strength').trim() || '0.55';
    root.style.setProperty('--hero-geo-halo-opacity', strength);
  };

  const onLeave = (): void => {
    root.style.setProperty('--hero-geo-halo-opacity', '0');
  };

  root.style.setProperty('--hero-geo-halo-opacity', '0');
  document.addEventListener('mousemove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave);
  activeHalo = { onMove, onLeave };
}

/** @deprecated Utiliser initHeroGeoHalo */
export function initSiteGeoHalo(): void {
  initHeroGeoHalo();
}
