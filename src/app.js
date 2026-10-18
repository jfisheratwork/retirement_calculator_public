import {
    getState,
    getProfiles,
    getActiveProfileId,
    switchProfile,
    createProfile,
    renameProfile,
    replaceProfileData,
    initState,
    isStoragePinLocked,
    isStoragePinConfigured
} from './services/state.js';
import { loadSampleHouseholdProfile } from './services/sample-profile.js';
import { renderCharts, setPinnedYearIndex, getPinnedYearIndex } from './components/charts.js';
import { renderInputPanel } from './components/input-panel.js';
import { initFinancialDetailsInspector, renderFinancialDetails } from './components/financial-details-inspector.js';
import { renderUnderTheHood } from './components/under-the-hood.js';
import { runAllSimulations } from './services/ScenarioManager.js';
import './components/ui-modals.js';
import './components/pin-lock-modal.js';
import './components/pin-unlock-modal.js';
import { renderStressAlerts } from './components/stress-alerts.js';
import { initGlobalTooltips } from './components/tooltip.js';
import { FireMilestoneCalculator } from './services/FireMilestoneCalculator.js';
import { renderFireIndicator } from './components/fire-indicator.js';
import './components/fire-drawer.js';
import './components/what-if-drawer.js';
import { StateSyncBridge } from './services/StateSyncBridge.js';
import './components/setup-picker-modal.js';
import './components/express-onboarding-modal.js';
import './components/guided-planner-wizard.js';
import './components/micro-expand-drawer.js';
import { SurplusPullForwardEngine } from './services/SurplusPullForwardEngine.js';
import { renderPullForwardBanner } from './components/pull-forward-banner.js';

// DOM Elements
let btnLoadSample;
let profileSelect;
let focusYearSelect;
let btnAddProfile;
let btnRenameProfile;
let btnDeleteProfile;
let btnEditParams;
let btnOpenWhatIf;
let btnLockData;
let btnOpenSetup;
let parkedDrawer;
let paramsModal;
let btnCloseModal;
let btnSaveParams;
let drawerScenarioNameInput;
let isScenarioNameDirty = false;
let inputPanelInstance = null;

let settingsModalInstance;
let profileManagerModalInstance;
let whatIfDrawerInstance;
let pinLockModalInstance;
let pinUnlockModalInstance;
let setupPickerModalInstance;
let expressModalInstance;
let guidedModalInstance;

function bootstrap() {
    pinLockModalInstance = document.querySelector('pin-lock-modal');
    pinUnlockModalInstance = document.querySelector('pin-unlock-modal');

    // Check if storage is locked with PIN before hydrating
    if (isStoragePinLocked()) {
        if (pinUnlockModalInstance) {
            pinUnlockModalInstance.open();
        }
        document.addEventListener(
            'plan-unlocked',
            () => {
                initAppPostUnlock();
            },
            { once: true }
        );
        return;
    }

    initAppPostUnlock();
}

function initInspectorState() {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('show_data_inspector', 'true');
    }
    document.body.classList.add('show-inspector');
    const layout = document.querySelector('.dashboard-layout');
    if (layout) {
        layout.classList.add('show-inspector');
    }
}

function initDisclaimerBanner() {
    const banner = document.getElementById('disclaimer-banner');
    const dismissBtn = document.getElementById('btn-dismiss-disclaimer');
    if (!banner) return;

    const dismiss = () => {
        banner.classList.add('dismissed');
        setTimeout(() => {
            banner.style.display = 'none';
        }, 500);
    };

    if (dismissBtn) {
        dismissBtn.addEventListener('click', dismiss);
    }

    // Auto-hide after 2 minutes (120,000ms)
    setTimeout(() => {
        if (banner && !banner.classList.contains('dismissed')) {
            dismiss();
        }
    }, 120000);
}

function resizeVisibleStageCharts() {
    const runResize = () => {
        const activePane = document.querySelector('.chart-stage-pane:not(.hidden)');
        if (!activePane || !window.Chart) return;
        activePane.querySelectorAll('canvas').forEach((canvas) => {
            const chartInstance = window.Chart.getChart(canvas);
            if (chartInstance) {
                chartInstance.resize();
                chartInstance.update('none');
            }
        });
    };
    runResize();
    setTimeout(runResize, 40);
}

