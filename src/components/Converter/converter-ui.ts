import './Converter.css';
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
import { outputFormatsForCategory } from '../../data/converter-output-formats.js';
import { convertFile } from './converter-engine.js';
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
import { outputWeightDisplay } from './converter-size-estimate.js';
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

const FILE_ROW_GAP = 'var(--converter-file-gap)';

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
  el.append(iconEl);
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

/** Styles de ligne en JS (complète le CSS global). */
function applyDropzoneFileRowLayout(
  body: HTMLElement,
  name: HTMLElement,
  outputGroup: HTMLElement,
): void {
  Object.assign(body.style, {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    minWidth: '0',
    gap: FILE_ROW_GAP,
    padding: '0',
    margin: '0',
    overflow: 'visible',
    textAlign: 'left',
  });
  Object.assign(name.style, {
    flex: '1 1 auto',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  });
  Object.assign(outputGroup.style, {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: '0 0 auto',
    flexShrink: '0',
    marginLeft: 'auto',
    gap: FILE_ROW_GAP,
    textAlign: 'right',
    overflow: 'visible',
  });
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

function resolveOutputFormatId(file: File, preferred?: string): string {
  const category = detectCategory(file) ?? 'image';
  const options = outputFormatsForCategory(category, extensionFromFile(file));
  if (preferred && options.some((o) => o.id === preferred)) return preferred;
  const stored = getOutputFormat(category);
  if (options.some((o) => o.id === stored)) return stored;
  return options[0]?.id ?? stored;
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

function createFileOutputSelect(
  item: QueueItem,
  onPersist: () => void,
  onFormatChange?: (item: QueueItem) => void,
): HTMLSelectElement {
  const category = detectCategory(item.file) ?? 'image';
  const options = outputFormatsForCategory(category, extensionFromFile(item.file));
  const select = document.createElement('select');
  select.className = 'converter__dropzone-file-output';
  select.setAttribute('data-converter-dropzone-output', item.id);
  select.setAttribute('aria-label', `Format de sortie pour ${item.file.name}`);

  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.id;
    el.textContent = opt.label;
    select.append(el);
  }

  select.value = resolveOutputFormatId(item.file, item.outputFormatId);
  item.outputFormatId = select.value;

  const locked = item.status === 'converting' || item.status === 'success';
  select.disabled = locked;

  if (!locked) {
    select.addEventListener('change', () => {
      item.outputFormatId = select.value;
      setOutputFormat(category, select.value);
      onFormatChange?.(item);
      onPersist();
    });
    select.addEventListener('click', (e) => e.stopPropagation());
    select.addEventListener('keydown', (e) => e.stopPropagation());
  }

  return select;
}

function statusForStore(status: FileStatus): StoredQueueItem['status'] {
  if (status === 'converting') return 'queued';
  return status;
}

async function persistQueue(): Promise<void> {
  if (queue.length === 0) {
    await clearQueueStore();
    return;
  }

  const items: StoredQueueItem[] = [];
  for (const item of queue) {
    const sourceBuffer = await item.file.arrayBuffer();
    const stored: StoredQueueItem = {
      id: item.id,
      name: item.file.name,
      type: item.file.type,
      lastModified: item.file.lastModified,
      outputFormatId: item.outputFormatId,
      status: statusForStore(item.status),
      progress: item.progress,
      message: item.message,
      sourceBuffer,
    };
    if (item.status === 'success' && item.resultBlob) {
      stored.resultBuffer = await item.resultBlob.arrayBuffer();
      stored.resultMime = item.resultBlob.type;
      stored.resultFilename = item.downloadName ?? item.file.name;
    }
    items.push(stored);
  }

  await saveQueueSnapshot({
    nextId,
    hasStartedConversion,
    items,
  });
}

async function restoreQueueFromStore(): Promise<void> {
  revokeDownloadUrls();
  queue = [];

  const snapshot = await loadQueueSnapshot();
  if (!snapshot?.items.length) return;

  for (const stored of snapshot.items) {
    const file = new File([stored.sourceBuffer], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    });

    if (!isSupportedWebFile(file)) continue;

    const status: FileStatus =
      stored.status === 'converting' ? 'queued' : (stored.status as FileStatus);

    const item: QueueItem = {
      id: stored.id,
      file,
      outputFormatId: resolveOutputFormatId(file, stored.outputFormatId),
      status,
      progress: stored.progress,
      message: stored.message,
    };

    if (stored.resultBuffer && stored.resultMime) {
      item.resultBlob = new Blob([stored.resultBuffer], { type: stored.resultMime });
      item.downloadUrl = URL.createObjectURL(item.resultBlob);
      item.downloadName = stored.resultFilename ?? stored.name;
    }

    queue.push(item);
  }

  syncNextIdFromQueue();
  hasStartedConversion =
    snapshot.hasStartedConversion && queue.some((i) => i.status !== 'queued');
}

