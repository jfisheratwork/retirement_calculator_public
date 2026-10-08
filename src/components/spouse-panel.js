import { BaseComponent } from './base-component.js';
import { getState } from '../services/state.js';
import { HeuristicValidator } from '../services/HeuristicValidator.js';
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
        
        // Row 1: Name, Birth Year, Life Expectancy (3 fields)
        out += `<div class="compact-form-row">`;
        out += `<div style="flex: 1.2; min-width: 140px;">${this._input('Name', `${this.spousePrefix}.name`, 'text', spouseObj.name, 'Name of the spouse.')}</div>`;
        out += `<div style="flex: 1; min-width: 100px;">${this._input('Birth Year', `${this.spousePrefix}.yearOfBirth`, 'number', spouseObj.yearOfBirth, 'Birth year used to calculate current age, retirement milestone years, RMD schedules (ages 73-75), and early withdrawal penalty thresholds (59.5).')}</div>`;
        out += `<div style="flex: 1; min-width: 120px;">${this._input('Life Expectancy (Age)', `${this.spousePrefix}.estimatedLifeExpectancy`, 'number', spouseObj.estimatedLifeExpectancy, 'The age this spouse passes away. Halves ongoing household living expenses and transitions the surviving spouse to the higher Social Security benefit.')}</div>`;
        out += `</div>`;
        
        const birthYear = Number(spouseObj.yearOfBirth) || 1980;
        let retDate = spouseObj.targetRetirementDate;
        if (!retDate && spouseObj.targetRetirementAge) {
            retDate = `${birthYear + Number(spouseObj.targetRetirementAge)}-01`;
        } else if (!retDate) {
            retDate = `${birthYear + 65}-01`;
        }
        const retYear = parseInt(String(retDate).split('-')[0], 10) || (birthYear + 65);
        const retAge = retYear - birthYear;
        const retBadge = `<span id="${this.spousePrefix}-ret-age-badge" style="font-size: 0.75rem; color: var(--accent); margin-left: 6px; font-weight: normal;">(Retirement Age: ${retAge})</span>`;
        
        // Row 2: Target Retirement Date, SSN Claiming Date, SSN Monthly Benefit (3 fields)
        out += `<div class="compact-form-row">`;
        out += `<div style="flex: 1; min-width: 150px;">${this._input(`Target Retirement Date ${retBadge}`, `${this.spousePrefix}.targetRetirementDate`, 'date', retDate, 'The month and year this spouse plans to retire. Earned W2 salary terminates upon reaching this retirement month.')}</div>`;
        out += this._renderSocialSecurity(spouseObj);
        out += `</div>`;

        out += this._endSection();
        return out;
    }

    _renderSocialSecurity(spouseObj) {
        const birthYear = Number(spouseObj.yearOfBirth) || 1980;
        const ssnStartAge = spouseObj.socialSecurityStartAge !== undefined && spouseObj.socialSecurityStartAge !== null ? Number(spouseObj.socialSecurityStartAge) : 67;
        const ssnMonth = String(spouseObj.socialSecurityStartMonth || 1).padStart(2, '0');
        const ssnDate = spouseObj.socialSecurityStartDate || `${birthYear + ssnStartAge}-${ssnMonth}`;
        
        const ssnYear = parseInt(ssnDate.split('-')[0], 10) || (birthYear + ssnStartAge);
        const ssnCalculatedAge = ssnYear - birthYear;
        const fra = 67;
        const ssnMonthsDiff = Math.round((ssnCalculatedAge - fra) * 12);
        let ssnPct = 100;
        
        if (ssnMonthsDiff < 0) {
            const m = Math.min(60, -ssnMonthsDiff);
            const red = m <= 36 ? (m * (5 / 900)) : (0.20 + (m - 36) * (5 / 1200));
            ssnPct = Math.round((1.0 - red) * 1000) / 10;
        } else if (ssnMonthsDiff > 0) {
            const m = Math.min(36, ssnMonthsDiff);
            ssnPct = Math.round((1.0 + m * (8 / 1200)) * 1000) / 10;
        }
        
        const ssnBadge = `<span id="${this.spousePrefix}-ssn-badge" data-ai-target="${this.spousePrefix}-ssn-badge" style="font-size: 0.75rem; color: ${ssnPct < 100 ? '#fdcb6e' : (ssnPct > 100 ? '#00b894' : 'var(--text-muted)')}; margin-left: 6px; font-weight: normal;">(Age: ${ssnCalculatedAge}, ${ssnPct}% of FRA 67)</span>`;

        let out = `<div style="flex: 1; min-width: 150px;">` + this._input(`SSN Claiming Date ${ssnBadge}`, `${this.spousePrefix}.socialSecurityStartDate`, 'date', ssnDate, 'The month and year to begin drawing Social Security (ages 62 to 70). Claiming at 62 permanently reduces benefit to 70% of FRA; delaying to 70 increases benefit by +8%/yr to 124% of FRA.') + `</div>`;
        
        const monthlyBenefit = spouseObj.socialSecurityMonthlyBenefit !== undefined && spouseObj.socialSecurityMonthlyBenefit !== null
            ? Number(spouseObj.socialSecurityMonthlyBenefit)
            : (spouseObj.socialSecurityAnnualBenefit ? Math.round(Number(spouseObj.socialSecurityAnnualBenefit) / 12) : 0);
        const annualEquiv = Math.round(monthlyBenefit * 12);
        const annualBadge = `<span id="${this.spousePrefix}-ssn-annual-badge" style="font-size: 0.75rem; color: var(--text-muted); margin-left: 6px; font-weight: normal;">(Annual: $${annualEquiv.toLocaleString()}/yr)</span>`;

        out += `<div style="flex: 1; min-width: 150px;">` + this._input(`SSN Monthly Benefit at FRA 67 ($/mo) ${annualBadge}`, `${this.spousePrefix}.socialSecurityMonthlyBenefit`, 'number', monthlyBenefit || 0, "Estimated monthly Social Security benefit in today's purchasing dollars assuming claiming at Full Retirement Age (67), as provided on your ssa.gov statement.") + `</div>`;
        return out;
    }

    afterRender() {
        this.addEvent('input, select', 'input', (e) => {
            const path = e.target.getAttribute('data-path');
            const birthYear = Number(this.state[this.spousePrefix]?.yearOfBirth) || 1980;

            if (path && path.endsWith('.socialSecurityStartDate')) {
                const dateVal = e.target.value;
                const ssnYear = parseInt(String(dateVal).split('-')[0], 10) || (birthYear + 67);
                const ssnAge = ssnYear - birthYear;
                const fra = 67;
                const ssnMonthsDiff = Math.round((ssnAge - fra) * 12);
                let ssnPct = 100;
                if (ssnMonthsDiff < 0) {
                    const m = Math.min(60, -ssnMonthsDiff);
                    const red = m <= 36 ? (m * (5 / 900)) : (0.20 + (m - 36) * (5 / 1200));
                    ssnPct = Math.round((1.0 - red) * 1000) / 10;
                } else if (ssnMonthsDiff > 0) {
                    const m = Math.min(36, ssnMonthsDiff);
                    ssnPct = Math.round((1.0 + m * (8 / 1200)) * 1000) / 10;
                }
                const badge = this.querySelector(`#${this.spousePrefix}-ssn-badge`);
                if (badge) {
                    badge.innerText = `(Age: ${ssnAge}, ${ssnPct}% of FRA 67)`;
                    badge.style.color = ssnPct < 100 ? '#fdcb6e' : (ssnPct > 100 ? '#00b894' : 'var(--text-muted)');
                }
            } else if (path && path.endsWith('.targetRetirementDate')) {
                const retBadge = this.querySelector(`#${this.spousePrefix}-ret-age-badge`);
                if (retBadge) {
                    const retYear = parseInt(String(e.target.value).split('-')[0], 10) || (birthYear + 65);
                    retBadge.innerText = `(Retirement Age: ${retYear - birthYear})`;
                }
            } else if (path && path.endsWith('.socialSecurityMonthlyBenefit')) {
                const badge = this.querySelector(`#${this.spousePrefix}-ssn-annual-badge`);
                if (badge) {
                    const monthly = Number(e.target.value) || 0;
                    const annual = Math.round(monthly * 12);
                    badge.innerText = `(Annual: $${annual.toLocaleString()}/yr)`;
                }
            }
        });

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
