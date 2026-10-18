/**
 * Unified Tabbed Chart Stage Header & Option 1C Account Pill Controller (SPEC-073)
 * Renders the interactive Option 1C Two-Box Account Pill Header for #portfolioChart
 * and the Clean Summary / Detail View Pill Header for #incomeChart.
 */

import { escapeHtml } from '../../utils/sanitize.js';

const portfolioDatasetVisibility = new Map();

/**
 * Formats a dollar value into a compact string (e.g., $1.08M, $570k, $0).
 * @param {number} amount
 * @returns {string}
 */
export function formatCompactCurrency(amount) {
    const val = Number(amount) || 0;
    const abs = Math.abs(val);
    if (abs >= 1_000_000) {
        return `$${(val / 1_000_000).toFixed(2)}M`;
    }
    if (abs >= 1_000) {
        return `$${Math.round(val / 1_000)}k`;
    }
    return `$${Math.round(val)}`;
}

/**
 * Applies any user-toggled dataset visibility overrides to a newly built Portfolio config.
 * @param {Object} config
 * @param {Object} [state]
 */
export function applyPortfolioVisibilityToConfig(config, state) {
    if (!config?.data?.datasets) return;
    const stateVis = state?.uiState?.portfolioVisibility;
    config.data.datasets.forEach((ds) => {
        if (stateVis && typeof stateVis[ds.label] === 'boolean') {
            ds.hidden = !stateVis[ds.label];
        } else if (portfolioDatasetVisibility.has(ds.label)) {
            ds.hidden = !portfolioDatasetVisibility.get(ds.label);
        }
    });
}

function resolveReferenceIndex(yearlyData, state) {
    if (!yearlyData || yearlyData.length === 0) return 0;
    if (typeof window !== 'undefined' && window.pinnedYearIndex !== null && yearlyData[window.pinnedYearIndex]) {
        return window.pinnedYearIndex;
    }
    const targetRetAge = Number(state?.primarySpouse?.targetRetirementAge) || 60;
    const retIdx = yearlyData.findIndex((snap) => Number(snap.age1) === targetRetAge);
    if (retIdx !== -1) return retIdx;
    return Math.min(yearlyData.length - 1, Math.floor(yearlyData.length / 2));
}

function isDatasetVisibleOnChart(chart, dsIndex) {
    if (!chart) return false;
    if (typeof chart.isDatasetVisible === 'function') {
        return chart.isDatasetVisible(dsIndex);
    }
    return !chart.data?.datasets?.[dsIndex]?.hidden;
}

function setDatasetVisibleOnChart(chart, dsIndex, visible) {
    if (!chart?.data?.datasets?.[dsIndex]) return;
    const ds = chart.data.datasets[dsIndex];
    ds.hidden = !visible;
    if (typeof chart.setDatasetVisibility === 'function') {
        chart.setDatasetVisibility(dsIndex, visible);
    }
    portfolioDatasetVisibility.set(ds.label, visible);
}

function hasAnyPositiveValue(dataArr) {
    if (!Array.isArray(dataArr)) return false;
    return dataArr.some((v) => Number(v) > 0);
}

function buildPillHtml(dsInfo) {
    const activeClass = dsInfo.visible ? 'active' : 'muted';
    const borderStyle = dsInfo.visible ? `border-color: ${dsInfo.color};` : 'border-color: rgba(148, 163, 184, 0.28);';
    const dotColor = dsInfo.visible ? dsInfo.color : '#64748b';
    return `
        <button
            type="button"
            class="opt1c-sub-pill ${activeClass}"
            data-ds-index="${dsInfo.index}"
            style="${borderStyle}"
            title="Click to toggle ${escapeHtml(dsInfo.fullLabel)} on chart"
        >
            <span class="opt1c-dot" style="background: ${dotColor}"></span>
            <span class="opt1c-pill-name">${escapeHtml(dsInfo.shortLabel)}</span>
            <strong class="opt1c-pill-val">${formatCompactCurrency(dsInfo.refValue)}</strong>
        </button>
    `;
}

