/**
 * StateSyncBridge.js
 *
 * Bi-directional state synchronization bridge between progressive onboarding tiers
 * (Express Quick Start, Guided 4-Step Planner) and the canonical simulation model.
 *
 * Implements SPEC-065 Section 5 Actuarial Default Inference Inventory and Section 6
 * Bi-Directional State Synchronization Architecture.
 *
 * Reference: SPEC-065 (Progressive Multi-Tier Account Setup & Data Simplification)
 * MDN Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/structuredClone
 *
 * > Written with the assistance of Google Gemini
 */

import { defaultState, deepMerge } from './state.js';

// Semantically named statutory benchmarks and actuarial constants (SPEC-065 Section 5)
export const SSA_INCOME_REPLACEMENT_RATIO = 0.28;
export const SSA_MAX_MONTHLY_BENEFIT = 3911;
export const SSA_FULL_RETIREMENT_AGE = 67;

export const DEFAULT_NOMINAL_RETURN = 7.0;
export const DEFAULT_INFLATION = 2.8;
export const DEFAULT_WAGE_RAISE = 2.0;
export const DEFAULT_STATE_TAX = 4.5;
export const DEFAULT_LIFE_EXPECTANCY = 95;

export const HOME_PROPERTY_TAX_RATE = 0.012;
export const HOME_INSURANCE_RATE = 0.005;
export const HOME_MAINTENANCE_RATE = 0.01;

export const MEDICARE_BASE_PREMIUM = 185;
export const MEDICARE_ELIGIBILITY_AGE = 65;

// Asset bucket allocation constants (Express single-sum)
export const BUCKET_SPLIT_PRETAX = 0.6;
export const BUCKET_SPLIT_ROTH = 0.25;
export const BUCKET_SPLIT_TAXABLE = 0.1;
export const BUCKET_SPLIT_CASH = 0.05;

// Expense phase ratios (relative to baseline living spend per Blanchett model)
export const PHASE_RATIO_EARLY_RETIREMENT = 1.0;
export const PHASE_RATIO_MID_RETIREMENT = 0.9;
export const PHASE_RATIO_OLDER_RETIREMENT = 0.85;

// Demographic and calendar defaults
export const DEFAULT_CURRENT_AGE = 35;
export const DEFAULT_RETIREMENT_AGE = 65;
export const DEFAULT_MORTGAGE_TERM_YEARS = 30;
export const DEFAULT_MORTGAGE_INTEREST_RATE = 5.0;
export const DEFAULT_HOME_GROWTH_RATE = 3.0;
export const DEFAULT_CASH_RETURN = 4.0;
export const DEFAULT_TAXABLE_COST_BASIS_RATIO = 0.5;
export const DEFAULT_GRAPH_YEARS = 50;
export const DEFAULT_START_MONTH = 1;
export const DEFAULT_DRAWDOWN_STRATEGY = 'age_tiered_60';
export const DEFAULT_DRAWDOWN_TIER_AGE = 60;
export const DEFAULT_DECUMULATION_MODE = 'capital_preservation';

export const MONTHS_PER_YEAR = 12;
export const PERCENT_DIVISOR = 100;
export const CENTS_PER_DOLLAR = 100;

// Internal date and calculation helpers

function _getCurrentYear(state) {
    if (state?.currentYear) return Number(state.currentYear);
    if (state?.assumptions?.startDate) {
        const parts = String(state.assumptions.startDate).split('-');
        const parsedYear = parseInt(parts[0], 10);
        if (!isNaN(parsedYear)) return parsedYear;
    }
    return new Date().getFullYear();
}

function _calculateMonthlyMortgagePayment(principal, termYears, ratePercent) {
    const totalMonths = termYears * MONTHS_PER_YEAR;
    if (totalMonths <= 0) return 0;
    const monthlyRate = ratePercent / PERCENT_DIVISOR / MONTHS_PER_YEAR;
    if (monthlyRate === 0) {
        return principal / totalMonths;
    }
    const compoundFactor = Math.pow(1 + monthlyRate, totalMonths);
    return (principal * (monthlyRate * compoundFactor)) / (compoundFactor - 1);
}

function _calculateMonthsPassed(origDateStr) {
    if (!origDateStr) return 0;
    const parts = String(origDateStr).split('-');
    const origYear = parseInt(parts[0], 10);
    const origMonth = (parseInt(parts[1], 10) || DEFAULT_START_MONTH) - 1;
    if (isNaN(origYear)) return 0;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    return Math.max(0, (curYear - origYear) * MONTHS_PER_YEAR + (curMonth - origMonth));
}

function _calculateMortgagePayoffDate(origDateStr, termYears) {
    const totalMonths = termYears * MONTHS_PER_YEAR;
    if (!origDateStr) {
        const now = new Date();
        return { year: now.getFullYear() + termYears, month: now.getMonth() + 1 };
    }
    const parts = String(origDateStr).split('-');
    const origYear = parseInt(parts[0], 10);
    const origMonth = (parseInt(parts[1], 10) || DEFAULT_START_MONTH) - 1;
    if (isNaN(origYear)) {
        const now = new Date();
        return { year: now.getFullYear() + termYears, month: now.getMonth() + 1 };
    }
    const endMonthTotal = origYear * MONTHS_PER_YEAR + origMonth + totalMonths;
    return {
        year: Math.floor(endMonthTotal / MONTHS_PER_YEAR),
        month: (endMonthTotal % MONTHS_PER_YEAR) + 1
    };
}

