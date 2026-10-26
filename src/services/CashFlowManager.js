const DEFAULT_STANDARD_DEDUCTION = 29200;
const DEFAULT_BRACKET_12_CEILING = 94300;
const DEFAULT_TIER_AGE = 60;
const STATUTORY_PENALTY_FREE_AGE = 59.5;
const DEFAULT_RM_START_AGE = 65;
const DEFAULT_HOME_GROWTH_RATE = 3;

function isReverseMortgageActiveConfig(primaryResidenceEquity) {
    return Boolean(
        primaryResidenceEquity?.reverseMortgageEnabled ??
            primaryResidenceEquity?.reverseMortgage?.enabled ??
            primaryResidenceEquity?.enabled
    );
}

/**
 * Manages portfolio withdrawals, reverse mortgage draws, cash cushion buffers, and shortfall fulfillment.
 */
export class CashFlowManager {
    static _createWithdrawalContext({ amountNeeded, year, stateRate, snapshot, onPreTaxTaxable, onLtcgRealized }) {
        const ctx = {
            amountLeft: amountNeeded,
            year,
            stateRate,
            snapshot,
            onPreTaxTaxable,
            onLtcgRealized
        };

        ctx.tryPullPreTax = (spouse, type, maxDraw = Infinity, allowEarlyPenalty = false) =>
            CashFlowManager._tryPullPreTax(ctx, spouse, type, maxDraw, allowEarlyPenalty);
        ctx.tryPullLiquid = (spouse, type) => CashFlowManager._tryPullLiquid(ctx, spouse, type);
        ctx.pullRothPrincipal = (spouse) => CashFlowManager._pullRothPrincipal(ctx, spouse);
        ctx.pullRothEarnings = (spouse) => CashFlowManager._pullRothEarnings(ctx, spouse);

        return ctx;
    }

    static _isPenaltyExemptPreTax(age, account, isRuleOf55Eligible) {
        if (age >= STATUTORY_PENALTY_FREE_AGE) return true;
        if (!account || typeof account._isRuleOf55Exempt !== 'function') return false;
        return Boolean(account._isRuleOf55Exempt(age, isRuleOf55Eligible));
    }

    static _recordPenalizedDrawdown(snapshot, spouseKey, amount, isPenaltyExempt, allowEarlyPenalty) {
        if (!allowEarlyPenalty || isPenaltyExempt) return;
        snapshot.income.drawdowns.penalizedPreTax = (snapshot.income.drawdowns.penalizedPreTax || 0) + amount;
        const spousePenaltyKey = `${spouseKey}PenalizedPreTax`;
        if (snapshot.income.drawdowns[spousePenaltyKey] !== undefined) {
            snapshot.income.drawdowns[spousePenaltyKey] += amount;
        }
    }

    static _resolveAccountsForType(spouse, type, options = {}) {
        if (!spouse) return [];
        if (typeof spouse.getAccountsByType === 'function') {
            return spouse.getAccountsByType(type, options);
        }
        if (Array.isArray(spouse.accounts)) {
            return spouse.accounts
                .filter((a) => a && a.type === type && a.enabled !== false)
                .sort((a, b) => Number(Boolean(a._is72tDedicated)) - Number(Boolean(b._is72tDedicated)));
        }
        const fallback = spouse.accounts?.[type];
        return fallback && fallback.enabled !== false ? [fallback] : [];
    }

    static _withdrawSinglePreTaxAccount(ctx, spouse, account, maxDraw, allowEarlyPenalty) {
        const type = account.type;
        const age = spouse.getAge(ctx.year);
        const isRuleOf55Eligible =
            typeof spouse.isRuleOf55Eligible === 'function' ? spouse.isRuleOf55Eligible(ctx.year) : false;
        const isPenaltyExempt = CashFlowManager._isPenaltyExemptPreTax(age, account, isRuleOf55Eligible);
        const grossNeeded = Math.min(ctx.amountLeft, maxDraw) / (1 - ctx.stateRate);

        const d = account.withdraw(
            grossNeeded,
            age,
            { is72tActive: false, isRuleOf55Eligible, allowEarlyPenalty },
            ctx.snapshot.events,
            `${spouse.name} ${type}`
        );
        if (d <= 0) return 0;

        ctx.snapshot.recordDrawdown(spouse.key, type, d);
        CashFlowManager._recordPenalizedDrawdown(ctx.snapshot, spouse.key, d, isPenaltyExempt, allowEarlyPenalty);

        const netProvided = d * (1 - ctx.stateRate);
        ctx.amountLeft -= netProvided;
        if (ctx.onPreTaxTaxable) {
            ctx.onPreTaxTaxable(d);
        }
        return netProvided;
    }

