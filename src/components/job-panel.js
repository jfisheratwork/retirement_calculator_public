import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';

export class JobPanel extends BaseComponent {
    constructor() {
        super();
    }

    onInit() {
        this.spousePrefix = this.getAttribute('prefix');
        this.itemIndex = this.getAttribute('index');
        this.state = this.getEffectiveState();
    }

    _getMonthOptions() {
        return [
            { value: '', label: '-- None / Annual --' },
            { value: '1', label: '01 - January' },
            { value: '2', label: '02 - February' },
            { value: '3', label: '03 - March' },
            { value: '4', label: '04 - April' },
            { value: '5', label: '05 - May' },
            { value: '6', label: '06 - June' },
            { value: '7', label: '07 - July' },
            { value: '8', label: '08 - August' },
            { value: '9', label: '09 - September' },
            { value: '10', label: '10 - October' },
            { value: '11', label: '11 - November' },
            { value: '12', label: '12 - December' }
        ];
    }

    _getLinkedAccountOptions(spouseObj, currentJobIndex) {
        const accounts = spouseObj.accounts || [];
        const jobs = spouseObj.jobs || [];
        const linkedOptions = [{ value: '', label: '-- None --', disabled: false }];
        const allowedTypes = ['traditional401k', 'trad403b'];
        accounts.forEach(acc => {
            if (allowedTypes.includes(acc.type)) {
                const accVal = acc.id || acc.name || acc.type;
                const otherJob = jobs.find((j, idx) => idx !== currentJobIndex && j.linked401kAccountId === accVal);
                if (otherJob) {
                    linkedOptions.push({
                        value: accVal,
                        label: `${acc.name || 'Unnamed Account'} (Linked to ${otherJob.title || 'Other Job'})`,
                        disabled: true
                    });
                } else {
                    linkedOptions.push({
                        value: accVal,
                        label: acc.name || 'Unnamed Account',
                        disabled: false
                    });
                }
            }
        });
        return linkedOptions;
    }

    _getLinkedHsaOptions(spouseObj) {
        const accounts = spouseObj.accounts || [];
        const options = [{ value: '', label: '-- None / Not Enrolled --', disabled: false }];
        accounts.forEach(acc => {
            if (acc.type === 'hsa') {
                const tier = acc.coverageTier === 'family' ? 'Family' : 'Single';
                options.push({
                    value: acc.id || acc.name || acc.type,
                    label: `${acc.name || 'HSA'} (${tier})`,
                    disabled: false
                });
            }
        });
        return options;
    }

