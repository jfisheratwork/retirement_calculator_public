export class YearlySnapshot {
    constructor(yearOrOptions, person1, person2, cashCushion, primaryResidenceEquity, mortgageBalance = 0) {
        let year, p1, p2, cushion, equity, mortgage;
        if (typeof yearOrOptions === 'object' && yearOrOptions !== null) {
            year = yearOrOptions.year;
            p1 = yearOrOptions.person1;
            p2 = yearOrOptions.person2;
            cushion = yearOrOptions.cashCushion || 0;
            equity = yearOrOptions.primaryResidenceEquity || 0;
            mortgage = yearOrOptions.mortgageBalance || 0;
        } else {
            year = yearOrOptions;
            p1 = person1;
            p2 = person2;
            cushion = cashCushion || 0;
            equity = primaryResidenceEquity || 0;
            mortgage = mortgageBalance || 0;
        }

        this.year = year;
        this.age1 = p1 ? p1.getAge(year) : 0;
        this.age2 = p2 ? p2.getAge(year) : 0;

        this.income = {
            s1: { w2Gross: 0, w2Net: 0, takeHome: 0, employerMatch: 0, ssn: 0, rule72t: 0, rothConversion: 0 },
            s2: { w2Gross: 0, w2Net: 0, takeHome: 0, employerMatch: 0, ssn: 0, rule72t: 0, rothConversion: 0 },
            drawdowns: {
                s1Hysa: 0, s2Hysa: 0,
                s1Brokerage: 0, s2Brokerage: 0,
                s1Trad401k: 0, s2Trad401k: 0,
                s1Trad403b: 0, s2Trad403b: 0,
                s1StandardIra: 0, s2StandardIra: 0,
                s1RothIra: 0, s2RothIra: 0,
                cashCushion: 0
            },
            reverseMortgage: 0,
            w2: 0, // Keep total for convenience in KPI
            takeHome: 0,
            employerMatchTotal: 0
        };

        this.expenses = 0;
        this.expenseBreakdown = { base: 0, housing: 0, mortgage: 0, childcare: 0, irmaa: 0 };
        this.reinvestedToBrokerage = 0;
        this.reinvestedToSweep = 0;
        this.sweepAccountName = '';
        this.reinvestedToCushion = 0;
        this.rothConversionTax = 0;
        this.taxes = 0;
        this.taxDetails = null;
        this.surplus = 0;
        this.unfundedShortfall = 0;
        this.mortgageBalance = mortgage;

        this.balances = {
            s1Trad401k: p1 ? p1.accounts.traditional401k.balance : 0,
            s2Trad401k: p2 ? p2.accounts.traditional401k.balance : 0,
            s1Trad403b: p1 ? p1.accounts.trad403b.balance : 0,
            s2Trad403b: p2 ? p2.accounts.trad403b.balance : 0,
            s1StandardIra: p1 ? p1.accounts.standardIra.balance : 0,
            s2StandardIra: p2 ? p2.accounts.standardIra.balance : 0,
            s1Hysa: p1 ? p1.accounts.hysa.balance : 0,
            s2Hysa: p2 ? p2.accounts.hysa.balance : 0,
            s1Cd: p1 && p1.accounts.cd ? p1.accounts.cd.balance : 0,
            s2Cd: p2 && p2.accounts.cd ? p2.accounts.cd.balance : 0,
            s1Brokerage: p1 ? p1.accounts.taxableBrokerage.balance : 0,
            s2Brokerage: p2 ? p2.accounts.taxableBrokerage.balance : 0,
            s1RothIra: p1 && p1.accounts.rothIra ? p1.accounts.rothIra.balance : 0,
            s2RothIra: p2 && p2.accounts.rothIra ? p2.accounts.rothIra.balance : 0,
            s1Hsa: p1 && p1.accounts.hsa ? p1.accounts.hsa.balance : 0,
            s2Hsa: p2 && p2.accounts.hsa ? p2.accounts.hsa.balance : 0,
            cashCushion: cushion,
            primaryResidenceEquity: equity,
            homeValue: typeof yearOrOptions === 'object' && yearOrOptions?.homeValue ? yearOrOptions.homeValue : 0,
            mortgageBalance: mortgage
        };

        this.rothCohorts = {
            s1: p1 ? JSON.parse(JSON.stringify(p1.accounts.rothIra.cohorts)) : [],
            s2: p2 ? JSON.parse(JSON.stringify(p2.accounts.rothIra.cohorts)) : []
        };

        this.events = [];
        this.monthlySnapshots = [];
    }

    recordDrawdown(personKey, accountKey, amount) {
        const keyMap = {
            'traditional401k': 'Trad401k',
            'trad403b': 'Trad403b',
            'standardIra': 'StandardIra',
            'rothIra': 'RothIra',
            'taxableBrokerage': 'Brokerage',
            'hysa': 'Hysa',
            'cd': 'Cd'
        };
        const mappedAcc = keyMap[accountKey] || accountKey;
        const targetKey = `${personKey}${mappedAcc}`;

        if (this.income.drawdowns[targetKey] !== undefined) {
            this.income.drawdowns[targetKey] += amount;
        }
    }
}
