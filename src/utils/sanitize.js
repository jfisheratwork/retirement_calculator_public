/**
 * Security & Sanitization Utilities
 *
 * Provides robust HTML escaping to prevent Cross-Site Scripting (XSS)
 * when rendering dynamic user inputs, profile data, or AI-generated strings.
 */

/**
 * Escapes unsafe HTML characters in a string.
 * @param {string|number|null|undefined} unsafe - String to sanitize.
 * @returns {string} Sanitized string safe for innerHTML interpolation.
 */
export function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
