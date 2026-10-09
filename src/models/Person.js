import { Trad401k, Trad403b, StandardIra, TaxableBrokerage, Hysa, CdAccount, RothIra, Hsa } from './Account.js';
import { RolloverEvent, RothConversionSchedule } from './FinancialEvent.js';
import { parseDateParts } from '../utils/date.js';

// MODEL_VERSION: 7
// IMPORTANT: Update this MODEL_VERSION whenever you change the properties or structure of Person or Account classes.
export const MODEL_VERSION = 7;

function isConfiguredJob(job) {
    if (!job) return false;
    return Boolean(job.startDate || job.title);
}

function findActiveJob(jobs, currentYear, month) {
    const configuredJobs = jobs.filter(isConfiguredJob);
    const candidateJobs = configuredJobs.length > 0 ? configuredJobs : jobs;

    for (let i = candidateJobs.length - 1; i >= 0; i--) {
        const job = candidateJobs[i];
        if (!job.startDate) return job;
        const { year: startYear, month: startMonth } = parseDateParts(job.startDate, currentYear, 1);
        if (currentYear > startYear || (currentYear === startYear && month >= startMonth)) {
            return job;
        }
    }
    return null;
}

function calculateMonthPay(job, month, events = null, spouseName = '', w2Multiplier = 1) {
    if (!job) return 0;
    const baseMonthly = ((Number(job.baseSalary) || 0) / 12) * w2Multiplier;
    let pay = baseMonthly;

    const bonusMonthNum = parseInt(job.bonusMonth, 10);
    if (!isNaN(bonusMonthNum) && bonusMonthNum === month && Number(job.bonusAmount) > 0) {
        const bonusVal = (Number(job.bonusAmount) || 0) * w2Multiplier;
        pay += bonusVal;
        if (events) {
            events.push({
                month,
                type: 'income_bonus',
                name: `${spouseName} Bonus (${job.title || 'Job'})`,
                amount: bonusVal
            });
        }
    }

    const ltiMonthNum = parseInt(job.ltiMonth, 10);
    if (!isNaN(ltiMonthNum) && ltiMonthNum === month && Number(job.ltiAmount) > 0) {
        const ltiVal = (Number(job.ltiAmount) || 0) * w2Multiplier;
        pay += ltiVal;
        if (events) {
            events.push({
                month,
                type: 'income_lti',
                name: `${spouseName} LTI (${job.title || 'Job'})`,
                amount: ltiVal
            });
        }
    }
    return pay;
}

function createAccountInstance(accState) {
    let acc = null;
    const accId = accState.id || accState.name || ('acc-' + Math.random().toString(36).substr(2, 9));
    if (accState.type === 'traditional401k') {
        acc = new Trad401k(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage, {
            employer100PercentMatchOnTheFirstXPercent: accState.employer100PercentMatchOnTheFirstXPercent,
            employer50PercentMatchOnTheNextXPercent: accState.employer50PercentMatchOnTheNextXPercent,
            employerMatchBonusPercentage: accState.employerMatchBonusPercentage
        });
    } else if (accState.type === 'trad403b') {
        acc = new Trad403b(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage, {
            employer100PercentMatchOnTheFirstXPercent: accState.employer100PercentMatchOnTheFirstXPercent,
            employer50PercentMatchOnTheNextXPercent: accState.employer50PercentMatchOnTheNextXPercent,
            employerMatchBonusPercentage: accState.employerMatchBonusPercentage
        });
    } else if (accState.type === 'standardIra') {
        acc = new StandardIra(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage);
    } else if (accState.type === 'taxableBrokerage') {
        acc = new TaxableBrokerage(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage, accState.costBasis);
    } else if (accState.type === 'hysa') {
        acc = new Hysa(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage);
    } else if (accState.type === 'cd') {
        acc = new CdAccount(accId, accState.name, accState.balance, accState.rate !== undefined ? accState.rate : accState.expectedReturn, accState.contributionPercentage, {
            rate: accState.rate !== undefined ? accState.rate : accState.expectedReturn,
            maturityDate: accState.maturityDate,
            maturityAction: accState.maturityAction,
            sweepTargetAccountId: accState.sweepTargetAccountId,
            rolloverCount: accState.rolloverCount
        });
    } else if (accState.type === 'hsa') {
        acc = new Hsa(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage, {
            coverageTier: accState.coverageTier,
            annualContribution: accState.annualContribution,
            employerContribution: accState.employerContribution
        });
    } else if (accState.type === 'rothIra') {
        acc = new RothIra(accId, accState.name, accState.balance, accState.expectedReturn, accState.contributionPercentage, {
            annualContribution: accState.annualContribution,
            autoContribute: accState.autoContribute,
            startYear: accState.startYear,
            stopYear: accState.stopYear,
            principle: accState.principle
        });
        acc.principle = accState.principle || 0;
    }
    if (acc) {
        acc.id = accId;
        acc.name = accState.name;
        acc.type = accState.type;
        acc.isActiveContributor = Boolean(accState.isActiveContributor);
        acc.isSweepAccount = Boolean(accState.isSweepAccount);
        if (accState.rollover) {
            acc.rollover = JSON.parse(JSON.stringify(accState.rollover));
        }
    }
    return acc;
}

