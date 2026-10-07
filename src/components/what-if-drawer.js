/**
 * What-If Sandbox Drawer Web Component
 *
 * Provides an interactive, slide-out sandbox for rapid life-decision modeling:
 * - Retire Early (interactive retirement age sliders with instant graph updates)
 * - Change Expenses (bi-directional adjustments with live monthly budget calculation)
 * - Fund Kids' College (HS graduation funding goal, projected 529 growth, required monthly contribution)
 * - Access Equity (longevity excess wealth diagnostic & reverse mortgage credit line)
 * - Increase Savings (401(k) and brokerage contribution boosters)
 *
 * All layout dimensions use rem units for responsive adaptability across viewports.
 *
 * > Written with the assistance of Google Gemini
 */

import { BaseComponent } from './base-component.js';
import { getState, updateState } from '../services/state.js';
import { SimulationEngine } from '../services/SimulationEngine.js';
import { escapeHtml } from '../utils/sanitize.js';

export class WhatIfDrawer extends BaseComponent {
    constructor() {
        super();
        this.isOpen = false;
        this.expenseAdjustmentPercent = 0;
        this.customSavingsBoostMonthly = 0;
    }

    open() {
        this.isOpen = true;
        if (typeof document !== 'undefined') {
            document.body.classList.add('what-if-open');
        }
        this.render();
        if (typeof window !== 'undefined') {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
            setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
        }
    }

