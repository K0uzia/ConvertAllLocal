import { marked } from 'marked';
import pdfjsWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { OutputFormatOption } from '../../data/converter-output-formats.js';
import { extensionFromFile } from '../../data/converter-limits.js';
import { pageItemsToLayoutText } from './converter-pdf-layout.js';
import { ConvertError, validateFileWeight } from './converter-errors.js';
import { decodeFileToImageData, type ConvertResult, type ProgressCallback } from './converter-image-engine.js';

marked.setOptions({ gfm: true, breaks: true });

const PDF_MAX_PAGES = 50;
const PDF_PAGE_RENDER_SCALE = 1.5;
const PDF_PAGE_RENDER_MAX_PX = 2400;
const PDF_MARGIN_MM = 12;
const PDF_TEXT_FONT_SIZE = 10;
const PDF_TEXT_LINE_HEIGHT_MM = 5;
const PDF_TEXT_PARAGRAPH_GAP_MM = 2.5;
const PDF_TEXT_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
const PDF_TEXT_CANVAS_SCALE = 2;
const PDF_TEXT_LINE_HEIGHT_RATIO = 1.45;
const MM_TO_PX = 96 / 25.4;
const PX_TO_MM = 0.264583;

type JsPDFConstructor = typeof import('jspdf').jsPDF;

let pdfJsWorkerReady = false;

async function loadJsPDF(): Promise<JsPDFConstructor> {
  const { jsPDF } = await import('jspdf');
  return jsPDF;
}

async function configurePdfJsWorker(pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs')): Promise<void> {
  if (pdfJsWorkerReady) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc;
  pdfJsWorkerReady = true;
}

async function loadPdfJs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  await configurePdfJsWorker(pdfjs);
  return pdfjs;
}

type PdfJsModule = Awaited<ReturnType<typeof loadPdfJs>>;
type PdfJsDocument = Awaited<ReturnType<ReturnType<PdfJsModule['getDocument']>['promise']>>;
type PdfJsPage = Awaited<ReturnType<PdfJsDocument['getPage']>>;

interface PdfExtractedPage {
  pageNum: number;
  text: string;
  hasText: boolean;
  imageDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

async function closePdfDocument(
  doc: Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfJs>>['getDocument']>['promise']>,
): Promise<void> {
  if (typeof doc.destroy === 'function') {
    await doc.destroy();
  }
}

function imageDataToPngDataUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw ConvertError.browserCanvas();
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\s+\n/g, '\n').trim();
}

async function markdownToPlainText(md: string): Promise<string> {
  const html = await marked.parse(md);
  return htmlToPlainText(html);
}

async function plainTextFromDocumentFile(file: File): Promise<string> {
  const ext = extensionFromFile(file);
  const source = await file.text();
  if (ext === 'md') return markdownToPlainText(source);
  if (ext === 'html' || ext === 'htm') return htmlToPlainText(source);
  return source.replace(/\r\n/g, '\n');
}

