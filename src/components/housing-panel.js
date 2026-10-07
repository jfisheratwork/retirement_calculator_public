import { BaseComponent } from './base-component.js';
import { getState } from '../services/state.js';
import { HeuristicValidator } from '../services/HeuristicValidator.js';

export class HousingPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = '';
        
        // Mortgage
        html += this._startSection('Mortgage');
        html += this._checkbox('Enable Mortgage', 'primaryResidenceMortgage.enabled', this.state.primaryResidenceMortgage.enabled, 'Enables precise monthly principal, interest, tax, and insurance (PITI) amortization tracking.');
        html += `<div id="mortgage-inputs" style="display: ${this.state.primaryResidenceMortgage.enabled ? 'block' : 'none'};">`;
        const mortgageOrig = this.state.primaryResidenceMortgage.originationDate || `${new Date().getFullYear() - 3}-01`;
        const mortgageOrigFormatted = mortgageOrig.length === 7 ? `${mortgageOrig}-01` : mortgageOrig;
        html += this._input('Origination Date (Month & Year)', 'primaryResidenceMortgage.originationDate', 'date', mortgageOrigFormatted, 'Original loan start month and year.');
        html += this._input('Origination Amount ($)', 'primaryResidenceMortgage.originationAmount', 'number', this.state.primaryResidenceMortgage.originationAmount, 'Total original loan principal borrowed.');
        html += this._input('Current Balance ($)', 'primaryResidenceMortgage.currentBalance', 'number', this.state.primaryResidenceMortgage.currentBalance || this.state.primaryResidenceMortgage.originationAmount, 'Current remaining principal balance due today.');
        html += this._input('Term (Years)', 'primaryResidenceMortgage.termYears', 'number', this.state.primaryResidenceMortgage.termYears, 'Total amortization length of the loan in years (e.g. 15 or 30).');
        html += this._input('Interest Rate (%)', 'primaryResidenceMortgage.interestRate', 'number', this.state.primaryResidenceMortgage.interestRate, 'Annual mortgage interest rate.');
        html += this._input('Yearly Insurance ($)', 'primaryResidenceMortgage.yearlyInsurance', 'number', this.state.primaryResidenceMortgage.yearlyInsurance, 'Annual homeowner property insurance premium.');
        html += this._input('Yearly Taxes ($)', 'primaryResidenceMortgage.yearlyTaxes', 'number', this.state.primaryResidenceMortgage.yearlyTaxes, 'Annual municipal property taxes.');
        html += this._input('Yearly Repairs ($)', 'primaryResidenceMortgage.yearlyRepairs', 'number', this.state.primaryResidenceMortgage.yearlyRepairs, 'Annual maintenance, upkeep, and capital repair reserves.');
        html += `</div>`;
        html += this._endSection();
        
        // Home Equity
        html += this._startSection('Home Equity & Property');
        html += this._input('Home Value ($)', 'primaryResidenceEquity.currentValue', 'number', this.state.primaryResidenceEquity.currentValue, 'Current estimated market value of primary residence.');
        
        const homeGrowth = this.state.primaryResidenceEquity.annualGrowthRate !== undefined ? this.state.primaryResidenceEquity.annualGrowthRate : 3;
        html += this._input('Annual Appreciation (%)', 'primaryResidenceEquity.annualGrowthRate', 'number', homeGrowth, 'Estimated annual property growth rate. Case-Shiller long-term national average is ~3.0%–4.5%.');
        const homeWarn = HeuristicValidator.validateHomeAppreciation(homeGrowth);
        html += this._warningBox('household-home-growth-warning', homeWarn ? homeWarn.message : '');

        html += `<div class="pane-section-header">Reverse Mortgage Strategy (Optional)</div>`;
        const isRmEnabled = Boolean(this.state.primaryResidenceEquity.reverseMortgageEnabled ?? this.state.primaryResidenceEquity.enabled);
        html += this._checkbox('Enable Reverse Mortgage Strategy', 'primaryResidenceEquity.reverseMortgageEnabled', isRmEnabled, 'Optionally tap into home equity as a non-recourse line of credit to backstop late-life cash flow.');
        html += `<div id="reverse-mortgage-inputs" style="display: ${isRmEnabled ? 'block' : 'none'};">`;
        html += this._input('Start Age (Spouse 1)', 'primaryResidenceEquity.reverseMortgageStartAge', 'number', this.state.primaryResidenceEquity.reverseMortgageStartAge, 'Eligible age (must be 62+) to start drawing reverse mortgage equity.');
        html += `</div>`;
        html += this._endSection();

        return html;
    }

    afterRender() {
        this.addEvent('input, select', 'input', (e) => {
            const path = e.target.getAttribute('data-path');
            if (path === 'primaryResidenceEquity.annualGrowthRate') {
                const box = this.querySelector('#household-home-growth-warning');
                if (box) {
                    const res = HeuristicValidator.validateHomeAppreciation(e.target.value);
                    box.innerHTML = res ? res.message : '';
                    box.style.display = res ? 'block' : 'none';
                }
            }
        });

        this.addEvent('input, select', 'change', (e) => {
            const path = e.target.getAttribute('data-path');
            
            // Local UI toggles
            if (path === 'primaryResidenceMortgage.enabled') {
                const container = this.querySelector('#mortgage-inputs');
                if (container) container.style.display = e.target.checked ? 'block' : 'none';
            }
            if (path === 'primaryResidenceEquity.reverseMortgageEnabled') {
                const container = this.querySelector('#reverse-mortgage-inputs');
                if (container) container.style.display = e.target.checked ? 'block' : 'none';
            }

            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('housing-panel')) {
    customElements.define('housing-panel', HousingPanel);
}
