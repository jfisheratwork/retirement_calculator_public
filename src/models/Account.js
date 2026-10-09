export class Account {
    constructor(id, name, balance = 0, expectedReturn = 0, contributionPercentage = 0) {
        this.id = id;
        this.name = name;
        this.balance = Number(balance) || 0;
        this.expectedReturn = Number(expectedReturn) || 0;
        this.contributionPercentage = Number(contributionPercentage) || 0;
        this.isActiveContributor = true;
        this.isSweepAccount = false;

        this.startOfYearBalance = this.balance;
        this.yearContributions = 0;
        this.yearConversionsIn = 0;
        this.yearConversionsOut = 0;
        this.yearRolloverIn = 0;
        this.yearRolloverOut = 0;
        this.yearGrowth = 0;
        this.yearInterest = 0;
        this.yearWithdrawals = 0;
    }

    resetYearlyStats() {
        this.startOfYearBalance = this.balance;
        this.yearContributions = 0;
        this.yearConversionsIn = 0;
        this.yearConversionsOut = 0;
        this.yearRolloverIn = 0;
        this.yearRolloverOut = 0;
        this.yearGrowth = 0;
        this.yearInterest = 0;
        this.yearWithdrawals = 0;
    }

    grow(returnRate) {
        const rate = (returnRate !== undefined) ? returnRate : (this.expectedReturn / 100);
        const growth = this.balance * rate;
        this.balance += growth;
        this.yearGrowth += growth;
        this.yearInterest += growth;
    }

    contribute(amount) {
        const num = Number(amount) || 0;
        this.balance += num;
        this.yearContributions += num;
    }

    /**
     * @returns {number} The amount successfully withdrawn
     */
    withdraw(amount, _ownerAge = 0, _is72tActive = false, events = null, accountName = '') {
        if (amount <= 0) return 0;
        const available = Math.max(0, this.balance);
        const drawn = Math.min(available, amount);
        this.balance -= drawn;
        this.yearWithdrawals += drawn;
        if (drawn < amount && events) {
            events.push({ type: 'withdrawal_shortfall', account: accountName || this.name, requested: amount, fulfilled: drawn, reason: 'Insufficient funds' });
        }
        return drawn;
    }
}

export class PreTaxAccount extends Account {
    constructor(id, name, balance, expectedReturn, contributionPercentage) {
        super(id, name, balance, expectedReturn, contributionPercentage);
    }

    withdraw(amount, ownerAge = 0, is72tActive = false, events = null, accountName = '') {
        if (ownerAge < 59.5 && !is72tActive) {
            if (events) {
                events.push({ type: 'withdrawal_blocked', account: accountName || this.name, requested: amount, fulfilled: 0, reason: `Blocked by age restriction (Age ${Math.floor(ownerAge)} < 59.5) and no 72(t) active.` });
            }
            return 0; 
        }
        return super.withdraw(amount, ownerAge, is72tActive, events, accountName);
    }
}

export class Trad401k extends PreTaxAccount {
    constructor(id, name, balance, expectedReturn, contributionPercentage, employerMatchConfig = {}) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'traditional401k';
        this.employerMatchConfig = employerMatchConfig;
    }
}

export class Trad403b extends PreTaxAccount {
    constructor(id, name, balance, expectedReturn, contributionPercentage, employerMatchConfig = {}) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'trad403b';
        this.employerMatchConfig = employerMatchConfig;
    }
}

export class StandardIra extends PreTaxAccount {
    constructor(id, name, balance, expectedReturn, contributionPercentage) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'standardIra';
    }
}

