import { buildPlan, phaseOffsets } from './plan';
import type { Phase, SessionSummary, WorkoutConfig, WorkoutPlan } from './types';

export type EngineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'finishedEarly';

export interface EngineState {
  status: EngineStatus;
  /** Fase actual, o null si no hay entrenamiento activo. */
  phase: Phase | null;
  /** Índice de la fase actual (-1 si no hay). */
  phaseIndex: number;
  /** Tiempo restante de la fase actual en ms. */
  phaseRemainingMs: number;
  /** Tiempo activo transcurrido (sin pausas) en ms. */
  elapsedMs: number;
  /** Duración total del plan en ms (0 si no hay entrenamiento). */
  totalMs: number;
  /** Ejercicios por serie de la configuración vigente. */
  exercises: number;
  /** Total de series de la configuración vigente. */
  series: number;
  /** Total de ejercicios de trabajo en el plan. */
  totalWorks: number;
  /** Ejercicio de trabajo actual en curso (1..totalWorks), o 0 si no aplica. */
  workIndex: number;
  /** Etiqueta corta de la siguiente fase, o null si es la última. */
  nextPhaseLabel: string | null;
}

/**
 * Motor del temporizador. El tiempo se calcula siempre a partir de una marca
 * de tiempo real inyectada (por defecto performance.now), nunca de contadores.
 */
export class TimerEngine {
  private readonly clock: () => number;
  private plan: WorkoutPlan | null = null;
  private config: WorkoutConfig | null = null;
  private offsets: number[] = [];
  private status: EngineStatus = 'idle';
  /** Acumulado de tiempo activo antes del tramo en curso. */
  private baseElapsed = 0;
  /** Marca de reloj en la que empezó el tramo en curso. */
  private segmentStart = 0;

  constructor(clock: () => number = () => performance.now()) {
    this.clock = clock;
  }

  /**
   * Inicia el entrenamiento. `fromElapsedMs` permite reanudar una sesión
   * guardada (la Etapa 4, recuperación tras cerrar la app).
   */
  start(config: WorkoutConfig, fromElapsedMs = 0): void {
    this.config = config;
    this.plan = buildPlan(config);
    this.offsets = phaseOffsets(this.plan);
    this.status = 'running';
    this.baseElapsed = Math.max(0, Math.min(fromElapsedMs, this.plan.totalMs));
    this.segmentStart = this.clock();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.baseElapsed = this.elapsed();
    this.status = 'paused';
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.segmentStart = this.clock();
    this.status = 'running';
  }

  /** Avanza al inicio de la siguiente fase. Si no hay más fases, completa el entrenamiento. */
  skipToNextPhase(): void {
    if (this.status !== 'running' && this.status !== 'paused') return;
    const plan = this.plan;
    if (!plan || plan.phases.length === 0) return;
    const elapsed = Math.min(this.elapsed(), plan.totalMs);
    const { index } = this.locate(elapsed);
    const next = index + 1;
    if (next >= plan.phases.length) {
      this.baseElapsed = plan.totalMs;
      this.status = 'completed';
      return;
    }
    this.baseElapsed = this.offsets[next];
    if (this.status === 'running') {
      this.segmentStart = this.clock();
    }
  }

  /** Finaliza antes de tiempo y devuelve el resumen de lo realizado. */
  finishEarly(): SessionSummary {
    if (this.status !== 'running' && this.status !== 'paused') {
      throw new Error('No hay entrenamiento en curso');
    }
    const elapsed = this.elapsed();
    this.status = 'finishedEarly';
    return this.summarize('finishedEarly', elapsed);
  }

  /** Resumen del entrenamiento completado. Lanza error si no está completado. */
  complete(): SessionSummary {
    if (this.status !== 'completed') {
      throw new Error('El entrenamiento no está completado');
    }
    const total = this.plan?.totalMs ?? 0;
    return this.summarize('completed', total);
  }

