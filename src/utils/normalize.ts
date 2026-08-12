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