export class Person {
    constructor(key, state) {
        let personKey = key;
        let personState = state;
        if (typeof key === 'object' && key !== null && state === undefined) {
            personState = key;
            personKey = personState.key || 's1';
        }
        this.key = personKey || 's1';
        const safeState = personState || {};
        this._initDemographics(safeState);
        this._initRetirementMilestones(safeState);
        this._initSocialSecurity(safeState);
        this._initRule72t(safeState);
        this._initJobs(safeState);
        this._initAccounts(safeState);
    }

    _initDemographics(state) {
        this.name = state.name;
        this.birthYear = Number(state.yearOfBirth || state.birthYear) || 1980;
        this.lifeExpectancy = state.estimatedLifeExpectancy !== undefined ? Number(state.estimatedLifeExpectancy) : (state.lifeExpectancy !== undefined ? Number(state.lifeExpectancy) : 95);
        this.rothConversion = new RothConversionSchedule(state.rothConversion);
        this.rolloverEvent = new RolloverEvent(state.rolloverEvent);
    }

    _initRetirementMilestones(state) {
        const configuredRetAge = state.targetRetirementAge ?? state.retirementAge;
        if (state.targetRetirementDate) {
            const { year: rYear, month: rMonth } = parseDateParts(state.targetRetirementDate, this.birthYear + (Number(configuredRetAge) || 65), 1);
            this.targetRetirementYear = rYear;
            this.targetRetirementMonth = rMonth;
            this.targetRetirementDate = `${rYear}-${String(rMonth).padStart(2, '0')}`;
            this.targetRetirementAge = rYear - this.birthYear;
        } else if (configuredRetAge !== undefined && configuredRetAge !== null) {
            this.targetRetirementAge = Number(configuredRetAge);
            this.targetRetirementYear = this.birthYear + this.targetRetirementAge;
            this.targetRetirementMonth = Number(state.targetRetirementMonth ?? state.retirementMonth) || 1;
            this.targetRetirementDate = `${this.targetRetirementYear}-${String(this.targetRetirementMonth).padStart(2, '0')}`;
        } else {
            this.targetRetirementAge = 65;
            this.targetRetirementYear = this.birthYear + 65;
            this.targetRetirementMonth = 1;
            this.targetRetirementDate = `${this.targetRetirementYear}-01`;
        }
    }

