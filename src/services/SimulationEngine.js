import {
    precalculateTaxTables,
    calculateFicaTax,
    calculateTax,
    getIrmaaAnnualSurcharge,
    calculate72tPayment
} from './tax.js';
import { Person } from '../models/Person.js';
import { Mortgage } from '../models/Mortgage.js';
import { YearlySnapshot } from '../models/YearlySnapshot.js';
import { RolloverEvent, RothConversionSchedule } from '../models/FinancialEvent.js';
import { RothConversionManager } from './RothConversionManager.js';
import { ExpenseCalculator } from './ExpenseCalculator.js';
import { CashFlowManager } from './CashFlowManager.js';
import { TaxManager } from './TaxManager.js';
import { SocialSecurityCalculator } from './SocialSecurityCalculator.js';
import { RMDCalculator } from './RMDCalculator.js';
import { ContributionCalculator } from './ContributionCalculator.js';
import { PortfolioManager } from './PortfolioManager.js';
import { StandardIra } from '../models/Account.js';
import { SurplusPullForwardEngine } from './SurplusPullForwardEngine.js';

export const SORR_SCENARIOS = {
    '2000-2009': [
        -9.1, -11.89, -22.1, 28.68, 10.88, 4.91, 15.79, 5.49, -37.0, 26.46, 15.06, 2.11, 16.0, 32.39, 13.69, 1.38,
        11.96, 21.83, -4.38, 31.49
    ],
    '2015-2024': [1.38, 11.96, 21.83, -4.38, 31.49, 18.4, 28.71, -18.11, 26.29, 24.23],
    '1987-1996': [
        5.25, 16.61, 31.69, -3.1, 30.47, 7.62, 10.08, 1.32, 37.58, 22.96, 33.36, 28.58, 21.04, -9.1, -11.89, -22.1,
        28.68, 10.88, 4.91, 15.79
    ],
    '1990-1999': [
        -3.1, 30.47, 7.62, 10.08, 1.32, 37.58, 22.96, 33.36, 28.58, 21.04, -9.1, -11.89, -22.1, 28.68, 10.88, 4.91,
        15.79, 5.49, -37.0, 26.46
    ],
    '1973-1982': [
        -14.66, -26.47, 37.2, 23.84, -7.18, 6.56, 18.44, 32.42, -4.91, 21.41, 22.51, 6.27, 32.16, 18.47, 5.23, 16.81,
        31.49, -3.17, 30.55, 7.67
    ],
    '2008-2017': [
        -37.0, 26.46, 15.06, 2.11, 16.0, 32.39, 13.69, 1.38, 11.96, 21.83, -4.38, 31.49, 18.4, 28.71, -18.11, 26.29,
        24.23
    ],
    '1968-1977': [
        10.81, -8.24, 3.84, 14.22, 18.72, -14.66, -26.47, 37.2, 23.84, -7.18, 6.56, 18.44, 32.42, -4.91, 21.41, 22.51,
        6.27, 32.16, 18.47, 5.23
    ],
    '1929-1938': [
        -8.3, -25.12, -43.84, -8.64, 49.98, -1.19, 46.74, 31.94, -35.34, 29.28, -1.1, -10.67, -12.77, 19.17, 25.06,
        19.03, 35.82, -8.43, 5.2, 5.7
    ]
};

function cleanPrecision(val) {
    return Math.round((Number(val) || 0) * 1e4) / 1e4;
}

function parsePrimaryResidenceEquity(pe = {}) {
    const currentValue = pe.currentValue ?? pe.currentHomeValue ?? 0;
    const annualGrowthRate = pe.annualGrowthRate ?? pe.growthRate ?? 3;
    const reverseMortgageStartAge = pe.reverseMortgageStartAge ?? pe.reverseMortgage?.startAge ?? 65;

    return {
        currentValue: Number(currentValue),
        annualGrowthRate: Number(annualGrowthRate),
        reverseMortgageEnabled: Boolean(pe.reverseMortgageEnabled ?? pe.reverseMortgage?.enabled ?? pe.enabled),
        reverseMortgageStartAge: Number(reverseMortgageStartAge),
        active: false
    };
}

export class SimulationEngine {
    constructor(state, sorrOverride = null) {
        this.originalState = state;
        this.sorrOverride = sorrOverride;
        this.events = [];
        this.yearlyData = [];

        this._initTimeline(state.assumptions || {});
        this._initDomainModels(state);

        this.initialPortfolioValue = null;
        this.totalRothConversions = 0;
        this.taxableIncome = 0;

        const yearsToRun = this.endYear - this.currentYear;
        this.taxTables = precalculateTaxTables(
            yearsToRun,
            this.assumptions.inflationRate,
            this.currentYear,
            this.assumptions
        );
    }

    _initTimeline(assumptions) {
        const defaultStartYear = new Date().getFullYear();
        const startDateStr = assumptions.startDate || `${defaultStartYear}-01`;
        const [startYearStr, startMonthStr] = String(startDateStr).split('-');
        this.startYear = parseInt(startYearStr, 10) || defaultStartYear;
        this.startMonth = parseInt(startMonthStr, 10) || 1;
        this.currentYear = this.startYear;
        this.endYear = this.currentYear + parseInt(assumptions.graphYears || 40, 10);
    }

    _initDomainModels(state) {
        this.s1 = new Person('s1', state.primarySpouse);
        this.s2 = new Person('s2', state.secondarySpouse);
        this.mortgage = new Mortgage(state.primaryResidenceMortgage || state.mortgage || { enabled: false });
        this.cashCushion = state.assumptions.initialCashCushion || 0;

        this.assumptions = state.assumptions;
        this.strategies = state.strategies || {};
        this.dependents = JSON.parse(JSON.stringify(state.dependents || []));
        this.phaseBasedExpensesPerMonth = state.phaseBasedExpensesPerMonth;
        this.primaryResidenceEquity = parsePrimaryResidenceEquity(state.primaryResidenceEquity || {});

        this.s1.rothConversion = new RothConversionSchedule(state.primarySpouse?.rothConversion);
        this.s2.rothConversion = new RothConversionSchedule(state.secondarySpouse?.rothConversion);
        this.s1.rolloverEvent = new RolloverEvent(state.primarySpouse?.rolloverEvent);
        this.s2.rolloverEvent = new RolloverEvent(state.secondarySpouse?.rolloverEvent);
    }

    run() {
        for (let year = this.currentYear; year <= this.endYear; year++) {
            if (this.s1.getAge(year) > this.s1.lifeExpectancy && this.s2.getAge(year) > this.s2.lifeExpectancy) {
                break;
            }

            const snapshot = this._initYearlySnapshot(year);
            const isFirstYear = year === this.currentYear;
            const firstActiveMonth = isFirstYear ? this.startMonth : 1;
            const activeMonths = 12 - firstActiveMonth + 1;
            const yearsFromStart = year - this.currentYear;

            this.recordLifeExpectancyEvents(year);

            // 1. Incomes & Expenses
            this.calculateBaseIncome(year, snapshot, firstActiveMonth);
            ExpenseCalculator.calculate({
                year,
                currentYear: this.currentYear,
                firstActiveMonth,
                s1: this.s1,
                s2: this.s2,
                dependents: this.dependents,
                phases: this.phaseBasedExpensesPerMonth,
                assumptions: this.assumptions,
                strategies: this.strategies,
                mortgage: this.mortgage,
                snapshot,
                events: this.events,
                onRecastLumpSum: (lumpSum, fundingSource) => {
                    this._handleMortgageRecastFunding(lumpSum, fundingSource, year, snapshot);
                }
            });

            this._applyIrmaaExpenses(year, snapshot, yearsFromStart);

            // 2. Mandatory Draws (SECURE Act 2.0 RMDs)
            this.taxableIncome += RMDCalculator.calculate({
                year,
                s1: this.s1,
                s2: this.s2,
                snapshot
            });

            // 3. Month-by-Month Simulation (Months 1 to 12)
            const w2RaiseMultiplier = Math.pow(1 + Number(this.assumptions.w2RaiseRate ?? 2.0) / 100, yearsFromStart);
            const monthlyRates = {
                monthlyBaseExpenses: activeMonths > 0 ? (snapshot.expenses || 0) / activeMonths : 0,
                monthlySsn:
                    activeMonths > 0
                        ? ((snapshot.income.s1.ssn || 0) + (snapshot.income.s2.ssn || 0)) / activeMonths
                        : 0
            };
            const monthCtx = {
                isFirstYear,
                firstActiveMonth,
                w2RaiseMultiplier,
                monthlyRates,
                s1Tracker: { electiveYtd: 0 },
                s2Tracker: { electiveYtd: 0 }
            };

            for (let month = 1; month <= 12; month++) {
                this._simulateMonth(year, month, snapshot, monthCtx);
            }

            // 4. Cash Flow & Annual Reconciliation
            this.processCashFlow(year, snapshot);
            this.calculateTaxes(year, snapshot, firstActiveMonth);
            this.finalizeSnapshot(snapshot);
            this.yearlyData.push(snapshot);
        }

        return {
            data: this.yearlyData,
            events: this.events
        };
    }

