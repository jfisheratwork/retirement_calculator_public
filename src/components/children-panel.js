import { BaseComponent } from './base-component.js';
import { getState } from '../services/state.js';

export class ChildrenPanel extends BaseComponent {
    constructor() {
        super();
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        let html = '';
        
        // Dependents
        html += this._startSection('Children & 529s');
        this.state.dependents.forEach((child, index) => {
            const childName = child.name || `Child ${index + 1}`;
            const birthYear = child.yearOfBirth || 'N/A';
            const collegeBal = Number(child.currentCollegeSavingsBalance || 0);
            const isOpenByDefault = child.isOpen !== false && (child.isOpen || index === 0 || childName.startsWith('New') || childName.startsWith('Child'));

            html += `
            <details class="child-card" data-index="${index}" ${isOpenByDefault ? 'open' : ''} style="padding: 0.5rem; background: var(--bg-darker); margin-bottom: 0.75rem; border-left: 3px solid #10b981; border-radius: 4px; cursor: pointer;">
                <summary style="font-weight: bold; outline: none; display: flex; justify-content: space-between; align-items: center;">
                    <span>${childName} - Born ${birthYear} (529: $${collegeBal.toLocaleString()})</span>
                    <button type="button" class="btn btn-secondary remove-child-btn" data-index="${index}" style="padding: 0.1rem 0.4rem; font-size: 0.7rem; background: #e74c3c; color: white; border: none; margin-left: 10px;" title="Remove ${childName}">✕ Remove</button>
                </summary>
                <div style="margin-top: 1rem;">`;
            html += this._input('Name', `dependents.${index}.name`, 'text', child.name || `Child ${index + 1}`, 'Child name.');
            html += this._input('Birth Year', `dependents.${index}.yearOfBirth`, 'number', child.yearOfBirth, 'Birth year used to model college attendance from age 18 to 22.');
            html += this._input('Annual College Cost ($)', `dependents.${index}.annualCollegeCost`, 'number', child.annualCollegeCost, 'Projected annual college tuition, room, and board expenses.');
            html += this._input('529 Savings Balance ($)', `dependents.${index}.currentCollegeSavingsBalance`, 'number', child.currentCollegeSavingsBalance, 'Dedicated 529 investment balance that grows tax-free for qualified education and is depleted before cash flow covers tuition.');
            html += this._input('529 Expected Return (%)', `dependents.${index}.expectedReturn`, 'number', child.expectedReturn !== undefined ? child.expectedReturn : 7, 'Annual compound investment return rate on 529 college funds.');
            html += `</div></details>`;
        });
        html += `<button id="btn-add-child" type="button" class="btn btn-secondary btn-small" style="width: 100%; margin-top: 1rem;">+ Add Child</button>`;
        html += this._endSection();

        return html;
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