export function classifyPortfolioDatasets(chart, refIdx, s1Name, s2Name) {
    const datasets = chart?.data?.datasets || [];
    const retirementItems = [];
    const otherItems = [];

    const coreVisibleEvenIfZero = new Set([
        `${s1Name} Trad 401k`,
        `${s2Name} Trad 401k`,
        `${s1Name} Roth IRA`,
        `${s2Name} Roth IRA`,
        'Joint Brokerage',
        'High-Yield Savings (HYSA)',
        'Home Equity',
        '529 College Savings',
        'Total Net Worth'
    ]);

    const retirementLabelSet = new Set([
        `${s1Name} Roth IRA`,
        `${s2Name} Roth IRA`,
        `${s1Name} Trad 401k`,
        `${s2Name} Trad 401k`,
        `${s1Name} 403b`,
        `${s2Name} 403b`,
        `${s1Name} Std IRA`,
        `${s2Name} Std IRA`,
        'Health Savings Account (HSA)'
    ]);

    const shortLabelMap = {
        'High-Yield Savings (HYSA)': 'HYSA',
        'Certificates of Deposit (CD)': 'CDs',
        'Health Savings Account (HSA)': 'HSA',
        'Joint Brokerage': 'Brokerage',
        'Home Equity': 'Home Eq',
        '529 College Savings': '529s',
        'Cash Cushion': 'Cash',
        'Total Net Worth': 'Total Net Worth'
    };

    datasets.forEach((ds, idx) => {
        const hasVal = hasAnyPositiveValue(ds.data);
        if (!hasVal && !coreVisibleEvenIfZero.has(ds.label)) return;

        const item = {
            index: idx,
            fullLabel: ds.label,
            shortLabel: shortLabelMap[ds.label] || ds.label.replace('Trad ', ''),
            color: ds.borderColor || '#60a5fa',
            refValue: Number(ds.data?.[refIdx]) || 0,
            visible: isDatasetVisibleOnChart(chart, idx)
        };

        if (ds.isRetirementAccount || retirementLabelSet.has(ds.label)) {
            retirementItems.push(item);
        } else {
            otherItems.push(item);
        }
    });

    return { retirementItems, otherItems };
}

function buildOption1CTwoBoxHtml(retirementItems, otherItems, refAge) {
    const retTotal = retirementItems.reduce((sum, item) => sum + item.refValue, 0);
    const nonRetItemsExclTotal = otherItems.filter((item) => item.fullLabel !== 'Total Net Worth');
    const otherTotal = nonRetItemsExclTotal.reduce((sum, item) => sum + item.refValue, 0);

    const allRetOn = retirementItems.every((item) => item.visible);
    const allOtherOn = nonRetItemsExclTotal.every((item) => item.visible);

    const retPills = retirementItems.map(buildPillHtml).join('');
    const otherPills = otherItems.map(buildPillHtml).join('');

    return `
        <div class="opt1c-grid">
            <div class="opt1c-bucket-box">
                <div class="opt1c-box-header">
                    <span class="opt1c-box-title opt1c-title-gold">
                        ● RETIREMENT ACCOUNTS (${formatCompactCurrency(retTotal)} AT AGE ${refAge})
                    </span>
                    <button type="button" class="opt1c-group-action" data-group-toggle="retirement">
                        ${allRetOn ? 'All ON ✓ (Hide All)' : 'Show All Retirement'}
                    </button>
                </div>
                <div class="opt1c-pill-wrap">${retPills}</div>
            </div>
            <div class="opt1c-bucket-box">
                <div class="opt1c-box-header">
                    <span class="opt1c-box-title opt1c-title-teal">
                        ● BROKERAGE, CASH, HOME &amp; OTHER (${formatCompactCurrency(otherTotal)} AT AGE ${refAge})
                    </span>
                    <button type="button" class="opt1c-group-action" data-group-toggle="other">
                        ${allOtherOn ? 'All ON ✓ (Hide Non-Ret)' : 'Show All Other'}
                    </button>
                </div>
                <div class="opt1c-pill-wrap">${otherPills}</div>
            </div>
        </div>
    `;
}