    _initYearlySnapshot(year) {
        this.taxableIncome = 0;
        this.totalRothConversions = 0;
        this.realizedLtcg = 0;

        const resetStats = (spouse) => {
            Object.values(spouse.accounts).forEach((acc) => acc.resetYearlyStats());
        };
        resetStats(this.s1);
        resetStats(this.s2);

        const initialMortgageBalance = this.mortgage.enabled ? this.mortgage.currentBalance : 0;
        const initialHomeValue = this.primaryResidenceEquity.currentValue || 0;
        const initialEquity = Math.max(0, initialHomeValue - initialMortgageBalance);

        return new YearlySnapshot({
            year,
            person1: this.s1,
            person2: this.s2,
            cashCushion: this.cashCushion,
            primaryResidenceEquity: initialEquity,
            homeValue: initialHomeValue,
            mortgageBalance: initialMortgageBalance
        });
    }

    _applyIrmaaExpenses(year, snapshot, yearsFromStart) {
        const currentTaxData = this.taxTables[yearsFromStart] || this.taxTables[this.taxTables.length - 1];
        const s1Age = this.s1.getAge(year);
        const s2Age = this.s2.getAge(year);
        const s1Alive = s1Age <= this.s1.lifeExpectancy;
        const s2Alive = s2Age <= this.s2.lifeExpectancy;
        const filingStatus = this.getFilingStatus(year);
        const lookbackMagi =
            (this.yearlyData.length > 0
                ? this.yearlyData[this.yearlyData.length - 1].taxableIncome
                : this.taxableIncome) || this.taxableIncome;
        const annualIrmaa = getIrmaaAnnualSurcharge(
            lookbackMagi,
            filingStatus,
            currentTaxData,
            s1Age,
            s2Age,
            s1Alive,
            s2Alive
        );
        if (annualIrmaa > 0) {
            snapshot.expenseBreakdown.irmaa = annualIrmaa;
            snapshot.expenses += annualIrmaa;
        }
    }

    _getAccountBalancesDictionary() {
        const getAccBal = (spouse, key) => spouse.accounts[key]?.balance || 0;
        const dict = {
            s1Trad401k: getAccBal(this.s1, 'traditional401k'),
            s2Trad401k: getAccBal(this.s2, 'traditional401k'),
            s1Trad403b: getAccBal(this.s1, 'trad403b'),
            s2Trad403b: getAccBal(this.s2, 'trad403b'),
            s1StandardIra: this._getAccountTypeBalance(this.s1, 'standardIra'),
            s2StandardIra: this._getAccountTypeBalance(this.s2, 'standardIra'),
            s1SeppIra: this._getSeppIraBalance(this.s1),
            s2SeppIra: this._getSeppIraBalance(this.s2),
            s1Hysa: getAccBal(this.s1, 'hysa'),
            s2Hysa: getAccBal(this.s2, 'hysa'),
            s1Cd: getAccBal(this.s1, 'cd'),
            s2Cd: getAccBal(this.s2, 'cd'),
            s1Brokerage: getAccBal(this.s1, 'taxableBrokerage'),
            s2Brokerage: getAccBal(this.s2, 'taxableBrokerage'),
            s1RothIra: getAccBal(this.s1, 'rothIra'),
            s2RothIra: getAccBal(this.s2, 'rothIra'),
            s1Hsa: getAccBal(this.s1, 'hsa'),
            s2Hsa: getAccBal(this.s2, 'hsa'),
            cashCushion: this.cashCushion,
            byAccount: {}
        };
        this._populateByAccountBalances(dict.byAccount, this.s1.accounts);
        this._populateByAccountBalances(dict.byAccount, this.s2.accounts);
        return dict;
    }

    _populateByAccountBalances(byAccountMap, accounts) {
        (accounts || []).forEach((acc) => {
            if (acc.id) byAccountMap[acc.id] = acc.balance;
            if (acc.name) byAccountMap[acc.name] = acc.balance;
        });
    }

    _getPre72tBalancesMap() {
        const map = {};
        this._populateByAccountBalances(map, this.s1.accounts);
        this._populateByAccountBalances(map, this.s2.accounts);
        return map;
    }

    _processMonthlyContributions(year, month, snapshot, monthCtx, w2Breakdown) {
        const { w2RaiseMultiplier, s1Tracker, s2Tracker } = monthCtx;
        const filingStatus = this.getFilingStatus(year);
        const householdMagi = this.yearlyHouseholdMagi ?? null;

        if (w2Breakdown.s1MonthGross > 0) {
            const s1MonthJobs = this.s1.getJobBreakdownForMonth(year, month, w2RaiseMultiplier);
            ContributionCalculator.contributeMonthly({
                spouse: this.s1,
                monthJobs: s1MonthJobs,
                annualJobs: snapshot.income.s1.jobs,
                monthW2Gross: w2Breakdown.s1MonthGross,
                annualW2Gross: snapshot.income.s1.w2Gross,
                year,
                filingStatus,
                householdMagi,
                tracker: s1Tracker
            });
        }

        if (w2Breakdown.s2MonthGross > 0) {
            const s2MonthJobs = this.s2.getJobBreakdownForMonth(year, month, w2RaiseMultiplier);
            ContributionCalculator.contributeMonthly({
                spouse: this.s2,
                monthJobs: s2MonthJobs,
                annualJobs: snapshot.income.s2.jobs,
                monthW2Gross: w2Breakdown.s2MonthGross,
                annualW2Gross: snapshot.income.s2.w2Gross,
                year,
                filingStatus,
                householdMagi,
                tracker: s2Tracker
            });
        }
    }

    _handleDownsizing(year, month, isFirstYear, firstActiveMonth, snapshot) {
        const isDownsizeMonth = (!isFirstYear && month === 1) || (isFirstYear && month === firstActiveMonth);
        if (!isDownsizeMonth || !this._canExecuteDownsizing(year)) {
            return;
        }
        const downsizeResult = this.mortgage.executeDownsizing(this.primaryResidenceEquity.currentValue);
        if (!downsizeResult) return;

        this.primaryResidenceEquity.currentValue = downsizeResult.replacementHomeValue;
        this._applyDownsizingCashProceeds(downsizeResult, year, snapshot);

        this.events.push({
            year,
            month,
            label: 'Downsized Home',
            type: 'downsize',
            color: '#0984e3'
        });
    }

    _canExecuteDownsizing(year) {
        return Boolean(
            this.mortgage.downsizing?.enabled &&
                year === Number(this.mortgage.downsizing.year) &&
                !this.mortgage.downsized
        );
    }

