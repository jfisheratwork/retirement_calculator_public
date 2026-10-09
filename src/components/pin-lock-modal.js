/**
 * PinLockModal Component
 *
 * Manages configuration, status, changing, and removal of PIN-derived cryptographic locks.
 * Displays a prominent security warning before enabling AES-256-GCM encryption.
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
        this._mode = 'setup'; // 'setup', 'manage', 'change'
        this._errorMsg = '';
        this._successMsg = '';
        this._isOpen = false;
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
                        <button class="btn-close-lock btn-close" style="font-size: 1.5rem; background: none; border: none; color: #94a3b8; cursor: pointer;">&times;</button>
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
            <div style="display: flex; flex-direction: column; gap: 1rem;">
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
                        <label style="display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.25rem;">Enter PIN (4–12 characters):</label>
                        <input type="password" id="input-new-pin" maxlength="12" placeholder="e.g. 1234 or a strong passphrase"
                            style="width: 100%; box-sizing: border-box; padding: 0.55rem; border-radius: 6px; border: 1px solid var(--border); background: #1e293b; color: #fff; font-size: 0.95rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.85rem; color: #cbd5e1; margin-bottom: 0.25rem;">Confirm PIN:</label>
                        <input type="password" id="input-confirm-pin" maxlength="12" placeholder="Re-enter your PIN"
                            style="width: 100%; box-sizing: border-box; padding: 0.55rem; border-radius: 6px; border: 1px solid var(--border); background: #1e293b; color: #fff; font-size: 0.95rem;">
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn btn-secondary btn-cancel-setup" style="padding: 0.5rem 1rem;">Cancel</button>
                    <button class="btn btn-primary btn-save-pin" style="padding: 0.5rem 1.25rem; background: #eab308; color: #000; font-weight: 700; border: none;">🔒 Encrypt & Lock with PIN</button>
                </div>
            </div>
        `;
    }

    _renderManageView() {
        return `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 8px; padding: 0.75rem; color: #86efac; font-size: 0.85rem;">
                    <strong>🛡️ Active Protection:</strong> Your financial profiles are encrypted with <strong>AES-256-GCM</strong>. Data on disk is completely unreadable to browser extensions.
                </div>

                <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                    <button class="btn btn-secondary btn-lock-now" style="width: 100%; padding: 0.6rem; text-align: left; display: flex; align-items: center; gap: 0.5rem;">
                        <span>🔒</span> <span><strong>Lock Session Now</strong> (Require PIN to view again)</span>
                    </button>
                    <button class="btn btn-secondary btn-show-change" style="width: 100%; padding: 0.6rem; text-align: left; display: flex; align-items: center; gap: 0.5rem;">
                        <span>🔑</span> <span><strong>Change PIN</strong></span>
                    </button>
                    <button class="btn btn-secondary btn-show-remove" style="width: 100%; padding: 0.6rem; text-align: left; display: flex; align-items: center; gap: 0.5rem; color: #fca5a5;">
                        <span>🔓</span> <span><strong>Remove PIN Protection</strong> (Revert to Baseline Obfuscation)</span>
                    </button>
                </div>

                <!-- Inline Action Form (Hidden by default) -->
                <div id="pin-subaction-form" style="display: none; background: #1e293b; padding: 1rem; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);"></div>
            </div>
        `;
    }

    afterRender() {
        const modal = this.querySelector('#pin-lock-modal');
        const btnClose = this.querySelector('.btn-close-lock');
        const btnCancel = this.querySelector('.btn-cancel-setup');
        const btnSavePin = this.querySelector('.btn-save-pin');

        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (btnCancel) btnCancel.addEventListener('click', () => this.close());

        if (btnSavePin) {
            btnSavePin.addEventListener('click', () => this._handleSetPin());
        }

        // Manage actions
        const btnLockNow = this.querySelector('.btn-lock-now');
        if (btnLockNow) {
            btnLockNow.addEventListener('click', () => {
                lockStorageSessionNow();
                this.close();
                this.dispatchEvent(new CustomEvent('session-locked', { bubbles: true, composed: true }));
            });
        }

        const btnShowChange = this.querySelector('.btn-show-change');
        if (btnShowChange) {
            btnShowChange.addEventListener('click', () => this._renderChangePinForm());
        }

        const btnShowRemove = this.querySelector('.btn-show-remove');
        if (btnShowRemove) {
            btnShowRemove.addEventListener('click', () => this._renderRemovePinForm());
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }
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
            return;
        }
        if (pin !== confirm) {
            this._errorMsg = 'PIN and confirmation do not match.';
            this.render();
            return;
        }

        try {
            await setStoragePin(pin);
            this._successMsg = 'PIN Lock successfully enabled! Your profiles are encrypted with AES-256-GCM.';
            this.render();
            this.dispatchEvent(new CustomEvent('pin-status-changed', { bubbles: true, composed: true }));
        } catch (err) {
            this._errorMsg = `Failed to set PIN lock: ${err.message}`;
            this.render();
        }
    }

    _renderChangePinForm() {
        const sub = this.querySelector('#pin-subaction-form');
        if (!sub) return;
        sub.style.display = 'block';
        sub.innerHTML = `
            <h4 style="margin: 0 0 0.5rem; color: #fff; font-size: 0.95rem;">Change PIN</h4>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="password" id="input-curr-pin" placeholder="Current PIN" style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <input type="password" id="input-new-pin-change" placeholder="New PIN (min 4 chars)" style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <input type="password" id="input-new-pin-confirm" placeholder="Confirm New PIN" style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn btn-secondary btn-cancel-sub" style="padding: 0.4rem 0.8rem;">Cancel</button>
                    <button class="btn btn-primary btn-submit-change" style="padding: 0.4rem 0.8rem;">Update PIN</button>
                </div>
            </div>
        `;
        sub.querySelector('.btn-cancel-sub').addEventListener('click', () => { sub.style.display = 'none'; });
        sub.querySelector('.btn-submit-change').addEventListener('click', async () => {
            const curr = sub.querySelector('#input-curr-pin').value.trim();
            const next = sub.querySelector('#input-new-pin-change').value.trim();
            const nextConf = sub.querySelector('#input-new-pin-confirm').value.trim();
            if (next.length < 4 || next !== nextConf) {
                alert('New PIN must be at least 4 chars and match confirmation.');
                return;
            }
            try {
                await changeStoragePin(curr, next);
                alert('PIN successfully updated!');
                this.render();
            } catch (err) {
                alert(`Error changing PIN: ${err.message}`);
            }
        });
    }

    _renderRemovePinForm() {
        const sub = this.querySelector('#pin-subaction-form');
        if (!sub) return;
        sub.style.display = 'block';
        sub.innerHTML = `
            <h4 style="margin: 0 0 0.5rem; color: #fca5a5; font-size: 0.95rem;">Remove PIN Lock</h4>
            <p style="font-size: 0.8rem; color: #cbd5e1; margin: 0 0 0.5rem;">Enter your current PIN to decrypt and return your storage to baseline split-key obfuscation.</p>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="password" id="input-remove-curr-pin" placeholder="Current PIN" style="padding: 0.45rem; border-radius: 4px; border: 1px solid var(--border); background: #0f172a; color: #fff;">
                <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
                    <button class="btn btn-secondary btn-cancel-sub" style="padding: 0.4rem 0.8rem;">Cancel</button>
                    <button class="btn btn-primary btn-submit-remove" style="padding: 0.4rem 0.8rem; background: #ef4444; color: #fff; border: none;">Remove PIN Protection</button>
                </div>
            </div>
        `;
        sub.querySelector('.btn-cancel-sub').addEventListener('click', () => { sub.style.display = 'none'; });
        sub.querySelector('.btn-submit-remove').addEventListener('click', async () => {
            const curr = sub.querySelector('#input-remove-curr-pin').value.trim();
            try {
                await removeStoragePin(curr);
                alert('PIN protection removed. Storage returned to baseline split-key obfuscation.');
                this.render();
                this.dispatchEvent(new CustomEvent('pin-status-changed', { bubbles: true, composed: true }));
            } catch (err) {
                alert(`Error removing PIN: ${err.message}`);
            }
        });
    }

    open() {
        this._isOpen = true;
        this._errorMsg = '';
        this._successMsg = '';
        this.render();
    }

    close() {
        this._isOpen = false;
        this.render();
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('pin-lock-modal')) {
    customElements.define('pin-lock-modal', PinLockModal);
}
