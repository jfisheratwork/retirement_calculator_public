/**
 * MicroExpandDrawer Component
 *
 * Reusable inline popover/drawer for Mockup 9 (Bidirectional Sync Bridge).
 * Displays computed aggregate badges (e.g. [⚙️ 3 Custom Jobs Linked]).
 * Clicking opens an inline list of child entities with individual values.
 * Allows inline adds and updates, and features a safe consolidation confirmation flow.
 *
 * Emits:
 * - 'update-child': when a child item is added, updated, or removed.
 * - 'consolidate-field': when multiple child items are consolidated into a single summary value.
 *
 * Written with the assistance of Google Gemini
 */

// MDN Documentation for HTMLElement: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement
// MDN Documentation for CustomEvent: https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
// MDN Documentation for Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
// MDN Documentation for <button>: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button

import { BaseComponent } from './base-component.js';
import { escapeHtml } from '../utils/sanitize.js';

// --- Constants & Config ---
const ZERO = 0;
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_ENTITY_NAME = 'items';
const DEFAULT_FIELD_NAME = 'summaryField';

const ACTION_ADD = 'add';
const ACTION_UPDATE = 'update';
const ACTION_REMOVE = 'remove';

/**
 * Format currency with no decimal places.
 * MDN Documentation for Intl.NumberFormat: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 */
const currencyFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: DEFAULT_CURRENCY,
    maximumFractionDigits: ZERO
});

function formatUsd(amount) {
    return currencyFormatter.format(Number(amount) || ZERO);
}

export class MicroExpandDrawer extends BaseComponent {
    constructor() {
        super();
        this._isOpen = false;
        this._isConsolidatePromptOpen = false;
        this._field = DEFAULT_FIELD_NAME;
        this._entityName = DEFAULT_ENTITY_NAME;
        this._badgeText = '';
        this._title = '';
        this._items = [];
        this._pendingConsolidateValue = ZERO;

        this._onDocumentClick = (e) => {
            if (this._isOpen && !this.contains(e.target)) {
                this.close();
            }
        };
    }