    _applyDownsizingCashProceeds(downsizeResult, year, snapshot) {
        const sweepAcc =
            this.s1.accounts.taxableBrokerage ||
            Object.values(this.s1.accounts).find((acc) => acc.type === 'taxableBrokerage') ||
            Object.values(this.s2.accounts).find((acc) => acc.type === 'taxableBrokerage');
        if (sweepAcc && downsizeResult.netCashProceeds > 0) {
            sweepAcc.balance += downsizeResult.netCashProceeds;
            if (sweepAcc.costBasis !== undefined) {
                sweepAcc.costBasis += downsizeResult.netCashProceeds;
            }
        }

        if (downsizeResult.cashDeficit > 0) {
            const shortfall = this.withdrawFromPortfolios(downsizeResult.cashDeficit, year, snapshot);
            if (shortfall > 0 && snapshot) {
                snapshot.unfundedShortfall = (snapshot.unfundedShortfall || 0) + shortfall;
            }
        }
    }

    _handleMortgageRecastFunding(lumpSum, fundingSource, year, snapshot) {
        if (lumpSum <= 0 || fundingSource === 'externalWindfall') return;
        let remaining = lumpSum;
        const brokerageAccounts = [
            ...(this.s1.accounts || []).filter((a) => a.type === 'taxableBrokerage'),
            ...(this.s2.accounts || []).filter((a) => a.type === 'taxableBrokerage')
        ];
        for (const acc of brokerageAccounts) {
            if (remaining <= 0 || !acc || acc.balance <= 0) continue;
            const drawn = acc.withdraw(remaining, {
                onLtcgRealized: (g) => {
                    this.realizedLtcg = (this.realizedLtcg || 0) + g;
                    if (snapshot) snapshot.realizedLtcg = (snapshot.realizedLtcg || 0) + g;
                }
            });
            remaining -= drawn;
        }
        if (remaining > 0) {
            const shortfall = this.withdrawFromPortfolios(remaining, year, snapshot);
            if (shortfall > 0 && snapshot) {
                snapshot.unfundedShortfall = (snapshot.unfundedShortfall || 0) + shortfall;
            }
        }
    }

    _simulateMonth(year, month, snapshot, monthCtx) {
        const { isFirstYear, firstActiveMonth, w2RaiseMultiplier, monthlyRates } = monthCtx;
        if (isFirstYear && month < firstActiveMonth) {
            snapshot.monthlySnapshots.push(this._buildInactiveMonthSnapshot(month));
            return;
        }

        const w2Breakdown = this._computeMonthlyW2Breakdown(year, month, snapshot, w2RaiseMultiplier);
        const bonusMilestone = this._computeMonthlyBonusMilestone(month, snapshot);

        this.processMonthlyRollovers(year, month);
        this._processMonthlyContributions(year, month, snapshot, monthCtx, w2Breakdown);
        this._handleDownsizing(year, month, isFirstYear, firstActiveMonth, snapshot);

        const pre72tByAccount = this._getPre72tBalancesMap();
        const month72tIncome = this._processMonthly72t(year, month, snapshot, isFirstYear, firstActiveMonth);
        const monthConverted = this.processRothConversions(year, snapshot, month);

        this.cashCushion = PortfolioManager.growAccountsMonthly({
            year,
            month,
            s1: this.s1,
            s2: this.s2,
            assumptions: this.assumptions,
            strategies: this.strategies,
            sorrOverride: this.sorrOverride,
            events: this.events,
            cashCushion: this.cashCushion,
            primaryResidenceEquity: this.primaryResidenceEquity
        });

        PortfolioManager.processCdMaturitiesMonthly({
            year,
            month,
            currentYear: this.currentYear,
            s1: this.s1,
            s2: this.s2,
            events: this.events
        });

        const monthTotalIncome = w2Breakdown.monthTakeHome + monthlyRates.monthlySsn + month72tIncome;
        const monthNetFlow = monthTotalIncome - monthlyRates.monthlyBaseExpenses;
        const balances = this._getAccountBalancesDictionary();
        balances.pre72tByAccount = pre72tByAccount;

        snapshot.monthlySnapshots.push({
            month,
            w2Gross: w2Breakdown.w2Gross,
            takeHome: w2Breakdown.monthTakeHome,
            w2Net: w2Breakdown.monthTakeHome,
            w2Tax: w2Breakdown.monthTax,
            w2Deductions: w2Breakdown.monthDeductions,
            ssn: monthlyRates.monthlySsn,
            rule72t: month72tIncome,
            rothConverted: monthConverted,
            expenses: monthlyRates.monthlyBaseExpenses,
            netFlow: monthNetFlow,
            bonusMilestone,
            balances
        });
    }

    _buildInactiveMonthSnapshot(month) {
        const balances = this._getAccountBalancesDictionary();
        balances.pre72tByAccount = this._getPre72tBalancesMap();
        return {
            month,
            w2Gross: 0,
            takeHome: 0,
            w2Net: 0,
            w2Tax: 0,
            w2Deductions: 0,
            ssn: 0,
            rule72t: 0,
            rothConverted: 0,
            expenses: 0,
            netFlow: 0,
            bonusMilestone: null,
            balances
        };
    }

    _computeMonthlyW2Breakdown(year, month, snapshot, w2RaiseMultiplier) {
        const s1MonthGross = this.s1.getSalaryForMonth(year, month, snapshot.events, w2RaiseMultiplier);
        const s2MonthGross = this.s2.getSalaryForMonth(year, month, snapshot.events, w2RaiseMultiplier);

        const s1W2 = snapshot.income.s1.w2Gross;
        const s2W2 = snapshot.income.s2.w2Gross;
        const s1MonthShare = s1W2 > 0 ? s1MonthGross / s1W2 : 0;
        const s2MonthShare = s2W2 > 0 ? s2MonthGross / s2W2 : 0;

        const monthTakeHome =
            (s1W2 > 0 ? (this.s1AnnualTakeHome || 0) * s1MonthShare : 0) +
            (s2W2 > 0 ? (this.s2AnnualTakeHome || 0) * s2MonthShare : 0);
        const monthTax =
            (s1W2 > 0 ? (this.s1TotalW2Tax || 0) * s1MonthShare : 0) +
            (s2W2 > 0 ? (this.s2TotalW2Tax || 0) * s2MonthShare : 0);
        const monthDeductions =
            (s1W2 > 0 ? (this.s1W2Deductions || 0) * s1MonthShare : 0) +
            (s2W2 > 0 ? (this.s2W2Deductions || 0) * s2MonthShare : 0);

        return {
            s1MonthGross,
            s2MonthGross,
            w2Gross: s1MonthGross + s2MonthGross,
            monthTakeHome,
            monthTax,
            monthDeductions
        };
    }

    _computeMonthlyBonusMilestone(month, snapshot) {
        const monthBonusEvents = (snapshot.events || []).filter(
            (evt) => evt && evt.month === month && (evt.type === 'income_bonus' || evt.type === 'income_lti')
        );
        if (monthBonusEvents.length === 0) return null;

        const s1W2 = snapshot.income.s1.w2Gross;
        const s2W2 = snapshot.income.s2.w2Gross;
        const gross = monthBonusEvents.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        let netTakeHome = 0;

        const items = monthBonusEvents.map((evt) => {
            const isS2 = Boolean(this.s2.name && evt.name && evt.name.includes(this.s2.name));
            const spouseGross = isS2 ? s2W2 : s1W2;
            const spouseTakeHome = isS2 ? this.s2AnnualTakeHome || 0 : this.s1AnnualTakeHome || 0;
            const itemNet = spouseGross > 0 ? (Number(evt.amount) / spouseGross) * spouseTakeHome : 0;
            netTakeHome += itemNet;
            return {
                name: evt.name,
                type: evt.type,
                gross: Number(evt.amount) || 0,
                netTakeHome: itemNet
            };
        });

        return { gross, netTakeHome, items };
    }

    recordLifeExpectancyEvents(year) {
        if (this.s1.getAge(year) === this.s1.lifeExpectancy && !this.events.find((e) => e.type === 's1_life_exp')) {
            this.events.push({ year, label: `${this.s1.name} Life Exp`, type: 's1_life_exp', color: '#2d3436' });
        }
        if (this.s2.getAge(year) === this.s2.lifeExpectancy && !this.events.find((e) => e.type === 's2_life_exp')) {
            this.events.push({ year, label: `${this.s2.name} Life Exp`, type: 's2_life_exp', color: '#2d3436' });
        }
    }

