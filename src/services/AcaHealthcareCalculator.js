const MEDICARE_ELIGIBILITY_AGE = 65;
const DEPENDENT_COVERAGE_MAX_AGE = 26;
const BASE_ADULT_BENCHMARK_AGE = 50;
const BASE_ANNUAL_ADULT_PREMIUM = 8400;
const ADULT_AGE_SCALING_RATE = 0.03;
const BASE_ANNUAL_CHILD_PREMIUM = 3000;
const FPL_BASE_SINGLE = 15650;
const FPL_PER_ADDITIONAL_MEMBER = 5500;

const FPL_TIER_ZERO_CONTRIBUTION = 1.5;
const FPL_TIER_TWO_PERCENT = 2.0;
const FPL_TIER_FOUR_PERCENT = 2.5;
const FPL_TIER_SIX_PERCENT = 3.0;
const FPL_TIER_MAX_CAP = 4.0;

const RATE_ZERO = 0.0;
const RATE_TWO_PERCENT = 0.02;
const RATE_FOUR_PERCENT = 0.04;
const RATE_SIX_PERCENT = 0.06;
const RATE_ENHANCED_CAP = 0.085;

function interpolateLinear(value, lowX, highX, lowY, highY) {
    const ratio = (value - lowX) / (highX - lowX);
    return lowY + ratio * (highY - lowY);
}

/**
 * Models pre-65 Affordable Care Act (ACA) Health Insurance Marketplace benchmark Silver plan
 * premiums and IRC § 36B Premium Tax Credit (PTC) subsidies for early retirees prior to Medicare (age 65).
 */
export class AcaHealthcareCalculator {
    /**
     * Calculates the Federal Poverty Level (FPL) for a given household size and inflation multiplier.
     * @param {number} householdSize
     * @param {number} [inflationMultiplier=1]
     * @returns {number}
     */
    static getFederalPovertyLevel(householdSize, inflationMultiplier = 1) {
        const size = Math.max(1, Math.floor(Number(householdSize) || 1));
        const baseFpl = FPL_BASE_SINGLE + FPL_PER_ADDITIONAL_MEMBER * (size - 1);
        return baseFpl * inflationMultiplier;
    }

    /**
     * Calculates the IRC § 36B Applicable Percentage cap based on MAGI-to-FPL ratio.
     * Returns null when R_FPL > 4.0 and the statutory 400% FPL cliff is enabled.
     * @param {number} fplRatio
     * @param {Object} [options={}]
     * @param {boolean} [options.acaCliffEnabled=false]
     * @returns {number|null}
     */
    static getApplicablePercentage(fplRatio, options = {}) {
        const ratio = Math.max(0, Number(fplRatio) || 0);
        if (ratio <= FPL_TIER_ZERO_CONTRIBUTION) return RATE_ZERO;
        if (ratio <= FPL_TIER_TWO_PERCENT) {
            return interpolateLinear(
                ratio,
                FPL_TIER_ZERO_CONTRIBUTION,
                FPL_TIER_TWO_PERCENT,
                RATE_ZERO,
                RATE_TWO_PERCENT
            );
        }
        if (ratio <= FPL_TIER_FOUR_PERCENT) {
            return interpolateLinear(
                ratio,
                FPL_TIER_TWO_PERCENT,
                FPL_TIER_FOUR_PERCENT,
                RATE_TWO_PERCENT,
                RATE_FOUR_PERCENT
            );
        }
        if (ratio <= FPL_TIER_SIX_PERCENT) {
            return interpolateLinear(
                ratio,
                FPL_TIER_FOUR_PERCENT,
                FPL_TIER_SIX_PERCENT,
                RATE_FOUR_PERCENT,
                RATE_SIX_PERCENT
            );
        }
        if (ratio <= FPL_TIER_MAX_CAP) {
            return interpolateLinear(
                ratio,
                FPL_TIER_SIX_PERCENT,
                FPL_TIER_MAX_CAP,
                RATE_SIX_PERCENT,
                RATE_ENHANCED_CAP
            );
        }
        return options.acaCliffEnabled ? null : RATE_ENHANCED_CAP;
    }

