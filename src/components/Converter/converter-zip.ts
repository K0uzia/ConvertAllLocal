import { zip } from 'fflate';

export interface ZipEntry {
  filename: string;
  blob: Blob;
}

/** Afficher le téléchargement ZIP si la file contient plus de 5 fichiers. */
export const ZIP_DOWNLOAD_MIN_FILE_COUNT = 6;

function safeZipEntryName(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').replace(/\0/g, '').trim();
  return base.length > 0 ? base : 'fichier';
}

function uniquifyZipName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n += 1;
  const unique = `${stem}-${n}${ext}`;
  used.add(unique);
  return unique;
}

export function zipArchiveFilename(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `convertalllocal-${y}-${m}-${d}.zip`;
}

export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  if (entries.length === 0) {
    throw new Error('Aucun fichier à archiver.');
  }

  const data: Record<string, Uint8Array> = {};
  const used = new Set<string>();

  for (const entry of entries) {
    const safe = safeZipEntryName(entry.filename);
    const name = uniquifyZipName(safe, used);
    data[name] = new Uint8Array(await entry.blob.arrayBuffer());
  }

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(data, (err, out) => {
      if (err) reject(err);
      else resolve(out);
    });
  });

  return new Blob([zipped], { type: 'application/zip' });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}
