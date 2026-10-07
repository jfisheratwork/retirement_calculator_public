/**
 * Historical Stress-Test Alert Component (SPEC-034)
 * 
 * Renders a slim, compact summary banner indicating historical crash sequence risks,
 * with an interactive accordion that expands to reveal detailed scenario badges on click.
 * 
 * Written with the assistance of Google Gemini
 */

let isStressDetailsExpanded = false;

/**
 * Returns current expansion state of the stress details panel.
 * @returns {boolean}
 */
export function getStressDetailsExpanded() {
    return isStressDetailsExpanded;
}

/**
 * Sets the expansion state of the stress details panel.
 * @param {boolean} expanded 
 */
export function setStressDetailsExpanded(expanded) {
    isStressDetailsExpanded = !!expanded;
}

/**
 * Formats a depleted failure scenario badge.
 * @param {Object} r 
 * @returns {string}
 */
function renderDepletedBadge(r) {
    const tooltip = `${r.name}: Portfolio fully exhausts to $0 in Year ${r.failureYear} `
        + `(Age ${r.failureAge}). Max Drawdown: -${r.maxDrawdownPct}%. Total Shortfall: $${r.totalShortfall.toLocaleString()}`;
    return `
        <div class="stress-badge failure-badge" title="${tooltip}">
            <span>⚠️</span>
            <span><strong>Fails ${r.shortName}:</strong> Depletes in ${r.failureYear} (Age ${r.failureAge})</span>
            <span class="stress-badge-dd">-${r.maxDrawdownPct}% DD</span>
        </div>
    `;
}

/**
 * Formats a pre-59.5 bridge lockout scenario badge.
 * @param {Object} r 
 * @returns {string}
 */
function renderBridgeLockoutBadge(r) {
    const portK = `$${Math.round((r.portfolioAtFailure || 0) / 1000)}k`;
    const tooltip = `${r.name}: Portfolio remains funded with $${(r.portfolioAtFailure || 0).toLocaleString()} `
        + `in assets, but funds are locked in pre-tax accounts (401k/IRA) before age 59½ without active 72(t) SEPP `
        + `or taxable bridge cash. Shortfall during lockout: $${r.totalShortfall.toLocaleString()}.`;
    return `
        <div class="stress-badge bridge-badge" title="${tooltip}">
            <span>⚠️</span>
            <span><strong>Bridge Gap ${r.shortName}:</strong> Pre-59½ Lock at Age ${r.failureAge} (${portK} Portfolio)</span>
            <span class="stress-badge-dd">-${r.maxDrawdownPct}% DD</span>
        </div>
    `;
}

/**
 * Formats a passed historical scenario badge.
 * @param {Object} r 
 * @returns {string}
 */
function renderPassedBadge(r) {
    const tooltip = `${r.name}: 100% Fully Funded. Lowest Portfolio Trough: $${r.minPortfolio.toLocaleString()}. `
        + `Max Drawdown: -${r.maxDrawdownPct}%`;
    const troughK = (r.minPortfolio / 1000).toFixed(0);
    return `
        <div class="stress-badge success-badge" title="${tooltip}">
            <span>✅</span>
            <span><strong>Passes ${r.shortName}</strong></span>
            <span style="font-size: 0.7rem; opacity: 0.75;">(Trough: $${troughK}k)</span>
        </div>
    `;
}

/**
 * Derives presentation summary metadata based on scenario counts.
 * @param {Array} depleted 
 * @param {Array} bridgeGap 
 * @param {Array} passed 
 * @returns {Object}
 */
