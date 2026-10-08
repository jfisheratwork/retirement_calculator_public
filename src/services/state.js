import { normalizeDateStr } from '../utils/date.js';

const LOCAL_STORAGE_KEY = 'retirement_calculator_state';

// Model Versioning: Increment this whenever the data model structure changes significantly
export const MODEL_VERSION = 3;

// Define the default state object (Blank Slate)
export const defaultState = {
    dataVersion: MODEL_VERSION,
    primarySpouse: {
        name: '',
        yearOfBirth: null,
        targetRetirementAge: null,
        targetRetirementDate: null,
        socialSecurityStartAge: null,
        socialSecurityStartMonth: 1,
        socialSecurityStartDate: null,
        socialSecurityMonthlyBenefit: 0,
        socialSecurityAnnualBenefit: 0,
        rothConversion: {
            enabled: false,
            sourceAccount: 'standardIra',
            startDate: null,
            startMonth: 12,
            amountPerYear: 0,
            startDelayYears: 0,
            durationYears: 5
        },
        rolloverEvent: {
            enabled: false,
            sourceAccount: 'traditional401k',
            targetAccount: 'standardIra',
            startDate: null,
            month: 1,
            year: new Date().getFullYear() + 5,
            amount: 0,
            isFullBalance: true
        },
        totalYearsWorked: 0,
        rule72t: {
            enabled: false,
            sourceAccount: 'standardIra',
            startDate: null,
            startAge: 55,
            startMonth: 1
        },
        estimatedLifeExpectancy: 95,
        jobs: [],
        accounts: []
    },
    secondarySpouse: {
        name: '',
        yearOfBirth: null,
        targetRetirementAge: null,
        targetRetirementDate: null,
        socialSecurityStartAge: null,
        socialSecurityStartMonth: 1,
        socialSecurityStartDate: null,
        socialSecurityMonthlyBenefit: 0,
        socialSecurityAnnualBenefit: 0,
        rothConversion: {
            enabled: false,
            sourceAccount: 'standardIra',
            startDate: null,
            startMonth: 12,
            amountPerYear: 0,
            startDelayYears: 0,
            durationYears: 5
        },
        rolloverEvent: {
            enabled: false,
            sourceAccount: 'traditional401k',
            targetAccount: 'standardIra',
            startDate: null,
            month: 1,
            year: new Date().getFullYear() + 5,
            amount: 0,
            isFullBalance: true
        },
        totalYearsWorked: 0,
        rule72t: {
            enabled: false,
            sourceAccount: 'standardIra',
            startDate: null,
            startAge: 55,
            startMonth: 1
        },
        estimatedLifeExpectancy: 95,
        jobs: [],
        accounts: []
    },
    phaseBasedExpensesPerMonth: {
        preTeens: 0,
        teenagers: 0,
        college: 0,
        preRetirementNoKids: 0,
        earlyRetirement: 0,
        midRetirement: 0,
        olderRetirement: 0,
        bonusYears: 0
    },
    primaryResidenceMortgage: {
        enabled: false,
        originationDate: `${new Date().getFullYear() - 3}-01`,
        originationAmount: 0,
        currentBalance: 0,
        interestRate: 0,
        termYears: 30,
        yearlyInsurance: 0,
        yearlyTaxes: 0,
        yearlyRepairs: 0
    },
    primaryResidenceEquity: {
        enabled: false,
        reverseMortgageEnabled: false,
        currentValue: 0,
        annualGrowthRate: 0,
        reverseMortgageStartAge: 65
    },
    dependents: [],
    strategies: {
        sorrScenario: 'average',
        rule72tInterestRate: 5.0,
        decumulationMode: 'capital_preservation',
        targetLegacyBalance: 0,
        gogoMultiplier: 1.0,
        healthAgingOffset: 0,
        drawdownStrategy: 'age_tiered_60',
        drawdownTierAge: 60,
        advancedRothStrategy: {
            enabled: false,
            safetyMargin: 0
        }
    },
    assumptions: {
        startDate: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        inflationRate: 3.0,
        w2RaiseRate: 2.0,
        stateTaxRate: 0.0,
        initialCashCushion: 0,
        displayRealDollars: true,
        graphYears: 50,
        marketReturnRates: [
            { startYear: new Date().getFullYear(), rate: 7.0 }
        ],
        conservativeShift: {
            enabled: false,
            startAge: 60,
            returnRate: 5.5
        }
    }
};

let currentProfileId = 'default';
let profiles = {};
let currentState = null;
let globalSettings = {
    apiKey: '' // Encrypted API Key stored globally across profiles
};

/**
 * Deep merges source object into target object without mutating source.
 */