    static _tryPullPreTax(ctx, spouse, type, maxDraw = Infinity, allowEarlyPenalty = false) {
        if (ctx.amountLeft <= 0 || maxDraw <= 0 || !spouse) return 0;
        if (allowEarlyPenalty && type === 'trad403b') return 0;

        const accounts = CashFlowManager._resolveAccountsForType(spouse, type, {
            excludeLocked72tInYear: allowEarlyPenalty ? null : ctx.year
        });
        let totalNetProvided = 0;
        let remainingMaxDraw = maxDraw;

        for (const account of accounts) {
            if (ctx.amountLeft <= 0 || remainingMaxDraw <= 0) break;
            const netProvided = CashFlowManager._withdrawSinglePreTaxAccount(
                ctx,
                spouse,
                account,
                remainingMaxDraw,
                allowEarlyPenalty
            );
            remainingMaxDraw -= netProvided;
            totalNetProvided += netProvided;
        }
        return totalNetProvided;
    }

    static _withdrawSingleLiquidAccount(ctx, spouse, account, type) {
        if (type === 'taxableBrokerage' && typeof account.withdrawWithGains === 'function') {
            const res = account.withdrawWithGains(
                ctx.amountLeft,
                ctx.snapshot.events,
                `${spouse.name} taxableBrokerage`
            );
            if (res.drawn > 0) {
                ctx.snapshot.recordDrawdown(spouse.key, type, res.drawn);
                ctx.amountLeft -= res.drawn;
                if (res.realizedGain > 0 && ctx.onLtcgRealized) {
                    ctx.onLtcgRealized(res.realizedGain);
                }
            }
            return;
        }

        const d = account.withdraw(ctx.amountLeft, 0, false, ctx.snapshot.events, `${spouse.name} ${type}`);
        if (d > 0) {
            ctx.snapshot.recordDrawdown(spouse.key, type, d);
            ctx.amountLeft -= d;
        }
    }

    static _tryPullLiquid(ctx, spouse, type) {
        if (ctx.amountLeft <= 0 || !spouse) return;
        const accounts = CashFlowManager._resolveAccountsForType(spouse, type);
        for (const account of accounts) {
            if (ctx.amountLeft <= 0) break;
            CashFlowManager._withdrawSingleLiquidAccount(ctx, spouse, account, type);
        }
    }

    static _pullRothPrincipal(ctx, spouse) {
        if (ctx.amountLeft <= 0 || !spouse) return;
        const rothAccounts = CashFlowManager._resolveAccountsForType(spouse, 'rothIra');
        for (const account of rothAccounts) {
            if (ctx.amountLeft <= 0) break;
            const d = account.withdraw(ctx.amountLeft, 0, ctx.year, ctx.snapshot.events, `${spouse.name} Roth IRA`);
            if (d > 0) {
                ctx.amountLeft -= d;
                ctx.snapshot.recordDrawdown(spouse.key, 'rothIra', d);
            }
        }
    }

    static _pullRothEarnings(ctx, spouse) {
        if (ctx.amountLeft <= 0 || !spouse) return;
        const age = spouse.getAge(ctx.year);
        if (age < STATUTORY_PENALTY_FREE_AGE) return;

        const rothAccounts = CashFlowManager._resolveAccountsForType(spouse, 'rothIra');
        for (const account of rothAccounts) {
            if (ctx.amountLeft <= 0) break;
            const d = account.withdraw(
                ctx.amountLeft,
                age,
                ctx.year,
                ctx.snapshot.events,
                `${spouse.name} Roth IRA Earnings`
            );
            if (d > 0) {
                ctx.amountLeft -= d;
                ctx.snapshot.recordDrawdown(spouse.key, 'rothIra', d);
            }
        }
    }

    static _executeStandardWaterfall(ctx, s1, s2) {
        ctx.pullRothPrincipal(s1);
        ctx.pullRothPrincipal(s2);

        ctx.tryPullLiquid(s1, 'hysa');
        ctx.tryPullLiquid(s2, 'hysa');
        ctx.tryPullLiquid(s1, 'taxableBrokerage');
        ctx.tryPullLiquid(s2, 'taxableBrokerage');

        ctx.tryPullPreTax(s1, 'trad403b');
        ctx.tryPullPreTax(s2, 'trad403b');
        ctx.tryPullPreTax(s1, 'traditional401k');
        ctx.tryPullPreTax(s2, 'traditional401k');
        ctx.tryPullPreTax(s1, 'standardIra');
        ctx.tryPullPreTax(s2, 'standardIra');

        ctx.pullRothEarnings(s1);
        ctx.pullRothEarnings(s2);
    }

