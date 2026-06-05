export interface FormatPickerOption {
  id: string;
  label: string;
}

export type FormatPickerVariant = 'dropzone' | 'settings';

export interface FormatPickerConfig {
  id: string;
  labelText?: string;
  ariaLabel: string;
  listAriaLabel: string;
  options: FormatPickerOption[];
  value: string;
  variant?: FormatPickerVariant;
  locked?: boolean;
  onChange: (id: string) => void;
  menuDataset?: Record<string, string>;
}

const OPTION_SELECTOR = '.converter__dropzone-file-output-option';
const MENU_SELECTOR = '.converter-format-picker-menu';
const TRIGGER_SELECTOR =
  '.converter-format-picker-trigger, .converter__dropzone-file-output-trigger';

function getFormatOptionElements(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>(OPTION_SELECTOR)];
}

function focusFormatOption(list: HTMLElement, optionEl: HTMLElement): void {
  for (const el of getFormatOptionElements(list)) {
    el.tabIndex = -1;
  }
  optionEl.tabIndex = 0;
  optionEl.focus();
}

export function closeFormatMenu(
  trigger: HTMLButtonElement,
  list: HTMLElement,
  restoreFocus = false,
): void {
  list.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  for (const el of getFormatOptionElements(list)) {
    el.tabIndex = -1;
  }
  if (restoreFocus) trigger.focus();
}

function openFormatMenu(
  menu: HTMLElement,
  trigger: HTMLButtonElement,
  list: HTMLElement,
): void {
  closeAllFormatMenus(menu);
  list.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  const options = getFormatOptionElements(list);
  const selected =
    options.find((el) => el.classList.contains('converter__dropzone-file-output-option--selected')) ??
    options[0];
  if (selected) focusFormatOption(list, selected);
}

function handleFormatOptionKeydown(
  e: KeyboardEvent,
  optionEl: HTMLElement,
  list: HTMLElement,
  trigger: HTMLButtonElement,
  selectValue: (value: string) => void,
): void {
  const options = getFormatOptionElements(list);
  const index = options.indexOf(optionEl);
  if (index < 0) return;

  switch (e.key) {
    case 'ArrowDown': {
      e.preventDefault();
      focusFormatOption(list, options[(index + 1) % options.length]);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      focusFormatOption(list, options[(index - 1 + options.length) % options.length]);
      break;
    }
    case 'Home': {
      e.preventDefault();
      focusFormatOption(list, options[0]);
      break;
    }
    case 'End': {
      e.preventDefault();
      focusFormatOption(list, options[options.length - 1]);
      break;
    }
    case 'Enter':
    case ' ': {
      e.preventDefault();
      if (optionEl.dataset.value) selectValue(optionEl.dataset.value);
      closeFormatMenu(trigger, list, true);
      break;
    }
    case 'Escape': {
      e.preventDefault();
      closeFormatMenu(trigger, list, true);
      break;
    }
    case 'Tab': {
      closeFormatMenu(trigger, list, false);
      break;
    }
    default:
      break;
  }
}

function handleFormatTriggerKeydown(
  e: KeyboardEvent,
  menu: HTMLElement,
  trigger: HTMLButtonElement,
  list: HTMLElement,
): void {
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      e.preventDefault();
      if (list.hidden) {
        openFormatMenu(menu, trigger, list);
        return;
      }
      const options = getFormatOptionElements(list);
      if (options.length === 0) return;
      const target = e.key === 'ArrowDown' ? options[0] : options[options.length - 1];
      focusFormatOption(list, target);
      break;
    }
    case 'Enter':
    case ' ': {
      e.preventDefault();
      if (list.hidden) openFormatMenu(menu, trigger, list);
      else closeFormatMenu(trigger, list, true);
      break;
    }
    case 'Escape': {
      if (!list.hidden) {
        e.preventDefault();
        closeFormatMenu(trigger, list, true);
      }
      break;
    }
    default:
      break;
  }
}

export function closeAllFormatMenus(except?: HTMLElement): void {
  for (const list of document.querySelectorAll<HTMLElement>(
    '.converter__dropzone-file-output-list:not([hidden])',
  )) {
    const menu = list.closest<HTMLElement>('.converter-format-picker-menu');
    if (except && menu === except) continue;
    const trigger = menu?.querySelector<HTMLButtonElement>(TRIGGER_SELECTOR);
    if (trigger) closeFormatMenu(trigger, list, false);
    else list.hidden = true;
  }
}

let globalListenersBound = false;

export function bindFormatPickerGlobalListeners(): void {
  if (globalListenersBound) return;
  globalListenersBound = true;

  document.addEventListener('click', () => {
    closeAllFormatMenus();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const list = document.querySelector<HTMLElement>(
      '.converter__dropzone-file-output-list:not([hidden])',
    );
    if (!list) return;
    const menu = list.closest(MENU_SELECTOR);
    const trigger = menu?.querySelector<HTMLButtonElement>(TRIGGER_SELECTOR);
    if (!trigger) return;
    e.preventDefault();
    closeFormatMenu(trigger, list, true);
  });
}

