/**
 * SurplusPullForwardEngine (SPEC-068)
 *
 * Detects late end-of-life overfunding (terminal surplus above desired legacy reserve)
 * and synthesizes three actionable pull-forward pathways:
 *   - Pathway A: Bridge Pre-59.5 Liquidity Lockout Gaps (Rule of 55, 72(t) SEPP Carve-Out,
 *     Standby HELOC, CD/Cash Sweep, Early Roth Conversion Ladder)
 *   - Pathway B: Downshift to Less Stressful Work Earlier (Barista / Coast Shift)
 *   - Pathway C: Accelerate Full Retirement (Retire Earlier while preserving legacy floor)
 *
 * Written with the assistance of Google Gemini
 */

import { SimulationEngine } from './SimulationEngine.js';
import { FireMilestoneCalculator } from './FireMilestoneCalculator.js';

const MODERATE_SURPLUS_REAL = 500000;
const SUBSTANTIAL_SURPLUS_REAL = 1500000;
const EXTREME_SURPLUS_REAL = 2500000;
const OVERFUNDED_MULTIPLE_OF_RETIRE_NW = 2.0;
const OVERFUNDED_EXPENSE_MULTIPLE = 25;

const DEFAULT_INFLATION_PCT = 3.0;
const DEFAULT_72T_RATE_PCT = 5.0;
const STATUTORY_72T_FLOOR_RATE = 0.05;
const EARLY_PENALTY_RATE = 0.1;
const MIN_HELOC_EQUITY_ELIGIBLE = 50000;
const IMMEDIATE_HELOC_EQUITY_THRESHOLD = 150000;
const DEFAULT_BARISTA_SALARY = 35000;
const MIN_CAREER_SALARY_FOR_DOWNSHIFT = 45000;
const MIN_ROTH_SEASONING_YEARS = 5;
const RULE_OF_55_AGE = 55;
const DEFAULT_LOCKOUT_TIER_AGE = 60;
const PERCENT_DIVISOR = 100;

/**
 * IRS Single Life Expectancy Table (Treas. Reg. § 1.401(a)(9)-9) factors for ages 40..60
 * used for IRS Notice 2022-6 Rule 72(t) SEPP Fixed Amortization carve-out sizing.
 */
const IRS_SINGLE_LIFE_TABLE = {
    40: 45.7,
    41: 44.8,
    42: 43.8,
    43: 42.9,
    44: 41.9,
    45: 41.0,
    46: 40.0,
    47: 39.0,
    48: 38.1,
    49: 37.1,
    50: 36.2,
    51: 35.3,
    52: 34.3,
    53: 33.4,
    54: 32.5,
    55: 31.6,
    56: 30.6,
    57: 29.8,
    58: 28.9,
    59: 28.0,
    60: 27.1
};

export class SurplusPullForwardEngine {
    /**
     * Computes total household Net Worth (liquid portfolio + home equity) for a snapshot.
     * @param {Object} snapshot
     * @param {Object} [state]
     * @returns {number}
     */
    static getSnapshotNetWorth(snapshot, state = null) {
        if (!snapshot) return 0;
        const liquid = FireMilestoneCalculator.getPortfolioValue(snapshot);
        const homeEquity = Number(snapshot.balances?.primaryResidenceEquity) || this._estimateStaticHomeEquity(state);
        return Math.round(liquid + Math.max(0, homeEquity));
    }

    static _estimateStaticHomeEquity(state) {
        if (!state) return 0;
        const homeVal = Number(state.primaryResidenceEquity?.currentValue || 0);
        const mortBal = state.primaryResidenceMortgage?.enabled
            ? Number(state.primaryResidenceMortgage?.currentBalance || 0)
            : 0;
        return Math.max(0, homeVal - mortBal);
    }

