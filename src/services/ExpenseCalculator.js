import { AcaHealthcareCalculator } from './AcaHealthcareCalculator.js';

/**
 * Handles phase-based household expenses, housing, mortgage, college 529s, and healthcare
 */
export class ExpenseCalculator {
    static _classifyDependents(dependents, year) {
        let hasPreTeens = false;
        let hasTeenagers = false;
        let hasCollege = false;
        for (const child of dependents || []) {
            const childAge = year - child.yearOfBirth;
            if (childAge >= 0 && childAge < 13) hasPreTeens = true;
            else if (childAge >= 13 && childAge <= 17) hasTeenagers = true;
            else if (childAge >= 18 && childAge <= 22) hasCollege = true;
        }
        return { hasPreTeens, hasTeenagers, hasCollege };
    }

    static getBaseMonthlyExpense(dependents, year, s1, phases, strategies = {}) {
        if (phases?.phase1?.monthlyExpense !== undefined) {
            return Number(phases.phase1.monthlyExpense) || 0;
        }

        const { hasPreTeens, hasTeenagers, hasCollege } = ExpenseCalculator._classifyDependents(dependents, year);

        if (hasTeenagers) {
            return ExpenseCalculator._resolvePhase(phases, [
                'teenagers',
                'preTeens',
                'college',
                'earlyRetirement',
                'preRetirementWithKids'
            ]);
        }
        if (hasPreTeens) {
            return ExpenseCalculator._resolvePhase(phases, [
                'preTeens',
                'teenagers',
                'college',
                'earlyRetirement',
                'preRetirementWithKids'
            ]);
        }
        if (hasCollege) {
            return ExpenseCalculator._resolvePhase(phases, [
                'college',
                'teenagers',
                'preRetirementNoKids',
                'earlyRetirement'
            ]);
        }

        return ExpenseCalculator._getEmptyNesterExpense(year, s1, phases, strategies);
    }

    static _resolvePhase(phases, keys) {
        if (!phases) return 0;
        for (const key of keys) {
            if (phases[key] !== undefined && phases[key] !== null) {
                return Number(phases[key]) || 0;
            }
        }
        return 0;
    }

    static _getGogoMultiplier(strategies) {
        const rawMult = Number(strategies?.gogoMultiplier || 1.0);
        const isFrontLoaded = strategies?.decumulationMode === 'front_loaded' || rawMult > 1.0;
        if (!isFrontLoaded) return { gogo: 1.0, midGogo: 1.0 };
        const gogo = Number(strategies?.gogoMultiplier || 1.25);
        return { gogo, midGogo: 1 + (gogo - 1) / 2 };
    }

    static _getEmptyNesterExpense(year, s1, phases, strategies) {
        const healthOffset = Number(strategies?.healthAgingOffset || 0);
        const retAge = s1?.targetRetirementAge || 65;
        const currentAge = (s1 ? s1.getAge(year) : 65) + healthOffset;

        if (currentAge < retAge) {
            return ExpenseCalculator._resolvePhase(phases, [
                'preRetirementNoKids',
                'earlyRetirement',
                'college',
                'preRetirementWithKids'
            ]);
        }

        const yearsRetired = currentAge - retAge;
        const { gogo, midGogo } = ExpenseCalculator._getGogoMultiplier(strategies);

        if (yearsRetired < 5) {
            return (
                ExpenseCalculator._resolvePhase(phases, ['earlyRetirement', 'preRetirementNoKids', 'midRetirement']) *
                gogo
            );
        }
        if (yearsRetired < 10) {
            return (
                ExpenseCalculator._resolvePhase(phases, ['midRetirement', 'earlyRetirement', 'olderRetirement']) *
                midGogo
            );
        }
        if (yearsRetired < 15) {
            return ExpenseCalculator._resolvePhase(phases, ['olderRetirement', 'midRetirement', 'earlyRetirement']);
        }
        return ExpenseCalculator._resolvePhase(phases, ['bonusYears', 'olderRetirement', 'midRetirement']);
    }

    static _calculateTargetGoalContribution({ targetGoal, startBal, yearsRemaining, annualGrowthRate }) {
        const r = annualGrowthRate;
        const projectedExisting = startBal * Math.pow(1 + r, yearsRemaining);
        const netGap = Math.max(0, targetGoal - projectedExisting);
        if (netGap <= 0) return 0;

        const pmt = r > 0 ? (netGap * r) / (Math.pow(1 + r, yearsRemaining) - 1) : netGap / yearsRemaining;
        const requiredAnnual = Math.round(pmt);
        return Math.min(requiredAnnual, Math.max(0, targetGoal - startBal));
    }

