/**
 * StorageShield Service
 *
 * Provides dual-tier defense for client-side localStorage persistence:
 * 1. Option A (Default): Split-key anti-scraping stream obfuscation preventing cleartext sniffing.
 * 2. Option B (Opt-In): PIN-derived AES-GCM-256 cryptographic lock using the W3C Web Cryptography API.
 *
 * Written with the assistance of Google Gemini
 */

import { getCompositeShieldKey } from '../constants/shield-keys.js';

export const SHIELD_VERSION_OBFUSCATED = 1;
export const SHIELD_VERSION_PIN_LOCKED = 2;

export const PBKDF2_ITERATIONS = 100000;
export const AES_KEY_LENGTH_BITS = 256;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;
export const ADLER_MODULO = 65521;

let sessionCryptoKey = null;
let sessionSaltHex = null;

// Helper: Adler-32 checksum calculation
function computeAdler32(str) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < str.length; i++) {
        a = (a + str.charCodeAt(i)) % ADLER_MODULO;
        b = (b + a) % ADLER_MODULO;
    }
    return (b << 16) | a;
}

// Helper: Hex / Uint8Array conversion
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

// Helper: Base64 / Uint8Array conversion
function bytesToBase64(bytes) {
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

// Helper: Safe random bytes provider across Browser & Node environments
function getRandomBytes(length) {
    const arr = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(arr);
    } else {
        for (let i = 0; i < length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
    }
    return arr;
}

// Option A: Keystream generation from composite split key + salt
function generateKeystream(compositeKey, saltHex, length) {
    const seedStr = `${saltHex}_${compositeKey}`;
    const keystream = new Uint8Array(length);
    let hash = 0x811c9dc5;
    for (let i = 0; i < length; i++) {
        const charCode = seedStr.charCodeAt(i % seedStr.length);
        hash ^= charCode;
        hash = Math.imul(hash, 0x01000193);
        keystream[i] = (hash >>> 24) ^ (hash & 0xff);
    }
    return keystream;
}

export class StorageShield {
    // ==========================================
    // Option A: Split-Key Obfuscation (Synchronous)
    // ==========================================

    /**
     * Obfuscates a cleartext JSON string using Option A split-key transformation.
     * @param {string} plaintextStr
     * @returns {string} Serialized JSON envelope
     */
    static encodeOptionA(plaintextStr) {
        const saltBytes = getRandomBytes(8);
        const saltHex = bytesToHex(saltBytes);
        const compositeKey = getCompositeShieldKey();
        const encoder = new TextEncoder();
        const plainBytes = encoder.encode(plaintextStr);
        const keystream = generateKeystream(compositeKey, saltHex, plainBytes.length);

        const transformedBytes = new Uint8Array(plainBytes.length);
        for (let i = 0; i < plainBytes.length; i++) {
            transformedBytes[i] = plainBytes[i] ^ keystream[i];
        }

        const checksum = computeAdler32(plaintextStr);
        const payload = bytesToBase64(transformedBytes);

        return JSON.stringify({
            _shield: SHIELD_VERSION_OBFUSCATED,
            format: 'split-key-v1',
            salt: saltHex,
            checksum,
            payload
        });
    }

    /**
     * Decodes an Option A envelope.
     * @param {Object} envelope
     * @returns {string} Plaintext JSON string
     */
    static decodeOptionA(envelope) {
        if (!envelope || envelope._shield !== SHIELD_VERSION_OBFUSCATED) {
            throw new Error('Invalid Option A storage envelope.');
        }
        const compositeKey = getCompositeShieldKey();
        const transformedBytes = base64ToBytes(envelope.payload);
        const keystream = generateKeystream(compositeKey, envelope.salt, transformedBytes.length);

        const plainBytes = new Uint8Array(transformedBytes.length);
        for (let i = 0; i < transformedBytes.length; i++) {
            plainBytes[i] = transformedBytes[i] ^ keystream[i];
        }

        const decoder = new TextDecoder();
        const plaintextStr = decoder.decode(plainBytes);

        const expectedChecksum = computeAdler32(plaintextStr);
        if (expectedChecksum !== envelope.checksum) {
            throw new Error('Storage checksum verification failed; data may be tampered or corrupted.');
        }

        return plaintextStr;
    }

    // ==========================================
    // Option B: PIN-Derived WebCrypto AES-GCM
    // ==========================================

    /**
     * Derives a 256-bit AES-GCM CryptoKey from a PIN using PBKDF2 SHA-256.
     *
     * Web Cryptography API PBKDF2: https://www.w3.org/TR/WebCryptoAPI/#pbkdf2
     * Web Cryptography API SubtleCrypto: https://www.w3.org/TR/WebCryptoAPI/#subtlecrypto-interface
     *
     * @param {string} pin
     * @param {Uint8Array} saltBytes
     * @returns {Promise<CryptoKey>}
     */
    static async deriveKeyFromPin(pin, saltBytes) {
        const encoder = new TextEncoder();
        const pinBytes = encoder.encode(pin);

        // Import raw PIN bytes as PBKDF2 base key
        const baseKey = await crypto.subtle.importKey('raw', pinBytes, 'PBKDF2', false, ['deriveKey']);

        // Derive AES-GCM key with 100,000 iterations
        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            baseKey,
            {
                name: 'AES-GCM',
                length: AES_KEY_LENGTH_BITS
            },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypts a cleartext JSON string using a user PIN via WebCrypto AES-GCM.
     *
     * Web Cryptography API AES-GCM: https://www.w3.org/TR/WebCryptoAPI/#aes-gcm
     *
     * @param {string} plaintextStr
     * @param {string} pin
     * @returns {Promise<string>} Serialized JSON envelope
     */
    static async encryptWithPin(plaintextStr, pin) {
        const saltBytes = getRandomBytes(SALT_BYTE_LENGTH);
        const saltHex = bytesToHex(saltBytes);
        const key = await this.deriveKeyFromPin(pin, saltBytes);

        const ivBytes = getRandomBytes(IV_BYTE_LENGTH);
        const ivHex = bytesToHex(ivBytes);

        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(plaintextStr);

        const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivBytes }, key, dataBytes);

        const ciphertext = bytesToBase64(new Uint8Array(ciphertextBuffer));

        // Cache session key in ephemeral memory
        sessionCryptoKey = key;
        sessionSaltHex = saltHex;

        return JSON.stringify({
            _shield: SHIELD_VERSION_PIN_LOCKED,
            locked: true,
            format: 'aes-gcm-256',
            salt: saltHex,
            iv: ivHex,
            ciphertext
        });
    }

    /**
     * Decrypts an Option B envelope using a user PIN.
     *
     * @param {Object} envelope
     * @param {string} pin
     * @returns {Promise<string>} Plaintext JSON string
     */
    static async decryptWithPin(envelope, pin) {
        if (!envelope || envelope._shield !== SHIELD_VERSION_PIN_LOCKED) {
            throw new Error('Invalid Option B PIN-locked storage envelope.');
        }

        const saltBytes = hexToBytes(envelope.salt);
        const ivBytes = hexToBytes(envelope.iv);
        const ciphertextBytes = base64ToBytes(envelope.ciphertext);

        const key = await this.deriveKeyFromPin(pin, saltBytes);

        const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, ciphertextBytes);

        const decoder = new TextDecoder();
        const plaintextStr = decoder.decode(decryptedBuffer);

        // Cache session key in ephemeral memory
        sessionCryptoKey = key;
        sessionSaltHex = envelope.salt;

        return plaintextStr;
    }

    /**
     * Encrypts using the active session CryptoKey without needing re-entry of the PIN.
     * @param {string} plaintextStr
     * @returns {Promise<string>}
     */
    static async encryptWithSessionKey(plaintextStr) {
        if (!sessionCryptoKey || !sessionSaltHex) {
            throw new Error('No active session CryptoKey available for Option B save.');
        }

        const ivBytes = getRandomBytes(IV_BYTE_LENGTH);
        const ivHex = bytesToHex(ivBytes);

        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(plaintextStr);

        const ciphertextBuffer = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: ivBytes },
            sessionCryptoKey,
            dataBytes
        );

        const ciphertext = bytesToBase64(new Uint8Array(ciphertextBuffer));

        return JSON.stringify({
            _shield: SHIELD_VERSION_PIN_LOCKED,
            locked: true,
            format: 'aes-gcm-256',
            salt: sessionSaltHex,
            iv: ivHex,
            ciphertext
        });
    }

    // ==========================================
    // Session State Management & Status Inspect
    // ==========================================

    static hasActiveSessionKey() {
        return sessionCryptoKey !== null;
    }

    static clearSessionKey() {
        sessionCryptoKey = null;
        sessionSaltHex = null;
    }

    /**
     * Inspects a stored raw string from localStorage to determine its format.
     * @param {string|null} rawStr
     * @returns {'cleartext'|'option_a'|'option_b'|'empty'}
     */
    static inspectFormat(rawStr) {
        if (!rawStr) return 'empty';
        try {
            const parsed = JSON.parse(rawStr);
            if (parsed && typeof parsed === 'object') {
                if (parsed._shield === SHIELD_VERSION_PIN_LOCKED && parsed.locked === true) {
                    return 'option_b';
                }
                if (parsed._shield === SHIELD_VERSION_OBFUSCATED) {
                    return 'option_a';
                }
                return 'cleartext';
            }
        } catch {
            // Non-JSON string or malformed
            return 'cleartext';
        }
        return 'cleartext';
    }

    /**
     * Synchronously decodes storage if possible (cleartext or Option A).
     * If Option B is detected, returns null (indicating async PIN unlock is required).
     * @param {string|null} rawStr
     * @returns {string|null}
     */
    static syncDecode(rawStr) {
        if (!rawStr) return null;
        const format = this.inspectFormat(rawStr);
        if (format === 'cleartext') {
            return rawStr;
        }
        if (format === 'option_a') {
            const envelope = JSON.parse(rawStr);
            return this.decodeOptionA(envelope);
        }
        // Option B cannot be decoded synchronously
        return null;
    }

    /**
     * Universal save method: writes Option B if session PIN lock is active,
     * otherwise writes Option A obfuscated envelope.
     * @param {string} plaintextStr
     * @returns {string|Promise<string>}
     */
    static encodeForStorage(plaintextStr) {
        if (this.hasActiveSessionKey()) {
            return this.encryptWithSessionKey(plaintextStr);
        }
        return this.encodeOptionA(plaintextStr);
    }
}
