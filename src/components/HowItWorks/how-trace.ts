/** Signal triangulaire calé sur la grille, révélation automatique en 3s. */
type GridConfig = {
  amplitudeSteps: number;
  legSteps: number;
  step: number;
};

type HowTraceState = {
  animRaf: number;
  animated: boolean;
  config: GridConfig;
  geometryLocked: boolean;
  io: IntersectionObserver | null;
  layoutGen: number;
  mayAnimate: boolean;
  observer: ResizeObserver;
  onResize: () => void;
  path: SVGPathElement;
  pathLength: number;
  section: HTMLElement;
  svg: SVGSVGElement;
  viewport: HTMLElement;
  wrap: HTMLElement;
  wrapWidth: number;
};

let activeTrace: HowTraceState | null = null;

function teardown(): void {
  if (!activeTrace) return;
  if (activeTrace.animRaf) {
    window.cancelAnimationFrame(activeTrace.animRaf);
  }
  activeTrace.io?.disconnect();
  activeTrace.observer.disconnect();
  window.removeEventListener('resize', activeTrace.onResize);
  activeTrace = null;
}

function readGridConfig(): GridConfig {
  const root = getComputedStyle(document.documentElement);
  const step = parseFloat(root.getPropertyValue('--how-trace-grid-step')) || 56;
  const amplitudeSteps = parseFloat(root.getPropertyValue('--how-trace-amplitude-steps')) || 4;
  return { step, amplitudeSteps, legSteps: amplitudeSteps * 2 };
}

function readDurationMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--how-trace-duration').trim();
  if (raw.endsWith('ms')) return parseFloat(raw) || 3000;
  if (raw.endsWith('s')) return (parseFloat(raw) || 3) * 1000;
  return 3000;
}

function modStep(value: number, step: number): number {
  return ((value % step) + step) % step;
}

function snapLocal(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function iconCenterLocalY(icon: HTMLElement, wrapRect: DOMRect): number {
  const rect = icon.getBoundingClientRect();
  return rect.top + rect.height / 2 - wrapRect.top;
}

/** Centre stable sur les icônes, avec léger ajustement grille (±1 pas max). */
function resolveCenterY(
  wrapRect: DOMRect,
  svgRect: DOMRect,
  rawCenter: number,
  step: number,
): number {
  const anchor = snapLocal(rawCenter, step);
  let best = anchor;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let k = -1; k <= 1; k += 1) {
    const local = anchor + k * step;
    const pageY = svgRect.top + local;
    const gridResidual = modStep(pageY - svgRect.left, step);
    const gridDist = Math.min(gridResidual, step - gridResidual);
    const contentDist = Math.abs(local - rawCenter);
    const score = gridDist + contentDist * 0.15;
    if (score < bestScore) {
      bestScore = score;
      best = local;
    }
  }

  return best;
}

function buildGridSignalPath(width: number, centerLocalY: number, config: GridConfig): string {
  const { step, amplitudeSteps, legSteps } = config;
  const yMin = centerLocalY - amplitudeSteps * step;

  let x = 0;
  let y = yMin;
  let rising = true;
  let stepInLeg = 0;
  let d = `M 0 ${y}`;

  while (x + step <= width + 0.5) {
    x += step;
    y += rising ? step : -step;
    d += ` L ${x} ${y}`;
    stepInLeg += 1;

    if (stepInLeg >= legSteps) {
      rising = !rising;
      stepInLeg = 0;
    }
  }

  if (x < width - 0.5) {
    const dx = width - x;
    y += rising ? dx : -dx;
    d += ` L ${width} ${y}`;
  }

  return d;
}

function setReveal(state: HowTraceState, progress: number): void {
  const { path, pathLength } = state;
  if (!Number.isFinite(pathLength) || pathLength <= 0) return;
  const clamped = Math.min(1, Math.max(0, progress));
  path.style.strokeDasharray = `${pathLength}`;
  path.style.strokeDashoffset = `${pathLength * (1 - clamped)}`;
}

function runRevealAnimation(state: HowTraceState): void {
  if (state.animated || !state.mayAnimate || state.pathLength <= 0) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    setReveal(state, 1);
    state.animated = true;
    return;
  }

  state.animated = true;
  const duration = readDurationMs();
  const start = performance.now();
  setReveal(state, 0);

  const tick = (now: number): void => {
    if (!activeTrace || activeTrace !== state) return;
    const progress = Math.min(1, (now - start) / duration);
    setReveal(state, progress);
    if (progress < 1) {
      state.animRaf = window.requestAnimationFrame(tick);
    } else {
      state.animRaf = 0;
    }
  };

  state.animRaf = window.requestAnimationFrame(tick);
}

