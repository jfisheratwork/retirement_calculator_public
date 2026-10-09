/**
 * Split Key Constants for Local Storage Obfuscation (Option A)
 *
 * The master obscurity key is partitioned across three distinct runtime constants
 * to prevent plain-text discovery by passive scrapers and extension content scripts.
 * The parts are re-assembled in execution memory only at read/write time.
 *
 * Written with the assistance of Google Gemini
 */

export const SHIELD_KEY_PART_A = 'R72t_S3cur1ty_';
export const SHIELD_KEY_PART_B = 'Sh1eld_Obscur3_';
export const SHIELD_KEY_PART_C = 'K3y_9472_v1';

/**
 * Combines the partitioned constants into the master composite obfuscation key.
 * @returns {string}
 */
export function getCompositeShieldKey() {
    return `${SHIELD_KEY_PART_A}${SHIELD_KEY_PART_B}${SHIELD_KEY_PART_C}`;
}