export async function initConverterUi(): Promise<void> {
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
      void persistQueue();
    }
  };

  const refreshDropzone = (): void => {
    updateMeta();
    renderDropzoneFiles(
      dropzone,
      dropzoneEmpty,
      dropzoneFiles,
      dropzoneFooter,
      refreshDropzone,
      () => void persistQueue(),
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
    void persistQueue();
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
      target.closest('[data-converter-download-zip]')
    ) {
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
          refreshDropzone();
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

function renderDropzoneFiles(
  dropzone: HTMLElement,
  emptyBlock: HTMLElement | null,
  listEl: HTMLElement | null,
  footerEl: HTMLElement | null,
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
    dropzone.style.removeProperty('align-items');
    dropzone.style.removeProperty('text-align');
    dropzone.style.removeProperty('padding');
    listEl.style.removeProperty('width');
    listEl.style.removeProperty('text-align');
    listEl.style.removeProperty('margin');
    listEl.style.removeProperty('padding');
    return;
  }

  listEl.hidden = false;
  emptyBlock?.classList.add('converter__dropzone-empty--hidden');
  footerEl?.removeAttribute('hidden');
  dropzone.classList.add('converter__dropzone--filled');

  for (const item of queueItemsForDisplay(queue)) {
    const li = document.createElement('li');
    li.className = 'converter__dropzone-file';
    li.style.width = '100%';
    if (item.status === 'success') li.classList.add('converter__dropzone-file--success');
    if (item.status === 'error') li.classList.add('converter__dropzone-file--error');

    const body = document.createElement('div');
    body.className = 'converter__dropzone-file-body';

    const name = document.createElement('span');
    name.className = 'converter__dropzone-file-name';
    name.textContent = item.file.name;
    name.title = item.file.name;

    const inputWeight = document.createElement('span');
    inputWeight.className = 'converter__dropzone-file-in-weight';
    inputWeight.textContent = formatBytes(item.file.size);

    const outputLabel = document.createElement('label');
    outputLabel.className = 'converter__dropzone-file-output-label';
    outputLabel.textContent = 'Sortie';

    const outputSelect = createFileOutputSelect(
      item,
      () => onOutputPersist?.(),
      (changed) => updateFileOutputSize(changed),
    );
    const outputSelectId = `converter-output-${item.id}`;
    outputSelect.id = outputSelectId;
    outputLabel.setAttribute('for', outputSelectId);

    const resultBytes =
      item.status === 'success' && item.resultBlob ? item.resultBlob.size : undefined;
    const sizeDisplay = outputWeightDisplay(item.file, item.outputFormatId, resultBytes);

    const outSizeLabel = document.createElement('span');
    outSizeLabel.className = 'converter__dropzone-file-out-size-label';
    outSizeLabel.setAttribute('data-file-output-size-label', item.id);
    outSizeLabel.textContent = sizeDisplay.label;
    outSizeLabel.hidden = sizeDisplay.label.length === 0;

    const outSizeValue = document.createElement('span');
    outSizeValue.className = 'converter__dropzone-file-out-size-value';
    if (sizeDisplay.approximate) {
      outSizeValue.classList.add('converter__dropzone-file-out-size-value--approx');
    }
    outSizeValue.setAttribute('data-file-output-size-value', item.id);
    outSizeValue.textContent = sizeDisplay.value;

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
      link.className = 'converter__dropzone-file-download';
      link.href = item.downloadUrl;
      link.download = item.downloadName;
      link.setAttribute('aria-label', `Télécharger ${item.downloadName}`);
      const downloadIcon = document.createElement('i');
      downloadIcon.className = 'converter__dropzone-file-download-icon fa-solid fa-download';
      downloadIcon.setAttribute('aria-hidden', 'true');
      link.append(downloadIcon);
      link.addEventListener('click', (e) => e.stopPropagation());
      downloadSlot.append(link);
    }

    const outputGroup = document.createElement('div');
    outputGroup.className = 'converter__dropzone-file-out-group';
    outputGroup.append(
      outputLabel,
      outputSelect,
      outSizeLabel,
      outSizeValue,
      status,
      progressSlot,
      downloadSlot,
    );

    body.append(inputWeight, name, outputGroup);

    if (item.status !== 'converting') {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'converter__dropzone-file-remove';
      removeBtn.setAttribute('data-converter-dropzone-remove', item.id);
      removeBtn.setAttribute('aria-label', `Retirer ${item.file.name}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void removeQueueItem(item.id).then(() => onRemove?.());
      });
      body.append(removeBtn);
    }

    applyDropzoneFileRowLayout(body, name, outputGroup);
    li.append(body);

    if (item.status === 'error' && item.message) {
      const errorMsg = document.createElement('p');
      errorMsg.className = 'converter__dropzone-file-error-msg';
      errorMsg.textContent = item.message;
      errorMsg.setAttribute('role', 'alert');
      li.append(errorMsg);
    }

    listEl.append(li);
  }

  dropzone.style.alignItems = 'stretch';
  dropzone.style.textAlign = 'left';
  if (listEl) {
    listEl.style.width = '100%';
    listEl.style.textAlign = 'left';
    listEl.style.margin = '0';
    listEl.style.padding = '0';
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

function updateFileOutputSize(item: QueueItem): void {
  const labelEl = document.querySelector<HTMLElement>(`[data-file-output-size-label="${item.id}"]`);
  const valueEl = document.querySelector<HTMLElement>(`[data-file-output-size-value="${item.id}"]`);
  if (!labelEl || !valueEl) return;

  const resultBytes =
    item.status === 'success' && item.resultBlob ? item.resultBlob.size : undefined;
  const display = outputWeightDisplay(item.file, item.outputFormatId, resultBytes);
  labelEl.textContent = display.label;
  labelEl.hidden = display.label.length === 0;
  valueEl.textContent = display.value;
  valueEl.classList.toggle('converter__dropzone-file-out-size-value--approx', display.approximate);
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
    const filesLive = root.querySelector<HTMLElement>('[data-converter-files-live]');
    const formatEl = root.querySelector<HTMLElement>('[data-converter-format]');
    const weightEl = root.querySelector<HTMLElement>('[data-converter-weight]');
    const metaEl = root.querySelector<HTMLElement>('[data-converter-meta]');
    if (dropzone) {
      renderDropzoneFiles(dropzone, dropzoneEmpty, dropzoneFiles, dropzoneFooter);
    }
    if (formatEl && weightEl && metaEl) {
      syncMeta(formatEl, weightEl, metaEl);
    }
    updateFilesLive(filesLive);
    updateDropzoneZipButton();
  }
}
