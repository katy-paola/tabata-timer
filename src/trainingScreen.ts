import {
  playCountdownTick,
  playPhaseSound,
  playStarsSound,
  releaseWakeLock,
  requestWakeLock,
  resumeAudio,
  unlockAudio,
  vibrate,
} from './alerts';
import { TimerEngine, type EngineState } from './engine';
import { formatClock } from './format';
import { addSession } from './history';
import { buildPlan } from './plan';
import { show } from './screens';
import { clearInterrupted, loadInterrupted, saveInterrupted } from './session';
import type { SessionSummary, WorkoutConfig } from './types';

const PHASE_NAMES: Record<string, string> = {
  prep: 'PREPARACIÓN',
  work: 'TRABAJO',
  rest: 'DESCANSO',
  seriesRest: 'DESCANSO',
};

const PHASE_CLASSES: Record<string, string> = {
  prep: 'phase-prep',
  work: 'phase-work',
  rest: 'phase-rest',
  seriesRest: 'phase-rest',
};

/** Cada 20 renders (250 ms) = 5 s: se guarda la sesión por si se cierra la app. */
const SAVE_EVERY_TICKS = 20;

let engine: TimerEngine | null = null;
let currentConfig: WorkoutConfig | null = null;
let intervalId: number | null = null;
let lastPhaseIndex = -1;
let lastCountdownSec = -1;
let tickCount = 0;
let animateIn = false;
let abandonArmed = false;
let abandonTimer: number | null = null;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function stopLoop(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

export function isTrainingActive(): boolean {
  if (!engine) return false;
  const status = engine.getState().status;
  return status === 'running' || status === 'paused';
}

/** Guarda el estado de la sesión para poder recuperarla tras cerrar la app. */
function persistSession(): void {
  if (!engine || !currentConfig || !isTrainingActive()) return;
  saveInterrupted({
    config: currentConfig,
    elapsedMs: engine.getState().elapsedMs,
    savedAt: Date.now(),
  });
}

export function startWorkout(config: WorkoutConfig, fromElapsedMs = 0): void {
  stopLoop();
  engine = new TimerEngine();
  currentConfig = config;
  engine.start(config, fromElapsedMs);
  const initial = engine.getState();
  lastPhaseIndex = initial.phaseIndex;
  lastCountdownSec = -1;
  tickCount = 0;
  animateIn = true;

  // Reinicia el estado de confirmación del botón "Abandonar".
  if (abandonTimer !== null) {
    window.clearTimeout(abandonTimer);
    abandonTimer = null;
  }
  abandonArmed = false;
  const abandonBtn = document.getElementById('abandon-btn') as HTMLButtonElement | null;
  if (abandonBtn) {
    abandonBtn.classList.remove('armed');
    abandonBtn.textContent = 'Abandonar';
  }

  unlockAudio(); // gesto del usuario: requisito de iOS para el audio
  if (initial.phase) playPhaseSound(initial.phase.type as 'prep' | 'work' | 'rest' | 'seriesRest');
  vibrate();
  requestWakeLock();
  persistSession();

  show('training');
  const screen = document.getElementById('training-screen');
  if (screen) {
    screen.classList.remove('training-enter');
    void screen.offsetWidth;
    screen.classList.add('training-enter');
    window.setTimeout(() => screen.classList.remove('training-enter'), 900);
  }
  render();
  // El intervalo solo refresca la pantalla: el tiempo se calcula con la hora real.
  intervalId = window.setInterval(render, 250);
}

function render(): void {
  if (!engine) return;
  const state: EngineState = engine.getState();

  if (state.status === 'completed') {
    showSummary(engine.complete());
    return;
  }
  if (state.status !== 'running' && state.status !== 'paused') return;

  let phaseChanged = false;
  if (state.phaseIndex !== lastPhaseIndex) {
    lastPhaseIndex = state.phaseIndex;
    lastCountdownSec = -1;
    phaseChanged = true;
    if (state.phase) playPhaseSound(state.phase.type as 'prep' | 'work' | 'rest' | 'seriesRest');
    vibrate();
  }

  const phase = state.phase;
  const labelEl = el<HTMLDivElement>('phase-label');
  labelEl.className = 'phase-label';
  const screen = el<HTMLElement>('training-screen');
  screen.classList.remove('phase-prep-bg', 'phase-work-bg', 'phase-rest-bg');
  const phaseKey = phase ? (phase.type === 'seriesRest' ? 'rest' : phase.type) : 'work';
  if (phase) {
    labelEl.textContent = PHASE_NAMES[phase.type];
    labelEl.classList.add(PHASE_CLASSES[phase.type]);
    screen.classList.add(`phase-${phaseKey}-bg`);
  }
  if (phaseChanged) {
    labelEl.classList.remove('phase-pop');
    // reflow to restart animation
    void labelEl.offsetWidth;
    labelEl.classList.add('phase-pop');
  }

  const secondsLeft = Math.ceil(state.phaseRemainingMs / 1000);
  const timeEl = el('time-big');
  timeEl.textContent = formatClock(secondsLeft);
  const finalSeconds = state.status === 'running' && state.phaseRemainingMs <= 3000 && state.phaseRemainingMs > 0;
  screen.classList.toggle('final-seconds', finalSeconds);
  screen.classList.toggle('is-paused', state.status === 'paused');

  if (
    !phaseChanged &&
    state.status === 'running' &&
    secondsLeft >= 1 &&
    secondsLeft <= 3 &&
    secondsLeft !== lastCountdownSec
  ) {
    lastCountdownSec = secondsLeft;
    playCountdownTick();
  }

  el('phase-detail').textContent = phase ? detailText(phase, state) : '';
  const counter = el('work-counter');
  if (state.totalWorks > 0) {
    counter.textContent =
      state.workIndex > 0
        ? `Ejercicio ${state.workIndex} de ${state.totalWorks}`
        : `${state.totalWorks} ejercicios en total`;
  } else {
    counter.textContent = '';
  }
  el('time-overall').textContent = `${formatClock(Math.floor(state.elapsedMs / 1000))} / ${formatClock(Math.round(state.totalMs / 1000))}`;

  const percent = state.totalMs > 0 ? state.elapsedMs * 100 / state.totalMs : 0;
  const clamped = Math.min(100, Math.max(0, percent));
  el('progress-bar').style.width = `${clamped}%`;
  el('progress-text').textContent = `${Math.floor(clamped)}%`;

  const nextEl = el('next-phase');
  nextEl.textContent = state.nextPhaseLabel ? `Siguiente: ${state.nextPhaseLabel}` : state.status === 'running' || state.status === 'paused' ? 'Última fase' : '';

  const ring = document.getElementById('ring-progress') as SVGCircleElement | null;
  if (ring) {
    const r = 96;
    const circ = 2 * Math.PI * r;
    ring.style.strokeDasharray = String(circ);
    const targetOffset = circ * (1 - clamped / 100);
    if (animateIn) {
      const prev = ring.style.transition;
      ring.style.transition = 'none';
      ring.style.strokeDashoffset = String(circ);
      void ring.getBoundingClientRect();
      ring.style.transition = prev || 'stroke-dashoffset 0.7s ease, stroke 0.3s ease';
      ring.style.strokeDashoffset = String(targetOffset);
      animateIn = false;
    } else {
      ring.style.strokeDashoffset = String(targetOffset);
    }
    const color = phaseKey === 'prep' ? '#4cc9ff' : phaseKey === 'rest' ? '#ffcc4d' : '#3be477';
    ring.style.stroke = color;
  }

  el<HTMLButtonElement>('pause-btn').textContent =
    state.status === 'paused' ? 'Reanudar' : 'Pausar';

  tickCount++;
  if (state.status === 'running' && tickCount % SAVE_EVERY_TICKS === 0) {
    persistSession();
  }
}

function detailText(phase: { type: string; series?: number; exercise?: number; label: string }, state: EngineState): string {
  if (phase.type === 'prep') {
    return state.exercises > 0
      ? `Serie 1/${state.series} · Ejercicio 1/${state.exercises} a continuación`
      : '';
  }
  if (phase.type === 'seriesRest') {
    return phase.label.replace('Descanso entre series ', 'Entre series ');
  }
  return `Serie ${phase.series}/${state.series} · Ejercicio ${phase.exercise}/${state.exercises}`;
}

function showSummary(summary: SessionSummary): void {
  stopLoop();
  clearInterrupted();
  releaseWakeLock();
  engine = null;
  currentConfig = null;

  addSession({
    id: String(Date.now()),
    finishedAt: Date.now(),
    status: summary.status,
    activeMs: summary.activeMs,
    workMs: summary.workMs,
    completedExercises: summary.completedExercises,
    completedSeries: summary.completedSeries,
  });

  const completed = summary.status === 'completed';
  const starsEl = document.getElementById('stars');
  const subtitle = document.getElementById('summary-subtitle');
  const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';
  if (starsEl) {
    starsEl.innerHTML = '';
    const count = completed ? 3 : summary.completedExercises >= 4 ? 2 : 1;
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      span.className = 'star' + (i < count ? ' filled pop' : ' empty');
      span.style.animationDelay = `${i * 120}ms`;
      span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
      starsEl.append(span);
    }
    // Nota suave por estrella, sincronizada con su aparición.
    playStarsSound(count);
  }
  if (subtitle) subtitle.textContent = completed ? 'Sesión completada. Buen trabajo.' : 'Sesión guardada en tu historial.';
  el('summary-title').textContent = completed ? '¡Completado!' : 'Finalizado antes de tiempo';
  const summaryScreen = el<HTMLElement>('summary-screen');
  summaryScreen.classList.remove('enter');
  void summaryScreen.offsetWidth;
  summaryScreen.classList.add('enter');

  const box = el('session-summary');
  box.innerHTML = '';
  const lines = [
    `Duración: <strong>${formatClock(Math.round(summary.activeMs / 1000))}</strong>`,
    `Tiempo de trabajo: <strong>${formatClock(Math.round(summary.workMs / 1000))}</strong>`,
    `Ejercicios completados: <strong>${summary.completedExercises}</strong>`,
    `Series completadas: <strong>${summary.completedSeries}</strong>`,
  ];
  for (const line of lines) {
    const p = document.createElement('p');
    p.innerHTML = line;
    box.append(p);
  }

  const screen = document.getElementById('training-screen');
  if (screen) screen.classList.remove('phase-prep-bg', 'phase-work-bg', 'phase-rest-bg', 'final-seconds', 'is-paused');
  show('summary');
}