export function calculateMortgageAmortization(
    origDateStr,
    origAmount,
    termYears = DEFAULT_MORTGAGE_TERM_YEARS,
    interestRate = DEFAULT_MORTGAGE_INTEREST_RATE
) {
    const principal = Math.max(0, Number(origAmount) || 0);
    const term = Math.max(1, Number(termYears) || DEFAULT_MORTGAGE_TERM_YEARS);
    const ratePercent = Math.max(0, Number(interestRate) || 0);
    const totalMonths = term * MONTHS_PER_YEAR;

    if (principal <= 0) {
        return { currentBalance: 0, monthlyPI: 0, payoffYear: null, payoffMonth: null };
    }

    const monthlyPI = _calculateMonthlyMortgagePayment(principal, term, ratePercent);
    const monthsPassed = _calculateMonthsPassed(origDateStr);
    const monthlyRate = ratePercent / PERCENT_DIVISOR / MONTHS_PER_YEAR;

    let balance = principal;
    const effectiveMonths = Math.min(monthsPassed, totalMonths);
    for (let i = 0; i < effectiveMonths; i++) {
        if (balance <= 0) {
            balance = 0;
            break;
        }
        const interest = balance * monthlyRate;
        const principalPaid = monthlyPI - interest;
        balance = Math.max(0, balance - principalPaid);
    }

    const payoffInfo = _calculateMortgagePayoffDate(origDateStr, term);

    return {
        currentBalance: Math.round(balance * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR,
        monthlyPI: Math.round(monthlyPI * CENTS_PER_DOLLAR) / CENTS_PER_DOLLAR,
        payoffYear: payoffInfo.year,
        payoffMonth: payoffInfo.month
    };
}

export function estimateSsaBenefit(annualIncome) {
    const income = Math.max(0, Number(annualIncome) || 0);
    if (income === 0) return { monthly: 0, annual: 0 };
    const rawMonthly = Math.round((income * SSA_INCOME_REPLACEMENT_RATIO) / MONTHS_PER_YEAR);
    const monthly = Math.min(SSA_MAX_MONTHLY_BENEFIT, rawMonthly);
    return {
        monthly,
        annual: monthly * MONTHS_PER_YEAR
    };
}

function _createInferredAccounts(totalInvestedAssets) {
    const total = Math.max(0, Number(totalInvestedAssets) || 0);
    const preTaxAmt = Math.round(total * BUCKET_SPLIT_PRETAX);
    const rothAmt = Math.round(total * BUCKET_SPLIT_ROTH);
    const taxableAmt = Math.round(total * BUCKET_SPLIT_TAXABLE);
    const cashAmt = Math.round(total * BUCKET_SPLIT_CASH);

    return [
        {
            id: 'acc-inferred-401k',
            name: 'Traditional 401(k)',
            type: 'traditional401k',
            balance: preTaxAmt,
            expectedReturn: DEFAULT_NOMINAL_RETURN,
            isActiveContributor: true,
            isSweepAccount: false
        },
        {
            id: 'acc-inferred-roth',
            name: 'Roth IRA',
            type: 'rothIra',
            balance: rothAmt,
            principle: rothAmt,
            expectedReturn: DEFAULT_NOMINAL_RETURN,
            isActiveContributor: false,
            isSweepAccount: false
        },
        {
            id: 'acc-inferred-taxable',
            name: 'Taxable Brokerage',
            type: 'taxableBrokerage',
            balance: taxableAmt,
            costBasis: Math.round(taxableAmt * DEFAULT_TAXABLE_COST_BASIS_RATIO),
            expectedReturn: DEFAULT_NOMINAL_RETURN,
            isActiveContributor: false,
            isSweepAccount: true
        },
        {
            id: 'acc-inferred-cash',
            name: 'Emergency Savings (HYSA)',
            type: 'hysa',
            balance: cashAmt,
            expectedReturn: DEFAULT_CASH_RETURN,
            isActiveContributor: false,
            isSweepAccount: false
        }
    ];
}

function _inferExpensePhases(monthlySpend) {
    const monthly = Math.max(0, Number(monthlySpend) || 0);
    return {
        preTeens: monthly,
        teenagers: monthly,
        college: monthly,
        preRetirementNoKids: monthly,
        earlyRetirement: Math.round(monthly * PHASE_RATIO_EARLY_RETIREMENT),
        midRetirement: Math.round(monthly * PHASE_RATIO_MID_RETIREMENT),
        olderRetirement: Math.round(monthly * PHASE_RATIO_OLDER_RETIREMENT),
        bonusYears: Math.round(monthly * PHASE_RATIO_OLDER_RETIREMENT)
    };
}

// Decomposition of smart default inference

function _resolvePrimaryDemographics(primary, tierData, curYear) {
    primary.name = tierData.name || primary.name || 'Primary Planner';
    const age =
        tierData.currentAge !== undefined
            ? Number(tierData.currentAge)
            : primary.yearOfBirth
              ? curYear - primary.yearOfBirth
              : DEFAULT_CURRENT_AGE;
    primary.yearOfBirth = primary.yearOfBirth || curYear - age;
    primary.targetRetirementAge = Number(
        tierData.targetRetirementAge || primary.targetRetirementAge || DEFAULT_RETIREMENT_AGE
    );
    primary.targetRetirementDate =
        primary.targetRetirementDate || `${primary.yearOfBirth + primary.targetRetirementAge}-01`;
    primary.estimatedLifeExpectancy = primary.estimatedLifeExpectancy || DEFAULT_LIFE_EXPECTANCY;
    primary.socialSecurityStartAge = primary.socialSecurityStartAge || SSA_FULL_RETIREMENT_AGE;
    primary.socialSecurityStartMonth = primary.socialSecurityStartMonth || DEFAULT_START_MONTH;
    primary.socialSecurityStartDate =
        primary.socialSecurityStartDate || `${primary.yearOfBirth + primary.socialSecurityStartAge}-01`;
}

function _resolvePrimaryJobsAndSsa(primary, tierData, curYear) {
    const income = Number(tierData.householdIncome || tierData.annualIncome || tierData.primaryIncome || 0);
    const hasExistingJobs = Array.isArray(primary.jobs) && primary.jobs.length > 0;
    if (income > 0 && !hasExistingJobs) {
        primary.jobs = [
            {
                id: 'job-primary-1',
                title: 'Primary Career',
                baseSalary: income,
                startDate: `${curYear}-01`,
                bonusAmount: 0,
                bonusMonth: '',
                ltiAmount: 0,
                ltiMonth: '',
                employeeContributionPercent: 0,
                employerMatchPercent: 0,
                employerMatchLimitPercent: 0
            }
        ];
    }
    if (primary.socialSecurityMonthlyBenefit === 0 && income > 0) {
        const ssa = estimateSsaBenefit(income);
        primary.socialSecurityMonthlyBenefit = ssa.monthly;
        primary.socialSecurityAnnualBenefit = ssa.annual;
    }
}

function _resolveSecondaryDemographics(secondary, tierData, curYear) {
    secondary.name = tierData.spouseName || secondary.name || 'Partner';
    const sAge =
        tierData.spouseAge !== undefined
            ? Number(tierData.spouseAge)
            : secondary.yearOfBirth
              ? curYear - secondary.yearOfBirth
              : DEFAULT_CURRENT_AGE;
    secondary.yearOfBirth = secondary.yearOfBirth || curYear - sAge;
    secondary.targetRetirementAge = Number(
        tierData.spouseRetirementAge || secondary.targetRetirementAge || DEFAULT_RETIREMENT_AGE
    );
    secondary.targetRetirementDate =
        secondary.targetRetirementDate || `${secondary.yearOfBirth + secondary.targetRetirementAge}-01`;
    secondary.socialSecurityStartDate =
        secondary.socialSecurityStartDate || `${secondary.yearOfBirth + secondary.socialSecurityStartAge}-01`;
}

function _resolveSecondaryJobsAndSsa(secondary, tierData, curYear) {
    const sIncome = Number(tierData.spouseIncome || 0);
    const hasExistingJobs = Array.isArray(secondary.jobs) && secondary.jobs.length > 0;
    if (sIncome > 0 && !hasExistingJobs) {
        secondary.jobs = [
            {
                id: 'job-secondary-1',
                title: 'Partner Career',
                baseSalary: sIncome,
                startDate: `${curYear}-01`,
                bonusAmount: 0,
                bonusMonth: '',
                ltiAmount: 0,
                ltiMonth: ''
            }
        ];
    }
    if (sIncome > 0 && secondary.socialSecurityMonthlyBenefit === 0) {
        const ssa = estimateSsaBenefit(sIncome);
        secondary.socialSecurityMonthlyBenefit = ssa.monthly;
        secondary.socialSecurityAnnualBenefit = ssa.annual;
    }
}

function _populateSecondarySpouseDefaults(secondary, tierData, curYear) {
    secondary.estimatedLifeExpectancy = secondary.estimatedLifeExpectancy || DEFAULT_LIFE_EXPECTANCY;
    secondary.socialSecurityStartAge = secondary.socialSecurityStartAge || SSA_FULL_RETIREMENT_AGE;
    secondary.socialSecurityStartMonth = secondary.socialSecurityStartMonth || DEFAULT_START_MONTH;

    const hasSpouse = Boolean(
        tierData.hasSpouse ||
            tierData.isCouple ||
            tierData.spouseAge ||
            secondary.name ||
            (secondary.yearOfBirth && secondary.yearOfBirth > 0)
    );
    if (!hasSpouse) return;

    _resolveSecondaryDemographics(secondary, tierData, curYear);
    _resolveSecondaryJobsAndSsa(secondary, tierData, curYear);
}

function _populateEquityDefaults(state, tierData) {
    const homeVal = Number(tierData.homeValue || state.primaryResidenceEquity.currentValue || 0);
    state.primaryResidenceEquity.enabled = true;
    state.primaryResidenceEquity.currentValue = homeVal;
    state.primaryResidenceEquity.annualGrowthRate =
        state.primaryResidenceEquity.annualGrowthRate || DEFAULT_HOME_GROWTH_RATE;
    state.primaryResidenceEquity.reverseMortgageEnabled = Boolean(state.primaryResidenceEquity.reverseMortgageEnabled);

    state.primaryResidenceMortgage.yearlyTaxes = Math.round(homeVal * HOME_PROPERTY_TAX_RATE);
    state.primaryResidenceMortgage.yearlyInsurance = Math.round(homeVal * HOME_INSURANCE_RATE);
    state.primaryResidenceMortgage.yearlyRepairs = Math.round(homeVal * HOME_MAINTENANCE_RATE);
}

function _populateMortgageDefaults(state, mort) {
    if (!mort) return;
    const hasMortgageData = Boolean(mort.originationAmount || mort.currentBalance || mort.originationDate);
    if (!hasMortgageData) return;

    state.primaryResidenceMortgage.enabled = true;
    state.primaryResidenceMortgage.originationDate =
        mort.originationDate || state.primaryResidenceMortgage.originationDate;
    state.primaryResidenceMortgage.originationAmount =
        Number(mort.originationAmount) || state.primaryResidenceMortgage.originationAmount;
    state.primaryResidenceMortgage.termYears =
        Number(mort.termYears) || state.primaryResidenceMortgage.termYears || DEFAULT_MORTGAGE_TERM_YEARS;
    state.primaryResidenceMortgage.interestRate =
        Number(mort.interestRate) || state.primaryResidenceMortgage.interestRate || DEFAULT_MORTGAGE_INTEREST_RATE;

    const amort = calculateMortgageAmortization(
        state.primaryResidenceMortgage.originationDate,
        state.primaryResidenceMortgage.originationAmount,
        state.primaryResidenceMortgage.termYears,
        state.primaryResidenceMortgage.interestRate
    );
    state.primaryResidenceMortgage.currentBalance =
        mort.currentBalance !== undefined ? Number(mort.currentBalance) : amort.currentBalance;
}

function _populateHousingDefaults(state, tierData) {
    const isHomeowner =
        tierData.housingStatus === 'own' ||
        Number(tierData.homeValue || 0) > 0 ||
        state.primaryResidenceEquity?.enabled;
    if (!isHomeowner) {
        if (tierData.housingStatus === 'rent') {
            state.primaryResidenceEquity.enabled = false;
            state.primaryResidenceMortgage.enabled = false;
        }
        return;
    }

    _populateEquityDefaults(state, tierData);
    _populateMortgageDefaults(state, tierData.mortgage);
}

function _populateAccountsAndSpend(state, tierData) {
    const hasNoAccounts = !state.primarySpouse.accounts || state.primarySpouse.accounts.length === 0;
    if (tierData.totalInvestedAssets !== undefined && hasNoAccounts) {
        state.primarySpouse.accounts = _createInferredAccounts(tierData.totalInvestedAssets);
        state.assumptions.initialCashCushion = Math.round(Number(tierData.totalInvestedAssets) * BUCKET_SPLIT_CASH);
    }

    let spend = null;
    if (tierData.monthlyLivingSpend !== undefined) {
        spend = Number(tierData.monthlyLivingSpend);
    } else if (tierData.annualLivingSpend !== undefined) {
        spend = Math.round(Number(tierData.annualLivingSpend) / MONTHS_PER_YEAR);
    }
    if (spend !== null) {
        state.phaseBasedExpensesPerMonth = _inferExpensePhases(spend);
    }
}

function _resolveMacroRate(tierVal, baseVal, defaultVal) {
    if (tierVal !== undefined) return Number(tierVal);
    if (baseVal !== undefined) return Number(baseVal);
    return defaultVal;
}

function _populateAssumptionsAndStrategies(state, curYear, baseState, tierData) {
    const assumptions = state.assumptions;
    const baseAssumptions = baseState ? baseState.assumptions : null;

    if (tierData.nominalReturn !== undefined) {
        assumptions.marketReturnRates = [{ startYear: curYear, rate: Number(tierData.nominalReturn) }];
    } else if (
        !baseAssumptions ||
        !Array.isArray(baseAssumptions.marketReturnRates) ||
        baseAssumptions.marketReturnRates.length === 0
    ) {
        assumptions.marketReturnRates = [{ startYear: curYear, rate: DEFAULT_NOMINAL_RETURN }];
    }

    assumptions.inflationRate = _resolveMacroRate(
        tierData.inflationRate,
        baseAssumptions ? baseAssumptions.inflationRate : undefined,
        DEFAULT_INFLATION
    );
    assumptions.w2RaiseRate = _resolveMacroRate(
        tierData.w2RaiseRate,
        baseAssumptions ? baseAssumptions.w2RaiseRate : undefined,
        DEFAULT_WAGE_RAISE
    );
    assumptions.stateTaxRate = _resolveMacroRate(
        tierData.stateTaxRate,
        baseAssumptions ? baseAssumptions.stateTaxRate : undefined,
        DEFAULT_STATE_TAX
    );
    assumptions.startDate = assumptions.startDate || `${curYear}-01`;
    assumptions.displayRealDollars = assumptions.displayRealDollars ?? true;
    assumptions.graphYears = assumptions.graphYears || DEFAULT_GRAPH_YEARS;

    state.strategies.drawdownStrategy = state.strategies.drawdownStrategy || DEFAULT_DRAWDOWN_STRATEGY;
    state.strategies.drawdownTierAge = state.strategies.drawdownTierAge || DEFAULT_DRAWDOWN_TIER_AGE;
    state.strategies.decumulationMode = state.strategies.decumulationMode || DEFAULT_DECUMULATION_MODE;
}

export function inferSmartDefaults(baseState, tierData = {}) {
    const state = deepMerge(defaultState, baseState || {});
    const curYear = _getCurrentYear(state);

    _resolvePrimaryDemographics(state.primarySpouse, tierData, curYear);
    _resolvePrimaryJobsAndSsa(state.primarySpouse, tierData, curYear);
    _populateSecondarySpouseDefaults(state.secondarySpouse, tierData, curYear);
    _populateAccountsAndSpend(state, tierData);
    _populateHousingDefaults(state, tierData);
    _populateAssumptionsAndStrategies(state, curYear, baseState, tierData);

    state.healthcare = {
        enabled: true,
        monthlyPremium: MEDICARE_BASE_PREMIUM,
        startAge: MEDICARE_ELIGIBILITY_AGE
    };

    return state;
}

// Decomposition of Express View Model calculations

function _computeExpressAssets(state) {
    const pAccs = state?.primarySpouse?.accounts || [];
    const sAccs = state?.secondarySpouse?.accounts || [];
    let total = 0;
    for (const a of pAccs) total += Number(a.balance) || 0;
    for (const a of sAccs) total += Number(a.balance) || 0;

    if (total === 0 && state?.assumptions?.initialCashCushion) {
        total = Number(state.assumptions.initialCashCushion);
    }
    return {
        totalInvestedAssets: total,
        accountCount: pAccs.length + sAccs.length
    };
}

function _computeExpressIncome(state) {
    const pJobs = state?.primarySpouse?.jobs || [];
    const sJobs = state?.secondarySpouse?.jobs || [];
    let householdIncome = 0;
    let hasJobBonuses = false;

    const allJobs = [...pJobs, ...sJobs];
    for (const j of allJobs) {
        const base = Number(j.baseSalary) || 0;
        const bonus = Number(j.bonusAmount) || 0;
        const lti = Number(j.ltiAmount) || 0;
        householdIncome += base + bonus + lti;
        if (bonus > 0 || lti > 0) hasJobBonuses = true;
    }

    const hasComplexJobs = allJobs.length > 1 || hasJobBonuses;
    return { householdIncome, hasComplexJobs };
}

function _computeExpressLivingSpend(state) {
    const phases = state?.phaseBasedExpensesPerMonth || {};
    const monthlyLiving =
        Number(phases.earlyRetirement) || Number(phases.preRetirementNoKids) || Number(phases.preTeens) || 0;
    return monthlyLiving * MONTHS_PER_YEAR;
}

function _computeExpressAssumptionsSummary(state) {
    const assumptions = state && state.assumptions ? state.assumptions : {};
    const primary = state && state.primarySpouse ? state.primarySpouse : {};
    const rates = Array.isArray(assumptions.marketReturnRates) ? assumptions.marketReturnRates : [];

    let nominalReturn = DEFAULT_NOMINAL_RETURN;
    if (rates.length > 0 && rates[0].rate !== undefined) {
        nominalReturn = rates[0].rate;
    }

    return {
        nominalReturn,
        inflationRate: assumptions.inflationRate !== undefined ? assumptions.inflationRate : DEFAULT_INFLATION,
        wageRaiseRate: assumptions.w2RaiseRate !== undefined ? assumptions.w2RaiseRate : DEFAULT_WAGE_RAISE,
        stateTaxRate: assumptions.stateTaxRate !== undefined ? assumptions.stateTaxRate : DEFAULT_STATE_TAX,
        lifeExpectancy:
            primary.estimatedLifeExpectancy !== undefined ? primary.estimatedLifeExpectancy : DEFAULT_LIFE_EXPECTANCY,
        socialSecurityStartAge:
            primary.socialSecurityStartAge !== undefined ? primary.socialSecurityStartAge : SSA_FULL_RETIREMENT_AGE,
        socialSecurityMonthlyBenefit: Number(primary.socialSecurityMonthlyBenefit) || 0
    };
}

export function toExpressViewModel(state) {
    const curYear = _getCurrentYear(state);
    const pBirthYear = state?.primarySpouse?.yearOfBirth;
    const currentAge = pBirthYear && curYear ? curYear - pBirthYear : null;
    const targetRetirementAge = state?.primarySpouse?.targetRetirementAge || null;

    const { totalInvestedAssets, accountCount } = _computeExpressAssets(state);
    const { householdIncome, hasComplexJobs } = _computeExpressIncome(state);
    const annualLivingSpend = _computeExpressLivingSpend(state);
    const assumptionsSummary = _computeExpressAssumptionsSummary(state);

    return {
        currentAge,
        targetRetirementAge,
        totalInvestedAssets,
        householdIncome,
        annualLivingSpend,
        hasComplexJobs,
        accountCount,
        assumptionsSummary
    };
}

// Decomposition of account write operations

function _applyAccountUpdate(state, targetTotal, options) {
    const pAccs = state.primarySpouse.accounts || [];
    const sAccs = state.secondarySpouse.accounts || [];
    const totalCount = pAccs.length + sAccs.length;

    if (totalCount === 0 || options?.consolidate) {
        state.primarySpouse.accounts = _createInferredAccounts(targetTotal);
        state.assumptions.initialCashCushion = Math.round(targetTotal * BUCKET_SPLIT_CASH);
        return;
    }

    if (totalCount === 1) {
        const targetAcc = pAccs.length === 1 ? pAccs[0] : sAccs[0];
        targetAcc.balance = targetTotal;
        if (targetAcc.type === 'taxableBrokerage')
            targetAcc.costBasis = Math.round(targetTotal * DEFAULT_TAXABLE_COST_BASIS_RATIO);
        if (targetAcc.type === 'rothIra') targetAcc.principle = targetTotal;
        return;
    }

    if (options?.prorate) {
        const curSum =
            pAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0) +
            sAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
        if (curSum > 0) {
            const ratio = targetTotal / curSum;
            pAccs.forEach((a) => {
                a.balance = Math.round((Number(a.balance) || 0) * ratio);
            });
            sAccs.forEach((a) => {
                a.balance = Math.round((Number(a.balance) || 0) * ratio);
            });
        }
        return;
    }

    const othersSum =
        pAccs.slice(1).reduce((s, a) => s + (Number(a.balance) || 0), 0) +
        sAccs.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    pAccs[0].balance = Math.max(0, targetTotal - othersSum);
}

