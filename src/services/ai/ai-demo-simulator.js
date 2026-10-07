/**
 * AI Demo / Simulation Mode Provider
 * 
 * Generates rich, context-aware diagnostic analyses for the core planning prompt chips
 * without requiring an external Gemini API key. Demonstrates live chart hovering,
 * financial detail targeting, and 1-click suggestion cards.
 */

export class AIDemoSimulator {
    /**
     * Simulates an AI response tailored to active state and prompt category.
     * @param {string} prompt - User request or prompt chip.
     * @param {Object} state - Active profile state.
     * @param {Array} simData - Active simulation trajectory data.
     * @param {Object} stressAlerts - Evaluated stress test alerts.
     * @returns {Promise<{ prose: string, commands: Array }>}
     */
    static async simulateResponse(prompt, state, simData = [], stressAlerts = []) {
        // Add realistic typing latency (600ms)
        await new Promise(resolve => setTimeout(resolve, 600));

        const lower = (prompt || '').toLowerCase();
        const s1 = state.primarySpouse || {};
        const s2 = state.secondarySpouse || {};
        const s1Name = s1.name || 'Spouse 1';
        const retAge = s1.targetRetirementAge || 60;
        const currentYear = new Date().getFullYear();
        const retYear = currentYear + (retAge - (s1.yearOfBirth ? currentYear - s1.yearOfBirth : 45));

        if (lower.includes('bridge') || lower.includes('liquidity') || lower.includes('59.5') || lower.includes('shortfall')) {
            return this._simulateBridgeLiquidity(s1Name, retAge, retYear, s1, simData);
        }

        if (lower.includes('roth') || lower.includes('conversion') || lower.includes('tax')) {
            return this._simulateRothOptimization(s1Name, state, simData);
        }

        if (lower.includes('stress') || lower.includes('sorr') || lower.includes('sequence') || lower.includes('risk')) {
            return this._simulateStressAnalysis(s1Name, stressAlerts, simData);
        }

        if (lower.includes('social security') || lower.includes('ssn') || lower.includes('claim')) {
            return this._simulateSocialSecurity(s1Name, s1, s2, simData);
        }

        // Generic plan review
        return this._simulateGeneralReview(s1Name, retAge, retYear, simData);
    }

    static _simulateBridgeLiquidity(s1Name, retAge, retYear, s1, simData) {
        const is72tEnabled = Boolean(s1.rule72t?.enabled);
        const bridgeGapYear = retYear + 2;

        let prose = `### 🔍 Bridge Liquidity & Pre-59½ Analysis\n\n`;
        prose += `* **Retirement Horizon:** ${s1Name} plans to retire at **Age ${retAge} (${retYear})**, which is prior to the IRS penalty-free threshold of **Age 59½**.\n`;

        if (!is72tEnabled && retAge < 59.5) {
            prose += `* **⚠️ Pre-59½ Bridge Lockout Risk:** In early retirement, earned salary drops to \$0. Without **Rule 72(t) SEPP** or sufficient taxable brokerage cash, pre-tax 401(k)/IRA assets remain locked behind the 10% early withdrawal penalty.\n`;
            prose += `* **Recommendation:** Enable a structured **Rule 72(t) SEPP amortization distribution** on your traditional IRA starting at age ${retAge} to provide statutory tax-advantaged cashflow without penalties.\n`;

            return {
                prose,
                commands: [
                    { action: 'focus_year', year: bridgeGapYear },
                    { action: 'inspect_chart', chartId: 'chart2', year: bridgeGapYear },
                    { action: 'highlight_detail', target: 'nerd-row-shortfall' },
                    { action: 'highlight_input', target: 'primarySpouse-rule72t-container' },
                    { action: 'suggest_patch', label: `Enable 72(t) SEPP for ${s1Name} at Age ${retAge}`, path: 'primarySpouse.rule72t.enabled', value: true }
                ]
            };
        } else {
            prose += `* **✅ Bridge Liquidity Fully Funded:** Your current cash cushion and structured distributions cover your living expenses between retirement and age 59½ with zero penalty exposure.\n`;
            return {
                prose,
                commands: [
                    { action: 'focus_year', year: retYear },
                    { action: 'inspect_chart', chartId: 'chart1', year: retYear },
                    { action: 'highlight_detail', target: 'nerd-row-liquid' }
                ]
            };
        }
    }

