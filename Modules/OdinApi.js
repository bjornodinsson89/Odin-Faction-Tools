/**
 * Odin Tools - API Client Module
 * Handles all external API communications with rate limiting and caching
 * 
 * @version 3.1.0
 * @author Houston
 * @requires GM_xmlhttpRequest (provided by Tampermonkey)
 */

class OdinApi {
    constructor() {
        this.apiKeys = {
            torn: localStorage.getItem('odin_torn_api_key') || '',
            tornStats: localStorage.getItem('odin_tornstats_api_key') || '',
            ffScouter: localStorage.getItem('odin_ffscouter_api_key') || ''
        };

        // Rate limiting configuration
        this.rateLimits = {
            torn: { limit: 100, window: 60000, requests: [] },
            tornStats: { limit: 60, window: 60000, requests: [] },
            ffScouter: { limit: 100, window: 60000, requests: [] }
        };

        // Response caching
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes default

        // API endpoints
        this.endpoints = {
            tornV1: 'https://api.torn.com',
            tornV2: 'https://api.torn.com/v2',
            tornStats: 'https://www.tornstats.com/api/v2',
            ffScouter: 'https://ffscouter.com/api'
        };

        // Request queue for rate-limited calls
        this.requestQueues = {
            torn: [],
            tornStats: [],
            ffScouter: []
        };

        this.processingQueues = false;
    }

    /**
     * Set API keys
     */
    setApiKeys(keys) {
        if (keys.torn) {
            this.apiKeys.torn = keys.torn;
            localStorage.setItem('odin_torn_api_key', keys.torn);
        }
        if (keys.tornStats) {
            this.apiKeys.tornStats = keys.tornStats;
            localStorage.setItem('odin_tornstats_api_key', keys.tornStats);
        }
        if (keys.ffScouter) {
            this.apiKeys.ffScouter = keys.ffScouter;
            localStorage.setItem('odin_ffscouter_api_key', keys.ffScouter);
        }
    }

    /**
     * Check if rate limit allows request
     */
    canMakeRequest(service) {
        const limit = this.rateLimits[service];
        const now = Date.now();
        
        // Clean old requests outside window
        limit.requests = limit.requests.filter(time => now - time < limit.window);
        
        return limit.requests.length < limit.limit;
    }

    /**
     * Record a request for rate limiting
     */
    recordRequest(service) {
        this.rateLimits[service].requests.push(Date.now());
    }

    /**
     * Get cache key
     */
    getCacheKey(service, endpoint, params) {
        return `${service}:${endpoint}:${JSON.stringify(params)}`;
    }

