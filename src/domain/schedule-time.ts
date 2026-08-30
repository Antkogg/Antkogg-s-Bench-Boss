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
