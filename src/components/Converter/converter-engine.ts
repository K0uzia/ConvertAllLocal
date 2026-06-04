import {
  defaultOutputByCategory,
  outputFormatById,
  outputFormatsForCategory,
} from '../../data/converter-output-formats.js';
import {
  detectCategory,
  extensionFromFile,
  type ConverterCategory,
} from '../../data/converter-limits.js';
import { convertAudioFile } from './converter-audio-engine.js';
import { convertDocumentFile } from './converter-document-engine.js';
import { ConvertError } from './converter-errors.js';
import { convertImageFile, type ConvertResult, type ProgressCallback } from './converter-image-engine.js';
import { convertFileToPdfOutput, convertPdfFile } from './converter-pdf-engine.js';

export { ConvertError } from './converter-errors.js';
export type { ConvertResult, ProgressCallback } from './converter-image-engine.js';

export function getCategoryForFile(file: File): ConverterCategory {
  const category = detectCategory(file);
  if (!category) {
    throw ConvertError.unsupportedFile();
  }
  return category;
}

export function resolveOutputFormat(file: File, outputId: string) {
  const category = getCategoryForFile(file);
  const inputExt = extensionFromFile(file);
  const allowed = outputFormatsForCategory(category, inputExt);
  const chosen = outputFormatById(outputId);
  if (!chosen || !allowed.some((o) => o.id === chosen.id)) {
    const fallbackId = defaultOutputByCategory[category];
    const fallback = outputFormatById(fallbackId);
    if (!fallback) throw ConvertError.encodeFailed(outputId);
    return fallback;
  }
  return chosen;
}

export async function convertFile(
  file: File,
  outputFormatId: string,
  onProgress: ProgressCallback,
): Promise<ConvertResult> {
  const category = getCategoryForFile(file);
  const output = resolveOutputFormat(file, outputFormatId);
  const inputExt = extensionFromFile(file);

  if (output.id === 'pdf') {
    if (category === 'image' || category === 'document') {
      return convertFileToPdfOutput(file, category, onProgress);
    }
    throw ConvertError.unsupportedConversion(inputExt ? `.${inputExt}` : 'fichier', output.label);
  }

  if (category === 'document' && inputExt === 'pdf') {
    return convertPdfFile(file, output, onProgress);
  }

  if (category === 'image') {
    return convertImageFile(file, output, onProgress);
  }
  if (category === 'audio') {
    return convertAudioFile(file, output, onProgress);
  }
  return convertDocumentFile(file, output, onProgress);
}