function _applyJobUpdate(state, targetIncome, curYear, options) {
    const pJobs = state.primarySpouse.jobs || [];
    const sJobs = state.secondarySpouse.jobs || [];
    const totalJobs = pJobs.length + sJobs.length;

    if (totalJobs === 0 || options?.consolidateJobs) {
        state.primarySpouse.jobs = [
            {
                id: 'job-primary-1',
                title: 'Primary Career',
                baseSalary: targetIncome,
                startDate: `${curYear}-01`
            }
        ];
    } else if (totalJobs === 1) {
        pJobs[0].baseSalary = targetIncome;
    } else if (options?.prorateJobs) {
        const curSum =
            pJobs.reduce((s, j) => s + (Number(j.baseSalary) || 0), 0) +
            sJobs.reduce((s, j) => s + (Number(j.baseSalary) || 0), 0);
        if (curSum > 0) {
            const ratio = targetIncome / curSum;
            pJobs.forEach((j) => {
                j.baseSalary = Math.round((Number(j.baseSalary) || 0) * ratio);
            });
            sJobs.forEach((j) => {
                j.baseSalary = Math.round((Number(j.baseSalary) || 0) * ratio);
            });
        }
    } else {
        pJobs[0].baseSalary = targetIncome;
    }

    const ssa = estimateSsaBenefit(targetIncome);
    state.primarySpouse.socialSecurityMonthlyBenefit = ssa.monthly;
    state.primarySpouse.socialSecurityAnnualBenefit = ssa.annual;
}