export class TaxableBrokerage extends Account {
    constructor(id, name, balance, expectedReturn, contributionPercentage, costBasis = null) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'taxableBrokerage';
        this.costBasis = (costBasis !== null && costBasis !== undefined) ? Number(costBasis) : (this.balance * 0.5);
    }

    contribute(amount) {
        const num = Number(amount) || 0;
        super.contribute(num);
        this.costBasis += num;
    }

    withdrawWithGains(amount, events = null, accountName = '') {
        const drawn = this.withdraw(amount, 0, false, events, accountName);
        if (drawn <= 0) return { drawn: 0, realizedGain: 0, basisDrawn: 0 };

        const priorBalance = this.balance + drawn;
        const gainRatio = priorBalance > 0 ? Math.max(0, (priorBalance - this.costBasis) / priorBalance) : 0;
        const realizedGain = drawn * gainRatio;
        const basisDrawn = drawn - realizedGain;
        this.costBasis = Math.max(0, this.costBasis - basisDrawn);

        return { drawn, realizedGain, basisDrawn };
    }
}

export class Hysa extends Account {
    constructor(id, name, balance, expectedReturn, contributionPercentage) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'hysa';
    }
}

export class CdAccount extends Account {
    constructor(id, name, balance, expectedReturn = 5, contributionPercentage = 0, config = {}) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'cd';
        this.rate = (config.rate !== undefined && config.rate !== null) ? Number(config.rate) : (Number(expectedReturn) || 5);
        this.maturityDate = config.maturityDate || `${new Date().getFullYear() + 1}-01`;
        this.maturityAction = config.maturityAction || 'sweep'; // 'sweep' or 'rollover'
        this.sweepTargetAccountId = config.sweepTargetAccountId || '';
        this.rolloverCount = (config.rolloverCount !== undefined && config.rolloverCount !== null) ? Number(config.rolloverCount) : 1;
        this.rolloversCompleted = 0;
        this.isMatured = false;
        this.termMonths = Number(config.termMonths) || (Number(config.termYears) ? Number(config.termYears) * 12 : 12);
        this.termYears = this.termMonths / 12;
    }

    grow(returnRate) {
        const rate = (returnRate !== undefined) ? returnRate : (this.rate / 100);
        super.grow(rate);
    }
}

