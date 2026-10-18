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
     * @param {number} discountRate - Nominal discount rate (matches nominal cash flows in snapshots)
     * @param {Function} netExpenseFn - Function (snapshot, idx) returning net expense required
     * @param {number} [terminalYears=0] - Additional post-simulation retirement years until life expectancy
     * @param {number} [realRateForTerminal=null] - Real discount rate for post-simulation terminal reserve annuity
     * @returns {number} Required present value portfolio at startIdx
     */
    static calculateRequiredPortfolioAt(
        snapshots,
        startIdx,
        discountRate,
        netExpenseFn,
        terminalYears = 0,
        realRateForTerminal = null
    ) {
        if (!snapshots || startIdx >= snapshots.length || startIdx < 0) return 0;

        let required = 0;
        if (terminalYears > 0 && snapshots.length > 0) {
            const lastIdx = snapshots.length - 1;
            const lastNetNeed = netExpenseFn ? netExpenseFn(snapshots[lastIdx], lastIdx) : 0;
            if (lastNetNeed > 0) {
                const annuityRate = realRateForTerminal ?? discountRate;
                if (annuityRate > 0.0001) {
                    required = lastNetNeed * ((1 - Math.pow(1 + annuityRate, -terminalYears)) / annuityRate);
                } else {
                    required = lastNetNeed * terminalYears;
                }
            }
        }

        for (let i = snapshots.length - 1; i >= startIdx; i--) {
            const netNeed = netExpenseFn(snapshots[i], i);
            required = required / (1 + discountRate) + netNeed;
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
        if (!currentMilestone && isFinite(target) && actualPortfolio >= target && target > 0) {
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
     * Coast FIRE is strictly a pre-retirement milestone (i <= coastTargetIdx).
     * @private
     */
    static _computeCoastTarget(i, context) {
        const { coastTargetIdx, requiredNestEggAtRetirement, nominalRate } = context;
        if (i <= coastTargetIdx) {
            const yearsToCoast = coastTargetIdx - i;
            return requiredNestEggAtRetirement / Math.pow(1 + nominalRate, yearsToCoast);
        }
        return Infinity;
    }

    /**
     * Calculates the Full FIRE target at a given index.
     * @private
     */
    static _computeFullTarget(i, context) {
        const { simulationData, nominalRate, realRate, retirementNetExpenseFn, terminalYears } = context;
        return this.calculateRequiredPortfolioAt(
            simulationData,
            i,
            nominalRate,
            retirementNetExpenseFn,
            terminalYears,
            realRate
        );
    }

    /**
     * Calculates the Lean FIRE target at a given index.
     * @private
     */
    static _computeLeanTarget(i, context) {
        const { simulationData, nominalRate, realRate, leanRatio, terminalYears } = context;
        const leanExpenseFn = (s) => {
            const expenses = (s.expenses || 0) * leanRatio;
            const inflows = this.getGuaranteedInflows(s);
            return Math.max(0, expenses - inflows);
        };
        return this.calculateRequiredPortfolioAt(
            simulationData,
            i,
            nominalRate,
            leanExpenseFn,
            terminalYears,
            realRate
        );
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
            's1SeppIra',
            's2SeppIra',
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
            const isSingle = context.isSingleFiler;
            const age1 = snap.age1 ?? snap.age;
            const age2 = !isSingle && snap.age2 && snap.age2 > 0 ? snap.age2 : null;
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
                coastTarget: isFinite(coastTarget) ? Math.round(coastTarget) : null,
                baristaTarget: isFinite(baristaTarget) ? Math.round(baristaTarget) : null,
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
        const isSingle =
            state?.taxFilingStatus === 'single' ||
            (!state?.secondarySpouse?.name && !state?.secondarySpouse?.yearOfBirth);
        const s1Name = state?.primarySpouse?.name || 'Primary';
        const s2Name = state?.secondarySpouse?.name || 'Spouse 2';

        if (isSingle) {
            return {
                isDualEarner: false,
                isSingleFiler: true,
                downshiftingSpouseName: s1Name,
                continuingSpouseName: null
            };
        }

        const hasS2Employment = Boolean(
            (state?.secondarySpouse?.jobs && state.secondarySpouse.jobs.length > 0) ||
                (simulationData && simulationData.some((s) => (s.income?.s2?.w2Net || s.income?.s2?.w2Gross || 0) > 0))
        );

        return {
            isDualEarner: hasS2Employment,
            isSingleFiler: false,
            downshiftingSpouseName: s1Name,
            continuingSpouseName: hasS2Employment ? s2Name : null
        };
    }

    static _resolvePrimaryLifeExpectancy(state) {
        return (
            state?.primarySpouse?.lifeExpectancy ||
            state?.primarySpouse?.estimatedLifeExpectancy ||
            state?.assumptions?.estimatedLifeExpectancy ||
            95
        );
    }

    static _findCrossoverSnap(simulationData, milestone, fallbackIdx = 0) {
        if (!simulationData || simulationData.length === 0) return { idx: -1, snap: null };
        const idx =
            milestone?.year != null
                ? Math.max(
                      0,
                      simulationData.findIndex((s) => s.year === milestone.year)
                  )
                : fallbackIdx;
        return { idx, snap: simulationData[idx] || simulationData[0] || null };
    }

    /**
     * Extracts and calculates initial configuration parameters.
     * @private
     */
    static _resolveParameters(simulationData, state, options) {
        const assumptions = state?.assumptions || {};
        const nominalRate = (assumptions.generalReturnRate ?? 7.0) / PERCENT_CONVERSION_FACTOR;
        const realRate = this.getRealReturnRate(assumptions);
        const fireOpts = state?.strategies?.fireOptions || {};
        const primaryRetireAge = state?.primarySpouse?.targetRetirementAge || DEFAULT_COAST_TARGET_AGE;
        const coastTargetAge = this._resolveNumber(options.coastTargetAge ?? fireOpts.coastTargetAge, primaryRetireAge);
        const baristaAnnualIncome = this._resolveNumber(
            options.baristaIncome ?? fireOpts.baristaIncome,
            DEFAULT_BARISTA_ANNUAL_INCOME
        );
        const leanRatio = this._resolveNumber(options.leanRatio ?? fireOpts.leanRatio, DEFAULT_LEAN_EXPENSE_RATIO);

        const currentYear = simulationData[0].year;
        const firstAge = simulationData[0].age ?? simulationData[0].age1 ?? 45;
        const primaryBirthYear = state?.primarySpouse?.yearOfBirth || currentYear - firstAge;
        const coastRetireYear = primaryBirthYear + coastTargetAge;
        const coastTargetIdx = this._findCoastTargetIndex(simulationData, coastRetireYear);

        const endAge = firstAge + simulationData.length - 1;
        const lifeExpectancy = this._resolvePrimaryLifeExpectancy(state);
        const terminalYears = Math.max(0, lifeExpectancy - endAge);
        const earnerProfile = this._resolveEarnerProfiles(state, simulationData);

        return {
            nominalRate,
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
     * Barista FIRE is strictly a pre-retirement downshift milestone (i <= coastTargetIdx).
     * @private
     */
    static _computeBaristaTarget(i, context) {
        const { simulationData, nominalRate, realRate, coastTargetIdx, baristaAnnualIncome, terminalYears } = context;
        if (i > coastTargetIdx) {
            return Infinity;
        }
        const baristaExpenseFn = (s, idx) => {
            const isPreRetirement = idx < coastTargetIdx;
            const baseExpenses = s.expenses || 0;
            const continuingSpouseIncome = (s.income?.s2?.w2Net ?? s.income?.s2?.w2Gross) || 0;
            const earnedIncome = isPreRetirement ? baristaAnnualIncome + continuingSpouseIncome : 0;
            const inflows = this.getGuaranteedInflows(s) + earnedIncome;
            return Math.max(0, baseExpenses - inflows);
        };
        return this.calculateRequiredPortfolioAt(
            simulationData,
            i,
            nominalRate,
            baristaExpenseFn,
            terminalYears,
            realRate
        );
    }

    /**
     * Computes the math breakdown object for Coast FIRE.
     * @private
     */
    static _buildCoastMathBreakdown(context, milestone) {
        const targetRetirementAge = context.coastTargetAge;
        const currentPortfolio = context.simulationData[0] ? this.getPortfolioValue(context.simulationData[0]) : 0;
        const coastTargetToday = Math.round(this._computeCoastTarget(0, context));
        const coastProgressPct =
            isFinite(coastTargetToday) && coastTargetToday > 0
                ? Math.min(100, Math.round((currentPortfolio / coastTargetToday) * PERCENT_CONVERSION_FACTOR))
                : 0;
        const yearsOfCompounding = Math.max(0, context.coastTargetIdx);
        const nominalReturnRatePct = Math.round(context.nominalRate * PERCENT_CONVERSION_FACTOR * 100) / 100;
        const realReturnRatePct = Math.round(context.realRate * PERCENT_CONVERSION_FACTOR * 100) / 100;
        const projectedRetirementNestEgg = Math.round(
            currentPortfolio * Math.pow(1 + context.nominalRate, yearsOfCompounding)
        );
        const requiredRetirementNestEgg = Math.round(context.requiredNestEggAtRetirement);

        return {
            currentPortfolio: Math.round(currentPortfolio),
            coastTargetToday: isFinite(coastTargetToday) ? coastTargetToday : 0,
            coastProgressPct,
            targetRetirementAge,
            yearsOfCompounding,
            nominalReturnRatePct,
            realReturnRatePct,
            projectedRetirementNestEgg,
            requiredRetirementNestEgg,
            newSavingsNeededAnnual: 0,
            milestoneYear: milestone?.year ?? null
        };
    }

    /**
     * Computes the math breakdown object for Barista FIRE.
     * @private
     */
    static _getContinuingSpouseIncome(snap, isDualEarner) {
        if (!snap || !isDualEarner) return 0;
        const s2Inc = snap.income?.s2 || {};
        return Math.round(s2Inc.w2Net ?? s2Inc.w2Gross ?? 0);
    }

    static _buildBaristaMathBreakdown(context, milestone) {
        const { simulationData, baristaAnnualIncome, downshiftingSpouseName, continuingSpouseName, isDualEarner } =
            context;
        const { snap } = this._findCrossoverSnap(simulationData, milestone, 0);
        const annualLivingSpend = snap ? Math.round(snap.expenses || 0) : 0;
        const continuingSpouseIncome = this._getContinuingSpouseIncome(snap, isDualEarner);
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
     * Evaluates Full Target at the exact same crossover point as Lean FIRE.
     * @private
     */
    static _buildLeanMathBreakdown(context, leanMilestone, fullMilestone) {
        const { simulationData, leanRatio } = context;
        const { snap, idx: leanIdx } = this._findCrossoverSnap(simulationData, leanMilestone, 0);
        const baselineBudget = snap ? Math.round(snap.expenses || 0) : 0;
        const leanBudget = Math.round(baselineBudget * leanRatio);
        const leanRatioPct = Math.round(leanRatio * PERCENT_CONVERSION_FACTOR);
        const leanTarget = Math.round(leanMilestone?.target || 0);

        let fullTarget;
        if (leanIdx >= 0 && leanIdx < simulationData.length) {
            fullTarget = Math.round(this._computeFullTarget(leanIdx, context));
        } else {
            fullTarget = Math.round(context.requiredNestEggAtRetirement);
        }

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
        const { snap } = this._findCrossoverSnap(simulationData, milestone, context.coastTargetIdx);
        const annualRetirementExpenses = snap ? Math.round(snap.expenses || 0) : 0;
        const guaranteedInflows = snap ? Math.round(this.getGuaranteedInflows(snap)) : 0;
        const netAnnualNeed = Math.max(0, annualRetirementExpenses - guaranteedInflows);
        const targetPortfolio = milestone?.target || context.requiredNestEggAtRetirement;
        const rawRate = targetPortfolio > 0 ? netAnnualNeed / targetPortfolio : realRate;
        const initialSafeWithdrawalRatePct = Math.round(rawRate * PERCENT_CONVERSION_FACTOR * 100) / 100;

        return {
            annualRetirementExpenses,
            guaranteedInflows,
            netAnnualNeed,
            initialSafeWithdrawalRatePct,
            lifeExpectancyAge: this._resolvePrimaryLifeExpectancy(state),
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
                target: isFinite(defaultTarget) ? Math.round(defaultTarget) : 0,
                status,
                yearsUntil,
                isAlreadyAchieved,
                mathBreakdown
            };
        }

        return {
            ...milestone,
            target: isFinite(milestone.target) ? Math.round(milestone.target) : 0,
            portfolio: Math.round(milestone.portfolio),
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
            params.nominalRate,
            retirementNetExpenseFn,
            params.terminalYears,
            params.realRate
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
                nominalReturnRatePct: Math.round(params.nominalRate * PERCENT_CONVERSION_FACTOR * 100) / 100,
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