    /**
     * Calculates the optimal IRA carve-out balance A_sepp* under IRS Notice 2022-6
     * Fixed Amortization method to generate `annualGap` per year penalty-free.
     * @param {number} annualGap
     * @param {number} startAge
     * @param {number} [ratePct=5.0]
     * @returns {{ carveOutBalance: number, annualPayment: number, lifeExpectancyFactor: number, rateUsed: number }}
     */
    static calculateOptimalSeppCarveOut(annualGap, startAge = 55, ratePct = DEFAULT_72T_RATE_PCT) {
        const clampedAge = Math.max(40, Math.min(60, Math.floor(Number(startAge) || 55)));
        const n = IRS_SINGLE_LIFE_TABLE[clampedAge] || 31.6;
        const r = Math.max(STATUTORY_72T_FLOOR_RATE, (Number(ratePct) || DEFAULT_72T_RATE_PCT) / PERCENT_DIVISOR);
        const compound = Math.pow(1 + r, n);
        const amortizationFactor = (r * compound) / (compound - 1);
        const carveOutBalance = annualGap > 0 ? Math.round(annualGap / amortizationFactor) : 0;
        const annualPayment = Math.round(carveOutBalance * amortizationFactor);

        return {
            carveOutBalance,
            annualPayment,
            lifeExpectancyFactor: n,
            rateUsed: r
        };
    }

    static _classifyOverfundingTier(excessReal, isOverfunded) {
        if (!isOverfunded || excessReal < MODERATE_SURPLUS_REAL) return 'none';
        if (excessReal >= EXTREME_SURPLUS_REAL) return 'extreme';
        if (excessReal >= SUBSTANTIAL_SURPLUS_REAL) return 'substantial';
        return 'moderate';
    }

    static _computeAveragePostRetireExpense(simData, retireAge) {
        const startSnap = simData[0];
        const postRetireSnaps = simData.filter((s) => (s.age1 ?? s.age ?? 0) >= retireAge);
        if (postRetireSnaps.length === 0) return Number(startSnap?.expenses) || 100000;
        const total = postRetireSnaps.reduce((sum, s) => sum + Number(s.expenses || 0), 0);
        return total / postRetireSnaps.length;
    }

    static _resolveDesiredLegacyBuffer(options, state) {
        if (options && options.desiredLegacyBuffer !== undefined) {
            return Number(options.desiredLegacyBuffer) || 0;
        }
        return Number(state?.strategies?.targetLegacyBalance) || 0;
    }

    static _analyzeTerminalSurplus(simData, state, options = {}) {
        const startSnap = simData[0] || { year: 2026, expenses: 100000 };
        const endSnap = simData[simData.length - 1] || startSnap;
        const terminalNetWorthNominal = this.getSnapshotNetWorth(endSnap, state);
        const desiredLegacyBuffer = this._resolveDesiredLegacyBuffer(options, state);
        const excessTerminalSurplusNominal = Math.max(0, terminalNetWorthNominal - desiredLegacyBuffer);

        const rawInflation = Number(state?.assumptions?.inflationRate) || DEFAULT_INFLATION_PCT;
        const inflationRate = rawInflation / PERCENT_DIVISOR;
        const yearsSpan = Math.max(0, Number(endSnap.year) - Number(startSnap.year));
        const inflationFactor = Math.pow(1 + inflationRate, yearsSpan);

        const terminalNetWorthReal = Math.round(terminalNetWorthNominal / inflationFactor);
        const excessTerminalSurplusReal = Math.round(excessTerminalSurplusNominal / inflationFactor);

        const retireAge = Number(state?.primarySpouse?.targetRetirementAge) || 55;
        const retireSnap = simData.find((s) => (s.age1 ?? s.age ?? 0) >= retireAge) || startSnap;
        const retireNetWorth = this.getSnapshotNetWorth(retireSnap, state);
        const avgPostRetireExpense = this._computeAveragePostRetireExpense(simData, retireAge);

        const meetsMultipleCriteria =
            excessTerminalSurplusNominal >= OVERFUNDED_MULTIPLE_OF_RETIRE_NW * retireNetWorth ||
            terminalNetWorthNominal >= OVERFUNDED_EXPENSE_MULTIPLE * avgPostRetireExpense;
        const isOverfunded = excessTerminalSurplusReal >= MODERATE_SURPLUS_REAL && meetsMultipleCriteria;
        const overfundingTier = this._classifyOverfundingTier(excessTerminalSurplusReal, isOverfunded);

        return {
            terminalNetWorthNominal: Math.round(terminalNetWorthNominal),
            terminalNetWorthReal,
            desiredLegacyBuffer: Math.round(desiredLegacyBuffer),
            excessTerminalSurplusNominal: Math.round(excessTerminalSurplusNominal),
            excessTerminalSurplusReal,
            isOverfunded,
            overfundingTier
        };
    }