export function applyExpressUpdate(state, expressData, options = {}) {
    const curYear = _getCurrentYear(state);

    if (expressData.currentAge !== undefined) {
        state.primarySpouse.yearOfBirth = curYear - Number(expressData.currentAge);
    }
    if (expressData.targetRetirementAge !== undefined) {
        state.primarySpouse.targetRetirementAge = Number(expressData.targetRetirementAge);
        const birthYear = state.primarySpouse.yearOfBirth || curYear - DEFAULT_CURRENT_AGE;
        state.primarySpouse.targetRetirementDate = `${birthYear + state.primarySpouse.targetRetirementAge}-01`;
    }

    if (expressData.totalInvestedAssets !== undefined) {
        _applyAccountUpdate(state, Number(expressData.totalInvestedAssets), options);
    }

    if (expressData.householdIncome !== undefined) {
        _applyJobUpdate(state, Number(expressData.householdIncome), curYear, options);
    }

    if (expressData.annualLivingSpend !== undefined) {
        const monthly = Math.round(Number(expressData.annualLivingSpend) / MONTHS_PER_YEAR);
        state.phaseBasedExpensesPerMonth = _inferExpensePhases(monthly);
    }

    if (expressData.housingStatus || expressData.homeValue || expressData.mortgageBalance !== undefined) {
        _populateHousingDefaults(state, {
            housingStatus: expressData.housingStatus,
            homeValue: expressData.homeValue,
            mortgage: expressData.mortgageBalance !== undefined ? { currentBalance: expressData.mortgageBalance } : null
        });
    }

    return state;
}

