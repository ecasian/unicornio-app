import { describe, expect, it } from 'vitest';
import { resolveBusinessDate } from './business-date.js';

describe('business date window', () => {
  it('uses yesterday as a local calendar day in the configured timezone', () => {
    const result = resolveBusinessDate(undefined, 'America/Mexico_City', new Date('2026-10-06T05:30:00.000Z'));
    expect(result.fecha).toBe('2026-10-04');
    expect(result.start.toISOString()).toBe('2026-10-04T06:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('uses calendar boundaries instead of a rolling 24-hour window', () => {
    const result = resolveBusinessDate('2026-10-05', 'America/Mexico_City');
    expect(result.start.toISOString()).toBe('2026-10-05T06:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-10-06T06:00:00.000Z');
  });

  it.each(['2026-2-05', '2026-02-30', 'nonsense'])('rejects invalid calendar date %s', (fecha) => {
    expect(() => resolveBusinessDate(fecha, 'America/Mexico_City')).toThrow();
  });

  it('rejects unknown timezones', () => {
    expect(() => resolveBusinessDate('2026-10-05', 'Moon/Tranquility')).toThrow();
  });
});
