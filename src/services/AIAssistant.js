import { getGlobalSettings, getState, updateState } from './state.js';
import { deobfuscateData } from './encryption.js';
import { AI_SYSTEM_INSTRUCTION } from './ai/ai-system-prompt.js';
import { AIContextSerializer } from './ai/ai-context-serializer.js';
import { AIClient } from './ai/ai-client.js';
import { AICommandExecutor } from './ai/ai-command-executor.js';
import { AIDemoSimulator } from './ai/ai-demo-simulator.js';

/**
 * AIAssistant Service Coordinator
 * Orchestrates API communication, financial context serialization,
 * command parsing, interactive UI execution, and offline demo simulations.
 */
export class AIAssistant {
    constructor() {
        this.preferredModel = 'gemini-3.7-flash';
        this.latestSimData = null;
        this.latestStressAlerts = null;
    }

    /**
     * Updates the latest simulation and stress test results for context serialization.
     */
    updateSimulationContext(simData, stressAlerts) {
        this.latestSimData = simData;
        this.latestStressAlerts = stressAlerts;
    }

    _getApiKey() {
        const settings = getGlobalSettings();
        if (settings && settings.apiKey) {
            return deobfuscateData(settings.apiKey);
        }
        return null;
    }

    hasApiKey() {
        const key = this._getApiKey();
        return Boolean(key && key.trim().length > 0);
    }

    /**
     * Tests connectivity with a provided API key.
     */
    async testApiKey(apiKey) {
        return await AIClient.testKey(apiKey);
    }

    /**
     * Main query interface. Uses live Gemini API if key is present;
     * otherwise falls back to the built-in intelligent demo simulator.
     * 
     * @param {string} prompt - User request or prompt chip.
     * @param {boolean} forceDemo - Force offline demo mode.
     * @returns {Promise<{ prose: string, commands: Array, isDemo: boolean, modelUsed: string }>}
     */
    async askQuestion(prompt, forceDemo = false) {
        const apiKey = this._getApiKey();
        const state = getState();

        // If no API key configured or demo mode explicitly requested, run demo simulator
        if (!apiKey || forceDemo) {
            const demoResult = await AIDemoSimulator.simulateResponse(
                prompt,
                state,
                this.latestSimData,
                this.latestStressAlerts
            );

            // Execute non-patch UI commands automatically (e.g. chart hover, year sync)
            AICommandExecutor.executeUICommands(demoResult.commands);

            return {
                prose: demoResult.prose,
                commands: demoResult.commands || [],
                isDemo: true,
                modelUsed: 'Demo Mode (Offline Simulated CFP)'
            };
        }

        // Live Gemini API call
        const contextJson = AIContextSerializer.serialize(
            state,
            this.latestSimData,
            this.latestStressAlerts
        );

        const client = new AIClient(apiKey, this.preferredModel);
        const { text, modelUsed } = await client.generateContent(
            prompt,
            contextJson,
            AI_SYSTEM_INSTRUCTION
        );

        const { prose, commands } = AICommandExecutor.parseResponse(text);

        // Execute non-patch UI commands
        AICommandExecutor.executeUICommands(commands);

        return {
            prose,
            commands,
            isDemo: false,
            modelUsed
        };
    }

    /**
     * Executes UI highlighting and inspection commands.
     */
    executeUICommands(commands) {
        AICommandExecutor.executeUICommands(commands);
    }

    /**
     * Applies an AI-suggested parameter patch to state and triggers recalculation.
     * @param {Object} suggestCmd - { path: 'strategies.advancedRothStrategy.enabled', value: true }
     */
    applySuggestion(suggestCmd) {
        if (!suggestCmd || !suggestCmd.path) return;

        const path = suggestCmd.path;
        let value = suggestCmd.value;

        // Parse boolean / numeric string values if returned by model
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
            value = Number(value);
        }

        const state = getState();
        const parts = path.split('.');

        const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
        if (parts.some(p => FORBIDDEN_KEYS.has(p))) {
            console.warn('Blocked prototype pollution attempt in path:', path);
            return;
        }

        const ALLOWED_ROOT_BRANCHES = new Set([
            'assumptions',
            'primarySpouse',
            'secondarySpouse',
            'strategies',
            'phaseBasedExpensesPerMonth',
            'primaryResidenceMortgage',
            'primaryResidenceEquity',
            'dependents'
        ]);

        if (!ALLOWED_ROOT_BRANCHES.has(parts[0])) {
            console.warn('Blocked suggestion update outside of allowed state branches:', path);
            return;
        }

        let current = state;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = value;

        // Ensure sub-strategy objects are fully formed if enabling
        if (path.startsWith('strategies.advancedRothStrategy') && (!state.strategies.advancedRothStrategy || typeof state.strategies.advancedRothStrategy !== 'object')) {
            state.strategies.advancedRothStrategy = {
                enabled: true,
                targetBracket: '12',
                safetyMargin: 10000,
                startYear: new Date().getFullYear(),
                durationYears: 10,
                minConversion: 0,
                maxBracket: '24'
            };
        }

        updateState(state);

        // Notify application components to re-run simulations and re-render input panels and charts!
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('state-updated', { detail: { path, value } }));
        }

        // Re-highlight the patched input
        AICommandExecutor.executeUICommands([{ action: 'highlight_input', target: path.replace(/\./g, '-') + '-input' }]);
    }
}

export const aiAssistant = new AIAssistant();
