export class Mortgage {
    constructor(state) {
        this.enabled = state.enabled;
        this.originationDate = state.originationDate;
        this.originationAmount = state.originationAmount;
        this.currentBalance = state.currentBalance !== undefined ? state.currentBalance : (state.currentStartingBalance || this.calculateCurrentBalanceFromOrigination(state));
        this.termYears = state.termYears || 30;
        this.interestRate = state.interestRate || 0;
        
        this.yearlyInsurance = state.yearlyInsurance || 0;
        this.yearlyTaxes = state.yearlyTaxes || 0;
        this.yearlyRepairs = state.yearlyRepairs || 0;
        
        this.downsizing = state.downsizing ? {
            enabled: Boolean(state.downsizing.enabled),
            year: Number(state.downsizing.year || 2034),
            replacementHomeCostPercentage: Number(state.downsizing.replacementHomeCostPercentage !== undefined ? state.downsizing.replacementHomeCostPercentage : 42.5),
            propertyCostReductionPercentage: Number(state.downsizing.propertyCostReductionPercentage !== undefined ? state.downsizing.propertyCostReductionPercentage : 25)
        } : { enabled: false, year: 2034, replacementHomeCostPercentage: 42.5, propertyCostReductionPercentage: 25 };

        this.downsized = false;
        this.monthlyPayment = this.calculateMonthlyPayment();
    }


    calculateCurrentBalanceFromOrigination(state) {
        if (!state.enabled || !state.originationDate || !state.originationAmount) return 0;
        const dateParts = String(state.originationDate).split('-');
        const origYear = parseInt(dateParts[0], 10);
        const origMonth = (parseInt(dateParts[1], 10) || 1) - 1;
        const now = new Date();
        
        const currentYearDate = now.getFullYear();
        const currentMonthDate = now.getMonth();
        
        const monthsPassed = (currentYearDate - origYear) * 12 + (currentMonthDate - origMonth);
        const totalMonths = (state.termYears || 30) * 12;
        
        const rate = (state.interestRate || 0) / 100 / 12;
        const P = state.originationAmount;
        const n = totalMonths;
        
        let payment = 0;
        if (rate === 0) {
            payment = P / n;
        } else {
            payment = P * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
        }
        
        let balance = P;
        for (let i = 0; i < monthsPassed; i++) {
            if (balance <= 0) break;
            const interest = balance * rate;
            const principalPaid = payment - interest;
            balance -= principalPaid;
        }
        return Math.max(0, balance);
    }

    calculateMonthlyPayment() {
        if (!this.enabled || this.currentBalance <= 0) return 0;
        const totalMonths = this.termYears * 12;
        const rate = this.interestRate / 100 / 12;
        const P = this.originationAmount || this.currentBalance; 
        
        // Use origination amount to find the original payment if available, else fallback
        if (rate === 0) {
            return P / totalMonths;
        } else {
            return P * (rate * Math.pow(1 + rate, totalMonths)) / (Math.pow(1 + rate, totalMonths) - 1);
        }
    }

    getAnnualFixedCosts(inflationMultiplier, partialYearMultiplier = 1) {
        if (!this.enabled) return 0;
        return (this.yearlyInsurance + this.yearlyTaxes + this.yearlyRepairs) * inflationMultiplier * partialYearMultiplier;
    }

    getAnnualMortgagePayment(partialYearMultiplier = 1) {
        if (!this.enabled || this.currentBalance <= 0) return 0;
        return this.monthlyPayment * 12 * partialYearMultiplier;
    }


    amortize(months) {
        if (!this.enabled || this.currentBalance <= 0) return;
        const rate = this.interestRate / 100 / 12;
        
        for (let i = 0; i < months; i++) {
            if (this.currentBalance <= 0) break;
            const interest = this.currentBalance * rate;
            const principalPaid = this.monthlyPayment - interest;
            this.currentBalance -= principalPaid;
        }
        this.currentBalance = Math.max(0, this.currentBalance);
    }

    executeDownsizing(currentHomeValue, closingCostRate = 0.06) {
        if (!this.downsizing?.enabled || this.downsized) return null;
        const grossSale = currentHomeValue || 0;
        const closingCosts = grossSale * closingCostRate;
        const mortgagePayoff = this.currentBalance || 0;
        const totalEquity = Math.max(0, grossSale - closingCosts - mortgagePayoff);
        const replacementCost = grossSale * ((this.downsizing.replacementHomeCostPercentage || 42.5) / 100);
        const netCashProceeds = Math.max(0, totalEquity - replacementCost);
        const cashDeficit = Math.max(0, replacementCost - totalEquity);

        this.currentBalance = 0;
        this.enabled = false;
        this.downsized = true;

        const costReductionFactor = 1 - ((this.downsizing.propertyCostReductionPercentage || 25) / 100);
        this.yearlyInsurance *= costReductionFactor;
        this.yearlyTaxes *= costReductionFactor;
        this.yearlyRepairs *= costReductionFactor;

        return {
            grossSale,
            closingCosts,
            mortgagePayoff,
            replacementHomeValue: replacementCost,
            netCashProceeds,
            cashDeficit
        };
    }
}

