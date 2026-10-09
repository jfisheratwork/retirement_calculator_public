import { getState, getProfiles, getActiveProfileId, switchProfile, replaceProfileData, initState, isStoragePinLocked, isStoragePinConfigured } from './services/state.js';
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
        document.addEventListener('plan-unlocked', () => {
            initAppPostUnlock();
        }, { once: true });
        return;
    }

    initAppPostUnlock();
}

function initInspectorState() {
    const showInspector = typeof localStorage !== 'undefined' && localStorage.getItem('show_data_inspector') === 'true';
    document.body.classList.toggle('show-inspector', showInspector);
    const layout = document.querySelector('.dashboard-layout');
    if (layout) {
        layout.classList.toggle('show-inspector', showInspector);
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

function initCollapsibleChartResize() {
    const chartDetails = document.querySelectorAll('details.chart-card');
    chartDetails.forEach((detailsEl) => {
        detailsEl.addEventListener('toggle', () => {
            if (detailsEl.open) {
                setTimeout(() => {
                    const canvas = detailsEl.querySelector('canvas');
                    if (canvas && window.Chart) {
                        const chartInstance = window.Chart.getChart(canvas);
                        if (chartInstance) {
                            chartInstance.resize();
                        }
                    }
                }, 50);
            }
        });
    });
}

function initAppPostUnlock() {
    initState();
    initFinancialDetailsInspector();
    initGlobalTooltips();
    initInspectorState();
    initDisclaimerBanner();
    initCollapsibleChartResize();
    
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
    const hasCompletedOnboarding = typeof localStorage !== 'undefined' && localStorage.getItem('has_completed_onboarding') === 'true';
    if (!hasCompletedOnboarding && (!state.primarySpouse.yearOfBirth || !state.primarySpouse.targetRetirementAge)) {
        if (setupPickerModalInstance) {
            setupPickerModalInstance.open();
        } else if (paramsModal) {
            paramsModal.classList.remove('hidden');
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

function bindProfileEvents() {
    if (btnLoadSample) {
        btnLoadSample.addEventListener('click', async () => {
            btnLoadSample.textContent = '⏳ Loading...';
            btnLoadSample.disabled = true;
            try {
                await loadSampleHouseholdProfile();
                updateProfileSelect();
                updateApp(true);
            } finally {
                btnLoadSample.innerHTML = '<span>📊 Samples</span>';
                btnLoadSample.disabled = false;
            }
        });
    }

    if (profileSelect) {
        profileSelect.addEventListener('change', (passedEvent) => {
            switchProfile(passedEvent.target.value);
            updateProfileSelect();
            updateApp(true);
        });
    }
    
    if (btnAddProfile) btnAddProfile.addEventListener('click', () => profileManagerModalInstance.openAdd());
    if (btnRenameProfile) btnRenameProfile.addEventListener('click', () => profileManagerModalInstance.openRename());
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
        document.addEventListener('plan-unlocked', () => {
            updateLockButtonState();
            updateApp(true);
        }, { once: true });
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

function bindParamsModalEvents() {
    if (btnSaveParams) {
        btnSaveParams.addEventListener('click', () => {
            if (!inputPanelInstance) return;
            inputPanelInstance.save();
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
        const isDirty = Boolean(e.detail && e.detail.isDirty);
        if (!btnSaveParams) return;
        btnSaveParams.disabled = !isDirty;
        if (isDirty) {
            btnSaveParams.classList.add('active');
            btnSaveParams.title = 'You have unsaved changes';
        } else {
            btnSaveParams.classList.remove('active');
            btnSaveParams.title = 'No unsaved changes';
        }
    });

    if (parkedDrawer) {
        parkedDrawer.addEventListener('click', () => {
            if (inputPanelInstance) {
                inputPanelInstance.loadState(getState());
            }
            if (btnSaveParams) {
                btnSaveParams.disabled = true;
                btnSaveParams.classList.remove('active');
                btnSaveParams.title = 'No unsaved changes';
            }
            paramsModal.classList.remove('hidden');
        });
    }

    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            if (inputPanelInstance && inputPanelInstance.isDirty) {
                inputPanelInstance.save();
            }
            paramsModal.classList.add('hidden');
        });
    }

    if (paramsModal) {
        paramsModal.addEventListener('click', (e) => {
            if (e.target !== paramsModal) return;
            if (inputPanelInstance && inputPanelInstance.isDirty) {
                inputPanelInstance.save();
            }
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

function _bindModeButtons(updateActiveModePill) {
    const modeButtons = document.querySelectorAll('.mode-pill-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
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
                if (paramsModal) paramsModal.classList.remove('hidden');
            }
        });
    });

    if (btnOpenSetup) {
        btnOpenSetup.addEventListener('click', () => {
            if (setupPickerModalInstance) setupPickerModalInstance.open();
        });
    }
}

function _bindSetupPickerEvents(updateActiveModePill) {
    if (!setupPickerModalInstance) return;

    setupPickerModalInstance.addEventListener('select-mode', (e) => {
        const mode = e.detail?.mode || 'express';
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
            if (paramsModal) paramsModal.classList.remove('hidden');
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('has_completed_onboarding', 'true');
            }
        }
    });

    setupPickerModalInstance.addEventListener('load-sample', async () => {
        setupPickerModalInstance.close();
        if (btnLoadSample) btnLoadSample.click();
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('has_completed_onboarding', 'true');
        }
    });
}

function _bindExpressModalEvents(updateActiveModePill) {
    if (!expressModalInstance) return;

    expressModalInstance.addEventListener('express-complete', (e) => {
        const formData = e.detail?.formData;
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

    guidedModalInstance.addEventListener('guided-complete', (e) => {
        const guidedData = e.detail;
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
        modeButtons.forEach(btn => {
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
            if (val === "") {
                const advisor = document.querySelector('financial-details-inspector') || document.querySelector('nerd-advisor');
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
            focusYearSelect.value = "";
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
    profiles.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        if (p.id === activeId) option.selected = true;
        profileSelect.appendChild(option);
    });
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
    defOpt.value = "";
    defOpt.textContent = "-- None --";
    focusYearSelect.appendChild(defOpt);
    
    simData.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${d.year} (Age ${d.age1} / ${d.age2})`;
        focusYearSelect.appendChild(opt);
    });
    
    const activePin = getPinnedYearIndex();
    if (activePin !== null && activePin < simData.length) {
        focusYearSelect.value = activePin.toString();
    } else {
        focusYearSelect.value = "";
    }
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

    // 2. Run simulation, SORR & Stress Tests
    const { simResult, sorrData, stressResults } = runAllSimulations(currentState);
    if (typeof window !== 'undefined') {
        window.__lastSimResult = simResult;
    }
    
    // Render visual stress alerts above top KPI charts
    renderStressAlerts('stress-test-alerts', stressResults);

    // Calculate and render FIRE Milestones & Drawer
    const fireMilestones = FireMilestoneCalculator.computeMilestones(simResult.data, currentState);
    renderFireIndicator('fire-indicator-container', fireMilestones);
    const fireDrawer = document.getElementById('fire-drawer');
    if (fireDrawer && typeof fireDrawer.updateData === 'function') {
        fireDrawer.updateData(simResult.data, currentState, fireMilestones);
    }

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


