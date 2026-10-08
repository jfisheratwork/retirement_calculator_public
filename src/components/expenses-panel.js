import { BaseComponent } from './base-component.js';

export class ExpensesPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = '';
        html += this._startSection('Monthly Expenses (Excluding Mortgage)');
        html += `<div style="margin-bottom: 1.25rem; font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">
            Expenses dynamically transition through life phases (raising kids ➔ empty nesters ➔ active "Go-Go" travel ➔ "Slow-Go" ➔ "No-Go" comfort years).
        </div>`;

        html += `<div class="pane-section-header" style="margin-bottom: 0.75rem;">Family Years with Kids (Takes Precedence)</div>`;
        html += `<div class="life-stage-deck-3">`;
        html += `<div class="life-stage-card">${this._input('Pre-Teens', 'phaseBasedExpensesPerMonth.preTeens', 'number', this.state.phaseBasedExpensesPerMonth.preTeens, { tooltip: 'Monthly baseline household living expenses while raising pre-teen children (excluding mortgage, college, and property taxes).', badge: '< 13 yrs' })}</div>`;
        html += `<div class="life-stage-card">${this._input('Teenagers', 'phaseBasedExpensesPerMonth.teenagers', 'number', this.state.phaseBasedExpensesPerMonth.teenagers, { tooltip: 'Monthly living expenses during high-activity teenage years with sports, food, and extracurriculars.', badge: '13-17 yrs' })}</div>`;
        html += `<div class="life-stage-card">${this._input('College Years', 'phaseBasedExpensesPerMonth.college', 'number', this.state.phaseBasedExpensesPerMonth.college, { tooltip: 'Monthly baseline home living expenses while children attend college (tuition is modeled separately under 529s).', badge: '18-22 yrs' })}</div>`;
        html += `</div>`;

        html += `<div class="pane-section-header" style="margin-bottom: 0.75rem;">Retirement Journey (Empty Nest / No Kids)</div>`;
        html += `<div class="life-stage-deck-5">`;
        html += `<div class="life-stage-card">${this._input('Pre-Retirement', 'phaseBasedExpensesPerMonth.preRetirementNoKids', 'number', this.state.phaseBasedExpensesPerMonth.preRetirementNoKids, { tooltip: 'Monthly living expenses as empty nesters prior to retiring from work.' })}</div>`;
        html += `<div class="life-stage-card">${this._input('Early (0-4 Yrs)', 'phaseBasedExpensesPerMonth.earlyRetirement', 'number', this.state.phaseBasedExpensesPerMonth.earlyRetirement, { tooltip: 'Monthly budget during the active "Go-Go" retirement years with peak travel, vitality, and adventure spending.' })}</div>`;
        html += `<div class="life-stage-card">${this._input('Mid (5-9 Yrs)', 'phaseBasedExpensesPerMonth.midRetirement', 'number', this.state.phaseBasedExpensesPerMonth.midRetirement, { tooltip: 'Monthly budget during the "Slow-Go" retirement phase as travel pace moderates.' })}</div>`;
        html += `<div class="life-stage-card">${this._input('Older (10-14 Yrs)', 'phaseBasedExpensesPerMonth.olderRetirement', 'number', this.state.phaseBasedExpensesPerMonth.olderRetirement, { tooltip: 'Monthly budget during the "No-Go" phase with simplified lifestyle and local activities.' })}</div>`;
        html += `<div class="life-stage-card">${this._input('Bonus (15+ Yrs)', 'phaseBasedExpensesPerMonth.bonusYears', 'number', this.state.phaseBasedExpensesPerMonth.bonusYears, { tooltip: 'Monthly baseline budget in late-life retirement focusing on home living and healthcare.' })}</div>`;
        html += `</div>`;

        html += this._endSection();
        return html;
    }

    afterRender() {
        this.addEvent('input, select', 'change', (e) => {
            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('expenses-panel')) {
    customElements.define('expenses-panel', ExpensesPanel);
}
