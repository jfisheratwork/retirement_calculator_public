/**
 * Handles phase-based household expenses, housing, mortgage, college 529s, and healthcare
 */
export class ExpenseCalculator {
    static getBaseMonthlyExpense(dependents, year, s1, phases, strategies = {}) {
        if (phases?.phase1?.monthlyExpense !== undefined) {
            return Number(phases.phase1.monthlyExpense) || 0;
        }

        let hasPreTeens = false;
        let hasTeenagers = false;
        let hasCollege = false;

        for (const child of (dependents || [])) {
            const childAge = year - child.yearOfBirth;
            if (childAge >= 0 && childAge < 13) hasPreTeens = true;
            else if (childAge >= 13 && childAge <= 17) hasTeenagers = true;
            else if (childAge >= 18 && childAge <= 22) hasCollege = true;
        }

        if (hasTeenagers) {
            return ExpenseCalculator._resolvePhase(phases, ['teenagers', 'preTeens', 'college', 'earlyRetirement', 'preRetirementWithKids']);
        }
        if (hasPreTeens) {
            return ExpenseCalculator._resolvePhase(phases, ['preTeens', 'teenagers', 'college', 'earlyRetirement', 'preRetirementWithKids']);
        }
        if (hasCollege) {
            return ExpenseCalculator._resolvePhase(phases, ['college', 'teenagers', 'preRetirementNoKids', 'earlyRetirement']);
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

    static _getEmptyNesterExpense(year, s1, phases, strategies) {
        const healthOffset = Number(strategies?.healthAgingOffset || 0);
        const retAge = s1?.targetRetirementAge || 65;
        const currentAge = (s1 ? s1.getAge(year) : 65) + healthOffset;

        if (currentAge < retAge) {
            return ExpenseCalculator._resolvePhase(phases, ['preRetirementNoKids', 'earlyRetirement', 'college', 'preRetirementWithKids']);
        }

        const yearsRetired = currentAge - retAge;
        const isFrontLoaded = strategies?.decumulationMode === 'front_loaded' || Number(strategies?.gogoMultiplier || 1.0) > 1.0;
        const gogo = isFrontLoaded ? Number(strategies?.gogoMultiplier || 1.25) : 1.0;

        if (yearsRetired < 5) {
            const baseAmt = ExpenseCalculator._resolvePhase(phases, ['earlyRetirement', 'preRetirementNoKids', 'midRetirement']);
            return baseAmt * gogo;
        }
        if (yearsRetired < 10) {
            const baseAmt = ExpenseCalculator._resolvePhase(phases, ['midRetirement', 'earlyRetirement', 'olderRetirement']);
            const midGogo = isFrontLoaded ? (1 + ((gogo - 1) / 2)) : 1.0;
            return baseAmt * midGogo;
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

        const pmt = r > 0
            ? (netGap * r) / (Math.pow(1 + r, yearsRemaining) - 1)
            : (netGap / yearsRemaining);
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

    static _processSingleChildCollegeCost({ child, index, year, currentYear, inflationMultiplier, assumptions, events }) {
        const childAge = year - child.yearOfBirth;
        const childId = child.id || `child_${index}`;
        const childName = child.name || `Child ${index + 1}`;
        const annualGrowthRate = (child.expectedReturn !== undefined && child.expectedReturn !== null)
            ? (Number(child.expectedReturn) / 100)
            : ((assumptions?.collegeReturnRate !== undefined ? assumptions.collegeReturnRate : (assumptions?.generalReturnRate || 7)) / 100);

        const startBal = child.currentCollegeSavingsBalance || 0;
        let interest = 0;

        if (startBal > 0) {
            interest = startBal * annualGrowthRate;
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

        if (childAge === 18 && !events.find(e => e.type === 'child_grad' && e.dependentId === childId)) {
            events.push({ year, label: `${childName} turns 18`, type: 'child_grad', dependentId: childId });
        }

        const tuitionResult = this._drawCollegeTuition({ child, childAge, inflationMultiplier });
        const endBal = child.currentCollegeSavingsBalance || 0;

        return {
            childRecord: { id: childId, name: childName, startBalance: startBal, contribution, interest, drawn: tuitionResult.drawn, balance: endBal },
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

        snapshot.expenses += (collegeCost + total529Contributed);
        snapshot.expenseBreakdown.childcare += (collegeCost + total529Contributed);
        snapshot.college529 = {
            totalBalance: total529Balance,
            totalInterest: total529Interest,
            totalDrawn: total529Drawn,
            totalContributed: total529Contributed,
            children: children529
        };
    }

    static calculate({ year, currentYear, firstActiveMonth = 1, s1, dependents, phases, assumptions, strategies, mortgage, snapshot, events }) {
        const yearsFromStart = year - currentYear;
        const inflationMultiplier = Math.pow(1 + ((assumptions?.inflationRate || 0) / 100), yearsFromStart);
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
    }
}

