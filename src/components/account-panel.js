import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';

export class AccountPanel extends BaseComponent {
    constructor() {
        super();
    }

    onInit() {
        this.spousePrefix = this.getAttribute('prefix');
        this.itemIndex = this.getAttribute('index');
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        if (!this.spousePrefix || this.itemIndex === null) return '';
        this.state = this.getEffectiveState();
        const keys = this.spousePrefix.split('.');
        let spouseObj = this.state;
        for (const k of keys) { spouseObj = spouseObj[k]; }
        
        const acc = spouseObj.accounts[this.itemIndex];
        if (!acc) return '';

        const accPrefix = `${this.spousePrefix}.accounts.${this.itemIndex}`;
        const prettyType = this._getPrettyAccountType(acc.type);
        const sweepBadge = acc.isSweepAccount ? `<span style="background: #00cec9; color: #1e272e; font-size: 0.65rem; font-weight: bold; padding: 1px 5px; border-radius: 3px; margin-left: 6px;">⚡ Sweep Account</span>` : '';

        const isOpenByDefault = acc.isOpen !== false && (acc.isOpen || !acc.balance || Number(acc.balance) === 0);
        let out = `<details class="account-card" ${isOpenByDefault ? 'open' : ''} style="padding: 0.75rem 1rem; background: var(--bg-darker); margin-bottom: 0.65rem; border-left: 3px solid #0984e3; border-radius: 6px; cursor: pointer;">`;
        out += `<summary style="font-weight: bold; outline: none; display: flex; justify-content: space-between; align-items: center;">
                    <span id="${accPrefix}-summary-text">${escapeHtml(acc.name || prettyType)} - $${Number(acc.balance || 0).toLocaleString()}${sweepBadge}</span>
                    <button type="button" class="btn btn-secondary remove-account-btn" data-prefix="${this.spousePrefix}" data-index="${this.itemIndex}" style="padding: 0.1rem 0.4rem; font-size: 0.7rem; background: #e74c3c; color: white; border: none; margin-left: 10px;">Remove</button>
                </summary>`;
        out += `<div style="margin-top: 1rem;">`;
        out += `<div class="tab-stop-grid-2">`;
        out += `<div>${this._input(`Account Name`, `${accPrefix}.name`, 'text', acc.name || prettyType, 'Custom descriptive label for this financial account.')}</div>`;
        out += `<div>${this._select(`Account Type`, `${accPrefix}.type`, [
            {value: 'traditional401k', label: 'Traditional 401k'},
            {value: 'trad403b', label: 'Traditional 403b'},
            {value: 'standardIra', label: 'Standard IRA'},
            {value: 'rothIra', label: 'Roth IRA'},
            {value: 'hsa', label: 'Health Savings Account (HSA)'},
            {value: 'taxableBrokerage', label: 'Taxable Brokerage'},
            {value: 'hysa', label: 'High-Yield Savings (HYSA)'},
            {value: 'cd', label: 'Certificate of Deposit (CD)'}
        ], acc.type, 'Account tax classification. Pre-tax (401k, 403b, IRA) defer taxes until withdrawal. Roth IRAs provide tax-free growth with penalty-free withdrawal of Roth Principal at any age. HSAs offer triple tax advantages (exempt from Federal, State, and FICA taxes). 403(b) plans frequently impose strict in-service withdrawal restrictions prior to age 60.')}</div>`;
        out += `</div>`;
        
        if (['taxableBrokerage', 'hysa'].includes(acc.type)) {
            out += this._checkbox('Designated Sweep Account', `${accPrefix}.isSweepAccount`, acc.isSweepAccount, 'Designates this account to automatically receive 100% of unallocated annual household cash surplus.');
        }
        
        out += `<div class="tab-stop-grid-2">`;
        out += `<div>${this._input(`Balance ($)`, `${accPrefix}.balance`, 'number', acc.balance || 0, 'Current total market value of assets in this account.')}</div>`;
        
        if (acc.type === 'hysa') {
            out += `<div>${this._input(`Interest Rate (%)`, `${accPrefix}.expectedReturn`, 'number', acc.expectedReturn !== undefined ? acc.expectedReturn : 4, 'Annual percentage yield (APY) earned on liquid cash savings.')}</div>`;
        } else if (acc.type === 'cd') {
            out += `<div>${this._input(`Fixed Rate (%)`, `${accPrefix}.rate`, 'number', acc.rate !== undefined ? acc.rate : (acc.expectedReturn || 5.0), 'Guaranteed fixed annual percentage yield (APY) locked for the term of the CD.')}</div>`;
            out += `<div>${this._select(`Term Duration`, `${accPrefix}.termMonths`, [
                { value: 3, label: '3 Months' },
                { value: 6, label: '6 Months' },
                { value: 12, label: '12 Months (1 Year)' },
                { value: 18, label: '18 Months (1.5 Years)' },
                { value: 24, label: '24 Months (2 Years)' },
                { value: 36, label: '36 Months (3 Years)' },
                { value: 48, label: '48 Months (4 Years)' },
                { value: 60, label: '60 Months (5 Years)' }
            ], acc.termMonths || (acc.termYears ? acc.termYears * 12 : 12), 'Duration of each CD commitment period. When configured to rollover, each renewal cycle commits funds for this duration.')}</div>`;
            out += `<div>${this._input(`Maturity Date`, `${accPrefix}.maturityDate`, 'date', acc.maturityDate || `${new Date().getFullYear() + 1}-01`, 'Month and year when the initial CD term expires.')}</div>`;
            out += `<div>${this._select(`At Maturity`, `${accPrefix}.maturityAction`, [
                { value: 'sweep', label: 'Sweep to Savings Account' },
                { value: 'rollover', label: 'Rollover (Reinvest into New CD)' }
            ], acc.maturityAction || 'sweep', 'Action taken when CD reaches term maturity: automatically sweep principal+interest into liquid savings, or reinvest into a new CD.')}</div>`;

            const savingsOptions = this._getSavingsOptions();
            if (acc.maturityAction === 'rollover') {
                out += `<div>${this._input(`Rollover Count (Times)`, `${accPrefix}.rolloverCount`, 'number', acc.rolloverCount !== undefined ? acc.rolloverCount : 1, 'Number of consecutive renewal cycles before final cash sweep.')}</div>`;
                out += `<div>${this._select(`Final Sweep Account`, `${accPrefix}.sweepTargetAccountId`, savingsOptions, acc.sweepTargetAccountId, 'The destination liquid savings account where funds are deposited after all rollover cycles complete.')}</div>`;
            } else {
                out += `<div style="grid-column: span 2;">${this._select(`Target Savings Account`, `${accPrefix}.sweepTargetAccountId`, savingsOptions, acc.sweepTargetAccountId, 'The destination liquid savings account where principal and interest are deposited upon maturity.')}</div>`;
            }
        }
        
        if (['traditional401k', 'trad403b'].includes(acc.type)) {
            out += `<div></div>`;
            out += `</div>`;
            out += this._render401kRollover(acc, accPrefix, spouseObj);
            out += `<div class="tab-stop-grid-2">`;
        }
        if (acc.type === 'hsa') {
            out += `<div>${this._input(`Expected Return (%)`, `${accPrefix}.expectedReturn`, 'number', acc.expectedReturn !== undefined ? acc.expectedReturn : 7, 'Expected annual investment growth rate for invested HSA balances.')}</div>`;
            out += `<div>${this._select(`Coverage Tier`, `${accPrefix}.coverageTier`, [
                { value: 'single', label: 'Single ($4,300 statutory cap)' },
                { value: 'family', label: 'Family ($8,550 statutory cap)' }
            ], acc.coverageTier || 'single', 'IRS coverage tier. Single ($4,300/yr) or Family ($8,550/yr). Additional $1,000 catch-up applies automatically at age 55+.')}</div>`;
            out += `<div>${this._input(`Annual Contribution Target ($)`, `${accPrefix}.annualContribution`, 'number', acc.annualContribution !== undefined ? acc.annualContribution : (acc.coverageTier === 'family' ? 8550 : 4300), 'Annual HSA target contribution. Triple tax-free: payroll deductions bypass Federal income tax, State income tax, and FICA payroll tax (7.65%). Contributions automatically stop at Medicare enrollment (Age 65).')}</div>`;
        }
        if (acc.type === 'rothIra') {
            out += `<div>${this._input(`Roth Principal ($)`, `${accPrefix}.principle`, 'number', acc.principle || 0, 'Total cumulative post-tax contributions (Roth Principal). Withdrawable at ANY age with 0% tax and 0% penalty, acting as your primary early retirement bridge before age 59.5.')}</div>`;
            out += `<div style="grid-column: span 2; padding: 0.65rem 0.85rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px; margin-top: 0.5rem;">`;
            out += `<div class="pane-section-header" style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">💰 Annual Roth IRA Contribution</div>`;
            out += this._checkbox('Auto-contribute annually while eligible', `${accPrefix}.autoContribute`, Boolean(acc.autoContribute), 'Automatically contributes up to the statutory limit ($7,000/yr or $8,000/yr for age 50+) each year you have earned income and your household Modified AGI remains below IRS phaseout limits ($150k–$165k Single, $236k–$246k MFJ).');
            
            const isAuto = Boolean(acc.autoContribute);
            out += `<div class="roth-auto-subfields-container tab-stop-grid-3" style="display: ${isAuto ? 'grid' : 'none'}; margin-top: 0.5rem;">`;
            out += `<div>${this._input(`Annual Contribution Target ($)`, `${accPrefix}.annualContribution`, 'number', acc.annualContribution || 7000, 'Target annual contribution (capped by statutory limits $7,000 / $8,000 if 50+ and household MAGI eligibility).')}</div>`;
            out += `<div>${this._input(`Start Year`, `${accPrefix}.startYear`, 'number', acc.startYear || '', 'Optional year to begin automatic contributions (e.g. start next year). Leave blank to start immediately.')}</div>`;
            out += `<div>${this._input(`Stop Year`, `${accPrefix}.stopYear`, 'number', acc.stopYear || '', 'Optional final year to contribute (e.g. contribute for 3 or 5 years only). Leave blank to continue until retirement.')}</div>`;
            out += `</div></div>`;
        }
        if (acc.type === 'taxableBrokerage') {
            const defaultCostBasis = acc.costBasis !== undefined ? acc.costBasis : Math.round((acc.balance || 0) * 0.5);
            out += `<div>${this._input(`Cost Basis ($)`, `${accPrefix}.costBasis`, 'number', defaultCostBasis, 'Total cumulative after-tax amount invested into this brokerage account. When shares are liquidated, only the capital gain above basis is taxed at preferential LTCG rates (0%/15%/20%) and NIIT (3.8%). Return of capital is completely tax-free.')}</div>`;
            out += `<div style="grid-column: span 2; margin-top: -0.25rem; margin-bottom: 0.5rem;">
                <button type="button" class="btn btn-secondary open-cost-basis-modal-btn" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(59, 130, 246, 0.15); border: 1px solid var(--accent); color: var(--accent); border-radius: 4px; cursor: pointer;">
                    ℹ️ How do I figure out my Cost Basis? (1099-B & Brokerage Guide)
                </button>
            </div>`;
        }
        out += `</div></div></details>`;
        return out;
    }

