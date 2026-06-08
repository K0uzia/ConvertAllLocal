import { defaultOutputByCategory, outputFormatById } from '../../data/converter-output-formats.js';
import type { ConverterCategory } from '../../data/converter-limits.js';

const PREFIX = 'cal:';
const keyFor = (category: ConverterCategory) => `${PREFIX}outputFormat:${category}`;

export function getOutputFormat(category: ConverterCategory): string {
  if (typeof localStorage === 'undefined') return defaultOutputByCategory[category];
  const stored = localStorage.getItem(keyFor(category));
  if (stored && outputFormatById(stored)) return stored;
  return defaultOutputByCategory[category];
}

export function setOutputFormat(category: ConverterCategory, id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(keyFor(category), id);
}

export function resetOutputFormat(category: ConverterCategory): void {
  setOutputFormat(category, defaultOutputByCategory[category]);
}

export function listKeys(): string[] {
  if (typeof localStorage === 'undefined') return [];
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

export function clearAll(): void {
  if (typeof localStorage === 'undefined') return;
  for (const key of listKeys()) {
    localStorage.removeItem(key);
  }
}