    static _getPreTaxBalanceInSnapshot(snap) {
        if (!snap?.balances) return 0;
        const b = snap.balances;
        // 403(b) accounts (s1Trad403b / s2Trad403b) are strictly excluded from pre-59.5 rollovers and bridge draws (SPEC-087)
        return (
            Number(b.s1Trad401k || 0) +
            Number(b.s2Trad401k || 0) +
            Number(b.s1StandardIra || 0) +
            Number(b.s2StandardIra || 0) +
            Number(b.s1SeppIra || 0) +
            Number(b.s2SeppIra || 0)
        );
    }

    static _buildRule55BridgeOption(state, maxShortfall) {
        const s1 = state?.primarySpouse || {};
        const retireAge = Number(s1.targetRetirementAge) || 55;
        const workAcc = (s1.accounts || []).find(
            (a) => a.type === 'traditional401k' && a.isActiveContributor !== false
        );
        const hasRolloverPoison = Boolean(s1.rolloverEvent?.enabled || workAcc?.rollover?.enabled);
        let feasibility = 'ineligible';
        if (retireAge >= RULE_OF_55_AGE && workAcc) {
            feasibility = hasRolloverPoison ? 'immediate' : 'action_required';
        }

        const penaltySavings =
            feasibility !== 'ineligible' && maxShortfall > 0 ? Math.round(maxShortfall * EARLY_PENALTY_RATE) : 0;

        return {
            id: 'rule55_preservation',
            title: 'IRS Rule of 55 Active 401(k) Preservation',
            description:
                'Cancel automatic 401(k)-to-IRA rollover at separation (Age 55+) so workplace funds remain 100% penalty-free before age 59½.',
            statutoryReference: 'IRC § 72(t)(2)(A)(v)',
            feasibility,
            capitalUnlockedAnnual: feasibility !== 'ineligible' ? Math.round(maxShortfall) : 0,
            estimatedTaxPenaltySavings: penaltySavings,
            magiImpactAnnual: feasibility !== 'ineligible' ? Math.round(maxShortfall) : 0,
            actionPayload: {
                patchTarget: 'primarySpouse.rolloverEvent.enabled',
                recommendedValue: false,
                explanation: 'Disables 401(k) to IRA rollover so Rule of 55 unlocks penalty-free workplace withdrawals.'
            }
        };
    }

    static _build72tBridgeOption(state, gapSnap, maxShortfall) {
        const s1 = state?.primarySpouse || {};
        const startAge = gapSnap?.age1 ?? Number(s1.targetRetirementAge) ?? 55;
        const ratePct = Number(state?.strategies?.rule72tInterestRate) || DEFAULT_72T_RATE_PCT;
        const sepp = this.calculateOptimalSeppCarveOut(maxShortfall, startAge, ratePct);
        const preTaxAvailable = this._getPreTaxBalanceInSnapshot(gapSnap);
        const feasibility =
            preTaxAvailable >= sepp.carveOutBalance && maxShortfall > 0 ? 'immediate' : 'action_required';
        const penaltySavings =
            feasibility !== 'ineligible' && maxShortfall > 0 ? Math.round(maxShortfall * EARLY_PENALTY_RATE) : 0;

        return {
            id: 'rule72t_sepp_split',
            title: 'IRS Rule 72(t) SEPP Dedicated IRA Split',
            description: `Carve out $${sepp.carveOutBalance.toLocaleString()} into a dedicated SEPP IRA sub-account under IRS Notice 2022-6 to distribute $${sepp.annualPayment.toLocaleString()}/yr penalty-free.`,
            statutoryReference: 'IRC § 72(t)(2)(A)(iv) & IRS Notice 2022-6',
            feasibility: preTaxAvailable > 0 ? feasibility : 'ineligible',
            capitalUnlockedAnnual: maxShortfall > 0 ? sepp.annualPayment : 0,
            estimatedTaxPenaltySavings: penaltySavings,
            magiImpactAnnual: sepp.annualPayment,
            carveOutBalance: sepp.carveOutBalance,
            actionPayload: {
                patchTarget: 'primarySpouse.rule72t',
                recommendedValue: {
                    enabled: true,
                    startAge,
                    targetIraMode: 'split',
                    splitAmount: sepp.carveOutBalance
                },
                explanation: `Configures a dedicated $${sepp.carveOutBalance.toLocaleString()} Rule 72(t) SEPP sub-account starting at Age ${startAge}.`
            }
        };
    }