    close() {
        this.isOpen = false;
        if (typeof document !== 'undefined') {
            document.body.classList.remove('what-if-open');
        }
        this.render();
        if (typeof window !== 'undefined') {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
            setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    render() {
        super.render();
        this.afterRender();
    }

    getTemplate() {
        const state = getState();
        const s1 = state.primarySpouse || {};
        const s2 = state.secondarySpouse || {};
        const currentYear = state.currentYear || new Date().getFullYear();
        const hasS2 = Boolean(s2.name || s2.yearOfBirth);

        // Run diagnostic simulation to evaluate equity / longevity health
        let simulationSummary = { hasShortfalls: false, shortfallYearsCount: 0, endingWealth: 0, maxAge: 88 };
        try {
            const engine = new SimulationEngine(state);
            const { data } = engine.run();
            if (data && data.length > 0) {
                const shortfalls = data.filter(d => (d.unfundedShortfall || 0) > 0);
                simulationSummary.hasShortfalls = shortfalls.length > 0;
                simulationSummary.shortfallYearsCount = shortfalls.length;
                const endSnap = data[data.length - 1];
                const liquidKeys = [
                    's1Brokerage', 's2Brokerage', 's1Hysa', 's2Hysa',
                    's1RothIra', 's2RothIra', 's1Trad401k', 's2Trad401k',
                    's1Trad403b', 's2Trad403b', 's1StandardIra', 's2StandardIra', 'cashCushion'
                ];
                const balances = endSnap.balances || {};
                const endLiquid = liquidKeys.reduce((sum, k) => sum + (balances[k] || 0), 0);
                const endHome = balances.primaryResidenceEquity || 0;
                simulationSummary.endingWealth = endLiquid + endHome;
                simulationSummary.maxAge = endSnap.agePrimary || 88;
            }
        } catch {
            // Fallback gracefully
        }

        // Compute baseline monthly budget
        const phaseExpenses = state.phaseBasedExpensesPerMonth || {};
        const baselineMonthly = Number(phaseExpenses.preTeens || phaseExpenses.teenagers || phaseExpenses.preRetirementNoKids || 6000);
        const adjustedMonthly = Math.round(baselineMonthly * (1 + this.expenseAdjustmentPercent / 100));
        const monthlyDiff = adjustedMonthly - baselineMonthly;

        return `
            <aside class="what-if-dock ${this.isOpen ? 'open' : 'hidden'}" id="what-if-modal" aria-label="What-If Scenario Sandbox">
                
                <!-- Header -->
                <div class="what-if-header">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.3rem;">🔮</span>
                        <div>
                            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: #fff;">What If? Sandbox</h3>
                            <span class="what-if-wip-pill">WIP EXPERIMENTAL</span>
                        </div>
                    </div>
                    <button type="button" class="btn-close-whatif" title="Close Drawer" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; padding: 0.2rem 0.5rem; line-height: 1;">&times;</button>
                </div>

                <!-- BIG TOP WARNING BANNER (WIP & PERMANENT UPDATES) -->
                <div class="what-if-warning-banner" role="alert">
                    <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
                        <span style="font-size: 1.4rem; line-height: 1.1;">⚠️</span>
                        <div>
                            <strong style="display: block; font-size: 0.85rem; color: #fde047; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">
                                Work In Progress (WIP)
                            </strong>
                            <p style="margin: 0; font-size: 0.8rem; line-height: 1.35; color: #fef08a;">
                                <strong>Permanent Changes:</strong> Updates made in What If? are <u>permanent</u> and save directly to your active profile, exactly as if edited in Settings.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Scrollable Content Container -->
                <div class="what-if-body">

                    <!-- LEVER 1: RETIRE EARLY -->
                    <div class="what-if-section">
                        <div class="what-if-section-header">
                            <span class="what-if-section-icon">🏖️</span>
                            <h4>Retire Early</h4>
                        </div>
                        <p class="what-if-section-desc">Test retiring earlier or later to immediately view portfolio longevity impact on the timeline graph.</p>

                        <!-- Primary Spouse -->
                        <div class="what-if-control-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-color);">
                                    ${escapeHtml(s1.name || 'Primary Spouse')} Retirement Age:
                                </label>
                                <span class="what-if-value-badge" id="lbl-s1-retire-age">Age ${s1.targetRetirementAge || 62}</span>
                            </div>
                            <input type="range" class="what-if-slider" id="slider-s1-retire-age" 
                                min="${s1.yearOfBirth ? Math.max(40, currentYear - s1.yearOfBirth) : 40}" 
                                max="72" 
                                value="${s1.targetRetirementAge || 62}" 
                                step="1">
                            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">
                                <span>Earlier (40)</span>
                                <span>Retire in Year ${s1.yearOfBirth ? s1.yearOfBirth + (s1.targetRetirementAge || 62) : 2043}</span>
                                <span>Later (72)</span>
                            </div>
                        </div>

                        <!-- Secondary Spouse (if active) -->
                        ${hasS2 ? `
                        <div class="what-if-control-group" style="margin-top: 0.75rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-color);">
                                    ${escapeHtml(s2.name || 'Secondary Spouse')} Retirement Age:
                                </label>
                                <span class="what-if-value-badge" id="lbl-s2-retire-age">Age ${s2.targetRetirementAge || 62}</span>
                            </div>
                            <input type="range" class="what-if-slider" id="slider-s2-retire-age" 
                                min="${s2.yearOfBirth ? Math.max(40, currentYear - s2.yearOfBirth) : 40}" 
                                max="72" 
                                value="${s2.targetRetirementAge || 62}" 
                                step="1">
                            <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">
                                <span>Earlier (40)</span>
                                <span>Retire in Year ${s2.yearOfBirth ? s2.yearOfBirth + (s2.targetRetirementAge || 62) : 2047}</span>
                                <span>Later (72)</span>
                            </div>
                        </div>
                        ` : ''}
                    </div>

                    <!-- LEVER 2: CHANGE EXPENSES -->
                    <div class="what-if-section">
                        <div class="what-if-section-header">
                            <span class="what-if-section-icon">📉</span>
                            <h4>Change Expenses</h4>
                        </div>
                        <p class="what-if-section-desc">Adjust monthly living expenses up or down to test leaner living or lifestyle expansion.</p>

                        <!-- Quick Percentage Chips -->
                        <div class="what-if-chips-row">
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === -20 ? 'active' : ''}" data-expense="-20">-20%</button>
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === -10 ? 'active' : ''}" data-expense="-10">-10%</button>
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === -5 ? 'active' : ''}" data-expense="-5">-5%</button>
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === 0 ? 'active' : ''}" data-expense="0">Baseline</button>
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === 5 ? 'active' : ''}" data-expense="5">+5%</button>
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === 10 ? 'active' : ''}" data-expense="10">+10%</button>
                            <button type="button" class="what-if-chip ${this.expenseAdjustmentPercent === 20 ? 'active' : ''}" data-expense="20">+20%</button>
                        </div>

                        <!-- Budget Comparison Readout -->
                        <div class="what-if-budget-card">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.8rem;">
                                <span style="color: var(--text-muted);">Current Budget:</span>
                                <span style="font-weight: 600;">$${baselineMonthly.toLocaleString()}/mo</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                                <span style="font-size: 0.8rem; font-weight: 600; color: ${this.expenseAdjustmentPercent < 0 ? '#34d399' : (this.expenseAdjustmentPercent > 0 ? '#f87171' : 'var(--text-color)')};">
                                    New Projected Budget:
                                </span>
                                <span style="font-size: 1rem; font-weight: 700; color: ${this.expenseAdjustmentPercent < 0 ? '#34d399' : (this.expenseAdjustmentPercent > 0 ? '#f87171' : 'var(--text-color)')};">
                                    $${adjustedMonthly.toLocaleString()}/mo
                                </span>
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-muted); text-align: right;">
                                ${monthlyDiff !== 0 ? `${monthlyDiff > 0 ? '+' : ''}$${monthlyDiff.toLocaleString()}/mo (${this.expenseAdjustmentPercent > 0 ? '+' : ''}${this.expenseAdjustmentPercent}%)` : 'No adjustment'}
                            </div>
                        </div>

                        ${this.expenseAdjustmentPercent !== 0 ? `
                        <button type="button" id="btn-apply-expense-change" class="btn btn-primary" style="width: 100%; margin-top: 0.6rem; font-size: 0.8rem; padding: 0.45rem;">
                            Apply ${this.expenseAdjustmentPercent > 0 ? '+' : ''}${this.expenseAdjustmentPercent}% to Profile
                        </button>
                        ` : ''}
                    </div>

                    <!-- LEVER 3: FUND KIDS' COLLEGE -->
                    <div class="what-if-section">
                        <div class="what-if-section-header">
                            <span class="what-if-section-icon">🎓</span>
                            <h4>Fund Kids' College</h4>
                        </div>
                        <p class="what-if-section-desc">Target a dedicated education fund by high school graduation (Age 18) for each child.</p>

                        ${(state.dependents || []).length === 0 ? `
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0;">No children currently configured in this profile.</p>
                        ` : (state.dependents || []).map((child, idx) => {
                            const birthYear = child.yearOfBirth || (currentYear - 10);
                            const hsGradYear = birthYear + 18;
                            const yearsLeft = Math.max(0, hsGradYear - currentYear);
                            const current529 = Number(child.currentCollegeSavingsBalance || 0);
                            const annualTuition = Number(child.annualCollegeCost || 15000);
                            const targetFund = annualTuition * 4; // 4-year degree target
                            const returnRate = (child.expectedReturn !== undefined ? Number(child.expectedReturn) : 6) / 100;
                            
                            // Future value of existing 529 at graduation
                            const projectedExisting = Math.round(current529 * Math.pow(1 + returnRate, yearsLeft));
                            const gap = Math.max(0, targetFund - projectedExisting);
                            
                            // PMT calculation for monthly contribution needed to bridge gap
                            const monthlyRate = returnRate / 12;
                            const totalMonths = yearsLeft * 12;
                            let requiredMonthly = 0;
                            if (gap > 0 && totalMonths > 0) {
                                requiredMonthly = Math.round(gap * monthlyRate / (Math.pow(1 + monthlyRate, totalMonths) - 1));
                            }

                            return `
                            <div class="what-if-child-card" data-child-idx="${idx}">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                    <strong style="font-size: 0.85rem; color: #fff;">${escapeHtml(child.name || `Child ${idx + 1}`)}</strong>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">HS Grad: ${hsGradYear} (${yearsLeft} yrs)</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.2rem;">
                                    <span style="color: var(--text-muted);">Current 529 Balance:</span>
                                    <span>$${current529.toLocaleString()}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.2rem;">
                                    <span style="color: var(--text-muted);">Projected at Age 18:</span>
                                    <span style="color: ${projectedExisting >= targetFund ? '#34d399' : '#fde047'}; font-weight: 600;">$${projectedExisting.toLocaleString()}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.4rem;">
                                    <span style="color: var(--text-muted);">4-Year College Target:</span>
                                    <span style="font-weight: 600;">$${targetFund.toLocaleString()}</span>
                                </div>
                                
                                <div class="what-if-college-status ${gap === 0 ? 'funded' : 'gap'}">
                                    ${gap === 0 ? `
                                        <span>🟢 Fully Funded by HS Graduation</span>
                                    ` : `
                                        <span>⚠️ Gap: $${gap.toLocaleString()} ➔ Save <strong>$${requiredMonthly.toLocaleString()}/mo</strong></span>
                                    `}
                                </div>

                                <div style="display: flex; gap: 0.4rem; margin-top: 0.5rem;">
                                    <button type="button" class="btn-boost-529 btn btn-secondary" data-child-idx="${idx}" data-amount="5000" style="flex: 1; font-size: 0.72rem; padding: 0.3rem;">+$5k to 529</button>
                                    <button type="button" class="btn-boost-529 btn btn-secondary" data-child-idx="${idx}" data-amount="10000" style="flex: 1; font-size: 0.72rem; padding: 0.3rem;">+$10k to 529</button>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>

                    <!-- LEVER 4: ACCESS EQUITY -->
                    <div class="what-if-section">
                        <div class="what-if-section-header">
                            <span class="what-if-section-icon">🏡</span>
                            <h4>Access Equity</h4>
                        </div>
                        <p class="what-if-section-desc">Assess your retirement longevity and explore home equity backup lines.</p>

                        <!-- Longevity Diagnostic Status Card -->
                        <div class="what-if-diagnostic-card ${simulationSummary.hasShortfalls ? 'warning' : 'healthy'}">
                            <div style="font-size: 1.1rem; line-height: 1;">${simulationSummary.hasShortfalls ? '⚠️' : '🟢'}</div>
                            <div>
                                <strong style="display: block; font-size: 0.82rem; margin-bottom: 0.2rem;">
                                    ${simulationSummary.hasShortfalls ? 'Caution: Deficit Years Detected' : 'Healthy Longevity: Slated for Excess Wealth'}
                                </strong>
                                <p style="margin: 0; font-size: 0.76rem; line-height: 1.35;">
                                    ${simulationSummary.hasShortfalls ? 
                                        `Your plan experiences ${simulationSummary.shortfallYearsCount} shortfall year(s). Unlocking home equity can bridge this gap.` : 
                                        `Your plan successfully funds retirement through age ${simulationSummary.maxAge} with ~$${Math.round(simulationSummary.endingWealth).toLocaleString()} remaining.`}
                                </p>
                            </div>
                        </div>

                        <!-- Reverse Mortgage Toggle -->
                        <div style="margin-top: 0.75rem; padding: 0.6rem; background: rgba(255,255,255,0.03); border-radius: 0.35rem; border: 1px solid var(--border);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <label style="font-size: 0.82rem; font-weight: 600; display: block; color: var(--text-color);">Reverse Mortgage Line</label>
                                    <span style="font-size: 0.72rem; color: var(--text-muted);">Standby equity credit line</span>
                                </div>
                                <input type="checkbox" id="chk-reverse-mortgage" ${state.primaryResidenceEquity?.reverseMortgageEnabled ? 'checked' : ''} style="cursor: pointer; transform: scale(1.15);">
                            </div>
                            ${state.primaryResidenceEquity?.reverseMortgageEnabled ? `
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.6rem; font-size: 0.78rem;">
                                <label style="color: var(--text-muted);">Claiming Start Age:</label>
                                <select id="sel-reverse-mortgage-age" style="padding: 0.2rem 0.4rem; font-size: 0.78rem; background: var(--bg-dark); color: #fff; border: 1px solid var(--border); border-radius: 4px;">
                                    <option value="62" ${state.primaryResidenceEquity?.reverseMortgageStartAge === 62 ? 'selected' : ''}>Age 62</option>
                                    <option value="65" ${(state.primaryResidenceEquity?.reverseMortgageStartAge || 65) === 65 ? 'selected' : ''}>Age 65</option>
                                    <option value="68" ${state.primaryResidenceEquity?.reverseMortgageStartAge === 68 ? 'selected' : ''}>Age 68</option>
                                    <option value="70" ${state.primaryResidenceEquity?.reverseMortgageStartAge === 70 ? 'selected' : ''}>Age 70</option>
                                </select>
                            </div>
                            ` : ''}
                        </div>
                    </div>

                    <!-- LEVER 5: INCREASE SAVINGS -->
                    <div class="what-if-section">
                        <div class="what-if-section-header">
                            <span class="what-if-section-icon">💰</span>
                            <h4>Increase Savings</h4>
                        </div>
                        <p class="what-if-section-desc">Boost payroll 401(k) deferrals or add systematic monthly brokerage contributions.</p>

                        <!-- Primary Spouse 401(k) Deferral -->
                        ${(s1.jobs || []).length > 0 ? `
                        <div class="what-if-control-group">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                                <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-color);">
                                    ${escapeHtml(s1.name || 'Primary')} 401(k) Contribution:
                                </label>
                                <span class="what-if-value-badge" id="lbl-s1-contrib-pct">${s1.jobs[0].employeeContributionPercent || 10}%</span>
                            </div>
                            <input type="range" class="what-if-slider" id="slider-s1-contrib-pct" 
                                min="0" max="25" value="${s1.jobs[0].employeeContributionPercent || 10}" step="1">
                        </div>
                        ` : ''}

                        <!-- Monthly Brokerage Savings Booster -->
                        <div class="what-if-control-group" style="margin-top: 0.75rem;">
                            <label style="font-size: 0.82rem; font-weight: 600; display: block; margin-bottom: 0.35rem; color: var(--text-color);">
                                Boost Taxable Savings ($/mo):
                            </label>
                            <div style="display: flex; gap: 0.35rem;">
                                <button type="button" class="btn-boost-savings what-if-chip" data-boost="250">+$250/mo</button>
                                <button type="button" class="btn-boost-savings what-if-chip" data-boost="500">+$500/mo</button>
                                <button type="button" class="btn-boost-savings what-if-chip" data-boost="1000">+$1k/mo</button>
                            </div>
                            <p style="font-size: 0.72rem; color: var(--text-muted); margin: 0.35rem 0 0 0;">
                                +$500/mo invested at 7% adds ~$86,500 after 10 years.
                            </p>
                        </div>
                    </div>

                </div>
            </aside>
        `;
    }

    afterRender() {
        // Close button handler
        const btnClose = this.querySelector('.btn-close-whatif');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.close());
        }

        // Keyboard ESC handler
        if (!this._escBound) {
            this._escBound = true;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }

        // LEVER 1: Retire Early
        const s1Slider = this.querySelector('#slider-s1-retire-age');
        if (s1Slider) {
            s1Slider.addEventListener('input', (e) => {
                const val = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s1-retire-age');
                if (lbl) lbl.textContent = `Age ${val}`;
                this._mutateRetirementAge('primarySpouse', val);
            });
        }

        const s2Slider = this.querySelector('#slider-s2-retire-age');
        if (s2Slider) {
            s2Slider.addEventListener('input', (e) => {
                const val = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s2-retire-age');
                if (lbl) lbl.textContent = `Age ${val}`;
                this._mutateRetirementAge('secondarySpouse', val);
            });
        }

        // LEVER 2: Change Expenses chips
        this.querySelectorAll('.what-if-chips-row .what-if-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const pct = Number(btn.getAttribute('data-expense'));
                this.expenseAdjustmentPercent = pct;
                this.render();
            });
        });

        const btnApplyExpense = this.querySelector('#btn-apply-expense-change');
        if (btnApplyExpense) {
            btnApplyExpense.addEventListener('click', () => {
                this._applyExpenseAdjustment(this.expenseAdjustmentPercent);
                this.expenseAdjustmentPercent = 0;
                this.render();
            });
        }

        // LEVER 3: 529 Boosters
        this.querySelectorAll('.btn-boost-529').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-child-idx'));
                const amt = Number(btn.getAttribute('data-amount'));
                this._boostChild529(idx, amt);
            });
        });

        // LEVER 4: Access Equity
        const chkReverse = this.querySelector('#chk-reverse-mortgage');
        if (chkReverse) {
            chkReverse.addEventListener('change', (e) => {
                const state = getState();
                if (!state.primaryResidenceEquity) state.primaryResidenceEquity = {};
                state.primaryResidenceEquity.reverseMortgageEnabled = e.target.checked;
                updateState(state);
                document.dispatchEvent(new CustomEvent('state-updated'));
                this.render();
            });
        }

        const selReverseAge = this.querySelector('#sel-reverse-mortgage-age');
        if (selReverseAge) {
            selReverseAge.addEventListener('change', (e) => {
                const state = getState();
                if (!state.primaryResidenceEquity) state.primaryResidenceEquity = {};
                state.primaryResidenceEquity.reverseMortgageStartAge = Number(e.target.value);
                updateState(state);
                document.dispatchEvent(new CustomEvent('state-updated'));
            });
        }

        // LEVER 5: 401(k) Deferral
        const s1ContribSlider = this.querySelector('#slider-s1-contrib-pct');
        if (s1ContribSlider) {
            s1ContribSlider.addEventListener('input', (e) => {
                const val = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s1-contrib-pct');
                if (lbl) lbl.textContent = `${val}%`;
                const state = getState();
                if (state.primarySpouse?.jobs?.[0]) {
                    state.primarySpouse.jobs[0].employeeContributionPercent = val;
                    updateState(state);
                    document.dispatchEvent(new CustomEvent('state-updated'));
                }
            });
        }

        // Savings Boosters
        this.querySelectorAll('.btn-boost-savings').forEach(btn => {
            btn.addEventListener('click', () => {
                const boost = Number(btn.getAttribute('data-boost'));
                this._boostBrokerageSavings(boost);
            });
        });
    }

    _mutateRetirementAge(spouseKey, age) {
        const state = getState();
        if (state[spouseKey]) {
            state[spouseKey].targetRetirementAge = age;
            if (state[spouseKey].yearOfBirth) {
                state[spouseKey].targetRetirementDate = `${state[spouseKey].yearOfBirth + age}-01`;
            }
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
            }
        }
    }

    _applyExpenseAdjustment(percent) {
        const state = getState();
        if (state.phaseBasedExpensesPerMonth) {
            const multiplier = 1 + percent / 100;
            for (const key of Object.keys(state.phaseBasedExpensesPerMonth)) {
                state.phaseBasedExpensesPerMonth[key] = Math.round(state.phaseBasedExpensesPerMonth[key] * multiplier);
            }
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
            }
        }
    }

    _boostChild529(childIndex, amount) {
        const state = getState();
        if (state.dependents?.[childIndex]) {
            const cur = Number(state.dependents[childIndex].currentCollegeSavingsBalance || 0);
            state.dependents[childIndex].currentCollegeSavingsBalance = cur + amount;
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
                this.render();
            }
        }
    }

    _boostBrokerageSavings(monthlyAmount) {
        const state = getState();
        // Boost existing brokerage starting balance or primary account
        const brokerage = state.primarySpouse?.accounts?.find(a => a.type === 'taxableBrokerage') || state.primarySpouse?.accounts?.[0];
        if (brokerage) {
            brokerage.balance = Math.round(brokerage.balance + (monthlyAmount * 12));
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
                this.render();
            }
        }
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('what-if-drawer')) {
    customElements.define('what-if-drawer', WhatIfDrawer);
}
