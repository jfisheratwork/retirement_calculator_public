/**
 * JargonTranslator Service (SPEC-072)
 *
 * Centralizes plain-English translations and micro-tooltips for statutory, tax,
 * and institutional financial terminology across the dashboard, charts, and input panels.
 *
 * Written with the assistance of Google Gemini
 */

export const JARGON_DICTIONARY = Object.freeze({
    swr: {
        plainLabel: 'Safe Withdrawal Rate (Annual % Drawn from Investments)',
        shortPlainLabel: 'Safe Spending Rate (SWR)',
        technicalLabel: 'Safe Withdrawal Rate (SWR)',
        tooltip:
            'The percentage of your investments you can spend in Year 1 of retirement (typically 3.5%–4.0%), adjusting for inflation each year without running out of money over 30+ years.'
    },
    sorr: {
        plainLabel: 'Early Market Crash Stress Test (Sequence of Returns Risk)',
        shortPlainLabel: 'Market Crash Stress Test (SORR)',
        technicalLabel: 'Sequence of Returns Risk (SORR) & Stress Testing',
        tooltip:
            'Tests whether your plan survives a major stock market crash in your first few years of retirement, when selling depreciated investments to pay living costs causes permanent damage.'
    },
    gfc_zirp: {
        plainLabel: '2008 Financial Crisis & Low-Rate Recovery (2008–2017)',
        shortPlainLabel: '2008 Financial Crisis (2008–2017)',
        technicalLabel: 'GFC & ZIRP Bull (2008-2017)',
        tooltip:
            'Simulates retiring directly into the severe 2008 Global Financial Crisis (-37% crash) followed by the prolonged 2009–2017 zero-interest-rate recovery.'
    },
    irmaa: {
        plainLabel: 'Medicare High-Income Surcharge (IRMAA)',
        shortPlainLabel: 'Medicare High-Income Surcharge',
        technicalLabel: 'Medicare IRMAA Surcharges',
        tooltip:
            'An extra monthly fee added to Medicare Part B & D premiums when your taxable income (MAGI) exceeds IRS thresholds ($103k Single / $206k Married).'
    },
    cost_basis: {
        plainLabel: 'Original Purchase Cost (Tax-Free Principal)',
        shortPlainLabel: 'Original Purchase Cost / Cost Basis ($)',
        technicalLabel: 'Cost Basis ($)',
        tooltip:
            'The money you originally paid for your investments using after-tax cash. When you sell shares, your original purchase cost comes back 100% tax-free—you only pay capital gains tax on the growth above this amount.'
    },
    roth_principal: {
        plainLabel: 'Original Roth Deposits (Tax-Free Anytime)',
        shortPlainLabel: 'Original Roth Deposits / Principal ($)',
        technicalLabel: 'Roth Principal ($)',
        tooltip:
            'The cash you contributed out of pocket into your Roth IRA. You can withdraw your original Roth deposits at any age, completely tax-free and penalty-free, making it an ideal early-retirement bridge.'
    },
    magi: {
        plainLabel: 'Modified Adjusted Gross Income (MAGI — Tax & Healthcare Threshold)',
        shortPlainLabel: 'Healthcare & Tax Threshold Income (MAGI)',
        technicalLabel: 'Modified AGI (MAGI)',
        tooltip:
            'Your total taxable income (wages, Roth conversions, IRA withdrawals, and capital gains) used by the IRS to determine Roth IRA eligibility, ACA healthcare subsidies, and Medicare surcharges.'
    },
    rule_72t: {
        plainLabel: 'IRS Penalty-Free Early IRA Payout Schedule (Rule 72t)',
        shortPlainLabel: 'Penalty-Free Early IRA Payout (Rule 72t)',
        technicalLabel: 'Rule 72(t) Early Withdrawals (SEPP)',
        tooltip:
            'An IRS rule allowing you to withdraw money from pre-tax 401(k) and IRA accounts before age 59½ without the 10% early withdrawal penalty, provided you take fixed annual payments for at least 5 years or until age 59½.'
    },
    rmd: {
        plainLabel: 'Required Minimum Distribution (Mandatory Age 73/75 Withdrawals)',
        shortPlainLabel: 'Required Minimum Distribution / RMD Method (Variable Payout)',
        technicalLabel: 'RMD (Variable - Lowest Payout)',
        tooltip:
            'Mandatory annual withdrawals the IRS forces you to take (and pay income tax on) from pre-tax 401(k), 403(b), and Traditional IRA accounts starting at age 73 or 75.'
    },
    sweep_account: {
        plainLabel: 'Excess Savings Deposit Target (Sweep Account)',
        shortPlainLabel: '⚡ Excess Savings Target',
        technicalLabel: 'Designated Sweep Account',
        tooltip:
            'When your annual take-home income exceeds your living expenses, 100% of your unspent cash surplus is automatically deposited and invested into this account.'
    },
    glide_path: {
        plainLabel: 'Automatic Shift to Safer Assets (Bond Buffer)',
        shortPlainLabel: 'Shift to Safer Assets (Bond Buffer)',
        technicalLabel: 'Conservative Glide Path (Bond Shift)',
        tooltip:
            'Gradually shifts your portfolio toward safer bonds and fixed income at a target age to cushion against stock market crashes in retirement.'
    },
    decumulation_curve: {
        plainLabel: 'Retirement Spending Style (How You Draw Down Wealth)',
        shortPlainLabel: 'Retirement Spending Style',
        technicalLabel: 'Drawdown Spending Curve',
        tooltip:
            'Controls your spending pattern in retirement: Preserve Principal (4% Rule), Spend Down to Target Legacy (Die With Zero), or Spend More in Active Early Years (Go-Go Curve).'
    },
    health_aging_offset: {
        plainLabel: 'Personal Health Pace Adjustment (Years)',
        shortPlainLabel: 'Health Pace Adjustment (Years)',
        technicalLabel: 'Biological Health Aging Offset (Years)',
        tooltip:
            'Adjusts when your retirement spending transitions from active travel years into slower-paced mature years (+years if health slows down earlier; -years if staying active longer).'
    },
    w2_raise_rate: {
        plainLabel: 'Expected Annual Salary Raise (%)',
        shortPlainLabel: 'Expected Annual Raise (%)',
        technicalLabel: 'Expected W2 Raise (%)',
        tooltip:
            'The expected annual percentage raise or career income growth applied to your base salary each year before retirement.'
    }
});

/**
 * Returns the localized label for a jargon key based on mode ('plain' | 'short' | 'technical').
 * @param {string} key
 * @param {'plain'|'short'|'technical'} [mode='plain']
 * @returns {string}
 */
export function translateJargon(key, mode = 'plain') {
    const entry = JARGON_DICTIONARY[key];
    if (!entry) return key;
    if (mode === 'technical') return entry.technicalLabel;
    if (mode === 'short') return entry.shortPlainLabel;
    return entry.plainLabel;
}

/**
 * Returns the plain-English tooltip explanation for a jargon key.
 * @param {string} key
 * @returns {string}
 */
export function getJargonTooltip(key) {
    return JARGON_DICTIONARY[key]?.tooltip || '';
}
