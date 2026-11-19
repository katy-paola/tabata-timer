import { beforeEach, describe, expect, it } from 'vitest';
import { addSession, loadSessions, type SessionRecord } from './history';

/** Sustituto de localStorage para el entorno de tests. */
class FakeStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: '1',
    finishedAt: 1000,
    status: 'completed',
    activeMs: 60_000,
    workMs: 40_000,
    completedExercises: 4,
    completedSeries: 1,
    ...overrides,
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new FakeStorage();
});

describe('historial de sesiones', () => {
  it('guarda y recupera una sesión', () => {
    addSession(record());
    const sessions = loadSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].activeMs).toBe(60_000);
  });

  it('ordena de más reciente a más antigua', () => {
    addSession(record({ id: 'a', finishedAt: 100 }));
    addSession(record({ id: 'b', finishedAt: 300 }));
    addSession(record({ id: 'c', finishedAt: 200 }));
    expect(loadSessions().map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('devuelve lista vacía con datos ausentes o corruptos', () => {
    expect(loadSessions()).toEqual([]);
    localStorage.setItem('tabata.sessions.v1', 'no-es-json');
    expect(loadSessions()).toEqual([]);
    localStorage.setItem('tabata.sessions.v1', '{"algo":1}');
    expect(loadSessions()).toEqual([]);
  });

  it('ignora registros inválidos dentro de la lista', () => {
    localStorage.setItem(
      'tabata.sessions.v1',
      JSON.stringify([record(), { id: 'malo' }, null, record({ id: 'ok', finishedAt: 500 })])
    );
    const sessions = loadSessions();
    // finishedAt: '1' = 1000, 'ok' = 500 → de más reciente a más antigua
    expect(sessions.map((s) => s.id)).toEqual(['1', 'ok']);
  });
});
