import { SORR_SCENARIOS } from './SimulationEngine.js';

/**
 * PortfolioManager.js
 *
 * Domain logic for handling investment growth, Sequence of Returns Risk (SORR),
 * conservative shifts, and Certificate of Deposit (CD) maturities.
 */

const SECURITY_ACCOUNT_TYPES = ['traditional401k', 'trad403b', 'standardIra', 'rothIra', 'taxableBrokerage'];

function resolveSorrArrayAndConfig(assumptions, sorrOverride) {
    if (sorrOverride) {
        const arr =
            sorrOverride.returnsArray || (sorrOverride.scenarioKey ? SORR_SCENARIOS[sorrOverride.scenarioKey] : null);
        return { arr, overrideConfig: sorrOverride };
    }
    const scenario = assumptions?.sorrScenario;
    if (scenario && scenario !== 'average' && scenario !== 'none') {
        return { arr: SORR_SCENARIOS[scenario], overrideConfig: assumptions };
    }
    return { arr: null, overrideConfig: null };
}

function resolveSorrStartYear(s1, overrideConfig) {
    const currentYear = new Date().getFullYear();
    const s1BirthYear = Number(s1?.birthYear || s1?.yearOfBirth) || 1980;
    if (overrideConfig?.startYear !== undefined) {
        return overrideConfig.startYear > 1000 ? overrideConfig.startYear : currentYear + overrideConfig.startYear;
    }
    if (overrideConfig?.startAge !== undefined) {
        return s1BirthYear + overrideConfig.startAge;
    }
    return s1BirthYear + (s1?.targetRetirementAge || 65);
}

export function calculateSorrRate({ year, s1, assumptions, sorrOverride }) {
    const { arr, overrideConfig } = resolveSorrArrayAndConfig(assumptions, sorrOverride);
    if (!Array.isArray(arr)) {
        return { isSorrActive: false, sorrRate: 0 };
    }

    const startYearForSorr = resolveSorrStartYear(s1, overrideConfig);
    if (year >= startYearForSorr) {
        const idx = year - startYearForSorr;
        if (idx < arr.length) {
            return { isSorrActive: true, sorrRate: arr[idx] / 100 };
        }
    }

    return { isSorrActive: false, sorrRate: 0 };
}

function getStandardSecurityRate(account, year, assumptions) {
    const hasExpected = account.expectedReturn !== undefined && account.expectedReturn !== null;
    if (SECURITY_ACCOUNT_TYPES.includes(account.type) && PortfolioManager.hasMarketReturnSchedule(assumptions)) {
        return PortfolioManager.getMarketReturnRate(year, assumptions);
    }
    if (hasExpected) {
        return Number(account.expectedReturn) / 100;
    }
    return PortfolioManager.getMarketReturnRate(year, assumptions);
}

export function getAccountGrowthRate(account, year, assumptions, ...rest) {
    const [isSorrActive = false, sorrRate = 0, isConservativeShift = false] = rest;
    if (account.type === 'cd') {
        return (account.rate !== undefined ? Number(account.rate) : account.expectedReturn || 5) / 100;
    }
    if (account.type === 'hysa') {
        return account.expectedReturn !== undefined && account.expectedReturn !== null
            ? Number(account.expectedReturn) / 100
            : 0.04;
    }
    if (isSorrActive) return sorrRate;
    if (isConservativeShift) return Number(assumptions.conservativeShift?.returnRate || 5.5) / 100;

    return getStandardSecurityRate(account, year, assumptions);
}

export class PortfolioManager {
    static calculateSorrRate(params) {
        return calculateSorrRate(params);
    }

    static getMarketReturnRate(year, assumptions) {
        const rates = assumptions.marketReturnRates;
        if (Array.isArray(rates) && rates.length > 0) {
            const sorted = [...rates].sort((a, b) => Number(a.startYear || 0) - Number(b.startYear || 0));
            let activeTier = sorted[0];
            for (const tier of sorted) {
                if (Number(tier.startYear || 0) <= year) {
                    activeTier = tier;
                }
            }
            return Number(activeTier.rate !== undefined ? activeTier.rate : 7.0) / 100;
        }
        if (assumptions.generalReturnRate !== undefined) {
            return Number(assumptions.generalReturnRate) / 100;
        }
        return 0.07;
    }

    static hasMarketReturnSchedule(assumptions) {
        return Boolean(Array.isArray(assumptions.marketReturnRates) && assumptions.marketReturnRates.length > 0);
    }

    static applyGrowthAndInflation(params) {
        return PortfolioManager.growAccounts(params);
    }

