// Tax and RMD Logic

// 2024 US Federal Tax Brackets for Married Filing Jointly (MFJ)
export const TAX_BRACKETS_2024_MFJ = [
    { rate: 0.10, upTo: 23200 },
    { rate: 0.12, upTo: 94300 },
    { rate: 0.22, upTo: 201050 },
    { rate: 0.24, upTo: 383900 },
    { rate: 0.32, upTo: 487450 },
    { rate: 0.35, upTo: 731200 },
    { rate: 0.37, upTo: Infinity }
];

export const STANDARD_DEDUCTION_2024_MFJ = 29200;

// Post-TCJA Sunset (commencing 2026) US Federal Tax Brackets for MFJ
export const TAX_BRACKETS_POST_TCJA_MFJ = [
    { rate: 0.10, upTo: 23200 },
    { rate: 0.15, upTo: 94300 },
    { rate: 0.25, upTo: 190000 },
    { rate: 0.28, upTo: 290000 },
    { rate: 0.33, upTo: 450000 },
    { rate: 0.35, upTo: 510000 },
    { rate: 0.396, upTo: Infinity }
];

export const STANDARD_DEDUCTION_POST_TCJA_MFJ = 15000;

// 2024 US Federal Tax Brackets for Single Filers (e.g. Spousal Survivor)
export const TAX_BRACKETS_2024_SINGLE = [
    { rate: 0.10, upTo: 11600 },
    { rate: 0.12, upTo: 47150 },
    { rate: 0.22, upTo: 100525 },
    { rate: 0.24, upTo: 191950 },
    { rate: 0.32, upTo: 243725 },
    { rate: 0.35, upTo: 609350 },
    { rate: 0.37, upTo: Infinity }
];

export const STANDARD_DEDUCTION_2024_SINGLE = 14600;

// Post-TCJA Sunset (commencing 2026) US Federal Tax Brackets for Single Filers
export const TAX_BRACKETS_POST_TCJA_SINGLE = [
    { rate: 0.10, upTo: 11600 },
    { rate: 0.15, upTo: 47150 },
    { rate: 0.25, upTo: 95000 },
    { rate: 0.28, upTo: 145000 },
    { rate: 0.33, upTo: 225000 },
    { rate: 0.35, upTo: 500000 },
    { rate: 0.396, upTo: Infinity }
];

export const STANDARD_DEDUCTION_POST_TCJA_SINGLE = 7500;

// 2024 Federal Long-Term Capital Gains (LTCG) Brackets
export const LTCG_BRACKETS_2024_MFJ = [
    { rate: 0.00, upTo: 94050 },
    { rate: 0.15, upTo: 583750 },
    { rate: 0.20, upTo: Infinity }
];

export const LTCG_BRACKETS_2024_SINGLE = [
    { rate: 0.00, upTo: 47025 },
    { rate: 0.15, upTo: 518900 },
    { rate: 0.20, upTo: Infinity }
];

export const NIIT_THRESHOLD_2024_MFJ = 250000;
export const NIIT_THRESHOLD_2024_SINGLE = 200000;
export const NIIT_RATE = 0.038;

// FICA Payroll Tax Constants (2024)
export const OASDI_WAGE_BASE_2024 = 168600;
export const OASDI_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const ADDITIONAL_MEDICARE_THRESHOLD_MFJ = 250000;
export const ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200000;

// 2024 IRMAA Brackets (Married Filing Jointly)
export const IRMAA_BRACKETS_2024_MFJ = [
    { upTo: 206000, surcharge: 0 },
    { upTo: 258000, surcharge: 139.80 }, // Total MFJ surcharge (69.90 * 2)
    { upTo: 322000, surcharge: 349.40 }, // (174.70 * 2)
    { upTo: 386000, surcharge: 559.00 }, // (279.50 * 2)
    { upTo: 750000, surcharge: 768.60 }, // (384.30 * 2)
    { upTo: Infinity, surcharge: 838.60 } // (419.30 * 2)
];

// 2024 IRMAA Brackets (Single Filer)
export const IRMAA_BRACKETS_2024_SINGLE = [
    { upTo: 103000, surcharge: 0 },
    { upTo: 129000, surcharge: 69.90 },
    { upTo: 161000, surcharge: 174.70 },
    { upTo: 193000, surcharge: 279.50 },
    { upTo: 500000, surcharge: 384.30 },
    { upTo: Infinity, surcharge: 419.30 }
];

