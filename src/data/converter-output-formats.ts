import type { ConverterCategory } from './web-converter.js';

export interface OutputFormatOption {
  id: string;
  label: string;
  mime: string;
  extension: string;
  categories: ConverterCategory[];
  /** Extensions d'entrée autorisées (sans point). Vide = toute la catégorie. */
  inputs?: string[];
}

export const imageOutputFormats: OutputFormatOption[] = [
  { id: 'webp', label: 'WebP', mime: 'image/webp', extension: 'webp', categories: ['image'] },
  { id: 'png', label: 'PNG', mime: 'image/png', extension: 'png', categories: ['image'] },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', extension: 'jpg', categories: ['image'] },
  { id: 'avif', label: 'AVIF', mime: 'image/avif', extension: 'avif', categories: ['image'] },
  { id: 'pdf', label: 'PDF', mime: 'application/pdf', extension: 'pdf', categories: ['image'] },
];

export const audioOutputFormats: OutputFormatOption[] = [
  { id: 'wav', label: 'WAV', mime: 'audio/wav', extension: 'wav', categories: ['audio'] },
  { id: 'mp3', label: 'MP3', mime: 'audio/mpeg', extension: 'mp3', categories: ['audio'] },
  {
    id: 'ogg',
    label: 'OGG',
    mime: 'audio/ogg',
    extension: 'ogg',
    categories: ['audio'],
    inputs: ['mp3', 'mpeg', 'wav', 'wave'],
  },
];

export const documentOutputFormats: OutputFormatOption[] = [
  {
    id: 'html',
    label: 'HTML',
    mime: 'text/html',
    extension: 'html',
    categories: ['document'],
    inputs: ['md', 'pdf'],
  },
  { id: 'txt', label: 'Texte', mime: 'text/plain', extension: 'txt', categories: ['document'], inputs: ['md', 'html', 'htm', 'pdf'] },
  { id: 'json', label: 'JSON', mime: 'application/json', extension: 'json', categories: ['document'], inputs: ['csv', 'json'] },
  { id: 'csv', label: 'CSV', mime: 'text/csv', extension: 'csv', categories: ['document'], inputs: ['json'] },
  {
    id: 'pdf',
    label: 'PDF',
    mime: 'application/pdf',
    extension: 'pdf',
    categories: ['document'],
    inputs: ['md', 'html', 'htm', 'txt'],
  },
];

export const allOutputFormats: OutputFormatOption[] = [
  ...imageOutputFormats,
  ...audioOutputFormats,
  ...documentOutputFormats,
];

export const defaultOutputByCategory: Record<ConverterCategory, string> = {
  image: 'webp',
  audio: 'wav',
  document: 'json',
};

export function outputFormatById(id: string): OutputFormatOption | undefined {
  return allOutputFormats.find((f) => f.id === id);
}

export function outputFormatsForCategory(
  category: ConverterCategory,
  inputExt?: string,
): OutputFormatOption[] {
  const normalized = inputExt?.replace(/^\./, '').toLowerCase();
  return allOutputFormats.filter((opt) => {
    if (!opt.categories.includes(category)) return false;
    if (!opt.inputs?.length) return true;
    if (!normalized) return true;
    return opt.inputs.includes(normalized);
  });
}
