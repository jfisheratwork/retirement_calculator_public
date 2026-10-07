import { escapeHtml } from '../utils/sanitize.js';
import { getState } from '../services/state.js';
import { normalizeDateStr } from '../utils/date.js';

export { escapeHtml };

/**
 * Base Web Component class to provide a foundation for Angular-like components.
 * This class handles standard lifecycle hooks and provides a render method.
 * 
 * // ANGULAR MIGRATION: 
 * // - This entire class will be replaced by Angular's `@Component` decorator.
 * // - `connectedCallback` maps to `ngOnInit`.
 * // - `disconnectedCallback` maps to `ngOnDestroy`.
 * // - The `render` method's string concatenation will be replaced by external `.html` templates.
 */
const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {
    constructor() {}
    getAttribute() { return null; }
    setAttribute() {}
    hasAttribute() { return false; }
    closest() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
};

export class BaseComponent extends BaseElement {
    constructor() {
        super();
        this.subscriptions = [];
        this.state = {};
    }

    getEffectiveState() {
        const inputPanel = this.closest('financial-input-panel') || (typeof document !== 'undefined' ? document.querySelector('financial-input-panel') : null);
        if (inputPanel && typeof inputPanel.getWorkingState === 'function') {
            return inputPanel.getWorkingState();
        }
        return getState();
    }

    connectedCallback() {
        // ANGULAR MIGRATION: ngOnInit()
        this.onInit();
        this.render();
        this._bindDatePickers();
        this.afterRender();
    }

    disconnectedCallback() {
        // ANGULAR MIGRATION: ngOnDestroy()
        this.onDestroy();
        this._clearSubscriptions();
    }

    _clearSubscriptions() {
        if (this.subscriptions && this.subscriptions.length > 0) {
            this.subscriptions.forEach(unsub => {
                try { unsub(); } catch (err) {}
            });
            this.subscriptions = [];
        }
    }

    /**
     * Lifecycle hook called when the component is inserted into the DOM.
     * Override this in child classes.
     */
    onInit() {}

    /**
     * Lifecycle hook called when the component is removed from the DOM.
     * Override this in child classes.
     */
    onDestroy() {}