function syncUnifiedChartStageUI(state) {
    if (!state.uiState) state.uiState = {};
    const activeTab = state.uiState.activeChartTab || 'portfolio';
    document.querySelectorAll('.stage-tab-pill').forEach((btn) => {
        const isMatch = btn.dataset.chartTab === activeTab;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    document.querySelectorAll('.chart-stage-pane').forEach((pane) => {
        const isTarget = pane.id === `chart-pane-${activeTab}`;
        pane.classList.toggle('hidden', !isTarget);
        pane.classList.toggle('active', isTarget);
    });

    const portfolioCtrl = document.getElementById('stage-portfolio-mode-control');
    const incomeCtrl = document.getElementById('stage-income-mode-control');
    const taxesCtrl = document.getElementById('stage-taxes-mode-control');
    if (portfolioCtrl) portfolioCtrl.classList.toggle('hidden', activeTab !== 'portfolio');
    if (incomeCtrl) incomeCtrl.classList.toggle('hidden', activeTab !== 'income');
    if (taxesCtrl) taxesCtrl.classList.toggle('hidden', activeTab !== 'taxes-cashflow');

    const portMode = state.uiState.portfolioViewMode || 'individual';
    document.querySelectorAll('#portfolio-view-mode-group .stage-mini-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.portfolioMode === portMode);
    });

    const incMode = state.uiState.incomeDetailView ? 'detail' : 'simple';
    document.querySelectorAll('#income-detail-mode-group .stage-mini-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.incomeDetail === incMode);
    });

    const realBtn = document.getElementById('btn-stage-real-dollars');
    if (realBtn) {
        const isReal = Boolean(state.uiState.showRealDollars ?? state.assumptions?.displayRealDollars);
        realBtn.classList.toggle('active', isReal);
        realBtn.setAttribute('aria-pressed', isReal ? 'true' : 'false');
        const toggleText = realBtn.querySelector('.toggle-text');
        if (toggleText) {
            toggleText.textContent = isReal ? 'ON' : 'OFF';
        }
    }
}

function syncUiStateToDraft(state) {
    if (inputPanelInstance?.draftState && state?.uiState) {
        inputPanelInstance.draftState.uiState = {
            ...(inputPanelInstance.draftState.uiState || {}),
            ...state.uiState
        };
        if (inputPanelInstance.draftState.assumptions && state.assumptions) {
            inputPanelInstance.draftState.assumptions.displayRealDollars = state.assumptions.displayRealDollars;
        }
    }
}

function initUnifiedChartStage() {
    document.querySelectorAll('.stage-tab-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.chartTab || 'portfolio';
            const state = getState();
            if (!state.uiState) state.uiState = {};
            state.uiState.activeChartTab = targetTab;
            syncUiStateToDraft(state);
            syncUnifiedChartStageUI(state);
            resizeVisibleStageCharts();
        });
    });

    document.querySelectorAll('#portfolio-view-mode-group .stage-mini-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.portfolioMode || 'individual';
            const state = getState();
            if (!state.uiState) state.uiState = {};
            state.uiState.portfolioViewMode = mode;
            syncUiStateToDraft(state);
            syncUnifiedChartStageUI(state);
            updateApp(false);
        });
    });

    document.querySelectorAll('#income-detail-mode-group .stage-mini-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const isDetail = btn.dataset.incomeDetail === 'detail';
            const state = getState();
            if (!state.uiState) state.uiState = {};
            state.uiState.incomeDetailView = isDetail;
            syncUiStateToDraft(state);
            syncUnifiedChartStageUI(state);
            updateApp(false);
        });
    });

    document.querySelectorAll('#taxes-subview-group .stage-mini-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const subview = btn.dataset.taxesSubview || 'cashflow';
            document.querySelectorAll('#taxes-subview-group .stage-mini-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.taxesSubview === subview);
            });
            const cfPane = document.getElementById('subpane-cashflow');
            const taxPane = document.getElementById('subpane-tax');
            const nwPane = document.getElementById('subpane-networth');
            if (cfPane) cfPane.classList.toggle('hidden', subview !== 'cashflow');
            if (taxPane) taxPane.classList.toggle('hidden', subview !== 'tax');
            if (nwPane) nwPane.classList.toggle('hidden', subview !== 'networth');
            resizeVisibleStageCharts();
        });
    });

    const realBtn = document.getElementById('btn-stage-real-dollars');
    if (realBtn) {
        realBtn.addEventListener('click', () => {
            const state = getState();
            if (!state.uiState) state.uiState = {};
            const nextReal = !state.uiState.showRealDollars;
            state.uiState.showRealDollars = nextReal;
            if (state.assumptions) {
                state.assumptions.displayRealDollars = nextReal;
            }
            syncUiStateToDraft(state);
            syncUnifiedChartStageUI(state);
            updateApp(false);
        });
    }

    const stageEl = document.getElementById('unified-chart-stage');
    if (stageEl) {
        stageEl.addEventListener('mouseleave', () => {
            const inspector = document.getElementById('chart-inspector');
            if (inspector) inspector.classList.add('hidden');
        });
    }
}

