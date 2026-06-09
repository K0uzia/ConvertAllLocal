/** Header hero : fixé en haut à l'arrivée en haut du viewport, suit le hero au scroll retour. */
type HeaderPinState = {
  onScroll: () => void;
  onResize: () => void;
  placeholder: HTMLDivElement;
  header: HTMLElement;
};

const PIN_TOLERANCE = 4;

let activePin: HeaderPinState | null = null;

function clearPinStyles(header: HTMLElement): void {
  header.style.removeProperty('--header-pin-y');
  header.style.removeProperty('--header-pin-x');
  header.style.removeProperty('--header-pin-w');
}

function teardown(): void {
  if (!activePin) return;
  document.removeEventListener('scroll', activePin.onScroll, true);
  window.removeEventListener('resize', activePin.onResize);
  activePin.placeholder.remove();
  activePin.header.classList.remove('header--pinned', 'header--pinned-dock', 'header--pinned-release');
  clearPinStyles(activePin.header);
  activePin = null;
}

function readSafeAreaTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
  document.documentElement.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return inset;
}

function readTopInset(): number {
  const root = getComputedStyle(document.documentElement);
  const pad =
    parseFloat(root.getPropertyValue('--site-pad-x'))
    || parseFloat(root.getPropertyValue('--header-float-pad'))
    || 0;
  return Math.max(pad, readSafeAreaTop());
}

function getShellContentBox(shell: HTMLElement): { x: number; w: number } {
  const styles = getComputedStyle(shell);
  const padL = parseFloat(styles.paddingLeft);
  const padR = parseFloat(styles.paddingRight);
  const shellWidth = shell.offsetWidth;
  const viewport = document.documentElement.clientWidth;
  const shellLeft = Math.max(0, (viewport - shellWidth) / 2);
  return {
    x: shellLeft + padL,
    w: shellWidth - padL - padR,
  };
}

function applyDockGeometry(header: HTMLElement, shell: HTMLElement): void {
  const dock = getShellContentBox(shell);
  header.style.setProperty('--header-pin-x', `${dock.x}px`);
  header.style.setProperty('--header-pin-w', `${dock.w}px`);
}

function dockToTop(header: HTMLElement): void {
  header.style.removeProperty('--header-pin-y');
  header.classList.remove('header--pinned-release');
  header.classList.add('header--pinned-dock');
}

export function initHeaderPin(): void {
  teardown();

  const header = document.querySelector<HTMLElement>('.header--hero');
  const shell = document.querySelector<HTMLElement>('.hero__shell');
  if (!header || !shell) return;

  const anchor = header.parentElement;
  if (!anchor) return;

  const placeholder = document.createElement('div');
  placeholder.className = 'header__pin-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pinned = false;
  let releasing = false;
  let dockFrame = 0;

  const finishRelease = (): void => {
    releasing = false;
    pinned = false;
    placeholder.remove();
    header.classList.remove('header--pinned', 'header--pinned-dock', 'header--pinned-release');
    clearPinStyles(header);
    document.documentElement.classList.remove('is-header-pinned');
  };

  const shouldPin = (): boolean => {
    return header.getBoundingClientRect().top <= readTopInset() + PIN_TOLERANCE;
  };

  const shouldStartRelease = (): boolean => {
    return placeholder.getBoundingClientRect().top > readTopInset() + PIN_TOLERANCE;
  };

  const pin = (): void => {
    if (pinned || releasing) return;

    const rect = header.getBoundingClientRect();
    placeholder.style.height = `${rect.height}px`;

    header.classList.remove('header--pinned-dock', 'header--pinned-release');
    header.classList.add('header--pinned');
    header.style.setProperty('--header-pin-x', `${rect.left}px`);
    header.style.setProperty('--header-pin-w', `${rect.width}px`);
    header.style.setProperty('--header-pin-y', `${rect.top}px`);

    pinned = true;
    anchor.insertBefore(placeholder, header);
    document.documentElement.classList.add('is-header-pinned');

    window.cancelAnimationFrame(dockFrame);
    if (reduceMotion) {
      dockToTop(header);
      return;
    }

    dockFrame = window.requestAnimationFrame(() => {
      dockToTop(header);
    });
  };

  const startRelease = (): void => {
    if (!pinned || releasing) return;

    releasing = true;
    header.classList.remove('header--pinned-dock');
    header.classList.add('header--pinned-release');
    header.style.setProperty('--header-pin-y', `${header.getBoundingClientRect().top}px`);
  };

  const followRelease = (): void => {
    const targetTop = placeholder.getBoundingClientRect().top;
    header.style.setProperty('--header-pin-y', `${targetTop}px`);

    if (Math.abs(header.getBoundingClientRect().top - targetTop) < 2) {
      finishRelease();
    }
  };

  const cancelReleaseToDock = (): void => {
    releasing = false;
    header.classList.remove('header--pinned-release');
    dockToTop(header);
  };

  const update = (): void => {
    const dockTop = readTopInset();

    if (releasing) {
      const slotTop = placeholder.getBoundingClientRect().top;
      if (slotTop <= dockTop + PIN_TOLERANCE) {
        cancelReleaseToDock();
        return;
      }
      followRelease();
      return;
    }

    if (!pinned && shouldPin()) {
      pin();
      return;
    }

    if (pinned && shouldStartRelease()) {
      startRelease();
      followRelease();
    }
  };

  const onScroll = (): void => {
    window.requestAnimationFrame(update);
  };

  const onResize = (): void => {
    if (pinned && !releasing) {
      applyDockGeometry(header, shell);
    }
    update();
  };

  activePin = { onScroll, onResize, placeholder, header };
  update();
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('resize', onResize, { passive: true });
}