    processMonthlyRollovers(year, month) {
        [this.s1, this.s2].forEach((spouse) => {
            const hasAccountRollovers = (spouse.accounts || []).some((a) => a.rollover?.enabled);
            this._processAccountRollovers(spouse, year, month);
            if (!hasAccountRollovers) {
                this._processLegacySpouseRollover(spouse, year, month);
            }
        });
    }

    _processMonthly72t(year, month, snapshot, isFirstYear, firstActiveMonth) {
        let totalDrawn = 0;
        for (const spouse of [this.s1, this.s2]) {
            if (!spouse.rule72t || !spouse.rule72t.enabled) continue;
            this._checkAndRun72tInception(spouse, year, month, isFirstYear, firstActiveMonth);
            if (spouse.is72tActive(year, month) && (spouse.rule72tMonthlyPayment || 0) > 0) {
                const drawn = this._drawMonthly72t(spouse, year, month, snapshot);
                totalDrawn += drawn;
                this.taxableIncome += drawn;
            }
        }
        return totalDrawn;
    }

    _checkAndRun72tInception(spouse, year, month, isFirstYear, firstActiveMonth) {
        if (spouse._72tInceptionDone) return;
        const startAge = Number(spouse.rule72t.startAge) || 55;
        const startYear = spouse.birthYear + startAge;
        const startMonth = Number(spouse.rule72t.startMonth) || 1;

        const isDue =
            (year === startYear && month === startMonth) ||
            year > startYear ||
            (year === this.startYear &&
                month === firstActiveMonth &&
                (startYear < this.startYear || (startYear === this.startYear && startMonth <= firstActiveMonth)));

        if (isDue) {
            this._process72tInception(spouse, year, month);
        }
    }

    _process72tInception(spouse, year, month) {
        const r72t = spouse.rule72t;
        const targetName = r72t.newIraName || `${spouse.name || 'Spouse'} 72(t) IRA`;
        const targetAcc = this._resolve72tTargetIra(spouse, r72t, targetName);
        const sourceAcc = this._find72tSourceAccount(spouse, r72t.sourceAccount);

        if (sourceAcc && targetAcc && sourceAcc !== targetAcc) {
            this._execute72tFundingSplit(spouse, r72t, sourceAcc, targetAcc, { year, month });
        }

        // Exact Inception-Month Valuation (Post-rollover, Post-growth)
        const activeAcc = targetAcc || sourceAcc;
        const inceptionBalance = activeAcc ? activeAcc.balance : spouse.getTotalPreTaxBalance();
        const DEFAULT_72T_RATE = 0.05;
        const rate72t = this.strategies?.rule72tInterestRate
            ? Number(this.strategies.rule72tInterestRate) / 100
            : DEFAULT_72T_RATE;
        const inceptionAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const method = spouse.rule72tMethod || 'amortization';

        spouse.rule72tInceptionBalance = inceptionBalance;
        spouse.rule72tAnnualPayment = calculate72tPayment(inceptionBalance, rate72t, inceptionAge, method);
        spouse.rule72tMonthlyPayment = spouse.rule72tAnnualPayment / 12;
        spouse._72tInceptionDone = true;
        spouse._72tActive = true;
        spouse.rule72t.activeAccountId = activeAcc ? activeAcc.id : null;

        this.events.push({
            year,
            month,
            label: `${spouse.name || 'Spouse'} 72(t) SEPP`,
            type: 'income_72t',
            color: '#10b981'
        });
    }

    _find72tSourceAccount(spouse, sourceId) {
        const accounts = spouse.accounts || [];
        return (
            (sourceId ? accounts.find((a) => a.id === sourceId || a.name === sourceId || a.type === sourceId) : null) ||
            accounts.find((a) => a.type === 'standardIra' || a.type === 'traditional401k')
        );
    }

    _execute72tFundingSplit(spouse, r72t, sourceAcc, targetAcc, dateCtx) {
        const hasCustomSplit =
            r72t.splitAmount !== undefined &&
            r72t.splitAmount !== null &&
            r72t.splitAmount !== '' &&
            Number(r72t.splitAmount) > 0;
        const splitAmt = hasCustomSplit ? Number(r72t.splitAmount) : sourceAcc.balance;
        const transferAmount = Math.min(sourceAcc.balance, Math.max(0, splitAmt));
        if (transferAmount <= 0) return;

        sourceAcc.balance -= transferAmount;
        sourceAcc.yearRolloverOut = (sourceAcc.yearRolloverOut || 0) + transferAmount;
        sourceAcc.yearWithdrawals = (sourceAcc.yearWithdrawals || 0) + transferAmount;
        if (sourceAcc.returnRate !== undefined && targetAcc._is72tDedicated) {
            targetAcc.returnRate = sourceAcc.returnRate;
        }
        targetAcc.balance += transferAmount;
        targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + transferAmount;
        this.events.push({
            year: dateCtx.year,
            month: dateCtx.month,
            label: `${spouse.name || 'Spouse'} 72(t) Funding Split ($${Math.round(transferAmount).toLocaleString()} ➔ ${targetAcc.name})`,
            type: 'rollover'
        });
    }

    _resolve72tTargetIra(spouse, r72t, targetName) {
        const hasCustomSplit =
            r72t.splitAmount !== undefined &&
            r72t.splitAmount !== null &&
            r72t.splitAmount !== '' &&
            Number(r72t.splitAmount) > 0;
        if (r72t.targetIraMode === 'new' || hasCustomSplit) {
            const iraName = r72t.newIraName || r72t.targetAccountName || targetName;
            return this._getOrCreateStandardIra(spouse, iraName, 'ira-72t-');
        }
        const tgtId = r72t.targetAccount || r72t.sourceAccount;
        if (tgtId) {
            const found = (spouse.accounts || []).find((a) => a.id === tgtId || a.name === tgtId || a.type === tgtId);
            if (found) return found;
        }
        return (spouse.accounts || []).find((a) => a.type === 'standardIra' && !a._is72tDedicated) || null;
    }

    _getOrCreateStandardIra(spouse, iraName, idPrefix = 'ira-') {
        let existing = (spouse.accounts || []).find((a) => a.name === iraName && a.type === 'standardIra');
        if (!existing) {
            existing = new StandardIra(idPrefix + Math.random().toString(36).substr(2, 9), iraName, 0, 7, 0);
            existing.type = 'standardIra';
            existing.enabled = true;
            spouse.accounts.push(existing);
        }
        if (idPrefix === 'ira-72t-') {
            existing._is72tDedicated = true;
        }
        return existing;
    }

    _drawMonthly72t(spouse, year, month, snapshot) {
        const monthlyAmount = spouse.rule72tMonthlyPayment || 0;
        if (monthlyAmount <= 0) return 0;

        const specificAcc = this._find72tDrawAccount(spouse);
        const age = spouse.getAge(year);
        let drawn = 0;
        if (specificAcc && specificAcc.balance > 0) {
            drawn = specificAcc.withdraw(
                monthlyAmount,
                age,
                true,
                snapshot.events,
                `${spouse.name} Rule 72(t) (${specificAcc.name})`
            );
        } else {
            drawn = this._fallbackDraw72t(spouse, monthlyAmount, age, snapshot);
        }
        if (drawn > 0) {
            snapshot.income[spouse.key].rule72t = (snapshot.income[spouse.key].rule72t || 0) + drawn;
        }
        return drawn;
    }

    _find72tDrawAccount(spouse) {
        const r72t = spouse.rule72t || {};
        const targetId = r72t.activeAccountId || r72t.targetAccountId || r72t.targetAccount || r72t.sourceAccount;
        const accounts = spouse.accounts || [];
        if (targetId) {
            return (
                spouse.getAccount?.(targetId) ||
                accounts.find((a) => a.id === targetId || a.name === targetId || a.type === targetId)
            );
        }
        return accounts.find((a) => a.type === 'standardIra');
    }