function syncDrawerLayoutSwitcherUI() {
    const mode =
        (inputPanelInstance && typeof inputPanelInstance.getDrawerLayoutMode === 'function'
            ? inputPanelInstance.getDrawerLayoutMode()
            : getState()?.uiState?.drawerLayoutMode) || 'simplified';
    document.querySelectorAll('#drawer-layout-switcher .drawer-mode-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.drawerMode === mode);
    });
}

function initDrawerLayoutSwitcher() {
    document.querySelectorAll('#drawer-layout-switcher .drawer-mode-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.drawerMode === 'classic' ? 'classic' : 'simplified';
            if (inputPanelInstance && typeof inputPanelInstance.setDrawerLayoutMode === 'function') {
                inputPanelInstance.setDrawerLayoutMode(mode);
            } else {
                const state = getState();
                if (state?.uiState) state.uiState.drawerLayoutMode = mode;
            }
            syncDrawerLayoutSwitcherUI();
        });
    });
}

function initInsightsBoxToggle() {
    const insightsBox = document.getElementById('insights-box');
    if (!insightsBox) return;
    const toggleLabel = insightsBox.querySelector('.insights-toggle-btn');
    insightsBox.addEventListener('toggle', () => {
        if (toggleLabel) {
            toggleLabel.textContent = insightsBox.open ? 'Hide Insights ▴' : 'Show Insights ▾';
        }
    });
}

function initAppPostUnlock() {
    initState();
    initFinancialDetailsInspector();
    initGlobalTooltips();
    initInspectorState();
    initDisclaimerBanner();
    initUnifiedChartStage();
    initDrawerLayoutSwitcher();
    initInsightsBoxToggle();

    // Select DOM nodes
    btnLoadSample = document.getElementById('btn-load-sample');
    profileSelect = document.getElementById('profile-select');
    focusYearSelect = document.getElementById('focus-year-select');
    btnAddProfile = document.getElementById('btn-add-profile');
    btnRenameProfile = document.getElementById('btn-rename-profile');
    btnDeleteProfile = document.getElementById('btn-delete-profile');
    btnEditParams = document.getElementById('btn-edit-params');
    btnOpenWhatIf = document.getElementById('btn-open-whatif');
    btnLockData = document.getElementById('btn-lock-data');
    parkedDrawer = document.getElementById('parked-drawer');
    paramsModal = document.getElementById('params-modal');
    btnCloseModal = document.getElementById('btn-close-modal');
    btnSaveParams = document.getElementById('btn-save-params');
    btnOpenSetup = document.getElementById('btn-open-setup');
    drawerScenarioNameInput = document.getElementById('drawer-scenario-name-input');

    // Init Modals
    settingsModalInstance = document.querySelector('settings-modal');
    profileManagerModalInstance = document.querySelector('profile-manager-modal');
    whatIfDrawerInstance = document.querySelector('what-if-drawer');
    setupPickerModalInstance = document.querySelector('setup-picker-modal');
    expressModalInstance = document.querySelector('express-onboarding-modal');
    guidedModalInstance = document.querySelector('guided-planner-wizard');

    bindEvents();
    initModeSwitcher();
    updateProfileSelect();
    updateLockButtonState();

    const state = getState();
    const hasCompletedOnboarding =
        typeof localStorage !== 'undefined' && localStorage.getItem('has_completed_onboarding') === 'true';
    if (!hasCompletedOnboarding && (!state.primarySpouse.yearOfBirth || !state.primarySpouse.targetRetirementAge)) {
        if (setupPickerModalInstance) {
            const activeProfile = getProfiles().find((p) => p.id === getActiveProfileId());
            setupPickerModalInstance.open(activeProfile ? activeProfile.name : 'My Retirement Plan');
        } else if (paramsModal) {
            openRetirementDetailsDrawer(false);
        }
    }

    updateApp();
}