    _renderJobInputs(jobPrefix, job, spouseObj) {
        const monthOptions = this._getMonthOptions();
        const bonusMonthVal = job.bonusMonth ? String(parseInt(job.bonusMonth, 10)) : '';
        const ltiMonthVal = job.ltiMonth ? String(parseInt(job.ltiMonth, 10)) : '';
        const currentJobIndex = parseInt(this.itemIndex, 10);
        const linkedOptions = this._getLinkedAccountOptions(spouseObj, currentJobIndex);

        const hasBonusData = Boolean(
            (job.bonusAmount && Number(job.bonusAmount) > 0) ||
            (job.ltiAmount && Number(job.ltiAmount) > 0) ||
            job.hasBonus === true
        );

        let out = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem;">`;
        out += this._input(`Base Salary ($)`, `${jobPrefix}.baseSalary`, 'number', job.baseSalary || 0);
        out += this._input(`Start Date`, `${jobPrefix}.startDate`, 'date', job.startDate || `${new Date().getFullYear()}-01`, 'The month and year this job position starts.');

        out += `<div style="grid-column: 1 / -1; margin-top: 0.25rem;">`;
        out += this._checkbox(`Include Annual Bonus & Equity / LTI`, `${jobPrefix}.hasBonus`, hasBonusData, 'Show inputs for annual performance bonus and long-term incentive (LTI) equity vesting.');
        out += `</div>`;

        out += `<div class="job-bonus-container" style="grid-column: 1 / -1; display: ${hasBonusData ? 'grid' : 'none'}; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 0.5rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 0.25rem;">`;
        out += this._input(`Bonus Amount ($)`, `${jobPrefix}.bonusAmount`, 'number', job.bonusAmount || 0, 'Annual cash performance bonus.');
        out += this._select(`Bonus Month`, `${jobPrefix}.bonusMonth`, monthOptions, bonusMonthVal, 'The calendar month when the annual bonus pays out.');
        out += this._input(`LTI Vest Amount ($)`, `${jobPrefix}.ltiAmount`, 'number', job.ltiAmount || 0, 'Annual equity or long-term incentive vesting amount.');
        out += this._select(`LTI Vest Month`, `${jobPrefix}.ltiMonth`, monthOptions, ltiMonthVal, 'The calendar month when equity shares or long-term incentives vest.');
        out += `</div>`;

        out += `<div style="grid-column: 1 / -1;">`;
        out += this._select(`Linked 401k/403b`, `${jobPrefix}.linked401kAccountId`, linkedOptions, job.linked401kAccountId || '', 'Select a 401k/403b account to receive this job\'s contributions.');
        out += `</div>`;

        const hasLinkedAcc = Boolean(job.linked401kAccountId);
        out += `<div class="linked-contributions-container" style="grid-column: 1 / -1; display: ${hasLinkedAcc ? 'block' : 'none'}; padding: 0.5rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 0.25rem;">`;
        out += `<div class="pane-section-header" style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">💼 Workplace 401(k) / 403(b) Contributions & Match</div>`;
        out += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">`;
        out += this._input(`Contribution (%)`, `${jobPrefix}.contributionPercentage`, 'number', job.contributionPercentage || 0, 'Percentage of annual gross salary deferred into this account (subject to IRS elective deferral limits).');
        out += this._input(`Employer 100% Match on First X%`, `${jobPrefix}.employer100PercentMatchOnTheFirstXPercent`, 'number', job.employer100PercentMatchOnTheFirstXPercent || 0, 'Employer matches 100% of employee salary deferrals up to this percentage of salary.');
        out += this._input(`Employer 50% Match on Next X%`, `${jobPrefix}.employer50PercentMatchOnTheNextXPercent`, 'number', job.employer50PercentMatchOnTheNextXPercent || 0, 'Employer matches 50% of employee salary deferrals for the subsequent percentage band of salary.');
        out += this._input(`Employer Bonus Match (%)`, `${jobPrefix}.employerMatchBonusPercentage`, 'number', job.employerMatchBonusPercentage || 0, 'Employer matching percentage applied directly to annual employee cash bonuses.');
        out += `</div>`;
        out += `</div>`;

        const hsaOptions = this._getLinkedHsaOptions(spouseObj);
        out += `<div style="grid-column: 1 / -1;">`;
        out += this._select(`Linked HSA`, `${jobPrefix}.linkedHsaAccountId`, hsaOptions, job.linkedHsaAccountId || '', 'Select a Health Savings Account (HSA) to receive workplace payroll contributions.');
        out += `</div>`;

        const hasLinkedHsa = Boolean(job.linkedHsaAccountId);
        out += `<div class="linked-hsa-container" style="grid-column: 1 / -1; display: ${hasLinkedHsa ? 'block' : 'none'}; padding: 0.5rem; background: rgba(0, 206, 201, 0.05); border: 1px solid rgba(0, 206, 201, 0.3); border-radius: 4px; margin-top: 0.25rem;">`;
        out += `<div class="pane-section-header" style="font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem; color: #00cec9;">🏥 Workplace HSA Payroll Deductions (Triple Tax-Free)</div>`;
        out += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">`;
        out += this._input(`Annual HSA Contribution ($)`, `${jobPrefix}.hsaAnnualContribution`, 'number', job.hsaAnnualContribution !== undefined ? job.hsaAnnualContribution : '', 'Annual payroll contribution (defaults to statutory cap $4,300 single / $8,550 family + $1,000 if 55+). Pre-tax deduction saves Federal, State, and FICA 7.65% taxes.');
        out += this._input(`HSA Start Year`, `${jobPrefix}.hsaStartYear`, 'number', job.hsaStartYear || '', 'Calendar year to begin HSA contributions at this job (e.g. start next year or 3 years from now). Leave blank to start immediately with job.');
        out += this._input(`HSA Stop Year`, `${jobPrefix}.hsaEndYear`, 'number', job.hsaEndYear || '', 'Optional final calendar year to contribute (e.g. contribute for 5 years). Contributions end when job ends or at Medicare Age 65.');
        out += `</div></div>`;

        out += `</div>`;
        return out;
    }

