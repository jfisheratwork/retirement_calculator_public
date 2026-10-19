import { calculateTax } from './tax.js';
import { calculateSorrRate } from './PortfolioManager.js';

const EARLY_WITHDRAWAL_PENALTY_RATE = 0.1;
const MONTHS_PER_YEAR = 12;
const MAX_GROSS_UP_PASSES = 3;
const DEFAULT_RETURN_RATE_PCT = 7;

function createZeroTaxDetails(snapshot, filingStatus, earlyPenalty = 0, currentTaxYearData = null) {
    const existing = snapshot.taxDetails || {};
    const zeroCalc = calculateTax(0, 0, currentTaxYearData, filingStatus, 0);
    return {
        ...zeroCalc,
        federalTax: 0,
        fedTax: 0,
        stateTax: 0,
        totalTax: earlyPenalty,
        earlyWithdrawalPenalty: earlyPenalty,
        effectiveRate: 0,
        topBracketRate: 0,
        topBracket: 0,
        remainingRoomInBracket: zeroCalc.standardDeduction || 0,
        bracketRoom: zeroCalc.standardDeduction || 0,
        prevBracketCeiling: 0,
        dropBracketDelta: 0,
        w2Tax: 0,
        nonW2Tax: earlyPenalty,
        capitalGainsTax: 0,
        ltcgTax: 0,
        niitTax: 0,
        ficaTax: existing.ficaTax || 0,
        magi: existing.magi ?? 0,
        taxableSsn: existing.taxableSsn ?? 0,
        hsaDeduction: existing.hsaDeduction ?? 0,
        s1HsaDeduction: existing.s1HsaDeduction ?? 0,
        s2HsaDeduction: existing.s2HsaDeduction ?? 0,
        filingStatus
    };
}

function getEarlyWithdrawalPenalty(snapshot) {
    const penalizedPreTax = Number(snapshot.income?.drawdowns?.penalizedPreTax) || 0;
    return penalizedPreTax * EARLY_WITHDRAWAL_PENALTY_RATE;
}

function getW2TaxableBase(snapshot) {
    const s1 = snapshot.income?.s1 || {};
    const s2 = snapshot.income?.s2 || {};
    if (s1.w2TaxableGross !== undefined && s2.w2TaxableGross !== undefined) {
        return s1.w2TaxableGross + s2.w2TaxableGross;
    }
    return (s1.w2Net || 0) + (s2.w2Net || 0);
}

function copyCarryoverTaxFields(taxResults, existing) {
    taxResults.ficaTax = existing.ficaTax || 0;
    taxResults.s1Fica = existing.s1Fica || null;
    taxResults.s2Fica = existing.s2Fica || null;
    taxResults.s1W2Tax = existing.s1W2Tax || 0;
    taxResults.s2W2Tax = existing.s2W2Tax || 0;
    taxResults.totalW2Tax = existing.totalW2Tax || 0;
    taxResults.magi = existing.magi ?? 0;
    taxResults.taxableSsn = existing.taxableSsn ?? 0;
    taxResults.hsaDeduction = existing.hsaDeduction ?? 0;
    taxResults.s1HsaDeduction = existing.s1HsaDeduction ?? 0;
    taxResults.s2HsaDeduction = existing.s2HsaDeduction ?? 0;
}

function populateTaxResults(taxResults, { prorata, calculatedTax, w2Tax, earlyPenalty, snapshot, filingStatus }) {
    taxResults.federalTax = (taxResults.federalTax || 0) * prorata;
    taxResults.stateTax = (taxResults.stateTax || 0) * prorata;
    taxResults.capitalGainsTax = (taxResults.capitalGainsTax || 0) * prorata;
    taxResults.niitTax = (taxResults.niitTax || 0) * prorata;
    taxResults.earlyWithdrawalPenalty = earlyPenalty;
    taxResults.totalTax = calculatedTax;
    taxResults.w2Tax = w2Tax;
    taxResults.nonW2Tax = Math.max(0, calculatedTax - w2Tax);
    copyCarryoverTaxFields(taxResults, snapshot.taxDetails || {});
    taxResults.filingStatus = filingStatus;
    taxResults.topBracketRate = taxResults.topBracketRate || 0;
    taxResults.topBracket = taxResults.topBracketRate;
    taxResults.bracketRoom = taxResults.remainingRoomInBracket || 0;
    taxResults.fedTax = taxResults.federalTax;
    taxResults.ltcgTax = taxResults.capitalGainsTax;
}

function depositIntoAccount(account, amount, rate) {
    const growth = amount * rate;
    account.balance += amount + growth;
    account.yearContributions += amount;
    account.yearInterest = (account.yearInterest || 0) + growth;
    account.yearGrowth = (account.yearGrowth || 0) + growth;
    if (account.costBasis !== undefined) {
        account.costBasis += amount;
    }
}

