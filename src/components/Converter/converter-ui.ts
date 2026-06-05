import {
  detectCategory,
  detectFormatsLabel,
  extensionFromFile,
  formatBytes,
  isSupportedWebFile,
  WEB_ACCEPT_ATTR,
  getWebBatchLimitBytes,
  type ConverterCategory,
} from '../../data/converter-limits.js';
import {
  imageOutputFormats,
  outputFormatsForCategory,
} from '../../data/converter-output-formats.js';
import {
  filterImageOutputFormats,
  probeImageEncodeCapabilities,
} from './converter-image-capabilities.js';
import { convertFile, resolveOutputFormat } from './converter-engine.js';
import {
  ConvertError,
  formatConversionError,
  formatRejectedFilesMessage,
  validateBatchWeight,
  validateFileWeight,
} from './converter-errors.js';
import {
  clearQueueStore,
  loadQueueSnapshot,
  saveQueueSnapshot,
  type StoredQueueItem,
} from './converter-queue-store.js';
import {
  bindFormatPickerGlobalListeners,
  createFormatPickerField,
} from './converter-format-picker.js';
import { outputWeightDisplay, type OutputWeightDisplay } from './converter-size-estimate.js';
import { getOutputFormat, setOutputFormat } from './converter-storage.js';
import {
  buildZipBlob,
  triggerBlobDownload,
  zipArchiveFilename,
  ZIP_DOWNLOAD_MIN_FILE_COUNT,
  type ZipEntry,
} from './converter-zip.js';

type FileStatus = 'queued' | 'converting' | 'success' | 'error';

interface QueueItem {
  id: string;
  file: File;
  outputFormatId: string;
  status: FileStatus;
  progress: number;
  message: string;
  downloadUrl?: string;
  downloadName?: string;
  resultBlob?: Blob;
}

let queue: QueueItem[] = [];
let nextId = 0;
let hasStartedConversion = false;

const META_BRAND_CLASS = 'converter__meta-value-brand';

const FILE_CATEGORY_ICONS: Record<ConverterCategory, string> = {
  image: 'fa-image',
  audio: 'fa-music',
  document: 'fa-file-lines',
};

const FILE_STATUS_UI = {
  queued: { label: 'En attente', icon: 'fa-clock' },
  converting: { label: 'Conversion en cours', icon: 'fa-spinner', spin: true },
  success: { label: 'Converti', icon: 'fa-circle-check' },
  error: { label: 'Échec', icon: 'fa-circle-xmark' },
} as const;

function fillDropzoneFileStatus(el: HTMLElement, kind: keyof typeof FILE_STATUS_UI): void {
  const { label, icon, spin } = FILE_STATUS_UI[kind];
  el.replaceChildren();
  el.classList.remove(
    'converter__dropzone-file-status--queued',
    'converter__dropzone-file-status--converting',
    'converter__dropzone-file-status--success',
    'converter__dropzone-file-status--error',
  );
  el.classList.add(`converter__dropzone-file-status--${kind}`);
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', label);
  el.title = label;
  const iconEl = document.createElement('i');
  iconEl.className = `converter__dropzone-file-status-icon fa-solid ${icon}${spin ? ' fa-spin' : ''}`;
  iconEl.setAttribute('aria-hidden', 'true');
  const textEl = document.createElement('span');
  textEl.className = 'converter__dropzone-file-status-text';
  textEl.textContent = label;
  el.append(iconEl, textEl);
}

function fileCategoryIcon(file: File): string {
  const category = detectCategory(file) ?? 'image';
  return FILE_CATEGORY_ICONS[category];
}

function fileExtensionLabel(file: File): string {
  const ext = extensionFromFile(file);
  return ext ? ext.toUpperCase().slice(0, 5) : 'FICHIER';
}

/** Affichage dropzone : les échecs en fin de liste (ordre relatif conservé). */
function queueItemsForDisplay(items: QueueItem[]): QueueItem[] {
  const leading: QueueItem[] = [];
  const failed: QueueItem[] = [];
  for (const item of items) {
    if (item.status === 'error') failed.push(item);
    else leading.push(item);
  }
  return [...leading, ...failed];
}

