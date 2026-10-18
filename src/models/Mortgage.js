/**
 * Mortgage Model (Enhanced per SPEC-003 & SPEC-058)
 *
 * Supports:
 * - Standard fixed-rate P&I amortization
 * - Accelerated payoff via extra monthly principal (`extraMonthlyPayment`) with payoff clamping
 * - Lump-sum Mortgage Recast re-amortization over remaining loan term (`recast`)
 * - Home downsizing with optional replacement home mortgage financing (`downsizing.financeReplacement`)
 *
 * Written with the assistance of Google Gemini
 */

const MONTHS_PER_YEAR = 12;
const PERCENT_DIVISOR = 100;
const DEFAULT_TERM_YEARS = 30;
const DEFAULT_DOWNSIZE_YEAR = 2034;
const DEFAULT_SELLING_COST_PCT = 6;
const MAX_SELLING_COST_PCT = 20;
const DEFAULT_REPLACEMENT_COST_PCT = 42.5;
const DEFAULT_PROP_COST_REDUCTION_PCT = 25;
const DEFAULT_DOWN_PAYMENT_PCT = 20;
const DEFAULT_REPLACEMENT_RATE_PCT = 5.5;
const MAX_AMORTIZATION_ITERATIONS = 600;

export class Mortgage {
    constructor(state = {}) {
        this.enabled = Boolean(state.enabled);
        this.originationDate = state.originationDate;
        this.originationAmount = Number(state.originationAmount) || 0;
        this.termYears = Number(state.termYears) || DEFAULT_TERM_YEARS;
        this.interestRate = Number(state.interestRate) || 0;
        this.currentBalance = this._resolveInitialBalance(state);

        this.yearlyInsurance = Number(state.yearlyInsurance) || 0;
        this.yearlyTaxes = Number(state.yearlyTaxes) || 0;
        this.yearlyRepairs = Number(state.yearlyRepairs) || 0;

        this.extraMonthlyPayment = Math.max(0, Number(state.extraMonthlyPayment) || 0);
        this.recast = this._initRecastConfig(state.recast);
        this._recastExecuted = false;

        this.downsizing = this._initDownsizingConfig(state.downsizing);
        this.downsized = false;
        this.monthlyPayment = this.calculateMonthlyPayment();
    }

    _resolveInitialBalance(state) {
        if (state.currentBalance !== undefined && state.currentBalance !== null) {
            return Number(state.currentBalance) || 0;
        }
        if (state.currentStartingBalance !== undefined && state.currentStartingBalance !== null) {
            return Number(state.currentStartingBalance) || 0;
        }
        return this.calculateCurrentBalanceFromOrigination(state);
    }

    _initRecastConfig(recast) {
        return {
            enabled: Boolean(recast?.enabled),
            date: recast?.date || `${new Date().getFullYear() + 2}-06`,
            amount: Math.max(0, Number(recast?.amount) || 0),
            fundingSource: recast?.fundingSource || 'taxableBrokerage'
        };
    }

    _initDownsizingConfig(downsizing) {
        if (!downsizing) {
            return {
                enabled: false,
                year: DEFAULT_DOWNSIZE_YEAR,
                sellingCostPercentage: DEFAULT_SELLING_COST_PCT,
                replacementHomeCostPercentage: DEFAULT_REPLACEMENT_COST_PCT,
                propertyCostReductionPercentage: DEFAULT_PROP_COST_REDUCTION_PCT,
                financeReplacement: false,
                downPaymentPercentage: DEFAULT_DOWN_PAYMENT_PCT,
                replacementInterestRate: DEFAULT_REPLACEMENT_RATE_PCT,
                replacementTermYears: DEFAULT_TERM_YEARS
            };
        }
        return {
            enabled: Boolean(downsizing.enabled),
            year: Number(downsizing.year || DEFAULT_DOWNSIZE_YEAR),
            sellingCostPercentage: Number(downsizing.sellingCostPercentage ?? DEFAULT_SELLING_COST_PCT),
            replacementHomeCostPercentage: Number(
                downsizing.replacementHomeCostPercentage ?? DEFAULT_REPLACEMENT_COST_PCT
            ),
            propertyCostReductionPercentage: Number(
                downsizing.propertyCostReductionPercentage ?? DEFAULT_PROP_COST_REDUCTION_PCT
            ),
            financeReplacement: Boolean(downsizing.financeReplacement),
            downPaymentPercentage: Number(downsizing.downPaymentPercentage ?? DEFAULT_DOWN_PAYMENT_PCT),
            replacementInterestRate: Number(downsizing.replacementInterestRate ?? DEFAULT_REPLACEMENT_RATE_PCT),
            replacementTermYears: Number(downsizing.replacementTermYears || DEFAULT_TERM_YEARS)
        };
    }

