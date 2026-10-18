import { BaseComponent } from './base-component.js';
import { HeuristicValidator } from '../services/HeuristicValidator.js';
import { Mortgage } from '../models/Mortgage.js';

export class HousingPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    _calculateMonthlyPI() {
        const mort = new Mortgage(this.state.primaryResidenceMortgage || {});
        return Math.round(mort.calculateMonthlyPayment());
    }

    _calculateEstimatedEquity() {
        const homeVal = Number(this.state.primaryResidenceEquity?.currentValue) || 0;
        const m = this.state.primaryResidenceMortgage || {};
        const curMortBal = m.enabled ? Number(m.currentBalance) || Number(m.originationAmount) || 0 : 0;
        return Math.max(0, homeVal - curMortBal);
    }

    _buildExtraPayoffBadgeHtml(mortModel) {
        const cmp = mortModel.calculatePayoffComparison();
        if (cmp.monthsSaved > 0 && cmp.interestSaved > 0) {
            return `<div id="mortgage-extra-payoff-badge" class="badge-subtle badge-subtle-emerald" style="margin-top: 0.4rem; display: inline-block; padding: 0.35rem 0.65rem; font-size: 0.8rem;">
                ⚡ Pays off <strong>${cmp.yearsSaved} yrs ${cmp.remainingMonthsEarned} mos early</strong> • Saves <strong>$${cmp.interestSaved.toLocaleString()}</strong> in lifetime interest
            </div>`;
        }
        return `<div id="mortgage-extra-payoff-badge" style="margin-top: 0.35rem; font-size: 0.78rem; color: var(--text-muted);">
            💡 Add extra monthly principal to pay off years earlier and slash lifetime interest.
        </div>`;
    }

    _buildRecastPreviewHtml(mortModel) {
        const preview = mortModel.calculateRecastPreview();
        return `<div id="mortgage-recast-preview-box" style="margin-top: 0.5rem; padding: 0.65rem 0.85rem; background: rgba(9, 132, 227, 0.08); border: 1px solid rgba(9, 132, 227, 0.3); border-radius: 6px; font-size: 0.82rem; color: var(--text-primary);">
            📉 Reduces Monthly P&amp;I: <strong>$${preview.currentPayment.toLocaleString()}/mo</strong> ➔ <strong style="color: #38bdf8;">$${preview.newPayment.toLocaleString()}/mo</strong>
            (<strong style="color: #10b981;">-$${preview.monthlySavings.toLocaleString()}/mo</strong> cash flow boost over ${preview.remainingMonths} remaining mos)
        </div>`;
    }

    _renderRecastSubsection(m, mortModel) {
        const recast = m.recast || {};
        const isRecastEnabled = Boolean(recast.enabled);
        const rawDate = recast.date || `${new Date().getFullYear() + 2}-06`;
        const recastDateFormatted = rawDate.length === 7 ? `${rawDate}-01` : rawDate;

        let html = `<div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">`;
        html += `<div class="pane-section-header" style="margin-bottom: 0.35rem;">Mortgage Recast (Lump-Sum Re-Amortization)</div>`;
        html += this._checkbox(
            'Enable Mortgage Recast',
            'primaryResidenceMortgage.recast.enabled',
            isRecastEnabled,
            'A mortgage recast applies a lump-sum payment toward principal and recalculates a lower monthly P&I payment over the remaining loan term—keeping your existing low interest rate without refinancing.'
        );
        html += `<div id="mortgage-recast-inputs" style="display: ${isRecastEnabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Recast Target Date', 'primaryResidenceMortgage.recast.date', 'date', recastDateFormatted, 'Month and year when the lump-sum principal reduction is applied.')}</div>`;
        html += `<div>${this._input('Lump-Sum Amount ($)', 'primaryResidenceMortgage.recast.amount', 'number', recast.amount || 0, 'Lump-sum dollar amount applied directly to reduce remaining mortgage principal.')}</div>`;
        html += `<div>${this._select(
            'Funding Source',
            'primaryResidenceMortgage.recast.fundingSource',
            [
                { value: 'taxableBrokerage', label: 'Taxable Brokerage / Liquid Portfolio' },
                { value: 'externalWindfall', label: 'External Windfall / Bonus (No Portfolio Draw)' }
            ],
            recast.fundingSource || 'taxableBrokerage',
            'Choose whether the lump-sum recast is drawn from your liquid portfolio or funded by an external windfall/inheritance.'
        )}</div>`;
        html += `</div>`;
        html += this._buildRecastPreviewHtml(mortModel);
        html += `</div></div>`;
        return html;
    }

    _renderMortgageSection() {
        const m = this.state.primaryResidenceMortgage || {};
        const mortModel = new Mortgage(m);
        let html = this._startSection('Mortgage Loan Terms');
        html += this._checkbox(
            'Enable Mortgage',
            'primaryResidenceMortgage.enabled',
            m.enabled,
            'Enables precise monthly principal, interest, tax, and insurance (PITI) amortization tracking.'
        );
        html += `<div id="mortgage-inputs" style="display: ${m.enabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        const mortgageOrig = m.originationDate || `${new Date().getFullYear() - 3}-01`;
        const mortgageOrigFormatted = mortgageOrig.length === 7 ? `${mortgageOrig}-01` : mortgageOrig;
        const monthlyPI = this._calculateMonthlyPI();

        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Origination Date', 'primaryResidenceMortgage.originationDate', 'date', mortgageOrigFormatted, 'Original loan start month and year.')}</div>`;
        html += `<div>${this._input('Origination Amount ($)', 'primaryResidenceMortgage.originationAmount', 'number', m.originationAmount, 'Total original loan principal borrowed.')}</div>`;
        html += `<div>${this._input('Current Balance ($)', 'primaryResidenceMortgage.currentBalance', 'number', m.currentBalance || m.originationAmount, 'Current remaining principal balance due today.')}</div>`;
        html += `</div>`;

        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Term (Years)', 'primaryResidenceMortgage.termYears', 'number', m.termYears, 'Total amortization length of the loan in years (e.g. 15 or 30).')}</div>`;
        html += `<div>${this._input('Interest Rate (%)', 'primaryResidenceMortgage.interestRate', 'number', m.interestRate, 'Annual mortgage interest rate.')}</div>`;
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

        html += `<div style="margin-top: 0.5rem;">`;
        html += `<div style="max-width: 340px;">${this._input('Extra Monthly Principal ($/mo)', 'primaryResidenceMortgage.extraMonthlyPayment', 'number', m.extraMonthlyPayment || 0, 'Optional extra principal added to each monthly payment to accelerate payoff and reduce total lifetime interest.')}</div>`;
        html += this._buildExtraPayoffBadgeHtml(mortModel);
        html += `</div>`;

        html += this._renderRecastSubsection(m, mortModel);
        html += `</div>`;
        html += this._endSection();
        return html;
    }

    _buildDownsizingPreviewHtml(mortModel, currentHomeValue, annualGrowthRate) {
        const startDateStr = this.state.assumptions?.startDate || '';
        const startYear = parseInt(startDateStr, 10) || new Date().getFullYear();
        const inflationRate = Number(this.state.assumptions?.inflationRate ?? 3);
        const p = mortModel.calculateDownsizingPreview({
            currentHomeValue,
            annualGrowthRate,
            startYear,
            inflationRate
        });

        const financingLine = p.financeReplacement
            ? `🔑 <strong>${p.replacementCostPct}% Replacement Home</strong>: <strong>$${p.replacementHomeValue.toLocaleString()}</strong> (~$${p.replacementHomeValueReal.toLocaleString()} today's $) • <strong>${p.downPaymentPct}% Down</strong> ($${p.downPaymentAmount.toLocaleString()}) + New Loan (<strong>$${p.newLoanBalance.toLocaleString()}</strong>)`
            : `🔑 <strong>${p.replacementCostPct}% Replacement Home</strong>: <strong>$${p.replacementHomeValue.toLocaleString()}</strong> (~$${p.replacementHomeValueReal.toLocaleString()} today's $) • Paid <strong>100% Cash</strong> ($0 New Mortgage)`;

        const cashProceedsLine =
            p.cashDeficit > 0
                ? `⚠️ <strong>Portfolio Cash Needed at Closing</strong>: <strong style="color: #f87171;">-$${p.cashDeficit.toLocaleString()}</strong> (Replacement cost exceeds net sale equity)`
                : `💰 <strong>Net Cash Swept to Brokerage (Tax-Free Basis)</strong>: <strong style="color: #10b981;">+$${p.netCashProceeds.toLocaleString()}</strong>`;

        const piSavingsBadge =
            p.monthlyPaymentSavings > 0
                ? ` (<strong style="color: #10b981;">-$${p.monthlyPaymentSavings.toLocaleString()}/mo</strong>)`
                : '';

        return `<div id="mortgage-downsizing-preview-box" style="margin-top: 0.65rem; padding: 0.75rem 0.9rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; font-size: 0.82rem; line-height: 1.55; color: var(--text-primary);">
            <div>🏠 <strong>${p.targetYear} Est. Sale Price</strong>: <strong>$${p.grossSale.toLocaleString()}</strong> − Selling Costs (${p.sellingCostPct}%: $${p.closingCosts.toLocaleString()}) − Loan Payoff ($${p.mortgagePayoff.toLocaleString()}) = <strong>Net Sale Equity: $${p.totalEquity.toLocaleString()}</strong></div>
            <div>${financingLine}</div>
            <div>${cashProceedsLine} • Monthly P&amp;I: <strong>$${p.oldMonthlyPayment.toLocaleString()}/mo</strong> ➔ <strong style="color: #38bdf8;">$${p.newMonthlyPayment.toLocaleString()}/mo</strong>${piSavingsBadge}</div>
        </div>`;
    }

    _renderDownsizingFinancingSubsection(d) {
        const isFinanced = Boolean(d.financeReplacement);
        let html = `<div style="margin-top: 0.5rem;">`;
        html += this._checkbox(
            'Finance Replacement Home with New Mortgage (Instead of 100% Cash)',
            'primaryResidenceMortgage.downsizing.financeReplacement',
            isFinanced,
            'Allows financing the replacement home with a new mortgage so a larger share of home sale equity sweeps into liquid investments.'
        );
        html += `<div id="downsizing-financing-inputs" style="display: ${isFinanced ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Down Payment (%)', 'primaryResidenceMortgage.downsizing.downPaymentPercentage', 'number', d.downPaymentPercentage, 'Percentage of the replacement home price paid in cash at closing.')}</div>`;
        html += `<div>${this._input('New Mortgage Rate (%)', 'primaryResidenceMortgage.downsizing.replacementInterestRate', 'number', d.replacementInterestRate, 'Annual interest rate on the replacement home mortgage.')}</div>`;
        html += `<div>${this._input('New Loan Term (Years)', 'primaryResidenceMortgage.downsizing.replacementTermYears', 'number', d.replacementTermYears, 'Amortization term in years for the replacement home mortgage.')}</div>`;
        html += `</div></div></div>`;
        return html;
    }

    _renderDownsizingSection() {
        const mortModel = new Mortgage(this.state.primaryResidenceMortgage || {});
        const d = mortModel.downsizing;
        const eq = this.state.primaryResidenceEquity || {};
        const homeVal = Number(eq.currentValue) || 0;
        const homeGrowth = Number(eq.annualGrowthRate ?? 3);

        let html = this._startSection('Home Downsizing & Replacement Financing');
        html += this._checkbox(
            'Enable Future Home Downsizing',
            'primaryResidenceMortgage.downsizing.enabled',
            d.enabled,
            'Sells the primary residence in a target future year, pays off any remaining mortgage, purchases a replacement home, and sweeps net equity into your Taxable Brokerage account.'
        );
        html += `<div id="downsizing-inputs" style="display: ${d.enabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        html += `<div class="tab-stop-grid-4">`;
        html += `<div>${this._input('Target Downsize Year', 'primaryResidenceMortgage.downsizing.year', 'number', d.year, 'Calendar year when the primary residence is sold and replaced.')}</div>`;
        html += `<div>${this._input('Selling Costs (%)', 'primaryResidenceMortgage.downsizing.sellingCostPercentage', 'number', d.sellingCostPercentage, 'Realtor commissions, transfer taxes, and seller closing costs as a percentage of the gross sale price (typically 5%–6%).')}</div>`;
        html += `<div>${this._input('Replacement Home Cost (% of Sale)', 'primaryResidenceMortgage.downsizing.replacementHomeCostPercentage', 'number', d.replacementHomeCostPercentage, 'Cost of the replacement home as a percentage of the sold home value.')}</div>`;
        html += `<div>${this._input('Property Cost Reduction (%)', 'primaryResidenceMortgage.downsizing.propertyCostReductionPercentage', 'number', d.propertyCostReductionPercentage, 'Percentage reduction in annual property taxes, insurance, and repairs after downsizing.')}</div>`;
        html += `</div>`;

        html += this._renderDownsizingFinancingSubsection(d);
        html += this._buildDownsizingPreviewHtml(mortModel, homeVal, homeGrowth);
        html += `</div>`;
        html += this._endSection();
        return html;
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = this._renderMortgageSection();

        // Card B: Property Value & Holding Costs
        html += this._startSection('Property Value & Holding Costs');
        const homeGrowth =
            this.state.primaryResidenceEquity.annualGrowthRate !== undefined
                ? this.state.primaryResidenceEquity.annualGrowthRate
                : 3;
        const estEquity = this._calculateEstimatedEquity();

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

        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Yearly Taxes ($)', 'primaryResidenceMortgage.yearlyTaxes', 'number', this.state.primaryResidenceMortgage.yearlyTaxes, 'Annual municipal property taxes.')}</div>`;
        html += `<div>${this._input('Yearly Insurance ($)', 'primaryResidenceMortgage.yearlyInsurance', 'number', this.state.primaryResidenceMortgage.yearlyInsurance, 'Annual homeowner property insurance premium.')}</div>`;
        html += `<div>${this._input('Yearly Repairs ($)', 'primaryResidenceMortgage.yearlyRepairs', 'number', this.state.primaryResidenceMortgage.yearlyRepairs, 'Annual maintenance, upkeep, and capital repair reserves.')}</div>`;
        html += `</div>`;

        const homeWarn = HeuristicValidator.validateHomeAppreciation(homeGrowth);
        html += this._warningBox('household-home-growth-warning', homeWarn ? homeWarn.message : '');

        html += `<div class="pane-section-header" style="margin-top: 0.75rem;">Reverse Mortgage Strategy (Optional)</div>`;
        const isRmEnabled = Boolean(
            this.state.primaryResidenceEquity.reverseMortgageEnabled ?? this.state.primaryResidenceEquity.enabled
        );
        html += this._checkbox(
            'Enable Reverse Mortgage Strategy',
            'primaryResidenceEquity.reverseMortgageEnabled',
            isRmEnabled,
            'Optionally tap into home equity as a non-recourse line of credit to backstop late-life cash flow.'
        );
        html += `<div id="reverse-mortgage-inputs" style="display: ${isRmEnabled ? 'block' : 'none'}; margin-top: 0.5rem; max-width: 400px;">`;
        html += `<div>${this._input('Start Age (Spouse 1)', 'primaryResidenceEquity.reverseMortgageStartAge', 'number', this.state.primaryResidenceEquity.reverseMortgageStartAge, 'Eligible age (must be 62+) to start drawing reverse mortgage equity.')}</div>`;
        html += `</div>`;
        html += this._endSection();

        html += this._renderDownsizingSection();
        return html;
    }

    _handleVisibilityToggles(path, checked) {
        const toggleMap = {
            'primaryResidenceMortgage.enabled': '#mortgage-inputs',
            'primaryResidenceMortgage.recast.enabled': '#mortgage-recast-inputs',
            'primaryResidenceMortgage.downsizing.enabled': '#downsizing-inputs',
            'primaryResidenceMortgage.downsizing.financeReplacement': '#downsizing-financing-inputs',
            'primaryResidenceEquity.reverseMortgageEnabled': '#reverse-mortgage-inputs'
        };
        const selector = toggleMap[path];
        if (selector) {
            const container = this.querySelector(selector);
            if (container) container.style.display = checked ? 'block' : 'none';
        }
    }

    _readDomFieldValue(path, fallback) {
        const el = this.querySelector(`[data-path="${path}"]`);
        if (!el) return fallback;
        if (el.type === 'checkbox') return Boolean(el.checked);
        if (el.type === 'number') return Number(el.value) || 0;
        return el.value ?? fallback;
    }

    _buildLiveDownsizingData(downsizingBase = {}) {
        return {
            ...downsizingBase,
            enabled: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.enabled',
                Boolean(downsizingBase.enabled)
            ),
            year: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.year',
                Number(downsizingBase.year) || 2034
            ),
            sellingCostPercentage: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.sellingCostPercentage',
                Number(downsizingBase.sellingCostPercentage ?? 6)
            ),
            replacementHomeCostPercentage: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.replacementHomeCostPercentage',
                Number(downsizingBase.replacementHomeCostPercentage ?? 42.5)
            ),
            propertyCostReductionPercentage: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.propertyCostReductionPercentage',
                Number(downsizingBase.propertyCostReductionPercentage ?? 25)
            ),
            financeReplacement: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.financeReplacement',
                Boolean(downsizingBase.financeReplacement)
            ),
            downPaymentPercentage: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.downPaymentPercentage',
                Number(downsizingBase.downPaymentPercentage ?? 20)
            ),
            replacementInterestRate: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.replacementInterestRate',
                Number(downsizingBase.replacementInterestRate ?? 5.5)
            ),
            replacementTermYears: this._readDomFieldValue(
                'primaryResidenceMortgage.downsizing.replacementTermYears',
                Number(downsizingBase.replacementTermYears) || 30
            )
        };
    }

    _buildLiveMortgageData() {
        const base = this.state.primaryResidenceMortgage || {};
        const recastBase = base.recast || {};
        return {
            ...base,
            enabled: this._readDomFieldValue('primaryResidenceMortgage.enabled', Boolean(base.enabled)),
            originationDate: this._readDomFieldValue('primaryResidenceMortgage.originationDate', base.originationDate),
            originationAmount: this._readDomFieldValue(
                'primaryResidenceMortgage.originationAmount',
                Number(base.originationAmount) || 0
            ),
            currentBalance: this._readDomFieldValue(
                'primaryResidenceMortgage.currentBalance',
                Number(base.currentBalance) || Number(base.originationAmount) || 0
            ),
            termYears: this._readDomFieldValue('primaryResidenceMortgage.termYears', Number(base.termYears) || 30),
            interestRate: this._readDomFieldValue(
                'primaryResidenceMortgage.interestRate',
                Number(base.interestRate) || 0
            ),
            extraMonthlyPayment: this._readDomFieldValue(
                'primaryResidenceMortgage.extraMonthlyPayment',
                Number(base.extraMonthlyPayment) || 0
            ),
            recast: {
                ...recastBase,
                enabled: this._readDomFieldValue(
                    'primaryResidenceMortgage.recast.enabled',
                    Boolean(recastBase.enabled)
                ),
                date: this._readDomFieldValue('primaryResidenceMortgage.recast.date', recastBase.date),
                amount: this._readDomFieldValue(
                    'primaryResidenceMortgage.recast.amount',
                    Number(recastBase.amount) || 0
                ),
                fundingSource: this._readDomFieldValue(
                    'primaryResidenceMortgage.recast.fundingSource',
                    recastBase.fundingSource || 'taxableBrokerage'
                )
            },
            downsizing: this._buildLiveDownsizingData(base.downsizing)
        };
    }

    _updateLiveHousingPreviews() {
        const liveMortData = this._buildLiveMortgageData();
        const mortModel = new Mortgage(liveMortData);
        const monthlyPI = Math.round(mortModel.calculateMonthlyPayment());

        const piPreviewEl = this.querySelector('#mortgage-monthly-pi-preview');
        if (piPreviewEl) {
            piPreviewEl.value = `${monthlyPI.toLocaleString()} / mo`;
        }

        const extraBadgeEl = this.querySelector('#mortgage-extra-payoff-badge');
        if (extraBadgeEl) {
            extraBadgeEl.outerHTML = this._buildExtraPayoffBadgeHtml(mortModel);
        }

        const recastPreviewEl = this.querySelector('#mortgage-recast-preview-box');
        if (recastPreviewEl) {
            recastPreviewEl.outerHTML = this._buildRecastPreviewHtml(mortModel);
        }

        const homeVal = this._readDomFieldValue(
            'primaryResidenceEquity.currentValue',
            Number(this.state.primaryResidenceEquity?.currentValue) || 0
        );
        const homeGrowth = this._readDomFieldValue(
            'primaryResidenceEquity.annualGrowthRate',
            Number(this.state.primaryResidenceEquity?.annualGrowthRate ?? 3)
        );
        const downsizePreviewEl = this.querySelector('#mortgage-downsizing-preview-box');
        if (downsizePreviewEl) {
            downsizePreviewEl.outerHTML = this._buildDownsizingPreviewHtml(mortModel, homeVal, homeGrowth);
        }

        const curMortBal = liveMortData.enabled
            ? Number(liveMortData.currentBalance) || Number(liveMortData.originationAmount) || 0
            : 0;
        const estEquity = Math.max(0, homeVal - curMortBal);
        const eqPreviewEl = this.querySelector('#property-est-equity-preview');
        if (eqPreviewEl) {
            eqPreviewEl.value = estEquity.toLocaleString();
        }
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
            this._updateLiveHousingPreviews();
            this.dispatchEvent(
                new CustomEvent('stateChange', {
                    detail: { element: e.target },
                    bubbles: true
                })
            );
        });

        this.addEvent('input, select', 'change', (e) => {
            const path = e.target.getAttribute('data-path');
            this._handleVisibilityToggles(path, Boolean(e.target.checked));
            this._updateLiveHousingPreviews();

            this.dispatchEvent(
                new CustomEvent('stateChange', {
                    detail: { element: e.target },
                    bubbles: true
                })
            );
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('housing-panel')) {
    customElements.define('housing-panel', HousingPanel);
}
