/**
 * Terminal Surplus Pull-Forward Banner & Studio Component (SPEC-068 / SPEC-072)
 *
 * Renders:
 * 1. Dashboard Compact Single-Line Insight Row (`#pull-forward-banner`) inside `#insights-box`
 *    with the exact same font and pill layout as FIRE Milestones and Stress Alerts.
 * 2. Interactive Pull-Forward & Bridge Studio section inside `what-if-drawer.js` (reserving
 *    detailed prose and bullets for the open studio).
 *
 * Written with the assistance of Google Gemini
 */

import { escapeHtml } from '../utils/sanitize.js';

const MILLION = 1000000;
const THOUSAND = 1000;

export function formatCompactCurrency(val) {
    const num = Math.abs(Number(val) || 0);
    if (num >= MILLION) {
        return `$${(num / MILLION).toFixed(2)}M`;
    }
    if (num >= THOUSAND) {
        return `$${Math.round(num / THOUSAND)}k`;
    }
    return `$${Math.round(num).toLocaleString()}`;
}

function buildStudioBullets(report) {
    const bullets = [];
    const lockout = report.liquidityLockout;
    if (lockout?.hasLockoutGap) {
        const bestBridge =
            lockout.bridgeSolutions?.find((b) => b.feasibility === 'immediate') || lockout.bridgeSolutions?.[0];
        if (bestBridge) {
            bullets.push(
                `<li><strong>Solve ${lockout.firstGapYear} Gap (${formatCompactCurrency(lockout.maxAnnualShortfall)}):</strong> ${escapeHtml(bestBridge.title)} (<em>${escapeHtml(bestBridge.statutoryReference)}</em>)</li>`
            );
        }
    }

    const downshift = report.downshiftOpportunities?.find((d) => d.yearsReclaimed > 0 && d.isTerminalSafe);
    if (downshift) {
        bullets.push(
            `<li><strong>Downshift Earlier:</strong> ${escapeHtml(downshift.spouseName)} can transition to low-stress work <strong>${downshift.yearsReclaimed} yrs earlier</strong> (Age ${downshift.earliestDownshiftAge} in ${downshift.earliestDownshiftYear})</li>`
        );
    }

    const accel = report.retirementAcceleration;
    if (accel?.yearsAccelerated > 0 && accel.legacyTargetRespected) {
        bullets.push(
            `<li><strong>Accelerate Retirement:</strong> Retire <strong>${accel.yearsAccelerated} yrs earlier</strong> (${accel.earliestSafeRetirementYearPrimary}) while preserving ${formatCompactCurrency(accel.projectedTerminalNetWorth)} terminal wealth</li>`
        );
    }

    return bullets.join('');
}

function buildStudioHeadline(report) {
    const s = report.surplusAnalysis;
    const l = report.liquidityLockout;
    const surplusStr = formatCompactCurrency(s.excessTerminalSurplusNominal);
    const realStr = formatCompactCurrency(s.excessTerminalSurplusReal);

    if (l?.hasLockoutGap && s?.isOverfunded) {
        return `You are projected for a <strong>${surplusStr}</strong> surplus (${realStr} in today's dollars) by ${report.householdEndYear}, yet face a <strong>-${formatCompactCurrency(l.maxAnnualShortfall)}</strong> pre-59½ liquidity lockout in ${l.firstGapYear} because funds are sheltered in retirement accounts.`;
    }
    if (l?.hasLockoutGap) {
        return `A <strong>-${formatCompactCurrency(l.maxAnnualShortfall)}</strong> pre-59½ liquidity lockout is detected in ${l.firstGapYear} while pre-tax accounts hold abundant reserves.`;
    }
    return `You are on track for a <strong>${surplusStr}</strong> terminal surplus (${realStr} in today's purchasing power) by ${report.householdEndYear}—life energy you can pull forward today.`;
}

