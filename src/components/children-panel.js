import { BaseComponent } from './base-component.js';

export class ChildrenPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    _calculateTargetFundingSummary(child) {
        const currentYear = new Date().getFullYear();
        const birthYear = Number(child.yearOfBirth) || currentYear;
        const childAge = Math.max(0, currentYear - birthYear);
        const collegeAge = 18;
        const yearsRemaining = Math.max(1, collegeAge - childAge);
        const curBal = Number(child.currentCollegeSavingsBalance) || 0;
        const target = Number(child.targetCollegeSavingsBalance) || 0;
        const defaultReturn = 7;
        const returnRateNum = child.expectedReturn !== undefined && child.expectedReturn !== null
            ? Number(child.expectedReturn)
            : defaultReturn;
        const r = returnRateNum / 100;

        if (childAge >= collegeAge) {
            return `🎓 <strong>College Age (${collegeAge}+) Reached:</strong> Contributions have concluded; 529 tuition draws are active.`;
        }

        if (target <= 0) {
            return `🎯 <strong>Target Calculator:</strong> Enter your goal balance by age 18 above to automatically calculate your required annual savings.`;
        }

        const projectedExisting = curBal * Math.pow(1 + r, yearsRemaining);
        if (projectedExisting >= target) {
            return `🟢 <strong>Fully Funded by Growth!</strong> Current balance ($${curBal.toLocaleString()}) is projected to grow to <strong>$${Math.round(projectedExisting).toLocaleString()}</strong> by age 18 at ${returnRateNum}% return. No additional contributions required!`;
        }

        const gap = target - projectedExisting;
        const pmt = r > 0 ? (gap * r) / (Math.pow(1 + r, yearsRemaining) - 1) : (gap / yearsRemaining);
        const annualRequired = Math.round(pmt);
        const monthlyRequired = Math.round(pmt / 12);

