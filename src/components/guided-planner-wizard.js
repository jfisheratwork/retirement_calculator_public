/**
 * GuidedPlannerWizard Component
 *
 * 4-step progressive onboarding and planning wizard (Mockups 5, 6, 7, 8).
 * Pure presentation, modern card-based dark mode layout (slate-900 / slate-800, purple/blue accents).
 *
 * Steps:
 * 1. People & Timeline (Mockup 5)
 * 2. Income & Lifestyle Expenses (Mockup 6)
 * 3. Asset Buckets & Balance Sheet (Mockup 7)
 * 4. Growth Knobs & Strategy (Mockup 8)
 *
 * Written with the assistance of Google Gemini
 */

// MDN Documentation for HTMLElement: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement
// MDN Documentation for CustomEvent: https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
// MDN Documentation for Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
// MDN Documentation for <details>: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details
// MDN Documentation for <input type="range">: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/range

import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';

// --- Constants & Defaults (No Magic Numbers) ---
const STEP_1 = 1;
const STEP_2 = 2;
const STEP_3 = 3;
const STEP_4 = 4;
const TOTAL_STEPS = 4;

const PROGRESS_PERCENT_STEP_1 = 25;
const PROGRESS_PERCENT_STEP_2 = 50;
const PROGRESS_PERCENT_STEP_3 = 75;
const PROGRESS_PERCENT_STEP_4 = 100;

const PROGRESS_MAP = {
    [STEP_1]: PROGRESS_PERCENT_STEP_1,
    [STEP_2]: PROGRESS_PERCENT_STEP_2,
    [STEP_3]: PROGRESS_PERCENT_STEP_3,
    [STEP_4]: PROGRESS_PERCENT_STEP_4
};

const DEFAULT_CURRENT_YEAR = 2026;
const DEFAULT_PRIMARY_BIRTH_YEAR = 1985;
const DEFAULT_PRIMARY_RETIREMENT_AGE = 65;
const DEFAULT_SPOUSE_BIRTH_YEAR = 1987;
const DEFAULT_SPOUSE_RETIREMENT_AGE = 65;
const DEFAULT_LONGEVITY_AGE = 95;
const MIN_LONGEVITY_AGE = 75;
const MAX_LONGEVITY_AGE = 105;

const DEFAULT_PRIMARY_SALARY = 120000;
const DEFAULT_SPOUSE_SALARY = 80000;
const DEFAULT_MONTHLY_BUDGET = 5000;
const DEFAULT_MONTHLY_RENT = 2200;
const DEFAULT_HOME_VALUE = 650000;
const DEFAULT_ORIGINATION_AMOUNT = 520000;
const DEFAULT_MORTGAGE_RATE = 6.5;
const DEFAULT_MORTGAGE_TERM_YEARS = 30;

const DEFAULT_PRETAX_ASSETS = 250000;
const DEFAULT_ROTH_ASSETS = 75000;
const DEFAULT_TAXABLE_ASSETS = 100000;
const DEFAULT_CASH_ASSETS = 35000;

const DEFAULT_RETURN_RATE = 7.0;
const MIN_RETURN_RATE = 4.0;
const MAX_RETURN_RATE = 10.0;
const RETURN_STEP = 0.5;

const SS_CLAIM_AGE_EARLY = 62;
const SS_CLAIM_AGE_FULL = 67;
const SS_CLAIM_AGE_DELAYED = 70;

const GOAL_DIE_WITH_ZERO = 'zero';
const GOAL_LEGACY = 'legacy';
const GOAL_PRESERVATION = 'preservation';

const HOUSING_RENT = 'rent';
const HOUSING_OWN = 'own';

const MONTHS_IN_YEAR = 12;
const PERCENT_SCALE = 100;
const ZERO = 0;
const DEFAULT_YEARS_ELAPSED = 3;

/**
 * Format currency with no decimal places.
 * MDN Documentation for Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 */
const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: ZERO
});

function formatUsd(amount) {
    return currencyFormatter.format(Number(amount) || ZERO);
}

/**
 * Calculates current mortgage balance, monthly P&I, and payoff year.
 */
function calculateAmortization(originationAmount, interestRate, termYears, originationDateStr) {
    const origAmt = Math.max(ZERO, Number(originationAmount) || ZERO);
    const annualRate = Math.max(ZERO, Number(interestRate) || ZERO);
    const monthlyRate = annualRate / PERCENT_SCALE / MONTHS_IN_YEAR;
    const term = Number(termYears) || DEFAULT_MORTGAGE_TERM_YEARS;
    const totalMonths = term * MONTHS_IN_YEAR;

    let monthlyPI = ZERO;
    if (origAmt > ZERO && monthlyRate > ZERO && totalMonths > ZERO) {
        const factor = Math.pow(1 + monthlyRate, totalMonths);
        monthlyPI = Math.round((origAmt * (monthlyRate * factor)) / (factor - 1));
    } else if (origAmt > ZERO && totalMonths > ZERO) {
        monthlyPI = Math.round(origAmt / totalMonths);
    }

    const dateParts = String(originationDateStr || '').split('-');
    const origYear = parseInt(dateParts[0], 10) || DEFAULT_CURRENT_YEAR - DEFAULT_YEARS_ELAPSED;
    const origMonth = (parseInt(dateParts[1], 10) || 1) - 1;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const elapsedMonths = Math.max(ZERO, (curYear - origYear) * MONTHS_IN_YEAR + (curMonth - origMonth));

    let balance = origAmt;
    for (let m = ZERO; m < elapsedMonths && balance > ZERO; m++) {
        const interest = balance * monthlyRate;
        const principal = monthlyPI - interest;
        balance = Math.max(ZERO, balance - principal);
    }

    const payoffYear = origYear + Math.ceil(totalMonths / MONTHS_IN_YEAR);
    return {
        currentBalance: Math.round(balance),
        monthlyPI,
        payoffYear
    };
}

