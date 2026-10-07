import { BaseComponent } from './base-component.js';
import { getGlobalSettings, updateGlobalSettings, getProfiles, getActiveProfileId, switchProfile, createProfile, renameProfile, deleteProfile, replaceProfileData, exportState } from '../services/state.js';
import { obfuscateData, deobfuscateData } from '../services/encryption.js';

import { escapeHtml } from '../utils/sanitize.js';
export { escapeHtml };

export class SettingsModal extends BaseComponent {
    constructor() {
        super();
    }
    
    getTemplate() {
        return `
            <div id="settings-modal" class="drawer-overlay hidden" style="align-items: center; justify-content: center; z-index: 9999;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 400px; max-width: 90vw;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h2 style="margin: 0;">Settings</h2>
                        <button class="btn-close-settings btn-close" style="font-size: 1.5rem;">&times;</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 1rem;">
                        <button class="btn-export btn btn-secondary" style="width: 100%;">Export Current Profile (JSON)</button>
                        <button class="btn-import btn btn-secondary" style="width: 100%;">Import Profile (JSON File)</button>
                        <input type="file" class="file-import" style="display: none;" accept=".json">

                        <hr style="border-color: rgba(255,255,255,0.1); margin: 1rem 0;">

                        
                        <div>
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Google Gemini AI Settings</label>
                            
                            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 0.85rem; margin-bottom: 0.75rem;">
                                <div style="font-size: 0.85rem; font-weight: 600; color: #93c5fd; margin-bottom: 0.4rem;">🔑 How to get a free Gemini API Key:</div>
                                <ol style="font-size: 0.8rem; line-height: 1.5; padding-left: 1.2rem; color: #cbd5e1; margin-bottom: 0.6rem;">
                                    <li>Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline;">Google AI Studio (aistudio.google.com)</a>.</li>
                                    <li>Click <strong>"Create API Key"</strong> (Free Tier with generous limits available).</li>
                                    <li>Copy your key and paste it into the field below.</li>
                                </ol>
                                <div style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">
                                    🔒 <strong>Privacy:</strong> Keys are obfuscated in your browser's local storage and sent exclusively to Google's Generative AI endpoint.
                                </div>
                            </div>

                            <input type="password" class="gemini-api-key" placeholder="Paste your Gemini API key (AIzaSy...)" style="width: 100%; padding: 0.6rem 0.8rem; border-radius: 0.4rem; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.5); color: white; margin-bottom: 0.5rem;">
                            
                            <div style="display: flex; gap: 0.5rem;">
                                <button type="button" class="btn-save-api-key btn btn-primary" style="flex: 1;">Save Key</button>
                                <button type="button" class="btn-test-api-key btn btn-secondary" style="flex: 1;">Test Connection</button>
                            </div>
                            <div class="api-key-test-status" style="font-size: 0.8rem; margin-top: 0.5rem; display: none; line-height: 1.3;"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender() {
        const modal = this.querySelector('.drawer-overlay');
        const btnClose = this.querySelector('.btn-close-settings');
        const btnExport = this.querySelector('.btn-export');
        const btnImport = this.querySelector('.btn-import');
        const fileImport = this.querySelector('.file-import');
        const btnSaveKey = this.querySelector('.btn-save-api-key');
        const btnTestKey = this.querySelector('.btn-test-api-key');
        const keyInput = this.querySelector('.gemini-api-key');
        const testStatus = this.querySelector('.api-key-test-status');

        btnClose.addEventListener('click', () => this.close());
        
        btnExport.addEventListener('click', () => {
            exportState();
        });

        btnImport.addEventListener('click', () => fileImport.click());



        fileImport.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.dispatchEvent(new CustomEvent('import-ready', { 
                        detail: { data, filename: file.name },
                        bubbles: true,
                        composed: true
                    }));
                    e.target.value = '';
                    this.close();
                } catch (err) {
                    alert("Failed to parse the imported JSON file.");
                }
            };
            reader.readAsText(file);
        });

        btnSaveKey.addEventListener('click', () => {
            const key = keyInput.value.trim();
            const obfuscated = obfuscateData(key);
            updateGlobalSettings({ apiKey: obfuscated });
            
            btnSaveKey.textContent = 'Saved!';
            setTimeout(() => {
                btnSaveKey.textContent = 'Save Key';
            }, 1500);
        });

        btnTestKey.addEventListener('click', async () => {
            const key = keyInput.value.trim();
            if (!key) {
                testStatus.style.display = 'block';
                testStatus.style.color = '#fdcb6e';
                testStatus.textContent = '⚠️ Please enter an API key first.';
                return;
            }

            testStatus.style.display = 'block';
            testStatus.style.color = '#74b9ff';
            testStatus.textContent = '⏳ Testing connection to Google AI Studio...';
            btnTestKey.disabled = true;

            try {
                const { AIClient } = await import('../services/ai/ai-client.js');
                const result = await AIClient.testKey(key);
                if (result.success) {
                    testStatus.style.color = '#00b894';
                    testStatus.textContent = `✅ ${result.message}`;
                } else {
                    testStatus.style.color = '#ff7675';
                    testStatus.textContent = `❌ ${result.message}`;
                }
            } catch (err) {
                testStatus.style.color = '#ff7675';
                testStatus.textContent = `❌ Error: ${err.message}`;
            } finally {
                btnTestKey.disabled = false;
            }
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
    }

    open() {
        const modal = this.querySelector('.drawer-overlay');
        modal.classList.remove('hidden');
        const settings = getGlobalSettings();
        if (settings && settings.apiKey) {
            this.querySelector('.gemini-api-key').value = deobfuscateData(settings.apiKey);
        }
    }

    close() {
        this.querySelector('.drawer-overlay').classList.add('hidden');
    }
}

export class ProfileManagerModal extends BaseComponent {
    constructor() {
        super();
        this.mode = 'add'; // 'add', 'rename', 'delete', 'import'
        this.importData = null;
    }

    getTemplate() {
        return `
            <div id="add-profile-modal" class="drawer-overlay hidden" style="align-items: center; justify-content: center; z-index: 9999;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 400px; max-width: 90vw;">
                    <h2 style="margin-top: 0;">Add New Profile</h2>
                    <div class="input-group">
                        <label>Profile Name</label>
                        <input type="text" id="add-profile-name" placeholder="E.g. Coast Fire Scenario">
                    </div>
                    <div class="checkbox-group" style="margin: 1rem 0;">
                        <input type="checkbox" id="add-profile-clone" checked>
                        <label>Clone current active profile</label>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button id="btn-add-profile-cancel" class="btn btn-secondary" style="flex: 1;">Cancel</button>
                        <button id="btn-add-profile-confirm" class="btn btn-primary" style="flex: 1;">Create</button>
                    </div>

                    <hr style="border-color: rgba(255,255,255,0.1); margin: 1.5rem 0 1rem 0;">
                    <div>
                        <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: var(--text-muted); font-weight: 600;">Or Start from a Built-in Sample Preset</label>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <button type="button" class="btn-load-sample-preset btn btn-secondary" data-file="Sample_FamilyScenario.json" data-default-name="Sample Household (Family of 4)" style="width: 100%; font-size: 0.85rem; text-align: left; padding: 0.6rem 0.8rem;">
                                👨‍👩‍👧‍👦 Family of 4 ($180k, Age 45/41, $1.5M at 52)
                            </button>
                            <button type="button" class="btn-load-sample-preset btn btn-secondary" data-file="Sample_BaseCase.json" data-default-name="Standard Retirement (Sample)" style="width: 100%; font-size: 0.85rem; text-align: left; padding: 0.6rem 0.8rem;">
                                📊 Standard Retirement (Sample)
                            </button>
                            <button type="button" class="btn-load-sample-preset btn btn-secondary" data-file="Sample_EarlyRetirement.json" data-default-name="Early Retirement / Barista FIRE (Sample)" style="width: 100%; font-size: 0.85rem; text-align: left; padding: 0.6rem 0.8rem;">
                                ☕ Early Retirement / Barista FIRE (Sample)
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="rename-profile-modal" class="drawer-overlay hidden" style="align-items: center; justify-content: center; z-index: 9999;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 400px; max-width: 90vw;">
                    <h2 style="margin-top: 0;">Rename Profile</h2>
                    <div class="input-group">
                        <label>Profile Name</label>
                        <input type="text" id="rename-profile-name">
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button id="btn-rename-profile-cancel" class="btn btn-secondary" style="flex: 1;">Cancel</button>
                        <button id="btn-rename-profile-confirm" class="btn btn-primary" style="flex: 1;">Rename</button>
                    </div>
                </div>
            </div>

            <div id="delete-profile-modal" class="drawer-overlay hidden" style="align-items: center; justify-content: center; z-index: 9999;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 400px; max-width: 90vw; border: 1px solid var(--error);">
                    <h2 style="margin-top: 0; color: var(--error);">Delete Profile</h2>
                    <p>Are you sure you want to delete <strong id="delete-profile-target-name"></strong>? This cannot be undone.</p>
                    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button id="btn-delete-profile-cancel" class="btn btn-secondary" style="flex: 1;">Cancel</button>
                        <button id="btn-delete-profile-confirm" class="btn btn-primary" style="flex: 1; background: var(--error);">Delete</button>
                    </div>
                </div>
            </div>

            <div id="import-profile-modal" class="drawer-overlay hidden" style="align-items: center; justify-content: center; z-index: 9999;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 400px; max-width: 90vw;">
                    <h2 style="margin-top: 0;">Import Profile</h2>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">How would you like to import this JSON data?</p>
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="radio" name="import-mode" value="new" checked>
                            <span>Import as New Profile</span>
                        </label>
                        <div class="input-group" id="import-new-name-group" style="padding-left: 1.5rem;">
                            <input type="text" id="import-new-name" placeholder="Profile Name">
                        </div>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin-top: 0.5rem;">
                            <input type="radio" name="import-mode" value="replace">
                            <span>Replace Existing Profile</span>
                        </label>
                        <div class="input-group" id="import-replace-group" style="padding-left: 1.5rem; display: none;">
                            <select id="import-replace-select"></select>
                        </div>
                    </div>
                    <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                        <button id="btn-import-profile-cancel" class="btn btn-secondary" style="flex: 1;">Cancel</button>
                        <button id="btn-import-profile-confirm" class="btn btn-primary" style="flex: 1;">Import</button>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender() {
        // Add Profile
        this.querySelector('#btn-add-profile-cancel').addEventListener('click', () => this.closeAll());
        this.querySelector('#btn-add-profile-confirm').addEventListener('click', () => {
            const name = this.querySelector('#add-profile-name').value.trim() || 'New Profile';
            const clone = this.querySelector('#add-profile-clone').checked;
            switchProfile(createProfile(name, clone));
            this.dispatchUpdate();
            this.closeAll();
        });

        // Built-in Sample Presets
        this.querySelectorAll('.btn-load-sample-preset').forEach(btn => {
            btn.addEventListener('click', async () => {
                const file = btn.getAttribute('data-file');
                const defaultName = btn.getAttribute('data-default-name') || 'Sample Profile';
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    // Fetch API documentation: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
                    const res = await fetch(`./Scenarios/${file}`, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                    const data = await res.json();
                    const newProfileId = createProfile(defaultName, false);
                    replaceProfileData(newProfileId, data);
                    switchProfile(newProfileId);
                    this.dispatchUpdate();
                    this.closeAll();
                } catch (err) {
                    console.error(`Failed to load sample preset ${file}:`, err);
                    alert(`Failed to load sample preset: ${file}`);
                }
            });
        });

        // Rename Profile
        this.querySelector('#btn-rename-profile-cancel').addEventListener('click', () => this.closeAll());
        this.querySelector('#btn-rename-profile-confirm').addEventListener('click', () => {
            const newName = this.querySelector('#rename-profile-name').value.trim() || 'Unnamed Profile';
            renameProfile(getActiveProfileId(), newName);
            this.dispatchUpdate();
            this.closeAll();
        });

        // Delete Profile
        this.querySelector('#btn-delete-profile-cancel').addEventListener('click', () => this.closeAll());
        this.querySelector('#btn-delete-profile-confirm').addEventListener('click', () => {
            const profiles = getProfiles();
            if (profiles.length <= 1) {
                alert('Cannot delete the only remaining profile.');
                this.closeAll();
                return;
            }
            deleteProfile(getActiveProfileId());
            this.dispatchUpdate();
            this.closeAll();
        });

        // Import Profile Radio Toggle
        this.querySelectorAll('input[name="import-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'new') {
                    this.querySelector('#import-new-name-group').style.display = 'block';
                    this.querySelector('#import-replace-group').style.display = 'none';
                } else {
                    this.querySelector('#import-new-name-group').style.display = 'none';
                    this.querySelector('#import-replace-group').style.display = 'block';
                }
            });
        });

        // Import Confirm
        this.querySelector('#btn-import-profile-cancel').addEventListener('click', () => this.closeAll());
        this.querySelector('#btn-import-profile-confirm').addEventListener('click', () => {
            if (!this.importData) return;
            const mode = this.querySelector('input[name="import-mode"]:checked').value;
            if (mode === 'new') {
                const name = this.querySelector('#import-new-name').value.trim() || 'Imported Profile';
                const newId = createProfile(name, false);
                replaceProfileData(newId, this.importData);
                switchProfile(newId);
            } else {
                const targetId = this.querySelector('#import-replace-select').value;
                replaceProfileData(targetId, this.importData);
                if (targetId === getActiveProfileId()) switchProfile(targetId);
            }
            this.importData = null;
            this.dispatchUpdate();
            this.closeAll();
        });

        this.querySelectorAll('.drawer-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeAll();
            });
        });
    }


    dispatchUpdate() {
        this.dispatchEvent(new CustomEvent('profile-updated', { bubbles: true, composed: true }));
    }

    closeAll() {
        this.querySelectorAll('.drawer-overlay').forEach(el => el.classList.add('hidden'));
    }

    openAdd() {
        this.closeAll();
        this.querySelector('#add-profile-name').value = '';
        this.querySelector('#add-profile-clone').checked = true;
        this.querySelector('#add-profile-modal').classList.remove('hidden');
    }

    openRename() {
        this.closeAll();
        const activeId = getActiveProfileId();
        const activeName = getProfiles().find(p => p.id === activeId).name;
        this.querySelector('#rename-profile-name').value = activeName;
        this.querySelector('#rename-profile-modal').classList.remove('hidden');
    }

    openDelete() {
        if (getProfiles().length <= 1) {
            alert('Cannot delete the only profile.');
            return;
        }
        this.closeAll();
        const activeId = getActiveProfileId();
        const activeProfile = getProfiles().find(p => p.id === activeId);
        const activeName = activeProfile ? activeProfile.name : 'Current Profile';
        this.querySelector('#delete-profile-target-name').textContent = escapeHtml(activeName);
        this.querySelector('#delete-profile-modal').classList.remove('hidden');
    }

    openImport(data, defaultName) {
        this.closeAll();
        this.importData = data;
        const select = this.querySelector('#import-replace-select');
        select.innerHTML = ''; // Safe because it's generating internal IDs/Names, but let's use safe DOM
        
        getProfiles().forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            if (p.id === getActiveProfileId()) option.selected = true;
            select.appendChild(option);
        });

        this.querySelector('#import-new-name').value = defaultName.replace('.json', '');
        this.querySelector('#import-profile-modal').classList.remove('hidden');
    }
}

