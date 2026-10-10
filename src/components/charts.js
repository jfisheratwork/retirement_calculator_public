import { escapeHtml } from '../utils/sanitize.js';
import { FinancialPresentationService } from '../services/FinancialPresentationService.js';

let portfolioChart = null;
let incomeChart = null;
let cashflowChart = null;
let taxChart = null;
let netWorthChart = null;
let sorrChart = null;

export { portfolioChart, incomeChart, cashflowChart, taxChart, netWorthChart, sorrChart };

// Configure global Chart.js settings for more prominent hover highlights
if (typeof window !== 'undefined' && window.Chart) {
    window.Chart.defaults.elements.bar.hoverBorderWidth = 3;
    window.Chart.defaults.elements.bar.hoverBorderColor = '#fff';
    window.Chart.defaults.elements.line.hoverBorderWidth = 5;
}

export let pinnedYearIndex = null;
export function setPinnedYearIndex(index) {
    pinnedYearIndex = index;
    if (typeof window !== 'undefined') window.pinnedYearIndex = index;
}
export function getPinnedYearIndex() {
    return pinnedYearIndex;
}
if (typeof window !== 'undefined') {
    window.pinnedYearIndex = null;
}

const fmt = (v) => FinancialPresentationService.formatCurrency(v);

function renderJobBreakoutRows(jobList) {
    if (!jobList || jobList.length === 0) return '';
    let out = '';
    jobList.forEach((job) => {
        const hasAddons = job.bonus > 0 || job.lti > 0;
        const safeTitle = escapeHtml(job.title);
        const safeRange = escapeHtml(job.rangeLabel);
        if (hasAddons) {
            const safeBonus = escapeHtml(job.bonusMonthName || 'Bonus');
            const safeLti = escapeHtml(job.ltiMonthName || 'LTI');
            out += `
                <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                    <span class="inspector-label">↳ ${safeTitle} Base (${safeRange})</span>
                    <span class="inspector-value">${fmt(job.baseSalary)}</span>
                </div>
            `;
            if (job.bonus > 0) {
                out += `
                    <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                        <span class="inspector-label">↳ ${safeTitle} Bonus (${safeBonus})</span>
                        <span class="inspector-value" style="color: var(--success);">+${fmt(job.bonus)}</span>
                    </div>
                `;
            }
            if (job.lti > 0) {
                out += `
                    <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                        <span class="inspector-label">↳ ${safeTitle} LTI (${safeLti})</span>
                        <span class="inspector-value" style="color: var(--success);">+${fmt(job.lti)}</span>
                    </div>
                `;
            }
        } else {
            out += `
                <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                    <span class="inspector-label">↳ ${safeTitle} (${safeRange})</span>
                    <span class="inspector-value">${fmt(job.total)}</span>
                </div>
            `;
        }
    });
    return out;
}

function renderInflowSection(inflows, colorMap) {
    const dot = (label, fallback) =>
        `<span class="inspector-color" style="background:${colorMap[label] || fallback}; border: 1px solid ${colorMap[label] || fallback}"></span>`;
    let html = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Cash Inflows (Income & Distributions)</div>`;

    if (inflows.s1TakeHome > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot(`${inflows.s1Name} Take-Home Pay`, '#27ae60')} ${inflows.s1Name} Take-Home Pay</span><span class="inspector-value">${fmt(inflows.s1TakeHome)}</span></div>`;
        html += renderJobBreakoutRows(inflows.s1Jobs);
    }
    if (inflows.s2TakeHome > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot(`${inflows.s2Name} Take-Home Pay`, '#2ecc71')} ${inflows.s2Name} Take-Home Pay</span><span class="inspector-value">${fmt(inflows.s2TakeHome)}</span></div>`;
        html += renderJobBreakoutRows(inflows.s2Jobs);
    }
    if (inflows.totalSsn > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot(`${inflows.s1Name} SSN`, '#16a085')} Social Security</span><span class="inspector-value">${fmt(inflows.totalSsn)}</span></div>`;
    }
    if (inflows.total72t > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot(`${inflows.s1Name} Rule 72(t)`, '#f39c12')} Rule 72(t) SEPP</span><span class="inspector-value">${fmt(inflows.total72t)}</span></div>`;
    }
    if (inflows.reverseMortgage > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('Reverse Mortgage', '#e67e22')} Standby Home Equity</span><span class="inspector-value">${fmt(inflows.reverseMortgage)}</span></div>`;
    }
    if (inflows.totalDrawdowns > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('Portfolio Distributions', '#fdcb6e')} Portfolio Distributions</span><span class="inspector-value" style="color: #fdcb6e;">+${fmt(inflows.totalDrawdowns)}</span></div>`;
        inflows.drawdownRows.forEach((row) => {
            html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ ${row.label}</span><span class="inspector-value">+${fmt(row.amount)}</span></div>`;
        });
    }

    if (!inflows.hasEarnedIncome) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No earned cash income (Fully retired)</em></span></div>`;
    }

    html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Cash Inflows</span><span class="inspector-value" style="color: var(--success);">${fmt(inflows.totalCashInflows)}</span></div>`;
    html += `</div>`;
    return html;
}

function renderOutflowSection(outflows, colorMap) {
    const dot = (label, fallback) =>
        `<span class="inspector-color" style="background:${colorMap[label] || fallback}; border: 1px solid ${colorMap[label] || fallback}"></span>`;
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Cash Expenses & Outflows</div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('Lifestyle Expenses', '#e74c3c')} Base Lifestyle</span><span class="inspector-value">${fmt(outflows.base)}</span></div>`;
    if (outflows.mortgage > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('Mortgage Payment', '#c0392b')} Mortgage Payment</span><span class="inspector-value">${fmt(outflows.mortgage)}</span></div>`;
    }
    if (outflows.housing > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('Property Tax & Home Maint.', '#d63031')} Property Tax & Insurance</span><span class="inspector-value">${fmt(outflows.housing)}</span></div>`;
    }
    if (outflows.childcare > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('529 College / Dependent Education', '#e84393')} College 529 Tuition</span><span class="inspector-value">${fmt(outflows.childcare)}</span></div>`;
    }
    if (outflows.irmaa > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${dot('Medicare IRMAA', '#e17055')} Medicare IRMAA Surcharges</span><span class="inspector-value">${fmt(outflows.irmaa)}</span></div>`;
    }
    html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Cash Expenses</span><span class="inspector-value" style="color: var(--danger);">${fmt(outflows.totalExpenses)}</span></div>`;
    html += `</div>`;
    return html;
}