// Decomposition of Guided View Model (Steps 1 to 4)

function _computeGuidedPrimaryPerson(primary, curYear) {
    const pBirthYear = primary && primary.yearOfBirth ? primary.yearOfBirth : null;
    const currentAge = pBirthYear && curYear ? curYear - pBirthYear : null;
    return {
        name: primary && primary.name ? primary.name : 'Primary Planner',
        birthYear: pBirthYear,
        currentAge,
        targetRetirementAge:
            primary && primary.targetRetirementAge ? primary.targetRetirementAge : DEFAULT_RETIREMENT_AGE,
        lifeExpectancy:
            primary && primary.estimatedLifeExpectancy ? primary.estimatedLifeExpectancy : DEFAULT_LIFE_EXPECTANCY
    };
}

function _computeGuidedSpousePerson(secondary, curYear) {
    const sBirthYear = secondary && secondary.yearOfBirth ? secondary.yearOfBirth : null;
    const currentAge = sBirthYear && curYear ? curYear - sBirthYear : null;
    const hasSpouse = Boolean(secondary && (secondary.name || (sBirthYear && sBirthYear > 0)));
    return {
        hasSpouse,
        name: secondary && secondary.name ? secondary.name : '',
        birthYear: sBirthYear,
        currentAge,
        targetRetirementAge:
            secondary && secondary.targetRetirementAge ? secondary.targetRetirementAge : DEFAULT_RETIREMENT_AGE,
        lifeExpectancy:
            secondary && secondary.estimatedLifeExpectancy ? secondary.estimatedLifeExpectancy : DEFAULT_LIFE_EXPECTANCY
    };
}

