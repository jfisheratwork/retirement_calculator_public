import { BaseComponent } from './base-component.js';
import { HeuristicValidator } from '../services/HeuristicValidator.js';
import { parseDateParts, normalizeDateStr } from '../utils/date.js';

export class StrategyEventsPanel extends BaseComponent {
    constructor() {
        super();
    }

    onInit() {
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        return `
            <div style="max-width: 1400px;">
                ${this._renderAdvancedRothSection()}
                <div class="two-col-layout" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                    <div>
                        ${this._renderSpouseStrategyColumn('primarySpouse', this.state.primarySpouse || {})}
                    </div>
                    <div>
                        ${this._renderSpouseStrategyColumn('secondarySpouse', this.state.secondarySpouse || {})}
                    </div>
                </div>
            </div>
        `;
    }

    _renderAdvancedRothSection() {
        const advRoth = this.state.strategies?.advancedRothStrategy || {};
        const isEnabled = Boolean(advRoth.enabled);
        const bracketOptions = [
            { value: '10', label: '10%' },
            { value: '12', label: '12%' },
            { value: '22', label: '22%' },
            { value: '24', label: '24%' },
            { value: '32', label: '32%' },
            { value: '35', label: '35%' },
            { value: '37', label: '37%' }
        ];

        const currentYear = new Date().getFullYear();
        const advStartYear = advRoth.startYear || currentYear;
        const advStartDate = normalizeDateStr(advRoth.startDate, advStartYear, 1) || `${advStartYear}-01-01`;

        let html = `<div class="card" style="padding: 1rem; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 1.5rem;">
            <div class="pane-section-header" style="margin-bottom: 0.5rem;">Advanced Dynamic Roth Conversion Ladder (Household Bracket Filling)</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem; line-height: 1.4;">
                Automatically calculates remaining headroom under your target tax bracket each year and converts Traditional IRA funds dynamically. When enabled, this replaces static per-spouse conversions.
            </div>`;

        html += this._checkbox('Enable Advanced Roth Strategy', 'strategies.advancedRothStrategy.enabled', isEnabled, 'Dynamically converts pre-tax Traditional IRA funds to Roth IRA to fill up a target tax bracket without crossing into a higher bracket.');

        html += `<div id="advanced-roth-inputs" style="display: ${isEnabled ? 'block' : 'none'}; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.08);">`;
        html += `<div class="tab-stop-grid-2">`;
        html += `<div>` + this._select('Target Tax Bracket', 'strategies.advancedRothStrategy.targetBracket', bracketOptions, advRoth.targetBracket || '12', 'The highest federal income tax bracket you wish to fill with Roth conversions each year.') + `</div>`;
        html += `<div>` + this._input('Safety Margin ($)', 'strategies.advancedRothStrategy.safetyMargin', 'number', advRoth.safetyMargin !== undefined ? advRoth.safetyMargin : 10000, 'Dollar buffer kept below the top bracket ceiling to protect against bracket overshooting.') + `</div>`;
        html += `<div>` + this._input('Start Date (Month & Year)', 'strategies.advancedRothStrategy.startDate', 'date', advStartDate, 'The month and year this automated conversion ladder starts.') + `</div>`;
        html += `<div>` + this._input('Duration (Years)', 'strategies.advancedRothStrategy.durationYears', 'number', advRoth.durationYears || 10, 'Number of consecutive years to execute the dynamic conversion strategy.') + `</div>`;
        html += `</div>`;

        html += `<div style="margin-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.75rem;">
            <div style="font-weight: 600; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">Minimum Conversion Rules</div>`;
        html += `<div class="tab-stop-grid-2">`;
        html += `<div>` + this._input('Minimum Annual Conversion ($)', 'strategies.advancedRothStrategy.minConversion', 'number', advRoth.minConversion || 0, 'Guarantees at least this amount is converted annually even if it exceeds the target bracket up to the absolute max bracket.') + `</div>`;
        html += `<div>` + this._select('Absolute Max Bracket', 'strategies.advancedRothStrategy.maxBracket', bracketOptions, advRoth.maxBracket || '24', 'The hard tax bracket ceiling that minimum conversions will never exceed.') + `</div>`;
        html += `</div></div>`;

        html += `</div></div>`;
        return html;
    }