export function deepMerge(target, source) {
    if (!source) return target ? structuredClone(target) : {};
    if (!target || typeof target !== 'object') return structuredClone(source);
    const output = Array.isArray(target) ? [...target] : Object.assign({}, target);
    if (source && typeof source === 'object') {
        Object.keys(source).forEach(key => {
            if (Array.isArray(source[key])) {
                output[key] = source[key].map(item => (item && typeof item === 'object') ? structuredClone(item) : item);
            } else if (source[key] && typeof source[key] === 'object') {
                if (!(key in target) || !target[key] || typeof target[key] !== 'object') {
                    output[key] = structuredClone(source[key]);
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                output[key] = source[key];
            }
        });
    }
    return output;
}

function normalizeState(state) {
    if (!state) return state;
    if (!state.assumptions) state.assumptions = {};
    if (!state.assumptions.startDate) {
        state.assumptions.startDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    } else {
        state.assumptions.startDate = normalizeDateStr(state.assumptions.startDate, new Date().getFullYear(), new Date().getMonth() + 1);
    }
    if (state.assumptions.stateTaxRate === undefined) {
        state.assumptions.stateTaxRate = 0.0;
    }
    if (!Array.isArray(state.assumptions.marketReturnRates) || state.assumptions.marketReturnRates.length === 0) {
        state.assumptions.marketReturnRates = [
            { startYear: new Date().getFullYear(), rate: state.assumptions.generalReturnRate !== undefined ? Number(state.assumptions.generalReturnRate) : 7.0 }
        ];
    }

    [state.primarySpouse, state.secondarySpouse].forEach(spouse => {
        if (!spouse) return;
        const birthYear = Number(spouse.yearOfBirth) || 1980;

        // Clean up jobs
        if (Array.isArray(spouse.jobs)) {
            spouse.jobs = spouse.jobs.filter(j => j && typeof j === 'object' && j.id && (Boolean(j.title) || Number(j.baseSalary || 0) > 0 || Boolean(j.startDate)));
            spouse.jobs.forEach(j => {
                if (j.startDate) j.startDate = normalizeDateStr(j.startDate);
                if (j.endDate) j.endDate = normalizeDateStr(j.endDate);
            });
        }

        // Normalize accounts & clean up empty placeholders
        if (Array.isArray(spouse.accounts)) {
            spouse.accounts = spouse.accounts.filter(a => {
                if (!a || typeof a !== 'object') return false;
                if (a.id && a.id.startsWith('acc-') && a.name === '401k' && Number(a.balance || 0) === 0 && Number(a.contributionPercentage || 0) === 0) {
                    return false;
                }
                return true;
            });

            spouse.accounts.forEach(acc => {
                if (acc.type === 'traditional401k' || acc.type === 'trad403b') {
                    if (!acc.rollover) {
                        acc.rollover = {
                            enabled: false,
                            timing: 'job_end',
                            startDate: `${birthYear + (Number(spouse.targetRetirementAge) || 65)}-01`,
                            targetIraMode: 'existing',
                            targetAccount: '',
                            newIraName: `${acc.name || '401k'} Rollover IRA`,
                            isFullBalance: true,
                            amount: 0
                        };
                    } else if (acc.rollover.startDate) {
                        acc.rollover.startDate = normalizeDateStr(acc.rollover.startDate);
                    }
                }
            });
        }

        // Normalize Target Retirement Date
        if (!spouse.targetRetirementDate && spouse.targetRetirementAge) {
            spouse.targetRetirementDate = `${birthYear + Number(spouse.targetRetirementAge)}-01`;
        } else if (spouse.targetRetirementDate) {
            spouse.targetRetirementDate = normalizeDateStr(spouse.targetRetirementDate);
        }

        // Normalize Social Security Start Date
        if (!spouse.socialSecurityStartDate && spouse.socialSecurityStartAge) {
            const ssnMonth = String(spouse.socialSecurityStartMonth || 1).padStart(2, '0');
            spouse.socialSecurityStartDate = `${birthYear + Number(spouse.socialSecurityStartAge)}-${ssnMonth}`;
        } else if (spouse.socialSecurityStartDate) {
            spouse.socialSecurityStartDate = normalizeDateStr(spouse.socialSecurityStartDate);
        }

        // Normalize 72(t) Start Date
        if (spouse.rule72t) {
            if (!spouse.rule72t.startDate && spouse.rule72t.startAge) {
                const r72tMonth = String(spouse.rule72t.startMonth || 1).padStart(2, '0');
                spouse.rule72t.startDate = `${birthYear + Number(spouse.rule72t.startAge)}-${r72tMonth}`;
            } else if (spouse.rule72t.startDate) {
                spouse.rule72t.startDate = normalizeDateStr(spouse.rule72t.startDate);
            }
        }

        // Normalize Rollover Start Date
        if (spouse.rolloverEvent) {
            if (!spouse.rolloverEvent.startDate && spouse.rolloverEvent.year) {
                const rMonth = String(spouse.rolloverEvent.month || 1).padStart(2, '0');
                spouse.rolloverEvent.startDate = `${spouse.rolloverEvent.year}-${rMonth}`;
            } else if (spouse.rolloverEvent.startDate) {
                spouse.rolloverEvent.startDate = normalizeDateStr(spouse.rolloverEvent.startDate);
            }
        }

        // Normalize Roth Conversion Start Date
        if (spouse.rothConversion) {
            if (!spouse.rothConversion.startDate) {
                const convYear = new Date().getFullYear() + (Number(spouse.rothConversion.startDelayYears) || 0);
                const convMonth = String(spouse.rothConversion.startMonth || 12).padStart(2, '0');
                spouse.rothConversion.startDate = `${convYear}-${convMonth}`;
            } else {
                spouse.rothConversion.startDate = normalizeDateStr(spouse.rothConversion.startDate);
            }
        }
    });

    if (state.strategies?.advancedRothStrategy) {
        if (!state.strategies.advancedRothStrategy.startDate) {
            const advYr = state.strategies.advancedRothStrategy.startYear || new Date().getFullYear();
            state.strategies.advancedRothStrategy.startDate = `${advYr}-01`;
        } else {
            state.strategies.advancedRothStrategy.startDate = normalizeDateStr(state.strategies.advancedRothStrategy.startDate);
        }
    }

    if (state.primaryResidenceMortgage && state.primaryResidenceMortgage.originationDate) {
        state.primaryResidenceMortgage.originationDate = normalizeDateStr(state.primaryResidenceMortgage.originationDate);
    }

    if (Array.isArray(state.dependents)) {
        state.dependents.forEach(dep => {
            if (!dep || typeof dep !== 'object') return;
            if (dep.contributionMode === undefined) {
                dep.contributionMode = 'fixed';
            }
            if (dep.annualContribution === undefined) {
                dep.annualContribution = 0;
            }
            if (dep.targetCollegeSavingsBalance === undefined) {
                dep.targetCollegeSavingsBalance = 0;
            }
        });
    }

    return state;
}

const memoryStorageFallback = {};

export function safeGetStorage(key) {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(key);
        }
    } catch (e) {
        console.warn('LocalStorage read blocked or unavailable; falling back to memory store:', e.message);
    }
    return memoryStorageFallback[key] || null;
}

