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

/**
 * Precalculates tax brackets and standard deductions for N years based on an inflation rate.
 * Supports both MFJ and Single filing statuses.
 * @param {number} years 
 * @param {number} inflationRate 
 * @returns {Array} Array of tax data for each year
 */
export function precalculateTaxTables(years, inflationRate) {
    const tables = [];
    for (let i = 0; i <= years; i++) {
        const inflationMultiplier = Math.pow(1 + (inflationRate / 100), i);
        
        // MFJ
        const mfjBrackets = TAX_BRACKETS_2024_MFJ.map(b => ({
            rate: b.rate,
            upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
        }));
        const mfjIrmaa = IRMAA_BRACKETS_2024_MFJ.map(b => ({
            surcharge: b.surcharge,
            upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
        }));
        const mfjLtcg = LTCG_BRACKETS_2024_MFJ.map(b => ({
            rate: b.rate,
            upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
        }));

        // Single
        const singleBrackets = TAX_BRACKETS_2024_SINGLE.map(b => ({
            rate: b.rate,
            upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
        }));
        const singleIrmaa = IRMAA_BRACKETS_2024_SINGLE.map(b => ({
            surcharge: b.surcharge,
            upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
        }));
        const singleLtcg = LTCG_BRACKETS_2024_SINGLE.map(b => ({
            rate: b.rate,
            upTo: b.upTo === Infinity ? Infinity : b.upTo * inflationMultiplier
        }));

        const mfj = {
            brackets: mfjBrackets,
            standardDeduction: STANDARD_DEDUCTION_2024_MFJ * inflationMultiplier,
            irmaaBrackets: mfjIrmaa,
            ltcgBrackets: mfjLtcg,
            niitThreshold: NIIT_THRESHOLD_2024_MFJ * inflationMultiplier,
            oasdiLimit: OASDI_WAGE_BASE_2024 * inflationMultiplier
        };

        const single = {
            brackets: singleBrackets,
            standardDeduction: STANDARD_DEDUCTION_2024_SINGLE * inflationMultiplier,
            irmaaBrackets: singleIrmaa,
            ltcgBrackets: singleLtcg,
            niitThreshold: NIIT_THRESHOLD_2024_SINGLE * inflationMultiplier,
            oasdiLimit: OASDI_WAGE_BASE_2024 * inflationMultiplier
        };

        tables.push({
            yearIndex: i,
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
 * RMD (Required Minimum Distribution) rules per SECURE Act 2.0:
 * Age 73 for born 1951–1959; Age 75 for born 1960 or later.
 * Uses the IRS Uniform Lifetime Table divisor approximation.
 * @param {number} age 
 * @param {number} [yearOfBirth]
 * @returns {number} The required decimal fraction to withdraw (e.g. 0.0377 for 3.77%).
 */
export function getRmdPercentage(age, yearOfBirth = 1955) {
    const rmdStartAge = (yearOfBirth && yearOfBirth >= 1960) ? 75 : 73;
    if (age < rmdStartAge) return 0;
    
    // IRS Uniform Lifetime Table approximation:
    // At 73: divisor 26.5 (3.77%); at 75: divisor ~24.6 (4.07%); at 80: divisor 20.2 (4.95%); at 90: divisor 12.2 (8.20%)
    const divisor = Math.max(2, 26.5 - ((age - 73) * 0.95)); 
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
