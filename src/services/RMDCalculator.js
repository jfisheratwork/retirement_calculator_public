import { getRmdPercentage } from './tax.js';

/**
 * RMDCalculator.js
 * 
 * Domain logic for calculating IRS Mandatory Drawdowns, including Required Minimum Distributions (RMDs)
 * and Rule 72(t) Substantially Equal Periodic Payments (SEPP).
 */
export class RMDCalculator {
    constructor(s1 = null, s2 = null) {
        this.s1 = s1;
        this.s2 = s2;
    }

    getRmdStartAge(spouse) {
        return RMDCalculator.getRmdStartAge(spouse || this.s1);
    }

    static getRmdStartAge(spouse) {
        const birthYear = spouse?.birthYear || spouse?.yearOfBirth;
        return (birthYear && birthYear >= 1960) ? 75 : 73;
    }

    calculateRmd(year) {
        const dummySnapshot = {
            events: [],
            recordDrawdown: () => {}
        };
        const s1 = this.s1;
        const s2 = this.s2 || { getAge: () => 0, getTotalPreTaxBalance: () => 0, accounts: [] };
        const mandatoryDraws = RMDCalculator.calculate({ year, s1, s2, snapshot: dummySnapshot });

        const age1 = s1 ? s1.getAge(year) : 0;
        const birthYear1 = s1?.birthYear || s1?.yearOfBirth;
        const p1Rmd = (s1 && age1 >= RMDCalculator.getRmdStartAge(s1))
            ? s1.getTotalPreTaxBalance() * getRmdPercentage(age1, birthYear1)
            : 0;

        const age2 = this.s2 ? this.s2.getAge(year) : 0;
        const birthYear2 = this.s2?.birthYear || this.s2?.yearOfBirth;
        const p2Rmd = (this.s2 && age2 >= RMDCalculator.getRmdStartAge(this.s2))
            ? this.s2.getTotalPreTaxBalance() * getRmdPercentage(age2, birthYear2)
            : 0;

        return {
            totalRmd: mandatoryDraws,
            person1Rmd: p1Rmd,
            person2Rmd: p2Rmd,
            breakdown: dummySnapshot.events
        };
    }

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

        [s1, s2].filter(Boolean).forEach(spouse => {
            const age = typeof spouse.getAge === 'function' ? spouse.getAge(year) : 0;
            const totalPreTax = typeof spouse.getTotalPreTaxBalance === 'function' ? spouse.getTotalPreTaxBalance() : 0;

            // 2. Required Minimum Distributions (RMD) - SECURE Act 2.0 (Age 75 for born >= 1960, Age 73 for born < 1960)
            const birthYear = spouse.birthYear || spouse.yearOfBirth;
            const rmdStartAge = RMDCalculator.getRmdStartAge(spouse);
            if (age >= rmdStartAge && totalPreTax > 0) {
                const rmdPct = getRmdPercentage(age, birthYear);
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