function splitFormatBytes(formatted: string): { value: string; unit: string } {
  const space = formatted.lastIndexOf(' ');
  if (space <= 0) return { value: formatted, unit: '' };
  return { value: formatted.slice(0, space), unit: formatted.slice(space + 1) };
}

function appendBrandNumber(parent: HTMLElement, text: string): void {
  parent.replaceChildren();
  if (!text) return;
  const parts = text.split(/(\d+(?:[.,]\d+)?)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^\d+(?:[.,]\d+)?$/.test(part)) {
      const span = document.createElement('span');
      span.className = META_BRAND_CLASS;
      span.textContent = part;
      parent.append(span);
    } else {
      parent.append(document.createTextNode(part));
    }
  }
}

function setMetaWeightValue(
  weightEl: HTMLElement,
  currentBytes: number,
  limitBytes: number,
): void {
  const current = splitFormatBytes(formatBytes(currentBytes));
  const limit = formatBytes(limitBytes);
  weightEl.replaceChildren();
  const brand = document.createElement('span');
  brand.className = META_BRAND_CLASS;
  brand.textContent = current.unit ? `${current.value} ${current.unit}` : current.value;
  weightEl.append(brand, document.createTextNode(` / ${limit}`));
}

const DROPZONE_REJECT_ALERT_MS = 3000;
let dropzoneRejectHideTimer: ReturnType<typeof setTimeout> | undefined;

function clearDropzoneRejectHideTimer(): void {
  if (dropzoneRejectHideTimer !== undefined) {
    clearTimeout(dropzoneRejectHideTimer);
    dropzoneRejectHideTimer = undefined;
  }
}

function hideDropzoneRejectAlert(): void {
  clearDropzoneRejectHideTimer();
  const root = document.querySelector<HTMLElement>('[data-converter]');
  if (!root) return;
  const dropzone = root.querySelector<HTMLElement>('[data-converter-dropzone]');
  const dropzoneAlert = root.querySelector<HTMLElement>('[data-converter-dropzone-alert]');
  if (dropzoneAlert) {
    dropzoneAlert.textContent = '';
    dropzoneAlert.hidden = true;
  }
  dropzone?.classList.remove('converter__dropzone--reject');
}

function showDropzoneTimedAlert(message: string): void {
  const root = document.querySelector<HTMLElement>('[data-converter]');
  if (!root) return;
  const dropzone = root.querySelector<HTMLElement>('[data-converter-dropzone]');
  const dropzoneAlert = root.querySelector<HTMLElement>('[data-converter-dropzone-alert]');
  if (!dropzoneAlert) return;
  dropzoneAlert.textContent = message;
  dropzoneAlert.hidden = false;
  dropzone?.classList.add('converter__dropzone--reject');
  scheduleDropzoneRejectHide();
}

function convertedZipEntries(): ZipEntry[] {
  return queue
    .filter((item) => item.status === 'success' && item.resultBlob && item.downloadName)
    .map((item) => ({
      filename: item.downloadName!,
      blob: item.resultBlob!,
    }));
}

function shouldShowZipDownload(): boolean {
  return (
    queue.length >= ZIP_DOWNLOAD_MIN_FILE_COUNT && convertedZipEntries().length > 0
  );
}

function updateDropzoneZipButton(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-converter-download-zip]');
  if (!btn) return;
  const entries = convertedZipEntries();
  const show = shouldShowZipDownload();
  btn.hidden = !show;
  if (show) {
    btn.textContent =
      entries.length === 1
        ? 'Tout télécharger (ZIP)'
        : `Tout télécharger (ZIP, ${entries.length})`;
    btn.setAttribute(
      'aria-label',
      `Télécharger ${entries.length} fichier(s) converti(s) en une archive ZIP`,
    );
  }
}

function scheduleDropzoneRejectHide(): void {
  clearDropzoneRejectHideTimer();
  dropzoneRejectHideTimer = setTimeout(() => {
    dropzoneRejectHideTimer = undefined;
    hideDropzoneRejectAlert();
  }, DROPZONE_REJECT_ALERT_MS);
}