    static _executePenalizedPreTaxFallback(ctx, s1, s2) {
        if ((ctx.snapshot?.expenses || 0) <= 0) return;
        // 403(b) accounts (trad403b) are strictly excluded from early penalized withdrawals (SPEC-087)
        const preTaxTypes = ['traditional401k', 'standardIra'];
        for (const type of preTaxTypes) {
            if (ctx.amountLeft <= 0) break;
            ctx.tryPullPreTax(s1, type, Infinity, true);
            if (ctx.amountLeft > 0) {
                ctx.tryPullPreTax(s2, type, Infinity, true);
            }
        }
    }

    static _applyLowBracketOptimization(ctx, { s1, s2, taxYearData, filingStatus, currentTaxableIncome }) {
        const statusData = taxYearData[filingStatus] || taxYearData.mfj || taxYearData;
        const standardDeduction = statusData.standardDeduction || DEFAULT_STANDARD_DEDUCTION;
        const bracket12Ceiling = statusData.brackets?.[1]?.upTo || DEFAULT_BRACKET_12_CEILING;
        const maxLowTaxable = standardDeduction + bracket12Ceiling;
        const roomInLowBracket = Math.max(0, maxLowTaxable - currentTaxableIncome);

        if (roomInLowBracket > 0) {
            CashFlowManager._executeTaxOptimizedPreTaxDraws(
                s1,
                s2,
                roomInLowBracket,
                ctx.amountLeft,
                ctx.tryPullPreTax
            );
        }
    }

    static _pullCushionAndReverseMortgage(ctx, cashCushion, primaryResidenceEquity, snapshot) {
        if (ctx.amountLeft > 0 && cashCushion?.value > 0) {
            const d = Math.min(cashCushion.value, ctx.amountLeft);
            cashCushion.value -= d;
            ctx.amountLeft -= d;
            snapshot.income.drawdowns.cashCushion += d;
        }

        if (
            ctx.amountLeft > 0 &&
            isReverseMortgageActiveConfig(primaryResidenceEquity) &&
            primaryResidenceEquity.active
        ) {
            const d = Math.min(primaryResidenceEquity.currentValue, ctx.amountLeft);
            primaryResidenceEquity.currentValue -= d;
            ctx.amountLeft -= d;
            snapshot.income.reverseMortgage += d;
        }
    }

    static _executeRuleOf55WorkplaceFallback(ctx, s1, s2) {
        // 403(b) accounts (trad403b) are strictly excluded from early withdrawals (SPEC-087)
        const workplaceTypes = ['traditional401k'];
        for (const type of workplaceTypes) {
            if (ctx.amountLeft <= 0) break;
            if (s1 && typeof s1.isRuleOf55Eligible === 'function' && s1.isRuleOf55Eligible(ctx.year)) {
                ctx.tryPullPreTax(s1, type, Infinity, false);
            }
            if (
                ctx.amountLeft > 0 &&
                s2 &&
                typeof s2.isRuleOf55Eligible === 'function' &&
                s2.isRuleOf55Eligible(ctx.year)
            ) {
                ctx.tryPullPreTax(s2, type, Infinity, false);
            }
        }
    }

    static withdrawFromPortfolios({
        amountNeeded,
        year,
        s1,
        s2,
        stateRate,
        snapshot,
        cashCushion,
        primaryResidenceEquity,
        onPreTaxTaxable,
        onLtcgRealized,
        drawdownStrategy = 'standard',
        drawdownTierAge = DEFAULT_TIER_AGE,
        taxYearData = null,
        currentTaxableIncome = 0,
        filingStatus = 'mfj',
        allowEarlyPenalizedWithdrawals = false
    }) {
        const ctx = CashFlowManager._createWithdrawalContext({
            amountNeeded,
            year,
            stateRate,
            snapshot,
            onPreTaxTaxable,
            onLtcgRealized
        });

        if (drawdownStrategy === 'tax_optimized' && taxYearData) {
            CashFlowManager._applyLowBracketOptimization(ctx, {
                s1,
                s2,
                taxYearData,
                filingStatus,
                currentTaxableIncome
            });
        }

        const isAgeTiered = drawdownStrategy === 'age_tiered_60' || drawdownStrategy === 'age_tiered';
        if (isAgeTiered) {
            CashFlowManager._executeAgeTieredDrawdowns({
                s1,
                s2,
                year,
                tierAge: Number(drawdownTierAge) || DEFAULT_TIER_AGE,
                tryPullPreTax: ctx.tryPullPreTax,
                pullRothPrincipal: ctx.pullRothPrincipal,
                pullRothEarnings: ctx.pullRothEarnings,
                tryPullLiquid: ctx.tryPullLiquid
            });
        } else {
            CashFlowManager._executeStandardWaterfall(ctx, s1, s2);
        }

        CashFlowManager._pullCushionAndReverseMortgage(ctx, cashCushion, primaryResidenceEquity, snapshot);

        if (ctx.amountLeft > 0) {
            CashFlowManager._executeRuleOf55WorkplaceFallback(ctx, s1, s2);
        }

        if (ctx.amountLeft > 0 && allowEarlyPenalizedWithdrawals === true) {
            CashFlowManager._executePenalizedPreTaxFallback(ctx, s1, s2);
        }

        return ctx.amountLeft;
    }