function computeStressSummary(depleted, bridgeGap, passed) {
    const totalRisks = depleted.length + bridgeGap.length;

    if (totalRisks === 0) {
        return {
            icon: '🛡️',
            title: 'Historical Stress Tests: All Passed',
            subtitle: `All ${passed.length} historical crash scenarios fully funded`,
            tagText: '0 Risks',
            tagClass: 'tag-success',
            severityClass: 'all-passed'
        };
    }

    if (depleted.length > 0) {
        const depStr = `${depleted.length} depletion${depleted.length > 1 ? 's' : ''}`;
        const bgStr = bridgeGap.length > 0 ? `, ${bridgeGap.length} bridge gap${bridgeGap.length > 1 ? 's' : ''}` : '';
        return {
            icon: '⚠️',
            title: 'Historical Stress Risks Found',
            subtitle: `${depStr}${bgStr}`,
            tagText: `${totalRisks} Risks Found`,
            tagClass: 'tag-danger',
            severityClass: 'has-depleted'
        };
    }

    const gapStr = `${bridgeGap.length} scenario${bridgeGap.length > 1 ? 's' : ''} with pre-59½ bridge liquidity gaps`;
    return {
        icon: '⚠️',
        title: 'Historical Stress Risks Found',
        subtitle: gapStr,
        tagText: `${bridgeGap.length} Risks Found`,
        tagClass: 'tag-warning',
        severityClass: 'has-risks'
    };
}

/**
 * Builds HTML for the slim summary bar.
 * @param {Object} summary 
 * @param {boolean} isExpanded 
 * @returns {string}
 */
function renderSummaryBar(summary, isExpanded) {
    const toggleLabel = isExpanded ? 'Hide Details ▴' : 'Show Details ▾';
    const ariaLabel = `${summary.title}: ${summary.subtitle}. Click to toggle detailed historical drawdown badges.`;

    return `
        <div class="stress-summary-bar ${summary.severityClass}" id="btn-toggle-stress-details" 
             role="button" tabindex="0" aria-expanded="${isExpanded}" aria-label="${ariaLabel}">
            <div class="stress-summary-content">
                <span class="stress-summary-icon">${summary.icon}</span>
                <span class="stress-summary-title">${summary.title}:</span>
                <span class="stress-summary-tag ${summary.tagClass}">${summary.tagText}</span>
                <span style="font-size: 0.8rem; color: var(--text-muted); opacity: 0.9;">(${summary.subtitle})</span>
            </div>
            <span class="stress-toggle-btn">${toggleLabel}</span>
        </div>
    `;
}

/**
 * Builds HTML for the expandable details panel.
 * @param {Array} depleted 
 * @param {Array} bridgeGap 
 * @param {Array} passed 
 * @param {boolean} isExpanded 
 * @returns {string}
 */
function renderDetailsPanel(depleted, bridgeGap, passed, isExpanded) {
    if (!isExpanded) {
        return `<div class="stress-details-panel is-collapsed" id="stress-details-panel" style="display: none;"></div>`;
    }

    const depletedHtml = depleted.map(renderDepletedBadge).join('');
    const bridgeHtml = bridgeGap.map(renderBridgeLockoutBadge).join('');
    const passedHtml = passed.map(renderPassedBadge).join('');

    return `
        <div class="stress-details-panel is-expanded" id="stress-details-panel">
            <div class="stress-details-hint">Hover over badges for detailed drawdown analysis</div>
            <div class="stress-badges-grid">
                ${depletedHtml}
                ${bridgeHtml}
                ${passedHtml}
            </div>
        </div>
    `;
}

/**
 * Main render function mounting the stress alert accordion into containerId.
 * @param {string} containerId 
 * @param {Array} stressResults 
 */
export function renderStressAlerts(containerId, stressResults = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!stressResults || stressResults.length === 0) {
        container.innerHTML = '';
        return;
    }

    const depleted = stressResults.filter(r => r.status === 'depleted');
    const bridgeGap = stressResults.filter(r => r.status === 'pre59_lockout');
    const passed = stressResults.filter(r => r.status === 'passed' || (!r.status && r.passed));

    const summary = computeStressSummary(depleted, bridgeGap, passed);

    container.innerHTML = `
        <div class="stress-alerts-wrapper">
            ${renderSummaryBar(summary, isStressDetailsExpanded)}
            ${renderDetailsPanel(depleted, bridgeGap, passed, isStressDetailsExpanded)}
        </div>
    `;

    const toggleBtn = container.querySelector('#btn-toggle-stress-details');
    if (toggleBtn) {
        const handleToggle = () => {
            isStressDetailsExpanded = !isStressDetailsExpanded;
            renderStressAlerts(containerId, stressResults);
        };

        toggleBtn.addEventListener('click', handleToggle);
        toggleBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggle();
            }
        });
    }
}
