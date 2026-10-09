/**
 * ContributionCalculator.js
 * 
 * Domain logic for calculating spouse W2 contributions, pre-tax deductions, 
 * post-tax deductions, employer matching, HSA, and Roth IRA contributions.
 */
export const HSA_BASE_CAP_SINGLE = 4300;
export const HSA_BASE_CAP_FAMILY = 8550;
export const HSA_CATCHUP_55 = 1000;
export const ROTH_BASE_CAP = 7000;
export const ROTH_CATCHUP_50 = 1000;
export const ROTH_PHASEOUT_SINGLE_FLOOR = 150000;
export const ROTH_PHASEOUT_SINGLE_CEILING = 165000;
export const ROTH_PHASEOUT_MFJ_FLOOR = 236000;
export const ROTH_PHASEOUT_MFJ_CEILING = 246000;
export const ELECTIVE_DEFERRAL_BASE_CAP = 23500;
export const ELECTIVE_DEFERRAL_CATCHUP_50 = 7500;
export const ELECTIVE_DEFERRAL_SUPER_CATCHUP_60_63 = 11250;

export class ContributionCalculator {
    /**
     * Computes the statutory IRC § 402(g) employee elective deferral limit based on age.
     * @param {number} age - Owner's age in the given year
     * @returns {number} Statutory elective deferral limit ($23,500 base + catch-up)
     */
    static getElectiveDeferralLimit(age = 0) {
        if (age >= 60 && age <= 63) {
            return ELECTIVE_DEFERRAL_BASE_CAP + ELECTIVE_DEFERRAL_SUPER_CATCHUP_60_63;
        }
        if (age >= 50) {
            return ELECTIVE_DEFERRAL_BASE_CAP + ELECTIVE_DEFERRAL_CATCHUP_50;
        }
        return ELECTIVE_DEFERRAL_BASE_CAP;
    }

    /**
     * Estimates pre-tax deductions (401k/403b and HSA) without mutating account balances,
     * useful for accurate household MAGI calculation prior to Roth IRA processing.
     */
    static calculatePreTaxDeductionsEstimate({ spouse, jobs, year }) {
        if (!jobs) return 0;
        const spouseAge = spouse.getAge ? spouse.getAge(year) : (year - spouse.birthYear);
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let total401k = 0;
        let totalHsa = 0;

        jobs.forEach(job => {
            const est = this._estimateJobPreTax(spouse, job, year, spouseAge);
            total401k += est.preTax401k;
            totalHsa += est.preTaxHsa;
        });

        return Math.min(total401k, electiveCap) + totalHsa;
    }

    static _estimateJobPreTax(spouse, job, year, spouseAge) {
        let preTax401k = 0;
        let preTaxHsa = 0;
        if (job.linked401kAccountId && job.total > 0) {
            const acc = spouse.getAccount(job.linked401kAccountId);
            if (acc && (acc.type === 'traditional401k' || acc.type === 'trad403b')) {
                const jobDef = (spouse.jobs || []).find(j => (j.id && j.id === job.id) || (j.title && j.title === job.title)) || {};
                const p = Number(job.contributionPercentage ?? jobDef.contributionPercentage ?? acc.contributionPercentage ?? 0);
                preTax401k += job.total * (p / 100);
            }
        }
        if (job.linkedHsaAccountId && job.total > 0 && spouseAge < 65) {
            const acc = spouse.getAccount(job.linkedHsaAccountId);
            if (acc && acc.type === 'hsa') {
                const startYear = Number(job.hsaStartYear) || (job.startDate ? parseInt(job.startDate.split('-')[0], 10) : year);
                const endYear = (job.hsaEndYear !== undefined && job.hsaEndYear !== null && job.hsaEndYear !== '') ? Number(job.hsaEndYear) : null;
                const inWindow = year >= startYear && (!endYear || year <= endYear);
                if (inWindow) {
                    const baseCap = acc.coverageTier === 'family' ? HSA_BASE_CAP_FAMILY : HSA_BASE_CAP_SINGLE;
                    const catchUp = spouseAge >= 55 ? HSA_CATCHUP_55 : 0;
                    const statutoryLimit = baseCap + catchUp;
                    const rawTarget = (job.hsaAnnualContribution !== undefined && job.hsaAnnualContribution !== null && job.hsaAnnualContribution !== '')
                        ? Number(job.hsaAnnualContribution)
                        : (acc.annualContribution || statutoryLimit);
                    preTaxHsa += Math.min(statutoryLimit, Math.max(0, rawTarget));
                }
            }
        }
        return { preTax401k, preTaxHsa };
    }

