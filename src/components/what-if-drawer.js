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
import {
    getState,
    updateState,
    getProfiles,
    getActiveProfileId,
    createProfile,
    replaceProfileData
} from '../services/state.js';
import { SimulationEngine } from '../services/SimulationEngine.js';
import { SurplusPullForwardEngine } from '../services/SurplusPullForwardEngine.js';
import { renderPathwayABody, renderPathwayBBody, formatCompactCurrency } from './pull-forward-banner.js';
import { escapeHtml } from '../utils/sanitize.js';

export class WhatIfDrawer extends BaseComponent {
    constructor() {
        super();
        this.isOpen = false;
        this.activeModeTab = 'career'; // 'career' | 'spending' | 'advanced'
        this._sliderDebounceTimer = null;
        this.expenseAdjustmentPercent = 0;
        this.customSavingsBoostMonthly = 0;
        this.pullForwardTab = 'bridge';
        this._lastPullForwardReport = null;
        this._forkedProfileId = null;
        this._baselineProfileId = null;
        this._baselineSnapshot = null;
        this._pendingFork = null;
    }

    disconnectedCallback() {
        if (this._sliderDebounceTimer) {
            clearTimeout(this._sliderDebounceTimer);
            this._sliderDebounceTimer = null;
        }
        super.disconnectedCallback?.();
    }

    _getActiveProfileName() {
        const profiles = getProfiles();
        const activeId = getActiveProfileId();
        const match = profiles.find((p) => p.id === activeId);
        return match ? match.name : 'Default Profile';
    }

    _isActiveProfileWhatIf() {
        const activeId = getActiveProfileId();
        if (this._forkedProfileId && this._forkedProfileId === activeId) {
            return true;
        }
        const name = this._getActiveProfileName();
        return /^what\s*if\s*:/i.test(name);
    }

    _captureBaselineIfNeeded() {
        if (!this._isActiveProfileWhatIf() && !this._pendingFork) {
            this._baselineProfileId = getActiveProfileId();
            this._baselineSnapshot = structuredClone(getState());
        }
    }

    _ensureWhatIfScenario(actionLabel, mutationCallback) {
        if (this._isActiveProfileWhatIf()) {
            mutationCallback();
            return;
        }
        if (!this._baselineSnapshot) {
            this._baselineProfileId = getActiveProfileId();
            this._baselineSnapshot = structuredClone(getState());
        }
        const suggestedSuffix = actionLabel || 'Custom Scenario';
        this._pendingFork = {
            suggestedSuffix,
            suggestedName: `What If: ${suggestedSuffix}`,
            mutationCallback
        };

        const modalEl = this.querySelector('#whatif-fork-modal');
        const inputEl = this.querySelector('#whatif-fork-name-input');
        const activeNameEl = this.querySelector('#whatif-fork-active-name');
        if (modalEl) {
            if (activeNameEl) activeNameEl.textContent = this._getActiveProfileName();
            if (inputEl) inputEl.value = suggestedSuffix;
            modalEl.classList.remove('hidden');
            modalEl.classList.add('open');
            if (inputEl && typeof inputEl.focus === 'function') {
                inputEl.focus();
                if (typeof inputEl.select === 'function') inputEl.select();
            }
        } else {
            this.render();
        }
    }