    static _simulateRothOptimization(s1Name, state, simData) {
        const isAdvRoth = Boolean(state.strategies?.advancedRothStrategy?.enabled);
        const targetBracket = state.strategies?.advancedRothStrategy?.targetTaxBracket || '12%';

        let prose = `### 💡 Roth Conversion Optimization Strategy\n\n`;
        prose += `* **Tax Arbitrage Opportunity:** During early retirement years before Social Security (Age 67–70) and RMDs (Age 73–75) begin, your taxable income drops significantly.\n`;
        prose += `* **Target Tax Bracket:** Converting Traditional IRA balances to Roth up to the top of the **12% / 22% federal bracket** permanently eliminates high future RMD tax spikes while paying historically low marginal rates.\n`;

        if (!isAdvRoth) {
            prose += `* **Actionable Step:** Enable the **Advanced Dynamic Roth Strategy** to automatically fill low tax brackets up to 12% annually.\n`;
            return {
                prose,
                commands: [
                    { action: 'inspect_chart', chartId: 'chart3', year: 2028 },
                    { action: 'highlight_input', target: 'strategies-advancedRothStrategy-enabled-input' },
                    { action: 'suggest_patch', label: 'Enable Advanced Roth Strategy (12% Target)', path: 'strategies.advancedRothStrategy.enabled', value: true }
                ]
            };
        } else {
            prose += `* **Status:** Advanced Roth Strategy is active with target bracket **${targetBracket}**. Your tax-free Roth bucket is compounding smoothly.\n`;
            return {
                prose,
                commands: [
                    { action: 'inspect_chart', chartId: 'chart3', year: 2030 },
                    { action: 'highlight_detail', target: 'nerd-row-roth' }
                ]
            };
        }
    }

    static _simulateStressAnalysis(s1Name, stressAlerts, simData) {
        let prose = `### 🛡️ Historical Stress-Test & SORR Resilience\n\n`;
        prose += `* **Historical Sequences Evaluated:** Your plan has been backtested against 8 historical bear markets including 1973 Stagflation, 2000 Dot-com, and 2008 Great Financial Crisis.\n`;

        const failing = Array.isArray(stressAlerts) ? stressAlerts.filter(s => s.status !== 'passed') : [];
        if (failing.length > 0) {
            const firstFail = failing[0];
            prose += `* **⚠️ Vulnerability Found (${firstFail.name}):** Experiencing a severe drawdown in early retirement creates a cash pinch around **Year ${firstFail.firstShortfallYear || 'early retirement'}**.\n`;
            prose += `* **Mitigation Strategy:** Consider shifting 20% of equity into a cash/bond reserve or enabling the Conservative Glide Path to reduce market volatility during the critical 5-year retirement transition.\n`;

            return {
                prose,
                commands: [
                    { action: 'focus_year', year: firstFail.firstShortfallYear || 2035 },
                    { action: 'inspect_chart', chartId: 'chart6', year: firstFail.firstShortfallYear || 2035 },
                    { action: 'highlight_detail', target: `stress-badge-${firstFail.id}` },
                    { action: 'suggest_patch', label: 'Enable Conservative Glide Path (Age 60)', path: 'assumptions.conservativeShift.enabled', value: true }
                ]
            };
        } else {
            prose += `* **🌟 Exceptional Resilience:** Your portfolio withstands all 8 historical stress scenarios across the entire 40-year horizon with zero depletion!\n`;
            return {
                prose,
                commands: [
                    { action: 'inspect_chart', chartId: 'chart6', year: 2040 }
                ]
            };
        }
    }

    static _simulateSocialSecurity(s1Name, s1, s2, simData) {
        const s1ClaimAge = s1.socialSecurity?.startAge || 67;
        const s1Benefit = s1.socialSecurity?.annualBenefit || 0;

        let prose = `### 📈 Social Security Optimization Analysis\n\n`;
        prose += `* **Current Claim Age:** ${s1Name} is set to claim at **Age ${s1ClaimAge}** (FRA baseline benefit: \$${Math.round(s1Benefit).toLocaleString()}/yr).\n`;
        prose += `* **Actuarial Impact:**\n`;
        prose += `  - Claiming at **62** reduces annual guaranteed income to **70%**.\n`;
        prose += `  - Delaying to **70** increases annual guaranteed income to **124%** (+8%/yr delayed credits).\n`;
        prose += `* **Recommendation:** Delaying the higher earner's benefit to age 70 maximizes surviving spouse longevity protection.\n`;

        return {
            prose,
            commands: [
                { action: 'focus_year', year: 2045 },
                { action: 'inspect_chart', chartId: 'chart2', year: 2045 },
                { action: 'highlight_detail', target: 'nerd-row-ssn' },
                { action: 'highlight_input', target: 'primarySpouse-ssn-start-age-input' }
            ]
        };
    }

    static _simulateGeneralReview(s1Name, retAge, retYear, simData) {
        const lastYear = simData && simData.length > 0 ? simData[simData.length - 1] : null;
        const endLiquid = Math.round(lastYear?.liquidEndingBalance || 0);

        let prose = `### 📊 Holistic Retirement Plan Assessment\n\n`;
        prose += `* **Trajectory:** Planning for retirement in **${retYear} (Age ${retAge})**.\n`;
        prose += `* **Ending Liquid Portfolio:** Projected at **\$${endLiquid.toLocaleString()}**.\n`;
        prose += `* **Key Strengths:** Balanced asset allocation across tax-deferred, Roth, and taxable buckets.\n`;
        prose += `* **Next Steps:** Review the **Stress-Test Fan Chart** (Chart 6) and **Detailed Financial Snapshot** below for year-by-year cashflow validation.\n`;

        return {
            prose,
            commands: [
                { action: 'inspect_chart', chartId: 'chart1', year: retYear }
            ]
        };
    }
}
