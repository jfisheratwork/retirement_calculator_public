import { BaseComponent } from './base-component.js';
import { getState } from '../services/state.js';

class UnderTheHood extends BaseComponent {
    constructor() {
        super();
        this.state = null;
    }

    connectedCallback() {
        super.connectedCallback();
    }

    afterRender() {
        this.bindEvents();
    }

    setState(state) {
        this.state = state;
        this.render();
        this.bindEvents();
    }

    getTemplate() {
        if (!this.state) return '';
        
        const state = this.state;
        const s1Name = state.primarySpouse?.name || 'Spouse 1';
        const s2Name = state.secondarySpouse?.name || 'Spouse 2';
        const s1RetAge = state.primarySpouse?.targetRetirementAge || 60;
        const s2RetAge = state.secondarySpouse?.targetRetirementAge || 60;
        const currentYear = state.currentYear || new Date().getFullYear();
        const s1Age = currentYear - (state.primarySpouse?.birthYear || state.primarySpouse?.yearOfBirth || (currentYear - 48));
        const s2Age = currentYear - (state.secondarySpouse?.birthYear || state.secondarySpouse?.yearOfBirth || (currentYear - 48));
        const stateTax = state.assumptions?.stateTaxRate ?? 0;
        const inflation = state.assumptions?.inflationRate ?? 3;
        const w2Raise = state.assumptions?.w2RaiseRate ?? 2;
        const s1LifeExp = state.primarySpouse?.estimatedLifeExpectancy || 95;
        const s2LifeExp = state.secondarySpouse?.estimatedLifeExpectancy || 95;
        const revMortAge = state.primaryResidenceEquity?.reverseMortgageStartAge || 68;

        const escapeHtml = (unsafe) => {
            return (unsafe || '').toString()
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        };

        return `
            <div class="hood-container" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="hood-header-controls" style="background: rgba(15, 23, 42, 0.6); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="font-size: 0.85rem; color: var(--text-muted);">
                            Interactive reference guide detailing all math, tax rules, and withdrawal hierarchies.
                        </div>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn-hood-expand-all btn btn-secondary" style="padding: 0.25rem 0.65rem; font-size: 0.75rem; border-radius: 4px; cursor: pointer;">📂 Expand All</button>
                            <button class="btn-hood-collapse-all btn btn-secondary" style="padding: 0.25rem 0.65rem; font-size: 0.75rem; border-radius: 4px; cursor: pointer;">📁 Collapse All</button>
                        </div>
                    </div>
                    <div style="position: relative;">
                        <input type="text" class="hood-search-input" placeholder="🔍 Search calculations (e.g. 72(t), Roth 5-Year, Sweep, Taxes, SORR)..." 
                               style="width: 100%; padding: 0.45rem 0.75rem; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-darker); color: var(--text-color); box-sizing: border-box;">
                    </div>
                </div>

                <div class="hood-topics-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <!-- Topic 1: Simulation Loop & Order of Operations -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>⚡</span>
                                <span>1. Annual Simulation Loop & Order of Operations</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(9, 132, 227, 0.2); color: #74b9ff; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Core Engine</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Each calendar year runs an 8-phase sequential simulation loop that calculates exact cash inflows, portfolio reallocations, and liability settlements:</p>
                            <ol style="padding-left: 1.25rem; margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
                                <li><strong>Base Income:</strong> Pro-rates multi-job monthly W2 salaries, applies annual merit raises (${escapeHtml(w2Raise)}%), awards month-specific bonuses/LTI stock vests, and calculates Social Security.</li>
                                <li><strong>Pre-Tax Rollovers:</strong> Moves designated 401(k)/403(b) balances to target Standard IRAs if a rollover is scheduled for the current year.</li>
                                <li><strong>Expenses & Escrow:</strong> Aggregates phase-based lifestyle expenses, child college tuition curves, and mortgage payments (P&I + inflation-adjusted escrow).</li>
                                <li><strong>Mandatory & Statutory Drawdowns:</strong> Calculates required annual distributions, including <strong>Rule 72(t) SEPP</strong> payments and active RMDs.</li>
                                <li><strong>Roth Conversions:</strong> Executes static manual conversions or dynamic bracket-filling conversions, moving pre-tax dollars to Roth IRAs and queuing tax liabilities.</li>
                                <li><strong>Discretionary Drawdown Waterfall:</strong> If guaranteed income is less than expenses, the deficit is drawn according to the strict withdrawal hierarchy.</li>
                                <li><strong>Taxes & Surplus Reinvestment:</strong> Computes progressive federal & state taxes, pays capital gains, and sweeps 100% of remaining household cash surplus into the designated sweep account.</li>
                                <li><strong>Market Growth:</strong> Applies historical SORR return sequences or expected asset class return rates to ending account balances.</li>
                            </ol>
                        </div>
                    </details>

                    <!-- Topic 2: Jobs, Salaries, Bonuses & LTI Vesting -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>💼</span>
                                <span>2. Multi-Job Transitions, Cash Bonuses & LTI Stock Vesting</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(0, 184, 148, 0.2); color: #55efc4; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Income Modeling</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>The calculator supports multiple sequential or career-transition jobs per spouse (e.g. Corporate Tech Transitioning to Barista FIRE):</p>
                            <ul style="padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.4rem;">
                                <li><strong>Month-by-Month Pay Allocation:</strong> In transition years (e.g. working Tech Jan–May and Barista FIRE Jun–Dec), monthly pay is calculated based on the active job in each calendar month.</li>
                                <li><strong>Targeted Bonus & LTI Vest Months:</strong> If a job specifies a bonus or LTI vest, those lump sums are credited <em>only if</em> that specific job is active during that calendar month.</li>
                                <li><strong>Partial First Year:</strong> In Year 0 (${escapeHtml(currentYear)}), base salaries are pro-rated for the remaining months of the year.</li>
                            </ul>
                        </div>
                    </details>

                    <!-- Topic 3: 401(k)/403(b) Workplace Plans & Rollovers -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>🏛️</span>
                                <span>3. 401(k)/403(b) Employer Matching & Pre-Tax Rollovers</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(108, 92, 231, 0.2); color: #a29bfe; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Pre-Tax Accounts</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Workplace pre-tax accounts feature full tier-based employer matching and dynamic rollovers.</p>
                        </div>
                    </details>
                    
                    <!-- Topic 4: Roth Conversions & Advanced Strategy -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>🔄</span>
                                <span>4. Roth Conversions (Static & Advanced Dynamic Optimization)</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(253, 121, 168, 0.2); color: #fd79a8; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Tax Optimization</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>The calculator supports two distinct methods for executing pre-tax to Roth IRA conversions: Static amounts or advanced bracket-filling strategies.</p>
                        </div>
                    </details>

                    <!-- Topic 5: 5-Year Roth Rule -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>🛡️</span>
                                <span>5. The 5-Year Roth Conversion Rule & Principal Cohorts</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(225, 112, 85, 0.2); color: #fab1a0; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">IRS Compliance</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Under IRS Section 408A, each converted Roth dollar is tracked in a dedicated 5-year aging cohort.</p>
                        </div>
                    </details>
                    
                    <!-- Topic 6: Early Retirement Rules (72t & Rule 55) -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>⏳</span>
                                <span>6. Early Retirement Access (Rule 72(t), Rule 55 & Strict Age 59.5 Enforcement)</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(241, 196, 15, 0.2); color: #f1c40f; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Early Access</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>The engine strictly enforces IRS early distribution rules to ensure realistic retirement projections.</p>
                        </div>
                    </details>

                    <!-- Topic 7: Withdrawal Hierarchy -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>📉</span>
                                <span>7. Cash Flow Drawdown Hierarchy & Deficit Funding</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(0, 206, 201, 0.2); color: #81ecec; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Waterfall</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>When living expenses and taxes exceed guaranteed income, the calculator automatically funds the deficit using a strict waterfall priority.</p>
                        </div>
                    </details>
                    
                    <!-- Topic 8: Sweep Accounts & Surplus Reinvestment -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>⚡</span>
                                <span>8. Household Surplus Cash & Designated Sweep Accounts</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(9, 132, 227, 0.2); color: #74b9ff; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Cash Sweep</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>During working years or surplus retirement years, all unallocated net cash is automatically reinvested into the chosen sweep account.</p>
                        </div>
                    </details>

                    <!-- Topic 9: Taxes, Capital Gains & Deductions -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>📊</span>
                                <span>9. Federal & State Taxes, Capital Gains & Deductions</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(225, 112, 85, 0.2); color: #fab1a0; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Tax Engine</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Taxes are computed each year using realistic progressive federal tables and a state income tax rate of ${escapeHtml(stateTax)}%.</p>
                        </div>
                    </details>

                    <!-- Topic 10: Real Estate & Reverse Mortgage -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>🏡</span>
                                <span>10. Mortgages, Property Equity & Reverse Mortgage Backstop</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(0, 184, 148, 0.2); color: #55efc4; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Housing & Equity</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Housing liabilities and real estate equity are integrated into household net worth and cash flow.</p>
                        </div>
                    </details>

                    <!-- Topic 11: Phase-Based Budgeting & Dependents -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>🎓</span>
                                <span>11. Lifestyle Expense Phases & College Tuition Schedules</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(108, 92, 231, 0.2); color: #a29bfe; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Expenses & Family</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Expenses reflect real-world lifecycle transitions across 4 core retirement phases.</p>
                        </div>
                    </details>

                    <!-- Topic 12: Sequence of Returns Risk -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>📉</span>
                                <span>12. Sequence of Returns Risk (SORR) & Stress Testing</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(253, 121, 168, 0.2); color: #fd79a8; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Stress Testing</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Test portfolio resilience against historical market crises aligned to your retirement date.</p>
                        </div>
                    </details>

                    <!-- Topic 13: Actuarial & Social Security Survivor Logic -->
                    <details class="hood-topic" style="background: var(--bg-darker); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                        <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: rgba(30, 41, 59, 0.5);">
                            <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                                <span>🕊️</span>
                                <span>13. Actuarial Models & Social Security Survivor Benefits</span>
                            </span>
                            <span class="hood-badge" style="background: rgba(241, 196, 15, 0.2); color: #f1c40f; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">Actuarial</span>
                        </summary>
                        <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                            <p>Simulates spouse longevity, SSA claiming age actuarial adjustments, and survivor rules based on ${escapeHtml(s1Name)} and ${escapeHtml(s2Name)}.</p>
                        </div>
                    </details>

                </div>
            </div>
        `;
    }

    bindEvents() {
        const expandAllBtn = this.querySelector('.btn-hood-expand-all');
        const collapseAllBtn = this.querySelector('.btn-hood-collapse-all');
        const searchInput = this.querySelector('.hood-search-input');
        const topics = this.querySelectorAll('.hood-topic');

        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
                topics.forEach(t => { t.open = true; });
            });
        }

        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
                topics.forEach(t => { t.open = false; });
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                topics.forEach(topic => {
                    const text = topic.textContent.toLowerCase();
                    if (!query || text.includes(query)) {
                        topic.style.display = 'block';
                        if (query) topic.open = true; 
                    } else {
                        topic.style.display = 'none';
                    }
                });
            });
        }
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('under-the-hood')) {
    customElements.define('under-the-hood', UnderTheHood);
}

// Helper function backward compatibility for app.js transition
export function renderUnderTheHood(containerId, state) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let component = container.querySelector('under-the-hood');
    if (!component) {
        component = document.createElement('under-the-hood');
        container.innerHTML = '';
        container.appendChild(component);
    }
    component.setState(state);
}