/**
 * Calculates FICA payroll taxes (Social Security + Medicare + Additional Medicare).
 * @param {number} w2Gross Gross W-2 wages
 * @param {number} oasdiLimit OASDI wage base limit for the year
 * @param {string} filingStatus 'mfj' or 'single'
 * @returns {object} { oasdi, medicare, addlMedicare, totalFica }
 */
export function calculateFicaTax(w2Gross, oasdiLimit = OASDI_WAGE_BASE_2024, filingStatus = 'mfj') {
    if (w2Gross <= 0) return { oasdi: 0, medicare: 0, addlMedicare: 0, totalFica: 0 };
    const oasdi = Math.min(w2Gross, oasdiLimit) * OASDI_RATE;
    const medicare = w2Gross * MEDICARE_RATE;
    const addlThreshold = filingStatus === 'single' ? ADDITIONAL_MEDICARE_THRESHOLD_SINGLE : ADDITIONAL_MEDICARE_THRESHOLD_MFJ;
    const addlMedicare = Math.max(0, w2Gross - addlThreshold) * ADDITIONAL_MEDICARE_RATE;
    const totalFica = oasdi + medicare + addlMedicare;
    return { oasdi, medicare, addlMedicare, totalFica };
}

function _buildStatusTaxTable(config, inflationMultiplier) {
    const { baseBrackets, baseStdDeduction, baseIrmaa, baseLtcg, niitThreshold } = config;
    const brackets = baseBrackets.map(b => ({
        rate: b.rate,
        upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
    }));
    const irmaaBrackets = baseIrmaa.map(b => ({
        surcharge: b.surcharge,
        upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
    }));
    const ltcgBrackets = baseLtcg.map(b => ({
        rate: b.rate,
        upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
    }));
    return {
        brackets,
        standardDeduction: baseStdDeduction * inflationMultiplier,
        irmaaBrackets,
        ltcgBrackets,
        niitThreshold, // Statutory IRC § 1411 threshold is NOT indexed for inflation
        oasdiLimit: OASDI_WAGE_BASE_2024 * inflationMultiplier
    };
}

/**
 * Precalculates tax brackets and standard deductions for N years based on an inflation rate.
 * Supports both MFJ and Single filing statuses, 2026 TCJA Sunset, and statutory NIIT freezing.
 * @param {number} years 
 * @param {number} inflationRate 
 * @param {number} [startYear=2026]
 * @param {object} [assumptions={}]
 * @returns {Array} Array of tax data for each year
 */
export function precalculateTaxTables(years, inflationRate, startYear = 2026, assumptions = {}) {
    const tables = [];
    const tcjaSunset = Boolean(assumptions?.tcjaSunset);

    for (let i = 0; i <= years; i++) {
        const simYear = startYear + i;
        const isPostSunset = tcjaSunset && (simYear >= 2026);
        const inflationMultiplier = Math.pow(1 + (inflationRate / 100), i);

        const mfj = _buildStatusTaxTable({
            baseBrackets: isPostSunset ? TAX_BRACKETS_POST_TCJA_MFJ : TAX_BRACKETS_2024_MFJ,
            baseStdDeduction: isPostSunset ? STANDARD_DEDUCTION_POST_TCJA_MFJ : STANDARD_DEDUCTION_2024_MFJ,
            baseIrmaa: IRMAA_BRACKETS_2024_MFJ,
            baseLtcg: LTCG_BRACKETS_2024_MFJ,
            niitThreshold: NIIT_THRESHOLD_2024_MFJ
        }, inflationMultiplier);

        const single = _buildStatusTaxTable({
            baseBrackets: isPostSunset ? TAX_BRACKETS_POST_TCJA_SINGLE : TAX_BRACKETS_2024_SINGLE,
            baseStdDeduction: isPostSunset ? STANDARD_DEDUCTION_POST_TCJA_SINGLE : STANDARD_DEDUCTION_2024_SINGLE,
            baseIrmaa: IRMAA_BRACKETS_2024_SINGLE,
            baseLtcg: LTCG_BRACKETS_2024_SINGLE,
            niitThreshold: NIIT_THRESHOLD_2024_SINGLE
        }, inflationMultiplier);

        tables.push({
            yearIndex: i,
            year: simYear,
            // Backward-compatible top-level properties
            brackets: mfj.brackets,
            irmaaBrackets: mfj.irmaaBrackets,
            standardDeduction: mfj.standardDeduction,
            ltcgBrackets: mfj.ltcgBrackets,
            niitThreshold: mfj.niitThreshold,
            oasdiLimit: mfj.oasdiLimit,
            // Per-filing status data
            mfj,
            single
        });
    }
    return tables;
}

