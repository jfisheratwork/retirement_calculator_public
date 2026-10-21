/**
 * Chart.js Dataset & Scale Configuration Builders
 * Extracted from src/components/charts.js per SPEC-070 to enforce modular
 * dataset construction and keep function complexity and length within limits.
 */

import {
    applyPortfolioVisibilityToConfig,
    buildMacroIncomeDatasets,
    buildMacroPortfolioBucketDatasets
} from './chart-stage-header.js';

let defaultTooltipHandler = null;

export const THEME_CHART_PALETTES = {
    slate: {
        netWorth: '#10b981',
        cash: '#00b894',
        hysa: '#10ac84',
        cd: '#1dd1a1',
        hsa: '#2bcbba',
        brokerage: '#0984e3',
        s1Roth: '#6c5ce7',
        s2Roth: '#a29bfe',
        s1Trad401k: '#00cec9',
        s2Trad401k: '#81ecec',
        s1Trad403b: '#22a6b3',
        s2Trad403b: '#7ed6df',
        s1StdIra: '#be2edd',
        s2StdIra: '#e056fd',
        s1Sepp: '#f39c12',
        s2Sepp: '#f1c40f',
        homeEquity: '#fdcb6e',
        college529: '#e17055',
        outflows: '#f43f5e',
        sorrCrash: '#d63031',
        sorrMid: '#f6b93b',
        sorrLate: '#00b894',
        sorrBase: '#0984e3',
        work: '#10b981',
        ssn: '#3b82f6',
        drawdowns: '#eab308',
        rmd: '#fb923c',
        conversions: '#c084fc',
        taxBill: '#f43f5e',
        fedTax: '#f43f5e',
        capGainsTax: '#fbbf24',
        stateTax: '#fb923c',
        ficaTax: '#38bdf8',
        irmaaTax: '#e879f9',
        penaltyTax: '#f39c12',
        surplus: '#fdcb6e'
    },
    terminal: {
        netWorth: '#00ff66',
        cash: '#059669',
        hysa: '#10b981',
        cd: '#34d399',
        hsa: '#2dd4bf',
        brokerage: '#38bdf8',
        s1Roth: '#00ff66',
        s2Roth: '#86efac',
        s1Trad401k: '#10b981',
        s2Trad401k: '#6ee7b7',
        s1Trad403b: '#059669',
        s2Trad403b: '#34d399',
        s1StdIra: '#22d3ee',
        s2StdIra: '#67e8f9',
        s1Sepp: '#fbbf24',
        s2Sepp: '#fde047',
        homeEquity: '#fbbf24',
        college529: '#f97316',
        outflows: '#f43f5e',
        sorrCrash: '#ef4444',
        sorrMid: '#fbbf24',
        sorrLate: '#00ff66',
        sorrBase: '#38bdf8',
        work: '#00ff66',
        ssn: '#38bdf8',
        drawdowns: '#fbbf24',
        rmd: '#f97316',
        conversions: '#818cf8',
        taxBill: '#ef4444',
        fedTax: '#ef4444',
        capGainsTax: '#fbbf24',
        stateTax: '#f97316',
        ficaTax: '#38bdf8',
        irmaaTax: '#a78bfa',
        penaltyTax: '#ef4444',
        surplus: '#00ff66'
    },
    broadsheet: {
        netWorth: '#990f3d',
        cash: '#475569',
        hysa: '#0f766e',
        cd: '#14b8a6',
        hsa: '#0284c7',
        brokerage: '#0d7680',
        s1Roth: '#097045',
        s2Roth: '#16a34a',
        s1Trad401k: '#1e3a8a',
        s2Trad401k: '#2563eb',
        s1Trad403b: '#1d4ed8',
        s2Trad403b: '#3b82f6',
        s1StdIra: '#701a75',
        s2StdIra: '#9333ea',
        s1Sepp: '#b35900',
        s2Sepp: '#d97706',
        homeEquity: '#b35900',
        college529: '#c2410c',
        outflows: '#990f3d',
        sorrCrash: '#990f3d',
        sorrMid: '#b35900',
        sorrLate: '#097045',
        sorrBase: '#0d7680',
        work: '#097045',
        ssn: '#1e3a8a',
        drawdowns: '#b35900',
        rmd: '#701a75',
        conversions: '#097045',
        taxBill: '#990f3d',
        fedTax: '#990f3d',
        capGainsTax: '#b35900',
        stateTax: '#d97706',
        ficaTax: '#0d7680',
        irmaaTax: '#701a75',
        penaltyTax: '#c2410c',
        surplus: '#0d7680'
    },
    matcha: {
        netWorth: '#1b3820',
        cash: '#4f634f',
        hysa: '#3f6212',
        cd: '#65a30d',
        hsa: '#0d9488',
        brokerage: '#c25e38',
        s1Roth: '#b7791f',
        s2Roth: '#f59e0b',
        s1Trad401k: '#2e7d32',
        s2Trad401k: '#4ade80',
        s1Trad403b: '#15803d',
        s2Trad403b: '#22c55e',
        s1StdIra: '#854d0e',
        s2StdIra: '#a16207',
        s1Sepp: '#b7791f',
        s2Sepp: '#d97706',
        homeEquity: '#78716c',
        college529: '#ea580c',
        outflows: '#c25e38',
        sorrCrash: '#dc2626',
        sorrMid: '#b7791f',
        sorrLate: '#2e7d32',
        sorrBase: '#2e7d32',
        work: '#2e7d32',
        ssn: '#3f6212',
        drawdowns: '#b7791f',
        rmd: '#854d0e',
        conversions: '#b7791f',
        taxBill: '#c25e38',
        fedTax: '#c25e38',
        capGainsTax: '#b7791f',
        stateTax: '#d97706',
        ficaTax: '#0d9488',
        irmaaTax: '#78716c',
        penaltyTax: '#dc2626',
        surplus: '#2e7d32'
    }
};