    static _buildHelocBridgeOption(state, gapSnap, maxShortfall) {
        const staticEquity = this._estimateStaticHomeEquity(state);
        const snapEquity = Number(gapSnap?.balances?.primaryResidenceEquity || 0);
        const availableEquity = Math.max(staticEquity, snapEquity);

        let feasibility = 'ineligible';
        if (availableEquity >= IMMEDIATE_HELOC_EQUITY_THRESHOLD && availableEquity >= maxShortfall) {
            feasibility = 'immediate';
        } else if (availableEquity >= MIN_HELOC_EQUITY_ELIGIBLE) {
            feasibility = 'action_required';
        }

        return {
            id: 'standby_heloc',
            title: 'Standby Home Equity Bridge (HELOC)',
            description:
                'Draw against primary residence equity during pre-59½ lockout years with $0 income tax and $0 MAGI impact (preserving ACA healthcare subsidies).',
            statutoryReference: 'IRC § 163 / Non-Taxable Debt Proceeds',
            feasibility,
            capitalUnlockedAnnual:
                feasibility !== 'ineligible' && maxShortfall > 0
                    ? Math.round(Math.min(availableEquity, maxShortfall))
                    : 0,
            estimatedTaxPenaltySavings:
                feasibility !== 'ineligible' && maxShortfall > 0
                    ? Math.round(Math.min(availableEquity, maxShortfall) * EARLY_PENALTY_RATE)
                    : 0,
            magiImpactAnnual: 0,
            actionPayload: {
                patchTarget: 'primaryResidenceEquity.reverseMortgageEnabled',
                recommendedValue: true,
                explanation: 'Enables standby home equity credit line to bridge cash flow deficits tax-free.'
            }
        };
    }

    static _buildCdSweepBridgeOption(state, maxShortfall) {
        const s1Accounts = state?.primarySpouse?.accounts || [];
        const s2Accounts = state?.secondarySpouse?.accounts || [];
        const cdAcc = [...s1Accounts, ...s2Accounts].find((a) => a.type === 'cd' && Number(a.balance) > 0);
        const cdBalance = Number(cdAcc?.balance || 0);
        const isRollingOver = cdAcc?.maturityAction === 'rollover';
        const feasibility = cdAcc ? (isRollingOver ? 'immediate' : 'action_required') : 'ineligible';

        return {
            id: 'cd_cash_sweep',
            title: 'Matured CD & Cash Cushion Sweep',
            description:
                'Stop automatic CD rollovers prior to retirement so maturing CD principal sweeps directly into the liquid cash cushion.',
            statutoryReference: 'Liquid Principal Maturity Sweep',
            feasibility,
            capitalUnlockedAnnual:
                feasibility !== 'ineligible' && maxShortfall > 0 ? Math.round(Math.min(cdBalance, maxShortfall)) : 0,
            estimatedTaxPenaltySavings:
                feasibility !== 'ineligible' && maxShortfall > 0
                    ? Math.round(Math.min(cdBalance, maxShortfall) * EARLY_PENALTY_RATE)
                    : 0,
            magiImpactAnnual: 0,
            actionPayload: {
                patchTarget: 'primarySpouse.accounts.cd.maturityAction',
                recommendedValue: 'cash',
                explanation: 'Sweeps matured CD funds into the liquid cash cushion instead of locking in new rollovers.'
            }
        };
    }

    static _buildEarlyRothLadderOption(state, simData, maxShortfall) {
        const startYear = simData[0]?.year || new Date().getFullYear();
        const s1 = state?.primarySpouse || {};
        const retireYear = (Number(s1.yearOfBirth) || 1980) + (Number(s1.targetRetirementAge) || 55);
        const yearsToRetire = retireYear - startYear;
        const hasPreTax = this._getPreTaxBalanceInSnapshot(simData[0]) > 0;
        const feasibility = hasPreTax && yearsToRetire >= MIN_ROTH_SEASONING_YEARS ? 'immediate' : 'action_required';

        return {
            id: 'early_roth_ladder',
            title: 'Early 5-Year Roth Conversion Ladder',
            description:
                'Convert pre-tax IRA/401(k) tranches at least 5 tax years before needed so converted principal unlocks 100% tax-free and penalty-free at any age.',
            statutoryReference: 'IRC § 72(t)(2)(F) & § 408A(d)(3)(F)',
            feasibility: hasPreTax ? feasibility : 'ineligible',
            capitalUnlockedAnnual: hasPreTax && maxShortfall > 0 ? Math.round(maxShortfall) : 0,
            estimatedTaxPenaltySavings:
                hasPreTax && maxShortfall > 0 ? Math.round(maxShortfall * EARLY_PENALTY_RATE) : 0,
            magiImpactAnnual: 0,
            actionPayload: {
                patchTarget: 'primarySpouse.rothConversion.enabled',
                recommendedValue: true,
                explanation: 'Activates annual Roth conversion ladder to season penalty-free principal over 5 years.'
            }
        };
    }

