import { pageUrl } from './site';

export type DocCategoryId = 'web' | 'application';

export interface DocChapter {
  id: string;
  title: string;
}

export interface DocCategory {
  id: DocCategoryId;
  title: string;
  description: string;
  icon: string;
}

export interface DocArticle {
  slug: string;
  category: DocCategoryId;
  title: string;
  description: string;
  href: string;
  updated: string;
  chapters: DocChapter[];
}

export const docCategories: DocCategory[] = [
  {
    id: 'web',
    title: 'Web',
    description:
      'Convertisseur navigateur sur /convertir : traitement local, limites et matrices de conversion.',
    icon: 'fa-solid fa-globe',
  },
  {
    id: 'application',
    title: 'Application',
    description:
      'Application desktop Tauri (à venir) : vidéo, Office, OCR et fichiers plus volumineux.',
    icon: 'fa-solid fa-desktop',
  },
];

export const docArticles: DocArticle[] = [
  {
    slug: 'conversions',
    category: 'web',
    title: 'Conversions navigateur',
    description:
      'Formats pris en charge, limites de taille, matrices image/audio/document/PDF et cas particuliers (HEIC, SVG, APNG).',
    href: pageUrl('documentation/web/conversions/'),
    updated: '2026-06-05',
    chapters: [
      { id: 'doc-web-limits', title: 'Limites de taille' },
      { id: 'doc-web-images', title: 'Images' },
      { id: 'doc-web-audio', title: 'Audio' },
      { id: 'doc-web-documents', title: 'Documents texte' },
      { id: 'doc-web-pdf', title: 'PDF' },
      { id: 'doc-web-desktop', title: "Réservé à l'application desktop" },
    ],
  },
  {
    slug: 'apercu',
    category: 'application',
    title: 'Application desktop',
    description:
      "Périmètre prévu pour l'application locale : vidéo, Office, OCR, RAW et conversions PDF avancées.",
    href: pageUrl('documentation/application/apercu/'),
    updated: '2026-06-05',
    chapters: [
      { id: 'doc-app-why', title: 'Pourquoi une application ?' },
      { id: 'doc-app-scope', title: 'Périmètre prévu' },
      { id: 'doc-app-web', title: 'Déjà sur le site' },
      { id: 'doc-app-status', title: 'État' },
    ],
  },
];

export function articlesForCategory(categoryId: DocCategoryId): DocArticle[] {
  return docArticles.filter((a) => a.category === categoryId);
}

export function categoryById(id: DocCategoryId): DocCategory | undefined {
  return docCategories.find((c) => c.id === id);
}

export function articleBySlug(slug: string): DocArticle | undefined {
  return docArticles.find((a) => a.slug === slug);
}

export function adjacentArticles(slug: string): {
  prev?: DocArticle;
  next?: DocArticle;
} {
  const index = docArticles.findIndex((a) => a.slug === slug);
  if (index < 0) return {};
  return {
    prev: index > 0 ? docArticles[index - 1] : undefined,
    next: index < docArticles.length - 1 ? docArticles[index + 1] : undefined,
  };
}
