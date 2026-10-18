import { BaseComponent } from './base-component.js';
import { HeuristicValidator } from '../services/HeuristicValidator.js';

/**
 * Assumptions Panel Component
 * Represents global assumptions and portfolio-wide strategies.
 */
export class AssumptionsPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    _renderCoreAssumptionsRows() {
        const startDateVal =
            this.state.assumptions.startDate ||
            `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

        let html = `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Simulation Start Date', 'assumptions.startDate', 'date', startDateVal, 'The starting month of your financial plan. All entered portfolio account balances represent balances as of this date. Months prior to this date in Year 1 are treated as past history.')}</div>`;
        html += `<div>${this._input('Initial Cash Cushion ($)', 'assumptions.initialCashCushion', 'number', this.state.assumptions.initialCashCushion, 'Starting liquid cash reserve available before retirement investment accounts are tapped for deficit funding.')}</div>`;
        html += `<div>${this._input('Graph Years', 'assumptions.graphYears', 'number', this.state.assumptions.graphYears, 'Total duration (number of years) simulated into the future and displayed on all charts and tables.')}</div>`;
        html += `</div>`;

        const inflRate = this.state.assumptions.inflationRate;
        const w2Raise = this.state.assumptions.w2RaiseRate || 2.0;
        const stateTax = this.state.assumptions.stateTaxRate !== undefined ? this.state.assumptions.stateTaxRate : 0;

        html += `<div class="tab-stop-grid-3">`;
        html += `<div>${this._input('Inflation Rate (%)', 'assumptions.inflationRate', 'number', inflRate, 'Estimated compound annual inflation rate. Used to inflate future expenses, phase budgets, and college costs. Historical 50-year US CPI average is ~2.5%–3.2%.')}</div>`;
        html += `<div>${this._input('Expected Annual Salary Raise (%)', 'assumptions.w2RaiseRate', 'number', w2Raise, 'The expected annual percentage raise or career income growth applied to your base salary each year before retirement.')}</div>`;
        html += `<div>${this._input('State Tax Rate (%)', 'assumptions.stateTaxRate', 'number', stateTax, 'Estimated flat state income tax rate applied on top of Federal 2024 Married Filing Jointly tax brackets.')}</div>`;
        html += `</div>`;

        const inflWarn = HeuristicValidator.validateInflation(inflRate);
        html += this._warningBox('assumptions-inflation-warning', inflWarn ? inflWarn.message : '');
        const wageWarn = HeuristicValidator.validateWageGrowth(w2Raise);
        html += this._warningBox('assumptions-wage-warning', wageWarn ? wageWarn.message : '');
        return html;
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = this._startSection('Global Assumptions', true);
        html += this._renderCoreAssumptionsRows();

        html += `<div style="margin-top: 0.25rem;">`;
        html += this._checkbox(
            "Display in Today's Dollars (Real)",
            'assumptions.displayRealDollars',
            this.state.assumptions.displayRealDollars,
            "Strips cumulative inflation out of all future projected dollars, presenting all net worth, income, and expense numbers in today's constant purchasing power."
        );
        html += `</div>`;

        html += this._renderMarketRates();
        html += `<div class="pane-section-header">Strategy</div>`;
        html += this._renderDrawdownStrategy();
        html += this._render72tStrategy();
        html += this._renderConservativeShift();