    getTemplate() {
        if (!this.spousePrefix || this.itemIndex === null) return '';
        if (!this.state || Object.keys(this.state).length === 0) {
            this.state = this.getEffectiveState();
        }
        const keys = this.spousePrefix.split('.');
        let spouseObj = this.state;
        for (const k of keys) { spouseObj = spouseObj[k]; }
        
        const job = spouseObj.jobs[this.itemIndex];
        if (!job) return '';

        const jobPrefix = `${this.spousePrefix}.jobs.${this.itemIndex}`;
        const startBadge = job.startDate ? `<span style="font-weight: normal; color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">(Starts: ${escapeHtml(job.startDate)})</span>` : '';
        const isOpenByDefault = job.isOpen !== false && (job.isOpen || !job.baseSalary || Number(job.baseSalary) === 0 || job.title === 'New Job');
        
        let out = `<details class="job-card" ${isOpenByDefault ? 'open' : ''} style="padding: 0.5rem; background: var(--bg-darker); margin-bottom: 0.5rem; border-left: 3px solid var(--accent); border-radius: 4px; cursor: pointer;">`;
        out += `<summary style="font-weight: bold; outline: none; display: flex; justify-content: space-between; align-items: center;">
                    <span id="${jobPrefix}-summary-text">${escapeHtml(job.title || 'Job')} - $${Number(job.baseSalary || 0).toLocaleString()} ${startBadge}</span>
                    <button type="button" class="btn btn-secondary remove-job-btn" data-prefix="${this.spousePrefix}" data-index="${this.itemIndex}" style="padding: 0.1rem 0.4rem; font-size: 0.7rem; background: #e74c3c; color: white; border: none; margin-left: 10px;">Remove</button>
                </summary>`;
        out += `<div style="margin-top: 1rem;">`;
        out += this._input(`Job Title`, `${jobPrefix}.title`, 'text', job.title || '');
        out += this._renderJobInputs(jobPrefix, job, spouseObj);
        out += `</div></details>`;
        return out;
    }

    afterRender() {
        const details = this.querySelector('details.job-card');
        if (details) {
            details.addEventListener('toggle', () => {
                const keys = this.spousePrefix.split('.');
                let spouseObj = this.state;
                for (const k of keys) { spouseObj = spouseObj[k]; }
                if (spouseObj?.jobs && spouseObj.jobs[this.itemIndex]) {
                    spouseObj.jobs[this.itemIndex].isOpen = details.open;
                }
            });
        }

        this.addEvent('input', 'input', (e) => {
            const path = e.target.getAttribute('data-path');
            if (!path) return;
            if (path.endsWith('.title') || path.endsWith('.baseSalary') || path.endsWith('.startDate')) {
                const jobPrefix = `${this.spousePrefix}.jobs.${this.itemIndex}`;
                const titleInput = this.querySelector(`input[data-path="${jobPrefix}.title"]`);
                const salaryInput = this.querySelector(`input[data-path="${jobPrefix}.baseSalary"]`);
                const dateInput = this.querySelector(`input[data-path="${jobPrefix}.startDate"]`);
                const summarySpan = document.getElementById(`${jobPrefix}-summary-text`);
                if (summarySpan) {
                    const title = titleInput?.value || 'Job';
                    const salary = Number(salaryInput?.value || 0).toLocaleString();
                    const startBadge = dateInput?.value ? `<span style="font-weight: normal; color: var(--text-muted); font-size: 0.8rem; margin-left: 6px;">(Starts: ${escapeHtml(dateInput.value)})</span>` : '';
                    summarySpan.innerHTML = `${escapeHtml(title)} - $${salary} ${startBadge}`;
                }
            }
            const isBonusOrLti = path && (path.endsWith('.bonusAmount') || path.endsWith('.ltiAmount'));
            if (isBonusOrLti && Number(e.target.value) > 0) {
                const chk = this.querySelector(`input[data-path="${this.spousePrefix}.jobs.${this.itemIndex}.hasBonus"]`);
                const container = this.querySelector('.job-bonus-container');
                if (chk) chk.checked = true;
                if (container) container.style.display = 'grid';
            }
        });

        this.addEvent('input, select', 'change', (e) => {
            const path = e.target.getAttribute('data-path');
            if (path && path.endsWith('.hasBonus')) {
                const bonusContainer = this.querySelector('.job-bonus-container');
                if (bonusContainer) {
                    bonusContainer.style.display = e.target.checked ? 'grid' : 'none';
                }
            }
            if (path && path.endsWith('.linked401kAccountId')) {
                const contContainer = this.querySelector('.linked-contributions-container');
                if (contContainer) {
                    contContainer.style.display = e.target.value ? 'block' : 'none';
                }
            }
            if (path && path.endsWith('.linkedHsaAccountId')) {
                const hsaContainer = this.querySelector('.linked-hsa-container');
                if (hsaContainer) {
                    hsaContainer.style.display = e.target.value ? 'block' : 'none';
                }
            }
            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('job-panel')) {
    customElements.define('job-panel', JobPanel);
}
