import { describe, expect, it } from 'vitest';
import type { SessionRecord } from './history';
import { computeStats, startOfWeek } from './stats';

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'x',
    finishedAt: 0,
    status: 'completed',
    activeMs: 60_000,
    workMs: 40_000,
    completedExercises: 4,
    completedSeries: 1,
    ...overrides,
  };
}

/** Fecha local de un lunes cualquiera a las 10:00. */
function monday(offsetWeeks: number, day = 1): number {
  // 2026-01-05 es un lunes
  const base = new Date(2026, 0, 5 + offsetWeeks * 7, 10, 0, 0);
  base.setDate(base.getDate() + (day - 1));
  return base.getTime();
}

describe('startOfWeek', () => {
  it('un lunes pertenece a su propia semana', () => {
    expect(startOfWeek(monday(0))).toBe(new Date(2026, 0, 5, 0, 0, 0).getTime());
  });

  it('un domingo pertenece a la semana que empezó el lunes anterior', () => {
    const sunday = monday(0, 7);
    expect(startOfWeek(sunday)).toBe(new Date(2026, 0, 5, 0, 0, 0).getTime());
  });

  it('un martes pertenece a la misma semana que el lunes', () => {
    const tuesday = monday(0, 2);
    expect(startOfWeek(tuesday)).toBe(new Date(2026, 0, 5, 0, 0, 0).getTime());
  });
});

describe('computeStats', () => {
  it('devuelve ceros sin sesiones', () => {
    const stats = computeStats([], Date.now());
    expect(stats.totalSessions).toBe(0);
    expect(stats.completedCount).toBe(0);
    expect(stats.totalActiveMs).toBe(0);
    expect(stats.avgSessionsPerWeek).toBe(0);
    expect(stats.weeks).toBe(0);
  });

  it('suma tiempos y cuenta completadas', () => {
    const stats = computeStats(
      [
        session({ id: 'a', status: 'completed', activeMs: 1000, workMs: 700 }),
        session({ id: 'b', status: 'finishedEarly', activeMs: 500, workMs: 200 }),
      ],
      monday(0)
    );
    expect(stats.totalSessions).toBe(2);
    expect(stats.completedCount).toBe(1);
    expect(stats.totalActiveMs).toBe(1500);
    expect(stats.totalWorkMs).toBe(900);
  });

  it('cuenta solo las sesiones de la semana en curso', () => {
    const now = monday(0, 3); // miércoles de esa semana
    const stats = computeStats(
      [
        session({ id: 'vieja', finishedAt: monday(-1) }),
        session({ id: 'lunes', finishedAt: monday(0) }),
        session({ id: 'hoy', finishedAt: now }),
      ],
      now
    );
    expect(stats.weekSessions).toBe(2);
    expect(stats.weekActiveMs).toBe(120_000);
  });

  it('el promedio cuenta todas las semanas desde la primera sesión, incluidas las vacías', () => {
    const now = monday(2, 4); // jueves de la tercera semana
    const stats = computeStats(
      [
        session({ id: 'a', finishedAt: monday(0) }),
        session({ id: 'b', finishedAt: monday(0) }),
      ],
      now
    );
    expect(stats.weeks).toBe(3);
    expect(stats.avgSessionsPerWeek).toBeCloseTo(2 / 3);
  });

  it('una sola sesión da un promedio de 1 por semana', () => {
    const now = monday(0, 2);
    const stats = computeStats([session({ finishedAt: monday(0) })], now);
    expect(stats.weeks).toBe(1);
    expect(stats.avgSessionsPerWeek).toBe(1);
  });
});
