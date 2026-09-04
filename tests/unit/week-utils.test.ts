import { describe, it, expect } from 'vitest';
import { getISOWeekInfo, generateWeekOptions } from '../../src/lib/week-utils';

describe('ISO-8601 Week Calculation (week-utils)', () => {
  it('correctly calculates week 53 of 2020 for 2020-12-31', () => {
    const d = new Date(2020, 11, 31); // 31 Dec 2020 (Thursday)
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 53, weekYear: 2020 });
  });

  it('correctly calculates week 53 of 2020 for 2021-01-01 (Friday)', () => {
    const d = new Date(2021, 0, 1); // 1 Jan 2021
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 53, weekYear: 2020 });
  });

  it('correctly calculates week 53 of 2020 for 2021-01-03 (Sunday)', () => {
    const d = new Date(2021, 0, 3); // 3 Jan 2021
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 53, weekYear: 2020 });
  });

  it('correctly calculates week 1 of 2021 for 2021-01-04 (Monday)', () => {
    const d = new Date(2021, 0, 4); // 4 Jan 2021
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 1, weekYear: 2021 });
  });

  it('correctly calculates week 52 of 2024 for 2024-12-29 (Sunday)', () => {
    const d = new Date(2024, 11, 29); // 29 Dec 2024
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 52, weekYear: 2024 });
  });

  it('correctly calculates week 1 of 2025 for 2024-12-30 (Monday)', () => {
    const d = new Date(2024, 11, 30); // 30 Dec 2024
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 1, weekYear: 2025 });
  });

  it('correctly calculates week 1 of 2026 for 2026-01-01 (Thursday)', () => {
    const d = new Date(2026, 0, 1); // 1 Jan 2026
    const info = getISOWeekInfo(d);
    expect(info).toEqual({ weekNumber: 1, weekYear: 2026 });
  });

  it('correctly calculates mid-year date: 2026-09-04 (Friday)', () => {
    const d = new Date(2026, 8, 4); // 4 Sep 2026
    const info = getISOWeekInfo(d);
    expect(info.weekYear).toBe(2026);
    expect(info.weekNumber).toBe(36);
  });

  it('generates week options with appropriate current and next week labels', () => {
    const baseDate = new Date(2026, 8, 4); // Sep 4, 2026 (Friday in week 36)
    const options = generateWeekOptions(baseDate, -1, 2);

    expect(options.length).toBe(4); // -1, 0, 1, 2

    const currentWeek = options.find((o) => o.offset === 0);
    expect(currentWeek).toBeDefined();
    expect(currentWeek?.weekNumber).toBe(36);
    expect(currentWeek?.weekYear).toBe(2026);
    expect(currentWeek?.label).toContain('Tuần 36/2026 · Hiện tại');

    const nextWeek = options.find((o) => o.offset === 1);
    expect(nextWeek).toBeDefined();
    expect(nextWeek?.weekNumber).toBe(37);
    expect(nextWeek?.weekYear).toBe(2026);
    expect(nextWeek?.label).toContain('Tuần 37/2026 · Tiếp theo');

    const prevWeek = options.find((o) => o.offset === -1);
    expect(prevWeek).toBeDefined();
    expect(prevWeek?.weekNumber).toBe(35);
    expect(prevWeek?.label).toContain('Tuần 35/2026');
    expect(prevWeek?.label).not.toContain('Hiện tại');
  });
});
