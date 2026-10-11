/**
 * Manages both Standard and Advanced Dynamic Roth Conversions
 */

export class RothConversionManager {
    /**
     * Determine which spouse's IRA should be converted first (later retirement or older)
     */
    static getSpousePriority(s1, s2, year) {
        if (s1.targetRetirementAge > s2.targetRetirementAge) return { first: s1, second: s2 };
        if (s2.targetRetirementAge > s1.targetRetirementAge) return { first: s2, second: s1 };
        if (s1.getAge(year) >= s2.getAge(year)) return { first: s1, second: s2 };
        return { first: s2, second: s1 };
    }

    static _resolveTargetAgi(currentAgi, currentTaxYearData, advRoth) {
        let targetAgi = 0;
        if (!advRoth.targetBracket) {
            for (const b of currentTaxYearData.brackets) {
                targetAgi = b.upTo;
                if (currentAgi <= b.upTo) break;
            }
        } else {
            const targetBracketVal = Number(advRoth.targetBracket) / 100;
            const b = currentTaxYearData.brackets.find((br) => Math.abs(br.rate - targetBracketVal) < 0.01);
            targetAgi = b ? b.upTo : Infinity;
        }
        return targetAgi === Infinity ? 999999999 : targetAgi;
    }

    static _applyIrmaaCap(maxAllowed, currentAgi, currentMagi, currentTaxYearData, advRoth) {
        const avoidIrmaa = advRoth.avoidIrmaaCliffs !== false;
        if (!avoidIrmaa || !currentTaxYearData.irmaaBrackets) return maxAllowed;

        const nextBracket = currentTaxYearData.irmaaBrackets.find((irmaa) => irmaa.upTo > currentMagi);
        if (!nextBracket || nextBracket.upTo === Infinity) return maxAllowed;

        const irmaaMaxAgi = Math.max(0, nextBracket.upTo - currentTaxYearData.standardDeduction);
        const irmaaAllowed = Math.max(0, irmaaMaxAgi - currentAgi);
        return Math.min(maxAllowed, Math.max(0, irmaaAllowed - 1));
    }

    /**
     * Calculate taxable room left under bracket ceiling
     */
    static calculateBracketRoom({ taxableIncome, currentTaxYearData, advRoth, inflationMultiplier }) {
        const currentAgi = Math.max(0, taxableIncome - currentTaxYearData.standardDeduction);
        const targetAgi = this._resolveTargetAgi(currentAgi, currentTaxYearData, advRoth);

        const marginVal = advRoth.safetyMargin !== undefined ? Number(advRoth.safetyMargin) : 10000;
        const safetyMargin = marginVal * inflationMultiplier;
        const minConversion = (Number(advRoth.minConversion) || 0) * inflationMultiplier;
        const room = Math.max(minConversion, Math.max(0, targetAgi - currentAgi - safetyMargin));

        const maxBracketVal = Number(advRoth.maxBracket || '24') / 100;
        const maxB = currentTaxYearData.brackets.find((br) => Math.abs(br.rate - maxBracketVal) < 0.01);
        const maxAgi = maxB ? maxB.upTo : 999999999;

        const maxAllowed = this._applyIrmaaCap(
            Math.max(0, maxAgi - currentAgi),
            currentAgi,
            taxableIncome,
            currentTaxYearData,
            advRoth
        );

        return Math.min(room, maxAllowed);
    }

