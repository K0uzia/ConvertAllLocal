import { initSupportsTabs } from './supports-tabs.ts';

const STEP_DEG = 90;

function shortestSteps(delta: number, count: number): number {
  let steps = delta;
  const half = count / 2;
  if (steps > half) steps -= count;
  if (steps < -half) steps += count;
  return steps;
}

export function initSupportsWheel(): void {
  const root = document.querySelector<HTMLElement>('[data-supports-wheel]');
  if (!root) return;

  const ring = root.querySelector<HTMLElement>('[data-wheel-ring]');
  const panels = root.querySelectorAll<HTMLElement>('[data-wheel-panel]');
  const pills = root.querySelectorAll<HTMLButtonElement>('[data-wheel-pill]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let activeIndex = 0;
  let currentRotation = 0;
  let autoTimer: number | null = null;
  let autoPaused = false;
  let rotateCleanupTimer: number | null = null;

  const applyRingRotation = (): void => {
    if (!ring) return;
    ring.style.setProperty('--wheel-rotation', `${currentRotation}deg`);
    ring.style.transform = `rotate(${currentRotation}deg)`;
  };

  const clearRotateCleanup = (): void => {
    if (rotateCleanupTimer !== null) {
      window.clearTimeout(rotateCleanupTimer);
      rotateCleanupTimer = null;
    }
  };

  const markRotating = (): void => {
    if (!ring || reducedMotion) return;
    root.classList.add('is-rotating');
    clearRotateCleanup();

    const durationRaw = window.getComputedStyle(ring).transitionDuration || '';
    const duration = durationRaw.endsWith('ms')
      ? Number.parseFloat(durationRaw)
      : Number.parseFloat(durationRaw) * 1000;
    const fallbackMs = Number.isFinite(duration) ? Math.max(0, duration) + 80 : 800;

    rotateCleanupTimer = window.setTimeout(() => {
      root.classList.remove('is-rotating');
      rotateCleanupTimer = null;
    }, fallbackMs);

    const onEnd = (event: TransitionEvent): void => {
      if (event.propertyName !== 'transform') return;
      ring.removeEventListener('transitionend', onEnd);
      clearRotateCleanup();
      root.classList.remove('is-rotating');
    };
    ring.addEventListener('transitionend', onEnd);
  };

  const activate = (index: number): void => {
    if (index < 0 || index >= panels.length) return;

    if (index !== activeIndex) {
      const steps = shortestSteps(index - activeIndex, panels.length);
      currentRotation -= steps * STEP_DEG;
      markRotating();
      applyRingRotation();
    }

    activeIndex = index;

    panels.forEach((panel, i) => {
      const on = i === index;
      panel.hidden = !on;
      panel.classList.toggle('is-active', on);
    });

    pills.forEach((pill) => {
      const pillIndex = Number(pill.dataset.wheelIndex);
      const on = pillIndex === index;
      if (pill.getAttribute('role') === 'tab') {
        pill.setAttribute('aria-selected', on ? 'true' : 'false');
      } else {
        pill.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      pill.classList.toggle('is-active', on);
      pill.tabIndex = on ? 0 : -1;
    });

    initSupportsTabs();
  };

  const stopAuto = (): void => {
    if (autoTimer !== null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  };

  const startAuto = (): void => {
    if (reducedMotion) return;
    if (autoTimer !== null) return;
    autoTimer = window.setInterval(() => {
      if (autoPaused) return;
      activate((activeIndex + 1) % panels.length);
    }, 5000);
  };

  const bindPills = (): void => {
    pills.forEach((pill) => {
      if (pill.dataset.wheelBound === 'true') return;
      pill.dataset.wheelBound = 'true';

      pill.addEventListener('click', () => {
        const index = Number(pill.dataset.wheelIndex);
        if (!Number.isNaN(index)) activate(index);
      });

      pill.addEventListener('keydown', (event) => {
        const count = panels.length;
        let next = activeIndex;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          next = (activeIndex + 1) % count;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          next = (activeIndex - 1 + count) % count;
        } else if (event.key === 'Home') {
          event.preventDefault();
          next = 0;
        } else if (event.key === 'End') {
          event.preventDefault();
          next = count - 1;
        } else {
          return;
        }

        activate(next);
        root
          .querySelector<HTMLButtonElement>(
            `.supports__wheel-pill[data-wheel-index="${next}"]`,
          )
          ?.focus();
      });
    });
  };

  if (ring && !reducedMotion) {
    ring.style.transition = `transform var(--supports-wheel-duration) var(--supports-wheel-ease)`;
  }

  bindPills();
  applyRingRotation();
  activate(0);

  // Nettoyage si la section est ré-initialisée.
  stopAuto();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (root as any).__supportsWheelStopAuto?.();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (root as any).__supportsWheelStopAuto = stopAuto;

  if (!reducedMotion) {
    if (root.dataset.wheelAutoBound !== 'true') {
      root.dataset.wheelAutoBound = 'true';

      root.addEventListener('pointerenter', () => {
        autoPaused = true;
      });
      root.addEventListener('pointerleave', () => {
        autoPaused = false;
      });
      root.addEventListener('focusin', () => {
        autoPaused = true;
      });
      root.addEventListener('focusout', () => {
        autoPaused = false;
      });
      document.addEventListener('visibilitychange', () => {
        autoPaused = document.hidden;
      });
    }

    startAuto();
  }
}
