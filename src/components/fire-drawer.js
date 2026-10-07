/**
 * FIRE Drawer Web Component
 * 
 * Interactive slide-out drawer providing in-depth inspection, parameter tuning,
 * and trajectory crossover visualization for Coast FIRE, Barista FIRE,
 * Lean FIRE, and Full FIRE milestones.
 * 
 * Written with the assistance of Google Gemini
 */

import { BaseComponent } from './base-component.js';
import {
    FireMilestoneCalculator,
    formatAgeString,
    DEFAULT_COAST_TARGET_AGE,
    DEFAULT_BARISTA_ANNUAL_INCOME,
    DEFAULT_LEAN_EXPENSE_RATIO
} from '../services/FireMilestoneCalculator.js';
import { FinancialPresentationService } from '../services/FinancialPresentationService.js';
import { renderFireIndicator } from './fire-indicator.js';

export const SLIDER_COAST_MIN = 45;
export const SLIDER_COAST_MAX = 75;
export const SLIDER_COAST_STEP = 1;

export const SLIDER_BARISTA_MIN = 10000;
export const SLIDER_BARISTA_MAX = 120000;
export const SLIDER_BARISTA_STEP = 5000;

export const SLIDER_LEAN_MIN = 50;
export const SLIDER_LEAN_MAX = 90;
export const SLIDER_LEAN_STEP = 5;

export const PERCENT_FACTOR = 100;
export const RESIZE_DELAY_MS = 60;

export class FireDrawer extends BaseComponent {
    constructor() {
        super();
        this.isOpen = false;
        this.simulationData = [];
        this.appState = null;
        this.milestones = null;
        this.chartInstance = null;

        this.coastTargetAge = DEFAULT_COAST_TARGET_AGE;
        this.baristaIncome = DEFAULT_BARISTA_ANNUAL_INCOME;
        this.leanRatio = DEFAULT_LEAN_EXPENSE_RATIO;
    }

    updateData(simulationData, state, milestones = null) {
        this.simulationData = simulationData || [];
        this.appState = state || null;
        if (!this.appState) return;

        const primaryRetireAge = state?.primarySpouse?.targetRetirementAge;
        if (primaryRetireAge && !this._hasCustomCoastAge) {
            this.coastTargetAge = primaryRetireAge;
        }

        if (milestones) {
            this.milestones = milestones;
        } else {
            this._recalculate();
        }

        if (this.isOpen) {
            this.render();
        }
    }