function makeId(): string {
  nextId += 1;
  return `f-${nextId}`;
}

function syncNextIdFromQueue(): void {
  let max = 0;
  for (const item of queue) {
    const num = Number.parseInt(item.id.replace(/^f-/, ''), 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  nextId = max;
}

function totalBytes(): number {
  return queue.reduce((sum, item) => sum + item.file.size, 0);
}

function revokeDownloadUrls(): void {
  for (const item of queue) {
    if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
  }
}

function outputOptionsForFile(file: File): typeof imageOutputFormats {
  const category = detectCategory(file) ?? 'image';
  if (category === 'image') return filterImageOutputFormats(imageOutputFormats);
  return outputFormatsForCategory(category, extensionFromFile(file));
}

function resolveOutputFormatId(file: File, preferred?: string): string {
  const category = detectCategory(file) ?? 'image';
  const stored = getOutputFormat(category);
  const candidate = preferred && outputOptionsForFile(file).some((o) => o.id === preferred)
    ? preferred
    : stored;
  try {
    return resolveOutputFormat(file, candidate).id;
  } catch {
    return outputOptionsForFile(file)[0]?.id ?? candidate;
  }
}

function applyStoredDefaultsToQueuedItems(category?: ConverterCategory): boolean {
  let changed = false;
  for (const item of queue) {
    if (item.status !== 'queued' && item.status !== 'error') continue;
    const itemCategory = detectCategory(item.file) ?? 'image';
    if (category && itemCategory !== category) continue;
    const next = resolveOutputFormatId(item.file);
    if (item.outputFormatId !== next) {
      item.outputFormatId = next;
      changed = true;
    }
  }
  return changed;
}

let onOutputFormatDefaultsChanged: ((category?: ConverterCategory) => void) | null = null;

document.addEventListener('cal:output-format-changed', (e) => {
  const detail = (e as CustomEvent<{ category?: ConverterCategory }>).detail;
  onOutputFormatDefaultsChanged?.(detail?.category);
});

function createFileOutputPicker(
  item: QueueItem,
  onPersist: () => void,
  onFormatChange?: (item: QueueItem) => void,
): HTMLElement {
  const options = outputOptionsForFile(item.file);
  const currentId = resolveOutputFormatId(item.file, item.outputFormatId);
  item.outputFormatId = currentId;
  const locked = item.status === 'converting' || item.status === 'success';

  return createFormatPickerField({
    id: `converter-output-${item.id}`,
    labelText: 'Sortie',
    ariaLabel: `Format de sortie pour ${item.file.name} (${options.length} formats)`,
    listAriaLabel: `Formats de sortie pour ${item.file.name}`,
    options: options.map((opt) => ({ id: opt.id, label: opt.label })),
    value: currentId,
    locked,
    menuDataset: { converterDropzoneOutput: item.id },
    onChange: (nextId) => {
      item.outputFormatId = nextId;
      const category = detectCategory(item.file) ?? 'image';
      setOutputFormat(category, nextId);
      onFormatChange?.(item);
      onPersist();
    },
  });
}

function statusForStore(status: FileStatus): StoredQueueItem['status'] {
  if (status === 'converting') return 'queued';
  return status;
}

function isPersistableQueueItem(item: QueueItem): boolean {
  return item.status === 'queued' || item.status === 'error';
}

let persistQueueTimer: ReturnType<typeof setTimeout> | null = null;

async function persistQueue(): Promise<void> {
  const items: StoredQueueItem[] = [];
  for (const item of queue) {
    if (!isPersistableQueueItem(item)) continue;

    const sourceBuffer = await item.file.arrayBuffer();
    items.push({
      id: item.id,
      name: item.file.name,
      type: item.file.type,
      lastModified: item.file.lastModified,
      outputFormatId: item.outputFormatId,
      status: statusForStore(item.status),
      progress: item.progress,
      message: item.message,
      sourceBuffer,
    });
  }

  if (items.length === 0) {
    await clearQueueStore();
    return;
  }

  await saveQueueSnapshot({
    nextId,
    hasStartedConversion: false,
    items,
  });
}

function schedulePersistQueue(): void {
  if (persistQueueTimer) clearTimeout(persistQueueTimer);
  persistQueueTimer = setTimeout(() => {
    persistQueueTimer = null;
    void persistQueue();
  }, 300);
}

async function restoreQueueFromStore(): Promise<void> {
  revokeDownloadUrls();
  queue = [];

  const snapshot = await loadQueueSnapshot();
  if (!snapshot?.items.length) return;

  for (const stored of snapshot.items) {
    if (stored.status === 'success' || stored.status === 'converting') continue;

    const file = new File([stored.sourceBuffer], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });

    if (!isSupportedWebFile(file)) continue;

    const status: FileStatus = stored.status === 'error' ? 'error' : 'queued';

    queue.push({
      id: stored.id,
      file,
      outputFormatId: resolveOutputFormatId(file, stored.outputFormatId),
      status,
      progress: stored.progress,
      message: stored.message,
    });
  }

  syncNextIdFromQueue();
  hasStartedConversion = false;
}

export async function initConverterUi(): Promise<void> {
  await probeImageEncodeCapabilities();

  const batchMo = Math.round(getWebBatchLimitBytes() / (1024 * 1024));
  for (const el of document.querySelectorAll<HTMLElement>('[data-converter-batch-mo]')) {
    el.textContent = String(batchMo);
  }

  const root = document.querySelector<HTMLElement>('[data-converter]');
  if (!root) return;

  const input = root.querySelector<HTMLInputElement>('[data-converter-input]');
  const dropzone = root.querySelector<HTMLElement>('[data-converter-dropzone]');
  const formatEl = root.querySelector<HTMLElement>('[data-converter-format]');
  const weightEl = root.querySelector<HTMLElement>('[data-converter-weight]');
  const metaEl = root.querySelector<HTMLElement>('[data-converter-meta]');
  const submitBtn = root.querySelector<HTMLButtonElement>('[data-converter-submit]');
  const filesLive = root.querySelector<HTMLElement>('[data-converter-files-live]');
  const dropzoneEmpty = root.querySelector<HTMLElement>('[data-converter-dropzone-empty]');
  const dropzoneFiles = root.querySelector<HTMLElement>('[data-converter-dropzone-files]');
  const dropzoneFooter = root.querySelector<HTMLElement>('[data-converter-dropzone-footer]');
  const dropzoneAddMore = root.querySelector<HTMLElement>('[data-converter-dropzone-more]');
  const dropzoneAlert = root.querySelector<HTMLElement>('[data-converter-dropzone-alert]');
  const clearAllBtn = root.querySelector<HTMLButtonElement>('[data-converter-clear-all]');
  const downloadZipBtn = root.querySelector<HTMLButtonElement>('[data-converter-download-zip]');

  if (!input || !dropzone || !formatEl || !weightEl || !metaEl || !submitBtn) {
    return;
  }

  input.setAttribute('accept', WEB_ACCEPT_ATTR);

  const setDropzoneRejectAlert = (rejected: File[]): void => {
    const message = formatRejectedFilesMessage(rejected);
    if (!message) {
      hideDropzoneRejectAlert();
      return;
    }
    showDropzoneTimedAlert(message);
  };

  const clearDropzoneRejectAlert = (): void => {
    hideDropzoneRejectAlert();
  };

  const updateMeta = (): void => {
    formatEl.textContent = detectFormatsLabel(queue.map((item) => item.file));
    const current = totalBytes();
    const batchLimit = getWebBatchLimitBytes();
    const over = current > batchLimit;
    setMetaWeightValue(weightEl, current, batchLimit);
    metaEl.classList.toggle('converter__meta--over', over);
  };

  onOutputFormatDefaultsChanged = (category) => {
    if (applyStoredDefaultsToQueuedItems(category)) {
      refreshDropzone();
      schedulePersistQueue();
    }
  };

  const refreshDropzone = (): void => {
    updateMeta();
    renderDropzoneFiles(
      dropzone,
      dropzoneEmpty,
      dropzoneFiles,
      dropzoneFooter,
      dropzoneAddMore,
      refreshDropzone,
      () => schedulePersistQueue(),
    );
    updateFilesLive(filesLive);
    updateDropzoneZipButton();
  };

  if (root.dataset.converterBound === 'true') {
    syncMeta(formatEl, weightEl, metaEl);
    refreshDropzone();
    return;
  }

  await restoreQueueFromStore();
  root.dataset.converterBound = 'true';

  bindFormatPickerGlobalListeners();

  const addFiles = (files: FileList | File[]): void => {
    const all = Array.from(files);
    const rejected: File[] = [];
    const list: File[] = [];
    for (const file of all) {
      if (isSupportedWebFile(file)) list.push(file);
      else rejected.push(file);
    }

    if (rejected.length > 0) {
      setDropzoneRejectAlert(rejected);
    } else {
      clearDropzoneRejectAlert();
    }

    if (list.length === 0) return;

    for (const file of list) {
      queue.push({
        id: makeId(),
        file,
        outputFormatId: resolveOutputFormatId(file),
        status: 'queued',
        progress: 0,
        message: '',
      });
    }
    updateMeta();
    refreshDropzone();
    schedulePersistQueue();
  };

  input.addEventListener('change', () => {
    if (input.files) addFiles(input.files);
    input.value = '';
  });

  dropzone.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-converter-dropzone-remove]') ||
      target.closest('[data-converter-clear-all]') ||
      target.closest('[data-converter-dropzone-output]') ||
      target.closest('[data-converter-download-zip]') ||
      target.closest('.converter__dropzone-file-download')
    ) {
      return;
    }
    const filled = dropzone.classList.contains('converter__dropzone--filled');
    if (filled && !target.closest('[data-converter-dropzone-more]')) {
      return;
    }
    input.click();
  });

  downloadZipBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    void (async () => {
      const entries = convertedZipEntries();
      if (entries.length === 0 || !downloadZipBtn) return;
      downloadZipBtn.disabled = true;
      downloadZipBtn.textContent = 'Préparation du ZIP…';
      try {
        const blob = await buildZipBlob(entries);
        triggerBlobDownload(blob, zipArchiveFilename());
      } catch {
        showDropzoneTimedAlert(
          'ZIP : impossible de préparer l\'archive. Réessayez ou téléchargez les fichiers un par un.',
        );
      } finally {
        downloadZipBtn.disabled = false;
        updateDropzoneZipButton();
      }
    })();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (dropzone.classList.contains('converter__dropzone--filled')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('converter__dropzone--active');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('converter__dropzone--active');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('converter__dropzone--active');
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  });

  clearAllBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    void resetConverterQueue().then(() => {
      clearDropzoneRejectAlert();
      updateMeta();
      refreshDropzone();
    });
  });
  clearAllBtn?.addEventListener('keydown', (e) => e.stopPropagation());

  downloadZipBtn?.addEventListener('keydown', (e) => e.stopPropagation());

  submitBtn.addEventListener('click', async () => {
    if (queue.length === 0) {
      input.click();
      return;
    }
    try {
      validateBatchWeight(totalBytes());
    } catch (err) {
      const message = formatConversionError(err);
      for (const item of queue) {
        if (item.status === 'queued' || item.status === 'error') {
          item.status = 'error';
          item.progress = 1;
          item.message = message;
        }
      }
      refreshDropzone();
      return;
    }

    hasStartedConversion = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('converter__submit--busy');

    for (const item of queue) {
      if (item.status === 'success') continue;
      if (item.downloadUrl) {
        URL.revokeObjectURL(item.downloadUrl);
        item.downloadUrl = undefined;
      }
      item.resultBlob = undefined;
      item.status = 'converting';
      item.progress = 0;
      item.message = '';
      refreshDropzone();

      const outputFormat = resolveOutputFormatId(item.file, item.outputFormatId);
      item.outputFormatId = outputFormat;

      try {
        validateFileWeight(item.file);
        const result = await convertFile(item.file, outputFormat, (ratio) => {
          item.progress = ratio;
          updateFileProgress(item.id, item.progress);
          updateFilesLive(filesLive);
        });
        item.status = 'success';
        item.progress = 1;
        item.message = 'Converti';
        item.resultBlob = result.blob;
        item.downloadUrl = URL.createObjectURL(result.blob);
        item.downloadName = result.filename;
      } catch (err) {
        item.status = 'error';
        item.progress = 1;
        item.message = formatConversionError(err, item.file);
      }
      refreshDropzone();
      await persistQueue();
    }

    submitBtn.disabled = false;
    submitBtn.classList.remove('converter__submit--busy');
    await persistQueue();
  });

  updateMeta();
  refreshDropzone();
}

