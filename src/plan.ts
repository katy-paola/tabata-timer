import type { Phase, PhaseType, WorkoutConfig, WorkoutPlan } from './types';

/**
 * Construye la secuencia de fases del entrenamiento.
 *
 * Reglas del PRD:
 * - 6.1: comienza con la preparación; después ejercicios alternando trabajo y descanso.
 * - 6.2: dentro de una serie hay descanso común tras cada ejercicio salvo el último.
 * - 6.3: al terminar la serie, el descanso entre series sustituye al descanso común.
 * - 6.4: no hay descanso tras el último ejercicio de la última serie.
 * - Se permiten duraciones de cero: la fase no se genera.
 */
export function buildPlan(config: WorkoutConfig): WorkoutPlan {
  const phases: Phase[] = [];

  const push = (type: PhaseType, label: string, seconds: number, series?: number, exercise?: number) => {
    if (seconds > 0) {
      phases.push({ type, label, durationMs: seconds * 1000, series, exercise });
    }
  };

  push('prep', 'Preparación', config.prep);

  for (let s = 1; s <= config.series; s++) {
    for (let e = 1; e <= config.exercises; e++) {
      push('work', `Trabajo · Serie ${s} · Ejercicio ${e}/${config.exercises}`, config.work, s, e);
      if (e < config.exercises) {
        push('rest', `Descanso · Serie ${s} · Ejercicio ${e}/${config.exercises}`, config.rest, s, e);
      }
    }
    if (s < config.series) {
      push(
        'seriesRest',
        `Descanso entre series ${s} → ${s + 1}`,
        config.seriesRests[s - 1] ?? 0,
        s
      );
    }
  }

  const totalMs = phases.reduce((acc, p) => acc + p.durationMs, 0);
  const workMs = phases.filter((p) => p.type === 'work').reduce((acc, p) => acc + p.durationMs, 0);

  return { phases, totalMs, workMs };
}

/** Offsets de inicio (ms) de cada fase dentro del plan. */
export function phaseOffsets(plan: WorkoutPlan): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const p of plan.phases) {
    offsets.push(acc);
    acc += p.durationMs;
  }
  return offsets;
}
