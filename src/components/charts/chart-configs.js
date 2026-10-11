/**
 * Chart.js Dataset & Scale Configuration Builders
 * Extracted from src/components/charts.js per SPEC-070 to enforce modular
 * dataset construction and keep function complexity and length within limits.
 */

let defaultTooltipHandler = null;

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

function createLineDataset(label, data, color, isHidden = false) {
    const datasetObj = {
        label,
        data,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.4
    };
    if (isHidden) {
        datasetObj.hidden = true;
    }
    return datasetObj;
}

function buildRetirementAccountDatasets(yearlyData, state, s1Name, s2Name) {
    return [
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
}

function buildPortfolioDatasets(yearlyData, state, s1Name, s2Name) {
    const totalNetWorth = mapData(yearlyData, state, (snap) => sumBalanceKeys(snap.balances, ALL_NET_WORTH_KEYS));
    return [
        {
            label: 'Total Net Worth',
            data: totalNetWorth,
            borderColor: '#10b981',
            backgroundColor: '#10b981',
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

function buildPortfolioScales() {
    return {
        x: {
            ticks: {
                color: '#b2bec3',
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
                color: '#b2bec3',
                font: { size: 11, weight: 'bold' }
            },
            ticks: {
                color: '#b2bec3',
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
    const datasets = buildPortfolioDatasets(yearlyData, state, s1Name, s2Name);

    return {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
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
    return { label, data, backgroundColor, stack };
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
            `${s1Name} Rule 72(t)`,
            mapData(yearlyData, state, (snap) => snap.income.s1.rule72t),
            '#f39c12',
            stackName
        ),
        createStackedBarDataset(
            `${s2Name} Rule 72(t)`,
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
    return [
        {
            label: 'Surplus / Shortfall',
            data: mapData(yearlyData, state, (snap) => snap.surplus),
            type: 'line',
            borderColor: '#fdcb6e',
            backgroundColor: '#fdcb6e',
            borderWidth: 2,
            borderDash: [5, 5],
            stack: 'LineSurplus'
        },
        {
            label: 'Total Expenses',
            data: mapData(yearlyData, state, (snap) => snap.expenses),
            borderColor: '#eb2f06',
            type: 'line',
            fill: false,
            stack: 'LineExp'
        },
        {
            label: 'Total Expenses + Non-W2 Taxes',
            data: mapData(yearlyData, state, (snap) => snap.expenses + (snap.taxDetails?.nonW2Tax || 0)),
            borderColor: '#ff7675',
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
    const datasets = [
        ...buildEarnedIncomeBars(yearlyData, state, s1Name, s2Name, 'Income'),
        ...buildDrawdownBars(yearlyData, state, s1Name, s2Name, 'Income'),
        ...buildIncomeOverlayLines(yearlyData, state)
    ];

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
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
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#b2bec3',
                        callback: (tickAmount) => '$' + tickAmount / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildCashflowOutflowBars(yearlyData, state) {
    return [
        {
            label: 'Base Expenses',
            data: mapData(yearlyData, state, (snap) => snap.expenseBreakdown.base),
            backgroundColor: '#e74c3c',
            stack: 'Outflows'
        },
        {
            label: 'Mortgage Payment',
            data: mapData(yearlyData, state, (snap) => snap.expenseBreakdown.mortgage),
            backgroundColor: '#a93226',
            stack: 'Outflows'
        },
        {
            label: 'Housing (Tax/Ins/Repairs)',
            data: mapData(yearlyData, state, (snap) => snap.expenseBreakdown.housing),
            backgroundColor: '#e67e22',
            stack: 'Outflows'
        },
        {
            label: 'Childcare/College',
            data: mapData(yearlyData, state, (snap) => snap.expenseBreakdown.childcare),
            backgroundColor: '#d35400',
            stack: 'Outflows'
        },
        {
            label: 'Non-W2 Taxes (Conversions/Portfolios)',
            data: mapData(yearlyData, state, (snap) => snap.taxDetails?.nonW2Tax || 0),
            backgroundColor: '#ff7675',
            stack: 'Outflows'
        },
        {
            label: 'Reinvested to Cushion',
            data: mapData(yearlyData, state, (snap) => snap.reinvestedToCushion),
            backgroundColor: '#2ecc71',
            stack: 'Outflows'
        },
        {
            label: 'Reinvested to Sweep / Brokerage',
            data: mapData(yearlyData, state, (snap) => snap.reinvestedToSweep || snap.reinvestedToBrokerage),
            backgroundColor: '#3498db',
            stack: 'Outflows'
        }
    ];
}

/**
 * Builds Chart.js configuration for the Cashflow Inflows vs. Outflows chart.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @param {...string} spouseNames
 * @returns {Object}
 */
export function buildCashflowConfig(yearlyData, state, labels, annotations, ...spouseNames) {
    const [s1Name = 'Spouse 1', s2Name = 'Spouse 2'] = spouseNames;
    const datasets = [
        ...buildEarnedIncomeBars(yearlyData, state, s1Name, s2Name, 'Inflows'),
        ...buildDrawdownBars(yearlyData, state, s1Name, s2Name, 'Inflows'),
        ...buildCashflowOutflowBars(yearlyData, state)
    ];

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
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
                        color: '#b2bec3',
                        maxRotation: 45,
                        minRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 12,
                        callback: function (tickIdx) {
                            const lbl = this.getLabelForValue(tickIdx);
                            const dataPoint = yearlyData[tickIdx];
                            if (!dataPoint) return lbl;
                            const hasShortfall = dataPoint.unfundedShortfall > 0;
                            return lbl + (hasShortfall ? ' ❌' : ' ✅');
                        }
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        color: '#b2bec3',
                        callback: (tickAmount) => '$' + tickAmount / 1000 + 'k'
                    }
                }
            }
        }
    };
}

function buildStandardXYScales() {
    return {
        x: {
            ticks: {
                color: '#b2bec3',
                maxRotation: 45,
                minRotation: 45,
                autoSkip: true,
                maxTicksLimit: 12
            }
        },
        y: {
            ticks: {
                color: '#b2bec3',
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
    const liquidAssets = mapData(yearlyData, state, (snap) => sumBalanceKeys(snap.balances, LIQUID_BALANCE_KEYS));
    const netHomeEquity = mapData(yearlyData, state, (snap) => snap.balances.primaryResidenceEquity || 0);
    const netWorth = liquidAssets.map((liquidVal, yearIdx) => liquidVal + netHomeEquity[yearIdx]);

    const datasets = [
        {
            label: 'Total Net Worth',
            data: netWorth,
            borderColor: '#e17055',
            backgroundColor: 'rgba(225, 112, 85, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Liquid Assets',
            data: liquidAssets,
            borderColor: '#0984e3',
            backgroundColor: 'rgba(9, 132, 227, 0.1)',
            fill: true,
            tension: 0.4
        },
        {
            label: 'Home Equity',
            data: netHomeEquity,
            borderColor: '#fdcb6e',
            backgroundColor: 'rgba(253, 203, 110, 0.1)',
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
                legend: { labels: { color: '#e0e0e0' } },
                annotation: { annotations }
            },
            scales: buildStandardXYScales()
        }
    };
}

/**
 * Builds Chart.js configuration for the Estimated Taxes Paid chart.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Array<string>} labels
 * @param {Object} annotations
 * @returns {Object}
 */
export function buildTaxConfig(yearlyData, state, labels, annotations) {
    const datasets = [
        {
            label: 'Estimated Taxes Paid',
            data: mapData(yearlyData, state, (snap) => snap.taxes),
            backgroundColor: '#d63031',
            borderRadius: 4
        }
    ];

    return {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                annotation: { annotations }
            },
            scales: buildStandardXYScales()
        }
    };
}

function buildSorrDatasets(sorrData) {
    if (!sorrData.early) {
        return [
            {
                label: 'Base Assumption (General Avg)',
                data: sorrData.base,
                borderColor: '#0984e3',
                backgroundColor: 'rgba(9, 132, 227, 0.1)',
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
            borderColor: '#d63031',
            backgroundColor: 'rgba(214, 48, 49, 0.1)',
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
        },
        {
            label: 'Mid Scenario',
            data: sorrData.mid,
            borderColor: '#f6b93b',
            backgroundColor: 'rgba(246, 185, 59, 0.1)',
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
        },
        {
            label: 'Late Scenario',
            data: sorrData.late,
            borderColor: '#00b894',
            backgroundColor: 'rgba(0, 184, 148, 0.1)',
            fill: false,
            tension: 0.4,
            borderDash: [5, 5]
        },
        {
            label: 'Base Assumption',
            data: sorrData.base,
            borderColor: '#0984e3',
            backgroundColor: 'rgba(9, 132, 227, 0.1)',
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
                legend: { labels: { color: '#e0e0e0' } },
                annotation: { annotations }
            },
            scales: buildStandardXYScales()
        }
    };
}