    _getPrettyAccountType(type) {
        const types = {
            'traditional401k': '401k',
            'trad403b': '403b',
            'standardIra': 'Standard IRA',
            'rothIra': 'Roth IRA',
            'hsa': 'HSA',
            'taxableBrokerage': 'Taxable Brokerage',
            'hysa': 'HYSA',
            'cd': 'CD'
        };
        return types[type] || type;
    }

    _getSavingsOptions() {
        const options = [];
        [this.state.primarySpouse, this.state.secondarySpouse].forEach(sp => {
            (sp?.accounts || []).filter(a => a.type === 'hysa' || a.type === 'taxableBrokerage').forEach(a => {
                options.push({ value: a.id || a.name, label: `${sp.name || 'Spouse'} - ${a.name || a.type}` });
            });
        });
        if (options.length === 0) options.push({ value: '', label: 'Default Household Sweep' });
        return options;
    }

    _render401kRollover(acc, accPrefix, spouseObj) {
        const roll = acc.rollover || {};
        const isEnabled = Boolean(roll.enabled);
        const timing = roll.timing || 'job_end';
        const targetMode = roll.targetIraMode || 'existing';
        const isFull = roll.isFullBalance !== false;

        const currentYr = new Date().getFullYear();
        const rollDate = roll.startDate || `${currentYr + 5}-01`;

        const iraAccs = (spouseObj.accounts || []).filter(a => a.type === 'standardIra');
        const iraOpts = iraAccs.map(a => ({
            value: a.id || a.name,
            label: `${a.name || 'Standard IRA'} ($${Math.round(a.balance || 0).toLocaleString()})`
        }));
        if (iraOpts.length === 0) {
            iraOpts.push({ value: 'standardIra', label: 'Standard IRA' });
        }

        let out = `<div style="grid-column: span 2; padding: 0.5rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 0.5rem;">`;
        out += `<div class="pane-section-header" style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">🔄 Rollover to Traditional IRA</div>`;
        out += this._checkbox('Enable Rollover to Traditional IRA', `${accPrefix}.rollover.enabled`, isEnabled, 'Transfers workplace 401(k)/403(b) balance into a personal Traditional IRA, unlocking investment choices and enabling Rule 72(t) SEPP distributions.');
        
        out += `<div class="rollover-subfields-container" style="display: ${isEnabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        out += this._select('Rollover Timing', `${accPrefix}.rollover.timing`, [
            { value: 'job_end', label: 'When Job Ends / Retirement' },
            { value: 'date', label: 'Specific Date (Month & Year)' }
        ], timing, 'When the rollover executes: automatically upon job termination/retirement, or on a specific calendar date.');

        out += `<div class="rollover-date-wrap" style="display: ${timing === 'date' ? 'block' : 'none'};">`;
        out += this._input('Rollover Date', `${accPrefix}.rollover.startDate`, 'date', rollDate, 'Month and year when the 401(k) funds roll over into the Traditional IRA.');
        out += `</div>`;

        out += this._select('Destination IRA', `${accPrefix}.rollover.targetIraMode`, [
            { value: 'existing', label: 'Use Existing IRA' },
            { value: 'new', label: 'Create New IRA' }
        ], targetMode, 'Roll funds into an existing Traditional IRA in this portfolio, or automatically create a new dedicated rollover IRA.');

        out += `<div class="rollover-target-existing-wrap" style="display: ${targetMode === 'existing' ? 'block' : 'none'};">`;
        out += this._select('Select Target IRA', `${accPrefix}.rollover.targetAccount`, iraOpts, roll.targetAccount || iraOpts[0].value, 'The destination Traditional IRA account.');
        out += `</div>`;

        out += `<div class="rollover-target-new-wrap" style="display: ${targetMode === 'new' ? 'block' : 'none'};">`;
        out += this._input('New IRA Name', `${accPrefix}.rollover.newIraName`, 'text', roll.newIraName || `${acc.name || '401k'} Rollover IRA`, 'Descriptive name for the newly created Traditional IRA.');
        out += `</div>`;

        out += this._checkbox('Roll Full Balance (100%)', `${accPrefix}.rollover.isFullBalance`, isFull, 'If checked, transfers 100% of remaining 401(k) balance.');

        out += `<div class="rollover-amount-wrap" style="display: ${!isFull ? 'block' : 'none'};">`;
        out += this._input('Partial Amount ($)', `${accPrefix}.rollover.amount`, 'number', roll.amount || 0, 'Specific dollar amount to roll over.');
        out += `</div>`;

        out += `</div></div>`;
        return out;
    }

    _handleDynamicVisibility(path, target) {
        if (path.endsWith('.autoContribute')) {
            const sub = this.querySelector('.roth-auto-subfields-container');
            if (sub) sub.style.display = target.checked ? 'grid' : 'none';
        } else if (path.endsWith('.rollover.enabled')) {
            const sub = this.querySelector('.rollover-subfields-container');
            if (sub) sub.style.display = target.checked ? 'block' : 'none';
        } else if (path.endsWith('.rollover.timing')) {
            const dateWrap = this.querySelector('.rollover-date-wrap');
            if (dateWrap) dateWrap.style.display = target.value === 'date' ? 'block' : 'none';
        } else if (path.endsWith('.rollover.targetIraMode')) {
            const existWrap = this.querySelector('.rollover-target-existing-wrap');
            const newWrap = this.querySelector('.rollover-target-new-wrap');
            if (existWrap) existWrap.style.display = target.value === 'existing' ? 'block' : 'none';
            if (newWrap) newWrap.style.display = target.value === 'new' ? 'block' : 'none';
        } else if (path.endsWith('.rollover.isFullBalance')) {
            const amtWrap = this.querySelector('.rollover-amount-wrap');
            if (amtWrap) amtWrap.style.display = target.checked ? 'none' : 'block';
        } else if (path.endsWith('.type') || path.endsWith('.maturityAction')) {
            const details = this.querySelector('details.account-card');
            const wasOpen = details ? details.open : true;
            const keys = this.spousePrefix.split('.');
            let spouseObj = this.state;
            for (const k of keys) { spouseObj = spouseObj[k]; }
            if (spouseObj?.accounts && spouseObj.accounts[this.itemIndex]) {
                spouseObj.accounts[this.itemIndex].isOpen = wasOpen;
            }
            this.state = this.getEffectiveState();
            this.render();
            this.afterRender();
        }
    }

    afterRender() {
        const details = this.querySelector('details.account-card');
        if (details) {
            details.addEventListener('toggle', () => {
                const keys = this.spousePrefix.split('.');
                let spouseObj = this.state;
                for (const k of keys) { spouseObj = spouseObj[k]; }
                if (spouseObj?.accounts && spouseObj.accounts[this.itemIndex]) {
                    spouseObj.accounts[this.itemIndex].isOpen = details.open;
                }
            });
        }

        this.addEvent('input, select', 'change', (e) => {
            const path = e.target.getAttribute('data-path');
            if (path) {
                this._handleDynamicVisibility(path, e.target);
            }
            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });

        this.querySelectorAll('.open-cost-basis-modal-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const modal = document.querySelector('cost-basis-modal');
                if (modal && typeof modal.open === 'function') {
                    modal.open();
                } else {
                    const el = document.getElementById('cost-basis-modal');
                    if (el) el.classList.remove('hidden');
                }
            });
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('account-panel')) {
    customElements.define('account-panel', AccountPanel);
}
