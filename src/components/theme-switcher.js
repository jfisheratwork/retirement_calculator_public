/**
 * Theme Switcher Controller (SPEC-085)
 * Manages operational modes (system, dark, light) and curated color palettes
 * (slate, terminal, broadsheet, matcha) with persistence and dynamic chart updates.
 */

import { applyChartTheme } from './charts.js';

export const VALID_THEMES = ['slate', 'terminal', 'broadsheet', 'matcha'];
export const VALID_MODES = ['system', 'dark', 'light'];

export const STORAGE_KEY_MODE = 'app_theme_mode';
export const STORAGE_KEY_THEME = 'app_theme_id';

export const DEFAULT_DARK_THEME = 'slate';
export const DEFAULT_LIGHT_THEME = 'broadsheet';

/**
 * Returns the currently active effective theme ID from DOM or preferences.
 * @returns {string} 'slate' | 'terminal' | 'broadsheet' | 'matcha'
 */
export function getCurrentThemeId() {
    if (typeof document !== 'undefined') {
        const docTheme = document.documentElement.getAttribute('data-theme');
        if (docTheme && VALID_THEMES.includes(docTheme)) return docTheme;
    }
    const { mode, themeId } = getThemePreference();
    const prefersDark =
        typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return resolveEffectiveTheme(mode, themeId, Boolean(prefersDark));
}

/**
 * Resolves the effective active theme based on user mode preference, theme selection, and system brightness.
 * @param {string} mode - 'system' | 'dark' | 'light'
 * @param {string} themeId - 'slate' | 'terminal' | 'broadsheet' | 'matcha'
 * @param {boolean} prefersDark - Whether the OS currently prefers dark mode
 * @returns {string} The effective theme ID to apply
 */
export function resolveEffectiveTheme(mode, themeId, prefersDark) {
    const safeMode = VALID_MODES.includes(mode) ? mode : 'system';
    const safeTheme = VALID_THEMES.includes(themeId) ? themeId : DEFAULT_DARK_THEME;
    const isDarkTheme = safeTheme === 'slate' || safeTheme === 'terminal';

    if (safeMode === 'system') {
        if (prefersDark) {
            return isDarkTheme ? safeTheme : DEFAULT_DARK_THEME;
        }
        return !isDarkTheme ? safeTheme : DEFAULT_LIGHT_THEME;
    }
    if (safeMode === 'dark') {
        return isDarkTheme ? safeTheme : DEFAULT_DARK_THEME;
    }
    if (safeMode === 'light') {
        return !isDarkTheme ? safeTheme : DEFAULT_LIGHT_THEME;
    }
    return DEFAULT_DARK_THEME;
}

/**
 * Reads stored theme preferences from localStorage with fallback defaults.
 * @returns {{ mode: string, themeId: string }}
 */
export function getThemePreference() {
    let mode = 'system';
    let themeId = DEFAULT_DARK_THEME;

    try {
        if (typeof localStorage !== 'undefined') {
            const storedMode = localStorage.getItem(STORAGE_KEY_MODE);
            const storedTheme = localStorage.getItem(STORAGE_KEY_THEME);

            if (storedMode && VALID_MODES.includes(storedMode)) {
                mode = storedMode;
            }
            if (storedTheme && VALID_THEMES.includes(storedTheme)) {
                themeId = storedTheme;
            }
        }
    } catch {
        // Fallback gracefully on storage denial
    }

    return { mode, themeId };
}

/**
 * Applies and persists the given theme mode and theme ID.
 * @param {string} mode - 'system' | 'dark' | 'light'
 * @param {string} themeId - 'slate' | 'terminal' | 'broadsheet' | 'matcha'
 * @returns {string} The effective theme applied
 */
