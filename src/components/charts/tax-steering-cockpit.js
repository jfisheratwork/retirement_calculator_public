/**
 * Tax & Withdrawal Steering Cockpit, Pill Header, and Inspector Builders (SPEC-084)
 *
 * Implements Direction 3 (Lifetime Tax & Withdrawal Timeline + Docked 3-Card Yearly
 * Tax, Roth & ACA Steering Cockpit) as well as the redesigned Hover Tooltip for the
 * Taxes & Withdrawals chart stage.
 */

import { escapeHtml } from '../../utils/sanitize.js';

const PERCENT_SCALE = 100;
const MEDICARE_ELIGIBILITY_AGE = 65;
const DEFAULT_SINGLE_FPL = 15650;
const DEFAULT_FPL_PER_EXTRA = 5500;
const FPL_MULT_150 = 1.5;
const FPL_MULT_200 = 2.0;
const FPL_MULT_250 = 2.5;
const FPL_MULT_400 = 4.0;
const DEFAULT_STD_DED_MFJ = 29200;
const DEFAULT_STD_DED_SINGLE = 14600;
const DEFAULT_LTCG_ZERO_MFJ = 94050;
const DEFAULT_LTCG_ZERO_SINGLE = 47025;
const DEFAULT_IRMAA_MFJ = 206000;
const DEFAULT_IRMAA_SINGLE = 103000;
const DEFAULT_B10_MFJ = 23200;
const DEFAULT_B12_MFJ = 94300;
const DEFAULT_B22_MFJ = 201050;
const DEFAULT_B10_SINGLE = 11600;
const DEFAULT_B12_SINGLE = 47150;
const DEFAULT_B22_SINGLE = 100525;
const LTCG_NEXT_TIER_PCT = 15;
const COMPACT_MILLION = 1_000_000;
const COMPACT_THOUSAND = 1_000;

function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(Number(val) || 0);
}

function formatCompact(val) {
    const num = Number(val) || 0;
    const abs = Math.abs(num);
    if (abs >= COMPACT_MILLION) return `$${(num / COMPACT_MILLION).toFixed(2)}M`;
    if (abs >= COMPACT_THOUSAND) return `$${Math.round(num / COMPACT_THOUSAND)}k`;
    return `$${Math.round(num)}`;
}

function computeInflationFactors(snap, state, dataIndex) {
    const isReal = Boolean(state?.assumptions?.displayRealDollars);
    const infRate = Number(state?.assumptions?.inflationRate) || 0;
    const yearsIdx = Math.max(0, Number(dataIndex) || 0);
    const infMult = Math.pow(1 + infRate / PERCENT_SCALE, yearsIdx);
    const deflator = isReal ? infMult : 1;
    return { isReal, infMult, deflator, adj: (v) => (Number(v) || 0) / deflator };
}

function sumKeys(obj, keys) {
    if (!obj) return 0;
    let total = 0;
    for (const k of keys) {
        total += Number(obj[k]) || 0;
    }
    return total;
}

const PRE_TAX_DD_KEYS = ['s1Trad401k', 's2Trad401k', 's1Trad403b', 's2Trad403b', 's1StandardIra', 's2StandardIra'];
const HSA_CASH_DD_KEYS = ['s1Hsa', 's2Hsa', 'cashCushion', 's1Hysa', 's2Hysa', 's1Cd', 's2Cd'];

function resolveRawOrdinarySources(inc, snap) {
    const s1 = inc.s1 || {};
    const s2 = inc.s2 || {};
    const dd = inc.drawdowns || {};
    const w2Raw = (s1.w2TaxableGross ?? s1.w2Net ?? 0) + (s2.w2TaxableGross ?? s2.w2Net ?? 0);
    const totalPreTaxRaw = sumKeys(dd, PRE_TAX_DD_KEYS);
    const mandatoryRmdRaw = Number(inc.mandatoryRmd) || sumKeys(s1, ['rmd']) + sumKeys(s2, ['rmd']);
    const voluntaryPreTaxRaw = Math.max(0, totalPreTaxRaw - mandatoryRmdRaw);
    const rule72tRaw = sumKeys(s1, ['rule72t']) + sumKeys(s2, ['rule72t']);
    const rothConvRaw = sumKeys(snap?.rothConverted, ['s1', 's2']);
    return { w2Raw, voluntaryPreTaxRaw, mandatoryRmdRaw, rule72tRaw, rothConvRaw };
}

