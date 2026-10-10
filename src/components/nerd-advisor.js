import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';
import { FinancialPresentationService } from '../services/FinancialPresentationService.js';

export class FinancialDetailsInspector extends BaseComponent {
    constructor() {
        super();
        this.snapshot = null;
        this.appState = null;
        this.yearIndex = null;
        this.allSimData = null;
    }

    updateData(snapshot, appState, yearIndex, allSimData) {
        this.snapshot = snapshot;
        this.appState = appState;
        this.yearIndex = yearIndex;
        this.allSimData = allSimData;
        if (typeof document !== 'undefined') {
            const inspector = document.getElementById('chart-inspector');
            if (inspector) inspector.classList.add('hidden');
        }
        this.render();
        this.afterRender();
    }

    close() {
        this.snapshot = null;
        this.render();
        // Fire event so app.js can sync UI state (like unpinning the select box)
        this.dispatchEvent(new CustomEvent('closeAdvisor', { bubbles: true, composed: true }));
    }

    goToYear(newIndex) {
        if (!this.allSimData || newIndex < 0 || newIndex >= this.allSimData.length) return;
        this.dispatchEvent(
            new CustomEvent('changeYearIndex', {
                bubbles: true,
                composed: true,
                detail: { yearIndex: newIndex }
            })
        );
    }

    prevYear() {
        if (typeof this.yearIndex === 'number' && this.yearIndex > 0) {
            this.goToYear(this.yearIndex - 1);
        }
    }

    nextYear() {
        if (typeof this.yearIndex === 'number' && this.allSimData && this.yearIndex < this.allSimData.length - 1) {
            this.goToYear(this.yearIndex + 1);
        }
    }

    _getNavState() {
        const hasPrev = typeof this.yearIndex === 'number' && this.yearIndex > 0;
        const hasNext =
            typeof this.yearIndex === 'number' &&
            Array.isArray(this.allSimData) &&
            this.yearIndex < this.allSimData.length - 1;
        const prevYear = hasPrev ? this.allSimData[this.yearIndex - 1]?.year : null;
        const nextYear = hasNext ? this.allSimData[this.yearIndex + 1]?.year : null;
        const prevLabel = hasPrev ? `◀ Prev (${prevYear})` : '◀ Prev (Start)';
        const nextLabel = hasNext ? `Next (${nextYear}) ▶` : 'Next (End) ▶';
        const prevDisabledAttr = !hasPrev
            ? 'disabled style="padding: 0.4rem 0.8rem; font-size: 0.85rem; opacity: 0.4; cursor: not-allowed;"'
            : 'style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"';
        const nextDisabledAttr = !hasNext
            ? 'disabled style="padding: 0.4rem 0.8rem; font-size: 0.85rem; opacity: 0.4; cursor: not-allowed;"'
            : 'style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"';

        return {
            hasPrev,
            hasNext,
            prevYear,
            nextYear,
            prevLabel,
            nextLabel,
            prevDisabledAttr,
            nextDisabledAttr
        };
    }

    getTemplate() {
        if (!this.snapshot || !this.appState) {
            return `
                <div id="financial-details-drawer" class="financial-details-drawer nerd-advisor-drawer hidden" style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
                    <!-- Hidden when no data -->
                </div>
            `;
        }

        const snapshot = this.snapshot;
        const state = this.appState;
        const s1Name = escapeHtml(state?.primarySpouse?.name || 'Spouse 1');
        const s2Name = escapeHtml(state?.secondarySpouse?.name || 'Spouse 2');
        const title = `${snapshot.year} (${s1Name}: ${snapshot.age1}, ${s2Name}: ${snapshot.age2})`;
        const nav = this._getNavState();

        const html = `
            <div id="financial-details-drawer" class="financial-details-drawer nerd-advisor-drawer" style="margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
                    <h2 style="margin: 0;">Detailed Financial Snapshot: <span id="financial-details-year" style="color: var(--primary);">${title}</span></h2>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button id="btn-prev-year" class="btn btn-secondary" ${nav.prevDisabledAttr}>${nav.prevLabel}</button>
                        <button id="btn-next-year" class="btn btn-secondary" ${nav.nextDisabledAttr}>${nav.nextLabel}</button>
                        <button id="btn-unpin-year" class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">✕ Close</button>
                    </div>
                </div>
                <div id="financial-details-content">
                    ${this._buildContent(snapshot, state, s1Name, s2Name)}
                </div>
            </div>
        `;
        return html;
    }

    _buildContent(snapshot, state, s1Name, s2Name) {
        const prevSnapshot = this.yearIndex > 0 && this.allSimData ? this.allSimData[this.yearIndex - 1] : null;

        const getAgeStr = (snap) =>
            snap
                ? `<br><span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">(${s1Name}: ${snap.age1}, ${s2Name}: ${snap.age2})</span>`
                : '';

        let html = '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">';
        html += this._buildTooltipColumn(
            prevSnapshot,
            prevSnapshot ? `Year ${prevSnapshot.year}${getAgeStr(prevSnapshot)}` : 'Previous Year',
            s1Name,
            s2Name
        );
        html += this._buildTooltipColumn(snapshot, `Year ${snapshot.year}${getAgeStr(snapshot)}`, s1Name, s2Name);
        html += this._buildPortfolioColumn(snapshot, s1Name, s2Name);
        html += '</div>';

        html += this._buildMonthlyBreakdown(snapshot);

        return html;
    }