    static _activateReverseMortgageIfNeeded(year, primaryResidenceEquity, mortgage, events) {
        if (primaryResidenceEquity.active) return;
        primaryResidenceEquity.active = true;
        if (mortgage?.enabled && mortgage.currentBalance > 0) {
            const payoffAmount = Math.max(0, mortgage.currentBalance);
            primaryResidenceEquity.currentValue = Math.max(0, primaryResidenceEquity.currentValue - payoffAmount);
            mortgage.currentBalance = 0;
            events.push({ year, label: 'RM Paid Off Mortgage', type: 'rm_payoff' });
        }
    }

    static processReverseMortgage({ year, s1, s2, primaryResidenceEquity, mortgage, snapshot, events }) {
        const isEnabled = isReverseMortgageActiveConfig(primaryResidenceEquity);
        const startAge =
            primaryResidenceEquity?.reverseMortgageStartAge ||
            primaryResidenceEquity?.reverseMortgage?.startAge ||
            DEFAULT_RM_START_AGE;

        if (!isEnabled || s1.getAge(year) < startAge) return 0;

        this._activateReverseMortgageIfNeeded(year, primaryResidenceEquity, mortgage, events);

        const s2Remaining = s2 ? s2.lifeExpectancy - s2.getAge(year) : 0;
        const yearsLeft = Math.max(s1.lifeExpectancy - s1.getAge(year), s2Remaining);
        if (yearsLeft <= 0 || primaryResidenceEquity.currentValue <= 0) return 0;

        const rawRate =
            primaryResidenceEquity.annualGrowthRate !== undefined
                ? primaryResidenceEquity.annualGrowthRate
                : DEFAULT_HOME_GROWTH_RATE;
        const rate = rawRate / 100;
        const rawIncome =
            rate === 0
                ? primaryResidenceEquity.currentValue / yearsLeft
                : (rate * primaryResidenceEquity.currentValue) / (1 - Math.pow(1 + rate, -yearsLeft));

        const rmIncome = Math.min(rawIncome, primaryResidenceEquity.currentValue);
        primaryResidenceEquity.currentValue -= rmIncome;
        snapshot.income.reverseMortgage = rmIncome;
        return rmIncome;
    }

    static _executeTaxOptimizedPreTaxDraws(s1, s2, roomInLowBracket, amountLeft, tryPullPreTax) {
        let remainingRoom = roomInLowBracket;
        const preTaxTypes = ['trad403b', 'traditional401k', 'standardIra'];
        for (const type of preTaxTypes) {
            if (remainingRoom <= 0 || amountLeft <= 0) break;
            const drawnS1 = tryPullPreTax(s1, type, remainingRoom);
            remainingRoom -= drawnS1;
            if (remainingRoom > 0 && amountLeft > 0) {
                const drawnS2 = tryPullPreTax(s2, type, remainingRoom);
                remainingRoom -= drawnS2;
            }
        }
    }

    static _executeAgeTieredDrawdowns({
        s1,
        s2,
        year,
        tierAge = DEFAULT_TIER_AGE,
        tryPullPreTax,
        pullRothPrincipal,
        pullRothEarnings,
        tryPullLiquid
    }) {
        const s1Age = s1 ? s1.getAge(year) : 0;
        const s2Age = s2 ? s2.getAge(year) : 0;

        if (s1Age >= tierAge) tryPullPreTax(s1, 'trad403b');
        if (s2Age >= tierAge) tryPullPreTax(s2, 'trad403b');

        pullRothPrincipal(s1);
        pullRothPrincipal(s2);
        pullRothEarnings(s1);
        pullRothEarnings(s2);

        if (s1Age >= tierAge) {
            tryPullPreTax(s1, 'standardIra');
            tryPullPreTax(s1, 'traditional401k');
        }
        if (s2Age >= tierAge) {
            tryPullPreTax(s2, 'standardIra');
            tryPullPreTax(s2, 'traditional401k');
        }

        tryPullLiquid(s1, 'hysa');
        tryPullLiquid(s2, 'hysa');
        tryPullLiquid(s1, 'taxableBrokerage');
        tryPullLiquid(s2, 'taxableBrokerage');
    }
}
