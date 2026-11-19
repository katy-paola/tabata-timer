export interface SessionRecord {
  /** Identificador basado en la fecha de finalización. */
  id: string;
  /** Fecha y hora de finalización (epoch ms). */
  finishedAt: number;
  status: 'completed' | 'finishedEarly';
  /** Duración total (tiempo activo, sin pausas). */
  activeMs: number;
  /** Tiempo efectivo de trabajo. */
  workMs: number;
  completedExercises: number;
  completedSeries: number;
}

const KEY = 'tabata.sessions.v1';

/** Inserta una sesión y guarda la lista ordenada de más reciente a más antigua. */
export function addSession(record: SessionRecord): void {
  const sessions = loadSessions();
  sessions.push(record);
  sessions.sort((a, b) => b.finishedAt - a.finishedAt);
  try {
    localStorage.setItem(KEY, JSON.stringify(sessions));
  } catch {
    // Sin almacenamiento: el historial no se conservará.
  }
}

/** Devuelve las sesiones válidas, de más reciente a más antigua. */
export function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter(
      (s): s is SessionRecord =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as SessionRecord).id === 'string' &&
        typeof (s as SessionRecord).finishedAt === 'number' &&
        ((s as SessionRecord).status === 'completed' ||
          (s as SessionRecord).status === 'finishedEarly') &&
        typeof (s as SessionRecord).activeMs === 'number'
    );
    return valid.sort((a, b) => b.finishedAt - a.finishedAt);
  } catch {
    return [];
  }
}
