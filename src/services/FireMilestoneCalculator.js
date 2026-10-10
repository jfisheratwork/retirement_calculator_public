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
     * Calculates the present value of a future cash flow stream using backward recursion,
     * including an actuarial terminal reserve annuity if the simulation ends prior to life expectancy.
     * @param {Array<Object>} snapshots - Array of YearlySnapshot objects
     * @param {number} startIdx - Index in snapshots to discount back to
     * @param {number} realRate - Discount rate
     * @param {Function} netExpenseFn - Function (snapshot, idx) returning net expense required
     * @param {number} [terminalYears=0] - Additional post-simulation retirement years until life expectancy
     * @returns {number} Required present value portfolio at startIdx
     */
    static calculateRequiredPortfolioAt(snapshots, startIdx, realRate, netExpenseFn, terminalYears = 0) {
        if (!snapshots || startIdx >= snapshots.length || startIdx < 0) return 0;

        let required = 0;
        if (terminalYears > 0 && snapshots.length > 0) {
            const lastIdx = snapshots.length - 1;
            const lastNetNeed = netExpenseFn ? netExpenseFn(snapshots[lastIdx], lastIdx) : 0;
            if (lastNetNeed > 0) {
                if (realRate > 0.0001) {
                    required = lastNetNeed * ((1 - Math.pow(1 + realRate, -terminalYears)) / realRate);
                } else {
                    required = lastNetNeed * terminalYears;
                }
            }
        }

        for (let i = snapshots.length - 1; i >= startIdx; i--) {
            const netNeed = netExpenseFn(snapshots[i], i);
            required = required / (1 + realRate) + netNeed;
        }
        return Math.max(0, required);
    }

    /**
     * Finds the index corresponding to the target retirement year.
     * @private
     */
    static _findCoastTargetIndex(simulationData, coastRetireYear) {
        let idx = simulationData.findIndex((d) => d.year === coastRetireYear);
        if (idx === -1) {
            idx = simulationData.findIndex((d) => d.year >= coastRetireYear);
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
        const {
            simulationData,
            coastTargetIdx,
            requiredNestEggAtRetirement,
            realRate,
            retirementNetExpenseFn,
            terminalYears
        } = context;
        if (i <= coastTargetIdx) {
            const yearsToCoast = coastTargetIdx - i;
            return requiredNestEggAtRetirement / Math.pow(1 + realRate, yearsToCoast);
        }
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, retirementNetExpenseFn, terminalYears);
    }

    /**
     * Calculates the Full FIRE target at a given index.
     * @private
     */
    static _computeFullTarget(i, context) {
        const { simulationData, realRate, retirementNetExpenseFn, terminalYears } = context;
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, retirementNetExpenseFn, terminalYears);
    }

    /**
     * Calculates the Lean FIRE target at a given index.
     * @private
     */
    static _computeLeanTarget(i, context) {
        const { simulationData, realRate, leanRatio, terminalYears } = context;
        const leanExpenseFn = (s) => {
            const expenses = (s.expenses || 0) * leanRatio;
            const inflows = this.getGuaranteedInflows(s);
            return Math.max(0, expenses - inflows);
        };
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, leanExpenseFn, terminalYears);
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
            's1Trad401k',
            's2Trad401k',
            's1Trad403b',
            's2Trad403b',
            's1StandardIra',
            's2StandardIra',
            's1Hysa',
            's2Hysa',
            's1Cd',
            's2Cd',
            's1Brokerage',
            's2Brokerage',
            's1RothIra',
            's2RothIra',
            's1Hsa',
            's2Hsa',
            'cashCushion'
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
            const age1 = snap.age1 ?? snap.age ?? year - context.primaryBirthYear;
            const age2 = snap.age2 && snap.age2 > 0 ? snap.age2 : null;
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
        return !isNaN(num) && val != null ? num : fallback;
    }

    /**
     * Extracts continuing earner information for dual-earner Barista modeling.
     * @private
     */
    static _resolveEarnerProfiles(state, simulationData) {
        const s1Name = state?.primarySpouse?.name || 'Primary';
        const s2Name = state?.secondarySpouse?.name || 'Spouse 2';

        const hasS2Employment = Boolean(
            (state?.secondarySpouse?.jobs && state.secondarySpouse.jobs.length > 0) ||
                (simulationData && simulationData.some((s) => (s.income?.s2?.w2Net || s.income?.s2?.w2Gross || 0) > 0))
        );

        return {
            isDualEarner: hasS2Employment,
            downshiftingSpouseName: s1Name,
            continuingSpouseName: hasS2Employment ? s2Name : null
        };
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
        const primaryBirthYear = state?.primarySpouse?.yearOfBirth || currentYear - firstAge;
        const coastRetireYear = primaryBirthYear + coastTargetAge;
        const coastTargetIdx = this._findCoastTargetIndex(simulationData, coastRetireYear);

        const endAge = firstAge + simulationData.length - 1;
        const lifeExpectancy =
            state?.primarySpouse?.lifeExpectancy ||
            state?.primarySpouse?.estimatedLifeExpectancy ||
            state?.assumptions?.estimatedLifeExpectancy ||
            95;
        const terminalYears = Math.max(0, lifeExpectancy - endAge);

        const earnerProfile = this._resolveEarnerProfiles(state, simulationData);

        return {
            realRate,
            coastTargetAge,
            baristaAnnualIncome,
            leanRatio,
            primaryBirthYear,
            coastTargetIdx,
            terminalYears,
            ...earnerProfile
        };
    }

    /**
     * Calculates the Barista FIRE target at a given index.
     * In a dual-earner household, primary downshifts to barista earnings while continuing spouse earns scheduled salary.
     * @private
     */
    static _computeBaristaTarget(i, context) {
        const { simulationData, realRate, coastTargetIdx, baristaAnnualIncome, terminalYears } = context;
        const baristaExpenseFn = (s, idx) => {
            const isPreRetirement = idx < coastTargetIdx;
            const baseExpenses = s.expenses || 0;
            const continuingSpouseIncome = (s.income?.s2?.w2Net ?? s.income?.s2?.w2Gross) || 0;
            const earnedIncome = isPreRetirement ? baristaAnnualIncome + continuingSpouseIncome : 0;
            const inflows = this.getGuaranteedInflows(s) + earnedIncome;
            return Math.max(0, baseExpenses - inflows);
        };
        return this.calculateRequiredPortfolioAt(simulationData, i, realRate, baristaExpenseFn, terminalYears);
    }

    /**
     * Computes the math breakdown object for Coast FIRE.
     * @private
     */
    static _buildCoastMathBreakdown(context, milestone) {
        const targetRetirementAge = context.coastTargetAge;
        const crossoverIdx =
            milestone?.year != null
                ? Math.max(
                      0,
                      context.simulationData.findIndex((s) => s.year === milestone.year)
                  )
                : 0;
        const currentPortfolio =
            milestone?.portfolio || (context.simulationData[0] ? this.getPortfolioValue(context.simulationData[0]) : 0);
        const yearsOfCompounding = Math.max(0, context.coastTargetIdx - crossoverIdx);
        const realReturnRatePct = Math.round(context.realRate * PERCENT_CONVERSION_FACTOR * 100) / 100;
        const projectedRetirementNestEgg = Math.round(
            currentPortfolio * Math.pow(1 + context.realRate, yearsOfCompounding)
        );
        const requiredRetirementNestEgg = Math.round(context.requiredNestEggAtRetirement);

        return {
            currentPortfolio: Math.round(currentPortfolio),
            targetRetirementAge,
            yearsOfCompounding,
            realReturnRatePct,
            projectedRetirementNestEgg,
            requiredRetirementNestEgg,
            newSavingsNeededAnnual: 0
        };
    }

    /**
     * Computes the math breakdown object for Barista FIRE.
     * @private
     */
    static _buildBaristaMathBreakdown(context, milestone) {
        const { simulationData, baristaAnnualIncome, downshiftingSpouseName, continuingSpouseName, isDualEarner } =
            context;
        const crossoverIdx =
            milestone?.year != null
                ? Math.max(
                      0,
                      simulationData.findIndex((s) => s.year === milestone.year)
                  )
                : simulationData[0]
                  ? 0
                  : -1;

        const snap = crossoverIdx >= 0 ? simulationData[crossoverIdx] : null;
        const annualLivingSpend = snap ? Math.round(snap.expenses || 0) : 0;
        const continuingSpouseIncome =
            snap && isDualEarner ? Math.round((snap.income?.s2?.w2Net ?? snap.income?.s2?.w2Gross) || 0) : 0;
        const totalHouseholdIncome = baristaAnnualIncome + continuingSpouseIncome;
        const incomeReplacementPct =
            annualLivingSpend > 0
                ? Math.round((totalHouseholdIncome / annualLivingSpend) * PERCENT_CONVERSION_FACTOR * 10) / 10
                : 0;
        const guaranteed = snap ? this.getGuaranteedInflows(snap) : 0;
        const netAnnualGap = Math.max(0, annualLivingSpend - (totalHouseholdIncome + guaranteed));
        const targetPortfolio = milestone?.target || 0;
        const portfolioWithdrawalRate =
            targetPortfolio > 0
                ? Math.round((netAnnualGap / targetPortfolio) * PERCENT_CONVERSION_FACTOR * 100) / 100
                : 0;

        return {
            annualLivingSpend,
            baristaIncome: baristaAnnualIncome,
            downshiftingSpouseName,
            continuingSpouseName,
            continuingSpouseIncome,
            totalHouseholdIncome,
            incomeReplacementPct,
            netAnnualGap,
            portfolioWithdrawalRate,
            isDualEarner
        };
    }

    /**
     * Computes the math breakdown object for Lean FIRE.
     * @private
     */
    static _buildLeanMathBreakdown(context, leanMilestone, fullMilestone) {
        const { simulationData, leanRatio } = context;
        const crossoverIdx =
            leanMilestone?.year != null
                ? Math.max(
                      0,
                      simulationData.findIndex((s) => s.year === leanMilestone.year)
                  )
                : 0;
        const snap = simulationData[crossoverIdx] || simulationData[0];
        const baselineBudget = snap ? Math.round(snap.expenses || 0) : 0;
        const leanBudget = Math.round(baselineBudget * leanRatio);
        const leanRatioPct = Math.round(leanRatio * PERCENT_CONVERSION_FACTOR);
        const leanTarget = Math.round(leanMilestone?.target || 0);
        const fullTarget = Math.round(fullMilestone?.target || context.requiredNestEggAtRetirement);
        const yearsSaved =
            leanMilestone?.year != null && fullMilestone?.year != null
                ? Math.max(0, fullMilestone.year - leanMilestone.year)
                : 0;

        return {
            baselineBudget,
            leanRatioPct,
            leanBudget,
            fullTarget,
            leanTarget,
            yearsSaved
        };
    }

    /**
     * Computes the math breakdown object for Full FIRE.
     * @private
     */
    static _buildFullMathBreakdown(context, milestone, state) {
        const { simulationData, realRate, terminalYears } = context;
        const crossoverIdx =
            milestone?.year != null
                ? Math.max(
                      0,
                      simulationData.findIndex((s) => s.year === milestone.year)
                  )
                : context.coastTargetIdx;
        const snap = simulationData[crossoverIdx] || simulationData[0];
        const annualRetirementExpenses = snap ? Math.round(snap.expenses || 0) : 0;
        const guaranteedInflows = snap ? Math.round(this.getGuaranteedInflows(snap)) : 0;
        const netAnnualNeed = Math.max(0, annualRetirementExpenses - guaranteedInflows);
        const targetPortfolio = milestone?.target || context.requiredNestEggAtRetirement;
        const initialSafeWithdrawalRatePct =
            targetPortfolio > 0
                ? Math.round((netAnnualNeed / targetPortfolio) * PERCENT_CONVERSION_FACTOR * 100) / 100
                : Math.round(realRate * PERCENT_CONVERSION_FACTOR * 100) / 100;

        const primaryLifeExp =
            state?.primarySpouse?.lifeExpectancy ||
            state?.primarySpouse?.estimatedLifeExpectancy ||
            state?.assumptions?.estimatedLifeExpectancy ||
            95;

        return {
            annualRetirementExpenses,
            guaranteedInflows,
            netAnnualNeed,
            initialSafeWithdrawalRatePct,
            lifeExpectancyAge: primaryLifeExp,
            terminalReserveIncluded: terminalYears > 0
        };
    }

    /**
     * Formats a milestone result object with the strict 3-state temporal discriminator and math breakdown.
     * @private
     */
    static _formatMilestone(milestone, defaultTarget = 0, startYear = null, mathBreakdown = {}) {
        const year = milestone?.year ?? null;
        let status = 'UNREACHED';
        let yearsUntil = null;

        if (year !== null && startYear !== null) {
            if (year <= startYear) {
                status = 'ACHIEVED_TODAY';
                yearsUntil = 0;
            } else {
                status = 'ON_TRACK';
                yearsUntil = year - startYear;
            }
        }

        const isAlreadyAchieved = status === 'ACHIEVED_TODAY';

        if (!milestone) {
            return {
                year: null,
                age: null,
                age1: null,
                age2: null,
                portfolio: 0,
                target: Math.round(defaultTarget),
                status,
                yearsUntil,
                isAlreadyAchieved,
                mathBreakdown
            };
        }

        return {
            ...milestone,
            status,
            yearsUntil,
            isAlreadyAchieved,
            mathBreakdown
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
            retirementNetExpenseFn,
            params.terminalYears
        );

        const context = {
            ...params,
            simulationData,
            requiredNestEggAtRetirement,
            retirementNetExpenseFn
        };

        const { coastFire, baristaFire, leanFire, fullFire, trajectory } = this._computeTrajectoryAndMilestones(
            simulationData,
            context
        );
        const startYear = simulationData[0].year;

        const coastMath = this._buildCoastMathBreakdown(context, coastFire, startYear);
        const baristaMath = this._buildBaristaMathBreakdown(context, baristaFire);
        const leanMath = this._buildLeanMathBreakdown(context, leanFire, fullFire);
        const fullMath = this._buildFullMathBreakdown(context, fullFire, state);

        return {
            coastFire: this._formatMilestone(coastFire, requiredNestEggAtRetirement, startYear, coastMath),
            baristaFire: this._formatMilestone(baristaFire, 0, startYear, baristaMath),
            leanFire: this._formatMilestone(leanFire, 0, startYear, leanMath),
            fullFire: this._formatMilestone(fullFire, 0, startYear, fullMath),
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
        const emptyMath = {};
        return {
            coastFire: {
                year: null,
                age: null,
                age1: null,
                age2: null,
                portfolio: 0,
                target: 0,
                status: 'UNREACHED',
                yearsUntil: null,
                isAlreadyAchieved: false,
                mathBreakdown: emptyMath
            },
            baristaFire: {
                year: null,
                age: null,
                age1: null,
                age2: null,
                portfolio: 0,
                target: 0,
                status: 'UNREACHED',
                yearsUntil: null,
                isAlreadyAchieved: false,
                mathBreakdown: emptyMath
            },
            leanFire: {
                year: null,
                age: null,
                age1: null,
                age2: null,
                portfolio: 0,
                target: 0,
                status: 'UNREACHED',
                yearsUntil: null,
                isAlreadyAchieved: false,
                mathBreakdown: emptyMath
            },
            fullFire: {
                year: null,
                age: null,
                age1: null,
                age2: null,
                portfolio: 0,
                target: 0,
                status: 'UNREACHED',
                yearsUntil: null,
                isAlreadyAchieved: false,
                mathBreakdown: emptyMath
            },
            parameters: {},
            trajectory: []
        };
    }
}
