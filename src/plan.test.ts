import { describe, expect, it } from 'vitest';
import { buildPlan, phaseOffsets } from './plan';
import type { WorkoutConfig } from './types';

/** Ejemplo de la sección 6.5 del PRD: 3 series, 4 ejercicios, 20/10, descansos 30 y 60. */
const EXAMPLE_6_5: WorkoutConfig = {
  prep: 0,
  work: 20,
  rest: 10,
  exercises: 4,
  series: 3,
  seriesRests: [30, 60],
};

describe('buildPlan (reglas 6.1–6.4)', () => {
  it('genera la secuencia exacta del ejemplo 6.5', () => {
    const { phases } = buildPlan(EXAMPLE_6_5);

    const labels = phases.map((p) => `${p.type}:${p.durationMs / 1000}`);
    const expected: string[] = [];
    for (let s = 1; s <= 3; s++) {
      for (let e = 1; e <= 4; e++) {
        expected.push('work:20');
        if (e < 4) expected.push('rest:10');
      }
      if (s < 3) expected.push(`seriesRest:${s === 1 ? 30 : 60}`);
    }
    expect(labels).toEqual(expected);
  });

  it('no añade descanso tras el último ejercicio de la última serie (6.4)', () => {
    const { phases } = buildPlan(EXAMPLE_6_5);
    expect(phases[phases.length - 1].type).toBe('work');
    expect(phases[phases.length - 1].exercise).toBe(4);
    expect(phases[phases.length - 1].series).toBe(3);
  });

  it('el descanso entre series sustituye al común (6.3)', () => {
    const { phases } = buildPlan(EXAMPLE_6_5);
    const lastWorkOfSerie1 = phases.findIndex(
      (p) => p.type === 'work' && p.series === 1 && p.exercise === 4
    );
    expect(phases[lastWorkOfSerie1 + 1].type).toBe('seriesRest');
    expect(phases[lastWorkOfSerie1 + 1].durationMs).toBe(30_000);
  });

  it('la duración total coincide con el ejemplo', () => {
    // 12 ejercicios × 20 s + 9 descansos comunes × 10 s + 30 + 60
    const { totalMs, workMs } = buildPlan(EXAMPLE_6_5);
    expect(totalMs).toBe((12 * 20 + 9 * 10 + 90) * 1000);
    expect(workMs).toBe(12 * 20 * 1000);
  });

  it('omite fases de duración cero', () => {
    const config: WorkoutConfig = { ...EXAMPLE_6_5, prep: 0, seriesRests: [0, 60] };
    const { phases } = buildPlan(config);
    expect(phases.some((p) => p.type === 'prep')).toBe(false);
    expect(phases.filter((p) => p.type === 'seriesRest')).toHaveLength(1);
    expect(phases[phases.findIndex((p) => p.series === 2)].type).toBe('work');
  });

  it('genera la configuración predeterminada del producto', () => {
    const { phases, totalMs } = buildPlan({
      prep: 10,
      work: 30,
      rest: 10,
      exercises: 8,
      series: 4,
      seriesRests: [60, 60, 60],
    });
    const work = phases.filter((p) => p.type === 'work');
    const rest = phases.filter((p) => p.type === 'rest');
    const seriesRest = phases.filter((p) => p.type === 'seriesRest');
    expect(work).toHaveLength(32);
    expect(rest).toHaveLength(28);
    expect(seriesRest).toHaveLength(3);
    expect(phases[0].type).toBe('prep');
    // 10 + 4×(8×30 + 7×10) + 3×60 = 1430 s
    expect(totalMs).toBe(1430_000);
  });

  it('los offsets permiten localizar cada fase', () => {
    const plan = buildPlan(EXAMPLE_6_5);
    const offsets = phaseOffsets(plan);
    expect(offsets).toHaveLength(plan.phases.length);
    expect(offsets[0]).toBe(0);
    const last = plan.phases.length - 1;
    expect(offsets[last] + plan.phases[last].durationMs).toBe(plan.totalMs);
  });
});
