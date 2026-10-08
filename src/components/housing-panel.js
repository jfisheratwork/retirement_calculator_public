import { BaseComponent } from './base-component.js';
import { HeuristicValidator } from '../services/HeuristicValidator.js';

export class HousingPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    _calculateMonthlyPI() {
        const origAmt = Number(this.state.primaryResidenceMortgage.originationAmount) || 0;
        const rate = (Number(this.state.primaryResidenceMortgage.interestRate) || 0) / 100 / 12;
        const n = (Number(this.state.primaryResidenceMortgage.termYears) || 30) * 12;
        return (origAmt > 0 && rate > 0 && n > 0)
            ? Math.round(origAmt * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1))
            : 0;
    }

    _calculateEstimatedEquity() {
        const homeVal = Number(this.state.primaryResidenceEquity.currentValue) || 0;
        const curMortBal = this.state.primaryResidenceMortgage.enabled
            ? (Number(this.state.primaryResidenceMortgage.currentBalance) || Number(this.state.primaryResidenceMortgage.originationAmount) || 0)
            : 0;
        return Math.max(0, homeVal - curMortBal);
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = '';
        
        // Card A: Mortgage Loan Terms
        html += this._startSection('Mortgage Loan Terms');
        html += this._checkbox('Enable Mortgage', 'primaryResidenceMortgage.enabled', this.state.primaryResidenceMortgage.enabled, 'Enables precise monthly principal, interest, tax, and insurance (PITI) amortization tracking.');
        html += `<div id="mortgage-inputs" style="display: ${this.state.primaryResidenceMortgage.enabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        const mortgageOrig = this.state.primaryResidenceMortgage.originationDate || `${new Date().getFullYear() - 3}-01`;
        const mortgageOrigFormatted = mortgageOrig.length === 7 ? `${mortgageOrig}-01` : mortgageOrig;
        const monthlyPI = this._calculateMonthlyPI();

        // Row 1: Origination Date, Origination Amount, Current Balance (3 columns)
        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Origination Date', 'primaryResidenceMortgage.originationDate', 'date', mortgageOrigFormatted, 'Original loan start month and year.')}</div>`;
        html += `<div>${this._input('Origination Amount ($)', 'primaryResidenceMortgage.originationAmount', 'number', this.state.primaryResidenceMortgage.originationAmount, 'Total original loan principal borrowed.')}</div>`;
        html += `<div>${this._input('Current Balance ($)', 'primaryResidenceMortgage.currentBalance', 'number', this.state.primaryResidenceMortgage.currentBalance || this.state.primaryResidenceMortgage.originationAmount, 'Current remaining principal balance due today.')}</div>`;
        html += `</div>`;

        // Row 2: Term, Interest Rate, Monthly P&I Preview (3 columns)
        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Term (Years)', 'primaryResidenceMortgage.termYears', 'number', this.state.primaryResidenceMortgage.termYears, 'Total amortization length of the loan in years (e.g. 15 or 30).')}</div>`;
        html += `<div>${this._input('Interest Rate (%)', 'primaryResidenceMortgage.interestRate', 'number', this.state.primaryResidenceMortgage.interestRate, 'Annual mortgage interest rate.')}</div>`;
        html += `<div>
            <div class="form-group">
                <div class="form-label-row">
                    <label>Monthly P&amp;I (Est.)</label>
                    <span class="badge-subtle badge-subtle-blue">Principal &amp; Int</span>
                </div>
                <div class="input-group input-currency-md">
                    <span class="input-prefix">$</span>
                    <input id="mortgage-monthly-pi-preview" type="text" readonly value="${monthlyPI.toLocaleString()} / mo" class="input-readonly" style="background: rgba(255, 255, 255, 0.02); color: var(--text-muted); cursor: default;" />
                </div>
            </div>
        </div>`;
        html += `</div>`;
        html += `</div>`;
        html += this._endSection();
        
        // Card B: Property Value & Holding Costs
        html += this._startSection('Property Value & Holding Costs');
        const homeGrowth = this.state.primaryResidenceEquity.annualGrowthRate !== undefined ? this.state.primaryResidenceEquity.annualGrowthRate : 3;
        const estEquity = this._calculateEstimatedEquity();

        // Row 1: Home Value, Appreciation Rate, Estimated Equity (3 columns)
        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Home Value ($)', 'primaryResidenceEquity.currentValue', 'number', this.state.primaryResidenceEquity.currentValue, 'Current estimated market value of primary residence.')}</div>`;
        html += `<div>${this._input('Annual Appreciation (%)', 'primaryResidenceEquity.annualGrowthRate', 'number', homeGrowth, 'Estimated annual property growth rate. Case-Shiller long-term national average is ~3.0%–4.5%.')}</div>`;
        html += `<div>
            <div class="form-group">
                <div class="form-label-row">
                    <label>Estimated Equity</label>
                    <span class="badge-subtle badge-subtle-emerald">Net Asset</span>
                </div>
                <div class="input-group input-currency-md">
                    <span class="input-prefix">$</span>
                    <input id="property-est-equity-preview" type="text" readonly value="${estEquity.toLocaleString()}" class="input-readonly" style="background: rgba(255, 255, 255, 0.02); color: var(--text-muted); cursor: default;" />
                </div>
            </div>
        </div>`;
        html += `</div>`;

        // Row 2: Yearly Taxes, Yearly Insurance, Yearly Repairs (3 columns)
        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Yearly Taxes ($)', 'primaryResidenceMortgage.yearlyTaxes', 'number', this.state.primaryResidenceMortgage.yearlyTaxes, 'Annual municipal property taxes.')}</div>`;
        html += `<div>${this._input('Yearly Insurance ($)', 'primaryResidenceMortgage.yearlyInsurance', 'number', this.state.primaryResidenceMortgage.yearlyInsurance, 'Annual homeowner property insurance premium.')}</div>`;
        html += `<div>${this._input('Yearly Repairs ($)', 'primaryResidenceMortgage.yearlyRepairs', 'number', this.state.primaryResidenceMortgage.yearlyRepairs, 'Annual maintenance, upkeep, and capital repair reserves.')}</div>`;
        html += `</div>`;

        const homeWarn = HeuristicValidator.validateHomeAppreciation(homeGrowth);
        html += this._warningBox('household-home-growth-warning', homeWarn ? homeWarn.message : '');

        html += `<div class="pane-section-header" style="margin-top: 0.75rem;">Reverse Mortgage Strategy (Optional)</div>`;
        const isRmEnabled = Boolean(this.state.primaryResidenceEquity.reverseMortgageEnabled ?? this.state.primaryResidenceEquity.enabled);
        html += this._checkbox('Enable Reverse Mortgage Strategy', 'primaryResidenceEquity.reverseMortgageEnabled', isRmEnabled, 'Optionally tap into home equity as a non-recourse line of credit to backstop late-life cash flow.');
        html += `<div id="reverse-mortgage-inputs" style="display: ${isRmEnabled ? 'block' : 'none'}; margin-top: 0.5rem; max-width: 400px;">`;
        html += `<div>${this._input('Start Age (Spouse 1)', 'primaryResidenceEquity.reverseMortgageStartAge', 'number', this.state.primaryResidenceEquity.reverseMortgageStartAge, 'Eligible age (must be 62+) to start drawing reverse mortgage equity.')}</div>`;
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
