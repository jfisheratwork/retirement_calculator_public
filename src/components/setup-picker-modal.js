/**
 * SetupPickerModal Component
 *
 * Implements Mockup 1: Zero-state mode selection welcome modal.
 * Presents users with 3 distinct onboarding choices:
 * - ⚡ Express Mode (Recommended, 60s, 4 questions)
 * - 🧭 Guided Planner (4-step card wizard)
 * - ⚙️ Advanced Actuarial Studio (Direct access to all 8 tabs)
 * Along with a one-click sample profile quick loader.
 *
 * Emits custom events:
 * - 'select-mode' with { mode: 'express' | 'guided' | 'advanced' }
 * - 'load-sample'
 *
 * Web Components Custom Elements API: https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
 * HTMLElement API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement
 * CustomEvent API: https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent
 *
 * Written with the assistance of Google Gemini
 */

import { BaseComponent } from './base-component.js';

const MODE_EXPRESS = 'express';
const MODE_GUIDED = 'guided';
const MODE_ADVANCED = 'advanced';
const KEY_ESCAPE = 'Escape';

export class SetupPickerModal extends BaseComponent {
    /**
     * Initializes setup picker modal state and bindings.
     */
    constructor() {
        super();
        this._isOpen = false;

        this._onKeyDown = (eventParam) => {
            if (eventParam.key === KEY_ESCAPE && this._isOpen) {
                this.close();
            }
        };
    }