    _initSocialSecurity(state) {
        if (state.socialSecurityStartDate && typeof state.socialSecurityStartDate === 'string') {
            const { year: ssnYear, month: ssnMonth } = parseDateParts(state.socialSecurityStartDate, this.birthYear + 67, 1);
            this.socialSecurityStartMonth = ssnMonth;
            this.socialSecurityStartAge = ssnYear - this.birthYear;
            this.socialSecurityStartDate = `${ssnYear}-${String(ssnMonth).padStart(2, '0')}`;
        } else {
            this.socialSecurityStartAge = state.socialSecurityStartAge !== undefined && state.socialSecurityStartAge !== null ? Number(state.socialSecurityStartAge) : 67;
            this.socialSecurityStartMonth = Number(state.socialSecurityStartMonth) || 1;
            const ssnYear = this.birthYear + this.socialSecurityStartAge;
            this.socialSecurityStartDate = `${ssnYear}-${String(this.socialSecurityStartMonth).padStart(2, '0')}`;
        }
        this.socialSecurityMonthlyBenefit = state.socialSecurityMonthlyBenefit !== undefined && state.socialSecurityMonthlyBenefit !== null
            ? Number(state.socialSecurityMonthlyBenefit)
            : (state.socialSecurityAnnualBenefit !== undefined ? (Number(state.socialSecurityAnnualBenefit) / 12) : 0);
        this.socialSecurityAnnualBenefit = this.socialSecurityMonthlyBenefit * 12;
    }

    _initRule72t(state) {
        const rule72tState = state.rule72t || {};
        let r72tAge = Number(rule72tState.startAge) || 55;
        let r72tMonth = Number(rule72tState.startMonth) || 1;
        let r72tDate = `${this.birthYear + r72tAge}-${String(r72tMonth).padStart(2, '0')}`;

        if (rule72tState.startDate && typeof rule72tState.startDate === 'string') {
            const { year: rYear, month: rMonth } = parseDateParts(rule72tState.startDate, this.birthYear + r72tAge, r72tMonth);
            r72tMonth = rMonth;
            r72tAge = rYear - this.birthYear;
            r72tDate = `${rYear}-${String(r72tMonth).padStart(2, '0')}`;
        }

        this.rule72t = {
            enabled: Boolean(rule72tState.enabled),
            startAge: r72tAge,
            startMonth: r72tMonth,
            startDate: r72tDate,
            sourceAccount: rule72tState.sourceAccount || 'standardIra',
            targetIraMode: rule72tState.targetIraMode || 'existing',
            newIraName: rule72tState.newIraName || rule72tState.targetAccountName || `${this.name || 'Spouse'} 72(t) IRA`,
            splitAmount: (rule72tState.splitAmount !== undefined && rule72tState.splitAmount !== null && rule72tState.splitAmount !== '') ? Number(rule72tState.splitAmount) : null,
            targetAccount: rule72tState.targetAccount || rule72tState.targetAccountId || rule72tState.targetIraId || rule72tState.sourceAccount || 'standardIra'
        };
        this.rule72tMethod = state.rule72tMethod || 'amortization';
    }

    _initJobs(state) {
        this.jobs = (state.jobs || []).map(j => ({ ...j }));
        this.jobs.sort((a, b) => {
            if (!a.startDate) return -1;
            if (!b.startDate) return 1;
            return a.startDate.localeCompare(b.startDate);
        });
    }

    _initAccounts(state) {
        this.accounts = [];
        this._bindAccountGetters();
        for (const accState of (state.accounts || [])) {
            const accInst = createAccountInstance(accState);
            if (accInst) {
                this.accounts.push(accInst);
            }
        }
    }

    _bindAccountGetters() {
        const personRef = this;
        const defineGetter = (propKey, type) => {
            Object.defineProperty(this.accounts, propKey, {
                get: function() {
                    const found = this.find(a => a.type === type);
                    if (found) return found;
                    return {
                        type: type,
                        name: type,
                        balance: 0,
                        enabled: false,
                        contributionPercentage: 0,
                        expectedReturn: 0,
                        yearInterest: 0,
                        yearContributions: 0,
                        yearGrowth: 0,
                        grow: () => {},
                        withdraw: () => 0,
                        cohorts: [],
                        addConversion: (amount, year) => {
                            const newRoth = new RothIra(`roth-${personRef.key}`, `${personRef.name} Roth IRA`, 0, 7, 0);
                            newRoth.type = 'rothIra';
                            newRoth.addConversion(amount, year);
                            personRef.accounts.push(newRoth);
                        }
                    };
                }
            });
        };
        defineGetter('traditional401k', 'traditional401k');
        defineGetter('trad403b', 'trad403b');
        defineGetter('standardIra', 'standardIra');
        defineGetter('rothIra', 'rothIra');
        defineGetter('taxableBrokerage', 'taxableBrokerage');
        defineGetter('hysa', 'hysa');
        defineGetter('cd', 'cd');
        defineGetter('hsa', 'hsa');
    }

