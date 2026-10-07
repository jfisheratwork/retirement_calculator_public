import { BaseComponent } from './base-component.js';
import { getState } from '../services/state.js';

export class ExpensesPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = '';
        html += this._startSection('Monthly Expenses (Excluding Mortgage)');
        html += `<div style="margin-bottom: 1rem; font-size: 0.9rem; color: var(--text-muted);">
            Expenses dynamically transition through life phases (kids at home ➔ empty nesters ➔ Go-Go active travel ➔ Slow-Go ➔ No-Go).
        </div>`;
        html += `<div class="pane-section-header">With Kids (Precedence)</div>`;
        html += this._input('Pre-Teens (Max Age < 13)', 'phaseBasedExpensesPerMonth.preTeens', 'number', this.state.phaseBasedExpensesPerMonth.preTeens, 'Monthly baseline household living expenses while raising pre-teen children (excluding mortgage, college, and property taxes).');
        html += this._input('Teenagers (Max Age 13-17)', 'phaseBasedExpensesPerMonth.teenagers', 'number', this.state.phaseBasedExpensesPerMonth.teenagers, 'Monthly living expenses during high-activity teenage years with sports, food, and extracurriculars.');
        html += this._input('College (Max Age 18-22)', 'phaseBasedExpensesPerMonth.college', 'number', this.state.phaseBasedExpensesPerMonth.college, 'Monthly baseline home living expenses while children attend college (tuition is modeled separately under 529s).');
        
        html += `<div class="pane-section-header">No Kids</div>`;
        html += this._input('Pre-Retirement', 'phaseBasedExpensesPerMonth.preRetirementNoKids', 'number', this.state.phaseBasedExpensesPerMonth.preRetirementNoKids, 'Monthly living expenses as empty nesters prior to retiring from work.');
        html += this._input('Early Retirement (0-4 yrs)', 'phaseBasedExpensesPerMonth.earlyRetirement', 'number', this.state.phaseBasedExpensesPerMonth.earlyRetirement, 'Monthly budget during the active "Go-Go" retirement years with peak travel, vitality, and adventure spending.');
        html += this._input('Mid Retirement (5-9 yrs)', 'phaseBasedExpensesPerMonth.midRetirement', 'number', this.state.phaseBasedExpensesPerMonth.midRetirement, 'Monthly budget during the "Slow-Go" retirement phase as travel pace moderates.');
        html += this._input('Older Retirement (10-14 yrs)', 'phaseBasedExpensesPerMonth.olderRetirement', 'number', this.state.phaseBasedExpensesPerMonth.olderRetirement, 'Monthly budget during the "No-Go" phase with simplified lifestyle and local activities.');
        html += this._input('Bonus Years (15+ yrs)', 'phaseBasedExpensesPerMonth.bonusYears', 'number', this.state.phaseBasedExpensesPerMonth.bonusYears, 'Monthly baseline budget in late-life retirement focusing on home living and healthcare.');
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