    _fallbackDraw72t(spouse, monthlyAmount, age, snapshot) {
        let drawn = 0;
        const preTaxAccounts = spouse.accounts.filter((a) =>
            ['trad403b', 'traditional401k', 'standardIra'].includes(a.type)
        );
        for (const acc of preTaxAccounts) {
            if (drawn >= monthlyAmount || acc.balance <= 0) continue;
            const need = monthlyAmount - drawn;
            drawn += acc.withdraw(need, age, true, snapshot.events, `${spouse.name} Rule 72(t)`);
        }
        return drawn;
    }

    _processAccountRollovers(spouse, year, month) {
        if (!spouse.accounts || !Array.isArray(spouse.accounts)) return;
        spouse.accounts.forEach((acc) => {
            if (!acc.rollover || !acc.rollover.enabled || acc._rolloverExecuted || Number(acc.balance || 0) <= 0)
                return;
            if (!this._isAccountRolloverDue(acc, spouse, year, month)) return;
            this._executeAccountRollover(acc, spouse, year, month);
        });
    }

    _getLinkedJobEndDate(linkedJob, sortedJobs, linkedJobIndex) {
        if (linkedJob?.endDate) {
            return linkedJob.endDate;
        }
        if (linkedJobIndex !== -1 && linkedJobIndex + 1 < sortedJobs.length) {
            const nextJob = sortedJobs[linkedJobIndex + 1];
            if (nextJob.startDate) {
                return nextJob.startDate;
            }
        }
        return null;
    }

    _isAccountRolloverDue(acc, spouse, year, month) {
        const timing = acc.rollover?.timing || 'job_end';
        if (timing === 'date') {
            const dateStr = acc.rollover.startDate;
            if (!dateStr) return false;
            const [rYear, rMonth] = dateStr.split('-').map(Number);
            return year === rYear && month === (rMonth || 1);
        }
        if (timing === 'job_end') {
            const sortedJobs = (spouse.jobs || []).slice().sort((a, b) => {
                if (!a.startDate) return -1;
                if (!b.startDate) return 1;
                return a.startDate.localeCompare(b.startDate);
            });

            const linkedJobIndex = sortedJobs.findIndex(
                (j) =>
                    (acc.rollover?.linkedJobId && j.id === acc.rollover.linkedJobId) ||
                    (acc.id && j.linked401kAccountId === acc.id) ||
                    (acc.name && j.linked401kAccountId === acc.name) ||
                    (acc.type && j.linked401kAccountId === acc.type)
            );

            const linkedJob = linkedJobIndex !== -1 ? sortedJobs[linkedJobIndex] : null;
            const jobEndDateStr = this._getLinkedJobEndDate(linkedJob, sortedJobs, linkedJobIndex);

            if (jobEndDateStr) {
                const [jYear, jMonth] = jobEndDateStr.split('-').map(Number);
                return year === jYear && month === (jMonth || 1);
            }

            const retYear = spouse.targetRetirementYear;
            const retMonth = spouse.targetRetirementMonth || 1;
            return year === retYear && month === retMonth;
        }
        return false;
    }

    _resolveTargetIra(spouse, rolloverCfg, defaultName = 'Rollover IRA') {
        if (rolloverCfg?.targetIraMode === 'new') {
            const iraName = rolloverCfg.newIraName || defaultName;
            return this._getOrCreateStandardIra(spouse, iraName, 'ira-');
        }
        const tgtId = rolloverCfg?.targetAccount || rolloverCfg?.targetAccountId || rolloverCfg?.targetIraId;
        const accounts = spouse.accounts || [];
        if (tgtId) {
            const found = accounts.find(
                (a) => a.type === 'standardIra' && (a.id === tgtId || a.name === tgtId || a.type === tgtId)
            );
            if (found) return found;
        }
        return accounts.find((a) => a.type === 'standardIra') || null;
    }

    _executeAccountRollover(acc, spouse, year, month) {
        const targetAcc = this._resolveTargetIra(spouse, acc.rollover, `${acc.name || '401k'} Rollover IRA`);
        if (!targetAcc || acc === targetAcc) return;

        const isFull = acc.rollover.isFullBalance !== false;
        const transferAmount = isFull ? acc.balance : Math.min(acc.balance, Number(acc.rollover.amount) || 0);
        if (transferAmount <= 0) return;

        acc.balance -= transferAmount;
        acc.yearRolloverOut = (acc.yearRolloverOut || 0) + transferAmount;
        acc.yearWithdrawals = (acc.yearWithdrawals || 0) + transferAmount;
        targetAcc.balance += transferAmount;
        targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + transferAmount;
        acc._rolloverExecuted = true;
        this.events.push({
            year,
            month,
            label: `${spouse.name || 'Spouse'} Rollover`,
            type: 'rollover'
        });
    }

    _processLegacySpouseRollover(spouse, year, month) {
        const evt = spouse.rolloverEvent;
        if (!evt || !evt.enabled || !evt.occursIn(year, month)) return;

        const { sourceAcc, targetAcc } = this._findLegacyRolloverAccounts(spouse, evt);
        if (!sourceAcc || !targetAcc || sourceAcc === targetAcc) return;

        const transferAmount =
            evt.isFullBalance !== false ? sourceAcc.balance : Math.min(sourceAcc.balance, Number(evt.amount) || 0);

        if (transferAmount > 0) {
            sourceAcc.balance -= transferAmount;
            sourceAcc.yearRolloverOut = (sourceAcc.yearRolloverOut || 0) + transferAmount;
            sourceAcc.yearWithdrawals = (sourceAcc.yearWithdrawals || 0) + transferAmount;
            targetAcc.balance += transferAmount;
            targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + transferAmount;
            sourceAcc._rolloverExecuted = true;
            this.events.push({
                year,
                month,
                label: `${spouse.name || (spouse.key === 's1' ? 'S1' : 'S2')} Rollover`,
                type: 'rollover'
            });
        }
    }

    _findLegacyRolloverAccounts(spouse, evt) {
        const accounts = spouse.accounts || [];
        const matchId = (id) => (id ? accounts.find((a) => a.id === id || a.name === id || a.type === id) : null);
        const sourceAcc =
            spouse.getAccount?.(evt.sourceAccount) ||
            matchId(evt.sourceAccount) ||
            accounts.find((a) => a.type === 'traditional401k' || a.type === 'trad403b') ||
            spouse.accounts.traditional401k;
        const targetAcc =
            spouse.getAccount?.(evt.targetAccount) ||
            matchId(evt.targetAccount) ||
            accounts.find((a) => a.type === 'standardIra') ||
            spouse.accounts.standardIra;
        return { sourceAcc, targetAcc };
    }

    processRollovers(year) {
        for (let month = 1; month <= 12; month++) {
            this.processMonthlyRollovers(year, month);
        }
    }

