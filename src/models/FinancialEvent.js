/**
 * FinancialEvent.js
 *
 * Formal domain models and event representations for intra-year financial lifecycle
 * operations (Rollovers, Roth Conversion schedules, CD reinvestments).
 */

import { parseDateParts } from '../utils/date.js';

function _parseEventDate(state, defaultYear, defaultMonth) {
    const dateStr = state.startDate || state.date;
    if (dateStr && typeof dateStr === 'string') {
        return parseDateParts(dateStr, defaultYear, defaultMonth);
    }
    let yr = Number(state.year);
    if (yr > 0 && yr < 100) yr += 2000;
    const year = yr || defaultYear;
    const month = Math.max(1, Math.min(12, Number(state.month) || defaultMonth));
    return { year, month };
}

export class RolloverEvent {
    constructor(state = {}) {
        this.enabled = Boolean(state.enabled);
        this.sourceAccount = state.sourceAccount || 'traditional401k';
        this.targetAccount = state.targetAccount || 'standardIra';

        const defaultYear = new Date().getFullYear() + 5;
        const { year, month } = _parseEventDate(state, defaultYear, 1);

        this.year = year;
        this.month = month;
        this.isFullBalance = state.isFullBalance !== false;
        this.amount = Number(state.amount) || 0;
    }

    get startDate() {
        const paddedMonth = String(this.month).padStart(2, '0');
        return `${this.year}-${paddedMonth}`;
    }

    get date() {
        return this.startDate;
    }

    occursIn(year, month) {
        return this.enabled && this.year === Number(year) && this.month === Number(month);
    }

    occursInYear(year) {
        return this.enabled && this.year === Number(year);
    }
}

export class RothConversionSchedule {
    constructor(state = {}) {
        this.enabled = Boolean(state.enabled);
        this.sourceAccount = state.sourceAccount || 'standardIra';
        this.amountPerYear = Number(state.amountPerYear) || 0;
        this.durationYears = Number(state.durationYears) || 5;

        const currentYear = new Date().getFullYear();
        if (state.startDate || state.date) {
            const { year, month } = _parseEventDate(state, currentYear + 1, 12);
            this.startYear = year;
            this.startMonth = month;
            this.startDelayYears = Math.max(0, this.startYear - currentYear);
        } else {
            this.startDelayYears = Number(state.startDelayYears) || 0;
            this.startMonth = Math.max(1, Math.min(12, Number(state.startMonth) || 12));
            if (state.startYear !== undefined && state.startYear !== null) {
                let yr = Number(state.startYear);
                if (yr > 0 && yr < 100) yr += 2000;
                this.startYear = yr;
            } else {
                this.startYear = currentYear + this.startDelayYears;
            }
        }
    }

    get startDate() {
        const paddedMonth = String(this.startMonth).padStart(2, '0');
        return `${this.startYear}-${paddedMonth}`;
    }

    get date() {
        return this.startDate;
    }

    isActiveInYear(year, currentYear) {
        if (!this.enabled || this.amountPerYear <= 0) return false;
        if (this.startYear !== undefined && this.startYear !== null) {
            return Number(year) >= this.startYear && Number(year) < this.startYear + this.durationYears;
        }
        const yearsFromStart = Number(year) - Number(currentYear);
        return yearsFromStart >= this.startDelayYears && yearsFromStart < this.startDelayYears + this.durationYears;
    }

    occursIn(year, month, currentYear) {
        return this.isActiveInYear(year, currentYear) && Number(month) === this.startMonth;
    }
}