function resolveRawSsnAndBrokerageSources(inc, snap, td) {
    const s1 = inc.s1 || {};
    const s2 = inc.s2 || {};
    const dd = inc.drawdowns || {};
    const totalSsnRaw = sumKeys(s1, ['ssn']) + sumKeys(s2, ['ssn']);
    const taxableSsnRaw = td.taxableSsn !== undefined ? Number(td.taxableSsn) : totalSsnRaw * 0.85;
    const untaxedSsnRaw = Math.max(0, totalSsnRaw - taxableSsnRaw);
    const totalBrokRaw = sumKeys(dd, ['s1Brokerage', 's2Brokerage']);
    const realizedLtcgRaw = Number(td.realizedLtcg ?? snap?.realizedLtcg ?? 0);
    const brokBasisRaw =
        td.brokerageBasisDrawn !== undefined
            ? Number(td.brokerageBasisDrawn)
            : Math.max(0, totalBrokRaw - realizedLtcgRaw);
    const rothDrawsRaw = sumKeys(dd, ['s1RothIra', 's2RothIra']);
    const hsaCashRaw = sumKeys(dd, HSA_CASH_DD_KEYS);
    return { taxableSsnRaw, untaxedSsnRaw, realizedLtcgRaw, brokBasisRaw, rothDrawsRaw, hsaCashRaw };
}

function extractWithdrawalAndMagiSources(snap, td, adj) {
    const inc = snap?.income || {};
    const ord = resolveRawOrdinarySources(inc, snap);
    const sub = resolveRawSsnAndBrokerageSources(inc, snap, td);

    const computedOrdSum =
        ord.w2Raw + ord.voluntaryPreTaxRaw + ord.mandatoryRmdRaw + ord.rule72tRaw + ord.rothConvRaw + sub.taxableSsnRaw;
    const grossOrdRaw = td.grossTaxableOrdinary ?? td.grossTaxableIncome ?? computedOrdSum;
    const acaMagiRaw =
        td.acaMagi ?? Math.max(Number(td.magi) || 0, grossOrdRaw + sub.untaxedSsnRaw + sub.realizedLtcgRaw);

    const w2Taxable = adj(ord.w2Raw);
    const voluntaryPreTaxDraws = adj(ord.voluntaryPreTaxRaw);
    const mandatoryRmdDraws = adj(ord.mandatoryRmdRaw);
    const rule72tDraws = adj(ord.rule72tRaw);
    const rothConversions = adj(ord.rothConvRaw);
    const taxableSsn = adj(sub.taxableSsnRaw);
    const untaxedSsn = adj(sub.untaxedSsnRaw);
    const realizedLtcg = adj(sub.realizedLtcgRaw);
    const brokerageBasisDrawn = adj(sub.brokBasisRaw);
    const rothDraws = adj(sub.rothDrawsRaw);
    const hsaCashDraws = adj(sub.hsaCashRaw);

    const totalTaxFreeDraws = brokerageBasisDrawn + rothDraws + hsaCashDraws;
    const totalTaxablePortfolioDraws = voluntaryPreTaxDraws + mandatoryRmdDraws + rule72tDraws + realizedLtcg;

    return {
        w2Taxable,
        voluntaryPreTaxDraws,
        mandatoryRmdDraws,
        rule72tDraws,
        rothConversions,
        taxableSsn,
        untaxedSsn,
        realizedLtcg,
        brokerageBasisDrawn,
        rothDraws,
        hsaCashDraws,
        totalTaxFreeDraws,
        totalTaxablePortfolioDraws,
        totalPortfolioDraws: totalTaxablePortfolioDraws + totalTaxFreeDraws,
        grossOrd: adj(grossOrdRaw),
        acaMagi: adj(acaMagiRaw)
    };
}

function pickNum(obj, keyA, keyB) {
    if (!obj) return 0;
    const raw = obj[keyA] !== undefined ? obj[keyA] : obj[keyB];
    return Number(raw) || 0;
}

function extractTaxBillSummary(snap, td, adj) {
    const fedTotal = adj(pickNum(td, 'federalTax', 'fedTax'));
    const capGainsPlusNiit = adj(pickNum(td, 'capitalGainsTax', 'ltcgTax'));
    const niitTax = adj(pickNum(td, 'niitTax', 'niitTax'));
    const ltcgTax = Math.max(0, capGainsPlusNiit - niitTax);
    const fedOrdinaryTax = Math.max(0, fedTotal - capGainsPlusNiit);
    const stateTax = adj(pickNum(td, 'stateTax', 'stateTax'));
    const ficaTax = adj(pickNum(td, 'ficaTax', 'ficaTax'));
    const irmaa = adj(pickNum(snap?.expenseBreakdown, 'irmaa', 'irmaa'));
    const earlyPenalty = adj(td.earlyWithdrawalPenalty ?? snap?.earlyWithdrawalPenalty ?? 0);
    const totalTaxBurden = fedOrdinaryTax + ltcgTax + niitTax + stateTax + ficaTax + irmaa + earlyPenalty;
    const topBracketRate = pickNum(td, 'topBracketRate', 'topBracket');
    const effectiveRate = pickNum(td, 'effectiveRate', 'effectiveRate');

    return {
        fedOrdinaryTax,
        ltcgTax,
        niitTax,
        stateTax,
        ficaTax,
        irmaa,
        earlyPenalty,
        totalTaxBurden,
        topBracketPct: (topBracketRate * PERCENT_SCALE).toFixed(1),
        effectiveRatePct: (effectiveRate * PERCENT_SCALE).toFixed(1)
    };
}

