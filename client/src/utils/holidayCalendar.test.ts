import { describe, expect, it } from 'vitest';
import { nextHoliday } from './holidayCalendar';

describe('verified festival reminders, not substitute leave dates', () => {
  it.each([
    [2026, 2, 17, 'Lunar New Year'], [2026, 4, 5, 'Tomb Sweeping'], [2026, 6, 19, 'Dragon Boat'], [2026, 9, 25, 'Moon Festival'],
    [2027, 2, 6, 'Lunar New Year'], [2027, 4, 5, 'Tomb Sweeping'], [2027, 6, 9, 'Dragon Boat'], [2027, 9, 15, 'Moon Festival'],
  ])('keeps the official %i/%i/%i festival visible throughout that local day', (year, month, day, name) => {
    const result = nextHoliday('zh-TW', new Date(year as number, (month as number) - 1, day as number, 23, 59));
    expect(result.name).toContain(name);
    expect(result.date).toEqual(new Date(year as number, (month as number) - 1, day as number));
    expect(result.calendarNotice).toBeUndefined();
  });
  it('does not repeat the 2025 Mid-Autumn date in October 2026', () => {
    const result = nextHoliday('zh-TW', new Date(2026, 9, 1));
    expect(result.name).toContain('National Day'); expect(result.date).toEqual(new Date(2026, 9, 10));
  });
  it('sorts verified moving festivals alongside fixed dates', () => {
    expect(nextHoliday('zh-TW', new Date(2026, 1, 1)).date).toEqual(new Date(2026, 1, 17));
    expect(nextHoliday('zh-TW', new Date(2027, 1, 1)).date).toEqual(new Date(2027, 1, 6));
  });
  it('rolls to a known New Year and never fabricates unverified lunar dates', () => {
    expect(nextHoliday('zh-TW', new Date(2027, 11, 31)).date).toEqual(new Date(2028, 0, 1));
    const unknown = nextHoliday('zh-TW', new Date(2028, 1, 1));
    expect(unknown.name).toContain('Peace Day'); expect(unknown.calendarNotice).toContain('待更新');
  });
  it.each([[2025, 27], [2026, 26], [2027, 25], [2028, 23]])('computes Thanksgiving %i rather than repeating Nov 27', (year, day) => {
    expect(nextHoliday('en-US', new Date(year, 10, 1)).date).toEqual(new Date(year, 10, day));
  });
  it('retains generic reminders and the entire current holiday day', () => {
    expect(nextHoliday('ja-JP', new Date(2026, 11, 25, 12)).name).toBe('Christmas');
    expect(nextHoliday('en-US', new Date(2026, 11, 31)).date).toEqual(new Date(2027, 0, 1));
  });
});