function updateLockButtonState() {
    if (!btnLockData) return;
    const isConfigured = isStoragePinConfigured();
    btnLockData.textContent = isConfigured ? '🛡️' : '🔒';
    btnLockData.title = isConfigured ? 'PIN Protection Active (Click to manage/lock)' : 'Set PIN Lock Security';
}

function syncScenarioNameInput() {
    if (!drawerScenarioNameInput) return;
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    const activeProfile = profiles.find((p) => p.id === activeId);
    drawerScenarioNameInput.value = activeProfile ? activeProfile.name : 'Default Scenario';
    isScenarioNameDirty = false;
}

function commitDrawerChanges() {
    if (drawerScenarioNameInput && isScenarioNameDirty) {
        const nextName = drawerScenarioNameInput.value.trim();
        if (nextName) {
            renameProfile(getActiveProfileId(), nextName);
            updateProfileSelect();
        }
        isScenarioNameDirty = false;
    }
    if (inputPanelInstance && inputPanelInstance.isDirty) {
        inputPanelInstance.save();
    }
}

function openRetirementDetailsDrawer(focusScenarioName = false) {
    if (inputPanelInstance) {
        inputPanelInstance.loadState(getState());
    }
    syncScenarioNameInput();
    if (btnSaveParams) {
        btnSaveParams.disabled = true;
        btnSaveParams.classList.remove('active');
        btnSaveParams.title = 'No unsaved changes';
    }
    if (paramsModal) {
        paramsModal.classList.remove('hidden');
    }
    if (focusScenarioName && drawerScenarioNameInput) {
        setTimeout(() => {
            drawerScenarioNameInput.focus();
            drawerScenarioNameInput.select();
        }, 30);
    }
}

async function handleLoadSampleProfile() {
    if (btnLoadSample) {
        btnLoadSample.textContent = '⏳ Loading...';
        btnLoadSample.disabled = true;
    }
    try {
        await loadSampleHouseholdProfile();
        updateProfileSelect();
        updateApp(true);
    } finally {
        if (btnLoadSample) {
            btnLoadSample.innerHTML = '<span>📊 Samples</span>';
            btnLoadSample.disabled = false;
        }
    }
}