    static calculateAmortizedPayment(principal, monthlyRate, totalMonths) {
        const P = Number(principal) || 0;
        const n = Math.max(1, Number(totalMonths) || 1);
        if (P <= 0) return 0;
        if (!monthlyRate || monthlyRate <= 0) return P / n;
        const factor = Math.pow(1 + monthlyRate, n);
        return (P * (monthlyRate * factor)) / (factor - 1);
    }

    static parseYearMonth(dateStr, fallbackYear, fallbackMonth = 1) {
        if (!dateStr) return { year: fallbackYear, month: fallbackMonth };
        const parts = String(dateStr).split('-');
        const year = parseInt(parts[0], 10) || fallbackYear;
        const month = parseInt(parts[1], 10) || fallbackMonth;
        return { year, month };
    }

    calculateCurrentBalanceFromOrigination(state) {
        if (!state.enabled || !state.originationDate || !state.originationAmount) return 0;
        const now = new Date();
        const { year: origYear, month: origMonth } = Mortgage.parseYearMonth(
            state.originationDate,
            now.getFullYear(),
            1
        );
        const monthsPassed = (now.getFullYear() - origYear) * MONTHS_PER_YEAR + (now.getMonth() + 1 - origMonth);
        const totalMonths = (Number(state.termYears) || DEFAULT_TERM_YEARS) * MONTHS_PER_YEAR;
        const rate = (Number(state.interestRate) || 0) / PERCENT_DIVISOR / MONTHS_PER_YEAR;
        const P = Number(state.originationAmount) || 0;
        const payment = Mortgage.calculateAmortizedPayment(P, rate, totalMonths);

        let balance = P;
        for (let i = 0; i < monthsPassed; i++) {
            if (balance <= 0) break;
            const interest = balance * rate;
            balance -= payment - interest;
        }
        return Math.max(0, balance);
    }

    calculateMonthlyPayment() {
        if (!this.enabled || this.currentBalance <= 0) return 0;
        const totalMonths = this.termYears * MONTHS_PER_YEAR;
        const rate = this.interestRate / PERCENT_DIVISOR / MONTHS_PER_YEAR;
        const P = this.originationAmount || this.currentBalance;
        return Mortgage.calculateAmortizedPayment(P, rate, totalMonths);
    }

    getRemainingMonthsAtDate(targetYear, targetMonth = 1) {
        const defaultOrigYear = new Date().getFullYear() - 3;
        const { year: origYear, month: origMonth } = Mortgage.parseYearMonth(this.originationDate, defaultOrigYear, 1);
        const elapsedMonths = Math.max(0, (targetYear - origYear) * MONTHS_PER_YEAR + (targetMonth - origMonth));
        const totalMonths = this.termYears * MONTHS_PER_YEAR;
        return Math.max(1, totalMonths - elapsedMonths);
    }

    /**
     * Executes a lump-sum mortgage recast (re-amortization over remaining loan term).
     */
    executeRecast(lumpSumAmount, year, month = 1) {
        if (!this.enabled || this.currentBalance <= 0) return null;
        const amountApplied = Math.min(this.currentBalance, Math.max(0, Number(lumpSumAmount) || 0));
        if (amountApplied <= 0) return null;

        const previousPayment = this.monthlyPayment;
        this.currentBalance = Math.max(0, this.currentBalance - amountApplied);
        const remainingMonths = this.getRemainingMonthsAtDate(year, month);
        const monthlyRate = this.interestRate / PERCENT_DIVISOR / MONTHS_PER_YEAR;

        this.monthlyPayment =
            this.currentBalance > 0
                ? Mortgage.calculateAmortizedPayment(this.currentBalance, monthlyRate, remainingMonths)
                : 0;
        this._recastExecuted = true;

        return {
            previousPayment,
            newPayment: this.monthlyPayment,
            paymentReduction: Math.max(0, previousPayment - this.monthlyPayment),
            amountApplied,
            remainingMonths
        };
    }