    calculateBaseIncome(year, snapshot, firstActiveMonth = 1) {
        const yearsFromStart = year - this.currentYear;
        const inflationMultiplier = Math.pow(1 + this.assumptions.inflationRate / 100, yearsFromStart);
        const w2RaiseMultiplier = Math.pow(1 + (this.assumptions.w2RaiseRate ?? 2.0) / 100, yearsFromStart);

        const s1Alive = this.s1.getAge(year) <= this.s1.lifeExpectancy;
        const s2Alive = this.s2.getAge(year) <= this.s2.lifeExpectancy;
        const s1W2 = s1Alive ? this.s1.getSalary(year, null, w2RaiseMultiplier, firstActiveMonth) : 0;
        const s2W2 = s2Alive ? this.s2.getSalary(year, null, w2RaiseMultiplier, firstActiveMonth) : 0;

        snapshot.income.s1.jobs = this.s1.getJobBreakdown(year, w2RaiseMultiplier, firstActiveMonth);
        snapshot.income.s2.jobs = this.s2.getJobBreakdown(year, w2RaiseMultiplier, firstActiveMonth);

        const filingStatus = this.getFilingStatus(year);
        const { s1Contribs, s2Contribs } = this._calculateHouseholdContributions(
            year,
            s1W2,
            s2W2,
            snapshot,
            filingStatus
        );

        const currentTaxData = this.taxTables[yearsFromStart] || this.taxTables[this.taxTables.length - 1];
        this._applyW2PayrollAndTakeHome(year, firstActiveMonth, snapshot, {
            s1W2,
            s2W2,
            s1Contribs,
            s2Contribs,
            currentTaxData,
            filingStatus
        });

        const ordinaryW2Taxable =
            Math.max(0, s1W2 - s1Contribs.preTaxDeductions) + Math.max(0, s2W2 - s2Contribs.preTaxDeductions);
        const taxableSsn = SocialSecurityCalculator.calculate({
            year,
            s1: this.s1,
            s2: this.s2,
            snapshot,
            inflationMultiplier,
            otherTaxableIncome: ordinaryW2Taxable,
            filingStatus
        });

        this.taxableIncome += ordinaryW2Taxable + taxableSsn;
        snapshot.taxDetails.magi = Math.round(ordinaryW2Taxable + taxableSsn);
        snapshot.taxDetails.hsaDeduction = (s1Contribs.hsaPreTaxDeduction || 0) + (s2Contribs.hsaPreTaxDeduction || 0);
        snapshot.taxDetails.s1HsaDeduction = s1Contribs.hsaPreTaxDeduction || 0;
        snapshot.taxDetails.s2HsaDeduction = s2Contribs.hsaPreTaxDeduction || 0;
        this._recordRetirementMilestones(year);
    }

    _calculateHouseholdContributions(year, s1W2, s2W2, snapshot, filingStatus) {
        const s1PreTaxEst = ContributionCalculator.calculatePreTaxDeductionsEstimate({
            spouse: this.s1,
            jobs: snapshot.income.s1.jobs,
            year
        });
        const s2PreTaxEst = ContributionCalculator.calculatePreTaxDeductionsEstimate({
            spouse: this.s2,
            jobs: snapshot.income.s2.jobs,
            year
        });
        const householdMagi = Math.max(0, s1W2 + s2W2 - (s1PreTaxEst + s2PreTaxEst));
        this.yearlyHouseholdMagi = householdMagi;

        const s1Contribs = ContributionCalculator.calculate({
            spouse: this.s1,
            w2Gross: s1W2,
            jobs: snapshot.income.s1.jobs,
            year,
            filingStatus,
            householdMagi,
            mutateAccounts: false
        });
        const s2Contribs = ContributionCalculator.calculate({
            spouse: this.s2,
            w2Gross: s2W2,
            jobs: snapshot.income.s2.jobs,
            year,
            filingStatus,
            householdMagi,
            mutateAccounts: false
        });
        return { s1Contribs, s2Contribs };
    }

    _applyW2PayrollAndTakeHome(year, firstActiveMonth, snapshot, payrollCtx) {
        const { s1W2, s2W2, s1Contribs, s2Contribs, currentTaxData, filingStatus } = payrollCtx;
        const oasdiLimit = currentTaxData?.oasdiLimit || 168600;

        const s1Fica = calculateFicaTax(
            Math.max(0, s1W2 - (s1Contribs.hsaPreTaxDeduction || 0)),
            oasdiLimit,
            filingStatus
        );
        const s2Fica = calculateFicaTax(
            Math.max(0, s2W2 - (s2Contribs.hsaPreTaxDeduction || 0)),
            oasdiLimit,
            filingStatus
        );
        const totalFica = s1Fica.totalFica + s2Fica.totalFica;

        snapshot.taxDetails = snapshot.taxDetails || {};
        snapshot.taxDetails.ficaTax = totalFica;
        snapshot.taxDetails.s1Fica = s1Fica;
        snapshot.taxDetails.s2Fica = s2Fica;

        snapshot.income.s1.w2Gross = s1W2;
        snapshot.income.s2.w2Gross = s2W2;
        const s1Deductions = s1Contribs.preTaxDeductions + s1Contribs.postTaxDeductions;
        const s2Deductions = s2Contribs.preTaxDeductions + s2Contribs.postTaxDeductions;
        snapshot.income.s1.w2Net = Math.max(0, s1W2 - s1Deductions);
        snapshot.income.s2.w2Net = Math.max(0, s2W2 - s2Deductions);
        snapshot.income.w2 = snapshot.income.s1.w2Net + snapshot.income.s2.w2Net;

        snapshot.income.s1.employerMatch = s1Contribs.totalEmployerMatch;
        snapshot.income.s2.employerMatch = s2Contribs.totalEmployerMatch;
        snapshot.income.employerMatchTotal = s1Contribs.totalEmployerMatch + s2Contribs.totalEmployerMatch;

        const activeMonths = year === this.currentYear ? Math.max(1, 12 - firstActiveMonth + 1) : 12;
        const annualization = activeMonths < 12 ? 12 / activeMonths : 1;
        const prorata = activeMonths < 12 ? activeMonths / 12 : 1;
        const stateTaxRate = Number(this.assumptions.stateTaxRate) || 0;

        const s1TaxableGross = Math.max(0, s1W2 - s1Contribs.preTaxDeductions);
        const s2TaxableGross = Math.max(0, s2W2 - s2Contribs.preTaxDeductions);
        snapshot.income.s1.w2TaxableGross = s1TaxableGross;
        snapshot.income.s2.w2TaxableGross = s2TaxableGross;

        const w2Taxable = s1TaxableGross + s2TaxableGross;
        const w2TaxResults = calculateTax(w2Taxable * annualization, stateTaxRate, currentTaxData, filingStatus, 0);
        const baselineW2IncomeTax = w2TaxResults.totalTax * prorata;

        const s1TaxableShare = w2Taxable > 0 ? s1TaxableGross / w2Taxable : 0;
        const s2TaxableShare = w2Taxable > 0 ? s2TaxableGross / w2Taxable : 0;
        const s1TotalW2Tax = s1Fica.totalFica + baselineW2IncomeTax * s1TaxableShare;
        const s2TotalW2Tax = s2Fica.totalFica + baselineW2IncomeTax * s2TaxableShare;
        const totalW2Tax = s1TotalW2Tax + s2TotalW2Tax;

        const s1AnnualTakeHome = Math.max(0, s1W2 - s1Deductions - s1TotalW2Tax);
        const s2AnnualTakeHome = Math.max(0, s2W2 - s2Deductions - s2TotalW2Tax);

        snapshot.income.s1.takeHome = s1AnnualTakeHome;
        snapshot.income.s2.takeHome = s2AnnualTakeHome;
        snapshot.income.takeHome = s1AnnualTakeHome + s2AnnualTakeHome;

        snapshot.taxDetails.w2Tax = baselineW2IncomeTax;
        snapshot.taxDetails.s1W2Tax = s1TotalW2Tax;
        snapshot.taxDetails.s2W2Tax = s2TotalW2Tax;
        snapshot.taxDetails.totalW2Tax = totalW2Tax;

        this.s1AnnualTakeHome = s1AnnualTakeHome;
        this.s2AnnualTakeHome = s2AnnualTakeHome;
        this.s1TotalW2Tax = s1TotalW2Tax;
        this.s2TotalW2Tax = s2TotalW2Tax;
        this.s1W2Deductions = s1Deductions;
        this.s2W2Deductions = s2Deductions;
    }

    _recordRetirementMilestones(year) {
        if (this.s1.getAge(year) === this.s1.targetRetirementAge && !this.events.find((e) => e.type === 's1_retire')) {
            this.events.push({
                year,
                label: `${this.s1.name} (${this.s1.getAge(year)}) Retires`,
                type: 's1_retire',
                color: '#00b894'
            });
        }
        if (this.s2.getAge(year) === this.s2.targetRetirementAge && !this.events.find((e) => e.type === 's2_retire')) {
            this.events.push({
                year,
                label: `${this.s2.name} (${this.s2.getAge(year)}) Retires`,
                type: 's2_retire',
                color: '#00b894'
            });
        }
    }

