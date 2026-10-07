/**
 * Sample Profile Loader
 *
 * Provides a realistic, curated upper-middle-class household scenario:
 * - Couple: Alex (Age 45, born 1981) and Jordan (Age 41, born 1985)
 * - 2 Children: Jon (14, born 2012) and Jane (11, born 2015) with 529 savings
 * - Household Income: $180,000 W-2 ($105k base + $5k bonus for Alex, $70k base for Jordan)
 * - Accounts & Compounding: Engineered starting balances across 401(k), IRA, Roth, Brokerage, and HYSA
 *   that hit $1.50M liquid portfolio balance at Age 52 (Year 2033).
 *
 * > Written with the assistance of Google Gemini
 */

import { createProfile, replaceProfileData, switchProfile, getProfiles } from './state.js';

export const SAMPLE_FAMILY_PROFILE_NAME = 'Sample Household (Family of 4)';

export const SAMPLE_FAMILY_DATA = {
    dataVersion: 2,
    currentYear: 2026,
    primarySpouse: {
        name: 'Alex',
        yearOfBirth: 1981,
        targetRetirementAge: 52,
        socialSecurityStartAge: 67,
        socialSecurityAnnualBenefit: 28000,
        totalYearsWorked: 20,
        estimatedLifeExpectancy: 88,
        rothConversion: {
            enabled: false,
            sourceAccount: 'standardIra',
            amountPerYear: 0,
            startDelayYears: 0,
            durationYears: 5
        },
        rolloverEvent: {
            enabled: false,
            sourceAccount: 'traditional401k',
            targetAccount: 'standardIra',
            year: 2033,
            amount: 0,
            isFullBalance: true
        },
        rule72t: {
            enabled: false,
            sourceAccount: 'standardIra',
            startAge: 55
        },
        jobs: [
            {
                id: 'job-alex-1',
                title: 'Operations Director',
                baseSalary: 105000,
                startDate: '2026-01',
                bonusAmount: 5000,
                bonusMonth: '03',
                ltiAmount: 0,
                ltiMonth: '',
                linkedAccountId: 'acc-alex-401k',
                employeeContributionPercent: 10,
                employerMatchPercent: 50,
                employerMatchLimitPercent: 6
            }
        ],
        accounts: [
            {
                id: 'acc-alex-401k',
                name: 'Alex 401(k)',
                type: 'traditional401k',
                balance: 305000,
                expectedReturn: 7,
                isActiveContributor: true,
                isSweepAccount: false
            },
            {
                id: 'acc-alex-ira',
                name: 'Alex Traditional IRA',
                type: 'standardIra',
                balance: 65000,
                expectedReturn: 7,
                isActiveContributor: false,
                isSweepAccount: false
            },
            {
                id: 'acc-alex-roth',
                name: 'Alex Roth IRA',
                type: 'rothIra',
                balance: 50000,
                principle: 35000,
                expectedReturn: 7,
                isActiveContributor: false,
                isSweepAccount: false
            },
            {
                id: 'acc-joint-brokerage',
                name: 'Joint Brokerage',
                type: 'taxableBrokerage',
                balance: 55000,
                expectedReturn: 7,
                isActiveContributor: false,
                isSweepAccount: true
            },
            {
                id: 'acc-emergency-hysa',
                name: 'Emergency HYSA',
                type: 'hysa',
                balance: 25000,
                expectedReturn: 4,
                isActiveContributor: false,
                isSweepAccount: false
            }
        ]
    },
    secondarySpouse: {
        name: 'Jordan',
        yearOfBirth: 1985,
        targetRetirementAge: 48,
        socialSecurityStartAge: 67,
        socialSecurityAnnualBenefit: 22000,
        totalYearsWorked: 16,
        estimatedLifeExpectancy: 88,
        rothConversion: {
            enabled: false,
            sourceAccount: 'standardIra',
            amountPerYear: 0,
            startDelayYears: 0,
            durationYears: 5
        },
        rolloverEvent: {
            enabled: false,
            sourceAccount: 'traditional401k',
            targetAccount: 'standardIra',
            year: 2033,
            amount: 0,
            isFullBalance: true
        },
        rule72t: {
            enabled: false,
            sourceAccount: 'standardIra',
            startAge: 55
        },
        jobs: [
            {
                id: 'job-jordan-1',
                title: 'Marketing Lead',
                baseSalary: 70000,
                startDate: '2026-01',
                bonusAmount: 0,
                bonusMonth: '',
                ltiAmount: 0,
                ltiMonth: '',
                linkedAccountId: 'acc-jordan-401k',
                employeeContributionPercent: 8,
                employerMatchPercent: 50,
                employerMatchLimitPercent: 6
            }
        ],
        accounts: [
            {
                id: 'acc-jordan-401k',
                name: 'Jordan 401(k)',
                type: 'traditional401k',
                balance: 120000,
                expectedReturn: 7,
                isActiveContributor: true,
                isSweepAccount: false
            },
            {
                id: 'acc-jordan-ira',
                name: 'Jordan Traditional IRA',
                type: 'standardIra',
                balance: 38000,
                expectedReturn: 7,
                isActiveContributor: false,
                isSweepAccount: false
            },
            {
                id: 'acc-jordan-roth',
                name: 'Jordan Roth IRA',
                type: 'rothIra',
                balance: 27000,
                principle: 18000,
                expectedReturn: 7,
                isActiveContributor: false,
                isSweepAccount: false
            }
        ]
    },
    dependents: [
        {
            id: 'dep-1',
            name: 'Jon',
            yearOfBirth: 2012,
            annualCollegeCost: 15000,
            currentCollegeSavingsBalance: 25000,
            expectedReturn: 5.5
        },
        {
            id: 'dep-2',
            name: 'Jane',
            yearOfBirth: 2015,
            annualCollegeCost: 15000,
            currentCollegeSavingsBalance: 20000,
            expectedReturn: 5.5
        }
    ],
    phaseBasedExpensesPerMonth: {
        preTeens: 6800,
        teenagers: 7200,
        college: 6200,
        preRetirementNoKids: 5500,
        earlyRetirement: 5000,
        midRetirement: 5000,
        olderRetirement: 4200,
        bonusYears: 4200
    },
    primaryResidenceMortgage: {
        enabled: true,
        currentBalance: 260000,
        interestRate: 3.5,
        originationDate: '2021-06-01',
        originationAmount: 300000,
        termYears: 30,
        yearlyInsurance: 1500,
        yearlyTaxes: 4200,
        yearlyRepairs: 1500
    },
    primaryResidenceEquity: {
        enabled: true,
        reverseMortgageEnabled: false,
        currentValue: 520000,
        annualGrowthRate: 3,
        reverseMortgageStartAge: 65
    },
    strategies: {
        sorrScenario: 'average',
        rule72tInterestRate: 5,
        decumulationMode: 'capital_preservation',
        targetLegacyBalance: 0,
        gogoMultiplier: 1,
        healthAgingOffset: 0,
        advancedRothStrategy: {
            enabled: false,
            safetyMargin: 0
        }
    },
    assumptions: {
        startDate: '2026-01',
        inflationRate: 2.5,
        w2RaiseRate: 2,
        stateTaxRate: 0,
        initialCashCushion: 0,
        displayRealDollars: true,
        graphYears: 40,
        marketReturnRates: [
            {
                startYear: 2026,
                rate: 7
            }
        ],
        conservativeShift: {
            enabled: false,
            startAge: 60,
            returnRate: 5.5
        },
        generalReturnRate: 7
    },
    metadata: {
        profileName: 'Sample Household (Family of 4)',
        description: 'Upper-middle-class household (Couple 45 & 41, 2 kids, $180k income, reaching $1.5M liquid portfolio at Age 52).',
        version: '2.0'
    }
};

/**
 * Loads or provisions the curated Sample Household profile.
 *
 * @returns {Promise<string>} The profile ID switched to.
 */
export async function loadSampleHouseholdProfile() {
    let profileData = null;

    // Try fetching from file first, fallback to embedded constant
    try {
        if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            // Fetch API documentation: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
            const res = await fetch(`./Scenarios/Sample_FamilyScenario.json?v=${Date.now()}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                profileData = await res.json();
            }
        }
    } catch {
        // Fallback to bundled constant
    }

    if (!profileData) {
        profileData = structuredClone(SAMPLE_FAMILY_DATA);
    }

    // Check if profile already exists in profile store
    const existing = getProfiles().find(p => p.name === SAMPLE_FAMILY_PROFILE_NAME);
    let targetProfileId;

    if (existing) {
        targetProfileId = existing.id;
        replaceProfileData(targetProfileId, profileData);
        switchProfile(targetProfileId);
    } else {
        targetProfileId = createProfile(SAMPLE_FAMILY_PROFILE_NAME, false);
        replaceProfileData(targetProfileId, profileData);
        switchProfile(targetProfileId);
    }

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('profile-updated', { detail: { profileId: targetProfileId } }));
    }

    return targetProfileId;
}