export function getActiveThemeName() {
    if (typeof document !== 'undefined') {
        const docTheme = document.documentElement.getAttribute('data-theme');
        if (docTheme && THEME_CHART_PALETTES[docTheme]) return docTheme;
    }
    return 'slate';
}

function resolveSpouseKeyedColor(isSecondary, secondaryColor, primaryColor) {
    return isSecondary ? secondaryColor : primaryColor;
}

const THEME_DATASET_MATCHERS = [
    { match: ['net worth'], resolve: (pal) => pal.netWorth },
    { match: ['cash cushion', 'cash &'], resolve: (pal) => pal.cash },
    { match: ['hysa', 'high-yield'], resolve: (pal) => pal.hysa },
    { match: ['cd', 'certificate'], resolve: (pal) => pal.cd },
    { match: ['hsa', 'health savings'], resolve: (pal) => pal.hsa },
    { match: ['brokerage', 'taxable brokerage'], resolve: (pal) => pal.brokerage },
    { match: ['roth'], resolve: (pal, sec) => resolveSpouseKeyedColor(sec, pal.s2Roth, pal.s1Roth) },
    {
        match: ['401k', 'retirement account'],
        resolve: (pal, sec) => resolveSpouseKeyedColor(sec, pal.s2Trad401k, pal.s1Trad401k)
    },
    { match: ['403b'], resolve: (pal, sec) => resolveSpouseKeyedColor(sec, pal.s2Trad403b, pal.s1Trad403b) },
    {
        match: ['std ira', 'standard ira'],
        resolve: (pal, sec) => resolveSpouseKeyedColor(sec, pal.s2StdIra, pal.s1StdIra)
    },
    {
        match: ['72(t)', 'sepp', 'early ira'],
        resolve: (pal, sec) => resolveSpouseKeyedColor(sec, pal.s2Sepp, pal.s1Sepp)
    },
    { match: ['home equity', 'home &'], resolve: (pal) => pal.homeEquity },
    { match: ['529', 'college'], resolve: (pal) => pal.college529 },
    { match: ['work &', 'take-home', 'earned income'], resolve: (pal) => pal.work },
    { match: ['social security', 'pension', 'ssn'], resolve: (pal) => pal.ssn },
    { match: ['portfolio withdrawal', 'pre-tax draw', 'drawdown'], resolve: (pal) => pal.drawdowns },
    { match: ['rmd', 'mandatory rmd'], resolve: (pal) => pal.rmd },
    { match: ['roth conversion', 'bracket fill'], resolve: (pal) => pal.conversions },
    { match: ['tax-free draw'], resolve: (pal) => pal.s1Roth },
    { match: ['taxable ss & realized'], resolve: (pal) => pal.brokerage },
    { match: ['w-2 taxable income'], resolve: (pal) => pal.brokerage },
    { match: ['total annual tax bill'], resolve: (pal) => pal.taxBill },
    { match: ['ordinary federal', 'federal tax'], resolve: (pal) => pal.fedTax },
    { match: ['capital gains', 'niit'], resolve: (pal) => pal.capGainsTax },
    { match: ['state income', 'state tax'], resolve: (pal) => pal.stateTax },
    { match: ['fica', 'payroll tax'], resolve: (pal) => pal.ficaTax },
    { match: ['irmaa', 'medicare surcharge'], resolve: (pal) => pal.irmaaTax },
    { match: ['early withdrawal penalty', '10% early'], resolve: (pal) => pal.penaltyTax },
    { match: ['surplus', 'shortfall'], resolve: (pal) => pal.surplus },
    { match: ['outflow', 'expense', 'living'], resolve: (pal) => pal.outflows },
    { match: ['early scenario'], resolve: (pal) => pal.sorrCrash },
    { match: ['mid scenario'], resolve: (pal) => pal.sorrMid },
    { match: ['late scenario'], resolve: (pal) => pal.sorrLate },
    { match: ['base assumption'], resolve: (pal) => pal.sorrBase }
];

export function resolveThemeDatasetColor(label = '', defaultColor = '#3b82f6', themeId = 'slate') {
    const pal = THEME_CHART_PALETTES[themeId] || THEME_CHART_PALETTES.slate;
    const l = String(label).toLowerCase();
    const isSecondary = l.includes('secondary') || l.includes('s2') || l.includes('lisa');

    for (const rule of THEME_DATASET_MATCHERS) {
        if (rule.match.some((keyword) => l.includes(keyword))) {
            return rule.resolve(pal, isSecondary);
        }
    }

    return defaultColor;
}

/**
 * Registers the external tooltip handler used by interactive charts.
 * @param {Function} handlerFn
 */
export function setDefaultTooltipHandler(handlerFn) {
    defaultTooltipHandler = handlerFn;
}

