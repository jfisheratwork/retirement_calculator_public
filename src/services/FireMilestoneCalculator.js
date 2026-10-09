/**
 * FireMilestoneCalculator
 * 
 * Computes Financial Independence (FIRE) milestones (Coast FIRE, Barista FIRE,
 * Lean FIRE, and Full FIRE) integrated with simulation cash flows, accounting for
 * future mortgage amortization, college expense roll-offs, and Social Security benefits.
 * 
 * Written with the assistance of Google Gemini
 */

export const DEFAULT_COAST_TARGET_AGE = 65;
export const DEFAULT_BARISTA_ANNUAL_INCOME = 40000;
export const DEFAULT_LEAN_EXPENSE_RATIO = 0.75;
export const MIN_REAL_RETURN_RATE = 0.001;
export const PERCENT_CONVERSION_FACTOR = 100;

/**
 * Formats one or two ages into a standardized display label.
 * @param {number} age1 
 * @param {number} [age2] 
 * @returns {string} e.g. "Age 55" or "Age 55/56"
 */
export function formatAgeString(age1, age2) {
    if (age1 == null && age2 == null) return '';
    if (age2 != null && Number(age2) > 0) {
        return `Age ${age1}/${age2}`;
    }
    return `Age ${age1}`;
}

export class FireMilestoneCalculator {

    /**
     * Computes the real investment return rate from assumptions using the Fisher equation.
     * @param {Object} assumptions 
     * @returns {number} Real return rate as a decimal (e.g. 0.0388 for 7% nominal and 3% inflation)
     */
    static getRealReturnRate(assumptions = {}) {
        const nominalRate = (assumptions.generalReturnRate ?? 7.0) / PERCENT_CONVERSION_FACTOR;
        const inflationRate = (assumptions.inflationRate ?? 3.0) / PERCENT_CONVERSION_FACTOR;
        
        if (inflationRate <= 0) {
            return Math.max(nominalRate, MIN_REAL_RETURN_RATE);
        }
        const realRate = (1 + nominalRate) / (1 + inflationRate) - 1;
        return Math.max(realRate, MIN_REAL_RETURN_RATE);
    }

    /**
     * Extracts guaranteed non-employment inflows (Social Security, pensions) for a given snapshot.
     * @param {Object} snapshot 
     * @returns {number}
     */
    static getGuaranteedInflows(snapshot) {
        if (!snapshot) return 0;
        const s1Ssn = snapshot.income?.s1?.ssn || 0;
        const s2Ssn = snapshot.income?.s2?.ssn || 0;
        const generalSsn = snapshot.income?.ssn || 0;
        return Math.max(s1Ssn + s2Ssn, generalSsn);
    }

    /**
     * Calculates the present value of a future cash flow stream using backward recursion.
     * @param {Array<Object>} snapshots - Array of YearlySnapshot objects
     * @param {number} startIdx - Index in snapshots to discount back to
     * @param {number} realRate - Discount rate
     * @param {Function} netExpenseFn - Function (snapshot, idx) returning net expense required
     * @returns {number} Required present value portfolio at startIdx
     */
    static calculateRequiredPortfolioAt(snapshots, startIdx, realRate, netExpenseFn) {
        if (!snapshots || startIdx >= snapshots.length || startIdx < 0) return 0;

        let required = 0;
        for (let i = snapshots.length - 1; i >= startIdx; i--) {
            const netNeed = netExpenseFn(snapshots[i], i);
            required = (required / (1 + realRate)) + netNeed;
        }
        return Math.max(0, required);
    }

    /**
     * Finds the index corresponding to the target retirement year.
     * @private
     */
    static _findCoastTargetIndex(simulationData, coastRetireYear) {
        let idx = simulationData.findIndex(d => d.year === coastRetireYear);
        if (idx === -1) {
            idx = simulationData.findIndex(d => d.year >= coastRetireYear);
            if (idx === -1) idx = simulationData.length - 1;
        }
        return idx;
    }

    /**
     * Evaluates whether a milestone threshold has been achieved for the first time.
     * @private
     */
    static _checkMilestone(currentMilestone, actualPortfolio, target, year, ageInfo) {
        if (!currentMilestone && actualPortfolio >= target && target > 0) {
            return {
                year,
                age: ageInfo?.age ?? ageInfo?.age1,
                age1: ageInfo?.age1,
                age2: ageInfo?.age2,
                portfolio: actualPortfolio,
                target
            };
        }
        return currentMilestone;
    }