function createFormatMenu(
  config: FormatPickerConfig,
  currentId: string,
  currentLabel: string,
  applySelection: (nextId: string) => void,
): HTMLElement {
  const isSettings = config.variant === 'settings';

  const menu = document.createElement('div');
  menu.className = isSettings
    ? 'converter-format-picker-menu converter-settings__format-menu'
    : 'converter-format-picker-menu converter__dropzone-file-format-menu';
  if (config.menuDataset) {
    for (const [key, value] of Object.entries(config.menuDataset)) {
      menu.dataset[key] = value;
    }
  }

  if (config.locked) {
    const value = document.createElement('span');
    value.className =
      'converter__dropzone-file-output-value converter__dropzone-file-output-value--locked';
    value.textContent = currentLabel;
    menu.append(value);
    return menu;
  }

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = isSettings
    ? 'btn btn--secondary converter-settings__select converter-format-picker-trigger'
    : 'btn btn--secondary converter__dropzone-file-output-trigger converter-format-picker-trigger';
  trigger.id = config.id;
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', config.ariaLabel);

  const triggerValue = document.createElement('span');
  triggerValue.className = isSettings
    ? 'converter-settings__select-value'
    : 'converter__dropzone-file-output-value';
  triggerValue.textContent = currentLabel;

  if (isSettings) {
    trigger.append(triggerValue);
  } else {
    const triggerIcon = document.createElement('i');
    triggerIcon.className = 'converter__dropzone-file-output-chevron fa-solid fa-chevron-down';
    triggerIcon.setAttribute('aria-hidden', 'true');
    trigger.append(triggerValue, triggerIcon);
  }

  const list = document.createElement('ul');
  const listId = `${config.id}-list`;
  list.id = listId;
  list.className = 'converter__dropzone-file-output-list site-scrollbar';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', config.listAriaLabel);
  list.hidden = true;
  trigger.setAttribute('aria-controls', listId);

  const selectValue = (nextId: string): void => {
    const nextLabel = config.options.find((o) => o.id === nextId)?.label ?? nextId;
    triggerValue.textContent = nextLabel;
    for (const optionEl of getFormatOptionElements(list)) {
      const selected = optionEl.dataset.value === nextId;
      optionEl.classList.toggle('converter__dropzone-file-output-option--selected', selected);
      optionEl.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    applySelection(nextId);
  };

  for (const opt of config.options) {
    const optionEl = document.createElement('li');
    optionEl.className = 'converter__dropzone-file-output-option';
    optionEl.dataset.value = opt.id;
    optionEl.setAttribute('role', 'option');
    optionEl.setAttribute('aria-selected', opt.id === currentId ? 'true' : 'false');
    optionEl.tabIndex = -1;
    optionEl.textContent = opt.label;
    if (opt.id === currentId) {
      optionEl.classList.add('converter__dropzone-file-output-option--selected');
    }
    optionEl.addEventListener('click', (e) => {
      e.stopPropagation();
      selectValue(opt.id);
      closeFormatMenu(trigger, list, true);
    });
    optionEl.addEventListener('keydown', (e) => {
      e.stopPropagation();
      handleFormatOptionKeydown(e, optionEl, list, trigger, selectValue);
    });
    list.append(optionEl);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (list.hidden) openFormatMenu(menu, trigger, list);
    else closeFormatMenu(trigger, list, true);
  });
  trigger.addEventListener('keydown', (e) => {
    e.stopPropagation();
    handleFormatTriggerKeydown(e, menu, trigger, list);
  });
  list.addEventListener('keydown', (e) => e.stopPropagation());
  menu.addEventListener('click', (e) => e.stopPropagation());

  menu.append(trigger, list);
  return menu;
}

export function createFormatPickerField(config: FormatPickerConfig): HTMLElement {
  const currentId = config.options.some((o) => o.id === config.value)
    ? config.value
    : (config.options[0]?.id ?? config.value);
  const currentLabel =
    config.options.find((o) => o.id === currentId)?.label ?? currentId;

  const menu = createFormatMenu(config, currentId, currentLabel, (nextId) => {
    config.onChange(nextId);
  });

  if (config.variant === 'settings') {
    return menu;
  }

  const formatField = document.createElement('div');
  formatField.className = 'converter__dropzone-file-field converter__dropzone-file-field--format';

  const outputLabel = document.createElement('label');
  outputLabel.className = 'converter__dropzone-file-field-label';
  outputLabel.textContent = config.labelText ?? 'Sortie';
  outputLabel.setAttribute('for', config.id);

  formatField.append(outputLabel, menu);
  return formatField;
}