    get yearOfBirth() {
        return this.birthYear;
    }

    set yearOfBirth(val) {
        this.birthYear = Number(val);
    }

    getAccount(identifier) {
        if (!identifier) return null;
        return this.accounts.find(a => a.id === identifier || a.name === identifier || a.type === identifier) || null;
    }

    getAge(currentYear) {
        return currentYear - this.birthYear;
    }

    isRetired(currentYear, currentMonth = 1) {
        if (this.targetRetirementYear !== undefined) {
            return currentYear > this.targetRetirementYear || (currentYear === this.targetRetirementYear && currentMonth >= this.targetRetirementMonth);
        }
        return this.getAge(currentYear) >= this.targetRetirementAge;
    }

    is72tActive(currentYear, currentMonth = null) {
        if (!this.rule72t || !this.rule72t.enabled) return false;
        const startAge = Number(this.rule72t.startAge) || 55;
        const startYear = this.birthYear + startAge;
        const startMonth = Number(this.rule72t.startMonth) || 1;
        const durationYears = Math.max(5, 59.5 - startAge);
        const endFractionalYear = startYear + (startMonth - 1) / 12 + durationYears;

        const currentFractionalYear = currentYear + ((currentMonth !== null ? currentMonth : 1) - 1) / 12;
        const started = currentMonth !== null
            ? (currentYear > startYear || (currentYear === startYear && currentMonth >= startMonth))
            : (currentYear >= startYear);
        return started && currentFractionalYear < endFractionalYear;
    }

    getSalary(currentYear, events = null, w2Multiplier = 1, startMonth = 1) {
        let total = 0;
        for (let month = startMonth; month <= 12; month++) {
            if (this.isRetired(currentYear, month)) continue;
            const activeJob = findActiveJob(this.jobs, currentYear, month);
            total += calculateMonthPay(activeJob, month, events, this.name, w2Multiplier);
        }
        return total;
    }

    getSalaryForMonth(currentYear, month, events = null, w2Multiplier = 1) {
        if (this.isRetired(currentYear, month)) return 0;
        const activeJob = findActiveJob(this.jobs, currentYear, month);
        return calculateMonthPay(activeJob, month, events, this.name, w2Multiplier);
    }

