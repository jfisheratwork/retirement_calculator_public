/**
 * Floating Chart Inspector HTML Builders
 * Extracted from src/components/charts.js per SPEC-070 to enforce single-responsibility
 * and keep cyclomatic complexity and function length within strict thresholds.
 */

import { escapeHtml } from '../../utils/sanitize.js';
import { FinancialPresentationService } from '../../services/FinancialPresentationService.js';

const formatCurrency = (amountVal) => FinancialPresentationService.formatCurrency(amountVal);

/**
 * Renders individual job salary, bonus, and LTI breakout rows for the tooltip inspector.
 * @param {Array<Object>} jobList
 * @returns {string} HTML markup
 */
export function renderJobBreakoutRows(jobList) {
    if (!jobList || jobList.length === 0) return '';
    let htmlOutput = '';
    jobList.forEach((jobItem) => {
        const hasAddons = jobItem.bonus > 0 || jobItem.lti > 0;
        const safeTitle = escapeHtml(jobItem.title);
        const safeRange = escapeHtml(jobItem.rangeLabel);
        if (!hasAddons) {
            htmlOutput += `
                <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                    <span class="inspector-label">↳ ${safeTitle} (${safeRange})</span>
                    <span class="inspector-value">${formatCurrency(jobItem.total)}</span>
                </div>
            `;
            return;
        }
        const safeBonus = escapeHtml(jobItem.bonusMonthName || 'Bonus');
        const safeLti = escapeHtml(jobItem.ltiMonthName || 'LTI');
        htmlOutput += `
            <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                <span class="inspector-label">↳ ${safeTitle} Base (${safeRange})</span>
                <span class="inspector-value">${formatCurrency(jobItem.baseSalary)}</span>
            </div>
        `;
        if (jobItem.bonus > 0) {
            htmlOutput += `
                <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                    <span class="inspector-label">↳ ${safeTitle} Bonus (${safeBonus})</span>
                    <span class="inspector-value" style="color: var(--success);">+${formatCurrency(jobItem.bonus)}</span>
                </div>
            `;
        }
        if (jobItem.lti > 0) {
            htmlOutput += `
                <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                    <span class="inspector-label">↳ ${safeTitle} LTI (${safeLti})</span>
                    <span class="inspector-value" style="color: var(--success);">+${formatCurrency(jobItem.lti)}</span>
                </div>
            `;
        }
    });
    return htmlOutput;
}

function renderColorDot(colorMap, labelText, fallbackColor) {
    const resolvedColor = colorMap[labelText] || fallbackColor;
    return `<span class="inspector-color" style="background:${resolvedColor}; border: 1px solid ${resolvedColor}"></span>`;
}

/**
 * Renders cash inflows section for the income/cashflow chart inspector.
 * @param {Object} inflows
 * @param {Object} colorMap
 * @returns {string} HTML markup
 */
