/**
 * Financial Presentation Service
 *
 * Provides unified, single-source-of-truth calculations and view models
 * for chart inspectors, tooltips, and financial details drawers.
 * Eliminates duplicate calculations and enforces a hard nesting limit of <= 2.
 */

import { escapeHtml } from '../utils/sanitize.js';

const DEFAULT_MATCH_ESTIMATE_RATE = 0.03;

function computeSpouseTakeHome(spouseIncome, totalW2Net, totalW2Tax) {
    if (spouseIncome?.takeHome !== undefined) {
        return spouseIncome.takeHome;
    }
    const net = spouseIncome?.w2Net || 0;
    const share = totalW2Net > 0 ? net / totalW2Net : 0;
    return Math.max(0, net - totalW2Tax * share);
}

function buildDrawdownRows(drawdownMap) {
    const pairs = [
        { label: 'Brokerage', amount: (drawdownMap.s1Brokerage || 0) + (drawdownMap.s2Brokerage || 0) },
        { label: 'Cash Cushion', amount: drawdownMap.cashCushion || 0 },
        { label: 'Traditional IRA', amount: (drawdownMap.s1StandardIra || 0) + (drawdownMap.s2StandardIra || 0) },
        { label: '401(k)', amount: (drawdownMap.s1Trad401k || 0) + (drawdownMap.s2Trad401k || 0) },
        { label: '403(b)', amount: (drawdownMap.s1Trad403b || 0) + (drawdownMap.s2Trad403b || 0) },
        { label: 'Roth IRA', amount: (drawdownMap.s1RothIra || 0) + (drawdownMap.s2RothIra || 0) }
    ];
    return pairs.filter((row) => row.amount > 0);
}

function sumDrawdownAmounts(drawdownMap) {
    const excludeKeys = new Set(['penalizedPreTax', 's1PenalizedPreTax', 's2PenalizedPreTax']);
    return Object.entries(drawdownMap).reduce((acc, [key, val]) => {
        if (excludeKeys.has(key)) return acc;
        return acc + (Number(val) || 0);
    }, 0);
}

function hasEmployerMatchConfigured(accList) {
    return (accList || []).some(
        (a) => Number(a?.employerMatchConfig?.employer100PercentMatchOnTheFirstXPercent || 0) > 0
    );
}

function extractTaxLiabilities(td, eb, snap) {
    const fedTax = td.federalTax ?? td.fedTax ?? 0;
    const ficaTax = td.ficaTax || 0;
    const ltcgTax = td.capitalGainsTax ?? td.ltcgTax ?? 0;
    const niitTax = td.niitTax || 0;
    const stateTax = td.stateTax || 0;
    const earlyWithdrawalPenalty = td.earlyWithdrawalPenalty ?? snap.earlyWithdrawalPenalty ?? 0;
    const irmaa = eb.irmaa || 0;
    return {
        fedTax,
        ficaTax,
        ltcgTax,
        niitTax,
        stateTax,
        earlyWithdrawalPenalty,
        irmaa,
        totalTaxLiabilities: fedTax + ficaTax + ltcgTax + niitTax + stateTax + earlyWithdrawalPenalty + irmaa
    };
}