    connectedCallback() {
        super.connectedCallback();
        if (typeof document !== 'undefined') {
            document.addEventListener('click', this._onDocumentClick);
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (typeof document !== 'undefined') {
            document.removeEventListener('click', this._onDocumentClick);
        }
    }

    // --- Public API ---

    get items() {
        return [...this._items];
    }

    set items(newItems) {
        this._items = Array.isArray(newItems) ? [...newItems] : [];
        this.render();
        this.afterRender();
    }

    setConfiguration(config = {}) {
        if (config.field) this._field = config.field;
        if (config.entityName) this._entityName = config.entityName;
        if (config.badgeText !== undefined) this._badgeText = config.badgeText;
        if (config.title) this._title = config.title;
        if (Array.isArray(config.items)) this._items = [...config.items];
        this.render();
        this.afterRender();
    }

    open() {
        this._isOpen = true;
        this._isConsolidatePromptOpen = false;
        this.render();
        this.afterRender();
    }

    close() {
        this._isOpen = false;
        this._isConsolidatePromptOpen = false;
        this.render();
        this.afterRender();
    }

    toggle() {
        if (this._isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    promptConsolidation(proposedValue) {
        this._pendingConsolidateValue = Number(proposedValue) || this._calculateSum();
        this._isConsolidatePromptOpen = true;
        this._isOpen = true;
        this.render();
        this.afterRender();
    }

    // --- Internal Helpers ---

    _calculateSum() {
        return this._items.reduce((acc, it) => acc + (Number(it.value) || ZERO), ZERO);
    }

    _getEffectiveBadgeText() {
        if (this._badgeText) return this._badgeText;
        const count = this._items.length;
        return `⚙️ ${count} Linked ${this._entityName}`;
    }

    _getEffectiveTitle() {
        if (this._title) return this._title;
        return `Linked ${this._entityName}`;
    }

    // --- Rendering ---

    getTemplate() {
        const badgeLabel = this._getEffectiveBadgeText();
        const count = this._items.length;

        return `
            <div class="micro-expand-drawer-host" style="position: relative; display: inline-block;">
                <button type="button" class="btn-micro-badge badge-subtle badge-subtle-blue" style="cursor: pointer; font-size: 0.78rem; padding: 0.2rem 0.65rem; border-radius: 999px; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.35rem;" title="Click to view and edit granular ${escapeHtml(this._entityName)}">
                    <span>${escapeHtml(badgeLabel)}</span>
                    <span style="font-size: 0.65rem; opacity: 0.8;">${this._isOpen ? '▲' : '▼'}</span>
                </button>

                ${this._isOpen ? this._renderDrawerCard(count) : ''}
            </div>
        `;
    }

    _renderDrawerCard(count) {
        return `
            <div class="micro-drawer-popover glass-panel" style="position: absolute; top: calc(100% + 8px); left: 0; z-index: 1000; width: 340px; max-width: 90vw; background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55); backdrop-filter: blur(12px);">
                ${this._isConsolidatePromptOpen ? this._renderConsolidationPrompt() : this._renderDrawerContent(count)}
            </div>
        `;
    }

    _renderDrawerContent(count) {
        const sum = this._calculateSum();
        return `
            <div class="drawer-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.85rem;">
                <div>
                    <h5 style="margin: 0; font-size: 0.95rem; color: #93c5fd; font-weight: 600;">
                        ${escapeHtml(this._getEffectiveTitle())}
                    </h5>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">
                        Total: <strong style="color: #34d399;">${formatUsd(sum)}</strong> (${count} items)
                    </div>
                </div>
                <button type="button" class="btn-close-micro" style="background: transparent; border: none; font-size: 1.2rem; color: var(--text-muted); cursor: pointer; padding: 0 0.25rem;">&times;</button>
            </div>

            <div class="drawer-items-list" style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 220px; overflow-y: auto; margin-bottom: 0.85rem; padding-right: 0.25rem;">
                ${this._renderItemsList()}
            </div>

            ${this._renderAddItemForm()}

            <div class="drawer-footer-actions" style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <button type="button" class="btn-trigger-consolidate" style="background: none; border: none; font-size: 0.75rem; color: #fbbf24; cursor: pointer; text-decoration: underline; padding: 0;">
                    ⚡ Consolidate into single summary
                </button>
                <button type="button" class="btn-done-micro btn btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.75rem; border-radius: 999px;">
                    Done
                </button>
            </div>
        `;
    }

    _renderItemsList() {
        if (this._items.length === ZERO) {
            return `
                <div style="font-size: 0.8rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">
                    No child items linked yet.
                </div>
            `;
        }

        return this._items
            .map(
                (item, idx) => `
            <div class="child-item-row" data-item-id="${escapeHtml(String(item.id || idx))}" style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(255, 255, 255, 0.03); padding: 0.4rem 0.6rem; border-radius: 0.4rem; border: 1px solid rgba(255, 255, 255, 0.06);">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.82rem; font-weight: 500; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHtml(item.name || `Item ${idx + 1}`)}
                    </div>
                    ${item.subtitle ? `<div style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(item.subtitle)}</div>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">$</span>
                    <input type="number" class="input-item-val" data-item-id="${escapeHtml(String(item.id || idx))}" value="${item.value || ZERO}" style="width: 85px; font-size: 0.8rem; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--border); border-radius: 4px; padding: 0.2rem 0.4rem; color: #fff; text-align: right;" />
                    <button type="button" class="btn-remove-item" data-item-id="${escapeHtml(String(item.id || idx))}" title="Remove item" style="background: none; border: none; color: #fca5a5; font-size: 0.85rem; cursor: pointer; padding: 0 0.2rem;">&times;</button>
                </div>
            </div>
        `
            )
            .join('');
    }

    _renderAddItemForm() {
        return `
            <div class="add-item-box" style="background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 0.4rem; padding: 0.5rem;">
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem;">+ Add New ${escapeHtml(this._entityName)}</div>
                <div style="display: flex; gap: 0.4rem;">
                    <input type="text" id="input-new-item-name" placeholder="Title/Name" style="flex: 1; font-size: 0.78rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 0.25rem 0.4rem; color: #fff;" />
                    <input type="number" id="input-new-item-val" placeholder="$ Amount" style="width: 80px; font-size: 0.78rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 4px; padding: 0.25rem 0.4rem; color: #fff; text-align: right;" />
                    <button type="button" id="btn-add-child-item" class="btn btn-secondary" style="font-size: 0.75rem; padding: 0.25rem 0.6rem; border-radius: 4px;">Add</button>
                </div>
            </div>
        `;
    }

    _renderConsolidationPrompt() {
        const count = this._items.length;
        const valFormatted = formatUsd(this._pendingConsolidateValue);

        return `
            <div class="consolidation-alert" style="display: flex; flex-direction: column; gap: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.4rem; color: #fbbf24;">
                    <span style="font-size: 1.1rem;">⚠️</span>
                    <strong style="font-size: 0.88rem;">Consolidate ${count} ${escapeHtml(this._entityName)}?</strong>
                </div>
                <p style="margin: 0; font-size: 0.8rem; color: var(--text-main); line-height: 1.45;">
                    This will consolidate your <strong>${count} individual ${escapeHtml(this._entityName)}</strong> into a single summary amount of <strong>${valFormatted}</strong>.
                </p>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
                    <button type="button" id="btn-confirm-consolidate" class="btn btn-primary" style="font-size: 0.8rem; padding: 0.4rem; background: #3b82f6; text-align: center;">
                        Proceed with Consolidation
                    </button>
                    <button type="button" id="btn-cancel-consolidate" class="btn btn-secondary" style="font-size: 0.8rem; padding: 0.4rem; text-align: center;">
                        Cancel &amp; Edit Individually
                    </button>
                </div>
            </div>
        `;
    }

    afterRender() {
        const badgeBtn = this.querySelector('.btn-micro-badge');
        if (badgeBtn) {
            badgeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }

        if (!this._isOpen) return;

        if (this._isConsolidatePromptOpen) {
            this._bindConsolidationEvents();
            return;
        }

        this._bindDrawerEvents();
    }

    _bindDrawerEvents() {
        const btnClose = this.querySelector('.btn-close-micro');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.close());
        }

        const btnDone = this.querySelector('.btn-done-micro');
        if (btnDone) {
            btnDone.addEventListener('click', () => this.close());
        }

        const btnConsolidate = this.querySelector('.btn-trigger-consolidate');
        if (btnConsolidate) {
            btnConsolidate.addEventListener('click', () => {
                this.promptConsolidation(this._calculateSum());
            });
        }

        this._bindItemInputs();
        this._bindAddChild();
    }

    _bindItemInputs() {
        this.querySelectorAll('.input-item-val').forEach((input) => {
            input.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-item-id');
                const newVal = Number(e.target.value) || ZERO;
                const it = this._items.find((item) => String(item.id) === String(id));
                if (it) {
                    it.value = newVal;
                    this._emitUpdate(ACTION_UPDATE, { id, value: newVal, item: it });
                    this.render();
                    this.afterRender();
                }
            });
        });

        this.querySelectorAll('.btn-remove-item').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-item-id');
                this._items = this._items.filter((item) => String(item.id) !== String(id));
                this._emitUpdate(ACTION_REMOVE, { id });
                this.render();
                this.afterRender();
            });
        });
    }

    _bindAddChild() {
        const btnAdd = this.querySelector('#btn-add-child-item');
        if (!btnAdd) return;

        btnAdd.addEventListener('click', () => {
            const nameInput = this.querySelector('#input-new-item-name');
            const valInput = this.querySelector('#input-new-item-val');
            const name = (nameInput?.value || '').trim() || `New ${this._entityName}`;
            const val = Number(valInput?.value) || ZERO;

            const newItem = {
                id: `child-${Date.now()}`,
                name,
                value: val
            };

            this._items.push(newItem);
            this._emitUpdate(ACTION_ADD, { item: newItem, id: newItem.id, value: val });
            this.render();
            this.afterRender();
        });
    }

    _bindConsolidationEvents() {
        const btnConfirm = this.querySelector('#btn-confirm-consolidate');
        if (btnConfirm) {
            btnConfirm.addEventListener('click', () => {
                this._emitConsolidate();
                this.close();
            });
        }

        const btnCancel = this.querySelector('#btn-cancel-consolidate');
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                this._isConsolidatePromptOpen = false;
                this.render();
                this.afterRender();
            });
        }
    }

    _emitUpdate(action, payload) {
        this.dispatchEvent(
            new CustomEvent('update-child', {
                detail: {
                    field: this._field,
                    action,
                    ...payload,
                    items: [...this._items],
                    sum: this._calculateSum()
                },
                bubbles: true,
                composed: true
            })
        );
    }

    _emitConsolidate() {
        this.dispatchEvent(
            new CustomEvent('consolidate-field', {
                detail: {
                    field: this._field,
                    aggregateValue: this._pendingConsolidateValue,
                    itemCount: this._items.length
                },
                bubbles: true,
                composed: true
            })
        );
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('micro-expand-drawer')) {
    customElements.define('micro-expand-drawer', MicroExpandDrawer);
}
