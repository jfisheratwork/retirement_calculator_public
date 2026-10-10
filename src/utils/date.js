/**
 * Date parsing and formatting utility.
 * Standardizes extraction of year, month, and day across the simulation without NaN or timezone anomalies.
 */

/**
 * Parses a date string formatted as YYYY, YYYY-MM, or YYYY-MM-DD into numeric components.
 *
 * @param {string|number} dateStr
 * @param {number} defaultYear
 * @param {number} defaultMonth
 * @returns {{ year: number, month: number, day: number, formattedMonth: string }}
 */
export function parseDateParts(dateStr, defaultYear = 2026, defaultMonth = 1) {
    if (!dateStr) {
        return {
            year: defaultYear,
            month: defaultMonth,
            day: 1,
            formattedMonth: `${defaultYear}-${String(defaultMonth).padStart(2, '0')}`
        };
    }

    const parts = String(dateStr).trim().split('-');
    let parsedYear = parseInt(parts[0], 10);
    if (isNaN(parsedYear)) {
        parsedYear = defaultYear;
    } else if (parsedYear > 0 && parsedYear < 100) {
        parsedYear += 2000;
    }

    if (parsedYear < 1920 || parsedYear > 2100) {
        parsedYear = defaultYear;
    }

    let parsedMonth = parseInt(parts[1], 10);
    if (isNaN(parsedMonth)) {
        parsedMonth = defaultMonth;
    } else {
        parsedMonth = Math.max(1, Math.min(12, parsedMonth));
    }

    let parsedDay = parseInt(parts[2], 10);
    if (isNaN(parsedDay)) {
        parsedDay = 1;
    } else {
        parsedDay = Math.max(1, Math.min(31, parsedDay));
    }

    return {
        year: parsedYear,
        month: parsedMonth,
        day: parsedDay,
        formattedMonth: `${parsedYear}-${String(parsedMonth).padStart(2, '0')}`
    };
}

/**
 * Normalizes a date string to ensure a 4-digit year (YYYY, YYYY-MM, or YYYY-MM-DD).
 * Converts 2-digit years (e.g. "0027" or "27") to 21st-century years (e.g. "2027").
 *
 * @param {string|number} dateStr
 * @param {number} defaultYear
 * @param {number} defaultMonth
 * @returns {string}
 */
export function normalizeDateStr(dateStr, defaultYear = 2026, defaultMonth = 1) {
    if (!dateStr && dateStr !== 0) return '';
    const raw = String(dateStr).trim();
    if (!raw) return '';

    const parts = raw.split('-');
    const parsed = parseDateParts(raw, defaultYear, defaultMonth);
    const yStr = String(parsed.year).padStart(4, '0');

    if (parts.length === 1) {
        return yStr;
    }
    const mStr = String(parsed.month).padStart(2, '0');
    if (parts.length === 2) {
        return `${yStr}-${mStr}`;
    }
    const dStr = String(parsed.day).padStart(2, '0');
    return `${yStr}-${mStr}-${dStr}`;
}