async function removeQueueItem(id: string): Promise<void> {
  const item = queue.find((i) => i.id === id);
  if (item?.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
  queue = queue.filter((i) => i.id !== id);
  if (queue.length === 0) hasStartedConversion = false;
  await persistQueue();
}

function updateDropzoneInteractionState(
  dropzone: HTMLElement,
  addMoreEl: HTMLElement | null,
  filled: boolean,
): void {
  if (filled) {
    dropzone.removeAttribute('role');
    dropzone.removeAttribute('tabindex');
    dropzone.removeAttribute('aria-labelledby');
    addMoreEl?.setAttribute('aria-label', 'Ajouter d\'autres fichiers');
  } else {
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('tabindex', '0');
    dropzone.setAttribute(
      'aria-labelledby',
      'converter-upload-label converter-dropzone-alert',
    );
    addMoreEl?.removeAttribute('aria-label');
  }
}

function renderDropzoneFiles(
  dropzone: HTMLElement,
  emptyBlock: HTMLElement | null,
  listEl: HTMLElement | null,
  footerEl: HTMLElement | null,
  addMoreEl: HTMLElement | null,
  onRemove?: () => void,
  onOutputPersist?: () => void,
): void {
  if (!listEl) return;

  listEl.innerHTML = '';

  if (queue.length === 0) {
    listEl.hidden = true;
    emptyBlock?.classList.remove('converter__dropzone-empty--hidden');
    footerEl?.setAttribute('hidden', '');
    dropzone.classList.remove('converter__dropzone--filled');
    updateDropzoneInteractionState(dropzone, addMoreEl, false);
    return;
  }

  listEl.hidden = false;
  emptyBlock?.classList.add('converter__dropzone-empty--hidden');
  footerEl?.removeAttribute('hidden');
  dropzone.classList.add('converter__dropzone--filled');
  updateDropzoneInteractionState(dropzone, addMoreEl, true);

  for (const item of queueItemsForDisplay(queue)) {
    const li = document.createElement('li');
    li.className = 'converter__dropzone-file';
    if (item.status === 'success') li.classList.add('converter__dropzone-file--success');
    if (item.status === 'error') li.classList.add('converter__dropzone-file--error');
    if (item.status === 'converting') li.classList.add('converter__dropzone-file--converting');

    const row = document.createElement('div');
    row.className = 'converter__dropzone-file-row';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'converter__dropzone-file-icon';
    iconWrap.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('i');
    icon.className = `converter__dropzone-file-icon-glyph fa-solid ${fileCategoryIcon(item.file)}`;
    const extBadge = document.createElement('span');
    extBadge.className = 'converter__dropzone-file-ext';
    extBadge.textContent = fileExtensionLabel(item.file);
    iconWrap.append(icon, extBadge);

    const info = document.createElement('div');
    info.className = 'converter__dropzone-file-info';

    const name = document.createElement('span');
    name.className = 'converter__dropzone-file-name';
    name.textContent = item.file.name;
    name.title = item.file.name;

    const weight = document.createElement('div');
    weight.className = 'converter__dropzone-file-weight';
    weight.setAttribute('data-file-weight', item.id);
    fillFileWeightSlot(weight, item);

    info.append(name, weight);

    const controls = document.createElement('div');
    controls.className = 'converter__dropzone-file-controls';

    const outputPicker = createFileOutputPicker(
      item,
      () => onOutputPersist?.(),
      (changed) => updateFileOutputSize(changed),
    );

    const status = document.createElement('span');
    status.className = 'converter__dropzone-file-status';
    const statusKind =
      item.status === 'converting'
        ? 'converting'
        : item.status === 'success'
          ? 'success'
          : item.status === 'error'
            ? 'error'
            : 'queued';
    fillDropzoneFileStatus(status, statusKind);

    const progressSlot = document.createElement('span');
    progressSlot.className = 'converter__dropzone-file-progress-slot';
    if (item.status === 'converting') {
      const progress = document.createElement('progress');
      progress.className = 'converter__dropzone-file-progress';
      progress.max = 1;
      progress.value = item.progress;
      progress.setAttribute('data-file-progress', item.id);
      progress.setAttribute('aria-label', `Progression ${item.file.name}`);
      progressSlot.append(progress);
    }

    const downloadSlot = document.createElement('span');
    downloadSlot.className = 'converter__dropzone-file-download-slot';
    if (item.status === 'success' && item.downloadUrl && item.downloadName) {
      const link = document.createElement('a');
      link.className = 'btn btn--primary converter__dropzone-file-download';
      link.href = item.downloadUrl;
      link.download = item.downloadName;
      link.setAttribute('aria-label', `Télécharger ${item.downloadName}`);
      const downloadIcon = document.createElement('i');
      downloadIcon.className = 'converter__dropzone-file-download-icon fa-solid fa-download';
      downloadIcon.setAttribute('aria-hidden', 'true');
      const downloadText = document.createElement('span');
      downloadText.className = 'converter__dropzone-file-download-text';
      downloadText.textContent = 'Télécharger';
      link.append(downloadIcon, downloadText);
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        window.setTimeout(() => {
          if (!item.downloadUrl) return;
          URL.revokeObjectURL(item.downloadUrl);
          item.downloadUrl = item.resultBlob
            ? URL.createObjectURL(item.resultBlob)
            : undefined;
        }, 2000);
      });
      link.addEventListener('keydown', (e) => e.stopPropagation());
      downloadSlot.append(link);
    }

    controls.append(outputPicker, status, progressSlot, downloadSlot);

    row.append(iconWrap, info, controls);

    if (item.status !== 'converting') {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'converter__dropzone-file-remove';
      removeBtn.setAttribute('data-converter-dropzone-remove', item.id);
      removeBtn.setAttribute('aria-label', `Retirer ${item.file.name}`);
      const removeIcon = document.createElement('i');
      removeIcon.className = 'converter__dropzone-file-remove-icon fa-solid fa-xmark';
      removeIcon.setAttribute('aria-hidden', 'true');
      removeBtn.append(removeIcon);
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void removeQueueItem(item.id).then(() => onRemove?.());
      });
      removeBtn.addEventListener('keydown', (e) => e.stopPropagation());
      row.append(removeBtn);
    }

    li.append(row);

    if (item.status === 'error' && item.message) {
      const errorMsg = document.createElement('p');
      errorMsg.className = 'converter__dropzone-file-error-msg';
      errorMsg.textContent = item.message;
      errorMsg.setAttribute('role', 'alert');
      li.append(errorMsg);
    }

    listEl.append(li);
  }
}