function resolveBracketCeilings(td, isSingle, infMult, adj) {
    const brackets = td.brackets || [];
    const def10 = isSingle ? DEFAULT_B10_SINGLE : DEFAULT_B10_MFJ;
    const def12 = isSingle ? DEFAULT_B12_SINGLE : DEFAULT_B12_MFJ;
    const def22 = isSingle ? DEFAULT_B22_SINGLE : DEFAULT_B22_MFJ;
    return {
        b10Ceil: adj(brackets[0]?.upTo || def10 * infMult),
        b12Ceil: adj(brackets[1]?.upTo || def12 * infMult),
        b22Ceil: adj(brackets[2]?.upTo || def22 * infMult)
    };
}

function computeBracketThermometer(td, sources, infMult, adj) {
    const isSingle = (td.filingStatus || 'mfj').toLowerCase() === 'single';
    const baseStd = isSingle ? DEFAULT_STD_DED_SINGLE : DEFAULT_STD_DED_MFJ;
    const stdDed = adj(td.standardDeduction || baseStd * infMult);
    const agi = Math.max(0, sources.grossOrd - stdDed);
    const { b10Ceil, b12Ceil, b22Ceil } = resolveBracketCeilings(td, isSingle, infMult, adj);

    const roomToFill = adj(
        td.remainingRoomInBracket ?? td.bracketRoom ?? Math.max(0, stdDed + b12Ceil - sources.grossOrd)
    );
    const dropDelta = adj(td.dropBracketDelta ?? 0);

    const usedStd = Math.min(sources.grossOrd, stdDed);
    const used10 = Math.max(0, Math.min(agi, b10Ceil));
    const used12 = Math.max(0, Math.min(agi - b10Ceil, b12Ceil - b10Ceil));
    const used22Plus = Math.max(0, agi - b12Ceil);
    const gaugeMax = Math.max(stdDed + b12Ceil, sources.grossOrd + roomToFill, 1);
    const toPct = (v) => Math.max(0, Math.min(PERCENT_SCALE, Math.round((v / gaugeMax) * PERCENT_SCALE)));

    return {
        stdDed,
        agi,
        b10Ceil,
        b12Ceil,
        b22Ceil,
        roomToFill,
        dropDelta,
        stdWidthPct: toPct(usedStd),
        b10WidthPct: toPct(used10),
        b12WidthPct: toPct(used12),
        b22WidthPct: toPct(used22Plus),
        roomWidthPct: toPct(roomToFill)
    };
}

function computeAcaAndIrmaaThermometer(snap, td, sources, ctx) {
    const { state, infMult, adj } = ctx;
    const isSingle = (td.filingStatus || 'mfj').toLowerCase() === 'single';
    const defaultSize = isSingle ? 1 : 2 + (state?.dependents?.length || 0);
    const householdSize = Number(td.acaHouseholdSize) || defaultSize;
    const rawFpl100 =
        Number(td.acaFpl100) || (DEFAULT_SINGLE_FPL + DEFAULT_FPL_PER_EXTRA * (householdSize - 1)) * infMult;
    const fpl100 = adj(rawFpl100);
    const fpl150 = fpl100 * FPL_MULT_150;
    const fpl200 = fpl100 * FPL_MULT_200;
    const fpl250 = fpl100 * FPL_MULT_250;
    const fpl400 = fpl100 * FPL_MULT_400;

    const magi = sources.acaMagi;
    const fplRatioPct = fpl100 > 0 ? Math.round((magi / fpl100) * PERCENT_SCALE) : 0;
    const isMedicareAge = Number(snap?.age1 || 0) >= MEDICARE_ELIGIBILITY_AGE;
    const baseIrmaa = isSingle ? DEFAULT_IRMAA_SINGLE : DEFAULT_IRMAA_MFJ;
    const irmaaThreshold = adj(td.irmaaThreshold || baseIrmaa * infMult);

    return {
        householdSize,
        fpl100,
        fpl150,
        fpl200,
        fpl250,
        fpl400,
        fplRatioPct,
        isMedicareAge,
        irmaaThreshold,
        deltaTo400Fpl: fpl400 - magi,
        deltaTo250Fpl: fpl250 - magi,
        deltaTo200Fpl: fpl200 - magi,
        deltaToIrmaa: irmaaThreshold - magi
    };
}

