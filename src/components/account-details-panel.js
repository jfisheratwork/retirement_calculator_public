import { BaseComponent } from './base-component.js';
import { getState } from '../services/state.js';
import { escapeHtml } from '../utils/sanitize.js';
import './account-panel.js';

/**
 * Account Details Panel Component
 * Displays a 2-column layout (Myself & Spouse) for managing accounts
 * and embedded 401(k) rollovers.
 */
export class AccountDetailsPanel extends BaseComponent {
    onInit() {
        this.state = this.getEffectiveState();
    }

    getTemplate() {
        this.state = this.getEffectiveState();
        return `
            <div class="two-col-layout" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; max-width: 1400px;">
                <div>
                    ${this._renderSpouseAccountColumn('primarySpouse')}
                </div>
                <div>
                    ${this._renderSpouseAccountColumn('secondarySpouse')}
                </div>
            </div>
        `;
    }

    _renderSpouseAccountColumn(prefix) {
        const spouseObj = this.state[prefix];
        if (!spouseObj) return '';

        let out = this._startSection(`${escapeHtml(spouseObj.name || 'Spouse')} Accounts`, true);
        
        // Header with Account Type Selector + Add Button
        out += `<div class="pane-section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <span>Accounts</span>
            <div style="display: flex; gap: 0.5rem;">
                <select class="account-type-select" id="${prefix}-new-account-type" style="padding: 0.2rem; font-size: 0.8rem; background: var(--bg-dark); color: var(--text-light); border: 1px solid var(--border-color); border-radius: 4px;">
                    <option value="traditional401k">Traditional 401k</option>
                    <option value="trad403b">Traditional 403b</option>
                    <option value="standardIra">Standard IRA</option>
                    <option value="rothIra">Roth IRA</option>
                    <option value="taxableBrokerage">Taxable Brokerage</option>
                    <option value="hysa">High-Yield Savings (HYSA)</option>
                    <option value="cd">Certificate of Deposit (CD)</option>
                </select>
                <button type="button" class="btn btn-secondary add-account-btn" data-prefix="${prefix}" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;">+ Add Account</button>
            </div>
        </div>`;

        // List of Accounts
        const accounts = spouseObj.accounts || [];
        accounts.forEach((acc, index) => {
            out += `<account-panel prefix="${prefix}" index="${index}"></account-panel>`;
        });

        out += this._endSection();
        return out;
    }

    afterRender() {
        this.addEvent('input, select', 'change', (e) => {
            this.dispatchEvent(new CustomEvent('stateChange', {
                detail: { element: e.target },
                bubbles: true
            }));
        });

        this.querySelectorAll('.add-account-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const prefix = btn.getAttribute('data-prefix');
                const selectEl = this.querySelector(`#${prefix}-new-account-type`);
                const type = selectEl ? selectEl.value : 'traditional401k';
                this.dispatchEvent(new CustomEvent('addAccount', {
                    detail: { prefix, type },
                    bubbles: true
                }));
            });
        });
    }
}
if (typeof customElements !== 'undefined' && !customElements.get('account-details-panel')) {
    customElements.define('account-details-panel', AccountDetailsPanel);
}
