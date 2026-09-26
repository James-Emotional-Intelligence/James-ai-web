/**
 * Canonical Date-Time and Timezone utilities for Jami AI
 * Default timezone: Asia/Ho_Chi_Minh (UTC+7)
 */

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export const VIETNAMESE_DAY_NAMES: Record<number, string> = {
  1: 'Thứ Hai',
  2: 'Thứ Ba',
  3: 'Thứ Tư',
  4: 'Thứ Năm',
  5: 'Thứ Sáu',
  6: 'Thứ Bảy',
  7: 'Chủ Nhật',
};

export const SHORT_VIETNAMESE_DAY_NAMES: Record<number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  7: 'CN',
};

/**
 * Returns a valid IANA timezone, defaulting to 'Asia/Ho_Chi_Minh'
 */
export function resolveUserTimeZone(tz?: string | null): string {
  if (!tz || typeof tz !== 'string' || !tz.trim()) {
    return DEFAULT_TIMEZONE;
  }
  const trimmed = tz.trim();
  try {
    // Validate IANA timezone
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Resolves Vietnamese weekday text or raw numbers to canonical 1..7 (1=Thứ 2, 7=Chủ Nhật)
 */
export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  date: string;
  time: string;
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value || '';
}

export function getZonedDateParts(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): ZonedDateParts {
  const tz = resolveUserTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const year = Number(getPart(parts, 'year'));
  const month = Number(getPart(parts, 'month'));
  const day = Number(getPart(parts, 'day'));
  const hour = Number(getPart(parts, 'hour')) % 24;
  const minute = Number(getPart(parts, 'minute'));
  const second = Number(getPart(parts, 'second'));

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
  };
}

export function getCanonicalWeekday(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: resolveUserTimeZone(timeZone),
    weekday: 'short',
  }).format(now).toLowerCase();
  const map: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  return map[weekday.slice(0, 3)] || 1;
}

function zonedWallTimeDeltaMs(
  instant: Date,
  target: Pick<ZonedDateParts, 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second'>,
  timeZone: string
): number {
  const actual = getZonedDateParts(instant, timeZone);
  const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  const targetUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second);
  return targetUtc - actualUtc;
}

function addLocalCalendarDays(date: string, days: number): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('INVALID_LOCAL_DATE');
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

