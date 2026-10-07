import { precalculateTaxTables, calculateFicaTax, calculateTax, getIrmaaAnnualSurcharge } from './tax.js';
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

export const SORR_SCENARIOS = {
    '2000-2009': [-9.10, -11.89, -22.10, 28.68, 10.88, 4.91, 15.79, 5.49, -37.00, 26.46],
    '2015-2024': [1.38, 11.96, 21.83, -4.38, 31.49, 18.40, 28.71, -18.11, 26.29, 24.23],
    '1987-1996': [5.25, 16.61, 31.69, -3.10, 30.47, 7.62, 10.08, 1.32, 37.58, 22.96],
    '1990-1999': [-3.10, 30.47, 7.62, 10.08, 1.32, 37.58, 22.96, 33.36, 28.58, 21.04],
    '1973-1982': [-14.66, -26.47, 37.20, 23.84, -7.18, 6.56, 18.44, 32.42, -4.91, 21.41],
    '2008-2017': [-37.00, 26.46, 15.06, 2.11, 16.00, 32.39, 13.69, 1.38, 11.96, 21.83],
    '1968-1977': [10.81, -8.24, 3.84, 14.22, 18.72, -14.66, -26.47, 37.20, 23.84, -7.18],
    '1929-1938': [-8.30, -25.12, -43.84, -8.64, 49.98, -1.19, 46.74, 31.94, -35.34, 29.28]
};

