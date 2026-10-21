/**
 * Primary Chart Orchestrator & Interactive Tooltip Controller
 * Coordinates Chart.js instances, floating inspector docking, and focus-year highlighting.
 * Dataset configurations and HTML inspector templates are modularized under ./charts/.
 */

import { escapeHtml } from '../utils/sanitize.js';
import {
    renderJobBreakoutRows,
    renderInflowSection,
    renderOutflowSection,
    renderSurplusSection,
    renderAdditionsSection,
    renderTaxSection,
    renderActivitySection,
    renderCashflowInspector,
    renderGenericInspector
} from './charts/chart-inspectors.js';
import {
    setDefaultTooltipHandler,
    mapData,
    handleChartClick,
    generateAnnotationsConfig,
    buildPortfolioConfig,
    buildIncomeConfig,
    buildCashflowConfig,
    buildNetWorthConfig,
    buildTaxConfig,
    buildSorrConfig,
    resolveThemeDatasetColor,
    hexToRgba
} from './charts/chart-configs.js';
import { renderPortfolioOption1CHeader, renderIncomePillHeader } from './charts/chart-stage-header.js';
import { renderTaxSteeringCockpit, renderTaxStrategyInspector } from './charts/tax-steering-cockpit.js';

let portfolioChart = null;
let incomeChart = null;
let cashflowChart = null;
let taxChart = null;
let netWorthChart = null;
let sorrChart = null;

export {
    portfolioChart,
    incomeChart,
    cashflowChart,
    taxChart,
    netWorthChart,
    sorrChart,
    renderJobBreakoutRows,
    renderInflowSection,
    renderOutflowSection,
    renderSurplusSection,
    renderAdditionsSection,
    renderTaxSection,
    renderActivitySection,
    renderCashflowInspector,
    renderGenericInspector,
    mapData,
    handleChartClick,
    generateAnnotationsConfig,
    buildPortfolioConfig,
    buildIncomeConfig,
    buildCashflowConfig,
    buildNetWorthConfig,
    buildTaxConfig,
    buildSorrConfig
};

function resolveChartColorsForTheme(effectiveTheme) {
    if (effectiveTheme === 'broadsheet') {
        return { tickColor: '#666059', gridColor: 'rgba(0, 0, 0, 0.08)', textColor: '#1a1a1a' };
    }
    if (effectiveTheme === 'matcha') {
        return { tickColor: '#4f634f', gridColor: 'rgba(0, 0, 0, 0.08)', textColor: '#1b3820' };
    }
    if (effectiveTheme === 'terminal') {
        return { tickColor: '#94a3b8', gridColor: 'rgba(255, 255, 255, 0.08)', textColor: '#f8fafc' };
    }
    return { tickColor: '#b2bec3', gridColor: 'rgba(255, 255, 255, 0.08)', textColor: '#f8fafc' };
}

function updateScaleTheme(scale, colors) {
    if (!scale) return;
    if (scale.ticks) scale.ticks.color = colors.tickColor;
    if (scale.grid) scale.grid.color = colors.gridColor;
    if (scale.title?.display) scale.title.color = colors.textColor;
}

function updateDatasetTheme(ds, effectiveTheme) {
    if (!ds) return;
    const newColor = resolveThemeDatasetColor(ds.label, ds.borderColor || ds.backgroundColor, effectiveTheme);
    ds.borderColor = newColor;
    if (ds.backgroundColor && typeof ds.backgroundColor === 'string') {
        if (ds.backgroundColor.startsWith('rgba') || ds.backgroundColor.startsWith('rgb')) {
            ds.backgroundColor = hexToRgba(newColor, 0.2);
        } else {
            ds.backgroundColor = newColor;
        }
    }
}

function updateChartInstanceTheme(chart, colors, effectiveTheme) {
    if (!chart?.options) return;
    if (chart.options.scales) {
        Object.values(chart.options.scales).forEach((scale) => updateScaleTheme(scale, colors));
    }
    if (chart.options.plugins?.legend?.labels) {
        chart.options.plugins.legend.labels.color = colors.textColor;
    }
    if (chart.data?.datasets) {
        chart.data.datasets.forEach((ds) => updateDatasetTheme(ds, effectiveTheme));
    }
    try {
        chart.update('none');
    } catch {
        // Safe fallback if canvas is transitioning
    }
}