    static _analyzeLiquidityLockout(simData, state) {
        const tierAge = Number(state?.strategies?.drawdownTierAge) || DEFAULT_LOCKOUT_TIER_AGE;
        const lockoutSnaps = simData.filter((s) => {
            const age = s.age1 ?? s.age ?? 0;
            const gap = (Number(s.unfundedShortfall) || 0) + (Number(s.income?.drawdowns?.penalizedPreTax) || 0);
            const preTaxBal = this._getPreTaxBalanceInSnapshot(s);
            return age < tierAge && gap > 1 && preTaxBal > gap;
        });

        const hasLockoutGap = lockoutSnaps.length > 0;
        const firstGapSnap = lockoutSnaps[0] || simData.find((s) => (s.age1 ?? s.age) >= 55) || simData[0];
        const firstGapYear = hasLockoutGap ? firstGapSnap.year : null;
        const gapDurationYears = lockoutSnaps.length;

        let maxAnnualShortfall = 0;
        let cumulativeShortfallNominal = 0;
        for (const snap of lockoutSnaps) {
            const gap = (Number(snap.unfundedShortfall) || 0) + (Number(snap.income?.drawdowns?.penalizedPreTax) || 0);
            if (gap > maxAnnualShortfall) maxAnnualShortfall = gap;
            cumulativeShortfallNominal += gap;
        }

        const refShortfall = maxAnnualShortfall > 0 ? maxAnnualShortfall : 0;
        const bridgeSolutions = [
            this._buildRule55BridgeOption(state, refShortfall),
            this._build72tBridgeOption(state, firstGapSnap, refShortfall),
            this._buildHelocBridgeOption(state, firstGapSnap, refShortfall),
            this._buildCdSweepBridgeOption(state, refShortfall),
            this._buildEarlyRothLadderOption(state, simData, refShortfall)
        ];

        return {
            hasLockoutGap,
            firstGapYear,
            gapDurationYears,
            maxAnnualShortfall: Math.round(maxAnnualShortfall),
            cumulativeShortfallNominal: Math.round(cumulativeShortfallNominal),
            bridgeSolutions
        };
    }

    static _prepareUnlockableCandidateState(baseState) {
        const cloned = JSON.parse(JSON.stringify(baseState));
        if (!cloned.strategies) cloned.strategies = {};
        cloned.strategies.allowEarlyPenalizedWithdrawals = true;
        // Disable artificial rollover poisoning on active workplace 401(k)/403(b) so Rule of 55 works naturally
        for (const key of ['primarySpouse', 'secondarySpouse']) {
            const sp = cloned[key];
            if (!sp) continue;
            if (sp.rolloverEvent) sp.rolloverEvent.enabled = false;
            for (const acc of sp.accounts || []) {
                if ((acc.type === 'traditional401k' || acc.type === 'trad403b') && acc.rollover) {
                    acc.rollover.enabled = false;
                }
            }
        }
        return cloned;
    }

    static _resolveAssumedDownshiftSalary(jobs) {
        const existingBaristaJob = jobs.find(
            (j, idx) => idx > 0 && Number(j.baseSalary) > 0 && Number(j.baseSalary) <= MIN_CAREER_SALARY_FOR_DOWNSHIFT
        );
        return Number(existingBaristaJob?.baseSalary) || DEFAULT_BARISTA_SALARY;
    }