export class GuidedPlannerWizard extends BaseComponent {
    constructor() {
        super();
        this._currentStep = STEP_1;
        this._errorMessage = '';
        this._data = {
            primaryName: 'Primary Planner',
            primaryBirthYear: DEFAULT_PRIMARY_BIRTH_YEAR,
            primaryRetirementAge: DEFAULT_PRIMARY_RETIREMENT_AGE,
            hasSpouse: false,
            spouseName: 'Partner',
            spouseBirthYear: DEFAULT_SPOUSE_BIRTH_YEAR,
            spouseRetirementAge: DEFAULT_SPOUSE_RETIREMENT_AGE,
            spouseSocialSecurityAge: SS_CLAIM_AGE_FULL,
            longevityAge: DEFAULT_LONGEVITY_AGE,
            dependentsCount: ZERO,

            primarySalary: DEFAULT_PRIMARY_SALARY,
            spouseSalary: DEFAULT_SPOUSE_SALARY,
            monthlyBudget: DEFAULT_MONTHLY_BUDGET,
            housingStatus: HOUSING_OWN,
            monthlyRent: DEFAULT_MONTHLY_RENT,
            homeValue: DEFAULT_HOME_VALUE,
            mortgageOriginationDate: `${DEFAULT_CURRENT_YEAR - DEFAULT_YEARS_ELAPSED}-01`,
            mortgageOriginationAmount: DEFAULT_ORIGINATION_AMOUNT,
            mortgageInterestRate: DEFAULT_MORTGAGE_RATE,
            mortgageTermYears: DEFAULT_MORTGAGE_TERM_YEARS,

            preTax: DEFAULT_PRETAX_ASSETS,
            roth: DEFAULT_ROTH_ASSETS,
            taxable: DEFAULT_TAXABLE_ASSETS,
            cash: DEFAULT_CASH_ASSETS,

            returnRate: DEFAULT_RETURN_RATE,
            socialSecurityClaimAge: SS_CLAIM_AGE_FULL,
            endOfLifeGoal: GOAL_DIE_WITH_ZERO
        };
    }

    getData() {
        const amort = calculateAmortization(
            this._data.mortgageOriginationAmount,
            this._data.mortgageInterestRate,
            this._data.mortgageTermYears,
            this._data.mortgageOriginationDate
        );
        return {
            ...this._data,
            amortization: amort,
            totalLiquid: this._calculateTotalLiquid()
        };
    }

    setData(partialData) {
        if (!partialData || typeof partialData !== 'object') return;
        this._data = { ...this._data, ...partialData };
        this.render();
        this.afterRender();
    }

    _calculateTotalLiquid() {
        const p = Number(this._data.preTax) || ZERO;
        const r = Number(this._data.roth) || ZERO;
        const t = Number(this._data.taxable) || ZERO;
        const c = Number(this._data.cash) || ZERO;
        return p + r + t + c;
    }

    open(initialData = null) {
        if (initialData) {
            this.setViewModel(initialData);
        }
        this._errorMessage = '';
        this._currentStep = STEP_1;
        this.style.display = 'block';
        this.render();
        this.afterRender();
    }

    close() {
        this.style.display = 'none';
    }

    _extractStep1Updates(step1) {
        if (!step1) return {};
        const res = {};
        const p = step1.primary;
        if (p) {
            if (p.name) res.primaryName = p.name;
            if (p.birthYear) res.primaryBirthYear = p.birthYear;
            if (p.targetRetirementAge) res.primaryRetirementAge = p.targetRetirementAge;
            if (p.lifeExpectancy) res.longevityAge = p.lifeExpectancy;
        }
        const s = step1.spouse;
        if (s) {
            res.hasSpouse = Boolean(s.hasSpouse);
            if (s.name) res.spouseName = s.name;
            if (s.birthYear) res.spouseBirthYear = s.birthYear;
            if (s.targetRetirementAge) res.spouseRetirementAge = s.targetRetirementAge;
        }
        return res;
    }

    _extractStep2Updates(step2) {
        if (!step2) return {};
        const res = {};
        if (step2.incomes) {
            if (step2.incomes.primaryIncome !== undefined) res.primarySalary = step2.incomes.primaryIncome;
            if (step2.incomes.spouseIncome !== undefined) res.spouseSalary = step2.incomes.spouseIncome;
        }
        if (step2.livingExpenses?.monthlySpend !== undefined) {
            res.monthlyBudget = step2.livingExpenses.monthlySpend;
        }
        const h = step2.housing;
        if (h) {
            if (h.status) res.housingStatus = h.status;
            if (h.homeValue !== undefined) res.homeValue = h.homeValue;
            if (h.mortgage) {
                const m = h.mortgage;
                if (m.originationDate) res.mortgageOriginationDate = m.originationDate;
                if (m.originationAmount !== undefined) res.mortgageOriginationAmount = m.originationAmount;
                if (m.interestRate !== undefined) res.mortgageInterestRate = m.interestRate;
                if (m.termYears !== undefined) res.mortgageTermYears = m.termYears;
            }
        }
        return res;
    }

    _extractStep3Updates(step3) {
        if (!step3?.buckets) return {};
        const b = step3.buckets;
        const res = {};
        if (b.preTax?.balance !== undefined) res.preTax = b.preTax.balance;
        if (b.roth?.balance !== undefined) res.roth = b.roth.balance;
        if (b.taxable?.balance !== undefined) res.taxable = b.taxable.balance;
        if (b.cash?.balance !== undefined) res.cash = b.cash.balance;
        return res;
    }

    _extractStep4Updates(step4) {
        if (!step4) return {};
        const res = {};
        if (step4.macro?.nominalReturn !== undefined) res.returnRate = step4.macro.nominalReturn;
        if (step4.socialSecurity?.primaryClaimAge !== undefined)
            res.socialSecurityClaimAge = step4.socialSecurity.primaryClaimAge;
        if (step4.milestoneGoals?.goalType) res.endOfLifeGoal = step4.milestoneGoals.goalType;
        return res;
    }

    setViewModel(vm) {
        if (!vm) return;
        const updates = {
            ...this._extractStep1Updates(vm.step1),
            ...this._extractStep2Updates(vm.step2),
            ...this._extractStep3Updates(vm.step3),
            ...this._extractStep4Updates(vm.step4)
        };
        this.setData(updates);
    }

    getTemplate() {
        return `
            <div class="guided-wizard-overlay" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 1.5rem; overflow-y: auto;">
                <div class="guided-wizard-container glass-panel" style="max-width: 860px; width: 100%; max-height: 90vh; overflow-y: auto; margin: auto; padding: 2rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 1rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
                    ${this._renderHeader()}
                    ${this._renderProgressBar()}
                    ${this._renderErrorMessage()}
                    <div class="wizard-step-content" style="margin-top: 1.75rem; min-height: 420px;">
                        ${this._renderCurrentStepBody()}
                    </div>
                    ${this._renderFooterNav()}
                </div>
            </div>
        `;
    }

