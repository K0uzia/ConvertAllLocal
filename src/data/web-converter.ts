import { formatsForEnv } from './supported-formats.js';
import { audioFormats } from './audio-formats.js';
import { documentsFormats } from './documents-formats.js';
import { imageFormats } from './image-formats.js';

export type ConverterCategory = 'image' | 'audio' | 'document';

const webImages = formatsForEnv(imageFormats, 'web');
const webAudio = formatsForEnv(audioFormats, 'web');
const webDocuments = formatsForEnv(documentsFormats, 'web');

export const WEB_IMAGE_EXTENSIONS = extList(webImages);
export const WEB_AUDIO_EXTENSIONS = extList(webAudio);
export const WEB_DOCUMENT_EXTENSIONS = extList(webDocuments);

const ALL_WEB_EXTENSIONS = [
  ...WEB_IMAGE_EXTENSIONS,
  ...WEB_AUDIO_EXTENSIONS,
  ...WEB_DOCUMENT_EXTENSIONS,
];

function extList(formats: { label: string }[]): string[] {
  return formats.map((f) => f.label.replace(/^\./, '').toLowerCase());
}

const EXTENSION_ALIASES: Record<string, string> = {
  jpg: 'jpeg',
  htm: 'html',
};

export function normalizeExtension(ext: string): string {
  const lower = ext.replace(/^\./, '').toLowerCase();
  return EXTENSION_ALIASES[lower] ?? lower;
}

export function extensionFromFile(file: File): string {
  const dot = file.name.lastIndexOf('.');
  if (dot > 0) return normalizeExtension(file.name.slice(dot + 1));
  const mime = file.type.toLowerCase();
  if (mime === 'image/jpeg') return 'jpeg';
  if (mime === 'image/svg+xml') return 'svg';
  if (mime.startsWith('image/')) return mime.slice(6);
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return 'm4a';
  if (mime === 'audio/wav' || mime === 'audio/wave' || mime === 'audio/x-wav') return 'wav';
  if (mime === 'audio/ogg') return 'ogg';
  if (mime === 'audio/opus') return 'opus';
  if (mime === 'text/html') return 'html';
  if (mime === 'text/markdown') return 'md';
  if (mime === 'text/csv') return 'csv';
  if (mime === 'application/json') return 'json';
  if (mime === 'text/plain') return 'txt';
  if (mime === 'application/pdf') return 'pdf';
  return '';
}

export function detectCategory(file: File): ConverterCategory | null {
  const ext = extensionFromFile(file);
  if (!ext) return null;
  if (WEB_IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (WEB_AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (WEB_DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  return null;
}

export function isWebExtension(ext: string): boolean {
  const normalized = normalizeExtension(ext);
  return ALL_WEB_EXTENSIONS.includes(normalized);
}

export function categoryLabel(category: ConverterCategory): string {
  if (category === 'image') return 'Image';
  if (category === 'audio') return 'Audio';
  return 'Document';
}

export function buildWebAcceptAttr(): string {
  const parts = [
    ...webImages.map((f) => f.label),
    ...webAudio.map((f) => `audio/${f.label.replace(/^\./, '')}`),
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    ...webDocuments.map((f) => f.label),
    '.txt',
    'text/plain',
    'text/html',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    '.pdf',
  ];
  return [...new Set(parts)].join(',');
}