/**
 * Calculates Federal income tax (ordinary + LTCG + NIIT) and flat state tax.
 * Supports dynamic filing status ('mfj' or 'single').
 * @param {number} grossTaxableIncome Total ordinary gross income subject to income tax
 * @param {number} stateTaxRate Flat state tax rate (e.g. 5 for 5%)
 * @param {object} taxYearData The precalculated tax data for this year
 * @param {string} [filingStatus='mfj'] 'mfj' or 'single'
 * @param {number} [ltcgGains=0] Realized Long-Term Capital Gains
 * @returns {object} Full tax breakdown
 */
export function calculateTax(grossTaxableIncome, stateTaxRate, taxYearData, filingStatus = 'mfj', ltcgGains = 0) {
    const statusData = (taxYearData && taxYearData[filingStatus]) ? taxYearData[filingStatus] : (taxYearData || {});
    const brackets = statusData.brackets || TAX_BRACKETS_2024_MFJ;
    const standardDeduction = statusData.standardDeduction !== undefined ? statusData.standardDeduction : STANDARD_DEDUCTION_2024_MFJ;
    const ltcgBrackets = statusData.ltcgBrackets || LTCG_BRACKETS_2024_MFJ;
    const niitThreshold = statusData.niitThreshold !== undefined ? statusData.niitThreshold : NIIT_THRESHOLD_2024_MFJ;

    if (grossTaxableIncome <= 0 && ltcgGains <= 0) {
        return { 
            federalTax: 0, 
            stateTax: 0, 
            totalTax: 0, 
            effectiveRate: 0, 
            topBracketRate: 0, 
            remainingRoomInBracket: standardDeduction,
            grossTaxableIncome: 0,
            standardDeduction: standardDeduction,
            agi: 0,
            capitalGainsTax: 0,
            niitTax: 0,
            filingStatus
        };
    }

    // Federal Ordinary Income Tax Calculation
    const agi = Math.max(0, grossTaxableIncome - standardDeduction);
    let ordinaryFederalTax = 0;
    let previousLimit = 0;
    let topBracketRate = 0;
    let remainingRoomInBracket = 0;

    for (const bracket of brackets) {
        if (agi > previousLimit) {
            topBracketRate = bracket.rate;
            const taxableInThisBracket = Math.min(agi, bracket.upTo) - previousLimit;
            ordinaryFederalTax += taxableInThisBracket * bracket.rate;
            remainingRoomInBracket = bracket.upTo === Infinity ? 0 : Math.max(0, bracket.upTo - agi);
            if (agi <= bracket.upTo) {
                break;
            }
        }
        previousLimit = bracket.upTo;
    }

    if (agi === 0) {
        topBracketRate = 0;
        remainingRoomInBracket = standardDeduction - grossTaxableIncome;
    }

    // Long-Term Capital Gains (LTCG) Calculation - Stacks on top of ordinary taxable income
    let capitalGainsTax = 0;
    if (ltcgGains > 0) {
        const startCapitalIncome = agi;
        const endCapitalIncome = agi + ltcgGains;
        let prevLtcgLimit = 0;

        for (const b of ltcgBrackets) {
            const bracketFloor = prevLtcgLimit;
            const bracketCeiling = b.upTo;

            // Determine overlap of [startCapitalIncome, endCapitalIncome] with [bracketFloor, bracketCeiling]
            const overlapStart = Math.max(startCapitalIncome, bracketFloor);
            const overlapEnd = Math.min(endCapitalIncome, bracketCeiling);

            if (overlapEnd > overlapStart) {
                const taxableGainsInBracket = overlapEnd - overlapStart;
                capitalGainsTax += taxableGainsInBracket * b.rate;
            }
            prevLtcgLimit = b.upTo;
        }
    }

    // Net Investment Income Tax (NIIT) - 3.8% on lesser of capital gains or MAGI over threshold
    let niitTax = 0;
    if (ltcgGains > 0) {
        const totalInvestmentAgi = grossTaxableIncome + ltcgGains;
        const excessOverThreshold = Math.max(0, totalInvestmentAgi - niitThreshold);
        const subjectToNiit = Math.min(ltcgGains, excessOverThreshold);
        niitTax = subjectToNiit * NIIT_RATE;
    }

    const federalTax = ordinaryFederalTax + capitalGainsTax + niitTax;

    // State Tax Calculation (applied to gross income + capital gains)
    const totalStateTaxable = Math.max(0, grossTaxableIncome + ltcgGains);
    const stateTax = totalStateTaxable * ((stateTaxRate || 0) / 100);

    const totalTax = federalTax + stateTax;
    const effectiveRate = totalStateTaxable > 0 ? (totalTax / totalStateTaxable) : 0;

    return {
        federalTax,
        stateTax,
        totalTax,
        effectiveRate,
        topBracketRate,
        remainingRoomInBracket,
        grossTaxableIncome,
        standardDeduction,
        agi,
        capitalGainsTax: capitalGainsTax + niitTax,
        niitTax,
        filingStatus
    };
}

