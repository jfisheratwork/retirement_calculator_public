import { runSimulation, SORR_SCENARIOS } from './SimulationEngine.js';
import { StressTestEvaluator } from './StressTestEvaluator.js';

// Helper to clone state
export function cloneState(obj) {
    return JSON.parse(JSON.stringify(obj));
}


const LIQUID_BALANCE_KEYS = [
    's1Brokerage', 's2Brokerage',
    's1RothIra', 's2RothIra',
    's1Trad401k', 's2Trad401k',
    's1Trad403b', 's2Trad403b',
    's1StandardIra', 's2StandardIra',
    's1Hysa', 's2Hysa',
    's1Cd', 's2Cd',
    's1Hsa', 's2Hsa',
    'cashCushion'
];

function calculateLiquidTotal(balances = {}) {
    let total = 0;
    for (const key of LIQUID_BALANCE_KEYS) {
        total += (balances[key] || 0);
    }
    return total;
}

// Helper to run all simulations including SORR and Stress Tests
export function runAllSimulations(state) {
    const baseSim = runSimulation(state);
    
    const getLiquid = (data) => data.map(d => calculateLiquidTotal(d.balances));
    
    let sorrData = {
        base: getLiquid(baseSim.data)
    };
    
    if (state.strategies?.sorrScenario && state.strategies.sorrScenario !== 'average') {
        const returnsArray = SORR_SCENARIOS[state.strategies.sorrScenario];
        if (returnsArray) {
            // Early
            const earlySim = runSimulation(state, { startYear: 0, returnsArray });
            
            // Mid
            const retirementYear = baseSim.data.findIndex(d => 
                d.income.s1.w2Gross === 0 && d.income.s2.w2Gross === 0);
            const midStartYear = (retirementYear > -1 && retirementYear < (state.assumptions?.graphYears || 40) - 10) 
                ? retirementYear 
                : Math.max(0, Math.floor((state.assumptions?.graphYears || 40) / 2) - 5);
            const midSim = runSimulation(state, { startYear: midStartYear, returnsArray });
            
            // Late
            const lateStartYear = (state.assumptions?.graphYears || 40) - 10;
            const lateSim = runSimulation(state, { startYear: Math.max(0, lateStartYear), returnsArray });
            
            sorrData = {
                base: getLiquid(baseSim.data),
                early: getLiquid(earlySim.data),
                mid: getLiquid(midSim.data),
                late: getLiquid(lateSim.data)
            };
        }
    }
    
    const stressResults = StressTestEvaluator.evaluateAll(state);

    return { simResult: baseSim, sorrData, stressResults };
}