function updateFilesLive(filesLive: HTMLElement | null): void {
  if (!filesLive) return;
  if (queue.length === 0) {
    filesLive.replaceChildren();
    return;
  }
  const done = queue.filter((i) => i.status === 'success' || i.status === 'error').length;
  const converting = queue.some((i) => i.status === 'converting');
  if (converting) {
    appendBrandNumber(filesLive, `Conversion en cours… ${done} / ${queue.length}`);
    return;
  }
  if (hasStartedConversion && done === queue.length) {
    appendBrandNumber(filesLive, `${done} fichier(s) converti(s)`);
    return;
  }
  if (queue.length > 0) {
    appendBrandNumber(filesLive, `${queue.length} fichier(s) en file`);
  }
}

function syncMeta(
  formatEl: HTMLElement,
  weightEl: HTMLElement,
  metaEl: HTMLElement,
): void {
  formatEl.textContent = detectFormatsLabel(queue.map((item) => item.file));
  const current = totalBytes();
  const batchLimit = getWebBatchLimitBytes();
  setMetaWeightValue(weightEl, current, batchLimit);
  metaEl.classList.toggle('converter__meta--over', current > batchLimit);
}

function updateFileProgress(id: string, progress: number): void {
  const bar = document.querySelector<HTMLProgressElement>(`[data-file-progress="${id}"]`);
  if (bar) bar.value = progress;
}

