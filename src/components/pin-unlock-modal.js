/**
 * PinUnlockModal Component
 *
 * Boot-time blocking modal displayed when local storage is encrypted with AES-256-GCM.
 * Prompts the user for their PIN before decrypting and rendering financial plans into memory.
 * Features permanent root event delegation, animated decrypting spinner, and auto-focus.
 *
 * Written with the assistance of Google Gemini
 */

import { BaseComponent } from './base-component.js';
import { unlockStorageWithPin, resetStorageToDefault } from '../services/state.js';
import { escapeHtml } from '../utils/sanitize.js';

export class PinUnlockModal extends BaseComponent {
    constructor() {
        super();
        this._errorMsg = '';
        this._isSubmitting = false;
        this._isOpen = false;
    }

    connectedCallback() {
        super.connectedCallback();
        this._bindRootDelegation();
    }

    _bindRootDelegation() {
        this.addEventListener('submit', (e) => {
            if (e.target.id === 'pin-unlock-form') {
                e.preventDefault();
                this._handleUnlock();
            }
        });

        this.addEventListener('click', (e) => {
            if (e.target.closest('.btn-forgot-pin')) {
                e.preventDefault();
                this._handleForgotReset();
            }
        });
    }

    getTemplate() {
        return `
            <div id="pin-unlock-overlay" class="drawer-overlay ${this._isOpen ? '' : 'hidden'}" style="align-items: center; justify-content: center; z-index: 20000; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(8px);">
                <div class="glass-panel" style="padding: 2.5rem; border-radius: 1.25rem; width: 440px; max-width: 90vw; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 25px 60px rgba(0, 0, 0, 0.9); text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 0.75rem;">🔒</div>
                    <h2 style="margin: 0 0 0.5rem; font-size: 1.5rem; color: #fff;">Unlock Financial Data</h2>
                    <p style="margin: 0 0 1.5rem; color: #94a3b8; font-size: 0.9rem; line-height: 1.45;">
                        Your financial scenarios are protected with <strong>AES-256-GCM encryption</strong>. Enter your PIN to decrypt and load your data into memory.
                    </p>

                    ${this._errorMsg ? `
                        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 0.6rem 0.85rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1.25rem; text-align: left;">
                            ⚠️ ${escapeHtml(this._errorMsg)}
                        </div>
                    ` : ''}

                    <form id="pin-unlock-form" style="display: flex; flex-direction: column; gap: 1rem;">
                        <input type="text" name="username" value="local-user" autocomplete="username" style="display:none;" aria-hidden="true">
                        <div>
                            <input type="password" id="input-unlock-pin" maxlength="12" placeholder="Enter your PIN"
                                autocomplete="current-password" ${this._isSubmitting ? 'disabled' : ''}
                                style="width: 100%; box-sizing: border-box; padding: 0.75rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.2); background: #1e293b; color: #fff; font-size: 1.25rem; text-align: center; letter-spacing: 0.25rem;">
                        </div>

                        <button type="submit" class="btn btn-primary btn-submit-unlock" ${this._isSubmitting ? 'disabled' : ''}
                            style="padding: 0.75rem; border-radius: 8px; background: #eab308; color: #000; font-weight: 700; font-size: 1rem; border: none; cursor: ${this._isSubmitting ? 'not-allowed' : 'pointer'}; transition: all 0.2s ease;">
                            ${this._isSubmitting ? `<span class="pin-spinner"></span> Decrypting...` : '🔓 Unlock Plan'}
                        </button>
                    </form>

                    <div style="margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <button type="button" class="btn-forgot-pin" ${this._isSubmitting ? 'disabled' : ''} style="background: none; border: none; color: #64748b; font-size: 0.8rem; cursor: pointer; text-decoration: underline;">
                            Forgot PIN? Reset Local Data
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender() {
        if (this._isOpen && !this._isSubmitting) {
            const pinInput = this.querySelector('#input-unlock-pin');
            if (pinInput) {
                setTimeout(() => pinInput.focus(), 60);
            }
        }
    }

    render() {
        super.render();
        this.afterRender();
    }

    async _handleUnlock() {
        const pinInput = this.querySelector('#input-unlock-pin');
        const pin = pinInput?.value?.trim();

        if (!pin) {
            this._errorMsg = 'Please enter your PIN.';
            this.render();
            return;
        }

        this._isSubmitting = true;
        this._errorMsg = '';
        this.render();

        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            await unlockStorageWithPin(pin);
            this._isSubmitting = false;
            this.close();
            this.dispatchEvent(new CustomEvent('plan-unlocked', { bubbles: true, composed: true }));
        } catch (_err) {
            this._isSubmitting = false;
            this._errorMsg = 'Incorrect PIN. Decryption failed. Please try again.';
            this.render();
        }
    }

    _handleForgotReset() {
        const confirmed = confirm(
            '⚠️ RESET WARNING: If you reset local data, all encrypted scenarios saved in this browser will be permanently deleted and cannot be recovered.\n\nAre you sure you want to proceed and start with a clean default plan?'
        );
        if (confirmed) {
            resetStorageToDefault();
            this.close();
            this.dispatchEvent(new CustomEvent('plan-unlocked', { bubbles: true, composed: true }));
        }
    }

    open() {
        this._isOpen = true;
        this._errorMsg = '';
        this._isSubmitting = false;
        this.render();
    }

    close() {
        this._isOpen = false;
        this._errorMsg = '';
        this._isSubmitting = false;
        this.render();
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('pin-unlock-modal')) {
    customElements.define('pin-unlock-modal', PinUnlockModal);
}