const LIQUID_BALANCE_KEYS = [
    's1Brokerage',
    's2Brokerage',
    's1Hysa',
    's2Hysa',
    's1Cd',
    's2Cd',
    's1Hsa',
    's2Hsa',
    's1RothIra',
    's2RothIra',
    's1Trad401k',
    's2Trad401k',
    's1Trad403b',
    's2Trad403b',
    's1StandardIra',
    's2StandardIra',
    's1SeppIra',
    's2SeppIra',
    'cashCushion'
];

const ALL_NET_WORTH_KEYS = [...LIQUID_BALANCE_KEYS, 'college529', 'primaryResidenceEquity'];

function sumBalanceKeys(balancesObj, keysToSum) {
    if (!balancesObj) return 0;
    let runningTotal = 0;
    for (const keyName of keysToSum) {
        runningTotal += Number(balancesObj[keyName]) || 0;
    }
    return runningTotal;
}

/**
 * Maps yearly simulation snapshots through a selector and applies real-dollar inflation adjustment if enabled.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Function} selector
 * @returns {Array<number>}
 */
export function mapData(yearlyData, state, selector) {
    return yearlyData.map((snapshotItem, yearIndex) => {
        let amountVal = selector(snapshotItem);
        if (state.assumptions.displayRealDollars) {
            amountVal = amountVal / Math.pow(1 + state.assumptions.inflationRate / 100, yearIndex);
        }
        return amountVal;
    });
}

/**
 * Click handler for chart bars/points to synchronize the focus-year selector.
 * @param {Object} _clickEvent
 * @param {Array<Object>} activeElements
 */
export function handleChartClick(_clickEvent, activeElements) {
    if (!activeElements || activeElements.length === 0) return;
    const inspector = document.getElementById('chart-inspector');
    if (inspector) inspector.classList.add('hidden');
    const selectedIndex = activeElements[0].index;
    const focusYearSelect = document.getElementById('focus-year-select');
    if (focusYearSelect) {
        focusYearSelect.value = selectedIndex.toString();
        focusYearSelect.dispatchEvent(new Event('change'));
    }
}

function resolveAnnotationBgColor(hexColor) {
    if (hexColor === '#00b894') return 'rgba(0, 184, 148, 0.9)';
    if (hexColor === '#2d3436') return 'rgba(45, 52, 54, 0.9)';
    return 'rgba(225, 112, 85, 0.9)';
}

/**
 * Generates chartjs-plugin-annotation line configurations from milestone events.
 * @param {Array<Object>} events
 * @returns {Object}
 */
export function generateAnnotationsConfig(events) {
    const yearEvents = {};
    (events || []).forEach((evt) => {
        if (!evt || evt.type === 'cd_matured' || evt.type === 'cd_rollover') return;
        const yearKey = evt.year.toString();
        if (!yearEvents[yearKey]) {
            yearEvents[yearKey] = { labels: [], color: evt.color || '#e17055' };
        }
        yearEvents[yearKey].labels.push(evt.label);
        if (evt.color && yearEvents[yearKey].color === '#e17055') {
            yearEvents[yearKey].color = evt.color;
        }
    });

    const annotations = {};
    Object.keys(yearEvents).forEach((yearKey, annotationIdx) => {
        const evtData = yearEvents[yearKey];
        annotations[`line${annotationIdx}`] = {
            type: 'line',
            xMin: yearKey,
            xMax: yearKey,
            borderColor: evtData.color,
            borderWidth: 2,
            borderDash: [5, 5],
            label: {
                display: true,
                content: evtData.labels,
                position: 'center',
                yAdjust: (annotationIdx % 4) * 20 - 30,
                backgroundColor: resolveAnnotationBgColor(evtData.color),
                color: 'white',
                font: { size: 10 }
            }
        };
    });
    return annotations;
}

export function hexToRgba(hex, alpha = 0.25) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length === 6) {
        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
}

function createLineDataset(label, data, color, isHidden = false) {
    const activeTheme = getActiveThemeName();
    const resolvedColor = resolveThemeDatasetColor(label, color, activeTheme);
    const datasetObj = {
        label,
        data,
        borderColor: resolvedColor,
        backgroundColor: resolvedColor,
        fill: false,
        tension: 0.4
    };
    if (isHidden) {
        datasetObj.hidden = true;
    }
    return datasetObj;
}

function buildSeppIraDatasetIfActive(yearlyData, state, spouseKey, balKey, fallbackName, color) {
    const hasBalance = (yearlyData || []).some((snap) => (snap?.balances?.[balKey] || 0) > 0);
    const r72t = state?.[spouseKey]?.rule72t;
    const isConfiguredNew = Boolean(r72t?.enabled && (r72t?.targetIraMode === 'new' || Number(r72t?.splitAmount) > 0));
    if (!hasBalance && !isConfiguredNew) return null;
    const label = r72t?.newIraName || fallbackName;
    const ds = createLineDataset(
        label,
        mapData(yearlyData, state, (snap) => snap.balances?.[balKey] || 0),
        color
    );
    ds.isRetirementAccount = true;
    return ds;
}