    static _testDownshiftCandidateYear(state, spouseKey, primaryJob, assumedDownshiftSalary, candYear) {
        const candState = this._prepareUnlockableCandidateState(state);
        candState[spouseKey].jobs = [
            { ...primaryJob, startDate: '' },
            {
                id: 'job-downshift-sim',
                title: 'Barista / Downshift',
                baseSalary: assumedDownshiftSalary,
                startDate: `${candYear}-01-01`,
                bonusAmount: 0,
                ltiAmount: 0
            }
        ];

        const { data } = new SimulationEngine(candState).run();
        const hasShortfall = data.some((d) => (Number(d.unfundedShortfall) || 0) > 1);
        const termNW = this.getSnapshotNetWorth(data[data.length - 1], candState);
        return { hasShortfall, termNW };
    }

    static _getEligibleDownshiftSpouse(state, spouseKey) {
        const spouse = state?.[spouseKey];
        if (!Array.isArray(spouse?.jobs) || spouse.jobs.length === 0) return null;
        const primaryJob = spouse.jobs[0];
        if (Number(primaryJob?.baseSalary) < MIN_CAREER_SALARY_FOR_DOWNSHIFT) return null;
        return { spouse, primaryJob };
    }

    static _evaluateDownshiftForSpouse(state, spouseKey, startYear, desiredLegacyBuffer, isOverfunded) {
        const eligible = this._getEligibleDownshiftSpouse(state, spouseKey);
        if (!eligible) return null;

        const { spouse, primaryJob } = eligible;
        const birthYear = Number(spouse.yearOfBirth) || 1980;
        const retireAge = Number(spouse.targetRetirementAge) || 55;
        const baselineRetirementYear = birthYear + retireAge;
        const assumedDownshiftSalary = this._resolveAssumedDownshiftSalary(spouse.jobs);
        const spouseName = spouse.name || spouseKey;

        if (!isOverfunded || baselineRetirementYear <= startYear) {
            return {
                targetSpouseKey: spouseKey,
                spouseName,
                earliestDownshiftYear: baselineRetirementYear,
                earliestDownshiftAge: retireAge,
                baselineRetirementYear,
                yearsReclaimed: 0,
                assumedDownshiftSalary,
                projectedTerminalNetWorth: 0,
                isTerminalSafe: false
            };
        }

        for (let candYear = startYear; candYear <= baselineRetirementYear; candYear++) {
            const { hasShortfall, termNW } = this._testDownshiftCandidateYear(
                state,
                spouseKey,
                primaryJob,
                assumedDownshiftSalary,
                candYear
            );
            if (!hasShortfall && termNW >= desiredLegacyBuffer) {
                return {
                    targetSpouseKey: spouseKey,
                    spouseName,
                    earliestDownshiftYear: candYear,
                    earliestDownshiftAge: candYear - birthYear,
                    baselineRetirementYear,
                    yearsReclaimed: Math.max(0, baselineRetirementYear - candYear),
                    assumedDownshiftSalary,
                    projectedTerminalNetWorth: Math.round(termNW),
                    isTerminalSafe: true
                };
            }
        }

        return null;
    }

    static _analyzeDownshiftOpportunities(simData, state, surplusAnalysis) {
        const startYear = simData[0]?.year || new Date().getFullYear();
        const opportunities = [];
        for (const spouseKey of ['primarySpouse', 'secondarySpouse']) {
            const opp = this._evaluateDownshiftForSpouse(
                state,
                spouseKey,
                startYear,
                surplusAnalysis.desiredLegacyBuffer,
                surplusAnalysis.isOverfunded
            );
            if (opp) opportunities.push(opp);
        }
        return opportunities;
    }

    static _runAcceleratedRetirementCandidate(state, deltaYears) {
        const candState = this._prepareUnlockableCandidateState(state);
        const s1 = candState.primarySpouse;
        const s2 = candState.secondarySpouse;

        const baseAge1 = Number(s1.targetRetirementAge) || 55;
        const newAge1 = baseAge1 - deltaYears;
        const newYear1 = (Number(s1.yearOfBirth) || 1980) + newAge1;
        s1.targetRetirementAge = newAge1;
        s1.targetRetirementDate = `${newYear1}-01-01`;

        if (s2 && (s2.name || s2.yearOfBirth)) {
            const baseAge2 = Number(s2.targetRetirementAge) || 56;
            const newAge2 = baseAge2 - deltaYears;
            const newYear2 = (Number(s2.yearOfBirth) || 1979) + newAge2;
            s2.targetRetirementAge = newAge2;
            s2.targetRetirementDate = `${newYear2}-01-01`;
        }

        // Allow pre-59.5 bridge access (via 72t SEPP / Roth ladder / standard waterfall) when testing early retirement < 55
        if (candState.strategies) {
            candState.strategies.drawdownStrategy = 'standard';
        }

        const { data } = new SimulationEngine(candState).run();
        const hasShortfall = data.some((d) => (Number(d.unfundedShortfall) || 0) > 1);
        const endNetWorth = this.getSnapshotNetWorth(data[data.length - 1], candState);
        const endLiquid = FireMilestoneCalculator.getPortfolioValue(data[data.length - 1]);

        return { hasShortfall, endNetWorth, endLiquid, newYear1, newAge1 };
    }

