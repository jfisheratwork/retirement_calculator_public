import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';

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

    _renderTopicCard(topicConfig) {
        const { icon, title, badgeText, badgeBg, badgeColor, bodyHtml } = topicConfig;
        return `
            <details class="hood-topic" style="background: var(--surface-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                <summary style="padding: 0.85rem 1rem; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; list-style: none; user-select: none; background: var(--surface);">
                    <span style="display: flex; align-items: center; gap: 0.5rem; color: var(--primary);">
                        <span>${icon}</span>
                        <span>${title}</span>
                    </span>
                    <span class="hood-badge" style="background: ${badgeBg}; color: ${badgeColor}; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">${badgeText}</span>
                </summary>
                <div class="hood-content" style="padding: 1rem; font-size: 0.88rem; line-height: 1.6; border-top: 1px solid var(--border-color);">
                    ${bodyHtml}
                </div>
            </details>
        `;
    }

    _renderCoreLoopAndIncomeTopics(w2Raise, currentYear) {
        const loopBody = `
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
        `;
        const jobsBody = `
            <p>The calculator supports multiple sequential or career-transition jobs per spouse (e.g. Corporate Tech Transitioning to Barista FIRE):</p>
            <ul style="padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.4rem;">
                <li><strong>Month-by-Month Pay Allocation:</strong> In transition years (e.g. working Tech Jan–May and Barista FIRE Jun–Dec), monthly pay is calculated based on the active job in each calendar month.</li>
                <li><strong>Targeted Bonus & LTI Vest Months:</strong> If a job specifies a bonus or LTI vest, those lump sums are credited <em>only if</em> that specific job is active during that calendar month.</li>
                <li><strong>Partial First Year:</strong> In Year 0 (${escapeHtml(currentYear)}), base salaries are pro-rated for the remaining months of the year.</li>
            </ul>
        `;
        return (
            this._renderTopicCard({
                icon: '⚡',
                title: '1. Annual Simulation Loop & Order of Operations',
                badgeText: 'Core Engine',
                badgeBg: 'rgba(9, 132, 227, 0.2)',
                badgeColor: '#74b9ff',
                bodyHtml: loopBody
            }) +
            this._renderTopicCard({
                icon: '💼',
                title: '2. Multi-Job Transitions, Cash Bonuses & LTI Stock Vesting',
                badgeText: 'Income Modeling',
                badgeBg: 'rgba(0, 184, 148, 0.2)',
                badgeColor: '#55efc4',
                bodyHtml: jobsBody
            })
        );
    }

    _getTaxAndAccountTopics() {
        return [
            [
                '🏛️',
                '3. 401(k)/403(b) Employer Matching & Pre-Tax Rollovers',
                'Pre-Tax Accounts',
                'rgba(108, 92, 231, 0.2)',
                '#a29bfe',
                '<p>Workplace pre-tax accounts feature full tier-based employer matching and dynamic rollovers.</p>'
            ],
            [
                '🔄',
                '4. Roth Conversions (Static & Advanced Dynamic Optimization)',
                'Tax Optimization',
                'rgba(253, 121, 168, 0.2)',
                '#fd79a8',
                '<p>The calculator supports two distinct methods for executing pre-tax to Roth IRA conversions: Static amounts or advanced bracket-filling strategies.</p>'
            ],
            [
                '🛡️',
                '5. The 5-Year Roth Conversion Rule & Principal Cohorts',
                'IRS Compliance',
                'rgba(225, 112, 85, 0.2)',
                '#fab1a0',
                '<p>Under IRS Section 408A, each converted Roth dollar is tracked in a dedicated 5-year aging cohort.</p>'
            ],
            [
                '⏳',
                '6. Early Retirement Access (Rule 72(t), Rule 55 & Strict Age 59.5 Enforcement)',
                'Early Access',
                'rgba(241, 196, 15, 0.2)',
                '#f1c40f',
                '<p>The engine strictly enforces IRS early distribution rules to ensure realistic retirement projections.</p>'
            ],
            [
                '📉',
                '7. Cash Flow Drawdown Hierarchy & Deficit Funding',
                'Waterfall',
                'rgba(0, 206, 201, 0.2)',
                '#81ecec',
                '<p>When living expenses and taxes exceed guaranteed income, the calculator automatically funds the deficit using a strict waterfall priority.</p>'
            ],
            [
                '⚡',
                '8. Household Surplus Cash & Designated Sweep Accounts',
                'Cash Sweep',
                'rgba(9, 132, 227, 0.2)',
                '#74b9ff',
                '<p>During working years or surplus retirement years, all unallocated net cash is automatically reinvested into the chosen sweep account.</p>'
            ]
        ];
    }

    _getLifecycleAndRiskTopics(stateTax, s1Name, s2Name) {
        return [
            [
                '📊',
                '9. Federal & State Taxes, Capital Gains & Deductions',
                'Tax Engine',
                'rgba(225, 112, 85, 0.2)',
                '#fab1a0',
                `<p>Taxes are computed each year using realistic progressive federal tables and a state income tax rate of ${escapeHtml(stateTax)}%.</p>`
            ],
            [
                '🏡',
                '10. Mortgages, Property Equity & Reverse Mortgage Backstop',
                'Housing & Equity',
                'rgba(0, 184, 148, 0.2)',
                '#55efc4',
                '<p>Housing liabilities and real estate equity are integrated into household net worth and cash flow.</p>'
            ],
            [
                '🎓',
                '11. Lifestyle Expense Phases & College Tuition Schedules',
                'Expenses & Family',
                'rgba(108, 92, 231, 0.2)',
                '#a29bfe',
                '<p>Expenses reflect real-world lifecycle transitions across 4 core retirement phases.</p>'
            ],
            [
                '📉',
                '12. Sequence of Returns Risk (SORR) & Stress Testing',
                'Stress Testing',
                'rgba(253, 121, 168, 0.2)',
                '#fd79a8',
                '<p>Test portfolio resilience against historical market crises aligned to your retirement date.</p>'
            ],
            [
                '🕊️',
                '13. Actuarial Models & Social Security Survivor Benefits',
                'Actuarial',
                'rgba(241, 196, 15, 0.2)',
                '#f1c40f',
                `<p>Simulates spouse longevity, SSA claiming age actuarial adjustments, and survivor rules based on ${escapeHtml(s1Name)} and ${escapeHtml(s2Name)}.</p>`
            ]
        ];
    }

    _renderRemainingTopics(stateTax, s1Name, s2Name) {
        const topics = [
            ...this._getTaxAndAccountTopics(),
            ...this._getLifecycleAndRiskTopics(stateTax, s1Name, s2Name)
        ];
        return topics
            .map(([icon, title, badgeText, badgeBg, badgeColor, bodyHtml]) =>
                this._renderTopicCard({ icon, title, badgeText, badgeBg, badgeColor, bodyHtml })
            )
            .join('');
    }

    getTemplate() {
        if (!this.state) return '';

        const state = this.state;
        const s1Name = state.primarySpouse?.name || 'Spouse 1';
        const s2Name = state.secondarySpouse?.name || 'Spouse 2';
        const currentYear = state.currentYear || new Date().getFullYear();
        const stateTax = state.assumptions?.stateTaxRate ?? 0;
        const w2Raise = state.assumptions?.w2RaiseRate ?? 2;

        return `
            <div class="hood-container" style="display: flex; flex-direction: column; gap: 1rem;">
                <div class="hood-header-controls" style="background: var(--surface-card); padding: 0.85rem; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.75rem;">
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
                               style="width: 100%; padding: 0.45rem 0.75rem; font-size: 0.85rem; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); box-sizing: border-box;">
                    </div>
                </div>

                <div class="hood-topics-list" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${this._renderCoreLoopAndIncomeTopics(w2Raise, currentYear)}
                    ${this._renderRemainingTopics(stateTax, s1Name, s2Name)}
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
                topics.forEach((t) => {
                    t.open = true;
                });
            });
        }

        if (collapseAllBtn) {
            collapseAllBtn.addEventListener('click', () => {
                topics.forEach((t) => {
                    t.open = false;
                });
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                topics.forEach((topic) => {
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