function refreshOption1CHeaderPills(effectiveTheme) {
    if (typeof document === 'undefined') return;
    const opt1cHeader = document.getElementById('portfolio-option1c-header');
    if (!opt1cHeader) return;
    const pills = opt1cHeader.querySelectorAll('.opt1c-sub-pill');
    pills.forEach((p) => {
        const fullLabel =
            p.getAttribute('data-full-label') || p.querySelector('.opt1c-pill-name')?.textContent?.trim() || '';
        const color = resolveThemeDatasetColor(fullLabel, '#3b82f6', effectiveTheme);
        p.style.setProperty('--pill-color', color);
        const dot = p.querySelector('.opt1c-dot');
        if (p.classList.contains('active')) {
            p.style.borderColor = color;
            if (dot) dot.style.backgroundColor = color;
        } else {
            p.style.borderColor = 'var(--border)';
            if (dot) dot.style.backgroundColor = 'var(--text-muted)';
        }
    });
}

/**
 * Synchronizes Chart.js defaults and active chart scales with the active theme.
 * @param {string} effectiveTheme - 'slate' | 'terminal' | 'broadsheet' | 'matcha'
 */
export function applyChartTheme(effectiveTheme = 'slate') {
    const colors = resolveChartColorsForTheme(effectiveTheme);

    if (typeof window !== 'undefined' && window.Chart) {
        window.Chart.defaults.color = colors.tickColor;
        window.Chart.defaults.borderColor = colors.gridColor;
    }

    const charts = [portfolioChart, incomeChart, cashflowChart, taxChart, netWorthChart, sorrChart];
    charts.forEach((chart) => updateChartInstanceTheme(chart, colors, effectiveTheme));
    refreshOption1CHeaderPills(effectiveTheme);
}

// Configure global Chart.js settings for more prominent hover highlights
// Reference: https://github.com/chartjs/Chart.js/releases/tag/v4.4.7
if (typeof window !== 'undefined' && window.Chart) {
    window.Chart.defaults.elements.bar.hoverBorderWidth = 3;
    window.Chart.defaults.elements.bar.hoverBorderColor = '#fff';
    window.Chart.defaults.elements.line.hoverBorderWidth = 5;
}

export let pinnedYearIndex = null;

function resolveCockpitTargetYearIndex(yearlyData, state, overrideIndex) {
    if (overrideIndex !== null && overrideIndex !== undefined && yearlyData[overrideIndex]) {
        return overrideIndex;
    }
    const activePin = pinnedYearIndex ?? (typeof window !== 'undefined' ? window.pinnedYearIndex : null);
    if (activePin !== null && activePin !== undefined && yearlyData[activePin]) {
        return activePin;
    }
    const retAge = Number(state?.primarySpouse?.targetRetirementAge) || 60;
    const retIdx = yearlyData.findIndex((snap) => Number(snap.age1) === retAge);
    return retIdx !== -1 ? retIdx : 0;
}

export function updateTaxSteeringCockpitDom(yearlyData, state, overrideIndex = null) {
    if (typeof document === 'undefined' || !Array.isArray(yearlyData) || yearlyData.length === 0) return;
    const container = document.getElementById('tax-steering-cockpit');
    if (!container) return;

    const targetIdx = resolveCockpitTargetYearIndex(yearlyData, state, overrideIndex);
    const snap = yearlyData[targetIdx] || yearlyData[0];
    container.innerHTML = renderTaxSteeringCockpit(snap, state, targetIdx);
}

/**
 * Updates the active pinned year index for synchronized chart inspection.
 * @param {number|null} index
 */
export function setPinnedYearIndex(index) {
    pinnedYearIndex = index;
    if (typeof window !== 'undefined') window.pinnedYearIndex = index;
    const refChart = cashflowChart || taxChart || portfolioChart;
    if (refChart?.customData) {
        updateTaxSteeringCockpitDom(refChart.customData, refChart.customState, index);
    }
}

/**
 * Returns the currently pinned year index.
 * @returns {number|null}
 */
