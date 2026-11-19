import { describe, expect, it } from 'vitest';
import { TimerEngine } from './engine';
import type { WorkoutConfig } from './types';

const CONFIG: WorkoutConfig = {
  prep: 10,
  work: 20,
  rest: 10,
  exercises: 2,
  series: 2,
  seriesRests: [30],
};

/** Reloj falso controlado por el test. */
function fakeClock() {
  let now = 1000;
  return {
    clock: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

describe('TimerEngine', () => {
  it('inicia en la preparación con el tiempo restante correcto', () => {
    const { clock } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG);
    const state = engine.getState();
    expect(state.status).toBe('running');
    expect(state.phase?.type).toBe('prep');
    expect(state.phaseRemainingMs).toBe(10_000);
    expect(state.elapsedMs).toBe(0);
  });

  it('avanza de fase según la marca de tiempo real', () => {
    const { clock, advance } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG);

    advance(10_000); // fin de preparación
    let state = engine.getState();
    expect(state.phase?.type).toBe('work');
    expect(state.phase?.series).toBe(1);
    expect(state.phase?.exercise).toBe(1);
    expect(state.phaseRemainingMs).toBe(20_000);

    advance(20_000); // fin del ejercicio 1
    state = engine.getState();
    expect(state.phase?.type).toBe('rest');
    expect(state.phaseRemainingMs).toBe(10_000);
  });

  it('la pausa congela el tiempo y la reanudación continúa', () => {
    const { clock, advance } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG);

    advance(5_000); // 5 s dentro de la preparación
    engine.pause();
    let state = engine.getState();
    expect(state.status).toBe('paused');
    expect(state.phaseRemainingMs).toBe(5_000);

    advance(60_000); // el reloj corre mientras está en pausa
    state = engine.getState();
    expect(state.phaseRemainingMs).toBe(5_000);
    expect(state.elapsedMs).toBe(5_000);

    engine.resume();
    advance(5_000);
    state = engine.getState();
    expect(state.status).toBe('running');
    expect(state.phase?.type).toBe('work');
    expect(state.elapsedMs).toBe(10_000);
  });

  it('completa el entrenamiento sin descanso final', () => {
    const { clock, advance } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG);
    advance(140_000); // duración total: 10 + 50 + 30 + 50 = 140 s
    const state = engine.getState();
    expect(state.status).toBe('completed');
    expect(state.elapsedMs).toBe(140_000);

    const summary = engine.complete();
    expect(summary.status).toBe('completed');
    expect(summary.activeMs).toBe(140_000);
    expect(summary.workMs).toBe(80_000);
    expect(summary.completedExercises).toBe(4);
    expect(summary.completedSeries).toBe(2);
  });

  it('finalizar a mitad de un ejercicio cuenta solo lo terminado', () => {
    const { clock, advance } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG);

    advance(10_000 + 20_000 + 10_000 + 5_000); // preparación + ej 1 + descanso + 5 s del ej 2
    const summary = engine.finishEarly();
    expect(summary.status).toBe('finishedEarly');
    expect(summary.activeMs).toBe(45_000);
    expect(summary.completedExercises).toBe(1);
    expect(summary.completedSeries).toBe(0);
    expect(summary.workMs).toBe(20_000);
    expect(engine.getState().status).toBe('finishedEarly');
  });

  it('finalizar durante el descanso entre series cuenta la serie terminada', () => {
    const { clock, advance } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG);

    // preparación + serie 1 completa (2 ej × 20 s + 1 descanso × 10 s) + 10 s del descanso entre series
    advance(10_000 + 50_000 + 10_000);
    const summary = engine.finishEarly();
    expect(summary.completedExercises).toBe(2);
    expect(summary.completedSeries).toBe(1);
    expect(summary.workMs).toBe(40_000);
  });

  it('permite iniciar desde un tiempo guardado (recuperación)', () => {
    const { clock } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG, 70_000);
    const state = engine.getState();
    expect(state.status).toBe('running');
    expect(state.elapsedMs).toBe(70_000);
    // Con offsets: prep 10, serie 1 (20+10+20) = 60; en 70 s va por el descanso entre series
    expect(state.phase?.type).toBe('seriesRest');
    expect(state.phaseRemainingMs).toBe(20_000);
  });

  it('un tiempo guardado mayor que la duración total termina el entrenamiento', () => {
    const { clock } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.start(CONFIG, 999_999);
    expect(engine.getState().status).toBe('completed');
  });

  it('los comandos fuera de lugar no rompen el estado', () => {
    const { clock } = fakeClock();
    const engine = new TimerEngine(clock);
    engine.pause();
    engine.resume();
    expect(engine.getState().status).toBe('idle');
    expect(() => engine.finishEarly()).toThrow();

    engine.start(CONFIG);
    engine.resume(); // reanudar en marcha no cambia nada
    expect(engine.getState().status).toBe('running');
  });
});
