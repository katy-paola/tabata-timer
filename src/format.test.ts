import { describe, expect, it } from 'vitest';
import { formatClock } from './format';

describe('formatClock', () => {
  it('formatea segundos como m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(30)).toBe('0:30');
    expect(formatClock(95)).toBe('1:35');
    expect(formatClock(1430)).toBe('23:50');
  });

  it('trunca los decimales y acepta valores negativos como cero', () => {
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(-10)).toBe('0:00');
  });
});
