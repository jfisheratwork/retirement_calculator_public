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
        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let total401k = 0;
        let totalHsa = 0;

        jobs.forEach((job) => {
            const est = this._estimateJobPreTax(spouse, job, year, spouseAge);
            total401k += est.preTax401k;
            totalHsa += est.preTaxHsa;
        });

        return Math.min(total401k, electiveCap) + totalHsa;
    }

    static _findMatchingJobDef(spouse, job) {
        return (spouse.jobs || []).find((j) => (j.id && j.id === job.id) || (j.title && j.title === job.title)) || {};
    }

    static _estimateJob401k(spouse, job) {
        if (!job.linked401kAccountId || job.total <= 0) return 0;
        const acc = spouse.getAccount(job.linked401kAccountId);
        if (!acc || (acc.type !== 'traditional401k' && acc.type !== 'trad403b')) return 0;
        const jobDef = this._findMatchingJobDef(spouse, job);
        const pct = Number(
            job.contributionPercentage ?? jobDef.contributionPercentage ?? acc.contributionPercentage ?? 0
        );
        return job.total * (pct / 100);
    }

    static _isJobHsaActive(job, year) {
        const defaultStart = job.startDate ? parseInt(job.startDate.split('-')[0], 10) : year;
        const startYear = Number(job.hsaStartYear) || defaultStart;
        const rawEnd = job.hsaEndYear;
        const endYear = rawEnd !== undefined && rawEnd !== null && rawEnd !== '' ? Number(rawEnd) : null;
        return year >= startYear && (!endYear || year <= endYear);
    }

    static _resolveJobHsaContribution(spouse, job, year, spouseAge) {
        if (!job.linkedHsaAccountId || job.total <= 0 || spouseAge >= 65) return { acc: null, cont: 0 };
        const acc = spouse.getAccount(job.linkedHsaAccountId);
        if (!acc || acc.type !== 'hsa') return { acc: null, cont: 0 };
        if (!this._isJobHsaActive(job, year)) return { acc, cont: 0 };

        const baseCap = acc.coverageTier === 'family' ? HSA_BASE_CAP_FAMILY : HSA_BASE_CAP_SINGLE;
        const statutoryLimit = baseCap + (spouseAge >= 55 ? HSA_CATCHUP_55 : 0);
        const rawTarget = job.hsaAnnualContribution;
        const hasCustomTarget = rawTarget !== undefined && rawTarget !== null && rawTarget !== '';
        const target = hasCustomTarget ? Number(rawTarget) : acc.annualContribution || statutoryLimit;

        return { acc, cont: Math.min(statutoryLimit, Math.max(0, target)) };
    }

    static _estimateJobPreTax(spouse, job, year, spouseAge) {
        const preTax401k = this._estimateJob401k(spouse, job);
        const { cont: preTaxHsa } = this._resolveJobHsaContribution(spouse, job, year, spouseAge);
        return { preTax401k, preTaxHsa };
    }

    /**
     * Processes contributions and employer matches for a single spouse based on their W2 Gross income.
     */
    static calculate({ spouse, w2Gross, jobs, year, filingStatus = 'mfj', householdMagi = null }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        let totalEmployerMatch = 0;
        let hsaPreTaxDeduction = 0;

        if (w2Gross <= 0) {
            return { preTaxDeductions, postTaxDeductions, totalEmployerMatch, hsaPreTaxDeduction };
        }

        const k401Result = this._processLinked401k({ spouse, jobs, year });
        preTaxDeductions += k401Result.preTaxDeductions;
        totalEmployerMatch += k401Result.totalEmployerMatch;

        const hsaResult = this._processLinkedHsa({ spouse, jobs, year });
        preTaxDeductions += hsaResult.preTaxHsa;
        hsaPreTaxDeduction += hsaResult.preTaxHsa;

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

        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let accumulatedElective = 0;

        jobs.forEach((job) => {
            if (!job.linked401kAccountId || job.total <= 0) return;
            const acc = spouse.getAccount(job.linked401kAccountId);
            if (!acc || (acc.type !== 'traditional401k' && acc.type !== 'trad403b')) return;

            const jobDef = this._findMatchingJobDef(spouse, job);
            const p = Number(
                job.contributionPercentage ?? jobDef.contributionPercentage ?? acc.contributionPercentage ?? 0
            );
            const rawCont = job.total * (p / 100);
            const cont = Math.min(rawCont, Math.max(0, electiveCap - accumulatedElective));

            accumulatedElective += cont;
            preTaxDeductions += cont;
            if (cont > 0) acc.contribute(cont);

            const matchCont = this._calculateEmployerMatch(job, jobDef, acc, p);
            totalEmployerMatch += matchCont;
            if (matchCont > 0) acc.contribute(matchCont);
        });
        return { preTaxDeductions, totalEmployerMatch };
    }

    static _resolveMatchField(job, jobDef, conf, acc, key) {
        return Number(job[key] ?? jobDef[key] ?? conf[key] ?? acc[key] ?? 0);
    }

    static _calculateEmployerMatch(job, jobDef, acc, p) {
        const conf = acc.employerMatchConfig || {};
        const match100 = this._resolveMatchField(job, jobDef, conf, acc, 'employer100PercentMatchOnTheFirstXPercent');
        const match50 = this._resolveMatchField(job, jobDef, conf, acc, 'employer50PercentMatchOnTheNextXPercent');
        const matchBonus = this._resolveMatchField(job, jobDef, conf, acc, 'employerMatchBonusPercentage');

        let matchPct = matchBonus;
        if (p > 0) {
            matchPct += Math.min(p, match100) + Math.min(Math.max(0, p - match100), match50) * 0.5;
        }
        return matchPct > 0 ? job.total * (matchPct / 100) : 0;
    }

    static _processLinkedHsa({ spouse, jobs, year }) {
        let preTaxHsa = 0;
        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        if (spouseAge >= 65 || !jobs) return { preTaxHsa };

        jobs.forEach((job) => {
            const { acc, cont } = this._resolveJobHsaContribution(spouse, job, year, spouseAge);
            if (acc && cont > 0) {
                preTaxHsa += cont;
                acc.contribute(cont);
            }
        });
        return { preTaxHsa };
    }

    static _processDirectAccounts({
        spouse,
        w2Gross,
        jobs,
        year,
        filingStatus,
        householdMagi,
        accumulatedElective = 0
    }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        const totalEmployerMatch = 0;

        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let currentElective = accumulatedElective;

        spouse.accounts.forEach((acc) => {
            if (acc.type === 'traditional401k' || acc.type === 'trad403b') {
                const isLinked = jobs && jobs.some((j) => j.linked401kAccountId === acc.id);
                if (!isLinked && acc.isActiveContributor) {
                    const rawCont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                    const cont = Math.min(rawCont, Math.max(0, electiveCap - currentElective));
                    currentElective += cont;
                    preTaxDeductions += cont;
                    if (cont > 0) acc.contribute(cont);
                }
            } else if (acc.type === 'standardIra') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                preTaxDeductions += cont;
                acc.contribute(cont);
            } else if (acc.type === 'rothIra') {
                postTaxDeductions += this._calculateRothContribution({
                    acc,
                    spouse,
                    w2Gross,
                    year,
                    filingStatus,
                    householdMagi
                });
            } else if (acc.type === 'taxableBrokerage' || acc.type === 'hysa') {
                const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
                postTaxDeductions += cont;
                acc.contribute(cont);
            }
        });

        return { preTaxDeductions, postTaxDeductions, totalEmployerMatch };
    }

    static _getRothPhaseoutRatio(householdMagi, filingStatus) {
        if (householdMagi === null || householdMagi === undefined) return 1.0;
        const isSingle = filingStatus === 'single';
        const floor = isSingle ? ROTH_PHASEOUT_SINGLE_FLOOR : ROTH_PHASEOUT_MFJ_FLOOR;
        const ceiling = isSingle ? ROTH_PHASEOUT_SINGLE_CEILING : ROTH_PHASEOUT_MFJ_CEILING;
        if (householdMagi >= ceiling) return 0;
        if (householdMagi > floor) return (ceiling - householdMagi) / (ceiling - floor);
        return 1.0;
    }

    static _resolveRothTargetAmount(acc, w2Gross, statutoryCap) {
        const rawAnnual = acc.annualContribution;
        if (rawAnnual !== undefined && rawAnnual !== null && rawAnnual !== '') {
            return Number(rawAnnual);
        }
        if (acc.contributionPercentage) {
            return w2Gross * (acc.contributionPercentage / 100);
        }
        return statutoryCap;
    }

    static _calculateRothContribution({ acc, spouse, w2Gross, year, filingStatus, householdMagi }) {
        if (w2Gross <= 0 || !acc.autoContribute) return 0;
        if ((acc.startYear && year < Number(acc.startYear)) || (acc.stopYear && year > Number(acc.stopYear))) {
            return 0;
        }

        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const statutoryCap = spouseAge >= 50 ? ROTH_BASE_CAP + ROTH_CATCHUP_50 : ROTH_BASE_CAP;
        const target = this._resolveRothTargetAmount(acc, w2Gross, statutoryCap);
        const baseCont = Math.min(statutoryCap, Math.min(w2Gross, Math.max(0, target)));
        if (baseCont <= 0) return 0;

        const allowed = baseCont * this._getRothPhaseoutRatio(householdMagi, filingStatus);
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