function bindProfileEvents() {
    if (btnLoadSample) {
        btnLoadSample.addEventListener('click', handleLoadSampleProfile);
    }

    if (profileSelect) {
        profileSelect.addEventListener('change', (passedEvent) => {
            switchProfile(passedEvent.target.value);
            updateProfileSelect();
            updateApp(true);
        });
    }

    if (btnAddProfile) {
        btnAddProfile.addEventListener('click', () => {
            const existingProfiles = getProfiles();
            const newName = `Scenario ${existingProfiles.length + 1}`;
            const newId = createProfile(newName, true);
            switchProfile(newId);
            updateProfileSelect();
            updateApp(true);
            openRetirementDetailsDrawer(true);
        });
    }
    if (btnRenameProfile) {
        btnRenameProfile.addEventListener('click', () => openRetirementDetailsDrawer(true));
    }
    if (btnDeleteProfile) {
        btnDeleteProfile.addEventListener('click', () => {
            if (getProfiles().length <= 1) return;
            profileManagerModalInstance.openDelete();
        });
    }

    if (btnEditParams) {
        btnEditParams.addEventListener('click', () => {
            settingsModalInstance.open();
        });
    }

    if (btnLockData) {
        btnLockData.addEventListener('click', () => {
            if (pinLockModalInstance) pinLockModalInstance.open();
        });
    }

    document.addEventListener('pin-status-changed', () => {
        updateLockButtonState();
    });

    document.addEventListener('session-locked', () => {
        updateLockButtonState();
        if (pinUnlockModalInstance) pinUnlockModalInstance.open();
        document.addEventListener(
            'plan-unlocked',
            () => {
                updateLockButtonState();
                updateApp(true);
            },
            { once: true }
        );
    });

    document.addEventListener('import-ready', (passedEvent) => {
        const { data, filename } = passedEvent.detail;
        profileManagerModalInstance.openImport(data, filename);
    });

    document.addEventListener('profile-updated', () => {
        updateProfileSelect();
        updateApp(true);
    });
}

function setSaveButtonDirtyState(isDirty) {
    if (!btnSaveParams) return;
    btnSaveParams.disabled = !isDirty;
    if (isDirty) {
        btnSaveParams.classList.add('active');
        btnSaveParams.title = 'You have unsaved changes';
    } else {
        btnSaveParams.classList.remove('active');
        btnSaveParams.title = 'No unsaved changes';
    }
}

function bindParamsModalEvents() {
    if (drawerScenarioNameInput) {
        drawerScenarioNameInput.addEventListener('input', () => {
            isScenarioNameDirty = true;
            setSaveButtonDirtyState(true);
        });
    }

    if (btnSaveParams) {
        btnSaveParams.addEventListener('click', () => {
            commitDrawerChanges();
            btnSaveParams.textContent = 'Saved ✓';
            btnSaveParams.classList.remove('active');
            btnSaveParams.classList.add('saved');
            btnSaveParams.disabled = true;
            setTimeout(() => {
                btnSaveParams.textContent = '💾 Save';
                btnSaveParams.classList.remove('saved');
            }, 2000);
        });
    }

    document.addEventListener('drawer-dirty-change', (e) => {
        const isDirty = Boolean((e.detail && e.detail.isDirty) || isScenarioNameDirty);
        setSaveButtonDirtyState(isDirty);
    });

    if (parkedDrawer) {
        parkedDrawer.addEventListener('click', () => openRetirementDetailsDrawer(false));
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            commitDrawerChanges();
            paramsModal.classList.add('hidden');
        });
    }

    if (paramsModal) {
        paramsModal.addEventListener('click', (e) => {
            if (e.target !== paramsModal) return;
            commitDrawerChanges();
            paramsModal.classList.add('hidden');
        });
    }
}

function bindExplainModalEvents() {
    const explainParkedDrawer = document.getElementById('explain-parked-drawer');
    const explainModal = document.getElementById('explain-modal');
    const btnCloseExplain = document.getElementById('btn-close-explain');

    if (explainParkedDrawer && explainModal) {
        explainParkedDrawer.addEventListener('click', () => {
            explainModal.classList.remove('hidden');
        });
    }

    if (btnCloseExplain && explainModal) {
        btnCloseExplain.addEventListener('click', () => {
            explainModal.classList.add('hidden');
        });
    }

    if (explainModal) {
        explainModal.addEventListener('click', (e) => {
            if (e.target === explainModal) {
                explainModal.classList.add('hidden');
            }
        });
    }
}

function bindDrawerEvents() {
    bindParamsModalEvents();
    bindExplainModalEvents();

    if (btnOpenWhatIf && whatIfDrawerInstance) {
        btnOpenWhatIf.addEventListener('click', () => {
            whatIfDrawerInstance.toggle();
        });
    }
}

function _closeAllOnboardingModals() {
    if (expressModalInstance) expressModalInstance.close();
    if (guidedModalInstance) guidedModalInstance.close();
    if (setupPickerModalInstance) setupPickerModalInstance.close();
    if (paramsModal) paramsModal.classList.add('hidden');
}