function renderSurplusSection(surplus) {
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Net Cash Surplus & Reinvestment</div>`;
    if (surplus.isSurplus) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Net Cash Surplus</span><span class="inspector-value" style="color: var(--success);">+${fmt(surplus.surplusAmount)}</span></div>`;
        html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ Reinvested (${surplus.sweepAccountName})</span><span class="inspector-value" style="color: var(--success);">+${fmt(surplus.surplusAmount)}</span></div>`;
    } else {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Net Cash Deficit</span><span class="inspector-value" style="color: var(--danger);">-${fmt(surplus.deficitAmount)}</span></div>`;
        html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ Liquidated from Portfolio</span><span class="inspector-value" style="color: var(--danger);">-${fmt(surplus.deficitAmount)}</span></div>`;
    }
    html += `</div>`;
    return html;
}

function renderAdditionsSection(additions, state) {
    const s1Name = escapeHtml(state?.primarySpouse?.name || 'Spouse 1');
    const s2Name = escapeHtml(state?.secondarySpouse?.name || 'Spouse 2');
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Portfolio Contributions & Savings</div>`;
    if (additions.s1Payroll401k > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${s1Name} 401(k) Payroll Deferral</span><span class="inspector-value" style="color: var(--success);">+${fmt(additions.s1Payroll401k)}</span></div>`;
    }
    if (additions.s2Payroll401k > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${s2Name} 401(k) Payroll Deferral</span><span class="inspector-value" style="color: var(--success);">+${fmt(additions.s2Payroll401k)}</span></div>`;
    }
    if (additions.s1Match > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${s1Name} Employer Match</span><span class="inspector-value" style="color: var(--success);">+${fmt(additions.s1Match)}</span></div>`;
    }
    if (additions.s2Match > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${s2Name} Employer Match</span><span class="inspector-value" style="color: var(--success);">+${fmt(additions.s2Match)}</span></div>`;
    }
    if (additions.reinvestedSurplus > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Reinvested Cash Surplus</span><span class="inspector-value" style="color: var(--success);">+${fmt(additions.reinvestedSurplus)}</span></div>`;
    }
    if (additions.s1RothConv > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${s1Name} Roth Conversion</span><span class="inspector-value" style="color: var(--secondary);">+${fmt(additions.s1RothConv)}</span></div>`;
    }
    if (additions.s2RothConv > 0) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${s2Name} Roth Conversion</span><span class="inspector-value" style="color: var(--secondary);">+${fmt(additions.s2RothConv)}</span></div>`;
    }
    html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Portfolio Additions</span><span class="inspector-value" style="color: var(--success);">${fmt(additions.totalPortfolioAdditions)}</span></div>`;
    html += `</div>`;
    return html;
}