function buildRetirementAccountDatasets(yearlyData, state, s1Name, s2Name) {
    const datasets = [
        createLineDataset(
            `${s1Name} Roth IRA`,
            mapData(yearlyData, state, (snap) => snap.balances.s1RothIra),
            '#6c5ce7'
        ),
        createLineDataset(
            `${s2Name} Roth IRA`,
            mapData(yearlyData, state, (snap) => snap.balances.s2RothIra),
            '#a29bfe'
        ),
        createLineDataset(
            `${s1Name} Trad 401k`,
            mapData(yearlyData, state, (snap) => snap.balances.s1Trad401k),
            '#00cec9'
        ),
        createLineDataset(
            `${s2Name} Trad 401k`,
            mapData(yearlyData, state, (snap) => snap.balances.s2Trad401k),
            '#81ecec'
        ),
        createLineDataset(
            `${s1Name} 403b`,
            mapData(yearlyData, state, (snap) => snap.balances.s1Trad403b),
            '#22a6b3'
        ),
        createLineDataset(
            `${s2Name} 403b`,
            mapData(yearlyData, state, (snap) => snap.balances.s2Trad403b),
            '#7ed6df'
        ),
        createLineDataset(
            `${s1Name} Std IRA`,
            mapData(yearlyData, state, (snap) => snap.balances.s1StandardIra),
            '#be2edd'
        ),
        createLineDataset(
            `${s2Name} Std IRA`,
            mapData(yearlyData, state, (snap) => snap.balances.s2StandardIra),
            '#e056fd'
        )
    ];
    const s1SeppDs = buildSeppIraDatasetIfActive(
        yearlyData,
        state,
        'primarySpouse',
        's1SeppIra',
        `${s1Name} 72(t) IRA`,
        '#f39c12'
    );
    if (s1SeppDs) datasets.push(s1SeppDs);
    const s2SeppDs = buildSeppIraDatasetIfActive(
        yearlyData,
        state,
        'secondarySpouse',
        's2SeppIra',
        `${s2Name} 72(t) IRA`,
        '#f1c40f'
    );
    if (s2SeppDs) datasets.push(s2SeppDs);
    return datasets;
}

function buildPortfolioDatasets(yearlyData, state, s1Name, s2Name) {
    const activeTheme = getActiveThemeName();
    const totalNetWorth = mapData(yearlyData, state, (snap) => sumBalanceKeys(snap.balances, ALL_NET_WORTH_KEYS));
    const nwColor = resolveThemeDatasetColor('Total Net Worth', '#10b981', activeTheme);
    return [
        {
            label: 'Total Net Worth',
            data: totalNetWorth,
            borderColor: nwColor,
            backgroundColor: nwColor,
            borderWidth: 2.5,
            fill: false,
            tension: 0.4,
            yAxisID: 'yNetWorth',
            order: 0
        },
        createLineDataset(
            'Cash Cushion',
            mapData(yearlyData, state, (snap) => snap.balances.cashCushion),
            '#00b894',
            true
        ),
        createLineDataset(
            'High-Yield Savings (HYSA)',
            mapData(yearlyData, state, (snap) => snap.balances.s1Hysa + snap.balances.s2Hysa),
            '#10ac84',
            true
        ),
        createLineDataset(
            'Certificates of Deposit (CD)',
            mapData(yearlyData, state, (snap) => (snap.balances.s1Cd || 0) + (snap.balances.s2Cd || 0)),
            '#1dd1a1',
            true
        ),
        createLineDataset(
            'Health Savings Account (HSA)',
            mapData(yearlyData, state, (snap) => (snap.balances.s1Hsa || 0) + (snap.balances.s2Hsa || 0)),
            '#2bcbba',
            true
        ),
        createLineDataset(
            'Joint Brokerage',
            mapData(yearlyData, state, (snap) => snap.balances.s1Brokerage + snap.balances.s2Brokerage),
            '#0984e3',
            true
        ),
        ...buildRetirementAccountDatasets(yearlyData, state, s1Name, s2Name),
        createLineDataset(
            'Home Equity',
            mapData(yearlyData, state, (snap) => snap.balances.primaryResidenceEquity || 0),
            '#fdcb6e',
            true
        ),
        createLineDataset(
            '529 College Savings',
            mapData(yearlyData, state, (snap) => snap.balances.college529 || 0),
            '#e17055',
            true
        )
    ];
}

function resolveScaleTickColor() {
    if (typeof window !== 'undefined' && window.Chart?.defaults?.color) {
        return window.Chart.defaults.color;
    }
    return '#b2bec3';
}

export function resolveLegendLabelColor() {
    if (typeof document !== 'undefined') {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'broadsheet') return '#1a1a1a';
        if (theme === 'matcha') return '#1b3820';
        if (theme === 'terminal') return '#f0fdf4';
    }
    return '#f8fafc';
}

function resolveScaleTitleColor() {
    if (typeof document !== 'undefined') {
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'broadsheet') return '#1a1a1a';
        if (theme === 'matcha') return '#1b3820';
    }
    return '#b2bec3';
}

function buildPortfolioScales() {
    const tickCol = resolveScaleTickColor();
    const titleCol = resolveScaleTitleColor();
    return {
        x: {
            ticks: {
                color: tickCol,
                maxRotation: 45,
                minRotation: 45,
                autoSkip: true,
                maxTicksLimit: 12
            }
        },
        y: {
            type: 'linear',
            position: 'left',
            stacked: false,
            title: {
                display: true,
                text: 'Account Balances',
                color: titleCol,
                font: { size: 11, weight: 'bold' }
            },
            ticks: {
                color: tickCol,
                callback: (tickAmount) => '$' + tickAmount / 1000 + 'k'
            }
        },
        yNetWorth: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            title: {
                display: true,
                text: 'Total Net Worth',
                color: '#10b981',
                font: { size: 11, weight: 'bold' }
            },
            ticks: {
                color: '#10b981',
                callback: (tickAmount) => '$' + tickAmount / 1000 + 'k'
            }
        }
    };
}