export function parseLocalDateTime(params: { date: string; time: string; timeZone?: string }): Date {
  const tz = resolveUserTimeZone(params.timeZone);
  const dateMatch = params.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = params.time.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!dateMatch || !timeMatch) {
    throw new Error('INVALID_LOCAL_DATETIME');
  }

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: Number(timeMatch[3] || 0),
  };

  let guess = new Date(Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute, target.second));
  for (let i = 0; i < 3; i += 1) {
    const delta = zonedWallTimeDeltaMs(guess, target, tz);
    if (delta === 0) break;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

export function ensureFutureDateTime(date: Date, now: Date = new Date()): Date {
  if (date.getTime() <= now.getTime()) {
    throw new Error('TARGET_DATETIME_IN_PAST');
  }
  return date;
}

export function resolveNaturalTarget(params: {
  dayOfWeek?: number;
  dateText?: string;
  timeText?: string;
  timeZone?: string;
  now?: Date;
  preferFuture?: boolean;
}): Date {
  const tz = resolveUserTimeZone(params.timeZone);
  const now = params.now || new Date();
  const nowParts = getZonedDateParts(now, tz);
  const timeMatch = (params.timeText || '19:00').match(/(\d{1,2})(?::|h)?(\d{2})?/i);
  const hour = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 19;
  const minute = timeMatch?.[2] ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;

  let date = params.dateText && /^\d{4}-\d{2}-\d{2}$/.test(params.dateText)
    ? params.dateText
    : nowParts.date;

  const hasExplicitDate = Boolean(params.dateText && /^\d{4}-\d{2}-\d{2}$/.test(params.dateText));
  const hasWeekday = Boolean(params.dayOfWeek && params.dayOfWeek >= 1 && params.dayOfWeek <= 7);
  if (!hasExplicitDate && hasWeekday) {
    const currentDow = getCanonicalWeekday(now, tz);
    let offset = params.dayOfWeek - currentDow;
    if (offset < 0) {
      offset += 7;
    }
    date = addLocalCalendarDays(nowParts.date, offset);
  }

  let resolved = parseLocalDateTime({
    date,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    timeZone: tz,
  });

  if (params.preferFuture !== false && resolved.getTime() <= now.getTime()) {
    if (hasExplicitDate) throw new Error('TARGET_DATETIME_IN_PAST');
    const nextDate = addLocalCalendarDays(date, hasWeekday ? 7 : 1);
    resolved = parseLocalDateTime({
      date: nextDate,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      timeZone: tz,
    });
  }
  return resolved;
}

export function resolveVietnameseDayOfWeek(input: any, defaultJsDay?: number): number {
  if (input === undefined || input === null || input === '') {
    if (defaultJsDay === undefined) throw new Error('DAY_OF_WEEK_REQUIRED');
    const jsDay = defaultJsDay;
    return jsDay === 0 ? 7 : jsDay;
  }

  const str = String(input).trim().toLowerCase();

  if (
    str.includes('chủ nhật') ||
    str.includes('chu nhat') ||
    str === 'cn' ||
    str === 'sun' ||
    str.includes('sunday')
  ) {
    return 7;
  }
  if (
    str.includes('thứ 2') ||
    str.includes('thu 2') ||
    str.includes('thứ hai') ||
    str.includes('thu hai') ||
    str === 't2' ||
    str.includes('mon')
  ) {
    return 1;
  }
  if (
    str.includes('thứ 3') ||
    str.includes('thu 3') ||
    str.includes('thứ ba') ||
    str.includes('thu ba') ||
    str === 't3' ||
    str.includes('tue')
  ) {
    return 2;
  }
  if (
    str.includes('thứ 4') ||
    str.includes('thu 4') ||
    str.includes('thứ tư') ||
    str.includes('thu tu') ||
    str === 't4' ||
    str.includes('wed')
  ) {
    return 3;
  }
  if (
    str.includes('thứ 5') ||
    str.includes('thu 5') ||
    str.includes('thứ năm') ||
    str.includes('thu nam') ||
    str === 't5' ||
    str.includes('thu')
  ) {
    return 4;
  }
  if (
    str.includes('thứ 6') ||
    str.includes('thu 6') ||
    str.includes('thứ sáu') ||
    str.includes('thu sau') ||
    str === 't6' ||
    str.includes('fri')
  ) {
    return 5;
  }
  if (
    str.includes('thứ 7') ||
    str.includes('thu 7') ||
    str.includes('thứ bảy') ||
    str.includes('thu bay') ||
    str === 't7' ||
    str.includes('sat')
  ) {
    return 6;
  }

  const num = Number(input);
  if (!isNaN(num) && num >= 1 && num <= 7) {
    return Math.floor(num);
  }

  throw new Error('INVALID_DAY_OF_WEEK');
}

/**
 * Calculates concrete ISO timestamp for a target day of week in current/upcoming week
 */
export function calculateTargetDateTimeIso(
  targetDow?: number,
  timeStr?: string,
  explicitIso?: string,
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): string {
  if (explicitIso) {
    const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(explicitIso);
    const parsed = hasOffset
      ? new Date(explicitIso)
      : parseLocalDateTime({
          date: explicitIso.slice(0, 10),
          time: explicitIso.slice(11, 16) || '00:00',
          timeZone,
        });
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
      return parsed.toISOString();
    }
  }

  return resolveNaturalTarget({
    dayOfWeek: targetDow,
    timeText: timeStr,
    timeZone,
    now,
    preferFuture: true,
  }).toISOString();
}

/**
 * Gets real-time date/time context in Vietnam (or specified) timezone
 */
export function getNowInTimeZone(timeZone: string = DEFAULT_TIMEZONE) {
  const tz = resolveUserTimeZone(timeZone);
  const now = new Date();

  const formatterTime = new Intl.DateTimeFormat('vi-VN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const zoned = getZonedDateParts(now, tz);
  const dateIsoYmd = zoned.date;
  const timeStr = formatterTime.format(now);
  const canonicalDow = getCanonicalWeekday(now, tz);

  return {
    now,
    currentIso: now.toISOString(),
    currentDateStr: dateIsoYmd,
    currentTimeStr: timeStr,
    currentDayOfWeek: canonicalDow,
    currentDayOfWeekVn: VIETNAMESE_DAY_NAMES[canonicalDow] || 'Thứ Hai',
    timeZone: tz,
  };
}

export function formatVnDate(date: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: resolveUserTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatVnTime(date: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: resolveUserTimeZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatVnDateTime(date: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return `${formatVnTime(d, timeZone)} ngày ${formatVnDate(d, timeZone)}`;
}
