/**
 * ExpressOnboardingModal Component
 *
 * Implements Mockups 2, 3, 4: Express Mode Quick-Start (Tier 1).
 * Features:
 * - Phase 1: Core 4 inputs (Current Age, Target Retirement Age, Total Invested Portfolio, Annual Living Spend & Net Income).
 * - Live Output Hero preview card (Freedom milestone age, savings rate, target nest egg at 4% SWR).
 * - Collapsible "Smart Assumptions & Defaults Applied" review drawer (Mockup 3).
 * - Optional Phase 2 collapsible drawer: "A Little Deeper" (Filing status, housing, 4 asset buckets) (Mockup 4).
 * - Dispatches 'express-complete' event with { formData, applyDefaults: true }.
 *
 * Web Components Custom Elements API: https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
 * HTMLElement API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement
 * CustomEvent API: https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
 * Intl.NumberFormat API: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 *
 * Written with the assistance of Google Gemini
 */

import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';

const DEFAULT_CURRENT_AGE = 35;
const DEFAULT_RETIREMENT_AGE = 60;
const DEFAULT_PORTFOLIO = 150000;
const DEFAULT_ANNUAL_INCOME = 120000;
const DEFAULT_ANNUAL_EXPENSES = 65000;
const DEFAULT_MONTHLY_RENT = 2000;
const DEFAULT_HOME_VALUE = 450000;
const DEFAULT_MORTGAGE_BALANCE = 250000;

const DEFAULT_PRETAX_PCT = 60;
const DEFAULT_ROTH_PCT = 25;
const DEFAULT_TAXABLE_PCT = 10;
const DEFAULT_CASH_PCT = 5;

const SWR_MULTIPLIER = 25;
const PERCENT_SCALE = 100;
const NOMINAL_RETURN_RATE = 0.07;
const INFLATION_RATE = 0.028;
const MAX_ACTUARIAL_AGE = 95;
const MIN_ACTUARIAL_AGE = 18;
const SOCIAL_SECURITY_BENEFIT_RATIO = 0.28;
const MONTHS_PER_YEAR = 12;
const KEY_ESCAPE = 'Escape';

const FILING_SINGLE = 'single';
const FILING_MARRIED = 'married';
const HOUSING_RENT = 'rent';
const HOUSING_OWN = 'own';

/**
 * Formats a numeric amount as currency string.
 * @param {number} amountNum - Numeric amount.
 * @returns {string} Formatted USD string.
 */
function formatDollar(amountNum) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(Number(amountNum) || 0);
}

export class ExpressOnboardingModal extends BaseComponent {
    /**
     * Initializes express onboarding modal with standard defaults.
     */
    constructor() {
        super();
        this._isOpen = false;
        this._isAssumptionsOpen = false;
        this._isDeeperOpen = false;

        this._formData = {
            currentAge: DEFAULT_CURRENT_AGE,
            retirementAge: DEFAULT_RETIREMENT_AGE,
            portfolio: DEFAULT_PORTFOLIO,
            income: DEFAULT_ANNUAL_INCOME,
            expenses: DEFAULT_ANNUAL_EXPENSES,
            filingStatus: FILING_SINGLE,
            housingStatus: HOUSING_RENT,
            monthlyRent: DEFAULT_MONTHLY_RENT,
            homeValue: DEFAULT_HOME_VALUE,
            mortgageBalance: DEFAULT_MORTGAGE_BALANCE,
            buckets: {
                preTaxPct: DEFAULT_PRETAX_PCT,
                rothPct: DEFAULT_ROTH_PCT,
                taxablePct: DEFAULT_TAXABLE_PCT,
                cashPct: DEFAULT_CASH_PCT
            }
        };

        this._metrics = this._calculateMetrics();

        this._onKeyDown = (eventParam) => {
            if (eventParam.key === KEY_ESCAPE && this._isOpen) {
                this.close();
            }
        };
    }

