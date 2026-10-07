import { BaseComponent } from './base-component.js';
import { aiAssistant } from '../services/AIAssistant.js';
import { escapeHtml } from '../utils/sanitize.js';

/**
 * AI Advisor Drawer Web Component
 * 
 * Provides an interactive, slide-out glassmorphism interface for AI financial diagnostics,
 * chart inspection, financial detail row highlighting, and 1-click strategy patch execution.
 */
export class AIAdvisorDrawer extends BaseComponent {
    constructor() {
        super();
        this.messages = [];
        this.isLoading = false;
        this.isOpen = false;
    }

    render() {
        super.render();
        this.afterRender();
    }

    open() {
        this.isOpen = true;
        if (typeof document !== 'undefined') {
            document.body.classList.add('ai-advisor-open');
        }
        if (this.messages.length === 0) {
            this._addWelcomeMessage();
        } else {
            this.render();
        }
        if (typeof window !== 'undefined') {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        }
    }

    close() {
        this.isOpen = false;
        if (typeof document !== 'undefined') {
            document.body.classList.remove('ai-advisor-open');
        }
        this.render();
        if (typeof window !== 'undefined') {
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        }
    }

    _addWelcomeMessage() {
        const hasKey = aiAssistant.hasApiKey();
        const modeBadge = hasKey ? '🟢 Live Gemini 3.7' : '🟠 Demo Mode';
        
        let introText = `👋 Hello! I am your **AI Retirement Planning Advisor & Tax Strategist** (${modeBadge}).\n\n`;
        introText += `I can audit your cash flows, analyze pre-59½ bridge liquidity lockouts, optimize Roth conversion brackets, and test your plan against historical bear markets.\n\n`;
        introText += `Click one of the **Quick Diagnostic Chips** below or ask any custom question to get started!`;

        if (!hasKey) {
            introText += `\n\n> 💡 *Note: Currently operating in **Demo Mode**. You can add your personal Google Gemini API key in **Settings (⚙️)** at any time for custom live models.*`;
        }

        this.messages.push({
            role: 'assistant',
            text: introText,
            commands: [],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
        this.render();
    }

    getTemplate() {
        const hasKey = aiAssistant.hasApiKey();
        const modelLabel = hasKey ? 'gemini-3.7-flash' : 'Demo Simulator';

        return `
            <aside class="ai-advisor-dock ${this.isOpen ? 'open' : 'hidden'}" id="ai-advisor-modal" aria-label="AI Financial Advisor">
                
                <!-- Header -->
                <div class="ai-advisor-header">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <span style="font-size: 1.4rem;">✨</span>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1rem; color: #fff;">AI Financial Advisor</h3>
                            <span class="ai-model-pill ${hasKey ? 'live' : 'demo'}">${modelLabel}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <button type="button" class="btn btn-secondary btn-clear-chat" title="Clear Conversation" style="padding: 0.35rem 0.6rem; font-size: 0.8rem;">🗑️ Clear</button>
                        <button type="button" class="btn btn-secondary btn-close-ai" style="padding: 0.35rem 0.65rem; font-size: 1.1rem; line-height: 1;">&times;</button>
                    </div>
                </div>

                <!-- Quick Diagnostic Chips -->
                <div class="ai-chips-container">
                    <button type="button" class="ai-chip" data-prompt="Audit my pre-59.5 bridge liquidity and early retirement cashflow.">🔍 Bridge Liquidity (50–59½)</button>
                    <button type="button" class="ai-chip" data-prompt="Analyze optimal Roth conversion brackets and multi-account tax arbitrage.">💡 Optimize Roth Strategy</button>
                    <button type="button" class="ai-chip" data-prompt="Evaluate all 8 historical stress tests and sequence-of-returns vulnerabilities.">🛡️ Stress-Test Resilience</button>
                    <button type="button" class="ai-chip" data-prompt="Analyze Social Security claiming ages and survivor longevity protection.">📈 Social Security Timing</button>
                </div>

                <!-- Messages Thread -->
                <div class="ai-messages-thread" id="ai-messages-thread">
                        ${this.messages.map((m, idx) => this._renderMessage(m, idx)).join('')}
                        ${this.isLoading ? `
                            <div class="ai-message assistant loading">
                                <div class="ai-bubble">
                                    <div class="ai-typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                    <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Analyzing plan & running simulations...</div>
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Footer Input -->
                    <div class="ai-advisor-footer">
                        <form class="ai-input-form" id="ai-input-form">
                            <textarea class="ai-input-textarea" placeholder="Ask about retirement timing, taxes, or 72(t)..." rows="2"></textarea>
                            <button type="submit" class="btn btn-primary btn-send-ai" ${this.isLoading ? 'disabled' : ''}>
                                <span>Send</span> ➔
                            </button>
                        </form>
                    </div>

                </div>
            </div>
        `;
    }

    _renderMessage(msg, idx) {
        const isAssistant = msg.role === 'assistant';
        const formattedText = this._formatMarkdown(msg.text);

        // Action cards for suggestions
        const suggestCmds = (msg.commands || []).filter(c => c.action === 'suggest_patch');
        const inspectCmds = (msg.commands || []).filter(c => c.action === 'inspect_chart' || c.action === 'focus_year');

        return `
            <div class="ai-message ${isAssistant ? 'assistant' : 'user'}">
                <div class="ai-bubble">
                    <div class="ai-message-text">${formattedText}</div>

                    ${inspectCmds.length > 0 ? `
                        <div class="ai-inspection-actions">
                            ${inspectCmds.map(c => `
                                <button type="button" class="btn-ai-inspect-chip" data-action="${c.action}" data-chart="${c.chartId || ''}" data-year="${c.year || ''}">
                                    ${c.action === 'inspect_chart' ? `📊 View ${c.chartId || 'Chart'} (${c.year})` : `📅 Focus Year ${c.year}`}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${suggestCmds.length > 0 ? `
                        <div class="ai-suggestion-cards">
                            ${suggestCmds.map((c, sIdx) => `
                                <div class="ai-suggestion-card" id="sug-${idx}-${sIdx}">
                                    <div class="ai-sug-label">⚡ <strong>Actionable Recommendation:</strong> ${escapeHtml(c.label)}</div>
                                    <button type="button" class="btn btn-primary btn-apply-sug" data-msg-idx="${idx}" data-sug-idx="${sIdx}">
                                        Apply to Plan
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${isAssistant && idx > 0 ? `
                        <details class="ai-math-breakdown" style="margin-top: 0.85rem; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(139, 92, 246, 0.35); border-radius: 8px; padding: 0.6rem 0.75rem; font-size: 0.78rem;">
                            <summary style="cursor: pointer; color: #c4b5fd; font-weight: 600; outline: none; user-select: none; display: flex; align-items: center; gap: 0.4rem;">
                                <span>🧠</span> <span>Explain AI Mathematical & Tax Modeling Logic</span>
                            </summary>
                            <div style="margin-top: 0.65rem; color: #cbd5e1; line-height: 1.5; border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 0.5rem;">
                                <div style="font-weight: 600; color: #93c5fd; margin-bottom: 0.2rem;">1. Marginal Tax Rate Arbitrage:</div>
                                <div style="font-family: monospace; background: rgba(0, 0, 0, 0.4); padding: 0.35rem 0.5rem; border-radius: 4px; border-left: 2px solid #3b82f6; margin-bottom: 0.45rem; color: #93c5fd;">
                                    ΔTax Savings = Converted Amount × (τ_Future - τ_Current)
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                                    Fills low taxable brackets (10% / 12% / 22%) during the pre-RMD / pre-Social Security window to eliminate high future tax spikes.
                                </div>

                                <div style="font-weight: 600; color: #a78bfa; margin-bottom: 0.2rem;">2. IRS Rule 72(t) Fixed Amortization (Rev. Rul. 2002-62):</div>
                                <div style="font-family: monospace; background: rgba(0, 0, 0, 0.4); padding: 0.35rem 0.5rem; border-radius: 4px; border-left: 2px solid #8b5cf6; margin-bottom: 0.45rem; color: #c4b5fd;">
                                    Annual SEPP = Pre-Tax IRA Balance / a_n|r
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
                                    Calculates statutory early withdrawal allowance without incurring the 10% IRS early distribution penalty.
                                </div>

                                <div style="font-weight: 600; color: #34d399; margin-bottom: 0.2rem;">3. Bridge Liquidity Solver & Drawdown Sequence:</div>
                                <div style="font-family: monospace; background: rgba(0, 0, 0, 0.4); padding: 0.35rem 0.5rem; border-radius: 4px; border-left: 2px solid #10b981; margin-bottom: 0.45rem; color: #6ee7b7;">
                                    Bridge Deficit = Σ (Expenses_t - PenaltyFree_Liquid_t)
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-muted);">
                                    Draws sequentially: Cash ➔ Taxable Brokerage ➔ Roth Basis ➔ Rule 72(t) SEPP ➔ Matured Roth Conversions ➔ Unlocked Pre-Tax (59½+).
                                </div>
                            </div>
                        </details>
                    ` : ''}

                    <div class="ai-message-time">${msg.timestamp || ''}</div>
                </div>
            </div>
        `;
    }

    _formatMarkdown(text) {
        if (!text) return '';
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Headers
        escaped = escaped.replace(/^### (.*$)/gim, '<h4 style="color: #60a5fa; margin: 0.5rem 0 0.25rem 0;">$1</h4>');
        escaped = escaped.replace(/^## (.*$)/gim, '<h3 style="color: #93c5fd; margin: 0.6rem 0 0.3rem 0;">$1</h3>');

        // Bold
        escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italic
        escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Blockquote
        escaped = escaped.replace(/^> (.*$)/gim, '<blockquote class="ai-quote">$1</blockquote>');
        // Bullet points
        escaped = escaped.replace(/^\* (.*$)/gim, '<li class="ai-bullet">$1</li>');
        escaped = escaped.replace(/^- (.*$)/gim, '<li class="ai-bullet">$1</li>');

        // Wrap list items
        escaped = escaped.replace(/(<li class="ai-bullet">.*<\/li>)/gms, '<ul class="ai-list">$1</ul>');

        // Newlines
        escaped = escaped.replace(/\n\n/g, '<br><br>');

        return escaped;
    }

    afterRender() {
        const btnClose = this.querySelector('.btn-close-ai');
        const btnClear = this.querySelector('.btn-clear-chat');
        const form = this.querySelector('#ai-input-form');
        const textarea = this.querySelector('.ai-input-textarea');

        if (btnClose) btnClose.addEventListener('click', () => this.close());
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this.messages = [];
                this._addWelcomeMessage();
            });
        }

        // Chip Clicks
        this.querySelectorAll('.ai-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const prompt = chip.getAttribute('data-prompt');
                if (prompt) this._handleSubmit(prompt);
            });
        });

        // Form Submit
        if (form && textarea) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const val = textarea.value.trim();
                if (val) {
                    textarea.value = '';
                    this._handleSubmit(val);
                }
            });

            // Enter sends, Shift+Enter new line
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    form.dispatchEvent(new Event('submit'));
                }
            });
        }

        // Apply Suggestions
        this.querySelectorAll('.btn-apply-sug').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const msgIdx = Number(btn.getAttribute('data-msg-idx'));
                const sIdx = Number(btn.getAttribute('data-sug-idx'));
                const msg = this.messages[msgIdx];
                if (msg && msg.commands) {
                    const suggestCmds = msg.commands.filter(c => c.action === 'suggest_patch');
                    const targetCmd = suggestCmds[sIdx];
                    if (targetCmd) {
                        aiAssistant.applySuggestion(targetCmd);
                        btn.textContent = '✅ Applied!';
                        btn.style.background = '#10b981';
                        btn.disabled = true;
                    }
                }
            });
        });

        // Inspection action chips
        this.querySelectorAll('.btn-ai-inspect-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                const chartId = btn.getAttribute('data-chart');
                const year = btn.getAttribute('data-year');

                if (action === 'inspect_chart') {
                    aiAssistant.executeUICommands([{ action: 'inspect_chart', chartId, year }]);
                } else if (action === 'focus_year') {
                    aiAssistant.executeUICommands([{ action: 'focus_year', year }]);
                }
            });
        });

        // Scroll to bottom of message thread
        const thread = this.querySelector('#ai-messages-thread');
        if (thread) {
            requestAnimationFrame(() => {
                thread.scrollTop = thread.scrollHeight;
            });
        }
    }

    async _handleSubmit(prompt) {
        if (!prompt || this.isLoading) return;

        this.messages.push({
            role: 'user',
            text: prompt,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        this.isLoading = true;
        this.render();

        try {
            const response = await aiAssistant.askQuestion(prompt);
            this.messages.push({
                role: 'assistant',
                text: response.prose,
                commands: response.commands || [],
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } catch (err) {
            let errorMsg = `⚠️ **Error generating advice:** ${err.message || 'Network request failed'}.`;
            if (err.code === 'INVALID_KEY') {
                errorMsg = `⚠️ **Invalid API Key.** Please verify your Google Gemini API key in **Settings (⚙️)**.`;
            } else if (err.code === 'QUOTA_EXCEEDED') {
                errorMsg = `⚠️ **Rate Limit Reached.** Please wait a few seconds or verify your quota on Google AI Studio.`;
            }
            this.messages.push({
                role: 'assistant',
                text: errorMsg,
                commands: [],
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } finally {
            this.isLoading = false;
            this.render();
        }
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('ai-advisor-drawer')) {
    customElements.define('ai-advisor-drawer', AIAdvisorDrawer);
}