function normalizeTextForPdf(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

function createPdfTextMeasurer(maxWidthPx: number, fontSizePt: number): {
  width: (line: string) => number;
  maxWidthPx: number;
} {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw ConvertError.browserCanvas();
  ctx.font = `${fontSizePt}pt ${PDF_TEXT_FONT_FAMILY}`;

  return {
    maxWidthPx,
    width: (line: string) => ctx.measureText(line).width,
  };
}

function breakWordToLines(word: string, measure: (line: string) => number, maxWidthPx: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const char of word) {
    const next = current + char;
    if (measure(next) > maxWidthPx && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function wrapParagraphToLines(
  paragraph: string,
  measure: (line: string) => number,
  maxWidthPx: number,
): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (measure(trial) <= maxWidthPx) {
      current = trial;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if (measure(word) <= maxWidthPx) {
      current = word;
    } else {
      const chunks = breakWordToLines(word, measure, maxWidthPx);
      lines.push(...chunks.slice(0, -1));
      current = chunks.at(-1) ?? '';
    }
  }

  if (current) lines.push(current);
  return lines;
}

function layoutTextLines(text: string, maxWidthPx: number, fontSizePt: number): string[] {
  const measure = createPdfTextMeasurer(maxWidthPx, fontSizePt);
  const paragraphs = normalizeTextForPdf(text).split('\n');
  const lines: string[] = [];

  for (let i = 0; i < paragraphs.length; i += 1) {
    if (i > 0) lines.push('');
    const paragraph = paragraphs[i];
    if (!paragraph) continue;
    lines.push(...wrapParagraphToLines(paragraph, measure.width, measure.maxWidthPx));
  }

  return lines;
}

function pxToMm(px: number): number {
  return (px * 25.4) / 96;
}

function renderTextPageCanvas(
  pageLines: string[],
  contentWidthPx: number,
  lineHeightPx: number,
  fontSizePt: number,
): HTMLCanvasElement {
  const scale = PDF_TEXT_CANVAS_SCALE;
  const canvas = document.createElement('canvas');
  const widthPx = Math.ceil(contentWidthPx);
  const heightPx = Math.max(Math.ceil(pageLines.length * lineHeightPx + 2), 1);
  canvas.width = widthPx * scale;
  canvas.height = heightPx * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw ConvertError.browserCanvas();

  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSizePt}pt ${PDF_TEXT_FONT_FAMILY}`;
  ctx.textBaseline = 'top';

  for (let i = 0; i < pageLines.length; i += 1) {
    ctx.fillText(pageLines[i], 0, i * lineHeightPx);
  }

  return canvas;
}

function writeTextToPdf(pdf: InstanceType<JsPDFConstructor>, text: string): void {
  const margin = PDF_MARGIN_MM;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentWmm = pageW - margin * 2;
  const contentHmm = pageH - margin * 2;
  const contentWidthPx = contentWmm * MM_TO_PX;
  const fontSizePx = PDF_TEXT_FONT_SIZE * (96 / 72);
  const lineHeightPx = fontSizePx * PDF_TEXT_LINE_HEIGHT_RATIO;
  const linesPerPage = Math.max(1, Math.floor((contentHmm * MM_TO_PX) / lineHeightPx));

  const lines = layoutTextLines(text, contentWidthPx, PDF_TEXT_FONT_SIZE);

  for (let start = 0; start < lines.length; start += linesPerPage) {
    if (start > 0) pdf.addPage();

    const pageLines = lines.slice(start, start + linesPerPage);
    const canvas = renderTextPageCanvas(pageLines, contentWidthPx, lineHeightPx, PDF_TEXT_FONT_SIZE);
    const imgHmm = pxToMm(canvas.height / PDF_TEXT_CANVAS_SCALE);

    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      margin,
      margin,
      contentWmm,
      Math.min(imgHmm, contentHmm),
      undefined,
      'FAST',
    );
  }
}

async function buildPdfBlob(
  build: (pdf: InstanceType<JsPDFConstructor>) => void | Promise<void>,
): Promise<Blob> {
  try {
    const jsPDF = await loadJsPDF();
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    await build(pdf);
    return pdf.output('blob');
  } catch (err) {
    if (err instanceof ConvertError) throw err;
    throw ConvertError.pdfBuildFailed();
  }
}

function baseFilename(file: File): string {
  return file.name.replace(/\.[^.]+$/, '') || 'converti';
}

export async function convertImageFileToPdf(
  file: File,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  validateFileWeight(file);
  onProgress(0.05);
  const imageData = await decodeFileToImageData(file);
  onProgress(0.35);
  const dataUrl = imageDataToPngDataUrl(imageData);
  let imgWmm = imageData.width * PX_TO_MM;
  let imgHmm = imageData.height * PX_TO_MM;
  const orientation = imgWmm > imgHmm ? 'l' : 'p';
  const jsPDF = await loadJsPDF();
  const blob = await (async () => {
    try {
      const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const maxW = pageW - PDF_MARGIN_MM * 2;
      const maxH = pageH - PDF_MARGIN_MM * 2;
      const scale = Math.min(maxW / imgWmm, maxH / imgHmm, 1);
      imgWmm *= scale;
      imgHmm *= scale;
      pdf.addImage(dataUrl, 'PNG', PDF_MARGIN_MM, PDF_MARGIN_MM, imgWmm, imgHmm, undefined, 'FAST');
      return pdf.output('blob');
    } catch (err) {
      if (err instanceof ConvertError) throw err;
      throw ConvertError.pdfBuildFailed();
    }
  })();
  onProgress(1);
  const name = baseFilename(file);
  return {
    blob,
    mime: 'application/pdf',
    filename: `${name}.pdf`,
  };
}

export async function convertDocumentFileToPdf(
  file: File,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  validateFileWeight(file);
  onProgress(0.1);
  const text = await plainTextFromDocumentFile(file);
  if (!text.trim()) {
    throw ConvertError.pdfBuildFailed();
  }
  onProgress(0.4);
  const blob = await buildPdfBlob((pdf) => {
    writeTextToPdf(pdf, text);
  });
  onProgress(1);
  const name = baseFilename(file);
  return {
    blob,
    mime: 'application/pdf',
    filename: `${name}.pdf`,
  };
}

function resolvePageRenderScale(viewportWidth: number, viewportHeight: number): number {
  const scaledW = viewportWidth * PDF_PAGE_RENDER_SCALE;
  const scaledH = viewportHeight * PDF_PAGE_RENDER_SCALE;
  if (scaledW <= PDF_PAGE_RENDER_MAX_PX && scaledH <= PDF_PAGE_RENDER_MAX_PX) {
    return PDF_PAGE_RENDER_SCALE;
  }
  return Math.min(
    PDF_PAGE_RENDER_MAX_PX / viewportWidth,
    PDF_PAGE_RENDER_MAX_PX / viewportHeight,
    PDF_PAGE_RENDER_SCALE,
  );
}

async function renderPagePreview(page: PdfJsPage): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = resolvePageRenderScale(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw ConvertError.browserCanvas();

  const task = page.render({ canvasContext: ctx, viewport, canvas });
  await task.promise;

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPdfHtmlExport(pages: PdfExtractedPage[], title: string): string {
  const body = pages
    .map((page) => {
      const img =
        page.imageDataUrl && page.imageWidth && page.imageHeight
          ? `<img class="pdf-export__img" src="${page.imageDataUrl}" width="${page.imageWidth}" height="${page.imageHeight}" alt="Page ${page.pageNum}" loading="lazy" />`
          : '';
      const textBlock = page.hasText
        ? `<pre class="pdf-export__text">${escapeHtml(page.text)}</pre>`
        : '<p class="pdf-export__note">Aucun texte extractible sur cette page (contenu graphique ou scanné).</p>';

      return `<section class="pdf-export__page" data-page="${page.pageNum}">
  <header class="pdf-export__head">Page ${page.pageNum}</header>
  ${img}
  ${textBlock}
</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 1.25rem;
      font-family: Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.45;
      color: #14171c;
      background: #f0ebe3;
    }
    .pdf-export__page {
      max-width: 920px;
      margin: 0 auto 1.5rem;
      padding: 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #fff;
      box-sizing: border-box;
    }
    .pdf-export__head {
      margin: 0 0 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #2e2f31;
    }
    .pdf-export__img {
      display: block;
      width: 100%;
      height: auto;
      margin: 0 0 0.75rem;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    .pdf-export__text {
      margin: 0;
      padding: 0.75rem;
      border: 0;
      border-radius: 4px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      color: #14171c;
      background: #f8f7f4;
    }
    .pdf-export__note {
      margin: 0;
      font-size: 0.85rem;
      color: #2e2f31;
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

async function extractPdfPages(
  doc: PdfJsDocument,
  options: { includePreview: boolean },
  onProgress: ProgressCallback,
): Promise<PdfExtractedPage[]> {
  const numPages = doc.numPages;
  const pages: PdfExtractedPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const layout = pageItemsToLayoutText(content.items);

    const entry: PdfExtractedPage = {
      pageNum,
      text: layout.text,
      hasText: layout.hasText,
    };

    if (options.includePreview) {
      const preview = await renderPagePreview(page);
      entry.imageDataUrl = preview.dataUrl;
      entry.imageWidth = preview.width;
      entry.imageHeight = preview.height;
    }

    pages.push(entry);
    page.cleanup();
    onProgress(pageNum / numPages);
  }

  return pages;
}

export async function convertPdfFile(
  file: File,
  output: OutputFormatOption,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  validateFileWeight(file);
  onProgress(0.05);

  let pdfjs: Awaited<ReturnType<typeof loadPdfJs>>;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw ConvertError.pdfReadFailed();
  }

  const data = new Uint8Array(await file.arrayBuffer());
  let doc: PdfJsDocument;

  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password|encrypted/i.test(msg)) throw ConvertError.pdfEncrypted();
    throw ConvertError.pdfReadFailed();
  }

  if (doc.numPages > PDF_MAX_PAGES) {
    await closePdfDocument(doc);
    throw ConvertError.pdfTooManyPages(PDF_MAX_PAGES);
  }

  const includePreview = output.id === 'html';
  let pages: PdfExtractedPage[] = [];

  try {
    pages = await extractPdfPages(doc, { includePreview }, onProgress);
  } catch (err) {
    if (err instanceof ConvertError) throw err;
    throw ConvertError.pdfReadFailed();
  } finally {
    await closePdfDocument(doc);
  }

  const name = baseFilename(file);
  const hasText = pages.some((page) => page.hasText);
  const hasPreview = pages.some((page) => page.imageDataUrl);

  if (output.id === 'html') {
    if (!hasText && !hasPreview) throw ConvertError.pdfNoText();
    const html = buildPdfHtmlExport(pages, name);
    const mime = 'text/html;charset=utf-8';
    return {
      blob: new Blob([html], { type: mime }),
      mime,
      filename: `${name}.html`,
    };
  }

  const resultText = pages
    .map((page) => page.text)
    .filter((text) => text.length > 0)
    .join('\n\n')
    .trim();

  if (!resultText) throw ConvertError.pdfNoText();

  const mime = 'text/plain;charset=utf-8';
  return {
    blob: new Blob([resultText], { type: mime }),
    mime,
    filename: `${name}.txt`,
  };
}

export async function convertFileToPdfOutput(
  file: File,
  category: 'image' | 'document',
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  if (category === 'image') return convertImageFileToPdf(file, onProgress);
  return convertDocumentFileToPdf(file, onProgress);
}
