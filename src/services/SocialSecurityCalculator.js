/**
 * SocialSecurityCalculator.js
 *
 * Domain logic for calculating Social Security benefits, including actuarial
 * multipliers, spousal survivor benefits, and inflation scaling.
 */
export class SocialSecurityCalculator {
    /**
     * Calculates and assigns Social Security benefits to the given snapshot for a specific year.
     *
     * @param {Object} params
     * @param {number} params.year - Current simulation year.
     * @param {Person} params.s1 - Primary spouse.
     * @param {Person} params.s2 - Secondary spouse.
     * @param {YearlySnapshot} params.snapshot - The snapshot object to update.
     * @param {number} params.inflationMultiplier - Cumulative inflation multiplier.
     * @param {number} params.partialYearMultiplier - Multiplier for partial years.
     * @returns {number} Total taxable Social Security benefit for the year (85% of total).
     */
    static _getClaimingYearFraction(person, year) {
        if (person.getAge(year) !== person.socialSecurityStartAge) return 1;
        const startMonth = Number(person.socialSecurityStartMonth) || 1;
        return Math.max(0, (12 - startMonth + 1) / 12);
    }

    static _calculateSpouseSsnAmounts({ year, s1, s2, inflationMultiplier, partialYearMultiplier }) {
        const s1Base =
            (s1.socialSecurityAnnualBenefit || 0) * s1.getSocialSecurityMultiplier(s1.socialSecurityStartAge);
        const s2Base =
            (s2.socialSecurityAnnualBenefit || 0) * s2.getSocialSecurityMultiplier(s2.socialSecurityStartAge);

        const s1Alive = s1.getAge(year) <= s1.lifeExpectancy;
        const s2Alive = s2.getAge(year) <= s2.lifeExpectancy;
        const s1Eligible = s1.getAge(year) >= s1.socialSecurityStartAge;
        const s2Eligible = s2.getAge(year) >= s2.socialSecurityStartAge;

        const scale1 = inflationMultiplier * partialYearMultiplier * this._getClaimingYearFraction(s1, year);
        const scale2 = inflationMultiplier * partialYearMultiplier * this._getClaimingYearFraction(s2, year);

        if (s1Alive && s2Alive) {
            return {
                s1Ssn: s1Eligible ? s1Base * scale1 : 0,
                s2Ssn: s2Eligible ? s2Base * scale2 : 0
            };
        }

        const anyEligible = s1Eligible || s2Eligible;
        const survivorBenefit = Math.max(s1Base, s2Base);
        if (s1Alive && !s2Alive) {
            return { s1Ssn: anyEligible ? survivorBenefit * scale1 : 0, s2Ssn: 0 };
        }
        if (!s1Alive && s2Alive) {
            return { s1Ssn: 0, s2Ssn: anyEligible ? survivorBenefit * scale2 : 0 };
        }
        return { s1Ssn: 0, s2Ssn: 0 };
    }

    static calculate({
        year,
        s1,
        s2,
        snapshot,
        inflationMultiplier = 1,
        partialYearMultiplier = 1,
        otherTaxableIncome = null,
        filingStatus = 'mfj'
    }) {
        const { s1Ssn, s2Ssn } = this._calculateSpouseSsnAmounts({
            year,
            s1,
            s2,
            inflationMultiplier,
            partialYearMultiplier
        });

        snapshot.income.s1.ssn = s1Ssn;
        snapshot.income.s2.ssn = s2Ssn;
        const totalSsn = s1Ssn + s2Ssn;

        if (totalSsn <= 0) return 0;

        if (otherTaxableIncome !== null && otherTaxableIncome !== undefined) {
            return SocialSecurityCalculator.calculateTaxableSsn({
                otherTaxableIncome,
                totalSsn,
                filingStatus
            });
        }

        return totalSsn * 0.85;
    }

    /**
     * Calculates the taxable portion of Social Security benefits using the statutory IRS provisional income tiers.
     * @param {Object} params
     * @param {number} params.otherTaxableIncome - Total non-Social Security taxable income
     * @param {number} params.totalSsn - Total Social Security benefits received
     * @param {string} [params.filingStatus='mfj'] - 'mfj' or 'single'
     * @returns {number} Taxable portion of Social Security
     */
    static calculateTaxableSsn({ otherTaxableIncome, totalSsn, filingStatus = 'mfj' }) {
        if (totalSsn <= 0) return 0;
        const provisionalIncome = Math.max(0, otherTaxableIncome) + 0.5 * totalSsn;

        const isSingle = filingStatus === 'single';
        const baseThreshold = isSingle ? 25000 : 32000;
        const topThreshold = isSingle ? 34000 : 44000;
        const tier1Cap = isSingle ? 4500 : 6000;

        if (provisionalIncome <= baseThreshold) {
            return 0;
        }

        if (provisionalIncome <= topThreshold) {
            return Math.min(0.5 * totalSsn, 0.5 * (provisionalIncome - baseThreshold));
        }

        const tier1 = Math.min(tier1Cap, 0.5 * totalSsn);
        const tier2 = 0.85 * (provisionalIncome - topThreshold);
        return Math.min(0.85 * totalSsn, tier1 + tier2);
    }
}