    /**
     * Non-mutating preview of a mortgage recast for UI live display.
     */
    calculateRecastPreview(recastAmount = this.recast?.amount, recastDateStr = this.recast?.date) {
        const currentPayment = this.calculateMonthlyPayment();
        if (!this.enabled || this.currentBalance <= 0) {
            return { currentPayment: 0, newPayment: 0, monthlySavings: 0, remainingMonths: 0, effectiveLumpSum: 0 };
        }
        const nowYear = new Date().getFullYear();
        const { year: recastYear, month: recastMonth } = Mortgage.parseYearMonth(recastDateStr, nowYear + 2, 6);
        const remainingMonths = this.getRemainingMonthsAtDate(recastYear, recastMonth);
        const effectiveLumpSum = Math.min(this.currentBalance, Math.max(0, Number(recastAmount) || 0));
        const newBalance = Math.max(0, this.currentBalance - effectiveLumpSum);
        const monthlyRate = this.interestRate / PERCENT_DIVISOR / MONTHS_PER_YEAR;
        const newPayment =
            newBalance > 0 ? Mortgage.calculateAmortizedPayment(newBalance, monthlyRate, remainingMonths) : 0;

        return {
            currentPayment: Math.round(currentPayment),
            newPayment: Math.round(newPayment),
            monthlySavings: Math.max(0, Math.round(currentPayment - newPayment)),
            remainingMonths,
            effectiveLumpSum: Math.round(effectiveLumpSum)
        };
    }

    static _simulateSchedule(startBalance, monthlyRate, basePayment, extraMonthly) {
        let bal = startBalance;
        let months = 0;
        let totalInterest = 0;

        while (bal > 0.01 && months < MAX_AMORTIZATION_ITERATIONS) {
            const interest = bal * monthlyRate;
            const schedPrincipal = Math.max(0, basePayment - interest);
            const intendedPrincipal = schedPrincipal + extraMonthly;
            if (intendedPrincipal <= 0) break;

            const actualPrincipal = Math.min(bal, intendedPrincipal);
            totalInterest += interest;
            bal -= actualPrincipal;
            months++;
        }
        return { months, totalInterest };
    }

    /**
     * Compares baseline amortization against accelerated amortization (`extraMonthlyPayment`).
     */
    calculatePayoffComparison(extraMonthly = this.extraMonthlyPayment) {
        const extra = Math.max(0, Number(extraMonthly) || 0);
        if (!this.enabled || this.currentBalance <= 0 || this.monthlyPayment <= 0) {
            return {
                baselineMonths: 0,
                acceleratedMonths: 0,
                monthsSaved: 0,
                yearsSaved: 0,
                remainingMonthsEarned: 0,
                baselineInterest: 0,
                acceleratedInterest: 0,
                interestSaved: 0
            };
        }

        const monthlyRate = this.interestRate / PERCENT_DIVISOR / MONTHS_PER_YEAR;
        const base = Mortgage._simulateSchedule(this.currentBalance, monthlyRate, this.monthlyPayment, 0);
        const accel = Mortgage._simulateSchedule(this.currentBalance, monthlyRate, this.monthlyPayment, extra);
        const monthsSaved = Math.max(0, base.months - accel.months);

        return {
            baselineMonths: base.months,
            acceleratedMonths: accel.months,
            monthsSaved,
            yearsSaved: Math.floor(monthsSaved / MONTHS_PER_YEAR),
            remainingMonthsEarned: monthsSaved % MONTHS_PER_YEAR,
            baselineInterest: Math.round(base.totalInterest),
            acceleratedInterest: Math.round(accel.totalInterest),
            interestSaved: Math.max(0, Math.round(base.totalInterest - accel.totalInterest))
        };
    }