    _confirmWhatIfFork(customSuffixOrName) {
        if (!this._pendingFork) return;
        const rawInput = String(customSuffixOrName ?? this._pendingFork.suggestedSuffix ?? '').trim();
        const cleanedSuffix = rawInput.replace(/^what\s*if\s*:\s*/i, '').trim() || 'Scenario';
        const finalScenarioName = `What If: ${cleanedSuffix}`;

        if (this._baselineProfileId && this._baselineSnapshot) {
            replaceProfileData(this._baselineProfileId, structuredClone(this._baselineSnapshot));
        }

        const newProfileId = createProfile(finalScenarioName, true);
        if (this._baselineSnapshot) {
            replaceProfileData(newProfileId, structuredClone(this._baselineSnapshot));
        }
        this._forkedProfileId = newProfileId;

        const callback = this._pendingFork.mutationCallback;
        this._pendingFork = null;
        if (typeof callback === 'function') {
            callback();
        }
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('profile-updated'));
            document.dispatchEvent(new CustomEvent('state-updated'));
        }
        this.render();
    }

    _cancelWhatIfFork() {
        this._pendingFork = null;
        const modalEl = this.querySelector('#whatif-fork-modal');
        if (modalEl) {
            modalEl.classList.remove('open');
            modalEl.classList.add('hidden');
        } else {
            this.render();
        }
    }

    open() {
        this.isOpen = true;
        this._pendingFork = null;
        this._captureBaselineIfNeeded();
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
        if (this._sliderDebounceTimer) {
            clearTimeout(this._sliderDebounceTimer);
            this._sliderDebounceTimer = null;
        }
        this._pendingFork = null;
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
        this._captureBaselineIfNeeded();
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
                    's1SeppIra',
                    's2SeppIra',
                    'cashCushion'
                ];
                const balances = endSnap.balances || {};
                const endLiquid = liquidKeys.reduce((sum, keyName) => sum + (balances[keyName] || 0), 0);
                const endHome = balances.primaryResidenceEquity || 0;
                simulationSummary.endingWealth = endLiquid + endHome;
                simulationSummary.maxAge = endSnap.agePrimary || 88;
                this._lastPullForwardReport = SurplusPullForwardEngine.evaluate(state, data);
            }
        } catch {
            // Fallback gracefully
        }
        return simulationSummary;
    }

    _renderSpouseRetirementSlider(sliderConfig) {
        const { spouseObj, defaultLabel, badgeId, sliderId, yearLabelId, currentYear, fallbackYear, marginTop } =
            sliderConfig;
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
                    <span id="${yearLabelId}" aria-live="polite">Retire in Year ${retYear}</span>
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
            yearLabelId: 'lbl-s1-retire-year',
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
                  yearLabelId: 'lbl-s2-retire-year',
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
        const projColor = pct < 0 ? 'var(--success)' : pct > 0 ? 'var(--danger)' : 'var(--text-main)';
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
                    <strong style="font-size: 0.85rem; color: var(--text-main);">${escapeHtml(child.name || `Child ${idx + 1}`)}</strong>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">HS Grad: ${hsGradYear} (${yearsLeft} yrs)</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.2rem;">
                    <span style="color: var(--text-muted);">Current 529 Balance:</span>
                    <span>$${current529.toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; margin-bottom: 0.2rem;">
                    <span style="color: var(--text-muted);">Projected at Age 18:</span>
                    <span style="color: ${projectedExisting >= targetFund ? 'var(--whatif-health-text)' : 'var(--whatif-warn-text)'}; font-weight: 600;">$${projectedExisting.toLocaleString()}</span>
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
                <select id="sel-reverse-mortgage-age" style="padding: 0.2rem 0.4rem; font-size: 0.78rem; background: var(--input-bg); color: var(--text-main); border: 1px solid var(--border); border-radius: 4px;">
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

    _renderSavingsSection(s1) {
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
            <div class="what-if-section" style="margin-top: 0.75rem;">
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

    _renderEquitySection(state, simulationSummary) {
        const hasShortfalls = simulationSummary.hasShortfalls;
        const diagMsg = hasShortfalls
            ? `Your plan experiences ${simulationSummary.shortfallYearsCount} shortfall year(s). Unlocking home equity can bridge this gap.`
            : `Your plan successfully funds retirement through age ${simulationSummary.maxAge} with ~$${Math.round(simulationSummary.endingWealth).toLocaleString()} remaining.`;

        return `
            <div class="what-if-diagnostic-card ${hasShortfalls ? 'warning' : 'healthy'}" style="margin-bottom: 0.6rem;">
                <div style="font-size: 1.1rem; line-height: 1;">${hasShortfalls ? '⚠️' : '🟢'}</div>
                <div>
                    <strong style="display: block; font-size: 0.82rem; margin-bottom: 0.2rem;">
                        ${hasShortfalls ? 'Caution: Deficit Years Detected' : 'Healthy Longevity: Slated for Excess Wealth'}
                    </strong>
                    <p style="margin: 0; font-size: 0.76rem; line-height: 1.35;">${diagMsg}</p>
                </div>
            </div>
            ${this._renderReverseMortgageControls(state)}
        `;
    }

    _renderEquityAndSavingsSections(state, s1, simulationSummary) {
        return `
            <div class="what-if-section">
                <div class="what-if-section-header">
                    <span class="what-if-section-icon">🏡</span>
                    <h4>Access Equity</h4>
                </div>
                <p class="what-if-section-desc">Assess your retirement longevity and explore home equity backup lines.</p>
                ${this._renderEquitySection(state, simulationSummary)}
            </div>
            ${this._renderSavingsSection(s1)}
        `;
    }

    _renderCareerTimelineTab(s1, s2, hasS2, currentYear, report) {
        const accel = report?.retirementAcceleration;
        const canAccelerate = Boolean(accel && accel.yearsAccelerated > 0 && accel.legacyTargetRespected);
        const accelPillHtml = canAccelerate
            ? `
            <div class="whatif-opportunity-pill" role="status" style="margin-bottom: 0.65rem;">
                <span>⚡ <strong>Surplus Opportunity:</strong> Safe to retire <strong>${accel.yearsAccelerated} yrs earlier</strong> (${accel.earliestSafeRetirementYearPrimary})!</span>
                <button type="button" id="btn-quick-retire-earlier" class="btn btn-small btn-primary" data-years-accel="${accel.yearsAccelerated}" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; font-weight: 700;">Apply Earlier</button>
            </div>
            `
            : '';

        const downshiftHtml = report ? renderPathwayBBody(report) : '';

        return `
            <div class="what-if-mode-tab-content active" id="what-if-tab-career">
                <div class="what-if-section">
                    <div class="what-if-section-header">
                        <span class="what-if-section-icon">🏖️</span>
                        <h4>Retire Early</h4>
                    </div>
                    <p class="what-if-section-desc">Test retiring earlier or later to immediately view portfolio longevity impact on the timeline graph.</p>
                    ${accelPillHtml}
                    ${this._renderSpouseRetirementSlider({
                        spouseObj: s1,
                        defaultLabel: 'Primary Spouse',
                        badgeId: 'lbl-s1-retire-age',
                        sliderId: 'slider-s1-retire-age',
                        yearLabelId: 'lbl-s1-retire-year',
                        currentYear,
                        fallbackYear: 2043,
                        marginTop: ''
                    })}
                    ${
                        hasS2
                            ? this._renderSpouseRetirementSlider({
                                  spouseObj: s2,
                                  defaultLabel: 'Secondary Spouse',
                                  badgeId: 'lbl-s2-retire-age',
                                  sliderId: 'slider-s2-retire-age',
                                  yearLabelId: 'lbl-s2-retire-year',
                                  currentYear,
                                  fallbackYear: 2047,
                                  marginTop: '0.75rem'
                              })
                            : ''
                    }
                </div>

                ${
                    downshiftHtml
                        ? `
                <div class="what-if-section" style="margin-top: 0.75rem;">
                    <div class="what-if-section-header">
                        <span class="what-if-section-icon">☕</span>
                        <h4>Career Downshift / Barista FIRE</h4>
                    </div>
                    <p class="what-if-section-desc">Transition to lower-stress, passion-driven work while protecting portfolio longevity.</p>
                    ${downshiftHtml}
                </div>
                `
                        : ''
                }
            </div>
        `;
    }

    _renderSpendingSavingsTab(state, s1) {
        return `
            <div class="what-if-mode-tab-content active" id="what-if-tab-spending">
                ${this._renderExpensesSection(state)}
                ${this._renderSavingsSection(s1)}
            </div>
        `;
    }

    _renderAdvancedEquityTab(state, simulationSummary, report, currentYear) {
        const s = report?.surplusAnalysis;
        const desiredLegacyBuffer = s?.desiredLegacyBuffer || 0;
        const terminalNetWorthNominal = s?.terminalNetWorthNominal || simulationSummary.endingWealth || 0;
        const excessSurplus = s?.excessTerminalSurplusNominal || 0;
        const excessReal = s?.excessTerminalSurplusReal || 0;

        const legacySliderHtml = `
            <div class="what-if-control-group" style="margin-bottom: 0.75rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                    <label for="slider-legacy-reserve" style="font-size: 0.8rem; font-weight: 600; color: var(--text-color);">Desired Legacy Reserve:</label>
                    <span class="what-if-value-badge" id="lbl-legacy-reserve">${formatCompactCurrency(desiredLegacyBuffer)}</span>
                </div>
                <input type="range" class="what-if-slider" id="slider-legacy-reserve" min="0" max="5000000" step="100000" value="${desiredLegacyBuffer}">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">
                    <span>Terminal: <strong>${formatCompactCurrency(terminalNetWorthNominal)}</strong></span>
                    <span>Surplus: <strong style="color: var(--whatif-health-text);">${formatCompactCurrency(excessSurplus)}</strong> (${formatCompactCurrency(excessReal)} real)</span>
                </div>
            </div>
        `;

        const bridgeHtml = report ? renderPathwayABody(report) : '';

        const dependents = state.dependents || [];
        const collegeDetailsHtml =
            dependents.length > 0
                ? `
                <details class="whatif-collapsible-section" style="margin-top: 0.75rem;">
                    <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--primary); padding: 0.4rem 0;">
                        🎓 Fund Kids' College (${dependents.length} Children)
                    </summary>
                    <div style="margin-top: 0.5rem;">
                        ${dependents.map((child, idx) => this._renderChildCollegeCard(child, idx, currentYear)).join('')}
                    </div>
                </details>
                `
                : '';

        const equityDetailsHtml = `
            <details class="whatif-collapsible-section" style="margin-top: 0.75rem;">
                <summary style="cursor: pointer; font-size: 0.82rem; font-weight: 600; color: var(--primary); padding: 0.4rem 0;">
                    🏡 Access Equity &amp; Longevity Diagnostic
                </summary>
                <div style="margin-top: 0.5rem;">
                    ${this._renderEquitySection(state, simulationSummary)}
                </div>
            </details>
        `;

        return `
            <div class="what-if-mode-tab-content active" id="what-if-tab-advanced">
                <div class="what-if-section">
                    <div class="what-if-section-header">
                        <span class="what-if-section-icon">🌉</span>
                        <h4>Legacy Reserve &amp; Pre-59½ Bridges</h4>
                    </div>
                    <p class="what-if-section-desc">Tune your target legacy cushion and explore statutory early-access liquidity bridges.</p>
                    ${legacySliderHtml}
                    ${bridgeHtml}
                </div>
                ${collegeDetailsHtml}
                ${equityDetailsHtml}
            </div>
        `;
    }

    _renderScenarioProtectionBanner() {
        const activeName = escapeHtml(this._getActiveProfileName());
        if (this._isActiveProfileWhatIf()) {
            return `
                <div class="what-if-warning-banner" role="status" style="background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.35);">
                    <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
                        <span style="font-size: 1.25rem; line-height: 1.1;">🔮</span>
                        <div>
                            <strong style="display: block; font-size: 0.82rem; color: var(--whatif-health-text); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">
                                Editing What-If Scenario
                            </strong>
                            <p style="margin: 0; font-size: 0.78rem; line-height: 1.35; color: var(--text-main);">
                                Changes save to <strong>${activeName}</strong> while your original scenario remains safely untouched.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }
        return `
            <div class="what-if-warning-banner" role="status">
                <div style="display: flex; align-items: flex-start; gap: 0.6rem;">
                    <span style="font-size: 1.25rem; line-height: 1.1;">🛡️</span>
                    <div>
                        <strong style="display: block; font-size: 0.82rem; color: var(--whatif-warn-text); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">
                            Safe Copy-on-Change Protection
                        </strong>
                        <p style="margin: 0; font-size: 0.78rem; line-height: 1.35; color: var(--text-main);">
                            Your first change will prompt to copy <strong>${activeName}</strong> into a new <strong>What If: ___</strong> scenario so your original plan is never modified.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    _renderForkPromptModal() {
        const activeName = escapeHtml(this._getActiveProfileName());
        const suggestedSuffix = escapeHtml(this._pendingFork?.suggestedSuffix || 'Custom Scenario');
        const isOpen = Boolean(this._pendingFork);
        return `
            <div id="whatif-fork-modal" class="whatif-fork-modal ${isOpen ? 'open' : 'hidden'}" role="dialog" aria-modal="true" aria-label="Create What-If Scenario" style="margin: 0.75rem 1rem; padding: 1rem; background: var(--surface-card); border: 1.5px solid var(--warning); border-radius: 10px; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);">
                <div style="font-size: 0.9rem; font-weight: 700; color: var(--whatif-warn-text); margin-bottom: 0.35rem;">
                    🔮 Create "What If" Scenario Copy
                </div>
                <p style="font-size: 0.78rem; color: var(--text-muted); margin: 0 0 0.65rem 0; line-height: 1.35;">
                    We'll copy <strong id="whatif-fork-active-name">${activeName}</strong> into a new scenario and switch to it so your original plan stays untouched:
                </p>
                <div style="display: flex; align-items: center; gap: 0.4rem; background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.6rem; margin-bottom: 0.75rem;">
                    <span style="font-size: 0.82rem; font-weight: 700; color: var(--whatif-warn-text); white-space: nowrap;">What If:</span>
                    <input type="text" id="whatif-fork-name-input" value="${suggestedSuffix}" placeholder="Scenario name..." style="flex: 1; background: transparent; border: none; color: var(--text-main); font-size: 0.85rem; font-weight: 600; outline: none;" />
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                    <button type="button" id="btn-cancel-whatif-fork" class="btn btn-secondary btn-small" style="font-size: 0.78rem; padding: 0.35rem 0.75rem;">Cancel</button>
                    <button type="button" id="btn-confirm-whatif-fork" class="btn btn-primary btn-small" style="font-size: 0.78rem; padding: 0.35rem 0.85rem; font-weight: 700;">Create &amp; Apply</button>
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

        let activeTabHtml = '';
        if (this.activeModeTab === 'spending') {
            activeTabHtml = this._renderSpendingSavingsTab(state, s1);
        } else if (this.activeModeTab === 'advanced') {
            activeTabHtml = this._renderAdvancedEquityTab(
                state,
                simulationSummary,
                this._lastPullForwardReport,
                currentYear
            );
        } else {
            activeTabHtml = this._renderCareerTimelineTab(s1, s2, hasS2, currentYear, this._lastPullForwardReport);
        }

        return `
            <aside class="what-if-dock ${this.isOpen ? 'open' : 'hidden'}" id="what-if-modal" aria-label="What-If Scenario Sandbox">
                <div class="what-if-header">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="font-size: 1.3rem;">🔮</span>
                        <div>
                            <h3 style="margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--text-main);">What If? Sandbox</h3>
                            <span class="what-if-wip-pill">SCENARIO STUDIO</span>
                        </div>
                    </div>
                    <button type="button" class="btn-close-whatif" title="Close Drawer" style="background: none; border: none; font-size: 1.5rem; color: var(--text-muted); cursor: pointer; padding: 0.2rem 0.5rem; line-height: 1;">&times;</button>
                </div>

                ${this._renderScenarioProtectionBanner()}
                ${this._renderForkPromptModal()}

                <div class="what-if-mode-tabs" role="tablist" aria-label="What-If Mode Selection">
                    <button type="button" class="what-if-mode-tab-btn ${this.activeModeTab === 'career' ? 'active' : ''}" data-mode-tab="career" role="tab" aria-selected="${this.activeModeTab === 'career'}" title="Career &amp; Timeline">⏱️ Career</button>
                    <button type="button" class="what-if-mode-tab-btn ${this.activeModeTab === 'spending' ? 'active' : ''}" data-mode-tab="spending" role="tab" aria-selected="${this.activeModeTab === 'spending'}" title="Spending &amp; Savings">💳 Spending</button>
                    <button type="button" class="what-if-mode-tab-btn ${this.activeModeTab === 'advanced' ? 'active' : ''}" data-mode-tab="advanced" role="tab" aria-selected="${this.activeModeTab === 'advanced'}" title="Advanced &amp; Equity">🌉 Advanced</button>
                </div>

                <div class="what-if-body">
                    ${activeTabHtml}
                </div>
            </aside>
        `;
    }

    _bindForkPromptEvents() {
        const btnConfirm = this.querySelector('#btn-confirm-whatif-fork');
        const btnCancel = this.querySelector('#btn-cancel-whatif-fork');
        const nameInput = this.querySelector('#whatif-fork-name-input');

        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                this._confirmWhatIfFork(nameInput ? nameInput.value : undefined);
            });
        }
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                this._cancelWhatIfFork();
            });
        }
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._confirmWhatIfFork(nameInput.value);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this._cancelWhatIfFork();
                }
            });
        }
    }

    _bindPullForwardStudioEvents() {
        const legacySlider = this.querySelector('#slider-legacy-reserve');
        if (legacySlider) {
            legacySlider.addEventListener('change', (e) => {
                const targetVal = Number(e.target.value) || 0;
                const labelM = (targetVal / 1_000_000).toFixed(1);
                this._ensureWhatIfScenario(`$${labelM}M Legacy Goal`, () => {
                    const state = getState();
                    if (!state.strategies) state.strategies = {};
                    state.strategies.targetLegacyBalance = targetVal;
                    updateState(state);
                    document.dispatchEvent(new CustomEvent('state-updated'));
                    this.render();
                });
            });
        }

        this.querySelectorAll('.pf-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.pullForwardTab = btn.getAttribute('data-pf-tab') || 'bridge';
                this.render();
            });
        });

        this.querySelectorAll('.btn-apply-bridge-fix').forEach((btn) => {
            btn.addEventListener('click', () => {
                const bridgeId = btn.getAttribute('data-bridge-id');
                const opt = this._lastPullForwardReport?.liquidityLockout?.bridgeSolutions?.find(
                    (b) => b.id === bridgeId
                );
                this._ensureWhatIfScenario(opt?.title || 'Bridge Strategy', () => {
                    const state = getState();
                    SurplusPullForwardEngine.applyFixToState(state, bridgeId, opt?.actionPayload);
                    updateState(state);
                    document.dispatchEvent(new CustomEvent('state-updated'));
                    this.render();
                });
            });
        });

        this.querySelectorAll('.btn-apply-downshift').forEach((btn) => {
            btn.addEventListener('click', () => {
                const spouseKey = btn.getAttribute('data-spouse-key') || 'primarySpouse';
                const shiftYear = Number(btn.getAttribute('data-shift-year'));
                const salary = Number(btn.getAttribute('data-shift-salary')) || 35000;
                this._applyCareerDownshift(spouseKey, shiftYear, salary);
            });
        });

        const btnAccel = this.querySelector('#btn-apply-retire-acceleration');
        if (btnAccel) {
            btnAccel.addEventListener('click', () => {
                const yearsAccel = Number(btnAccel.getAttribute('data-years-accel')) || 0;
                if (yearsAccel > 0) this._applyRetirementAcceleration(yearsAccel);
            });
        }
    }

    _applyCareerDownshift(spouseKey, shiftYear, salary) {
        this._ensureWhatIfScenario(`Downshift in ${shiftYear}`, () => {
            const state = getState();
            const spouse = state[spouseKey];
            if (!spouse || !Array.isArray(spouse.jobs) || spouse.jobs.length === 0) return;
            spouse.jobs = [
                { ...spouse.jobs[0], startDate: '' },
                {
                    id: 'job-downshift-barista',
                    title: 'Barista / Downshift',
                    baseSalary: salary,
                    startDate: `${shiftYear}-01-01`,
                    bonusAmount: 0,
                    ltiAmount: 0,
                    isOpen: true
                }
            ];
            const downshiftAge = spouse.yearOfBirth ? shiftYear - spouse.yearOfBirth : 55;
            const hasWorkplacePlan = (spouse.accounts || []).some(
                (a) => (a.type === 'traditional401k' || a.type === 'trad403b') && a.isActiveContributor !== false
            );
            if (downshiftAge >= 55 && hasWorkplacePlan) {
                SurplusPullForwardEngine.applyFixToState(state, 'rule55_preservation');
            }
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
            }
            this.render();
        });
    }

    _applyRetirementAcceleration(yearsAccel) {
        this._ensureWhatIfScenario(`Retire ${yearsAccel}yr Earlier`, () => {
            const state = getState();
            for (const key of ['primarySpouse', 'secondarySpouse']) {
                const sp = state[key];
                if (!sp || !sp.targetRetirementAge) continue;
                sp.targetRetirementAge = Math.max(40, Number(sp.targetRetirementAge) - yearsAccel);
                if (sp.yearOfBirth) {
                    sp.targetRetirementDate = `${Number(sp.yearOfBirth) + sp.targetRetirementAge}-01`;
                }
            }
            const pRetireAge = Number(state.primarySpouse?.targetRetirementAge) || 55;
            const pHasWorkAcc = (state.primarySpouse?.accounts || []).some(
                (a) => (a.type === 'traditional401k' || a.type === 'trad403b') && a.isActiveContributor !== false
            );
            if (pRetireAge >= 55 && pHasWorkAcc) {
                SurplusPullForwardEngine.applyFixToState(state, 'rule55_preservation');
            }
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
            }
            this.render();
        });
    }

    _bindEquityAndSavingsEvents() {
        const chkReverse = this.querySelector('#chk-reverse-mortgage');
        if (chkReverse) {
            chkReverse.addEventListener('change', (e) => {
                const checked = e.target.checked;
                this._ensureWhatIfScenario('Reverse Mortgage Line', () => {
                    const state = getState();
                    if (!state.primaryResidenceEquity) state.primaryResidenceEquity = {};
                    state.primaryResidenceEquity.reverseMortgageEnabled = checked;
                    updateState(state);
                    document.dispatchEvent(new CustomEvent('state-updated'));
                    this.render();
                });
            });
        }

        const selReverseAge = this.querySelector('#sel-reverse-mortgage-age');
        if (selReverseAge) {
            selReverseAge.addEventListener('change', (e) => {
                const startAge = Number(e.target.value);
                this._ensureWhatIfScenario(`Reverse Mortgage Age ${startAge}`, () => {
                    const state = getState();
                    if (!state.primaryResidenceEquity) state.primaryResidenceEquity = {};
                    state.primaryResidenceEquity.reverseMortgageStartAge = startAge;
                    updateState(state);
                    document.dispatchEvent(new CustomEvent('state-updated'));
                });
            });
        }

        const s1ContribSlider = this.querySelector('#slider-s1-contrib-pct');
        if (s1ContribSlider) {
            s1ContribSlider.addEventListener('input', (e) => {
                const pctVal = Number(e.target.value);
                const lbl = this.querySelector('#lbl-s1-contrib-pct');
                if (lbl) lbl.textContent = `${pctVal}%`;
                if (this._isActiveProfileWhatIf()) {
                    this._applyPrimaryContributionPercent(pctVal);
                }
            });
            s1ContribSlider.addEventListener('change', (e) => {
                const pctVal = Number(e.target.value);
                this._ensureWhatIfScenario(`${pctVal}% 401k Deferral`, () => {
                    this._applyPrimaryContributionPercent(pctVal);
                });
            });
        }

        this.querySelectorAll('.btn-boost-savings').forEach((btn) => {
            btn.addEventListener('click', () => {
                const boost = Number(btn.getAttribute('data-boost'));
                this._boostBrokerageSavings(boost);
            });
        });
    }

    _applyPrimaryContributionPercent(pctVal) {
        const state = getState();
        if (state.primarySpouse?.jobs?.[0]) {
            state.primarySpouse.jobs[0].employeeContributionPercent = pctVal;
            updateState(state);
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('state-updated'));
            }
        }
    }

    _bindRetireAgeSliders() {
        const state = getState();
        const s1 = state.primarySpouse || {};
        const s2 = state.secondarySpouse || {};
        const currentYear = state.currentYear || new Date().getFullYear();

        const computeRetireYear = (spouse, ageVal) => {
            if (spouse?.yearOfBirth) {
                return Number(spouse.yearOfBirth) + ageVal;
            }
            const curAge = spouse?.targetRetirementAge || 62;
            return currentYear + (ageVal - curAge);
        };

        const bindSlider = (sliderId, badgeId, yearId, spouseKey, spouseObj) => {
            const slider = this.querySelector(`#${sliderId}`);
            if (!slider) return;

            slider.addEventListener('input', (e) => {
                const ageVal = Number(e.target.value);
                // Tier 1: Fast-Path Synchronous UI updates (<1ms)
                const badge = this.querySelector(`#${badgeId}`);
                if (badge) badge.textContent = `Age ${ageVal}`;
                const yearEl = this.querySelector(`#${yearId}`);
                if (yearEl) yearEl.textContent = `Retire in Year ${computeRetireYear(spouseObj, ageVal)}`;

                // Tier 2: 180ms Coalesced Trailing Debounce for heavy SimulationEngine
                if (this._sliderDebounceTimer) {
                    clearTimeout(this._sliderDebounceTimer);
                }
                this._sliderDebounceTimer = setTimeout(() => {
                    this._sliderDebounceTimer = null;
                    if (typeof requestAnimationFrame !== 'undefined') {
                        requestAnimationFrame(() => {
                            this._mutateRetirementAge(spouseKey, ageVal);
                        });
                    } else {
                        this._mutateRetirementAge(spouseKey, ageVal);
                    }
                }, 180);
            });

            slider.addEventListener('change', (e) => {
                // Immediate commit on pointer release / commit
                if (this._sliderDebounceTimer) {
                    clearTimeout(this._sliderDebounceTimer);
                    this._sliderDebounceTimer = null;
                }
                const ageVal = Number(e.target.value);
                this._mutateRetirementAge(spouseKey, ageVal);
            });
        };

        bindSlider('slider-s1-retire-age', 'lbl-s1-retire-age', 'lbl-s1-retire-year', 'primarySpouse', s1);
        if (s2.name || s2.yearOfBirth) {
            bindSlider('slider-s2-retire-age', 'lbl-s2-retire-age', 'lbl-s2-retire-year', 'secondarySpouse', s2);
        }
    }

    afterRender() {
        const btnClose = this.querySelector('.btn-close-whatif');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.close());
        }

        if (!this._escBound && typeof window !== 'undefined') {
            this._escBound = true;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    if (this._pendingFork) {
                        this._cancelWhatIfFork();
                    } else {
                        this.close();
                    }
                }
            });
        }

        this._bindForkPromptEvents();

        this.querySelectorAll('.what-if-mode-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode-tab');
                if (mode && mode !== this.activeModeTab) {
                    this.activeModeTab = mode;
                    this.render();
                    const body = this.querySelector('.what-if-body');
                    if (body) body.scrollTop = 0;
                }
            });
        });

        this._bindRetireAgeSliders();

        const btnQuickAccel = this.querySelector('#btn-quick-retire-earlier');
        if (btnQuickAccel) {
            btnQuickAccel.addEventListener('click', () => {
                const yearsAccel = Number(btnQuickAccel.getAttribute('data-years-accel')) || 0;
                if (yearsAccel > 0) this._applyRetirementAcceleration(yearsAccel);
            });
        }

        this.querySelectorAll('.what-if-chip[data-expense]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.expenseAdjustmentPercent = Number(btn.getAttribute('data-expense'));
                this.render();
            });
        });

        const btnApplyExpense = this.querySelector('#btn-apply-expense-change');
        if (btnApplyExpense) {
            btnApplyExpense.addEventListener('click', () => {
                const pct = this.expenseAdjustmentPercent;
                this.expenseAdjustmentPercent = 0;
                this._applyExpenseAdjustment(pct);
            });
        }

        this.querySelectorAll('.btn-boost-529').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-child-idx'));
                const amt = Number(btn.getAttribute('data-amount'));
                this._boostChild529(idx, amt);
            });
        });

        this._bindPullForwardStudioEvents();
        this._bindEquityAndSavingsEvents();
    }

    _mutateRetirementAge(spouseKey, age) {
        this._ensureWhatIfScenario(`Retire at Age ${age}`, () => {
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
        });
    }

    _applyExpenseAdjustment(percent) {
        const label = `${percent > 0 ? '+' : ''}${percent}% Expenses`;
        this._ensureWhatIfScenario(label, () => {
            const state = getState();
            if (state.phaseBasedExpensesPerMonth) {
                const multiplier = 1 + percent / 100;
                for (const key of Object.keys(state.phaseBasedExpensesPerMonth)) {
                    state.phaseBasedExpensesPerMonth[key] = Math.round(
                        state.phaseBasedExpensesPerMonth[key] * multiplier
                    );
                }
                updateState(state);
                if (typeof document !== 'undefined') {
                    document.dispatchEvent(new CustomEvent('state-updated'));
                }
                this.render();
            }
        });
    }

    _boostChild529(childIndex, amount) {
        this._ensureWhatIfScenario(`+$${(amount / 1000).toFixed(0)}k to 529`, () => {
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
        });
    }

    _boostBrokerageSavings(monthlyAmount) {
        this._ensureWhatIfScenario(`+$${monthlyAmount}/mo Savings`, () => {
            const state = getState();
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
        });
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('what-if-drawer')) {
    customElements.define('what-if-drawer', WhatIfDrawer);
}
