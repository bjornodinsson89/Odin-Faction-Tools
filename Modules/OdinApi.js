/**
 * Odin Tools - API Client Module
 * Handles all external API communications with rate limiting and caching
 * Version 3.1.0
 * Author BjornOdinsson89
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
            torn: 'https://api.torn.com',
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
    /*** Set API keys */
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
    /*** Check if rate limit allows request */
    canMakeRequest(service) {
        const limit = this.rateLimits[service];
        const now = Date.now();
        // Clean old requests outside window
        limit.requests = limit.requests.filter(time => now - time < limit.window);
        return limit.requests.length < limit.limit;
    }
    /*** Record a request for rate limiting */
    recordRequest(service) {
        this.rateLimits[service].requests.push(Date.now());
    }
    /*** Get cache key */
    getCacheKey(service, endpoint, params) {
        return `${service}:${endpoint}:${JSON.stringify(params)}`;
    }
    /*** Check cache for response */
    checkCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        if (Date.now() - cached.timestamp > this.cacheExpiry) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }
    /*** Store response in cache */
    storeCache(key, data, customExpiry = null) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            expiry: customExpiry || this.cacheExpiry
        });
    }
    /*** Process request queues */
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
    /*** Queue a request with rate limiting */
    queueRequest(service, requestFn) {
        return new Promise((resolve, reject) => {
            this.requestQueues[service].push({ resolve, reject, requestFn });
            this.processQueues();
        });
    }
    /*** Make HTTP request using GM_xmlhttpRequest */
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
    /*** TORN API - Get user data */
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
    /*** TORN API - Get faction data */
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
    /*** TORN API - Get attacks */
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
    /*** TornStats API - Get spy data */
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
    /*** TornStats API - Get battle stats */
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
    /*** FFScouter API - Get target score */
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
    /*** Batch fetch multiple targets */
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
    /*** Clear all caches */
    clearCache() {
        this.cache.clear();
    }
    /*** Clear cache for specific service */
    clearServiceCache(service) {
        for (const [key, value] of this.cache.entries()) {
            if (key.startsWith(`${service}:`)) {
                this.cache.delete(key);
            }
        }
    }
    /*** Get rate limit status */
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
// Unified API configuration and wrapper
(function () {
  'use strict';
  if (!window.OdinModules) window.OdinModules = [];
  window.OdinModules.push(function OdinApiConfigModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;
    const API_VERSION = '3.1.0';
    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
      torn: {
        baseUrl: 'https://api.torn.com',
        rateLimit: 100, // per minute
        minInterval: 600, // 600ms between calls
        cacheTime: 30000, // 30 seconds default cache
      },
      tornStats: {
        baseUrlV1: 'https://www.tornstats.com/api/v1',
        baseUrlV2: 'https://www.tornstats.com/api/v2',
        rateLimit: 30, // per minute
        minInterval: 2000, // 2 seconds between calls
        cacheTime: 300000, // 5 minutes cache
      },
      ffScouter: {
        baseUrl: 'https://ffscouter.com/api',
        rateLimit: 20, // per minute
        minInterval: 3000, // 3 seconds between calls
        cacheTime: 600000, // 10 minutes cache
      },
      backend: {
        baseUrl: '', // Set dynamically
        timeout: 30000,
      },
    };
    // ============================================
    // STATE
    // ============================================
    let tornApiKey = '';
    let tornStatsApiKey = '';
    let backendUrl = '';
    const requestCache = new Map();
    const rateLimiters = {
      torn: { lastCall: 0, callCount: 0, resetTime: 0 },
      tornStats: { lastCall: 0, callCount: 0, resetTime: 0 },
      ffScouter: { lastCall: 0, callCount: 0, resetTime: 0 },
    };
    // ============================================
    // RATE LIMITING
    // ============================================
    async function waitForRateLimit(service) {
      const limiter = rateLimiters[service];
      const config = CONFIG[service];
      if (!limiter || !config) return;
      const now = Date.now();
      // Reset counter if minute has passed
      if (now > limiter.resetTime) {
        limiter.callCount = 0;
        limiter.resetTime = now + 60000;
      }
      // Check rate limit
      if (limiter.callCount >= config.rateLimit) {
        const waitTime = limiter.resetTime - now;
        log(`[API] Rate limit reached for ${service}, waiting ${waitTime}ms`);
        await sleep(waitTime);
        limiter.callCount = 0;
        limiter.resetTime = Date.now() + 60000;
      }
      // Enforce minimum interval
      const timeSinceLastCall = now - limiter.lastCall;
      if (timeSinceLastCall < config.minInterval) {
        await sleep(config.minInterval - timeSinceLastCall);
      }
      limiter.lastCall = Date.now();
      limiter.callCount++;
    }
    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    // ============================================
    // CACHING
    // ============================================
    function getCached(key, maxAge) {
      const cached = requestCache.get(key);
      if (cached && Date.now() - cached.timestamp < maxAge) {
        return cached.data;
      }
      return null;
    }
    function setCache(key, data) {
      requestCache.set(key, { data, timestamp: Date.now() });
      // Cleanup old entries
      if (requestCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of requestCache.entries()) {
          if (now - v.timestamp > 600000) {
            requestCache.delete(k);
          }
        }
      }
    }
    // ============================================
    // TORN API
    // ============================================
async function tornGet(endpoint, selections = '') {
  if (!tornApiKey) {
    throw new Error('Torn API key not set');
  }
  let ep = String(endpoint || '').trim();
  if (!ep.startsWith('/')) ep = '/' + ep;
  if (ep.length > 1 && ep.endsWith('/')) ep = ep.slice(0, -1);
  const params = new URLSearchParams();
  if (selections) params.set('selections', selections);
  params.set('key', tornApiKey);
  const urlV2 = `${CONFIG.torn.baseUrl}/v2${ep}?${params.toString()}`;
  const urlV1 = `${CONFIG.torn.baseUrl}${ep}?${params.toString()}`;
  const cacheKey = `torn:${ep}:${selections}`;
  const cached = getCached(cacheKey, CONFIG.torn.cacheTime);
  if (cached) {
    stats.cacheHits++;
    stats.log.push({ ts: Date.now(), kind: 'torn', endpoint: ep, selections, cached: true, ok: true, ms: 0, url: urlV2, v: 'cache' });
    if (stats.log.length > 200) stats.log.splice(0, stats.log.length - 200);
    return cached;
  }
  const attempt = async (url, versionLabel) => {
    const t0 = performance.now();
    stats.totalCalls++;
    const entry = { ts: Date.now(), kind: 'torn', endpoint: ep, selections, cached: false, ok: false, ms: 0, url, v: versionLabel };
    stats.log.push(entry);
    if (stats.log.length > 200) stats.log.splice(0, stats.log.length - 200);
    try {
      const data = await requestJSON(url);
      entry.ms = Math.round(performance.now() - t0);
      if (data && data.error) {
        const err = new Error(data.error.error || 'Torn API error');
        err.code = data.error.code;
        err._torn = data.error;
        throw err;
      }
      entry.ok = true;
      stats.okCalls++;
      setCache(cacheKey, data);
      window.OdinDiag?.log?.(`[API] Torn ${versionLabel} OK`, ep, selections ? `sel=${selections}` : '');
      return data;
    } catch (e) {
      entry.ms = Math.round(performance.now() - t0);
      stats.failCalls++;
      window.OdinDiag?.log?.(`[API] Torn ${versionLabel} FAIL`, ep, selections ? `sel=${selections}` : '', (e && e.message) ? e.message : String(e));
      throw e;
    }
  };
  try {
    return await attempt(urlV2, 'v2');
  } catch (e) {
    const msg = (e && e.message) ? e.message.toLowerCase() : '';
    const code = e && e.code;
    const shouldFallback =
      code === 2 || code === 3 || code === 5 || code === 7 || code === 12 ||
      msg.includes('unknown selection') ||
      msg.includes('invalid selection') ||
      msg.includes('endpoint') ||
      msg.includes('not found') ||
      msg.includes('deprecated') ||
      msg.includes('incorrect id-entity relation');
    if (!shouldFallback) throw e;
    return await attempt(urlV1, 'v1');
  }
}
    /**
     * Validate a Torn API key
     * @param {string} key - The API key to validate
     * @returns {Promise<Object>} - API key info including access_level, access_type, and selections
     * @throws {Error} - If key is invalid or API request fails
     */
    async function validateTornApiKey(key) {
      // Trim and validate input
      const trimmedKey = (key || '').trim();
      if (!trimmedKey) {
        throw new Error('API key cannot be empty');
      }
      // Build validation URL
      const url = `${CONFIG.torn.baseUrl}/key/?selections=info&key=${encodeURIComponent(trimmedKey)}`;
      // Rate limit to respect Torn API rules
      await waitForRateLimit('torn');
      try {
        const response = await fetch(url);
        const data = await response.json();
        // Check for API errors
        if (data.error) {
          const errorMsg = data.error.error || 'Unknown API error';
          const errorCode = data.error.code;
          throw new Error(`Torn API Error (${errorCode}): ${errorMsg}`);
        }
        // Validate response structure
        if (!data.access_level && data.access_level !== 0) {
          throw new Error('Invalid API response: missing access_level');
        }
        // Return the key info
        return {
          access_level: data.access_level,
          access_type: data.access_type || 'Unknown',
          selections: data.selections || {},
        };
      } catch (e) {
        // Re-throw with more context if it's not already our error
        if (e.message.includes('Torn API Error')) {
          throw e;
        }
        error('[API] Key validation failed:', e);
        throw new Error(`Failed to validate API key: ${e.message}`);
      }
    }
    // ============================================
    // TORNSTATS API
    // ============================================
    async function tornStatsGet(endpoint, version = 'v2') {
      if (!tornStatsApiKey) {
        throw new Error('TornStats API key not set');
      }
      const baseUrl = version === 'v1' ? CONFIG.tornStats.baseUrlV1 : CONFIG.tornStats.baseUrlV2;
      const url = `${baseUrl}${endpoint}?key=${tornStatsApiKey}`;
      // Check cache
      const cacheKey = `ts:${endpoint}`;
      const cached = getCached(cacheKey, CONFIG.tornStats.cacheTime);
      if (cached) {
        return cached;
      }
      // Rate limit
      await waitForRateLimit('tornStats');
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.error || data.status === 'error') {
          throw new Error(data.message || data.error || 'TornStats API error');
        }
        setCache(cacheKey, data);
        return data;
      } catch (e) {
        error('[API] TornStats request failed:', e);
        throw e;
      }
    }
    /**
     * Get spy data from TornStats
     */
    async function tornStatsSpyGet(playerId) {
      return tornStatsGet(`/spy/${playerId}`, 'v2');
    }
    /**
     * Get faction roster from TornStats
     */
    async function tornStatsFactionGet(factionId) {
      return tornStatsGet(`/faction/${factionId}`, 'v2');
    }
    // ============================================
    // FFSCOUTER API
    // ============================================
    async function ffScouterGet(endpoint) {
      const url = `${CONFIG.ffScouter.baseUrl}${endpoint}`;
      // Check cache
      const cacheKey = `ffs:${endpoint}`;
      const cached = getCached(cacheKey, CONFIG.ffScouter.cacheTime);
      if (cached) {
        return cached;
      }
      // Rate limit
      await waitForRateLimit('ffScouter');
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`FFScouter HTTP ${response.status}`);
        }
        const data = await response.json();
        setCache(cacheKey, data);
        return data;
      } catch (e) {
        error('[API] FFScouter request failed:', e);
        throw e;
      }
    }
    /**
     * Get player battle score from FFScouter
     */
    async function ffScouterPlayerGet(playerId) {
      return ffScouterGet(`/player/${playerId}`);
    }
    // ============================================
    // BACKEND API
    // ============================================
    async function backendGet(endpoint) {
      if (!backendUrl) {
        throw new Error('Backend URL not set');
      }
      const url = `${backendUrl}${endpoint}`;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Version': API_VERSION,
          },
        });
        if (!response.ok) {
          throw new Error(`Backend HTTP ${response.status}`);
        }
        return await response.json();
      } catch (e) {
        error('[API] Backend GET failed:', e);
        throw e;
      }
    }
    async function backendPost(endpoint, data) {
      if (!backendUrl) {
        throw new Error('Backend URL not set');
      }
      const url = `${backendUrl}${endpoint}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Version': API_VERSION,
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error(`Backend HTTP ${response.status}`);
        }
        return await response.json();
      } catch (e) {
        error('[API] Backend POST failed:', e);
        throw e;
      }
    }
    // ============================================
    // URL BUILDERS
    // ============================================
    function buildTornUrl(endpoint, selections, key = tornApiKey) {
      const params = new URLSearchParams();
      if (selections) params.set('selections', selections);
      if (key) params.set('key', key);
      return `${CONFIG.torn.baseUrl}${endpoint}?${params.toString()}`;
    }
    function buildTornStatsUrl(endpoint, version = 'v2') {
      const baseUrl = version === 'v1' ? CONFIG.tornStats.baseUrlV1 : CONFIG.tornStats.baseUrlV2;
      return `${baseUrl}${endpoint}?key=${tornStatsApiKey}`;
    }
    // ============================================
    // CONFIGURATION SETTERS
    // ============================================
    function setTornApiKey(key) {
      tornApiKey = key;
      log('[API] Torn API key set');
    }
    function setTornStatsApiKey(key) {
      tornStatsApiKey = key;
      log('[API] TornStats API key set');
    }
    function setBackendUrl(url) {
      backendUrl = url;
      CONFIG.backend.baseUrl = url;
      log('[API] Backend URL set:', url);
    }
    function getTornApiKey() {
      return tornApiKey;
    }
    function hasTornStatsKey() {
      return !!tornStatsApiKey;
    }
    // ============================================
    // PUBLIC API
    // ============================================
    const OdinApiConfig = {
      version: API_VERSION,
      // Torn API
      tornGet,
      validateTornApiKey,
      buildTornUrl,
      setTornApiKey,
      getTornApiKey,
      // TornStats API
      tornStatsGet,
      tornStatsSpyGet,
      tornStatsFactionGet,
      setTornStatsApiKey,
      hasTornStatsKey,
      buildTornStatsUrl,
      // FFScouter API
      ffScouterGet,
      ffScouterPlayerGet,
      // Backend API
      backendGet,
      backendPost,
      setBackendUrl,
      // Cache management
      clearCache() {
        requestCache.clear();
        log('[API] Cache cleared');
      },
      getCacheStats() {
        return {
          entries: requestCache.size,
          services: Object.keys(rateLimiters).map((s) => ({
            name: s,
            callCount: rateLimiters[s].callCount,
          })),
        };
      },
      // Configuration
      getConfig() {
        return { ...CONFIG };
      },
      updateConfig(service, updates) {
        if (CONFIG[service]) {
          Object.assign(CONFIG[service], updates);
          log('[API] Config updated for', service);
        }
      },
    };
    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[API Config] Initializing v' + API_VERSION);
      // Load saved keys
      try {
        const settings = storage.getJSON('odin_settings') || {};
        if (settings.tornApiKey) {
          setTornApiKey(settings.tornApiKey);
        }
        if (settings.tornStatsApiKey) {
          setTornStatsApiKey(settings.tornStatsApiKey);
        }
      } catch (e) {
        log('[API Config] Could not load saved keys:', e);
      }
      // Expose globally
      window.OdinApiConfig = OdinApiConfig;
      // Also attach to context for module use
      ctx.api = OdinApiConfig;
      log('[API Config] Ready');
    }
    function destroy() {
      log('[API Config] Destroying...');
      requestCache.clear();
      window.OdinApiConfig = null;
      log('[API Config] Destroyed');
    }
    return { id: 'odin-api-config', init, destroy };
  });
})();