export function setThemePreference(mode, themeId) {
    const safeMode = VALID_MODES.includes(mode) ? mode : 'system';
    const safeTheme = VALID_THEMES.includes(themeId) ? themeId : DEFAULT_DARK_THEME;

    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_MODE, safeMode);
            localStorage.setItem(STORAGE_KEY_THEME, safeTheme);
        }
    } catch {
        // Fallback on restricted storage
    }

    const prefersDark =
        typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    const effectiveTheme = resolveEffectiveTheme(safeMode, safeTheme, Boolean(prefersDark));

    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', effectiveTheme);
        document.documentElement.setAttribute('data-theme-mode', safeMode);
        syncPopoverUI(safeMode, safeTheme, effectiveTheme);
    }

    if (typeof applyChartTheme === 'function') {
        applyChartTheme(effectiveTheme);
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('appthemechange', {
                detail: { mode: safeMode, themeId: safeTheme, effectiveTheme }
            })
        );
    }

    return effectiveTheme;
}

/**
 * Synchronizes the active visual state of popover controls.
 * @param {string} mode
 * @param {string} themeId
 * @param {string} effectiveTheme
 */
export function syncPopoverUI(mode, themeId, effectiveTheme) {
    const popover = document.getElementById('theme-picker-popover');
    if (!popover) return;

    // Mode buttons
    const modeButtons = popover.querySelectorAll('.theme-mode-btn');
    modeButtons.forEach((btn) => {
        const isMatch = btn.dataset.mode === mode;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });

    // Theme options
    const themeOptions = popover.querySelectorAll('.theme-palette-option');
    themeOptions.forEach((opt) => {
        const optTheme = opt.dataset.themeId;
        const isMatch = optTheme === effectiveTheme;
        opt.classList.toggle('active', isMatch);
        opt.setAttribute('aria-checked', isMatch ? 'true' : 'false');
    });
}

/**
 * Initializes the theme switcher UI, media watchers, and popover event listeners.
 */
export function initThemeSwitcher() {
    if (typeof document === 'undefined') return;

    const btnTrigger = document.getElementById('btn-theme-picker');
    const popover = document.getElementById('theme-picker-popover');

    const { mode, themeId } = getThemePreference();
    setThemePreference(mode, themeId);

    // Watch OS system preference shifts
    if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const onSchemeChange = () => {
            const current = getThemePreference();
            if (current.mode === 'system') {
                setThemePreference('system', current.themeId);
            }
        };

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', onSchemeChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(onSchemeChange);
        }
    }

    if (!btnTrigger || !popover) return;

    const openPopover = () => {
        popover.removeAttribute('hidden');
        btnTrigger.setAttribute('aria-expanded', 'true');
        const activeOption =
            popover.querySelector('.theme-palette-option.active') || popover.querySelector('.theme-mode-btn.active');
        if (activeOption) {
            activeOption.focus();
        }
    };

    const closePopover = () => {
        popover.setAttribute('hidden', '');
        btnTrigger.setAttribute('aria-expanded', 'false');
    };

    const togglePopover = (event) => {
        event.stopPropagation();
        if (popover.hasAttribute('hidden')) {
            openPopover();
        } else {
            closePopover();
        }
    };

    btnTrigger.addEventListener('click', togglePopover);

    // Mode button clicks
    popover.querySelectorAll('.theme-mode-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newMode = btn.dataset.mode;
            const current = getThemePreference();
            let targetTheme = current.themeId;
            if (newMode === 'dark' && (targetTheme === 'broadsheet' || targetTheme === 'matcha')) {
                targetTheme = DEFAULT_DARK_THEME;
            } else if (newMode === 'light' && (targetTheme === 'slate' || targetTheme === 'terminal')) {
                targetTheme = DEFAULT_LIGHT_THEME;
            }
            setThemePreference(newMode, targetTheme);
        });
    });

    // Theme option clicks
    popover.querySelectorAll('.theme-palette-option').forEach((opt) => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const newThemeId = opt.dataset.themeId;
            const isDark = newThemeId === 'slate' || newThemeId === 'terminal';
            const targetMode = isDark ? 'dark' : 'light';
            setThemePreference(targetMode, newThemeId);
        });
    });

    // Dismiss on outside click
    document.addEventListener('click', (e) => {
        if (!popover.hasAttribute('hidden') && !popover.contains(e.target) && e.target !== btnTrigger) {
            closePopover();
        }
    });

    // Keyboard accessibility (Escape key trap)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !popover.hasAttribute('hidden')) {
            closePopover();
            btnTrigger.focus();
        }
    });
}