export function safeSetStorage(key, value) {
    memoryStorageFallback[key] = value;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, value);
        }
    } catch (e) {
        console.warn('LocalStorage write blocked or quota exceeded; stored in memory store:', e.message);
    }
}

/**
 * Saves the entire store (profiles + active ID + global settings) to LocalStorage.
 */
function saveStore() {
    if (profiles[currentProfileId] && currentState) {
        profiles[currentProfileId].data = currentState;
    }
    safeSetStorage(LOCAL_STORAGE_KEY, JSON.stringify({
        dataVersion: MODEL_VERSION,
        activeProfileId: currentProfileId,
        profiles: profiles,
        globalSettings: globalSettings
    }));
}

function _migrateSpouseSsn(spouse) {
    if (!spouse) return false;
    let migrated = false;
    if (spouse.socialSecurityAverageAnnualEarnings && !spouse.socialSecurityAnnualBenefit) {
        spouse.socialSecurityAnnualBenefit = spouse.socialSecurityAverageAnnualEarnings * 0.4;
        migrated = true;
    }
    if (spouse.socialSecurityMonthlyBenefit === undefined && spouse.socialSecurityAnnualBenefit !== undefined) {
        spouse.socialSecurityMonthlyBenefit = Number(spouse.socialSecurityAnnualBenefit) / 12;
        migrated = true;
    }
    return migrated;
}

/**
 * Initializes the state from LocalStorage or falls back to default.
 */