/**
 * Builds Chart.js configuration for the dual-axis Portfolio & Total Net Worth chart.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @param {...string} spouseNames
 * @returns {Object}
 */
export function buildPortfolioConfig(yearlyData, state, labels, annotations, ...spouseNames) {
    const [s1Name = 'Spouse 1', s2Name = 'Spouse 2'] = spouseNames;
    const isBucketsMode = state?.uiState?.portfolioViewMode === 'buckets';
    const activeTheme = getActiveThemeName();
    const datasets = isBucketsMode
        ? buildMacroPortfolioBucketDatasets(yearlyData, state, mapData, (lbl, def) =>
              resolveThemeDatasetColor(lbl, def, activeTheme)
          )
        : buildPortfolioDatasets(yearlyData, state, s1Name, s2Name);

    const config = {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { display: false, labels: { color: resolveLegendLabelColor() } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: defaultTooltipHandler
                },
                annotation: { annotations }
            },
            scales: buildPortfolioScales()
        }
    };
    applyPortfolioVisibilityToConfig(config, state);
    return config;
}

function extractSpouseTakeHome(snapshotItem, spouseKey, clampNonNegative = false) {
    const spouseIncome = snapshotItem.income?.[spouseKey];
    if (spouseIncome?.takeHome !== undefined) return spouseIncome.takeHome;
    const s1W2 = snapshotItem.income.s1.w2Net;
    const s2W2 = snapshotItem.income.s2.w2Net;
    const totalW2 = s1W2 + s2W2;
    const targetW2 = spouseKey === 's1' ? s1W2 : s2W2;
    const share = totalW2 > 0 ? targetW2 / totalW2 : 0;
    const netPay = targetW2 - (snapshotItem.taxDetails?.w2Tax || 0) * share;
    return clampNonNegative ? Math.max(0, netPay) : netPay;
}

function createStackedBarDataset(label, data, backgroundColor, stack) {
    const activeTheme = getActiveThemeName();
    const resolvedColor = resolveThemeDatasetColor(label, backgroundColor, activeTheme);
    return { label, data, backgroundColor: resolvedColor, borderColor: resolvedColor, stack };
}

function buildEarnedIncomeBars(yearlyData, state, s1Name, s2Name, stackName) {
    const clampZero = stackName === 'Inflows';
    return [
        createStackedBarDataset(
            `${s1Name} Take-Home Pay`,
            mapData(yearlyData, state, (snap) => extractSpouseTakeHome(snap, 's1', clampZero)),
            '#27ae60',
            stackName
        ),
        createStackedBarDataset(
            `${s2Name} Take-Home Pay`,
            mapData(yearlyData, state, (snap) => extractSpouseTakeHome(snap, 's2', clampZero)),
            '#2ecc71',
            stackName
        ),
        createStackedBarDataset(
            `${s1Name} SSN`,
            mapData(yearlyData, state, (snap) => snap.income.s1.ssn),
            '#16a085',
            stackName
        ),
        createStackedBarDataset(
            `${s2Name} SSN`,
            mapData(yearlyData, state, (snap) => snap.income.s2.ssn),
            '#1abc9c',
            stackName
        ),
        createStackedBarDataset(
            `${s1Name} Early IRA Payout (72t)`,
            mapData(yearlyData, state, (snap) => snap.income.s1.rule72t),
            '#f39c12',
            stackName
        ),
        createStackedBarDataset(
            `${s2Name} Early IRA Payout (72t)`,
            mapData(yearlyData, state, (snap) => snap.income.s2.rule72t),
            '#f1c40f',
            stackName
        ),
        createStackedBarDataset(
            'Reverse Mortgage',
            mapData(yearlyData, state, (snap) => snap.income.reverseMortgage),
            '#e67e22',
            stackName
        )
    ];
}

function buildDrawdownBars(yearlyData, state, s1Name, s2Name, stackName) {
    const isCashflow = stackName === 'Inflows';
    const drawdownSeries = [
        [
            'High-Yield Savings (HYSA)',
            (snap) => (snap.income?.drawdowns?.s1Hysa || 0) + (snap.income?.drawdowns?.s2Hysa || 0),
            '#10ac84'
        ],
        [
            'Joint Brokerage',
            (snap) => (snap.income?.drawdowns?.s1Brokerage || 0) + (snap.income?.drawdowns?.s2Brokerage || 0),
            isCashflow ? '#2980b9' : '#0984e3'
        ],
        [`${s1Name} Roth IRA`, (snap) => snap.income?.drawdowns?.s1RothIra || 0, isCashflow ? '#8e44ad' : '#6c5ce7'],
        [`${s2Name} Roth IRA`, (snap) => snap.income?.drawdowns?.s2RothIra || 0, isCashflow ? '#9b59b6' : '#a29bfe'],
        [`${s1Name} Trad 401k`, (snap) => snap.income?.drawdowns?.s1Trad401k || 0, '#00cec9'],
        [`${s2Name} Trad 401k`, (snap) => snap.income?.drawdowns?.s2Trad401k || 0, '#81ecec'],
        [`${s1Name} 403b`, (snap) => snap.income?.drawdowns?.s1Trad403b || 0, '#22a6b3'],
        [`${s2Name} 403b`, (snap) => snap.income?.drawdowns?.s2Trad403b || 0, '#7ed6df'],
        [`${s1Name} Std IRA`, (snap) => snap.income?.drawdowns?.s1StandardIra || 0, '#be2edd'],
        [`${s2Name} Std IRA`, (snap) => snap.income?.drawdowns?.s2StandardIra || 0, '#e056fd'],
        ['Cash Cushion', (snap) => snap.income?.drawdowns?.cashCushion || 0, '#00b894'],
        ['Unfunded Shortfall', (snap) => snap.unfundedShortfall, '#eb2f06']
    ];
    return drawdownSeries.map(([label, selectorFn, colorHex]) =>
        createStackedBarDataset(label, mapData(yearlyData, state, selectorFn), colorHex, stackName)
    );
}