function _computeGuidedStep1(state, curYear) {
    const primary = state ? state.primarySpouse : null;
    const secondary = state ? state.secondarySpouse : null;
    const rawDeps = state && Array.isArray(state.dependents) ? state.dependents : [];

    const dependents = rawDeps.map((d) => ({
        id: d.id,
        name: d.name,
        yearOfBirth: d.yearOfBirth,
        annualCollegeCost: d.annualCollegeCost || 0,
        currentCollegeSavingsBalance: d.currentCollegeSavingsBalance || 0
    }));

    return {
        primary: _computeGuidedPrimaryPerson(primary, curYear),
        spouse: _computeGuidedSpousePerson(secondary, curYear),
        dependents
    };
}

function _sumJobComp(jobs) {
    let total = 0;
    let hasBonus = false;
    for (const j of jobs) {
        const bonus = Number(j.bonusAmount) || 0;
        const lti = Number(j.ltiAmount) || 0;
        total += (Number(j.baseSalary) || 0) + bonus + lti;
        if (bonus > 0 || lti > 0) hasBonus = true;
    }
    return { total, hasBonus };
}

function _computeGuidedIncomes(pJobs, sJobs) {
    const p = _sumJobComp(pJobs);
    const s = _sumJobComp(sJobs);
    const totalCount = pJobs.length + sJobs.length;
    const hasComplexJobs = totalCount > 1 || p.hasBonus || s.hasBonus;

    return {
        primaryIncome: p.total,
        spouseIncome: s.total,
        totalHouseholdIncome: p.total + s.total,
        jobsSummary: { count: totalCount, isComplex: hasComplexJobs }
    };
}

function _formatGuidedMortgage(mort) {
    const amort = calculateMortgageAmortization(
        mort.originationDate,
        mort.originationAmount,
        mort.termYears,
        mort.interestRate
    );
    return {
        enabled: Boolean(mort.enabled),
        originationDate: mort.originationDate || '',
        originationAmount: mort.originationAmount || 0,
        termYears: mort.termYears || DEFAULT_MORTGAGE_TERM_YEARS,
        interestRate: mort.interestRate || 0,
        currentBalance: mort.currentBalance || 0,
        monthlyPI: amort.monthlyPI,
        payoffYear: amort.payoffYear,
        payoffMonth: amort.payoffMonth,
        yearlyTaxes: mort.yearlyTaxes || 0,
        yearlyInsurance: mort.yearlyInsurance || 0,
        yearlyRepairs: mort.yearlyRepairs || 0
    };
}

function _computeGuidedHousing(state) {
    const equity = state && state.primaryResidenceEquity ? state.primaryResidenceEquity : {};
    const mort = state && state.primaryResidenceMortgage ? state.primaryResidenceMortgage : {};
    const isHomeowner = Boolean(equity.enabled || mort.enabled);

    return {
        status: isHomeowner ? 'own' : 'rent',
        homeValue: equity.currentValue || 0,
        mortgage: _formatGuidedMortgage(mort)
    };
}

function _computeGuidedStep2(state) {
    const pJobs = state?.primarySpouse?.jobs || [];
    const sJobs = state?.secondarySpouse?.jobs || [];
    const incomeData = _computeGuidedIncomes(pJobs, sJobs);

    const phases = state?.phaseBasedExpensesPerMonth || {};
    const monthlyLivingSpend =
        Number(phases.earlyRetirement) || Number(phases.preRetirementNoKids) || Number(phases.preTeens) || 0;
    const housing = _computeGuidedHousing(state);

    return {
        primaryIncome: incomeData.primaryIncome,
        spouseIncome: incomeData.spouseIncome,
        totalHouseholdIncome: incomeData.totalHouseholdIncome,
        jobsSummary: incomeData.jobsSummary,
        monthlyLivingSpend,
        annualLivingSpend: monthlyLivingSpend * MONTHS_PER_YEAR,
        housing
    };
}

function _computeGuidedBuckets(allAccounts, cashCushion) {
    let preTax = 0;
    let roth = 0;
    let taxable = 0;
    let cashAccounts = 0;

    for (const a of allAccounts) {
        const bal = Number(a.balance) || 0;
        if (a.type === 'traditional401k' || a.type === 'trad403b' || a.type === 'standardIra') {
            preTax += bal;
        } else if (a.type === 'rothIra' || a.type === 'roth401k') {
            roth += bal;
        } else if (a.type === 'taxableBrokerage') {
            taxable += bal;
        } else if (a.type === 'hysa' || a.type === 'cd') {
            cashAccounts += bal;
        }
    }
    const cash = cashAccounts > 0 ? cashAccounts : cashCushion;
    return { preTax, roth, taxable, cash };
}

function _getAllAccounts(state) {
    const pAccs =
        state && state.primarySpouse && Array.isArray(state.primarySpouse.accounts) ? state.primarySpouse.accounts : [];
    const sAccs =
        state && state.secondarySpouse && Array.isArray(state.secondarySpouse.accounts)
            ? state.secondarySpouse.accounts
            : [];
    return [...pAccs, ...sAccs];
}

function _computeGuidedStep3(state) {
    const allAccounts = _getAllAccounts(state);
    const cashCushion = state && state.assumptions ? Number(state.assumptions.initialCashCushion || 0) : 0;
    const buckets = _computeGuidedBuckets(allAccounts, cashCushion);

    const equity = state && state.primaryResidenceEquity ? state.primaryResidenceEquity : {};
    const mort = state && state.primaryResidenceMortgage ? state.primaryResidenceMortgage : {};
    const homeVal = Number(equity.currentValue || 0);
    const mortBal = Number(mort.currentBalance || 0);
    const homeEquity = Math.max(0, homeVal - mortBal);
    const totalInvested = buckets.preTax + buckets.roth + buckets.taxable + buckets.cash;

    return {
        buckets,
        totalInvestedAssets: totalInvested,
        homeEquity,
        netWorth: totalInvested + homeEquity,
        accountsSummary: { count: allAccounts.length, isComplex: allAccounts.length > 4 }
    };
}

function _getStep4MacroRates(assumptions) {
    const rates = assumptions && Array.isArray(assumptions.marketReturnRates) ? assumptions.marketReturnRates : [];
    const nominalReturn = rates.length > 0 && rates[0].rate !== undefined ? rates[0].rate : DEFAULT_NOMINAL_RETURN;
    const inflationRate =
        assumptions && assumptions.inflationRate !== undefined ? assumptions.inflationRate : DEFAULT_INFLATION;
    const wageRaiseRate =
        assumptions && assumptions.w2RaiseRate !== undefined ? assumptions.w2RaiseRate : DEFAULT_WAGE_RAISE;
    const stateTaxRate =
        assumptions && assumptions.stateTaxRate !== undefined ? assumptions.stateTaxRate : DEFAULT_STATE_TAX;
    return {
        nominalReturn,
        inflationRate,
        realReturn: nominalReturn - inflationRate,
        wageRaiseRate,
        stateTaxRate
    };
}