    getAnnualFixedCosts(inflationMultiplier, partialYearMultiplier = 1) {
        if (!this.enabled) return 0;
        return (
            (this.yearlyInsurance + this.yearlyTaxes + this.yearlyRepairs) * inflationMultiplier * partialYearMultiplier
        );
    }

    getAnnualMortgagePayment(partialYearMultiplier = 1) {
        if (!this.enabled || this.currentBalance <= 0) return 0;
        return (this.monthlyPayment + this.extraMonthlyPayment) * MONTHS_PER_YEAR * partialYearMultiplier;
    }

    _shouldTriggerRecastInMonth(year, month) {
        if (!this.recast?.enabled || this._recastExecuted || !year || !month) return false;
        if (Number(this.recast.amount) <= 0 || this.currentBalance <= 0) return false;
        const { year: targetYear, month: targetMonth } = Mortgage.parseYearMonth(this.recast.date, year, 6);
        return year === targetYear && month === targetMonth;
    }

    amortizeMonth(year = null, month = null, onRecastLumpSum = null) {
        let recastResult = null;
        if (this._shouldTriggerRecastInMonth(year, month)) {
            const effectiveLump = Math.min(this.currentBalance, Math.max(0, Number(this.recast.amount) || 0));
            if (typeof onRecastLumpSum === 'function' && effectiveLump > 0) {
                onRecastLumpSum(effectiveLump, this.recast.fundingSource || 'taxableBrokerage');
            }
            recastResult = this.executeRecast(effectiveLump, year, month);
        }

        if (!this.enabled || this.currentBalance <= 0) {
            return { payment: 0, interest: 0, principal: 0, paidOffThisMonth: false, recastResult };
        }

        const rate = this.interestRate / PERCENT_DIVISOR / MONTHS_PER_YEAR;
        const interest = this.currentBalance * rate;
        const scheduledPrincipal = Math.max(0, this.monthlyPayment - interest);
        const intendedPrincipal = scheduledPrincipal + this.extraMonthlyPayment;

        if (this.currentBalance <= intendedPrincipal) {
            const actualPrincipal = this.currentBalance;
            const actualPayment = interest + actualPrincipal;
            this.currentBalance = 0;
            return {
                payment: actualPayment,
                interest,
                principal: actualPrincipal,
                paidOffThisMonth: true,
                recastResult
            };
        }

        this.currentBalance = Math.max(0, this.currentBalance - intendedPrincipal);
        return {
            payment: interest + intendedPrincipal,
            interest,
            principal: intendedPrincipal,
            paidOffThisMonth: false,
            recastResult
        };
    }

    amortize(months, options = {}) {
        if (!this.enabled || this.currentBalance <= 0) {
            return { totalPayment: 0, totalInterest: 0, totalPrincipal: 0, paidOffMonth: null, recastEvents: [] };
        }

        const year = options.year ?? null;
        const firstActiveMonth = options.firstActiveMonth ?? 1;
        const onRecastLumpSum = options.onRecastLumpSum ?? null;

        let totalPayment = 0;
        let totalInterest = 0;
        let totalPrincipal = 0;
        let paidOffMonth = null;
        const recastEvents = [];

        for (let i = 0; i < months; i++) {
            const month = firstActiveMonth + i;
            if (this.currentBalance <= 0 && !this._shouldTriggerRecastInMonth(year, month)) break;

            const step = this.amortizeMonth(year, month, onRecastLumpSum);
            totalPayment += step.payment;
            totalInterest += step.interest;
            totalPrincipal += step.principal;
            if (step.paidOffThisMonth && paidOffMonth === null) {
                paidOffMonth = month;
            }
            if (step.recastResult) {
                recastEvents.push({ year, month, ...step.recastResult });
            }
        }

        this.currentBalance = Math.max(0, this.currentBalance);
        return { totalPayment, totalInterest, totalPrincipal, paidOffMonth, recastEvents };
    }

