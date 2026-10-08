import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';
import './job-panel.js';
import './account-panel.js';

/**
 * Spouse Panel Component
 * Represents the configuration for a single spouse (jobs, accounts, social security, etc.)
 */
export class SpousePanel extends BaseComponent {
    constructor() {
        super();
    }

    onInit() {
        this.spousePrefix = this.getAttribute('prefix') || 'primarySpouse';
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        const spouseObj = this.state[this.spousePrefix];
        if (!spouseObj) return `<div>Error: Invalid prefix ${this.spousePrefix}</div>`;

        let out = this._startSection(`${escapeHtml(spouseObj.name || 'Spouse')} Personal Details`, true);
        out += `<div class="tab-stop-grid-2">`;
        out += `<div style="grid-column: span 2;">${this._input('Name', `${this.spousePrefix}.name`, 'text', spouseObj.name, { tooltip: 'Name of the spouse.' })}</div>`;
        out += `<div>${this._input('Birth Year', `${this.spousePrefix}.yearOfBirth`, 'number', spouseObj.yearOfBirth, { tooltip: 'Birth year used to calculate current age, retirement milestone years, RMD schedules (ages 73-75), and early withdrawal penalty thresholds (59.5).' })}</div>`;
        out += `<div>${this._input('Life Expectancy (Age)', `${this.spousePrefix}.estimatedLifeExpectancy`, 'number', spouseObj.estimatedLifeExpectancy, { tooltip: 'The age this spouse passes away. Halves ongoing household living expenses and transitions the surviving spouse to the higher Social Security benefit.', badge: 'years' })}</div>`;

        const birthYear = Number(spouseObj.yearOfBirth) || 1980;
        let retDate = spouseObj.targetRetirementDate;
        if (!retDate && spouseObj.targetRetirementAge) {
            retDate = `${birthYear + Number(spouseObj.targetRetirementAge)}-01`;
        } else if (!retDate) {
            retDate = `${birthYear + 65}-01`;
        }
        const retYear = parseInt(String(retDate).split('-')[0], 10) || (birthYear + 65);
        const retAge = retYear - birthYear;
        const retBadge = `<span id="${this.spousePrefix}-ret-age-badge" class="badge-subtle badge-subtle-blue">Age ${retAge}</span>`;

        out += `<div>${this._input('Target Retirement Date', `${this.spousePrefix}.targetRetirementDate`, 'date', retDate, { tooltip: 'The month and year this spouse plans to retire. Earned W2 salary terminates upon reaching this retirement month.', badge: retBadge })}</div>`;
        out += this._renderSocialSecurity(spouseObj);
        out += `</div>`;
        out += this._endSection();
        return out;
    }

    _calculateSsnBadge(dateVal, birthYear) {
        const ssnYear = parseInt(String(dateVal).split('-')[0], 10) || (birthYear + 67);
        const ssnAge = ssnYear - birthYear;
        const fra = 67;
        const ssnMonthsDiff = Math.round((ssnAge - fra) * 12);
        let ssnPct = 100;
        let colorClass = 'badge-subtle-emerald';

        if (ssnMonthsDiff < 0) {
            const m = Math.min(60, -ssnMonthsDiff);
            const red = m <= 36 ? (m * (5 / 900)) : (0.20 + (m - 36) * (5 / 1200));
            ssnPct = Math.round((1.0 - red) * 1000) / 10;
            colorClass = 'badge-subtle-amber';
        } else if (ssnMonthsDiff > 0) {
            const m = Math.min(36, ssnMonthsDiff);
            ssnPct = Math.round((1.0 + m * (8 / 1200)) * 1000) / 10;
            colorClass = 'badge-subtle-emerald';
        }
        return { ssnAge, ssnPct, colorClass };
    }