    static _findBestAccelerationDelta(state, maxDelta, desiredLegacyBuffer, initialNetWorth) {
        let bestDelta = 0;
        let bestNetWorth = initialNetWorth;
        for (let delta = maxDelta; delta >= 1; delta--) {
            const res = this._runAcceleratedRetirementCandidate(state, delta);
            if (!res.hasShortfall && res.endNetWorth >= desiredLegacyBuffer && res.endLiquid > 0) {
                bestDelta = delta;
                bestNetWorth = res.endNetWorth;
                break;
            }
        }
        return { bestDelta, bestNetWorth };
    }

    static _analyzeRetirementAcceleration(simData, state, surplusAnalysis) {
        const startYear = simData[0]?.year || new Date().getFullYear();
        const s1 = state?.primarySpouse || {};
        const s2 = state?.secondarySpouse || {};
        const baseRetAge1 = Number(s1.targetRetirementAge) || 55;
        const baselineYear1 = (Number(s1.yearOfBirth) || 1980) + baseRetAge1;
        const baselineYear2 = (Number(s2.yearOfBirth) || 1979) + (Number(s2.targetRetirementAge) || 56);

        if (!surplusAnalysis.isOverfunded) {
            return {
                baselineRetirementYearPrimary: baselineYear1,
                baselineRetirementYearSecondary: baselineYear2,
                earliestSafeRetirementYearPrimary: baselineYear1,
                earliestSafeRetirementYearSecondary: baselineYear2,
                yearsAccelerated: 0,
                projectedTerminalNetWorth: surplusAnalysis.terminalNetWorthNominal,
                legacyTargetRespected: surplusAnalysis.terminalNetWorthNominal >= surplusAnalysis.desiredLegacyBuffer,
                recommendedBridgeActionId: baseRetAge1 >= RULE_OF_55_AGE ? 'rule55_preservation' : 'rule72t_sepp_split'
            };
        }

        const maxDelta = Math.max(0, baselineYear1 - startYear);
        const { bestDelta, bestNetWorth } = this._findBestAccelerationDelta(
            state,
            maxDelta,
            surplusAnalysis.desiredLegacyBuffer,
            surplusAnalysis.terminalNetWorthNominal
        );

        const earliestAge1 = baseRetAge1 - bestDelta;
        const horizonYears = Math.max(0, (Number(s1.estimatedLifeExpectancy) || 88) - earliestAge1);
        const maxSwrCeiling = horizonYears >= 45 ? 3.25 : horizonYears >= 35 ? 3.5 : 4.0;
        const initialRetireSnap = simData.find((s) => (s.age1 ?? s.age ?? 0) >= earliestAge1) || simData[0];
        const initialExpense = Number(initialRetireSnap?.expenses) || 80000;
        const initialPortfolio = FireMilestoneCalculator.getPortfolioValue(initialRetireSnap) || 1;
        const candidateSwrPct = Number(((initialExpense / initialPortfolio) * 100).toFixed(2));
        const swrSafe = candidateSwrPct <= maxSwrCeiling;

        return {
            baselineRetirementYearPrimary: baselineYear1,
            baselineRetirementYearSecondary: baselineYear2,
            earliestSafeRetirementYearPrimary: baselineYear1 - bestDelta,
            earliestSafeRetirementYearSecondary: baselineYear2 - bestDelta,
            yearsAccelerated: bestDelta,
            projectedTerminalNetWorth: Math.round(bestNetWorth),
            legacyTargetRespected: bestNetWorth >= surplusAnalysis.desiredLegacyBuffer,
            recommendedBridgeActionId: earliestAge1 >= RULE_OF_55_AGE ? 'rule55_preservation' : 'rule72t_sepp_split',
            swrAnalysis: {
                horizonYears,
                maxSwrCeiling,
                candidateSwrPct,
                swrSafe
            }
        };
    }