    static growAccounts({
        year,
        s1,
        s2,
        assumptions,
        strategies,
        sorrOverride,
        events,
        cashCushion,
        primaryResidenceEquity,
        isSorrActive: directIsSorrActive,
        sorrRate: directSorrRate
    }) {
        const { isSorrActive, sorrRate } =
            directIsSorrActive !== undefined && directSorrRate !== undefined
                ? { isSorrActive: directIsSorrActive, sorrRate: directSorrRate }
                : calculateSorrRate({ year, s1, assumptions, strategies, sorrOverride });

        const isConservativeShift =
            Boolean(assumptions.conservativeShift?.enabled) &&
            s1.getAge(year) >= Number(assumptions.conservativeShift.startAge || 60);

        if (isConservativeShift && !events.find((e) => e.type === 'conservative_shift')) {
            const shiftRate = Number(assumptions.conservativeShift.returnRate || 5.5);
            events.push({
                year,
                label: `Conservative Shift (${shiftRate}%)`,
                type: 'conservative_shift',
                color: '#74b9ff'
            });
        }

        const applyGrowth = (spouse) => {
            Object.values(spouse.accounts).forEach((account) => {
                if (account.enabled !== false) {
                    const rate = getAccountGrowthRate(
                        account,
                        year,
                        assumptions,
                        isSorrActive,
                        sorrRate,
                        isConservativeShift
                    );
                    account.grow(rate);
                }
            });
        };

        applyGrowth(s1);
        applyGrowth(s2);

        if (primaryResidenceEquity.currentValue > 0) {
            const reGrowth =
                (primaryResidenceEquity.annualGrowthRate !== undefined ? primaryResidenceEquity.annualGrowthRate : 3) /
                100;
            primaryResidenceEquity.currentValue *= 1 + reGrowth;
        }

        return cashCushion * 1.01;
    }

    static growAccountsMonthly({
        year,
        month,
        s1,
        s2,
        assumptions,
        strategies,
        sorrOverride,
        events,
        cashCushion,
        primaryResidenceEquity
    }) {
        const { isSorrActive, sorrRate } = calculateSorrRate({ year, s1, assumptions, strategies, sorrOverride });

        const isConservativeShift =
            Boolean(assumptions.conservativeShift?.enabled) &&
            s1.getAge(year) >= Number(assumptions.conservativeShift.startAge || 60);

        if (month === 1 && isConservativeShift && !events.find((e) => e.type === 'conservative_shift')) {
            const shiftRate = Number(assumptions.conservativeShift.returnRate || 5.5);
            events.push({
                year,
                label: `Conservative Shift (${shiftRate}%)`,
                type: 'conservative_shift',
                color: '#74b9ff'
            });
        }

        const applyMonthlyGrowth = (spouse) => {
            Object.values(spouse.accounts).forEach((account) => {
                if (account.enabled !== false) {
                    const annualRate = getAccountGrowthRate(
                        account,
                        year,
                        assumptions,
                        isSorrActive,
                        sorrRate,
                        isConservativeShift
                    );
                    const monthlyRate = annualRate >= 0 ? Math.pow(1 + annualRate, 1 / 12) - 1 : annualRate / 12;
                    account.grow(monthlyRate);
                }
            });
        };

        applyMonthlyGrowth(s1);
        applyMonthlyGrowth(s2);

        if (primaryResidenceEquity.currentValue > 0) {
            const reAnnualRate =
                (primaryResidenceEquity.annualGrowthRate !== undefined ? primaryResidenceEquity.annualGrowthRate : 3) /
                100;
            const reMonthlyRate = Math.pow(1 + reAnnualRate, 1 / 12) - 1;
            primaryResidenceEquity.currentValue *= 1 + reMonthlyRate;
            primaryResidenceEquity.currentValue = Math.round(primaryResidenceEquity.currentValue * 1e4) / 1e4;
        }

        const cushionMonthlyRate = Math.pow(1.01, 1 / 12) - 1;
        return cashCushion * (1 + cushionMonthlyRate);
    }

    static processCdMaturities({ year, currentYear, s1, s2, events }) {
        [s1, s2].forEach((spouse) => {
            (spouse.accounts || [])
                .filter((a) => a.type === 'cd' && !a.isMatured && a.balance > 0)
                .forEach((cd) => {
                    PortfolioManager.processSingleCd({ cd, year, currentYear, spouse, s1, s2, events });
                });
        });
    }

    static processCdMaturitiesMonthly({ year, month, currentYear, s1, s2, events }) {
        [s1, s2].forEach((spouse) => {
            (spouse.accounts || [])
                .filter((a) => a.type === 'cd' && !a.isMatured && a.balance > 0)
                .forEach((cd) => {
                    PortfolioManager.processSingleCdMonthly({ cd, year, month, currentYear, spouse, s1, s2, events });
                });
        });
    }

    static _resolveCdMaturitySchedule(cd, currentYear, defaultWhenMissing = true) {
        if (cd.currentMaturityYear) {
            return {
                maturityYear: cd.currentMaturityYear,
                maturityMonth: cd.currentMaturityMonth || 1
            };
        }
        if (cd.maturityDate) {
            const parts = String(cd.maturityDate).split('-');
            const maturityYear = parseInt(parts[0], 10) || currentYear + 1;
            const maturityMonth = parseInt(parts[1], 10) || 1;
            cd.currentMaturityYear = maturityYear;
            cd.currentMaturityMonth = maturityMonth;
            return { maturityYear, maturityMonth };
        }
        if (defaultWhenMissing) {
            cd.currentMaturityYear = currentYear + 1;
            cd.currentMaturityMonth = 1;
            return { maturityYear: cd.currentMaturityYear, maturityMonth: 1 };
        }
        return { maturityYear: 0, maturityMonth: 1 };
    }