function buildCompactSummaryPills(report) {
    const pills = [];
    const s = report.surplusAnalysis;
    const l = report.liquidityLockout;

    if (s?.isOverfunded) {
        const surplusStr = formatCompactCurrency(s.excessTerminalSurplusNominal);
        const realStr = formatCompactCurrency(s.excessTerminalSurplusReal);
        pills.push(`
            <div class="fire-pill achieved" title="Excess Terminal Surplus at ${report.householdEndYear}: +${surplusStr} Nominal (${realStr} in Today's Purchasing Power)">
                <span>💰 Surplus:</span>
                <strong>+${surplusStr} (${realStr} Real)</strong>
            </div>
        `);
    }

    if (l?.hasLockoutGap) {
        pills.push(`
            <div class="fire-pill" style="background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.4); color: var(--whatif-warn-text, #fde68a);" title="Pre-59½ Liquidity Lockout in ${l.firstGapYear}: -${formatCompactCurrency(l.maxAnnualShortfall)} shortfall while retirement accounts hold reserves">
                <span>⚠️ ${l.firstGapYear} Gap:</span>
                <strong style="color: var(--warning, #fbbf24);">-${formatCompactCurrency(l.maxAnnualShortfall)}</strong>
            </div>
        `);
    }

    const downshift = report.downshiftOpportunities?.find((d) => d.yearsReclaimed > 0 && d.isTerminalSafe);
    if (downshift) {
        pills.push(`
            <div class="fire-pill achieved" title="${escapeHtml(downshift.spouseName)} can downshift in ${downshift.earliestDownshiftYear} (Age ${downshift.earliestDownshiftAge})">
                <span>☕ Downshift:</span>
                <strong>${downshift.yearsReclaimed} yrs Earlier</strong>
            </div>
        `);
    }

    const accel = report.retirementAcceleration;
    if (accel?.yearsAccelerated > 0 && accel.legacyTargetRespected) {
        pills.push(`
            <div class="fire-pill achieved" title="Earliest safe full retirement in ${accel.earliestSafeRetirementYearPrimary}">
                <span>🎯 Retire:</span>
                <strong>${accel.yearsAccelerated} yrs Earlier (${accel.earliestSafeRetirementYearPrimary})</strong>
            </div>
        `);
    }

    return pills.join('');
}

/**
 * Renders the Compact Single-Line Pull-Forward Insight Row into `containerId` (SPEC-072).
 * Retains identical font and single-line pill styling as `fire-indicator.js` and `stress-alerts.js`.
 * @param {string} containerId
 * @param {Object} report - SurplusOpportunityReport
 * @param {Function} [onOpenStudio] - Callback to open the What-If Pull-Forward Studio
 */
export function renderPullForwardBanner(containerId, report, onOpenStudio = null) {
    const container = typeof document !== 'undefined' ? document.getElementById(containerId) : null;
    if (!container) return;

    const shouldRender = Boolean(report?.surplusAnalysis?.isOverfunded || report?.liquidityLockout?.hasLockoutGap);
    if (!shouldRender) {
        container.innerHTML = '';
        return;
    }

    const pillsHtml = buildCompactSummaryPills(report);

    container.innerHTML = `
        <div class="fire-indicator-bar pull-forward-banner" id="btn-open-pull-forward-studio" role="button" tabindex="0"
             aria-label="Pull-Forward Opportunity Insight. Click to open Pull-Forward Studio in What-If Drawer">
            <div class="fire-bar-title">
                <span>💡</span>
                <span>Pull-Forward Opportunity:</span>
            </div>
            <div class="fire-pills-row">
                ${pillsHtml}
            </div>
            <span class="fire-explore-btn">Open Studio ➔</span>
        </div>
    `;

    const barEl = container.querySelector('#btn-open-pull-forward-studio');
    if (barEl && typeof onOpenStudio === 'function') {
        const triggerOpen = () => onOpenStudio();
        barEl.addEventListener('click', triggerOpen);
        barEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                triggerOpen();
            }
        });
    }
}

function renderBridgeOptionCard(opt) {
    const badgeColor =
        opt.feasibility === 'immediate'
            ? 'var(--success)'
            : opt.feasibility === 'action_required'
              ? 'var(--warning)'
              : 'var(--text-muted)';
    const badgeLabel =
        opt.feasibility === 'immediate'
            ? 'Ready to Apply'
            : opt.feasibility === 'action_required'
              ? 'Available'
              : 'Ineligible';
    const disabledAttr = opt.feasibility === 'ineligible' ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : '';

    return `
        <div class="pull-forward-option-card" style="padding: 0.65rem; margin-bottom: 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.4rem;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.25rem;">
                <strong style="font-size: 0.82rem; color: var(--text-main);">${escapeHtml(opt.title)}</strong>
                <span style="font-size: 0.7rem; font-weight: 700; color: ${badgeColor}; white-space: nowrap;">${badgeLabel}</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--accent); margin-bottom: 0.3rem;">${escapeHtml(opt.statutoryReference)} • Tax/Penalty Saved: ~${formatCompactCurrency(opt.estimatedTaxPenaltySavings)}</div>
            <p style="margin: 0 0 0.5rem 0; font-size: 0.76rem; line-height: 1.35; color: var(--text-muted);">${escapeHtml(opt.description)}</p>
            <button type="button" class="btn btn-secondary btn-apply-bridge-fix" data-bridge-id="${escapeHtml(opt.id)}" ${disabledAttr} style="width: 100%; font-size: 0.75rem; padding: 0.35rem;">
                Apply ${escapeHtml(opt.title)}
            </button>
        </div>
    `;
}