function computeLtcgThermometer(td, sources, bracketThermo, ctx) {
    const { infMult, adj } = ctx;
    const isSingle = (td.filingStatus || 'mfj').toLowerCase() === 'single';
    const baseZero = isSingle ? DEFAULT_LTCG_ZERO_SINGLE : DEFAULT_LTCG_ZERO_MFJ;
    const ltcgZeroCeiling = adj(td.ltcgZeroCeiling || baseZero * infMult);
    const remainingZeroRoom =
        td.remainingLtcgZeroRoom !== undefined
            ? adj(td.remainingLtcgZeroRoom)
            : Math.max(0, ltcgZeroCeiling - (bracketThermo.agi + sources.realizedLtcg));

    const totalStack = Math.max(ltcgZeroCeiling, bracketThermo.agi + sources.realizedLtcg, 1);
    const ordWidthPct = Math.min(PERCENT_SCALE, Math.round((bracketThermo.agi / totalStack) * PERCENT_SCALE));
    const gainWidthPct = Math.min(PERCENT_SCALE, Math.round((sources.realizedLtcg / totalStack) * PERCENT_SCALE));
    const zeroRoomWidthPct = Math.max(0, Math.min(PERCENT_SCALE, PERCENT_SCALE - ordWidthPct - gainWidthPct));
    const taxFreeSharePct =
        sources.totalPortfolioDraws > 0
            ? Math.round((sources.totalTaxFreeDraws / sources.totalPortfolioDraws) * PERCENT_SCALE)
            : 0;

    return {
        ltcgZeroCeiling,
        grossZeroCeiling: ltcgZeroCeiling + bracketThermo.stdDed,
        remainingZeroRoom,
        ordWidthPct,
        gainWidthPct,
        zeroRoomWidthPct,
        taxFreeSharePct,
        currentLtcgRatePct: remainingZeroRoom > 0 ? 0 : LTCG_NEXT_TIER_PCT
    };
}

function buildCockpitAgeLabel(snap, state) {
    const s1Name = escapeHtml(state?.primarySpouse?.name || 'Spouse 1');
    const s2Name = escapeHtml(state?.secondarySpouse?.name || 'Spouse 2');
    const isSingle = Boolean(
        state?.assumptions?.taxFilingStatus === 'single' || snap.age2 === null || snap.age2 === undefined
    );
    return isSingle
        ? `${snap.year} (${s1Name} ${snap.age1})`
        : `${snap.year} (${s1Name} ${snap.age1} / ${s2Name} ${snap.age2})`;
}

/**
 * Computes the complete view-model for the Taxes & Withdrawals Cockpit and Hover Tooltip.
 * @param {Object} snap
 * @param {Object} state
 * @param {number} [dataIndex=0]
 * @returns {Object|null}
 */
export function computeTaxAndWithdrawalCockpit(snap, state, dataIndex = 0) {
    if (!snap) return null;
    const td = snap.taxDetails || {};
    const { isReal, infMult, adj } = computeInflationFactors(snap, state, dataIndex);
    const sources = extractWithdrawalAndMagiSources(snap, td, adj);
    const taxes = extractTaxBillSummary(snap, td, adj);
    const bracketThermo = computeBracketThermometer(td, sources, infMult, adj);
    const acaThermo = computeAcaAndIrmaaThermometer(snap, td, sources, { state, infMult, adj });
    const ltcgThermo = computeLtcgThermometer(td, sources, bracketThermo, { infMult, adj });

    return {
        year: snap.year,
        ageLabel: buildCockpitAgeLabel(snap, state),
        filingStatus: (td.filingStatus || 'MFJ').toUpperCase(),
        isReal,
        sources,
        taxes,
        bracketThermo,
        acaThermo,
        ltcgThermo
    };
}

function renderBracketCardHtml(vm) {
    const bt = vm.bracketThermo;
    const fillActionText =
        bt.roomToFill > 0
            ? `<span style="color: #34d399; font-weight: 700;">+${formatCurrency(bt.roomToFill)}</span>`
            : `<span style="color: #94a3b8;">Bracket Full</span>`;
    const dropActionText =
        bt.dropDelta > 0
            ? `<span style="color: #fbbf24; font-weight: 600;">-${formatCurrency(bt.dropDelta)}</span>`
            : `<span style="color: #34d399;">At 0% Standard Ded.</span>`;

    return `
        <div class="tax-cockpit-card">
            <div>
                <div class="tax-cockpit-card-header">
                    <span class="tax-cockpit-card-title" style="color: #a5b4fc;">1. Federal Bracket &amp; Roth Fill</span>
                    <span class="tax-cockpit-badge" style="background: rgba(99, 102, 241, 0.2); color: #c7d2fe;">
                        Top Bracket: ${vm.taxes.topBracketPct}%
                    </span>
                </div>
                <div class="tax-cockpit-subtext">
                    Ordinary Gross: <strong>${formatCurrency(vm.sources.grossOrd)}</strong> · Taxable (after ${formatCompact(bt.stdDed)} ded.): <strong>${formatCurrency(bt.agi)}</strong>
                </div>
                <div class="tax-thermo-bar" title="Federal Ordinary Tax Bracket Fill">
                    <div class="tax-thermo-seg" style="width: ${bt.stdWidthPct}%; background: #475569;" title="0% Standard Deduction (${formatCurrency(bt.stdDed)})">0%</div>
                    <div class="tax-thermo-seg" style="width: ${bt.b10WidthPct}%; background: #0284c7;" title="10% Bracket">10%</div>
                    <div class="tax-thermo-seg" style="width: ${bt.b12WidthPct}%; background: #6366f1;" title="12% Bracket">12%</div>
                    ${bt.b22WidthPct > 0 ? `<div class="tax-thermo-seg" style="width: ${bt.b22WidthPct}%; background: #d97706;" title="22%+ Brackets">22%+</div>` : ''}
                    ${bt.roomWidthPct > 0 ? `<div class="tax-thermo-seg tax-thermo-headroom" style="width: ${bt.roomWidthPct}%;" title="Remaining Room in Current Bracket">+${formatCompact(bt.roomToFill)}</div>` : ''}
                </div>
            </div>
            <div class="tax-cockpit-levers">
                <div class="tax-lever-row">
                    <span>▲ Room to fill ${vm.taxes.topBracketPct}% bracket (Roth Conv):</span>
                    ${fillActionText}
                </div>
                <div class="tax-lever-row">
                    <span>▼ Reduce taxable to drop bracket:</span>
                    ${dropActionText}
                </div>
            </div>
        </div>
    `;
}