function _bindModeButtons(updateActiveModePill) {
    const modeButtons = document.querySelectorAll('.mode-pill-btn');
    modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            _closeAllOnboardingModals();
            updateActiveModePill(mode);
            if (mode === 'express') {
                if (expressModalInstance) {
                    expressModalInstance.setViewModel(StateSyncBridge.toExpressViewModel(getState()));
                    expressModalInstance.open();
                }
            } else if (mode === 'guided') {
                if (guidedModalInstance) {
                    guidedModalInstance.setViewModel(StateSyncBridge.toGuidedViewModel(getState()));
                    guidedModalInstance.open();
                }
            } else if (mode === 'advanced') {
                openRetirementDetailsDrawer(false);
            }
        });
    });

    if (btnOpenSetup) {
        btnOpenSetup.addEventListener('click', () => {
            _closeAllOnboardingModals();
            const activeProfile = getProfiles().find((p) => p.id === getActiveProfileId());
            const currentName = activeProfile ? activeProfile.name : 'My Retirement Plan';
            if (setupPickerModalInstance) setupPickerModalInstance.open(currentName);
        });
    }
}

function _bindSetupPickerEvents(updateActiveModePill) {
    if (!setupPickerModalInstance) return;

    setupPickerModalInstance.addEventListener('select-mode', (e) => {
        const mode = e.detail?.mode || 'express';
        const chosenScenarioName = e.detail?.scenarioName;
        if (chosenScenarioName) {
            renameProfile(getActiveProfileId(), chosenScenarioName);
            updateProfileSelect();
        }
        _closeAllOnboardingModals();
        updateActiveModePill(mode);
        const currProfile = getProfiles().find((p) => p.id === getActiveProfileId());
        const activeName = currProfile ? currProfile.name : chosenScenarioName || 'My Retirement Plan';
        if (mode === 'express') {
            if (expressModalInstance) {
                const vm = { ...StateSyncBridge.toExpressViewModel(getState()), scenarioName: activeName };
                expressModalInstance.setViewModel(vm);
                expressModalInstance.open();
            }
        } else if (mode === 'guided') {
            if (guidedModalInstance) {
                const vm = { ...StateSyncBridge.toGuidedViewModel(getState()), scenarioName: activeName };
                guidedModalInstance.setViewModel(vm);
                guidedModalInstance.open();
            }
        } else if (mode === 'advanced') {
            openRetirementDetailsDrawer(false);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('has_completed_onboarding', 'true');
            }
        }
    });

    setupPickerModalInstance.addEventListener('load-sample', async () => {
        setupPickerModalInstance.close();
        await handleLoadSampleProfile();
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('has_completed_onboarding', 'true');
        }
    });
}

function _bindExpressModalEvents(updateActiveModePill) {
    if (!expressModalInstance) return;

    expressModalInstance.addEventListener('express-complete', (e) => {
        const formData = e.detail?.formData;
        const scenarioName = e.detail?.scenarioName;
        if (scenarioName) {
            renameProfile(getActiveProfileId(), scenarioName);
            updateProfileSelect();
        }
        if (formData) {
            const currState = getState();
            const updatedState = StateSyncBridge.applyExpressUpdate(currState, formData);
            replaceProfileData(getActiveProfileId(), updatedState);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('has_completed_onboarding', 'true');
                localStorage.setItem('active_mode', 'express');
            }
            updateActiveModePill('express');
            updateApp(true);
        }
        expressModalInstance.close();
    });
}

