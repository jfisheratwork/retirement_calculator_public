import { BaseComponent } from './base-component.js';

export class ExpensesPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        const phases = this.state.phaseBasedExpensesPerMonth || {};
        const currentSpend = Number(phases.preRetirementNoKids ?? phases.preTeens ?? 5000);
        const retireSpend = Number(phases.earlyRetirement ?? 5000);
        const currentAnnual = (currentSpend * 12).toLocaleString();
        const retireAnnual = (retireSpend * 12).toLocaleString();

        let html = '';
        html += this._startSection("Living Expenses (Today's Dollars — Excl. Mortgage & Taxes)");
        html += `
            <div class="quick-budget-grid">
                <div class="quick-budget-card">
                    <label class="quick-budget-label" for="quick-current-monthly-spend">
                        Current Monthly Living Spend (Working Years)
                    </label>
                    <div class="quick-budget-input-row">
                        <span class="quick-budget-prefix">$</span>
                        <input
                            type="number"
                            id="quick-current-monthly-spend"
                            class="quick-budget-input"
                            value="${currentSpend}"
                            step="100"
                            min="0"
                        />
                        <span id="quick-current-annual-suffix" class="quick-budget-suffix">/mo ($${currentAnnual}/yr)</span>
                    </div>
                </div>
                <div class="quick-budget-card">
                    <label class="quick-budget-label" for="quick-retire-monthly-spend">
                        Target Retirement Monthly Spend
                    </label>
                    <div class="quick-budget-input-row">
                        <span class="quick-budget-prefix">$</span>
                        <input
                            type="number"
                            id="quick-retire-monthly-spend"
                            class="quick-budget-input"
                            value="${retireSpend}"
                            step="100"
                            min="0"
                        />
                        <span id="quick-retire-annual-suffix" class="quick-budget-suffix">/mo ($${retireAnnual}/yr)</span>
                    </div>
                </div>
            </div>
            <details class="drawer-progressive-details" id="expenses-8stage-details">
                <summary class="drawer-progressive-summary">
                    <span>🎛️ Customize spending across all 8 life stages (Kids, Go-Go, Slow-Go, Late-Life)</span>
                    <span class="drawer-summary-chevron">Expand ▾</span>
                </summary>
                <div class="drawer-progressive-body">
                    <div style="margin-bottom: 1rem; font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">
                        Fine-tune how monthly expenses transition across each phase (raising kids ➔ empty nesters ➔ active "Go-Go" travel ➔ "Slow-Go" ➔ "No-Go" comfort years).
                    </div>
                    <div class="pane-section-header" style="margin-bottom: 0.75rem;">Family Years with Kids (Takes Precedence)</div>
                    <div class="life-stage-deck-3">
                        <div class="life-stage-card">${this._input('Pre-Teens', 'phaseBasedExpensesPerMonth.preTeens', 'number', phases.preTeens, { tooltip: 'Monthly baseline household living expenses while raising pre-teen children (excluding mortgage, college, and property taxes).', badge: '< 13 yrs' })}</div>
                        <div class="life-stage-card">${this._input('Teenagers', 'phaseBasedExpensesPerMonth.teenagers', 'number', phases.teenagers, { tooltip: 'Monthly living expenses during high-activity teenage years with sports, food, and extracurriculars.', badge: '13-17 yrs' })}</div>
                        <div class="life-stage-card">${this._input('College Years', 'phaseBasedExpensesPerMonth.college', 'number', phases.college, { tooltip: 'Monthly baseline home living expenses while children attend college (tuition is modeled separately under 529s).', badge: '18-22 yrs' })}</div>
                    </div>
                    <div class="pane-section-header" style="margin-bottom: 0.75rem;">Retirement Journey (Empty Nest / No Kids)</div>
                    <div class="life-stage-deck-5">
                        <div class="life-stage-card">${this._input('Pre-Retirement', 'phaseBasedExpensesPerMonth.preRetirementNoKids', 'number', phases.preRetirementNoKids, { tooltip: 'Monthly living expenses as empty nesters prior to retiring from work.' })}</div>
                        <div class="life-stage-card">${this._input('Early (0-4 Yrs)', 'phaseBasedExpensesPerMonth.earlyRetirement', 'number', phases.earlyRetirement, { tooltip: 'Monthly budget during the active "Go-Go" retirement years with peak travel, vitality, and adventure spending.' })}</div>
                        <div class="life-stage-card">${this._input('Mid (5-9 Yrs)', 'phaseBasedExpensesPerMonth.midRetirement', 'number', phases.midRetirement, { tooltip: 'Monthly budget during the "Slow-Go" retirement phase as travel pace moderates.' })}</div>
                        <div class="life-stage-card">${this._input('Older (10-14 Yrs)', 'phaseBasedExpensesPerMonth.olderRetirement', 'number', phases.olderRetirement, { tooltip: 'Monthly budget during the "No-Go" phase with simplified lifestyle and local activities.' })}</div>
                        <div class="life-stage-card">${this._input('Bonus (15+ Yrs)', 'phaseBasedExpensesPerMonth.bonusYears', 'number', phases.bonusYears, { tooltip: 'Monthly baseline budget in late-life retirement focusing on home living and healthcare.' })}</div>
                    </div>
                </div>
            </details>
        `;

        html += this._endSection();
        return html;
    }

    _updateQuickSuffix(suffixId, monthlyVal) {
        const suffixEl = this.querySelector(suffixId);
        if (suffixEl) {
            const annualStr = Math.round(monthlyVal * 12).toLocaleString();
            suffixEl.textContent = `/mo ($${annualStr}/yr)`;
        }
    }

    _syncQuickPhaseInputs(selectorList, newVal) {
        selectorList.forEach((pathStr) => {
            const inputEl = this.querySelector(`[data-path="${pathStr}"]`);
            if (inputEl) {
                inputEl.value = String(newVal);
                this.dispatchEvent(
                    new CustomEvent('stateChange', {
                        detail: { element: inputEl },
                        bubbles: true
                    })
                );
            }
        });
    }

    _syncQuickCardFromPhaseInput(path, rawVal) {
        const val = Math.max(0, Number(rawVal) || 0);
        if (path === 'phaseBasedExpensesPerMonth.preRetirementNoKids') {
            const quickCurrent = this.querySelector('#quick-current-monthly-spend');
            if (quickCurrent) quickCurrent.value = String(val);
            this._updateQuickSuffix('#quick-current-annual-suffix', val);
        } else if (path === 'phaseBasedExpensesPerMonth.earlyRetirement') {
            const quickRetire = this.querySelector('#quick-retire-monthly-spend');
            if (quickRetire) quickRetire.value = String(val);
            this._updateQuickSuffix('#quick-retire-annual-suffix', val);
        }
    }

    _bindQuickBudgetInput(inputSelector, suffixSelector, phasePaths) {
        const inputEl = this.querySelector(inputSelector);
        if (!inputEl) return;
        const handleUpdate = (e) => {
            const val = Math.max(0, Number(e.target.value) || 0);
            this._updateQuickSuffix(suffixSelector, val);
            this._syncQuickPhaseInputs(phasePaths, val);
        };
        inputEl.addEventListener('input', handleUpdate);
        inputEl.addEventListener('change', handleUpdate);
    }

    afterRender() {
        const handlePhaseFieldEvent = (e) => {
            const path = e.target.getAttribute('data-path') || '';
            this._syncQuickCardFromPhaseInput(path, e.target.value);
            this.dispatchEvent(
                new CustomEvent('stateChange', {
                    detail: { element: e.target },
                    bubbles: true
                })
            );
        };
        this.addEvent('input[data-path], select[data-path]', 'input', handlePhaseFieldEvent);
        this.addEvent('input[data-path], select[data-path]', 'change', handlePhaseFieldEvent);

        this._bindQuickBudgetInput('#quick-current-monthly-spend', '#quick-current-annual-suffix', [
            'phaseBasedExpensesPerMonth.preTeens',
            'phaseBasedExpensesPerMonth.teenagers',
            'phaseBasedExpensesPerMonth.college',
            'phaseBasedExpensesPerMonth.preRetirementNoKids'
        ]);

        this._bindQuickBudgetInput('#quick-retire-monthly-spend', '#quick-retire-annual-suffix', [
            'phaseBasedExpensesPerMonth.earlyRetirement',
            'phaseBasedExpensesPerMonth.midRetirement',
            'phaseBasedExpensesPerMonth.olderRetirement',
            'phaseBasedExpensesPerMonth.bonusYears'
        ]);
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('expenses-panel')) {
    customElements.define('expenses-panel', ExpensesPanel);
}
