import {
  buildWebAcceptAttr,
  detectCategory,
  extensionFromFile,
  isWebExtension,
  normalizeExtension,
  type ConverterCategory,
} from './web-converter.js';

/** Limite totale de la file d'attente sur le site (navigateur). */
export const WEB_MAX_BATCH_BYTES = 24 * 1024 * 1024;

/** Limite par fichier image, audio ou PDF. */
export const WEB_MAX_FILE_BYTES = 16 * 1024 * 1024;

/** Limite par fichier document texte (md, html, csv, json, txt). */
export const WEB_MAX_TEXT_BYTES = 8 * 1024 * 1024;

export const WEB_ACCEPT_ATTR = buildWebAcceptAttr();

export { detectCategory, extensionFromFile, normalizeExtension, type ConverterCategory };

const TEXT_EXTENSIONS = new Set(['md', 'html', 'htm', 'csv', 'json', 'txt']);

const WEB_MAX_BATCH_BYTES_HIGH = 32 * 1024 * 1024;

export function getWebBatchLimitBytes(): number {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (mem !== undefined && mem >= 8) return WEB_MAX_BATCH_BYTES_HIGH;
  }
  return WEB_MAX_BATCH_BYTES;
}

export function webBatchLimitMoLabel(): number {
  return Math.round(getWebBatchLimitBytes() / (1024 * 1024));
}

export function getMaxBytesForFile(file: File): number {
  const ext = extensionFromFile(file);
  if (ext && TEXT_EXTENSIONS.has(ext)) return WEB_MAX_TEXT_BYTES;
  const category = detectCategory(file);
  if (category === 'document') return WEB_MAX_TEXT_BYTES;
  return WEB_MAX_FILE_BYTES;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

export function detectFormatLabel(file: File): string {
  const ext = extensionFromFile(file);
  if (ext) return `.${ext === 'jpeg' ? 'jpg' : ext}`;
  return 'Non détecté';
}

/** Formats distincts détectés dans la file (ordre d'ajout, séparés par des virgules). */
export function detectFormatsLabel(files: readonly File[]): string {
  if (files.length === 0) return 'Non détecté';
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const label = detectFormatLabel(file);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.join(', ');
}

export function isWebInputExtension(ext: string): boolean {
  return isWebExtension(ext);
}

export function isAppOnlyExtension(ext: string): boolean {
  const normalized = normalizeExtension(ext);
  if (!normalized) return false;
  return !isWebExtension(normalized);
}

export function isSupportedWebFile(file: File): boolean {
  return detectCategory(file) !== null;
}