function resolveBucketDefinitions(chart, refIdx, retirementItems, otherItems) {
    const datasets = chart?.data?.datasets || [];
    const macroRetIdx = datasets.findIndex((ds) => ds.label === 'Retirement Accounts');
    if (macroRetIdx !== -1) {
        const findBucket = (dsLabel, pillLabel, key, fallbackColor) => {
            const idx = datasets.findIndex((ds) => ds.label === dsLabel);
            const ds = idx !== -1 ? datasets[idx] : null;
            return {
                key,
                label: pillLabel,
                val: ds ? Number(ds.data?.[refIdx]) || 0 : 0,
                color: ds?.borderColor || fallbackColor,
                on: idx !== -1 ? isDatasetVisibleOnChart(chart, idx) : false,
                indices: idx !== -1 ? [idx] : []
            };
        };
        return [
            findBucket('Retirement Accounts', 'Retirement Accounts', 'retirement', '#eab308'),
            findBucket('Brokerage & Cash', 'Brokerage & Cash', 'brokerage', '#14b8a6'),
            findBucket('Home Equity', 'Home Equity', 'home', '#f43f5e'),
            findBucket('Kids 529s & Other', 'Kids 529s & Other', 'college', '#e17055'),
            findBucket('Total Net Worth', 'Total Net Worth Line', 'networth', '#10b981')
        ];
    }

    const brokerageLabels = new Set([
        'Joint Brokerage',
        'High-Yield Savings (HYSA)',
        'Cash Cushion',
        'Certificates of Deposit (CD)'
    ]);
    const retTotal = retirementItems.reduce((s, i) => s + i.refValue, 0);
    const brokItems = otherItems.filter((i) => brokerageLabels.has(i.fullLabel));
    const brokTotal = brokItems.reduce((s, i) => s + i.refValue, 0);
    const homeItem = otherItems.find((i) => i.fullLabel === 'Home Equity');
    const collegeItem = otherItems.find((i) => i.fullLabel === '529 College Savings');
    const nwItem = otherItems.find((i) => i.fullLabel === 'Total Net Worth');

    return [
        {
            key: 'retirement',
            label: 'Retirement Accounts',
            val: retTotal,
            color: '#eab308',
            on: retirementItems.some((i) => i.visible),
            indices: retirementItems.map((i) => i.index)
        },
        {
            key: 'brokerage',
            label: 'Brokerage & Cash',
            val: brokTotal,
            color: '#14b8a6',
            on: brokItems.some((i) => i.visible),
            indices: brokItems.map((i) => i.index)
        },
        {
            key: 'home',
            label: 'Home Equity',
            val: homeItem ? homeItem.refValue : 0,
            color: '#f43f5e',
            on: Boolean(homeItem?.visible),
            indices: homeItem ? [homeItem.index] : []
        },
        {
            key: 'college',
            label: 'Kids 529s & Other',
            val: collegeItem ? collegeItem.refValue : 0,
            color: '#e17055',
            on: Boolean(collegeItem?.visible),
            indices: collegeItem ? [collegeItem.index] : []
        },
        {
            key: 'networth',
            label: 'Total Net Worth Line',
            val: nwItem ? nwItem.refValue : 0,
            color: '#10b981',
            on: Boolean(nwItem?.visible),
            indices: nwItem ? [nwItem.index] : []
        }
    ];
}

function buildGroupedBucketsHtml(buckets) {
    const pills = buckets
        .map(
            (b) => `
            <button
                type="button"
                class="stage-bucket-pill ${b.on ? 'active' : 'off'}"
                data-bucket-key="${b.key}"
                style="${b.on ? `border-color: ${b.color};` : ''}"
            >
                <span class="stage-mini-switch ${b.on ? 'on' : 'off'}">${b.on ? 'ON' : 'OFF'}</span>
                <span class="opt1c-dot" style="background: ${b.on ? b.color : '#64748b'}"></span>
                <span>${escapeHtml(b.label)}</span>
                <strong>${formatCompactCurrency(b.val)}</strong>
            </button>
        `
        )
        .join('');

    return `<div class="stage-bucket-pills-row">${pills}</div>`;
}