    /**
     * Check cache for response
     */
    checkCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > this.cacheExpiry) {
            this.cache.delete(key);
            return null;
        }

        return cached.data;
    }

    /**
     * Store response in cache
     */
    storeCache(key, data, customExpiry = null) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiry: customExpiry || this.cacheExpiry
        });
    }

    /**
     * Process request queues
     */
    async processQueues() {
        if (this.processingQueues) return;
        this.processingQueues = true;

        const services = ['torn', 'tornStats', 'ffScouter'];
        
        for (const service of services) {
            while (this.requestQueues[service].length > 0 && this.canMakeRequest(service)) {
                const { resolve, reject, requestFn } = this.requestQueues[service].shift();
                
                try {
                    const result = await requestFn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }
        }

        this.processingQueues = false;

        // Schedule next processing if queues not empty
        if (services.some(s => this.requestQueues[s].length > 0)) {
            setTimeout(() => this.processQueues(), 1000);
        }
    }

    /**
     * Queue a request with rate limiting
     */
    queueRequest(service, requestFn) {
        return new Promise((resolve, reject) => {
            this.requestQueues[service].push({ resolve, reject, requestFn });
            this.processQueues();
        });
    }

    /**
     * Make HTTP request using GM_xmlhttpRequest
     */
    makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: options.method || 'GET',
                url: url,
                headers: options.headers || {},
                data: options.data,
                timeout: options.timeout || 30000,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (e) {
                            resolve(response.responseText);
                        }
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                onerror: (error) => reject(error),
                ontimeout: () => reject(new Error('Request timeout'))
            });
        });
    }

    
    recordApiDiag(service, entry) {
        try {
            const diag = this.diagnostics;
            const s = diag.services[service] || (diag.services[service] = { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 });
            if (entry && entry.phase === 'start') {
                diag.push({ service, ...entry });
                return;
            }
            s.calls += 1;
            if (!entry.ok) s.errors += 1;
            s.bytesOut += (entry.bytesOut || 0);
            s.bytesIn += (entry.bytesIn || 0);
            s.lastAt = entry.ts || Date.now();
            diag.push({ service, ...entry });
        } catch (_) {}
    }

    getDiagnostics() {
        return { services: this.diagnostics.services, log: this.diagnostics.log };
    }

    clearDiagnostics() {
        if (this.diagnostics && typeof this.diagnostics.clear === 'function') this.diagnostics.clear();
    }

    /**
     * Unified Torn API getter (v2 first, v1 fallback)
     * @param {string} endpoint e.g. '/user' or '/faction/123'
     * @param {string[]|string} selections selections list (comma string or array)
     * @param {object} params extra query params
     */
    async tornGet(endpoint, selections = '', params = {}) {
        if (!this.apiKeys.torn) {
            throw new Error('Torn API key not configured');
        }

        const selectionsStr = Array.isArray(selections) ? selections.join(',') : (selections || '');
        const paramsQS = new URLSearchParams();
        if (selectionsStr) paramsQS.set('selections', selectionsStr);
        paramsQS.set('key', this.apiKeys.torn);
        for (const [k, v] of Object.entries(params || {})) {
            if (v === undefined || v === null || v === '') continue;
            paramsQS.set(k, String(v));
        }

        const urlV2 = `${this.endpoints.tornV2}${endpoint}?${paramsQS.toString()}`;
        const urlV1 = `${this.endpoints.tornV1}${endpoint}?${paramsQS.toString()}`;

        const doReq = async (url, apiVersion) => {
            const started = performance.now();
            const bytesOut = url.length;
            this.recordApiDiag('torn', { ok:true, phase:'start', ts:Date.now(), method:'GET', url, selections: selectionsStr, apiVersion, bytesOut });

            try {
                this.recordRequest('torn');
                const data = await this.makeRequest(url);
                const ms = performance.now() - started;
                const bytesIn = JSON.stringify(data || {}).length;

                if (data && data.error) {
                    const err = new Error(data.error.error || 'Torn API error');
                    err.code = data.error.code;
                    err.apiVersion = apiVersion;

                    this.recordApiDiag('torn', { ok:false, ts:Date.now(), ms, method:'GET', url, selections: selectionsStr, apiVersion, status:null, bytesOut, bytesIn, err: err.message, code: err.code });
                    throw err;
                }

                this.recordApiDiag('torn', { ok:true, ts:Date.now(), ms, method:'GET', url, selections: selectionsStr, apiVersion, status:null, bytesOut, bytesIn });
                return data;
            } catch (e) {
                const ms = performance.now() - started;
                this.recordApiDiag('torn', { ok:false, ts:Date.now(), ms, method:'GET', url, selections: selectionsStr, apiVersion, status:null, bytesOut, bytesIn:0, err: e.message || String(e), code: e.code || null });
                throw e;
            }
        };

        try {
            return await doReq(urlV2, 'v2');
        } catch (e) {
            const code = e && e.code;
            if (code === 22 || code === 2 || code === 6) {
                return await doReq(urlV1, 'v1');
            }
            throw e;
        }
    }