    /**
     * Execute conversion from a single spouse's pre-tax accounts (Standard IRA -> 401k -> 403b)
     */
    static convertPreTax(spouse, amountNeeded, year, snapshot) {
        if (amountNeeded <= 0) return 0;
        let remaining = amountNeeded;
        let totalConverted = 0;

        const preTaxTypes = ['standardIra', 'traditional401k', 'trad403b'];
        for (const type of preTaxTypes) {
            if (remaining <= 0) break;
            const matchingAccounts = (spouse.accounts || []).filter((a) => a.type === type);
            for (const acc of matchingAccounts) {
                if (remaining <= 0) break;
                if (acc && acc.balance > 0) {
                    const pull = Math.min(acc.balance, remaining);
                    acc.balance -= pull;
                    acc.yearConversionsOut = (acc.yearConversionsOut || 0) + pull;
                    acc.yearWithdrawals = (acc.yearWithdrawals || 0) + pull;
                    spouse.accounts.rothIra.addConversion(pull, year);
                    remaining -= pull;
                    totalConverted += pull;
                }
            }
        }

        if (totalConverted > 0) {
            snapshot.income[spouse.key].rothConversion =
                (snapshot.income[spouse.key].rothConversion || 0) + totalConverted;
        }
        return totalConverted;
    }

    /**
     * Advanced dynamic Roth conversion process
     */
    static processAdvanced({ s1, s2, year, currentYear, taxableIncome, assumptions, advRoth, taxTables, snapshot }) {
        let advStartYear = currentYear;
        if (advRoth?.startDate && typeof advRoth.startDate === 'string') {
            advStartYear = parseInt(advRoth.startDate.split('-')[0], 10) || currentYear;
        } else if (advRoth?.startYear) {
            advStartYear = Number(advRoth.startYear);
        }
        const advDuration = Number(advRoth?.durationYears) || 10;
        if (year < advStartYear || year >= advStartYear + advDuration) return 0;

        const yearsFromStart = year - currentYear;
        const inflationMultiplier = Math.pow(1 + Number(assumptions.inflationRate || 0) / 100, yearsFromStart);
        const currentTaxYearData = taxTables[yearsFromStart] || taxTables[taxTables.length - 1];

        const room = this.calculateBracketRoom({ taxableIncome, currentTaxYearData, advRoth, inflationMultiplier });
        if (room <= 0) return 0;

        const { first, second } = this.getSpousePriority(s1, s2, year);
        const targetFirst = room / 2;
        let targetSecond = room / 2;

        const pulledFirst = this.convertPreTax(first, targetFirst, year, snapshot);
        targetSecond += targetFirst - pulledFirst; // Spillover shortfall
        const pulledSecond = this.convertPreTax(second, targetSecond, year, snapshot);

        return pulledFirst + pulledSecond;
    }

    static _findStandardConversionSource(spouse, sourceKey) {
        const accounts = spouse.accounts || [];
        return (
            spouse.getAccount?.(sourceKey) ||
            accounts.find((a) => a.id === sourceKey || a.name === sourceKey || a.type === sourceKey) ||
            accounts.find((a) => a.type === 'standardIra') ||
            spouse.accounts.standardIra
        );
    }

    /**
     * Standard fixed Roth conversion process
     */
    static processStandard({ spouse, year, yearsFromStart, inflationMultiplier, snapshot }) {
        const conv = spouse.rothConversion;
        if (!conv || !conv.enabled || Number(conv.amountPerYear) <= 0) return 0;
        const currentYear = year - yearsFromStart;
        if (!conv.isActiveInYear(year, currentYear)) return 0;

        const sourceAcc = this._findStandardConversionSource(spouse, conv.sourceAccount);
        if (!sourceAcc || sourceAcc.balance <= 0) return 0;

        const inflatedAmount = Number(conv.amountPerYear) * inflationMultiplier;
        const amount = Math.min(sourceAcc.balance, inflatedAmount);

        if (amount > 0) {
            sourceAcc.balance -= amount;
            sourceAcc.yearConversionsOut = (sourceAcc.yearConversionsOut || 0) + amount;
            sourceAcc.yearWithdrawals = (sourceAcc.yearWithdrawals || 0) + amount;
            spouse.accounts.rothIra.addConversion(amount, year);
            snapshot.income[spouse.key].rothConversion = (snapshot.income[spouse.key].rothConversion || 0) + amount;
            return amount;
        }
        return 0;
    }
}