export function getPinnedYearIndex() {
    return pinnedYearIndex;
}

if (typeof window !== 'undefined') {
    window.pinnedYearIndex = null;
}

function isInspectorModeEnabled() {
    if (typeof document === 'undefined') return false;
    if (document.body?.classList.contains('inspector-disabled')) return false;
    return Boolean(
        document.body?.classList.contains('show-inspector') ||
            document.querySelector('.dashboard-layout')?.classList.contains('show-inspector') ||
            true
    );
}

function checkFinancialDetailsOpen() {
    const finDetailsDrawer = typeof document !== 'undefined' && document.getElementById('financial-details-drawer');
    return Boolean(finDetailsDrawer && finDetailsDrawer.classList.contains('modal-fullscreen-lock'));
}

function positionInspectorHud(inspector, chart, tooltip) {
    if (typeof window === 'undefined' || !chart.canvas) return;
    const canvasRect = chart.canvas.getBoundingClientRect();
    const caretScreenX = canvasRect.left + (tooltip.caretX || 0);
    const isLeftSide = caretScreenX < window.innerWidth / 2;

    inspector.classList.toggle('dock-left', !isLeftSide);
    inspector.classList.toggle('dock-right', isLeftSide);
    inspector.style.zIndex = '9999';
    inspector.style.pointerEvents = 'none';

    const minTop = Math.max(16, Math.round(canvasRect.top + 8));
    const maxTop = Math.max(minTop, window.innerHeight - 150);
    const targetTop = Math.max(minTop, Math.min(maxTop, canvasRect.top));
    inspector.style.top = `${targetTop}px`;
    inspector.style.maxHeight = `calc(100vh - ${targetTop + 16}px)`;
}

function updateInspectorYearHeader(tooltip, snap, state) {
    const titleLines = tooltip.title || [];
    const yearLabel = document.getElementById('inspector-year');
    if (!yearLabel || titleLines.length === 0) return;

    if (snap && state) {
        const hasS2 = Boolean(state.secondarySpouse?.name && snap.age2 && snap.age2 > 0);
        yearLabel.textContent = hasS2
            ? `Year ${titleLines[0]} (${state.primarySpouse?.name || 'Primary'}: ${snap.age1}, ${state.secondarySpouse.name}: ${snap.age2})`
            : `Year ${titleLines[0]} (${state.primarySpouse?.name || 'Primary'}: ${snap.age1})`;
    } else {
        yearLabel.textContent = 'Year ' + titleLines[0];
    }
}

function resolveHoveredSnapshot(chart, tooltip) {
    if (!chart.customData || !tooltip.dataPoints || tooltip.dataPoints.length === 0) {
        return null;
    }
    return chart.customData[tooltip.dataPoints[0].dataIndex];
}

const externalTooltipHandler = (context) => {
    const { chart, tooltip } = context;
    const inspector = document.getElementById('chart-inspector');
    if (!inspector) return;

    if (!isInspectorModeEnabled() || tooltip.opacity === 0) {
        inspector.classList.add('hidden');
        return;
    }

    // Suppress chart inspector tooltip when the detailed financial snapshot / focus-year drawer is open
    const isFinDetailsOpen = checkFinancialDetailsOpen();
    if (isFinDetailsOpen) {
        inspector.classList.add('hidden');
        return;
    }

    positionInspectorHud(inspector, chart, tooltip);
    inspector.classList.remove('hidden');

    if (!tooltip.body) return;

    const snap = resolveHoveredSnapshot(chart, tooltip);
    const state = chart.customState;
    updateInspectorYearHeader(tooltip, snap, state);

    const content = document.getElementById('inspector-content');
    const points = tooltip.dataPoints.map((dataPoint, idx) => ({
        dp: dataPoint,
        colors: tooltip.labelColors[idx]
    }));
    points.sort((pointA, pointB) => pointB.dp.raw - pointA.dp.raw);

    if ((chart.canvas.id === 'cashflowChart' || chart.canvas.id === 'taxChart') && chart.customData && snap) {
        const hoveredIdx = tooltip.dataPoints[0]?.dataIndex ?? 0;
        content.innerHTML = renderTaxStrategyInspector(snap, state, hoveredIdx);
        updateTaxSteeringCockpitDom(chart.customData, state, hoveredIdx);
        return;
    }

    if (chart.canvas.id === 'incomeChart' && chart.customData && snap) {
        content.innerHTML = renderCashflowInspector(snap, state, points);
        return;
    }

    content.innerHTML = renderGenericInspector(chart, tooltip, snap, state, points);
};

