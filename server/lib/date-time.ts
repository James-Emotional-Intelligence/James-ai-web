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
export function resolveVietnameseDayOfWeek(input: any, defaultJsDay?: number): number {
  if (input === undefined || input === null || input === '') {
    const jsDay = defaultJsDay !== undefined ? defaultJsDay : new Date().getDay();
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

  const jsDay = new Date().getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Calculates concrete ISO timestamp for a target day of week in current/upcoming week
 */
export function calculateTargetDateTimeIso(
  targetDow?: number,
  timeStr?: string,
  explicitIso?: string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (explicitIso) {
    const parsed = new Date(explicitIso);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
      return parsed.toISOString();
    }
  }

  const now = new Date();
  // Get current day of week in target timezone
  const currentJsDay = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const currentCanonicalDow = currentJsDay === 0 ? 7 : currentJsDay; // 1=T2 .. 7=CN
  const dow = targetDow && targetDow >= 1 && targetDow <= 7 ? targetDow : currentCanonicalDow;

  // Compute offset from current day in current week
  const dayDifference = dow - currentCanonicalDow;
  const targetDate = new Date(now);
  targetDate.setDate(now.getDate() + dayDifference);

  let hours = 19;
  let minutes = 0;
  if (timeStr) {
    const match = timeStr.match(/(\d{1,2})[:h](\d{2})?/i);
    if (match) {
      hours = Math.min(23, Math.max(0, parseInt(match[1], 10)));
      minutes = match[2] ? Math.min(59, Math.max(0, parseInt(match[2], 10))) : 0;
    }
  }

  targetDate.setHours(hours, minutes, 0, 0);
  return targetDate.toISOString();
}

/**
 * Gets real-time date/time context in Vietnam (or specified) timezone
 */
export function getNowInTimeZone(timeZone: string = DEFAULT_TIMEZONE) {
  const tz = resolveUserTimeZone(timeZone);
  const now = new Date();

  const formatterDate = new Intl.DateTimeFormat('vi-VN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const formatterTime = new Intl.DateTimeFormat('vi-VN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatterDate.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value || `${now.getFullYear()}`;
  const month = parts.find((p) => p.type === 'month')?.value || `${now.getMonth() + 1}`.padStart(2, '0');
  const day = parts.find((p) => p.type === 'day')?.value || `${now.getDate()}`.padStart(2, '0');

  const dateIsoYmd = `${year}-${month}-${day}`;
  const timeStr = formatterTime.format(now);
  const jsDay = now.getDay();
  const canonicalDow = jsDay === 0 ? 7 : jsDay;

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