    getJobBreakdown(currentYear, w2Multiplier = 1, startMonth = 1) {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const jobMap = new Map();

        for (let month = startMonth; month <= 12; month++) {
            if (this.isRetired(currentYear, month)) continue;
            const activeJob = findActiveJob(this.jobs, currentYear, month);
            if (!activeJob) continue;

            const jobId = activeJob.id || activeJob.title || 'job';
            if (!jobMap.has(jobId)) {
                jobMap.set(jobId, {
                    id: activeJob.id,
                    linked401kAccountId: activeJob.linked401kAccountId,
                    linkedHsaAccountId: activeJob.linkedHsaAccountId,
                    hsaAnnualContribution: activeJob.hsaAnnualContribution,
                    hsaStartYear: activeJob.hsaStartYear,
                    hsaEndYear: activeJob.hsaEndYear,
                    startDate: activeJob.startDate,
                    title: activeJob.title || 'Job',
                    contributionPercentage: activeJob.contributionPercentage,
                    employer100PercentMatchOnTheFirstXPercent: activeJob.employer100PercentMatchOnTheFirstXPercent,
                    employer50PercentMatchOnTheNextXPercent: activeJob.employer50PercentMatchOnTheNextXPercent,
                    employerMatchBonusPercentage: activeJob.employerMatchBonusPercentage,
                    months: [],
                    baseSalary: 0,
                    bonus: 0,
                    bonusMonth: activeJob.bonusMonth ? parseInt(activeJob.bonusMonth, 10) : null,
                    lti: 0,
                    ltiMonth: activeJob.ltiMonth ? parseInt(activeJob.ltiMonth, 10) : null,
                    total: 0
                });
            }

            const record = jobMap.get(jobId);
            record.months.push(month);
            const monthlyBase = ((parseInt(activeJob.baseSalary, 10) || 0) / 12) * w2Multiplier;
            record.baseSalary += monthlyBase;
            record.total += monthlyBase;

            const bMonth = parseInt(activeJob.bonusMonth, 10);
            if (!isNaN(bMonth) && bMonth === month && parseInt(activeJob.bonusAmount, 10) > 0) {
                const bonusVal = (parseInt(activeJob.bonusAmount, 10) || 0) * w2Multiplier;
                record.bonus += bonusVal;
                record.total += bonusVal;
            }

            const lMonth = parseInt(activeJob.ltiMonth, 10);
            if (!isNaN(lMonth) && lMonth === month && parseInt(activeJob.ltiAmount, 10) > 0) {
                const ltiVal = (parseInt(activeJob.ltiAmount, 10) || 0) * w2Multiplier;
                record.lti += ltiVal;
                record.total += ltiVal;
            }
        }

        return Array.from(jobMap.values()).map(r => {
            const firstM = monthNames[r.months[0] - 1];
            const lastM = monthNames[r.months[r.months.length - 1] - 1];
            const rangeLabel = (r.months.length === 12) ? 'Full Year' : (firstM === lastM ? firstM : `${firstM}–${lastM}`);
            return {
                id: r.id,
                linked401kAccountId: r.linked401kAccountId,
                linkedHsaAccountId: r.linkedHsaAccountId,
                hsaAnnualContribution: r.hsaAnnualContribution,
                hsaStartYear: r.hsaStartYear,
                hsaEndYear: r.hsaEndYear,
                startDate: r.startDate,
                title: r.title,
                contributionPercentage: r.contributionPercentage,
                employer100PercentMatchOnTheFirstXPercent: r.employer100PercentMatchOnTheFirstXPercent,
                employer50PercentMatchOnTheNextXPercent: r.employer50PercentMatchOnTheNextXPercent,
                employerMatchBonusPercentage: r.employerMatchBonusPercentage,
                rangeLabel,
                baseSalary: r.baseSalary,
                bonus: r.bonus,
                bonusMonthName: r.bonusMonth && monthNames[r.bonusMonth - 1] ? monthNames[r.bonusMonth - 1] : '',
                lti: r.lti,
                ltiMonthName: r.ltiMonth && monthNames[r.ltiMonth - 1] ? monthNames[r.ltiMonth - 1] : '',
                total: r.total
            };
        });
    }

    getTotalPreTaxBalance() {
        let total = 0;
        for (const acc of this.accounts) {
            if (acc.type === 'traditional401k' || acc.type === 'trad403b' || acc.type === 'standardIra') {
                total += acc.balance;
            }
        }
        return total;
    }

    /**
     * Calculates official SSA benefit multiplier relative to Full Retirement Age (FRA = 67).
     * @param {number} [startAge] Claiming age (defaults to person's socialSecurityStartAge)
     * @returns {number} Multiplier (e.g. 0.70 at age 62, 1.00 at age 67, 1.24 at age 70)
     */
    getSocialSecurityMultiplier(startAge = this.socialSecurityStartAge) {
        const fra = 67;
        const claimAge = Math.max(62, Number(startAge) || fra);
        const monthsDiff = Math.round((claimAge - fra) * 12);

        if (monthsDiff === 0) {
            return 1.0;
        }

        if (monthsDiff < 0) {
            // Early claiming reduction (Ages 62 to 67, up to 60 months)
            const monthsEarly = Math.min(60, -monthsDiff);
            if (monthsEarly <= 36) {
                // First 36 months: 5/9 of 1% per month (up to 20%)
                return 1.0 - (monthsEarly * (5 / 900));
            } else {
                // Next 24 months (months 37-60): 5/12 of 1% per month (up to additional 10%)
                const first36 = 36 * (5 / 900); // 0.20
                const remaining = (monthsEarly - 36) * (5 / 1200);
                return 1.0 - (first36 + remaining);
            }
        } else {
            // Delayed retirement credits (Ages 67 to 70, up to 36 months, 8% per year)
            const monthsDelayed = Math.min(36, monthsDiff);
            return 1.0 + (monthsDelayed * (8 / 1200));
        }
    }
}