setDefaultTooltipHandler(externalTooltipHandler);

function collectVisiblePinnedElements(chart, activePin) {
    const visibleElements = [];
    chart.data.datasets.forEach((_dataset, datasetIdx) => {
        if (typeof chart.isDatasetVisible === 'function' && !chart.isDatasetVisible(datasetIdx)) return;
        const meta = chart.getDatasetMeta(datasetIdx);
        if (meta?.data?.[activePin]) {
            visibleElements.push({ datasetIndex: datasetIdx, index: activePin });
        }
    });
    return visibleElements;
}

function getElementTooltipCoordinate(elem) {
    if (!elem) return { x: 0, y: 0 };
    if (typeof elem.tooltipPosition === 'function') {
        return elem.tooltipPosition();
    }
    return { x: elem.x || 0, y: elem.y || 0 };
}

function applyPinnedHighlight(chart, activePin) {
    if (!chart || activePin === null || activePin === undefined) return;
    try {
        const visibleElements = collectVisiblePinnedElements(chart, activePin);
        if (visibleElements.length === 0) return;

        if (typeof chart.setActiveElements === 'function') {
            chart.setActiveElements(visibleElements);
        }
        if (chart.tooltip && typeof chart.tooltip.setActiveElements === 'function') {
            const firstMeta = chart.getDatasetMeta(visibleElements[0].datasetIndex);
            const elem = firstMeta?.data?.[activePin];
            chart.tooltip.setActiveElements(visibleElements, getElementTooltipCoordinate(elem));
        }
    } catch {
        // Safe fallback if canvas elements are not yet initialized
    }
}

function upsertChartInstance(canvasEl, existingChart, config, yearlyData, state) {
    if (!canvasEl) return existingChart;
    let instance = existingChart;
    if (instance) {
        instance.data = config.data;
        instance.options = config.options;
        if (typeof instance.setDatasetVisibility === 'function' && Array.isArray(config.data?.datasets)) {
            config.data.datasets.forEach((ds, idx) => {
                instance.setDatasetVisibility(idx, !ds.hidden);
            });
        }
        if (yearlyData) instance.customData = yearlyData;
        instance.customState = state;
        instance.update('none');
    } else {
        instance = new Chart(canvasEl.getContext('2d'), config);
        if (yearlyData) instance.customData = yearlyData;
        instance.customState = state;
    }
    return instance;
}

function resolveActivePinnedIndex() {
    if (pinnedYearIndex !== null) return pinnedYearIndex;
    return typeof window !== 'undefined' ? window.pinnedYearIndex : null;
}

function renderSecondaryCharts(yearlyData, state, labels, annotations, sorrData) {
    const ctxNetWorth = document.getElementById('netWorthChart');
    if (ctxNetWorth) {
        const config = buildNetWorthConfig(yearlyData, state, labels, annotations);
        netWorthChart = upsertChartInstance(ctxNetWorth, netWorthChart, config, yearlyData, state);
    }

    const ctxTax = document.getElementById('taxChart');
    if (ctxTax) {
        const config = buildTaxConfig(yearlyData, state, labels, annotations);
        taxChart = upsertChartInstance(ctxTax, taxChart, config, yearlyData, state);
    }

    const ctxSorr = document.getElementById('sorrChart');
    if (ctxSorr && sorrData) {
        const config = buildSorrConfig(sorrData, labels, annotations);
        sorrChart = upsertChartInstance(ctxSorr, sorrChart, config, yearlyData, state);
    }
}

/**
 * Renders or updates all 6 simulation charts on the dashboard.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<Object>} events
 * @param {Object|null} sorrData
 */