function buildIncomeOverlayLines(yearlyData, state) {
    const activeTheme = getActiveThemeName();
    const expColor = resolveThemeDatasetColor('Total Expenses', '#eb2f06', activeTheme);
    const expTaxColor = resolveThemeDatasetColor('Total Expenses + Non-W2 Taxes', '#ff7675', activeTheme);
    const surplusColor = resolveThemeDatasetColor('Surplus / Shortfall', '#fdcb6e', activeTheme);
    return [
        {
            label: 'Surplus / Shortfall',
            data: mapData(yearlyData, state, (snap) => snap.surplus),
            type: 'line',
            borderColor: surplusColor,
            backgroundColor: surplusColor,
            borderWidth: 2,
            borderDash: [5, 5],
            stack: 'LineSurplus'
        },
        {
            label: 'Total Expenses',
            data: mapData(yearlyData, state, (snap) => snap.expenses),
            borderColor: expColor,
            backgroundColor: expColor,
            type: 'line',
            fill: false,
            stack: 'LineExp'
        },
        {
            label: 'Total Expenses + Non-W2 Taxes',
            data: mapData(yearlyData, state, (snap) => snap.expenses + (snap.taxDetails?.nonW2Tax || 0)),
            borderColor: expTaxColor,
            backgroundColor: expTaxColor,
            type: 'line',
            fill: false,
            borderDash: [5, 5],
            stack: 'LineExpTax'
        }
    ];
}

/**
 * Builds Chart.js configuration for the Income vs. Expenses chart.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @param {...string} spouseNames
 * @returns {Object}
 */
export function buildIncomeConfig(yearlyData, state, labels, annotations, ...spouseNames) {
    const [s1Name = 'Spouse 1', s2Name = 'Spouse 2'] = spouseNames;
    const isDetailView = Boolean(state?.uiState?.incomeDetailView);
    const activeTheme = getActiveThemeName();
    const datasets = isDetailView
        ? [
              ...buildEarnedIncomeBars(yearlyData, state, s1Name, s2Name, 'Income'),
              ...buildDrawdownBars(yearlyData, state, s1Name, s2Name, 'Income'),
              ...buildIncomeOverlayLines(yearlyData, state)
          ]
        : buildMacroIncomeDatasets(yearlyData, state, mapData, (lbl, def) =>
              resolveThemeDatasetColor(lbl, def, activeTheme)
          );

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { display: isDetailView, labels: { color: resolveLegendLabelColor() } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: defaultTooltipHandler
                },
                annotation: { annotations }
            },
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        color: resolveScaleTickColor(),
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: resolveScaleTickColor(),
                        callback: (tickAmount) => '$' + tickAmount / 1000 + 'k'
                    }
                }
            }
        }
    };
}

const PRE_TAX_DRAWDOWN_KEYS = [
    's1Trad401k',
    's2Trad401k',
    's1Trad403b',
    's2Trad403b',
    's1StandardIra',
    's2StandardIra'
];
const HSA_CASH_DRAWDOWN_KEYS = ['s1Hsa', 's2Hsa', 'cashCushion', 's1Hysa', 's2Hysa', 's1Cd', 's2Cd'];

function extractSnapPreTaxVoluntaryDraw(snap) {
    const inc = snap.income || {};
    const totalPreTax = sumBalanceKeys(inc.drawdowns || {}, PRE_TAX_DRAWDOWN_KEYS);
    const mandatoryRmd =
        Number(inc.mandatoryRmd) || sumBalanceKeys(inc.s1 || {}, ['rmd']) + sumBalanceKeys(inc.s2 || {}, ['rmd']);
    const rule72t = sumBalanceKeys(inc.s1 || {}, ['rule72t']) + sumBalanceKeys(inc.s2 || {}, ['rule72t']);
    return Math.max(0, totalPreTax - mandatoryRmd) + rule72t;
}

function extractSnapTaxFreeDraws(snap) {
    const dd = snap.income?.drawdowns || {};
    const td = snap.taxDetails || {};
    const totalBrok = sumBalanceKeys(dd, ['s1Brokerage', 's2Brokerage']);
    const realizedLtcg = Number(td.realizedLtcg ?? snap.realizedLtcg ?? 0);
    const brokBasis =
        td.brokerageBasisDrawn !== undefined ? Number(td.brokerageBasisDrawn) : Math.max(0, totalBrok - realizedLtcg);
    const rothDraws = sumBalanceKeys(dd, ['s1RothIra', 's2RothIra']);
    const hsaCash = sumBalanceKeys(dd, HSA_CASH_DRAWDOWN_KEYS);
    return brokBasis + rothDraws + hsaCash;
}

