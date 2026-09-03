/**
 * JAMI AI Shared Date & Timezone Utilities
 * Deterministic, timezone-safe date transformations
 */

export function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzPart) {
      if (tzPart === 'GMT' || tzPart === 'UTC') return 0;
      const match = tzPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
      if (match) {
        const sign = match[1] === '-' ? -1 : 1;
        const hours = parseInt(match[2], 10);
        const mins = match[3] ? parseInt(match[3], 10) : 0;
        return sign * (hours * 60 + mins);
      }
    }
  } catch {}
  return 7 * 60; // default UTC+7
}

/**
 * Convert local date + local time string into an exact UTC ISO 8601 string
 * Example: localDateTimeToUtc('2026-09-02', '19:30', 'Asia/Ho_Chi_Minh') -> '2026-09-02T12:30:00.000Z'
 */
export function localDateTimeToUtc(dateStr: string, timeStr: string, timezone = 'Asia/Ho_Chi_Minh'): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  const hour = timeParts[0] || 0;
  const minute = timeParts[1] || 0;
  const second = timeParts[2] || 0;

  // Approximate UTC date to find exact offset for that specific date and daylight saving
  const tempUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMins = getTimezoneOffsetMinutes(tempUtc, timezone);

  // Exact UTC timestamp = local time minus offset
  const exactUtcMs = tempUtc.getTime() - offsetMins * 60 * 1000;
  return new Date(exactUtcMs).toISOString();
}

/**
 * Get date string (YYYY-MM-DD) in a specific timezone
 */
export function formatDateInTimezone(date: Date, timezone = 'Asia/Ho_Chi_Minh'): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Get local time string (HH:mm) in a specific timezone
 */
export function formatTimeInTimezone(date: Date, timezone = 'Asia/Ho_Chi_Minh'): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}
