import { formatListStats, parseFormatsSource } from './format-parser.js';

/** Formats documents : web = texte structuré (conversion sans perte de sens). */
const DOCUMENTS_FORMATS_SOURCE = `
.md .html .htm .csv .json .txt .pdf
.docx* .doc* .odt* .rtf* .epub*
`;

export const documentsFormats = parseFormatsSource(DOCUMENTS_FORMATS_SOURCE);
export const documentsFormatStats = formatListStats(documentsFormats);