    static _getAdultAnnualPremium(age, inflationMultiplier) {
        const ageDiff = Math.max(-20, Math.min(14, age - BASE_ADULT_BENCHMARK_AGE));
        const ageFactor = Math.max(0.5, 1 + ageDiff * ADULT_AGE_SCALING_RATE);
        return BASE_ANNUAL_ADULT_PREMIUM * ageFactor * inflationMultiplier;
    }

    static _evaluateCoveredMembers({ year, s1, s2, dependents }) {
        const coveredAdults = [];
        let hasEmployerCoverage = false;
        let adultCount = 0;

        for (const spouse of [s1, s2]) {
            if (!spouse || !spouse.name) continue;
            const age = spouse.getAge(year);
            if (age > spouse.lifeExpectancy) continue;
            adultCount += 1;
            const retired = spouse.isRetired(year, 1);
            if (!retired) {
                hasEmployerCoverage = true;
            } else if (age < MEDICARE_ELIGIBILITY_AGE) {
                coveredAdults.push(age);
            }
        }

        let dependentCount = 0;
        for (const child of dependents || []) {
            const childAge = year - Number(child.yearOfBirth);
            if (childAge >= 0 && childAge < DEPENDENT_COVERAGE_MAX_AGE) {
                dependentCount += 1;
            }
        }

        return {
            coveredAdults,
            hasEmployerCoverage,
            dependentCount,
            householdSize: Math.max(1, adultCount + dependentCount)
        };
    }

    /**
     * Calculates annual benchmark Silver premium, IRC § 36B subsidy, and net out-of-pocket ACA cost.
     * @param {Object} params
     * @returns {Object} { eligible, benchmarkPremium, subsidy, netPremium, fpl, fplRatio, applicablePercentage }
     */
    static calculate({
        year,
        s1,
        s2 = null,
        dependents = [],
        estimatedMagi = 0,
        inflationMultiplier = 1,
        monthFraction = 1,
        options = {}
    }) {
        const { coveredAdults, hasEmployerCoverage, dependentCount, householdSize } = this._evaluateCoveredMembers({
            year,
            s1,
            s2,
            dependents
        });

        if (hasEmployerCoverage || coveredAdults.length === 0) {
            return {
                eligible: false,
                benchmarkPremium: 0,
                subsidy: 0,
                netPremium: 0,
                fpl: this.getFederalPovertyLevel(householdSize, inflationMultiplier),
                fplRatio: 0,
                applicablePercentage: 0
            };
        }

        let fullYearBenchmark = 0;
        for (const age of coveredAdults) {
            fullYearBenchmark += this._getAdultAnnualPremium(age, inflationMultiplier);
        }
        fullYearBenchmark += dependentCount * BASE_ANNUAL_CHILD_PREMIUM * inflationMultiplier;

        const benchmarkPremium = fullYearBenchmark * monthFraction;
        const fpl = this.getFederalPovertyLevel(householdSize, inflationMultiplier);
        const magi = Math.max(0, Number(estimatedMagi) || 0);
        const fplRatio = fpl > 0 ? magi / fpl : 0;
        const applicablePercentage = this.getApplicablePercentage(fplRatio, options);

        if (applicablePercentage === null) {
            return {
                eligible: true,
                benchmarkPremium,
                subsidy: 0,
                netPremium: benchmarkPremium,
                fpl,
                fplRatio,
                applicablePercentage: null
            };
        }

        const maxContribution = applicablePercentage * magi * monthFraction;
        const subsidy = Math.max(0, benchmarkPremium - maxContribution);
        const netPremium = Math.max(0, benchmarkPremium - subsidy);

        return {
            eligible: true,
            benchmarkPremium,
            subsidy,
            netPremium,
            fpl,
            fplRatio,
            applicablePercentage
        };
    }
}