    _renderHeader() {
        return `
            <div class="wizard-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem;">
                <div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                        <span class="badge-subtle badge-subtle-blue">Guided Mode</span>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Step ${this._currentStep} of ${TOTAL_STEPS}</span>
                    </div>
                    <h2 style="margin: 0; font-size: 1.6rem; color: var(--text-main); font-weight: 700;">
                        ${this._getStepTitle()}
                    </h2>
                    <p style="margin: 0.25rem 0 0 0; color: var(--text-muted); font-size: 0.9rem;">
                        ${this._getStepSubtitle()}
                    </p>
                </div>
                <button type="button" class="btn-wizard-close btn-close" title="Exit Wizard" style="background: transparent; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer;">&times;</button>
            </div>
        `;
    }

    _getStepTitle() {
        switch (this._currentStep) {
            case STEP_1:
                return 'People & Timeline';
            case STEP_2:
                return 'Income & Lifestyle Expenses';
            case STEP_3:
                return 'Asset Buckets & Balance Sheet';
            case STEP_4:
                return 'Growth Knobs & Strategy';
            default:
                return 'Guided Planner';
        }
    }

    _getStepSubtitle() {
        switch (this._currentStep) {
            case STEP_1:
                return 'Set demographic anchors and longevity runway.';
            case STEP_2:
                return 'Establish core earnings, baseline spending, and housing costs.';
            case STEP_3:
                return 'Distribute current net worth across the 4 primary tax buckets.';
            case STEP_4:
                return 'Fine-tune portfolio return assumptions, Social Security, and legacy goals.';
            default:
                return '';
        }
    }

