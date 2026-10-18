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

    static _getJobCompBreakdown(job) {
        const hasExplicitBase = job.baseSalary !== undefined && job.baseSalary !== null;
        const lti = Number(job.lti) || 0;
        const bonus = Number(job.bonus) || 0;
        const base = hasExplicitBase
            ? Number(job.baseSalary) || 0
            : Math.max(0, (Number(job.total) || 0) - bonus - lti);
        return { base, bonus, lti, eligible401kComp: base + bonus };
    }

    static _estimateJob401k(spouse, job) {
        if (!job.linked401kAccountId || job.total <= 0) return 0;
        const acc = spouse.getAccount(job.linked401kAccountId);
        if (!acc || acc._rolloverExecuted || (acc.type !== 'traditional401k' && acc.type !== 'trad403b')) return 0;
        const jobDef = this._findMatchingJobDef(spouse, job);
        const pct = Number(
            job.contributionPercentage ?? jobDef.contributionPercentage ?? acc.contributionPercentage ?? 0
        );
        const { eligible401kComp } = this._getJobCompBreakdown(job);
        return eligible401kComp * (pct / 100);
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
    static calculate({
        spouse,
        w2Gross,
        jobs,
        year,
        filingStatus = 'mfj',
        householdMagi = null,
        mutateAccounts = true
    }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        let totalEmployerMatch = 0;
        let hsaPreTaxDeduction = 0;

        if (w2Gross <= 0) {
            return { preTaxDeductions, postTaxDeductions, totalEmployerMatch, hsaPreTaxDeduction };
        }

        const k401Result = this._processLinked401k({ spouse, jobs, year, mutateAccounts });
        preTaxDeductions += k401Result.preTaxDeductions;
        totalEmployerMatch += k401Result.totalEmployerMatch;

        const hsaResult = this._processLinkedHsa({ spouse, jobs, year, mutateAccounts });
        preTaxDeductions += hsaResult.preTaxHsa;
        hsaPreTaxDeduction += hsaResult.preTaxHsa;

        const directResult = this._processDirectAccounts({
            spouse,
            w2Gross,
            jobs,
            year,
            filingStatus,
            householdMagi,
            accumulatedElective: k401Result.preTaxDeductions,
            mutateAccounts
        });
        preTaxDeductions += directResult.preTaxDeductions;
        postTaxDeductions += directResult.postTaxDeductions;
        totalEmployerMatch += directResult.totalEmployerMatch;

        return { preTaxDeductions, postTaxDeductions, totalEmployerMatch, hsaPreTaxDeduction };
    }

    static _processLinked401k({ spouse, jobs, year = 2026, mutateAccounts = true, accumulatedElective = 0 }) {
        let preTaxDeductions = 0;
        let totalEmployerMatch = 0;
        if (!jobs) return { preTaxDeductions, totalEmployerMatch, accumulatedElective };

        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let currentElective = accumulatedElective;

        jobs.forEach((job) => {
            if (!job.linked401kAccountId || job.total <= 0) return;
            const acc = spouse.getAccount(job.linked401kAccountId);
            if (!acc || acc._rolloverExecuted || (acc.type !== 'traditional401k' && acc.type !== 'trad403b')) return;

            const jobDef = this._findMatchingJobDef(spouse, job);
            const p = Number(
                job.contributionPercentage ?? jobDef.contributionPercentage ?? acc.contributionPercentage ?? 0
            );
            const { eligible401kComp } = this._getJobCompBreakdown(job);
            const rawCont = eligible401kComp * (p / 100);
            const cont = Math.min(rawCont, Math.max(0, electiveCap - currentElective));

            currentElective += cont;
            preTaxDeductions += cont;
            if (mutateAccounts && cont > 0) acc.contribute(cont);

            const matchCont = this._calculateEmployerMatch(job, jobDef, acc, p);
            totalEmployerMatch += matchCont;
            if (mutateAccounts && matchCont > 0) acc.contribute(matchCont);
        });
        return { preTaxDeductions, totalEmployerMatch, accumulatedElective: currentElective };
    }

    static _resolveMatchField(job, jobDef, conf, acc, key) {
        return Number(job[key] ?? jobDef[key] ?? conf[key] ?? acc[key] ?? 0);
    }

    static _calculateEmployerMatch(job, jobDef, acc, p) {
        const conf = acc.employerMatchConfig || {};
        const match100 = this._resolveMatchField(job, jobDef, conf, acc, 'employer100PercentMatchOnTheFirstXPercent');
        const match50 = this._resolveMatchField(job, jobDef, conf, acc, 'employer50PercentMatchOnTheNextXPercent');
        const matchBonus = this._resolveMatchField(job, jobDef, conf, acc, 'employerMatchBonusPercentage');

        const { base, bonus } = this._getJobCompBreakdown(job);
        let salaryMatchPct = 0;
        if (p > 0) {
            salaryMatchPct = Math.min(p, match100) + Math.min(Math.max(0, p - match100), match50) * 0.5;
        }
        const baseMatch = salaryMatchPct > 0 ? base * (salaryMatchPct / 100) : 0;
        const bonusMatch = p > 0 && matchBonus > 0 ? bonus * (matchBonus / 100) : 0;
        return baseMatch + bonusMatch;
    }

    static _processLinkedHsa({ spouse, jobs, year, mutateAccounts = true, monthShareFn = null }) {
        let preTaxHsa = 0;
        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        if (spouseAge >= 65 || !jobs) return { preTaxHsa };

        jobs.forEach((job) => {
            const { acc, cont } = this._resolveJobHsaContribution(spouse, job, year, spouseAge);
            if (acc && cont > 0) {
                const share = monthShareFn ? monthShareFn(job) : 1;
                const effectiveCont = cont * share;
                preTaxHsa += effectiveCont;
                if (mutateAccounts && effectiveCont > 0) {
                    acc.contribute(effectiveCont);
                }
            }
        });
        return { preTaxHsa };
    }

    static _isWorkplaceAccountClaimedOrRolledOver(spouse, jobs, acc) {
        if (acc._rolloverExecuted) return true;
        const matchAcc = (id) => Boolean(id && (id === acc.id || id === acc.name || id === acc.type));
        if (jobs && jobs.some((j) => matchAcc(j.linked401kAccountId))) return true;
        const allSpouseJobs = spouse.jobs || [];
        return allSpouseJobs.some((j) => matchAcc(j.linked401kAccountId));
    }

    static _applyPercentageContribution(acc, w2Gross, mutateAccounts) {
        const cont = w2Gross * ((acc.contributionPercentage || 0) / 100);
        if (mutateAccounts && cont > 0) acc.contribute(cont);
        return cont;
    }

    static _processFallbackWorkplaceAccount({ spouse, jobs, acc, w2Gross, remainingCap, mutateAccounts }) {
        if (this._isWorkplaceAccountClaimedOrRolledOver(spouse, jobs, acc) || !acc.isActiveContributor) {
            return 0;
        }
        const rawCont = w2Gross * ((acc.contributionPercentage || 0) / 100);
        const cont = Math.min(rawCont, Math.max(0, remainingCap));
        if (mutateAccounts && cont > 0) acc.contribute(cont);
        return cont;
    }

    static _processDirectAccounts({
        spouse,
        w2Gross,
        jobs,
        year,
        filingStatus,
        householdMagi,
        accumulatedElective = 0,
        mutateAccounts = true,
        annualW2Gross = null,
        monthW2Share = 1
    }) {
        let preTaxDeductions = 0;
        let postTaxDeductions = 0;
        const totalEmployerMatch = 0;

        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const electiveCap = this.getElectiveDeferralLimit(spouseAge);
        let currentElective = accumulatedElective;
        const rothBasisW2 = annualW2Gross !== null ? annualW2Gross : w2Gross;

        spouse.accounts.forEach((acc) => {
            if (acc.type === 'traditional401k' || acc.type === 'trad403b') {
                const cont = this._processFallbackWorkplaceAccount({
                    spouse,
                    jobs,
                    acc,
                    w2Gross,
                    remainingCap: electiveCap - currentElective,
                    mutateAccounts
                });
                currentElective += cont;
                preTaxDeductions += cont;
            } else if (acc.type === 'standardIra') {
                preTaxDeductions += this._applyPercentageContribution(acc, w2Gross, mutateAccounts);
            } else if (acc.type === 'rothIra') {
                postTaxDeductions += this._calculateRothContribution({
                    acc,
                    spouse,
                    w2Gross: rothBasisW2,
                    year,
                    filingStatus,
                    householdMagi,
                    mutateAccounts,
                    monthShare: monthW2Share
                });
            } else if (acc.type === 'taxableBrokerage' || acc.type === 'hysa') {
                postTaxDeductions += this._applyPercentageContribution(acc, w2Gross, mutateAccounts);
            }
        });

        return { preTaxDeductions, postTaxDeductions, totalEmployerMatch, accumulatedElective: currentElective };
    }

    static contributeMonthly({
        spouse,
        monthJobs,
        annualJobs,
        monthW2Gross,
        annualW2Gross,
        year,
        filingStatus = 'mfj',
        householdMagi = null,
        tracker
    }) {
        if (monthW2Gross <= 0 || !annualW2Gross || annualW2Gross <= 0) return;

        const k401Result = this._processLinked401k({
            spouse,
            jobs: monthJobs,
            year,
            mutateAccounts: true,
            accumulatedElective: tracker?.electiveYtd || 0
        });
        if (tracker) tracker.electiveYtd = k401Result.accumulatedElective;

        this._processLinkedHsa({
            spouse,
            jobs: monthJobs,
            year,
            mutateAccounts: true,
            monthShareFn: (mJob) => {
                const annualMatch = (annualJobs || []).find(
                    (aj) => (aj.id && aj.id === mJob.id) || (aj.title && aj.title === mJob.title)
                );
                const activeMonths = annualMatch?.activeMonthCount || 12;
                return activeMonths > 0 ? 1 / activeMonths : 0;
            }
        });

        const monthW2Share = annualW2Gross > 0 ? monthW2Gross / annualW2Gross : 0;
        const directRes = this._processDirectAccounts({
            spouse,
            w2Gross: monthW2Gross,
            jobs: monthJobs,
            year,
            filingStatus,
            householdMagi,
            accumulatedElective: tracker?.electiveYtd || 0,
            mutateAccounts: true,
            annualW2Gross,
            monthW2Share
        });
        if (tracker) tracker.electiveYtd = directRes.accumulatedElective;
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

    static _calculateRothContribution({
        acc,
        spouse,
        w2Gross,
        year,
        filingStatus,
        householdMagi,
        mutateAccounts = true,
        monthShare = 1
    }) {
        if (w2Gross <= 0 || !acc.autoContribute) return 0;
        if ((acc.startYear && year < Number(acc.startYear)) || (acc.stopYear && year > Number(acc.stopYear))) {
            return 0;
        }

        const spouseAge = spouse.getAge ? spouse.getAge(year) : year - spouse.birthYear;
        const statutoryCap = spouseAge >= 50 ? ROTH_BASE_CAP + ROTH_CATCHUP_50 : ROTH_BASE_CAP;
        const target = this._resolveRothTargetAmount(acc, w2Gross, statutoryCap);
        const baseCont = Math.min(statutoryCap, Math.min(w2Gross, Math.max(0, target)));
        if (baseCont <= 0) return 0;

        const allowed = baseCont * this._getRothPhaseoutRatio(householdMagi, filingStatus) * monthShare;
        if (mutateAccounts && allowed > 0) {
            if (typeof acc.addContribution === 'function') {
                acc.addContribution(allowed);
            } else {
                acc.contribute(allowed);
            }
        }
        return allowed;
    }
}