    _renderSpouseStrategyColumn(prefix, spouseObj) {
        const title = prefix === 'primarySpouse' 
            ? `${spouseObj.name || 'Primary'} - Conversion & SEPP Events`
            : `${spouseObj.name || 'Spouse'} - Conversion & SEPP Events`;

        let out = this._startSection(title);
        out += this._render72tSection(prefix, spouseObj);
        out += this._renderRothSection(prefix, spouseObj);
        out += this._endSection();
        return out;
    }

    _getProjectedAccountBalance(prefix, account, targetYear, targetMonth) {
        if (!account) return 0;
        if (typeof window !== 'undefined' && window.__lastSimResult?.data) {
            const snap = window.__lastSimResult.data.find(d => d.year === targetYear);
            if (snap?.monthlySnapshots && snap.monthlySnapshots[targetMonth - 1]?.balances) {
                const b = snap.monthlySnapshots[targetMonth - 1].balances;
                const id = account.id || account.name;
                if (b.byAccount && b.byAccount[id] !== undefined) {
                    return b.byAccount[id];
                }
                const spouseCode = prefix === 'primarySpouse' ? 's1' : 's2';
                if (account.type === 'standardIra' && b[`${spouseCode}StandardIra`] !== undefined) {
                    return b[`${spouseCode}StandardIra`];
                }
                if (account.type === 'traditional401k' && b[`${spouseCode}Trad401k`] !== undefined) {
                    return b[`${spouseCode}Trad401k`];
                }
            }
        }
        const currentYear = new Date().getFullYear();
        const years = Math.max(0, targetYear - currentYear);
        const rate = Number(account.expectedReturn ?? 7) / 100;
        return (account.balance || 0) * Math.pow(1 + rate, years);
    }

    _get72tSourceOptions(prefix, spouseObj, targetYear, targetMonth) {
        const sourceCandidates = (spouseObj.accounts || []).filter(a => ['traditional401k', 'trad403b', 'standardIra'].includes(a.type));
        const srcOpts = sourceCandidates.map(a => {
            const projected = this._getProjectedAccountBalance(prefix, a, targetYear, targetMonth);
            const baselineStr = Math.round(a.balance || 0).toLocaleString();
            const projectedStr = Math.round(projected).toLocaleString();
            return {
                value: a.id || a.name,
                label: `${a.name || a.type} ($${baselineStr} baseline ➔ Est. $${projectedStr} at conversion)`
            };
        });
        if (srcOpts.length === 0) srcOpts.push({ value: 'standardIra', label: 'Standard IRA' });
        return srcOpts;
    }

    _get72tIraOptions(prefix, spouseObj, targetYear, targetMonth) {
        const iraAccounts = (spouseObj.accounts || []).filter(a => a.type === 'standardIra');
        const iraOpts = iraAccounts.map(a => {
            const projected = this._getProjectedAccountBalance(prefix, a, targetYear, targetMonth);
            const baselineStr = Math.round(a.balance || 0).toLocaleString();
            const projectedStr = Math.round(projected).toLocaleString();
            return {
                value: a.id || a.name,
                label: `${a.name || 'Standard IRA'} ($${baselineStr} baseline ➔ Est. $${projectedStr} at conversion)`
            };
        });
        if (iraOpts.length === 0) iraOpts.push({ value: 'standardIra', label: 'Standard IRA' });
        return iraOpts;
    }