  getState(): EngineState {
    const plan = this.plan;
    if (!plan || this.status === 'idle') {
      return {
        status: this.status,
        phase: null,
        phaseIndex: -1,
        phaseRemainingMs: 0,
        elapsedMs: 0,
        totalMs: 0,
        exercises: 0,
        series: 0,
        totalWorks: 0,
        workIndex: 0,
        nextPhaseLabel: null,
      };
    }

    const raw = this.elapsed();
    this.checkCompletion(raw);
    const elapsed = Math.min(this.elapsed(), plan.totalMs);
    const { index, remaining } = this.locate(elapsed);
    const phase = index >= 0 ? plan.phases[index] : null;
    const totalWorks = plan.phases.filter((p) => p.type === 'work').length;
    let workIndex = 0;
    if (phase) {
      let count = 0;
      for (let i = 0; i <= index && i < plan.phases.length; i++) {
        if (plan.phases[i].type === 'work') count++;
      }
      // Si estamos en descanso tras un trabajo, el contador refleja ese trabajo.
      workIndex = count;
      if (phase.type === 'prep') workIndex = 0;
    }
    const next = index >= 0 && index + 1 < plan.phases.length ? plan.phases[index + 1] : null;
    const nextPhaseLabel = next ? this.shortPhaseLabel(next) : null;

    return {
      status: this.status,
      phase,
      phaseIndex: index,
      phaseRemainingMs: remaining,
      elapsedMs: elapsed,
      totalMs: plan.totalMs,
      exercises: this.config?.exercises ?? 0,
      series: this.config?.series ?? 0,
      totalWorks,
      workIndex,
      nextPhaseLabel,
    };
  }

  private shortPhaseLabel(phase: Phase): string {
    const sec = Math.round(phase.durationMs / 1000);
    const t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    switch (phase.type) {
      case 'prep':
        return `Preparación ${t}`;
      case 'work':
        return `Trabajo ${phase.exercise}/${this.config?.exercises ?? ''} · ${t}`;
      case 'rest':
        return `Descanso ${t}`;
      case 'seriesRest':
        return `Descanso entre series ${t}`;
    }
  }

  private elapsed(): number {
    if (this.status === 'running') {
      return this.baseElapsed + (this.clock() - this.segmentStart);
    }
    if (this.status === 'completed' || this.status === 'finishedEarly') {
      return this.baseElapsed;
    }
    return this.baseElapsed;
  }

  /** Busca la fase que contiene el tiempo indicado. */
  private locate(elapsed: number): { index: number; remaining: number } {
    const plan = this.plan!;
    const n = plan.phases.length;
    if (n === 0 || elapsed >= plan.totalMs) {
      return { index: n - 1, remaining: 0 };
    }
    let i = 0;
    while (i < n - 1 && elapsed >= this.offsets[i + 1]) i++;
    const end = this.offsets[i] + plan.phases[i].durationMs;
    return { index: i, remaining: end - elapsed };
  }

  /** Marca como completado si el tiempo activo alcanzó el final del plan. */
  private checkCompletion(elapsed: number): void {
    if (this.status === 'running' && this.plan && elapsed >= this.plan.totalMs) {
      this.baseElapsed = this.plan.totalMs;
      this.status = 'completed';
    }
  }

  private summarize(status: 'completed' | 'finishedEarly', elapsed: number): SessionSummary {
    const plan = this.plan!;
    const cut = Math.min(elapsed, plan.totalMs);
    const { index } = this.locate(cut);

    // Último ejercicio de cada serie, según el plan.
    const lastOfSeries = new Map<number, number>();
    for (const p of plan.phases) {
      if (p.type === 'work' && p.series !== undefined) {
        lastOfSeries.set(p.series, Math.max(lastOfSeries.get(p.series) ?? 0, p.exercise ?? 0));
      }
    }

    let workMs = 0;
    let completedExercises = 0;
    const seriesDone = new Set<number>();

    // Cuenta solo las fases terminadas antes del corte.
    for (let i = 0; i <= index; i++) {
      const p = plan.phases[i];
      const end = this.offsets[i] + p.durationMs;
      if (end > cut) break;
      if (p.type !== 'work' || p.series === undefined) continue;
      workMs += p.durationMs;
      completedExercises++;
      if (p.exercise === lastOfSeries.get(p.series)) {
        seriesDone.add(p.series);
      }
    }

    this.baseElapsed = cut;
    this.status = status;

    return {
      status,
      activeMs: cut,
      workMs,
      completedExercises,
      completedSeries: seriesDone.size,
    };
  }
}
