import { describe, expect, it } from 'vitest';
import { parseConfig, type RawConfig } from './configForm';

const VALID: RawConfig = {
  prep: '10',
  work: '30',
  rest: '10',
  exercises: '8',
  series: '4',
  seriesRests: ['60', '60', '60'],
};

describe('parseConfig', () => {
  it('acepta la configuración predeterminada', () => {
    const result = parseConfig(VALID);
    expect(result).toEqual({
      ok: true,
      config: { prep: 10, work: 30, rest: 10, exercises: 8, series: 4, seriesRests: [60, 60, 60] },
    });
  });

  it('permite preparación y descansos de cero segundos', () => {
    const result = parseConfig({ ...VALID, prep: '0', rest: '0', seriesRests: ['0', '0', '0'] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.prep).toBe(0);
      expect(result.config.seriesRests).toEqual([0, 0, 0]);
    }
  });

  it('rechaza trabajo de cero segundos', () => {
    const result = parseConfig({ ...VALID, work: '0' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('Trabajo');
  });

  it('rechaza ejercicios o series menores que 1', () => {
    const r1 = parseConfig({ ...VALID, exercises: '0' });
    expect(r1.ok).toBe(false);
    const r2 = parseConfig({ ...VALID, series: '1' , seriesRests: [] });
    // series = 1 es válida: no hay transiciones, lista vacía
    expect(r2.ok).toBe(true);
    const r3 = parseConfig({ ...VALID, series: '0', seriesRests: [] });
    expect(r3.ok).toBe(false);
  });

  it('rechaza valores no numéricos o negativos', () => {
    const result = parseConfig({ ...VALID, rest: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rechaza si falta un descanso entre series', () => {
    const result = parseConfig({ ...VALID, seriesRests: ['60'] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('descanso entre series');
  });
});
