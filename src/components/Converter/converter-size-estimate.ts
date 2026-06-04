import { detectCategory, extensionFromFile, formatBytes } from '../../data/converter-limits.js';
import { outputFormatById } from '../../data/converter-output-formats.js';

const COMPRESSED_AUDIO = new Set(['mp3', 'mpeg', 'ogg', 'opus', 'm4a', 'aac', 'flac']);

/** Estimation grossière du poids après conversion (sans décoder le fichier). */
export function estimateOutputBytes(file: File, outputFormatId: string): number {
  const category = detectCategory(file);
  const inputSize = Math.max(1, file.size);
  const inputExt = extensionFromFile(file);

  if (!category || !outputFormatById(outputFormatId)) {
    return inputSize;
  }

  if (category === 'image') {
    const ratio = imageOutputRatio(outputFormatId, inputExt);
    return Math.max(1, Math.round(inputSize * ratio));
  }

  if (category === 'audio') {
    return Math.max(1, Math.round(inputSize * audioOutputRatio(outputFormatId, inputExt)));
  }

  return Math.max(1, Math.round(inputSize * documentOutputRatio(outputFormatId, inputExt)));
}

function imageOutputRatio(outputId: string, inputExt: string): number {
  const isPhoto = ['jpg', 'jpeg', 'jfif', 'webp', 'avif', 'heic'].includes(inputExt);
  const ratios: Record<string, number> = {
    webp: isPhoto ? 0.72 : 0.85,
    jpeg: isPhoto ? 0.82 : 0.95,
    png: inputExt === 'png' ? 1.05 : isPhoto ? 1.35 : 1.15,
    avif: isPhoto ? 0.5 : 0.65,
    pdf: 0.95,
  };
  return ratios[outputId] ?? 0.85;
}

function audioOutputRatio(outputId: string, inputExt: string): number {
  const compressedIn = COMPRESSED_AUDIO.has(inputExt);
  if (outputId === 'wav') {
    if (compressedIn) return 9;
    if (inputExt === 'wav') return 1.02;
    return 4;
  }
  if (outputId === 'mp3') {
    if (inputExt === 'wav' || inputExt === 'wave') return 0.12;
    if (compressedIn) return 0.95;
    return 0.35;
  }
  if (outputId === 'ogg') {
    if (inputExt === 'wav' || inputExt === 'wave') return 0.14;
    if (inputExt === 'mp3' || inputExt === 'mpeg') return 0.92;
    return 0.4;
  }
  return 1;
}

function documentOutputRatio(outputId: string, inputExt: string): number {
  if (outputId === 'pdf') {
    if (inputExt === 'md' || inputExt === 'html' || inputExt === 'htm') return 1.2;
    return 1.05;
  }
  if (outputId === 'txt' && inputExt === 'pdf') return 0.12;
  if (outputId === 'html' && inputExt === 'md') return 1.15;
  if (outputId === 'txt') return 0.92;
  if (outputId === 'json' && inputExt === 'csv') return 1.08;
  if (outputId === 'csv' && inputExt === 'json') return 0.88;
  return 1;
}

export interface OutputWeightDisplay {
  label: string;
  value: string;
  approximate: boolean;
}

export function outputWeightDisplay(
  file: File,
  outputFormatId: string,
  resultBytes?: number,
): OutputWeightDisplay {
  if (resultBytes !== undefined && resultBytes >= 0) {
    return {
      label: '',
      value: `~${formatBytes(resultBytes)}`,
      approximate: true,
    };
  }

  const estimated = estimateOutputBytes(file, outputFormatId);
  return {
    label: '',
    value: `~${formatBytes(estimated)}`,
    approximate: true,
  };
}
