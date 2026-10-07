import { SimulationEngine, SORR_SCENARIOS } from './SimulationEngine.js';

/**
 * Historical metadata for each Sequence of Returns Risk scenario.
 */
export const STRESS_SCENARIOS_META = {
    '2000-2009': {
        name: 'Lost Decade (2000–2009)',
        shortName: 'Lost Decade',
        description: 'Dot-Com Crash (-9.1%, -11.9%, -22.1%) followed by 2008 Great Financial Crisis (-37.0%). Severe prolonged drawdown.'
    },
    '1973-1982': {
        name: 'Stagflation (1973–1982)',
        shortName: 'Stagflation',
        description: 'High inflation combined with severe back-to-back bear markets (-14.7%, -26.5%).'
    },
    '1987-1996': {
        name: 'Post-Crash Recovery (1987–1996)',
        shortName: 'Post-Crash 1987',
        description: 'Black Monday 1987 crash followed by strong economic recovery and expansion.'
    },
    '1990-1999': {
        name: 'The 90s Bull (1990–1999)',
        shortName: '90s Bull Run',
        description: 'Historic economic expansion and tech boom with uninterrupted double-digit returns.'
    },
    '2015-2024': {
        name: 'Tech Boom (2015–2024)',
        shortName: 'Tech Boom',
        description: 'Modern low-rate tech expansion punctuated by the 2022 rate-hike correction.'
    },
    '2008-2017': {
        name: 'GFC & ZIRP Bull (2008–2017)',
        shortName: '2008 GFC & ZIRP',
        description: 'Day-1 Global Financial Crisis (-37.0%) followed by historic low-rate economic expansion.'
    },
    '1968-1977': {
        name: 'Go-Go 60s & Nifty Fifty (1968–1977)',
        shortName: 'Nifty Fifty Crash',
        description: 'Strong early returns followed by severe mid-decade bear market crash (-14.7%, -26.5%).'
    },
    '1929-1938': {
        name: 'The Great Crash & Depression (1929–1938)',
        shortName: 'Great Depression',
        description: 'Catastrophic 4-year cumulative drawdown (-80% collapse) followed by high volatility.'
    }
};

const LIQUID_BALANCE_KEYS = [
    's1Brokerage', 's2Brokerage',
    's1RothIra', 's2RothIra',
    's1Trad401k', 's2Trad401k',
    's1Trad403b', 's2Trad403b',
    's1StandardIra', 's2StandardIra',
    's1Hysa', 's2Hysa',
    's1Cd', 's2Cd',
    'cashCushion'
];

function calculateLiquidTotal(balances = {}) {
    let total = 0;
    for (const key of LIQUID_BALANCE_KEYS) {
        total += (balances[key] || 0);
    }
    return total;
}

export class StressTestEvaluator {
    /**
     * Evaluates all historical stress-test scenarios against the current state.
     * @param {Object} state - The current financial state profile.
     * @returns {Array<Object>} Array of evaluation results per scenario.
     */
    static evaluateAll(state) {
        if (!state) return [];
        const results = [];

        Object.keys(SORR_SCENARIOS).forEach(scenarioKey => {
            const meta = STRESS_SCENARIOS_META[scenarioKey] || { name: scenarioKey, shortName: scenarioKey, description: '' };
            const stateCopy = JSON.parse(JSON.stringify(state));
            
            if (!stateCopy.strategies) stateCopy.strategies = {};
            stateCopy.strategies.sorrScenario = scenarioKey;

            const startAge = stateCopy.primarySpouse?.targetRetirementAge || 55;
            const engine = new SimulationEngine(stateCopy, { startAge });
            const simResult = engine.run();
            const snapshots = simResult.data || [];

            let status = 'passed'; // 'passed' | 'depleted' | 'pre59_lockout'
            let failureYear = null;
            let failureAge = null;
            let portfolioAtFailure = 0;
            let totalShortfall = 0;
            let minPortfolio = Infinity;
            let peakPortfolio = 0;
            let maxDrawdownPct = 0;

            snapshots.forEach(s => {
                const totalLiquid = calculateLiquidTotal(s.balances);

                if (totalLiquid > peakPortfolio) {
                    peakPortfolio = totalLiquid;
                }
                if (totalLiquid < minPortfolio) {
                    minPortfolio = totalLiquid;
                }
                if (peakPortfolio > 0) {
                    const dd = (peakPortfolio - totalLiquid) / peakPortfolio * 100;
                    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
                }

                const shortfall = s.unfundedShortfall || 0;
                if (shortfall > 1000) {
                    totalShortfall += shortfall;
                    if (status === 'passed') {
                        const isPre59Lockout = (totalLiquid > 10000) && (s.age1 < 59.5 || s.age2 < 59.5);
                        if (isPre59Lockout) {
                            status = 'pre59_lockout';
                        } else {
                            status = 'depleted';
                        }
                        failureYear = s.year;
                        failureAge = s.age1;
                        portfolioAtFailure = totalLiquid;
                    } else if (status === 'pre59_lockout') {
                        // If total liquid assets later truly deplete to 0, escalate to depleted
                        if (totalLiquid <= 10000) {
                            status = 'depleted';
                            failureYear = s.year;
                            failureAge = s.age1;
                            portfolioAtFailure = totalLiquid;
                        }
                    }
                }
            });

            results.push({
                id: scenarioKey,
                name: meta.name,
                shortName: meta.shortName,
                description: meta.description,
                status,
                passed: status === 'passed',
                failureYear,
                failureAge,
                portfolioAtFailure: Math.round(portfolioAtFailure),
                totalShortfall: Math.round(totalShortfall),
                minPortfolio: Math.round(minPortfolio === Infinity ? 0 : minPortfolio),
                maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10
            });
        });

        return results;
    }
}
