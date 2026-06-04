import {
  extensionFromFile,
  formatBytes,
  getMaxBytesForFile,
  getWebBatchLimitBytes,
  isAppOnlyExtension,
} from '../../data/converter-limits.js';

function webBatchMoLabel(): string {
  return String(Math.round(getWebBatchLimitBytes() / (1024 * 1024)));
}

export class ConvertError extends Error {
  readonly code: string;

  readonly userMessage: string;

  constructor(code: string, userMessage: string) {
    super(userMessage);
    this.name = 'ConvertError';
    this.code = code;
    this.userMessage = userMessage;
  }

  static fileTooHeavy(file?: File): ConvertError {
    const limit = file ? formatBytes(getMaxBytesForFile(file)) : '16 Mo';
    return new ConvertError(
      'file_too_heavy',
      `Poids : ce fichier dépasse la limite (${limit} max selon le type).`,
    );
  }

  static batchTooHeavy(totalLabel: string): ConvertError {
    return new ConvertError(
      'batch_too_heavy',
      `Poids : ${totalLabel} au total. Maximum ${webBatchMoLabel()} Mo pour l'ensemble des fichiers.`,
    );
  }

  static unsupportedFile(): ConvertError {
    return new ConvertError(
      'unsupported_format',
      'Format : ce type de fichier n\'est pas pris en charge sur le web.',
    );
  }

  static unsupportedImageFormat(ext: string): ConvertError {
    return new ConvertError(
      'unsupported_format',
      `Format : .${ext} n'est pas pris en charge pour les images sur le web.`,
    );
  }

  static unsupportedConversion(inputLabel: string, outputLabel: string): ConvertError {
    return new ConvertError(
      'unsupported_conversion',
      `Conversion : ${inputLabel} vers ${outputLabel} n'est pas disponible.`,
    );
  }

  static svgUnreadable(): ConvertError {
    return new ConvertError(
      'svg_decode',
      'Format SVG : fichier illisible ou invalide pour le navigateur.',
    );
  }

  static svgNoSize(): ConvertError {
    return new ConvertError(
      'svg_size',
      'Taille SVG : dimensions introuvables. Ajoutez width, height ou viewBox.',
    );
  }

  static imageUnreadable(): ConvertError {
    return new ConvertError(
      'image_decode',
      'Format image : le navigateur n\'a pas pu décoder ce fichier.',
    );
  }

  static audioUnreadable(): ConvertError {
    return new ConvertError(
      'audio_decode',
      'Format audio : lecture impossible ici. Essayez WAV ou MP3.',
    );
  }

  static csvEmpty(): ConvertError {
    return new ConvertError('csv_content', 'Contenu : le fichier CSV est vide.');
  }

  static jsonInvalid(): ConvertError {
    return new ConvertError('json_content', 'Contenu : le JSON n\'est pas valide.');
  }

  static jsonNeedsArray(): ConvertError {
    return new ConvertError(
      'json_shape',
      'Contenu : pour un CSV, le JSON doit être un tableau non vide.',
    );
  }

  static jsonNeedsObjects(): ConvertError {
    return new ConvertError(
      'json_shape',
      'Contenu : le tableau JSON doit contenir des objets (clés/valeurs).',
    );
  }

  static browserCanvas(): ConvertError {
    return new ConvertError(
      'browser',
      'Navigateur : la conversion image nécessite le canvas (non disponible).',
    );
  }

  static encodeFailed(outputLabel: string): ConvertError {
    return new ConvertError(
      'encode_failed',
      `Conversion : impossible de produire un fichier ${outputLabel}.`,
    );
  }

  static pdfBuildFailed(): ConvertError {
    return new ConvertError(
      'pdf_build',
      'PDF : impossible de générer le fichier. Réduisez la taille ou changez de format.',
    );
  }

  static pdfReadFailed(): ConvertError {
    return new ConvertError(
      'pdf_read',
      'PDF : lecture impossible dans le navigateur. Rechargez la page ou réessayez avec un PDF plus léger.',
    );
  }

  static pdfTooManyPages(max: number): ConvertError {
    return new ConvertError(
      'pdf_pages',
      `PDF : ce fichier dépasse ${max} pages (limite du site).`,
    );
  }

  static pdfEncrypted(): ConvertError {
    return new ConvertError(
      'pdf_encrypted',
      'PDF : fichier protégé par mot de passe. Déverrouillez-le avant conversion.',
    );
  }

  static pdfNoText(): ConvertError {
    return new ConvertError(
      'pdf_no_text',
      'PDF : aucun texte extractible en sortie texte. Essayez la sortie HTML pour garder l\'aperçu des pages.',
    );
  }

  static unknown(): ConvertError {
    return new ConvertError(
      'unknown',
      `Conversion impossible. Vérifiez le format, le poids (lot max ${webBatchMoLabel()} Mo) et le format de sortie.`,
    );
  }
}

export function formatConversionError(err: unknown, file?: File): string {
  if (err instanceof ConvertError) return err.userMessage;

  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (/volume|volumineux|too large|file size/i.test(raw)) {
    return ConvertError.fileTooHeavy().userMessage;
  }
  if (/json/i.test(raw) && /invalid|parse/i.test(lower)) {
    return ConvertError.jsonInvalid().userMessage;
  }
  if (/svg/i.test(lower)) {
    return ConvertError.svgUnreadable().userMessage;
  }
  if (/decode|décod|bitmap|image/i.test(lower)) {
    if (file && extensionFromFile(file) === 'svg') {
      return ConvertError.svgUnreadable().userMessage;
    }
    return ConvertError.imageUnreadable().userMessage;
  }
  if (/audio|mpeg|ogg/i.test(lower)) {
    return ConvertError.audioUnreadable().userMessage;
  }

  const ext = file ? extensionFromFile(file) : '';
  if (ext) {
    return `Conversion impossible pour .${ext}. Vérifiez le poids (lot max ${webBatchMoLabel()} Mo) et le format de sortie.`;
  }

  return ConvertError.unknown().userMessage;
}

export function validateFileWeight(file: File): void {
  if (file.size > getMaxBytesForFile(file)) {
    throw ConvertError.fileTooHeavy(file);
  }
}

export function validateBatchWeight(totalBytes: number): void {
  if (totalBytes > getWebBatchLimitBytes()) {
    throw ConvertError.batchTooHeavy(formatBytes(totalBytes));
  }
}

function rejectedFormatLabel(file: File): string {
  const ext = extensionFromFile(file);
  if (ext) return `.${ext === 'jpeg' ? 'jpg' : ext}`;
  return file.name || 'fichier inconnu';
}

/** Message affiché dans la dropzone quand des fichiers ne sont pas pris en charge sur le web. */
export function formatRejectedFilesMessage(files: readonly File[]): string {
  if (files.length === 0) return '';

  const appOnly: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const ext = extensionFromFile(file);
    const key = ext || file.name;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = rejectedFormatLabel(file);
    if (ext && isAppOnlyExtension(ext)) appOnly.push(label);
    else other.push(label);
  }

  const list = [...appOnly, ...other].join(', ');

  if (appOnly.length > 0 && other.length === 0) {
    return `Format : ${list} non disponible(s) sur le web. Utilisez l'application desktop.`;
  }
  if (appOnly.length > 0) {
    return `Format : ${list} non pris en charge sur le web. Certains types nécessitent l'application desktop.`;
  }
  return `Format : ${list} non pris en charge sur le web.`;
}
