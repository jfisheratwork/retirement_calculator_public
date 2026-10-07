/**
 * Basic obfuscation utility for storing sensitive data like API keys in LocalStorage.
 * Note: This is NOT cryptographically secure, it merely prevents the API key from 
 * being stored as raw plaintext at rest.
 */

const OBFUSCATION_KEY = 'R3t1r3m3ntC@lcul@t0r';

export function obfuscateData(data) {
    if (!data) return '';
    try {
        let result = '';
        for (let i = 0; i < data.length; i++) {
            result += String.fromCharCode(data.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length));
        }
        return btoa(result); // Base64 encode to make it storage friendly
    } catch (e) {
        console.error("Failed to obfuscate data", e);
        return '';
    }
}

export function deobfuscateData(encodedData) {
    if (!encodedData) return '';
    try {
        const decoded = atob(encodedData);
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            result += String.fromCharCode(decoded.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length));
        }
        return result;
    } catch (e) {
        console.error("Failed to deobfuscate data", e);
        return '';
    }
}
