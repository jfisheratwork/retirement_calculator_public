/**
 * Financial Presentation Service
 * 
 * Provides unified, single-source-of-truth calculations and view models
 * for chart inspectors, tooltips, and financial details drawers.
 * Eliminates duplicate calculations and enforces a hard nesting limit of <= 2.
 */

import { escapeHtml } from '../utils/sanitize.js';

export class FinancialPresentationService {
    /**
     * Formats a numeric value as standard USD currency without cents.
     * @param {number|string} val 
     * @returns {string}
     */
    static formatCurrency(val) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(Number(val) || 0);
    }

    /**
     * Calculates itemized cash inflows (W2 take-home, SSN, 72t, reverse mortgage, drawdowns).
     * @param {object} snap YearlySnapshot
     * @param {object} state Global State
     */
    static computeCashInflows(snap, state) {
        if (!snap) return null;

        const s1Name = escapeHtml(state?.primarySpouse?.name || 'Spouse 1');
        const s2Name = escapeHtml(state?.secondarySpouse?.name || 'Spouse 2');

        const totalW2Net = (snap.income?.s1?.w2Net || 0) + (snap.income?.s2?.w2Net || 0);
        const s1Share = totalW2Net > 0 ? (snap.income.s1.w2Net / totalW2Net) : 0;
        const s2Share = totalW2Net > 0 ? (snap.income.s2.w2Net / totalW2Net) : 0;
        const s1TakeHome = snap.income?.s1?.takeHome !== undefined
            ? snap.income.s1.takeHome
            : Math.max(0, (snap.income?.s1?.w2Net || 0) - ((snap.taxDetails?.w2Tax || 0) * s1Share));
        const s2TakeHome = snap.income?.s2?.takeHome !== undefined
            ? snap.income.s2.takeHome
            : Math.max(0, (snap.income?.s2?.w2Net || 0) - ((snap.taxDetails?.w2Tax || 0) * s2Share));

        const totalSsn = (snap.income?.s1?.ssn || 0) + (snap.income?.s2?.ssn || 0);
        const s1Rule72t = snap.income?.s1?.rule72t || 0;
        const s2Rule72t = snap.income?.s2?.rule72t || 0;
        const total72t = s1Rule72t + s2Rule72t;
        const reverseMortgage = snap.income?.reverseMortgage || 0;

        const drawdownMap = snap.income?.drawdowns || {};
        const totalDrawdowns = Object.values(drawdownMap).reduce((acc, val) => acc + (Number(val) || 0), 0);

        const drawdownRows = [];
        const brokerageDraw = (drawdownMap.s1Brokerage || 0) + (drawdownMap.s2Brokerage || 0);
        if (brokerageDraw > 0) drawdownRows.push({ label: 'Brokerage', amount: brokerageDraw });
        if (drawdownMap.cashCushion > 0) drawdownRows.push({ label: 'Cash Cushion', amount: drawdownMap.cashCushion });
        const iraDraw = (drawdownMap.s1StandardIra || 0) + (drawdownMap.s2StandardIra || 0);
        if (iraDraw > 0) drawdownRows.push({ label: 'Traditional IRA', amount: iraDraw });
        const k401Draw = (drawdownMap.s1Trad401k || 0) + (drawdownMap.s2Trad401k || 0);
        if (k401Draw > 0) drawdownRows.push({ label: '401(k)', amount: k401Draw });
        const b403Draw = (drawdownMap.s1Trad403b || 0) + (drawdownMap.s2Trad403b || 0);
        if (b403Draw > 0) drawdownRows.push({ label: '403(b)', amount: b403Draw });
        const rothDraw = (drawdownMap.s1RothIra || 0) + (drawdownMap.s2RothIra || 0);
        if (rothDraw > 0) drawdownRows.push({ label: 'Roth IRA', amount: rothDraw });

        const totalCashInflows = s1TakeHome + s2TakeHome + totalSsn + total72t + reverseMortgage + totalDrawdowns;
        const hasEarnedIncome = totalCashInflows > 0;

        return {
            s1Name,
            s2Name,
            s1TakeHome,
            s2TakeHome,
            s1Jobs: snap.income?.s1?.jobs || [],
            s2Jobs: snap.income?.s2?.jobs || [],
            totalSsn,
            s1Rule72t,
            s2Rule72t,
            total72t,
            reverseMortgage,
            drawdownRows,
            totalDrawdowns,
            totalCashInflows,
            hasEarnedIncome
        };
    }

    /**
     * Calculates itemized expenses & outflows.
     * @param {object} snap YearlySnapshot
     */
    static computeExpensesAndOutflows(snap) {
        if (!snap) return null;

        const base = snap.expenseBreakdown?.base || 0;
        const mortgage = snap.expenseBreakdown?.mortgage || 0;
        const housing = snap.expenseBreakdown?.housing || 0;
        const childcare = snap.expenseBreakdown?.childcare || 0;
        const irmaa = snap.expenseBreakdown?.irmaa || 0;
        const totalExpenses = snap.expenses || (base + mortgage + housing + childcare + irmaa);

        return {
            base,
            mortgage,
            housing,
            childcare,
            irmaa,
            totalExpenses
        };
    }

    /**
     * Calculates net cash surplus / deficit and sweep allocation.
     * @param {object} inflows Computed inflows
     * @param {object} outflows Computed outflows
     * @param {object} state Global State
     */
    static computeCashFlowSurplus(inflows, outflows, state) {
        if (!inflows || !outflows) return null;

        const netFlow = inflows.totalCashInflows - outflows.totalExpenses;
        const isSurplus = netFlow >= 0;
        const surplusAmount = Math.max(0, netFlow);
        const deficitAmount = Math.max(0, -netFlow);

        let sweepAccountName = 'Taxable Brokerage';
        const allAccounts = [
            ...(state?.primarySpouse?.accounts || []),
            ...(state?.secondarySpouse?.accounts || [])
        ];
        const designated = allAccounts.find(a => a.isSweepAccount) || allAccounts.find(a => a.type === 'taxableBrokerage');
        if (designated?.name) {
            sweepAccountName = escapeHtml(designated.name);
        }

        return {
            netFlow,
            isSurplus,
            surplusAmount,
            deficitAmount,
            sweepAccountName
        };
    }

    /**
     * Calculates portfolio additions and savings.
     * @param {object} snap YearlySnapshot
     * @param {object} state Global State
     * @param {number} surplusAmount Reinvested surplus
     */
    static computePortfolioAdditions(snap, state, surplusAmount = 0) {
        if (!snap) return null;

        const s1Gross = snap.income?.s1?.w2Gross || 0;
        const s2Gross = snap.income?.s2?.w2Gross || 0;
        const s1Payroll401k = Math.max(0, s1Gross - (snap.income?.s1?.w2Net || 0));
        const s2Payroll401k = Math.max(0, s2Gross - (snap.income?.s2?.w2Net || 0));

        let s1Match = 0;
        let s2Match = 0;
        const checkMatch = (accList) => (accList || []).reduce((sum, a) => {
            const m = a.employerMatchConfig;
            if (!m) return sum;
            return sum + (Number(m.employer100PercentMatchOnTheFirstXPercent || 0) > 0 ? 1 : 0);
        }, 0);

        if (checkMatch(state?.primarySpouse?.accounts) > 0 && s1Gross > 0) {
            s1Match = s1Gross * 0.03;
        }
        if (checkMatch(state?.secondarySpouse?.accounts) > 0 && s2Gross > 0) {
            s2Match = s2Gross * 0.03;
        }

        const s1RothConv = snap.rothConverted?.s1 || 0;
        const s2RothConv = snap.rothConverted?.s2 || 0;
        const totalPortfolioAdditions = s1Payroll401k + s2Payroll401k + s1Match + s2Match + surplusAmount + s1RothConv + s2RothConv;

        return {
            s1Payroll401k,
            s2Payroll401k,
            s1Match,
            s2Match,
            reinvestedSurplus: surplusAmount,
            s1RothConv,
            s2RothConv,
            totalPortfolioAdditions
        };
    }

    /**
     * Calculates tax liabilities and bracket profile.
     * @param {object} snap YearlySnapshot
     */
    static computeTaxProfile(snap) {
        if (!snap) return null;

        const filingStatus = (snap.taxDetails?.filingStatus || 'MFJ').toUpperCase();
        const topBracketRate = snap.taxDetails?.topBracketRate ?? snap.taxDetails?.topBracket ?? 0;
        const topBracketPct = (topBracketRate * 100).toFixed(1);
        const bracketRoom = snap.taxDetails?.remainingRoomInBracket ?? snap.taxDetails?.bracketRoom ?? 0;
        const effectiveRate = ((snap.taxDetails?.effectiveRate || 0) * 100).toFixed(1);

        const fedTax = snap.taxDetails?.federalTax ?? snap.taxDetails?.fedTax ?? 0;
        const ficaTax = snap.taxDetails?.ficaTax || 0;
        const ltcgTax = snap.taxDetails?.capitalGainsTax ?? snap.taxDetails?.ltcgTax ?? 0;
        const niitTax = snap.taxDetails?.niitTax || 0;
        const stateTax = snap.taxDetails?.stateTax || 0;
        const irmaa = snap.expenseBreakdown?.irmaa || 0;
        const totalTaxLiabilities = fedTax + ficaTax + ltcgTax + niitTax + stateTax + irmaa;

        return {
            filingStatus,
            topBracketPct,
            topBracketRate,
            bracketRoom,
            effectiveRate,
            fedTax,
            ficaTax,
            ltcgTax,
            niitTax,
            stateTax,
            irmaa,
            magi: snap.taxDetails?.magi ?? 0,
            hsaDeduction: snap.taxDetails?.hsaDeduction ?? 0,
            totalTaxLiabilities
        };
    }

    /**
     * Calculates net portfolio activity (growth, interest, net inflows/outflows).
     * @param {object} snap YearlySnapshot
     */
    static computePortfolioActivity(snap) {
        if (!snap) return null;

        const interest = snap.yearInterest || 0;
        const contributions = snap.yearContributions || 0;
        const conversionsIn = snap.yearConversionsIn || 0;
        const conversionsOut = snap.yearConversionsOut || 0;
        const rolloverIn = snap.yearRolloverIn || 0;
        const rolloverOut = snap.yearRolloverOut || 0;
        const netWithdrawals = snap.yearWithdrawals || 0;

        const netActivity = interest + contributions + conversionsIn + rolloverIn - conversionsOut - rolloverOut - netWithdrawals;

        const growthRows = [];
        const accounts = snap.accounts || {};
        for (const [key, acc] of Object.entries(accounts)) {
            if (!acc) continue;
            const accInterest = acc.yearInterest || acc.interestEarned || 0;
            if (accInterest !== 0 || acc.balance > 0) {
                growthRows.push({
                    key,
                    name: escapeHtml(acc.name || key),
                    interest: accInterest,
                    balance: acc.balance || 0
                });
            }
        }

        return {
            interest,
            contributions,
            conversionsIn,
            conversionsOut,
            rolloverIn,
            rolloverOut,
            netWithdrawals,
            netActivity,
            growthRows
        };
    }
}