function renderIrmaaCardHtml(vm, aca, magi) {
    const underIrmaa = aca.deltaToIrmaa >= 0;
    const badgeColor = underIrmaa
        ? 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7;'
        : 'background: rgba(244, 63, 94, 0.2); color: #fda4af;';
    const fillPct = Math.min(
        PERCENT_SCALE,
        Math.round((magi / Math.max(aca.irmaaThreshold * 1.25, 1)) * PERCENT_SCALE)
    );
    return `
        <div class="tax-cockpit-card">
            <div>
                <div class="tax-cockpit-card-header">
                    <span class="tax-cockpit-card-title" style="color: #6ee7b7;">2. Medicare IRMAA MAGI Guardrail</span>
                    <span class="tax-cockpit-badge" style="${badgeColor}">
                        ${underIrmaa ? 'Safe (No IRMAA)' : 'IRMAA Triggered'}
                    </span>
                </div>
                <div class="tax-cockpit-subtext">
                    Est. MAGI: <strong>${formatCurrency(magi)}</strong> vs. Tier 1 Cliff (<strong>${formatCurrency(aca.irmaaThreshold)}</strong>)
                </div>
                <div class="tax-thermo-bar">
                    <div class="tax-thermo-seg" style="width: ${fillPct}%; background: ${underIrmaa ? '#059669' : '#e11d48'};">MAGI ${formatCompact(magi)}</div>
                </div>
            </div>
            <div class="tax-cockpit-levers">
                <div class="tax-lever-row">
                    <span>${underIrmaa ? '▲ Room before Tier 1 IRMAA Cliff:' : '▼ Reduce MAGI to avoid IRMAA:'}</span>
                    <span style="color: ${underIrmaa ? '#34d399' : '#fb7185'}; font-weight: 700;">
                        ${underIrmaa ? '+' : ''}${formatCurrency(aca.deltaToIrmaa)}
                    </span>
                </div>
                <div class="tax-lever-row">
                    <span>Annual Medicare IRMAA Surcharge:</span>
                    <span style="font-weight: 600; color: #e2e8f0;">${formatCurrency(vm.taxes.irmaa)}</span>
                </div>
            </div>
        </div>
    `;
}

