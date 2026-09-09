import { describe, expect, test } from 'vitest';

import { deadlineFields, formatDateTime, getTimeZone, isOverdue, parseDeadline } from '../src/dates.js';

describe('parseDeadline', () => {
  test.each([
    ['2026-09-09', '', '2026-09-09T00:00:00.000Z', false],
    ['2026/09/09', '13:45', '2026-09-09T04:45:00.000Z', true],
    ['20260909', '1345', '2026-09-09T04:45:00.000Z', true],
  ])('parses %s and %s as an Asia/Tokyo calendar deadline', (date, time, dueAt, dueHasTime) => {
    expect(parseDeadline(date, time, 'Asia/Tokyo')).toEqual({ dueAt, dueHasTime });
  });

  test('uses local 09:00 rather than UTC midnight when time is omitted', () => {
    expect(parseDeadline('2026-01-02', '', 'America/New_York')).toEqual({
      dueAt: '2026-01-02T14:00:00.000Z',
      dueHasTime: false,
    });
  });

  test('accepts blank date only when time is also blank', () => {
    expect(parseDeadline('', '', 'UTC')).toEqual({ dueAt: null, dueHasTime: false });
    expect(() => parseDeadline('', '09:00', 'UTC')).toThrow(Error);
  });

  test.each([
    ['2026-02-29', '09:00'],
    ['2026-13-01', '09:00'],
    ['2026-04-31', '09:00'],
    ['2026.09.09', '09:00'],
    ['2026-09-09', '24:00'],
    ['2026-09-09', '1260'],
  ])('rejects invalid calendar/time input %s %s', (date, time) => {
    expect(() => parseDeadline(date, time, 'UTC')).toThrow(Error);
  });

  test('accepts leap day in a leap year', () => {
    expect(parseDeadline('2028-02-29', '09:00', 'UTC')).toEqual({
      dueAt: '2028-02-29T09:00:00.000Z', dueHasTime: true,
    });
  });

  test('handles DST offsets and rejects a nonexistent local time', () => {
    expect(parseDeadline('2026-03-08', '03:30', 'America/New_York')).toEqual({
      dueAt: '2026-03-08T07:30:00.000Z', dueHasTime: true,
    });
    expect(() => parseDeadline('2026-03-08', '02:30', 'America/New_York')).toThrow(Error);
  });

  test('rejects an unknown IANA time zone', () => {
    expect(() => parseDeadline('2026-09-09', '09:00', 'Mars/Olympus')).toThrow(Error);
  });
});

describe('display and comparison helpers', () => {
  test('getTimeZone returns a usable IANA zone', () => {
    const zone = getTimeZone();
    expect(typeof zone).toBe('string');
    expect(zone.length).toBeGreaterThan(0);
    expect(() => new Intl.DateTimeFormat('ja-JP', { timeZone: zone }).format(new Date())).not.toThrow();
  });

  test('formatDateTime returns the no-deadline label and Japanese numeric display', () => {
    expect(formatDateTime(null)).toBe('期限なし');
    expect(formatDateTime('2026-09-09T03:04:00.000Z')).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}$/);
    expect(formatDateTime('2026-09-09T03:04:00.000Z', { dateOnly: true })).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}$/);
  });

  test('deadlineFields exposes the device-local date and conditionally the time', () => {
    const iso = '2026-09-09T03:04:00.000Z';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: getTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    expect(deadlineFields(iso, true)).toEqual({
      date: `${value.year}-${value.month}-${value.day}`,
      time: `${value.hour}:${value.minute}`,
    });
    expect(deadlineFields(iso, false)).toEqual({
      date: `${value.year}-${value.month}-${value.day}`,
      time: '',
    });
  });

  test('isOverdue handles absent, earlier, equal, and later deadlines', () => {
    const now = '2026-09-09T03:04:05.000Z';
    expect(isOverdue(null, now)).toBe(false);
    expect(isOverdue('2026-09-09T03:04:04.999Z', now)).toBe(true);
    expect(isOverdue(now, now)).toBe(false);
    expect(isOverdue('2026-09-09T03:04:05.001Z', now)).toBe(false);
  });
});
