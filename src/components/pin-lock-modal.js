/**
 * PinLockModal Component
 *
 * Manages configuration, status, changing, and removal of PIN-derived cryptographic locks.
 * Displays a prominent security warning before enabling AES-256-GCM encryption.
 * Features robust event delegation, escape-to-close, outside click handling, and animated spinners.
 *
 * Written with the assistance of Google Gemini
 */

import { BaseComponent } from './base-component.js';
import {
    isStoragePinConfigured,
    setStoragePin,
    removeStoragePin,
    changeStoragePin,
    lockStorageSessionNow
} from '../services/state.js';
import { escapeHtml } from '../utils/sanitize.js';

export class PinLockModal extends BaseComponent {
    constructor() {
        super();
        this._errorMsg = '';
        this._successMsg = '';
        this._isOpen = false;
        this._isSubmitting = false;
        this._isSuccess = false;
        this._activeSubaction = null; // 'change' or 'remove' or null

        // Global keydown handler for Escape key dismissal
        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this._isOpen && !this._isSubmitting) {
                this.close();
            }
        };
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._onKeyDown);
        this._bindRootDelegation();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._onKeyDown);
    }

    /**
     * Permanent event delegation attached directly to the custom element host.
     * Guarantees event listeners survive innerHTML re-renders.
     */
    _bindRootDelegation() {
        this.addEventListener('click', (e) => {
            // Close buttons (X or Cancel)
            if (e.target.closest('.btn-close-lock') || e.target.closest('.btn-cancel-setup')) {
                e.preventDefault();
                this.close();
                return;
            }

            // Click outside the modal on the background overlay
            if (e.target.id === 'pin-lock-modal') {
                e.preventDefault();
                this.close();
                return;
            }

            // Lock Session Now
            if (e.target.closest('.btn-lock-now')) {
                e.preventDefault();
                lockStorageSessionNow();
                this.close();
                this.dispatchEvent(new CustomEvent('session-locked', { bubbles: true, composed: true }));
                return;
            }

            // Show Change PIN Form
            if (e.target.closest('.btn-show-change')) {
                e.preventDefault();
                this._activeSubaction = 'change';
                this._errorMsg = '';
                this._successMsg = '';
                this.render();
                return;
            }

            // Show Remove PIN Form
            if (e.target.closest('.btn-show-remove')) {
                e.preventDefault();
                this._activeSubaction = 'remove';
                this._errorMsg = '';
                this._successMsg = '';
                this.render();
                return;
            }

            // Cancel Subaction Form
            if (e.target.closest('.btn-cancel-sub')) {
                e.preventDefault();
                this._activeSubaction = null;
                this._errorMsg = '';
                this.render();
                return;
            }
        });

        this.addEventListener('submit', (e) => {
            e.preventDefault();
            if (e.target.id === 'pin-setup-form') {
                this._handleSetPin();
            } else if (e.target.id === 'pin-change-form') {
                this._handleChangePin();
            } else if (e.target.id === 'pin-remove-form') {
                this._handleRemovePin();
            }
        });
    }

    getTemplate() {
        const isConfigured = isStoragePinConfigured();

        return `
            <div id="pin-lock-modal" class="drawer-overlay ${this._isOpen ? '' : 'hidden'}" style="align-items: center; justify-content: center; z-index: 10000;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 480px; max-width: 92vw; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.5rem;">${isConfigured ? '🛡️' : '🔒'}</span>
                            <h2 style="margin: 0; font-size: 1.25rem; color: #fff;">${isConfigured ? 'PIN Security Management' : 'Lock Data with PIN'}</h2>
                        </div>
                        <button type="button" class="btn-close-lock btn-close" aria-label="Close dialog" style="font-size: 1.5rem; background: none; border: none; color: #94a3b8; cursor: pointer; line-height: 1;">&times;</button>
                    </div>

                    ${this._errorMsg ? `
                        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.6rem 0.85rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem;">
                            ⚠️ ${escapeHtml(this._errorMsg)}
                        </div>
                    ` : ''}

                    ${this._successMsg ? `
                        <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.4); color: #86efac; padding: 0.6rem 0.85rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem;">
                            ✅ ${escapeHtml(this._successMsg)}
                        </div>
                    ` : ''}

                    ${!isConfigured ? this._renderSetupView() : this._renderManageView()}
                </div>
            </div>
        `;
    }

    _renderSetupView() {
        return `
            <form id="pin-setup-form" style="display: flex; flex-direction: column; gap: 1rem;">
                <input type="text" name="username" value="local-user" autocomplete="username" style="display:none;" aria-hidden="true">
                <!-- Strong Security Warning Box -->
                <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.35); border-radius: 8px; padding: 0.85rem; color: #fef08a; font-size: 0.82rem; line-height: 1.45;">
                    <div style="font-weight: 700; color: #fde047; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.35rem;">
                        <span>⚠️</span> <span>CRITICAL SECURITY WARNING: Cryptographic PIN Lock</span>
                    </div>
                    <p style="margin: 0 0 0.45rem;">
                        Enabling PIN Lock encrypts all saved profiles in local storage using <strong>AES-GCM 256-bit encryption</strong> derived from your secret PIN via PBKDF2 (100,000 iterations).
                    </p>
                    <p style="margin: 0 0 0.45rem; color: #fff; font-weight: 600;">
                        From now on, every time you load this page you will need to unlock the content first with this PIN to get your financial plans back into local memory.
                    </p>
                    <p style="margin: 0; color: #f87171; font-weight: 700;">
                        If you lose or forget this PIN, your local data CANNOT be recovered by anyone.
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <div>
                        <label for="input-new-pin" style="display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.25rem;">Enter PIN (4–12 characters):</label>
                        <input type="password" id="input-new-pin" maxlength="12" placeholder="e.g. 1234 or a strong passphrase"
                            autocomplete="new-password" ${this._isSubmitting ? 'disabled' : ''}
                            style="width: 100%; box-sizing: border-box; padding: 0.55rem; border-radius: 6px; border: 1px solid var(--border); background: #1e293b; color: #fff; font-size: 0.95rem;">
                    </div>
                    <div>
                        <label for="input-confirm-pin" style="display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.25rem;">Confirm PIN:</label>
                        <input type="password" id="input-confirm-pin" maxlength="12" placeholder="Re-enter your PIN"
                            autocomplete="new-password" ${this._isSubmitting ? 'disabled' : ''}
                            style="width: 100%; box-sizing: border-box; padding: 0.55rem; border-radius: 6px; border: 1px solid var(--border); background: #1e293b; color: #fff; font-size: 0.95rem;">
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                    <button type="button" class="btn btn-secondary btn-cancel-setup" ${this._isSubmitting ? 'disabled' : ''} style="padding: 0.5rem 1rem;">Cancel</button>
                    <button type="submit" id="btn-submit-setup-pin" class="btn btn-primary btn-save-pin" ${this._isSubmitting ? 'disabled' : ''}
                        style="padding: 0.5rem 1.25rem; background: ${this._isSuccess ? '#22c55e' : '#eab308'}; color: #000; font-weight: 700; border: none; cursor: ${this._isSubmitting ? 'not-allowed' : 'pointer'}; min-width: 190px; text-align: center;">
                        ${this._isSubmitting 
                            ? `<span class="pin-spinner"></span> Encrypting & Locking...` 
                            : (this._isSuccess ? `✅ Encrypted & Locked!` : `🔒 Encrypt & Lock with PIN`)}
                    </button>
                </div>
            </form>
        `;
    }

    _renderManageView() {
        return `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 0.75rem; color: #86efac; font-size: 0.85rem;">
                    <strong>🛡️ Active Protection:</strong> Your financial profiles are encrypted with <strong>AES-256-GCM</strong>. Data on disk is completely unreadable to browser extensions.
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                    <button type="button" class="btn btn-secondary btn-lock-now" style="width: 100%; padding: 0.6rem; text-align: left; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <span>🔒</span> <span><strong>Lock Session Now</strong> (Require PIN to view again)</span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-show-change" style="width: 100%; padding: 0.6rem; text-align: left; display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <span>🔑</span> <span><strong>Change PIN</strong></span>
                    </button>
                    <button type="button" class="btn btn-secondary btn-show-remove" style="width: 100%; padding: 0.6rem; text-align: left; display: flex; align-items: center; gap: 0.5rem; color: #fca5a5; cursor: pointer;">
                        <span>🔓</span> <span><strong>Remove PIN Protection</strong> (Revert to Baseline Obfuscation)</span>
                    </button>
                </div>

                ${this._activeSubaction === 'change' ? this._renderChangePinSubform() : ''}
                ${this._activeSubaction === 'remove' ? this._renderRemovePinSubform() : ''}
            </div>
        `;
    }

    _renderChangePinSubform() {
        return `
            <form id="pin-change-form" style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="text" name="username" value="local-user" autocomplete="username" style="display:none;" aria-hidden="true">
                <h4 style="margin: 0 0 0.25rem; color: #fff; font-size: 0.95rem;">Change PIN</h4>
                <input type="password" id="input-curr-pin" placeholder="Current PIN" required autocomplete="current-password"
                    style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <input type="password" id="input-new-pin-change" placeholder="New PIN (min 4 chars)" required maxlength="12" autocomplete="new-password"
                    style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <input type="password" id="input-new-pin-confirm" placeholder="Confirm New PIN" required maxlength="12" autocomplete="new-password"
                    style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                    <button type="button" class="btn btn-secondary btn-cancel-sub" style="padding: 0.4rem 0.8rem;">Cancel</button>
                    <button type="submit" class="btn btn-primary btn-submit-change" ${this._isSubmitting ? 'disabled' : ''} style="padding: 0.4rem 0.8rem; cursor: pointer;">
                        ${this._isSubmitting ? `<span class="pin-spinner pin-spinner-light"></span> Updating...` : 'Update PIN'}
                    </button>
                </div>
            </form>
        `;
    }

    _renderRemovePinSubform() {
        return `
            <form id="pin-remove-form" style="background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="text" name="username" value="local-user" autocomplete="username" style="display:none;" aria-hidden="true">
                <h4 style="margin: 0 0 0.25rem; color: #fca5a5; font-size: 0.95rem;">Remove PIN Lock</h4>
                <p style="font-size: 0.8rem; color: #cbd5e1; margin: 0 0 0.25rem;">Enter your current PIN to decrypt and return storage to baseline split-key obfuscation.</p>
                <input type="password" id="input-remove-curr-pin" placeholder="Current PIN" required autocomplete="current-password"
                    style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                    <button type="button" class="btn btn-secondary btn-cancel-sub" style="padding: 0.4rem 0.8rem;">Cancel</button>
                    <button type="submit" class="btn btn-primary btn-submit-remove" ${this._isSubmitting ? 'disabled' : ''}
                        style="padding: 0.4rem 0.8rem; background: #ef4444; color: #fff; border: none; cursor: pointer;">
                        ${this._isSubmitting ? `<span class="pin-spinner pin-spinner-light"></span> Removing...` : 'Remove PIN Protection'}
                    </button>
                </div>
            </form>
        `;
    }

    afterRender() {
        // Auto-focus input when modal opens
        if (this._isOpen && !this._isSubmitting) {
            const firstInput = this.querySelector('input[type="password"]:not([disabled])');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 60);
            }
        }
    }

    render() {
        super.render();
        this.afterRender();
    }

    async _handleSetPin() {
        const pinInput = this.querySelector('#input-new-pin');
        const confirmInput = this.querySelector('#input-confirm-pin');
        const pin = pinInput?.value?.trim();
        const confirm = confirmInput?.value?.trim();

        this._errorMsg = '';
        if (!pin || pin.length < 4) {
            this._errorMsg = 'PIN must be at least 4 characters long.';
            this.render();
            const input = this.querySelector('#input-new-pin');
            if (input) input.focus();
            return;
        }
        if (pin !== confirm) {
            this._errorMsg = 'PIN and confirmation do not match.';
            this.render();
            const input = this.querySelector('#input-confirm-pin');
            if (input) input.focus();
            return;
        }

        // Show animated spinner
        this._isSubmitting = true;
        this.render();

        // Brief delay to ensure browser paints spinner before PBKDF2 runs
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            await setStoragePin(pin);
            this._isSubmitting = false;
            this._isSuccess = true;
            this._successMsg = 'PIN Lock successfully enabled! Your profiles are encrypted with AES-256-GCM.';
            this.render();
            this.dispatchEvent(new CustomEvent('pin-status-changed', { bubbles: true, composed: true }));

            // Gracefully close after the user sees the confirmation
            setTimeout(() => {
                if (this._isOpen) this.close();
            }, 900);
        } catch (err) {
            this._isSubmitting = false;
            this._isSuccess = false;
            this._errorMsg = `Failed to set PIN lock: ${err.message}`;
            this.render();
        }
    }

    async _handleChangePin() {
        const curr = this.querySelector('#input-curr-pin')?.value?.trim();
        const next = this.querySelector('#input-new-pin-change')?.value?.trim();
        const nextConf = this.querySelector('#input-new-pin-confirm')?.value?.trim();

        this._errorMsg = '';
        if (!curr) {
            this._errorMsg = 'Please enter your current PIN.';
            this.render();
            return;
        }
        if (!next || next.length < 4) {
            this._errorMsg = 'New PIN must be at least 4 characters long.';
            this.render();
            return;
        }
        if (next !== nextConf) {
            this._errorMsg = 'New PIN and confirmation do not match.';
            this.render();
            return;
        }

        this._isSubmitting = true;
        this.render();
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            await changeStoragePin(curr, next);
            this._isSubmitting = false;
            this._activeSubaction = null;
            this._successMsg = 'PIN successfully updated! All profiles re-encrypted.';
            this.render();
        } catch (err) {
            this._isSubmitting = false;
            this._errorMsg = `Error changing PIN: ${err.message}`;
            this.render();
        }
    }

    async _handleRemovePin() {
        const curr = this.querySelector('#input-remove-curr-pin')?.value?.trim();

        this._errorMsg = '';
        if (!curr) {
            this._errorMsg = 'Please enter your current PIN to remove protection.';
            this.render();
            return;
        }

        this._isSubmitting = true;
        this.render();
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            await removeStoragePin(curr);
            this._isSubmitting = false;
            this._activeSubaction = null;
            this._successMsg = 'PIN protection removed. Storage returned to baseline split-key obfuscation.';
            this.render();
            this.dispatchEvent(new CustomEvent('pin-status-changed', { bubbles: true, composed: true }));
            setTimeout(() => {
                if (this._isOpen) this.close();
            }, 900);
        } catch (err) {
            this._isSubmitting = false;
            this._errorMsg = `Error removing PIN: ${err.message}`;
            this.render();
        }
    }

    open() {
        this._isOpen = true;
        this._errorMsg = '';
        this._successMsg = '';
        this._isSubmitting = false;
        this._isSuccess = false;
        this._activeSubaction = null;
        this.render();
    }

    close() {
        this._isOpen = false;
        this._errorMsg = '';
        this._successMsg = '';
        this._isSubmitting = false;
        this._isSuccess = false;
        this._activeSubaction = null;
        this.render();
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('pin-lock-modal')) {
    customElements.define('pin-lock-modal', PinLockModal);
}