export function initState() {
    const saved = safeGetStorage(LOCAL_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            
            if (parsed.dataVersion !== MODEL_VERSION) {
                console.warn('Data version mismatch. Resetting to default state.');
                throw new Error('Data version mismatch');
            }
            
            // Check if it's the old format (no activeProfileId)
            if (!parsed.activeProfileId) {
                // Migrate
                currentProfileId = 'default';
                profiles = {
                    'default': {
                        id: 'default',
                        name: 'Default Profile',
                        data: parsed
                    }
                };
            } else {
                currentProfileId = parsed.activeProfileId;
                profiles = parsed.profiles;
            }
            
            if (parsed.globalSettings) {
                globalSettings = parsed.globalSettings;
            }
            
            if (!profiles[currentProfileId]) {
                currentProfileId = Object.keys(profiles)[0];
            }
            
            currentState = deepMerge(structuredClone(defaultState), profiles[currentProfileId].data);
            
            // Migration for SSN Benefit
            let migrated = false;
            if (_migrateSpouseSsn(currentState.primarySpouse)) migrated = true;
            if (_migrateSpouseSsn(currentState.secondarySpouse)) migrated = true;
            if (currentState.assumptions && !currentState.assumptions.startDate) {
                currentState.assumptions.startDate = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                migrated = true;
            }
            
            if (migrated) saveStore();
            
            // Clean up legacy keys
            if ('rothConversions' in currentState) {
                delete currentState.rothConversions;
                saveStore();
            }
            if ('phaseBasedExpenses' in currentState) {
                currentState.phaseBasedExpensesPerMonth = currentState.phaseBasedExpenses;
                delete currentState.phaseBasedExpenses;
                saveStore();
            }
            if (currentState.primarySpouse && 'rule72tEarlyWithdrawalStartAge' in currentState.primarySpouse) {
                currentState.primarySpouse.rule72t = {
                    enabled: currentState.primarySpouse.rule72tEarlyWithdrawalStartAge > 0,
                    startAge: currentState.primarySpouse.rule72tEarlyWithdrawalStartAge || 55
                };
                delete currentState.primarySpouse.rule72tEarlyWithdrawalStartAge;
                saveStore();
            }
            if (currentState.secondarySpouse && 'rule72tEarlyWithdrawalStartAge' in currentState.secondarySpouse) {
                currentState.secondarySpouse.rule72t = {
                    enabled: currentState.secondarySpouse.rule72tEarlyWithdrawalStartAge > 0,
                    startAge: currentState.secondarySpouse.rule72tEarlyWithdrawalStartAge || 55
                };
                delete currentState.secondarySpouse.rule72tEarlyWithdrawalStartAge;
                saveStore();
            }
            
        } catch (e) {
            console.error("Failed to parse saved state, falling back to default.", e);
            currentProfileId = 'default';
            profiles = { 'default': { id: 'default', name: 'Default Profile', data: structuredClone(defaultState) } };
            currentState = structuredClone(defaultState);
            saveStore();
        }
    } else {
        currentProfileId = 'default';
        profiles = { 'default': { id: 'default', name: 'Default Profile', data: structuredClone(defaultState) } };
        currentState = structuredClone(defaultState);
        saveStore();
    }
    currentState = normalizeState(currentState);
    return currentState;
}

/**
 * Gets the current state.
 */
export function getState() {
    if (!currentState) {
        initState();
    }
    return currentState;
}

/**
 * Updates the state and persists it to LocalStorage.
 */
export function updateState(newState) {
    if (!currentState) initState();
    currentState = normalizeState(deepMerge(currentState, newState));
    saveStore();
}

/**
 * Profile Management API
 */
export function getProfiles() {
    if (Object.keys(profiles).length === 0) initState();
    return Object.values(profiles).map(p => ({ id: p.id, name: p.name }));
}

export function getActiveProfileId() {
    if (!currentProfileId) initState();
    return currentProfileId;
}

export function switchProfile(id) {
    if (profiles[id]) {
        currentProfileId = id;
        currentState = normalizeState(deepMerge(structuredClone(defaultState), profiles[id].data));
        saveStore();
    }
}

export function createProfile(name, cloneCurrent = true) {
    const id = 'profile_' + Date.now();
    profiles[id] = {
        id,
        name,
        data: cloneCurrent ? structuredClone(currentState) : structuredClone(defaultState)
    };
    currentProfileId = id;
    currentState = deepMerge(structuredClone(defaultState), profiles[id].data);
    saveStore();
    return id;
}

export function renameProfile(id, name) {
    if (profiles[id]) {
        profiles[id].name = name;
        saveStore();
    }
}

export function deleteProfile(id) {
    const profileIds = Object.keys(profiles);
    if (profileIds.length <= 1) return; // Must have at least one profile
    
    if (profiles[id]) {
        delete profiles[id];
        if (currentProfileId === id) {
            currentProfileId = Object.keys(profiles)[0];
            currentState = deepMerge(structuredClone(defaultState), profiles[currentProfileId].data);
        }
        saveStore();
    }
}

/**
 * Replace a profile's data with imported data.
 */
export function replaceProfileData(id, importedData) {
    if (profiles[id]) {
        profiles[id].data = importedData;
        if (currentProfileId === id) {
            currentState = deepMerge(structuredClone(defaultState), importedData);
        }
        saveStore();
    }
}

/**
 * Exports the current state as a JSON file download.
 */
export function exportState() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(getState(), null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "retirement_plan.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

/**
 * Global Settings API
 */
export function getGlobalSettings() {
    return globalSettings;
}

export function updateGlobalSettings(newSettings) {
    globalSettings = { ...globalSettings, ...newSettings };
    saveStore();
}
