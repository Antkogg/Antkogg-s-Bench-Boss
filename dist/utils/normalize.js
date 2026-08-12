export function normalizeIdentity(value) {
    return value.trim().normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}
export function cleanDisplayValue(value, maxLength) {
    return value
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .slice(0, maxLength);
}
//# sourceMappingURL=normalize.js.map