export function renderInflowSection(inflows, colorMap) {
    let html = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Cash Inflows (Income & Distributions)</div>`;

    if (inflows.s1TakeHome > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, `${inflows.s1Name} Take-Home Pay`, '#27ae60')} ${inflows.s1Name} Take-Home Pay</span><span class="inspector-value">${formatCurrency(inflows.s1TakeHome)}</span></div>`;
        html += renderJobBreakoutRows(inflows.s1Jobs);
    }
    if (inflows.s2TakeHome > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, `${inflows.s2Name} Take-Home Pay`, '#2ecc71')} ${inflows.s2Name} Take-Home Pay</span><span class="inspector-value">${formatCurrency(inflows.s2TakeHome)}</span></div>`;
        html += renderJobBreakoutRows(inflows.s2Jobs);
    }
    if (inflows.totalSsn > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, `${inflows.s1Name} SSN`, '#16a085')} Social Security</span><span class="inspector-value">${formatCurrency(inflows.totalSsn)}</span></div>`;
    }
    if (inflows.total72t > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, `${inflows.s1Name} Rule 72(t)`, '#f39c12')} Rule 72(t) SEPP</span><span class="inspector-value">${formatCurrency(inflows.total72t)}</span></div>`;
    }
    if (inflows.reverseMortgage > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, 'Reverse Mortgage', '#e67e22')} Standby Home Equity</span><span class="inspector-value">${formatCurrency(inflows.reverseMortgage)}</span></div>`;
    }
    if (inflows.totalDrawdowns > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, 'Portfolio Distributions', '#fdcb6e')} Portfolio Distributions</span><span class="inspector-value" style="color: #fdcb6e;">+${formatCurrency(inflows.totalDrawdowns)}</span></div>`;
        inflows.drawdownRows.forEach((drawdownRow) => {
            html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ ${drawdownRow.label}</span><span class="inspector-value">+${formatCurrency(drawdownRow.amount)}</span></div>`;
        });
    }
    if (!inflows.hasEarnedIncome) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No earned cash income (Fully retired)</em></span></div>`;
    }

    html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Cash Inflows</span><span class="inspector-value" style="color: var(--success);">${formatCurrency(inflows.totalCashInflows)}</span></div>`;
    html += `</div>`;
    return html;
}

/**
 * Renders cash outflows section for the income/cashflow chart inspector.
 * @param {Object} outflows
 * @param {Object} colorMap
 * @returns {string} HTML markup
 */
export function renderOutflowSection(outflows, colorMap) {
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Cash Expenses & Outflows</div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, 'Lifestyle Expenses', '#e74c3c')} Base Lifestyle</span><span class="inspector-value">${formatCurrency(outflows.base)}</span></div>`;
    if (outflows.mortgage > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, 'Mortgage Payment', '#c0392b')} Mortgage Payment</span><span class="inspector-value">${formatCurrency(outflows.mortgage)}</span></div>`;
    }
    if (outflows.housing > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, 'Property Tax & Home Maint.', '#d63031')} Property Tax & Insurance</span><span class="inspector-value">${formatCurrency(outflows.housing)}</span></div>`;
    }
    if (outflows.childcare > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, '529 College / Dependent Education', '#e84393')} College 529 Tuition</span><span class="inspector-value">${formatCurrency(outflows.childcare)}</span></div>`;
    }
    if (outflows.irmaa > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${renderColorDot(colorMap, 'Medicare IRMAA', '#e17055')} Medicare IRMAA Surcharges</span><span class="inspector-value">${formatCurrency(outflows.irmaa)}</span></div>`;
    }
    html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Cash Expenses</span><span class="inspector-value" style="color: var(--danger);">${formatCurrency(outflows.totalExpenses)}</span></div>`;
    html += `</div>`;
    return html;
}

/**
 * Renders net cash surplus or deficit section.
 * @param {Object} surplus
 * @returns {string} HTML markup
 */
