import type { SessionRecord } from './history';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface Stats {
  /** Sesiones con estado completado. */
  completedCount: number;
  /** Total de sesiones registradas (incluidas las finalizadas antes de tiempo). */
  totalSessions: number;
  /** Tiempo total de entrenamiento (tiempo activo, sin pausas). */
  totalActiveMs: number;
  /** Tiempo efectivo de trabajo. */
  totalWorkMs: number;
  /** Sesiones registradas desde el lunes de la semana en curso. */
  weekSessions: number;
  /** Tiempo activo de la semana en curso. */
  weekActiveMs: number;
  /** Semanas transcurridas desde la primera sesión (mínimo 1). */
  weeks: number;
  /** Sesiones por semana: total de sesiones dividido entre las semanas. */
  avgSessionsPerWeek: number;
}

/** Lunes 00:00 (hora local) de la semana que contiene la fecha indicada. */
export function startOfWeek(epochMs: number): number {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  const daysSinceMonday = (date.getDay() + 6) % 7; // lunes = 0, domingo = 6
  date.setDate(date.getDate() - daysSinceMonday);
  return date.getTime();
}

export function computeStats(sessions: SessionRecord[], now: number): Stats {
  const totalActiveMs = sessions.reduce((acc, s) => acc + s.activeMs, 0);
  const totalWorkMs = sessions.reduce((acc, s) => acc + s.workMs, 0);
  const completedCount = sessions.filter((s) => s.status === 'completed').length;

  const weekStart = startOfWeek(now);
  const weekSessionsAll = sessions.filter((s) => s.finishedAt >= weekStart);
  const weekActiveMs = weekSessionsAll.reduce((acc, s) => acc + s.activeMs, 0);

  let weeks = 0;
  let avgSessionsPerWeek = 0;
  if (sessions.length > 0) {
    const first = Math.min(...sessions.map((s) => s.finishedAt));
    weeks = Math.max(1, Math.round((weekStart - startOfWeek(first)) / WEEK_MS) + 1);
    avgSessionsPerWeek = sessions.length / weeks;
  }

  return {
    completedCount,
    totalSessions: sessions.length,
    totalActiveMs,
    totalWorkMs,
    weekSessions: weekSessionsAll.length,
    weekActiveMs,
    weeks,
    avgSessionsPerWeek,
  };
}