    static _calculateFixedContribution({ child, startBal, targetGoal }) {
        const annualContrib = Number(child.annualContribution) || 0;
        if (annualContrib <= 0) return 0;

        if (targetGoal > 0) {
            const remainingToCap = Math.max(0, targetGoal - startBal);
            return Math.min(annualContrib, remainingToCap);
        }
        return annualContrib;
    }

    static _calculateChild529Contribution({ child, year, childAge, currentYear, annualGrowthRate, startBal }) {
        if (childAge >= 18) return 0;

        const effectiveCurrentYear = currentYear || new Date().getFullYear();
        const startYear = Number(child.contributionStartYear) || effectiveCurrentYear;
        const defaultStopYear = (Number(child.yearOfBirth) || effectiveCurrentYear) + 17;
        const stopYear = Number(child.contributionStopYear) || defaultStopYear;

        if (year < startYear || year > stopYear) return 0;

        const mode = child.contributionMode || 'fixed';
        const targetGoal = Number(child.targetCollegeSavingsBalance) || 0;

        if (mode === 'target' && targetGoal > 0) {
            const yearsRemaining = Math.max(1, 18 - childAge);
            return this._calculateTargetGoalContribution({ targetGoal, startBal, yearsRemaining, annualGrowthRate });
        }

        return this._calculateFixedContribution({ child, startBal, targetGoal });
    }

    static _drawCollegeTuition({ child, childAge, inflationMultiplier }) {
        if (childAge < 18 || childAge > 21) {
            return { cost: 0, drawn: 0 };
        }
        let cost = (Number(child.annualCollegeCost) || 0) * inflationMultiplier;
        let drawn = 0;
        if (child.currentCollegeSavingsBalance && child.currentCollegeSavingsBalance > 0) {
            drawn = Math.min(child.currentCollegeSavingsBalance, cost);
            child.currentCollegeSavingsBalance -= drawn;
            cost -= drawn;
        }
        return { cost, drawn };
    }

    static _resolveCollegeGrowthRate(child, assumptions) {
        if (child.expectedReturn !== undefined && child.expectedReturn !== null) {
            return Number(child.expectedReturn) / 100;
        }
        const defaultRate =
            assumptions?.collegeReturnRate !== undefined
                ? assumptions.collegeReturnRate
                : assumptions?.generalReturnRate || 7;
        return defaultRate / 100;
    }

    static _processSingleChildCollegeCost({
        child,
        index,
        year,
        currentYear,
        inflationMultiplier,
        assumptions,
        events
    }) {
        const childAge = year - child.yearOfBirth;
        const childId = child.id || `child_${index}`;
        const childName = child.name || `Child ${index + 1}`;
        const annualGrowthRate = this._resolveCollegeGrowthRate(child, assumptions);

        const startBal = child.currentCollegeSavingsBalance || 0;
        const interest = startBal > 0 ? startBal * annualGrowthRate : 0;
        if (interest > 0) {
            child.currentCollegeSavingsBalance += interest;
        }

        const contribution = this._calculateChild529Contribution({
            child,
            year,
            childAge,
            currentYear,
            annualGrowthRate,
            startBal
        });
        if (contribution > 0) {
            child.currentCollegeSavingsBalance += contribution;
        }

        if (childAge === 18 && !events.find((e) => e.type === 'child_grad' && e.dependentId === childId)) {
            events.push({ year, label: `${childName} turns 18`, type: 'child_grad', dependentId: childId });
        }

        const tuitionResult = this._drawCollegeTuition({ child, childAge, inflationMultiplier });
        const endBal = child.currentCollegeSavingsBalance || 0;

        return {
            childRecord: {
                id: childId,
                name: childName,
                startBalance: startBal,
                contribution,
                interest,
                drawn: tuitionResult.drawn,
                balance: endBal
            },
            collegeCost: tuitionResult.cost,
            contribution,
            interest,
            drawn: tuitionResult.drawn,
            endBal
        };
    }