export function renderPathwayABody(report) {
    const lockout = report.liquidityLockout;
    const solutions = (lockout?.bridgeSolutions || []).filter((opt) => opt.feasibility !== 'ineligible');
    const cardsHtml = solutions.map(renderBridgeOptionCard).join('');

    if (lockout?.hasLockoutGap) {
        return `
            <div style="padding: 0.5rem; margin-bottom: 0.6rem; background: var(--surface); border: 1.5px solid var(--danger); border-radius: 0.35rem; font-size: 0.78rem; color: var(--danger);">
                ⚠️ <strong>${lockout.firstGapYear} Pre-59½ Lockout Gap:</strong> ${formatCompactCurrency(lockout.maxAnnualShortfall)}/yr (${lockout.gapDurationYears} yr duration)
            </div>
            ${cardsHtml}
        `;
    }

    return `
        <div class="whatif-bridge-success" style="padding: 0.65rem; margin-bottom: 0.6rem; background: var(--surface); border: 1.5px solid var(--success); border-radius: 0.4rem; font-size: 0.78rem; color: var(--success); line-height: 1.4;">
            🟢 <strong>Zero Pre-59½ Lockout Gaps:</strong> Pre-retirement liquidity bridge is fully funded. Taxable accounts, cash cushion, and Roth principal cover all spending prior to age 59½ with $0 early penalty exposure.
        </div>
        ${
            cardsHtml
                ? `<details class="whatif-bridge-accordion" style="margin-top: 0.5rem;">
                    <summary style="cursor: pointer; font-size: 0.75rem; font-weight: 600; color: var(--primary); padding: 0.3rem 0;">Explore Optional Bridge Strategies (${solutions.length} Available)</summary>
                    <div style="margin-top: 0.5rem;">${cardsHtml}</div>
                </details>`
                : ''
        }
    `;
}

export function renderPathwayBBody(report) {
    const list = report.downshiftOpportunities || [];
    if (list.length === 0) {
        return `<p style="font-size: 0.78rem; color: var(--text-muted);">No career downshift candidates found in active profile.</p>`;
    }

    return list
        .map((d) => {
            const canShift = d.yearsReclaimed > 0 && d.isTerminalSafe;
            return `
            <div style="padding: 0.65rem; margin-bottom: 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.4rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                    <strong style="font-size: 0.82rem; color: var(--text-main);">${escapeHtml(d.spouseName)} Barista / Coast Shift</strong>
                    <span style="font-size: 0.75rem; font-weight: 700; color: ${canShift ? 'var(--success)' : 'var(--text-muted)'};">
                        ${canShift ? `${d.yearsReclaimed} Yrs Earlier` : 'At Baseline'}
                    </span>
                </div>
                <p style="margin: 0 0 0.5rem 0; font-size: 0.76rem; color: var(--text-muted); line-height: 1.35;">
                    Downshift to $${d.assumedDownshiftSalary.toLocaleString()}/yr in <strong>${d.earliestDownshiftYear} (Age ${d.earliestDownshiftAge})</strong> instead of working high-stress until ${d.baselineRetirementYear}. Projected ending wealth: <strong>${formatCompactCurrency(d.projectedTerminalNetWorth)}</strong>.
                </p>
                ${
                    canShift
                        ? `<button type="button" class="btn btn-primary btn-apply-downshift" data-spouse-key="${escapeHtml(d.targetSpouseKey)}" data-shift-year="${d.earliestDownshiftYear}" data-shift-salary="${d.assumedDownshiftSalary}" style="width: 100%; font-size: 0.75rem; padding: 0.35rem;">Apply ${d.earliestDownshiftYear} Downshift to Plan</button>`
                        : ''
                }
            </div>
        `;
        })
        .join('');
}