    open() {
        this.isOpen = true;
        this.render();
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                this._renderTrajectoryChart();
                window.dispatchEvent(new Event('resize'));
            }, RESIZE_DELAY_MS);
        }
    }

    close() {
        this.isOpen = false;
        this._destroyChart();
        const overlay = this.querySelector('.fire-drawer-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    _recalculate() {
        if (!this.simulationData || this.simulationData.length === 0 || !this.appState) {
            return;
        }
        this.milestones = FireMilestoneCalculator.computeMilestones(
            this.simulationData,
            this.appState,
            {
                coastTargetAge: this.coastTargetAge,
                baristaIncome: this.baristaIncome,
                leanRatio: this.leanRatio
            }
        );
        renderFireIndicator('fire-indicator-container', this.milestones);
    }

    render() {
        const overlayClass = this.isOpen ? '' : 'hidden';
        this.innerHTML = `
            <div class="drawer-overlay drawer-right-overlay fire-drawer-overlay ${overlayClass}" id="fire-drawer-backdrop">
                <div class="drawer drawer-right fire-drawer-panel">
                    ${this._renderHeader()}
                    <div class="drawer-content fire-drawer-scrollable">
                        ${this._renderCards()}
                        ${this._renderSliders()}
                        ${this._renderChartSection()}
                    </div>
                </div>
            </div>
        `;
        this._bindEvents();
        if (this.isOpen) {
            this._renderTrajectoryChart();
        }
    }

    _renderHeader() {
        return `
            <div class="drawer-header fire-drawer-header">
                <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                    <h2 style="display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                        <span>🔥</span> Financial Independence (FIRE) Milestones
                    </h2>
                    <span style="font-size: 0.82rem; color: var(--text-muted);">
                        Integrated with future mortgage payoffs, college expense roll-offs, and Social Security
                    </span>
                </div>
                <button type="button" class="btn-close" id="btn-close-fire-drawer" title="Close Drawer">&times;</button>
            </div>
        `;
    }

    _formatCardYear(milestone) {
        if (!milestone || !milestone.year) return 'Not Achieved';
        const ageStr = formatAgeString(milestone.age1 ?? milestone.age, milestone.age2);
        const ageFormatted = ageStr ? ` (${ageStr})` : '';
        return `${milestone.year}${ageFormatted}`;
    }

    _renderCard(cardConfig) {
        const { title, icon, colorClass, milestone, desc, metricLabel, metricVal } = cardConfig;
        const yearText = this._formatCardYear(milestone);
        const isAchieved = milestone && (milestone.year !== null);
        const statusBadge = isAchieved
            ? `<span class="fire-status-badge achieved">Achieved</span>`
            : `<span class="fire-status-badge pending">In Progress</span>`;

        return `
            <div class="fire-card ${colorClass}">
                <div class="fire-card-header">
                    <span class="fire-card-icon">${icon}</span>
                    <span class="fire-card-title">${title}</span>
                    ${statusBadge}
                </div>
                <div class="fire-card-main-val">${yearText}</div>
                <div class="fire-card-metric">
                    <span class="metric-lbl">${metricLabel}:</span>
                    <span class="metric-num">${metricVal}</span>
                </div>
                <div class="fire-card-desc">${desc}</div>
            </div>
        `;
    }

    _renderCards() {
        const m = this.milestones || {};
        const fmt = (v) => FinancialPresentationService.formatCurrency(v);

        const coastTargetVal = fmt(m.coastFire?.target);
        const baristaTargetVal = fmt(m.baristaFire?.target);
        const leanTargetVal = fmt(m.leanFire?.target);
        const fullTargetVal = fmt(m.fullFire?.target);

        return `
            <div class="fire-cards-grid">
                ${this._renderCard({
                    title: 'Coast FIRE',
                    icon: '🏖️',
                    colorClass: 'card-coast',
                    milestone: m.coastFire,
                    desc: `Stop saving into 401(k)/IRAs; portfolio compounds to fund full retirement at Age ${this.coastTargetAge}.`,
                    metricLabel: 'Required at Target Age',
                    metricVal: coastTargetVal
                })}
                ${this._renderCard({
                    title: 'Barista FIRE',
                    icon: '☕',
                    colorClass: 'card-barista',
                    milestone: m.baristaFire,
                    desc: `Downshift to lower-stress work earning ${fmt(this.baristaIncome)}/yr; portfolio bridges the gap to retirement.`,
                    metricLabel: 'Required Portfolio',
                    metricVal: baristaTargetVal
                })}
                ${this._renderCard({
                    title: 'Lean FIRE',
                    icon: '🌱',
                    colorClass: 'card-lean',
                    milestone: m.leanFire,
                    desc: `Retire early on baseline essential living expenses (${Math.round(this.leanRatio * PERCENT_FACTOR)}% of budget).`,
                    metricLabel: 'Required Portfolio',
                    metricVal: leanTargetVal
                })}
                ${this._renderCard({
                    title: 'Full FIRE',
                    icon: '🎯',
                    colorClass: 'card-full',
                    milestone: m.fullFire,
                    desc: '100% financial independence funding all desired retirement lifestyle expenses without active work.',
                    metricLabel: 'Required Portfolio',
                    metricVal: fullTargetVal
                })}
            </div>
        `;
    }

    _renderSliders() {
        const fmt = (v) => FinancialPresentationService.formatCurrency(v);
        const leanPct = Math.round(this.leanRatio * PERCENT_FACTOR);

        return `
            <div class="fire-tuning-panel glass-panel">
                <div class="fire-tuning-title">
                    <span>⚙️</span> <strong>Interactive Milestone Tuning</strong>
                </div>
                <div class="fire-sliders-grid">
                    <div class="fire-slider-box">
                        <div class="slider-header">
                            <label for="slider-coast-age">Coast FIRE Target Age:</label>
                            <span class="slider-val" id="val-coast-age">${this.coastTargetAge}</span>
                        </div>
                        <input type="range" id="slider-coast-age" min="${SLIDER_COAST_MIN}" max="${SLIDER_COAST_MAX}" 
                               step="${SLIDER_COAST_STEP}" value="${this.coastTargetAge}">
                    </div>
                    <div class="fire-slider-box">
                        <div class="slider-header">
                            <label for="slider-barista-income">Barista Annual Income:</label>
                            <span class="slider-val" id="val-barista-income">${fmt(this.baristaIncome)}/yr</span>
                        </div>
                        <input type="range" id="slider-barista-income" min="${SLIDER_BARISTA_MIN}" max="${SLIDER_BARISTA_MAX}" 
                               step="${SLIDER_BARISTA_STEP}" value="${this.baristaIncome}">
                    </div>
                    <div class="fire-slider-box">
                        <div class="slider-header">
                            <label for="slider-lean-ratio">Lean FIRE Expense Ratio:</label>
                            <span class="slider-val" id="val-lean-ratio">${leanPct}%</span>
                        </div>
                        <input type="range" id="slider-lean-ratio" min="${SLIDER_LEAN_MIN}" max="${SLIDER_LEAN_MAX}" 
                               step="${SLIDER_LEAN_STEP}" value="${leanPct}">
                    </div>
                </div>
            </div>
        `;
    }

    _renderChartSection() {
        return `
            <div class="fire-chart-card glass-panel">
                <div class="fire-chart-header">
                    <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 0.4rem;">
                        <span>📈</span> FIRE Trajectory &amp; Portfolio Crossover Curves
                    </h3>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">
                        Milestone achieved when Green Portfolio crosses above target line
                    </div>
                </div>
                <div class="fire-chart-container">
                    <canvas id="fireTrajectoryChart"></canvas>
                </div>
            </div>
        `;
    }

    _bindEvents() {
        const btnClose = this.querySelector('#btn-close-fire-drawer');
        if (btnClose) btnClose.addEventListener('click', () => this.close());

        const backdrop = this.querySelector('#fire-drawer-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) this.close();
            });
        }

        this._bindSliderInputs();
    }

    _bindSliderInputs() {
        const coastSlider = this.querySelector('#slider-coast-age');
        if (coastSlider) {
            coastSlider.addEventListener('input', (e) => {
                this.coastTargetAge = Number(e.target.value);
                this._hasCustomCoastAge = true;
                this._onSliderChange();
            });
        }

        const baristaSlider = this.querySelector('#slider-barista-income');
        if (baristaSlider) {
            baristaSlider.addEventListener('input', (e) => {
                this.baristaIncome = Number(e.target.value);
                this._onSliderChange();
            });
        }

        const leanSlider = this.querySelector('#slider-lean-ratio');
        if (leanSlider) {
            leanSlider.addEventListener('input', (e) => {
                this.leanRatio = Number(e.target.value) / PERCENT_FACTOR;
                this._onSliderChange();
            });
        }
    }

    _onSliderChange() {
        this._recalculate();
        this.render();
    }

    _destroyChart() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    _getChartDatasets(trajectory) {
        return [
            {
                label: 'Projected Portfolio',
                data: trajectory.map(t => t.actualPortfolio),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                fill: true,
                borderWidth: 3,
                tension: 0.2,
                order: 1
            },
            {
                label: 'Coast FIRE Target',
                data: trajectory.map(t => t.coastTarget),
                borderColor: '#3b82f6',
                borderDash: [6, 4],
                fill: false,
                borderWidth: 2,
                tension: 0.2,
                order: 2
            },
            {
                label: 'Barista FIRE Target',
                data: trajectory.map(t => t.baristaTarget),
                borderColor: '#f59e0b',
                borderDash: [5, 5],
                fill: false,
                borderWidth: 2,
                tension: 0.2,
                order: 3
            },
            {
                label: 'Lean FIRE Target',
                data: trajectory.map(t => t.leanTarget),
                borderColor: '#a855f7',
                borderDash: [3, 3],
                fill: false,
                borderWidth: 2,
                tension: 0.2,
                order: 4
            },
            {
                label: 'Full FIRE Target',
                data: trajectory.map(t => t.fullTarget),
                borderColor: '#ef4444',
                borderDash: [8, 4],
                fill: false,
                borderWidth: 2.5,
                tension: 0.2,
                order: 5
            }
        ];
    }

    _renderTrajectoryChart() {
        if (typeof window === 'undefined' || !window.Chart) return;
        const canvas = this.querySelector('#fireTrajectoryChart');
        if (!canvas) return;

        this._destroyChart();

        const trajectory = this.milestones?.trajectory || [];
        if (trajectory.length === 0) return;

        const labels = trajectory.map(t => {
            const ageStr = formatAgeString(t.age1 ?? t.age, t.age2);
            return ageStr ? `${t.year} (${ageStr})` : `${t.year}`;
        });
        const datasets = this._getChartDatasets(trajectory);

        const ctx = canvas.getContext('2d');
        this.chartInstance = new window.Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', labels: { color: '#cbd5e1', boxWidth: 14 } },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const val = FinancialPresentationService.formatCurrency(context.parsed.y);
                                return ` ${context.dataset.label}: ${val}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
                    y: {
                        ticks: {
                            color: '#94a3b8',
                            callback: (v) => `$${Math.round(v / 1000)}k`
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.05)' }
                    }
                }
            }
        });
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('fire-drawer')) {
    customElements.define('fire-drawer', FireDrawer);
}