    static processCollegeCosts({ dependents, year, currentYear, inflationMultiplier, assumptions, snapshot, events }) {
        let collegeCost = 0;
        let total529Balance = 0;
        let total529Interest = 0;
        let total529Drawn = 0;
        let total529Contributed = 0;
        const children529 = [];

        (dependents || []).forEach((child, index) => {
            const res = this._processSingleChildCollegeCost({
                child,
                index,
                year,
                currentYear,
                inflationMultiplier,
                assumptions,
                events
            });
            collegeCost += res.collegeCost;
            total529Contributed += res.contribution;
            total529Interest += res.interest;
            total529Drawn += res.drawn;
            total529Balance += res.endBal;
            children529.push(res.childRecord);
        });

        snapshot.expenses += collegeCost + total529Contributed;
        snapshot.expenseBreakdown.childcare += collegeCost + total529Contributed;
        snapshot.college529 = {
            totalBalance: total529Balance,
            totalInterest: total529Interest,
            totalDrawn: total529Drawn,
            totalContributed: total529Contributed,
            children: children529
        };
    }

    static _sumPersonIncomeField(inc, field) {
        return Number(inc?.s1?.[field] || 0) + Number(inc?.s2?.[field] || 0);
    }

    static _estimateBaselineAcaMagi(snapshot, strategies, assumptions) {
        const customMagi = strategies?.estimatedMagi ?? assumptions?.estimatedMagi;
        if (customMagi !== undefined && customMagi !== null) {
            return Number(customMagi) || 0;
        }
        const inc = snapshot.income;
        const fullSsn = this._sumPersonIncomeField(inc, 'ssn');
        const w2Taxable = this._sumPersonIncomeField(inc, 'w2TaxableGross');
        return Math.max(Number(snapshot.taxDetails?.magi || 0), w2Taxable + fullSsn);
    }

    static _processAcaHealthcare({
        year,
        s1,
        s2,
        dependents,
        strategies,
        assumptions,
        inflationMultiplier,
        monthFraction,
        snapshot
    }) {
        const isAcaEnabled = Boolean(strategies?.acaHealthcareEnabled || assumptions?.acaHealthcareEnabled);
        if (!isAcaEnabled) return;

        const estimatedMagi = this._estimateBaselineAcaMagi(snapshot, strategies, assumptions);
        const acaResult = AcaHealthcareCalculator.calculate({
            year,
            s1,
            s2,
            dependents,
            estimatedMagi,
            inflationMultiplier,
            monthFraction,
            options: { acaCliffEnabled: Boolean(strategies?.acaCliffEnabled || assumptions?.acaCliffEnabled) }
        });
        snapshot.acaHealthcare = acaResult;
        if (acaResult.netPremium > 0) {
            snapshot.expenses += acaResult.netPremium;
            snapshot.expenseBreakdown.healthcare = (snapshot.expenseBreakdown.healthcare || 0) + acaResult.netPremium;
        }
    }

    static calculate({
        year,
        currentYear,
        firstActiveMonth = 1,
        s1,
        s2 = null,
        dependents,
        phases,
        assumptions,
        strategies,
        mortgage,
        snapshot,
        events
    }) {
        const yearsFromStart = year - currentYear;
        const inflationMultiplier = Math.pow(1 + (assumptions?.inflationRate || 0) / 100, yearsFromStart);
        const activeMonths = year === currentYear ? Math.max(1, 12 - firstActiveMonth + 1) : 12;
        const monthFraction = activeMonths / 12;

        // Base living expenses
        const baseMonthly = this.getBaseMonthlyExpense(dependents || [], year, s1, phases || {}, strategies || {});
        const annualBase = (Number(baseMonthly) || 0) * activeMonths * inflationMultiplier;
        snapshot.expenses = annualBase;
        snapshot.expenseBreakdown.base = annualBase;

        // Housing fixed costs & mortgage
        const housingCosts = mortgage.getAnnualFixedCosts(inflationMultiplier) * monthFraction;
        snapshot.expenses += housingCosts;
        snapshot.expenseBreakdown.housing += housingCosts;

        const mortgagePayment = mortgage.getAnnualMortgagePayment() * monthFraction;
        snapshot.expenses += mortgagePayment;
        snapshot.expenseBreakdown.mortgage += mortgagePayment;

        if (mortgage.enabled && mortgage.currentBalance > 0) {
            mortgage.amortize(activeMonths);
            if (mortgage.currentBalance <= 0) {
                events.push({ year, label: 'Mortgage Paid Off', type: 'mortgage_payoff', color: '#00b894' });
            }
        }

        // College 529 & Tuition
        this.processCollegeCosts({ dependents, year, currentYear, inflationMultiplier, assumptions, snapshot, events });

        // Pre-65 ACA Healthcare Bridge (when enabled)
        this._processAcaHealthcare({
            year,
            s1,
            s2,
            dependents,
            strategies,
            assumptions,
            inflationMultiplier,
            monthFraction,
            snapshot
        });
    }
}
