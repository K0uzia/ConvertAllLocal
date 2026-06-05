import type { ConverterCategory } from '../../data/converter-limits.js';
import { outputFormatsForCategory } from '../../data/converter-output-formats.js';
import {
  bindFormatPickerGlobalListeners,
  createFormatPickerField,
  type FormatPickerOption,
} from './converter-format-picker.js';
import {
  filterImageOutputFormats,
  probeImageEncodeCapabilities,
} from './converter-image-capabilities.js';
import { deleteQueueDatabase, loadQueueSnapshot } from './converter-queue-store.js';
import {
  clearAll,
  getOutputFormat,
  listKeys,
  resetOutputFormat,
  setOutputFormat,
} from './converter-storage.js';

const SETTINGS_CATEGORIES: ConverterCategory[] = ['image', 'audio', 'document'];

const SETTINGS_OUTPUT_ARIA: Record<ConverterCategory, string> = {
  image: 'Format de sortie par défaut pour les images',
  audio: 'Format de sortie par défaut pour l\'audio',
  document: 'Format de sortie par défaut pour les documents',
};

const SETTINGS_OUTPUT_LIST_ARIA: Record<ConverterCategory, string> = {
  image: 'Formats de sortie image par défaut',
  audio: 'Formats de sortie audio par défaut',
  document: 'Formats de sortie document par défaut',
};

function outputOptionsForCategory(category: ConverterCategory): FormatPickerOption[] {
  const raw = outputFormatsForCategory(category);
  const options = category === 'image' ? filterImageOutputFormats(raw) : raw;
  return options.map((opt) => ({ id: opt.id, label: opt.label }));
}

function mountOutputPicker(
  root: HTMLElement,
  category: ConverterCategory,
  onChange: () => void,
): void {
  const mount = root.querySelector<HTMLElement>(`[data-settings-output-picker="${category}"]`);
  if (!mount) return;

  const options = outputOptionsForCategory(category);
  const stored = getOutputFormat(category);
  const value = options.some((o) => o.id === stored) ? stored : (options[0]?.id ?? stored);
  if (value !== stored && options[0]) {
    setOutputFormat(category, options[0].id);
  }

  const picker = createFormatPickerField({
    id: `settings-output-${category}`,
    variant: 'settings',
    ariaLabel: SETTINGS_OUTPUT_ARIA[category],
    listAriaLabel: SETTINGS_OUTPUT_LIST_ARIA[category],
    options,
    value,
    onChange: (nextId) => {
      setOutputFormat(category, nextId);
      document.dispatchEvent(
        new CustomEvent('cal:output-format-changed', { detail: { category } }),
      );
      onChange();
    },
  });
  mount.replaceChildren(picker);
}

function bindOutputPickers(root: HTMLElement, onChange: () => void): void {
  for (const category of SETTINGS_CATEGORIES) {
    mountOutputPicker(root, category, onChange);
  }
}

function refreshOutputPickerValues(root: HTMLElement, onChange: () => void): void {
  bindOutputPickers(root, onChange);
}

export async function initConverterSettings(): Promise<void> {
  bindFormatPickerGlobalListeners();

  const root = document.querySelector<HTMLElement>('[data-converter-settings]');
  if (!root) return;

  const storageStatus = root.querySelector<HTMLElement>('[data-settings-storage-status]');
  const countPersistableSnapshotItems = (snapshot: Awaited<ReturnType<typeof loadQueueSnapshot>>): number =>
    snapshot?.items.filter((item) => item.status === 'queued' || item.status === 'error').length ??
    0;
  const clearStorageBtn = root.querySelector<HTMLButtonElement>('[data-settings-clear-storage]');
  const clearModal = root.querySelector<HTMLDialogElement>('[data-settings-clear-modal]');
  const clearConfirmBtn = root.querySelector<HTMLButtonElement>('[data-settings-clear-confirm]');
  const clearCancelBtn = root.querySelector<HTMLButtonElement>('[data-settings-clear-cancel]');

  const appendStorageCountPart = (
    parent: HTMLElement,
    count: number,
    singularLabel: string,
    pluralLabel: string,
  ): void => {
    if (parent.childNodes.length > 0) {
      parent.append(document.createTextNode(' · '));
    }
    const num = document.createElement('span');
    num.className = 'converter-settings__storage-num';
    num.textContent = String(count);
    const label = count === 1 ? ` ${singularLabel}` : ` ${pluralLabel}`;
    parent.append(num, document.createTextNode(label));
  };

  const refresh = async (): Promise<void> => {
    if (!storageStatus) return;

    const prefs = listKeys().length;
    const snapshot = await loadQueueSnapshot();
    const queueCount = countPersistableSnapshotItems(snapshot);

    storageStatus.replaceChildren();
    if (prefs === 0 && queueCount === 0) {
      storageStatus.textContent = 'Rien d\'enregistré';
      return;
    }
    if (prefs > 0) {
      appendStorageCountPart(storageStatus, prefs, 'format mémorisé', 'formats mémorisés');
    }
    if (queueCount > 0) {
      appendStorageCountPart(storageStatus, queueCount, 'fichier en attente', 'fichiers en attente');
    }
  };

  const onPickerChange = (): void => {
    void refresh();
  };

  bindOutputPickers(root, onPickerChange);

  if (root.dataset.settingsBound === 'true') {
    await probeImageEncodeCapabilities();
    mountOutputPicker(root, 'image', onPickerChange);
    refreshOutputPickerValues(root, onPickerChange);
    void refresh();
    return;
  }
  root.dataset.settingsBound = 'true';

  await probeImageEncodeCapabilities();
  mountOutputPicker(root, 'image', onPickerChange);

  for (const category of SETTINGS_CATEGORIES) {
    const resetBtn = root.querySelector<HTMLButtonElement>(
      `[data-settings-reset-output="${category}"]`,
    );
    if (!resetBtn || resetBtn.dataset.settingsResetBound === 'true') continue;

    resetBtn.dataset.settingsResetBound = 'true';
    resetBtn.addEventListener('click', () => {
      resetOutputFormat(category);
      mountOutputPicker(root, category, () => {
        void refresh();
      });
      void refresh();
      document.dispatchEvent(
        new CustomEvent('cal:output-format-changed', { detail: { category } }),
      );
    });
  }

  const runClearStorage = (): void => {
    clearAll();
    void (async () => {
      await deleteQueueDatabase();
      refreshOutputPickerValues(root, () => {
        void refresh();
      });
      await refresh();
      document.dispatchEvent(new CustomEvent('cal:storage-cleared'));
    })();
  };

  clearStorageBtn?.addEventListener('click', () => {
    clearModal?.showModal();
  });

  clearCancelBtn?.addEventListener('click', () => {
    clearModal?.close();
  });

  clearConfirmBtn?.addEventListener('click', () => {
    clearModal?.close();
    runClearStorage();
  });

  void refresh();
}
