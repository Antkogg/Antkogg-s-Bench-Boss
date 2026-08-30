import { AppError } from './errors.js';

export function normalizeIdentity(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

export function cleanDisplayValue(value: string, maxLength: number): string {
  return value
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength);
}

export function parseFlexibleTime(timeStr: string): { hours: number; minutes: number } {
  const cleaned = timeStr.trim().toLowerCase();
  if (!cleaned) throw new AppError('INVALID_INPUT', 'Please enter a start time.');

  const isPm = cleaned.includes('pm');
  const isAm = cleaned.includes('am');
  const numbersOnly = cleaned.replace(/[^0-9:]/g, '');

  let hours = 0;
  let minutes = 0;

  if (numbersOnly.includes(':')) {
    const parts = numbersOnly.split(':');
    hours = parseInt(parts[0] || '0', 10);
    minutes = parseInt(parts[1] || '0', 10);
  } else if (numbersOnly.length === 3 || numbersOnly.length === 4) {
    hours = parseInt(numbersOnly.slice(0, -2), 10);
    minutes = parseInt(numbersOnly.slice(-2), 10);
  } else if (numbersOnly.length === 1 || numbersOnly.length === 2) {
    hours = parseInt(numbersOnly, 10);
    minutes = 0;
  } else {
    throw new AppError(
      'INVALID_INPUT',
      'Please enter a valid time (e.g. 8:30 PM, 3, 4, 4pm, 330, or 20:30).',
    );
  }

  if (isNaN(hours) || isNaN(minutes)) {
    throw new AppError('INVALID_INPUT', 'Failed to parse time digits.');
  }

  if (isPm && hours < 12) hours += 12;
  if (isAm && hours === 12) hours = 0;
  if (!isPm && !isAm && hours >= 1 && hours <= 11) {
    hours += 12;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new AppError('INVALID_INPUT', 'Time hours must be 1-12 AM/PM or 0-23.');
  }

  return { hours, minutes };
}