    /**
     * Lifecycle callback when attached to DOM.
     */
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._onKeyDown);
        this._bindRootDelegation();
    }

    /**
     * Lifecycle callback when removed from DOM.
     */
    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._onKeyDown);
    }

    /**
     * Attaches persistent root event listeners for clicks and input changes.
     */
    _bindRootDelegation() {
        this.addEventListener('click', (eventParam) => {
            this._handleRootClick(eventParam);
        });

        this.addEventListener('input', (eventParam) => {
            this._handleRootInput(eventParam);
        });

        this.addEventListener('change', (eventParam) => {
            this._handleRootInput(eventParam);
        });
    }

    /**
     * Handles clicks within the component host.
     * @param {MouseEvent} eventParam - Click event.
     */
    _handleRootClick(eventParam) {
        const clickedTarget = eventParam.target;
        if (!clickedTarget) return;

        if (this._isCloseOrBackdropTrigger(clickedTarget)) {
            eventParam.preventDefault();
            this.close();
            return;
        }

        if (clickedTarget.closest('.btn-toggle-assumptions')) {
            eventParam.preventDefault();
            this._isAssumptionsOpen = !this._isAssumptionsOpen;
            this.render();
            return;
        }

        if (clickedTarget.closest('.btn-toggle-deeper')) {
            eventParam.preventDefault();
            this._isDeeperOpen = !this._isDeeperOpen;
            this.render();
            return;
        }

        if (clickedTarget.closest('.btn-calc-express')) {
            eventParam.preventDefault();
            this._readInputsToFormData();
            this._metrics = this._calculateMetrics();
            this._updateLiveHeroDOM();
            return;
        }

        if (clickedTarget.closest('.btn-finish-express')) {
            eventParam.preventDefault();
            this._readInputsToFormData();
            this._dispatchCompleteEvent();
        }
    }

    /**
     * Checks if target is dismiss trigger.
     * @param {HTMLElement} clickedTarget - Clicked DOM element.
     * @returns {boolean} True if dismiss trigger.
     */
    _isCloseOrBackdropTrigger(clickedTarget) {
        if (clickedTarget.id === 'express-modal-overlay' || clickedTarget.id === 'express-onboarding-modal')
            return true;
        if (clickedTarget.closest('.btn-close-express')) return true;
        if (clickedTarget.closest('.btn-skip-express')) return true;
        return false;
    }

    /**
     * Handles live input changes and refreshes metrics without re-rendering inputs.
     * @param {Event} eventParam - Input event.
     */
    _handleRootInput(eventParam) {
        const targetInput = eventParam.target;
        if (!targetInput) return;

        this._readInputsToFormData();
        this._metrics = this._calculateMetrics();
        this._updateLiveHeroDOM();
    }

    /**
     * Updates view model data from external caller or bridge.
     * @param {object} inputViewModel - Hydration data.
     */
    setViewModel(inputViewModel) {
        if (!inputViewModel || typeof inputViewModel !== 'object') return;

        this._hydrateCoreFields(inputViewModel);
        this._hydrateDeeperFields(inputViewModel);
        this._metrics = this._calculateMetrics();
        if (this._isOpen) this.render();
    }

    /**
     * Hydrates core 4 financial fields.
     * @param {object} inputViewModel - Source data object.
     */
    _hydrateCoreFields(inputViewModel) {
        if (inputViewModel.currentAge !== undefined) {
            this._formData.currentAge = Math.max(
                MIN_ACTUARIAL_AGE,
                Number(inputViewModel.currentAge) || DEFAULT_CURRENT_AGE
            );
        }
        const retAge = inputViewModel.targetRetirementAge ?? inputViewModel.retirementAge;
        if (retAge !== undefined) {
            this._formData.retirementAge = Math.max(MIN_ACTUARIAL_AGE, Number(retAge) || DEFAULT_RETIREMENT_AGE);
        }
        const portVal = inputViewModel.totalInvestedAssets ?? inputViewModel.portfolio;
        if (portVal !== undefined) {
            this._formData.portfolio = Math.max(0, Number(portVal) || 0);
        }
        const incVal = inputViewModel.householdIncome ?? inputViewModel.income;
        if (incVal !== undefined) {
            this._formData.income = Math.max(0, Number(incVal) || 0);
        }
        const expVal = inputViewModel.annualLivingSpend ?? inputViewModel.expenses;
        if (expVal !== undefined) {
            this._formData.expenses = Math.max(0, Number(expVal) || 0);
        }
    }

    /**
     * Hydrates secondary optional parameters if present.
     * @param {object} inputViewModel - Source data object.
     */
    _hydrateDeeperFields(inputViewModel) {
        if (inputViewModel.filingStatus) {
            this._formData.filingStatus =
                inputViewModel.filingStatus === FILING_MARRIED ? FILING_MARRIED : FILING_SINGLE;
        }
        if (inputViewModel.housingStatus) {
            this._formData.housingStatus = inputViewModel.housingStatus === HOUSING_OWN ? HOUSING_OWN : HOUSING_RENT;
        }
        if (inputViewModel.monthlyRent !== undefined) {
            this._formData.monthlyRent = Math.max(0, Number(inputViewModel.monthlyRent) || DEFAULT_MONTHLY_RENT);
        }
        if (inputViewModel.homeValue !== undefined) {
            this._formData.homeValue = Math.max(0, Number(inputViewModel.homeValue) || DEFAULT_HOME_VALUE);
        }
        if (inputViewModel.mortgageBalance !== undefined) {
            this._formData.mortgageBalance = Math.max(
                0,
                Number(inputViewModel.mortgageBalance) || DEFAULT_MORTGAGE_BALANCE
            );
        }
    }

    /**
     * Reads current DOM input elements into internal _formData.
     */
    _readInputsToFormData() {
        const queryElem = (selectorStr) => this.querySelector(selectorStr);

        const ageInput = queryElem('#expr-current-age');
        const retInput = queryElem('#expr-retire-age');
        const portInput = queryElem('#expr-portfolio');
        const incInput = queryElem('#expr-income');
        const expInput = queryElem('#expr-expenses');

        if (ageInput)
            this._formData.currentAge = Math.max(MIN_ACTUARIAL_AGE, Number(ageInput.value) || DEFAULT_CURRENT_AGE);
        if (retInput)
            this._formData.retirementAge = Math.max(
                MIN_ACTUARIAL_AGE,
                Number(retInput.value) || DEFAULT_RETIREMENT_AGE
            );
        if (portInput) this._formData.portfolio = Math.max(0, Number(portInput.value) || 0);
        if (incInput) this._formData.income = Math.max(0, Number(incInput.value) || 0);
        if (expInput) this._formData.expenses = Math.max(0, Number(expInput.value) || 0);

        this._readDeeperInputs();
    }

    /**
     * Reads secondary phase 2 inputs from DOM if rendered.
     */
    _readDeeperInputs() {
        const queryElem = (selectorStr) => this.querySelector(selectorStr);

        const filingRadio = this.querySelector('input[name="expr-filing"]:checked');
        if (filingRadio) this._formData.filingStatus = filingRadio.value;

        const housingRadio = this.querySelector('input[name="expr-housing"]:checked');
        if (housingRadio) this._formData.housingStatus = housingRadio.value;

        const rentInput = queryElem('#expr-rent');
        if (rentInput) this._formData.monthlyRent = Math.max(0, Number(rentInput.value) || 0);

        const homeValInput = queryElem('#expr-home-value');
        if (homeValInput) this._formData.homeValue = Math.max(0, Number(homeValInput.value) || 0);

        const mortInput = queryElem('#expr-mortgage-bal');
        if (mortInput) this._formData.mortgageBalance = Math.max(0, Number(mortInput.value) || 0);

        this._readBucketInputs();
    }

    /**
     * Reads bucket percentage allocations from DOM.
     */
    _readBucketInputs() {
        const queryElem = (selectorStr) => this.querySelector(selectorStr);

        const preTaxInput = queryElem('#expr-bucket-pretax');
        const rothInput = queryElem('#expr-bucket-roth');
        const taxInput = queryElem('#expr-bucket-taxable');
        const cashInput = queryElem('#expr-bucket-cash');

        if (preTaxInput) this._formData.buckets.preTaxPct = Number(preTaxInput.value) || 0;
        if (rothInput) this._formData.buckets.rothPct = Number(rothInput.value) || 0;
        if (taxInput) this._formData.buckets.taxablePct = Number(taxInput.value) || 0;
        if (cashInput) this._formData.buckets.cashPct = Number(cashInput.value) || 0;
    }

    /**
     * Calculates real-time retirement and savings metrics.
     * @returns {object} Calculated metrics package.
     */
    _calculateMetrics() {
        const currentAgeNum = this._formData.currentAge;
        const portfolioNum = this._formData.portfolio;
        const incomeNum = this._formData.income;
        const expensesNum = this._formData.expenses;

        const annualSavingsNum = Math.max(0, incomeNum - expensesNum);
        const savingsRatePct =
            incomeNum > 0
                ? Math.max(0, Math.min(PERCENT_SCALE, Math.round((annualSavingsNum / incomeNum) * PERCENT_SCALE)))
                : 0;

        const targetNestEggNum = expensesNum * SWR_MULTIPLIER;
        const fundedRatioPct =
            targetNestEggNum > 0
                ? Math.min(PERCENT_SCALE, Math.round((portfolioNum / targetNestEggNum) * PERCENT_SCALE))
                : 0;

        const projectedFIAgeNum = this._projectFIAge(currentAgeNum, portfolioNum, annualSavingsNum, targetNestEggNum);

        return {
            annualSavings: annualSavingsNum,
            savingsRate: savingsRatePct,
            targetNestEgg: targetNestEggNum,
            fundedRatio: fundedRatioPct,
            projectedFIAge: projectedFIAgeNum
        };
    }

    /**
     * Simulates year-by-year compound growth to project Financial Independence age.
     * @param {number} currentAgeNum - Starting age.
     * @param {number} startPortfolioNum - Initial portfolio balance.
     * @param {number} annualSavingsNum - Annual additions.
     * @param {number} targetNestEggNum - Goal nest egg.
     * @returns {number|null} Projected age of freedom, or null if unreachable.
     */
    _projectFIAge(currentAgeNum, startPortfolioNum, annualSavingsNum, targetNestEggNum) {
        if (startPortfolioNum >= targetNestEggNum) return currentAgeNum;
        if (annualSavingsNum <= 0 && startPortfolioNum <= 0) return null;

        const realCompoundRate = (1 + NOMINAL_RETURN_RATE) / (1 + INFLATION_RATE) - 1;
        let runningBalance = startPortfolioNum;
        let testAge = currentAgeNum;

        while (testAge < MAX_ACTUARIAL_AGE) {
            runningBalance = runningBalance * (1 + realCompoundRate) + annualSavingsNum;
            testAge += 1;
            if (runningBalance >= targetNestEggNum) {
                return testAge;
            }
        }

        return null;
    }

    /**
     * Updates the live hero preview DOM elements in-place without refreshing inputs.
     */
    _updateLiveHeroDOM() {
        const freedomAgeEl = this.querySelector('#hero-freedom-age');
        const freedomSubEl = this.querySelector('#hero-freedom-sub');
        const nestEggEl = this.querySelector('#hero-nest-egg');
        const savingsRateEl = this.querySelector('#hero-savings-rate');
        const savingsSubEl = this.querySelector('#hero-savings-sub');
        const fundedPctEl = this.querySelector('#hero-funded-pct');
        const progressBarEl = this.querySelector('#hero-progress-bar');

        if (!freedomAgeEl || !this._metrics) return;

        const freedomAgeText =
            this._metrics.projectedFIAge !== null ? `Age ${this._metrics.projectedFIAge}` : 'Age 65+';
        const yearsDiffText =
            this._metrics.projectedFIAge !== null
                ? `In ${Math.max(0, this._metrics.projectedFIAge - this._formData.currentAge)} years`
                : 'Requires higher savings';

        freedomAgeEl.textContent = freedomAgeText;
        if (freedomSubEl) freedomSubEl.textContent = yearsDiffText;
        if (nestEggEl) nestEggEl.textContent = formatDollar(this._metrics.targetNestEgg);
        if (savingsRateEl) savingsRateEl.textContent = `${this._metrics.savingsRate}%`;
        if (savingsSubEl) savingsSubEl.textContent = `${formatDollar(this._metrics.annualSavings)}/yr saved`;
        if (fundedPctEl) fundedPctEl.textContent = `${this._metrics.fundedRatio}% funded`;
        if (progressBarEl) progressBarEl.style.width = `${this._metrics.fundedRatio}%`;
    }

    /**
     * Dispatches express-complete event with full form configuration.
     */
    _dispatchCompleteEvent() {
        const payloadObj = {
            formData: {
                ...this._formData,
                targetRetirementAge: this._formData.retirementAge,
                totalInvestedAssets: this._formData.portfolio,
                householdIncome: this._formData.income,
                annualLivingSpend: this._formData.expenses,
                calculatedMetrics: this._metrics
            },
            applyDefaults: true
        };

        this.dispatchEvent(
            new CustomEvent('express-complete', {
                detail: payloadObj,
                bubbles: true,
                composed: true
            })
        );

        this.close();
    }

    /**
     * Opens modal with optional preloaded data.
     * @param {object} [initialData=null] - Optional initial state.
     */
    open(initialData = null) {
        if (initialData) {
            this.setViewModel(initialData);
        }
        this._isOpen = true;
        this.render();
    }

    /**
     * Closes modal.
     */
    close() {
        this._isOpen = false;
        this.render();
    }

    /**
     * Generates component template string.
     * @returns {string} HTML string.
     */
    getTemplate() {
        const visibilityClass = this._isOpen ? '' : 'hidden';

        return `
            <div id="express-modal-overlay" class="drawer-overlay ${visibilityClass}"
                style="align-items: center; justify-content: center; z-index: 10000; padding: 1.5rem; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px);">
                <div class="express-modal-card"
                    style="width: 860px; max-width: 95vw; max-height: 94vh; overflow-y: auto; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1.25rem; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85); padding: 2rem;">
                    ${this._renderHeader()}
                    ${this._renderHeroCard()}
                    ${this._renderCoreInputs()}
                    ${this._renderAssumptionsDrawer()}
                    ${this._renderDeeperDrawer()}
                    ${this._renderFooterActions()}
                </div>
            </div>
        `;
    }

    /**
     * Renders modal title header and dismiss button.
     * @returns {string} Header HTML.
     */
    _renderHeader() {
        return `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 1rem;">
                <div>
                    <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); border-radius: 9999px; padding: 0.2rem 0.75rem; font-size: 0.75rem; font-weight: 700; color: #a5b4fc; text-transform: uppercase; margin-bottom: 0.5rem;">
                        <span>⚡</span> Express Mode (60s Quick-Start)
                    </div>
                    <h2 style="font-size: 1.6rem; font-weight: 700; color: #f8fafc; margin: 0; letter-spacing: -0.02em;">
                        Your Fast Path to Financial Freedom
                    </h2>
                </div>
                <button type="button" class="btn-close-express btn-close" aria-label="Close express setup"
                    style="background: transparent; border: none; color: #94a3b8; font-size: 1.75rem; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; border-radius: 0.375rem;">
                    &times;
                </button>
            </div>
        `;
    }

    /**
     * Renders Live Output Hero Card (Mockup 3).
     * @returns {string} Hero card HTML.
     */
    _renderHeroCard() {
        const metricsObj = this._metrics || this._calculateMetrics();
        const projectedAge = metricsObj.projectedFIAge !== null ? `Age ${metricsObj.projectedFIAge}` : 'Age 65+';
        const yearsToFI =
            metricsObj.projectedFIAge !== null
                ? `In ${Math.max(0, metricsObj.projectedFIAge - this._formData.currentAge)} years`
                : 'Adjust inputs to reach FI';

        return `
            <div class="express-hero-card"
                style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(139, 92, 246, 0.12) 50%, rgba(30, 41, 59, 0.85) 100%); border: 1px solid rgba(129, 140, 248, 0.4); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.75rem; box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #c7d2fe; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.4rem;">
                        <span>📊</span> Real-Time Projection Preview
                    </div>
                    <div style="font-size: 0.75rem; color: #94a3b8;">
                        Rule of 4% SWR • 7% Nominal Return
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem;">
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">🎯 Projected Freedom</div>
                        <div id="hero-freedom-age" style="font-size: 1.5rem; font-weight: 800; color: #38bdf8;">${projectedAge}</div>
                        <div id="hero-freedom-sub" style="font-size: 0.72rem; color: #7dd3fc;">${yearsToFI}</div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem;">
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">💰 Target Nest Egg</div>
                        <div id="hero-nest-egg" style="font-size: 1.5rem; font-weight: 800; color: #a78bfa;">${formatDollar(metricsObj.targetNestEgg)}</div>
                        <div style="font-size: 0.72rem; color: #c4b5fd;">At 4% safe withdrawal</div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem;">
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">📈 Savings Rate</div>
                        <div id="hero-savings-rate" style="font-size: 1.5rem; font-weight: 800; color: #34d399;">${metricsObj.savingsRate}%</div>
                        <div id="hero-savings-sub" style="font-size: 0.72rem; color: #6ee7b7;">${formatDollar(metricsObj.annualSavings)}/yr saved</div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; padding: 1rem;">
                        <div style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem;">🛡️ Current Nest Egg</div>
                        <div id="hero-funded-pct" style="font-size: 1.5rem; font-weight: 800; color: #facc15;">${metricsObj.fundedRatio}% funded</div>
                        <div style="font-size: 0.72rem; color: #fde047;">${formatDollar(this._formData.portfolio)} invested</div>
                    </div>
                </div>

                <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.35rem;">
                        <span>Progress to Financial Independence Target</span>
                        <span>${metricsObj.fundedRatio}%</span>
                    </div>
                    <div style="width: 100%; height: 8px; background: rgba(15, 23, 42, 0.7); border-radius: 9999px; overflow: hidden;">
                        <div id="hero-progress-bar" style="width: ${metricsObj.fundedRatio}%; height: 100%; background: linear-gradient(90deg, #6366f1, #38bdf8); transition: width 0.3s ease;"></div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renders Phase 1 core input fields (Mockup 2).
     * @returns {string} Form fields HTML.
     */
    _renderCoreInputs() {
        return `
            <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.25rem;">
                <div style="font-size: 0.9rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.25rem; display: flex; align-items: center; gap: 0.4rem;">
                    <span>🎯</span> The 4 Core Questions
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
                    <div>
                        <label for="expr-current-age" style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.35rem;">
                            Current Age
                        </label>
                        <input type="number" id="expr-current-age" min="18" max="85" value="${escapeHtml(this._formData.currentAge)}"
                            style="width: 100%; padding: 0.65rem 0.85rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.5rem; color: #fff; font-size: 0.95rem;">
                    </div>

                    <div>
                        <label for="expr-retire-age" style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.35rem;">
                            Target Retirement Age
                        </label>
                        <input type="number" id="expr-retire-age" min="25" max="90" value="${escapeHtml(this._formData.retirementAge)}"
                            style="width: 100%; padding: 0.65rem 0.85rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.5rem; color: #fff; font-size: 0.95rem;">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 1.25rem;">
                    <div>
                        <label for="expr-portfolio" style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.35rem;">
                            Total Invested Portfolio ($)
                        </label>
                        <input type="number" id="expr-portfolio" min="0" step="1000" value="${escapeHtml(this._formData.portfolio)}"
                            style="width: 100%; padding: 0.65rem 0.85rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.5rem; color: #fff; font-size: 0.95rem;">
                        <span style="font-size: 0.72rem; color: #94a3b8;">Sum of all 401(k), IRA, brokerage & cash</span>
                    </div>

                    <div>
                        <label for="expr-income" style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.35rem;">
                            Annual Net Take-Home Income ($/yr)
                        </label>
                        <input type="number" id="expr-income" min="0" step="1000" value="${escapeHtml(this._formData.income)}"
                            style="width: 100%; padding: 0.65rem 0.85rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.5rem; color: #fff; font-size: 0.95rem;">
                        <span style="font-size: 0.72rem; color: #94a3b8;">Household take-home income after taxes</span>
                    </div>
                </div>

                <div>
                    <label for="expr-expenses" style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.35rem;">
                        Annual Living Expenses ($/yr)
                    </label>
                    <input type="number" id="expr-expenses" min="0" step="1000" value="${escapeHtml(this._formData.expenses)}"
                        style="width: 100%; padding: 0.65rem 0.85rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.5rem; color: #fff; font-size: 0.95rem;">
                    <span style="font-size: 0.72rem; color: #94a3b8;">Current total annual household spending</span>
                </div>
            </div>
        `;
    }

    /**
     * Renders collapsible "Smart Assumptions & Defaults Applied" review drawer (Mockup 3).
     * @returns {string} Assumptions drawer HTML.
     */
    _renderAssumptionsDrawer() {
        const arrowChar = this._isAssumptionsOpen ? '▴' : '▾';

        return `
            <div style="background: rgba(30, 41, 59, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; margin-bottom: 1rem; overflow: hidden;">
                <button type="button" class="btn-toggle-assumptions"
                    style="width: 100%; padding: 0.85rem 1.25rem; background: transparent; border: none; color: #cbd5e1; font-weight: 600; font-size: 0.86rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>📋</span> Smart Assumptions & Defaults Applied
                    </span>
                    <span style="color: #94a3b8;">${arrowChar}</span>
                </button>

                ${
                    this._isAssumptionsOpen
                        ? `
                    <div style="padding: 0 1.25rem 1.25rem 1.25rem; font-size: 0.8rem; color: #94a3b8; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.75rem; border-top: 1px solid rgba(255, 255, 255, 0.06); padding-top: 1rem;">
                        <div style="background: rgba(15, 23, 42, 0.5); padding: 0.65rem 0.85rem; border-radius: 0.5rem;">
                            <strong style="color: #cbd5e1; display: block; margin-bottom: 0.15rem;">🏛️ Social Security</strong>
                            ~28% wage replacement (${formatDollar(Math.round((this._formData.income * SOCIAL_SECURITY_BENEFIT_RATIO) / MONTHS_PER_YEAR))}/mo) starting at Age 67.
                        </div>
                        <div style="background: rgba(15, 23, 42, 0.5); padding: 0.65rem 0.85rem; border-radius: 0.5rem;">
                            <strong style="color: #cbd5e1; display: block; margin-bottom: 0.15rem;">📈 Compound Returns</strong>
                            7.0% nominal portfolio growth (4.2% real compound return above inflation).
                        </div>
                        <div style="background: rgba(15, 23, 42, 0.5); padding: 0.65rem 0.85rem; border-radius: 0.5rem;">
                            <strong style="color: #cbd5e1; display: block; margin-bottom: 0.15rem;">🏷️ Inflation Benchmark</strong>
                            2.8% per annum historical long-term US CPI.
                        </div>
                        <div style="background: rgba(15, 23, 42, 0.5); padding: 0.65rem 0.85rem; border-radius: 0.5rem;">
                            <strong style="color: #cbd5e1; display: block; margin-bottom: 0.15rem;">⏳ Longevity Horizon</strong>
                            Modeled conservative life expectancy through Age 95.
                        </div>
                        <div style="background: rgba(15, 23, 42, 0.5); padding: 0.65rem 0.85rem; border-radius: 0.5rem;">
                            <strong style="color: #cbd5e1; display: block; margin-bottom: 0.15rem;">💼 Bucket Allocation</strong>
                            60% Pre-tax, 25% Roth, 10% Taxable Brokerage, 5% Cash Cushion.
                        </div>
                        <div style="background: rgba(15, 23, 42, 0.5); padding: 0.65rem 0.85rem; border-radius: 0.5rem;">
                            <strong style="color: #cbd5e1; display: block; margin-bottom: 0.15rem;">📉 Blanchett Spending Smile</strong>
                            Standard lifestyle smile (100% early, 90% mid, 85% late retirement).
                        </div>
                    </div>
                `
                        : ''
                }
            </div>
        `;
    }

    /**
     * Renders optional Phase 2 collapsible drawer: "A Little Deeper" (Mockup 4).
     * @returns {string} Phase 2 drawer HTML.
     */
    _renderDeeperDrawer() {
        const arrowChar = this._isDeeperOpen ? '▴' : '▾';

        return `
            <div style="background: rgba(30, 41, 59, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 0.75rem; margin-bottom: 1.5rem; overflow: hidden;">
                <button type="button" class="btn-toggle-deeper"
                    style="width: 100%; padding: 0.85rem 1.25rem; background: transparent; border: none; color: #cbd5e1; font-weight: 600; font-size: 0.86rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <span style="display: flex; align-items: center; gap: 0.5rem;">
                        <span>➕</span> A Little Deeper: Household & Housing (Optional)
                    </span>
                    <span style="color: #94a3b8;">${arrowChar}</span>
                </button>

                ${
                    this._isDeeperOpen
                        ? `
                    <div style="padding: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.06); display: flex; flex-direction: column; gap: 1.25rem;">
                        ${this._renderHouseholdOptions()}
                        ${this._renderHousingOptions()}
                        ${this._renderAssetBuckets()}
                    </div>
                `
                        : ''
                }
            </div>
        `;
    }

    /**
     * Renders household makeup selectors (Single vs Married).
     * @returns {string} Household options HTML.
     */
    _renderHouseholdOptions() {
        const isSingle = this._formData.filingStatus === FILING_SINGLE;

        return `
            <div>
                <label style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.5rem;">
                    Household Structure
                </label>
                <div style="display: flex; gap: 1rem;">
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #e2e8f0; cursor: pointer;">
                        <input type="radio" name="expr-filing" value="${FILING_SINGLE}" ${isSingle ? 'checked' : ''}>
                        Single Filer
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #e2e8f0; cursor: pointer;">
                        <input type="radio" name="expr-filing" value="${FILING_MARRIED}" ${!isSingle ? 'checked' : ''}>
                        Married / Couple Filing Jointly
                    </label>
                </div>
            </div>
        `;
    }

    /**
     * Renders housing status selectors and dynamic inputs (Rent vs Own).
     * @returns {string} Housing options HTML.
     */
    _renderHousingOptions() {
        const isRent = this._formData.housingStatus === HOUSING_RENT;

        return `
            <div>
                <label style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.5rem;">
                    Housing Situation
                </label>
                <div style="display: flex; gap: 1rem; margin-bottom: 0.75rem;">
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #e2e8f0; cursor: pointer;">
                        <input type="radio" name="expr-housing" value="${HOUSING_RENT}" ${isRent ? 'checked' : ''}>
                        Renting
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #e2e8f0; cursor: pointer;">
                        <input type="radio" name="expr-housing" value="${HOUSING_OWN}" ${!isRent ? 'checked' : ''}>
                        Homeowner
                    </label>
                </div>

                ${
                    isRent
                        ? `
                    <div style="max-width: 280px;">
                        <label for="expr-rent" style="display: block; font-size: 0.78rem; color: #94a3b8; margin-bottom: 0.25rem;">Monthly Rent ($/mo)</label>
                        <input type="number" id="expr-rent" value="${escapeHtml(this._formData.monthlyRent)}"
                            style="width: 100%; padding: 0.5rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.375rem; color: #fff; font-size: 0.85rem;">
                    </div>
                `
                        : `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                        <div>
                            <label for="expr-home-value" style="display: block; font-size: 0.78rem; color: #94a3b8; margin-bottom: 0.25rem;">Home Market Value ($)</label>
                            <input type="number" id="expr-home-value" value="${escapeHtml(this._formData.homeValue)}"
                                style="width: 100%; padding: 0.5rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.375rem; color: #fff; font-size: 0.85rem;">
                        </div>
                        <div>
                            <label for="expr-mortgage-bal" style="display: block; font-size: 0.78rem; color: #94a3b8; margin-bottom: 0.25rem;">Remaining Mortgage Balance ($)</label>
                            <input type="number" id="expr-mortgage-bal" value="${escapeHtml(this._formData.mortgageBalance)}"
                                style="width: 100%; padding: 0.5rem; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.375rem; color: #fff; font-size: 0.85rem;">
                        </div>
                    </div>
                `
                }
            </div>
        `;
    }

    /**
     * Renders 4-bucket portfolio percentage allocation inputs.
     * @returns {string} Buckets HTML.
     */
    _renderAssetBuckets() {
        const totalPort = this._formData.portfolio;
        const bucketsObj = this._formData.buckets;

        return `
            <div>
                <label style="display: block; font-size: 0.82rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.5rem;">
                    Quick Asset Split (% of Total Portfolio)
                </label>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem;">
                    <div style="background: rgba(15, 23, 42, 0.6); padding: 0.65rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="font-size: 0.75rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.25rem;">Pre-Tax 401(k)/IRA</div>
                        <input type="number" id="expr-bucket-pretax" min="0" max="100" value="${escapeHtml(bucketsObj.preTaxPct)}"
                            style="width: 70px; padding: 0.3rem 0.5rem; background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.25rem; color: #fff; font-size: 0.82rem;"> %
                        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">${formatDollar(totalPort * (bucketsObj.preTaxPct / PERCENT_SCALE))}</div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.6); padding: 0.65rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="font-size: 0.75rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.25rem;">Roth IRA / 401(k)</div>
                        <input type="number" id="expr-bucket-roth" min="0" max="100" value="${escapeHtml(bucketsObj.rothPct)}"
                            style="width: 70px; padding: 0.3rem 0.5rem; background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.25rem; color: #fff; font-size: 0.82rem;"> %
                        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">${formatDollar(totalPort * (bucketsObj.rothPct / PERCENT_SCALE))}</div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.6); padding: 0.65rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="font-size: 0.75rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.25rem;">Taxable Brokerage</div>
                        <input type="number" id="expr-bucket-taxable" min="0" max="100" value="${escapeHtml(bucketsObj.taxablePct)}"
                            style="width: 70px; padding: 0.3rem 0.5rem; background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.25rem; color: #fff; font-size: 0.82rem;"> %
                        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">${formatDollar(totalPort * (bucketsObj.taxablePct / PERCENT_SCALE))}</div>
                    </div>

                    <div style="background: rgba(15, 23, 42, 0.6); padding: 0.65rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.08);">
                        <div style="font-size: 0.75rem; color: #cbd5e1; font-weight: 600; margin-bottom: 0.25rem;">Cash & Emergency</div>
                        <input type="number" id="expr-bucket-cash" min="0" max="100" value="${escapeHtml(bucketsObj.cashPct)}"
                            style="width: 70px; padding: 0.3rem 0.5rem; background: #1e293b; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 0.25rem; color: #fff; font-size: 0.82rem;"> %
                        <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">${formatDollar(totalPort * (bucketsObj.cashPct / PERCENT_SCALE))}</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renders bottom action buttons.
     * @returns {string} Actions HTML.
     */
    _renderFooterActions() {
        return `
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 1.25rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
                <button type="button" class="btn btn-secondary btn-skip-express"
                    style="padding: 0.6rem 1rem; background: transparent; border: 1px solid rgba(255, 255, 255, 0.15); color: #94a3b8; border-radius: 0.5rem; cursor: pointer; font-size: 0.88rem;">
                    Close / Skip
                </button>

                <div style="display: flex; gap: 0.75rem;">
                    <button type="button" class="btn btn-secondary btn-calc-express"
                        style="padding: 0.65rem 1.15rem; background: #1e293b; border: 1px solid rgba(99, 102, 241, 0.4); color: #c7d2fe; font-weight: 600; border-radius: 0.5rem; cursor: pointer; font-size: 0.88rem; display: inline-flex; align-items: center; gap: 0.35rem;">
                        <span>⚡</span> Calculate My Numbers
                    </button>

                    <button type="button" class="btn btn-primary btn-finish-express"
                        style="padding: 0.65rem 1.4rem; background: #6366f1; color: #ffffff; font-weight: 700; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 0.92rem; display: inline-flex; align-items: center; gap: 0.45rem; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);">
                        Launch Full Dashboard →
                    </button>
                </div>
            </div>
        `;
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('express-onboarding-modal')) {
    customElements.define('express-onboarding-modal', ExpressOnboardingModal);
}