function _bindGuidedModalEvents(updateActiveModePill) {
    if (!guidedModalInstance) return;

    guidedModalInstance.addEventListener('guided-cancel', () => {
        guidedModalInstance.close();
    });

    guidedModalInstance.addEventListener('guided-complete', (e) => {
        const guidedData = e.detail;
        const scenarioName = e.detail?.scenarioName;
        if (scenarioName) {
            renameProfile(getActiveProfileId(), scenarioName);
            updateProfileSelect();
        }
        if (guidedData) {
            const currState = getState();
            let updatedState = currState;
            if (guidedData.step1) updatedState = StateSyncBridge.applyGuidedUpdate(updatedState, guidedData.step1, 1);
            if (guidedData.step2) updatedState = StateSyncBridge.applyGuidedUpdate(updatedState, guidedData.step2, 2);
            if (guidedData.step3) updatedState = StateSyncBridge.applyGuidedUpdate(updatedState, guidedData.step3, 3);
            if (guidedData.step4) updatedState = StateSyncBridge.applyGuidedUpdate(updatedState, guidedData.step4, 4);

            replaceProfileData(getActiveProfileId(), updatedState);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('has_completed_onboarding', 'true');
                localStorage.setItem('active_mode', 'guided');
            }
            updateActiveModePill('guided');
            updateApp(true);
        }
        guidedModalInstance.close();
    });
}

function initModeSwitcher() {
    const modeButtons = document.querySelectorAll('.mode-pill-btn');
    const updateActiveModePill = (mode) => {
        modeButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('active_mode', mode);
        }
    };

    const initialMode = (typeof localStorage !== 'undefined' && localStorage.getItem('active_mode')) || 'express';
    updateActiveModePill(initialMode);

    _bindModeButtons(updateActiveModePill);
    _bindSetupPickerEvents(updateActiveModePill);
    _bindExpressModalEvents(updateActiveModePill);
    _bindGuidedModalEvents(updateActiveModePill);
}

function bindEvents() {
    if (focusYearSelect) {
        focusYearSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === '') {
                const advisor =
                    document.querySelector('financial-details-inspector') || document.querySelector('nerd-advisor');
                if (advisor) {
                    advisor.close();
                } else {
                    setPinnedYearIndex(null);
                    updateApp();
                }
            } else {
                setPinnedYearIndex(parseInt(val, 10));
                updateApp();
            }
        });
    }

    document.addEventListener('changeYearIndex', (e) => {
        const newIndex = e.detail?.yearIndex;
        if (typeof newIndex === 'number' && !isNaN(newIndex)) {
            setPinnedYearIndex(newIndex);
            if (focusYearSelect) {
                focusYearSelect.value = newIndex.toString();
            }
            updateApp();
        }
    });

    document.addEventListener('closeAdvisor', () => {
        setPinnedYearIndex(null);
        if (focusYearSelect) {
            focusYearSelect.value = '';
        }
        updateApp();
    });

    bindProfileEvents();
    bindDrawerEvents();

    const sorrSelect = document.getElementById('sorr-scenario-select');
    if (sorrSelect) {
        sorrSelect.addEventListener('change', (e) => {
            const newState = JSON.parse(JSON.stringify(getState()));
            newState.strategies.sorrScenario = e.target.value;
            replaceProfileData(getActiveProfileId(), newState);
            onInputChanged();
        });
    }

    document.addEventListener('state-updated', () => {
        updateApp(true);
    });
}

function updateProfileSelect() {
    const profiles = getProfiles();
    const activeId = getActiveProfileId();
    if (!profileSelect) return;
    profileSelect.innerHTML = '';
    profiles.forEach((p) => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        if (p.id === activeId) option.selected = true;
        profileSelect.appendChild(option);
    });
    syncScenarioNameInput();
    if (btnDeleteProfile) {
        if (profiles.length <= 1) {
            btnDeleteProfile.disabled = true;
            btnDeleteProfile.style.opacity = '0.35';
            btnDeleteProfile.style.cursor = 'not-allowed';
            btnDeleteProfile.title = 'Cannot delete the only profile';
        } else {
            btnDeleteProfile.disabled = false;
            btnDeleteProfile.style.opacity = '1';
            btnDeleteProfile.style.cursor = 'pointer';
            btnDeleteProfile.title = 'Delete Profile';
        }
    }
}