    static _getCdTermMonths(cd) {
        const directMonths = Number(cd.termMonths);
        if (directMonths > 0) return directMonths;
        const years = Number(cd.termYears);
        return years > 0 ? years * 12 : 12;
    }

    static _advanceCdRollover(cd, year, month, termMonths) {
        cd.rolloversCompleted = (cd.rolloversCompleted || 0) + 1;
        const nextTotalMonths = year * 12 + (month - 1) + termMonths;
        cd.currentMaturityYear = Math.floor(nextTotalMonths / 12);
        cd.currentMaturityMonth = (nextTotalMonths % 12) + 1;
    }

    static processSingleCdMonthly({ cd, year, month, currentYear, spouse, s1, s2, events }) {
        const { maturityYear, maturityMonth } = this._resolveCdMaturitySchedule(cd, currentYear, true);
        const isDue = maturityYear > 0 && (year > maturityYear || (year === maturityYear && month >= maturityMonth));
        if (!isDue) return;

        const termMonths = this._getCdTermMonths(cd);
        const action = cd.maturityAction || 'sweep';
        const maxRollovers = Number(cd.rolloverCount) || 1;

        if (action === 'rollover' && (cd.rolloversCompleted || 0) < maxRollovers) {
            this._advanceCdRollover(cd, year, month, termMonths);
            if (events) {
                const nextDateStr = `${cd.currentMaturityYear}-${String(cd.currentMaturityMonth).padStart(2, '0')}`;
                events.push({
                    year,
                    month,
                    label: `${spouse.name || 'Primary'} CD Rolled Over (${termMonths}m term ➔ ${nextDateStr})`,
                    type: 'cd_rollover'
                });
            }
            return;
        }

        const targetAcc = PortfolioManager.findTargetSavingsAccount(spouse, cd, s1, s2);
        PortfolioManager._sweepMaturedCd({ cd, targetAcc, year, month, spouse, events });
    }

    static _sweepMaturedCd({ cd, targetAcc, year, month, spouse, events }) {
        const maturedBalance = cd.balance;
        if (!targetAcc || maturedBalance <= 0) return;

        cd.balance = 0;
        cd.yearRolloverOut = (cd.yearRolloverOut || 0) + maturedBalance;
        cd.yearWithdrawals = (cd.yearWithdrawals || 0) + maturedBalance;
        cd.isMatured = true;

        targetAcc.balance += maturedBalance;
        targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + maturedBalance;
        if (events && Array.isArray(events)) {
            events.push({
                year,
                month,
                label: `${spouse.name || 'Primary'} CD Matured ($${Math.round(maturedBalance).toLocaleString()} ➔ ${targetAcc.name || 'Brokerage'})`,
                type: 'cd_matured'
            });
        }
    }

    static processSingleCd({ cd, year, currentYear, spouse, s1, s2, events }) {
        const { maturityYear, maturityMonth } = this._resolveCdMaturitySchedule(cd, currentYear, false);
        if (maturityYear <= 0 || year < maturityYear) return;

        const termMonths = this._getCdTermMonths(cd);
        const action = cd.maturityAction || 'sweep';
        const maxRollovers = Number(cd.rolloverCount) || 1;

        if (action === 'rollover' && (cd.rolloversCompleted || 0) < maxRollovers) {
            this._advanceCdRollover(cd, year, maturityMonth, termMonths);
            return;
        }

        const targetAcc = PortfolioManager.findTargetSavingsAccount(spouse, cd, s1, s2);
        PortfolioManager._sweepMaturedCd({ cd, targetAcc, year, month: maturityMonth, spouse, events });
    }

    static _findAccountByIdOrName(accounts, targetId) {
        return (accounts || []).find((a) => a.id === targetId || a.name === targetId) || null;
    }

    static findTargetSavingsAccount(spouse, cd, s1, s2) {
        const otherSpouse = spouse === s1 ? s2 : s1;
        const primaryAccounts = spouse?.accounts || [];
        const secondaryAccounts = otherSpouse?.accounts || [];

        if (cd.sweepTargetAccountId) {
            const match =
                this._findAccountByIdOrName(primaryAccounts, cd.sweepTargetAccountId) ||
                this._findAccountByIdOrName(secondaryAccounts, cd.sweepTargetAccountId);
            if (match) return match;
        }

        return (
            primaryAccounts.find((a) => a.type === 'hysa') ||
            secondaryAccounts.find((a) => a.type === 'hysa') ||
            primaryAccounts.find((a) => a.type === 'taxableBrokerage') ||
            secondaryAccounts.find((a) => a.type === 'taxableBrokerage') ||
            null
        );
    }
}