export class RothIra extends Account {
    constructor(id, name, balance, expectedReturn, contributionPercentage = 0, config = {}) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'rothIra';
        this.annualContribution = (config.annualContribution !== undefined && config.annualContribution !== null && config.annualContribution !== '')
            ? Number(config.annualContribution)
            : 7000;
        this.autoContribute = Boolean(config.autoContribute);
        this.startYear = config.startYear ? Number(config.startYear) : null;
        this.stopYear = config.stopYear ? Number(config.stopYear) : null;
        this.principle = (config.principle !== undefined && config.principle !== null && config.principle !== '')
            ? Number(config.principle)
            : this.balance;
        this.cohorts = [];
        if (this.balance > 0) {
            const initialPrincipal = Math.min(this.balance, Math.max(0, this.principle));
            this.cohorts.push({
                maturityYear: 0,
                originalAmount: initialPrincipal,
                balance: this.balance
            });
        }
    }

    addContribution(amount) {
        this.balance += amount;
        this.yearContributions = (this.yearContributions || 0) + amount;
        // Direct contributions under IRC § 408A(d) can be withdrawn at any time and any age
        // without penalty. Setting maturityYear: 0 ensures currentYear >= maturityYear is always true.
        this.cohorts.push({
            maturityYear: 0,
            originalAmount: amount,
            balance: amount
        });
    }

    addConversion(amount, conversionYear) {
        this.balance += amount;
        this.yearConversionsIn = (this.yearConversionsIn || 0) + amount;
        this.cohorts.push({
            maturityYear: conversionYear + 5,
            originalAmount: amount,
            balance: amount
        });
    }

    grow(returnRate) {
        super.grow(returnRate);
        for (const c of this.cohorts) {
            if (c.balance > 0) {
                c.balance *= (1 + returnRate);
            }
        }
    }

    getRothPrincipalBreakdown(currentYear, ownerAge = 0) {
        let withdrawablePrincipal = 0;
        let immaturePrincipal = 0;
        let totalOriginal = 0;

        for (const c of this.cohorts) {
            const avail = Math.min(c.balance, c.originalAmount);
            totalOriginal += c.originalAmount;
            if (c.originalAmount > 0) {
                if (currentYear >= c.maturityYear || ownerAge >= 59.5) {
                    withdrawablePrincipal += avail;
                } else {
                    immaturePrincipal += avail;
                }
            }
        }

        const earnings = Math.max(0, this.balance - totalOriginal);

        return {
            totalBalance: this.balance,
            withdrawablePrincipal: Math.round(withdrawablePrincipal),
            immaturePrincipal: Math.round(immaturePrincipal),
            earnings: Math.round(earnings)
        };
    }

    withdrawMaturedPrincipal(amountLeft, currentYear, ownerAge = 0) {
        let drawn = 0;
        for (const c of this.cohorts) {
            if (amountLeft - drawn <= 0) break;
            const isMatured = (currentYear >= c.maturityYear) || (ownerAge >= 59.5);
            if (isMatured && c.originalAmount > 0) {
                const principalAvailable = Math.min(c.balance, c.originalAmount);
                if (principalAvailable > 0) {
                    const d = Math.min(principalAvailable, amountLeft - drawn);
                    c.balance -= d;
                    c.originalAmount -= d;
                    this.balance -= d;
                    this.yearWithdrawals += d;
                    drawn += d;
                }
            }
        }
        return drawn;
    }

    withdrawEarnings(amountLeft, ownerAge) {
        if (ownerAge < 59.5) return { drawn: 0, blocked: true };
        let drawn = 0;
        for (const c of this.cohorts) {
            if (amountLeft - drawn <= 0) break;
            if (c.balance > 0) {
                const d = Math.min(c.balance, amountLeft - drawn);
                c.balance -= d;
                this.balance -= d;
                this.yearWithdrawals += d;
                drawn += d;
            }
        }
        return { drawn, blocked: false };
    }

    withdraw(amount, ownerAge, currentYear, events = null, accountName = '') {
        if (amount <= 0) return 0;
        let amountLeft = amount;
        
        // 1. Pull from matured principal (5-year rule OR age >= 59.5 per IRC § 408A(d)(3)(F))
        const principalDrawn = this.withdrawMaturedPrincipal(amountLeft, currentYear, ownerAge);
        amountLeft -= principalDrawn;

        // 2. Pull from remaining earnings if age >= 59.5
        let earningsBlocked = false;
        let earningsDrawn = 0;
        if (amountLeft > 0) {
            const res = this.withdrawEarnings(amountLeft, ownerAge);
            earningsDrawn = res.drawn;
            earningsBlocked = res.blocked;
            amountLeft -= earningsDrawn;
        }

        const totalDrawn = principalDrawn + earningsDrawn;
        if (totalDrawn < amount && events) {
            let principalBlocked = 0;
            for (const c of this.cohorts) {
                if (currentYear < c.maturityYear && ownerAge < 59.5 && c.originalAmount > 0) {
                    principalBlocked += Math.min(c.balance, c.originalAmount);
                }
            }
            const reasons = [];
            if (principalBlocked > 0) reasons.push(`$${Math.round(principalBlocked).toLocaleString()} principal blocked by 5-year rule.`);
            if (earningsBlocked) reasons.push(`Earnings blocked (Age ${Math.floor(ownerAge)} < 59.5).`);
            if (reasons.length === 0) reasons.push('Insufficient funds.');
            events.push({ type: 'withdrawal_shortfall', account: accountName || this.name, requested: amount, fulfilled: totalDrawn, reason: reasons.join(' ') });
        }
        return totalDrawn;
    }
}

export class Hsa extends Account {
    constructor(id, name, balance = 0, expectedReturn = 6, contributionPercentage = 0, config = {}) {
        super(id, name, balance, expectedReturn, contributionPercentage);
        this.type = 'hsa';
        this.coverageTier = config.coverageTier || 'single';
        this.annualContribution = (config.annualContribution !== undefined && config.annualContribution !== null && config.annualContribution !== '')
            ? Number(config.annualContribution)
            : null;
        this.employerContribution = Number(config.employerContribution) || 0;
    }
}