    _applyReplacementFinancing(replacementCost, totalEquity) {
        const downPct = Math.min(
            PERCENT_DIVISOR,
            Math.max(0, Number(this.downsizing.downPaymentPercentage ?? DEFAULT_DOWN_PAYMENT_PCT))
        );
        const requiredDownPayment = replacementCost * (downPct / PERCENT_DIVISOR);
        const newLoanBalance = Math.max(0, replacementCost - requiredDownPayment);
        const netCashProceeds = Math.max(0, totalEquity - requiredDownPayment);
        const cashDeficit = Math.max(0, requiredDownPayment - totalEquity);

        this.originationAmount = newLoanBalance;
        this.currentBalance = newLoanBalance;
        this.interestRate = Number(this.downsizing.replacementInterestRate ?? this.interestRate);
        this.termYears = Number(this.downsizing.replacementTermYears || DEFAULT_TERM_YEARS);
        this.enabled = newLoanBalance > 0;
        this.monthlyPayment = this.calculateMonthlyPayment();

        return { netCashProceeds, cashDeficit, newLoanBalance };
    }

    _resolveClosingCostRate(closingCostRate) {
        if (closingCostRate !== undefined && closingCostRate !== null) {
            return Math.max(0, Number(closingCostRate) || 0);
        }
        const rawPct = Number(this.downsizing?.sellingCostPercentage ?? DEFAULT_SELLING_COST_PCT);
        const clampedPct = Math.min(MAX_SELLING_COST_PCT, Math.max(0, rawPct));
        return clampedPct / PERCENT_DIVISOR;
    }

    _projectMortgageAtYear(startYear, targetYear) {
        const simMort = new Mortgage({
            enabled: this.enabled,
            originationDate: this.originationDate,
            originationAmount: this.originationAmount,
            termYears: this.termYears,
            interestRate: this.interestRate,
            currentBalance: this.currentBalance,
            extraMonthlyPayment: this.extraMonthlyPayment,
            recast: this.recast
        });
        const yearsElapsed = Math.max(0, targetYear - startYear);
        for (let y = 0; y < yearsElapsed; y++) {
            simMort.amortize(MONTHS_PER_YEAR, { year: startYear + y });
        }
        const payoff = simMort.enabled ? Math.round(simMort.currentBalance) : 0;
        const oldMonthlyPayment =
            simMort.enabled && simMort.currentBalance > 0
                ? Math.round(simMort.monthlyPayment + simMort.extraMonthlyPayment)
                : 0;
        return { payoff, oldMonthlyPayment, yearsElapsed };
    }

    _computePreviewFinancing(d, replacementHomeValue, totalEquity) {
        if (!d.financeReplacement) {
            return {
                downPaymentPct: PERCENT_DIVISOR,
                downPaymentAmount: replacementHomeValue,
                newLoanBalance: 0,
                netCashProceeds: Math.max(0, totalEquity - replacementHomeValue),
                cashDeficit: Math.max(0, replacementHomeValue - totalEquity),
                newMonthlyPayment: 0
            };
        }
        const downPaymentPct = Math.min(
            PERCENT_DIVISOR,
            Math.max(0, Number(d.downPaymentPercentage ?? DEFAULT_DOWN_PAYMENT_PCT))
        );
        const downPaymentAmount = Math.round(replacementHomeValue * (downPaymentPct / PERCENT_DIVISOR));
        const newLoanBalance = Math.max(0, replacementHomeValue - downPaymentAmount);
        const netCashProceeds = Math.max(0, totalEquity - downPaymentAmount);
        const cashDeficit = Math.max(0, downPaymentAmount - totalEquity);
        const newRate =
            Number(d.replacementInterestRate ?? DEFAULT_REPLACEMENT_RATE_PCT) / PERCENT_DIVISOR / MONTHS_PER_YEAR;
        const newTermMonths = (Number(d.replacementTermYears) || DEFAULT_TERM_YEARS) * MONTHS_PER_YEAR;
        const newMonthlyPayment =
            newLoanBalance > 0
                ? Math.round(Mortgage.calculateAmortizedPayment(newLoanBalance, newRate, newTermMonths))
                : 0;
        return {
            downPaymentPct,
            downPaymentAmount,
            newLoanBalance,
            netCashProceeds,
            cashDeficit,
            newMonthlyPayment
        };
    }

