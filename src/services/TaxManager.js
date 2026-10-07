import { calculateTax } from './tax.js';

/**
 * Handles tax computations, tax payments from surplus/cushion/portfolio, and surplus reinvestment
 */
export class TaxManager {
    static calculate({ year, currentYear, firstActiveMonth = 1, taxableIncome, stateTaxRate, taxTables, snapshot, cashCushion, withdrawPortfoliosFn, filingStatus = 'mfj', ltcgGains = 0 }) {
        if (taxableIncome <= 0 && ltcgGains <= 0) {
            snapshot.taxes = 0;
            snapshot.taxDetails = { 
                federalTax: 0, 
                fedTax: 0,
                stateTax: 0, 
                totalTax: 0, 
                effectiveRate: 0, 
                topBracketRate: 0, 
                topBracket: 0,
                remainingRoomInBracket: 0, 
                bracketRoom: 0,
                w2Tax: 0, 
                nonW2Tax: 0,
                capitalGainsTax: 0,
                ltcgTax: 0,
                niitTax: 0,
                ficaTax: snapshot.taxDetails?.ficaTax || 0,
                filingStatus
            };
            return;
        }

        const yearsFromStart = year - currentYear;
        const currentTaxYearData = taxTables[yearsFromStart] || taxTables[taxTables.length - 1];
        const activeMonths = year === currentYear ? Math.max(1, 12 - firstActiveMonth + 1) : 12;
        const annualization = activeMonths < 12 ? (12 / activeMonths) : 1;
        const prorata = activeMonths < 12 ? (activeMonths / 12) : 1;

        // 1. Calculate Baseline W2 Tax
        const w2Taxable = snapshot.income.s1.w2Net + snapshot.income.s2.w2Net;
        const w2TaxResults = calculateTax(w2Taxable * annualization, stateTaxRate, currentTaxYearData, filingStatus, 0);

        // 2. Calculate Total Tax (Ordinary + Capital Gains + NIIT)
        const taxResults = calculateTax(taxableIncome * annualization, stateTaxRate, currentTaxYearData, filingStatus, ltcgGains * annualization);
        const calculatedTax = taxResults.totalTax * prorata;
        const w2Tax = w2TaxResults.totalTax * prorata;
        const nonW2Tax = Math.max(0, calculatedTax - w2Tax);

        snapshot.taxes = calculatedTax;
        taxResults.federalTax = (taxResults.federalTax || 0) * prorata;
        taxResults.stateTax = (taxResults.stateTax || 0) * prorata;
        taxResults.capitalGainsTax = (taxResults.capitalGainsTax || 0) * prorata;
        taxResults.niitTax = (taxResults.niitTax || 0) * prorata;
        taxResults.totalTax = calculatedTax;
        taxResults.w2Tax = w2Tax;
        taxResults.nonW2Tax = nonW2Tax;
        taxResults.ficaTax = snapshot.taxDetails?.ficaTax || 0;
        taxResults.s1Fica = snapshot.taxDetails?.s1Fica || null;
        taxResults.s2Fica = snapshot.taxDetails?.s2Fica || null;
        taxResults.s1W2Tax = snapshot.taxDetails?.s1W2Tax || 0;
        taxResults.s2W2Tax = snapshot.taxDetails?.s2W2Tax || 0;
        taxResults.totalW2Tax = snapshot.taxDetails?.totalW2Tax || 0;
        taxResults.filingStatus = filingStatus;
        taxResults.topBracketRate = taxResults.topBracketRate || 0;
        taxResults.topBracket = taxResults.topBracketRate;
        taxResults.bracketRoom = taxResults.remainingRoomInBracket || 0;
        taxResults.fedTax = taxResults.federalTax;
        taxResults.ltcgTax = taxResults.capitalGainsTax;
        snapshot.taxDetails = taxResults;

        let remainingTax = calculatedTax;

        // Pay tax from surplus first
        if (snapshot.surplus > 0 && remainingTax > 0) {
            const payFromSurplus = Math.min(snapshot.surplus, remainingTax);
            snapshot.surplus -= payFromSurplus;
            remainingTax -= payFromSurplus;
        }

        // Pay tax from cushion
        if (remainingTax > 0 && cashCushion && cashCushion.value >= remainingTax) {
            cashCushion.value -= remainingTax;
            if (snapshot.income?.drawdowns) snapshot.income.drawdowns.cashCushion += remainingTax;
            remainingTax = 0;
        } else if (remainingTax > 0 && cashCushion && cashCushion.value > 0) {
            remainingTax -= cashCushion.value;
            if (snapshot.income?.drawdowns) snapshot.income.drawdowns.cashCushion += cashCushion.value;
            cashCushion.value = 0;
        }

        // Pay tax by drawing down from portfolios
        if (remainingTax > 0 && withdrawPortfoliosFn) {
            const unfunded = withdrawPortfoliosFn(remainingTax);
            snapshot.unfundedShortfall = (snapshot.unfundedShortfall || 0) + unfunded;
        }
    }

