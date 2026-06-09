import { utcCalendarDateFromIso, utcHourStartFromIso } from './bar-date.util';

describe('bar-date.util', () => {
  it('utcCalendarDateFromIso floors to UTC calendar date', () => {
    expect(utcCalendarDateFromIso('2026-04-24T15:30:00.000Z').toISOString()).toBe(
      '2026-04-24T00:00:00.000Z',
    );
  });

  it('utcHourStartFromIso floors to UTC hour', () => {
    expect(utcHourStartFromIso('2026-04-24T15:30:00.000Z').toISOString()).toBe(
      '2026-04-24T15:00:00.000Z',
    );
  });

  it('utcHourStartFromIso preserves exact hour boundary', () => {
    expect(utcHourStartFromIso('2026-04-24T15:00:00.000Z').toISOString()).toBe(
      '2026-04-24T15:00:00.000Z',
    );
  });
});