function bindPortfolioHeaderEvents(container, chart, retirementItems, otherItems, buckets, rerenderFn) {
    container.querySelectorAll('.opt1c-sub-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-ds-index'), 10);
            const nextState = !isDatasetVisibleOnChart(chart, idx);
            setDatasetVisibleOnChart(chart, idx, nextState);
            chart.update();
            rerenderFn();
        });
    });

    container.querySelectorAll('[data-group-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const group = btn.getAttribute('data-group-toggle');
            const targetList =
                group === 'retirement'
                    ? retirementItems
                    : otherItems.filter((item) => item.fullLabel !== 'Total Net Worth');
            const allOn = targetList.every((item) => item.visible);
            targetList.forEach((item) => setDatasetVisibleOnChart(chart, item.index, !allOn));
            chart.update();
            rerenderFn();
        });
    });

    container.querySelectorAll('.stage-bucket-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-bucket-key');
            const targetBucket = buckets.find((b) => b.key === key);
            if (targetBucket && targetBucket.indices.length > 0) {
                const nextVisible = !targetBucket.on;
                targetBucket.indices.forEach((idx) => setDatasetVisibleOnChart(chart, idx, nextVisible));
                chart.update();
                rerenderFn();
            }
        });
    });
}

/**
 * Builds the 5 macro grouped-bucket datasets for #portfolioChart when portfolioViewMode === 'buckets'.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Function} mapDataFn
 * @returns {Array<Object>}
 */