    /**
     * Non-mutating closing-table preview of future home downsizing for live UI display (SPEC-078).
     */
    calculateDownsizingPreview(options = {}) {
        const d = this.downsizing || this._initDownsizingConfig();
        const startYear = Number(options.startYear) || new Date().getFullYear();
        const targetYear = Number(d.year) || DEFAULT_DOWNSIZE_YEAR;
        const { payoff, oldMonthlyPayment, yearsElapsed } = this._projectMortgageAtYear(startYear, targetYear);

        const growthRate = Number(options.annualGrowthRate ?? 3) / PERCENT_DIVISOR;
        const inflationRate = Number(options.inflationRate ?? 3) / PERCENT_DIVISOR;
        const grossSale = Math.round((Number(options.currentHomeValue) || 0) * Math.pow(1 + growthRate, yearsElapsed));
        const effectiveRate = this._resolveClosingCostRate(null);
        const sellingCostPct = Math.round(effectiveRate * PERCENT_DIVISOR * 10) / 10;
        const closingCosts = Math.round(grossSale * effectiveRate);
        const totalEquity = Math.max(0, grossSale - closingCosts - payoff);

        const replacementCostPct = Number(d.replacementHomeCostPercentage ?? DEFAULT_REPLACEMENT_COST_PCT);
        const replacementHomeValue = Math.round(grossSale * (replacementCostPct / PERCENT_DIVISOR));
        const inflationFactor = Math.pow(1 + inflationRate, yearsElapsed);
        const replacementHomeValueReal =
            inflationFactor > 0 ? Math.round(replacementHomeValue / inflationFactor) : replacementHomeValue;

        const fin = this._computePreviewFinancing(d, replacementHomeValue, totalEquity);

        return {
            targetYear,
            yearsElapsed,
            grossSale,
            sellingCostPct,
            closingCosts,
            mortgagePayoff: payoff,
            totalEquity,
            replacementCostPct,
            replacementHomeValue,
            replacementHomeValueReal,
            financeReplacement: Boolean(d.financeReplacement),
            ...fin,
            oldMonthlyPayment,
            monthlyPaymentSavings: Math.max(0, oldMonthlyPayment - fin.newMonthlyPayment),
            propertyCostReductionPct: Number(d.propertyCostReductionPercentage ?? DEFAULT_PROP_COST_REDUCTION_PCT)
        };
    }

    executeDownsizing(currentHomeValue, closingCostRate = null) {
        if (!this.downsizing?.enabled || this.downsized) return null;
        const effectiveClosingCostRate = this._resolveClosingCostRate(closingCostRate);
        const grossSale = Number(currentHomeValue) || 0;
        const closingCosts = grossSale * effectiveClosingCostRate;
        const mortgagePayoff = this.currentBalance || 0;
        const totalEquity = Math.max(0, grossSale - closingCosts - mortgagePayoff);
        const replacementCost =
            grossSale *
            ((this.downsizing.replacementHomeCostPercentage || DEFAULT_REPLACEMENT_COST_PCT) / PERCENT_DIVISOR);

        let netCashProceeds = 0;
        let cashDeficit = 0;
        let replacementLoanBalance = 0;

        if (this.downsizing.financeReplacement) {
            const financed = this._applyReplacementFinancing(replacementCost, totalEquity);
            netCashProceeds = financed.netCashProceeds;
            cashDeficit = financed.cashDeficit;
            replacementLoanBalance = financed.newLoanBalance;
        } else {
            netCashProceeds = Math.max(0, totalEquity - replacementCost);
            cashDeficit = Math.max(0, replacementCost - totalEquity);
            this.currentBalance = 0;
            this.enabled = false;
            this.monthlyPayment = 0;
        }

        this.downsized = true;
        const costReductionFactor =
            1 - (this.downsizing.propertyCostReductionPercentage || DEFAULT_PROP_COST_REDUCTION_PCT) / PERCENT_DIVISOR;
        this.yearlyInsurance *= costReductionFactor;
        this.yearlyTaxes *= costReductionFactor;
        this.yearlyRepairs *= costReductionFactor;

        return {
            grossSale,
            closingCosts,
            mortgagePayoff,
            replacementHomeValue: replacementCost,
            replacementLoanBalance,
            netCashProceeds,
            cashDeficit
        };
    }
}
