import { describe, expect, it } from 'vitest';
import { businessCalendarDaysBetween, resolveBusinessDate } from './business-date.js';

describe('business date window', () => {
  it.each([
    ['D', '2026-11-06', 0],
    ['D+1', '2026-11-07', 1],
    ['D+2', '2026-11-08', 2],
    ['D+3', '2026-11-09', 3],
  ])('counts %s by calendar date', (_label, today, expected) => {
    expect(businessCalendarDaysBetween('2026-11-06', today)).toBe(expected);
  });

  it('changes the business date at the configured local midnight, not UTC midnight', () => {
    const before = resolveBusinessDate(undefined, 'America/Mexico_City', new Date('2026-11-07T05:59:59.999Z'), 'today');
    const after = resolveBusinessDate(undefined, 'America/Mexico_City', new Date('2026-11-07T06:00:00.000Z'), 'today');
    expect(before.fecha).toBe('2026-11-06');
    expect(after.fecha).toBe('2026-11-07');
    expect(businessCalendarDaysBetween('2026-11-06', before.fecha)).toBe(0);
    expect(businessCalendarDaysBetween('2026-11-06', after.fecha)).toBe(1);
  });

  it('counts across a daylight saving transition as calendar days rather than elapsed hours', () => {
    const beforeMidnight = resolveBusinessDate(undefined, 'America/New_York', new Date('2026-03-08T04:59:59.999Z'), 'today');
    const afterMidnight = resolveBusinessDate(undefined, 'America/New_York', new Date('2026-03-08T05:00:00.000Z'), 'today');
    expect(beforeMidnight.fecha).toBe('2026-03-07');
    expect(afterMidnight.fecha).toBe('2026-03-08');
    const springDay = resolveBusinessDate('2026-03-08', 'America/New_York');
    expect(springDay.end.getTime() - springDay.start.getTime()).toBe(23 * 60 * 60 * 1000);
    expect(businessCalendarDaysBetween(beforeMidnight.fecha, afterMidnight.fecha)).toBe(1);
  });

  it('uses yesterday as a local calendar day in the configured timezone', () => {
    const result = resolveBusinessDate(undefined, 'America/Mexico_City', new Date('2026-10-06T05:30:00.000Z'));
    expect(result.fecha).toBe('2026-10-04');
    expect(result.start.toISOString()).toBe('2026-10-04T06:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('can use today as a local calendar day for administrative queries', () => {
    const result = resolveBusinessDate(undefined, 'America/Mexico_City', new Date('2026-10-07T05:30:00.000Z'), 'today');
    expect(result.fecha).toBe('2026-10-06');
    expect(result.start.toISOString()).toBe('2026-10-06T06:00:00.000Z');
    expect(result.end.toISOString()).toBe('2026-10-07T06:00:00.000Z');
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