function renderTaxSection(tax) {
    if (!tax) return '';
    let html = `<div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Federal Tax Profile (${tax.filingStatus})</div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Top Bracket Hit</span><span class="inspector-value">${tax.topBracketPct}%</span></div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Remaining Room</span><span class="inspector-value" style="color: var(--success);">${fmt(tax.bracketRoom)}</span></div>`;
    html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Effective Fed Rate</span><span class="inspector-value">${tax.effectiveRate}%</span></div>`;
    html += `</div>`;
    return html;
}

function renderActivitySection(snap, state) {
    if (!snap.growth)
        return `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No portfolio activity</em></span></div>`;
    let html = '';
    let hasActivity = false;

    const renderGrowth = (name, data) => {
        if (!data) return;
        const interest = Number(data.interest) || 0;
        const contributions = Number(data.contributions) || 0;
        const conversionsIn = Number(data.conversionsIn) || 0;
        const conversionsOut = Number(data.conversionsOut) || 0;
        const rolloverIn = Number(data.rolloverIn) || 0;
        const rolloverOut = Number(data.rolloverOut) || 0;
        const withdrawals = Number(data.withdrawals) || 0;
        const netWithdrawals = Math.max(0, withdrawals - conversionsOut - rolloverOut);

        if (
            interest === 0 &&
            contributions === 0 &&
            conversionsIn === 0 &&
            conversionsOut === 0 &&
            rolloverIn === 0 &&
            rolloverOut === 0 &&
            netWithdrawals === 0
        )
            return;
        hasActivity = true;

        const netActivity =
            interest + contributions + conversionsIn + rolloverIn - conversionsOut - rolloverOut - netWithdrawals;
        const sign = netActivity >= 0 ? '+' : '';
        const color = netActivity >= 0 ? 'var(--success)' : 'var(--danger)';
        html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 6px;"><span class="inspector-label">Activity: ${escapeHtml(name)}</span><span class="inspector-value" style="color: ${color};">${sign}${fmt(netActivity)}</span></div>`;
    };

    const s1Name = escapeHtml(state?.primarySpouse?.name || 'S1');
    const s2Name = escapeHtml(state?.secondarySpouse?.name || 'S2');

    renderGrowth(`${s1Name} 401k`, snap.growth.s1Trad401k);
    renderGrowth(`${s2Name} 401k`, snap.growth.s2Trad401k);
    renderGrowth(`${s1Name} 403b`, snap.growth.s1Trad403b);
    renderGrowth(`${s2Name} 403b`, snap.growth.s2Trad403b);
    renderGrowth(`${s1Name} Std IRA`, snap.growth.s1StandardIra);
    renderGrowth(`${s2Name} Std IRA`, snap.growth.s2StandardIra);
    renderGrowth(`${s1Name} Roth IRA`, snap.growth.s1RothIra);
    renderGrowth(`${s2Name} Roth IRA`, snap.growth.s2RothIra);
    renderGrowth(`${s1Name} HYSA`, snap.growth.s1Hysa);
    renderGrowth(`${s2Name} HYSA`, snap.growth.s2Hysa);
    renderGrowth(`${s1Name} CD`, snap.growth.s1Cd);
    renderGrowth(`${s2Name} CD`, snap.growth.s2Cd);
    renderGrowth(`${s1Name} Brokerage`, snap.growth.s1Brokerage);
    renderGrowth(`${s2Name} Brokerage`, snap.growth.s2Brokerage);
    renderGrowth(`529 College Savings`, snap.growth.college529);
    renderGrowth(`Home Appreciation`, snap.growth.primaryResidenceEquity);

    if (!hasActivity) {
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No portfolio activity</em></span></div>`;
    }
    return html;
}

function renderCashflowInspector(snap, state, points) {
    const colorMap = {};
    points.forEach((item) => {
        colorMap[item.dp.dataset.label] = item.colors.backgroundColor;
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

function renderGenericInspector(chart, tooltip, snap, state, points) {
    let html = '';
    let total = 0;
    points.forEach((item) => {
        const dp = item.dp;
        const colors = item.colors;
        const datasetLabel = dp.dataset.label;
        const val = dp.raw;
        if (val === 0 && datasetLabel !== 'Surplus / Shortfall') return;
        if (
            datasetLabel === 'Total Expenses' ||
            datasetLabel === 'Total Expenses + Taxes' ||
            datasetLabel === 'Total Expenses + Non-W2 Taxes'
        )
            return;

        if (datasetLabel !== 'Total Net Worth' && datasetLabel !== 'Surplus / Shortfall') {
            total += val;
        }
        const formattedVal = fmt(val);

        let rowStyle = '';
        if (chart.canvas.id === 'portfolioChart' && dp.element && dp.element.y !== undefined) {
            if (Math.abs(dp.element.y - tooltip.caretY) < 2) {
                rowStyle =
                    'border: 1px solid #00b894; border-radius: 4px; padding: 2px 4px; background: rgba(0, 184, 148, 0.15); margin: 2px -4px;';
            }
        }

        html += `
            <div class="inspector-row" style="${rowStyle}">
                <span class="inspector-label">
                    <span class="inspector-color" style="background:${colors.backgroundColor}; border: 1px solid ${colors.borderColor || colors.backgroundColor}"></span>
                    ${datasetLabel}
                </span>
                <span class="inspector-value">${formattedVal}</span>
            </div>
        `;

        if (datasetLabel && datasetLabel.includes('Take-Home') && snap) {
            const isS1 = datasetLabel.includes(state?.primarySpouse?.name || 'Spouse 1');
            const jobList = isS1 ? snap.income?.s1?.jobs : snap.income?.s2?.jobs;
            html += renderJobBreakoutRows(jobList);
        }
    });

    let totalNominal = total;
    let totalReal = total;
    const isRealDisplayed = state && state.assumptions && state.assumptions.displayRealDollars;

    if (state && state.assumptions) {
        let yearsFromStart = tooltip.dataPoints[0].dataIndex;
        if (chart.customData && chart.customData[yearsFromStart] && chart.customData[0]) {
            const s = chart.customData[yearsFromStart];
            yearsFromStart = s.year - chart.customData[0].year;
        }
        const multiplier = Math.pow(1 + state.assumptions.inflationRate / 100, yearsFromStart);
        if (isRealDisplayed) {
            totalNominal = total * multiplier;
        } else {
            totalReal = total / multiplier;
        }
    }

    html += `
        <div class="inspector-total">
            <span>Total ${isRealDisplayed ? '(Real)' : '(Nominal)'}</span>
            <span>${fmt(total)}</span>
        </div>
    `;
    if (state && state.assumptions) {
        html += `
            <div class="inspector-total" style="font-size: 0.85rem; color: #64B5F6; border-top: none; padding-top: 0; font-style: italic;">
                <span>${isRealDisplayed ? 'Nominal:' : "Today's Dollars (Real):"}</span>
                <span>${isRealDisplayed ? fmt(totalNominal) : fmt(totalReal)}</span>
            </div>
        `;
    }

    if (chart.canvas.id === 'taxChart' && snap?.taxDetails) {
        html += `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px;">Federal Tax Profile (MFJ)</div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Top Bracket Hit</span><span class="inspector-value">${(snap.taxDetails.topBracketRate * 100).toFixed(1)}%</span></div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Remaining Room</span><span class="inspector-value" style="color: var(--success);">${fmt(snap.taxDetails.remainingRoomInBracket)}</span></div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Effective Fed Rate</span><span class="inspector-value">${(snap.taxDetails.effectiveRate * 100).toFixed(1)}%</span></div>
            </div>
        `;
    }

    return html;
}

const externalTooltipHandler = (context) => {
    const { chart, tooltip } = context;
    const inspector = document.getElementById('chart-inspector');
    if (!inspector) return;

    const isInspectorActive =
        (typeof document !== 'undefined' && document.body?.classList.contains('show-inspector')) ||
        (typeof document !== 'undefined' &&
            document.querySelector('.dashboard-layout')?.classList.contains('show-inspector'));

    if (!isInspectorActive) {
        inspector.classList.add('hidden');
        return;
    }

    // Suppress chart inspector tooltip when the detailed financial snapshot / focus-year drawer is open
    const finDetailsDrawer = typeof document !== 'undefined' && document.getElementById('financial-details-drawer');
    const isFinDetailsOpen = Boolean(
        (finDetailsDrawer && !finDetailsDrawer.classList.contains('hidden')) ||
            (typeof window !== 'undefined' && window.pinnedYearIndex !== null) ||
            pinnedYearIndex !== null
    );
    if (isFinDetailsOpen) {
        inspector.classList.add('hidden');
        return;
    }

    if (tooltip.opacity === 0) {
        inspector.classList.add('hidden');
        return;
    }

    // Dynamic anti-collision docking and vertical chart alignment:
    // If hovering on left half of chart/screen -> dock right
    // If hovering on right half of chart/screen -> dock left
    if (typeof window !== 'undefined' && chart.canvas) {
        const canvasRect = chart.canvas.getBoundingClientRect();
        const caretScreenX = canvasRect.left + (tooltip.caretX || 0);
        const isLeftSide = caretScreenX < window.innerWidth / 2;

        if (isLeftSide) {
            inspector.classList.remove('dock-left');
            inspector.classList.add('dock-right');
        } else {
            inspector.classList.remove('dock-right');
            inspector.classList.add('dock-left');
        }

        // Dynamically align inspector top with hovered chart canvas
        const minTop = 16;
        const maxTop = Math.max(minTop, window.innerHeight - 150);
        const targetTop = Math.max(minTop, Math.min(maxTop, canvasRect.top));
        inspector.style.top = `${targetTop}px`;
        inspector.style.maxHeight = `calc(100vh - ${targetTop + 16}px)`;
    }

    inspector.classList.remove('hidden');

    if (!tooltip.body) return;

    const snap =
        chart.customData && tooltip.dataPoints && tooltip.dataPoints.length > 0
            ? chart.customData[tooltip.dataPoints[0].dataIndex]
            : null;
    const state = chart.customState;

    const titleLines = tooltip.title || [];
    const yearLabel = document.getElementById('inspector-year');
    if (titleLines.length > 0) {
        if (snap && state) {
            yearLabel.textContent = `Year ${titleLines[0]} (${state.primarySpouse.name}: ${snap.age1}, ${state.secondarySpouse.name}: ${snap.age2})`;
        } else {
            yearLabel.textContent = 'Year ' + titleLines[0];
        }
    }

    const content = document.getElementById('inspector-content');
    const points = tooltip.dataPoints.map((dp, i) => ({ dp, colors: tooltip.labelColors[i] }));
    points.sort((a, b) => b.dp.raw - a.dp.raw);

    if ((chart.canvas.id === 'incomeChart' || chart.canvas.id === 'cashflowChart') && chart.customData && snap) {
        content.innerHTML = renderCashflowInspector(snap, state, points);
        return;
    }

    content.innerHTML = renderGenericInspector(chart, tooltip, snap, state, points);
};

function generateAnnotationsConfig(events) {
    const yearEvents = {};
    (events || []).forEach((evt) => {
        if (!evt || evt.type === 'cd_matured' || evt.type === 'cd_rollover') return;
        const yStr = evt.year.toString();
        if (!yearEvents[yStr]) yearEvents[yStr] = { labels: [], color: evt.color || '#e17055' };
        yearEvents[yStr].labels.push(evt.label);
        if (evt.color && yearEvents[yStr].color === '#e17055') {
            yearEvents[yStr].color = evt.color;
        }
    });

    const annotations = {};
    Object.keys(yearEvents).forEach((yStr, idx) => {
        const evtData = yearEvents[yStr];
        const rgbColor =
            evtData.color === '#00b894'
                ? 'rgba(0, 184, 148, 0.9)'
                : evtData.color === '#2d3436'
                  ? 'rgba(45, 52, 54, 0.9)'
                  : 'rgba(225, 112, 85, 0.9)';
        annotations[`line${idx}`] = {
            type: 'line',
            xMin: yStr,
            xMax: yStr,
            borderColor: evtData.color,
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                display: true,
                content: evtData.labels,
                position: 'center',
                yAdjust: (idx % 4) * 20 - 30,
                backgroundColor: rgbColor,
                color: 'white',
                font: { size: 10 }
            }
        };
    });
    return annotations;
}

function handleChartClick(event, activeElements) {
    if (activeElements && activeElements.length > 0) {
        const inspector = document.getElementById('chart-inspector');
        if (inspector) inspector.classList.add('hidden');
        const index = activeElements[0].index;
        const focusYearSelect = document.getElementById('focus-year-select');
        if (focusYearSelect) {
            focusYearSelect.value = index.toString();
            focusYearSelect.dispatchEvent(new Event('change'));
        }
    }
}

function mapData(yearlyData, state, selector) {
    return yearlyData.map((d, i) => {
        let val = selector(d);
        if (state.assumptions.displayRealDollars) {
            val = val / Math.pow(1 + state.assumptions.inflationRate / 100, i);
        }
        return val;
    });
}

export function buildPortfolioConfig(yearlyData, state, labels, annotations, s1Name, s2Name) {
    const totalNetWorth = mapData(
        yearlyData,
        state,
        (d) =>
            (d.balances.s1Brokerage || 0) +
            (d.balances.s2Brokerage || 0) +
            (d.balances.s1Hysa || 0) +
            (d.balances.s2Hysa || 0) +
            (d.balances.s1Cd || 0) +
            (d.balances.s2Cd || 0) +
            (d.balances.s1Hsa || 0) +
            (d.balances.s2Hsa || 0) +
            (d.balances.s1RothIra || 0) +
            (d.balances.s2RothIra || 0) +
            (d.balances.s1Trad401k || 0) +
            (d.balances.s2Trad401k || 0) +
            (d.balances.s1Trad403b || 0) +
            (d.balances.s2Trad403b || 0) +
            (d.balances.s1StandardIra || 0) +
            (d.balances.s2StandardIra || 0) +
            (d.balances.cashCushion || 0) +
            (d.balances.college529 || 0) +
            (d.balances.primaryResidenceEquity || 0)
    );

    const datasets = [
        {
            label: 'Total Net Worth',
            data: totalNetWorth,
            borderColor: '#10b981',
            backgroundColor: '#10b981',
            borderWidth: 2.5,
            fill: false,
            tension: 0.4,
            yAxisID: 'yNetWorth',
            order: 0
        },
        {
            label: 'Cash Cushion',
            data: mapData(yearlyData, state, (d) => d.balances.cashCushion),
            borderColor: '#00b894',
            backgroundColor: '#00b894',
            fill: false,
            tension: 0.4,
            hidden: true
        },
        {
            label: 'High-Yield Savings (HYSA)',
            data: mapData(yearlyData, state, (d) => d.balances.s1Hysa + d.balances.s2Hysa),
            borderColor: '#10ac84',
            backgroundColor: '#10ac84',
            fill: false,
            tension: 0.4,
            hidden: true
        },
        {
            label: 'Certificates of Deposit (CD)',
            data: mapData(yearlyData, state, (d) => (d.balances.s1Cd || 0) + (d.balances.s2Cd || 0)),
            borderColor: '#1dd1a1',
            backgroundColor: '#1dd1a1',
            fill: false,
            tension: 0.4,
            hidden: true
        },
        {
            label: 'Health Savings Account (HSA)',
            data: mapData(yearlyData, state, (d) => (d.balances.s1Hsa || 0) + (d.balances.s2Hsa || 0)),
            borderColor: '#2bcbba',
            backgroundColor: '#2bcbba',
            fill: false,
            tension: 0.4,
            hidden: true
        },
        {
            label: 'Joint Brokerage',
            data: mapData(yearlyData, state, (d) => d.balances.s1Brokerage + d.balances.s2Brokerage),
            borderColor: '#0984e3',
            backgroundColor: '#0984e3',
            fill: false,
            tension: 0.4,
            hidden: true
        },
        {
            label: `${s1Name} Roth IRA`,
            data: mapData(yearlyData, state, (d) => d.balances.s1RothIra),
            borderColor: '#6c5ce7',
            backgroundColor: '#6c5ce7',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s2Name} Roth IRA`,
            data: mapData(yearlyData, state, (d) => d.balances.s2RothIra),
            borderColor: '#a29bfe',
            backgroundColor: '#a29bfe',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s1Name} Trad 401k`,
            data: mapData(yearlyData, state, (d) => d.balances.s1Trad401k),
            borderColor: '#00cec9',
            backgroundColor: '#00cec9',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s2Name} Trad 401k`,
            data: mapData(yearlyData, state, (d) => d.balances.s2Trad401k),
            borderColor: '#81ecec',
            backgroundColor: '#81ecec',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s1Name} 403b`,
            data: mapData(yearlyData, state, (d) => d.balances.s1Trad403b),
            borderColor: '#22a6b3',
            backgroundColor: '#22a6b3',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s2Name} 403b`,
            data: mapData(yearlyData, state, (d) => d.balances.s2Trad403b),
            borderColor: '#7ed6df',
            backgroundColor: '#7ed6df',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s1Name} Std IRA`,
            data: mapData(yearlyData, state, (d) => d.balances.s1StandardIra),
            borderColor: '#be2edd',
            backgroundColor: '#be2edd',
            fill: false,
            tension: 0.4
        },
        {
            label: `${s2Name} Std IRA`,
            data: mapData(yearlyData, state, (d) => d.balances.s2StandardIra),
            borderColor: '#e056fd',
            backgroundColor: '#e056fd',
            fill: false,
            tension: 0.4
        },
        {
            label: 'Home Equity',
            data: mapData(yearlyData, state, (d) => d.balances.primaryResidenceEquity || 0),
            borderColor: '#fdcb6e',
            backgroundColor: '#fdcb6e',
            fill: false,
            tension: 0.4,
            hidden: true
        },
        {
            label: '529 College Savings',
            data: mapData(yearlyData, state, (d) => d.balances.college529 || 0),
            borderColor: '#e17055',
            backgroundColor: '#e17055',
            fill: false,
            tension: 0.4,
            hidden: true
        }
    ];

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: externalTooltipHandler
                },
                annotation: { annotations }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    stacked: false,
                    title: {
                        display: true,
                        text: 'Account Balances',
                        color: '#b2bec3',
                        font: { size: 11, weight: 'bold' }
                    },
                    ticks: {
                        color: '#b2bec3',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                },
                yNetWorth: {
                    type: 'linear',
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'Total Net Worth',
                        color: '#10b981',
                        font: { size: 11, weight: 'bold' }
                    },
                    ticks: {
                        color: '#10b981',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildIncomeConfig(yearlyData, state, labels, annotations, s1Name, s2Name) {
    const datasets = [
        {
            label: `${s1Name} Take-Home Pay`,
            data: mapData(yearlyData, state, (snapshotItem) => {
                if (snapshotItem.income?.s1?.takeHome !== undefined) return snapshotItem.income.s1.takeHome;
                const totalW2 = snapshotItem.income.s1.w2Net + snapshotItem.income.s2.w2Net;
                const share = totalW2 > 0 ? snapshotItem.income.s1.w2Net / totalW2 : 0;
                return snapshotItem.income.s1.w2Net - (snapshotItem.taxDetails?.w2Tax || 0) * share;
            }),
            backgroundColor: '#27ae60',
            stack: 'Income'
        },
        {
            label: `${s2Name} Take-Home Pay`,
            data: mapData(yearlyData, state, (snapshotItem) => {
                if (snapshotItem.income?.s2?.takeHome !== undefined) return snapshotItem.income.s2.takeHome;
                const totalW2 = snapshotItem.income.s1.w2Net + snapshotItem.income.s2.w2Net;
                const share = totalW2 > 0 ? snapshotItem.income.s2.w2Net / totalW2 : 0;
                return snapshotItem.income.s2.w2Net - (snapshotItem.taxDetails?.w2Tax || 0) * share;
            }),
            backgroundColor: '#2ecc71',
            stack: 'Income'
        },
        {
            label: `${s1Name} SSN`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income.s1.ssn),
            backgroundColor: '#16a085',
            stack: 'Income'
        },
        {
            label: `${s2Name} SSN`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income.s2.ssn),
            backgroundColor: '#1abc9c',
            stack: 'Income'
        },
        {
            label: `${s1Name} Rule 72(t)`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income.s1.rule72t),
            backgroundColor: '#f39c12',
            stack: 'Income'
        },
        {
            label: `${s2Name} Rule 72(t)`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income.s2.rule72t),
            backgroundColor: '#f1c40f',
            stack: 'Income'
        },
        {
            label: 'Reverse Mortgage',
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income.reverseMortgage),
            backgroundColor: '#e67e22',
            stack: 'Income'
        },

        // Portfolio Inflow / Drawdown Datasets (Covering Shortfalls)
        {
            label: 'High-Yield Savings (HYSA)',
            data: mapData(
                yearlyData,
                state,
                (snapshotItem) =>
                    (snapshotItem.income?.drawdowns?.s1Hysa || 0) + (snapshotItem.income?.drawdowns?.s2Hysa || 0)
            ),
            backgroundColor: '#10ac84',
            stack: 'Income'
        },
        {
            label: 'Joint Brokerage',
            data: mapData(
                yearlyData,
                state,
                (snapshotItem) =>
                    (snapshotItem.income?.drawdowns?.s1Brokerage || 0) +
                    (snapshotItem.income?.drawdowns?.s2Brokerage || 0)
            ),
            backgroundColor: '#0984e3',
            stack: 'Income'
        },
        {
            label: `${s1Name} Roth IRA`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s1RothIra || 0),
            backgroundColor: '#6c5ce7',
            stack: 'Income'
        },
        {
            label: `${s2Name} Roth IRA`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s2RothIra || 0),
            backgroundColor: '#a29bfe',
            stack: 'Income'
        },
        {
            label: `${s1Name} Trad 401k`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s1Trad401k || 0),
            backgroundColor: '#00cec9',
            stack: 'Income'
        },
        {
            label: `${s2Name} Trad 401k`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s2Trad401k || 0),
            backgroundColor: '#81ecec',
            stack: 'Income'
        },
        {
            label: `${s1Name} 403b`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s1Trad403b || 0),
            backgroundColor: '#22a6b3',
            stack: 'Income'
        },
        {
            label: `${s2Name} 403b`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s2Trad403b || 0),
            backgroundColor: '#7ed6df',
            stack: 'Income'
        },
        {
            label: `${s1Name} Std IRA`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s1StandardIra || 0),
            backgroundColor: '#be2edd',
            stack: 'Income'
        },
        {
            label: `${s2Name} Std IRA`,
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.s2StandardIra || 0),
            backgroundColor: '#e056fd',
            stack: 'Income'
        },
        {
            label: 'Cash Cushion',
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.income?.drawdowns?.cashCushion || 0),
            backgroundColor: '#00b894',
            stack: 'Income'
        },

        {
            label: 'Unfunded Shortfall',
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.unfundedShortfall),
            backgroundColor: '#eb2f06',
            stack: 'Income'
        },

        {
            label: 'Surplus / Shortfall',
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.surplus),
            type: 'line',
            borderColor: '#fdcb6e',
            backgroundColor: '#fdcb6e',
            borderWidth: 2,
            borderDash: [5, 5],
            stack: 'LineSurplus'
        },
        {
            label: 'Total Expenses',
            data: mapData(yearlyData, state, (snapshotItem) => snapshotItem.expenses),
            borderColor: '#eb2f06',
            type: 'line',
            fill: false,
            stack: 'LineExp'
        },
        {
            label: 'Total Expenses + Non-W2 Taxes',
            data: mapData(
                yearlyData,
                state,
                (snapshotItem) => snapshotItem.expenses + (snapshotItem.taxDetails?.nonW2Tax || 0)
            ),
            borderColor: '#ff7675',
            type: 'line',
            fill: false,
            borderDash: [5, 5],
            stack: 'LineExpTax'
        }
    ];

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: externalTooltipHandler
                },
                annotation: { annotations }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#b2bec3',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildCashflowConfig(yearlyData, state, labels, annotations, s1Name, s2Name) {
    const datasets = [
        // INFLOWS (stack: 'Inflows')
        {
            label: `${s1Name} Take-Home Pay`,
            data: mapData(yearlyData, state, (d) => {
                if (d.income?.s1?.takeHome !== undefined) return d.income.s1.takeHome;
                const totalW2 = d.income.s1.w2Net + d.income.s2.w2Net;
                const share = totalW2 > 0 ? d.income.s1.w2Net / totalW2 : 0;
                return Math.max(0, d.income.s1.w2Net - (d.taxDetails?.w2Tax || 0) * share);
            }),
            backgroundColor: '#27ae60',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} Take-Home Pay`,
            data: mapData(yearlyData, state, (d) => {
                if (d.income?.s2?.takeHome !== undefined) return d.income.s2.takeHome;
                const totalW2 = d.income.s1.w2Net + d.income.s2.w2Net;
                const share = totalW2 > 0 ? d.income.s2.w2Net / totalW2 : 0;
                return Math.max(0, d.income.s2.w2Net - (d.taxDetails?.w2Tax || 0) * share);
            }),
            backgroundColor: '#2ecc71',
            stack: 'Inflows'
        },
        {
            label: `${s1Name} SSN`,
            data: mapData(yearlyData, state, (d) => d.income.s1.ssn),
            backgroundColor: '#16a085',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} SSN`,
            data: mapData(yearlyData, state, (d) => d.income.s2.ssn),
            backgroundColor: '#1abc9c',
            stack: 'Inflows'
        },
        {
            label: `${s1Name} Rule 72(t)`,
            data: mapData(yearlyData, state, (d) => d.income.s1.rule72t),
            backgroundColor: '#f39c12',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} Rule 72(t)`,
            data: mapData(yearlyData, state, (d) => d.income.s2.rule72t),
            backgroundColor: '#f1c40f',
            stack: 'Inflows'
        },
        {
            label: 'Reverse Mortgage',
            data: mapData(yearlyData, state, (d) => d.income.reverseMortgage),
            backgroundColor: '#e67e22',
            stack: 'Inflows'
        },

        {
            label: 'High-Yield Savings (HYSA)',
            data: mapData(
                yearlyData,
                state,
                (d) => (d.income.drawdowns.s1Hysa || 0) + (d.income.drawdowns.s2Hysa || 0)
            ),
            backgroundColor: '#10ac84',
            stack: 'Inflows'
        },
        {
            label: 'Joint Brokerage',
            data: mapData(
                yearlyData,
                state,
                (d) => (d.income.drawdowns.s1Brokerage || 0) + (d.income.drawdowns.s2Brokerage || 0)
            ),
            backgroundColor: '#2980b9',
            stack: 'Inflows'
        },
        {
            label: `${s1Name} Roth IRA`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s1RothIra || 0),
            backgroundColor: '#8e44ad',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} Roth IRA`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s2RothIra || 0),
            backgroundColor: '#9b59b6',
            stack: 'Inflows'
        },
        {
            label: `${s1Name} Trad 401k`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s1Trad401k || 0),
            backgroundColor: '#00cec9',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} Trad 401k`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s2Trad401k || 0),
            backgroundColor: '#81ecec',
            stack: 'Inflows'
        },
        {
            label: `${s1Name} 403b`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s1Trad403b || 0),
            backgroundColor: '#22a6b3',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} 403b`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s2Trad403b || 0),
            backgroundColor: '#7ed6df',
            stack: 'Inflows'
        },
        {
            label: `${s1Name} Std IRA`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s1StandardIra || 0),
            backgroundColor: '#be2edd',
            stack: 'Inflows'
        },
        {
            label: `${s2Name} Std IRA`,
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.s2StandardIra || 0),
            backgroundColor: '#e056fd',
            stack: 'Inflows'
        },
        {
            label: 'Cash Cushion',
            data: mapData(yearlyData, state, (d) => d.income.drawdowns.cashCushion || 0),
            backgroundColor: '#00b894',
            stack: 'Inflows'
        },
        {
            label: 'Unfunded Shortfall',
            data: mapData(yearlyData, state, (d) => d.unfundedShortfall),
            backgroundColor: '#eb2f06',
            stack: 'Inflows'
        },

        // OUTFLOWS (stack: 'Outflows')
        {
            label: 'Base Expenses',
            data: mapData(yearlyData, state, (d) => d.expenseBreakdown.base),
            backgroundColor: '#e74c3c',
            stack: 'Outflows'
        },
        {
            label: 'Mortgage Payment',
            data: mapData(yearlyData, state, (d) => d.expenseBreakdown.mortgage),
            backgroundColor: '#a93226',
            stack: 'Outflows'
        },
        {
            label: 'Housing (Tax/Ins/Repairs)',
            data: mapData(yearlyData, state, (d) => d.expenseBreakdown.housing),
            backgroundColor: '#e67e22',
            stack: 'Outflows'
        },
        {
            label: 'Childcare/College',
            data: mapData(yearlyData, state, (d) => d.expenseBreakdown.childcare),
            backgroundColor: '#d35400',
            stack: 'Outflows'
        },
        {
            label: 'Non-W2 Taxes (Conversions/Portfolios)',
            data: mapData(yearlyData, state, (d) => d.taxDetails?.nonW2Tax || 0),
            backgroundColor: '#ff7675',
            stack: 'Outflows'
        },
        {
            label: 'Reinvested to Cushion',
            data: mapData(yearlyData, state, (d) => d.reinvestedToCushion),
            backgroundColor: '#2ecc71',
            stack: 'Outflows'
        },
        {
            label: 'Reinvested to Sweep / Brokerage',
            data: mapData(yearlyData, state, (d) => d.reinvestedToSweep || d.reinvestedToBrokerage),
            backgroundColor: '#3498db',
            stack: 'Outflows'
        }
    ];

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: externalTooltipHandler
                },
                annotation: { annotations }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12,
                        callback: function (value) {
                            const lbl = this.getLabelForValue(value);
                            const dataPoint = yearlyData[value];
                            if (!dataPoint) return lbl;
                            const hasShortfall = dataPoint.unfundedShortfall > 0;
                            return lbl + (hasShortfall ? ' ❌' : ' ✅');
                        }
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#b2bec3',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildNetWorthConfig(yearlyData, state, labels, annotations) {
    const liquidAssets = mapData(
        yearlyData,
        state,
        (d) =>
            (d.balances.s1Brokerage || 0) +
            (d.balances.s2Brokerage || 0) +
            (d.balances.s1Hysa || 0) +
            (d.balances.s2Hysa || 0) +
            (d.balances.s1Cd || 0) +
            (d.balances.s2Cd || 0) +
            (d.balances.s1Hsa || 0) +
            (d.balances.s2Hsa || 0) +
            (d.balances.s1RothIra || 0) +
            (d.balances.s2RothIra || 0) +
            (d.balances.s1Trad401k || 0) +
            (d.balances.s2Trad401k || 0) +
            (d.balances.s1Trad403b || 0) +
            (d.balances.s2Trad403b || 0) +
            (d.balances.s1StandardIra || 0) +
            (d.balances.s2StandardIra || 0) +
            (d.balances.cashCushion || 0)
    );

    const netHomeEquity = mapData(yearlyData, state, (d) => d.balances.primaryResidenceEquity || 0);
    const netWorth = liquidAssets.map((la, i) => la + netHomeEquity[i]);

    const datasets = [
        {
            label: 'Total Net Worth',
            data: netWorth,
            borderColor: '#e17055',
            backgroundColor: 'rgba(225, 112, 85, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Liquid Assets',
            data: liquidAssets,
            borderColor: '#0984e3',
            backgroundColor: 'rgba(9, 132, 227, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Home Equity',
            data: netHomeEquity,
            borderColor: '#fdcb6e',
            backgroundColor: 'rgba(253, 203, 110, 0.1)',
            fill: false,
            tension: 0.4,
            borderDash: [4, 4]
        }
    ];

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                annotation: { annotations }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    ticks: {
                        color: '#b2bec3',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildTaxConfig(yearlyData, state, labels, annotations) {
    const datasets = [
        {
            label: 'Estimated Taxes Paid',
            data: mapData(yearlyData, state, (d) => d.taxes),
            backgroundColor: '#d63031',
            borderRadius: 4
        }
    ];

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                annotation: { annotations }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    ticks: {
                        color: '#b2bec3',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildSorrConfig(sorrData, labels, annotations) {
    let datasets = [];
    if (sorrData.early) {
        datasets = [
            {
                label: 'Early Scenario',
                data: sorrData.early,
                borderColor: '#d63031',
                backgroundColor: 'rgba(214, 48, 49, 0.1)',
                fill: false,
                tension: 0.4,
                borderDash: [5, 5]
            },
            {
                label: 'Mid Scenario',
                data: sorrData.mid,
                borderColor: '#f6b93b',
                backgroundColor: 'rgba(246, 185, 59, 0.1)',
                fill: false,
                tension: 0.4,
                borderDash: [5, 5]
            },
            {
                label: 'Late Scenario',
                data: sorrData.late,
                borderColor: '#00b894',
                backgroundColor: 'rgba(0, 184, 148, 0.1)',
                fill: false,
                tension: 0.4,
                borderDash: [5, 5]
            },
            {
                label: 'Base Assumption',
                data: sorrData.base,
                borderColor: '#0984e3',
                backgroundColor: 'rgba(9, 132, 227, 0.1)',
                fill: false,
                tension: 0.4,
                borderWidth: 3
            }
        ];
    } else {
        datasets = [
            {
                label: 'Base Assumption (General Avg)',
                data: sorrData.base,
                borderColor: '#0984e3',
                backgroundColor: 'rgba(9, 132, 227, 0.1)',
                fill: false,
                tension: 0.4,
                borderWidth: 3
            }
        ];
    }

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                annotation: { annotations }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    ticks: {
                        color: '#b2bec3',
                        callback: (value) => '$' + value / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function applyPinnedHighlight(chart, activePin) {
    if (!chart || activePin === null || activePin === undefined) return;
    try {
        const visibleElements = [];
        chart.data.datasets.forEach((_, i) => {
            if (typeof chart.isDatasetVisible === 'function' && !chart.isDatasetVisible(i)) return;
            const meta = chart.getDatasetMeta(i);
            if (meta && meta.data && meta.data[activePin]) {
                visibleElements.push({ datasetIndex: i, index: activePin });
            }
        });
        if (visibleElements.length > 0) {
            if (typeof chart.setActiveElements === 'function') {
                chart.setActiveElements(visibleElements);
            }
            if (chart.tooltip && typeof chart.tooltip.setActiveElements === 'function') {
                const firstMeta = chart.getDatasetMeta(visibleElements[0].datasetIndex);
                const elem = firstMeta?.data?.[activePin];
                const pointCoord =
                    elem && typeof elem.tooltipPosition === 'function'
                        ? elem.tooltipPosition()
                        : { x: elem?.x || 0, y: elem?.y || 0 };
                chart.tooltip.setActiveElements(visibleElements, pointCoord);
            }
        }
    } catch {
        // Safe fallback if canvas elements are not yet initialized
    }
}

export function renderCharts(yearlyData, state, events = [], sorrData = null) {
    if (!yearlyData || yearlyData.length === 0) return;

    const labels = yearlyData.map((d) => d.year.toString());
    const s1Name = escapeHtml(state.primarySpouse?.name || 'Spouse 1');
    const s2Name = escapeHtml(state.secondarySpouse?.name || 'Spouse 2');
    const annotations = generateAnnotationsConfig(events);
    const activePin =
        pinnedYearIndex !== null ? pinnedYearIndex : typeof window !== 'undefined' ? window.pinnedYearIndex : null;

    // 1. Portfolio Chart
    const ctxPortfolio = document.getElementById('portfolioChart');
    if (ctxPortfolio) {
        const config = buildPortfolioConfig(yearlyData, state, labels, annotations, s1Name, s2Name);
        if (portfolioChart) {
            portfolioChart.data = config.data;
            portfolioChart.options = config.options;
            portfolioChart.customData = yearlyData;
            portfolioChart.customState = state;
            portfolioChart.update('none');
            applyPinnedHighlight(portfolioChart, activePin);
        } else {
            portfolioChart = new Chart(ctxPortfolio.getContext('2d'), config);
            portfolioChart.customData = yearlyData;
            portfolioChart.customState = state;
            applyPinnedHighlight(portfolioChart, activePin);
        }
    }

    // 2. Income vs Expenses
    const ctxIncome = document.getElementById('incomeChart');
    if (ctxIncome) {
        const config = buildIncomeConfig(yearlyData, state, labels, annotations, s1Name, s2Name);
        if (incomeChart) {
            incomeChart.data = config.data;
            incomeChart.options = config.options;
            incomeChart.customData = yearlyData;
            incomeChart.customState = state;
            incomeChart.update('none');
            applyPinnedHighlight(incomeChart, activePin);
        } else {
            incomeChart = new Chart(ctxIncome.getContext('2d'), config);
            incomeChart.customData = yearlyData;
            incomeChart.customState = state;
            applyPinnedHighlight(incomeChart, activePin);
        }
    }

    // 2b. Inflows vs Outflows (Cashflow)
    const ctxCashflow = document.getElementById('cashflowChart');
    if (ctxCashflow) {
        const config = buildCashflowConfig(yearlyData, state, labels, annotations, s1Name, s2Name);
        if (cashflowChart) {
            cashflowChart.data = config.data;
            cashflowChart.options = config.options;
            cashflowChart.customState = state;
            cashflowChart.update('none');
        } else {
            cashflowChart = new Chart(ctxCashflow.getContext('2d'), config);
            cashflowChart.customState = state;
        }
    }

    // 4. Liquid Assets vs Net Worth
    const ctxNetWorth = document.getElementById('netWorthChart');
    if (ctxNetWorth) {
        const config = buildNetWorthConfig(yearlyData, state, labels, annotations);
        if (netWorthChart) {
            netWorthChart.data = config.data;
            netWorthChart.options = config.options;
            netWorthChart.customState = state;
            netWorthChart.update('none');
        } else {
            netWorthChart = new Chart(ctxNetWorth.getContext('2d'), config);
            netWorthChart.customState = state;
        }
    }

    // 5. Tax Burden Over Time
    const ctxTax = document.getElementById('taxChart');
    if (ctxTax) {
        const config = buildTaxConfig(yearlyData, state, labels, annotations);
        if (taxChart) {
            taxChart.data = config.data;
            taxChart.options = config.options;
            taxChart.customData = yearlyData;
            taxChart.customState = state;
            taxChart.update('none');
        } else {
            taxChart = new Chart(ctxTax.getContext('2d'), config);
            taxChart.customData = yearlyData;
            taxChart.customState = state;
        }
    }

    // 6. SORR Fan Chart
    const ctxSorr = document.getElementById('sorrChart');
    if (ctxSorr && sorrData) {
        const config = buildSorrConfig(sorrData, labels, annotations);
        if (sorrChart) {
            sorrChart.data = config.data;
            sorrChart.options = config.options;
            sorrChart.customState = state;
            sorrChart.update('none');
        } else {
            sorrChart = new Chart(ctxSorr.getContext('2d'), config);
            sorrChart.customState = state;
        }
    }
}

/**
 * Programmatically scrolls to and triggers tooltip highlight on a specific chart and year.
 * @param {string} chartKey - 'chart1' | 'chart2' | 'chart3' | 'chart4' | 'chart6'
 * @param {number|string} year - Calendar year (e.g. 2035)
 */
export function highlightChartPoint(chartKey, year) {
    const chartMap = {
        chart1: portfolioChart,
        portfolioChart: portfolioChart,
        chart2: cashflowChart || incomeChart,
        cashflowChart: cashflowChart || incomeChart,
        incomeChart: incomeChart,
        chart3: taxChart,
        taxChart: taxChart,
        chart4: netWorthChart,
        netWorthChart: netWorthChart,
        chart6: sorrChart,
        sorrChart: sorrChart
    };

    const targetChart = chartMap[chartKey] || portfolioChart;
    if (!targetChart || !targetChart.data || !targetChart.data.labels) return;

    const labels = targetChart.data.labels;
    const yearStr = String(year);
    const dataIndex = labels.findIndex((lbl) => String(lbl) === yearStr);
    if (dataIndex === -1) return;

    const canvas = targetChart.canvas;
    if (canvas) {
        canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const card = canvas.closest('.chart-card');
        if (card) {
            card.classList.remove('ai-highlight-pulse');
            void card.offsetWidth;
            card.classList.add('ai-highlight-pulse');
            setTimeout(() => card.classList.remove('ai-highlight-pulse'), 5000);
        }
    }

    function _getElementPointCoord(elem) {
        if (!elem) return { x: 0, y: 0 };
        if (typeof elem.tooltipPosition === 'function') {
            return elem.tooltipPosition();
        }
        if (elem.x !== undefined && elem.y !== undefined) {
            return { x: elem.x, y: elem.y };
        }
        return { x: 0, y: 0 };
    }

    if (targetChart && typeof targetChart.setActiveElements === 'function') {
        try {
            const meta = targetChart.getDatasetMeta(0);
            const elem = meta?.data?.[dataIndex];
            const pointCoord = _getElementPointCoord(elem);

            targetChart.setActiveElements([{ datasetIndex: 0, index: dataIndex }]);
            if (targetChart.tooltip) {
                targetChart.tooltip.setActiveElements([{ datasetIndex: 0, index: dataIndex }], pointCoord);
            }
            targetChart.update();
        } catch (e) {
            console.warn('Could not programmatically trigger chart tooltip:', e);
        }
    }
}

// Attach globally for backwards compatibility (browser environment)
if (typeof window !== 'undefined') {
    window.highlightChartPoint = highlightChartPoint;
}