export function renderCharts(yearlyData, state, events = [], sorrData = null) {
    if (!yearlyData || yearlyData.length === 0) return;

    const activeTheme =
        typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') || 'slate' : 'slate';
    applyChartTheme(activeTheme);

    const labels = yearlyData.map((snap) => snap.year.toString());
    const s1Name = escapeHtml(state.primarySpouse?.name || 'Spouse 1');
    const s2Name = escapeHtml(state.secondarySpouse?.name || 'Spouse 2');
    const annotations = generateAnnotationsConfig(events);
    const activePin = resolveActivePinnedIndex();

    const ctxPortfolio = document.getElementById('portfolioChart');
    if (ctxPortfolio) {
        const config = buildPortfolioConfig(yearlyData, state, labels, annotations, s1Name, s2Name);
        portfolioChart = upsertChartInstance(ctxPortfolio, portfolioChart, config, yearlyData, state);
        applyPinnedHighlight(portfolioChart, activePin);
        renderPortfolioOption1CHeader(portfolioChart, yearlyData, state, s1Name, s2Name);
    }

    const ctxIncome = document.getElementById('incomeChart');
    if (ctxIncome) {
        const config = buildIncomeConfig(yearlyData, state, labels, annotations, s1Name, s2Name);
        incomeChart = upsertChartInstance(ctxIncome, incomeChart, config, yearlyData, state);
        applyPinnedHighlight(incomeChart, activePin);
        renderIncomePillHeader(incomeChart);
    }

    const ctxCashflow = document.getElementById('cashflowChart');
    if (ctxCashflow) {
        const config = buildCashflowConfig(yearlyData, state, labels, annotations, s1Name, s2Name);
        cashflowChart = upsertChartInstance(ctxCashflow, cashflowChart, config, yearlyData, state);
    }

    renderSecondaryCharts(yearlyData, state, labels, annotations, sorrData);
    updateTaxSteeringCockpitDom(yearlyData, state);
}

function resolveChartByKey(chartKey) {
    const chartMap = {
        chart1: portfolioChart,
        portfolioChart: portfolioChart,
        chart2: cashflowChart || incomeChart,
        cashflowChart: cashflowChart || incomeChart,
        incomeChart: incomeChart,
        chart3: taxChart,
        taxChart: taxChart,
        chart4: netWorthChart,
        netWorthChart: netWorthChart,
        chart6: sorrChart,
        sorrChart: sorrChart
    };
    return chartMap[chartKey] || portfolioChart;
}

function scrollAndPulseChartCard(canvas) {
    if (!canvas) return;
    canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const card = canvas.closest('.chart-card');
    if (!card) return;
    card.classList.remove('ai-highlight-pulse');
    void card.offsetWidth;
    card.classList.add('ai-highlight-pulse');
    setTimeout(() => card.classList.remove('ai-highlight-pulse'), 5000);
}

/**
 * Programmatically scrolls to and triggers tooltip highlight on a specific chart and year.
 * @param {string} chartKey - 'chart1' | 'chart2' | 'chart3' | 'chart4' | 'chart6'
 * @param {number|string} year - Calendar year (e.g. 2035)
 */
export function highlightChartPoint(chartKey, year) {
    const targetChart = resolveChartByKey(chartKey);
    if (!targetChart?.data?.labels) return;

    const yearStr = String(year);
    const dataIndex = targetChart.data.labels.findIndex((lbl) => String(lbl) === yearStr);
    if (dataIndex === -1) return;

    scrollAndPulseChartCard(targetChart.canvas);

    if (typeof targetChart.setActiveElements !== 'function') return;
    try {
        const meta = targetChart.getDatasetMeta(0);
        const elem = meta?.data?.[dataIndex];
        const pointCoord = getElementTooltipCoordinate(elem);

        targetChart.setActiveElements([{ datasetIndex: 0, index: dataIndex }]);
        if (targetChart.tooltip) {
            targetChart.tooltip.setActiveElements([{ datasetIndex: 0, index: dataIndex }], pointCoord);
        }
        targetChart.update();
    } catch (highlightError) {
        console.warn('Could not programmatically trigger chart tooltip:', highlightError);
    }
}

// Attach globally for backwards compatibility (browser environment)
if (typeof window !== 'undefined') {
    window.highlightChartPoint = highlightChartPoint;
}
