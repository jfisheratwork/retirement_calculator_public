/**
 * FIRE Indicator Component
 * 
 * Renders the top-level summary pill displaying milestone crossover years:
 * "🔥 FIRE Milestones: Coast 'XX • Barista 'XX • Lean 'XX • Full 'XX [Explore ➔]"
 * 
 * Written with the assistance of Google Gemini
 */

import { formatAgeString } from '../services/FireMilestoneCalculator.js';

export const NOT_APPLICABLE_LABEL = 'N/A';
export const ACHIEVED_LABEL = 'Now';

/**
 * Formats a milestone into full year and age text (e.g. "2035 (Age 55)" or "2035 (Age 55/56)" or "N/A").
 * @param {Object} milestone 
 * @returns {string}
 */
export function formatMilestoneLabel(milestone) {
    if (!milestone || !milestone.year) {
        return NOT_APPLICABLE_LABEL;
    }
    const ageStr = formatAgeString(milestone.age1 ?? milestone.age, milestone.age2);
    const ageFormatted = ageStr ? ` (${ageStr})` : '';
    return `${milestone.year}${ageFormatted}`;
}

/**
 * Backward compatibility alias for formatMilestoneLabel.
 * @param {Object} milestone 
 * @returns {string}
 */
export function formatMilestoneShort(milestone) {
    return formatMilestoneLabel(milestone);
}

/**
 * Helper to render an individual milestone tag badge.
 * @param {string} label 
 * @param {string} cssClass 
 * @param {Object} milestone 
 * @returns {string}
 */
function renderTag(label, cssClass, milestone) {
    const textStr = formatMilestoneLabel(milestone);
    const ageStr = formatAgeString(milestone?.age1 ?? milestone?.age, milestone?.age2);
    const tooltipText = milestone?.year
        ? `${label} FIRE: Target achieved in ${milestone.year} (${ageStr})${milestone.isAlreadyAchieved ? ' • Achieved' : ''}`
        : `${label} FIRE: Not reached in simulation horizon`;
    return `
        <span class="fire-pill-tag ${cssClass}" title="${tooltipText}">
            <strong>${label}</strong> ${textStr}
        </span>
    `;
}

/**
 * Builds the inner HTML string for the milestone summary pill.
 * @param {Object} milestones 
 * @returns {string}
 */
function buildIndicatorHtml(milestones) {
    const m = milestones || {};
    const coastTag = renderTag('Coast', 'tag-coast', m.coastFire);
    const baristaTag = renderTag('Barista', 'tag-barista', m.baristaFire);
    const leanTag = renderTag('Lean', 'tag-lean', m.leanFire);
    const fullTag = renderTag('Full', 'tag-full', m.fullFire);

    return `
        <div class="fire-summary-pill" id="btn-fire-drawer-trigger" role="button" tabindex="0" 
             title="Click to open the interactive FIRE Milestones Drawer &amp; Trajectory Chart">
            <span class="fire-pill-icon">🔥</span>
            <span class="fire-pill-label">FIRE Milestones:</span>
            <div class="fire-pill-items">
                ${coastTag}
                <span class="fire-pill-sep">•</span>
                ${baristaTag}
                <span class="fire-pill-sep">•</span>
                ${leanTag}
                <span class="fire-pill-sep">•</span>
                ${fullTag}
            </div>
            <span class="fire-pill-action">Explore ➔</span>
        </div>
    `;
}

/**
 * Attaches interactive click & keyboard event listeners to the pill.
 * @param {HTMLElement} element 
 */
function attachTriggerEvents(element) {
    const trigger = element.querySelector('#btn-fire-drawer-trigger');
    if (!trigger) return;

    const handleOpen = () => {
        const drawer = document.getElementById('fire-drawer');
        if (drawer && typeof drawer.open === 'function') {
            drawer.open();
        }
    };

    trigger.addEventListener('click', handleOpen);
    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleOpen();
        }
    });
}

/**
 * Renders the FIRE milestone indicator pill into the specified container.
 * @param {string} containerId - Target element ID
 * @param {Object} milestones - Result from FireMilestoneCalculator.computeMilestones
 */
export function renderFireIndicator(containerId, milestones) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!milestones) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = buildIndicatorHtml(milestones);
    attachTriggerEvents(container);
}
