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

    _computeDiagnosticSummary(state) {
        const simulationSummary = { hasShortfalls: false, shortfallYearsCount: 0, endingWealth: 0, maxAge: 88 };
        try {
            const engine = new SimulationEngine(state);
            const { data } = engine.run();
            if (data && data.length > 0) {
                const shortfalls = data.filter((snap) => (snap.unfundedShortfall || 0) > 0);
                simulationSummary.hasShortfalls = shortfalls.length > 0;
                simulationSummary.shortfallYearsCount = shortfalls.length;
                const endSnap = data[data.length - 1];
                const liquidKeys = [
                    's1Brokerage',
                    's2Brokerage',
                    's1Hysa',
                    's2Hysa',
                    's1RothIra',
                    's2RothIra',
                    's1Trad401k',
                    's2Trad401k',
                    's1Trad403b',
                    's2Trad403b',
                    's1StandardIra',
                    's2StandardIra',
                    'cashCushion'
                ];
                const balances = endSnap.balances || {};
                const endLiquid = liquidKeys.reduce((sum, keyName) => sum + (balances[keyName] || 0), 0);
                const endHome = balances.primaryResidenceEquity || 0;
                simulationSummary.endingWealth = endLiquid + endHome;
                simulationSummary.maxAge = endSnap.agePrimary || 88;
            }
        } catch {
            // Fallback gracefully
        }
        return simulationSummary;
    }

    _renderSpouseRetirementSlider(sliderConfig) {
        const { spouseObj, defaultLabel, badgeId, sliderId, currentYear, fallbackYear, marginTop } = sliderConfig;
        const retAge = spouseObj.targetRetirementAge || 62;
        const minAge = spouseObj.yearOfBirth ? Math.max(40, currentYear - spouseObj.yearOfBirth) : 40;
        const retYear = spouseObj.yearOfBirth ? spouseObj.yearOfBirth + retAge : fallbackYear;
        const styleAttr = marginTop ? ` style="margin-top: ${marginTop};"` : '';
        return `
            <div class="what-if-control-group"${styleAttr}>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                    <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-color);">
                        ${escapeHtml(spouseObj.name || defaultLabel)} Retirement Age:
                    </label>
                    <span class="what-if-value-badge" id="${badgeId}">Age ${retAge}</span>
                </div>
                <input type="range" class="what-if-slider" id="${sliderId}" 
                    min="${minAge}" 
                    max="72" 
                    value="${retAge}" 
                    step="1">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem;">
                    <span>Earlier (40)</span>
                    <span>Retire in Year ${retYear}</span>
                    <span>Later (72)</span>
                </div>
            </div>
        `;
    }

    _renderRetireEarlySection(s1, s2, hasS2, currentYear) {
        const s1Slider = this._renderSpouseRetirementSlider({
            spouseObj: s1,
            defaultLabel: 'Primary Spouse',
            badgeId: 'lbl-s1-retire-age',
            sliderId: 'slider-s1-retire-age',
            currentYear,
            fallbackYear: 2043,
            marginTop: ''
        });
        const s2Slider = hasS2
            ? this._renderSpouseRetirementSlider({
                  spouseObj: s2,
                  defaultLabel: 'Secondary Spouse',
                  badgeId: 'lbl-s2-retire-age',
                  sliderId: 'slider-s2-retire-age',
                  currentYear,
                  fallbackYear: 2047,
                  marginTop: '0.75rem'
              })
            : '';
        return `
            <div class="what-if-section">
                <div class="what-if-section-header">
                    <span class="what-if-section-icon">🏖️</span>
                    <h4>Retire Early</h4>
                </div>
                <p class="what-if-section-desc">Test retiring earlier or later to immediately view portfolio longevity impact on the timeline graph.</p>
                ${s1Slider}
                ${s2Slider}
            </div>
        `;
    }

    _renderExpensesSection(state) {
        const phaseExpenses = state.phaseBasedExpensesPerMonth || {};
        const baselineMonthly = Number(
            phaseExpenses.preTeens || phaseExpenses.teenagers || phaseExpenses.preRetirementNoKids || 6000
        );
        const adjustedMonthly = Math.round(baselineMonthly * (1 + this.expenseAdjustmentPercent / 100));
        const monthlyDiff = adjustedMonthly - baselineMonthly;
        const pct = this.expenseAdjustmentPercent;
        const projColor = pct < 0 ? '#34d399' : pct > 0 ? '#f87171' : 'var(--text-color)';
        const chipLevels = [-20, -10, -5, 0, 5, 10, 20];
        const chipsHtml = chipLevels
            .map((lvl) => {
                const lbl = lvl === 0 ? 'Baseline' : `${lvl > 0 ? '+' : ''}${lvl}%`;
                return `<button type="button" class="what-if-chip ${pct === lvl ? 'active' : ''}" data-expense="${lvl}">${lbl}</button>`;
            })
            .join('');
        const diffLabel =
            monthlyDiff !== 0
                ? `${monthlyDiff > 0 ? '+' : ''}$${monthlyDiff.toLocaleString()}/mo (${pct > 0 ? '+' : ''}${pct}%)`
                : 'No adjustment';

        return `
            <div class="what-if-section">
                <div class="what-if-section-header">
                    <span class="what-if-section-icon">📉</span>
                    <h4>Change Expenses</h4>
                </div>
                <p class="what-if-section-desc">Adjust monthly living expenses up or down to test leaner living or lifestyle expansion.</p>
                <div class="what-if-chips-row">${chipsHtml}</div>
                <div class="what-if-budget-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.8rem;">
                        <span style="color: var(--text-muted);">Current Budget:</span>
                        <span style="font-weight: 600;">$${baselineMonthly.toLocaleString()}/mo</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <span style="font-size: 0.8rem; font-weight: 600; color: ${projColor};">New Projected Budget:</span>
                        <span style="font-size: 1rem; font-weight: 700; color: ${projColor};">$${adjustedMonthly.toLocaleString()}/mo</span>
                    </div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); text-align: right;">${diffLabel}</div>
                </div>
                ${
                    pct !== 0
                        ? `<button type="button" id="btn-apply-expense-change" class="btn btn-primary" style="width: 100%; margin-top: 0.6rem; font-size: 0.8rem; padding: 0.45rem;">Apply ${pct > 0 ? '+' : ''}${pct}% to Profile</button>`
                        : ''
                }
            </div>
        `;
    }

    _renderChildCollegeCard(child, idx, currentYear) {
        const birthYear = child.yearOfBirth || currentYear - 10;
        const hsGradYear = birthYear + 18;
        const yearsLeft = Math.max(0, hsGradYear - currentYear);
        const current529 = Number(child.currentCollegeSavingsBalance || 0);
        const annualTuition = Number(child.annualCollegeCost || 15000);
        const targetFund = annualTuition * 4;
        const returnRate = (child.expectedReturn !== undefined ? Number(child.expectedReturn) : 6) / 100;
        const projectedExisting = Math.round(current529 * Math.pow(1 + returnRate, yearsLeft));
        const gap = Math.max(0, targetFund - projectedExisting);
        const monthlyRate = returnRate / 12;
        const totalMonths = yearsLeft * 12;
        const requiredMonthly =
            gap > 0 && totalMonths > 0
                ? Math.round((gap * monthlyRate) / (Math.pow(1 + monthlyRate, totalMonths) - 1))
                : 0;
        const statusMarkup =
            gap === 0
                ? `<span>🟢 Fully Funded by HS Graduation</span>`
                : `<span>⚠️ Gap: $${gap.toLocaleString()} ➔ Save <strong>$${requiredMonthly.toLocaleString()}/mo</strong></span>`;

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
                <div class="what-if-college-status ${gap === 0 ? 'funded' : 'gap'}">${statusMarkup}</div>
                <div style="display: flex; gap: 0.4rem; margin-top: 0.5rem;">
                    <button type="button" class="btn-boost-529 btn btn-secondary" data-child-idx="${idx}" data-amount="5000" style="flex: 1; font-size: 0.72rem; padding: 0.3rem;">+$5k to 529</button>
                    <button type="button" class="btn-boost-529 btn btn-secondary" data-child-idx="${idx}" data-amount="10000" style="flex: 1; font-size: 0.72rem; padding: 0.3rem;">+$10k to 529</button>
                </div>
            </div>
        `;
    }

    _renderCollegeSection(state, currentYear) {
        const dependents = state.dependents || [];
        const bodyHtml =
            dependents.length === 0
                ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin: 0.5rem 0;">No children currently configured in this profile.</p>`
                : dependents.map((child, idx) => this._renderChildCollegeCard(child, idx, currentYear)).join('');

        return `
            <div class="what-if-section">
                <div class="what-if-section-header">
                    <span class="what-if-section-icon">🎓</span>
                    <h4>Fund Kids' College</h4>
                </div>
                <p class="what-if-section-desc">Target a dedicated education fund by high school graduation (Age 18) for each child.</p>
                ${bodyHtml}
            </div>
        `;
    }

    _renderReverseMortgageControls(state) {
        const isEnabled = Boolean(state.primaryResidenceEquity?.reverseMortgageEnabled);
        const startAge = state.primaryResidenceEquity?.reverseMortgageStartAge || 65;
        const ageSelectHtml = isEnabled
            ? `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.6rem; font-size: 0.78rem;">
                <label style="color: var(--text-muted);">Claiming Start Age:</label>
                <select id="sel-reverse-mortgage-age" style="padding: 0.2rem 0.4rem; font-size: 0.78rem; background: var(--bg-dark); color: #fff; border: 1px solid var(--border); border-radius: 4px;">
                    <option value="62" ${startAge === 62 ? 'selected' : ''}>Age 62</option>
                    <option value="65" ${startAge === 65 ? 'selected' : ''}>Age 65</option>
                    <option value="68" ${startAge === 68 ? 'selected' : ''}>Age 68</option>
                    <option value="70" ${startAge === 70 ? 'selected' : ''}>Age 70</option>
                </select>
            </div>
            `
            : '';

        return `
            <div style="margin-top: 0.75rem; padding: 0.6rem; background: rgba(255,255,255,0.03); border-radius: 0.35rem; border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <label style="font-size: 0.82rem; font-weight: 600; display: block; color: var(--text-color);">Reverse Mortgage Line</label>
                        <span style="font-size: 0.72rem; color: var(--text-muted);">Standby equity credit line</span>
                    </div>
                    <input type="checkbox" id="chk-reverse-mortgage" ${isEnabled ? 'checked' : ''} style="cursor: pointer; transform: scale(1.15);">
                </div>
                ${ageSelectHtml}
            </div>
        `;
    }

    _renderEquityAndSavingsSections(state, s1, simulationSummary) {
        const hasShortfalls = simulationSummary.hasShortfalls;
        const diagMsg = hasShortfalls
            ? `Your plan experiences ${simulationSummary.shortfallYearsCount} shortfall year(s). Unlocking home equity can bridge this gap.`
            : `Your plan successfully funds retirement through age ${simulationSummary.maxAge} with ~$${Math.round(simulationSummary.endingWealth).toLocaleString()} remaining.`;
        const s1ContribPct = s1.jobs?.[0]?.employeeContributionPercent || 10;
        const s1JobSliderHtml =
            (s1.jobs || []).length > 0
                ? `
                <div class="what-if-control-group">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                        <label style="font-size: 0.82rem; font-weight: 600; color: var(--text-color);">
                            ${escapeHtml(s1.name || 'Primary')} 401(k) Contribution:
                        </label>
                        <span class="what-if-value-badge" id="lbl-s1-contrib-pct">${s1ContribPct}%</span>
                    </div>
                    <input type="range" class="what-if-slider" id="slider-s1-contrib-pct" 
                        min="0" max="25" value="${s1ContribPct}" step="1">
                </div>
                `
                : '';

        return `
            <div class="what-if-section">
                <div class="what-if-section-header">
                    <span class="what-if-section-icon">🏡</span>
                    <h4>Access Equity</h4>
                </div>
                <p class="what-if-section-desc">Assess your retirement longevity and explore home equity backup lines.</p>
                <div class="what-if-diagnostic-card ${hasShortfalls ? 'warning' : 'healthy'}">
                    <div style="font-size: 1.1rem; line-height: 1;">${hasShortfalls ? '⚠️' : '🟢'}</div>
                    <div>
                        <strong style="display: block; font-size: 0.82rem; margin-bottom: 0.2rem;">
                            ${hasShortfalls ? 'Caution: Deficit Years Detected' : 'Healthy Longevity: Slated for Excess Wealth'}
                        </strong>
                        <p style="margin: 0; font-size: 0.76rem; line-height: 1.35;">${diagMsg}</p>
                    </div>
                </div>
                ${this._renderReverseMortgageControls(state)}
            </div>

            <div class="what-if-section">
                <div class="what-if-section-header">
                    <span class="what-if-section-icon">💰</span>
                    <h4>Increase Savings</h4>
                </div>
                <p class="what-if-section-desc">Boost payroll 401(k) deferrals or add systematic monthly brokerage contributions.</p>
                ${s1JobSliderHtml}
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
        `;
    }

    getTemplate() {
        const state = getState();
        const s1 = state.primarySpouse || {};
        const s2 = state.secondarySpouse || {};
        const currentYear = state.currentYear || new Date().getFullYear();
        const hasS2 = Boolean(s2.name || s2.yearOfBirth);
        const simulationSummary = this._computeDiagnosticSummary(state);

        return `
            <aside class="what-if-dock ${this.isOpen ? 'open' : 'hidden'}" id="what-if-modal" aria-label="What-If Scenario Sandbox">
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

                <div class="what-if-body">
                    ${this._renderRetireEarlySection(s1, s2, hasS2, currentYear)}
                    ${this._renderExpensesSection(state)}
                    ${this._renderCollegeSection(state, currentYear)}
                    ${this._renderEquityAndSavingsSections(state, s1, simulationSummary)}
                </div>
            </aside>
        `;
    }

    _bindEquityAndSavingsEvents() {
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

        const s1ContribSlider = this.querySelector('#slider-s1-contrib-pct');
        if (s1ContribSlider) {
            s1ContribSlider.addEventListener('input', (e) => {
                const pctVal = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s1-contrib-pct');
                if (lbl) lbl.textContent = `${pctVal}%`;
                const state = getState();
                if (state.primarySpouse?.jobs?.[0]) {
                    state.primarySpouse.jobs[0].employeeContributionPercent = pctVal;
                    updateState(state);
                    document.dispatchEvent(new CustomEvent('state-updated'));
                }
            });
        }

        this.querySelectorAll('.btn-boost-savings').forEach((btn) => {
            btn.addEventListener('click', () => {
                const boost = Number(btn.getAttribute('data-boost'));
                this._boostBrokerageSavings(boost);
            });
        });
    }

    afterRender() {
        const btnClose = this.querySelector('.btn-close-whatif');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.close());
        }

        if (!this._escBound) {
            this._escBound = true;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
        }

        const s1Slider = this.querySelector('#slider-s1-retire-age');
        if (s1Slider) {
            s1Slider.addEventListener('input', (e) => {
                const ageVal = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s1-retire-age');
                if (lbl) lbl.textContent = `Age ${ageVal}`;
                this._mutateRetirementAge('primarySpouse', ageVal);
            });
        }

        const s2Slider = this.querySelector('#slider-s2-retire-age');
        if (s2Slider) {
            s2Slider.addEventListener('input', (e) => {
                const ageVal = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s2-retire-age');
                if (lbl) lbl.textContent = `Age ${ageVal}`;
                this._mutateRetirementAge('secondarySpouse', ageVal);
            });
        }

        this.querySelectorAll('.what-if-chips-row .what-if-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.expenseAdjustmentPercent = Number(btn.getAttribute('data-expense'));
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

        this.querySelectorAll('.btn-boost-529').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-child-idx'));
                const amt = Number(btn.getAttribute('data-amount'));
                this._boostChild529(idx, amt);
            });
        });

        this._bindEquityAndSavingsEvents();
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
        const brokerage =
            state.primarySpouse?.accounts?.find((a) => a.type === 'taxableBrokerage') ||
            state.primarySpouse?.accounts?.[0];
        if (brokerage) {
            brokerage.balance = Math.round(brokerage.balance + monthlyAmount * 12);
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