export class FinancialPresentationService {
    static formatCurrency(val) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(Number(val) || 0);
    }

    static computeCashInflows(snap, state) {
        if (!snap) return null;

        const numVal = (v) => Number(v) || 0;
        const inc = snap.income || {};
        const s1Inc = inc.s1 || {};
        const s2Inc = inc.s2 || {};
        const s1Name = escapeHtml(state?.primarySpouse?.name || 'Spouse 1');
        const s2Name = escapeHtml(state?.secondarySpouse?.name || 'Spouse 2');

        const w2Tax = numVal(snap.taxDetails?.w2Tax);
        const totalW2Net = numVal(s1Inc.w2Net) + numVal(s2Inc.w2Net);
        const s1TakeHome = computeSpouseTakeHome(s1Inc, totalW2Net, w2Tax);
        const s2TakeHome = computeSpouseTakeHome(s2Inc, totalW2Net, w2Tax);

        const totalSsn = numVal(s1Inc.ssn) + numVal(s2Inc.ssn);
        const s1Rule72t = numVal(s1Inc.rule72t);
        const s2Rule72t = numVal(s2Inc.rule72t);
        const total72t = s1Rule72t + s2Rule72t;
        const reverseMortgage = numVal(inc.reverseMortgage);

        const drawdownMap = inc.drawdowns || {};
        const totalDrawdowns = sumDrawdownAmounts(drawdownMap);
        const drawdownRows = buildDrawdownRows(drawdownMap);
        const totalCashInflows = s1TakeHome + s2TakeHome + totalSsn + total72t + reverseMortgage + totalDrawdowns;

        return {
            s1Name,
            s2Name,
            s1TakeHome,
            s2TakeHome,
            s1Jobs: s1Inc.jobs || [],
            s2Jobs: s2Inc.jobs || [],
            totalSsn,
            s1Rule72t,
            s2Rule72t,
            total72t,
            reverseMortgage,
            drawdownRows,
            totalDrawdowns,
            totalCashInflows,
            hasEarnedIncome: totalCashInflows > 0
        };
    }

    static computeExpensesAndOutflows(snap) {
        if (!snap) return null;

        const eb = snap.expenseBreakdown || {};
        const base = eb.base || 0;
        const mortgage = eb.mortgage || 0;
        const housing = eb.housing || 0;
        const childcare = eb.childcare || 0;
        const irmaa = eb.irmaa || 0;
        const healthcare = eb.healthcare || 0;
        const totalExpenses = snap.expenses || base + mortgage + housing + childcare + irmaa + healthcare;

        return {
            base,
            mortgage,
            housing,
            childcare,
            irmaa,
            healthcare,
            totalExpenses
        };
    }

    static computeCashFlowSurplus(inflows, outflows, state) {
        if (!inflows || !outflows) return null;

        const netFlow = inflows.totalCashInflows - outflows.totalExpenses;
        const allAccounts = [...(state?.primarySpouse?.accounts || []), ...(state?.secondarySpouse?.accounts || [])];
        const designated =
            allAccounts.find((a) => a.isSweepAccount) || allAccounts.find((a) => a.type === 'taxableBrokerage');
        const sweepAccountName = designated?.name ? escapeHtml(designated.name) : 'Taxable Brokerage';

        return {
            netFlow,
            isSurplus: netFlow >= 0,
            surplusAmount: Math.max(0, netFlow),
            deficitAmount: Math.max(0, -netFlow),
            sweepAccountName
        };
    }

    static _estimateSpousePayrollAdditions(spouseInc = {}, spouseAccounts = []) {
        const gross = Number(spouseInc.w2Gross || 0);
        const net = Number(spouseInc.w2Net || 0);
        const payroll401k = Math.max(0, gross - net);
        const match = gross > 0 && hasEmployerMatchConfigured(spouseAccounts) ? gross * DEFAULT_MATCH_ESTIMATE_RATE : 0;
        return { payroll401k, match };
    }

    static computePortfolioAdditions(snap, state, surplusAmount = 0) {
        if (!snap) return null;

        const inc = snap.income || {};
        const s1Add = this._estimateSpousePayrollAdditions(inc.s1, state?.primarySpouse?.accounts);
        const s2Add = this._estimateSpousePayrollAdditions(inc.s2, state?.secondarySpouse?.accounts);

        const rothConv = snap.rothConverted || {};
        const s1RothConv = Number(rothConv.s1 || 0);
        const s2RothConv = Number(rothConv.s2 || 0);
        const totalPortfolioAdditions =
            s1Add.payroll401k + s2Add.payroll401k + s1Add.match + s2Add.match + surplusAmount + s1RothConv + s2RothConv;

        return {
            s1Payroll401k: s1Add.payroll401k,
            s2Payroll401k: s2Add.payroll401k,
            s1Match: s1Add.match,
            s2Match: s2Add.match,
            reinvestedSurplus: surplusAmount,
            s1RothConv,
            s2RothConv,
            totalPortfolioAdditions
        };
    }

    static computeTaxProfile(snap) {
        if (!snap) return null;

        const td = snap.taxDetails || {};
        const eb = snap.expenseBreakdown || {};
        const filingStatus = (td.filingStatus || 'MFJ').toUpperCase();
        const topBracketRate = td.topBracketRate ?? td.topBracket ?? 0;
        const topBracketPct = (topBracketRate * 100).toFixed(1);
        const bracketRoom = td.remainingRoomInBracket ?? td.bracketRoom ?? 0;
        const effectiveRate = ((td.effectiveRate || 0) * 100).toFixed(1);
        const liabilities = extractTaxLiabilities(td, eb, snap);

        return {
            filingStatus,
            topBracketPct,
            topBracketRate,
            bracketRoom,
            effectiveRate,
            ...liabilities,
            magi: td.magi ?? 0,
            hsaDeduction: td.hsaDeduction ?? 0
        };
    }

    static _buildGrowthRows(accounts) {
        const growthRows = [];
        for (const [key, acc] of Object.entries(accounts || {})) {
            if (!acc) continue;
            const accInterest = acc.yearInterest || acc.interestEarned || 0;
            const balance = acc.balance || 0;
            if (accInterest !== 0 || balance > 0) {
                growthRows.push({
                    key,
                    name: escapeHtml(acc.name || key),
                    interest: accInterest,
                    balance
                });
            }
        }
        return growthRows;
    }

    static computePortfolioActivity(snap) {
        if (!snap) return null;

        const interest = snap.yearInterest || 0;
        const contributions = snap.yearContributions || 0;
        const conversionsIn = snap.yearConversionsIn || 0;
        const conversionsOut = snap.yearConversionsOut || 0;
        const rolloverIn = snap.yearRolloverIn || 0;
        const rolloverOut = snap.yearRolloverOut || 0;
        const netWithdrawals = snap.yearWithdrawals || 0;

        const netActivity =
            interest + contributions + conversionsIn + rolloverIn - conversionsOut - rolloverOut - netWithdrawals;

        return {
            interest,
            contributions,
            conversionsIn,
            conversionsOut,
            rolloverIn,
            rolloverOut,
            netWithdrawals,
            netActivity,
            growthRows: this._buildGrowthRows(snap.accounts)
        };
    }
}
