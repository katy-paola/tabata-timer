export type PhaseType = 'prep' | 'work' | 'rest' | 'seriesRest';

export interface Phase {
  type: PhaseType;
  /** Etiqueta en español para mostrar en pantalla. */
  label: string;
  durationMs: number;
  /** Serie a la que pertenece la fase (no aplica a preparación). */
  series?: number;
  /** Ejercicio dentro de la serie (no aplica a descansos entre series). */
  exercise?: number;
}

export interface WorkoutConfig {
  /** Tiempo de preparación antes del primer ejercicio, en segundos. */
  prep: number;
  /** Duración del trabajo de cada ejercicio, en segundos. */
  work: number;
  /** Descanso común entre ejercicios de la misma serie, en segundos. */
  rest: number;
  /** Ejercicios por serie. */
  exercises: number;
  /** Total de series. */
  series: number;
  /**
   * Duración de cada descanso entre series, en segundos.
   * Longitud: series - 1. El elemento i es el descanso entre la serie i+1 y la i+2.
   */
  seriesRests: number[];
}

export interface WorkoutPlan {
  phases: Phase[];
  /** Duración total del plan sin fases de duración cero. */
  totalMs: number;
  /** Tiempo efectivo de trabajo (solo fases work). */
  workMs: number;
}

export type SessionStatus = 'completed' | 'finishedEarly';

export interface SessionSummary {
  status: SessionStatus;
  /** Tiempo activo transcurrido (sin pausas). */
  activeMs: number;
  /** Tiempo efectivo de trabajo de los ejercicios terminados. */
  workMs: number;
  completedExercises: number;
  completedSeries: number;
}

export const DEFAULT_CONFIG: WorkoutConfig = {
  prep: 10,
  work: 30,
  rest: 10,
  exercises: 8,
  series: 4,
  seriesRests: [60, 60, 60],
};