function extractSnapTaxableSsAndLtcg(snap) {
    const td = snap.taxDetails || {};
    const totalSsn = (Number(snap.income?.s1?.ssn) || 0) + (Number(snap.income?.s2?.ssn) || 0);
    const taxableSsn = td.taxableSsn !== undefined ? Number(td.taxableSsn) : totalSsn * 0.85;
    const ltcg = Number(td.realizedLtcg ?? snap.realizedLtcg ?? 0);
    return taxableSsn + ltcg;
}

function extractSnapTotalTaxBill(snap) {
    return (
        (Number(snap.taxes) || 0) +
        (Number(snap.taxDetails?.ficaTax) || 0) +
        (Number(snap.expenseBreakdown?.irmaa) || 0)
    );
}

function buildTaxBucketWithdrawalDatasets(yearlyData, state) {
    const activeTheme = getActiveThemeName();
    const resolveCol = (lbl, def) => resolveThemeDatasetColor(lbl, def, activeTheme);
    const bar = (label, defaultColor, fn) => {
        const c = resolveCol(label, defaultColor);
        return {
            label,
            data: mapData(yearlyData, state, fn),
            backgroundColor: c,
            borderColor: c,
            stack: 'TaxBuckets'
        };
    };
    const taxBillColor = resolveCol('Total Annual Tax Bill', '#f43f5e');
    return [
        bar(
            'W-2 Taxable Income',
            '#38bdf8',
            (s) =>
                (s.income?.s1?.w2TaxableGross ?? s.income?.s1?.w2Net ?? 0) +
                (s.income?.s2?.w2TaxableGross ?? s.income?.s2?.w2Net ?? 0)
        ),
        bar('Pre-Tax Draws (401k / IRA / 72t)', '#2dd4bf', extractSnapPreTaxVoluntaryDraw),
        bar(
            'Mandatory RMDs (Age 73+)',
            '#fb923c',
            (s) => Number(s.income?.mandatoryRmd) || (Number(s.income?.s1?.rmd) || 0) + (Number(s.income?.s2?.rmd) || 0)
        ),
        bar(
            'Roth Conversions (Bracket Fill)',
            '#c084fc',
            (s) => (Number(s.rothConverted?.s1) || 0) + (Number(s.rothConverted?.s2) || 0)
        ),
        bar('Taxable SS & Realized LTCG', '#fbbf24', extractSnapTaxableSsAndLtcg),
        bar('Tax-Free Draws (Roth / Basis / Cash)', '#34d399', extractSnapTaxFreeDraws),
        {
            label: 'Total Annual Tax Bill',
            data: mapData(yearlyData, state, extractSnapTotalTaxBill),
            type: 'line',
            borderColor: taxBillColor,
            backgroundColor: taxBillColor,
            borderWidth: 2.5,
            tension: 0.3,
            fill: false,
            stack: 'TaxLine',
            order: 0
        }
    ];
}

/**
 * Builds Chart.js configuration for the Withdrawals & MAGI Stack chart (#cashflowChart).
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @returns {Object}
 */
export function buildCashflowConfig(yearlyData, state, labels, annotations) {
    const datasets = buildTaxBucketWithdrawalDatasets(yearlyData, state);
    const scales = buildStandardXYScales();
    scales.x.stacked = true;
    scales.y.stacked = true;

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { labels: { color: resolveLegendLabelColor(), boxWidth: 12, padding: 12 } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: defaultTooltipHandler
                },
                annotation: { annotations }
            },
            scales
        }
    };
}

function buildStandardXYScales() {
    const tickCol = resolveScaleTickColor();
    return {
        x: {
            ticks: {
                color: tickCol,
                maxRotation: 45,
                minRotation: 45,
                autoSkip: true,
                maxTicksLimit: 12
            }
        },
        y: {
            ticks: {
                color: tickCol,
                callback: (tickAmount) => '$' + tickAmount / 1000 + 'k'
            }
        }
    };
}

/**
 * Builds Chart.js configuration for the Liquid Assets vs. Total Net Worth chart.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @returns {Object}
 */
export function buildNetWorthConfig(yearlyData, state, labels, annotations) {
    const activeTheme = getActiveThemeName();
    const liquidAssets = mapData(yearlyData, state, (snap) => sumBalanceKeys(snap.balances, LIQUID_BALANCE_KEYS));
    const netHomeEquity = mapData(yearlyData, state, (snap) => snap.balances.primaryResidenceEquity || 0);
    const netWorth = liquidAssets.map((liquidVal, yearIdx) => liquidVal + netHomeEquity[yearIdx]);

    const nwColor = resolveThemeDatasetColor('Total Net Worth', '#e17055', activeTheme);
    const liquidColor = resolveThemeDatasetColor('Liquid Assets', '#0984e3', activeTheme);
    const homeColor = resolveThemeDatasetColor('Home Equity', '#fdcb6e', activeTheme);

    const datasets = [
        {
            label: 'Total Net Worth',
            data: netWorth,
            borderColor: nwColor,
            backgroundColor: hexToRgba(nwColor, 0.1),
            fill: true,
            tension: 0.4
        },
        {
            label: 'Liquid Assets',
            data: liquidAssets,
            borderColor: liquidColor,
            backgroundColor: hexToRgba(liquidColor, 0.1),
            fill: true,
            tension: 0.4
        },
        {
            label: 'Home Equity',
            data: netHomeEquity,
            borderColor: homeColor,
            backgroundColor: hexToRgba(homeColor, 0.1),
            fill: false,
            tension: 0.4,
            borderDash: [4, 4]
        }
    ];

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: resolveLegendLabelColor() } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: defaultTooltipHandler
                },
                annotation: { annotations }
            },
            scales: buildStandardXYScales()
        }
    };
}