    /**
     * Evaluates baseline simulation data and state to produce a comprehensive SurplusOpportunityReport.
     * @param {Object} state
     * @param {Array<Object>} [baselineData=null]
     * @param {Object} [options={}]
     * @returns {Object} SurplusOpportunityReport
     */
    static evaluate(state, baselineData = null, options = {}) {
        const simData =
            Array.isArray(baselineData) && baselineData.length > 0
                ? baselineData
                : new SimulationEngine(state).run().data;

        const householdEndYear = simData.length > 0 ? simData[simData.length - 1].year : new Date().getFullYear();
        const surplusAnalysis = this._analyzeTerminalSurplus(simData, state, options);
        const liquidityLockout = this._analyzeLiquidityLockout(simData, state);
        const downshiftOpportunities = this._analyzeDownshiftOpportunities(simData, state, surplusAnalysis);
        const retirementAcceleration = this._analyzeRetirementAcceleration(simData, state, surplusAnalysis);

        return {
            timestamp: new Date().toISOString(),
            householdEndYear,
            surplusAnalysis,
            liquidityLockout,
            downshiftOpportunities,
            retirementAcceleration
        };
    }

    static _applyRule55Preservation(state) {
        for (const key of ['primarySpouse', 'secondarySpouse']) {
            const sp = state[key];
            if (!sp) continue;
            if (sp.rolloverEvent) sp.rolloverEvent.enabled = false;
            for (const acc of sp.accounts || []) {
                if ((acc.type === 'traditional401k' || acc.type === 'trad403b') && acc.rollover) {
                    acc.rollover.enabled = false;
                }
            }
        }
    }

    static _apply72tSeppSplit(state, optionPayload) {
        if (!state.primarySpouse) return;
        const rec = optionPayload?.recommendedValue || {};
        state.primarySpouse.rule72t = {
            ...(state.primarySpouse.rule72t || {}),
            enabled: true,
            startAge: rec.startAge || Number(state.primarySpouse.targetRetirementAge) || 55,
            targetIraMode: 'split',
            splitAmount: rec.splitAmount || 500000
        };
    }

    static _applyStandbyHeloc(state) {
        if (!state.primaryResidenceEquity) state.primaryResidenceEquity = {};
        state.primaryResidenceEquity.enabled = true;
        state.primaryResidenceEquity.reverseMortgageEnabled = true;
        const s1RetAge = Number(state.primarySpouse?.targetRetirementAge) || 55;
        state.primaryResidenceEquity.reverseMortgageStartAge = Math.min(62, s1RetAge);
    }

    static _applyCdCashSweep(state) {
        for (const key of ['primarySpouse', 'secondarySpouse']) {
            for (const acc of state[key]?.accounts || []) {
                if (acc.type === 'cd') {
                    acc.maturityAction = 'cash';
                }
            }
        }
    }

    static _applyEarlyRothLadder(state) {
        if (!state.primarySpouse) return;
        state.primarySpouse.rothConversion = {
            ...(state.primarySpouse.rothConversion || {}),
            enabled: true,
            amountPerYear: state.primarySpouse.rothConversion?.amountPerYear || 50000,
            durationYears: state.primarySpouse.rothConversion?.durationYears || 5
        };
    }

    /**
     * Applies a selected bridge or pull-forward fix directly to a state object.
     * @param {Object} state
     * @param {string} actionId
     * @param {Object} [payload={}]
     * @returns {Object} Mutated state
     */
    static applyFixToState(state, actionId, payload = {}) {
        const handlers = {
            rule55_preservation: () => this._applyRule55Preservation(state),
            rule72t_sepp_split: () => this._apply72tSeppSplit(state, payload),
            standby_heloc: () => this._applyStandbyHeloc(state),
            cd_cash_sweep: () => this._applyCdCashSweep(state),
            early_roth_ladder: () => this._applyEarlyRothLadder(state)
        };
        if (handlers[actionId]) {
            handlers[actionId]();
        }
        return state;
    }
}
