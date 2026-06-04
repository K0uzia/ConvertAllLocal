import type { SupportedFormat } from './supported-formats.js';
import { formatListStats, parseFormatsSource } from './format-parser.js';

/** Formats image courants (web + RAW / pro réservés app). */
const IMAGE_FORMATS_SOURCE = `
.png .jpeg .jpg .webp .gif .svg .avif .ico .bmp .tiff .tif .jfif
.heic* .heif* .psd* .jxl* .eps* .ai* .xcf*
.nef* .cr2* .cr3* .arw* .dng* .raf* .orf* .pef* .rw2* .raw*
`;

export const imageFormats: SupportedFormat[] = parseFormatsSource(IMAGE_FORMATS_SOURCE);
export const imageFormatStats = formatListStats(imageFormats);