function fillOutputSizeValue(el: HTMLElement, display: OutputWeightDisplay): void {
  el.replaceChildren();
  if (!display.visible) return;

  const before = document.createElement('span');
  before.className = 'converter__dropzone-file-size-before';
  before.textContent = display.before;

  const arrow = document.createElement('span');
  arrow.className = 'converter__dropzone-file-size-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';

  const after = document.createElement('span');
  after.className = 'converter__dropzone-file-size-after';
  after.textContent = display.after;

  el.append(before, arrow, after);
  el.setAttribute('aria-label', display.value);
}

function fillFileWeightSlot(container: HTMLElement, item: QueueItem): void {
  const resultBytes =
    item.status === 'success' && item.resultBlob ? item.resultBlob.size : undefined;
  const display = outputWeightDisplay(item.file, item.outputFormatId, resultBytes);

  container.replaceChildren();

  if (display.visible) {
    const comparison = document.createElement('span');
    comparison.className = 'converter__dropzone-file-size-value';
    comparison.setAttribute('data-file-output-size-value', item.id);
    fillOutputSizeValue(comparison, display);
    container.append(comparison);
    return;
  }

  const sourceSize = document.createElement('span');
  sourceSize.className = 'converter__dropzone-file-size-text';
  sourceSize.setAttribute('data-file-source-size-value', item.id);
  sourceSize.textContent = formatBytes(item.file.size);
  container.append(sourceSize);
}