/**
     * TORN API - Get user data
     */
    async getTornUser(userId = '', selections = ['profile']) {
        const cacheKey = this.getCacheKey('torn', 'user', { userId, selections });
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        if (!this.apiKeys.torn) {
            throw new Error('Torn API key not configured');
        }

        return this.queueRequest('torn', async () => {
            const endpoint = userId ? `user/${userId}` : 'user';
            const url = `${this.endpoints.torn}/${endpoint}?selections=${selections.join(',')}&key=${this.apiKeys.torn}`;
            
            this.recordRequest('torn');
            const data = await this.makeRequest(url);
            
            if (data.error) {
                throw new Error(`Torn API Error: ${data.error.error}`);
            }

            this.storeCache(cacheKey, data);
            return data;
        });
    }

    /**
     * TORN API - Get faction data
     */
    async getTornFaction(factionId = '', selections = ['basic']) {
        const cacheKey = this.getCacheKey('torn', 'faction', { factionId, selections });
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        if (!this.apiKeys.torn) {
            throw new Error('Torn API key not configured');
        }

        return this.queueRequest('torn', async () => {
            const endpoint = factionId ? `faction/${factionId}` : 'faction';
            const url = `${this.endpoints.torn}/${endpoint}?selections=${selections.join(',')}&key=${this.apiKeys.torn}`;
            
            this.recordRequest('torn');
            const data = await this.makeRequest(url);
            
            if (data.error) {
                throw new Error(`Torn API Error: ${data.error.error}`);
            }

            this.storeCache(cacheKey, data, 60000); // 1 minute cache for faction data
            return data;
        });
    }

    /**
     * TORN API - Get attacks
     */
    async getTornAttacks(limit = 100) {
        const cacheKey = this.getCacheKey('torn', 'attacks', { limit });
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        if (!this.apiKeys.torn) {
            throw new Error('Torn API key not configured');
        }

        return this.queueRequest('torn', async () => {
            const url = `${this.endpoints.torn}/user?selections=attacks&limit=${limit}&key=${this.apiKeys.torn}`;
            
            this.recordRequest('torn');
            const data = await this.makeRequest(url);
            
            if (data.error) {
                throw new Error(`Torn API Error: ${data.error.error}`);
            }

            this.storeCache(cacheKey, data.attacks, 30000); // 30 second cache
            return data.attacks;
        });
    }

    /**
     * TornStats API - Get spy data
     */
    async getTornStatsSpy(targetId) {
        const cacheKey = this.getCacheKey('tornStats', 'spy', { targetId });
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        if (!this.apiKeys.tornStats) {
            throw new Error('TornStats API key not configured');
        }

        return this.queueRequest('tornStats', async () => {
            const url = `${this.endpoints.tornStats}/${this.apiKeys.tornStats}/spy/user/${targetId}`;
            
            this.recordRequest('tornStats');
            const data = await this.makeRequest(url);
            
            if (data.status === false) {
                throw new Error(`TornStats Error: ${data.message || 'Unknown error'}`);
            }

            this.storeCache(cacheKey, data, 300000); // 5 minute cache for spy data
            return data;
        });
    }

    /**
     * TornStats API - Get battle stats
     */
    async getTornStatsBattleStats(targetId) {
        const cacheKey = this.getCacheKey('tornStats', 'battlestats', { targetId });
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        if (!this.apiKeys.tornStats) {
            throw new Error('TornStats API key not configured');
        }

        return this.queueRequest('tornStats', async () => {
            const url = `${this.endpoints.tornStats}/${this.apiKeys.tornStats}/spy/user/${targetId}`;
            
            this.recordRequest('tornStats');
            const data = await this.makeRequest(url);
            
            if (data.status === false) {
                return null; // No battle stats available
            }

            const battleStats = {
                total: data.spy?.total || 0,
                strength: data.spy?.strength || 0,
                defense: data.spy?.defense || 0,
                speed: data.spy?.speed || 0,
                dexterity: data.spy?.dexterity || 0,
                timestamp: data.spy?.timestamp || Date.now()
            };

            this.storeCache(cacheKey, battleStats, 300000);
            return battleStats;
        });
    }

    /**
     * FFScouter API - Get target score
     */
    async getFFScouterScore(targetId) {
        const cacheKey = this.getCacheKey('ffScouter', 'score', { targetId });
        const cached = this.checkCache(cacheKey);
        if (cached) return cached;

        if (!this.apiKeys.ffScouter) {
            return null; // FFScouter is optional
        }

        return this.queueRequest('ffScouter', async () => {
            const url = `${this.endpoints.ffScouter}/v1/target/${targetId}`;
            
            this.recordRequest('ffScouter');
            
            try {
                const data = await this.makeRequest(url, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKeys.ffScouter}`
                    }
                });
                
                this.storeCache(cacheKey, data, 600000); // 10 minute cache
                return data;
            } catch (error) {
                // FFScouter errors are non-fatal
                console.warn('FFScouter API error:', error);
                return null;
            }
        });
    }

    /**
     * Batch fetch multiple targets
     */
    async batchFetchTargets(targetIds, includeStats = true, includeFFScouter = false) {
        const results = {};
        
        for (const targetId of targetIds) {
            try {
                const data = {
                    id: targetId,
                    profile: await this.getTornUser(targetId, ['profile']),
                    stats: null,
                    ffScore: null
                };

                if (includeStats) {
                    try {
                        data.stats = await this.getTornStatsBattleStats(targetId);
                    } catch (e) {
                        console.warn(`Failed to fetch stats for ${targetId}:`, e);
                    }
                }

                if (includeFFScouter) {
                    try {
                        data.ffScore = await this.getFFScouterScore(targetId);
                    } catch (e) {
                        console.warn(`Failed to fetch FFScouter for ${targetId}:`, e);
                    }
                }

                results[targetId] = data;
            } catch (error) {
                console.error(`Failed to fetch target ${targetId}:`, error);
                results[targetId] = { error: error.message };
            }
        }

        return results;
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Clear cache for specific service
     */
    clearServiceCache(service) {
        for (const [key, value] of this.cache.entries()) {
            if (key.startsWith(`${service}:`)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get rate limit status
     */
    getRateLimitStatus() {
        const status = {};
        const now = Date.now();

        for (const [service, limit] of Object.entries(this.rateLimits)) {
            const recentRequests = limit.requests.filter(time => now - time < limit.window);
            status[service] = {
                used: recentRequests.length,
                limit: limit.limit,
                remaining: limit.limit - recentRequests.length,
                resetIn: recentRequests.length > 0 
                    ? limit.window - (now - Math.min(...recentRequests))
                    : 0
            };
        }

        return status;
    }
}

// Export for use in userscript
if (typeof window !== 'undefined') {
    window.OdinApi = OdinApi;
}
