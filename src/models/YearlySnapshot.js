function parseSnapshotArgs(yearOrOptions, person1, person2, cashCushion, rest) {
    if (typeof yearOrOptions === 'object' && yearOrOptions !== null) {
        return {
            year: yearOrOptions.year,
            p1: yearOrOptions.person1,
            p2: yearOrOptions.person2,
            cushion: yearOrOptions.cashCushion || 0,
            equity: yearOrOptions.primaryResidenceEquity || 0,
            mortgage: yearOrOptions.mortgageBalance || 0,
            homeValue: yearOrOptions.homeValue || 0
        };
    }
    const [primaryResidenceEquity = 0, mortgageBalance = 0] = rest;
    return {
        year: yearOrOptions,
        p1: person1,
        p2: person2,
        cushion: cashCushion || 0,
        equity: primaryResidenceEquity || 0,
        mortgage: mortgageBalance || 0,
        homeValue: 0
    };
}

function createInitialSpouseIncome() {
    return {
        w2Gross: 0,
        w2TaxableGross: 0,
        w2Net: 0,
        takeHome: 0,
        employerMatch: 0,
        ssn: 0,
        rule72t: 0,
        rothConversion: 0,
        rmd: 0
    };
}

function createInitialIncome() {
    return {
        s1: createInitialSpouseIncome(),
        s2: createInitialSpouseIncome(),
        drawdowns: {
            s1Hysa: 0,
            s2Hysa: 0,
            s1Brokerage: 0,
            s2Brokerage: 0,
            s1Trad401k: 0,
            s2Trad401k: 0,
            s1Trad403b: 0,
            s2Trad403b: 0,
            s1StandardIra: 0,
            s2StandardIra: 0,
            s1RothIra: 0,
            s2RothIra: 0,
            s1Hsa: 0,
            s2Hsa: 0,
            cashCushion: 0,
            penalizedPreTax: 0,
            s1PenalizedPreTax: 0,
            s2PenalizedPreTax: 0
        },
        reverseMortgage: 0,
        mandatoryRmd: 0,
        w2: 0,
        takeHome: 0,
        employerMatchTotal: 0
    };
}

function getAccountBalance(person, accountKey) {
    if (typeof person?.getAccountBalanceByType === 'function') {
        return person.getAccountBalanceByType(accountKey, { exclude72tDedicated: accountKey === 'standardIra' });
    }
    if (Array.isArray(person?.accounts)) {
        return person.accounts
            .filter((a) => a && a.type === accountKey && (accountKey !== 'standardIra' || !a._is72tDedicated))
            .reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
    }
    const acc = person?.accounts?.[accountKey];
    return acc ? acc.balance : 0;
}

function getSeppIraBalance(person) {
    if (typeof person?.getSeppIraBalance === 'function') {
        return person.getSeppIraBalance();
    }
    if (!Array.isArray(person?.accounts)) return 0;
    return person.accounts
        .filter((a) => a && a.type === 'standardIra' && a._is72tDedicated)
        .reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
}

function getPersonRothCohorts(person) {
    const rothAcc =
        typeof person?.getAccountsByType === 'function'
            ? person.getAccountsByType('rothIra', { includeDisabled: true })[0]
            : person?.accounts?.rothIra;
    return rothAcc?.cohorts ? JSON.parse(JSON.stringify(rothAcc.cohorts)) : [];
}

function createInitialBalances(p1, p2, { cushion, equity, homeValue, mortgage }) {
    return {
        s1Trad401k: getAccountBalance(p1, 'traditional401k'),
        s2Trad401k: getAccountBalance(p2, 'traditional401k'),
        s1Trad403b: getAccountBalance(p1, 'trad403b'),
        s2Trad403b: getAccountBalance(p2, 'trad403b'),
        s1StandardIra: getAccountBalance(p1, 'standardIra'),
        s2StandardIra: getAccountBalance(p2, 'standardIra'),
        s1SeppIra: getSeppIraBalance(p1),
        s2SeppIra: getSeppIraBalance(p2),
        s1Hysa: getAccountBalance(p1, 'hysa'),
        s2Hysa: getAccountBalance(p2, 'hysa'),
        s1Cd: getAccountBalance(p1, 'cd'),
        s2Cd: getAccountBalance(p2, 'cd'),
        s1Brokerage: getAccountBalance(p1, 'taxableBrokerage'),
        s2Brokerage: getAccountBalance(p2, 'taxableBrokerage'),
        s1RothIra: getAccountBalance(p1, 'rothIra'),
        s2RothIra: getAccountBalance(p2, 'rothIra'),
        s1Hsa: getAccountBalance(p1, 'hsa'),
        s2Hsa: getAccountBalance(p2, 'hsa'),
        cashCushion: cushion,
        primaryResidenceEquity: equity,
        homeValue,
        mortgageBalance: mortgage
    };
}

export class YearlySnapshot {
    constructor(yearOrOptions, person1, person2, cashCushion, ...rest) {
        const { year, p1, p2, cushion, equity, mortgage, homeValue } = parseSnapshotArgs(
            yearOrOptions,
            person1,
            person2,
            cashCushion,
            rest
        );

        this.year = year;
        this.age1 = p1 ? p1.getAge(year) : 0;
        this.age2 = p2 && p2.isConfigured ? p2.getAge(year) : null;
        this.income = createInitialIncome();

        this.expenses = 0;
        this.expenseBreakdown = { base: 0, housing: 0, mortgage: 0, childcare: 0, irmaa: 0, healthcare: 0 };
        this.reinvestedToBrokerage = 0;
        this.reinvestedToSweep = 0;
        this.sweepAccountName = '';
        this.reinvestedToCushion = 0;
        this.rothConversionTax = 0;
        this.earlyWithdrawalPenalty = 0;
        this.taxes = 0;
        this.taxDetails = null;
        this.surplus = 0;
        this.unfundedShortfall = 0;
        this.mortgageBalance = mortgage;

        this.balances = createInitialBalances(p1, p2, { cushion, equity, homeValue, mortgage });

        this.rothCohorts = {
            s1: getPersonRothCohorts(p1),
            s2: getPersonRothCohorts(p2)
        };

        this.events = [];
        this.monthlySnapshots = [];
    }

    recordDrawdown(personKey, accountKey, amount) {
        const keyMap = {
            traditional401k: 'Trad401k',
            trad403b: 'Trad403b',
            standardIra: 'StandardIra',
            rothIra: 'RothIra',
            taxableBrokerage: 'Brokerage',
            hysa: 'Hysa',
            cd: 'Cd'
        };
        const mappedAcc = keyMap[accountKey] || accountKey;
        const targetKey = `${personKey}${mappedAcc}`;

        if (this.income.drawdowns[targetKey] !== undefined) {
            this.income.drawdowns[targetKey] += amount;
        }
    }
}
