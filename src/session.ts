import type { WorkoutConfig } from './types';

export interface InterruptedSession {
  config: WorkoutConfig;
  elapsedMs: number;
  savedAt: number;
}

const KEY = 'tabata.session.v1';
/** Si la sesión guardada tiene más de un día, se descarta. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveInterrupted(session: InterruptedSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Sin almacenamiento: la recuperación no estará disponible.
  }
}

export function loadInterrupted(): InterruptedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InterruptedSession;
    const valid =
      parsed.config !== undefined &&
      typeof parsed.elapsedMs === 'number' &&
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt <= MAX_AGE_MS;
    if (!valid) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}

export function clearInterrupted(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que limpiar.
  }
}
