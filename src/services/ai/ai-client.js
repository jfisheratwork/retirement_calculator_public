/**
 * Google Gemini API Client
 * 
 * Manages REST API communication with Google Generative AI models
 * (gemini-3.7-flash, gemini-2.5-flash, gemini-3.1-pro) with timeout handling,
 * error classification, and automatic model fallback.
 * 
 * Documentation: https://ai.google.dev/api/rest/v1beta/models/generateContent
 */

const DEFAULT_MODELS = [
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-2.5-pro'
];

export class AIClient {
    /**
     * @param {string} apiKey - Google Gemini API Key.
     * @param {string} preferredModel - Desired model name.
     */
    constructor(apiKey, preferredModel = 'gemini-3.7-flash') {
        this.apiKey = apiKey;
        this.model = preferredModel;
        this.timeoutMs = 45000;
    }

    /**
     * Sends a generation request with automatic fallback cascade.
     * @param {string} prompt - User request.
     * @param {string} contextJson - Serialized financial metrics context.
     * @param {string} systemInstruction - Persona & Schema instructions.
     * @returns {Promise<{ text: string, modelUsed: string }>}
     */
    async generateContent(prompt, contextJson, systemInstruction) {
        if (!this.apiKey) {
            throw new Error('MISSING_API_KEY');
        }

        const candidateModels = [this.model, ...DEFAULT_MODELS.filter(m => m !== this.model)];
        let lastError = null;

        for (const model of candidateModels) {
            try {
                const result = await this._callModel(model, prompt, contextJson, systemInstruction);
                return { text: result, modelUsed: model };
            } catch (err) {
                lastError = err;
                // If invalid key, fail fast
                if (err.code === 'INVALID_KEY') {
                    throw err;
                }
                // If 503 high demand, 404 model not found, 429 quota on a specific tier, try fallback candidate
                console.warn(`Model ${model} request failed (${err.code || err.message}), attempting next model...`);
            }
        }

        throw lastError || new Error('ALL_MODELS_FAILED');
    }

    /**
     * Executes a single REST API call.
     */
    async _callModel(model, prompt, contextJson, systemInstruction) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        
        const payload = {
            systemInstruction: {
                parts: [{ text: systemInstruction }]
            },
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { text: `\n\n--- ACTIVE FINANCIAL STATE & SIMULATION CONTEXT ---\n${contextJson}` }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4096
            }
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': this.apiKey
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timer);

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                const message = errorData?.error?.message || `HTTP ${res.status}`;
                const error = new Error(message);
                if (res.status === 400 && message.includes('API_KEY_INVALID')) {
                    error.code = 'INVALID_KEY';
                } else if (res.status === 429) {
                    error.code = 'QUOTA_EXCEEDED';
                } else if (res.status === 404) {
                    error.code = 'MODEL_NOT_FOUND';
                } else {
                    error.code = `HTTP_${res.status}`;
                }
                throw error;
            }

            const data = await res.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!textResponse) {
                throw new Error('EMPTY_RESPONSE_FROM_MODEL');
            }

            return textResponse;
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                const timeoutErr = new Error('Request timed out. Please check your network connection.');
                timeoutErr.code = 'TIMEOUT';
                throw timeoutErr;
            }
            throw err;
        }
    }

    /**
     * Tests an API key connectivity with a minimal query.
     * @param {string} apiKey 
     * @returns {Promise<{ success: boolean, model: string, message: string }>}
     */
    static async testKey(apiKey) {
        if (!apiKey || !apiKey.trim()) {
            return { success: false, model: '', message: 'API key cannot be empty.' };
        }

        const candidateModels = DEFAULT_MODELS;
        for (const model of candidateModels) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey.trim()
                    },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
                        generationConfig: { maxOutputTokens: 5 }
                    })
                });

                if (res.ok) {
                    return { success: true, model, message: `Connected successfully using ${model}!` };
                }
                
                const errData = await res.json().catch(() => ({}));
                const msg = errData?.error?.message || `HTTP ${res.status}`;
                if (res.status === 400 || res.status === 403) {
                    return { success: false, model, message: `Invalid API key (${msg}).` };
                }
            } catch (err) {
                // If network failed entirely
                return { success: false, model: '', message: `Network error: ${err.message}` };
            }
        }

        return { success: false, model: '', message: 'Unable to connect to Google Generative AI endpoints.' };
    }
}