    _render72tInputs(prefix, spouseObj, r72t) {
        const birthYear = Number(spouseObj.yearOfBirth) || 1980;
        const startAge = r72t.startAge || 55;
        const r72tMonth = Number(r72t.startMonth) || 1;
        const default72tYear = birthYear + startAge;
        const { year: targetYear, month: targetMonth } = parseDateParts(r72t.startDate, default72tYear, r72tMonth);
        const r72tDate = normalizeDateStr(r72t.startDate, default72tYear, r72tMonth) || `${default72tYear}-${String(r72tMonth).padStart(2, '0')}-01`;
        const calculatedR72tAge = targetYear - birthYear;
        const r72tBadge = `<span id="${prefix}-72t-age-badge" class="badge-subtle badge-subtle-blue">Age ${calculatedR72tAge}</span>`;

        const srcOpts = this._get72tSourceOptions(prefix, spouseObj, targetYear, targetMonth);
        const iraOpts = this._get72tIraOptions(prefix, spouseObj, targetYear, targetMonth);
        const targetMode = r72t.targetIraMode || 'existing';

        let out = `<div class="tab-stop-grid-2">`;
        out += `<div>` + this._select('Source Account (Funds Coming From)', `${prefix}.rule72t.sourceAccount`, srcOpts, r72t.sourceAccount || srcOpts[0].value, 'The retirement account (401k, 403b, or IRA) supplying funds for the 72(t) schedule.') + `</div>`;
        out += `<div>` + this._select('Designated 72(t) Account Mode', `${prefix}.rule72t.targetIraMode`, [
            { value: 'existing', label: 'Use Existing IRA' },
            { value: 'new', label: 'Create New Dedicated 72(t) IRA' }
        ], targetMode, 'Choose whether to designate an existing Traditional IRA or automatically instantiate a separate new IRA to hold the locked 72(t) balance.') + `</div>`;

        out += `<div>`;
        out += `<div id="${prefix}-72t-target-existing-wrap" style="display: ${targetMode === 'existing' ? 'block' : 'none'};">`;
        out += this._select('Select Target IRA', `${prefix}.rule72t.targetAccount`, iraOpts, r72t.targetAccount || iraOpts[0].value, 'The destination Traditional IRA account tied to 72(t) SEPP distributions.');
        out += `</div>`;
        out += `<div id="${prefix}-72t-target-new-wrap" style="display: ${targetMode === 'new' ? 'block' : 'none'};">`;
        out += this._input('New Dedicated IRA Name', `${prefix}.rule72t.newIraName`, 'text', r72t.newIraName || `${spouseObj.name || 'Spouse'} 72(t) IRA`, 'Name for the new isolated Traditional IRA created specifically for 72(t) SEPP.');
        out += `</div>`;
        out += `</div>`;

        const splitVal = r72t.splitAmount !== undefined && r72t.splitAmount !== null ? r72t.splitAmount : '';
        out += `<div>` + this._input('Amount to Split / Roll Over ($)', `${prefix}.rule72t.splitAmount`, 'number', splitVal, 'Initial amount transferred from source account into the 72(t) IRA at plan start. Leave blank to use full source balance.') + `</div>`;

        out += `<div>` + this._input('72(t) Start Date', `${prefix}.rule72t.startDate`, 'date', r72tDate, { tooltip: 'The month and year to begin 72(t) distributions. Starting at age 56 or later locks you into rigid payments past age 59.5.', badge: r72tBadge }) + `</div>`;
        out += `<div>` + this._select('Method', `${prefix}.rule72tMethod`, [
            { value: 'amortization', label: 'Amortization (Fixed - Highest Payout)' },
            { value: 'rmd', label: 'RMD (Variable - Lowest Payout)' }
        ], spouseObj.rule72tMethod || 'amortization', 'Amortization produces steady fixed payout over life expectancy. RMD produces variable distribution.') + `</div>`;
        out += `</div>`;
        
        const warning = HeuristicValidator.validate72tAge(calculatedR72tAge);
        out += this._warningBox(`${prefix}-72t-age-warning`, warning ? warning.message : '');

        // Live SEPP Payout Preview Callout
        const targetAcc = (spouseObj.accounts || []).find(a => a.id === r72t.targetAccount || a.name === r72t.targetAccount || a.type === r72t.targetAccount)
            || (spouseObj.accounts || []).find(a => a.type === 'standardIra');
        const sourceAcc = (spouseObj.accounts || []).find(a => a.id === r72t.sourceAccount || a.name === r72t.sourceAccount || a.type === r72t.sourceAccount)
            || targetAcc;
        const activeAcc = targetAcc || sourceAcc;
        const projectedBal = this._getProjectedAccountBalance(prefix, activeAcc, targetYear, targetMonth);
        const hasCustomSplit = r72t.splitAmount !== undefined && r72t.splitAmount !== null && r72t.splitAmount !== '';
        const effective72tBal = hasCustomSplit ? Math.min(projectedBal, Number(r72t.splitAmount)) : projectedBal;
        const DEFAULT_72T_RATE = 0.05;
        const rate72t = (this.state.strategies?.rule72tInterestRate ? (Number(this.state.strategies.rule72tInterestRate) / 100) : DEFAULT_72T_RATE);
        const projectedAnnualPayout = Math.round(effective72tBal * rate72t);
        const projectedMonthlyPayout = Math.round(projectedAnnualPayout / 12);

        out += `
            <div class="sepp-payout-preview-box" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; padding: 0.75rem; margin-top: 0.75rem; margin-bottom: 0.5rem;">
                <div style="font-weight: 600; font-size: 0.85rem; color: #10b981; display: flex; align-items: center; justify-content: space-between;">
                    <span>📊 Estimated 72(t) SEPP Payout at Conversion</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">${r72tDate} (Age ${calculatedR72tAge})</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 5px; line-height: 1.5;">
                    <div>Estimated IRA Balance at Conversion: <strong style="color: var(--text-primary);">$${Math.round(effective72tBal).toLocaleString()}</strong></div>
                    <div>Statutory Annual Distribution: <strong style="color: #10b981;">$${projectedAnnualPayout.toLocaleString()}/yr</strong> (~$${projectedMonthlyPayout.toLocaleString()}/mo)</div>
                </div>
            </div>
        `;

        return out;
    }

