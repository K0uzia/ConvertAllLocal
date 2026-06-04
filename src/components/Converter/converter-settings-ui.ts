import type { ConverterCategory } from '../../data/converter-limits.js';
import { outputFormatsForCategory } from '../../data/converter-output-formats.js';
import { clearQueueStore } from './converter-queue-store.js';
import {
  allStoredOutputsSummary,
  clearAll,
  getOutputFormat,
  listKeys,
  resetAllOutputFormats,
  setOutputFormat,
} from './converter-storage.js';

const SETTINGS_CATEGORIES: ConverterCategory[] = ['image', 'audio', 'document'];

function populateOutputSelect(select: HTMLSelectElement, category: ConverterCategory): void {
  const current = getOutputFormat(category);
  const options = outputFormatsForCategory(category);
  select.replaceChildren();

  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.id;
    el.textContent = opt.label;
    select.append(el);
  }

  if (options.some((o) => o.id === current)) {
    select.value = current;
  } else if (options[0]) {
    select.value = options[0].id;
    setOutputFormat(category, options[0].id);
  }
}

function bindOutputSelects(root: HTMLElement, onChange: () => void): void {
  for (const id of SETTINGS_CATEGORIES) {
    const select = root.querySelector<HTMLSelectElement>(`[data-settings-output="${id}"]`);
    if (!select || select.dataset.settingsOutputBound === 'true') continue;

    select.dataset.settingsOutputBound = 'true';
    populateOutputSelect(select, id);

    select.addEventListener('change', () => {
      setOutputFormat(id, select.value);
      document.dispatchEvent(
        new CustomEvent('cal:output-format-changed', { detail: { category: id } }),
      );
      onChange();
    });
  }
}

function refreshOutputSelectValues(root: HTMLElement): void {
  for (const id of SETTINGS_CATEGORIES) {
    const select = root.querySelector<HTMLSelectElement>(`[data-settings-output="${id}"]`);
    if (!select) continue;
    populateOutputSelect(select, id);
  }
}

export function initConverterSettings(): void {
  const root = document.querySelector<HTMLElement>('[data-converter-settings]');
  if (!root) return;

  const outputValue = root.querySelector<HTMLElement>('[data-settings-output-value]');
  const keysCount = root.querySelector<HTMLElement>('[data-settings-keys-count]');
  const resetOutputBtn = root.querySelector<HTMLButtonElement>('[data-settings-reset-output]');
  const clearStorageBtn = root.querySelector<HTMLButtonElement>('[data-settings-clear-storage]');

  const refresh = (): void => {
    if (outputValue) outputValue.textContent = allStoredOutputsSummary();
    if (keysCount) keysCount.textContent = String(listKeys().length);
  };

  bindOutputSelects(root, refresh);

  if (root.dataset.settingsBound === 'true') {
    refreshOutputSelectValues(root);
    refresh();
    return;
  }
  root.dataset.settingsBound = 'true';

  resetOutputBtn?.addEventListener('click', () => {
    resetAllOutputFormats();
    refreshOutputSelectValues(root);
    refresh();
    document.dispatchEvent(new CustomEvent('cal:output-format-changed'));
  });

  clearStorageBtn?.addEventListener('click', () => {
    clearAll();
    resetAllOutputFormats();
    void clearQueueStore();
    refreshOutputSelectValues(root);
    refresh();
    document.dispatchEvent(new CustomEvent('cal:storage-cleared'));
  });

  refresh();
}
