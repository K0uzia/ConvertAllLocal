import type { OutputFormatOption } from '../../data/converter-output-formats.js';
import {
  ConvertError,
  validateFileWeight,
} from './converter-errors.js';
import {
  extensionFromFile,
  isWebInputExtension,
} from '../../data/converter-limits.js';

export { ConvertError } from './converter-errors.js';

export type ProgressCallback = (ratio: number) => void;

export interface ConvertResult {
  blob: Blob;
  mime: string;
  filename: string;
}

const WASM_DECODE_EXTENSIONS = new Set(['png', 'jpeg', 'jpg', 'jfif', 'webp', 'avif']);

const SVG_RASTER_MAX = 4096;
const SVG_RASTER_DEFAULT = 512;

async function decodeWithWasm(ext: string, buffer: ArrayBuffer): Promise<ImageData> {
  const normalized = ext === 'jpg' || ext === 'jfif' ? 'jpeg' : ext;
  if (normalized === 'png') {
    const { default: decode } = await import('@jsquash/png/decode');
    return decode(buffer);
  }
  if (normalized === 'jpeg') {
    const { default: decode } = await import('@jsquash/jpeg/decode');
    return decode(buffer);
  }
  if (normalized === 'webp') {
    const { default: decode } = await import('@jsquash/webp/decode');
    return decode(buffer);
  }
  if (normalized === 'avif') {
    const { default: decode } = await import('@jsquash/avif/decode');
    return decode(buffer);
  }
  throw ConvertError.unsupportedImageFormat(ext);
}

function parseSvgRasterSize(svgText: string): { width: number; height: number } | null {
  const widthMatch = svgText.match(/\bwidth=["']([\d.]+)/i);
  const heightMatch = svgText.match(/\bheight=["']([\d.]+)/i);
  const viewBoxMatch = svgText.match(/viewBox=["']([\d.\s,+-]+)["']/i);

  let width = widthMatch ? Number.parseFloat(widthMatch[1]) : Number.NaN;
  let height = heightMatch ? Number.parseFloat(heightMatch[1]) : Number.NaN;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number.parseFloat(part));
    if (parts.length >= 4) {
      if (!Number.isFinite(width) || width <= 0) width = parts[2];
      if (!Number.isFinite(height) || height <= 0) height = parts[3];
    }
  }

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }
  return null;
}

function clampSvgDimension(value: number): number {
  return Math.min(SVG_RASTER_MAX, Math.max(1, Math.round(value)));
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(ConvertError.svgUnreadable());
    img.src = src;
  });
}

function imageDataFromCanvas(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw ConvertError.browserCanvas();
  }
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (data.width === 0 || data.height === 0) {
    throw ConvertError.svgNoSize();
  }
  return data;
}

async function decodeSvgToImageData(file: File): Promise<ImageData> {
  const svgText = await file.text();
  const parsed = parseSvgRasterSize(svgText);
  const url = URL.createObjectURL(
    new Blob([svgText], { type: file.type || 'image/svg+xml' }),
  );

  try {
    const img = await loadHtmlImage(url);
    let width = img.naturalWidth;
    let height = img.naturalHeight;

    if (!width || !height) {
      width = parsed?.width ?? SVG_RASTER_DEFAULT;
      height = parsed?.height ?? SVG_RASTER_DEFAULT;
    }

    width = clampSvgDimension(width);
    height = clampSvgDimension(height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw ConvertError.browserCanvas();
    }
    ctx.drawImage(img, 0, 0, width, height);
    return imageDataFromCanvas(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeWithBitmap(file: File): Promise<ImageData> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw ConvertError.browserCanvas();
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return imageDataFromCanvas(canvas);
  } catch {
    throw ConvertError.imageUnreadable();
  }
}

async function decodeToImageData(file: File): Promise<ImageData> {
  const ext = extensionFromFile(file);
  if (ext === 'svg') {
    return decodeSvgToImageData(file);
  }
  const buffer = await file.arrayBuffer();
  if (WASM_DECODE_EXTENSIONS.has(ext)) {
    return decodeWithWasm(ext, buffer);
  }
  return decodeWithBitmap(file);
}

async function encodeImageData(imageData: ImageData, formatId: string): Promise<ArrayBuffer> {
  if (formatId === 'png') {
    const { default: encode } = await import('@jsquash/png/encode');
    return encode(imageData);
  }
  if (formatId === 'jpeg') {
    const { default: encode } = await import('@jsquash/jpeg/encode');
    return encode(imageData, { quality: 85 });
  }
  if (formatId === 'webp') {
    const { default: encode } = await import('@jsquash/webp/encode');
    return encode(imageData, { quality: 85 });
  }
  if (formatId === 'avif') {
    const { default: encode } = await import('@jsquash/avif/encode');
    return encode(imageData, { quality: 50 });
  }
  throw ConvertError.encodeFailed(formatId);
}

export function validateImageFile(file: File): void {
  validateFileWeight(file);
  const ext = extensionFromFile(file);
  const dotted = ext ? `.${ext}` : '';
  if (ext && !isWebInputExtension(dotted) && !WASM_DECODE_EXTENSIONS.has(ext)) {
    const rasterFallback = ['gif', 'svg', 'bmp', 'tiff', 'tif', 'ico'];
    if (!rasterFallback.includes(ext)) {
      throw ConvertError.unsupportedImageFormat(ext);
    }
  }
}

/** Décodage image partagé (ex. export PDF). */
export async function decodeFileToImageData(file: File): Promise<ImageData> {
  return decodeToImageData(file);
}

export async function convertImageFile(
  file: File,
  output: OutputFormatOption,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  validateImageFile(file);
  onProgress(0.05);
  const imageData = await decodeToImageData(file);
  onProgress(0.45);
  const encoded = await encodeImageData(imageData, output.id);
  onProgress(1);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'converti';
  return {
    blob: new Blob([encoded], { type: output.mime }),
    mime: output.mime,
    filename: `${baseName}.${output.extension}`,
  };
}
