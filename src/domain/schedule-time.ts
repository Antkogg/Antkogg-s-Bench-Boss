import { DateTime } from 'luxon';
import { AppError } from '../utils/errors.js';

const TIME_FORMATS = ['H:mm', 'HH:mm', 'h:mm a', 'hh:mm a'] as const;

export function validateIanaTimezone(timezone: string): string {
  if (!DateTime.now().setZone(timezone).isValid)
    throw new AppError('INVALID_INPUT', 'Use a valid IANA timezone such as `America/Edmonton`.');
  return timezone;
}

export function normalizeLocalTime(value: string): string {
  const input = value.trim().toUpperCase();
  for (const format of TIME_FORMATS) {
    const parsed = DateTime.fromFormat(input, format, { locale: 'en-US' });
    if (parsed.isValid) return parsed.toFormat('HH:mm');
  }
  throw new AppError('INVALID_INPUT', `Invalid time: ${value}. Use a time such as 8:30 PM.`);
}

export function localScheduleToUtc(date: string, time: string, timezone: string): Date {
  validateIanaTimezone(timezone);
  const normalizedTime = normalizeLocalTime(time);
  const parsed = DateTime.fromFormat(`${date} ${normalizedTime}`, 'yyyy-MM-dd HH:mm', {
    zone: timezone,
    setZone: true,
  });
  if (!parsed.isValid || parsed.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${normalizedTime}`)
    throw new AppError(
      'INVALID_INPUT',
      `That local date/time does not exist in ${timezone}, likely because of daylight saving time.`,
    );
  return parsed.toUTC().toJSDate();
}

export function nextSundayDate(timezone: string, from = new Date()): string {
  validateIanaTimezone(timezone);
  const local = DateTime.fromJSDate(from).setZone(timezone).startOf('day');
  const daysUntilSunday = (7 - local.weekday) % 7;
  return local.plus({ days: daysUntilSunday }).toISODate()!;
}

export function offsetDate(date: string, days: number, timezone: string): string {
  validateIanaTimezone(timezone);
  const parsed = DateTime.fromISO(date, { zone: timezone });
  if (!parsed.isValid) throw new AppError('INVALID_INPUT', 'Use a date formatted as YYYY-MM-DD.');
  return parsed.plus({ days }).toISODate()!;
}

export function localWeekday(
  date: Date,
  timezone: string,
): 'SUNDAY' | 'MONDAY' | 'TUESDAY' | 'OTHER' {
  const weekday = DateTime.fromJSDate(date).setZone(timezone).weekday;
  return weekday === 7 ? 'SUNDAY' : weekday === 1 ? 'MONDAY' : weekday === 2 ? 'TUESDAY' : 'OTHER';
}

export function parseFlexibleDate(dateStr: string, timezone: string, now = DateTime.now().setZone(timezone)): string {
  validateIanaTimezone(timezone);
  const cleaned = dateStr.trim();
  const lower = cleaned.toLowerCase();

  if (lower === 'today' || lower === 'tonight') {
    return now.toISODate()!;
  }
  if (lower === 'tomorrow') {
    return now.plus({ days: 1 }).toISODate()!;
  }
  if (lower === 'yesterday') {
    return now.minus({ days: 1 }).toISODate()!;
  }

  const DAY_MAP: Record<string, number> = {
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
    sunday: 7, sun: 7,
  };

  if (DAY_MAP[lower] !== undefined) {
    const targetDay = DAY_MAP[lower]!;
    const currentDay = now.weekday;
    let daysToAdd = (targetDay - currentDay + 7) % 7;
    return now.plus({ days: daysToAdd }).toISODate()!;
  }

  // Check if it's already ISO YYYY-MM-DD
  const iso = DateTime.fromISO(cleaned, { zone: timezone });
  if (iso.isValid && cleaned.length >= 8 && cleaned.includes('-')) {
    return iso.toISODate()!;
  }

  // Common date formats: 10/4, 10/04, 10-4, 10-04, Oct 4, October 4, Oct 4th
  const sanitized = cleaned.replace(/(st|nd|rd|th)/gi, '').trim();
  const formats = [
    'M/d',
    'M-d',
    'MM/dd',
    'MM-dd',
    'yyyy/M/d',
    'yyyy/MM/dd',
    'yyyy-M-d',
    'yyyy-MM-dd',
    'LLL d',
    'LLLL d',
    'LLL dd',
    'LLLL dd',
    'd LLL',
    'd LLLL',
  ];

  for (const fmt of formats) {
    const dt = DateTime.fromFormat(sanitized, fmt, { zone: timezone });
    if (dt.isValid) {
      let withYear = dt;
      if (!fmt.includes('y')) {
        withYear = dt.set({ year: now.year });
        if (withYear < now.minus({ days: 60 })) {
          withYear = withYear.plus({ years: 1 });
        }
      }
      return withYear.toISODate()!;
    }
  }

  throw new AppError(
    'INVALID_INPUT',
    `Could not parse date "${dateStr}". Use a day name (e.g. Sunday, Monday, Tomorrow) or date (e.g. 10/04 or 2026-10-04).`,
  );
}

