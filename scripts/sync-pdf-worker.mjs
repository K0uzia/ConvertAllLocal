import { copyFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
const dest = join(root, 'public/pdf.worker.min.mjs');

if (!existsSync(src)) {
  console.warn('sync-pdf-worker: pdfjs-dist introuvable, copie ignorée.');
  process.exit(0);
}

copyFileSync(src, dest);
