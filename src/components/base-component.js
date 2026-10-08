import { escapeHtml } from '../utils/sanitize.js';
import { getState } from '../services/state.js';
import { normalizeDateStr, parseDateParts } from '../utils/date.js';

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
        this._bindMonthYearControls();
        this._bindValidation();
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
                try { unsub(); } catch {}
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
                    try { input.showPicker(); } catch {}
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

    _bindMonthYearControls() {
        this.querySelectorAll('.month-year-group').forEach(group => {
            const monthSelect = group.querySelector('.month-part');
            const yearInput = group.querySelector('.year-part');
            const hiddenInput = group.querySelector('input[type="hidden"]');
            if (!monthSelect || !yearInput || !hiddenInput) return;

            const updateVal = () => {
                let y = parseInt(yearInput.value, 10);
                const minYear = parseInt(yearInput.getAttribute('min'), 10) || 1940;
                const maxYear = parseInt(yearInput.getAttribute('max'), 10) || 2100;
                if (isNaN(y) || y < minYear) {
                    y = minYear;
                    yearInput.value = y;
                } else if (y > maxYear) {
                    y = maxYear;
                    yearInput.value = y;
                }

                const m = monthSelect.value || '01';
                const formatted = `${y}-${m}-01`;
                if (hiddenInput.value !== formatted) {
                    hiddenInput.value = formatted;
                    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            };

            monthSelect.addEventListener('change', updateVal);
            yearInput.addEventListener('change', updateVal);
            yearInput.addEventListener('blur', updateVal);
        });
    }

    _bindValidation() {
        this.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('blur', () => {
                if (input.value === '') return;
                const val = parseFloat(input.value);
                if (isNaN(val)) return;
                const min = input.getAttribute('min') !== null ? parseFloat(input.getAttribute('min')) : null;
                const max = input.getAttribute('max') !== null ? parseFloat(input.getAttribute('max')) : null;
                if (min !== null && val < min) {
                    input.value = min;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (max !== null && val > max) {
                    input.value = max;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
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
        this._bindMonthYearControls();
        this._bindValidation();
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
        return `<div class="surface-card"><div class="surface-card-header"><h3 class="surface-card-title">${title}</h3></div><div class="surface-card-body">`;
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

    _renderDateInput(inputId, aiTarget, labelRowHtml, path, val) {
        const normalized = normalizeDateStr(val);
        const dateVal = normalized.length === 7 ? `${normalized}-01` : (normalized || '2026-01-01');
        const parts = parseDateParts(dateVal);
        const curMonth = String(parts.month).padStart(2, '0');
        const curYear = parts.year || 2026;
        const minYear = path.includes('originationDate') ? 1990 : 2020;
        const maxYear = 2085;

        const months = [
            { v: '01', l: 'Jan' }, { v: '02', l: 'Feb' }, { v: '03', l: 'Mar' },
            { v: '04', l: 'Apr' }, { v: '05', l: 'May' }, { v: '06', l: 'Jun' },
            { v: '07', l: 'Jul' }, { v: '08', l: 'Aug' }, { v: '09', l: 'Sep' },
            { v: '10', l: 'Oct' }, { v: '11', l: 'Nov' }, { v: '12', l: 'Dec' }
        ];
        const monthOptions = months.map(m => `<option value="${m.v}" ${curMonth === m.v ? 'selected' : ''}>${m.l}</option>`).join('');

        return `
            <div class="form-group">
                ${labelRowHtml}
                <div class="month-year-group input-date-ctrl" data-path="${path}">
                    <select id="${inputId}-month" class="month-part" data-ai-target="${aiTarget}-month" aria-label="Month">
                        ${monthOptions}
                    </select>
                    <input id="${inputId}-year" type="number" class="year-part" min="${minYear}" max="${maxYear}" step="1" value="${curYear}" data-ai-target="${aiTarget}-year" aria-label="Year" />
                    <input id="${inputId}" type="hidden" data-path="${path}" value="${dateVal}" data-ai-target="${aiTarget}-input" />
                </div>
            </div>
        `;
    }

    _inferAgeConfig(cleanLabel) {
        if (cleanLabel.includes('expectancy')) return { min: '60', max: '110' };
        if (cleanLabel.includes('term')) return { min: '1', max: '40' };
        if (cleanLabel.includes('retirement')) return { min: '30', max: '75' };
        return { min: '20', max: '75' };
    }

    _isCurrencyField(cleanLabel) {
        const keywords = ['($)', 'cost', 'balance', 'salary', 'lti', 'amount', 'cushion', 'price', 'expense'];
        return keywords.some(k => cleanLabel.includes(k)) || (cleanLabel.includes('bonus') && !cleanLabel.includes('bonus years'));
    }

    _inferYearConfig(cleanLabel, path) {
        if (cleanLabel.includes('birth year')) {
            const isDep = path.includes('dependents');
            return { prefix: '', suffix: '', sizingClass: 'input-year', minAttr: isDep ? 'min="1995"' : 'min="1950"', maxAttr: isDep ? 'max="2035"' : 'max="2006"', stepAttr: 'step="1"' };
        }
        if (cleanLabel.includes('start year') || cleanLabel.includes('stop year') || cleanLabel.includes('graph years') || cleanLabel.includes('bonus years')) {
            return { prefix: '', suffix: '', sizingClass: 'input-year', minAttr: 'min="2020"', maxAttr: 'max="2085"', stepAttr: 'step="1"' };
        }
        return null;
    }

    _inferRateConfig(cleanLabel) {
        if (cleanLabel.includes('(%)') || cleanLabel.includes('rate') || cleanLabel.includes('percent') || cleanLabel.includes('return')) {
            return { prefix: '', suffix: '%', sizingClass: 'input-rate', minAttr: 'min="0"', maxAttr: 'max="100"', stepAttr: 'step="0.1"' };
        }
        return null;
    }

    _inferNumberFieldConfig(cleanLabel, path) {
        if (path.startsWith('phaseBasedExpensesPerMonth.')) {
            return { prefix: '$', suffix: '', sizingClass: 'input-currency-sm', minAttr: 'min="0"', maxAttr: 'max="50000000"', stepAttr: 'step="1"' };
        }
        const rate = this._inferRateConfig(cleanLabel);
        if (rate) return rate;
        const yr = this._inferYearConfig(cleanLabel, path);
        if (yr) return yr;
        if (cleanLabel.includes('age') || cleanLabel.includes('expectancy') || cleanLabel.includes('term (years)')) {
            const { min, max } = this._inferAgeConfig(cleanLabel);
            return { prefix: '', suffix: '', sizingClass: 'input-age', minAttr: `min="${min}"`, maxAttr: `max="${max}"`, stepAttr: 'step="1"' };
        }
        if (this._isCurrencyField(cleanLabel)) {
            const isLarge = cleanLabel.includes('annual') || cleanLabel.includes('salary') || cleanLabel.includes('balance') || cleanLabel.includes('value') || cleanLabel.includes('target cap');
            return { prefix: '$', suffix: '', sizingClass: isLarge ? 'input-currency-md' : 'input-currency-sm', minAttr: 'min="0"', maxAttr: 'max="50000000"', stepAttr: 'step="1"' };
        }
        return { prefix: '', suffix: '', sizingClass: '', minAttr: '', maxAttr: '', stepAttr: '' };
    }

    _renderInputTag(config) {
        const { inputId, type, path, safeVal, attrs, sizingClass, prefix, suffix, aiTarget } = config;
        if (!prefix && !suffix) {
            return `<input id="${inputId}" type="${type}" data-path="${path}" value="${safeVal}" ${attrs} data-ai-target="${aiTarget}-input" class="${sizingClass}" />`;
        }
        return `
            <div class="input-group ${sizingClass}">
                ${prefix ? `<span class="input-prefix">${prefix}</span>` : ''}
                <input id="${inputId}" type="${type}" data-path="${path}" value="${safeVal}" ${attrs} data-ai-target="${aiTarget}-input" />
                ${suffix ? `<span class="input-suffix">${suffix}</span>` : ''}
            </div>
        `;
    }

    _buildLabelRow(params) {
        const { type, inputId, aiTarget, label, tooltipBtn, badgeHtml } = params;
        const targetId = type === 'date' ? `${inputId}-year` : inputId;
        return `
            <div class="form-label-row">
                <div style="display: flex; align-items: center; gap: 0.25rem; min-width: 0; overflow: hidden; flex: 1;">
                    <label for="${targetId}" data-ai-target="${aiTarget}-label">${label}</label>
                    ${tooltipBtn}
                </div>
                ${badgeHtml}
            </div>
        `;
    }

    _inferFieldConfig(type, cleanLabel, path) {
        if (type === 'number') {
            return this._inferNumberFieldConfig(cleanLabel, path);
        }
        return {
            prefix: '',
            suffix: '',
            sizingClass: type === 'text' ? 'input-text-name' : '',
            minAttr: '',
            maxAttr: '',
            stepAttr: ''
        };
    }

    _input(label, path, type = 'number', value = '', options = {}) {
        const val = value !== undefined && value !== null ? value : '';
        const opts = typeof options === 'string' ? { tooltip: options } : (options || {});
        const aiTarget = path.replace(/\./g, '-');
        const inputId = `field-${aiTarget}`;
        const tooltipBtn = this._renderTooltipButton(opts.tooltip || '', label);
        const badge = opts.badge || '';
        const badgeHtml = badge ? (badge.startsWith('<') ? badge : `<span class="badge-subtle">${badge}</span>`) : '';
        const labelRowHtml = this._buildLabelRow({ type, inputId, aiTarget, label, tooltipBtn, badgeHtml });

        if (type === 'date') {
            return this._renderDateInput(inputId, aiTarget, labelRowHtml, path, val);
        }

        const cleanLabel = (label || '').toLowerCase();
        const numConfig = this._inferFieldConfig(type, cleanLabel, path);
        const { prefix, suffix, minAttr, maxAttr, stepAttr } = numConfig;
        const sizingClass = opts.sizingClass || numConfig.sizingClass;
        const safeVal = escapeHtml(val);
        const attrs = [minAttr, maxAttr, stepAttr].filter(Boolean).join(' ');
        const inputHtml = this._renderInputTag({ inputId, type, path, safeVal, attrs, sizingClass, prefix, suffix, aiTarget });

        return `
            <div class="form-group">
                ${labelRowHtml}
                ${inputHtml}
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
    
    _select(label, path, options, selectedValue, extraOpts = {}) {
        const opts = typeof extraOpts === 'string' ? { tooltip: extraOpts } : (extraOpts || {});
        const tooltip = opts.tooltip || '';
        const sizingClass = opts.sizingClass || 'input-select-compact';
        const badge = opts.badge || '';
        const aiTarget = path.replace(/\./g, '-');
        const selectId = `sel-${aiTarget}`;
        const tooltipBtn = this._renderTooltipButton(tooltip, label);
        const badgeHtml = badge ? (badge.startsWith('<') ? badge : `<span class="badge-subtle">${badge}</span>`) : '';
        return `
            <div class="form-group ${sizingClass}">
                <div class="form-label-row">
                    <div style="display: flex; align-items: center; gap: 0.25rem; min-width: 0; overflow: hidden; flex: 1;">
                        <label for="${selectId}" data-ai-target="${aiTarget}-label">${label}</label>
                        ${tooltipBtn}
                    </div>
                    ${badgeHtml}
                </div>
                <select id="${selectId}" data-path="${path}" class="${sizingClass}" data-ai-target="${aiTarget}-select">
                    ${options.map(opt => `<option value="${opt.value}" ${selectedValue == opt.value ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}>${opt.label}</option>`).join('')}
                </select>
            </div>
        `;
    }

    _warningBox(id, initialHtml = '') {
        return `<div id="${id}" class="dynamic-warning-box" style="font-size: 0.75rem; color: #fdcb6e; margin-top: 0.25rem; margin-bottom: 0.5rem; line-height: 1.3; padding: 0.35rem 0.5rem; background: rgba(253, 203, 110, 0.1); border: 1px solid rgba(253, 203, 110, 0.3); border-radius: 4px; ${initialHtml ? '' : 'display: none;'}">${initialHtml}</div>`;
    }
}