function extractSnapFedOrdinaryTax(snap) {
    const td = snap.taxDetails;
    if (td && (td.federalTax !== undefined || td.fedTax !== undefined)) {
        const fedTotal = Number(td.federalTax ?? td.fedTax ?? 0);
        const capGains = Number(td.capitalGainsTax ?? td.ltcgTax ?? 0);
        return Math.max(0, fedTotal - capGains);
    }
    return Math.max(0, (Number(snap.taxes) || 0) - (Number(snap.earlyWithdrawalPenalty) || 0));
}

/**
 * Builds Chart.js configuration for the Itemized Annual Tax Breakdown chart (#taxChart).
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @returns {Object}
 */
export function buildTaxConfig(yearlyData, state, labels, annotations) {
    const activeTheme = getActiveThemeName();
    const resolveCol = (lbl, def) => resolveThemeDatasetColor(lbl, def, activeTheme);
    const datasets = [
        {
            label: 'Federal Ordinary Income Tax',
            data: mapData(yearlyData, state, extractSnapFedOrdinaryTax),
            backgroundColor: resolveCol('Federal Ordinary Income Tax', '#f43f5e'),
            borderRadius: 2,
            stack: 'Taxes'
        },
        {
            label: 'Capital Gains & NIIT Tax',
            data: mapData(yearlyData, state, (snap) =>
                Number(snap.taxDetails?.capitalGainsTax ?? snap.taxDetails?.ltcgTax ?? 0)
            ),
            backgroundColor: resolveCol('Capital Gains & NIIT Tax', '#fbbf24'),
            borderRadius: 2,
            stack: 'Taxes'
        },
        {
            label: 'State Income Tax',
            data: mapData(yearlyData, state, (snap) => Number(snap.taxDetails?.stateTax || 0)),
            backgroundColor: resolveCol('State Income Tax', '#fb923c'),
            borderRadius: 2,
            stack: 'Taxes'
        },
        {
            label: 'FICA Payroll Tax',
            data: mapData(yearlyData, state, (snap) => Number(snap.taxDetails?.ficaTax || 0)),
            backgroundColor: resolveCol('FICA Payroll Tax', '#38bdf8'),
            borderRadius: 2,
            stack: 'Taxes'
        },
        {
            label: 'Medicare IRMAA Surcharge',
            data: mapData(yearlyData, state, (snap) => Number(snap.expenseBreakdown?.irmaa || 0)),
            backgroundColor: resolveCol('Medicare IRMAA Surcharge', '#e879f9'),
            borderRadius: 2,
            stack: 'Taxes'
        },
        {
            label: '10% Early Withdrawal Penalty (Pre-59.5)',
            data: mapData(yearlyData, state, (snap) =>
                Number(snap.taxDetails?.earlyWithdrawalPenalty ?? snap.earlyWithdrawalPenalty ?? 0)
            ),
            backgroundColor: resolveCol('10% Early Withdrawal Penalty (Pre-59.5)', '#f39c12'),
            borderRadius: 4,
            stack: 'Taxes'
        }
    ];

    const scales = buildStandardXYScales();
    scales.x.stacked = true;
    scales.y.stacked = true;

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { labels: { color: resolveLegendLabelColor(), boxWidth: 12, padding: 12 } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: defaultTooltipHandler
                },
                annotation: { annotations }
            },
            scales
        }
    };
}

function buildSorrDatasets(sorrData) {
    const activeTheme = getActiveThemeName();
    const pal = THEME_CHART_PALETTES[activeTheme] || THEME_CHART_PALETTES.slate;
    if (!sorrData.early) {
        return [
            {
                label: 'Base Assumption (General Avg)',
                data: sorrData.base,
                borderColor: pal.sorrBase,
                backgroundColor: hexToRgba(pal.sorrBase, 0.1),
                fill: false,
                tension: 0.4,
                borderWidth: 3
            }
        ];
    }
    return [
        {
            label: 'Early Scenario',
            data: sorrData.early,
            borderColor: pal.sorrCrash,
            backgroundColor: hexToRgba(pal.sorrCrash, 0.1),
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
        },
        {
            label: 'Mid Scenario',
            data: sorrData.mid,
            borderColor: pal.sorrMid,
            backgroundColor: hexToRgba(pal.sorrMid, 0.1),
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
        },
        {
            label: 'Late Scenario',
            data: sorrData.late,
            borderColor: pal.sorrLate,
            backgroundColor: hexToRgba(pal.sorrLate, 0.1),
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
        },
        {
            label: 'Base Assumption',
            data: sorrData.base,
            borderColor: pal.sorrBase,
            backgroundColor: hexToRgba(pal.sorrBase, 0.1),
            fill: false,
            tension: 0.4,
            borderWidth: 3
        }
    ];
}

/**
 * Builds Chart.js configuration for the Sequence of Returns Risk (SORR) fan chart.
 * @param {Object} sorrData
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @returns {Object}
 */
export function buildSorrConfig(sorrData, labels, annotations) {
    const datasets = buildSorrDatasets(sorrData);

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: resolveLegendLabelColor() } },
                tooltip: {
                    enabled: false,
                    position: 'nearest',
                    external: defaultTooltipHandler
                },
                annotation: { annotations }
            },
            scales: buildStandardXYScales()
        }
    };
}