export class CostBasisModal extends BaseComponent {
    constructor() {
        super();
    }

    getTemplate() {
        return `
            <div id="cost-basis-modal" class="drawer-overlay hidden" style="align-items: center; justify-content: center; z-index: 9999;">
                <div class="glass-panel" style="padding: 2rem; border-radius: 1rem; width: 640px; max-width: 92vw; max-height: 85vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.75rem;">
                        <h2 style="margin: 0; font-size: 1.25rem; display: flex; align-items: center; gap: 0.5rem;">
                            <span>📈</span> Understanding & Finding Your Cost Basis
                        </h2>
                        <button class="btn-close-cost-basis btn-close" style="font-size: 1.5rem; background: none; border: none; cursor: pointer; color: var(--text-color);">&times;</button>
                    </div>

                    <div style="font-size: 0.9rem; line-height: 1.6; color: var(--text-color);">
                        <p style="margin-top: 0;">
                            <strong>What is Cost Basis?</strong><br>
                            Your cost basis is the total original after-tax dollars invested into your taxable brokerage account—including original share purchases, commissions, and all reinvested dividends.
                        </p>

                        <div style="background: rgba(46, 204, 113, 0.1); border-left: 4px solid var(--success); padding: 0.75rem 1rem; border-radius: 4px; margin: 1rem 0;">
                            <strong>💡 Why it matters in retirement:</strong><br>
                            When you liquidate brokerage shares to fund living expenses, the IRS treats withdrawals as a mix of <strong>Return of Capital (Cost Basis)</strong> and <strong>Capital Gains</strong>.
                            Return of basis is <strong>100% tax-free</strong>. You only pay capital gains tax on the growth portion!
                        </div>

                        <h3 style="font-size: 1rem; margin: 1.25rem 0 0.5rem; color: var(--accent);">📄 Finding It on IRS Form 1099-B</h3>
                        <p style="margin: 0.25rem 0;">
                            At tax time, your brokerage issues <strong>Form 1099-B</strong> (Proceeds from Broker and Barter Exchange Transactions):
                        </p>
                        <ul style="margin: 0.5rem 0 1rem 1.25rem; padding: 0;">
                            <li><strong>Box 1d:</strong> Proceeds (gross sales price)</li>
                            <li><strong>Box 1e:</strong> <em>Cost or other basis</em> (your total basis in the liquidated shares)</li>
                            <li>Your net taxable capital gain is <code>Box 1d - Box 1e</code>.</li>
                        </ul>

                        <h3 style="font-size: 1rem; margin: 1.25rem 0 0.5rem; color: var(--accent);">🏦 Locating It at Your Brokerage (Online)</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                                <strong>Vanguard</strong><br>
                                <span style="font-size: 0.82rem; color: var(--text-muted);">Holdings ➔ Click "Cost Basis" tab ➔ See "Total Cost Basis".</span>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                                <strong>Fidelity</strong><br>
                                <span style="font-size: 0.82rem; color: var(--text-muted);">Positions tab ➔ Change view to "Cost Basis" ➔ Check "Total Cost Basis".</span>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                                <strong>Charles Schwab</strong><br>
                                <span style="font-size: 0.82rem; color: var(--text-muted);">Accounts ➔ Positions ➔ View "Cost Basis" column or Unrealized Gain/Loss.</span>
                            </div>
                            <div style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
                                <strong>E*TRADE / Morgan Stanley</strong><br>
                                <span style="font-size: 0.82rem; color: var(--text-muted);">Portfolios ➔ Gain/Loss tab ➔ Review "Total Cost Basis".</span>
                            </div>
                        </div>

                        <h3 style="font-size: 1rem; margin: 1.25rem 0 0.5rem; color: var(--accent);">⚖️ What if I don't know my exact basis?</h3>
                        <ul style="margin: 0.25rem 0 1rem 1.25rem; padding: 0;">
                            <li><strong>Rule of thumb (50% of Balance):</strong> For typical diversified index portfolios held over 10–20 years with steady compounding, basis is roughly 50% of current balance.</li>
                            <li><strong>Recent Cash Deposits (100% of Balance):</strong> If you recently deposited cash or sold real estate, your basis is 100% of that cash amount.</li>
                            <li><strong>Inherited Assets (Stepped-Up Basis):</strong> Under IRC § 1014, inherited assets receive a step-up in basis to fair market value on the date of death.</li>
                        </ul>

                        <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
                            <button class="btn-close-cost-basis btn btn-primary" style="padding: 0.5rem 1.5rem;">Got it</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    afterRender() {
        this.querySelectorAll('.btn-close-cost-basis').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });
        const modal = this.querySelector('#cost-basis-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }
    }

    open() {
        const modal = this.querySelector('#cost-basis-modal');
        if (modal) modal.classList.remove('hidden');
    }

    close() {
        const modal = this.querySelector('#cost-basis-modal');
        if (modal) modal.classList.add('hidden');
    }
}

if (typeof customElements !== 'undefined') {
    if (!customElements.get('profile-manager-modal')) customElements.define('profile-manager-modal', ProfileManagerModal);
    if (!customElements.get('settings-modal')) customElements.define('settings-modal', SettingsModal);
    if (!customElements.get('cost-basis-modal')) customElements.define('cost-basis-modal', CostBasisModal);
}