/**
 * IRS Single Life Expectancy Table (Table I, Treas. Reg. § 1.401(a)(9)-9(b), effective 2022+)
 * Official life expectancy distribution factors for Substantially Equal Periodic Payments (Rule 72(t) SEPP)
 * under IRS Notice 2022-6 and beneficiary RMD calculations under IRC § 401(a)(9).
 * IRS Notice 2022-6: https://www.irs.gov/irb/2022-05_IRB#NOT-2022-6
 * Electronic Code of Federal Regulations: https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/section-1.401(a)(9)-9
 */
export const IRS_SINGLE_LIFE_EXPECTANCY_TABLE = {
    0: 84.6, 1: 83.7, 2: 82.8, 3: 81.8, 4: 80.8, 5: 79.8, 6: 78.8, 7: 77.9, 8: 76.9, 9: 75.9,
    10: 74.9, 11: 73.9, 12: 72.9, 13: 71.9, 14: 70.9, 15: 70.0, 16: 69.0, 17: 68.0, 18: 67.0, 19: 66.0,
    20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1, 24: 61.1, 25: 60.2, 26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3,
    30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5, 34: 51.5, 35: 50.5, 36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7,
    40: 45.7, 41: 44.8, 42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0, 48: 38.1, 49: 37.1,
    50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4, 54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0,
    60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9, 66: 22.0, 67: 21.2, 68: 20.4, 69: 19.6,
    70: 18.8, 71: 18.0, 72: 17.2, 73: 16.4, 74: 15.6, 75: 14.8, 76: 14.1, 77: 13.3, 78: 12.6, 79: 11.9,
    80: 11.2, 81: 10.5, 82: 9.9, 83: 9.3, 84: 8.7, 85: 8.1, 86: 7.6, 87: 7.1, 88: 6.6, 89: 6.1,
    90: 5.7, 91: 5.3, 92: 4.9, 93: 4.6, 94: 4.3, 95: 4.0, 96: 3.7, 97: 3.4, 98: 3.2, 99: 3.0,
    100: 2.8, 101: 2.6, 102: 2.5, 103: 2.3, 104: 2.2, 105: 2.1, 106: 2.1, 107: 2.1, 108: 2.0, 109: 2.0,
    110: 2.0, 111: 2.0, 112: 2.0, 113: 1.9, 114: 1.9, 115: 1.8, 116: 1.8, 117: 1.6, 118: 1.4, 119: 1.1,
    120: 1.0
};

/**
 * Returns single life expectancy factor for an individual under IRS Table I (Treas. Reg. § 1.401(a)(9)-9(b)).
 * @param {number} age Owner or beneficiary age
 * @returns {number} Life expectancy divisor factor
 */
export function getSingleLifeExpectancy(age) {
    const roundedAge = Math.round(Number(age) || 0);
    if (roundedAge in IRS_SINGLE_LIFE_EXPECTANCY_TABLE) {
        return IRS_SINGLE_LIFE_EXPECTANCY_TABLE[roundedAge];
    }
    if (roundedAge >= 120) return 1.0;
    if (roundedAge <= 0) return 84.6;
    return Math.max(1.0, 84.6 - (roundedAge * 0.95));
}