/** Abandona el entrenamiento sin guardarlo en el historial. */
function abandonWorkout(): void {
  stopLoop();
  clearInterrupted();
  releaseWakeLock();
  engine = null;
  currentConfig = null;
  const screen = document.getElementById('training-screen');
  if (screen) screen.classList.remove('phase-prep-bg', 'phase-work-bg', 'phase-rest-bg', 'final-seconds', 'is-paused');
  show('entrenar');
}

/** Si quedó una sesión sin terminar, ofrece reanudarla o finalizarla. */
export function checkInterruptedSession(): void {
  const saved = loadInterrupted();
  if (!saved) return;
  const totalMs = buildPlan(saved.config).totalMs;
  el('recovery-info').textContent =
    `Quedaste en ${formatClock(Math.floor(saved.elapsedMs / 1000))} de ` +
    `${formatClock(Math.floor(totalMs / 1000))}. ¿Continuar o finalizar?`;
  show('recovery');
}

export function initTrainingScreen(): void {
  el<HTMLButtonElement>('pause-btn').addEventListener('click', () => {
    if (!engine) return;
    const status = engine.getState().status;
    if (status === 'running') engine.pause();
    else if (status === 'paused') engine.resume();
    persistSession();
    render();
  });

  const skipBtn = document.getElementById('skip-btn') as HTMLButtonElement | null;
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      if (!engine) return;
      const st = engine.getState().status;
      if (st !== 'running' && st !== 'paused') return;
      engine.skipToNextPhase();
      persistSession();
      render();
    });
  }

  const setupHold = (btn: HTMLButtonElement, onComplete: () => void): void => {
    let holdTimer: number | null = null;
    let holdStart = 0;
    const holdDuration = 1200;
    const fillEl = btn.querySelector<HTMLElement>('.hold-fill');
    const cancelHold = () => {
      if (holdTimer !== null) {
        window.clearInterval(holdTimer);
        holdTimer = null;
      }
      if (fillEl) fillEl.style.width = '0%';
    };
    const startHold = (e: Event) => {
      e.preventDefault();
      if (!engine) return;
      holdStart = performance.now();
      holdTimer = window.setInterval(() => {
        const progress = Math.min(1, (performance.now() - holdStart) / holdDuration);
        if (fillEl) fillEl.style.width = `${progress * 100}%`;
        if (progress >= 1) {
          cancelHold();
          if (engine) onComplete();
        }
      }, 30);
    };
    btn.addEventListener('pointerdown', startHold);
    btn.addEventListener('pointerup', cancelHold);
    btn.addEventListener('pointercancel', cancelHold);
    btn.addEventListener('pointerleave', cancelHold);
  };

  const finishBtn = el<HTMLButtonElement>('finish-btn');
  setupHold(finishBtn, () => {
    if (engine) showSummary(engine.finishEarly());
  });

  // Abandonar: sale sin guardar. Confirmación de dos toques.
  const abandonBtn = document.getElementById('abandon-btn') as HTMLButtonElement | null;
  if (abandonBtn) {
    abandonBtn.addEventListener('click', () => {
      if (!engine) return;
      if (!abandonArmed) {
        abandonArmed = true;
        abandonBtn.classList.add('armed');
        abandonBtn.textContent = '¿Seguro? Toca otra vez para abandonar';
        abandonTimer = window.setTimeout(() => {
          abandonArmed = false;
          abandonTimer = null;
          abandonBtn.classList.remove('armed');
          abandonBtn.textContent = 'Abandonar';
        }, 3500);
        return;
      }
      if (abandonTimer !== null) {
        window.clearTimeout(abandonTimer);
        abandonTimer = null;
      }
      abandonArmed = false;
      abandonBtn.classList.remove('armed');
      abandonBtn.textContent = 'Abandonar';
      abandonWorkout();
    });
  }

  const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement | null;
  if (restartBtn) {
    // Toque simple: reinicia el mismo entrenamiento desde el inicio.
    restartBtn.addEventListener('click', () => {
      if (!engine || !currentConfig) return;
      clearInterrupted();
      startWorkout(currentConfig, 0);
    });
  }

  el<HTMLButtonElement>('back-btn').addEventListener('click', () => {
    show('entrenar');
  });

  el<HTMLButtonElement>('recovery-resume').addEventListener('click', () => {
    const saved = loadInterrupted();
    if (saved) startWorkout(saved.config, saved.elapsedMs);
  });

  el<HTMLButtonElement>('recovery-finish').addEventListener('click', () => {
    const saved = loadInterrupted();
    if (!saved) return;
    engine = new TimerEngine();
    currentConfig = saved.config;
    engine.start(saved.config, saved.elapsedMs);
    showSummary(engine.finishEarly());
  });

  // Al volver a la app: reintentar audio y Wake Lock, y recalcular con la hora real.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resumeAudio();
      if (isTrainingActive()) requestWakeLock();
      render();
    } else {
      persistSession();
    }
  });

  // Al cerrar o recargar la página: guardar el estado de la sesión.
  window.addEventListener('pagehide', persistSession);
}
