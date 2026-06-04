/** Extraction de texte PDF avec repères de position (pdf.js). */

export interface PdfLayoutTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

export interface PdfPageTextLayout {
  lines: string[];
  text: string;
  hasText: boolean;
}

function parseTextItem(raw: unknown): PdfLayoutTextItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as {
    str?: string;
    transform?: number[];
    width?: number;
    height?: number;
    hasEOL?: boolean;
  };
  if (typeof item.str !== 'string' || !item.str) return null;
  const transform = item.transform;
  if (!transform || transform.length < 6) return null;

  const height =
    item.height ??
    Math.max(Math.hypot(transform[2], transform[3]), Math.hypot(transform[0], transform[1]), 1);
  const width = item.width ?? Math.max(height * item.str.length * 0.45, height * 0.5);

  return {
    str: item.str,
    x: transform[4],
    y: transform[5],
    width,
    height,
    hasEOL: Boolean(item.hasEOL),
  };
}

function yTolerance(item: PdfLayoutTextItem): number {
  return Math.max(item.height * 0.55, 2);
}

function clusterItemsIntoLines(items: PdfLayoutTextItem[]): PdfLayoutTextItem[][] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfLayoutTextItem[][] = [];
  let bucket: PdfLayoutTextItem[] = [sorted[0]];
  let bucketY = sorted[0].y;

  for (let i = 1; i < sorted.length; i += 1) {
    const item = sorted[i];
    if (Math.abs(item.y - bucketY) <= yTolerance(item)) {
      bucket.push(item);
    } else {
      bucket.sort((a, b) => a.x - b.x);
      lines.push(bucket);
      bucket = [item];
      bucketY = item.y;
    }
  }

  bucket.sort((a, b) => a.x - b.x);
  lines.push(bucket);
  return lines;
}

function medianCharWidth(line: PdfLayoutTextItem[]): number {
  const widths: number[] = [];
  for (const item of line) {
    if (item.str.length > 0) {
      widths.push(item.width / item.str.length);
    }
  }
  if (widths.length === 0) return 4;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)] ?? 4;
}

function gapToSeparator(gap: number, spaceWidth: number): string {
  if (gap < spaceWidth * 0.35) return '';
  if (gap >= spaceWidth * 6) {
    const tabs = Math.min(8, Math.max(1, Math.round(gap / (spaceWidth * 4))));
    return '\t'.repeat(tabs);
  }
  return ' '.repeat(Math.max(1, Math.round(gap / spaceWidth)));
}

function lineToString(line: PdfLayoutTextItem[]): string {
  if (line.length === 0) return '';
  const spaceWidth = medianCharWidth(line);
  let out = line[0].str;

  for (let i = 1; i < line.length; i += 1) {
    const prev = line[i - 1];
    const item = line[i];
    const gap = item.x - (prev.x + prev.width);
    out += gapToSeparator(gap, spaceWidth) + item.str;
  }

  if (line.at(-1)?.hasEOL) return out;
  return out;
}

function paragraphGap(prevY: number, nextY: number, lineHeight: number): boolean {
  return prevY - nextY > lineHeight * 1.35;
}

export function pageItemsToLayoutText(items: unknown[]): PdfPageTextLayout {
  const parsed = items
    .map(parseTextItem)
    .filter((item): item is PdfLayoutTextItem => item !== null);

  if (parsed.length === 0) {
    return { lines: [], text: '', hasText: false };
  }

  const lineClusters = clusterItemsIntoLines(parsed);
  const lines: string[] = [];
  let prevY: number | null = null;

  for (const cluster of lineClusters) {
    const lineY = cluster[0]?.y ?? 0;
    const lineHeight = cluster[0]?.height ?? 12;

    if (prevY !== null && paragraphGap(prevY, lineY, lineHeight)) {
      lines.push('');
    }

    const lineText = lineToString(cluster);
    if (lineText) lines.push(lineText);
    prevY = lineY;
  }

  const text = lines.join('\n').replace(/[ \t]+\n/g, '\n').trim();
  return { lines, text, hasText: text.length > 0 };
}
