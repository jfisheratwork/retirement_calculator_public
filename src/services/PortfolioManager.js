import { SORR_SCENARIOS } from './SimulationEngine.js';

/**
 * PortfolioManager.js
 * 
 * Domain logic for handling investment growth, Sequence of Returns Risk (SORR),
 * conservative shifts, and Certificate of Deposit (CD) maturities.
 */

const SECURITY_ACCOUNT_TYPES = ['traditional401k', 'trad403b', 'standardIra', 'rothIra', 'taxableBrokerage'];

function calculateSorrRate({ year, s1, assumptions, strategies, sorrOverride }) {
    const arr = sorrOverride?.returnsArray || (
        (assumptions.sorrScenario || strategies?.sorrScenario) && 
        (assumptions.sorrScenario || strategies?.sorrScenario) !== 'none' && 
        (assumptions.sorrScenario || strategies?.sorrScenario) !== 'average'
            ? SORR_SCENARIOS[assumptions.sorrScenario || strategies?.sorrScenario]
            : null
    );

    if (!arr || !Array.isArray(arr)) {
        return { isSorrActive: false, sorrRate: 0 };
    }

    const currentYear = new Date().getFullYear();
    const startYearForSorr = sorrOverride?.startYear !== undefined 
        ? (currentYear + sorrOverride.startYear) 
        : (sorrOverride?.startAge !== undefined 
            ? (s1.yearOfBirth + sorrOverride.startAge) 
            : (s1.yearOfBirth + s1.targetRetirementAge));

    if (year >= startYearForSorr) {
        const idx = year - startYearForSorr;
        if (idx < arr.length) {
            return { isSorrActive: true, sorrRate: arr[idx] / 100 };
        }
    }

    return { isSorrActive: false, sorrRate: 0 };
}

function getAccountGrowthRate(account, year, assumptions, isSorrActive, sorrRate, isConservativeShift) {
    if (isSorrActive) {
        return sorrRate;
    }
    if (isConservativeShift && account.type !== 'hysa' && account.type !== 'cd') {
        return Number(assumptions.conservativeShift?.returnRate || 5.5) / 100;
    }
    if (account.type === 'cd') {
        return (account.rate !== undefined ? Number(account.rate) : (account.expectedReturn || 5)) / 100;
    }
    if (account.type === 'hysa') {
        return (account.expectedReturn !== undefined && account.expectedReturn !== null)
            ? (Number(account.expectedReturn) / 100)
            : 0.04;
    }
    if (SECURITY_ACCOUNT_TYPES.includes(account.type)) {
        if (PortfolioManager.hasMarketReturnSchedule(assumptions)) {
            return PortfolioManager.getMarketReturnRate(year, assumptions);
        }
        if (account.expectedReturn !== undefined && account.expectedReturn !== null) {
            return Number(account.expectedReturn) / 100;
        }
        return PortfolioManager.getMarketReturnRate(year, assumptions);
    }
    return (account.expectedReturn !== undefined && account.expectedReturn !== null)
        ? (Number(account.expectedReturn) / 100)
        : PortfolioManager.getMarketReturnRate(year, assumptions);
}