export function renderSurplusSection(surplus) {
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Net Cash Surplus & Reinvestment</div>`;
    if (surplus.isSurplus) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Net Cash Surplus</span><span class="inspector-value" style="color: var(--success);">+${formatCurrency(surplus.surplusAmount)}</span></div>`;
        html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ Reinvested (${surplus.sweepAccountName})</span><span class="inspector-value" style="color: var(--success);">+${formatCurrency(surplus.surplusAmount)}</span></div>`;
    } else {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Net Cash Deficit</span><span class="inspector-value" style="color: var(--danger);">-${formatCurrency(surplus.deficitAmount)}</span></div>`;
        html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ Liquidated from Portfolio</span><span class="inspector-value" style="color: var(--danger);">-${formatCurrency(surplus.deficitAmount)}</span></div>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Renders portfolio contributions and savings additions section.
 * @param {Object} additions
 * @param {Object} state
 * @returns {string} HTML markup
 */
export function renderAdditionsSection(additions, state) {
    const s1Name = escapeHtml(state?.primarySpouse?.name || 'Spouse 1');
    const s2Name = escapeHtml(state?.secondarySpouse?.name || 'Spouse 2');
    const additionRows = [
        { amount: additions.s1Payroll401k, label: `${s1Name} 401(k) Payroll Deferral`, color: 'var(--success)' },
        { amount: additions.s2Payroll401k, label: `${s2Name} 401(k) Payroll Deferral`, color: 'var(--success)' },
        { amount: additions.s1Match, label: `${s1Name} Employer Match`, color: 'var(--success)' },
        { amount: additions.s2Match, label: `${s2Name} Employer Match`, color: 'var(--success)' },
        { amount: additions.reinvestedSurplus, label: 'Reinvested Cash Surplus', color: 'var(--success)' },
        { amount: additions.s1RothConv, label: `${s1Name} Roth Conversion`, color: 'var(--secondary)' },
        { amount: additions.s2RothConv, label: `${s2Name} Roth Conversion`, color: 'var(--secondary)' }
    ];

    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Portfolio Contributions & Savings</div>`;
    additionRows.forEach((rowItem) => {
        if (rowItem.amount > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${rowItem.label}</span><span class="inspector-value" style="color: ${rowItem.color};">+${formatCurrency(rowItem.amount)}</span></div>`;
        }
    });
    html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Portfolio Additions</span><span class="inspector-value" style="color: var(--success);">${formatCurrency(additions.totalPortfolioAdditions)}</span></div>`;
    html += `</div>`;
    return html;
}

/**
 * Renders federal tax profile summary section.
 * @param {Object} tax
 * @returns {string} HTML markup
 */
export function renderTaxSection(tax) {
    if (!tax) return '';
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Federal Tax Profile (${tax.filingStatus})</div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Top Bracket Hit</span><span class="inspector-value">${tax.topBracketPct}%</span></div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Remaining Room</span><span class="inspector-value" style="color: var(--success);">${formatCurrency(tax.bracketRoom)}</span></div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Effective Fed Rate</span><span class="inspector-value">${tax.effectiveRate}%</span></div>`;
    html += `</div>`;
    return html;
}

function computeGrowthFlowMetrics(growthData) {
    const inflows =
        (Number(growthData.interest) || 0) +
        (Number(growthData.contributions) || 0) +
        (Number(growthData.conversionsIn) || 0) +
        (Number(growthData.rolloverIn) || 0);
    const outflows = (Number(growthData.conversionsOut) || 0) + (Number(growthData.rolloverOut) || 0);
    const rawWithdrawals = Number(growthData.withdrawals) || 0;
    const netWithdrawals = Math.max(0, rawWithdrawals - outflows);
    return {
        hasFlow: inflows !== 0 || outflows !== 0 || netWithdrawals !== 0,
        netActivity: inflows - outflows - netWithdrawals
    };
}

function formatAccountGrowthRow(accountName, growthData) {
    if (!growthData) return '';
    const metrics = computeGrowthFlowMetrics(growthData);
    if (!metrics.hasFlow) return '';

    const signPrefix = metrics.netActivity >= 0 ? '+' : '';
    const colorVar = metrics.netActivity >= 0 ? 'var(--success)' : 'var(--danger)';
    return `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 6px;"><span class="inspector-label">Activity: ${escapeHtml(accountName)}</span><span class="inspector-value" style="color: ${colorVar};">${signPrefix}${formatCurrency(metrics.netActivity)}</span></div>`;
}

/**
 * Renders account-level growth and activity rows for a given year snapshot.
 * @param {Object} snap
 * @param {Object} state
 * @returns {string} HTML markup
 */