export class SimulationEngine {
    constructor(state, sorrOverride = null) {
        this.originalState = state;
        this.sorrOverride = sorrOverride;
        this.events = [];
        this.yearlyData = [];

        const defaultStartYear = new Date().getFullYear();
        const startDateStr = state.assumptions?.startDate || `${defaultStartYear}-01`;
        const [startYearStr, startMonthStr] = String(startDateStr).split('-');
        this.startYear = parseInt(startYearStr, 10) || defaultStartYear;
        this.startMonth = parseInt(startMonthStr, 10) || 1;
        this.currentYear = this.startYear;
        this.endYear = this.currentYear + parseInt(state.assumptions.graphYears || 40, 10);

        // Initialize Domain Models
        this.s1 = new Person('s1', state.primarySpouse);
        this.s2 = new Person('s2', state.secondarySpouse);
        this.mortgage = new Mortgage(state.primaryResidenceMortgage || state.mortgage || { enabled: false });
        this.cashCushion = state.assumptions.initialCashCushion || 0;

        // Retain other state references
        this.assumptions = state.assumptions;
        this.strategies = state.strategies || {};
        this.dependents = JSON.parse(JSON.stringify(state.dependents || []));
        this.phaseBasedExpensesPerMonth = state.phaseBasedExpensesPerMonth;
        const pe = state.primaryResidenceEquity || {};
        this.primaryResidenceEquity = {
            currentValue: pe.currentValue !== undefined ? Number(pe.currentValue) : (pe.currentHomeValue !== undefined ? Number(pe.currentHomeValue) : 0),
            annualGrowthRate: pe.annualGrowthRate !== undefined ? Number(pe.annualGrowthRate) : (pe.growthRate !== undefined ? Number(pe.growthRate) : 3),
            reverseMortgageEnabled: Boolean(pe.reverseMortgageEnabled ?? pe.reverseMortgage?.enabled ?? pe.enabled),
            reverseMortgageStartAge: pe.reverseMortgageStartAge !== undefined ? Number(pe.reverseMortgageStartAge) : (pe.reverseMortgage?.startAge !== undefined ? Number(pe.reverseMortgage.startAge) : 65),
            active: false
        };

        // Pass Roth conversion config and rollovers to persons
        this.s1.rothConversion = new RothConversionSchedule(state.primarySpouse?.rothConversion);
        this.s2.rothConversion = new RothConversionSchedule(state.secondarySpouse?.rothConversion);
        this.s1.rolloverEvent = new RolloverEvent(state.primarySpouse?.rolloverEvent);
        this.s2.rolloverEvent = new RolloverEvent(state.secondarySpouse?.rolloverEvent);

        this.initialPortfolioValue = null;
        this.totalRothConversions = 0;
        this.taxableIncome = 0;

        const yearsToRun = this.endYear - this.currentYear;
        this.taxTables = precalculateTaxTables(yearsToRun, this.assumptions.inflationRate);
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
                dependents: this.dependents,
                phases: this.phaseBasedExpensesPerMonth,
                assumptions: this.assumptions,
                strategies: this.strategies,
                mortgage: this.mortgage,
                snapshot,
                events: this.events
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
            const w2RaiseMultiplier = Math.pow(1 + ((Number(this.assumptions.w2RaiseRate ?? 2.0)) / 100), yearsFromStart);
            const monthlyRates = {
                monthlyBaseExpenses: activeMonths > 0 ? (snapshot.expenses || 0) / activeMonths : 0,
                monthlySsn: activeMonths > 0 ? ((snapshot.income.s1.ssn || 0) + (snapshot.income.s2.ssn || 0)) / activeMonths : 0
            };

            for (let month = 1; month <= 12; month++) {
                this._simulateMonth(year, month, snapshot, isFirstYear, firstActiveMonth, w2RaiseMultiplier, monthlyRates);
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
            Object.values(spouse.accounts).forEach(acc => acc.resetYearlyStats());
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
        const lookbackMagi = (this.yearlyData.length > 0 ? this.yearlyData[this.yearlyData.length - 1].taxableIncome : this.taxableIncome) || this.taxableIncome;
        const annualIrmaa = getIrmaaAnnualSurcharge(lookbackMagi, filingStatus, currentTaxData, s1Age, s2Age, s1Alive, s2Alive);
        if (annualIrmaa > 0) {
            snapshot.expenseBreakdown.irmaa = annualIrmaa;
            snapshot.expenses += annualIrmaa;
        }
    }

    _getAccountBalancesDictionary() {
        const dict = {
            s1Trad401k: this.s1.accounts.traditional401k ? this.s1.accounts.traditional401k.balance : 0,
            s2Trad401k: this.s2.accounts.traditional401k ? this.s2.accounts.traditional401k.balance : 0,
            s1Trad403b: this.s1.accounts.trad403b ? this.s1.accounts.trad403b.balance : 0,
            s2Trad403b: this.s2.accounts.trad403b ? this.s2.accounts.trad403b.balance : 0,
            s1StandardIra: this.s1.accounts.standardIra ? this.s1.accounts.standardIra.balance : 0,
            s2StandardIra: this.s2.accounts.standardIra ? this.s2.accounts.standardIra.balance : 0,
            s1Hysa: this.s1.accounts.hysa ? this.s1.accounts.hysa.balance : 0,
            s2Hysa: this.s2.accounts.hysa ? this.s2.accounts.hysa.balance : 0,
            s1Cd: this.s1.accounts.cd ? this.s1.accounts.cd.balance : 0,
            s2Cd: this.s2.accounts.cd ? this.s2.accounts.cd.balance : 0,
            s1Brokerage: this.s1.accounts.taxableBrokerage ? this.s1.accounts.taxableBrokerage.balance : 0,
            s2Brokerage: this.s2.accounts.taxableBrokerage ? this.s2.accounts.taxableBrokerage.balance : 0,
            s1RothIra: this.s1.accounts.rothIra ? this.s1.accounts.rothIra.balance : 0,
            s2RothIra: this.s2.accounts.rothIra ? this.s2.accounts.rothIra.balance : 0,
            cashCushion: this.cashCushion,
            byAccount: {}
        };
        (this.s1.accounts || []).forEach(a => {
            dict.byAccount[a.id || a.name] = a.balance;
        });
        (this.s2.accounts || []).forEach(a => {
            dict.byAccount[a.id || a.name] = a.balance;
        });
        return dict;
    }

    _handleDownsizing(year, month, isFirstYear, firstActiveMonth) {
        const isDownsizeMonth = (!isFirstYear && month === 1) || (isFirstYear && month === firstActiveMonth);
        if (!isDownsizeMonth || !this.mortgage.downsizing?.enabled || year !== Number(this.mortgage.downsizing.year) || this.mortgage.downsized) {
            return;
        }
        const downsizeResult = this.mortgage.executeDownsizing(this.primaryResidenceEquity.currentValue);
        if (!downsizeResult) return;

        this.primaryResidenceEquity.currentValue = downsizeResult.replacementHomeValue;
        const sweepAcc = this.s1.accounts.taxableBrokerage 
            || Object.values(this.s1.accounts).find(a => a.type === 'taxableBrokerage') 
            || Object.values(this.s2.accounts).find(a => a.type === 'taxableBrokerage');
        if (sweepAcc) {
            sweepAcc.balance += downsizeResult.netCashProceeds;
        }
        this.events.push({
            year,
            month,
            label: `Downsized Home (+$${Math.round(downsizeResult.netCashProceeds).toLocaleString()} Cash)`,
            type: 'downsize',
            color: '#0984e3'
        });
    }

    _simulateMonth(year, month, snapshot, isFirstYear, firstActiveMonth, w2RaiseMultiplier, monthlyRates) {
        if (isFirstYear && month < firstActiveMonth) {
            snapshot.monthlySnapshots.push({
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
                balances: this._getAccountBalancesDictionary()
            });
            return;
        }

        const s1MonthGross = this.s1.getSalaryForMonth(year, month, snapshot.events, w2RaiseMultiplier);
        const s2MonthGross = this.s2.getSalaryForMonth(year, month, snapshot.events, w2RaiseMultiplier);

        const s1W2 = snapshot.income.s1.w2Gross;
        const s2W2 = snapshot.income.s2.w2Gross;
        const s1MonthShare = s1W2 > 0 ? (s1MonthGross / s1W2) : 0;
        const s2MonthShare = s2W2 > 0 ? (s2MonthGross / s2W2) : 0;

        const s1MonthTakeHome = s1W2 > 0 ? (this.s1AnnualTakeHome || 0) * s1MonthShare : 0;
        const s2MonthTakeHome = s2W2 > 0 ? (this.s2AnnualTakeHome || 0) * s2MonthShare : 0;
        const monthTakeHome = s1MonthTakeHome + s2MonthTakeHome;

        const s1MonthTax = s1W2 > 0 ? (this.s1TotalW2Tax || 0) * s1MonthShare : 0;
        const s2MonthTax = s2W2 > 0 ? (this.s2TotalW2Tax || 0) * s2MonthShare : 0;
        const monthTax = s1MonthTax + s2MonthTax;

        const s1MonthDeductions = s1W2 > 0 ? (this.s1W2Deductions || 0) * s1MonthShare : 0;
        const s2MonthDeductions = s2W2 > 0 ? (this.s2W2Deductions || 0) * s2MonthShare : 0;
        const monthDeductions = s1MonthDeductions + s2MonthDeductions;

        const monthBonusEvents = (snapshot.events || []).filter(e => e && e.month === month && (e.type === 'income_bonus' || e.type === 'income_lti'));
        let bonusMilestone = null;
        if (monthBonusEvents.length > 0) {
            const gross = monthBonusEvents.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
            let netTakeHome = 0;
            const items = monthBonusEvents.map(e => {
                const isS2 = this.s2.name && e.name && e.name.includes(this.s2.name);
                const spouseGross = isS2 ? s2W2 : s1W2;
                const spouseTakeHome = isS2 ? (this.s2AnnualTakeHome || 0) : (this.s1AnnualTakeHome || 0);
                const itemNet = spouseGross > 0 ? (Number(e.amount) / spouseGross) * spouseTakeHome : 0;
                netTakeHome += itemNet;
                return {
                    name: e.name,
                    type: e.type,
                    gross: Number(e.amount) || 0,
                    netTakeHome: itemNet
                };
            });
            bonusMilestone = {
                gross,
                netTakeHome,
                items
            };
        }

        this.processMonthlyRollovers(year, month);
        this._handleDownsizing(year, month, isFirstYear, firstActiveMonth);

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

        const monthTotalIncome = monthTakeHome + monthlyRates.monthlySsn + month72tIncome;
        const monthNetFlow = monthTotalIncome - monthlyRates.monthlyBaseExpenses;

        snapshot.monthlySnapshots.push({
            month,
            w2Gross: s1MonthGross + s2MonthGross,
            takeHome: monthTakeHome,
            w2Net: monthTakeHome,
            w2Tax: monthTax,
            w2Deductions: monthDeductions,
            ssn: monthlyRates.monthlySsn,
            rule72t: month72tIncome,
            rothConverted: monthConverted,
            expenses: monthlyRates.monthlyBaseExpenses,
            netFlow: monthNetFlow,
            bonusMilestone,
            balances: this._getAccountBalancesDictionary()
        });
    }

    recordLifeExpectancyEvents(year) {
        if (this.s1.getAge(year) === this.s1.lifeExpectancy && !this.events.find(e => e.type === 's1_life_exp')) {
            this.events.push({ year, label: `${this.s1.name} Life Exp`, type: 's1_life_exp', color: '#2d3436' });
        }
        if (this.s2.getAge(year) === this.s2.lifeExpectancy && !this.events.find(e => e.type === 's2_life_exp')) {
            this.events.push({ year, label: `${this.s2.name} Life Exp`, type: 's2_life_exp', color: '#2d3436' });
        }
    }

    processMonthlyRollovers(year, month) {
        [this.s1, this.s2].forEach(spouse => {
            const hasAccountRollovers = (spouse.accounts || []).some(a => a.rollover?.enabled);
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

        const isDue = (
            (year === startYear && month === startMonth) ||
            (year > startYear) ||
            (year === this.startYear && month === firstActiveMonth && (startYear < this.startYear || (startYear === this.startYear && startMonth <= firstActiveMonth)))
        );

        if (isDue) {
            this._process72tInception(spouse, year, month);
        }
    }

    _process72tInception(spouse, year, month) {
        const r72t = spouse.rule72t;
        const targetName = r72t.newIraName || `${spouse.name || 'Spouse'} 72(t) IRA`;
        const targetAcc = this._resolve72tTargetIra(spouse, r72t, targetName);

        const sourceId = r72t.sourceAccount;
        const sourceAcc = (spouse.accounts || []).find(a => a.id === sourceId || a.name === sourceId || a.type === sourceId)
            || (spouse.accounts || []).find(a => a.type === 'standardIra' || a.type === 'traditional401k');

        if (sourceAcc && targetAcc && sourceAcc !== targetAcc) {
            const hasCustomSplit = r72t.splitAmount !== undefined && r72t.splitAmount !== null && r72t.splitAmount !== '';
            const splitAmt = hasCustomSplit ? Number(r72t.splitAmount) : sourceAcc.balance;
            const transferAmount = Math.min(sourceAcc.balance, Math.max(0, splitAmt));
            if (transferAmount > 0) {
                sourceAcc.balance -= transferAmount;
                sourceAcc.yearRolloverOut = (sourceAcc.yearRolloverOut || 0) + transferAmount;
                sourceAcc.yearWithdrawals = (sourceAcc.yearWithdrawals || 0) + transferAmount;
                targetAcc.balance += transferAmount;
                targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + transferAmount;
                this.events.push({
                    year,
                    month,
                    label: `${spouse.name || 'Spouse'} 72(t) Funding Split ($${Math.round(transferAmount).toLocaleString()} ➔ ${targetAcc.name})`,
                    type: 'rollover'
                });
            }
        }

        // Exact Inception-Month Valuation (Post-rollover, Post-growth)
        const activeAcc = targetAcc || sourceAcc;
        const inceptionBalance = activeAcc ? activeAcc.balance : spouse.getTotalPreTaxBalance();
        const DEFAULT_72T_RATE = 0.05;
        const rate72t = (this.strategies?.rule72tInterestRate ? (Number(this.strategies.rule72tInterestRate) / 100) : DEFAULT_72T_RATE);

        spouse.rule72tAnnualPayment = inceptionBalance * rate72t;
        spouse.rule72tMonthlyPayment = spouse.rule72tAnnualPayment / 12;
        spouse._72tInceptionDone = true;
        spouse._72tActive = true;
        spouse.rule72t.activeAccountId = activeAcc ? activeAcc.id : null;

        this.events.push({
            year,
            month,
            label: `${spouse.name || 'Spouse'} Rule 72(t) SEPP Began ($${Math.round(spouse.rule72tAnnualPayment).toLocaleString()}/yr on $${Math.round(inceptionBalance).toLocaleString()} Balance)`,
            type: 'income_72t',
            color: '#10b981'
        });
    }

    _resolve72tTargetIra(spouse, r72t, targetName) {
        if (r72t.targetIraMode === 'new') {
            const iraName = r72t.newIraName || r72t.targetAccountName || targetName;
            let existingNew = (spouse.accounts || []).find(a => a.name === iraName && a.type === 'standardIra');
            if (!existingNew) {
                existingNew = new StandardIra('ira-72t-' + Math.random().toString(36).substr(2, 9), iraName, 0, 7, 0);
                existingNew.type = 'standardIra';
                existingNew.enabled = true;
                spouse.accounts.push(existingNew);
            }
            return existingNew;
        }
        const tgtId = r72t.targetAccount || r72t.sourceAccount;
        if (tgtId) {
            const found = (spouse.accounts || []).find(a => 
                a.id === tgtId || a.name === tgtId || a.type === tgtId
            );
            if (found) return found;
        }
        return (spouse.accounts || []).find(a => a.type === 'standardIra') || null;
    }

    _drawMonthly72t(spouse, year, month, snapshot) {
        const monthlyAmount = spouse.rule72tMonthlyPayment || 0;
        if (monthlyAmount <= 0) return 0;
        const targetId = spouse.rule72t?.activeAccountId || spouse.rule72t?.targetAccountId || spouse.rule72t?.targetAccount || spouse.rule72t?.sourceAccount;
        const specificAcc = targetId
            ? (spouse.getAccount?.(targetId) || (spouse.accounts || []).find(a => a.id === targetId || a.name === targetId || a.type === targetId))
            : (spouse.accounts || []).find(a => a.type === 'standardIra');
        const age = spouse.getAge(year);
        let drawn = 0;
        if (specificAcc && specificAcc.balance > 0) {
            drawn = specificAcc.withdraw(monthlyAmount, age, true, snapshot.events, `${spouse.name} Rule 72(t) (${specificAcc.name})`);
        } else {
            drawn = this._fallbackDraw72t(spouse, monthlyAmount, age, snapshot);
        }
        if (drawn > 0) {
            snapshot.income[spouse.key].rule72t = (snapshot.income[spouse.key].rule72t || 0) + drawn;
        }
        return drawn;
    }

    _fallbackDraw72t(spouse, monthlyAmount, age, snapshot) {
        let drawn = 0;
        const preTaxAccounts = spouse.accounts.filter(a => ['trad403b', 'traditional401k', 'standardIra'].includes(a.type));
        for (const acc of preTaxAccounts) {
            if (drawn >= monthlyAmount || acc.balance <= 0) continue;
            const need = monthlyAmount - drawn;
            drawn += acc.withdraw(need, age, true, snapshot.events, `${spouse.name} Rule 72(t)`);
        }
        return drawn;
    }

    _processAccountRollovers(spouse, year, month) {
        if (!spouse.accounts || !Array.isArray(spouse.accounts)) return;
        spouse.accounts.forEach(acc => {
            if (!acc.rollover || !acc.rollover.enabled || acc._rolloverExecuted || Number(acc.balance || 0) <= 0) return;
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

            const linkedJobIndex = sortedJobs.findIndex(j => 
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
            let existing = (spouse.accounts || []).find(a => a.name === iraName && a.type === 'standardIra');
            if (!existing) {
                existing = new StandardIra('ira-' + Math.random().toString(36).substr(2, 9), iraName, 0, 7, 0);
                existing.type = 'standardIra';
                existing.enabled = true;
                spouse.accounts.push(existing);
            }
            return existing;
        }
        const tgtId = rolloverCfg?.targetAccount || rolloverCfg?.targetAccountId || rolloverCfg?.targetIraId;
        if (tgtId) {
            const found = (spouse.accounts || []).find(a => 
                a.type === 'standardIra' && (a.id === tgtId || a.name === tgtId || a.type === tgtId)
            );
            if (found) return found;
        }
        return (spouse.accounts || []).find(a => a.type === 'standardIra') || null;
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
            label: `${spouse.name || 'Spouse'} Rollover (${acc.name || '401k'} ➔ ${targetAcc.name || 'IRA'})`,
            type: 'rollover'
        });
    }

    _processLegacySpouseRollover(spouse, year, month) {
        const evt = spouse.rolloverEvent;
        if (!evt || !evt.enabled || !evt.occursIn(year, month)) return;

        const sourceAcc = spouse.getAccount?.(evt.sourceAccount)
            || (spouse.accounts || []).find(a => a.id === evt.sourceAccount || a.name === evt.sourceAccount || a.type === evt.sourceAccount)
            || (spouse.accounts || []).find(a => a.type === 'traditional401k' || a.type === 'trad403b')
            || spouse.accounts.traditional401k;

        const targetAcc = spouse.getAccount?.(evt.targetAccount)
            || (spouse.accounts || []).find(a => a.id === evt.targetAccount || a.name === evt.targetAccount || a.type === evt.targetAccount)
            || (spouse.accounts || []).find(a => a.type === 'standardIra')
            || spouse.accounts.standardIra;

        if (!sourceAcc || !targetAcc || sourceAcc === targetAcc) return;

        const transferAmount = evt.isFullBalance !== false
            ? sourceAcc.balance
            : Math.min(sourceAcc.balance, Number(evt.amount) || 0);

        if (transferAmount > 0) {
            sourceAcc.balance -= transferAmount;
            sourceAcc.yearRolloverOut = (sourceAcc.yearRolloverOut || 0) + transferAmount;
            sourceAcc.yearWithdrawals = (sourceAcc.yearWithdrawals || 0) + transferAmount;
            targetAcc.balance += transferAmount;
            targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + transferAmount;
            this.events.push({ year, month, label: `${spouse.name || (spouse.key === 's1' ? 'S1' : 'S2')} Rollover (${sourceAcc.name || '401k'} ➔ ${targetAcc.name || 'IRA'})`, type: 'rollover' });
        }
    }

    processRollovers(year) {
        for (let month = 1; month <= 12; month++) {
            this.processMonthlyRollovers(year, month);
        }
    }

    calculateBaseIncome(year, snapshot, firstActiveMonth = 1) {
        const yearsFromStart = year - this.currentYear;
        const inflationMultiplier = Math.pow(1 + (this.assumptions.inflationRate / 100), yearsFromStart);
        const w2RaiseMultiplier = Math.pow(1 + ((this.assumptions.w2RaiseRate ?? 2.0) / 100), yearsFromStart);

        // Pass null for events so bonus/LTI events are only recorded once during chronological monthly simulation
        let s1W2 = this.s1.getSalary(year, null, w2RaiseMultiplier, firstActiveMonth);
        let s2W2 = this.s2.getSalary(year, null, w2RaiseMultiplier, firstActiveMonth);
        if (this.s1.getAge(year) > this.s1.lifeExpectancy) s1W2 = 0;
        if (this.s2.getAge(year) > this.s2.lifeExpectancy) s2W2 = 0;

        snapshot.income.s1.jobs = this.s1.getJobBreakdown(year, w2RaiseMultiplier, firstActiveMonth);
        snapshot.income.s2.jobs = this.s2.getJobBreakdown(year, w2RaiseMultiplier, firstActiveMonth);

        const s1Contribs = ContributionCalculator.calculate({ spouse: this.s1, w2Gross: s1W2, jobs: snapshot.income.s1.jobs, year });
        const s2Contribs = ContributionCalculator.calculate({ spouse: this.s2, w2Gross: s2W2, jobs: snapshot.income.s2.jobs, year });

        const filingStatus = this.getFilingStatus(year);
        const currentTaxData = this.taxTables[yearsFromStart] || this.taxTables[this.taxTables.length - 1];
        const oasdiLimit = currentTaxData?.oasdiLimit || 168600;

        const s1Fica = calculateFicaTax(s1W2, oasdiLimit, filingStatus);
        const s2Fica = calculateFicaTax(s2W2, oasdiLimit, filingStatus);
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

        // Baseline W-2 Taxes & Take-Home Pay
        const activeMonths = year === this.currentYear ? Math.max(1, 12 - firstActiveMonth + 1) : 12;
        const annualization = activeMonths < 12 ? (12 / activeMonths) : 1;
        const prorata = activeMonths < 12 ? (activeMonths / 12) : 1;
        const stateTaxRate = Number(this.assumptions.stateTaxRate) || 0;

        const w2Taxable = snapshot.income.s1.w2Net + snapshot.income.s2.w2Net;
        const w2TaxResults = calculateTax(w2Taxable * annualization, stateTaxRate, currentTaxData, filingStatus, 0);
        const baselineW2IncomeTax = w2TaxResults.totalTax * prorata;

        const s1TaxableShare = w2Taxable > 0 ? (snapshot.income.s1.w2Net / w2Taxable) : 0;
        const s2TaxableShare = w2Taxable > 0 ? (snapshot.income.s2.w2Net / w2Taxable) : 0;
        const s1IncomeTax = baselineW2IncomeTax * s1TaxableShare;
        const s2IncomeTax = baselineW2IncomeTax * s2TaxableShare;

        const s1TotalW2Tax = s1Fica.totalFica + s1IncomeTax;
        const s2TotalW2Tax = s2Fica.totalFica + s2IncomeTax;
        const totalW2Tax = s1TotalW2Tax + s2TotalW2Tax;

        const s1AnnualTakeHome = Math.max(0, s1W2 - s1Deductions - s1TotalW2Tax);
        const s2AnnualTakeHome = Math.max(0, s2W2 - s2Deductions - s2TotalW2Tax);
        const totalTakeHome = s1AnnualTakeHome + s2AnnualTakeHome;

        snapshot.income.s1.takeHome = s1AnnualTakeHome;
        snapshot.income.s2.takeHome = s2AnnualTakeHome;
        snapshot.income.takeHome = totalTakeHome;

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

        // Social Security with IRS Provisional Income formula
        const ordinaryW2Taxable = Math.max(0, s1W2 - s1Contribs.preTaxDeductions) + Math.max(0, s2W2 - s2Contribs.preTaxDeductions);
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

        // Retirement Milestones
        if (this.s1.getAge(year) === this.s1.targetRetirementAge && !this.events.find(eventItem => eventItem.type === 's1_retire')) {
            this.events.push({ year, label: `${this.s1.name} Retires`, type: 's1_retire', color: '#00b894' });
        }
        if (this.s2.getAge(year) === this.s2.targetRetirementAge && !this.events.find(eventItem => eventItem.type === 's2_retire')) {
            this.events.push({ year, label: `${this.s2.name} Retires`, type: 's2_retire', color: '#00b894' });
        }
    }

    processRothConversions(year, snapshot, month = 1) {
        const advRoth = this.strategies.advancedRothStrategy;
        const yearsFromStart = year - this.currentYear;
        const inflationMultiplier = Math.pow(1 + ((Number(this.assumptions.inflationRate) || 0) / 100), yearsFromStart);

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
            [this.s1, this.s2].forEach(spouse => {
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
            onPreTaxTaxable: (d) => { this.taxableIncome += d; },
            onLtcgRealized: (g) => {
                this.realizedLtcg = (this.realizedLtcg || 0) + g;
                snapshot.realizedLtcg = (snapshot.realizedLtcg || 0) + g;
            },
            drawdownStrategy: this.strategies?.drawdownStrategy || 'age_tiered_60',
            drawdownTierAge: this.strategies?.drawdownTierAge !== undefined ? Number(this.strategies.drawdownTierAge) : 60,
            taxYearData: currentTaxYearData,
            currentTaxableIncome: this.taxableIncome,
            filingStatus: this.getFilingStatus(year)
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
            const s1YearsLeft = this.s1.lifeExpectancy - this.s1.getAge(year);
            const s2YearsLeft = this.s2.lifeExpectancy - this.s2.getAge(year);
            const yearsLeft = Math.max(1, Math.max(s1YearsLeft, s2YearsLeft));
            const totalLiquidPortfolio = Object.values(this.s1.accounts).reduce((s, a) => s + (a.balance || 0), 0) + Object.values(this.s2.accounts).reduce((s, a) => s + (a.balance || 0), 0);
            const legacyReserve = Number(this.strategies?.targetLegacyBalance || 0);
            const amortizablePortfolio = Math.max(0, totalLiquidPortfolio - legacyReserve);
            const realReturn = 0.04;
            let targetAnnualSpend = 0;
            if (realReturn === 0) {
                targetAnnualSpend = amortizablePortfolio / yearsLeft;
            } else {
                targetAnnualSpend = (amortizablePortfolio * realReturn) / (1 - Math.pow(1 + realReturn, -yearsLeft));
            }
            if (targetAnnualSpend > snapshot.expenses) {
                const extraSpend = targetAnnualSpend - snapshot.expenses;
                snapshot.expenses = targetAnnualSpend;
                snapshot.expenseBreakdown.base += extraSpend;
            }
        }

        const totalIncome = snapshot.income.s1.w2Net + snapshot.income.s2.w2Net + snapshot.income.s1.ssn + snapshot.income.s2.ssn + snapshot.income.s1.rule72t + snapshot.income.s2.rule72t + rmIncome;
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
            ltcgGains: this.realizedLtcg || 0
        });

        TaxManager.reinvestSurplus({
            snapshot,
            strategies: this.strategies,
            year,
            currentYear: this.currentYear,
            cashCushion: cushionWrapper,
            s1: this.s1,
            s2: this.s2
        });
        this.cashCushion = cushionWrapper.value;
    }

    finalizeSnapshot(snapshot) {
        const cleanPrecision = (val) => Math.round((Number(val) || 0) * 1e4) / 1e4;
        const getGrowth = (spouse, type) => {
            const accs = (spouse.accounts || []).filter(a => a.type === type);
            const res = {
                interest: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearInterest) || 0), 0)),
                contributions: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearContributions) || 0), 0)),
                conversionsIn: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearConversionsIn) || 0), 0)),
                conversionsOut: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearConversionsOut) || 0), 0)),
                rolloverIn: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearRolloverIn) || 0), 0)),
                rolloverOut: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearRolloverOut) || 0), 0)),
                withdrawals: cleanPrecision(accs.reduce((sum, a) => sum + (Number(a.yearWithdrawals) || 0), 0))
            };
            if (type === 'rothIra') {
                const rothAcc = (spouse.accounts || []).find(a => a.type === 'rothIra');
                if (rothAcc && typeof rothAcc.getRothPrincipalBreakdown === 'function') {
                    res.rothPrincipalBreakdown = rothAcc.getRothPrincipalBreakdown(snapshot.year);
                }
            }
            return res;
        };

        const getBal = (spouse, type) => {
            const accs = (spouse.accounts || []).filter(a => a.type === type);
            return accs.reduce((sum, a) => sum + (a.balance || 0), 0);
        };

        const endMortgageBalance = this.mortgage.enabled ? this.mortgage.currentBalance : 0;
        const endHomeValue = this.primaryResidenceEquity.currentValue || 0;
        const endEquity = Math.max(0, endHomeValue - endMortgageBalance);

        Object.values(this.s1.accounts).forEach(acc => {
            acc.balance = cleanPrecision(acc.balance);
        });
        Object.values(this.s2.accounts).forEach(acc => {
            acc.balance = cleanPrecision(acc.balance);
        });

        // Update end-of-year balances in snapshot
        snapshot.balances = {
            s1Trad401k: getBal(this.s1, 'traditional401k'),
            s2Trad401k: getBal(this.s2, 'traditional401k'),
            s1Trad403b: getBal(this.s1, 'trad403b'),
            s2Trad403b: getBal(this.s2, 'trad403b'),
            s1StandardIra: getBal(this.s1, 'standardIra'),
            s2StandardIra: getBal(this.s2, 'standardIra'),
            s1Hysa: getBal(this.s1, 'hysa'),
            s2Hysa: getBal(this.s2, 'hysa'),
            s1Cd: getBal(this.s1, 'cd'),
            s2Cd: getBal(this.s2, 'cd'),
            s1Brokerage: getBal(this.s1, 'taxableBrokerage'),
            s2Brokerage: getBal(this.s2, 'taxableBrokerage'),
            s1RothIra: getBal(this.s1, 'rothIra'),
            s2RothIra: getBal(this.s2, 'rothIra'),
            cashCushion: this.cashCushion,
            college529: snapshot.college529?.totalBalance || 0,
            primaryResidenceEquity: endEquity,
            homeValue: endHomeValue,
            mortgageBalance: endMortgageBalance
        };

        const growthRate = (this.primaryResidenceEquity.annualGrowthRate !== undefined ? this.primaryResidenceEquity.annualGrowthRate : 3) / 100;
        const homeAppreciation = endHomeValue > 0 ? (endHomeValue - (endHomeValue / (1 + growthRate))) : 0;

        snapshot.growth = {
            s1Trad401k: getGrowth(this.s1, 'traditional401k'),
            s2Trad401k: getGrowth(this.s2, 'traditional401k'),
            s1Trad403b: getGrowth(this.s1, 'trad403b'),
            s2Trad403b: getGrowth(this.s2, 'trad403b'),
            s1StandardIra: getGrowth(this.s1, 'standardIra'),
            s2StandardIra: getGrowth(this.s2, 'standardIra'),
            s1Hysa: getGrowth(this.s1, 'hysa'),
            s2Hysa: getGrowth(this.s2, 'hysa'),
            s1Cd: getGrowth(this.s1, 'cd'),
            s2Cd: getGrowth(this.s2, 'cd'),
            s1Brokerage: getGrowth(this.s1, 'taxableBrokerage'),
            s2Brokerage: getGrowth(this.s2, 'taxableBrokerage'),
            s1RothIra: getGrowth(this.s1, 'rothIra'),
            s2RothIra: getGrowth(this.s2, 'rothIra'),
            college529: {
                interest: snapshot.college529?.totalInterest || 0,
                contributions: 0,
                withdrawals: snapshot.college529?.totalDrawn || 0
            },
            primaryResidenceEquity: {
                interest: homeAppreciation,
                contributions: 0,
                withdrawals: snapshot.income?.reverseMortgage || 0
            }
        };

        const totalPortfolio = getBal(this.s1, 'traditional401k') + getBal(this.s2, 'traditional401k') +
            getBal(this.s1, 'trad403b') + getBal(this.s2, 'trad403b') +
            getBal(this.s1, 'standardIra') + getBal(this.s2, 'standardIra') +
            getBal(this.s1, 'hysa') + getBal(this.s2, 'hysa') +
            getBal(this.s1, 'cd') + getBal(this.s2, 'cd') +
            getBal(this.s1, 'taxableBrokerage') + getBal(this.s2, 'taxableBrokerage') +
            getBal(this.s1, 'rothIra') + getBal(this.s2, 'rothIra') +
            this.cashCushion;

        if (this.initialPortfolioValue === null) this.initialPortfolioValue = totalPortfolio;
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
}

export function runSimulation(state, sorrOverride = null) {
    const engine = new SimulationEngine(state, sorrOverride);
    return engine.run();
}