function renderAcaCardHtml(aca, magi) {
    const under400 = aca.deltaTo400Fpl >= 0;
    const badgeStyle = under400
        ? 'background: rgba(16, 185, 129, 0.2); color: #6ee7b7;'
        : 'background: rgba(245, 158, 11, 0.2); color: #fcd34d;';
    const barScale = Math.max(aca.fpl400 * 1.2, magi, 1);
    const w200 = Math.min(PERCENT_SCALE, Math.round((Math.min(magi, aca.fpl200) / barScale) * PERCENT_SCALE));
    const w400 = Math.max(
        0,
        Math.min(
            PERCENT_SCALE,
            Math.round((Math.min(Math.max(0, magi - aca.fpl200), aca.fpl400 - aca.fpl200) / barScale) * PERCENT_SCALE)
        )
    );
    const wOver = Math.max(
        0,
        Math.min(PERCENT_SCALE, Math.round((Math.max(0, magi - aca.fpl400) / barScale) * PERCENT_SCALE))
    );

    return `
        <div class="tax-cockpit-card">
            <div>
                <div class="tax-cockpit-card-header">
                    <span class="tax-cockpit-card-title" style="color: #6ee7b7;">2. ACA Healthcare MAGI Guardrail</span>
                    <span class="tax-cockpit-badge" style="${badgeStyle}">
                        ${aca.fplRatioPct}% FPL (${aca.householdSize}p HH)
                    </span>
                </div>
                <div class="tax-cockpit-subtext">
                    Est. MAGI: <strong>${formatCurrency(magi)}</strong> · 400% FPL Cliff: <strong>${formatCurrency(aca.fpl400)}</strong>
                </div>
                <div class="tax-thermo-bar">
                    <div class="tax-thermo-seg" style="width: ${w200}%; background: #059669;" title="Up to 200% FPL CSR (${formatCurrency(aca.fpl200)})">≤200%</div>
                    ${w400 > 0 ? `<div class="tax-thermo-seg" style="width: ${w400}%; background: #0d9488;" title="200%–400% FPL Subsidy Tier">≤400%</div>` : ''}
                    ${wOver > 0 ? `<div class="tax-thermo-seg" style="width: ${wOver}%; background: #e11d48;" title="Over 400% FPL Cliff">Over</div>` : ''}
                </div>
            </div>
            <div class="tax-cockpit-levers">
                <div class="tax-lever-row">
                    <span>${under400 ? '▲ MAGI room below 400% FPL Cliff:' : '▼ Reduce MAGI to hit 400% FPL:'}</span>
                    <span style="color: ${under400 ? '#34d399' : '#fb7185'}; font-weight: 700;">
                        ${under400 ? '+' : ''}${formatCurrency(aca.deltaTo400Fpl)}
                    </span>
                </div>
                <div class="tax-lever-row">
                    <span>${aca.deltaTo250Fpl >= 0 ? '▲ Room below 250% CSR Tier:' : '▼ To hit 250% CSR (' + formatCompact(aca.fpl250) + '):'}</span>
                    <span style="color: #cbd5e1; font-weight: 600;">
                        ${aca.deltaTo250Fpl >= 0 ? '+' : ''}${formatCurrency(aca.deltaTo250Fpl)}
                    </span>
                </div>
            </div>
        </div>
    `;
}

function renderAcaOrIrmaaCardHtml(vm) {
    const aca = vm.acaThermo;
    const magi = vm.sources.acaMagi;
    return aca.isMedicareAge ? renderIrmaaCardHtml(vm, aca, magi) : renderAcaCardHtml(aca, magi);
}