export function renderActivitySection(snap, state) {
    if (!snap.growth) {
        return `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No portfolio activity</em></span></div>`;
    }
    const s1Name = escapeHtml(state?.primarySpouse?.name || 'S1');
    const s2Name = escapeHtml(state?.secondarySpouse?.name || 'S2');
    const accountEntries = [
        [`${s1Name} 401k`, snap.growth.s1Trad401k],
        [`${s2Name} 401k`, snap.growth.s2Trad401k],
        [`${s1Name} 403b`, snap.growth.s1Trad403b],
        [`${s2Name} 403b`, snap.growth.s2Trad403b],
        [`${s1Name} Std IRA`, snap.growth.s1StandardIra],
        [`${s2Name} Std IRA`, snap.growth.s2StandardIra],
        [`${s1Name} Roth IRA`, snap.growth.s1RothIra],
        [`${s2Name} Roth IRA`, snap.growth.s2RothIra],
        [`${s1Name} HYSA`, snap.growth.s1Hysa],
        [`${s2Name} HYSA`, snap.growth.s2Hysa],
        [`${s1Name} CD`, snap.growth.s1Cd],
        [`${s2Name} CD`, snap.growth.s2Cd],
        [`${s1Name} Brokerage`, snap.growth.s1Brokerage],
        [`${s2Name} Brokerage`, snap.growth.s2Brokerage],
        ['529 College Savings', snap.growth.college529],
        ['Home Appreciation', snap.growth.primaryResidenceEquity]
    ];

    const rowsHtml = accountEntries.map(([label, growthItem]) => formatAccountGrowthRow(label, growthItem)).join('');
    if (!rowsHtml) {
        return `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No portfolio activity</em></span></div>`;
    }
    return rowsHtml;
}

/**
 * Renders the full Cashflow & Income Inspector tooltip body.
 * @param {Object} snap
 * @param {Object} state
 * @param {Array<Object>} points
 * @returns {string} HTML markup
 */
export function renderCashflowInspector(snap, state, points) {
    const colorMap = {};
    points.forEach((pointItem) => {
        colorMap[pointItem.dp.dataset.label] = pointItem.colors.backgroundColor;
    });

    const inflows = FinancialPresentationService.computeCashInflows(snap, state);
    const outflows = FinancialPresentationService.computeExpensesAndOutflows(snap);
    const surplus = FinancialPresentationService.computeCashFlowSurplus(inflows, outflows, state);
    const additions = FinancialPresentationService.computePortfolioAdditions(snap, state, surplus.surplusAmount);
    const tax = FinancialPresentationService.computeTaxProfile(snap);

    let html = '';
    html += renderInflowSection(inflows, colorMap);
    html += renderOutflowSection(outflows, colorMap);
    html += renderSurplusSection(surplus);
    if (additions.totalPortfolioAdditions > 0) {
        html += renderAdditionsSection(additions, state);
    }
    html += renderTaxSection(tax);
    html += renderActivitySection(snap, state);
    return html;
}

const SKIPPED_EXPENSE_LABELS = new Set(['Total Expenses', 'Total Expenses + Taxes', 'Total Expenses + Non-W2 Taxes']);

function isSkippedGenericDataset(datasetLabel, rawAmount) {
    if (rawAmount === 0 && datasetLabel !== 'Surplus / Shortfall') return true;
    return SKIPPED_EXPENSE_LABELS.has(datasetLabel);
}

function getPortfolioHighlightStyle(chart, tooltip, dataPoint) {
    if (chart.canvas.id !== 'portfolioChart' || !dataPoint.element || dataPoint.element.y === undefined) {
        return '';
    }
    if (Math.abs(dataPoint.element.y - tooltip.caretY) < 2) {
        return 'border: 1px solid #00b894; border-radius: 4px; padding: 2px 4px; background: rgba(0, 184, 148, 0.15); margin: 2px -4px;';
    }
    return '';
}

function renderTakeHomeBreakoutIfApplicable(datasetLabel, snap, state) {
    if (!datasetLabel || !datasetLabel.includes('Take-Home') || !snap) return '';
    const isS1 = datasetLabel.includes(state?.primarySpouse?.name || 'Spouse 1');
    const jobList = isS1 ? snap.income?.s1?.jobs : snap.income?.s2?.jobs;
    return renderJobBreakoutRows(jobList);
}