        return `📊 <strong>Required Annual Savings:</strong> Save <strong>$${annualRequired.toLocaleString()} / year</strong> (~$${monthlyRequired.toLocaleString()}/mo) for the next <strong>${yearsRemaining} years</strong> until age 18 to hit your $${target.toLocaleString()} goal.`;
    }

    _renderStrategyFields(child, index) {
        const mode = child.contributionMode || 'fixed';
        let html = '';

        if (mode === 'target') {
            html += `<div style="flex: 1; min-width: 160px;">${this._input('Target Goal by 18 ($)', `dependents.${index}.targetCollegeSavingsBalance`, 'number', child.targetCollegeSavingsBalance || 0, 'Target balance you want available in the 529 plan when this child turns 18.')}</div>`;
            html += `</div>`;
            const badgeHtml = this._calculateTargetFundingSummary(child);
            html += `<div class="target-529-summary" data-child-index="${index}" style="margin-top: 0.15rem; margin-bottom: 0.25rem; padding: 0.4rem 0.65rem; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 4px; font-size: 0.78rem; line-height: 1.35;">${badgeHtml}</div>`;
        } else {
            html += `<div style="flex: 1; min-width: 140px;">${this._input('Annual Contribution ($)', `dependents.${index}.annualContribution`, 'number', child.annualContribution || 0, 'Annual contribution from household cash flow into this child\'s 529 college fund.')}</div>`;
            html += `<div style="width: 100px; flex-shrink: 0;">${this._input('Start Year', `dependents.${index}.contributionStartYear`, 'number', child.contributionStartYear || '', 'Calendar year to start annual contributions. Defaults to current year.')}</div>`;
            const defaultStopYear = (Number(child.yearOfBirth) || new Date().getFullYear()) + 17;
            html += `<div style="width: 100px; flex-shrink: 0;">${this._input('Stop Year', `dependents.${index}.contributionStopYear`, 'number', child.contributionStopYear || '', `Calendar year to stop contributions. Defaults to year child turns 18 (${defaultStopYear}).`)}</div>`;
            html += `<div style="flex: 1; min-width: 140px;">${this._input('Target Cap (Optional, $)', `dependents.${index}.targetCollegeSavingsBalance`, 'number', child.targetCollegeSavingsBalance || 0, 'Optional maximum balance cap. Contributions cease once the 529 reaches this amount.')}</div>`;
            html += `</div>`;
        }

        return html;
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = '';
        
        // Dependents
        html += this._startSection('Children & 529s');
        (this.state.dependents || []).forEach((child, index) => {
            const childName = child.name || `Child ${index + 1}`;
            const birthYear = child.yearOfBirth || 'N/A';
            const collegeBal = Number(child.currentCollegeSavingsBalance || 0);
            const isOpenByDefault = child.isOpen !== false && (child.isOpen || index === 0 || childName.startsWith('New') || childName.startsWith('Child'));

            const mode = child.contributionMode || 'fixed';
            const modeOptions = [
                { value: 'fixed', label: 'Fixed Annual Contribution ($/year)' },
                { value: 'target', label: 'Target Balance Goal by Age 18 ($)' }
            ];

            html += `
            <details class="child-card" data-index="${index}" ${isOpenByDefault ? 'open' : ''}>
                <summary style="font-weight: bold; outline: none; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <span>${childName} - Born ${birthYear} (529: $${collegeBal.toLocaleString()})</span>
                    <button type="button" class="btn btn-secondary remove-child-btn" data-index="${index}" style="padding: 0.1rem 0.4rem; font-size: 0.7rem; background: #e74c3c; color: white; border: none; margin-left: 10px;" title="Remove ${childName}">✕ Remove</button>
                </summary>
                <div style="margin-top: 0.5rem;">`;

            // Row 1: Profile & 529 Baseline
            html += `<div class="child-form-row">`;
            html += `<div style="flex: 1.2; min-width: 140px;">${this._input('Name', `dependents.${index}.name`, 'text', child.name || `Child ${index + 1}`, 'Child name.')}</div>`;
            html += `<div style="width: 100px; flex-shrink: 0;">${this._input('Birth Year', `dependents.${index}.yearOfBirth`, 'number', child.yearOfBirth, 'Birth year used to model college attendance from age 18 to 22.')}</div>`;
            html += `<div style="flex: 1; min-width: 140px;">${this._input('College Cost ($)', `dependents.${index}.annualCollegeCost`, 'number', child.annualCollegeCost, 'Projected annual college tuition, room, and board expenses.')}</div>`;
            html += `<div style="flex: 1; min-width: 140px;">${this._input('529 Balance ($)', `dependents.${index}.currentCollegeSavingsBalance`, 'number', child.currentCollegeSavingsBalance, 'Dedicated 529 investment balance.')}</div>`;
            html += `<div style="width: 105px; flex-shrink: 0;">${this._input('Return (%)', `dependents.${index}.expectedReturn`, 'number', child.expectedReturn !== undefined ? child.expectedReturn : 7, 'Annual compound investment return rate on 529 college funds.')}</div>`;
            html += `</div>`;
            
            // Row 2: 529 Strategy
            html += `<div class="child-form-row">`;
            html += `<div style="flex: 1.2; min-width: 220px;">${this._select('529 Strategy', `dependents.${index}.contributionMode`, modeOptions, mode, 'Choose between saving a fixed dollar amount each year, or specifying a target balance for when your child turns 18 so the calculator automatically solves for required annual savings.')}</div>`;
            html += this._renderStrategyFields(child, index);

            html += `</div></details>`;
        });
        html += `<button id="btn-add-child" type="button" class="btn btn-secondary btn-small" style="width: 100%; margin-top: 0.75rem;">+ Add Child</button>`;
        html += this._endSection();

        return html;
    }

    _bindCardLiveUpdates() {
        this.querySelectorAll('.child-card').forEach(card => {
            const index = parseInt(card.getAttribute('data-index'), 10);
            const targetSummaryEl = card.querySelector('.target-529-summary');
            if (!targetSummaryEl) return;

            const updateSummary = () => {
                const birthYearEl = card.querySelector(`input[data-path="dependents.${index}.yearOfBirth"]`);
                const balEl = card.querySelector(`input[data-path="dependents.${index}.currentCollegeSavingsBalance"]`);
                const returnEl = card.querySelector(`input[data-path="dependents.${index}.expectedReturn"]`);
                const targetEl = card.querySelector(`input[data-path="dependents.${index}.targetCollegeSavingsBalance"]`);

                const tempChild = {
                    yearOfBirth: birthYearEl ? Number(birthYearEl.value) : this.state.dependents[index]?.yearOfBirth,
                    currentCollegeSavingsBalance: balEl ? Number(balEl.value) : this.state.dependents[index]?.currentCollegeSavingsBalance,
                    expectedReturn: returnEl ? Number(returnEl.value) : this.state.dependents[index]?.expectedReturn,
                    targetCollegeSavingsBalance: targetEl ? Number(targetEl.value) : this.state.dependents[index]?.targetCollegeSavingsBalance
                };
                targetSummaryEl.innerHTML = this._calculateTargetFundingSummary(tempChild);
            };

            card.querySelectorAll('input').forEach(input => {
                input.addEventListener('input', updateSummary);
            });
        });
    }

    afterRender() {
        this.addEvent('input, select', 'change', (e) => {
            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });

        this.querySelectorAll('details.child-card').forEach(details => {
            details.addEventListener('toggle', () => {
                const idx = parseInt(details.getAttribute('data-index'), 10);
                if (this.state.dependents && this.state.dependents[idx]) {
                    this.state.dependents[idx].isOpen = details.open;
                }
            });
        });

        this._bindCardLiveUpdates();

        this.addEvent('#btn-add-child', 'click', (e) => {
            e.preventDefault();
            this.dispatchEvent(new CustomEvent('addChild', { bubbles: true }));
        });

        this.querySelectorAll('.remove-child-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const index = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                this.dispatchEvent(new CustomEvent('removeChild', {
                    detail: { index },
                    bubbles: true
                }));
            });
        });
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('children-panel')) {
    customElements.define('children-panel', ChildrenPanel);
}
