import { getRmdPercentage } from './tax.js';

/**
 * RMDCalculator.js
 * 
 * Domain logic for calculating IRS Mandatory Drawdowns, including Required Minimum Distributions (RMDs)
 * and Rule 72(t) Substantially Equal Periodic Payments (SEPP).
 */
export class RMDCalculator {
    /**
     * Calculates mandatory drawdowns for a given year.
     * 
     * @param {Object} params
     * @param {number} params.year - Current simulation year.
     * @param {number} params.currentYear - The base start year of the simulation.
     * @param {Person} params.s1 - Primary spouse.
     * @param {Person} params.s2 - Secondary spouse.
     * @param {Object} params.strategies - Selected financial strategies.
     * @param {Object} params.assumptions - Global assumptions (inflation rate, etc).
     * @param {YearlySnapshot} params.snapshot - The current snapshot to record events and income.
     * @returns {number} The total taxable mandatory drawdowns taken.
     */
    static calculate({ year, s1, s2, snapshot }) {
        let mandatoryDraws = 0;

        [s1, s2].forEach(spouse => {
            const age = spouse.getAge(year);
            const totalPreTax = spouse.getTotalPreTaxBalance();


            // 2. Required Minimum Distributions (RMD) - SECURE Act 2.0 (Age 75 for born >= 1960, Age 73 for born < 1960)
            const rmdStartAge = (spouse.yearOfBirth && spouse.yearOfBirth >= 1960) ? 75 : 73;
            if (age >= rmdStartAge && totalPreTax > 0) {
                const rmdPct = getRmdPercentage(age, spouse.yearOfBirth);
                const rmdAmount = totalPreTax * rmdPct;
                let drawn = 0;
                spouse.accounts.filter(a => ['trad403b', 'traditional401k', 'standardIra'].includes(a.type)).forEach(acc => {
                    if (drawn < rmdAmount && acc.balance > 0) {
                        const need = rmdAmount - drawn;
                        const d = acc.withdraw(need, age, true, snapshot.events, `${spouse.name} RMD`);
                        drawn += d;
                        snapshot.recordDrawdown(spouse.key, acc.type, d);
                    }
                });
                mandatoryDraws += drawn;
            }
        });

        return mandatoryDraws;
    }

}