function populateFocusYearDropdown(simData) {
    if (!focusYearSelect) return;

    focusYearSelect.innerHTML = '';
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '-- None --';
    focusYearSelect.appendChild(defOpt);

    simData.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = d.age2 && d.age2 > 0 ? `${d.year} (Age ${d.age1} / ${d.age2})` : `${d.year} (Age ${d.age1})`;
        focusYearSelect.appendChild(opt);
    });

    const activePin = getPinnedYearIndex();
    if (activePin !== null && activePin < simData.length) {
        focusYearSelect.value = activePin.toString();
    } else {
        focusYearSelect.value = '';
    }
}

function updateInsightsSummaryBadge(stressResults, pullForwardReport) {
    const badgeEl = document.getElementById('insights-count-badge');
    if (!badgeEl) return;
    const riskCount = Array.isArray(stressResults)
        ? stressResults.filter((r) => r.status === 'depleted' || r.status === 'bridge_gap').length
        : 0;
    const hasPullForward = Boolean(
        pullForwardReport?.surplusAnalysis?.isOverfunded || pullForwardReport?.liquidityLockout?.hasLockoutGap
    );
    const parts = ['FIRE Milestones'];
    parts.push(riskCount > 0 ? `${riskCount} Crash Risks` : '0 Crash Risks');
    if (hasPullForward) parts.push('Pull-Forward Opportunity');
    badgeEl.textContent = parts.join(' • ');
}

// Core re-render function
let updateAppTimer = null;
export function debouncedUpdateApp(delayMs = 150) {
    if (updateAppTimer) clearTimeout(updateAppTimer);
    updateAppTimer = setTimeout(() => {
        updateApp(false);
    }, delayMs);
}

function updateApp(forceInputPanelRedraw = false) {
    const currentState = getState();

    // 1. Re-render input panel
    inputPanelInstance = renderInputPanel('input-container', onInputChanged, forceInputPanelRedraw);
    syncUnifiedChartStageUI(currentState);
    syncDrawerLayoutSwitcherUI();

    // 2. Run simulation, SORR & Stress Tests
    const { simResult, sorrData, stressResults } = runAllSimulations(currentState);
    if (typeof window !== 'undefined') {
        window.__lastSimResult = simResult;
        window.__appState = currentState;
        window.__updateApp = updateApp;
    }

    // Render visual stress alerts inside unified Insights box
    renderStressAlerts('stress-test-alerts', stressResults);

    // Evaluate and render Terminal Surplus Pull-Forward & Bridge Opportunity Row (SPEC-068 / SPEC-072)
    const pullForwardReport = SurplusPullForwardEngine.evaluate(currentState, simResult.data);
    renderPullForwardBanner('pull-forward-banner', pullForwardReport, () => {
        if (whatIfDrawerInstance) {
            whatIfDrawerInstance.open();
        }
    });

    // Calculate and render FIRE Milestones & Drawer
    const fireOptions = currentState?.strategies?.fireOptions || {};
    const fireMilestones = FireMilestoneCalculator.computeMilestones(simResult.data, currentState, fireOptions);
    renderFireIndicator('fire-indicator-container', fireMilestones);
    const fireDrawer = document.getElementById('fire-drawer');
    if (fireDrawer && typeof fireDrawer.updateData === 'function') {
        fireDrawer.updateData(simResult.data, currentState, fireMilestones);
    }

    updateInsightsSummaryBadge(stressResults, pullForwardReport);
    renderUnderTheHood('explain-content', currentState);

    // 3. Update Charts & Alerts
    renderCharts(simResult.data, currentState, simResult.events, sorrData);

    populateFocusYearDropdown(simResult.data);

    const activeIndex = getPinnedYearIndex();
    if (activeIndex !== null && activeIndex < simResult.data.length) {
        const snap = simResult.data[activeIndex];
        if (snap) {
            renderFinancialDetails(snap, currentState, activeIndex, simResult.data);
        }
    }

    const sorrSelect = document.getElementById('sorr-scenario-select');
    if (sorrSelect) {
        sorrSelect.value = currentState.strategies.sorrScenario || 'average';
    }

    // Refresh What-If drawer if currently open
    if (whatIfDrawerInstance && whatIfDrawerInstance.isOpen) {
        whatIfDrawerInstance.render();
    }
}

function onInputChanged() {
    debouncedUpdateApp(150);
}

// Start application
bootstrap();