    processRothConversions(year, snapshot, month = 1) {
        const advRoth = this.strategies.advancedRothStrategy;
        const yearsFromStart = year - this.currentYear;
        const inflationMultiplier = Math.pow(1 + (Number(this.assumptions.inflationRate) || 0) / 100, yearsFromStart);

        if (advRoth && advRoth.enabled) {
            if (month !== 1) return 0;
            const converted = RothConversionManager.processAdvanced({
                s1: this.s1,
                s2: this.s2,
                year,
                currentYear: this.currentYear,
                taxableIncome: this.taxableIncome,
                assumptions: this.assumptions,
                advRoth,
                taxTables: this.taxTables,
                snapshot
            });
            this.totalRothConversions += converted;
            this.taxableIncome += converted;
            return converted;
        } else {
            let totalStandard = 0;
            [this.s1, this.s2].forEach((spouse) => {
                if (spouse.rothConversion && spouse.rothConversion.occursIn(year, month, this.currentYear)) {
                    const converted = RothConversionManager.processStandard({
                        spouse,
                        year,
                        yearsFromStart,
                        inflationMultiplier,
                        snapshot
                    });
                    totalStandard += converted;
                }
            });
            this.totalRothConversions += totalStandard;
            this.taxableIncome += totalStandard;
            return totalStandard;
        }
    }

    withdrawFromPortfolios(amountNeeded, year, snapshot) {
        const cushionWrapper = { value: this.cashCushion };
        const yearsFromStart = year - this.currentYear;
        const currentTaxYearData = this.taxTables[yearsFromStart] || this.taxTables[this.taxTables.length - 1];
        const shortfall = CashFlowManager.withdrawFromPortfolios({
            amountNeeded,
            year,
            s1: this.s1,
            s2: this.s2,
            stateRate: (this.assumptions.stateTaxRate !== undefined ? Number(this.assumptions.stateTaxRate) : 0) / 100,
            snapshot,
            cashCushion: cushionWrapper,
            primaryResidenceEquity: this.primaryResidenceEquity,
            onPreTaxTaxable: (d) => {
                this.taxableIncome += d;
            },
            onLtcgRealized: (g) => {
                this.realizedLtcg = (this.realizedLtcg || 0) + g;
                snapshot.realizedLtcg = (snapshot.realizedLtcg || 0) + g;
            },
            drawdownStrategy: this.strategies?.drawdownStrategy || 'age_tiered_60',
            drawdownTierAge:
                this.strategies?.drawdownTierAge !== undefined ? Number(this.strategies.drawdownTierAge) : 60,
            taxYearData: currentTaxYearData,
            currentTaxableIncome: this.taxableIncome,
            filingStatus: this.getFilingStatus(year),
            allowEarlyPenalizedWithdrawals: Boolean(this.strategies?.allowEarlyPenalizedWithdrawals)
        });
        this.cashCushion = cushionWrapper.value;
        return shortfall;
    }

    processCashFlow(year, snapshot) {
        const rmIncome = CashFlowManager.processReverseMortgage({
            year,
            s1: this.s1,
            s2: this.s2,
            primaryResidenceEquity: this.primaryResidenceEquity,
            mortgage: this.mortgage,
            snapshot,
            events: this.events
        });

        const totalW2 = snapshot.income.s1.w2Gross + snapshot.income.s2.w2Gross;
        const isRetired = totalW2 === 0;

        if (this.strategies?.decumulationMode === 'die_with_zero' && isRetired) {
            this._applyDieWithZeroSpend(year, snapshot);
        }

        const rmdIncome = snapshot.income?.mandatoryRmd || 0;
        const totalIncome =
            snapshot.income.s1.w2Net +
            snapshot.income.s2.w2Net +
            snapshot.income.s1.ssn +
            snapshot.income.s2.ssn +
            snapshot.income.s1.rule72t +
            snapshot.income.s2.rule72t +
            rmIncome +
            rmdIncome;
        const shortfall = snapshot.expenses - totalIncome;

        if (shortfall > 0) {
            snapshot.unfundedShortfall = this.withdrawFromPortfolios(shortfall, year, snapshot);
            snapshot.surplus = 0;
        } else if (shortfall < 0) {
            snapshot.surplus = Math.abs(shortfall);
        } else {
            snapshot.surplus = 0;
        }
    }

    _applyDieWithZeroSpend(year, snapshot) {
        const s1YearsLeft = this.s1.lifeExpectancy - this.s1.getAge(year);
        const s2YearsLeft = this.s2.lifeExpectancy - this.s2.getAge(year);
        const yearsLeft = Math.max(1, Math.max(s1YearsLeft, s2YearsLeft));
        const totalLiquidPortfolio =
            Object.values(this.s1.accounts).reduce((s, a) => s + (a.balance || 0), 0) +
            Object.values(this.s2.accounts).reduce((s, a) => s + (a.balance || 0), 0);
        const legacyReserve = Number(this.strategies?.targetLegacyBalance || 0);
        const amortizablePortfolio = Math.max(0, totalLiquidPortfolio - legacyReserve);
        const realReturn = 0.04;
        const targetAnnualSpend = (amortizablePortfolio * realReturn) / (1 - Math.pow(1 + realReturn, -yearsLeft));
        if (targetAnnualSpend > snapshot.expenses) {
            const extraSpend = targetAnnualSpend - snapshot.expenses;
            snapshot.expenses = targetAnnualSpend;
            snapshot.expenseBreakdown.base += extraSpend;
        }
    }

    calculateTaxes(year, snapshot, firstActiveMonth = 1) {
        const cushionWrapper = { value: this.cashCushion };
        const filingStatus = this.getFilingStatus(year);
        TaxManager.calculate({
            year,
            currentYear: this.currentYear,
            firstActiveMonth,
            taxableIncome: this.taxableIncome,
            stateTaxRate: this.assumptions.stateTaxRate || 0,
            taxTables: this.taxTables,
            snapshot,
            cashCushion: cushionWrapper,
            withdrawPortfoliosFn: (taxNeeded) => this.withdrawFromPortfolios(taxNeeded, year, snapshot),
            filingStatus,
            ltcgGains: this.realizedLtcg || 0,
            getTaxableIncomeFn: () => this.taxableIncome,
            getLtcgFn: () => this.realizedLtcg || 0
        });

        TaxManager.reinvestSurplus({
            snapshot,
            strategies: this.strategies,
            assumptions: this.assumptions,
            sorrOverride: this.sorrOverride,
            year,
            currentYear: this.currentYear,
            cashCushion: cushionWrapper,
            s1: this.s1,
            s2: this.s2
        });
        this.cashCushion = cushionWrapper.value;
    }

    finalizeSnapshot(snapshot) {
        const endMortgageBalance = this.mortgage.enabled ? this.mortgage.currentBalance : 0;
        const endHomeValue = this.primaryResidenceEquity.currentValue || 0;
        const endEquity = Math.max(0, endHomeValue - endMortgageBalance);

        this._cleanSpouseBalances(this.s1);
        this._cleanSpouseBalances(this.s2);

        snapshot.balances = this._buildSnapshotBalances(snapshot, endEquity, endHomeValue, endMortgageBalance);

        const growthRate = (this.primaryResidenceEquity.annualGrowthRate ?? 3) / 100;
        const homeAppreciation = endHomeValue > 0 ? endHomeValue - endHomeValue / (1 + growthRate) : 0;
        snapshot.growth = this._buildSnapshotGrowth(snapshot, homeAppreciation);
        snapshot.rule72tMeta = this._buildSnapshot72tMeta(snapshot.year);

        const totalPortfolio = this._sumTotalPortfolioBalances(snapshot.balances);
        if (this.initialPortfolioValue === null) {
            this.initialPortfolioValue = totalPortfolio;
        }
    }

    _buildSpouse72tMeta(spouse, year) {
        const isActive = Boolean(spouse.is72tActive?.(year) && (spouse.rule72tMonthlyPayment || 0) > 0);
        const drawAcc = isActive ? this._find72tDrawAccount(spouse) : null;
        return {
            active: isActive,
            inceptionBalance: spouse.rule72tInceptionBalance || 0,
            annualPayment: spouse.rule72tAnnualPayment || 0,
            monthlyPayment: spouse.rule72tMonthlyPayment || 0,
            accountName: drawAcc?.name || null
        };
    }