    /**
     * Processes contributions and employer matches for a single spouse based on their W2 Gross income.
     * 
     * @param {Object} params
     * @param {Person} params.spouse - The person making contributions.
     * @param {number} params.w2Gross - The person's gross W2 income for the year.
     * @param {Array} [params.jobs] - List of active jobs for this spouse.
     * @param {number} params.year - The current simulation year.
     * @param {string} [params.filingStatus='mfj'] - Filing status ('mfj' or 'single').
     * @param {number} [params.householdMagi=null] - Household Modified AGI for Roth phaseout.
     * @returns {Object} { preTaxDeductions, postTaxDeductions, totalEmployerMatch, hsaPreTaxDeduction }
     */
    static calculate({ spouse, w2Gross, jobs, year, filingStatus = 'mfj', householdMagi = null }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        let totalEmployerMatch = 0;
        let hsaPreTaxDeduction = 0;

        if (w2Gross <= 0) {
            return { preTaxDeductions, postTaxDeductions, totalEmployerMatch, hsaPreTaxDeduction };
        }

        // 1. Process employer-sponsored accounts (401k/403b) linked to active jobs
        const k401Result = this._processLinked401k({ spouse, jobs, year });
        preTaxDeductions += k401Result.preTaxDeductions;
        totalEmployerMatch += k401Result.totalEmployerMatch;

        // 2. Process workplace HSA accounts linked to active jobs
        const hsaResult = this._processLinkedHsa({ spouse, jobs, year });
        preTaxDeductions += hsaResult.preTaxHsa;
        hsaPreTaxDeduction += hsaResult.preTaxHsa;

        // 3. Process direct / remaining accounts (Traditional IRA, Roth IRA, Brokerage, HYSA)
        const directResult = this._processDirectAccounts({
            spouse,
            w2Gross,
            jobs,
            year,
            filingStatus,
            householdMagi,
            accumulatedElective: k401Result.preTaxDeductions
        });
        preTaxDeductions += directResult.preTaxDeductions;
        postTaxDeductions += directResult.postTaxDeductions;
        totalEmployerMatch += directResult.totalEmployerMatch;

        return { preTaxDeductions, postTaxDeductions, totalEmployerMatch, hsaPreTaxDeduction };
    }