    /**
     * Calculates the discounted Coast FIRE target at a given index.
     * @private
     */
    static _computeCoastTarget(i, context) {
        const { simulationData, coastTargetIdx, requiredNestEggAtRetirement, realRate, retirementNetExpenseFn } = context;
        if (i <= coastTargetIdx) {
            const yearsToCoast = coastTargetIdx - i;
            return requiredNestEggAtRetirement / Math.pow(1 + realRate, yearsToCoast);
        }
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, retirementNetExpenseFn);
    }

    /**
     * Calculates the Full FIRE target at a given index.
     * @private
     */
    static _computeFullTarget(i, context) {
        const { simulationData, realRate, retirementNetExpenseFn } = context;
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, retirementNetExpenseFn);
    }

    /**
     * Calculates the Lean FIRE target at a given index.
     * @private
     */
    static _computeLeanTarget(i, context) {
        const { simulationData, realRate, leanRatio } = context;
        const leanExpenseFn = (s) => {
            const expenses = (s.expenses || 0) * leanRatio;
            const inflows = this.getGuaranteedInflows(s);
            return Math.max(0, expenses - inflows);
        };
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, leanExpenseFn);
    }

    /**
     * Calculates the Barista FIRE target at a given index.
     * @private
     */
    static _computeBaristaTarget(i, context) {
        const { simulationData, realRate, coastTargetIdx, baristaAnnualIncome } = context;
        const baristaExpenseFn = (s, idx) => {
            const isPreRetirement = idx < coastTargetIdx;
            const baseExpenses = s.expenses || 0;
            const earnedIncome = isPreRetirement ? baristaAnnualIncome : 0;
            const inflows = this.getGuaranteedInflows(s) + earnedIncome;
            return Math.max(0, baseExpenses - inflows);
        };
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, baristaExpenseFn);
    }

    /**
     * Extracts total liquid portfolio balance from a snapshot.
     * @param {Object} snapshot 
     * @returns {number}
     */
    static getPortfolioValue(snapshot) {
        if (!snapshot) return 0;
        if (typeof snapshot.portfolio === 'number') return snapshot.portfolio;
        const b = snapshot.balances;
        if (!b) return 0;
        const keys = [
            's1Trad401k', 's2Trad401k', 's1Trad403b', 's2Trad403b',
            's1StandardIra', 's2StandardIra', 's1Hysa', 's2Hysa',
            's1Cd', 's2Cd', 's1Brokerage', 's2Brokerage',
            's1RothIra', 's2RothIra', 's1Hsa', 's2Hsa', 'cashCushion'
        ];
        return keys.reduce((sum, k) => sum + (Number(b[k]) || 0), 0);
    }

    /**
     * Iterates simulation data to generate yearly trajectory points and record milestone crossover events.
     * @private
     */
    static _computeTrajectoryAndMilestones(simulationData, context) {
        const trajectory = [];
        let coastFire = null;
        let baristaFire = null;
        let leanFire = null;
        let fullFire = null;

        for (let i = 0; i < simulationData.length; i++) {
            const snap = simulationData[i];
            const year = snap.year;
            const age1 = snap.age1 ?? (snap.age ?? (year - context.primaryBirthYear));
            const age2 = (snap.age2 && snap.age2 > 0) ? snap.age2 : null;
            const ageInfo = { age: age1, age1, age2 };
            const actualPortfolio = this.getPortfolioValue(snap);

            const coastTarget = this._computeCoastTarget(i, context);
            const fullTarget = this._computeFullTarget(i, context);
            const leanTarget = this._computeLeanTarget(i, context);
            const baristaTarget = this._computeBaristaTarget(i, context);

            coastFire = this._checkMilestone(coastFire, actualPortfolio, coastTarget, year, ageInfo);
            fullFire = this._checkMilestone(fullFire, actualPortfolio, fullTarget, year, ageInfo);
            leanFire = this._checkMilestone(leanFire, actualPortfolio, leanTarget, year, ageInfo);
            baristaFire = this._checkMilestone(baristaFire, actualPortfolio, baristaTarget, year, ageInfo);

            trajectory.push({
                year,
                age: age1,
                age1,
                age2,
                actualPortfolio: Math.round(actualPortfolio),
                coastTarget: Math.round(coastTarget),
                baristaTarget: Math.round(baristaTarget),
                leanTarget: Math.round(leanTarget),
                fullTarget: Math.round(fullTarget)
            });
        }

        return { coastFire, baristaFire, leanFire, fullFire, trajectory };
    }

    /**
     * Safely parses a numeric parameter with fallback.
     * @private
     */
    static _resolveNumber(val, fallback) {
        const num = Number(val);
        return (!isNaN(num) && val != null) ? num : fallback;
    }

    /**
     * Extracts and calculates initial configuration parameters.
     * @private
     */
    static _resolveParameters(simulationData, state, options) {
        const assumptions = state?.assumptions || {};
        const realRate = this.getRealReturnRate(assumptions);
        const primaryRetireAge = state?.primarySpouse?.targetRetirementAge || DEFAULT_COAST_TARGET_AGE;
        const coastTargetAge = this._resolveNumber(options.coastTargetAge, primaryRetireAge);
        const baristaAnnualIncome = this._resolveNumber(options.baristaIncome, DEFAULT_BARISTA_ANNUAL_INCOME);
        const leanRatio = this._resolveNumber(options.leanRatio, DEFAULT_LEAN_EXPENSE_RATIO);

        const currentYear = simulationData[0].year;
        const firstAge = simulationData[0].age ?? simulationData[0].age1 ?? 45;
        const primaryBirthYear = state?.primarySpouse?.yearOfBirth || (currentYear - firstAge);
        const coastRetireYear = primaryBirthYear + coastTargetAge;
        const coastTargetIdx = this._findCoastTargetIndex(simulationData, coastRetireYear);

        return { realRate, coastTargetAge, baristaAnnualIncome, leanRatio, primaryBirthYear, coastTargetIdx };
    }

    /**
     * Formats a milestone result object with default fallback values.
     * @private
     */
    static _formatMilestone(milestone, defaultTarget = 0, firstYear = null) {
        if (!milestone) {
            return { year: null, age: null, age1: null, age2: null, portfolio: 0, target: Math.round(defaultTarget), isAchieved: false };
        }
        return {
            ...milestone,
            isAlreadyAchieved: milestone.year === firstYear
        };
    }

    /**
     * Computes all 4 FIRE milestones from simulation data.
     * 
     * @param {Array<Object>} simulationData - Result array from SimulationEngine.run().data
     * @param {Object} state - Application state
     * @param {Object} [options] - Overrides { coastTargetAge, baristaIncome, leanRatio }
     * @returns {Object} { coastFire, baristaFire, leanFire, fullFire, trajectory }
     */
    static computeMilestones(simulationData, state, options = {}) {
        if (!simulationData || simulationData.length === 0) {
            return this._getEmptyResults();
        }

        const params = this._resolveParameters(simulationData, state, options);
        const retirementNetExpenseFn = (snap) => {
            const expenses = snap.expenses || 0;
            const inflows = this.getGuaranteedInflows(snap);
            return Math.max(0, expenses - inflows);
        };

        const requiredNestEggAtRetirement = this.calculateRequiredPortfolioAt(
            simulationData,
            params.coastTargetIdx,
            params.realRate,
            retirementNetExpenseFn
        );

        const context = {
            ...params,
            simulationData,
            requiredNestEggAtRetirement,
            retirementNetExpenseFn
        };

        const { coastFire, baristaFire, leanFire, fullFire, trajectory } = this._computeTrajectoryAndMilestones(simulationData, context);
        const startYear = simulationData[0].year;

        return {
            coastFire: this._formatMilestone(coastFire, requiredNestEggAtRetirement, startYear),
            baristaFire: this._formatMilestone(baristaFire, 0, startYear),
            leanFire: this._formatMilestone(leanFire, 0, startYear),
            fullFire: this._formatMilestone(fullFire, 0, startYear),
            parameters: {
                coastTargetAge: params.coastTargetAge,
                baristaAnnualIncome: params.baristaAnnualIncome,
                leanRatio: params.leanRatio,
                realReturnRatePct: Math.round(params.realRate * PERCENT_CONVERSION_FACTOR * 100) / 100
            },
            trajectory
        };
    }

    static _getEmptyResults() {
        return {
            coastFire: { year: null, age: null, age1: null, age2: null, portfolio: 0, target: 0, isAchieved: false },
            baristaFire: { year: null, age: null, age1: null, age2: null, portfolio: 0, target: 0, isAchieved: false },
            leanFire: { year: null, age: null, age1: null, age2: null, portfolio: 0, target: 0, isAchieved: false },
            fullFire: { year: null, age: null, age1: null, age2: null, portfolio: 0, target: 0, isAchieved: false },
            parameters: {},
            trajectory: []
        };
    }
}