    _buildSnapshot72tMeta(year) {
        return {
            s1: this._buildSpouse72tMeta(this.s1, year),
            s2: this._buildSpouse72tMeta(this.s2, year)
        };
    }

    _cleanSpouseBalances(spouse) {
        Object.values(spouse.accounts).forEach((acc) => {
            acc.balance = cleanPrecision(acc.balance);
        });
    }

    _getAccountTypeBalance(spouse, type) {
        return (spouse.accounts || [])
            .filter((a) => a.type === type && !a._is72tDedicated)
            .reduce((sum, a) => sum + (a.balance || 0), 0);
    }

    _getSeppIraBalance(spouse) {
        return (spouse.accounts || [])
            .filter((a) => a.type === 'standardIra' && a._is72tDedicated)
            .reduce((sum, a) => sum + (a.balance || 0), 0);
    }

    _sumAccountGrowthMetrics(accs) {
        const sumField = (key) => cleanPrecision(accs.reduce((sum, a) => sum + (Number(a[key]) || 0), 0));
        return {
            interest: sumField('yearInterest'),
            contributions: sumField('yearContributions'),
            conversionsIn: sumField('yearConversionsIn'),
            conversionsOut: sumField('yearConversionsOut'),
            rolloverIn: sumField('yearRolloverIn'),
            rolloverOut: sumField('yearRolloverOut'),
            withdrawals: sumField('yearWithdrawals')
        };
    }

    _getAccountTypeGrowth(spouse, type, snapshotYear) {
        const accs = (spouse.accounts || []).filter((a) => a.type === type && !a._is72tDedicated);
        const res = this._sumAccountGrowthMetrics(accs);
        if (type === 'rothIra') {
            const rothAcc = accs[0];
            if (rothAcc && typeof rothAcc.getRothPrincipalBreakdown === 'function') {
                const spouseAge = spouse.getAge ? spouse.getAge(snapshotYear) : snapshotYear - spouse.birthYear;
                res.rothPrincipalBreakdown = rothAcc.getRothPrincipalBreakdown(snapshotYear, spouseAge);
            }
        }
        return res;
    }

    _getSeppIraGrowth(spouse) {
        const accs = (spouse.accounts || []).filter((a) => a.type === 'standardIra' && a._is72tDedicated);
        return this._sumAccountGrowthMetrics(accs);
    }

    _buildSnapshotBalances(snapshot, endEquity, endHomeValue, endMortgageBalance) {
        return {
            s1Trad401k: this._getAccountTypeBalance(this.s1, 'traditional401k'),
            s2Trad401k: this._getAccountTypeBalance(this.s2, 'traditional401k'),
            s1Trad403b: this._getAccountTypeBalance(this.s1, 'trad403b'),
            s2Trad403b: this._getAccountTypeBalance(this.s2, 'trad403b'),
            s1StandardIra: this._getAccountTypeBalance(this.s1, 'standardIra'),
            s2StandardIra: this._getAccountTypeBalance(this.s2, 'standardIra'),
            s1SeppIra: this._getSeppIraBalance(this.s1),
            s2SeppIra: this._getSeppIraBalance(this.s2),
            s1Hysa: this._getAccountTypeBalance(this.s1, 'hysa'),
            s2Hysa: this._getAccountTypeBalance(this.s2, 'hysa'),
            s1Cd: this._getAccountTypeBalance(this.s1, 'cd'),
            s2Cd: this._getAccountTypeBalance(this.s2, 'cd'),
            s1Brokerage: this._getAccountTypeBalance(this.s1, 'taxableBrokerage'),
            s2Brokerage: this._getAccountTypeBalance(this.s2, 'taxableBrokerage'),
            s1RothIra: this._getAccountTypeBalance(this.s1, 'rothIra'),
            s2RothIra: this._getAccountTypeBalance(this.s2, 'rothIra'),
            s1Hsa: this._getAccountTypeBalance(this.s1, 'hsa'),
            s2Hsa: this._getAccountTypeBalance(this.s2, 'hsa'),
            cashCushion: this.cashCushion,
            college529: snapshot.college529?.totalBalance || 0,
            primaryResidenceEquity: endEquity,
            homeValue: endHomeValue,
            mortgageBalance: endMortgageBalance
        };
    }

    _buildSnapshotGrowth(snapshot, homeAppreciation) {
        const yr = snapshot.year;
        return {
            s1Trad401k: this._getAccountTypeGrowth(this.s1, 'traditional401k', yr),
            s2Trad401k: this._getAccountTypeGrowth(this.s2, 'traditional401k', yr),
            s1Trad403b: this._getAccountTypeGrowth(this.s1, 'trad403b', yr),
            s2Trad403b: this._getAccountTypeGrowth(this.s2, 'trad403b', yr),
            s1StandardIra: this._getAccountTypeGrowth(this.s1, 'standardIra', yr),
            s2StandardIra: this._getAccountTypeGrowth(this.s2, 'standardIra', yr),
            s1SeppIra: this._getSeppIraGrowth(this.s1),
            s2SeppIra: this._getSeppIraGrowth(this.s2),
            s1Hysa: this._getAccountTypeGrowth(this.s1, 'hysa', yr),
            s2Hysa: this._getAccountTypeGrowth(this.s2, 'hysa', yr),
            s1Cd: this._getAccountTypeGrowth(this.s1, 'cd', yr),
            s2Cd: this._getAccountTypeGrowth(this.s2, 'cd', yr),
            s1Brokerage: this._getAccountTypeGrowth(this.s1, 'taxableBrokerage', yr),
            s2Brokerage: this._getAccountTypeGrowth(this.s2, 'taxableBrokerage', yr),
            s1RothIra: this._getAccountTypeGrowth(this.s1, 'rothIra', yr),
            s2RothIra: this._getAccountTypeGrowth(this.s2, 'rothIra', yr),
            s1Hsa: this._getAccountTypeGrowth(this.s1, 'hsa', yr),
            s2Hsa: this._getAccountTypeGrowth(this.s2, 'hsa', yr),
            college529: {
                interest: snapshot.college529?.totalInterest || 0,
                contributions: snapshot.college529?.totalContributed || 0,
                withdrawals: snapshot.college529?.totalDrawn || 0
            },
            primaryResidenceEquity: {
                interest: homeAppreciation,
                contributions: 0,
                withdrawals: snapshot.income?.reverseMortgage || 0
            }
        };
    }

    _sumTotalPortfolioBalances(balances) {
        const portfolioKeys = [
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
        return portfolioKeys.reduce((sum, key) => sum + (balances[key] || 0), 0);
    }

    getFilingStatus(year) {
        if (!this.s2 || !this.s2.name) return 'single';
        const s1Age = this.s1.getAge(year);
        const s2Age = this.s2.getAge(year);
        const s1Alive = s1Age <= this.s1.lifeExpectancy;
        const s2Alive = s2Age <= this.s2.lifeExpectancy;

        if (s1Alive && s2Alive) return 'mfj';

        // In the year of spousal death, survivor files MFJ.
        // In subsequent years, survivor transitions to Single filing status ("Widow's Tax Trap").
        const s1DeathYear = this.startYear + (this.s1.lifeExpectancy - (this.startYear - this.s1.birthYear));
        const s2DeathYear = this.startYear + (this.s2.lifeExpectancy - (this.startYear - this.s2.birthYear));
        const firstDeathYear = Math.min(s1DeathYear, s2DeathYear);

        return year > firstDeathYear ? 'single' : 'mfj';
    }

    evaluateTerminalSurplusAndOpportunities(options = {}) {
        const { data } = this.run();
        return SurplusPullForwardEngine.evaluate(this.originalState || {}, data, options);
    }
}

export function runSimulation(state, sorrOverride = null) {
    const engine = new SimulationEngine(state, sorrOverride);
    return engine.run();
}
