/**
 * Global Tooltip & Interactive Guide Popover Service
 *
 * Provides interactive, substantial floating tooltips with heavy rounded borders,
 * clear typography, and responsive positioning for all parameter inputs and settings.
 */

let tooltipElement = null;
let activeTrigger = null;
let isPinned = false;
let hoverTimer = null;

function getTooltipElement() {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.id = 'global-tooltip-popover';
        tooltipElement.className = 'global-tooltip-popover hidden';
        tooltipElement.setAttribute('role', 'tooltip');
        tooltipElement.innerHTML = `
            <div class="tooltip-header">
                <span class="tooltip-title">💡 Parameter Guide</span>
                <button type="button" class="tooltip-close-btn" aria-label="Close tooltip">&times;</button>
            </div>
            <div class="tooltip-body"></div>
        `;
        document.body.appendChild(tooltipElement);

        const closeBtn = tooltipElement.querySelector('.tooltip-close-btn');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideTooltip(true);
        });

        tooltipElement.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    return tooltipElement;
}

export function showTooltip(triggerEl, text, title = '', pinned = false) {
    if (!text) return;
    const tooltip = getTooltipElement();
    const titleEl = tooltip.querySelector('.tooltip-title');
    const bodyEl = tooltip.querySelector('.tooltip-body');

    titleEl.textContent = title ? `💡 ${title}` : '💡 Parameter Guide';
    bodyEl.textContent = text;

    tooltip.classList.remove('hidden');
    activeTrigger = triggerEl;
    isPinned = pinned;

    positionTooltip(triggerEl, tooltip);
}

export function hideTooltip(force = false) {
    if (!tooltipElement) return;
    if (isPinned && !force) return;

    tooltipElement.classList.add('hidden');
    activeTrigger = null;
    isPinned = false;
}

function positionTooltip(triggerEl, tooltip) {
    const triggerRect = triggerEl.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;

    let top = triggerRect.bottom + margin;
    let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

    // If overflowing bottom, position above trigger
    if (top + tooltipRect.height > viewportHeight - margin) {
        top = triggerRect.top - tooltipRect.height - margin;
    }

    // Keep within horizontal screen bounds
    if (left < margin) {
        left = margin;
    } else if (left + tooltipRect.width > viewportWidth - margin) {
        left = viewportWidth - tooltipRect.width - margin;
    }

    // Fallback if top goes above viewport
    if (top < margin) {
        top = margin;
    }

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
}

export function initGlobalTooltips() {
    getTooltipElement();

    // Global document event listeners
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.tooltip-trigger');
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();

            const text = trigger.getAttribute('data-tooltip') || trigger.getAttribute('title') || '';
            const title = trigger.getAttribute('data-title') || '';

            if (activeTrigger === trigger && isPinned) {
                hideTooltip(true);
            } else {
                showTooltip(trigger, text, title, true);
            }
            return;
        }

        // Clicking outside closes pinned tooltip
        if (tooltipElement && !tooltipElement.classList.contains('hidden') && !tooltipElement.contains(e.target)) {
            hideTooltip(true);
        }
    });

    document.addEventListener('mouseover', (e) => {
        const trigger = e.target.closest('.tooltip-trigger');
        if (trigger && (!isPinned || activeTrigger !== trigger)) {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                const text = trigger.getAttribute('data-tooltip') || trigger.getAttribute('title') || '';
                const title = trigger.getAttribute('data-title') || '';
                if (text && !isPinned) {
                    showTooltip(trigger, text, title, false);
                }
            }, 120);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const trigger = e.target.closest('.tooltip-trigger');
        if (trigger && !isPinned) {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                hideTooltip(false);
            }, 100);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && tooltipElement && !tooltipElement.classList.contains('hidden')) {
            hideTooltip(true);
        }
    });

    window.addEventListener('resize', () => {
        if (activeTrigger && tooltipElement && !tooltipElement.classList.contains('hidden')) {
            positionTooltip(activeTrigger, tooltipElement);
        }
    });
}