function applyGrossUpTaxUpdate(snapshot, taxResults, updatedResults, { updatedPenalty, updatedTotalTax, prorata }) {
    snapshot.taxes = updatedTotalTax;
    snapshot.earlyWithdrawalPenalty = updatedPenalty;
    taxResults.earlyWithdrawalPenalty = updatedPenalty;
    taxResults.totalTax = updatedTotalTax;
    taxResults.nonW2Tax = Math.max(0, updatedTotalTax - (taxResults.w2Tax || 0));
    taxResults.federalTax = (updatedResults.federalTax || 0) * prorata;
    taxResults.stateTax = (updatedResults.stateTax || 0) * prorata;
    taxResults.capitalGainsTax = (updatedResults.capitalGainsTax || 0) * prorata;
    taxResults.niitTax = (updatedResults.niitTax || 0) * prorata;
    taxResults.fedTax = taxResults.federalTax;
    taxResults.ltcgTax = taxResults.capitalGainsTax;
    taxResults.effectiveRate = updatedResults.effectiveRate || 0;
    taxResults.topBracketRate = updatedResults.topBracketRate || 0;
    taxResults.topBracket = taxResults.topBracketRate;
    taxResults.remainingRoomInBracket = updatedResults.remainingRoomInBracket || 0;
    taxResults.bracketRoom = taxResults.remainingRoomInBracket;
    taxResults.prevBracketCeiling = updatedResults.prevBracketCeiling || 0;
    taxResults.dropBracketDelta = updatedResults.dropBracketDelta || 0;
    taxResults.grossTaxableIncome = updatedResults.grossTaxableIncome || 0;
    taxResults.agi = updatedResults.agi || 0;
    taxResults.realizedLtcg = updatedResults.realizedLtcg || 0;
    taxResults.remainingLtcgZeroRoom = updatedResults.remainingLtcgZeroRoom || 0;
}

/**
 * Handles tax computations, tax payments from surplus/cushion/portfolio, and surplus reinvestment
 */
export class TaxManager {
    static _payTaxFromSurplusAndCushion(remainingTax, snapshot, cashCushion) {
        let unpaid = remainingTax;
        if (snapshot.surplus > 0 && unpaid > 0) {
            const payFromSurplus = Math.min(snapshot.surplus, unpaid);
            snapshot.surplus -= payFromSurplus;
            unpaid -= payFromSurplus;
        }

        if (unpaid > 0 && cashCushion?.value > 0) {
            const payFromCushion = Math.min(cashCushion.value, unpaid);
            cashCushion.value -= payFromCushion;
            unpaid -= payFromCushion;
            if (snapshot.income?.drawdowns) {
                snapshot.income.drawdowns.cashCushion += payFromCushion;
            }
        }
        return unpaid;
    }

    static _executeIterativeTaxGrossUp(remainingTax, ctx) {
        const {
            withdrawPortfoliosFn,
            getTaxableIncomeFn,
            taxableIncome,
            annualization,
            prorata,
            stateTaxRate,
            currentTaxYearData,
            filingStatus,
            ltcgGains,
            snapshot,
            taxResults
        } = ctx;

        let unpaid = remainingTax;
        let pass = 0;

        while (unpaid > 0 && pass < MAX_GROSS_UP_PASSES) {
            pass += 1;
            const prevTaxable = typeof getTaxableIncomeFn === 'function' ? getTaxableIncomeFn() : taxableIncome;
            const unfunded = withdrawPortfoliosFn(unpaid);
            if (unfunded > 0) {
                snapshot.unfundedShortfall = (snapshot.unfundedShortfall || 0) + unfunded;
                break;
            }

            const newTaxable = typeof getTaxableIncomeFn === 'function' ? getTaxableIncomeFn() : prevTaxable;
            const addedTaxable = Math.max(0, newTaxable - prevTaxable);
            if (addedTaxable <= 0) break;

            const updatedResults = calculateTax(
                newTaxable * annualization,
                stateTaxRate,
                currentTaxYearData,
                filingStatus,
                ltcgGains * annualization
            );
            const updatedPenalty = getEarlyWithdrawalPenalty(snapshot);
            const updatedTotalTax = updatedResults.totalTax * prorata + updatedPenalty;
            const extraTax = Math.max(0, updatedTotalTax - snapshot.taxes);
            if (extraTax <= 1) break;

            applyGrossUpTaxUpdate(snapshot, taxResults, updatedResults, {
                updatedPenalty,
                updatedTotalTax,
                prorata
            });
            unpaid = extraTax;
        }
    }