function _getStep4SocialSecurity(primary, secondary) {
    return {
        primaryMonthlyBenefit: primary ? Number(primary.socialSecurityMonthlyBenefit || 0) : 0,
        primaryStartAge:
            primary && primary.socialSecurityStartAge !== undefined
                ? primary.socialSecurityStartAge
                : SSA_FULL_RETIREMENT_AGE,
        spouseMonthlyBenefit: secondary ? Number(secondary.socialSecurityMonthlyBenefit || 0) : 0,
        spouseStartAge:
            secondary && secondary.socialSecurityStartAge !== undefined
                ? secondary.socialSecurityStartAge
                : SSA_FULL_RETIREMENT_AGE
    };
}

function _computeGuidedStep4(state) {
    const assumptions = state ? state.assumptions : null;
    const primary = state ? state.primarySpouse : null;
    const secondary = state ? state.secondarySpouse : null;
    const strategies = state ? state.strategies : null;

    const macro = _getStep4MacroRates(assumptions);
    const socialSecurity = _getStep4SocialSecurity(primary, secondary);
    const goal = strategies && strategies.decumulationMode ? strategies.decumulationMode : DEFAULT_DECUMULATION_MODE;

    return {
        ...macro,
        socialSecurity,
        goal
    };
}

export function toGuidedViewModel(state) {
    const curYear = _getCurrentYear(state);
    return {
        step1: _computeGuidedStep1(state, curYear),
        step2: _computeGuidedStep2(state),
        step3: _computeGuidedStep3(state),
        step4: _computeGuidedStep4(state)
    };
}

// Decomposition of Guided updates

function _applyGuidedStep1(state, stepData, curYear) {
    if (stepData.primary) {
        if (stepData.primary.birthYear) state.primarySpouse.yearOfBirth = Number(stepData.primary.birthYear);
        if (stepData.primary.currentAge)
            state.primarySpouse.yearOfBirth = curYear - Number(stepData.primary.currentAge);
        if (stepData.primary.targetRetirementAge) {
            state.primarySpouse.targetRetirementAge = Number(stepData.primary.targetRetirementAge);
            state.primarySpouse.targetRetirementDate = `${state.primarySpouse.yearOfBirth + state.primarySpouse.targetRetirementAge}-01`;
        }
        if (stepData.primary.lifeExpectancy)
            state.primarySpouse.estimatedLifeExpectancy = Number(stepData.primary.lifeExpectancy);
    }
    if (stepData.spouse) {
        if (stepData.spouse.hasSpouse) {
            state.secondarySpouse.name = stepData.spouse.name || state.secondarySpouse.name || 'Partner';
            if (stepData.spouse.birthYear) state.secondarySpouse.yearOfBirth = Number(stepData.spouse.birthYear);
            if (stepData.spouse.currentAge)
                state.secondarySpouse.yearOfBirth = curYear - Number(stepData.spouse.currentAge);
            if (stepData.spouse.targetRetirementAge) {
                state.secondarySpouse.targetRetirementAge = Number(stepData.spouse.targetRetirementAge);
                state.secondarySpouse.targetRetirementDate = `${state.secondarySpouse.yearOfBirth + state.secondarySpouse.targetRetirementAge}-01`;
            }
            if (stepData.spouse.lifeExpectancy)
                state.secondarySpouse.estimatedLifeExpectancy = Number(stepData.spouse.lifeExpectancy);
        } else {
            state.secondarySpouse.name = '';
            state.secondarySpouse.yearOfBirth = null;
        }
    }
    if (Array.isArray(stepData.dependents)) {
        state.dependents = structuredClone(stepData.dependents);
    }
}

function _applyGuidedStep2(state, stepData, curYear) {
    if (stepData.primaryIncome !== undefined) {
        _applyJobUpdate(state, Number(stepData.primaryIncome), curYear, {});
    }
    if (stepData.spouseIncome !== undefined && state.secondarySpouse) {
        const sIncome = Number(stepData.spouseIncome);
        const sJobs = state.secondarySpouse.jobs || [];
        if (sJobs.length > 0) sJobs[0].baseSalary = sIncome;
        else if (sIncome > 0)
            state.secondarySpouse.jobs = [
                { id: 'job-secondary-1', title: 'Partner Career', baseSalary: sIncome, startDate: `${curYear}-01` }
            ];
        const ssa = estimateSsaBenefit(sIncome);
        state.secondarySpouse.socialSecurityMonthlyBenefit = ssa.monthly;
        state.secondarySpouse.socialSecurityAnnualBenefit = ssa.annual;
    }
    if (stepData.monthlyLivingSpend !== undefined) {
        state.phaseBasedExpensesPerMonth = _inferExpensePhases(stepData.monthlyLivingSpend);
    }
    if (stepData.housing) {
        _populateHousingDefaults(state, {
            housingStatus: stepData.housing.status,
            homeValue: stepData.housing.homeValue,
            mortgage: stepData.housing.mortgage
        });
    }
}

function _updateBucketAccounts(accounts, types, targetAmount) {
    const matched = accounts.filter((a) => types.includes(a.type));
    if (matched.length === 1) {
        matched[0].balance = targetAmount;
    } else if (matched.length > 1) {
        const curSum = matched.reduce((s, a) => s + (Number(a.balance) || 0), 0);
        if (curSum > 0) {
            const ratio = targetAmount / curSum;
            matched.forEach((a) => {
                a.balance = Math.round((Number(a.balance) || 0) * ratio);
            });
        } else {
            matched[0].balance = targetAmount;
        }
    }
}