function renderGenericTotalsFooter(total, chart, tooltip, state) {
    let totalNominal = total;
    let totalReal = total;
    const isRealDisplayed = Boolean(state?.assumptions?.displayRealDollars);

    if (state?.assumptions) {
        let yearsFromStart = tooltip.dataPoints[0].dataIndex;
        if (chart.customData && chart.customData[yearsFromStart] && chart.customData[0]) {
            const snapAtIndex = chart.customData[yearsFromStart];
            yearsFromStart = snapAtIndex.year - chart.customData[0].year;
        }
        const multiplier = Math.pow(1 + state.assumptions.inflationRate / 100, yearsFromStart);
        if (isRealDisplayed) {
            totalNominal = total * multiplier;
        } else {
            totalReal = total / multiplier;
        }
    }

    let footerHtml = `
        <div class="inspector-total">
            <span>Total ${isRealDisplayed ? '(Real)' : '(Nominal)'}</span>
            <span>${formatCurrency(total)}</span>
        </div>
    `;
    if (state?.assumptions) {
        footerHtml += `
            <div class="inspector-total" style="font-size: 0.85rem; color: #64B5F6; border-top: none; padding-top: 0; font-style: italic;">
                <span>${isRealDisplayed ? 'Nominal:' : "Today's Dollars (Real):"}</span>
                <span>${isRealDisplayed ? formatCurrency(totalNominal) : formatCurrency(totalReal)}</span>
            </div>
        `;
    }
    return footerHtml;
}

function renderTaxChartDetailsFooter(chart, snap) {
    if (chart.canvas.id !== 'taxChart' || !snap?.taxDetails) return '';
    return `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);">
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px;">Federal Tax Profile (MFJ)</div>
            <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Top Bracket Hit</span><span class="inspector-value">${(snap.taxDetails.topBracketRate * 100).toFixed(1)}%</span></div>
            <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Remaining Room</span><span class="inspector-value" style="color: var(--success);">${formatCurrency(snap.taxDetails.remainingRoomInBracket)}</span></div>
            <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Effective Fed Rate</span><span class="inspector-value">${(snap.taxDetails.effectiveRate * 100).toFixed(1)}%</span></div>
        </div>
    `;
}

/**
 * Renders generic inspector tooltip body for Portfolio, Net Worth, Tax, and SORR charts.
 * @param {Object} chart
 * @param {Object} tooltip
 * @param {Object} snap
 * @param {Object} state
 * @param {Array<Object>} points
 * @returns {string} HTML markup
 */
export function renderGenericInspector(chart, tooltip, snap, state, points) {
    let html = '';
    let total = 0;

    points.forEach((pointItem) => {
        const dataPoint = pointItem.dp;
        const colors = pointItem.colors;
        const datasetLabel = dataPoint.dataset.label;
        const rawAmount = dataPoint.raw;
        if (isSkippedGenericDataset(datasetLabel, rawAmount)) return;

        if (datasetLabel !== 'Total Net Worth' && datasetLabel !== 'Surplus / Shortfall') {
            total += rawAmount;
        }
        const rowStyle = getPortfolioHighlightStyle(chart, tooltip, dataPoint);
        const borderColor = colors.borderColor || colors.backgroundColor;

        html += `
            <div class="inspector-row" style="${rowStyle}">
                <span class="inspector-label">
                    <span class="inspector-color" style="background:${colors.backgroundColor}; border: 1px solid ${borderColor}"></span>
                    ${datasetLabel}
                </span>
                <span class="inspector-value">${formatCurrency(rawAmount)}</span>
            </div>
        `;
        html += renderTakeHomeBreakoutIfApplicable(datasetLabel, snap, state);
    });

    html += renderGenericTotalsFooter(total, chart, tooltip, state);
    html += renderTaxChartDetailsFooter(chart, snap);
    return html;
}
