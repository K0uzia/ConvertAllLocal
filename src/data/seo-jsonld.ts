import { aboutFaqItems, type AboutFaqItem } from './about-faq.ts';

function faqAnswerText(item: AboutFaqItem): string {
  const parts: string[] = [];
  if (item.intro) parts.push(item.intro);
  if (item.bullets) parts.push(...item.bullets);
  if (item.answer) parts.push(item.answer);
  return parts.join(' ');
}

export function buildFaqPageJsonLd(pageUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: pageUrl,
    mainEntity: aboutFaqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faqAnswerText(item),
      },
    })),
  };
}

export type BreadcrumbItem = {
  name: string;
  url?: string;
};

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}
