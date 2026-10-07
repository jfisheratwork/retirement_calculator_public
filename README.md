# Detailed Retirement Calculator

An interactive, multi-decade retirement simulation and strategic decumulation modeling engine built with modern vanilla JavaScript and Chart.js.

Designed to model complex lifetime decumulation scenarios with month-by-month precision, statutory tax compliance, and multi-spouse optimization.

---

## About This Project

This project is a personal, exploratory hobby project created out of curiosity for personal finance modeling, sequence of returns dynamics, and long-term wealth preservation strategies.

- **Built with AI Collaboration:** Developed with the assistance of Google Gemini for architectural prototyping, simulation engineering, and mathematical modeling.
- **Hobby Sandbox / No Warranties:** This tool is strictly a creative experiment and computational sandbox for fun. Calculations, tax projections, and actuarial models are provided as-is without any warranties, guarantees, or representations of accuracy. It is not intended as financial, legal, investment, or tax advice.
- **Personal Use Only:** This repository and its contents are personal creative work and are not licensed or intended for reuse, redistribution, or commercial application.
- **Feedback & Conversation:** If you find this project interesting, have questions, or have ideas for scenarios and features you would love to see modeled, feel free to reach out and get in touch!

---

## Key Capabilities & Features

### 1. Dual-Spouse Career & Income Modeling
- **Month-by-Month Resolution:** Granular timeline accounting for career start and retirement dates, mid-year job switches, and partial-year earnings.
- **W-2 Withholding & Deduplication:** Distinct accounting for base salaries, annual bonuses, and long-term incentive (LTI) vesting events without cash flow duplication.
- **Employer 401(k) Match & Contributions:** Automated statutory contribution limits, employer match tiers, and pre-tax payroll deductions.

### 2. Strategic Decumulation & Account Drawdowns
- **Age-Tiered Drawdown Waterfalls:**
  - **Pre-60:** Automatically prioritizes penalty-free Roth principal basis before taxable brokerage liquidation, shielding tax-deferred accounts from premature 10% penalty exposure.
  - **Post-60:** Seamlessly pivots withdrawal priority to deplete tax-deferred pools (403(b), Traditional IRA) before exhausting Roth or taxable assets.
- **Rule 72(t) SEPP Distributions:** IRS amortization and fixed annuitization methods with month-of-inception valuation, dedicated account segregation, and statutory 5-year/age 59.5 holding rules.
- **Roth Conversion Ladders:** Configurable annual conversions per spouse, plus dynamic household tax bracket room filling.
- **Single Designated Sweep Account:** Automatic sweeping of annual surplus cash flow into a user-designated taxable brokerage or high-yield savings account.

### 3. Actuarial Social Security & Survivor Protections
- **Statutory Claiming Curves:** Accurate benefit scaling for claiming ages 62 through 70 (reduction factors from 70% at 62 to 124% at 70).
- **Spousal Survivor Step-Up:** Automatically steps up the surviving spouse to the higher household benefit upon life expectancy milestones, accounting for widow/widower tax bracket transitions.

### 4. Sequence of Returns Risk (SORR) Stress Testing
- Real-time stress testing against 8 historical financial crises:
  - Lost Decade (2000–2009)
  - Stagflation (1973–1982)
  - Post-Crash Recovery (1987–1996)
  - The 90s Bull (1990–1999)
  - Tech Boom (2015–2024)
  - Global Financial Crisis & ZIRP (2008–2017)
  - Go-Go 60s & Nifty Fifty (1968–1977)
  - The Great Crash & Depression (1929–1938)
- Distinguishes pre-59.5 bridge liquidity lockouts from permanent portfolio depletions.

### 5. Interactive UI & Deep Observability
- **Chart Inspector:** High-resolution year-by-year inspection of balances, asset allocation, and cash flows.
- **"Under the Hood" Deep Dive:** Granular breakdown of federal ordinary brackets, long-term capital gains, state taxes, itemized living expenses, and cash flow waterfalls.
- **Scenario Sandbox ("What If?"):** Instant scenario testing for early retirement milestones, expense scaling, college funding goals, home equity access, and savings boosts.
- **Profile Management:** Multi-profile management with local JSON import/export, profile cloning, and persistent state.

---

> Written with the assistance of Google Gemini
