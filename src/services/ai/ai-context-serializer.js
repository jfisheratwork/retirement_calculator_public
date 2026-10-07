/**
 * AI Financial Context Serializer
 * 
 * Transforms the active profile state and simulation results into a compact,
 * high-density JSON summary optimized for LLM token efficiency.
 */

export class AIContextSerializer {
    /**
     * Serializes the financial state and simulation summary.
     * @param {Object} state - The active profile state.
     * @param {Array} simulationData - Projections array from SimulationEngine.
     * @param {Object} stressAlerts - Evaluated stress test results from StressTestEvaluator.
     * @returns {string} Formatted JSON string for prompt injection.
     */
    static serialize(state, simulationData = null, stressAlerts = null) {
        if (!state) return '{}';

        const s1 = state.primarySpouse || {};
        const s2 = state.secondarySpouse || {};
        const currentYear = new Date().getFullYear();

        const s1Age = s1.yearOfBirth ? currentYear - s1.yearOfBirth : 0;
        const s2Age = s2.yearOfBirth ? currentYear - s2.yearOfBirth : 0;

        // Extract and aggregate initial account balances
        const accountsSummary = this._summarizeAccounts(s1, s2);

        // Summarize simulation results milestones if available
        const simSummary = simulationData && simulationData.length > 0 
            ? this._summarizeSimulation(simulationData, s1, s2) 
            : null;

        // Summarize stress test alerts
        const stressSummary = stressAlerts ? this._summarizeStressTests(stressAlerts) : null;

        const summary = {
            household: {
                primarySpouse: {
                    name: s1.name || 'Spouse 1',
                    currentAge: s1Age,
                    birthYear: s1.yearOfBirth,
                    targetRetirementAge: s1.targetRetirementAge,
                    lifeExpectancy: s1.estimatedLifeExpectancy,
                    ssnClaimAge: s1.socialSecurityStartAge || s1.socialSecurity?.startAge || 67,
                    ssnMonthlyBenefitAtFRA: s1.socialSecurityMonthlyBenefit || (s1.socialSecurityAnnualBenefit ? s1.socialSecurityAnnualBenefit / 12 : 0),
                    ssnAnnualBenefitAtFRA: (s1.socialSecurityMonthlyBenefit ? s1.socialSecurityMonthlyBenefit * 12 : s1.socialSecurityAnnualBenefit) || 0,
                    rule72tEnabled: Boolean(s1.rule72t?.enabled),
                    rule72tStartAge: s1.rule72t?.startAge || null,
                    rothConversionEnabled: Boolean(s1.rothConversion?.enabled)
                },
                secondarySpouse: {
                    name: s2.name || 'Spouse 2',
                    currentAge: s2Age,
                    birthYear: s2.yearOfBirth,
                    targetRetirementAge: s2.targetRetirementAge,
                    lifeExpectancy: s2.estimatedLifeExpectancy,
                    ssnClaimAge: s2.socialSecurityStartAge || s2.socialSecurity?.startAge || 67,
                    ssnMonthlyBenefitAtFRA: s2.socialSecurityMonthlyBenefit || (s2.socialSecurityAnnualBenefit ? s2.socialSecurityAnnualBenefit / 12 : 0),
                    ssnAnnualBenefitAtFRA: (s2.socialSecurityMonthlyBenefit ? s2.socialSecurityMonthlyBenefit * 12 : s2.socialSecurityAnnualBenefit) || 0,
                    rule72tEnabled: Boolean(s2.rule72t?.enabled),
                    rule72tStartAge: s2.rule72t?.startAge || null,
                    rothConversionEnabled: Boolean(s2.rothConversion?.enabled)
                }
            },
            accountsStartingBalance: accountsSummary,
            strategies: {
                advancedRothEnabled: Boolean(state.strategies?.advancedRothStrategy?.enabled),
                advancedRothTargetBracket: state.strategies?.advancedRothStrategy?.targetTaxBracket || '12%',
                conservativeShiftEnabled: Boolean(state.assumptions?.conservativeShift?.enabled),
                conservativeShiftAge: state.assumptions?.conservativeShift?.shiftAge || 60,
                decumulationMode: state.strategies?.decumulationMode || 'preserve_capital',
                targetLegacyBalance: state.strategies?.targetLegacyBalance || 0,
                gogoMultiplier: state.strategies?.gogoMultiplier || 1.0
            },
            assumptions: {
                inflationRate: `${state.assumptions?.inflationRate ?? 2.5}%`,
                marketReturnRate: `${state.assumptions?.marketReturnRate ?? 7.0}%`
            },
            simulationSummary: simSummary,
            stressTestResults: stressSummary
        };

        return JSON.stringify(summary, null, 2);
    }

