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
        const s1Multiplier = s1.getSocialSecurityMultiplier(s1.socialSecurityStartAge);
        const s2Multiplier = s2.getSocialSecurityMultiplier(s2.socialSecurityStartAge);

        const s1BaseBenefit = (s1.socialSecurityAnnualBenefit || 0) * s1Multiplier;
        const s2BaseBenefit = (s2.socialSecurityAnnualBenefit || 0) * s2Multiplier;

        const s1Alive = s1.getAge(year) <= s1.lifeExpectancy;
        const s2Alive = s2.getAge(year) <= s2.lifeExpectancy;
        const s1Eligible = s1.getAge(year) >= s1.socialSecurityStartAge;
        const s2Eligible = s2.getAge(year) >= s2.socialSecurityStartAge;

        let s1Ssn = 0;
        let s2Ssn = 0;

        const s1FirstYear = s1.getAge(year) === s1.socialSecurityStartAge;
        const s2FirstYear = s2.getAge(year) === s2.socialSecurityStartAge;
        const s1YearFraction = s1FirstYear
            ? Math.max(0, (12 - (Number(s1.socialSecurityStartMonth) || 1) + 1) / 12)
            : 1;
        const s2YearFraction = s2FirstYear
            ? Math.max(0, (12 - (Number(s2.socialSecurityStartMonth) || 1) + 1) / 12)
            : 1;

        if (s1Alive && s2Alive) {
            // Both spouses alive: each receives their own benefit upon reaching claiming age
            if (s1Eligible) s1Ssn = s1BaseBenefit * inflationMultiplier * partialYearMultiplier * s1YearFraction;
            if (s2Eligible) s2Ssn = s2BaseBenefit * inflationMultiplier * partialYearMultiplier * s2YearFraction;
        } else if (s1Alive && !s2Alive) {
            // Spouse 1 survives: receives the higher of own benefit or deceased spouse benefit
            if (s1Eligible || s2Eligible) {
                const survivorBenefit = Math.max(s1BaseBenefit, s2BaseBenefit);
                s1Ssn = survivorBenefit * inflationMultiplier * partialYearMultiplier * s1YearFraction;
            }
        } else if (!s1Alive && s2Alive) {
            // Spouse 2 survives: receives the higher of own benefit or deceased spouse benefit
            if (s1Eligible || s2Eligible) {
                const survivorBenefit = Math.max(s1BaseBenefit, s2BaseBenefit);
                s2Ssn = survivorBenefit * inflationMultiplier * partialYearMultiplier * s2YearFraction;
            }
        }

        snapshot.income.s1.ssn = s1Ssn;
        snapshot.income.s2.ssn = s2Ssn;
        const totalSsn = s1Ssn + s2Ssn;

        if (totalSsn <= 0) return 0;

        // Statutory IRS Provisional Income formula:
        // Provisional Income = Other Income + 50% of Social Security
        // For MFJ: 0% under $32k, 50% between $32k-$44k, up to 85% over $44k
        // For Single: 0% under $25k, 50% between $25k-$34k, up to 85% over $34k
        if (otherTaxableIncome !== null && otherTaxableIncome !== undefined) {
            return SocialSecurityCalculator.calculateTaxableSsn({
                otherTaxableIncome,
                totalSsn,
                filingStatus
            });
        }

        // Standard high-earner fallback if other income is not passed directly
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
