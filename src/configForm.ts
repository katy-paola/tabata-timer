import type { WorkoutConfig } from './types';

export interface RawConfig {
  prep: string;
  work: string;
  rest: string;
  exercises: string;
  series: string;
  seriesRests: string[];
}

export type ParseResult =
  | { ok: true; config: WorkoutConfig }
  | { ok: false; errors: string[] };

const parseNonNegativeInt = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

/**
 * Valida los valores en crudo del formulario.
 * Reglas: tiempos y descansos enteros ≥ 0; ejercicios y series ≥ 1;
 * un descanso entre series por cada transición (series - 1).
 */
export function parseConfig(raw: RawConfig): ParseResult {
  const errors: string[] = [];

  const time = (label: string, value: string): number => {
    const n = parseNonNegativeInt(value);
    if (n === null) errors.push(`${label}: introduce un número entero de segundos (0 o más).`);
    return n ?? 0;
  };

  const prep = time('Preparación', raw.prep);
  const work = time('Trabajo', raw.work);
  const rest = time('Descanso entre ejercicios', raw.rest);

  const exercises = parseNonNegativeInt(raw.exercises);
  if (exercises === null || exercises < 1) {
    errors.push('Ejercicios por serie: introduce un número igual o mayor que 1.');
  }
  const series = parseNonNegativeInt(raw.series);
  if (series === null || series < 1) {
    errors.push('Series: introduce un número igual o mayor que 1.');
  }
  if (work < 1 && errors.length === 0) {
    errors.push('Trabajo: la duración de cada ejercicio debe ser al menos 1 segundo.');
  }

  const seriesRests = raw.seriesRests.map((v, i) =>
    time(`Descanso entre las series ${i + 1} y ${i + 2}`, v)
  );
  if (series !== null && series >= 1 && seriesRests.length !== series - 1) {
    errors.push('Falta un descanso entre series para alguna transición.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: { prep, work, rest, exercises: exercises!, series: series!, seriesRests },
  };
}
