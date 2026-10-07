/**
 * AI Command Parser & Action Dispatcher
 * 
 * Extracts structured UI action commands from model responses and executes
 * live DOM highlighting, chart inspection, timeline synchronization, and parameter patches.
 */

import { highlightChartPoint } from '../../components/charts.js';

export class AICommandExecutor {
    /**
     * Parses the raw model output into clean markdown prose and an array of action commands.
     * @param {string} rawText - Output from Gemini model.
     * @returns {{ prose: string, commands: Array }}
     */
    static parseResponse(rawText) {
        if (!rawText) return { prose: '', commands: [] };

        let commands = [];
        let cleanProse = rawText;

        // Match ```json ... ``` blocks containing "commands"
        const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?"commands"\s*:[\s\S]*?\})\s*```/i;
        const match = rawText.match(jsonBlockRegex);

        if (match && match[1]) {
            try {
                const parsed = JSON.parse(match[1]);
                if (Array.isArray(parsed.commands)) {
                    commands = parsed.commands;
                }
                // Strip the code block from the user-facing prose
                cleanProse = rawText.replace(match[0], '').trim();
            } catch (err) {
                console.warn('Failed to parse AI command JSON block:', err);
            }
        }

        // Heuristic intent extraction: Ensure user always gets action cards if recommended in prose
        const hasRothPatch = commands.some(c => c.action === 'suggest_patch' && c.path && c.path.includes('advancedRoth'));
        if (!hasRothPatch && /advanced roth|roth conversion strategy|roth ladder/i.test(cleanProse) && /enable|recommend|consider|suggest/i.test(cleanProse)) {
            commands.push({
                action: 'suggest_patch',
                label: 'Enable Advanced Roth Strategy (12% Target)',
                path: 'strategies.advancedRothStrategy.enabled',
                value: true
            });
        }

        const has72tPatch = commands.some(c => c.action === 'suggest_patch' && c.path && c.path.includes('rule72t'));
        if (!has72tPatch && /72\(t\)|sepp/i.test(cleanProse) && /enable|recommend|consider|suggest/i.test(cleanProse)) {
            commands.push({
                action: 'suggest_patch',
                label: 'Enable Rule 72(t) SEPP Early Distributions',
                path: 'primarySpouse.rule72t.enabled',
                value: true
            });
        }

        const hasShiftPatch = commands.some(c => c.action === 'suggest_patch' && c.path && c.path.includes('conservativeShift'));
        if (!hasShiftPatch && /conservative shift|glide path|bond shift/i.test(cleanProse) && /enable|recommend|consider|suggest/i.test(cleanProse)) {
            commands.push({
                action: 'suggest_patch',
                label: 'Enable Conservative Shift (Bond Glide Path)',
                path: 'assumptions.conservativeShift.enabled',
                value: true
            });
        }

        return { prose: cleanProse, commands };
    }

    /**
     * Executes non-patch UI commands (focus_year, inspect_chart, highlight_detail, highlight_input).
     * @param {Array} commands - Array of command objects.
     */
    static executeUICommands(commands) {
        if (!Array.isArray(commands)) return;

        commands.forEach(cmd => {
            if (!cmd || !cmd.action) return;

            switch (cmd.action) {
                case 'focus_year':
                    this._focusYear(cmd.year);
                    break;
                case 'inspect_chart':
                    this._inspectChart(cmd.chartId, cmd.year);
                    break;
                case 'highlight_detail':
                case 'highlight_input':
                case 'highlight':
                    this._highlightElement(cmd.target);
                    break;
                default:
                    break;
            }
        });
    }

    static _focusYear(year) {
        if (!year || typeof document === 'undefined') return;
        const select = document.getElementById('focus-year-select');
        if (!select) return;

        const targetYearStr = String(year).trim();
        let targetValue = null;

        for (let i = 0; i < select.options.length; i++) {
            const opt = select.options[i];
            // Matches "2030 (Age 49 / 51)" or exact value
            if (opt.text.startsWith(targetYearStr) || opt.value === targetYearStr) {
                targetValue = opt.value;
                break;
            }
        }

        if (targetValue !== null) {
            select.value = targetValue;
            select.dispatchEvent(new Event('change', { bubbles: true }));

            // Also inspect chart point on portfolioChart
            this._inspectChart('chart1', targetYearStr);

            // Scroll focus year selector into view with high-visibility highlight pulse!
            const container = select.closest('div');
            if (container) {
                container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                container.classList.remove('ai-highlight-pulse');
                void container.offsetWidth;
                container.classList.add('ai-highlight-pulse');
                setTimeout(() => container.classList.remove('ai-highlight-pulse'), 5000);
            }
        }
    }

    static _inspectChart(chartId, year) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return;
        // Trigger chart focus helper if available
        if (typeof highlightChartPoint === 'function') {
            highlightChartPoint(chartId, year);
        } else if (typeof window.highlightChartPoint === 'function') {
            window.highlightChartPoint(chartId, year);
        } else {
            // Scroll chart into view
            const chartCanvas = document.getElementById(chartId) || document.querySelector(`canvas[data-chart-id="${chartId}"]`);
            if (chartCanvas) {
                chartCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    static _highlightElement(targetKey) {
        if (!targetKey || typeof document === 'undefined') return;
        const element = document.querySelector(`[data-ai-target="${targetKey}"]`) || document.getElementById(targetKey);
        if (!element) return;

        element.classList.remove('ai-highlight-pulse');
        // Force reflow
        void element.offsetWidth;
        element.classList.add('ai-highlight-pulse');

        if (typeof element.scrollIntoView === 'function') {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Auto remove after 6 seconds
        setTimeout(() => {
            if (element && element.classList) {
                element.classList.remove('ai-highlight-pulse');
            }
        }, 6000);
    }
}