    _fmt(v) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
            v || 0
        );
    }

    _dot(color) {
        return `<span class="inspector-color" style="background:${color}; border: 1px solid ${color}"></span>`;
    }

    _renderJobBreakouts(jobList) {
        if (!jobList || jobList.length === 0) return '';
        let res = '';
        jobList.forEach((job) => {
            const hasAddons = job.bonus > 0 || job.lti > 0;
            const safeTitle = escapeHtml(job.title);
            const safeRange = escapeHtml(job.rangeLabel);
            if (hasAddons) {
                const safeBonus = escapeHtml(job.bonusMonthName || 'Bonus');
                const safeLti = escapeHtml(job.ltiMonthName || 'LTI');
                res += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;"><span class="inspector-label">↳ ${safeTitle} Base (${safeRange})</span><span class="inspector-value">${this._fmt(job.baseSalary)}</span></div>`;
                if (job.bonus > 0)
                    res += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;"><span class="inspector-label">↳ ${safeTitle} Bonus (${safeBonus})</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(job.bonus)}</span></div>`;
                if (job.lti > 0)
                    res += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;"><span class="inspector-label">↳ ${safeTitle} LTI (${safeLti})</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(job.lti)}</span></div>`;
            } else {
                res += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;"><span class="inspector-label">↳ ${safeTitle} (${safeRange})</span><span class="inspector-value">${this._fmt(job.total)}</span></div>`;
            }
        });
        return res;
    }

    _renderFinancialInflows(inflows) {
        let html = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Cash Inflows (Income & Distributions)</div>`;

        if (inflows.s1TakeHome > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#27ae60')} ${inflows.s1Name} Take-Home Pay</span><span class="inspector-value">${this._fmt(inflows.s1TakeHome)}</span></div>`;
            html += this._renderJobBreakouts(inflows.s1Jobs);
        }
        if (inflows.s2TakeHome > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#2ecc71')} ${inflows.s2Name} Take-Home Pay</span><span class="inspector-value">${this._fmt(inflows.s2TakeHome)}</span></div>`;
            html += this._renderJobBreakouts(inflows.s2Jobs);
        }
        if (inflows.totalSsn > 0) {
            html += `<div class="inspector-row" data-ai-target="row-ssn" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#16a085')} Social Security</span><span class="inspector-value">${this._fmt(inflows.totalSsn)}</span></div>`;
        }
        if (inflows.s1Rule72t > 0) {
            html += `<div class="inspector-row" data-ai-target="row-72t" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#f39c12')} ${inflows.s1Name} Rule 72(t) SEPP</span><span class="inspector-value" style="color: var(--success);">${this._fmt(inflows.s1Rule72t)}</span></div>`;
        }
        if (inflows.s2Rule72t > 0) {
            html += `<div class="inspector-row" data-ai-target="row-72t" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#f1c40f')} ${inflows.s2Name} Rule 72(t) SEPP</span><span class="inspector-value" style="color: var(--success);">${this._fmt(inflows.s2Rule72t)}</span></div>`;
        }
        if (inflows.reverseMortgage > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#e67e22')} Standby Home Equity</span><span class="inspector-value">${this._fmt(inflows.reverseMortgage)}</span></div>`;
        }
        if (inflows.totalDrawdowns > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#fdcb6e')} Portfolio Distributions</span><span class="inspector-value" style="color: #fdcb6e;">+${this._fmt(inflows.totalDrawdowns)}</span></div>`;
            inflows.drawdownRows.forEach((row) => {
                html += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px;"><span class="inspector-label">↳ ${row.label}</span><span class="inspector-value">+${this._fmt(row.amount)}</span></div>`;
            });
        }

        if (!inflows.hasEarnedIncome) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label"><em>No earned cash income (Fully retired)</em></span></div>`;
        }

        html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Cash Inflows</span><span class="inspector-value" style="color: var(--success);">${this._fmt(inflows.totalCashInflows)}</span></div>`;
        html += `</div>`;
        return html;
    }

    _renderFinancialExpenses(outflows, snap) {
        let html = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Cash Expenses & Outflows</div>`;
        html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#e74c3c')} Base Lifestyle</span><span class="inspector-value">${this._fmt(outflows.base)}</span></div>`;
        if (outflows.mortgage > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#c0392b')} Mortgage Payment</span><span class="inspector-value">${this._fmt(outflows.mortgage)}</span></div>`;
        }
        if (outflows.housing > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#e67e22')} Housing (Tax/Ins/Repairs)</span><span class="inspector-value">${this._fmt(outflows.housing)}</span></div>`;
        }
        if (outflows.childcare > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#d35400')} Childcare / College</span><span class="inspector-value">${this._fmt(outflows.childcare)}</span></div>`;
        }
        const nonW2Tax = snap.taxDetails?.nonW2Tax ?? snap.taxes?.nonW2TaxesPaid ?? 0;
        if (nonW2Tax > 0) {
            html += `<div class="inspector-row" data-ai-target="row-taxes" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#ff7675')} Non-W2 Taxes (Conversions/Investments)</span><span class="inspector-value">${this._fmt(nonW2Tax)}</span></div>`;
        }
        const totalCashOutflow = (snap.expenses || 0) + nonW2Tax;
        html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Cash Outflow Needed</span><span class="inspector-value" style="color: var(--danger);">${this._fmt(totalCashOutflow)}</span></div>`;
        html += `</div>`;
        return html;
    }

    _renderFinancialSurplus(snap) {
        let html = `<div style="margin-bottom: 12px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px; border: 1px solid rgba(255,255,255,0.1);">`;
        if (snap.surplus > 0) {
            html += `<div class="inspector-row" data-ai-target="row-surplus" style="font-weight: bold; font-size: 0.95rem;"><span class="inspector-label" style="color: var(--success);">Net Cash Surplus</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(snap.surplus)}</span></div>`;
            const sweepAmt = snap.reinvestedToSweep || snap.reinvestedToBrokerage || snap.surplus;
            const sweepLabel = snap.sweepAccountName
                ? `Reinvested (${escapeHtml(snap.sweepAccountName)})`
                : 'Reinvested Surplus';
            html += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: #74b9ff; margin-top: 4px;"><span class="inspector-label">↳ ${sweepLabel}</span><span class="inspector-value">+${this._fmt(sweepAmt)}</span></div>`;
        } else if (snap.unfundedShortfall > 0) {
            html += `<div class="inspector-row" data-ai-target="row-shortfall" style="font-weight: bold; font-size: 0.95rem; margin-top: 4px;"><span class="inspector-label" style="color: var(--danger);">Unfunded Shortfall (Out of Assets)</span><span class="inspector-value" style="color: var(--danger);">-${this._fmt(snap.unfundedShortfall)}</span></div>`;
        }
        html += `</div>`;
        return html;
    }

    _renderFinancialAdditions(additions, s1Name, s2Name) {
        if (additions.totalPortfolioAdditions <= 0) return '';
        let html = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Portfolio Contributions & Savings</div>`;
        if (additions.s1Payroll401k > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#20bf6b')} ${s1Name} 401(k) Payroll Deferral</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(additions.s1Payroll401k)}</span></div>`;
        }
        if (additions.s2Payroll401k > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#26de81')} ${s2Name} 401(k) Payroll Deferral</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(additions.s2Payroll401k)}</span></div>`;
        }
        if (additions.s1Match > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#20bf6b')} ${s1Name} Employer 401(k) Match</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(additions.s1Match)}</span></div>`;
        }
        if (additions.s2Match > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#26de81')} ${s2Name} Employer 401(k) Match</span><span class="inspector-value" style="color: var(--success);">+${this._fmt(additions.s2Match)}</span></div>`;
        }
        if (additions.reinvestedSurplus > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#3498db')} Reinvested Cash Surplus</span><span class="inspector-value" style="color: #74b9ff;">+${this._fmt(additions.reinvestedSurplus)}</span></div>`;
        }
        if (additions.s1RothConv > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#8e44ad')} ${s1Name} Roth Conversion</span><span class="inspector-value" style="color: var(--primary);">+${this._fmt(additions.s1RothConv)}</span></div>`;
        }
        if (additions.s2RothConv > 0) {
            html += `<div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#9b59b6')} ${s2Name} Roth Conversion</span><span class="inspector-value" style="color: var(--secondary);">+${this._fmt(additions.s2RothConv)}</span></div>`;
        }
        html += `<div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 2px;"><span class="inspector-label">Total Portfolio Additions</span><span class="inspector-value" style="color: var(--success);">${this._fmt(additions.totalPortfolioAdditions)}</span></div>`;
        html += `</div>`;
        return html;
    }

    _getRothStatusBadge(magi, filingStatus) {
        const isSingle = (filingStatus || '').toLowerCase().includes('single');
        const floor = isSingle ? 150000 : 236000;
        const ceiling = isSingle ? 165000 : 246000;
        if (magi <= floor) {
            return `<span style="background: #00b894; color: #fff; font-size: 0.65rem; font-weight: bold; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">Eligible</span>`;
        }
        if (magi < ceiling) {
            return `<span style="background: #fdcb6e; color: #2d3436; font-size: 0.65rem; font-weight: bold; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">Phaseout</span>`;
        }
        return `<span style="background: #d63031; color: #fff; font-size: 0.65rem; font-weight: bold; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">Ineligible</span>`;
    }

    _renderFinancialTaxes(tax, snap) {
        const ficaTax = snap.taxDetails?.ficaTax || 0;
        const ltcgTax = snap.taxDetails?.capitalGainsTax || 0;
        const niitTax = snap.taxDetails?.niitTax || 0;
        const fedIncomeTax = snap.taxDetails?.federalTax || 0;
        const stateTax = snap.taxDetails?.stateTax || 0;
        const irmaaExp = snap.expenseBreakdown?.irmaa || 0;
        const magi = snap.taxDetails?.magi ?? tax.magi ?? 0;
        const hsaDeduction = snap.taxDetails?.hsaDeduction ?? tax.hsaDeduction ?? 0;
        const totalStatutoryTaxes = (snap.taxDetails?.totalTax || snap.taxes || 0) + ficaTax;
        const rothBadge = this._getRothStatusBadge(magi, tax.filingStatus);
        const magiTooltip = escapeHtml(
            `Modified AGI determines statutory Roth IRA eligibility. Phases out between $150k–$165k (Single) and $236k–$246k (MFJ). Pre-tax 401(k) and workplace HSA contributions reduce MAGI.`
        );

        return `
            <div style="margin-bottom: 12px;">
                <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 2px; text-transform: uppercase; font-weight: bold;">Tax Profile & Itemized Liabilities</div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Filing Status</span><span class="inspector-value" style="font-weight: 600;">${tax.filingStatus}</span></div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Top Ordinary Bracket</span><span class="inspector-value">${tax.topBracketPct}%</span></div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Remaining Room</span><span class="inspector-value" style="color: var(--success);">${this._fmt(tax.bracketRoom)}</span></div>
                <div class="inspector-row" style="font-size: 0.85rem;"><span class="inspector-label">Effective Federal Rate</span><span class="inspector-value">${tax.effectiveRate}%</span></div>
                <div class="inspector-row" style="font-size: 0.85rem;" title="${magiTooltip}"><span class="inspector-label">Modified AGI (MAGI) ℹ️</span><span class="inspector-value" style="font-weight: 600;">${this._fmt(magi)} ${rothBadge}</span></div>
                
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1);">
                    ${hsaDeduction > 0 ? `<div class="inspector-row" style="font-size: 0.82rem; color: #00cec9;"><span class="inspector-label">↳ HSA Pre-Tax Payroll Deduction</span><span class="inspector-value" style="color: #00cec9;">-${this._fmt(hsaDeduction)}</span></div>` : ''}
                    ${fedIncomeTax > 0 ? `<div class="inspector-row" style="font-size: 0.82rem;"><span class="inspector-label">↳ Federal Income Tax</span><span class="inspector-value">${this._fmt(fedIncomeTax)}</span></div>` : ''}
                    ${ficaTax > 0 ? `<div class="inspector-row" style="font-size: 0.82rem; color: #fdcb6e;"><span class="inspector-label">↳ FICA Payroll (OASDI + Medicare)</span><span class="inspector-value">${this._fmt(ficaTax)}</span></div>` : ''}
                    ${ltcgTax > 0 ? `<div class="inspector-row" style="font-size: 0.82rem; color: #74b9ff;"><span class="inspector-label">↳ Long-Term Capital Gains Tax</span><span class="inspector-value">${this._fmt(ltcgTax)}</span></div>` : ''}
                    ${niitTax > 0 ? `<div class="inspector-row" style="font-size: 0.82rem; color: #e17055;"><span class="inspector-label">↳ Net Investment Income Tax (3.8% NIIT)</span><span class="inspector-value">${this._fmt(niitTax)}</span></div>` : ''}
                    ${stateTax > 0 ? `<div class="inspector-row" style="font-size: 0.82rem;"><span class="inspector-label">↳ State Income Tax</span><span class="inspector-value">${this._fmt(stateTax)}</span></div>` : ''}
                    ${irmaaExp > 0 ? `<div class="inspector-row" style="font-size: 0.82rem; color: #ff7675;"><span class="inspector-label">↳ Medicare IRMAA Surcharges (Healthcare)</span><span class="inspector-value">${this._fmt(irmaaExp)}</span></div>` : ''}
                </div>
                <div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 2px;">
                    <span class="inspector-label">Total Taxes & Payroll Levies</span><span class="inspector-value" style="color: var(--danger);">${this._fmt(totalStatutoryTaxes)}</span>
                </div>
            </div>
        `;
    }

    _buildTooltipColumn(snap, title, s1Name, s2Name) {
        if (!snap)
            return `<div class="timeline-container" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);"><p style="color: var(--text-muted); text-align: center;">No data available.</p></div>`;

        let html = `<div class="timeline-container" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">`;
        html += `<h3 style="color: var(--primary); text-align: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; margin-top: 0;">${title}</h3>`;

        const inflows = FinancialPresentationService.computeCashInflows(snap, this.appState);
        const outflows = FinancialPresentationService.computeExpensesAndOutflows(snap);
        const additions = FinancialPresentationService.computePortfolioAdditions(
            snap,
            this.appState,
            Math.max(0, snap.surplus || 0)
        );
        const tax = FinancialPresentationService.computeTaxProfile(snap);

        html += this._renderFinancialInflows(inflows);
        html += this._renderFinancialExpenses(outflows, snap);
        html += this._renderFinancialSurplus(snap);
        html += this._renderFinancialAdditions(additions, s1Name, s2Name);
        html += this._renderFinancialTaxes(tax, snap);
        html += '</div>';
        return html;
    }

    _renderRothPrincipalBreakdown(rb, balance) {
        if (!rb || balance <= 0) return '';
        let out = '';
        const withdrawablePct = Math.round((rb.withdrawablePrincipal / balance) * 100);
        out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 16px; color: #55efc4;"><span class="inspector-label">🟢 Withdrawable Principal (0% Tax)</span><span class="inspector-value">${this._fmt(rb.withdrawablePrincipal)} (${withdrawablePct}%)</span></div>`;
        if (rb.immaturePrincipal > 0) {
            const immPct = Math.round((rb.immaturePrincipal / balance) * 100);
            out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 16px; color: #fdcb6e;"><span class="inspector-label">🟡 Immature Conversions (<5 yrs)</span><span class="inspector-value">${this._fmt(rb.immaturePrincipal)} (${immPct}%)</span></div>`;
        }
        if (rb.earnings > 0) {
            const earnPct = Math.round((rb.earnings / balance) * 100);
            out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 16px; color: #74b9ff;"><span class="inspector-label">🔒 Tax-Free Growth (Age 59.5+)</span><span class="inspector-value">${this._fmt(rb.earnings)} (${earnPct}%)</span></div>`;
        }
        return out;
    }

    _renderGrowth(name, data, balance) {
        if (!data && (!balance || balance === 0)) return '';
        const interest = data?.interest || 0;
        const contributions = data?.contributions || 0;
        const conversionsIn = data?.conversionsIn || 0;
        const conversionsOut = data?.conversionsOut || 0;
        const rolloverIn = data?.rolloverIn || 0;
        const rolloverOut = data?.rolloverOut || 0;
        const withdrawals = data?.withdrawals || 0;
        const netWithdrawals = Math.max(0, withdrawals - conversionsOut - rolloverOut);

        if (
            interest === 0 &&
            contributions === 0 &&
            conversionsIn === 0 &&
            conversionsOut === 0 &&
            rolloverIn === 0 &&
            rolloverOut === 0 &&
            netWithdrawals === 0 &&
            (!balance || balance === 0)
        )
            return '';
        const earningBase = balance - interest;
        const pctGrowth = earningBase > 0 ? (interest / earningBase) * 100 : 0;

        let out = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-main); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">${escapeHtml(name)}</div>`;
        out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px;"><span class="inspector-label">↳ Balance</span><span class="inspector-value" style="font-weight: bold;">${this._fmt(balance)}</span></div>`;
        if (contributions > 0) {
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: var(--success);"><span class="inspector-label">↳ Contributions</span><span class="inspector-value">+${this._fmt(contributions)}</span></div>`;
        }
        if (conversionsIn > 0) {
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: #a29bfe;"><span class="inspector-label">↳ Roth Conversion (In)</span><span class="inspector-value" style="color: #a29bfe;">+${this._fmt(conversionsIn)}</span></div>`;
        }
        if (conversionsOut > 0) {
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: #fdcb6e;"><span class="inspector-label">↳ Roth Conversion (Out)</span><span class="inspector-value" style="color: #fdcb6e;">-${this._fmt(conversionsOut)}</span></div>`;
        }
        if (rolloverIn > 0) {
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: #74b9ff;"><span class="inspector-label">↳ Rollover (In)</span><span class="inspector-value" style="color: #74b9ff;">+${this._fmt(rolloverIn)}</span></div>`;
        }
        if (rolloverOut > 0) {
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: #fab1a0;"><span class="inspector-label">↳ Rollover (Out)</span><span class="inspector-value" style="color: #fab1a0;">-${this._fmt(rolloverOut)}</span></div>`;
        }
        if (netWithdrawals > 0) {
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: var(--danger);"><span class="inspector-label">↳ Withdrawals / SEPP</span><span class="inspector-value">-${this._fmt(netWithdrawals)}</span></div>`;
        }
        if (interest !== 0) {
            const color = interest > 0 ? 'var(--success)' : 'var(--danger)';
            const sign = interest > 0 ? '+' : '';
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: ${color};"><span class="inspector-label">↳ Interest/Apprec.</span><span class="inspector-value">${sign}${this._fmt(interest)} (${pctGrowth.toFixed(1)}%)</span></div>`;
        }
        out += this._renderRothPrincipalBreakdown(data?.rothPrincipalBreakdown, balance);
        out += `</div>`;
        return out;
    }

    _renderCollege529Children(children) {
        if (!Array.isArray(children)) return '';
        let out = '';
        children.forEach((c) => {
            if (c.balance > 0 || c.interest > 0 || c.drawn > 0 || (c.contribution || 0) > 0) {
                const contribText =
                    (c.contribution || 0) > 0
                        ? `<span style="color: var(--success); margin-right: 6px;">+${this._fmt(c.contribution)} saved</span>`
                        : '';
                out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.85;">
                    <span class="inspector-label">↳ ${c.name} (Bal: ${this._fmt(c.balance)})</span>
                    <span class="inspector-value">${contribText}<span style="color: var(--success);">+${this._fmt(c.interest)}</span></span>
                </div>`;
            }
        });
        return out;
    }

    _buildPortfolioColumn(snap, s1Name, s2Name) {
        let html = `<div class="timeline-container" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">`;
        html += `<h3 style="color: var(--secondary); text-align: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; margin-top: 0;">Portfolio Details</h3>`;

        if (snap.growth && snap.balances) {
            html += this._renderGrowth(`${s1Name} 401k`, snap.growth.s1Trad401k, snap.balances.s1Trad401k || 0);
            html += this._renderGrowth(`${s1Name} 403b`, snap.growth.s1Trad403b, snap.balances.s1Trad403b || 0);
            html += this._renderGrowth(`${s2Name} 401k`, snap.growth.s2Trad401k, snap.balances.s2Trad401k || 0);
            html += this._renderGrowth(`${s2Name} 403b`, snap.growth.s2Trad403b, snap.balances.s2Trad403b || 0);
            html += this._renderGrowth(
                `${s1Name} Std IRA`,
                snap.growth.s1StandardIra,
                snap.balances.s1StandardIra || 0
            );
            html += this._renderGrowth(
                `${s2Name} Std IRA`,
                snap.growth.s2StandardIra,
                snap.balances.s2StandardIra || 0
            );
            html += this._renderGrowth(`${s1Name} Roth IRA`, snap.growth.s1RothIra, snap.balances.s1RothIra || 0);
            html += this._renderGrowth(`${s2Name} Roth IRA`, snap.growth.s2RothIra, snap.balances.s2RothIra || 0);
            html += this._renderGrowth(
                `${s1Name} Brokerage & Sweep`,
                snap.growth.s1Brokerage,
                snap.balances.s1Brokerage || 0
            );
            html += this._renderGrowth(`${s2Name} Brokerage`, snap.growth.s2Brokerage, snap.balances.s2Brokerage || 0);
            html += this._renderGrowth(
                `${s1Name} High-Yield Savings (HYSA)`,
                snap.growth.s1Hysa,
                snap.balances.s1Hysa || 0
            );
            html += this._renderGrowth(
                `${s2Name} High-Yield Savings (HYSA)`,
                snap.growth.s2Hysa,
                snap.balances.s2Hysa || 0
            );
            if (
                (snap.balances.s1Cd || 0) > 0 ||
                (snap.growth.s1Cd?.interest || 0) > 0 ||
                (snap.growth.s1Cd?.rolloverOut || 0) > 0
            ) {
                html += this._renderGrowth(
                    `${s1Name} Certificates of Deposit (CD)`,
                    snap.growth.s1Cd,
                    snap.balances.s1Cd || 0
                );
            }
            if (
                (snap.balances.s2Cd || 0) > 0 ||
                (snap.growth.s2Cd?.interest || 0) > 0 ||
                (snap.growth.s2Cd?.rolloverOut || 0) > 0
            ) {
                html += this._renderGrowth(
                    `${s2Name} Certificates of Deposit (CD)`,
                    snap.growth.s2Cd,
                    snap.balances.s2Cd || 0
                );
            }
            if ((snap.balances.college529 || 0) > 0 || (snap.growth.college529?.interest || 0) > 0) {
                html += this._renderGrowth(
                    `529 College Savings`,
                    snap.growth.college529,
                    snap.balances.college529 || 0
                );
                html += this._renderCollege529Children(snap.college529?.children);
            }
            if (snap.balances.cashCushion > 0) {
                html += `<div style="margin-bottom: 12px;">
                            <div style="color: var(--text-main); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">Cash Cushion</div>
                            <div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px;"><span class="inspector-label">↳ Balance</span><span class="inspector-value" style="font-weight: bold;">${this._fmt(snap.balances.cashCushion)}</span></div>
                         </div>`;
            }
            if ((snap.balances.primaryResidenceEquity || 0) > 0 || (snap.balances.homeValue || 0) > 0) {
                const netEq = snap.balances.primaryResidenceEquity || 0;
                const homeVal = snap.balances.homeValue || 0;
                const mortBal = snap.balances.mortgageBalance || 0;
                html += `<div style="margin-bottom: 12px;">
                            <div style="color: var(--text-main); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">Primary Residence</div>
                            <div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px;"><span class="inspector-label">↳ Net Home Equity</span><span class="inspector-value" style="font-weight: bold; color: #fdcb6e;">${this._fmt(netEq)}</span></div>
                            <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.8;"><span class="inspector-label">↳ Property Value</span><span class="inspector-value">${this._fmt(homeVal)}</span></div>
                            ${mortBal > 0 ? `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.8;"><span class="inspector-label">↳ Mortgage Debt</span><span class="inspector-value" style="color: #e17055;">-${this._fmt(mortBal)}</span></div>` : ''}
                         </div>`;
            }
        }
        html += '</div>';
        return html;
    }

    _getEventsForMonth(events, month) {
        if (!Array.isArray(events)) {
            return { externalCash: 0, w2Milestones: [], otherLabels: [] };
        }
        let externalCash = 0;
        const w2Milestones = [];
        const otherLabels = [];

        events.forEach((evt) => {
            if (evt && evt.month === month) {
                if (evt.type === 'income_bonus' || evt.type === 'income_lti') {
                    w2Milestones.push({
                        type: evt.type,
                        name: evt.name || (evt.type === 'income_bonus' ? 'Bonus' : 'LTI'),
                        amount: Number(evt.amount) || 0
                    });
                } else if (evt.type === 'cash_inflow' || evt.type === 'windfall') {
                    if (typeof evt.amount === 'number') {
                        externalCash += evt.amount;
                    }
                    if (evt.label || evt.name) otherLabels.push(evt.label || evt.name);
                } else {
                    if (evt.label || evt.name) otherLabels.push(evt.label || evt.name);
                }
            }
        });

        return { externalCash, w2Milestones, otherLabels };
    }

    _buildMonthlyBreakdown(snapshot) {
        let html = `<div style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">`;
        html += `<h3 style="color: var(--accent); margin-top: 0; margin-bottom: 1rem;">Monthly Cash Flow & Timeline (${snapshot.year})</h3>`;

        html += `<table style="width: 100%; text-align: right; border-collapse: collapse; font-size: 0.9rem;">
                    <thead>
                        <tr style="color: var(--text-muted); border-bottom: 1px solid rgba(255,255,255,0.2);">
                            <th style="text-align: left; padding: 8px;">Month</th>
                            <th style="padding: 8px;">Take-Home Pay</th>
                            <th style="padding: 8px; color: var(--success);">Events / Bonus</th>
                            <th style="padding: 8px; color: #a29bfe;">Roth Conv / Rollovers</th>
                            <th style="padding: 8px; color: var(--danger);">Expenses</th>
                            <th style="padding: 8px;">Net Flow</th>
                        </tr>
                    </thead>
                    <tbody>`;

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const hasMonthlyData = Array.isArray(snapshot.monthlySnapshots) && snapshot.monthlySnapshots.length === 12;

        for (let m = 0; m < 12; m++) {
            const mSnap = hasMonthlyData ? snapshot.monthlySnapshots[m] : null;
            const { externalCash, w2Milestones, otherLabels } = this._getEventsForMonth(snapshot.events, m + 1);

            const takeHome = mSnap
                ? mSnap.takeHome !== undefined
                    ? mSnap.takeHome
                    : mSnap.w2Net
                : (snapshot.income?.takeHome || snapshot.income?.w2 || 0) / 12;
            const otherIncome = mSnap
                ? (mSnap.ssn || 0) + (mSnap.rule72t || 0)
                : ((snapshot.income?.s1?.ssn || 0) + (snapshot.income?.s2?.ssn || 0)) / 12;
            const totalMonthlyIncome = takeHome + otherIncome;
            const convAmount = mSnap ? mSnap.rothConverted || 0 : 0;
            const expenses = mSnap ? mSnap.expenses : (snapshot.expenses || 0) / 12;
            const netFlow = mSnap ? mSnap.netFlow : totalMonthlyIncome + externalCash - expenses;
            const flowColor = netFlow >= 0 ? 'var(--success)' : 'var(--danger)';

            let transferText = '-';
            if (convAmount > 0) {
                transferText = `<span style="color: #a29bfe; font-weight: bold;">+${this._fmt(convAmount)} Roth</span>`;
            } else if (otherLabels.some((l) => l.toLowerCase().includes('rollover'))) {
                transferText = `<span style="color: #74b9ff; font-size: 0.8rem;">Rollover</span>`;
            }

            const bonusMilestone = mSnap?.bonusMilestone;
            const totalMilestoneGross = bonusMilestone
                ? bonusMilestone.gross
                : w2Milestones.reduce((acc, curr) => acc + curr.amount, 0);
            const totalMilestoneNet = bonusMilestone ? bonusMilestone.netTakeHome : null;

            const milestoneDetails = bonusMilestone?.items
                ? bonusMilestone.items
                      .map(
                          (item) =>
                              `${item.name}: +$${Math.round(item.gross).toLocaleString()} gross (+$${Math.round(item.netTakeHome).toLocaleString()} take-home)`
                      )
                      .join('\n')
                : w2Milestones
                      .map((item) => `${item.name}: +$${Math.round(item.amount).toLocaleString()} gross`)
                      .join('\n');

            let eventCellHtml = '-';
            if (externalCash > 0 && totalMilestoneGross > 0) {
                const takeHomeBadge =
                    totalMilestoneNet !== null ? `(+${this._fmt(totalMilestoneNet)} Take-Home)` : `(in Take-Home)`;
                eventCellHtml = `
                    <div style="color: var(--success); font-weight: bold;">+${this._fmt(externalCash)}</div>
                    <div style="font-size: 0.72rem; color: var(--accent); margin-top: 2px;" title="${milestoneDetails}">+${this._fmt(totalMilestoneGross)} Gross ${takeHomeBadge}</div>
                `;
            } else if (externalCash > 0) {
                eventCellHtml = `<span style="color: var(--success); font-weight: bold;">+${this._fmt(externalCash)}</span>`;
            } else if (totalMilestoneGross > 0) {
                const takeHomeBadge =
                    totalMilestoneNet !== null
                        ? `<span style="display: block; font-size: 0.72rem; color: var(--accent); font-weight: normal;">(+${this._fmt(totalMilestoneNet)} Take-Home)</span>`
                        : `<span style="display: block; font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">(in Take-Home)</span>`;
                eventCellHtml = `
                    <div style="color: var(--success); font-weight: bold; line-height: 1.2;" title="${milestoneDetails}">
                        +${this._fmt(totalMilestoneGross)} Gross
                        ${takeHomeBadge}
                    </div>
                `;
            } else if (otherLabels.length > 0) {
                eventCellHtml = `<span style="font-size: 0.75rem; color: var(--accent);">${otherLabels[0]}</span>`;
            }

            html += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="text-align: left; padding: 8px; font-weight: bold;">${monthNames[m]}</td>
                        <td style="padding: 8px;">${this._fmt(totalMonthlyIncome)}</td>
                        <td style="padding: 8px;">${eventCellHtml}</td>
                        <td style="padding: 8px;">${transferText}</td>
                        <td style="padding: 8px; color: var(--danger);">${this._fmt(expenses)}</td>
                        <td style="padding: 8px; color: ${flowColor}; font-weight: bold;">${this._fmt(netFlow)}</td>
                     </tr>`;
        }
        html += `</tbody></table>`;
        const nav = this._getNavState();
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 0.5rem;">
                <button id="btn-prev-year-bottom" class="btn btn-secondary" ${nav.prevDisabledAttr}>${nav.prevLabel}</button>
                <span style="color: var(--text-muted); font-size: 0.85rem;">Year ${snapshot.year} (${(this.yearIndex ?? 0) + 1} of ${this.allSimData ? this.allSimData.length : 1})</span>
                <button id="btn-next-year-bottom" class="btn btn-secondary" ${nav.nextDisabledAttr}>${nav.nextLabel}</button>
            </div>
        </div>`;
        return html;
    }

    afterRender() {
        if (!this.snapshot) return;

        this.addEvent('#btn-unpin-year', 'click', () => {
            this.close();
        });

        this.addEvent('#btn-prev-year', 'click', () => {
            this.prevYear();
        });

        this.addEvent('#btn-next-year', 'click', () => {
            this.nextYear();
        });

        this.addEvent('#btn-prev-year-bottom', 'click', () => {
            this.prevYear();
        });

        this.addEvent('#btn-next-year-bottom', 'click', () => {
            this.nextYear();
        });

        if (!this._keyHandler) {
            this._keyHandler = (e) => {
                if (!this.snapshot) return;
                const activeEl = document.activeElement;
                const tag = activeEl ? activeEl.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl?.isContentEditable) return;

                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.prevYear();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.nextYear();
                }
            };
            if (typeof window !== 'undefined') {
                window.addEventListener('keydown', this._keyHandler);
            }
        }

        // Scroll into view on newly rendered data
        setTimeout(() => {
            const drawer =
                this.querySelector('#financial-details-drawer') || this.querySelector('#nerd-advisor-drawer');
            if (drawer) drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }
}

// Backwards-compatible class and prototype aliases
export const NerdAdvisor = FinancialDetailsInspector;
FinancialDetailsInspector.prototype._renderNerdInflows = FinancialDetailsInspector.prototype._renderFinancialInflows;
FinancialDetailsInspector.prototype._renderNerdExpenses = FinancialDetailsInspector.prototype._renderFinancialExpenses;
FinancialDetailsInspector.prototype._renderNerdSurplus = FinancialDetailsInspector.prototype._renderFinancialSurplus;
FinancialDetailsInspector.prototype._renderNerdAdditions =
    FinancialDetailsInspector.prototype._renderFinancialAdditions;
FinancialDetailsInspector.prototype._renderNerdTaxes = FinancialDetailsInspector.prototype._renderFinancialTaxes;

if (typeof customElements !== 'undefined') {
    if (!customElements.get('financial-details-inspector')) {
        customElements.define('financial-details-inspector', FinancialDetailsInspector);
    }
    if (!customElements.get('nerd-advisor')) {
        customElements.define('nerd-advisor', class extends FinancialDetailsInspector {});
    }
}

export function renderFinancialDetails(snapshot, state, yearIndex, allSimData) {
    let advisor = document.querySelector('financial-details-inspector') || document.querySelector('nerd-advisor');
    if (!advisor) {
        const container =
            document.getElementById('financial-details-container') ||
            document.getElementById('nerd-advisor-container') ||
            document.body;
        advisor = document.createElement('financial-details-inspector');
        container.appendChild(advisor);
    }
    advisor.updateData(snapshot, state, yearIndex, allSimData);
}
export const renderNerdDetails = renderFinancialDetails;

/**
 * Initializes financial details inspector listeners and attaches global backwards compatibility.
 */
export function initFinancialDetailsInspector() {
    if (typeof window !== 'undefined') {
        window.renderFinancialDetails = renderFinancialDetails;
        window.renderNerdDetails = renderFinancialDetails;
    }
}
export const initNerdAdvisor = initFinancialDetailsInspector;
