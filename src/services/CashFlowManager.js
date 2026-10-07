/**
 * Manages portfolio withdrawals, reverse mortgage draws, cash cushion buffers, and shortfall fulfillment.
 */
export class CashFlowManager {
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
        drawdownTierAge = 60,
        taxYearData = null,
        currentTaxableIncome = 0,
        filingStatus = 'mfj'
    }) {
        let amountLeft = amountNeeded;

        const tryPullPreTax = (spouse, type, maxDraw = Infinity) => {
            if (amountLeft <= 0 || maxDraw <= 0 || !spouse || !spouse.accounts) return 0;
            const account = spouse.accounts[type];
            if (!account || account.enabled === false) return 0;

            const age = spouse.getAge(year);
            const targetAmount = Math.min(amountLeft, maxDraw);
            const grossNeeded = targetAmount / (1 - stateRate);

            const d = account.withdraw(grossNeeded, age, false, snapshot.events, `${spouse.name} ${type}`);
            if (d > 0) {
                snapshot.recordDrawdown(spouse.key, type, d);
                const netProvided = d * (1 - stateRate);
                amountLeft -= netProvided;
                if (onPreTaxTaxable) {
                    onPreTaxTaxable(d);
                }
                return netProvided;
            }
            return 0;
        };

        const tryPullLiquid = (spouse, type) => {
            if (amountLeft <= 0 || !spouse || !spouse.accounts) return;
            const account = spouse.accounts[type];
            if (!account || account.enabled === false) return;

            if (type === 'taxableBrokerage' && typeof account.withdrawWithGains === 'function') {
                const res = account.withdrawWithGains(amountLeft, snapshot.events, `${spouse.name} taxableBrokerage`);
                if (res.drawn > 0) {
                    snapshot.recordDrawdown(spouse.key, type, res.drawn);
                    amountLeft -= res.drawn;
                    if (res.realizedGain > 0 && onLtcgRealized) {
                        onLtcgRealized(res.realizedGain);
                    }
                }
            } else {
                const d = account.withdraw(amountLeft, 0, false, snapshot.events, `${spouse.name} ${type}`);
                if (d > 0) {
                    snapshot.recordDrawdown(spouse.key, type, d);
                    amountLeft -= d;
                }
            }
        };

        const pullRothPrincipal = (spouse) => {
            if (amountLeft <= 0 || !spouse?.accounts?.rothIra || spouse.accounts.rothIra.enabled === false) return;
            const d = spouse.accounts.rothIra.withdraw(amountLeft, 0, year, snapshot.events, `${spouse.name} Roth IRA`);
            if (d > 0) {
                amountLeft -= d;
                snapshot.recordDrawdown(spouse.key, 'rothIra', d);
            }
        };

        const pullRothEarnings = (spouse) => {
            if (amountLeft <= 0 || !spouse?.accounts?.rothIra || spouse.accounts.rothIra.enabled === false) return;
            const age = spouse.getAge(year);
            if (age >= 59.5) {
                const d = spouse.accounts.rothIra.withdraw(amountLeft, age, year, snapshot.events, `${spouse.name} Roth IRA Earnings`);
                if (d > 0) {
                    amountLeft -= d;
                    snapshot.recordDrawdown(spouse.key, 'rothIra', d);
                }
            }
        };

        // Strategy A: Tax-Optimized Bracket Filling (draw pre-tax up to the 12% bracket threshold first)
        if (drawdownStrategy === 'tax_optimized' && taxYearData) {
            const statusData = taxYearData[filingStatus] || taxYearData.mfj || taxYearData;
            const standardDeduction = statusData.standardDeduction || 29200;
            const bracket12Ceiling = statusData.brackets?.[1]?.upTo || 94300;
            const maxLowTaxable = standardDeduction + bracket12Ceiling;
            const roomInLowBracket = Math.max(0, maxLowTaxable - currentTaxableIncome);

            if (roomInLowBracket > 0) {
                CashFlowManager._executeTaxOptimizedPreTaxDraws(s1, s2, roomInLowBracket, amountLeft, tryPullPreTax);
            }
        }

        // Strategy B: Age-Tiered Drawdown (< TierAge: Roth -> Brokerage | >= TierAge: 403b -> Roth -> IRA -> Brokerage)
        if (drawdownStrategy === 'age_tiered_60' || drawdownStrategy === 'age_tiered') {
            CashFlowManager._executeAgeTieredDrawdowns({
                s1,
                s2,
                year,
                tierAge: Number(drawdownTierAge) || 60,
                tryPullPreTax,
                pullRothPrincipal,
                pullRothEarnings,
                tryPullLiquid
            });
        } else {
            // Standard waterfall
            // 1. Roth Principal (No age limit)
            pullRothPrincipal(s1);
            pullRothPrincipal(s2);

            // 2. Liquid Accounts: HYSA & Taxable Brokerage (with cost basis & capital gains)
            tryPullLiquid(s1, 'hysa');
            tryPullLiquid(s2, 'hysa');
            tryPullLiquid(s1, 'taxableBrokerage');
            tryPullLiquid(s2, 'taxableBrokerage');

            // 3. Pre-tax accounts in order: 403b -> 401k -> StandardIra
            tryPullPreTax(s1, 'trad403b');
            tryPullPreTax(s2, 'trad403b');
            tryPullPreTax(s1, 'traditional401k');
            tryPullPreTax(s2, 'traditional401k');
            tryPullPreTax(s1, 'standardIra');
            tryPullPreTax(s2, 'standardIra');

            // 4. Roth Earnings (Age >= 59.5)
            pullRothEarnings(s1);
            pullRothEarnings(s2);
        }

        // 5. Cushion
        if (amountLeft > 0 && cashCushion.value > 0) {
            const d = Math.min(cashCushion.value, amountLeft);
            cashCushion.value -= d;
            amountLeft -= d;
            snapshot.income.drawdowns.cashCushion += d;
        }

        // 6. Home Equity (Reverse Mortgage manual draw)
        const isReverseMortgageEnabled = Boolean(primaryResidenceEquity?.reverseMortgageEnabled ?? primaryResidenceEquity?.reverseMortgage?.enabled ?? primaryResidenceEquity?.enabled);
        if (amountLeft > 0 && isReverseMortgageEnabled && primaryResidenceEquity.active) {
            const d = Math.min(primaryResidenceEquity.currentValue, amountLeft);
            primaryResidenceEquity.currentValue -= d;
            amountLeft -= d;
            snapshot.income.reverseMortgage += d;
        }

        return amountLeft; // Unfunded shortfall
    }

    static processReverseMortgage({ year, s1, s2, primaryResidenceEquity, mortgage, snapshot, events }) {
        let rmIncome = 0;
        const isReverseMortgageEnabled = Boolean(primaryResidenceEquity?.reverseMortgageEnabled ?? primaryResidenceEquity?.reverseMortgage?.enabled ?? primaryResidenceEquity?.enabled);
        const startAge = primaryResidenceEquity?.reverseMortgageStartAge || primaryResidenceEquity?.reverseMortgage?.startAge || 65;

        if (isReverseMortgageEnabled && s1.getAge(year) >= startAge) {
            if (!primaryResidenceEquity.active) {
                primaryResidenceEquity.active = true;
                if (mortgage.enabled && mortgage.currentBalance > 0) {
                    const payoffAmount = Math.max(0, mortgage.currentBalance);
                    primaryResidenceEquity.currentValue = Math.max(0, primaryResidenceEquity.currentValue - payoffAmount);
                    mortgage.currentBalance = 0;
                    events.push({ year, label: 'RM Paid Off Mortgage', type: 'rm_payoff' });
                }
            }

            const yearsLeft = Math.max(s1.lifeExpectancy - s1.getAge(year), s2.lifeExpectancy - s2.getAge(year));
            if (yearsLeft > 0 && primaryResidenceEquity.currentValue > 0) {
                const rate = (primaryResidenceEquity.annualGrowthRate !== undefined ? primaryResidenceEquity.annualGrowthRate : 3) / 100;
                if (rate === 0) {
                    rmIncome = primaryResidenceEquity.currentValue / yearsLeft;
                } else {
                    rmIncome = (rate * primaryResidenceEquity.currentValue) / (1 - Math.pow(1 + rate, -yearsLeft));
                }
                rmIncome = Math.min(rmIncome, primaryResidenceEquity.currentValue);
                primaryResidenceEquity.currentValue -= rmIncome;
                snapshot.income.reverseMortgage = rmIncome;
            }
        }
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
        tierAge = 60,
        tryPullPreTax,
        pullRothPrincipal,
        pullRothEarnings,
        tryPullLiquid
    }) {
        const s1Age = s1 ? s1.getAge(year) : 0;
        const s2Age = s2 ? s2.getAge(year) : 0;

        // 1. Post-60: Workplace 403(b) first
        if (s1Age >= tierAge) {
            tryPullPreTax(s1, 'trad403b');
        }
        if (s2Age >= tierAge) {
            tryPullPreTax(s2, 'trad403b');
        }

        // 2. Roth IRA (Principal penalty-free at any age; Earnings if age >= 59.5)
        pullRothPrincipal(s1);
        pullRothPrincipal(s2);
        pullRothEarnings(s1);
        pullRothEarnings(s2);

        // 3. Post-60: Traditional IRA and 401(k)
        if (s1Age >= tierAge) {
            tryPullPreTax(s1, 'standardIra');
            tryPullPreTax(s1, 'traditional401k');
        }
        if (s2Age >= tierAge) {
            tryPullPreTax(s2, 'standardIra');
            tryPullPreTax(s2, 'traditional401k');
        }

        // 4. Taxable Brokerage & Liquid Cash
        tryPullLiquid(s1, 'hysa');
        tryPullLiquid(s2, 'hysa');
        tryPullLiquid(s1, 'taxableBrokerage');
        tryPullLiquid(s2, 'taxableBrokerage');
    }
}