function renderLtcgAndMixCardHtml(vm) {
    const lt = vm.ltcgThermo;
    return `
        <div class="tax-cockpit-card">
            <div>
                <div class="tax-cockpit-card-header">
                    <span class="tax-cockpit-card-title" style="color: #fcd34d;">3. 0% Capital Gains &amp; Tax-Free Mix</span>
                    <span class="tax-cockpit-badge" style="background: rgba(245, 158, 11, 0.2); color: #fde68a;">
                        ${lt.currentLtcgRatePct}% LTCG Tier
                    </span>
                </div>
                <div class="tax-cockpit-subtext">
                    0% LTCG Ceiling (incl. Std Ded): <strong>${formatCurrency(lt.grossZeroCeiling)}</strong> · Realized Gains: <strong>${formatCurrency(vm.sources.realizedLtcg)}</strong>
                </div>
                <div class="tax-thermo-bar">
                    <div class="tax-thermo-seg" style="width: ${lt.ordWidthPct}%; background: #4f46e5;" title="Taxable Ordinary Income">Ord</div>
                    ${lt.gainWidthPct > 0 ? `<div class="tax-thermo-seg" style="width: ${lt.gainWidthPct}%; background: #14b8a6;" title="Realized LTCG (${formatCurrency(vm.sources.realizedLtcg)})">LTCG</div>` : ''}
                    ${lt.zeroRoomWidthPct > 0 ? `<div class="tax-thermo-seg tax-thermo-headroom-gold" style="width: ${lt.zeroRoomWidthPct}%;" title="Remaining 0% Capital Gains Room">+${formatCompact(lt.remainingZeroRoom)} @ 0%</div>` : ''}
                </div>
            </div>
            <div class="tax-cockpit-levers">
                <div class="tax-lever-row">
                    <span>▲ Remaining 0% LTCG harvest room:</span>
                    <span style="color: #fbbf24; font-weight: 700;">+${formatCurrency(lt.remainingZeroRoom)}</span>
                </div>
                <div class="tax-lever-row">
                    <span>Tax-Free Draws (Roth + Brokerage Basis):</span>
                    <span style="color: #34d399; font-weight: 600;">
                        ${formatCurrency(vm.sources.totalTaxFreeDraws)} (${lt.taxFreeSharePct}%)
                    </span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Renders the docked 3-Card Yearly Tax, Roth & ACA Steering Cockpit below the chart canvas.
 * @param {Object} snap
 * @param {Object} state
 * @param {number} [dataIndex=0]
 * @returns {string} HTML markup
 */
export function renderTaxSteeringCockpit(snap, state, dataIndex = 0) {
    const vm = computeTaxAndWithdrawalCockpit(snap, state, dataIndex);
    if (!vm) return '';
    const dollarModeLabel = vm.isReal ? "Today's Dollars" : 'Nominal Dollars';

    return `
        <div class="tax-cockpit-shell">
            <div class="tax-cockpit-topbar">
                <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                    <span class="tax-cockpit-year-pill">🎯 ${vm.ageLabel}</span>
                    <span class="tax-cockpit-headline">
                        Yearly Tax, Roth Conversion &amp; MAGI Steering Cockpit
                    </span>
                </div>
                <div class="tax-cockpit-meta">
                    <span>Total Tax: <strong style="color: #fb7185;">${formatCurrency(vm.taxes.totalTaxBurden)}</strong> (${vm.taxes.effectiveRatePct}% Eff.)</span>
                    <span>·</span>
                    <span>MAGI: <strong style="color: #93c5fd;">${formatCurrency(vm.sources.acaMagi)}</strong></span>
                    <span>·</span>
                    <span>${dollarModeLabel}</span>
                </div>
            </div>
            <div class="tax-cockpit-grid">
                ${renderBracketCardHtml(vm)}
                ${renderAcaOrIrmaaCardHtml(vm)}
                ${renderLtcgAndMixCardHtml(vm)}
            </div>
        </div>
    `;
}

function renderInspectorRowIfPositive(label, amount, dotColor, valueColor = '#f8fafc') {
    if (!amount || amount <= 0) return '';
    return `
        <div class="inspector-row" style="font-size: 0.82rem;">
            <span class="inspector-label">
                <span class="inspector-color" style="background:${dotColor}; border: 1px solid ${dotColor};"></span>
                ${label}
            </span>
            <span class="inspector-value" style="color: ${valueColor};">${formatCurrency(amount)}</span>
        </div>
    `;
}

function renderTooltipMagiSection(vm) {
    const s = vm.sources;
    let html = `
        <div style="margin-bottom: 8px;">
            <div style="color: var(--text-muted); font-size: 0.75rem; margin-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.16); padding-bottom: 2px; text-transform: uppercase; font-weight: 700;">
                1. Taxable Income &amp; MAGI Stack
            </div>
    `;
    html += renderInspectorRowIfPositive('W-2 Taxable Wages', s.w2Taxable, '#38bdf8');
    html += renderInspectorRowIfPositive('Pre-Tax Draws (401k/IRA)', s.voluntaryPreTaxDraws, '#2dd4bf');
    html += renderInspectorRowIfPositive('Mandatory RMDs (Age 73+)', s.mandatoryRmdDraws, '#fb923c');
    html += renderInspectorRowIfPositive('Rule 72(t) SEPP Payout', s.rule72tDraws, '#f59e0b');
    html += renderInspectorRowIfPositive('Roth Conversion (Bracket Fill)', s.rothConversions, '#c084fc');
    html += renderInspectorRowIfPositive('Taxable Social Security', s.taxableSsn, '#34d399');
    html += renderInspectorRowIfPositive('Realized Brokerage LTCG', s.realizedLtcg, '#fbbf24');
    html += renderInspectorRowIfPositive('Untaxed SS (In ACA MAGI)', s.untaxedSsn, '#94a3b8');

    html += `
            <div class="inspector-row" style="font-size: 0.83rem; font-weight: 700; margin-top: 3px; border-top: 1px dashed rgba(255,255,255,0.12); padding-top: 2px;">
                <span class="inspector-label">Estimated MAGI (ACA Baseline)</span>
                <span class="inspector-value" style="color: #93c5fd;">${formatCurrency(s.acaMagi)}</span>
            </div>
            <div class="inspector-row" style="font-size: 0.8rem; color: #cbd5e1;">
                <span class="inspector-label">Taxable Ordinary (After ${formatCompact(vm.bracketThermo.stdDed)} Ded.)</span>
                <span class="inspector-value" style="color: #a5b4fc;">${formatCurrency(vm.bracketThermo.agi)}</span>
            </div>
        </div>
    `;
    return html;
}

function renderTooltipTaxFreeSection(vm) {
    const s = vm.sources;
    if (s.totalTaxFreeDraws <= 0) return '';
    let html = `
        <div style="margin-bottom: 8px; padding: 6px 8px; border-radius: 6px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25);">
            <div style="color: #6ee7b7; font-size: 0.74rem; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">
                2. Tax-Free Withdrawals (0% MAGI Impact)
            </div>
    `;
    html += renderInspectorRowIfPositive('Brokerage Cost Basis Return', s.brokerageBasisDrawn, '#60a5fa', '#6ee7b7');
    html += renderInspectorRowIfPositive('Roth IRA Tax-Free Draw', s.rothDraws, '#a78bfa', '#6ee7b7');
    html += renderInspectorRowIfPositive('HSA / HYSA / Cash Cushion', s.hsaCashDraws, '#34d399', '#6ee7b7');
    html += `</div>`;
    return html;
}

function renderTooltipTaxBillSection(vm) {
    const t = vm.taxes;
    let html = `
        <div style="margin-bottom: 8px;">
            <div style="color: var(--text-muted); font-size: 0.75rem; margin-bottom: 3px; border-bottom: 1px solid rgba(255,255,255,0.16); padding-bottom: 2px; text-transform: uppercase; font-weight: 700;">
                3. Itemized Tax Bill (${vm.filingStatus})
            </div>
    `;
    html += renderInspectorRowIfPositive('Federal Ordinary Income Tax', t.fedOrdinaryTax, '#f43f5e');
    html += renderInspectorRowIfPositive('Long-Term Capital Gains Tax', t.ltcgTax, '#fbbf24');
    html += renderInspectorRowIfPositive('3.8% Net Investment Tax (NIIT)', t.niitTax, '#f97316');
    html += renderInspectorRowIfPositive('State Income Tax', t.stateTax, '#fb923c');
    html += renderInspectorRowIfPositive('FICA Payroll Tax', t.ficaTax, '#38bdf8');
    html += renderInspectorRowIfPositive('Medicare IRMAA Surcharge', t.irmaa, '#e879f9');
    html += renderInspectorRowIfPositive('⚠️ 10% Early Penalty (Pre-59.5)', t.earlyPenalty, '#ef4444', '#fca5a5');

    html += `
            <div class="inspector-row" style="font-size: 0.84rem; font-weight: 700; margin-top: 3px; border-top: 1px dashed rgba(255,255,255,0.12); padding-top: 2px;">
                <span class="inspector-label">Total Tax Burden (${t.effectiveRatePct}% Eff.)</span>
                <span class="inspector-value" style="color: #fb7185;">${formatCurrency(t.totalTaxBurden)}</span>
            </div>
        </div>
    `;
    return html;
}

function renderTooltipSteeringSummarySection(vm) {
    const bt = vm.bracketThermo;
    const aca = vm.acaThermo;
    const lt = vm.ltcgThermo;
    const acaRow = aca.isMedicareAge
        ? `<div class="inspector-row" style="font-size: 0.8rem;"><span class="inspector-label">IRMAA Cliff Room (${formatCompact(aca.irmaaThreshold)}):</span><span class="inspector-value" style="color: ${aca.deltaToIrmaa >= 0 ? '#34d399' : '#fb7185'};">${aca.deltaToIrmaa >= 0 ? '+' : ''}${formatCurrency(aca.deltaToIrmaa)}</span></div>`
        : `<div class="inspector-row" style="font-size: 0.8rem;"><span class="inspector-label">ACA 400% FPL (${aca.fplRatioPct}% FPL):</span><span class="inspector-value" style="color: ${aca.deltaTo400Fpl >= 0 ? '#34d399' : '#fb7185'};">${aca.deltaTo400Fpl >= 0 ? '+' : ''}${formatCurrency(aca.deltaTo400Fpl)}</span></div>`;

    return `
        <div style="padding: 6px 8px; border-radius: 6px; background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3);">
            <div style="color: #a5b4fc; font-size: 0.74rem; font-weight: 700; text-transform: uppercase; margin-bottom: 3px;">
                4. Bracket, Roth &amp; ACA Levers
            </div>
            <div class="inspector-row" style="font-size: 0.8rem;">
                <span class="inspector-label">Fill ${vm.taxes.topBracketPct}% Bracket (Roth Conv):</span>
                <span class="inspector-value" style="color: #34d399; font-weight: 700;">+${formatCurrency(bt.roomToFill)}</span>
            </div>
            <div class="inspector-row" style="font-size: 0.8rem;">
                <span class="inspector-label">Drop below ${vm.taxes.topBracketPct}% Bracket:</span>
                <span class="inspector-value" style="color: #fbbf24;">-${formatCurrency(bt.dropDelta)}</span>
            </div>
            ${acaRow}
            <div class="inspector-row" style="font-size: 0.8rem;">
                <span class="inspector-label">0% Capital Gains Room:</span>
                <span class="inspector-value" style="color: #fcd34d;">+${formatCurrency(lt.remainingZeroRoom)}</span>
            </div>
        </div>
    `;
}

/**
 * Renders the Redesigned Hover Tooltip for the Taxes & Withdrawals charts (#taxChart & #cashflowChart).
 * @param {Object} snap
 * @param {Object} state
 * @param {number} [dataIndex=0]
 * @returns {string} HTML markup
 */
export function renderTaxStrategyInspector(snap, state, dataIndex = 0) {
    const vm = computeTaxAndWithdrawalCockpit(snap, state, dataIndex);
    if (!vm) return '';

    let html = '';
    html += renderTooltipMagiSection(vm);
    html += renderTooltipTaxFreeSection(vm);
    html += renderTooltipTaxBillSection(vm);
    html += renderTooltipSteeringSummarySection(vm);
    return html;
}