        html += this._endSection();
        return html;
    }

    _renderMarketRates() {
        let html = `<div style="padding: 0.85rem 1rem; background: var(--bg-darker); margin-top: 1rem; border-left: 3px solid var(--primary); border-radius: 6px;">
            <div class="pane-section-header">Portfolio Market Return Rates (Securities)</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem; line-height: 1.4;">
                Unified annual nominal return rate for 401k, 403b, Traditional IRA, Roth IRA, and Brokerage accounts. (Long-term S&P 500 nominal avg: ~7%–10%).
            </div>`;

        const marketRates =
            this.state.assumptions.marketReturnRates && this.state.assumptions.marketReturnRates.length > 0
                ? this.state.assumptions.marketReturnRates
                : [{ startYear: new Date().getFullYear(), rate: 7.0 }];

        marketRates.forEach((tier, tIdx) => {
            const tierRate = tier.rate !== undefined ? tier.rate : 7.0;
            const tierWarn = HeuristicValidator.validateMarketReturn(tierRate);

            html += `<div class="tab-stop-grid-2" style="align-items: end; margin-bottom: 0.4rem;">`;
            html += `<div>${this._input(`Start Year`, `assumptions.marketReturnRates.${tIdx}.startYear`, 'number', tier.startYear || new Date().getFullYear(), 'The calendar year this market return rate tier begins taking effect.')}</div>`;
            html += `<div style="display: flex; gap: 0.5rem; align-items: flex-end;">`;
            html += `<div style="flex: 1;">${this._input(`Return Rate (%)`, `assumptions.marketReturnRates.${tIdx}.rate`, 'number', tierRate, 'Annual compound return rate for this time period. S&P 500 average is 7%–10% nominal (5%–7% real).')}</div>`;
            if (marketRates.length > 1) {
                html += `<button type="button" class="btn btn-secondary remove-market-rate-btn" data-index="${tIdx}" style="padding: 0.45rem 0.65rem; background: #e74c3c; color: white; border: none; margin-bottom: 0.5rem; border-radius: 4px;" title="Remove tier">✕</button>`;
            }
            html += `</div></div>`;
            html += this._warningBox(`market-rate-warning-${tIdx}`, tierWarn ? tierWarn.message : '');
        });
        html += `<button id="btn-add-market-rate" type="button" class="btn btn-secondary btn-small" style="margin-top: 0.35rem;">+ Add Rate Tier</button>`;
        html += `</div>`;
        return html;
    }

    _renderWithdrawalWaterfallSubsection() {
        const waterfallOptions = [
            {
                value: 'age_tiered_60',
                label: 'Age-Tiered (<60: Roth ➔ Brokerage | ≥60: 403b ➔ Roth ➔ IRA ➔ Brokerage)'
            },
            { value: 'standard', label: 'Standard Waterfall (Roth Principal ➔ Brokerage ➔ Pre-Tax ➔ Roth Earnings)' },
            { value: 'tax_optimized', label: 'Tax-Bracket Filling (Pre-Tax to 12% Bracket ➔ Roth ➔ Brokerage)' }
        ];
        const currentWaterfall = this.state.strategies?.drawdownStrategy || 'age_tiered_60';
        const tierAge =
            this.state.strategies?.drawdownTierAge !== undefined ? this.state.strategies.drawdownTierAge : 60;

        let html = `<div style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.75rem;">
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--primary); margin-bottom: 0.35rem;">Account Withdrawal Order (Which Accounts to Tap First)</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 0.5rem; line-height: 1.35;">
                Controls the liquidation sequence when investment portfolio drawdowns are needed to cover cash flow deficits.
            </div>`;
        html += this._select(
            'Withdrawal Priority',
            'strategies.drawdownStrategy',
            waterfallOptions,
            currentWaterfall,
            'Defines the order of accounts liquidated to fund deficits across early and traditional retirement.'
        );

        const isAgeTiered = currentWaterfall === 'age_tiered_60' || currentWaterfall === 'age_tiered';
        html += `<div id="age-tiered-drawdown-settings" style="display: ${isAgeTiered ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        html += this._input(
            'Drawdown Transition Age',
            'strategies.drawdownTierAge',
            'number',
            tierAge,
            'The age milestone where the liquidation priority transitions from early retirement bridge to post-60 decumulation. Defaults to 60.'
        );
        html += `<div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 0.65rem 0.85rem; margin-top: 0.5rem; font-size: 0.78rem; line-height: 1.5; color: var(--text-color);">
            <div style="font-weight: 600; color: #34d399; margin-bottom: 0.25rem;">Active Liquidation Sequence:</div>
            <div><strong>Before Age <span class="drawdown-tier-age-val">${tierAge}</span> (Early Bridge):</strong> Roth IRA (Principal &amp; Mature Conversions) ➔ Taxable Brokerage &amp; HYSA. <em>Pre-tax accounts preserved &amp; locked.</em></div>
            <div style="margin-top: 0.2rem;"><strong>Age <span class="drawdown-tier-age-val">${tierAge}</span>+ (Retirement Decumulation):</strong> 1. Workplace 403(b) ➔ 2. Roth IRA ➔ 3. Traditional IRA &amp; 401(k) ➔ 4. Taxable Brokerage.</div>
        </div></div>`;
        html += `<div style="margin-top: 0.65rem; padding-top: 0.5rem; border-top: 1px dashed rgba(255,255,255,0.1);">`;
        html += this._checkbox(
            'Allow Penalized Early Pre-Tax Withdrawals (< Age 59.5, +10% IRS Penalty) as Last Resort',
            'strategies.allowEarlyPenalizedWithdrawals',
            Boolean(this.state.strategies?.allowEarlyPenalizedWithdrawals),
            'By default, Traditional IRAs and non-exempt 401(k)/403(b) accounts are strictly locked before age 59.5 unless Rule 72(t) SEPP or Rule of 55 applies. Enable this only if you want the simulator to break into pre-tax accounts early and pay the 10% IRS penalty when bridge cash runs out.'
        );
        html += `</div></div>`;
        return html;
    }

    _renderDrawdownStrategy() {
        let html = `<div style="padding: 0.5rem; background: var(--bg-darker); margin-top: 1rem; border-left: 3px solid var(--primary);">
            <div class="pane-section-header">Retirement Spending Style &amp; Legacy Goal</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; line-height: 1.4;">
                Defines your family's spending and withdrawal style across retirement (Preserve Principal vs. Spend Down to Legacy Target vs. Active Early Years Curve).
            </div>`;

        const decumOptions = [
            { value: 'capital_preservation', label: 'Preserve Principal (4% Safe Withdrawal Rate / SWR)' },
            { value: 'die_with_zero', label: 'Spend Down to Target Legacy (Die With Zero)' },
            { value: 'front_loaded', label: 'Active Early Retirement Years (Spend More in 50s/60s)' }
        ];

        const currentMode = this.state.strategies?.decumulationMode || 'capital_preservation';
        html += this._select(
            'Retirement Spending Style',
            'strategies.decumulationMode',
            decumOptions,
            currentMode,
            'Controls your spending pattern in retirement: Preserve Principal (4% Rule), Spend Down to Target Legacy (Die With Zero), or Spend More in Active Early Years (Go-Go Curve).'
        );

        const isDieWithZero = currentMode === 'die_with_zero';
        html += `<div id="die-with-zero-settings" style="display: ${isDieWithZero ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        html += this._input(
            'Target Legacy Reserve ($)',
            'strategies.targetLegacyBalance',
            'number',
            this.state.strategies?.targetLegacyBalance || 0,
            'Desired portfolio balance remaining at life expectancy. Set to $0 to fully draw down to zero, or set a target inheritance buffer for heirs.'
        );
        html += `</div>`;

        html += `<div id="drawdown-vitality-settings" style="margin-top: 0.5rem;">`;
        html += this._input(
            'Active Early Retirement Spending Multiplier (Ages 60–69) (x)',
            'strategies.gogoMultiplier',
            'number',
            this.state.strategies?.gogoMultiplier !== undefined ? this.state.strategies.gogoMultiplier : 1.0,
            'Lifestyle spending multiplier applied during active early retirement years (50s/60s) when physical energy and travel desires are highest (1.0x to 1.5x).'
        );
        html += this._input(
            'Personal Health Pace Adjustment (Years)',
            'strategies.healthAgingOffset',
            'number',
            this.state.strategies?.healthAgingOffset || 0,
            'Adjusts when your retirement spending transitions from active travel years into slower-paced mature years (+years if health slows down earlier; -years if staying active longer).'
        );
        html += `</div>`;
        html += this._renderWithdrawalWaterfallSubsection();
        html += `</div>`;
        return html;
    }

    _render72tStrategy() {
        let html = `<div style="padding: 0.5rem; background: var(--bg-darker); margin-top: 1rem; border-left: 3px solid var(--primary);">
            <div class="pane-section-header">Pre-Age 59½ Penalty-Free Withdrawal Strategy (IRS Rule 72t)</div>`;
        html += this._input(
            'Interest Rate (%)',
            `strategies.rule72tInterestRate`,
            'number',
            this.state.strategies.rule72tInterestRate || 5.0,
            'Statutory interest rate used for IRS 72(t) fixed amortization method. The IRS permits up to 120% of the AFR rate or 5.0%. Higher rates produce larger annual penalty-free distributions.'
        );
        html += `</div>`;
        return html;
    }

    _renderConservativeShift() {
        let html = `<div style="padding: 0.5rem; background: var(--bg-darker); margin-top: 1rem; border-left: 3px solid var(--primary);">
            <div class="pane-section-header">Automatic Shift to Safer Assets (Bond Buffer)</div>`;
        html += this._checkbox(
            'Enable Conservative Shift',
            'assumptions.conservativeShift.enabled',
            this.state.assumptions.conservativeShift?.enabled,
            'Gradually shifts your portfolio toward safer bonds and fixed income at a target age to cushion against stock market crashes in retirement.'
        );
        html += `<div id="conservative-shift-inputs" style="display: ${this.state.assumptions.conservativeShift?.enabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        html += this._input(
            'Shift Age (Spouse 1)',
            'assumptions.conservativeShift.startAge',
            'number',
            this.state.assumptions.conservativeShift?.startAge !== undefined
                ? this.state.assumptions.conservativeShift.startAge
                : 60,
            'Age of Spouse 1 when the portfolio asset allocation shifts towards bonds.'
        );
        html += this._input(
            'Conservative Return Rate (%)',
            'assumptions.conservativeShift.returnRate',
            'number',
            this.state.assumptions.conservativeShift?.returnRate !== undefined
                ? this.state.assumptions.conservativeShift.returnRate
                : 5.5,
            'Lower annual portfolio return rate applied after the conservative shift age.'
        );
        html += `</div></div>`;
        return html;
    }

    _handleLiveInputValidation(path, value) {
        if (path === 'assumptions.inflationRate') {
            const box = this.querySelector('#assumptions-inflation-warning');
            if (box) {
                const res = HeuristicValidator.validateInflation(value);
                box.innerHTML = res ? res.message : '';
                box.style.display = res ? 'block' : 'none';
            }
        } else if (path === 'assumptions.w2RaiseRate') {
            const box = this.querySelector('#assumptions-wage-warning');
            if (box) {
                const res = HeuristicValidator.validateWageGrowth(value);
                box.innerHTML = res ? res.message : '';
                box.style.display = res ? 'block' : 'none';
            }
        } else if (path && path.startsWith('assumptions.marketReturnRates.') && path.endsWith('.rate')) {
            const parts = path.split('.');
            const tIdx = parts[2];
            const box = this.querySelector(`#market-rate-warning-${tIdx}`);
            if (box) {
                const res = HeuristicValidator.validateMarketReturn(value);
                box.innerHTML = res ? res.message : '';
                box.style.display = res ? 'block' : 'none';
            }
        } else if (path === 'strategies.drawdownTierAge') {
            const ageVal = Number(value) || 60;
            this.querySelectorAll('.drawdown-tier-age-val').forEach((spanEl) => {
                spanEl.textContent = String(ageVal);
            });
        }
    }

    afterRender() {
        this.addEvent('input, select', 'input', (e) => {
            const path = e.target.getAttribute('data-path');
            this._handleLiveInputValidation(path, e.target.value);
            this.dispatchEvent(
                new CustomEvent('stateChange', {
                    detail: { element: e.target },
                    bubbles: true
                })
            );
        });

        this.addEvent('input, select', 'change', (e) => {
            const path = e.target.getAttribute('data-path');
            this._handleLiveInputValidation(path, e.target.value);
            if (path === 'strategies.decumulationMode') {
                const legacyBox = this.querySelector('#die-with-zero-settings');
                if (legacyBox) {
                    legacyBox.style.display = e.target.value === 'die_with_zero' ? 'block' : 'none';
                }
            } else if (path === 'strategies.drawdownStrategy') {
                const tieredBox = this.querySelector('#age-tiered-drawdown-settings');
                if (tieredBox) {
                    tieredBox.style.display =
                        e.target.value === 'age_tiered_60' || e.target.value === 'age_tiered' ? 'block' : 'none';
                }
            } else if (path === 'assumptions.conservativeShift.enabled') {
                const shiftBox = this.querySelector('#conservative-shift-inputs');
                if (shiftBox) {
                    shiftBox.style.display = e.target.checked ? 'block' : 'none';
                }
            }
            this.dispatchEvent(
                new CustomEvent('stateChange', {
                    detail: { element: e.target },
                    bubbles: true
                })
            );
        });

        this.addEvent('#btn-add-market-rate', 'click', (e) => {
            e.preventDefault();
            this.dispatchEvent(new CustomEvent('addMarketRate', { bubbles: true }));
        });

        this.addEvent('.remove-market-rate-btn', 'click', (e) => {
            e.preventDefault();
            const index = e.target.getAttribute('data-index');
            this.dispatchEvent(new CustomEvent('removeMarketRate', { detail: { index }, bubbles: true }));
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('assumptions-panel')) {
    customElements.define('assumptions-panel', AssumptionsPanel);
}