    _bindDatePickers() {
        this.querySelectorAll('input[type="date"]').forEach(input => {
            input.addEventListener('click', () => {
                if (typeof input.showPicker === 'function') {
                    try { input.showPicker(); } catch (err) {}
                }
            });
            input.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val && typeof val === 'string') {
                    const normalized = normalizeDateStr(val);
                    if (normalized) {
                        const parts = normalized.split('-');
                        const safeVal = `${parts[0]}-${parts[1] || '01'}-01`;
                        if (e.target.value !== safeVal) {
                            e.target.value = safeVal;
                        }
                    }
                }
            });
        });
    }

    /**
     * Lifecycle hook called after the DOM has been rendered via innerHTML.
     * Useful for attaching event listeners.
     * Override this in child classes.
     */
    afterRender() {}

    /**
     * Registers a cleanup function to be called when the component is destroyed.
     * ANGULAR MIGRATION: RxJS Subscription management in ngOnDestroy.
     */
    subscribe(cleanupFn) {
        if (typeof cleanupFn === 'function') {
            this.subscriptions.push(cleanupFn);
        }
    }

    /**
     * Updates local state and triggers a re-render.
     * Note: In a real reactive framework like Angular, this is handled automatically via Zone.js or Signals.
     */
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this._clearSubscriptions();
        this.render();
        this._bindDatePickers();
        this.afterRender();
    }

    /**
     * The template logic. Override in child classes.
     * ANGULAR MIGRATION: This becomes the `templateUrl` or `template` string in @Component.
     */
    getTemplate() {
        return ``;
    }

    /**
     * Replaces the component's innerHTML with the output of getTemplate().
     */
    render() {
        this.innerHTML = this.getTemplate();
    }

    /**
     * Helper to safely attach event listeners that are automatically cleaned up if needed,
     * or just scoped to the component's DOM.
     */
    addEvent(selector, event, handler) {
        const elements = this.querySelectorAll(selector);
        elements.forEach(el => el.addEventListener(event, handler));
        this.subscribe(() => {
            elements.forEach(el => el.removeEventListener(event, handler));
        });
    }

    // --- Shared UI Rendering Primitives ---

    _startSection(title) {
        return `<div class="section-card"><div class="pane-section-header">${title}</div><div class="section-body">`;
    }

    _endSection() {
        return `</div></div>`;
    }

    _renderTooltipButton(tooltip, label) {
        if (!tooltip) return '';
        const cleanLabel = (label || '').replace(/<[^>]*>?/gm, '').trim();
        const escapedTooltip = tooltip.replace(/"/g, '&quot;');
        const escapedTitle = cleanLabel.replace(/"/g, '&quot;');
        return `<button type="button" class="tooltip-trigger" data-tooltip="${escapedTooltip}" data-title="${escapedTitle}" aria-label="Help for ${escapedTitle}">ⓘ</button>`;
    }

    _input(label, path, type='number', value, tooltip='') {
        let val = value !== undefined && value !== null ? value : '';
        if (type === 'date' && typeof val === 'string') {
            const normalized = normalizeDateStr(val);
            val = normalized.length === 7 ? `${normalized}-01` : normalized;
        }
        const aiTarget = path.replace(/\./g, '-');
        const inputId = `field-${aiTarget}`;
        const tooltipBtn = this._renderTooltipButton(tooltip, label);

        let prefix = '';
        let suffix = '';
        const cleanLabel = (label || '').toLowerCase();

        if (type === 'number') {
            if (cleanLabel.includes('(%)') || cleanLabel.includes('rate') || cleanLabel.includes('percent') || cleanLabel.includes('return')) {
                suffix = '%';
            } else if (cleanLabel.includes('($)') || cleanLabel.includes('cost') || cleanLabel.includes('balance') || cleanLabel.includes('salary') || (cleanLabel.includes('bonus') && !cleanLabel.includes('bonus years')) || cleanLabel.includes('lti') || cleanLabel.includes('amount') || cleanLabel.includes('cushion') || cleanLabel.includes('price') || cleanLabel.includes('expense') || path.startsWith('phaseBasedExpensesPerMonth.')) {
                prefix = '$';
            }
        }

        const safeVal = escapeHtml(val);
        let inputHtml = `<input id="${inputId}" type="${type}" data-path="${path}" value="${safeVal}" data-ai-target="${aiTarget}-input" />`;
        if (prefix || suffix) {
            inputHtml = `
                <div class="input-group">
                    ${prefix ? `<span class="input-prefix">${prefix}</span>` : ''}
                    <input id="${inputId}" type="${type}" data-path="${path}" value="${safeVal}" data-ai-target="${aiTarget}-input" />
                    ${suffix ? `<span class="input-suffix">${suffix}</span>` : ''}
                </div>
            `;
        }

        const dateNotice = type === 'date' ? `<span class="helper-note">(Snaps to 1st of month)</span>` : '';

        return `
            <div class="form-group">
                <div class="form-label-row">
                    <label for="${inputId}" data-ai-target="${aiTarget}-label">
                        ${label}
                    </label>
                    ${tooltipBtn}
                </div>
                ${inputHtml}
                ${dateNotice}
            </div>
        `;
    }

    _checkbox(label, path, checked, tooltip='') {
        const aiTarget = path.replace(/\./g, '-');
        const inputId = `chk-${aiTarget}`;
        const tooltipBtn = this._renderTooltipButton(tooltip, label);
        return `
            <div class="checkbox-group">
                <input type="checkbox" id="${inputId}" data-path="${path}" ${checked ? 'checked' : ''} data-ai-target="${aiTarget}-input" />
                <label for="${inputId}" data-ai-target="${aiTarget}-label">${label}</label>
                ${tooltipBtn}
            </div>
        `;
    }
    
    _select(label, path, options, selectedValue, tooltip='') {
        const aiTarget = path.replace(/\./g, '-');
        const selectId = `sel-${aiTarget}`;
        const tooltipBtn = this._renderTooltipButton(tooltip, label);
        return `
            <div class="form-group">
                <div class="form-label-row">
                    <label for="${selectId}" data-ai-target="${aiTarget}-label">
                        ${label}
                    </label>
                    ${tooltipBtn}
                </div>
                <select id="${selectId}" data-path="${path}" data-ai-target="${aiTarget}-select">
                    ${options.map(opt => `<option value="${opt.value}" ${selectedValue == opt.value ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}>${opt.label}</option>`).join('')}
                </select>
            </div>
        `;
    }

    _warningBox(id, initialHtml = '') {
        return `<div id="${id}" class="dynamic-warning-box" style="font-size: 0.75rem; color: #fdcb6e; margin-top: 0.25rem; margin-bottom: 0.5rem; line-height: 1.3; padding: 0.35rem 0.5rem; background: rgba(253, 203, 110, 0.1); border: 1px solid rgba(253, 203, 110, 0.3); border-radius: 4px; ${initialHtml ? '' : 'display: none;'}">${initialHtml}</div>`;
    }
}