export class PortfolioManager {
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
            return (Number(activeTier.rate !== undefined ? activeTier.rate : 7.0)) / 100;
        }
        if (assumptions.generalReturnRate !== undefined) {
            return Number(assumptions.generalReturnRate) / 100;
        }
        return 0.07;
    }

    static hasMarketReturnSchedule(assumptions) {
        return Boolean(assumptions.marketReturnRates && Array.isArray(assumptions.marketReturnRates) && assumptions.marketReturnRates.length > 0);
    }

    static growAccounts({ year, s1, s2, assumptions, strategies, sorrOverride, events, cashCushion, primaryResidenceEquity }) {
        const { isSorrActive, sorrRate } = calculateSorrRate({ year, s1, assumptions, strategies, sorrOverride });

        const isConservativeShift = Boolean(assumptions.conservativeShift?.enabled)
            && s1.getAge(year) >= Number(assumptions.conservativeShift.startAge || 60);

        if (isConservativeShift && !events.find(e => e.type === 'conservative_shift')) {
            const shiftRate = Number(assumptions.conservativeShift.returnRate || 5.5);
            events.push({
                year,
                label: `Conservative Shift (${shiftRate}% Return)`,
                type: 'conservative_shift',
                color: '#74b9ff'
            });
        }

        const applyGrowth = (spouse) => {
            Object.values(spouse.accounts).forEach(account => {
                if (account.enabled !== false) {
                    const rate = getAccountGrowthRate(account, year, assumptions, isSorrActive, sorrRate, isConservativeShift);
                    account.grow(rate);
                }
            });
        };

        applyGrowth(s1);
        applyGrowth(s2);

        if (primaryResidenceEquity.currentValue > 0) {
            const reGrowth = (primaryResidenceEquity.annualGrowthRate !== undefined ? primaryResidenceEquity.annualGrowthRate : 3) / 100;
            primaryResidenceEquity.currentValue *= (1 + reGrowth);
        }

        return cashCushion * 1.01;
    }

    static growAccountsMonthly({ year, month, s1, s2, assumptions, strategies, sorrOverride, events, cashCushion, primaryResidenceEquity }) {
        const { isSorrActive, sorrRate } = calculateSorrRate({ year, s1, assumptions, strategies, sorrOverride });

        const isConservativeShift = Boolean(assumptions.conservativeShift?.enabled)
            && s1.getAge(year) >= Number(assumptions.conservativeShift.startAge || 60);

        if (month === 1 && isConservativeShift && !events.find(e => e.type === 'conservative_shift')) {
            const shiftRate = Number(assumptions.conservativeShift.returnRate || 5.5);
            events.push({
                year,
                label: `Conservative Shift (${shiftRate}% Return)`,
                type: 'conservative_shift',
                color: '#74b9ff'
            });
        }

        const applyMonthlyGrowth = (spouse) => {
            Object.values(spouse.accounts).forEach(account => {
                if (account.enabled !== false) {
                    const annualRate = getAccountGrowthRate(account, year, assumptions, isSorrActive, sorrRate, isConservativeShift);
                    const monthlyRate = annualRate >= 0 ? (Math.pow(1 + annualRate, 1 / 12) - 1) : (annualRate / 12);
                    account.grow(monthlyRate);
                }
            });
        };

        applyMonthlyGrowth(s1);
        applyMonthlyGrowth(s2);

        if (primaryResidenceEquity.currentValue > 0) {
            const reAnnualRate = (primaryResidenceEquity.annualGrowthRate !== undefined ? primaryResidenceEquity.annualGrowthRate : 3) / 100;
            const reMonthlyRate = Math.pow(1 + reAnnualRate, 1 / 12) - 1;
            primaryResidenceEquity.currentValue *= (1 + reMonthlyRate);
            primaryResidenceEquity.currentValue = Math.round(primaryResidenceEquity.currentValue * 1e4) / 1e4;
        }

        const cushionMonthlyRate = Math.pow(1.01, 1 / 12) - 1;
        return cashCushion * (1 + cushionMonthlyRate);
    }

    static processCdMaturities({ year, currentYear, s1, s2, events }) {
        [s1, s2].forEach(spouse => {
            (spouse.accounts || []).filter(a => a.type === 'cd' && !a.isMatured && a.balance > 0).forEach(cd => {
                PortfolioManager.processSingleCd({ cd, year, currentYear, spouse, s1, s2, events });
            });
        });
    }

    static processCdMaturitiesMonthly({ year, month, currentYear, s1, s2, events }) {
        [s1, s2].forEach(spouse => {
            (spouse.accounts || []).filter(a => a.type === 'cd' && !a.isMatured && a.balance > 0).forEach(cd => {
                PortfolioManager.processSingleCdMonthly({ cd, year, month, currentYear, spouse, s1, s2, events });
            });
        });
    }

    static processSingleCdMonthly({ cd, year, month, currentYear, spouse, s1, s2, events }) {
        let maturityYear = 0;
        let maturityMonth = 1;
        if (cd.currentMaturityYear && cd.currentMaturityMonth) {
            maturityYear = cd.currentMaturityYear;
            maturityMonth = cd.currentMaturityMonth;
        } else if (cd.maturityDate) {
            const parts = String(cd.maturityDate).split('-');
            maturityYear = parseInt(parts[0], 10) || (currentYear + 1);
            maturityMonth = parseInt(parts[1], 10) || 1;
            cd.currentMaturityYear = maturityYear;
            cd.currentMaturityMonth = maturityMonth;
        } else {
            maturityYear = currentYear + 1;
            maturityMonth = 1;
            cd.currentMaturityYear = maturityYear;
            cd.currentMaturityMonth = maturityMonth;
        }

        const termMonths = Number(cd.termMonths) || (Number(cd.termYears) ? Number(cd.termYears) * 12 : 12);

        if (maturityYear > 0 && (year > maturityYear || (year === maturityYear && month >= maturityMonth))) {
            const action = cd.maturityAction || 'sweep';
            const maxRollovers = Number(cd.rolloverCount) || 1;
            
            if (action === 'rollover' && (cd.rolloversCompleted || 0) < maxRollovers) {
                cd.rolloversCompleted = (cd.rolloversCompleted || 0) + 1;
                const currentTotalMonths = year * 12 + (month - 1);
                const nextTotalMonths = currentTotalMonths + termMonths;
                cd.currentMaturityYear = Math.floor(nextTotalMonths / 12);
                cd.currentMaturityMonth = (nextTotalMonths % 12) + 1;
                if (events) {
                    events.push({
                        year,
                        month,
                        label: `${spouse.name || 'Primary'} CD Rolled Over (${termMonths}m term ➔ ${cd.currentMaturityYear}-${String(cd.currentMaturityMonth).padStart(2, '0')})`,
                        type: 'cd_rollover'
                    });
                }
            } else {
                const targetAcc = PortfolioManager.findTargetSavingsAccount(spouse, cd, s1, s2);
                PortfolioManager._sweepMaturedCd({ cd, targetAcc, year, month, spouse, events });
            }
        }
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
        if (events) {
            events.push({
                year,
                month,
                label: `${spouse.name || 'Primary'} CD Matured ($${Math.round(maturedBalance).toLocaleString()} ➔ ${targetAcc.name || 'Brokerage'})`,
                type: 'cd_matured'
            });
        }
    }

    static processSingleCd({ cd, year, currentYear, spouse, s1, s2, events }) {
        let maturityYear = 0;
        let maturityMonth = 1;
        if (cd.currentMaturityYear) {
            maturityYear = cd.currentMaturityYear;
            maturityMonth = cd.currentMaturityMonth || 1;
        } else if (cd.maturityDate) {
            const parts = String(cd.maturityDate).split('-');
            maturityYear = parseInt(parts[0], 10) || (currentYear + 1);
            maturityMonth = parseInt(parts[1], 10) || 1;
            cd.currentMaturityYear = maturityYear;
            cd.currentMaturityMonth = maturityMonth;
        }

        const termMonths = Number(cd.termMonths) || (Number(cd.termYears) ? Number(cd.termYears) * 12 : 12);

        if (maturityYear > 0 && year >= maturityYear) {
            const action = cd.maturityAction || 'sweep';
            const maxRollovers = Number(cd.rolloverCount) || 1;
            
            if (action === 'rollover' && (cd.rolloversCompleted || 0) < maxRollovers) {
                cd.rolloversCompleted = (cd.rolloversCompleted || 0) + 1;
                const currentTotalMonths = year * 12 + (maturityMonth - 1);
                const nextTotalMonths = currentTotalMonths + termMonths;
                cd.currentMaturityYear = Math.floor(nextTotalMonths / 12);
                cd.currentMaturityMonth = (nextTotalMonths % 12) + 1;
            } else {
                const targetAcc = PortfolioManager.findTargetSavingsAccount(spouse, cd, s1, s2);
                const maturedBalance = cd.balance;
                if (targetAcc && maturedBalance > 0) {
                    cd.balance = 0;
                    cd.yearRolloverOut = (cd.yearRolloverOut || 0) + maturedBalance;
                    cd.yearWithdrawals = (cd.yearWithdrawals || 0) + maturedBalance;
                    cd.isMatured = true;
                    
                    targetAcc.balance += maturedBalance;
                    targetAcc.yearRolloverIn = (targetAcc.yearRolloverIn || 0) + maturedBalance;
                }
            }
        }
    }

    static findTargetSavingsAccount(spouse, cd, s1, s2) {
        if (cd.sweepTargetAccountId) {
            const foundSame = (spouse.accounts || []).find(a => a.id === cd.sweepTargetAccountId || a.name === cd.sweepTargetAccountId);
            if (foundSame) return foundSame;
            const otherSpouse = spouse === s1 ? s2 : s1;
            const foundOther = (otherSpouse.accounts || []).find(a => a.id === cd.sweepTargetAccountId || a.name === cd.sweepTargetAccountId);
            if (foundOther) return foundOther;
        }

        const sameHysa = (spouse.accounts || []).find(a => a.type === 'hysa');
        if (sameHysa) return sameHysa;
        
        const otherSpouse = spouse === s1 ? s2 : s1;
        const otherHysa = (otherSpouse.accounts || []).find(a => a.type === 'hysa');
        if (otherHysa) return otherHysa;

        const sameBrokerage = (spouse.accounts || []).find(a => a.type === 'taxableBrokerage');
        if (sameBrokerage) return sameBrokerage;

        return (otherSpouse.accounts || []).find(a => a.type === 'taxableBrokerage') || null;
    }
}
