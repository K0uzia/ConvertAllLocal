/** Nom du produit affiché dans l'interface. */
export const brandName = 'Converter';

/** Société éditrice (site hébergé en sous-domaine de kouzia.com). */
export const companyName = 'Kouzia';

/** Identifiant dépôt GitHub (sans espaces). */
export const brandRepo = 'ConvertAllLocal';

/** URL canonique de production (définie au build via `site` dans astro.config). */
export const siteUrl = import.meta.env.SITE;

/** Préfixe de déploiement Astro (`/ConvertAllLocal/` sur GitHub Pages, `/` en racine). */
export const basePath = import.meta.env.BASE_URL;

/** URL d'un asset dans `public/` (logo, favicon…). */
export function assetUrl(path: string): string {
  const slug = path.replace(/^\//, '');
  return `${basePath}${slug}`;
}

/** URL interne du site (pages et ancres d'accueil). */
export function pageUrl(path: string): string {
  if (!path || path === '/') return basePath;
  if (path.startsWith('/#')) return `${basePath.replace(/\/$/, '')}${path}`;
  if (path.startsWith('#')) return `${basePath}${path}`;
  const slug = path.replace(/^\//, '');
  return `${basePath}${slug}`;
}

export const defaultDescription =
  'Convertisseur de fichiers 100 % local dans le navigateur : images, audio, documents et PDF. Gratuit, open source, sans envoi sur un serveur.';

export const githubUrl = `https://github.com/K0uzia/${brandRepo}`;
export const githubIssuesUrl = `${githubUrl}/issues`;

/** Ancres de la page d'accueil (préfixées par `base` pour GitHub Pages). */
export const homeSections = {
  convertir: pageUrl('convertir/'),
  comment: pageUrl('/#comment-convertir'),
  formats: pageUrl('/#formats'),
  apropos: pageUrl('/#apropos'),
} as const;

export const headerNav = [
  { href: homeSections.comment, label: 'Comment convertir' },
  { href: homeSections.formats, label: 'Formats' },
  { href: homeSections.apropos, label: 'À propos' },
] as const;