    static calculate({
        year,
        currentYear,
        firstActiveMonth = 1,
        taxableIncome,
        stateTaxRate,
        taxTables,
        snapshot,
        cashCushion,
        withdrawPortfoliosFn,
        filingStatus = 'mfj',
        ltcgGains = 0,
        getTaxableIncomeFn
    }) {
        const yearsFromStart = year - currentYear;
        const currentTaxYearData = taxTables?.[yearsFromStart] || taxTables?.[taxTables.length - 1] || null;
        const initialPenalty = getEarlyWithdrawalPenalty(snapshot);
        if (taxableIncome <= 0 && ltcgGains <= 0 && initialPenalty <= 0) {
            snapshot.taxes = 0;
            snapshot.earlyWithdrawalPenalty = 0;
            snapshot.taxDetails = createZeroTaxDetails(snapshot, filingStatus, 0, currentTaxYearData);
            return;
        }
        const activeMonths =
            year === currentYear ? Math.max(1, MONTHS_PER_YEAR - firstActiveMonth + 1) : MONTHS_PER_YEAR;
        const annualization = activeMonths < MONTHS_PER_YEAR ? MONTHS_PER_YEAR / activeMonths : 1;
        const prorata = activeMonths < MONTHS_PER_YEAR ? activeMonths / MONTHS_PER_YEAR : 1;

        const w2Taxable = getW2TaxableBase(snapshot);
        const w2TaxResults = calculateTax(w2Taxable * annualization, stateTaxRate, currentTaxYearData, filingStatus, 0);

        const taxResults = calculateTax(
            taxableIncome * annualization,
            stateTaxRate,
            currentTaxYearData,
            filingStatus,
            ltcgGains * annualization
        );
        const calculatedTax = taxResults.totalTax * prorata + initialPenalty;
        const w2Tax = w2TaxResults.totalTax * prorata;

        snapshot.taxes = calculatedTax;
        snapshot.earlyWithdrawalPenalty = initialPenalty;
        populateTaxResults(taxResults, {
            prorata,
            calculatedTax,
            w2Tax,
            earlyPenalty: initialPenalty,
            snapshot,
            filingStatus
        });
        snapshot.taxDetails = taxResults;

        const remainingTax = this._payTaxFromSurplusAndCushion(calculatedTax, snapshot, cashCushion);
        if (remainingTax > 0 && withdrawPortfoliosFn) {
            this._executeIterativeTaxGrossUp(remainingTax, {
                withdrawPortfoliosFn,
                getTaxableIncomeFn,
                taxableIncome,
                annualization,
                prorata,
                stateTaxRate,
                currentTaxYearData,
                filingStatus,
                ltcgGains,
                snapshot,
                taxResults
            });
        }
    }

    static _resolveAccountReturnRate(acc, isSorrActive, sorrRate, assumptions, strategies) {
        if (isSorrActive && !['cd', 'hysa'].includes(acc.type)) {
            return sorrRate;
        }
        if (acc.expectedReturn !== undefined && acc.expectedReturn !== null) {
            return Number(acc.expectedReturn) / 100;
        }
        const fallbackRate =
            assumptions?.generalReturnRate ??
            assumptions?.portfolioReturnRate ??
            strategies?.generalReturnRate ??
            DEFAULT_RETURN_RATE_PCT;
        return Number(fallbackRate) / 100;
    }

    static reinvestSurplus({ snapshot, strategies, assumptions, sorrOverride, year, cashCushion, s1, s2 }) {
        const surplus = snapshot.surplus || 0;
        if (surplus <= 0) return;

        const allAccounts = [...(s1.accounts || []), ...(s2.accounts || [])];
        const sweepAccount = allAccounts.find((a) => a.isSweepAccount === true && a.enabled !== false);
        const { isSorrActive, sorrRate } = calculateSorrRate({ year, s1, assumptions, sorrOverride });
        const getRate = (acc) => this._resolveAccountReturnRate(acc, isSorrActive, sorrRate, assumptions, strategies);

        if (sweepAccount) {
            depositIntoAccount(sweepAccount, surplus, getRate(sweepAccount));
            snapshot.reinvestedToSweep = surplus;
            snapshot.sweepAccountName = sweepAccount.name;
            snapshot.reinvestedToBrokerage = surplus;
            return;
        }

        if (TaxManager.hasEnabledBrokerage(s1, s2)) {
            TaxManager.sweepToBrokerageFallback(s1, s2, surplus, snapshot, getRate);
            return;
        }

        cashCushion.value += surplus;
        snapshot.reinvestedToCushion = (snapshot.reinvestedToCushion || 0) + surplus;
    }

    static hasEnabledBrokerage(s1, s2) {
        const b1 = (s1.accounts || []).find((a) => a.type === 'taxableBrokerage' && a.enabled !== false);
        const b2 = (s2.accounts || []).find((a) => a.type === 'taxableBrokerage' && a.enabled !== false);
        return Boolean(b1 || b2);
    }

    static sweepToBrokerageFallback(s1, s2, surplus, snapshot, getRate = () => 0.07) {
        const b1 = (s1.accounts || []).find((a) => a.type === 'taxableBrokerage' && a.enabled !== false);
        const b2 = (s2.accounts || []).find((a) => a.type === 'taxableBrokerage' && a.enabled !== false);

        if (b1 && b2) {
            const each = surplus / 2;
            depositIntoAccount(b1, each, getRate(b1));
            depositIntoAccount(b2, each, getRate(b2));
            snapshot.sweepAccountName = `${b1.name} & ${b2.name}`;
        } else if (b1) {
            depositIntoAccount(b1, surplus, getRate(b1));
            snapshot.sweepAccountName = b1.name;
        } else if (b2) {
            depositIntoAccount(b2, surplus, getRate(b2));
            snapshot.sweepAccountName = b2.name;
        }
        snapshot.reinvestedToBrokerage = surplus;
        snapshot.reinvestedToSweep = surplus;
    }
}