    _renderSocialSecurity(spouseObj) {
        const birthYear = Number(spouseObj.yearOfBirth) || 1980;
        const ssnStartAge = spouseObj.socialSecurityStartAge !== undefined && spouseObj.socialSecurityStartAge !== null ? Number(spouseObj.socialSecurityStartAge) : 67;
        const ssnMonth = String(spouseObj.socialSecurityStartMonth || 1).padStart(2, '0');
        const ssnDate = spouseObj.socialSecurityStartDate || `${birthYear + ssnStartAge}-${ssnMonth}`;
        const { ssnAge, ssnPct, colorClass } = this._calculateSsnBadge(ssnDate, birthYear);

        const ssnBadge = `<span id="${this.spousePrefix}-ssn-badge" data-ai-target="${this.spousePrefix}-ssn-badge" class="badge-subtle ${colorClass}">Age ${ssnAge}, ${ssnPct}% FRA</span>`;
        let out = `<div>` + this._input('SSN Claiming Date', `${this.spousePrefix}.socialSecurityStartDate`, 'date', ssnDate, { tooltip: 'The month and year to begin drawing Social Security (ages 62 to 70). Claiming at 62 permanently reduces benefit to 70% of FRA; delaying to 70 increases benefit by +8%/yr to 124% of FRA.', badge: ssnBadge }) + `</div>`;

        const monthlyBenefit = spouseObj.socialSecurityMonthlyBenefit !== undefined && spouseObj.socialSecurityMonthlyBenefit !== null
            ? Number(spouseObj.socialSecurityMonthlyBenefit)
            : (spouseObj.socialSecurityAnnualBenefit ? Math.round(Number(spouseObj.socialSecurityAnnualBenefit) / 12) : 0);
        const annualEquiv = Math.round(monthlyBenefit * 12);
        const annualBadge = `<span id="${this.spousePrefix}-ssn-annual-badge" class="badge-subtle badge-subtle-gray">$${annualEquiv.toLocaleString()}/yr</span>`;

        out += `<div>` + this._input('SSN Monthly Benefit (FRA 67)', `${this.spousePrefix}.socialSecurityMonthlyBenefit`, 'number', monthlyBenefit || 0, { tooltip: "Estimated monthly Social Security benefit in today's purchasing dollars assuming claiming at Full Retirement Age (67), as provided on your ssa.gov statement.", badge: '$ / mo' }) + `</div>`;
        out += `<div>
            <div class="form-group">
                <div class="form-label-row">
                    <label>Annual Equivalent</label>
                    ${annualBadge}
                </div>
                <div class="input-group input-currency-md">
                    <span class="input-prefix">$</span>
                    <input id="${this.spousePrefix}-annual-equiv" type="text" readonly value="${annualEquiv.toLocaleString()} / yr" class="input-readonly" style="background: rgba(255, 255, 255, 0.02); color: var(--text-muted); cursor: default;" />
                </div>
            </div>
        </div>`;
        return out;
    }

    _handleLiveInput(e) {
        const path = e.target.getAttribute('data-path');
        const birthYear = Number(this.state[this.spousePrefix]?.yearOfBirth) || 1980;

        if (path && path.endsWith('.socialSecurityStartDate')) {
            const { ssnAge, ssnPct, colorClass } = this._calculateSsnBadge(e.target.value, birthYear);
            const badge = this.querySelector(`#${this.spousePrefix}-ssn-badge`);
            if (badge) {
                badge.innerText = `Age ${ssnAge}, ${ssnPct}% FRA`;
                badge.className = `badge-subtle ${colorClass}`;
            }
        } else if (path && path.endsWith('.targetRetirementDate')) {
            const retBadge = this.querySelector(`#${this.spousePrefix}-ret-age-badge`);
            if (retBadge) {
                const retYear = parseInt(String(e.target.value).split('-')[0], 10) || (birthYear + 65);
                retBadge.innerText = `Age ${retYear - birthYear}`;
            }
        } else if (path && path.endsWith('.socialSecurityMonthlyBenefit')) {
            const monthly = Number(e.target.value) || 0;
            const annual = Math.round(monthly * 12);
            const badge = this.querySelector(`#${this.spousePrefix}-ssn-annual-badge`);
            if (badge) badge.innerText = `$${annual.toLocaleString()}/yr`;
            const equivInput = this.querySelector(`#${this.spousePrefix}-annual-equiv`);
            if (equivInput) equivInput.value = `${annual.toLocaleString()} / yr`;
        }
    }

    afterRender() {
        this.addEvent('input, select', 'input', (e) => this._handleLiveInput(e));
        this.addEvent('input, select', 'change', (e) => {
            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('spouse-panel')) {
    customElements.define('spouse-panel', SpousePanel);
}
