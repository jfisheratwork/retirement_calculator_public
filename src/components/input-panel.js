import { BaseComponent } from './base-component.js';
import { getState, updateState } from '../services/state.js';
import { escapeHtml } from '../utils/sanitize.js';
import { normalizeDateStr } from '../utils/date.js';

// Import child components so they register with customElements
import './spouse-panel.js';
import './job-panel.js';
import './account-panel.js';
import './account-details-panel.js';
import './strategy-events-panel.js';
import './assumptions-panel.js';
import './expenses-panel.js';
import './housing-panel.js';
import './children-panel.js';

/**
 * Main Financial Input Panel Component
 * Acts as the smart container orchestrating staged draft state for all sub-panels.
 */
export class FinancialInputPanel extends BaseComponent {
    constructor() {
        super();
        this.onStateChangeCallback = null;
        this.draftState = null;
        this.isDirty = false;
        this.activeTab = 'personal-details';
    }

    getWorkingState() {
        if (!this.draftState) {
            this.draftState = structuredClone(getState());
        }
        return this.draftState;
    }

    loadState(state) {
        this.draftState = structuredClone(state || getState());
        this.setDirty(false);
        this.render();
        this.afterRender();
    }

    setDirty(dirty) {
        this.isDirty = Boolean(dirty);
        this.dispatchEvent(
            new CustomEvent('drawer-dirty-change', {
                detail: { isDirty: this.isDirty },
                bubbles: true,
                composed: true
            })
        );
    }

    save() {
        if (this.draftState) {
            updateState(this.draftState);
            this.setDirty(false);
            if (this.onStateChangeCallback) {
                this.onStateChangeCallback();
            }
            return true;
        }
        return false;
    }

    discard() {
        this.loadState(getState());
    }

    onInit() {
        this.addEventListener('stateChange', (e) => {
            this._handleStateChangeEvent(e);
        });

        this.addEventListener('addJob', (e) => {
            this._handleAddJob(e.detail.prefix);
        });

        this.addEventListener('removeJob', (e) => {
            this._handleRemoveJob(e.detail.prefix, e.detail.index);
        });

        this.addEventListener('addAccount', (e) => {
            this._handleAddAccount(e.detail.prefix, e.detail.type);
        });

        this.addEventListener('removeAccount', (e) => {
            this._handleRemoveAccount(e.detail.prefix, e.detail.index);
        });

        this.addEventListener('addChild', () => {
            this._handleAddChild();
        });

        this.addEventListener('removeChild', (e) => {
            this._handleRemoveChild(e.detail.index);
        });

        this.addEventListener('addMarketRate', () => {
            this._handleAddMarketRate();
        });

        this.addEventListener('removeMarketRate', (e) => {
            this._handleRemoveMarketRate(e.detail.index);
        });
    }

    _handleStateChangeEvent(e) {
        const element = e.detail.element;
        const path = element.getAttribute('data-path');
        if (!path) return;

        const val = this._extractElementValue(element, path);
        const workingState = this.getWorkingState();
        const { current, keys } = this._applyValueToPath(workingState, path, val);

        this._handleDerivedPathLogic(workingState, current, path, val, keys);
        this.setDirty(true);
    }

    _extractElementValue(element, path) {
        if (element.type === 'checkbox') {
            return element.checked;
        }
        if (element.type === 'number') {
            return Number(element.value);
        }
        if (
            element.type === 'date' ||
            element.type === 'month' ||
            (typeof element.value === 'string' && path.toLowerCase().includes('date') && element.value.includes('-'))
        ) {
            const rawVal = element.value;
            if (rawVal) {
                const normalized = normalizeDateStr(rawVal);
                if (normalized && element.value !== normalized) {
                    element.value = normalized;
                }
                return normalized;
            }
            return rawVal;
        }
        const intPaths = [
            '.month',
            '.startMonth',
            '.socialSecurityStartMonth',
            '.year',
            '.rolloverCount',
            '.termMonths'
        ];
        if (intPaths.some((p) => path.endsWith(p))) {
            return parseInt(element.value, 10) || 1;
        }
        return element.value;
    }