    static _processLinked401k({ spouse, jobs, year = 2026 }) {
        let preTaxDeductions = 0;
        let totalEmployerMatch = 0;
        if (!jobs) return { preTaxDeductions, totalEmployerMatch };

        const spouseAge = spouse.getAge ? spouse.getAge(year) : (year - spouse.birthYear);
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let accumulatedElective = 0;

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
                    const rawCont = job.total * (p / 100);
                    const remainingCap = Math.max(0, electiveCap - accumulatedElective);
                    const cont = Math.min(rawCont, remainingCap);

                    accumulatedElective += cont;
                    preTaxDeductions += cont;
                    if (cont > 0) {
                        acc.contribute(cont);
                    }

                    const matchCont = this._calculateEmployerMatch(job, jobDef, acc, p);
                    totalEmployerMatch += matchCont;
                    if (matchCont > 0) {
                        acc.contribute(matchCont);
                    }
                }
            }
        });
        return { preTaxDeductions, totalEmployerMatch };
    }

    static _calculateEmployerMatch(job, jobDef, acc, p) {
        const conf = acc.employerMatchConfig || {};
        const match100 = Number(job.employer100PercentMatchOnTheFirstXPercent ?? jobDef.employer100PercentMatchOnTheFirstXPercent ?? conf.employer100PercentMatchOnTheFirstXPercent ?? acc.employer100PercentMatchOnTheFirstXPercent ?? 0);
        const match50 = Number(job.employer50PercentMatchOnTheNextXPercent ?? jobDef.employer50PercentMatchOnTheNextXPercent ?? conf.employer50PercentMatchOnTheNextXPercent ?? acc.employer50PercentMatchOnTheNextXPercent ?? 0);
        const matchBonus = Number(job.employerMatchBonusPercentage ?? jobDef.employerMatchBonusPercentage ?? conf.employerMatchBonusPercentage ?? acc.employerMatchBonusPercentage ?? 0);

        let matchPct = 0;
        if (p > 0) {
            matchPct += Math.min(p, match100);
            matchPct += (Math.min(Math.max(0, p - match100), match50) * 0.5);
        }
        matchPct += matchBonus;
        return matchPct > 0 ? (job.total * (matchPct / 100)) : 0;
    }

    static _processLinkedHsa({ spouse, jobs, year }) {
        let preTaxHsa = 0;
        const spouseAge = spouse.getAge ? spouse.getAge(year) : (year - spouse.birthYear);
        if (spouseAge >= 65 || !jobs) return { preTaxHsa };

        jobs.forEach(job => {
            if (!job.linkedHsaAccountId || job.total <= 0) return;
            const acc = spouse.getAccount(job.linkedHsaAccountId);
            if (!acc || acc.type !== 'hsa') return;

            const startYear = Number(job.hsaStartYear) || (job.startDate ? parseInt(job.startDate.split('-')[0], 10) : year);
            const endYear = (job.hsaEndYear !== undefined && job.hsaEndYear !== null && job.hsaEndYear !== '') ? Number(job.hsaEndYear) : null;
            if (year < startYear || (endYear && year > endYear)) return;

            const baseCap = acc.coverageTier === 'family' ? HSA_BASE_CAP_FAMILY : HSA_BASE_CAP_SINGLE;
            const catchUp = spouseAge >= 55 ? HSA_CATCHUP_55 : 0;
            const statutoryLimit = baseCap + catchUp;

            const rawTarget = (job.hsaAnnualContribution !== undefined && job.hsaAnnualContribution !== null && job.hsaAnnualContribution !== '')
                ? Number(job.hsaAnnualContribution)
                : (acc.annualContribution || statutoryLimit);

            const cont = Math.min(statutoryLimit, Math.max(0, rawTarget));
            if (cont > 0) {
                preTaxHsa += cont;
                acc.contribute(cont);
            }
        });
        return { preTaxHsa };
    }

    static _processDirectAccounts({ spouse, w2Gross, jobs, year, filingStatus, householdMagi, accumulatedElective = 0 }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        const totalEmployerMatch = 0;

        const spouseAge = spouse.getAge ? spouse.getAge(year) : (year - spouse.birthYear);
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let currentElective = accumulatedElective;

        spouse.accounts.forEach(acc => {
            if (acc.type === 'traditional401k' || acc.type === 'trad403b') {
                const isLinked = jobs && jobs.some(j => j.linked401kAccountId === acc.id);
                if (!isLinked && acc.isActiveContributor) {
                    const rawCont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                    const remainingCap = Math.max(0, electiveCap - currentElective);
                    const cont = Math.min(rawCont, remainingCap);
                    currentElective += cont;
                    preTaxDeductions += cont;
                    if (cont > 0) {
                        acc.contribute(cont);
                    }
                }
            } else if (acc.type === 'standardIra') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                preTaxDeductions += cont;
                acc.contribute(cont);
            } else if (acc.type === 'rothIra') {
                const rothCont = this._calculateRothContribution({ acc, spouse, w2Gross, year, filingStatus, householdMagi });
                postTaxDeductions += rothCont;
            } else if (acc.type === 'taxableBrokerage' || acc.type === 'hysa') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                postTaxDeductions += cont;
                acc.contribute(cont);
            }
        });

        return { preTaxDeductions, postTaxDeductions, totalEmployerMatch };
    }

    static _calculateRothContribution({ acc, spouse, w2Gross, year, filingStatus, householdMagi }) {
        if (w2Gross <= 0 || !acc.autoContribute) return 0;
        if (acc.startYear && year < Number(acc.startYear)) return 0;
        if (acc.stopYear && year > Number(acc.stopYear)) return 0;

        const spouseAge = spouse.getAge ? spouse.getAge(year) : (year - spouse.birthYear);
        const statutoryCap = spouseAge >= 50 ? (ROTH_BASE_CAP + ROTH_CATCHUP_50) : ROTH_BASE_CAP;
        const target = (acc.annualContribution !== undefined && acc.annualContribution !== null && acc.annualContribution !== '')
            ? Number(acc.annualContribution)
            : (acc.contributionPercentage ? (w2Gross * (acc.contributionPercentage / 100)) : statutoryCap);

        const baseCont = Math.min(statutoryCap, Math.min(w2Gross, Math.max(0, target)));
        if (baseCont <= 0) return 0;

        let ratio = 1.0;
        if (householdMagi !== null && householdMagi !== undefined) {
            const isSingle = (filingStatus === 'single');
            const floor = isSingle ? ROTH_PHASEOUT_SINGLE_FLOOR : ROTH_PHASEOUT_MFJ_FLOOR;
            const ceiling = isSingle ? ROTH_PHASEOUT_SINGLE_CEILING : ROTH_PHASEOUT_MFJ_CEILING;
            if (householdMagi >= ceiling) {
                ratio = 0;
            } else if (householdMagi > floor) {
                ratio = (ceiling - householdMagi) / (ceiling - floor);
            }
        }

        const allowed = baseCont * ratio;
        if (allowed > 0) {
            if (typeof acc.addContribution === 'function') {
                acc.addContribution(allowed);
            } else {
                acc.contribute(allowed);
            }
        }
        return allowed;
    }
}