    /**
     * Lifecycle callback when attached to DOM.
     */
    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._onKeyDown);
        this._bindRootDelegation();
    }

    /**
     * Lifecycle callback when removed from DOM.
     */
    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._onKeyDown);
    }

    /**
     * Attaches persistent root event listener for clicks and selections.
     */
    _bindRootDelegation() {
        this.addEventListener('click', (eventParam) => {
            this._handleRootClick(eventParam);
        });
    }

    /**
     * Handles delegated click events on the host element.
     * @param {MouseEvent} eventParam - Delegated click event.
     */
    _handleRootClick(eventParam) {
        const clickedTarget = eventParam.target;
        if (!clickedTarget) return;

        if (this._isCloseOrBackdropTrigger(clickedTarget)) {
            eventParam.preventDefault();
            this.close();
            return;
        }

        if (clickedTarget.closest('.btn-select-express')) {
            eventParam.preventDefault();
            this._dispatchModeSelection(MODE_EXPRESS);
            return;
        }

        if (clickedTarget.closest('.btn-select-guided')) {
            eventParam.preventDefault();
            this._dispatchModeSelection(MODE_GUIDED);
            return;
        }

        if (clickedTarget.closest('.btn-select-advanced')) {
            eventParam.preventDefault();
            this._dispatchModeSelection(MODE_ADVANCED);
            return;
        }

        if (clickedTarget.closest('.btn-load-sample')) {
            eventParam.preventDefault();
            this._dispatchSampleLoad();
        }
    }

    /**
     * Checks if clicked target corresponds to modal close or backdrop dismissal.
     * @param {HTMLElement} clickedTarget - The element clicked.
     * @returns {boolean} True if dismiss trigger.
     */
    _isCloseOrBackdropTrigger(clickedTarget) {
        if (clickedTarget.id === 'setup-picker-modal') return true;
        if (clickedTarget.closest('.btn-close-picker')) return true;
        if (clickedTarget.closest('.btn-skip-setup')) return true;
        return false;
    }

    /**
     * Dispatches custom event with chosen planning mode.
     * @param {string} modeIdentifier - Chosen mode name.
     */
    _dispatchModeSelection(modeIdentifier) {
        this.dispatchEvent(
            new CustomEvent('select-mode', {
                detail: { mode: modeIdentifier },
                bubbles: true,
                composed: true
            })
        );
        this.close();
    }

    /**
     * Dispatches custom event requesting demo sample profile load.
     */
    _dispatchSampleLoad() {
        this.dispatchEvent(
            new CustomEvent('load-sample', {
                bubbles: true,
                composed: true
            })
        );
        this.close();
    }

    /**
     * Opens the modal.
     */
    open() {
        this._isOpen = true;
        this.render();
    }

    /**
     * Closes the modal.
     */
    close() {
        this._isOpen = false;
        this.render();
    }

    /**
     * Generates complete template string for modal rendering.
     * @returns {string} Rendered HTML string.
     */
    getTemplate() {
        const visibilityClass = this._isOpen ? '' : 'hidden';

        return `
            <div id="setup-picker-modal" class="drawer-overlay ${visibilityClass}"
                style="align-items: center; justify-content: center; z-index: 10000; padding: 1.5rem; background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(8px);">
                <div class="setup-picker-card"
                    style="width: 1040px; max-width: 95vw; max-height: 92vh; overflow-y: auto; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 1.25rem; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85); padding: 2.25rem;">
                    ${this._renderHeader()}
                    ${this._renderTierCards()}
                    ${this._renderFooter()}
                </div>
            </div>
        `;
    }

    /**
     * Renders header section with welcome titles and dismiss button.
     * @returns {string} Header HTML.
     */
    _renderHeader() {
        return `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 1.25rem;">
                <div>
                    <div style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 9999px; padding: 0.25rem 0.85rem; font-size: 0.75rem; font-weight: 700; color: #a5b4fc; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">
                        <span>✨</span> First-Time Plan Setup
                    </div>
                    <h2 style="font-size: 1.75rem; font-weight: 700; color: #f8fafc; margin: 0 0 0.5rem 0; letter-spacing: -0.02em;">
                        Welcome! How would you like to begin?
                    </h2>
                    <p style="color: #94a3b8; font-size: 0.95rem; margin: 0; max-width: 720px; line-height: 1.5;">
                        Choose an onboarding experience that matches your available time and financial complexity. You can switch between modes at any time without losing any customized data.
                    </p>
                </div>
                <button type="button" class="btn-close-picker btn-close" aria-label="Dismiss setup dialog"
                    style="background: transparent; border: none; color: #94a3b8; font-size: 1.75rem; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; border-radius: 0.375rem; transition: color 0.15s ease;">
                    &times;
                </button>
            </div>
        `;
    }

    /**
     * Renders the 3 main tier cards in a responsive grid.
     * @returns {string} Grid HTML.
     */
    _renderTierCards() {
        return `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
                ${this._renderExpressCard()}
                ${this._renderGuidedCard()}
                ${this._renderAdvancedCard()}
            </div>
        `;
    }

    /**
     * Renders Tier 1 Express card markup.
     * @returns {string} Express card HTML.
     */
    _renderExpressCard() {
        return `
            <div class="tier-card express-card"
                style="background: linear-gradient(180deg, rgba(99, 102, 241, 0.14) 0%, rgba(30, 41, 59, 0.85) 100%); border: 2px solid rgba(129, 140, 248, 0.6); border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; position: relative; box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.25);">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
                        <span style="background: #6366f1; color: #ffffff; font-size: 0.72rem; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 9999px; letter-spacing: 0.04em;">
                            ⚡ RECOMMENDED • 60s
                        </span>
                        <span style="font-size: 1.5rem;">🚀</span>
                    </div>
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: #ffffff; margin: 0 0 0.5rem 0;">
                        Express Quick-Start
                    </h3>
                    <p style="color: #cbd5e1; font-size: 0.86rem; line-height: 1.45; margin: 0 0 1.25rem 0;">
                        Answer just 4 questions to see your instant Freedom Date and savings rate. Smart actuarial defaults handle everything else.
                    </p>
                    <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.82rem; color: #94a3b8;">
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #34d399; font-weight: bold;">✓</span> 4 essential questions
                        </li>
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #34d399; font-weight: bold;">✓</span> Instant Freedom Age & SWR Nest Egg
                        </li>
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #34d399; font-weight: bold;">✓</span> Under 60 seconds
                        </li>
                    </ul>
                </div>
                <button type="button" class="btn btn-primary btn-select-express"
                    style="width: 100%; padding: 0.75rem 1rem; background: #6366f1; hover: #4f46e5; color: #ffffff; font-weight: 700; font-size: 0.95rem; border: none; border-radius: 0.625rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);">
                    Start Express Mode ⚡
                </button>
            </div>
        `;
    }

    /**
     * Renders Tier 2 Guided Planner card markup.
     * @returns {string} Guided card HTML.
     */
    _renderGuidedCard() {
        return `
            <div class="tier-card guided-card"
                style="background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
                        <span style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 9999px;">
                            🧭 STEP-BY-STEP
                        </span>
                        <span style="font-size: 1.5rem;">📋</span>
                    </div>
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: #ffffff; margin: 0 0 0.5rem 0;">
                        Guided Planner
                    </h3>
                    <p style="color: #cbd5e1; font-size: 0.86rem; line-height: 1.45; margin: 0 0 1.25rem 0;">
                        A structured 4-step wizard that walks through your household members, lifestyle expenses, asset buckets, and growth levers.
                    </p>
                    <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.82rem; color: #94a3b8;">
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #60a5fa; font-weight: bold;">✓</span> 4 focused progressive cards
                        </li>
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #60a5fa; font-weight: bold;">✓</span> Housing, spouse & asset allocation
                        </li>
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #60a5fa; font-weight: bold;">✓</span> 3 to 5 minutes
                        </li>
                    </ul>
                </div>
                <button type="button" class="btn btn-secondary btn-select-guided"
                    style="width: 100%; padding: 0.75rem 1rem; background: #1e293b; color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.18); font-weight: 600; font-size: 0.95rem; border-radius: 0.625rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    Launch Guided Wizard 🧭
                </button>
            </div>
        `;
    }

    /**
     * Renders Tier 3 Advanced Studio card markup.
     * @returns {string} Advanced card HTML.
     */
    _renderAdvancedCard() {
        return `
            <div class="tier-card advanced-card"
                style="background: rgba(30, 41, 59, 0.75); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 1rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
                        <span style="background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(148, 163, 184, 0.3); font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 9999px;">
                            ⚙️ POWER USER
                        </span>
                        <span style="font-size: 1.5rem;">🎛️</span>
                    </div>
                    <h3 style="font-size: 1.25rem; font-weight: 700; color: #ffffff; margin: 0 0 0.5rem 0;">
                        Advanced Studio
                    </h3>
                    <p style="color: #cbd5e1; font-size: 0.86rem; line-height: 1.45; margin: 0 0 1.25rem 0;">
                        Direct access to the comprehensive 8-tab parameter deck with custom SEPP 72(t), Medicare IRMAA, and discrete tax cohorts.
                    </p>
                    <ul style="list-style: none; padding: 0; margin: 0 0 1.5rem 0; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.82rem; color: #94a3b8;">
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #a78bfa; font-weight: bold;">✓</span> Direct access to all 8 tabs
                        </li>
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #a78bfa; font-weight: bold;">✓</span> Discrete accounts & employer match
                        </li>
                        <li style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="color: #a78bfa; font-weight: bold;">✓</span> Full actuarial policy levers
                        </li>
                    </ul>
                </div>
                <button type="button" class="btn btn-secondary btn-select-advanced"
                    style="width: 100%; padding: 0.75rem 1rem; background: #1e293b; color: #f8fafc; border: 1px solid rgba(255, 255, 255, 0.18); font-weight: 600; font-size: 0.95rem; border-radius: 0.625rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    Open Advanced Studio ⚙️
                </button>
            </div>
        `;
    }

    /**
     * Renders footer section containing sample profile loader and skip button.
     * @returns {string} Footer HTML.
     */
    _renderFooter() {
        return `
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 1.5rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="color: #94a3b8; font-size: 0.88rem;">Not ready to type numbers?</span>
                    <button type="button" class="btn btn-secondary btn-load-sample"
                        style="padding: 0.5rem 1rem; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(148, 163, 184, 0.3); color: #cbd5e1; font-size: 0.85rem; border-radius: 0.5rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; font-weight: 600;">
                        <span>📊</span> Try a Sample Profile (Couple 45 & 41, 2 Kids, $180k Income)
                    </button>
                </div>
                <div>
                    <button type="button" class="btn-skip-setup"
                        style="background: transparent; border: none; color: #64748b; font-size: 0.85rem; cursor: pointer; text-decoration: underline;">
                        Skip setup for now
                    </button>
                </div>
            </div>
        `;
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('setup-picker-modal')) {
    customElements.define('setup-picker-modal', SetupPickerModal);
}