    _applyValueToPath(targetObj, path, val) {
        let current = targetObj;
        const keys = path.split('.');
        for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined || current[keys[i]] === null) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = val;
        return { current, keys };
    }

    _syncRule72tDerivedDates(workingState, current, path, val, spouseKey) {
        const spouse = workingState[spouseKey];
        const birthYear = Number(spouse?.yearOfBirth) || 1980;
        if (path.endsWith('.rule72t.startDate') && typeof val === 'string') {
            const parts = val.split('-');
            const rYear = parseInt(parts[0], 10);
            const rMonth = parseInt(parts[1], 10) || 1;
            if (!isNaN(rYear)) {
                current.startAge = rYear - birthYear;
                current.startMonth = rMonth;
            }
        } else if (path.endsWith('.rule72t.startAge')) {
            const rMonth = String(current.startMonth || 1).padStart(2, '0');
            current.startDate = `${birthYear + Number(val)}-${rMonth}`;
        } else if (path.endsWith('.rule72t.startMonth')) {
            const startAge = Number(current.startAge) || 55;
            const rMonth = String(val).padStart(2, '0');
            current.startDate = `${birthYear + startAge}-${rMonth}`;
        }
    }

    _handleLinked401kChange(workingState, spouseKey, currentJobIdx, val) {
        if (!workingState[spouseKey]?.jobs) return;
        if (val) {
            workingState[spouseKey].jobs.forEach((jobItem, idx) => {
                if (idx !== currentJobIdx && jobItem.linked401kAccountId === val) {
                    jobItem.linked401kAccountId = '';
                }
            });
        }
        this._applyStructuralChange();
    }

    _syncRetirementDateDerivedAge(current, val) {
        const parts = String(val || '').split('-');
        const birthYear = Number(current.yearOfBirth || current.birthYear) || 1980;
        const retYear = parseInt(parts[0], 10) || birthYear + 65;
        current.targetRetirementAge = retYear - birthYear;
    }

    _syncSsnDateDerivedAge(current, val) {
        const parts = String(val || '').split('-');
        const birthYear = Number(current.yearOfBirth || current.birthYear) || 1980;
        const ssnYear = parseInt(parts[0], 10) || birthYear + 67;
        const ssnMonth = parseInt(parts[1], 10) || 1;
        current.socialSecurityStartAge = ssnYear - birthYear;
        current.socialSecurityStartMonth = ssnMonth;
    }

    _syncSpouseDatesOnBirthYearChange(current) {
        if (current.targetRetirementDate) {
            this._syncRetirementDateDerivedAge(current, current.targetRetirementDate);
        }
        if (current.socialSecurityStartDate) {
            this._syncSsnDateDerivedAge(current, current.socialSecurityStartDate);
        }
    }

    _handleDerivedPathLogic(workingState, current, path, val, keys) {
        if (path.endsWith('.targetRetirementDate') && typeof val === 'string') {
            this._syncRetirementDateDerivedAge(current, val);
            return;
        }
        if (path.endsWith('.socialSecurityStartDate') && typeof val === 'string') {
            this._syncSsnDateDerivedAge(current, val);
            return;
        }
        if (path.endsWith('.yearOfBirth') && (keys[0] === 'primarySpouse' || keys[0] === 'secondarySpouse')) {
            this._syncSpouseDatesOnBirthYearChange(current);
            return;
        }
        if (path.endsWith('.socialSecurityMonthlyBenefit')) {
            current.socialSecurityAnnualBenefit = Number(val) * 12;
            return;
        }
        if (path.endsWith('.isActiveContributor') && val === true) {
            this._handleActiveContributorToggle(workingState, keys[0], keys[2]);
            return;
        }
        if (path.endsWith('.isSweepAccount')) {
            this._handleSweepAccountToggle(workingState, current, val);
            return;
        }
        if (path.endsWith('.linked401kAccountId')) {
            this._handleLinked401kChange(workingState, keys[0], parseInt(keys[2], 10), val);
            return;
        }
        if (path.endsWith('.rollover.enabled') && val === true) {
            this._handleRolloverEnabledToggle(workingState, keys[0], current);
            return;
        }
        if (path.includes('.rule72t.')) {
            this._syncRule72tDerivedDates(workingState, current, path, val, keys[0]);
            return;
        }
        if (path.includes('dependents') && path.endsWith('.contributionMode')) {
            this._applyStructuralChange();
        }
    }

    _handleRolloverEnabledToggle(workingState, spouseKey, rolloverObj) {
        if (!rolloverObj) return;
        if (!rolloverObj.timing) rolloverObj.timing = 'job_end';
        if (!rolloverObj.targetIraMode) rolloverObj.targetIraMode = 'existing';
        if (rolloverObj.isFullBalance === undefined) rolloverObj.isFullBalance = true;
        if (!rolloverObj.targetAccount) {
            const spouse = workingState[spouseKey];
            const firstIra = (spouse?.accounts || []).find((a) => a.type === 'standardIra');
            if (firstIra) {
                rolloverObj.targetAccount = firstIra.id || firstIra.name || 'standardIra';
            }
        }
    }

    _handleActiveContributorToggle(workingState, spouseKey, activeIdx) {
        if (workingState[spouseKey]?.accounts) {
            workingState[spouseKey].accounts.forEach((a, idx) => {
                if (idx.toString() !== activeIdx && (a.type === 'traditional401k' || a.type === 'trad403b')) {
                    a.isActiveContributor = false;
                }
            });
        }
    }

    _handleSweepAccountToggle(workingState, current, val) {
        if (val === true) {
            [workingState.primarySpouse, workingState.secondarySpouse].forEach((s) => {
                if (s?.accounts) {
                    s.accounts.forEach((a) => {
                        a.isSweepAccount = false;
                    });
                }
            });
            current.isSweepAccount = true;
        } else {
            current.isSweepAccount = false;
        }
        this.querySelectorAll('account-panel').forEach((panel) => {
            const prefix = panel.getAttribute('prefix');
            const idx = parseInt(panel.getAttribute('index'), 10);
            const acc = workingState[prefix]?.accounts?.[idx];
            const chk = panel.querySelector(`input[data-path="${prefix}.accounts.${idx}.isSweepAccount"]`);
            if (chk && acc) {
                chk.checked = Boolean(acc.isSweepAccount);
            }
            if (typeof panel._updateAccountCardSummaryText === 'function') {
                panel._updateAccountCardSummaryText();
            }
        });
    }

    _syncCardDisclosure(detailsEl, workingState, isJob) {
        const card = detailsEl.closest(isJob ? 'job-panel' : 'account-panel');
        const prefix = card?.getAttribute('prefix');
        const idx = parseInt(card?.getAttribute('index'), 10);
        if (!prefix || isNaN(idx)) return;
        const list = workingState[prefix]?.[isJob ? 'jobs' : 'accounts'];
        if (list?.[idx]) list[idx].isOpen = detailsEl.open;
    }

    _syncDisclosureElementState(detailsEl, workingState) {
        if (detailsEl.classList.contains('job-card')) {
            this._syncCardDisclosure(detailsEl, workingState, true);
            return;
        }
        if (detailsEl.classList.contains('account-card')) {
            this._syncCardDisclosure(detailsEl, workingState, false);
            return;
        }
        if (detailsEl.hasAttribute('data-child-index')) {
            const idx = parseInt(detailsEl.getAttribute('data-child-index'), 10);
            if (!isNaN(idx) && workingState.dependents?.[idx]) {
                workingState.dependents[idx].isOpen = detailsEl.open;
            }
        }
    }

    _snapshotOpenDisclosures() {
        const workingState = this.getWorkingState();
        this.querySelectorAll('details').forEach((detailsEl) => {
            this._syncDisclosureElementState(detailsEl, workingState);
        });
    }

    _applyStructuralChange() {
        this._snapshotOpenDisclosures();
        this.setDirty(true);
        this.render();
        this.afterRender();
    }

    _handleAddJob(prefix) {
        const workingState = this.getWorkingState();
        const spouse = workingState[prefix];
        if (!spouse.jobs) spouse.jobs = [];
        spouse.jobs.push({
            id: 'job-' + Math.random().toString(36).substr(2, 9),
            title: 'New Job',
            baseSalary: 0,
            startDate: `${new Date().getFullYear() + 1}-01`,
            bonusAmount: 0,
            bonusMonth: '',
            ltiAmount: 0,
            ltiMonth: '',
            isOpen: true
        });
        this._applyStructuralChange();
    }

    _handleRemoveJob(prefix, index) {
        const workingState = this.getWorkingState();
        const spouse = workingState[prefix];
        if (spouse.jobs && spouse.jobs.length > index) {
            spouse.jobs.splice(index, 1);
            this._applyStructuralChange();
        }
    }

    _handleAddAccount(prefix, type) {
        const workingState = this.getWorkingState();
        const spouse = workingState[prefix];
        if (!spouse.accounts) spouse.accounts = [];

        const prettyNames = {
            traditional401k: '401k',
            trad403b: '403b',
            standardIra: 'Standard IRA',
            rothIra: 'Roth IRA',
            taxableBrokerage: 'Taxable Brokerage',
            hysa: 'HYSA',
            cd: 'CD'
        };
        const prettyType = prettyNames[type] || type;

        const newAcc = {
            id: 'acc-' + Math.random().toString(36).substr(2, 9),
            type: type,
            name: prettyType,
            balance: 0,
            contributionPercentage: 0,
            expectedReturn: type === 'hysa' ? 4 : 5,
            isActiveContributor: false,
            isSweepAccount: false,
            isOpen: true
        };
        if (['traditional401k', 'trad403b'].includes(type)) {
            newAcc.rollover = {
                enabled: false,
                timing: 'job_end',
                startDate: `${new Date().getFullYear() + 5}-01`,
                targetIraMode: 'existing',
                targetAccount: '',
                newIraName: `${prettyType} Rollover IRA`,
                isFullBalance: true,
                amount: 0
            };
        }
        if (type === 'cd') {
            newAcc.rate = 5.0;
            newAcc.termMonths = 12;
            newAcc.maturityDate = `${new Date().getFullYear() + 1}-01`;
            newAcc.maturityAction = 'sweep';
            newAcc.rolloverCount = 1;
            newAcc.sweepTargetAccountId = '';
        }
        spouse.accounts.push(newAcc);
        this._applyStructuralChange();
    }

    _handleRemoveAccount(prefix, index) {
        const workingState = this.getWorkingState();
        const spouse = workingState[prefix];
        if (spouse.accounts && spouse.accounts.length > index) {
            spouse.accounts.splice(index, 1);
            this._applyStructuralChange();
        }
    }

    _handleAddChild() {
        const workingState = this.getWorkingState();
        workingState.dependents.push({
            name: `Child ${workingState.dependents.length + 1}`,
            yearOfBirth: new Date().getFullYear(),
            annualCollegeCost: 20000,
            currentCollegeSavingsBalance: 0,
            expectedReturn: 5.5,
            contributionMode: 'fixed',
            annualContribution: 0,
            contributionStartYear: '',
            contributionStopYear: '',
            targetCollegeSavingsBalance: 0,
            isOpen: true
        });
        this._applyStructuralChange();
    }

    _handleRemoveChild(index) {
        const workingState = this.getWorkingState();
        if (workingState.dependents && workingState.dependents.length > index) {
            workingState.dependents.splice(index, 1);
            this._applyStructuralChange();
        }
    }

    _handleAddMarketRate() {
        const workingState = this.getWorkingState();
        if (!workingState.assumptions.marketReturnRates) {
            workingState.assumptions.marketReturnRates = [{ startYear: new Date().getFullYear(), rate: 7.0 }];
        }
        const rates = workingState.assumptions.marketReturnRates;
        const lastTier = rates[rates.length - 1];
        const nextYear = lastTier && lastTier.startYear ? Number(lastTier.startYear) + 5 : new Date().getFullYear() + 5;
        rates.push({ startYear: nextYear, rate: 7.0 });
        this._applyStructuralChange();
    }

    _handleRemoveMarketRate(index) {
        const workingState = this.getWorkingState();
        if (workingState.assumptions.marketReturnRates && workingState.assumptions.marketReturnRates.length > index) {
            workingState.assumptions.marketReturnRates.splice(index, 1);
            this._applyStructuralChange();
        }
    }

    getDrawerLayoutMode() {
        const workingMode = this.getWorkingState()?.uiState?.drawerLayoutMode;
        const globalMode = getState()?.uiState?.drawerLayoutMode;
        return workingMode || globalMode || 'simplified';
    }

    setDrawerLayoutMode(mode) {
        const validMode = mode === 'classic' ? 'classic' : 'simplified';
        const workingState = this.getWorkingState();
        if (!workingState.uiState) workingState.uiState = {};
        workingState.uiState.drawerLayoutMode = validMode;
        const liveState = getState();
        if (liveState?.uiState) {
            liveState.uiState.drawerLayoutMode = validMode;
        }
        if (validMode === 'simplified') {
            const simplifiedMap = {
                kids: 'personal-details',
                'account-details': 'job-details',
                housing: 'expenses'
            };
            if (simplifiedMap[this.activeTab]) {
                this.activeTab = simplifiedMap[this.activeTab];
            }
        }
        this._snapshotOpenDisclosures();
        this.render();
        this.afterRender();
    }

    _renderTabNavigationBar() {
        const isSimplified = this.getDrawerLayoutMode() === 'simplified';
        const tabs = isSimplified
            ? [
                  ['personal-details', '1. 👤 Family & Timeline'],
                  ['job-details', '2. 💼 Income & Accounts'],
                  ['expenses', '3. 🏠 Spending & Home'],
                  ['global', '4. ⚙️ Assumptions'],
                  ['conversion-sepp-events', '5. 🔄 Tax & Strategy Knobs']
              ]
            : [
                  ['personal-details', '👤 Personal Details'],
                  ['job-details', '💼 Job Details'],
                  ['account-details', '🏦 Account Details'],
                  ['conversion-sepp-events', '🔄 Tax & Early Access (Roth / 72t)'],
                  ['expenses', '💳 Expenses'],
                  ['housing', '🏠 Housing'],
                  ['global', '🌐 Global'],
                  ['kids', '🎓 Kids']
              ];
        const buttons = tabs
            .map(
                ([tabId, label]) =>
                    `<button type="button" class="tab-button ${this.activeTab === tabId ? 'active' : ''}" data-tab="${tabId}">${label}</button>`
            )
            .join('');
        return `<div class="tabs drawer-tab-bar" data-layout-mode="${isSimplified ? 'simplified' : 'classic'}">${buttons}</div>`;
    }

    _tabDisplay(tabId, activeDisplay = 'block') {
        if (this.getDrawerLayoutMode() !== 'simplified') {
            return this.activeTab === tabId ? activeDisplay : 'none';
        }
        const simplifiedGroups = {
            'personal-details': ['personal-details', 'kids'],
            'job-details': ['job-details', 'account-details'],
            expenses: ['expenses', 'housing'],
            global: ['global'],
            'conversion-sepp-events': ['conversion-sepp-events']
        };
        const visibleTabs = simplifiedGroups[this.activeTab] || [this.activeTab];
        return visibleTabs.includes(tabId) ? activeDisplay : 'none';
    }

    getTemplate() {
        const state = this.getWorkingState();
        const isSingleMode = state.uiState?.householdMode === 'single';
        const gridCols = isSingleMode ? '1fr' : '1fr 1fr';
        const s1JobTitle = `${state.primarySpouse?.name || 'My'} Jobs & Income`;
        const s2JobTitle = `${state.secondarySpouse?.name || 'Spouse'} Jobs & Income`;
        return `
            <div class="tabs-container drawer-modern-surface">
                ${this._renderTabNavigationBar()}

                <div class="tab-content" id="tab-personal-details" style="display: ${this._tabDisplay('personal-details', 'grid')}; grid-template-columns: ${gridCols}; gap: 1.5rem; max-width: 1400px; margin-bottom: 1.5rem;">
                    <spouse-panel prefix="primarySpouse"></spouse-panel>
                    ${isSingleMode ? '' : '<spouse-panel prefix="secondarySpouse"></spouse-panel>'}
                </div>

                <div class="tab-content" id="tab-kids" style="display: ${this._tabDisplay('kids')}; max-width: 1400px; margin-bottom: 1.5rem;">
                    <children-panel></children-panel>
                </div>

                <div class="tab-content" id="tab-job-details" style="display: ${this._tabDisplay('job-details', 'grid')}; grid-template-columns: ${gridCols}; gap: 1.5rem; max-width: 1400px; margin-bottom: 1.5rem;">
                    ${this._renderJobsColumn('primarySpouse', s1JobTitle, state)}
                    ${isSingleMode ? '' : this._renderJobsColumn('secondarySpouse', s2JobTitle, state)}
                </div>

                <div class="tab-content" id="tab-account-details" style="display: ${this._tabDisplay('account-details')}; max-width: 1400px; margin-bottom: 1.5rem;">
                    <account-details-panel></account-details-panel>
                </div>

                <div class="tab-content" id="tab-expenses" style="display: ${this._tabDisplay('expenses')}; max-width: 1200px; margin-bottom: 1.5rem;">
                    <expenses-panel></expenses-panel>
                </div>

                <div class="tab-content" id="tab-housing" style="display: ${this._tabDisplay('housing')}; max-width: 1200px; margin-bottom: 1.5rem;">
                    <housing-panel></housing-panel>
                </div>

                <div class="tab-content" id="tab-global" style="display: ${this._tabDisplay('global')}; max-width: 1200px; margin-bottom: 1.5rem;">
                    <assumptions-panel></assumptions-panel>
                </div>

                <div class="tab-content" id="tab-conversion-sepp-events" style="display: ${this._tabDisplay('conversion-sepp-events')}; max-width: 1400px; margin-bottom: 1.5rem;">
                    <strategy-events-panel></strategy-events-panel>
                </div>
            </div>
        `;
    }

    _renderJobsColumn(prefix, title, state) {
        const spouseObj = state[prefix];
        if (!spouseObj) return '';

        let out = `<div class="card" style="padding: 1.25rem; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: 6px;">`;
        out += `<div class="pane-section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-light);">${escapeHtml(title)}</h3>
            <button type="button" class="btn btn-secondary add-job-btn" data-prefix="${prefix}" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;">+ Add Job</button>
        </div>`;

        const jobs = spouseObj.jobs || [];
        if (jobs.length === 0) {
            out += `<div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; margin-bottom: 0.5rem;">No active jobs configured. Click "+ Add Job" to add an employment position.</div>`;
        } else {
            jobs.forEach((job, index) => {
                out += `<job-panel prefix="${prefix}" index="${index}"></job-panel>`;
            });
        }

        out += `</div>`;
        return out;
    }

    afterRender() {
        this.querySelectorAll('.tab-button').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab =
                    btn.getAttribute('data-tab') || e.target.closest('.tab-button')?.getAttribute('data-tab');
                if (targetTab && targetTab !== this.activeTab) {
                    this._snapshotOpenDisclosures();
                    this.activeTab = targetTab;
                    this.render();
                    this.afterRender();
                }
            });
        });

        this.querySelectorAll('.add-job-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const prefix = btn.getAttribute('data-prefix');
                this.dispatchEvent(new CustomEvent('addJob', { detail: { prefix }, bubbles: true }));
            });
        });

        this.querySelectorAll('.remove-job-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const prefix = btn.getAttribute('data-prefix');
                const index = parseInt(btn.getAttribute('data-index'), 10);
                this.dispatchEvent(new CustomEvent('removeJob', { detail: { prefix, index }, bubbles: true }));
            });
        });

        this.querySelectorAll('.remove-account-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const prefix = btn.getAttribute('data-prefix');
                const index = parseInt(btn.getAttribute('data-index'), 10);
                this.dispatchEvent(new CustomEvent('removeAccount', { detail: { prefix, index }, bubbles: true }));
            });
        });
    }

    _commitState(newState, isStructuralChange = false) {
        this.draftState = newState;
        this.setDirty(true);
        if (isStructuralChange) {
            this._applyStructuralChange();
        }
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('financial-input-panel')) {
    customElements.define('financial-input-panel', FinancialInputPanel);
}

/**
 * Wrapper function to maintain compatibility with app.js
 */
export function renderInputPanel(containerId, onStateChange, forceFullRender = false) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    let panel = container.querySelector('financial-input-panel');
    if (!panel) {
        container.innerHTML = '';
        panel = document.createElement('financial-input-panel');
        panel.onStateChangeCallback = onStateChange;
        container.appendChild(panel);
    } else if (forceFullRender) {
        panel.loadState(getState());
    }
    return panel;
}