    static reinvestSurplus({ snapshot, strategies, cashCushion, s1, s2 }) {
        const surplus = snapshot.surplus || 0;
        if (surplus <= 0) return;

        const allAccounts = [...(s1.accounts || []), ...(s2.accounts || [])];
        const sweepAccount = allAccounts.find(a => a.isSweepAccount === true && a.enabled !== false);
        const getRate = (acc) => (acc.expectedReturn !== undefined && acc.expectedReturn !== null)
            ? (Number(acc.expectedReturn) / 100)
            : ((strategies?.generalReturnRate || 7) / 100);

        // 1. If user designated a Sweep Account, sweep 100% of household surplus cash directly into it
        if (sweepAccount) {
            const rate = getRate(sweepAccount);
            const surplusGrowth = surplus * rate;
            sweepAccount.balance += surplus + surplusGrowth;
            sweepAccount.yearContributions += surplus;
            sweepAccount.yearInterest = (sweepAccount.yearInterest || 0) + surplusGrowth;
            sweepAccount.yearGrowth = (sweepAccount.yearGrowth || 0) + surplusGrowth;
            if (sweepAccount.costBasis !== undefined) {
                sweepAccount.costBasis += surplus;
            }
            snapshot.reinvestedToSweep = surplus;
            snapshot.sweepAccountName = sweepAccount.name;
            snapshot.reinvestedToBrokerage = surplus;
            return;
        }

        // 2. Fallback to enabled Brokerage if exists
        if (TaxManager.hasEnabledBrokerage(s1, s2)) {
            TaxManager.sweepToBrokerageFallback(s1, s2, surplus, snapshot, getRate);
            return;
        }

        // 3. Fallback: Cash Cushion (if no brokerage/sweep accounts exist)
        cashCushion.value += surplus;
        snapshot.reinvestedToCushion = (snapshot.reinvestedToCushion || 0) + surplus;
    }

    static hasEnabledBrokerage(s1, s2) {
        const b1 = (s1.accounts || []).find(a => a.type === 'taxableBrokerage' && a.enabled !== false);
        const b2 = (s2.accounts || []).find(a => a.type === 'taxableBrokerage' && a.enabled !== false);
        return !!(b1 || b2);
    }

    static sweepToBrokerageFallback(s1, s2, surplus, snapshot, getRate = () => 0.07) {
        const b1 = (s1.accounts || []).find(a => a.type === 'taxableBrokerage' && a.enabled !== false);
        const b2 = (s2.accounts || []).find(a => a.type === 'taxableBrokerage' && a.enabled !== false);

        if (b1 && b2) {
            const each = surplus / 2;
            const r1 = getRate(b1);
            const r2 = getRate(b2);
            b1.balance += each * (1 + r1);
            b1.yearContributions += each;
            b1.yearInterest = (b1.yearInterest || 0) + each * r1;
            b1.yearGrowth = (b1.yearGrowth || 0) + each * r1;
            if (b1.costBasis !== undefined) b1.costBasis += each;
            b2.balance += each * (1 + r2);
            b2.yearContributions += each;
            b2.yearInterest = (b2.yearInterest || 0) + each * r2;
            b2.yearGrowth = (b2.yearGrowth || 0) + each * r2;
            if (b2.costBasis !== undefined) b2.costBasis += each;
            snapshot.sweepAccountName = `${b1.name} & ${b2.name}`;
        } else if (b1) {
            const r1 = getRate(b1);
            b1.balance += surplus * (1 + r1);
            b1.yearContributions += surplus;
            b1.yearInterest = (b1.yearInterest || 0) + surplus * r1;
            b1.yearGrowth = (b1.yearGrowth || 0) + surplus * r1;
            if (b1.costBasis !== undefined) b1.costBasis += surplus;
            snapshot.sweepAccountName = b1.name;
        } else if (b2) {
            const r2 = getRate(b2);
            b2.balance += surplus * (1 + r2);
            b2.yearContributions += surplus;
            b2.yearInterest = (b2.yearInterest || 0) + surplus * r2;
            b2.yearGrowth = (b2.yearGrowth || 0) + surplus * r2;
            if (b2.costBasis !== undefined) b2.costBasis += surplus;
            snapshot.sweepAccountName = b2.name;
        }
        snapshot.reinvestedToBrokerage = surplus;
        snapshot.reinvestedToSweep = surplus;
    }
}
