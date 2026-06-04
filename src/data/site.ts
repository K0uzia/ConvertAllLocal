/** Nom affiché dans l'interface (ConvertAllLocal = Convert All Local). */
export const brandName = 'Convert All Local';

/** Identifiant dépôt GitHub (sans espaces). */
export const brandRepo = 'ConvertAllLocal';

export const githubUrl = `https://github.com/K0uzia/${brandRepo}`;
export const githubIssuesUrl = `${githubUrl}/issues`;

/** Ancres de la page d'accueil (chemins absolus pour les pages secondaires). */
export const homeSections = {
  convertir: '/convertir',
  comment: '/#comment-convertir',
  formats: '/#formats',
  apropos: '/#apropos',
} as const;

export const headerNav = [
  { href: homeSections.comment, label: 'Comment convertir' },
  { href: homeSections.formats, label: 'Formats' },
  { href: homeSections.apropos, label: 'À propos' },
] as const;