export function buildMacroPortfolioBucketDatasets(yearlyData, state, mapDataFn) {
    const retirementKeys = [
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
        's1Hsa',
        's2Hsa'
    ];
    const brokerageKeys = ['s1Brokerage', 's2Brokerage', 's1Hysa', 's2Hysa', 's1Cd', 's2Cd', 'cashCushion'];
    const allKeys = [...retirementKeys, ...brokerageKeys, 'college529', 'primaryResidenceEquity'];

    const sumKeys = (balances, keys) => keys.reduce((acc, k) => acc + (Number(balances?.[k]) || 0), 0);

    return [
        {
            label: 'Total Net Worth',
            data: mapDataFn(yearlyData, state, (snap) => sumKeys(snap.balances, allKeys)),
            borderColor: '#10b981',
            backgroundColor: '#10b981',
            borderWidth: 2.5,
            fill: false,
            tension: 0.4,
            yAxisID: 'yNetWorth',
            order: 0
        },
        {
            label: 'Retirement Accounts',
            data: mapDataFn(yearlyData, state, (snap) => sumKeys(snap.balances, retirementKeys)),
            borderColor: '#eab308',
            backgroundColor: 'rgba(234, 179, 8, 0.16)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        },
        {
            label: 'Brokerage & Cash',
            data: mapDataFn(yearlyData, state, (snap) => sumKeys(snap.balances, brokerageKeys)),
            borderColor: '#14b8a6',
            backgroundColor: 'rgba(20, 184, 166, 0.16)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        },
        {
            label: 'Home Equity',
            data: mapDataFn(yearlyData, state, (snap) => Number(snap.balances?.primaryResidenceEquity) || 0),
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.14)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        },
        {
            label: 'Kids 529s & Other',
            data: mapDataFn(yearlyData, state, (snap) => Number(snap.balances?.college529) || 0),
            borderColor: '#e17055',
            backgroundColor: 'rgba(225, 112, 85, 0.14)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        }
    ];
}

/**
 * Renders the Option 1C Two-Box Account Pill Header (or Grouped Buckets bar) above #portfolioChart.
 * @param {Object} portfolioChart
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {string} s1Name
 * @param {string} s2Name
 */
export function renderPortfolioOption1CHeader(portfolioChart, yearlyData, state, s1Name, s2Name) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('portfolio-option1c-header');
    if (!container || !portfolioChart || !yearlyData?.length) return;

    const refIdx = resolveReferenceIndex(yearlyData, state);
    const refAge = yearlyData[refIdx]?.age1 || state?.primarySpouse?.targetRetirementAge || 60;
    const viewMode = state?.uiState?.portfolioViewMode || 'individual';

    const { retirementItems, otherItems } = classifyPortfolioDatasets(portfolioChart, refIdx, s1Name, s2Name);
    const buckets = resolveBucketDefinitions(portfolioChart, refIdx, retirementItems, otherItems);

    container.innerHTML =
        viewMode === 'buckets'
            ? buildGroupedBucketsHtml(buckets)
            : buildOption1CTwoBoxHtml(retirementItems, otherItems, refAge);

    bindPortfolioHeaderEvents(container, portfolioChart, retirementItems, otherItems, buckets, () =>
        renderPortfolioOption1CHeader(portfolioChart, yearlyData, state, s1Name, s2Name)
    );
}

/**
 * Builds the 3 clean macro income bar datasets + expense overlay lines when incomeDetailView is false.
 * @param {Array<Object>} yearlyData
 * @param {Object} state
 * @param {Function} mapDataFn
 * @returns {Array<Object>}
 */
export function buildMacroIncomeDatasets(yearlyData, state, mapDataFn) {
    const workData = mapDataFn(yearlyData, state, (snap) => {
        const s1TakeHome = snap.income?.s1?.takeHome ?? Math.max(0, snap.income?.s1?.w2Net || 0);
        const s2TakeHome = snap.income?.s2?.takeHome ?? Math.max(0, snap.income?.s2?.w2Net || 0);
        return Math.max(0, s1TakeHome) + Math.max(0, s2TakeHome);
    });
    const ssData = mapDataFn(
        yearlyData,
        state,
        (snap) => (snap.income?.s1?.ssn || 0) + (snap.income?.s2?.ssn || 0) + (snap.income?.reverseMortgage || 0)
    );
    const drawData = mapDataFn(yearlyData, state, (snap) => {
        const d = snap.income?.drawdowns || {};
        const drawSum = Object.values(d).reduce((acc, v) => acc + (Number(v) || 0), 0);
        const r72t = (snap.income?.s1?.rule72t || 0) + (snap.income?.s2?.rule72t || 0);
        return drawSum + r72t;
    });

    return [
        {
            label: 'Work & Part-Time Income',
            data: workData,
            backgroundColor: '#10b981',
            stack: 'Income'
        },
        {
            label: 'Social Security & Pensions',
            data: ssData,
            backgroundColor: '#3b82f6',
            stack: 'Income'
        },
        {
            label: 'Portfolio Withdrawals',
            data: drawData,
            backgroundColor: '#eab308',
            stack: 'Income'
        },
        {
            label: 'Total Living Spend + Taxes',
            data: mapDataFn(yearlyData, state, (snap) => snap.expenses + (snap.taxDetails?.nonW2Tax || 0)),
            borderColor: '#f43f5e',
            backgroundColor: '#f43f5e',
            borderWidth: 3,
            type: 'line',
            fill: false,
            stack: 'LineExpTax'
        }
    ];
}

/**
 * Renders the interactive pill bar above #incomeChart.
 * @param {Object} incomeChart
 */
export function renderIncomePillHeader(incomeChart) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('income-pill-header');
    if (!container || !incomeChart?.data?.datasets) return;

    const datasets = incomeChart.data.datasets;
    const pillsHtml = datasets
        .map((ds, idx) => {
            const visible = isDatasetVisibleOnChart(incomeChart, idx);
            const color = ds.borderColor || ds.backgroundColor || '#60a5fa';
            const isLine = ds.type === 'line';
            return `
                <button
                    type="button"
                    class="stage-bucket-pill ${visible ? 'active' : 'off'}"
                    data-inc-ds-index="${idx}"
                    style="${visible ? `border-color: ${color};` : ''}"
                >
                    <span class="stage-mini-switch ${visible ? 'on' : 'off'}">${visible ? 'ON' : 'OFF'}</span>
                    ${
                        isLine
                            ? `<span class="opt1c-line-swatch" style="background: ${visible ? color : '#64748b'}"></span>`
                            : `<span class="opt1c-dot" style="background: ${visible ? color : '#64748b'}"></span>`
                    }
                    <span>${escapeHtml(ds.label)}</span>
                </button>
            `;
        })
        .join('');

    container.innerHTML = `<div class="stage-bucket-pills-row">${pillsHtml}</div>`;

    container.querySelectorAll('[data-inc-ds-index]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-inc-ds-index'), 10);
            const nextState = !isDatasetVisibleOnChart(incomeChart, idx);
            setDatasetVisibleOnChart(incomeChart, idx, nextState);
            incomeChart.update();
            renderIncomePillHeader(incomeChart);
        });
    });
}
