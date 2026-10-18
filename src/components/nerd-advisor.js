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
        const hasS2 = Boolean(state?.secondarySpouse?.name && snapshot.age2 && snapshot.age2 > 0);
        const title = hasS2
            ? `${snapshot.year} (${s1Name}: ${snapshot.age1}, ${s2Name}: ${snapshot.age2})`
            : `${snapshot.year} (${s1Name}: ${snapshot.age1})`;
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

        const hasS2 = Boolean(state?.secondarySpouse?.name && snapshot.age2 && snapshot.age2 > 0);
        const getAgeStr = (snap) => {
            if (!snap) return '';
            return hasS2
                ? `<br><span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">(${s1Name}: ${snap.age1}, ${s2Name}: ${snap.age2})</span>`
                : `<br><span style="font-size: 0.75rem; font-weight: normal; color: var(--text-muted);">(${s1Name}: ${snap.age1})</span>`;
        };

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
            html += `<div class="inspector-row" data-ai-target="row-72t" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#f39c12')} ${inflows.s1Name} Penalty-Free Early IRA Payout (Rule 72t)</span><span class="inspector-value" style="color: var(--success);">${this._fmt(inflows.s1Rule72t)}</span></div>`;
        }
        if (inflows.s2Rule72t > 0) {
            html += `<div class="inspector-row" data-ai-target="row-72t" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#f1c40f')} ${inflows.s2Name} Penalty-Free Early IRA Payout (Rule 72t)</span><span class="inspector-value" style="color: var(--success);">${this._fmt(inflows.s2Rule72t)}</span></div>`;
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
        const earlyPenalty = snap.taxDetails?.earlyWithdrawalPenalty ?? snap.earlyWithdrawalPenalty ?? 0;
        if (nonW2Tax > 0) {
            html += `<div class="inspector-row" data-ai-target="row-taxes" style="font-size: 0.85rem;"><span class="inspector-label">${this._dot('#ff7675')} Non-W2 Taxes (Conversions/Investments)</span><span class="inspector-value">${this._fmt(nonW2Tax)}</span></div>`;
        }
        if (earlyPenalty > 0) {
            html += `<div class="inspector-row" data-ai-target="row-early-penalty" style="font-size: 0.8rem; padding-left: 12px; color: #ff7675;"><span class="inspector-label">↳ ⚠️ Includes 10% Early Withdrawal Penalty (Pre-59.5)</span><span class="inspector-value" style="color: #ff7675;">${this._fmt(earlyPenalty)}</span></div>`;
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

    _extractTaxAmounts(tax, snap) {
        const td = snap.taxDetails || {};
        const ficaTax = td.ficaTax || 0;
        const baseTotal = td.totalTax || snap.taxes || 0;
        return {
            ficaTax,
            ltcgTax: td.capitalGainsTax || 0,
            niitTax: td.niitTax || 0,
            fedIncomeTax: td.federalTax || 0,
            stateTax: td.stateTax || 0,
            earlyWithdrawalPenalty: td.earlyWithdrawalPenalty ?? snap.earlyWithdrawalPenalty ?? 0,
            irmaaExp: snap.expenseBreakdown?.irmaa || 0,
            magi: td.magi ?? tax.magi ?? 0,
            hsaDeduction: td.hsaDeduction ?? tax.hsaDeduction ?? 0,
            totalStatutoryTaxes: baseTotal + ficaTax
        };
    }

    _renderItemizedTaxRows(amounts) {
        const items = [
            {
                val: amounts.hsaDeduction,
                label: '↳ HSA Pre-Tax Payroll Deduction',
                rowColor: '#00cec9',
                valColor: '#00cec9',
                prefix: '-'
            },
            { val: amounts.fedIncomeTax, label: '↳ Federal Income Tax', rowColor: '', valColor: '', prefix: '' },
            {
                val: amounts.earlyWithdrawalPenalty,
                label: '↳ ⚠️ 10% Early Withdrawal Penalty (Pre-59.5 IRA/401k)',
                rowColor: '#ff7675',
                valColor: '#ff7675',
                prefix: ''
            },
            {
                val: amounts.ficaTax,
                label: '↳ FICA Payroll (OASDI + Medicare)',
                rowColor: '#fdcb6e',
                valColor: '',
                prefix: ''
            },
            {
                val: amounts.ltcgTax,
                label: '↳ Long-Term Capital Gains Tax',
                rowColor: '#74b9ff',
                valColor: '',
                prefix: ''
            },
            {
                val: amounts.niitTax,
                label: '↳ Net Investment Income Tax (3.8% NIIT)',
                rowColor: '#e17055',
                valColor: '',
                prefix: ''
            },
            { val: amounts.stateTax, label: '↳ State Income Tax', rowColor: '', valColor: '', prefix: '' },
            {
                val: amounts.irmaaExp,
                label: '↳ Medicare High-Income Surcharge (IRMAA)',
                rowColor: '#ff7675',
                valColor: '',
                prefix: ''
            }
        ];
        return items
            .filter((item) => item.val > 0)
            .map((item) => {
                const rowStyle = item.rowColor ? `font-size: 0.82rem; color: ${item.rowColor};` : 'font-size: 0.82rem;';
                const valStyle = item.valColor ? ` style="color: ${item.valColor};"` : '';
                return `<div class="inspector-row" style="${rowStyle}"><span class="inspector-label">${item.label}</span><span class="inspector-value"${valStyle}>${item.prefix}${this._fmt(item.val)}</span></div>`;
            })
            .join('');
    }

    _renderFinancialTaxes(tax, snap) {
        const amounts = this._extractTaxAmounts(tax, snap);
        const rothBadge = this._getRothStatusBadge(amounts.magi, tax.filingStatus);
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
                <div class="inspector-row" style="font-size: 0.85rem;" title="${magiTooltip}"><span class="inspector-label">Modified Adjusted Gross Income (MAGI — Tax & Healthcare Threshold) ℹ️</span><span class="inspector-value" style="font-weight: 600;">${this._fmt(amounts.magi)} ${rothBadge}</span></div>
                
                <div style="margin-top: 6px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1);">
                    ${this._renderItemizedTaxRows(amounts)}
                </div>
                <div class="inspector-row" style="font-size: 0.85rem; font-weight: bold; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 2px;">
                    <span class="inspector-label">Total Taxes & Payroll Levies</span><span class="inspector-value" style="color: var(--danger);">${this._fmt(amounts.totalStatutoryTaxes)}</span>
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
        out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 16px; color: #55efc4;"><span class="inspector-label">🟢 Original Deposits & Seasoned Conversions (Tax-Free Anytime)</span><span class="inspector-value">${this._fmt(rb.withdrawablePrincipal)} (${withdrawablePct}%)</span></div>`;
        if (rb.immaturePrincipal > 0) {
            const immPct = Math.round((rb.immaturePrincipal / balance) * 100);
            out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 16px; color: #fdcb6e;"><span class="inspector-label">🟡 Unseasoned Roth Conversions (5-Yr Rule Lock)</span><span class="inspector-value">${this._fmt(rb.immaturePrincipal)} (${immPct}%)</span></div>`;
        }
        if (rb.earnings > 0) {
            const earnPct = Math.round((rb.earnings / balance) * 100);
            out += `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 16px; color: #74b9ff;"><span class="inspector-label">🔒 Tax-Free Growth (Age 59.5+)</span><span class="inspector-value">${this._fmt(rb.earnings)} (${earnPct}%)</span></div>`;
        }
        return out;
    }

    _extractGrowthStats(data) {
        const d = data || {};
        const conversionsOut = d.conversionsOut || 0;
        const rolloverOut = d.rolloverOut || 0;
        const withdrawals = d.withdrawals || 0;
        return {
            interest: d.interest || 0,
            contributions: d.contributions || 0,
            conversionsIn: d.conversionsIn || 0,
            conversionsOut,
            rolloverIn: d.rolloverIn || 0,
            rolloverOut,
            netWithdrawals: Math.max(0, withdrawals - conversionsOut - rolloverOut)
        };
    }

    _hasGrowthActivity(stats, balance) {
        if (balance && balance !== 0) return true;
        return Object.values(stats).some((v) => v !== 0);
    }

    _renderGrowthMovementRows(stats) {
        const rows = [
            {
                val: stats.contributions,
                label: '↳ Contributions',
                rowColor: 'var(--success)',
                valColor: '',
                prefix: '+'
            },
            {
                val: stats.conversionsIn,
                label: '↳ Roth Conversion (In)',
                rowColor: '#a29bfe',
                valColor: '#a29bfe',
                prefix: '+'
            },
            {
                val: stats.conversionsOut,
                label: '↳ Roth Conversion (Out)',
                rowColor: '#fdcb6e',
                valColor: '#fdcb6e',
                prefix: '-'
            },
            { val: stats.rolloverIn, label: '↳ Rollover (In)', rowColor: '#74b9ff', valColor: '#74b9ff', prefix: '+' },
            {
                val: stats.rolloverOut,
                label: '↳ Rollover (Out)',
                rowColor: '#fab1a0',
                valColor: '#fab1a0',
                prefix: '-'
            },
            {
                val: stats.netWithdrawals,
                label: '↳ Withdrawals / SEPP',
                rowColor: 'var(--danger)',
                valColor: '',
                prefix: '-'
            }
        ];
        return rows
            .filter((r) => r.val > 0)
            .map((r) => {
                const valStyle = r.valColor ? ` style="color: ${r.valColor};"` : '';
                return `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: ${r.rowColor};"><span class="inspector-label">${r.label}</span><span class="inspector-value"${valStyle}>${r.prefix}${this._fmt(r.val)}</span></div>`;
            })
            .join('');
    }

    _renderGrowth(name, data, balance, badgeHtml = '') {
        if (!data && (!balance || balance === 0)) return '';
        const stats = this._extractGrowthStats(data);
        if (!this._hasGrowthActivity(stats, balance)) return '';

        const earningBase = balance - stats.interest;
        const pctGrowth = earningBase > 0 ? (stats.interest / earningBase) * 100 : 0;

        let out = `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-main); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; flex-wrap: wrap;"><span>${escapeHtml(name)}</span>${badgeHtml}</div>`;
        out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px;"><span class="inspector-label">↳ Balance</span><span class="inspector-value" style="font-weight: bold;">${this._fmt(balance)}</span></div>`;
        out += this._renderGrowthMovementRows(stats);

        if (stats.interest !== 0) {
            const color = stats.interest > 0 ? 'var(--success)' : 'var(--danger)';
            const sign = stats.interest > 0 ? '+' : '';
            out += `<div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px; color: ${color};"><span class="inspector-label">↳ Interest/Apprec.</span><span class="inspector-value">${sign}${this._fmt(stats.interest)} (${pctGrowth.toFixed(1)}%)</span></div>`;
        }
        out += this._renderRothPrincipalBreakdown(data?.rothPrincipalBreakdown, balance);
        out += `</div>`;
        return out;
    }

    _is72tActiveForSlot(snap, slot) {
        return Boolean(snap.rule72tMeta?.[slot]?.active || (snap.income?.[slot]?.rule72t || 0) > 0);
    }

    _resolve72tSlotForAccountKey(snap, key) {
        if (key === 's1SeppIra') return 's1';
        if (key === 's2SeppIra') return 's2';
        const hasS1Sepp = (snap.balances?.s1SeppIra || 0) > 0 || (snap.growth?.s1SeppIra?.withdrawals || 0) > 0;
        const hasS2Sepp = (snap.balances?.s2SeppIra || 0) > 0 || (snap.growth?.s2SeppIra?.withdrawals || 0) > 0;
        if (key === 's1StandardIra' && !hasS1Sepp) return 's1';
        if (key === 's2StandardIra' && !hasS2Sepp) return 's2';
        return null;
    }

    _get72tAccountBadgeHtml(snap, key) {
        const slot = this._resolve72tSlotForAccountKey(snap, key);
        if (!slot || !this._is72tActiveForSlot(snap, slot)) return '';
        return `<span class="sepp-active-badge" style="margin-left: 6px; padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 600; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35);">🔒 72(t) SEPP Active</span>`;
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

    _shouldRenderCdGrowth(balances, growth, key) {
        return (balances[key] || 0) > 0 || (growth[key]?.interest || 0) > 0 || (growth[key]?.rolloverOut || 0) > 0;
    }

    _renderPrimaryResidenceBlock(balances) {
        const netEq = balances.primaryResidenceEquity || 0;
        const homeVal = balances.homeValue || 0;
        if (netEq <= 0 && homeVal <= 0) return '';
        const mortBal = balances.mortgageBalance || 0;
        return `<div style="margin-bottom: 12px;">
                    <div style="color: var(--text-main); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">Primary Residence</div>
                    <div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px;"><span class="inspector-label">↳ Net Home Equity</span><span class="inspector-value" style="font-weight: bold; color: #fdcb6e;">${this._fmt(netEq)}</span></div>
                    <div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.8;"><span class="inspector-label">↳ Property Value</span><span class="inspector-value">${this._fmt(homeVal)}</span></div>
                    ${mortBal > 0 ? `<div class="inspector-row" style="font-size: 0.8rem; padding-left: 12px; opacity: 0.8;"><span class="inspector-label">↳ Mortgage Debt</span><span class="inspector-value" style="color: #e17055;">-${this._fmt(mortBal)}</span></div>` : ''}
                 </div>`;
    }

    _renderSpecialPortfolioBlocks(snap) {
        let html = '';
        if ((snap.balances.college529 || 0) > 0 || (snap.growth.college529?.interest || 0) > 0) {
            html += this._renderGrowth(`529 College Savings`, snap.growth.college529, snap.balances.college529 || 0);
            html += this._renderCollege529Children(snap.college529?.children);
        }
        if (snap.balances.cashCushion > 0) {
            html += `<div style="margin-bottom: 12px;">
                        <div style="color: var(--text-main); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">Cash Cushion</div>
                        <div class="inspector-row" style="font-size: 0.85rem; padding-left: 12px;"><span class="inspector-label">↳ Balance</span><span class="inspector-value" style="font-weight: bold;">${this._fmt(snap.balances.cashCushion)}</span></div>
                     </div>`;
        }
        html += this._renderPrimaryResidenceBlock(snap.balances);
        return html;
    }

    _buildPortfolioColumn(snap, s1Name, s2Name) {
        let html = `<div class="timeline-container" style="background: rgba(255,255,255,0.02); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">`;
        html += `<h3 style="color: var(--secondary); text-align: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 0.5rem; margin-top: 0;">Portfolio Details</h3>`;

        if (snap.growth && snap.balances) {
            const s1SeppLabel = snap.rule72tMeta?.s1?.accountName || `${s1Name} 72(t) IRA`;
            const s2SeppLabel = snap.rule72tMeta?.s2?.accountName || `${s2Name} 72(t) IRA`;
            const accountPairs = [
                [`${s1Name} 401k`, 's1Trad401k'],
                [`${s1Name} 403b`, 's1Trad403b'],
                [`${s2Name} 401k`, 's2Trad401k'],
                [`${s2Name} 403b`, 's2Trad403b'],
                [`${s1Name} Std IRA`, 's1StandardIra'],
                [`${s2Name} Std IRA`, 's2StandardIra'],
                [s1SeppLabel, 's1SeppIra'],
                [s2SeppLabel, 's2SeppIra'],
                [`${s1Name} Roth IRA`, 's1RothIra'],
                [`${s2Name} Roth IRA`, 's2RothIra'],
                [`${s1Name} Brokerage & Sweep`, 's1Brokerage'],
                [`${s2Name} Brokerage`, 's2Brokerage'],
                [`${s1Name} High-Yield Savings (HYSA)`, 's1Hysa'],
                [`${s2Name} High-Yield Savings (HYSA)`, 's2Hysa']
            ];
            accountPairs.forEach(([label, key]) => {
                const badge = this._get72tAccountBadgeHtml(snap, key);
                html += this._renderGrowth(label, snap.growth[key], snap.balances[key] || 0, badge);
            });
            if (this._shouldRenderCdGrowth(snap.balances, snap.growth, 's1Cd')) {
                html += this._renderGrowth(
                    `${s1Name} Certificates of Deposit (CD)`,
                    snap.growth.s1Cd,
                    snap.balances.s1Cd || 0
                );
            }
            if (this._shouldRenderCdGrowth(snap.balances, snap.growth, 's2Cd')) {
                html += this._renderGrowth(
                    `${s2Name} Certificates of Deposit (CD)`,
                    snap.growth.s2Cd,
                    snap.balances.s2Cd || 0
                );
            }
            html += this._renderSpecialPortfolioBlocks(snap);
        }
        html += '</div>';
        return html;
    }

    _classifyMonthEvent(evt, buckets) {
        if (evt.type === 'income_bonus' || evt.type === 'income_lti') {
            buckets.w2Milestones.push({
                type: evt.type,
                name: evt.name || (evt.type === 'income_bonus' ? 'Bonus' : 'LTI'),
                amount: Number(evt.amount) || 0
            });
            return;
        }
        if ((evt.type === 'cash_inflow' || evt.type === 'windfall') && typeof evt.amount === 'number') {
            buckets.externalCash += evt.amount;
        }
        const label = evt.label || evt.name;
        if (label) buckets.otherLabels.push(label);
    }

    _getEventsForMonth(events, month) {
        const buckets = { externalCash: 0, w2Milestones: [], otherLabels: [] };
        if (!Array.isArray(events)) return buckets;

        events.forEach((evt) => {
            if (evt && evt.month === month) {
                this._classifyMonthEvent(evt, buckets);
            }
        });
        return buckets;
    }

    _formatMonthEventCell(externalCash, w2Milestones, otherLabels, bonusMilestone) {
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

        if (externalCash > 0 && totalMilestoneGross > 0) {
            const takeHomeBadge =
                totalMilestoneNet !== null ? `(+${this._fmt(totalMilestoneNet)} Take-Home)` : `(in Take-Home)`;
            return `
                <div style="color: var(--success); font-weight: bold;">+${this._fmt(externalCash)}</div>
                <div style="font-size: 0.72rem; color: var(--accent); margin-top: 2px;" title="${milestoneDetails}">+${this._fmt(totalMilestoneGross)} Gross ${takeHomeBadge}</div>
            `;
        }
        if (externalCash > 0) {
            return `<span style="color: var(--success); font-weight: bold;">+${this._fmt(externalCash)}</span>`;
        }
        if (totalMilestoneGross > 0) {
            const takeHomeBadge =
                totalMilestoneNet !== null
                    ? `<span style="display: block; font-size: 0.72rem; color: var(--accent); font-weight: normal;">(+${this._fmt(totalMilestoneNet)} Take-Home)</span>`
                    : `<span style="display: block; font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">(in Take-Home)</span>`;
            return `
                <div style="color: var(--success); font-weight: bold; line-height: 1.2;" title="${milestoneDetails}">
                    +${this._fmt(totalMilestoneGross)} Gross
                    ${takeHomeBadge}
                </div>
            `;
        }
        if (otherLabels.length > 0) {
            return `<span style="font-size: 0.75rem; color: var(--accent);">${otherLabels[0]}</span>`;
        }
        return '-';
    }

    _resolveFallbackMonthMetrics(snapshot, externalCash) {
        const inc = snapshot.income || {};
        const takeHome = (inc.takeHome || inc.w2 || 0) / 12;
        const ssn1 = inc.s1?.ssn || 0;
        const ssn2 = inc.s2?.ssn || 0;
        const totalMonthlyIncome = takeHome + (ssn1 + ssn2) / 12;
        const expenses = (snapshot.expenses || 0) / 12;
        return {
            totalMonthlyIncome,
            convAmount: 0,
            expenses,
            netFlow: totalMonthlyIncome + externalCash - expenses
        };
    }

    _resolveMonthRowMetrics(snapshot, mSnap, externalCash) {
        if (!mSnap) {
            return this._resolveFallbackMonthMetrics(snapshot, externalCash);
        }
        const takeHome = mSnap.takeHome !== undefined ? mSnap.takeHome : mSnap.w2Net;
        const otherIncome = (mSnap.ssn || 0) + (mSnap.rule72t || 0);
        return {
            totalMonthlyIncome: takeHome + otherIncome,
            convAmount: mSnap.rothConverted || 0,
            expenses: mSnap.expenses,
            netFlow: mSnap.netFlow
        };
    }

    _renderMonthBreakdownRow(snapshot, mSnap, monthName, monthNum) {
        const { externalCash, w2Milestones, otherLabels } = this._getEventsForMonth(snapshot.events, monthNum);
        const { totalMonthlyIncome, convAmount, expenses, netFlow } = this._resolveMonthRowMetrics(
            snapshot,
            mSnap,
            externalCash
        );
        const flowColor = netFlow >= 0 ? 'var(--success)' : 'var(--danger)';

        let transferText = '-';
        if (convAmount > 0) {
            transferText = `<span style="color: #a29bfe; font-weight: bold;">+${this._fmt(convAmount)} Roth</span>`;
        } else if (otherLabels.some((l) => l.toLowerCase().includes('rollover'))) {
            transferText = `<span style="color: #74b9ff; font-size: 0.8rem;">Rollover</span>`;
        }

        const eventCellHtml = this._formatMonthEventCell(
            externalCash,
            w2Milestones,
            otherLabels,
            mSnap?.bonusMilestone
        );

        return `<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="text-align: left; padding: 8px; font-weight: bold;">${monthName}</td>
                    <td style="padding: 8px;">${this._fmt(totalMonthlyIncome)}</td>
                    <td style="padding: 8px;">${eventCellHtml}</td>
                    <td style="padding: 8px;">${transferText}</td>
                    <td style="padding: 8px; color: var(--danger);">${this._fmt(expenses)}</td>
                    <td style="padding: 8px; color: ${flowColor}; font-weight: bold;">${this._fmt(netFlow)}</td>
                 </tr>`;
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
            html += this._renderMonthBreakdownRow(snapshot, mSnap, monthNames[m], m + 1);
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
