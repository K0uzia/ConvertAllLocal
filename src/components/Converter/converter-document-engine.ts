import { marked } from 'marked';
import type { OutputFormatOption } from '../../data/converter-output-formats.js';
import { extensionFromFile } from '../../data/converter-limits.js';
import { ConvertError, validateFileWeight } from './converter-errors.js';
import type { ConvertResult, ProgressCallback } from './converter-image-engine.js';

marked.setOptions({ gfm: true, breaks: true });

async function readText(file: File): Promise<string> {
  return file.text();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r') i += 1;
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.length > 0));
}

function csvToJson(text: string): string {
  const rows = parseCsv(text.trim());
  if (rows.length === 0) throw ConvertError.csvEmpty();
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = cells[index] ?? '';
    });
    return obj;
  });
  return JSON.stringify(data, null, 2);
}

function jsonToCsv(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ConvertError.jsonInvalid();
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw ConvertError.jsonNeedsArray();
  }
  if (typeof parsed[0] !== 'object' || parsed[0] === null) {
    throw ConvertError.jsonNeedsObjects();
  }
  const keys = [
    ...new Set(parsed.flatMap((row) => Object.keys(row as Record<string, unknown>))),
  ];
  const escape = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [
    keys.join(','),
    ...parsed.map((row) =>
      keys.map((key) => escape((row as Record<string, unknown>)[key])).join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\s+\n/g, '\n').trim();
}

async function markdownToText(md: string): Promise<string> {
  const html = await marked.parse(md);
  return htmlToText(html);
}

export function validateDocumentFile(file: File): void {
  validateFileWeight(file);
}

export async function convertDocumentFile(
  file: File,
  output: OutputFormatOption,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  validateDocumentFile(file);
  const ext = extensionFromFile(file);
  const source = await readText(file);
  onProgress(0.2);

  let resultText = '';
  let mime = output.mime;

  if (output.id === 'html' && ext === 'md') {
    const body = await marked.parse(source);
    resultText = `<!DOCTYPE html>\n<html lang="fr">\n<head><meta charset="utf-8"><title>Convert All Local</title></head>\n<body>\n${body}\n</body>\n</html>`;
  } else if (output.id === 'txt' && (ext === 'md' || ext === 'html' || ext === 'htm')) {
    resultText = ext === 'md' ? await markdownToText(source) : htmlToText(source);
    mime = 'text/plain;charset=utf-8';
  } else if (output.id === 'json' && ext === 'csv') {
    resultText = csvToJson(source);
  } else if (output.id === 'json' && ext === 'json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw ConvertError.jsonInvalid();
    }
    resultText = JSON.stringify(parsed, null, 2);
  } else if (output.id === 'csv' && ext === 'json') {
    resultText = jsonToCsv(source);
    mime = 'text/csv;charset=utf-8';
  } else if (output.id === 'txt' && ext === 'txt') {
    resultText = source.replace(/\r\n/g, '\n');
    mime = 'text/plain;charset=utf-8';
  } else {
    const inputLabel = ext ? `.${ext}` : 'fichier';
    throw ConvertError.unsupportedConversion(inputLabel, output.label);
  }

  onProgress(1);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'converti';
  return {
    blob: new Blob([resultText], { type: mime }),
    mime,
    filename: `${baseName}.${output.extension}`,
  };
}
