import { formatDateShortVN } from './utils';

export interface ISOWeekInfo {
  weekNumber: number;
  weekYear: number;
}

export interface WeekOption {
  offset: number;
  label: string;
  monday: Date;
  sunday: Date;
  weekNumber: number;
  weekYear: number;
}

/**
 * Calculates the ISO-8601 week number and week-year for a given date.
 * Week starts on Monday and ends on Sunday.
 * Week 1 is the week with the first Thursday of the year (containing Jan 4th).
 * Computation uses UTC to avoid timezone / daylight saving issues.
 */
export function getISOWeekInfo(date: Date): ISOWeekInfo {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day of week in ISO: 1 (Mon) to 7 (Sun)
  const dayNr = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  // Target Thursday of the week containing the target date
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const weekYear = target.getUTCFullYear();

  // Week 1 Thursday of the ISO weekYear (Jan 4 is always in week 1)
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const jan4DayNr = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  jan4.setUTCDate(jan4.getUTCDate() + 4 - jan4DayNr);

  // Difference in weeks between target Thursday and Jan 4 Thursday
  const weekNumber = 1 + Math.round((target.getTime() - jan4.getTime()) / 604800000);

  return { weekNumber, weekYear };
}

/**
 * Generates an array of week options relative to a base date.
 * Returns formatted labels matching the standard:
 * - offset 0: "Tuần {W}/{YYYY} · Hiện tại ({dd/MM} – {dd/MM})"
 * - offset 1: "Tuần {W}/{YYYY} · Tiếp theo ({dd/MM} – {dd/MM})"
 * - other: "Tuần {W}/{YYYY} ({dd/MM} – {dd/MM})"
 */
export function generateWeekOptions(
  baseDate: Date = new Date(),
  minOffset = -4,
  maxOffset = 16
): WeekOption[] {
  const options: WeekOption[] = [];
  const currentJsDay = baseDate.getDay();
  const mondayOffset = currentJsDay === 0 ? -6 : 1 - currentJsDay;

  for (let offset = minOffset; offset <= maxOffset; offset++) {
    const monday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + mondayOffset + offset * 7, 0, 0, 0, 0);
    const sunday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + mondayOffset + offset * 7 + 6, 23, 59, 59, 999);

    const { weekNumber, weekYear } = getISOWeekInfo(monday);

    let label: string;
    const dateRange = `${formatDateShortVN(monday)} – ${formatDateShortVN(sunday)}`;
    if (offset === 0) {
      label = `Tuần ${weekNumber}/${weekYear} · Hiện tại (${dateRange})`;
    } else if (offset === 1) {
      label = `Tuần ${weekNumber}/${weekYear} · Tiếp theo (${dateRange})`;
    } else {
      label = `Tuần ${weekNumber}/${weekYear} (${dateRange})`;
    }

    options.push({
      offset,
      label,
      monday,
      sunday,
      weekNumber,
      weekYear,
    });
  }

  return options;
}