export function renderPathwayCBody(report) {
    const accel = report.retirementAcceleration;
    if (!accel) return '';
    const canAccelerate = accel.yearsAccelerated > 0 && accel.legacyTargetRespected;

    return `
        <div style="padding: 0.65rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.4rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.3rem;">
                <strong style="font-size: 0.84rem; color: var(--text-main);">Earliest Safe Full Retirement</strong>
                <span style="font-size: 0.78rem; font-weight: 700; color: ${canAccelerate ? 'var(--success)' : 'var(--text-muted)'};">
                    ${canAccelerate ? `Retire ${accel.yearsAccelerated} Yrs Earlier!` : 'Baseline Optimal'}
                </span>
            </div>
            <p style="margin: 0 0 0.5rem 0; font-size: 0.76rem; color: var(--text-muted); line-height: 1.4;">
                ${
                    canAccelerate
                        ? `Pull full retirement forward from <strong>${accel.baselineRetirementYearPrimary}</strong> to <strong>${accel.earliestSafeRetirementYearPrimary}</strong> while maintaining <strong>${formatCompactCurrency(accel.projectedTerminalNetWorth)}</strong> at ${report.householdEndYear}.`
                        : `Current retirement timeline (${accel.baselineRetirementYearPrimary}) is already calibrated to your desired legacy reserve.`
                }
            </p>
            ${
                canAccelerate
                    ? `<button type="button" id="btn-apply-retire-acceleration" class="btn btn-primary" data-years-accel="${accel.yearsAccelerated}" style="width: 100%; font-size: 0.76rem; padding: 0.4rem;">Retire ${accel.yearsAccelerated} Years Earlier (${accel.earliestSafeRetirementYearPrimary})</button>`
                    : ''
            }
        </div>
    `;
}

/**
 * Renders the interactive Pull-Forward & Bridge Studio HTML for WhatIfDrawer.
 * Detail narrative text and bullets are reserved for this open studio view (SPEC-072).
 * @param {Object} report - SurplusOpportunityReport
 * @param {string} [activeTab='bridge'] - 'bridge' | 'downshift' | 'retire'
 * @returns {string} HTML string
 */
export function renderPullForwardStudioSection(report, activeTab = 'bridge') {
    if (!report?.surplusAnalysis) return '';
    const s = report.surplusAnalysis;
    const headlineHtml = buildStudioHeadline(report);
    const bulletsHtml = buildStudioBullets(report);
    const tabBody =
        activeTab === 'downshift'
            ? renderPathwayBBody(report)
            : activeTab === 'retire'
              ? renderPathwayCBody(report)
              : renderPathwayABody(report);

    return `
        <div class="what-if-section pull-forward-studio-section" style="border: 1px solid rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.04);">
            <div class="what-if-section-header">
                <span class="what-if-section-icon">🌉</span>
                <h4>Pull-Forward & Bridge Studio</h4>
            </div>
            <div class="pull-forward-studio-detail-summary" style="margin-bottom: 0.75rem; padding: 0.6rem 0.75rem; background: rgba(251, 191, 36, 0.08); border-left: 3px solid var(--warning); border-radius: 0.35rem;">
                <p style="margin: 0 0 0.4rem 0; font-size: 0.78rem; line-height: 1.4; color: var(--text-color);">
                    ${headlineHtml}
                </p>
                ${
                    bulletsHtml
                        ? `<ul style="margin: 0; padding-left: 1.1rem; font-size: 0.74rem; line-height: 1.45; color: var(--text-muted);">${bulletsHtml}</ul>`
                        : ''
                }
            </div>

            <div class="what-if-control-group" style="margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                    <label for="slider-legacy-reserve" style="font-size: 0.8rem; font-weight: 600; color: var(--text-color);">Desired Legacy Reserve:</label>
                    <span class="what-if-value-badge" id="lbl-legacy-reserve">${formatCompactCurrency(s.desiredLegacyBuffer)}</span>
                </div>
                <input type="range" class="what-if-slider" id="slider-legacy-reserve" min="0" max="5000000" step="100000" value="${s.desiredLegacyBuffer}">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">
                    <span>Terminal: <strong>${formatCompactCurrency(s.terminalNetWorthNominal)}</strong></span>
                    <span>Surplus: <strong style="color: var(--success);">${formatCompactCurrency(s.excessTerminalSurplusNominal)}</strong> (${formatCompactCurrency(s.excessTerminalSurplusReal)} real)</span>
                </div>
            </div>

            <div class="what-if-chips-row pull-forward-tabs" style="margin-bottom: 0.65rem;">
                <button type="button" class="what-if-chip pf-tab-btn ${activeTab === 'bridge' ? 'active' : ''}" data-pf-tab="bridge">1. Bridge Gap</button>
                <button type="button" class="what-if-chip pf-tab-btn ${activeTab === 'downshift' ? 'active' : ''}" data-pf-tab="downshift">2. Downshift</button>
                <button type="button" class="what-if-chip pf-tab-btn ${activeTab === 'retire' ? 'active' : ''}" data-pf-tab="retire">3. Retire Early</button>
            </div>

            <div class="pull-forward-tab-body">
                ${tabBody}
            </div>
        </div>
    `;
}