function applyRevealState(state: HowTraceState): void {
  if (state.pathLength <= 0) return;
  if (state.animated) {
    setReveal(state, 1);
    return;
  }
  setReveal(state, 0);
  runRevealAnimation(state);
}

function measurePath(state: HowTraceState, generation: number): void {
  if (!activeTrace || activeTrace.layoutGen !== generation) return;

  const length = state.path.getTotalLength();
  state.pathLength = Number.isFinite(length) && length > 0 ? length : 0;

  if (state.pathLength <= 0) {
    requestAnimationFrame(() => measurePath(state, generation));
    return;
  }

  if (!state.mayAnimate) return;

  state.geometryLocked = true;
  applyRevealState(state);
}

function updateGeometry(state: HowTraceState, force = false): void {
  if (state.geometryLocked && !force) return;

  const { viewport, svg, path, wrap, config } = state;

  if (!window.matchMedia('(min-width: 768px)').matches) {
    path.removeAttribute('d');
    state.pathLength = 0;
    path.style.strokeDasharray = '';
    path.style.strokeDashoffset = '';
    return;
  }

  const wrapRect = wrap.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0 || svgRect.width <= 0) return;

  const pathWidth = window.innerWidth;
  viewport.style.width = `${pathWidth}px`;
  viewport.style.height = `${wrapRect.height}px`;
  state.wrapWidth = wrapRect.width;

  const icons = [...wrap.querySelectorAll<HTMLElement>('.how__step-icon')];
  if (icons.length < 2) return;

  const rawCenter =
    icons.reduce((sum, icon) => sum + iconCenterLocalY(icon, wrapRect), 0) / icons.length;
  const centerLocalY = resolveCenterY(wrapRect, svgRect, rawCenter, config.step);
  const d = buildGridSignalPath(pathWidth, centerLocalY, config);

  svg.setAttribute('width', `${pathWidth}`);
  svg.setAttribute('height', `${wrapRect.height}`);
  svg.setAttribute('viewBox', `0 0 ${pathWidth} ${wrapRect.height}`);
  path.setAttribute('d', d);

  state.layoutGen += 1;
  const generation = state.layoutGen;
  requestAnimationFrame(() => measurePath(state, generation));
}

function scheduleLayout(state: HowTraceState, force = false): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      updateGeometry(state, force);
    });
  });
}

function onSectionVisible(state: HowTraceState): void {
  if (state.mayAnimate) return;
  state.mayAnimate = true;

  void document.fonts.ready.then(() => {
    if (state.pathLength > 0 && !state.animated) {
      state.geometryLocked = true;
      applyRevealState(state);
      return;
    }
    scheduleLayout(state);
  });
}

export function initHowTrace(): void {
  teardown();

  const section = document.querySelector<HTMLElement>('.how');
  const wrap = document.querySelector<HTMLElement>('.how__row-wrap');
  const viewport = document.querySelector<HTMLElement>('.how__trace-viewport');
  const svg = document.querySelector<SVGSVGElement>('.how__trace');
  const path = document.querySelector<SVGPathElement>('.how__trace-path');
  if (!section || !wrap || !viewport || !svg || !path) return;

  const state: HowTraceState = {
    animRaf: 0,
    animated: false,
    config: readGridConfig(),
    geometryLocked: false,
    io: null,
    layoutGen: 0,
    mayAnimate: false,
    observer: new ResizeObserver(() => {}),
    onResize: () => {},
    path,
    pathLength: 0,
    section,
    svg,
    viewport,
    wrap,
    wrapWidth: 0,
  };

  const onResize = (): void => {
    if (!activeTrace) return;
    state.config = readGridConfig();
    const width = wrap.getBoundingClientRect().width;
    if (Math.abs(width - state.wrapWidth) < 1 && state.geometryLocked) return;
    state.geometryLocked = false;
    scheduleLayout(state, true);
  };

  state.onResize = onResize;
  state.observer = new ResizeObserver(() => {
    if (state.geometryLocked) return;
    scheduleLayout(state);
  });
  state.observer.observe(wrap);

  const io = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting) return;
      onSectionVisible(state);
      io.disconnect();
      state.io = null;
    },
    { threshold: 0.1 },
  );
  state.io = io;
  io.observe(section);

  activeTrace = state;

  requestAnimationFrame(() => {
    const rect = section.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) {
      onSectionVisible(state);
      io.disconnect();
      state.io = null;
    }
  });

  window.addEventListener('resize', onResize, { passive: true });
}