function _applyGuidedStep3(state, stepData) {
    if (!stepData.buckets) return;
    const { preTax, roth, taxable, cash } = stepData.buckets;
    const accounts = state.primarySpouse.accounts || [];

    if (accounts.length === 0) {
        const inferred = _createInferredAccounts(0);
        inferred[0].balance = Number(preTax) || 0;
        inferred[1].balance = Number(roth) || 0;
        inferred[1].principle = Number(roth) || 0;
        inferred[2].balance = Number(taxable) || 0;
        inferred[2].costBasis = Math.round((Number(taxable) || 0) * DEFAULT_TAXABLE_COST_BASIS_RATIO);
        inferred[3].balance = Number(cash) || 0;
        state.primarySpouse.accounts = inferred;
        state.assumptions.initialCashCushion = Number(cash) || 0;
        return;
    }

    if (preTax !== undefined)
        _updateBucketAccounts(accounts, ['traditional401k', 'trad403b', 'standardIra'], Number(preTax));
    if (roth !== undefined) _updateBucketAccounts(accounts, ['rothIra', 'roth401k'], Number(roth));
    if (taxable !== undefined) _updateBucketAccounts(accounts, ['taxableBrokerage'], Number(taxable));
    if (cash !== undefined) {
        _updateBucketAccounts(accounts, ['hysa', 'cd'], Number(cash));
        state.assumptions.initialCashCushion = Number(cash);
    }
}

function _applyGuidedStep4(state, stepData) {
    if (stepData.nominalReturn !== undefined) {
        if (!state.assumptions.marketReturnRates || state.assumptions.marketReturnRates.length === 0) {
            state.assumptions.marketReturnRates = [
                { startYear: _getCurrentYear(state), rate: Number(stepData.nominalReturn) }
            ];
        } else {
            state.assumptions.marketReturnRates[0].rate = Number(stepData.nominalReturn);
        }
    }
    if (stepData.inflationRate !== undefined) state.assumptions.inflationRate = Number(stepData.inflationRate);
    if (stepData.socialSecurity) {
        if (stepData.socialSecurity.primaryMonthlyBenefit !== undefined) {
            state.primarySpouse.socialSecurityMonthlyBenefit = Number(stepData.socialSecurity.primaryMonthlyBenefit);
            state.primarySpouse.socialSecurityAnnualBenefit =
                state.primarySpouse.socialSecurityMonthlyBenefit * MONTHS_PER_YEAR;
        }
        if (stepData.socialSecurity.primaryStartAge !== undefined)
            state.primarySpouse.socialSecurityStartAge = Number(stepData.socialSecurity.primaryStartAge);
    }
    if (stepData.goal !== undefined) state.strategies.decumulationMode = stepData.goal;
}

export function applyGuidedUpdate(state, stepData, stepIndex) {
    const curYear = _getCurrentYear(state);
    if (stepIndex === 1) _applyGuidedStep1(state, stepData, curYear);
    else if (stepIndex === 2) _applyGuidedStep2(state, stepData, curYear);
    else if (stepIndex === 3) _applyGuidedStep3(state, stepData);
    else if (stepIndex === 4) _applyGuidedStep4(state, stepData);
    return state;
}

// Decomposition of Aggregated Field Details

function _getJobAggregateDetails(state, fieldKey) {
    const pJobs = state?.primarySpouse?.jobs || [];
    const sJobs = state?.secondarySpouse?.jobs || [];
    const items = [
        ...pJobs.map((j) => ({
            id: j.id,
            title: j.title || 'Primary Job',
            owner: 'Primary',
            baseSalary: j.baseSalary || 0,
            bonusAmount: j.bonusAmount || 0,
            ltiAmount: j.ltiAmount || 0,
            totalComp: (j.baseSalary || 0) + (j.bonusAmount || 0) + (j.ltiAmount || 0)
        })),
        ...sJobs.map((j) => ({
            id: j.id,
            title: j.title || 'Partner Job',
            owner: 'Partner',
            baseSalary: j.baseSalary || 0,
            bonusAmount: j.bonusAmount || 0,
            ltiAmount: j.ltiAmount || 0,
            totalComp: (j.baseSalary || 0) + (j.bonusAmount || 0) + (j.ltiAmount || 0)
        }))
    ];
    const totalAmount = items.reduce((s, i) => s + i.totalComp, 0);
    return {
        fieldKey,
        count: items.length,
        totalAmount,
        items,
        label: 'Custom Jobs Linked',
        badgeText: `${items.length} Custom Jobs Linked`
    };
}

function _getAccountAggregateDetails(fieldKey, allAccounts) {
    const totalAmount = allAccounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    return {
        fieldKey,
        count: allAccounts.length,
        totalAmount,
        items: allAccounts,
        label: 'Active Accounts Linked',
        badgeText: `${allAccounts.length} Active Accounts Linked`
    };
}

function _getBucketOrEntityDetails(state, key, allAccounts) {
    const bucketTypeMap = {
        pretax: ['traditional401k', 'trad403b', 'standardIra'],
        roth: ['rothIra', 'roth401k'],
        taxable: ['taxableBrokerage'],
        cash: ['hysa', 'cd']
    };

    if (bucketTypeMap[key]) {
        const matched = allAccounts.filter((a) => bucketTypeMap[key].includes(a.type));
        const totalAmount = matched.reduce((s, a) => s + (Number(a.balance) || 0), 0);
        return {
            fieldKey: key,
            count: matched.length,
            totalAmount,
            items: matched,
            label: `${key.toUpperCase()} Accounts`,
            badgeText: `${matched.length} Accounts`
        };
    }

    if (key === 'dependents') {
        const deps = state?.dependents || [];
        return {
            fieldKey: key,
            count: deps.length,
            totalAmount: 0,
            items: deps,
            label: 'Dependents',
            badgeText: `${deps.length} Dependents`
        };
    }

    return { fieldKey: key, count: 0, totalAmount: 0, items: [], label: 'Details', badgeText: '0 Items' };
}

export function getAggregatedFieldDetails(state, fieldKey) {
    const key = String(fieldKey || '').toLowerCase();
    const allAccounts = [
        ...(state?.primarySpouse?.accounts || []).map((a) => ({ ...a, owner: 'Primary' })),
        ...(state?.secondarySpouse?.accounts || []).map((a) => ({ ...a, owner: 'Partner' }))
    ];

    if (['jobs', 'householdincome', 'income'].includes(key)) {
        return _getJobAggregateDetails(state, fieldKey);
    }
    if (['accounts', 'totalinvestedassets', 'portfolio'].includes(key)) {
        return _getAccountAggregateDetails(fieldKey, allAccounts);
    }
    return _getBucketOrEntityDetails(state, key, allAccounts);
}

export const StateSyncBridge = {
    calculateMortgageAmortization,
    estimateSsaBenefit,
    inferSmartDefaults,
    toExpressViewModel,
    applyExpressUpdate,
    toGuidedViewModel,
    applyGuidedUpdate,
    getAggregatedFieldDetails
};
