import { getState, getProfiles, getActiveProfileId, switchProfile, replaceProfileData, initState } from './services/state.js';
import { loadSampleHouseholdProfile } from './services/sample-profile.js';
import { renderCharts, setPinnedYearIndex, getPinnedYearIndex } from './components/charts.js';
import { renderInputPanel } from './components/input-panel.js';
import { initNerdAdvisor, renderNerdDetails } from './components/nerd-advisor.js';
import { renderUnderTheHood } from './components/under-the-hood.js';
import { runAllSimulations } from './services/ScenarioManager.js';
import './components/ui-modals.js';
import './components/ai-advisor.js';
import { renderStressAlerts } from './components/stress-alerts.js';
import { initGlobalTooltips } from './components/tooltip.js';
import { aiAssistant } from './services/AIAssistant.js';
import { FireMilestoneCalculator } from './services/FireMilestoneCalculator.js';
import { renderFireIndicator } from './components/fire-indicator.js';
import './components/fire-drawer.js';
import './components/what-if-drawer.js';

// DOM Elements
let btnLoadSample;
let profileSelect;
let focusYearSelect;
let btnAddProfile;
let btnRenameProfile;
let btnDeleteProfile;
let btnEditParams;
let btnOpenAi;
let btnOpenWhatIf;
let parkedDrawer;
let paramsModal;
let btnCloseModal;
let btnSaveParams;
let inputPanelInstance = null;

let settingsModalInstance;
let profileManagerModalInstance;
let aiAdvisorInstance;
let whatIfDrawerInstance;

function bootstrap() {
    initState();
    initNerdAdvisor();
    initGlobalTooltips();
    
    // Select DOM nodes
    btnLoadSample = document.getElementById('btn-load-sample');
    profileSelect = document.getElementById('profile-select');
    focusYearSelect = document.getElementById('focus-year-select');
    btnAddProfile = document.getElementById('btn-add-profile');
    btnRenameProfile = document.getElementById('btn-rename-profile');
    btnDeleteProfile = document.getElementById('btn-delete-profile');
    btnEditParams = document.getElementById('btn-edit-params');
    btnOpenAi = document.getElementById('btn-open-ai');
    btnOpenWhatIf = document.getElementById('btn-open-whatif');
    parkedDrawer = document.getElementById('parked-drawer');
    paramsModal = document.getElementById('params-modal');
    btnCloseModal = document.getElementById('btn-close-modal');
    btnSaveParams = document.getElementById('btn-save-params');

    // Init Modals
    settingsModalInstance = document.querySelector('settings-modal');
    profileManagerModalInstance = document.querySelector('profile-manager-modal');
    aiAdvisorInstance = document.querySelector('ai-advisor-drawer');
    whatIfDrawerInstance = document.querySelector('what-if-drawer');

    bindEvents();
    updateProfileSelect();
    
    const state = getState();
    if (!state.primarySpouse.yearOfBirth || !state.primarySpouse.targetRetirementAge) {
        if (paramsModal) paramsModal.classList.remove('hidden');
    }
    
    updateApp();
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
                btnLoadSample.innerHTML = '<span>📊 Load Sample Profile</span>';
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

    if (btnOpenAi && aiAdvisorInstance) {
        btnOpenAi.addEventListener('click', () => {
            aiAdvisorInstance.open();
        });
    }

    if (btnOpenWhatIf && whatIfDrawerInstance) {
        btnOpenWhatIf.addEventListener('click', () => {
            whatIfDrawerInstance.toggle();
        });
    }
}

function bindEvents() {
    if (focusYearSelect) {
        focusYearSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === "") {
                const advisor = document.querySelector('nerd-advisor');
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
    
    // Update simulation context for AI Assistant
    aiAssistant.updateSimulationContext(simResult.data, stressResults);
    
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
            renderNerdDetails(snap, currentState, activeIndex, simResult.data);
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


