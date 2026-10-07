/**
 * ContributionCalculator.js
 * 
 * Domain logic for calculating spouse W2 contributions, pre-tax deductions, 
 * post-tax deductions, and employer matching logic.
 */
export class ContributionCalculator {
    /**
     * Processes contributions and employer matches for a single spouse based on their W2 Gross income.
     * 
     * @param {Object} params
     * @param {Person} params.spouse - The person making contributions.
     * @param {number} params.w2Gross - The person's gross W2 income for the year.
     * @param {number} params.year - The current simulation year.
     * @returns {Object} { preTaxDeductions, postTaxDeductions, totalEmployerMatch }
     */
    static calculate({ spouse, w2Gross, jobs, year }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        let totalEmployerMatch = 0;

        if (w2Gross <= 0) return { preTaxDeductions, postTaxDeductions, totalEmployerMatch };

        // Process employer-sponsored accounts (401k/403b) linked to active jobs
        if (jobs) {
            jobs.forEach(job => {
                if (job.linked401kAccountId && job.total > 0) {
                    const acc = spouse.getAccount(job.linked401kAccountId);
                    if (acc && (acc.type === 'traditional401k' || acc.type === 'trad403b')) {
                        const jobDef = (spouse.jobs || []).find(j => (j.id && j.id === job.id) || (j.title && j.title === job.title)) || {};
                        const p = Number(job.contributionPercentage !== undefined && job.contributionPercentage !== null
                            ? job.contributionPercentage
                            : (jobDef.contributionPercentage !== undefined && jobDef.contributionPercentage !== null
                                ? jobDef.contributionPercentage
                                : (acc.contributionPercentage || 0)));
                        const cont = job.total * (p / 100);
                        preTaxDeductions += cont;
                        acc.contribute(cont);

                        const conf = acc.employerMatchConfig || {};
                        const match100 = Number(job.employer100PercentMatchOnTheFirstXPercent !== undefined && job.employer100PercentMatchOnTheFirstXPercent !== null
                            ? job.employer100PercentMatchOnTheFirstXPercent
                            : (jobDef.employer100PercentMatchOnTheFirstXPercent !== undefined && jobDef.employer100PercentMatchOnTheFirstXPercent !== null
                                ? jobDef.employer100PercentMatchOnTheFirstXPercent
                                : (conf.employer100PercentMatchOnTheFirstXPercent || acc.employer100PercentMatchOnTheFirstXPercent || 0)));
                        const match50 = Number(job.employer50PercentMatchOnTheNextXPercent !== undefined && job.employer50PercentMatchOnTheNextXPercent !== null
                            ? job.employer50PercentMatchOnTheNextXPercent
                            : (jobDef.employer50PercentMatchOnTheNextXPercent !== undefined && jobDef.employer50PercentMatchOnTheNextXPercent !== null
                                ? jobDef.employer50PercentMatchOnTheNextXPercent
                                : (conf.employer50PercentMatchOnTheNextXPercent || acc.employer50PercentMatchOnTheNextXPercent || 0)));
                        const matchBonus = Number(job.employerMatchBonusPercentage !== undefined && job.employerMatchBonusPercentage !== null
                            ? job.employerMatchBonusPercentage
                            : (jobDef.employerMatchBonusPercentage !== undefined && jobDef.employerMatchBonusPercentage !== null
                                ? jobDef.employerMatchBonusPercentage
                                : (conf.employerMatchBonusPercentage || acc.employerMatchBonusPercentage || 0)));

                        let matchPct = 0;
                        if (p > 0) {
                            const tier1 = Math.min(p, match100);
                            matchPct += tier1;
                            const tier2 = Math.min(Math.max(0, p - match100), match50);
                            matchPct += (tier2 * 0.5);
                        }
                        matchPct += matchBonus;
                        if (matchPct > 0) {
                            const matchCont = job.total * (matchPct / 100);
                            totalEmployerMatch += matchCont;
                            acc.contribute(matchCont);
                        }
                    }
                }
            });
        }

        spouse.accounts.forEach(acc => {
            if (acc.type === 'traditional401k' || acc.type === 'trad403b') {
                // Fallback for older saves: if the account is marked active but not linked to ANY job,
                // fallback to the total w2Gross to prevent their 401k from randomly breaking.
                const isLinkedToAnyJob = jobs && jobs.some(j => j.linked401kAccountId === acc.id);
                if (!isLinkedToAnyJob && acc.isActiveContributor) {
                    const p = acc.contributionPercentage || 0;
                    const cont = w2Gross * (p / 100);
                    preTaxDeductions += cont;
                    acc.contribute(cont);

                    const conf = acc.employerMatchConfig || {};
                    let matchPct = 0;
                    if (p > 0) {
                        const tier1 = Math.min(p, conf.employer100PercentMatchOnTheFirstXPercent || 0);
                        matchPct += tier1;
                        const tier2 = Math.min(Math.max(0, p - (conf.employer100PercentMatchOnTheFirstXPercent || 0)), conf.employer50PercentMatchOnTheNextXPercent || 0);
                        matchPct += (tier2 * 0.5);
                    }
                    matchPct += (conf.employerMatchBonusPercentage || 0);
                    if (matchPct > 0) {
                        const matchCont = w2Gross * (matchPct / 100);
                        totalEmployerMatch += matchCont;
                        acc.contribute(matchCont);
                    }
                }
            } else if (acc.type === 'standardIra') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                preTaxDeductions += cont;
                acc.contribute(cont);
            } else if (acc.type === 'rothIra') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                postTaxDeductions += cont;
                if (typeof acc.addContribution === 'function') {
                    acc.addContribution(cont);
                } else {
                    acc.contribute(cont);
                }
            } else if (acc.type === 'taxableBrokerage' || acc.type === 'hysa') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                postTaxDeductions += cont;
                acc.contribute(cont);
            }
        });

        return { preTaxDeductions, postTaxDeductions, totalEmployerMatch };
    }
}
