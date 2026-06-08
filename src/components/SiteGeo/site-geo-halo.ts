/** Halo accent sur le fond géométrique au survol. */
type SiteGeoHaloState = {
  onMove: (event: MouseEvent) => void;
  onLeave: () => void;
};

let activeHalo: SiteGeoHaloState | null = null;

function teardown(): void {
  if (!activeHalo) return;
  document.removeEventListener('mousemove', activeHalo.onMove);
  document.documentElement.removeEventListener('mouseleave', activeHalo.onLeave);
  document.documentElement.style.removeProperty('--site-geo-halo-x');
  document.documentElement.style.removeProperty('--site-geo-halo-y');
  document.documentElement.style.removeProperty('--site-geo-halo-opacity');
  activeHalo = null;
}

export function initSiteGeoHalo(): void {
  teardown();

  if (!document.querySelector('.site-geo')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const root = document.documentElement;

  const onMove = (event: MouseEvent): void => {
    root.style.setProperty('--site-geo-halo-x', `${event.clientX}px`);
    root.style.setProperty('--site-geo-halo-y', `${event.clientY}px`);
    const strength =
      getComputedStyle(root).getPropertyValue('--site-geo-halo-strength').trim() || '0.55';
    root.style.setProperty('--site-geo-halo-opacity', strength);
  };

  const onLeave = (): void => {
    root.style.setProperty('--site-geo-halo-opacity', '0');
  };

  root.style.setProperty('--site-geo-halo-opacity', '0');
  document.addEventListener('mousemove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave);
  activeHalo = { onMove, onLeave };
}