/**
 * Calculates statutory Substantially Equal Periodic Payment (SEPP) under IRS Notice 2022-6.
 * Supports Fixed Amortization (default) and Required Minimum Distribution (RMD) methods.
 * Notice 2022-6: https://www.irs.gov/irb/2022-05_IRB#NOT-2022-6
 *
 * @param {number} balance Inception balance of the dedicated 72(t) account
 * @param {number} rate Annual interest rate as a decimal (e.g. 0.05 for 5.0%)
 * @param {number} age Owner's age at inception
 * @param {string} [method='amortization'] 'amortization' or 'rmd'
 * @returns {number} Level annual SEPP payment amount
 */
export function calculate72tPayment(balance, rate, age, method = 'amortization') {
    if (!balance || balance <= 0) return 0;
    const n = getSingleLifeExpectancy(age);
    if (!n || n <= 0) return 0;

    if (method === 'rmd') {
        return balance / n;
    }

    const r = Number(rate) || 0;
    if (r <= 0 || Math.abs(r) < 1e-7) {
        return balance / n;
    }

    // Fixed Amortization Formula: P * r / (1 - (1 + r)^(-n))
    const denominator = 1 - Math.pow(1 + r, -n);
    if (denominator <= 0) {
        return balance / n;
    }
    return (balance * r) / denominator;
}

/**
 * IRS Uniform Lifetime Table (Table III, Treas. Reg. § 1.401(a)(9)-9, effective 2022+)
 * Official life expectancy distribution factors for calculating Required Minimum Distributions.
 */
export const IRS_UNIFORM_LIFETIME_TABLE = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
    80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
    88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
    96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2,
    104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4,
    112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
    120: 2.0
};

/**
 * RMD (Required Minimum Distribution) rules per SECURE Act 2.0:
 * Age 73 for born 1951–1959; Age 75 for born 1960 or later.
 * Uses official IRS Uniform Lifetime Table (Table III) divisor factors.
 * @param {number} age 
 * @param {number} [yearOfBirth]
 * @returns {number} The required decimal fraction to withdraw (e.g. 0.0377 for 3.77%).
 */
export function getRmdPercentage(age, yearOfBirth = 1955) {
    const rmdStartAge = (yearOfBirth && yearOfBirth >= 1960) ? 75 : 73;
    if (age < rmdStartAge) return 0;
    
    const roundedAge = Math.floor(age);
    if (roundedAge >= 120) {
        return 1 / 2.0;
    }
    const divisor = IRS_UNIFORM_LIFETIME_TABLE[roundedAge] || Math.max(2, 26.5 - ((roundedAge - 73) * 0.95)); 
    return 1 / divisor;
}

/**
 * Calculates annual Medicare IRMAA Part B & D surcharges for individuals aged 65+.
 * @param {number} magi Modified Adjusted Gross Income
 * @param {string} filingStatus 'mfj' or 'single'
 * @param {object} taxYearData Tax table data containing IRMAA brackets
 * @param {number} s1Age Age of Primary Spouse
 * @param {number} s2Age Age of Secondary Spouse
 * @param {boolean} s1Alive
 * @param {boolean} s2Alive
 * @returns {number} Total annual household IRMAA surcharge
 */
export function getIrmaaAnnualSurcharge(magi, filingStatus, taxYearData, s1Age, s2Age, s1Alive, s2Alive) {
    const s1Eligible = s1Alive && s1Age >= 65;
    const s2Eligible = s2Alive && s2Age >= 65;
    if (!s1Eligible && !s2Eligible) return 0;

    const statusData = (taxYearData && taxYearData[filingStatus]) ? taxYearData[filingStatus] : (taxYearData || {});
    const brackets = statusData.irmaaBrackets || (filingStatus === 'single' ? IRMAA_BRACKETS_2024_SINGLE : IRMAA_BRACKETS_2024_MFJ);

    let monthlySurcharge = 0;
    for (const b of brackets) {
        if (magi <= b.upTo) {
            monthlySurcharge = b.surcharge || 0;
            break;
        }
    }

    if (filingStatus === 'mfj') {
        // In MFJ, brackets provide total surcharge for 2 Medicare recipients (e.g. 69.90 * 2 = 139.80).
        // If only 1 spouse is >= 65, halve the surcharge.
        if (s1Eligible && s2Eligible) {
            return monthlySurcharge * 12;
        } else {
            return (monthlySurcharge / 2) * 12;
        }
    } else {
        // Single filer (or surviving spouse)
        return monthlySurcharge * 12;
    }
}