    static _summarizeAccounts(s1, s2) {
        const sumType = (typeList) => {
            let total = 0;
            [s1, s2].forEach(sp => {
                if (Array.isArray(sp.accounts)) {
                    sp.accounts.forEach(acc => {
                        if (typeList.includes(acc.type)) {
                            total += Number(acc.balance || 0);
                        }
                    });
                }
            });
            return total;
        };

        return {
            preTax401k403bIRA: sumType(['traditional401k', 'trad403b', 'traditionalIra']),
            rothIRA: sumType(['rothIra']),
            taxableBrokerage: sumType(['taxableBrokerage']),
            hysaCash: sumType(['hysa']),
            certificatesOfDeposit: sumType(['cd']),
            totalStartingLiquid: sumType(['traditional401k', 'trad403b', 'traditionalIra', 'rothIra', 'taxableBrokerage', 'hysa', 'cd'])
        };
    }

    static _summarizeSimulation(simData, s1, s2) {
        const shortfalls = [];
        let peakLiquid = { year: 0, amount: 0 };
        let troughLiquid = { year: 0, amount: Infinity };

        simData.forEach(d => {
            if (d.unfundedShortfall > 0 || d.shortfall > 0) {
                shortfalls.push({
                    year: d.year,
                    s1Age: d.age1,
                    s2Age: d.age2,
                    unfundedAmount: Math.round(d.unfundedShortfall || d.shortfall),
                    liquidEndingBalance: Math.round(d.liquidEndingBalance || d.totalEndingBalance || 0)
                });
            }
            const liquid = Number(d.liquidEndingBalance || d.totalEndingBalance || 0);
            if (liquid > peakLiquid.amount) {
                peakLiquid = { year: d.year, amount: Math.round(liquid) };
            }
            if (liquid < troughLiquid.amount) {
                troughLiquid = { year: d.year, amount: Math.round(liquid) };
            }
        });

        const firstYear = simData[0];
        const midYear = simData[Math.floor(simData.length / 2)];
        const lastYear = simData[simData.length - 1];

        return {
            totalSimulationYears: simData.length,
            startYear: firstYear?.year,
            endYear: lastYear?.year,
            endingLiquidBalance: Math.round(lastYear?.liquidEndingBalance || lastYear?.totalEndingBalance || 0),
            peakLiquidBalance: peakLiquid,
            troughLiquidBalance: troughLiquid.amount === Infinity ? 0 : troughLiquid,
            hasBridgeLiquidityGaps: shortfalls.some(s => s.s1Age < 60 && s.liquidEndingBalance > 0),
            shortfallYearsCount: shortfalls.length,
            firstShortfall: shortfalls.length > 0 ? shortfalls[0] : null,
            milestones: [
                { year: firstYear?.year, s1Age: firstYear?.age1, liquid: Math.round(firstYear?.liquidEndingBalance || 0) },
                { year: midYear?.year, s1Age: midYear?.age1, liquid: Math.round(midYear?.liquidEndingBalance || 0) },
                { year: lastYear?.year, s1Age: lastYear?.age1, liquid: Math.round(lastYear?.liquidEndingBalance || 0) }
            ]
        };
    }

    static _summarizeStressTests(stressAlerts) {
        if (!Array.isArray(stressAlerts)) return stressAlerts;
        return stressAlerts.map(s => ({
            id: s.id,
            name: s.name,
            status: s.status, // 'passed' | 'pre59_lockout' | 'depleted'
            firstShortfallYear: s.firstShortfallYear || null,
            shortfallAge: s.shortfallAge || null,
            liquidAtShortfall: s.liquidAtShortfall || 0
        }));
    }
}