function updateFileOutputSize(item: QueueItem): void {
  const weightEl = document.querySelector<HTMLElement>(`[data-file-weight="${item.id}"]`);
  if (!weightEl) return;
  fillFileWeightSlot(weightEl, item);
}

export async function resetConverterQueue(): Promise<void> {
  revokeDownloadUrls();
  queue = [];
  nextId = 0;
  hasStartedConversion = false;
  await clearQueueStore();
  const root = document.querySelector<HTMLElement>('[data-converter]');
  if (root) {
    hideDropzoneRejectAlert();
    const dropzone = root.querySelector<HTMLElement>('[data-converter-dropzone]');
    const dropzoneEmpty = root.querySelector<HTMLElement>('[data-converter-dropzone-empty]');
    const dropzoneFiles = root.querySelector<HTMLElement>('[data-converter-dropzone-files]');
    const dropzoneFooter = root.querySelector<HTMLElement>('[data-converter-dropzone-footer]');
    const dropzoneAddMore = root.querySelector<HTMLElement>('[data-converter-dropzone-more]');
    const filesLive = root.querySelector<HTMLElement>('[data-converter-files-live]');
    const formatEl = root.querySelector<HTMLElement>('[data-converter-format]');
    const weightEl = root.querySelector<HTMLElement>('[data-converter-weight]');
    const metaEl = root.querySelector<HTMLElement>('[data-converter-meta]');
    if (dropzone) {
      renderDropzoneFiles(
        dropzone,
        dropzoneEmpty,
        dropzoneFiles,
        dropzoneFooter,
        dropzoneAddMore,
      );
    }
    if (formatEl && weightEl && metaEl) {
      syncMeta(formatEl, weightEl, metaEl);
    }
    updateFilesLive(filesLive);
    updateDropzoneZipButton();
  }
}
