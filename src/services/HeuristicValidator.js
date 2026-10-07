/**
 * Service to validate financial assumptions against historical US economic benchmarks
 * and generate real-time heuristic skew warnings.
 */
export class HeuristicValidator {
    /**
     * Validates Inflation Rate
     * Benchmark: 50-year US CPI average is ~2.5% - 3.2%
     */
    static validateInflation(rate) {
        const val = Number(rate);
        if (isNaN(val)) return null;

        if (val < 1.5) {
            return {
                severity: 'warning',
                message: `⚠️ Low Inflation (${val}%): Below historical US baseline (2.5%–3.2%). This may unrealistically underestimate future cost of living.`
            };
        }
        if (val > 4.5) {
            return {
                severity: 'warning',
                message: `⚠️ High Inflation (${val}%): Exceeds historical baseline (2.5%–3.2%). Over 20+ years, this will aggressively inflate future living expenses.`
            };
        }
        return null;
    }

    /**
     * Validates Portfolio Market Return Rate (Securities)
     * Benchmark: S&P 500 long-term nominal average is ~7% - 10% (5% - 7% real)
     */
    static validateMarketReturn(rate) {
        const val = Number(rate);
        if (isNaN(val)) return null;

        if (val > 10.0) {
            return {
                severity: 'danger',
                message: `⚠️ Unrealistic Return (${val}%): Expecting sustained >10% annual nominal compound growth exceeds long-term real portfolio averages and creates a false sense of security.`
            };
        }
        if (val < 3.0) {
            return {
                severity: 'warning',
                message: `⚠️ Low Return (${val}%): Below typical inflation-beating equity returns. Consider whether this reflects an all-cash portfolio.`
            };
        }
        return null;
    }

    /**
     * Validates Expected W2 Annual Raise
     * Benchmark: Corporate annual merit raises typically range from 2.0% to 3.5%
     */
    static validateWageGrowth(rate) {
        const val = Number(rate);
        if (isNaN(val)) return null;

        if (val > 5.0) {
            return {
                severity: 'warning',
                message: `⚠️ High Wage Growth (${val}%): Exceeds standard corporate annual merit bands (2%–3.5%). Over decades, this heavily multiplies final earnings.`
            };
        }
        return null;
    }

    /**
     * Validates Real Estate Annual Appreciation
     * Benchmark: Case-Shiller national long-term average is ~3.0% - 4.5%
     */
    static validateHomeAppreciation(rate) {
        const val = Number(rate);
        if (isNaN(val)) return null;

        if (val > 6.0) {
            return {
                severity: 'warning',
                message: `⚠️ High Property Growth (${val}%): Exceeds long-term national real estate appreciation (3%–4.5%). May overestimate future home equity.`
            };
        }
        return null;
    }

    /**
     * Validates 72(t) SEPP Start Age
     * Warning: Starting at >= 56 locks you into rigid distributions past age 59.5
     */
    static validate72tAge(age) {
        const val = Number(age);
        if (isNaN(val)) return null;

        if (val >= 56 && val < 59.5) {
            const unlockAge = val + 5;
            return {
                severity: 'warning',
                message: `⚠️ Inefficient 72(t) Horizon: Starting at age ${val} requires you to maintain rigid fixed distributions for 5 full years until age ${unlockAge}, locking you in past age 59.5 when penalty-free access would otherwise be unlocked!`
            };
        }
        return null;
    }
}