    _render72tSection(prefix, spouseObj) {
        const r72t = spouseObj.rule72t || {};
        const isEnabled = Boolean(r72t.enabled);

        let out = `<div style="padding: 0.75rem; background: var(--bg-darker); margin-top: 0.5rem; border-left: 3px solid var(--primary); border-radius: 4px;">
            <div class="pane-section-header">Rule 72(t) Early Withdrawals (SEPP)</div>`;
        out += this._checkbox('Enable 72(t)', `${prefix}.rule72t.enabled`, isEnabled, 'IRS Rule 72(t) SEPP allows penalty-free withdrawals from Traditional IRAs before age 59.5. ⚠️ CRITICAL WARNING: Once started, payments MUST continue without alteration for 5 consecutive years OR until age 59.5, whichever is LONGER. Modifying early triggers retroactive 10% penalties + interest on all past distributions! NOTE: The IRS legally locks the tied IRA—no new contributions or partial transfers are permitted. Advisors recommend splitting your IRA into two separate accounts prior to 72(t) so one remains accessible for emergency flexibility.');

        out += `<div id="${prefix}-72t-container" style="display: ${isEnabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        out += this._render72tInputs(prefix, spouseObj, r72t);
        out += `</div></div>`;
        return out;
    }

    _getRothIraOptions(prefix, spouseObj, targetYear, targetMonth) {
        const iraAccounts = (spouseObj.accounts || []).filter(a => a.type === 'standardIra');
        const opts = iraAccounts.map(a => {
            const projected = this._getProjectedAccountBalance(prefix, a, targetYear, targetMonth);
            const baselineStr = Math.round(a.balance || 0).toLocaleString();
            const projectedStr = Math.round(projected).toLocaleString();
            return {
                value: a.id || a.name,
                label: `${a.name || 'Standard IRA'} ($${baselineStr} baseline ➔ Est. $${projectedStr} at conversion)`
            };
        });
        if (opts.length === 0) opts.push({ value: 'standardIra', label: 'Standard IRA' });
        return opts;
    }

    _renderRothInputs(prefix, spouseObj) {
        const currentYr = new Date().getFullYear();
        const defaultConvYear = currentYr + (Number(spouseObj.rothConversion?.startDelayYears) || 0);
        const defaultConvMonth = Number(spouseObj.rothConversion?.startMonth || 12);
        const { year: targetYear, month: targetMonth } = parseDateParts(spouseObj.rothConversion?.startDate, defaultConvYear, defaultConvMonth);
        const rothStartDate = normalizeDateStr(spouseObj.rothConversion?.startDate, defaultConvYear, defaultConvMonth) || `${defaultConvYear}-${String(defaultConvMonth).padStart(2, '0')}-01`;
        const opts = this._getRothIraOptions(prefix, spouseObj, targetYear, targetMonth);
        const selVal = spouseObj.rothConversion?.sourceAccount || opts[0].value;

        let out = this._select('Source IRA Account', `${prefix}.rothConversion.sourceAccount`, opts, selVal, 'The pre-tax Traditional IRA from which funds will be converted.');
        out += this._input('Start Date (Month & Year)', `${prefix}.rothConversion.startDate`, 'date', rothStartDate, 'The month and year when the annual Roth conversion schedule commences.');
        out += this._input('Conversion Amount ($/yr)', `${prefix}.rothConversion.amountPerYear`, 'number', spouseObj.rothConversion?.amountPerYear || 0, 'Annual dollar amount converted to Roth IRA.');
        out += this._input('Duration (Years)', `${prefix}.rothConversion.durationYears`, 'number', spouseObj.rothConversion?.durationYears || 5, 'Number of consecutive annual conversion cohorts.');
        return out;
    }

    _renderRothSection(prefix, spouseObj) {
        const isAdvanced = this.state.strategies?.advancedRothStrategy?.enabled;
        const style = isAdvanced ? 'opacity: 0.5; pointer-events: none;' : '';
        let out = `<div id="${prefix}-roth-static-container" style="padding: 0.75rem; background: var(--bg-darker); margin-top: 1.25rem; border-left: 3px solid var(--primary); border-radius: 4px; ${style}">
            <div class="pane-section-header">Roth Conversions (Static)</div>
            <div id="${prefix}-roth-static-warning" style="font-size: 0.8rem; color: var(--warning); margin-bottom: 0.5rem; display: ${isAdvanced ? 'block' : 'none'};">Disabled by Advanced Roth Strategy</div>`;
        out += this._checkbox('Enable Roth Conversions', `${prefix}.rothConversion.enabled`, spouseObj.rothConversion?.enabled, 'Converts pre-tax Traditional IRA funds to Roth IRA. Converted principal requires 5 calendar years to age before penalty-free withdrawal.');
        
        out += `<div id="${prefix}-roth-static-inputs" style="display: ${spouseObj.rothConversion?.enabled ? 'block' : 'none'}; margin-top: 0.5rem;">`;
        out += this._renderRothInputs(prefix, spouseObj);
        out += `</div></div>`;
        return out;
    }

    afterRender() {
        this.addEvent('input, select', 'input', (e) => {
            const path = e.target.getAttribute('data-path');
            if (!path) return;
            const prefix = path.startsWith('secondarySpouse') ? 'secondarySpouse' : 'primarySpouse';
            const birthYear = Number(this.state[prefix]?.yearOfBirth) || 1980;

            if (path.endsWith('.rule72t.startDate')) {
                const rYear = parseInt(String(e.target.value).split('-')[0], 10) || (birthYear + 55);
                const calcAge = rYear - birthYear;
                const badge = this.querySelector(`#${prefix}-72t-age-badge`);
                if (badge) badge.innerText = `(Start Age: ${calcAge})`;

                const warnBox = this.querySelector(`#${prefix}-72t-age-warning`);
                if (warnBox) {
                    const res = HeuristicValidator.validate72tAge(calcAge);
                    warnBox.innerHTML = res ? res.message : '';
                    warnBox.style.display = res ? 'block' : 'none';
                }
            }
        });

        this.addEvent('input, select', 'change', (e) => {
            const path = e.target.getAttribute('data-path');
            if (path) {
                const prefix = path.startsWith('secondarySpouse') ? 'secondarySpouse' : 'primarySpouse';
                if (path.endsWith('.rule72t.enabled')) {
                    const c = this.querySelector(`#${prefix}-72t-container`);
                    if (c) c.style.display = e.target.checked ? 'block' : 'none';
                } else if (path.endsWith('.rule72t.targetIraMode')) {
                    const existWrap = this.querySelector(`#${prefix}-72t-target-existing-wrap`);
                    const newWrap = this.querySelector(`#${prefix}-72t-target-new-wrap`);
                    if (existWrap) existWrap.style.display = e.target.value === 'existing' ? 'block' : 'none';
                    if (newWrap) newWrap.style.display = e.target.value === 'new' ? 'block' : 'none';
                } else if (path.endsWith('.rothConversion.enabled')) {
                    const c = this.querySelector(`#${prefix}-roth-static-inputs`);
                    if (c) c.style.display = e.target.checked ? 'block' : 'none';
                } else if (path === 'strategies.advancedRothStrategy.enabled') {
                    const rothBox = this.querySelector('#advanced-roth-inputs');
                    if (rothBox) {
                        rothBox.style.display = e.target.checked ? 'block' : 'none';
                    }
                    const isAdvanced = Boolean(e.target.checked);
                    ['primarySpouse', 'secondarySpouse'].forEach(p => {
                        const staticContainer = this.querySelector(`#${p}-roth-static-container`);
                        const staticWarn = this.querySelector(`#${p}-roth-static-warning`);
                        if (staticContainer) {
                            staticContainer.style.opacity = isAdvanced ? '0.5' : '1';
                            staticContainer.style.pointerEvents = isAdvanced ? 'none' : 'auto';
                        }
                        if (staticWarn) {
                            staticWarn.style.display = isAdvanced ? 'block' : 'none';
                        }
                    });
                }
            }

            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('strategy-events-panel')) {
    customElements.define('strategy-events-panel', StrategyEventsPanel);
}