    _renderProgressBar() {
        const pct = PROGRESS_MAP[this._currentStep] || PROGRESS_PERCENT_STEP_1;
        const steps = [
            { num: STEP_1, label: 'People' },
            { num: STEP_2, label: 'Income & Spend' },
            { num: STEP_3, label: 'Asset Buckets' },
            { num: STEP_4, label: 'Strategy' }
        ];

        const stepPills = steps
            .map((s) => {
                const isActive = s.num === this._currentStep;
                const isCompleted = s.num < this._currentStep;
                const pillClass = isActive
                    ? 'badge-subtle badge-subtle-blue'
                    : isCompleted
                      ? 'badge-subtle badge-subtle-emerald'
                      : 'badge-subtle badge-subtle-gray';
                const check = isCompleted ? '✓ ' : '';
                return `<span class="${pillClass}" style="cursor: pointer;" data-nav-step="${s.num}">${check}${s.num}. ${s.label}</span>`;
            })
            .join('');

        return `
            <div class="wizard-progress-section" style="margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
                    ${stepPills}
                </div>
                <div class="progress-track" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 999px; overflow: hidden;">
                    <div class="progress-bar" style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }

    _renderErrorMessage() {
        if (!this._errorMessage) return '';
        return `
            <div class="wizard-alert-error" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.88rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between;">
                <span>⚠️ ${escapeHtml(this._errorMessage)}</span>
                <button type="button" class="btn-clear-error" style="background: none; border: none; color: #fca5a5; cursor: pointer; font-size: 1rem;">&times;</button>
            </div>
        `;
    }

    _renderCurrentStepBody() {
        switch (this._currentStep) {
            case STEP_1:
                return this._renderStep1();
            case STEP_2:
                return this._renderStep2();
            case STEP_3:
                return this._renderStep3();
            case STEP_4:
                return this._renderStep4();
            default:
                return '';
        }
    }

    _renderStep1() {
        return `
            <div class="step-pane step-pane-1" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div class="card-primary-earner surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="margin: 0; font-size: 1.05rem; color: #60a5fa; font-weight: 600;">👤 Primary Planner</h4>
                        <span class="badge-subtle badge-subtle-blue">Required</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div>
                            <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Name or Label</label>
                            <input type="text" id="input-primary-name" class="input-text" value="${escapeHtml(this._data.primaryName)}" style="width: 100%;" />
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Birth Year</label>
                            <input type="number" id="input-primary-birth-year" class="input-number" min="1940" max="2015" value="${this._data.primaryBirthYear}" style="width: 100%;" />
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Target Retirement Age</label>
                            <input type="number" id="input-primary-retirement-age" class="input-number" min="30" max="80" value="${this._data.primaryRetirementAge}" style="width: 100%;" />
                        </div>
                    </div>
                </div>

                <div id="spouse-container">
                    ${this._data.hasSpouse ? this._renderSpouseCard() : this._renderSpouseEmptyBox()}
                </div>

                <div class="card-longevity surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                        <div>
                            <label style="font-size: 1rem; font-weight: 600; color: var(--text-main);">Longevity Planning Horizon</label>
                            <p style="margin: 0; font-size: 0.82rem; color: var(--text-muted);">Defines simulation end-year. Covers 90th percentile actuarial longevity benchmark.</p>
                        </div>
                        <span class="badge-subtle badge-subtle-purple" id="longevity-badge" style="font-size: 0.9rem; padding: 0.25rem 0.75rem;">
                            Age ${this._data.longevityAge}
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${MIN_LONGEVITY_AGE}</span>
                        <input type="range" id="slider-longevity" min="${MIN_LONGEVITY_AGE}" max="${MAX_LONGEVITY_AGE}" step="1" value="${this._data.longevityAge}" style="flex: 1; cursor: pointer;" />
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${MAX_LONGEVITY_AGE}</span>
                    </div>
                </div>

                <div class="card-dependents" style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border); border-radius: 0.75rem;">
                    <div>
                        <span style="font-size: 0.95rem; font-weight: 500; color: var(--text-main);">Dependents / Children</span>
                        <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">Number of children in household.</p>
                    </div>
                    <div style="width: 100px;">
                        <input type="number" id="input-dependents-count" min="0" max="10" value="${this._data.dependentsCount}" style="width: 100%; text-align: center;" />
                    </div>
                </div>
            </div>
        `;
    }

    _renderSpouseEmptyBox() {
        return `
            <div id="spouse-empty-box" style="border: 2px dashed rgba(255, 255, 255, 0.18); border-radius: 0.75rem; padding: 1.75rem; text-align: center; background: rgba(255, 255, 255, 0.02); transition: all 0.2s ease;">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">👥</div>
                <h4 style="margin: 0 0 0.25rem 0; font-size: 1rem; color: var(--text-main);">Planning as a Couple or with a Partner?</h4>
                <p style="margin: 0 0 1rem 0; font-size: 0.85rem; color: var(--text-muted);">Single-first by default. Add partner demographics for joint tax brackets and Social Security.</p>
                <button type="button" id="btn-add-spouse" class="btn btn-secondary" style="border-radius: 999px; padding: 0.4rem 1.25rem; font-size: 0.88rem;">
                    + Add Spouse / Partner
                </button>
            </div>
        `;
    }

    _renderSpouseCard() {
        return `
            <div id="spouse-card" class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid rgba(139, 92, 246, 0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 1.05rem; color: #c084fc; font-weight: 600;">💍 Spouse / Partner</h4>
                    <button type="button" id="btn-remove-spouse" class="btn btn-secondary" style="font-size: 0.78rem; padding: 0.2rem 0.6rem; color: #fca5a5; border-color: rgba(239, 68, 68, 0.3);">
                        ✕ Remove
                    </button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Partner Name</label>
                        <input type="text" id="input-spouse-name" class="input-text" value="${escapeHtml(this._data.spouseName)}" style="width: 100%;" />
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Partner Birth Year</label>
                        <input type="number" id="input-spouse-birth-year" class="input-number" min="1940" max="2015" value="${this._data.spouseBirthYear}" style="width: 100%;" />
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Partner Retirement Age</label>
                        <input type="number" id="input-spouse-retirement-age" class="input-number" min="30" max="80" value="${this._data.spouseRetirementAge}" style="width: 100%;" />
                    </div>
                </div>
            </div>
        `;
    }

    _renderStep2() {
        const isRent = this._data.housingStatus === HOUSING_RENT;
        const amort = calculateAmortization(
            this._data.mortgageOriginationAmount,
            this._data.mortgageInterestRate,
            this._data.mortgageTermYears,
            this._data.mortgageOriginationDate
        );

        return `
            <div class="step-pane step-pane-2" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <h4 style="margin: 0 0 1rem 0; font-size: 1.05rem; color: #60a5fa; font-weight: 600;">💼 Annual Earned Income</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
                        <div>
                            <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">
                                ${escapeHtml(this._data.primaryName)} Gross Salary ($/yr)
                            </label>
                            <input type="number" id="input-primary-salary" class="input-number" step="1000" min="0" value="${this._data.primarySalary}" style="width: 100%;" />
                        </div>
                        ${
                            this._data.hasSpouse
                                ? `
                        <div>
                            <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">
                                ${escapeHtml(this._data.spouseName)} Gross Salary ($/yr)
                            </label>
                            <input type="number" id="input-spouse-salary" class="input-number" step="1000" min="0" value="${this._data.spouseSalary}" style="width: 100%;" />
                        </div>
                        `
                                : ''
                        }
                    </div>
                </div>

                <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                        <h4 style="margin: 0; font-size: 1.05rem; color: #34d399; font-weight: 600;">🛒 Monthly Living Budget</h4>
                        <span class="badge-subtle badge-subtle-emerald">${formatUsd(this._data.monthlyBudget * MONTHS_IN_YEAR)}/yr</span>
                    </div>
                    <p style="margin: 0 0 0.75rem 0; font-size: 0.82rem; color: var(--text-muted);">
                        Excludes mortgage/rent. Covers groceries, utilities, dining, healthcare, vehicles, and discretionary spend.
                    </p>
                    <div style="max-width: 320px;">
                        <div class="input-group" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0 0.75rem;">
                            <span style="color: var(--text-muted);">$</span>
                            <input type="number" id="input-monthly-budget" step="100" min="500" value="${this._data.monthlyBudget}" style="width: 100%; border: none; background: transparent; padding: 0.5rem; color: var(--text-main);" />
                            <span style="color: var(--text-muted); font-size: 0.8rem;">/mo</span>
                        </div>
                    </div>
                </div>

                <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <h4 style="margin: 0; font-size: 1.05rem; color: var(--text-main); font-weight: 600;">🏠 Housing Situation</h4>
                        <div class="housing-toggle-group" style="display: inline-flex; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 999px; padding: 2px;">
                            <button type="button" class="btn-housing-toggle ${isRent ? 'active' : ''}" data-housing="${HOUSING_RENT}" style="padding: 0.25rem 0.85rem; border-radius: 999px; border: none; font-size: 0.8rem; cursor: pointer; background: ${isRent ? '#3b82f6' : 'transparent'}; color: #fff;">
                                Renting
                            </button>
                            <button type="button" class="btn-housing-toggle ${!isRent ? 'active' : ''}" data-housing="${HOUSING_OWN}" style="padding: 0.25rem 0.85rem; border-radius: 999px; border: none; font-size: 0.8rem; cursor: pointer; background: ${!isRent ? '#3b82f6' : 'transparent'}; color: #fff;">
                                Own Home (Mortgage)
                            </button>
                        </div>
                    </div>

                    ${isRent ? this._renderRentingInputs() : this._renderHomeownerInputs(amort)}
                </div>
            </div>
        `;
    }

    _renderRentingInputs() {
        return `
            <div id="housing-rent-section" style="max-width: 320px;">
                <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Monthly Rent ($/mo)</label>
                <div class="input-group" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0 0.75rem;">
                    <span style="color: var(--text-muted);">$</span>
                    <input type="number" id="input-monthly-rent" step="50" min="0" value="${this._data.monthlyRent}" style="width: 100%; border: none; background: transparent; padding: 0.5rem; color: var(--text-main);" />
                    <span style="color: var(--text-muted); font-size: 0.8rem;">/mo</span>
                </div>
            </div>
        `;
    }

    _renderHomeownerInputs(amort) {
        return `
            <div id="housing-homeowner-section">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Home Market Value ($)</label>
                        <input type="number" id="input-home-value" class="input-number" step="5000" min="0" value="${this._data.homeValue}" style="width: 100%;" />
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Origination Date (YYYY-MM)</label>
                        <input type="text" id="input-mortgage-orig-date" class="input-text" placeholder="2021-06" value="${escapeHtml(this._data.mortgageOriginationDate)}" style="width: 100%;" />
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Original Loan Amount ($)</label>
                        <input type="number" id="input-mortgage-orig-amt" class="input-number" step="5000" min="0" value="${this._data.mortgageOriginationAmount}" style="width: 100%;" />
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Interest Rate (%)</label>
                        <input type="number" id="input-mortgage-rate" class="input-number" step="0.125" min="0" max="20" value="${this._data.mortgageInterestRate}" style="width: 100%;" />
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.35rem;">Loan Term (Years)</label>
                        <select id="select-mortgage-term" class="input-select" style="width: 100%;">
                            <option value="15" ${Number(this._data.mortgageTermYears) === 15 ? 'selected' : ''}>15 Years</option>
                            <option value="30" ${Number(this._data.mortgageTermYears) === 30 ? 'selected' : ''}>30 Years</option>
                        </select>
                    </div>
                </div>

                <div id="mortgage-amortization-pill" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; padding: 0.85rem 1.25rem; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.1rem;">📊</span>
                        <div>
                            <div style="font-size: 0.85rem; font-weight: 600; color: #93c5fd;">Live Amortization Preview</div>
                            <div style="font-size: 0.78rem; color: var(--text-muted);">Current Principal Balance: <strong style="color: #fff;">${formatUsd(amort.currentBalance)}</strong></div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div style="text-align: right;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Monthly P&amp;I</div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: #34d399;">${formatUsd(amort.monthlyPI)}/mo</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.75rem; color: var(--text-muted);">Payoff Target</div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: #fbbf24;">Year ${amort.payoffYear}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _renderStep3() {
        const totalLiquid = this._calculateTotalLiquid();
        const isHomeowner = this._data.housingStatus === HOUSING_OWN;
        const amort = calculateAmortization(
            this._data.mortgageOriginationAmount,
            this._data.mortgageInterestRate,
            this._data.mortgageTermYears,
            this._data.mortgageOriginationDate
        );
        const homeEquity = Math.max(ZERO, (Number(this._data.homeValue) || ZERO) - amort.currentBalance);

        return `
            <div class="step-pane step-pane-3" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 0.75rem;">
                    <div>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Total Liquid Balance Sheet</span>
                        <div id="liquid-total-pill" style="font-size: 1.5rem; font-weight: 700; color: #34d399;">
                            ${formatUsd(totalLiquid)}
                        </div>
                    </div>
                    ${
                        isHomeowner
                            ? `
                    <div style="text-align: right;">
                        <span style="font-size: 0.85rem; color: var(--text-muted);">Estimated Home Equity</span>
                        <div style="font-size: 1.2rem; font-weight: 600; color: #60a5fa;">
                            + ${formatUsd(homeEquity)}
                        </div>
                    </div>
                    `
                            : ''
                    }
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem;">
                    <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <h4 style="margin: 0; font-size: 0.95rem; color: #60a5fa; font-weight: 600;">📈 Pre-Tax Retirement</h4>
                            <span class="badge-subtle badge-subtle-blue">401(k) / IRA</span>
                        </div>
                        <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: var(--text-muted);">Traditional 401(k), 403(b), Traditional IRA. Taxed upon withdrawal.</p>
                        <div class="input-group" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0 0.75rem;">
                            <span style="color: var(--text-muted);">$</span>
                            <input type="number" id="input-pretax-assets" step="5000" min="0" value="${this._data.preTax}" style="width: 100%; border: none; background: transparent; padding: 0.5rem; color: var(--text-main);" />
                        </div>
                    </div>

                    <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <h4 style="margin: 0; font-size: 0.95rem; color: #c084fc; font-weight: 600;">💎 Tax-Free Growth (Roth)</h4>
                            <span class="badge-subtle badge-subtle-purple">Roth IRA / 401(k)</span>
                        </div>
                        <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: var(--text-muted);">Roth IRAs &amp; Roth 401(k)s. Qualified withdrawals are 100% tax-free.</p>
                        <div class="input-group" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0 0.75rem;">
                            <span style="color: var(--text-muted);">$</span>
                            <input type="number" id="input-roth-assets" step="5000" min="0" value="${this._data.roth}" style="width: 100%; border: none; background: transparent; padding: 0.5rem; color: var(--text-main);" />
                        </div>
                    </div>

                    <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <h4 style="margin: 0; font-size: 0.95rem; color: #34d399; font-weight: 600;">📊 Taxable Brokerage</h4>
                            <span class="badge-subtle badge-subtle-emerald">Brokerage</span>
                        </div>
                        <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: var(--text-muted);">Index funds, equities, ETFs. Taxed at preferential capital gains rates.</p>
                        <div class="input-group" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0 0.75rem;">
                            <span style="color: var(--text-muted);">$</span>
                            <input type="number" id="input-taxable-assets" step="5000" min="0" value="${this._data.taxable}" style="width: 100%; border: none; background: transparent; padding: 0.5rem; color: var(--text-main);" />
                        </div>
                    </div>

                    <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                            <h4 style="margin: 0; font-size: 0.95rem; color: #fbbf24; font-weight: 600;">🛡️ Cash Cushion</h4>
                            <span class="badge-subtle badge-subtle-amber">HYSA / CDs</span>
                        </div>
                        <p style="margin: 0 0 0.75rem 0; font-size: 0.78rem; color: var(--text-muted);">High-yield savings, CDs, checking. First line of sequence-of-returns defense.</p>
                        <div class="input-group" style="display: flex; align-items: center; background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 6px; padding: 0 0.75rem;">
                            <span style="color: var(--text-muted);">$</span>
                            <input type="number" id="input-cash-assets" step="1000" min="0" value="${this._data.cash}" style="width: 100%; border: none; background: transparent; padding: 0.5rem; color: var(--text-main);" />
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _renderStep4() {
        return `
            <div class="step-pane step-pane-4" style="display: flex; flex-direction: column; gap: 1.5rem;">
                <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                        <div>
                            <label style="font-size: 1rem; font-weight: 600; color: var(--text-main);">Annual Return Rate Expectation</label>
                            <p style="margin: 0; font-size: 0.82rem; color: var(--text-muted);">Compound growth rate for equity and diversified portfolios.</p>
                        </div>
                        <span class="badge-subtle badge-subtle-blue" id="return-rate-badge" style="font-size: 0.9rem; padding: 0.25rem 0.75rem;">
                            ${this._data.returnRate}% Nominal
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${MIN_RETURN_RATE}% (Conservative)</span>
                        <input type="range" id="slider-return-rate" min="${MIN_RETURN_RATE}" max="${MAX_RETURN_RATE}" step="${RETURN_STEP}" value="${this._data.returnRate}" style="flex: 1; cursor: pointer;" />
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${MAX_RETURN_RATE}% (Aggressive)</span>
                    </div>
                </div>

                <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <label style="display: block; font-size: 1rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">Social Security Claim Strategy</label>
                    <p style="margin: 0 0 1rem 0; font-size: 0.82rem; color: var(--text-muted);">Choose target claim age for primary earner. Delaying boosts benefit ~8%/year past FRA.</p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                        ${this._renderSsClaimOption(SS_CLAIM_AGE_EARLY, 'Early (Age 62)', '~70% baseline benefit')}
                        ${this._renderSsClaimOption(SS_CLAIM_AGE_FULL, 'Full FRA (Age 67)', '100% statutory benefit')}
                        ${this._renderSsClaimOption(SS_CLAIM_AGE_DELAYED, 'Delayed (Age 70)', '~124% maximum benefit')}
                    </div>
                </div>

                <div class="surface-card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; border-radius: 0.75rem; border: 1px solid var(--border);">
                    <label style="display: block; font-size: 1rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.25rem;">End-of-Life Wealth Objective</label>
                    <p style="margin: 0 0 1rem 0; font-size: 0.82rem; color: var(--text-muted);">Guides safe withdrawal rate glidepaths and principal preservation priority.</p>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                        ${this._renderGoalOption(GOAL_DIE_WITH_ZERO, 'Die With Zero', 'Optimize lifetime consumption and spend down balance smoothly.')}
                        ${this._renderGoalOption(GOAL_LEGACY, 'Legacy / Heirs', 'Preserve meaningful capital to pass down to children or charity.')}
                        ${this._renderGoalOption(GOAL_PRESERVATION, 'Capital Preservation', 'Never touch principal; strictly live off dividend yields and interest.')}
                    </div>
                </div>

                ${this._renderSmartDefaultsDrawer()}
            </div>
        `;
    }

    _renderSsClaimOption(age, label, sublabel) {
        const isSelected = Number(this._data.socialSecurityClaimAge) === age;
        return `
            <div class="option-pill ${isSelected ? 'selected' : ''}" data-ss-age="${age}" style="padding: 0.85rem; border-radius: 0.5rem; border: 1px solid ${isSelected ? '#3b82f6' : 'var(--border)'}; background: ${isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0,0,0,0.2)'}; cursor: pointer; transition: all 0.2s ease;">
                <div style="font-weight: 600; font-size: 0.92rem; color: ${isSelected ? '#93c5fd' : 'var(--text-main)'};">${label}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${sublabel}</div>
            </div>
        `;
    }

    _renderGoalOption(goalKey, label, sublabel) {
        const isSelected = this._data.endOfLifeGoal === goalKey;
        return `
            <div class="option-pill ${isSelected ? 'selected' : ''}" data-goal="${goalKey}" style="padding: 0.85rem; border-radius: 0.5rem; border: 1px solid ${isSelected ? '#8b5cf6' : 'var(--border)'}; background: ${isSelected ? 'rgba(139, 92, 246, 0.15)' : 'rgba(0,0,0,0.2)'}; cursor: pointer; transition: all 0.2s ease;">
                <div style="font-weight: 600; font-size: 0.92rem; color: ${isSelected ? '#c084fc' : 'var(--text-main)'};">${label}</div>
                <div style="font-size: 0.78rem; color: var(--text-muted);">${sublabel}</div>
            </div>
        `;
    }

    _renderSmartDefaultsDrawer() {
        return `
            <details class="smart-defaults-disclosure" style="background: rgba(15, 23, 42, 0.4); border: 1px solid var(--border); border-radius: 0.75rem; padding: 0.75rem 1rem;">
                <summary style="cursor: pointer; font-size: 0.9rem; font-weight: 600; color: #94a3b8; display: flex; align-items: center; gap: 0.5rem;">
                    <span>📋 Smart Assumptions &amp; Actuarial Defaults Applied</span>
                    <span class="badge-subtle badge-subtle-gray" style="margin-left: auto;">Auto-Configured</span>
                </summary>
                <div style="margin-top: 0.75rem; font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; display: flex; flex-direction: column; gap: 0.4rem;">
                    <div>• <strong>Social Security Replacement:</strong> Benchmarked at ~28% of gross wages (capped at statutory SSA max).</div>
                    <div>• <strong>Longevity Horizon:</strong> Plan extends through age ${this._data.longevityAge} to cover 90th percentile survivorship.</div>
                    <div>• <strong>Baseline Inflation:</strong> 2.8% per annum (50-year headline CPI geometric average).</div>
                    <div>• <strong>Wage Growth:</strong> 2.0% real annual wage progression prior to retirement.</div>
                    <div>• <strong>State Income Tax:</strong> 4.5% flat state benchmark rate.</div>
                    <div>• <strong>Home Maintenance &amp; Taxes:</strong> 1.2% property tax, 0.5% insurance, 1.0% annual upkeep reserve.</div>
                    <div>• <strong>Medicare Healthcare:</strong> $185/month per individual starting at Age 65.</div>
                    <div>• <strong>Drawdown Order:</strong> Tax-optimized waterfall (Cash &rarr; Taxable &rarr; Pre-Tax &rarr; Roth).</div>
                </div>
            </details>
        `;
    }

    _renderFooterNav() {
        const isFirst = this._currentStep === STEP_1;
        const isLast = this._currentStep === STEP_4;

        return `
            <div class="wizard-footer-nav" style="display: flex; justify-content: space-between; align-items: center; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border);">
                <div>
                    ${
                        !isFirst
                            ? `
                    <button type="button" id="btn-wizard-prev" class="btn btn-secondary" style="padding: 0.5rem 1.25rem;">
                        &larr; Previous Step
                    </button>
                    `
                            : '<div></div>'
                    }
                </div>
                <div>
                    ${
                        !isLast
                            ? `
                    <button type="button" id="btn-wizard-next" class="btn btn-primary" style="padding: 0.5rem 1.5rem; background: #3b82f6;">
                        Next Step &rarr;
                    </button>
                    `
                            : `
                    <button type="button" id="btn-wizard-finish" class="btn btn-primary" style="padding: 0.6rem 2rem; background: linear-gradient(135deg, #3b82f6, #8b5cf6); font-weight: 700; font-size: 1rem; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);">
                        Finish &amp; Launch Simulation 🎉
                    </button>
                    `
                    }
                </div>
            </div>
        `;
    }

    afterRender() {
        this._bindHeaderAndNav();
        this._bindStepPillNav();

        switch (this._currentStep) {
            case STEP_1:
                this._bindStep1Events();
                break;
            case STEP_2:
                this._bindStep2Events();
                break;
            case STEP_3:
                this._bindStep3Events();
                break;
            case STEP_4:
                this._bindStep4Events();
                break;
            default:
                break;
        }
    }

    _bindHeaderAndNav() {
        const btnClose = this.querySelector('.btn-wizard-close');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('guided-cancel', { bubbles: true, composed: true }));
            });
        }

        const btnPrev = this.querySelector('#btn-wizard-prev');
        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                this._errorMessage = '';
                this._goToStep(this._currentStep - 1);
            });
        }

        const btnNext = this.querySelector('#btn-wizard-next');
        if (btnNext) {
            btnNext.addEventListener('click', () => {
                if (this._validateCurrentStep()) {
                    this._errorMessage = '';
                    this._goToStep(this._currentStep + 1);
                }
            });
        }

        const btnFinish = this.querySelector('#btn-wizard-finish');
        if (btnFinish) {
            btnFinish.addEventListener('click', () => {
                if (this._validateCurrentStep()) {
                    this._finish();
                }
            });
        }

        const btnClearErr = this.querySelector('.btn-clear-error');
        if (btnClearErr) {
            btnClearErr.addEventListener('click', () => {
                this._errorMessage = '';
                this.render();
                this.afterRender();
            });
        }
    }

    _bindStepPillNav() {
        this.querySelectorAll('[data-nav-step]').forEach((pill) => {
            pill.addEventListener('click', () => {
                const target = parseInt(pill.getAttribute('data-nav-step'), 10);
                if (target < this._currentStep || this._validateCurrentStep()) {
                    this._errorMessage = '';
                    this._goToStep(target);
                }
            });
        });
    }

    _goToStep(stepNumber) {
        if (stepNumber < STEP_1 || stepNumber > TOTAL_STEPS) return;
        const prev = this._currentStep;
        this._currentStep = stepNumber;
        this.render();
        this.afterRender();
        this.dispatchEvent(
            new CustomEvent('guided-step-change', {
                detail: { currentStep: this._currentStep, previousStep: prev },
                bubbles: true,
                composed: true
            })
        );
    }

    _bindStep1Events() {
        const nameInput = this.querySelector('#input-primary-name');
        if (nameInput) {
            nameInput.addEventListener('input', (e) => {
                this._data.primaryName = e.target.value;
            });
        }

        const bYearInput = this.querySelector('#input-primary-birth-year');
        if (bYearInput) {
            bYearInput.addEventListener('input', (e) => {
                this._data.primaryBirthYear = Number(e.target.value);
            });
        }

        const retAgeInput = this.querySelector('#input-primary-retirement-age');
        if (retAgeInput) {
            retAgeInput.addEventListener('input', (e) => {
                this._data.primaryRetirementAge = Number(e.target.value);
            });
        }

        const btnAddSpouse = this.querySelector('#btn-add-spouse');
        if (btnAddSpouse) {
            btnAddSpouse.addEventListener('click', () => {
                this._data.hasSpouse = true;
                this.render();
                this.afterRender();
            });
        }

        const btnRemoveSpouse = this.querySelector('#btn-remove-spouse');
        if (btnRemoveSpouse) {
            btnRemoveSpouse.addEventListener('click', () => {
                this._data.hasSpouse = false;
                this.render();
                this.afterRender();
            });
        }

        this._bindSpouseInputs();

        const sliderLongevity = this.querySelector('#slider-longevity');
        if (sliderLongevity) {
            sliderLongevity.addEventListener('input', (e) => {
                this._data.longevityAge = Number(e.target.value);
                const badge = this.querySelector('#longevity-badge');
                if (badge) badge.textContent = `Age ${this._data.longevityAge}`;
            });
        }

        const depInput = this.querySelector('#input-dependents-count');
        if (depInput) {
            depInput.addEventListener('input', (e) => {
                this._data.dependentsCount = Math.max(ZERO, Number(e.target.value) || ZERO);
            });
        }
    }

    _bindSpouseInputs() {
        if (!this._data.hasSpouse) return;
        const sName = this.querySelector('#input-spouse-name');
        if (sName) {
            sName.addEventListener('input', (e) => {
                this._data.spouseName = e.target.value;
            });
        }
        const sBirth = this.querySelector('#input-spouse-birth-year');
        if (sBirth) {
            sBirth.addEventListener('input', (e) => {
                this._data.spouseBirthYear = Number(e.target.value);
            });
        }
        const sRet = this.querySelector('#input-spouse-retirement-age');
        if (sRet) {
            sRet.addEventListener('input', (e) => {
                this._data.spouseRetirementAge = Number(e.target.value);
            });
        }
    }

    _bindStep2Events() {
        const primSalary = this.querySelector('#input-primary-salary');
        if (primSalary) {
            primSalary.addEventListener('input', (e) => {
                this._data.primarySalary = Number(e.target.value);
            });
        }

        const spouseSalary = this.querySelector('#input-spouse-salary');
        if (spouseSalary) {
            spouseSalary.addEventListener('input', (e) => {
                this._data.spouseSalary = Number(e.target.value);
            });
        }

        const budgetInput = this.querySelector('#input-monthly-budget');
        if (budgetInput) {
            budgetInput.addEventListener('input', (e) => {
                this._data.monthlyBudget = Number(e.target.value);
            });
        }

        this.querySelectorAll('.btn-housing-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                this._data.housingStatus = btn.getAttribute('data-housing');
                this.render();
                this.afterRender();
            });
        });

        this._bindHousingInputs();
    }

    _bindHousingInputs() {
        if (this._data.housingStatus === HOUSING_RENT) {
            const rentInput = this.querySelector('#input-monthly-rent');
            if (rentInput) {
                rentInput.addEventListener('input', (e) => {
                    this._data.monthlyRent = Number(e.target.value);
                });
            }
            return;
        }

        this._bindHomeownerInputs();
    }

    _bindHomeownerInputs() {
        const hVal = this.querySelector('#input-home-value');
        if (hVal) {
            hVal.addEventListener('input', (e) => {
                this._data.homeValue = Number(e.target.value);
                this._updateLiveAmortizationPreview();
            });
        }

        const mDate = this.querySelector('#input-mortgage-orig-date');
        if (mDate) {
            mDate.addEventListener('input', (e) => {
                this._data.mortgageOriginationDate = e.target.value;
                this._updateLiveAmortizationPreview();
            });
        }

        const mAmt = this.querySelector('#input-mortgage-orig-amt');
        if (mAmt) {
            mAmt.addEventListener('input', (e) => {
                this._data.mortgageOriginationAmount = Number(e.target.value);
                this._updateLiveAmortizationPreview();
            });
        }

        const mRate = this.querySelector('#input-mortgage-rate');
        if (mRate) {
            mRate.addEventListener('input', (e) => {
                this._data.mortgageInterestRate = Number(e.target.value);
                this._updateLiveAmortizationPreview();
            });
        }

        const mTerm = this.querySelector('#select-mortgage-term');
        if (mTerm) {
            mTerm.addEventListener('change', (e) => {
                this._data.mortgageTermYears = Number(e.target.value);
                this._updateLiveAmortizationPreview();
            });
        }
    }

    _updateLiveAmortizationPreview() {
        const previewEl = this.querySelector('#mortgage-amortization-pill');
        if (!previewEl) return;
        const amort = calculateAmortization(
            this._data.mortgageOriginationAmount,
            this._data.mortgageInterestRate,
            this._data.mortgageTermYears,
            this._data.mortgageOriginationDate
        );
        previewEl.outerHTML = `
            <div id="mortgage-amortization-pill" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; padding: 0.85rem 1.25rem; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size: 1.1rem;">📊</span>
                    <div>
                        <div style="font-size: 0.85rem; font-weight: 600; color: #93c5fd;">Live Amortization Preview</div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">Current Principal Balance: <strong style="color: #fff;">${formatUsd(amort.currentBalance)}</strong></div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Monthly P&amp;I</div>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #34d399;">${formatUsd(amort.monthlyPI)}/mo</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Payoff Target</div>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #fbbf24;">Year ${amort.payoffYear}</div>
                    </div>
                </div>
            </div>
        `;
    }

    _bindStep3Events() {
        const updateSummary = () => {
            const pill = this.querySelector('#liquid-total-pill');
            if (pill) pill.textContent = formatUsd(this._calculateTotalLiquid());
        };

        const pretax = this.querySelector('#input-pretax-assets');
        if (pretax) {
            pretax.addEventListener('input', (e) => {
                this._data.preTax = Number(e.target.value);
                updateSummary();
            });
        }

        const roth = this.querySelector('#input-roth-assets');
        if (roth) {
            roth.addEventListener('input', (e) => {
                this._data.roth = Number(e.target.value);
                updateSummary();
            });
        }

        const taxable = this.querySelector('#input-taxable-assets');
        if (taxable) {
            taxable.addEventListener('input', (e) => {
                this._data.taxable = Number(e.target.value);
                updateSummary();
            });
        }

        const cash = this.querySelector('#input-cash-assets');
        if (cash) {
            cash.addEventListener('input', (e) => {
                this._data.cash = Number(e.target.value);
                updateSummary();
            });
        }
    }

    _bindStep4Events() {
        const sliderRet = this.querySelector('#slider-return-rate');
        if (sliderRet) {
            sliderRet.addEventListener('input', (e) => {
                this._data.returnRate = Number(e.target.value);
                const badge = this.querySelector('#return-rate-badge');
                if (badge) badge.textContent = `${this._data.returnRate}% Nominal`;
            });
        }

        this.querySelectorAll('[data-ss-age]').forEach((el) => {
            el.addEventListener('click', () => {
                this._data.socialSecurityClaimAge = Number(el.getAttribute('data-ss-age'));
                this.render();
                this.afterRender();
            });
        });

        this.querySelectorAll('[data-goal]').forEach((el) => {
            el.addEventListener('click', () => {
                this._data.endOfLifeGoal = el.getAttribute('data-goal');
                this.render();
                this.afterRender();
            });
        });
    }

    _validateCurrentStep() {
        switch (this._currentStep) {
            case STEP_1:
                return this._validateStep1();
            case STEP_2:
                return this._validateStep2();
            case STEP_3:
                return this._validateStep3();
            case STEP_4:
                return true;
            default:
                return true;
        }
    }

    _validateStep1() {
        const bYear = Number(this._data.primaryBirthYear);
        const retAge = Number(this._data.primaryRetirementAge);
        if (!bYear || bYear < 1920 || bYear > DEFAULT_CURRENT_YEAR) {
            this._errorMessage = 'Please enter a valid primary birth year between 1920 and present.';
            this.render();
            this.afterRender();
            return false;
        }
        if (!retAge || retAge < 30 || retAge > 90) {
            this._errorMessage = 'Please enter a valid retirement age between 30 and 90.';
            this.render();
            this.afterRender();
            return false;
        }
        if (this._data.hasSpouse) {
            const sBirth = Number(this._data.spouseBirthYear);
            const sRet = Number(this._data.spouseRetirementAge);
            if (!sBirth || sBirth < 1920 || sBirth > DEFAULT_CURRENT_YEAR) {
                this._errorMessage = 'Please enter a valid spouse birth year between 1920 and present.';
                this.render();
                this.afterRender();
                return false;
            }
            if (!sRet || sRet < 30 || sRet > 90) {
                this._errorMessage = 'Please enter a valid spouse retirement age between 30 and 90.';
                this.render();
                this.afterRender();
                return false;
            }
        }
        return true;
    }

    _validateStep2() {
        if (Number(this._data.primarySalary) < ZERO) {
            this._errorMessage = 'Primary salary cannot be negative.';
            this.render();
            this.afterRender();
            return false;
        }
        if (Number(this._data.monthlyBudget) <= ZERO) {
            this._errorMessage = 'Monthly living budget must be greater than $0.';
            this.render();
            this.afterRender();
            return false;
        }
        if (this._data.housingStatus === HOUSING_OWN && Number(this._data.homeValue) <= ZERO) {
            this._errorMessage = 'Home market value must be greater than $0 for homeowners.';
            this.render();
            this.afterRender();
            return false;
        }
        return true;
    }

    _validateStep3() {
        if (this._calculateTotalLiquid() < ZERO) {
            this._errorMessage = 'Liquid balances cannot be negative.';
            this.render();
            this.afterRender();
            return false;
        }
        return true;
    }

    _finish() {
        const fullPayload = this.getData();
        this.dispatchEvent(
            new CustomEvent('guided-complete', {
                detail: fullPayload,
                bubbles: true,
                composed: true
            })
        );
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('guided-planner-wizard')) {
    customElements.define('guided-planner-wizard', GuidedPlannerWizard);
}
