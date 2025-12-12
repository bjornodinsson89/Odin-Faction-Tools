// odin-api-config.js
// Unified API configuration and wrapper
// Version: 3.2.0 - TornStats/FFScouter endpoint fixes + GM XHR adapter

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinApiConfigModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const API_VERSION = '3.2.0';

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
        baseUrl: 'https://ffscouter.com/api/v1',
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
    let ffScouterApiKey = '';
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
    // HTTP ADAPTER (prefers GM_xmlhttpRequest)
    // ============================================
    function hasGMRequest() {
      return (
        typeof GM_xmlhttpRequest === 'function' ||
        (window.GM && typeof window.GM.xmlHttpRequest === 'function')
      );
    }

    function gmRequest(options) {
      const fn = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : window.GM.xmlHttpRequest;
      return fn(options);
    }

    async function requestJson(url, { method = 'GET', headers = {}, data = null, timeout = 30000 } = {}) {
      if (hasGMRequest()) {
        return await new Promise((resolve, reject) => {
          try {
            gmRequest({
              url,
              method,
              headers,
              data,
              timeout,
              responseType: 'json',
              onload: (resp) => {
                try {
                  const status = resp.status || 0;
                  let body = resp.response;
                  if (body == null && resp.responseText) body = JSON.parse(resp.responseText);
                  if (status >= 200 && status < 300) return resolve(body);
                  const err = new Error(`HTTP ${status}`);
                  err.status = status;
                  err.body = body;
                  return reject(err);
                } catch (e) {
                  return reject(e);
                }
              },
              onerror: (resp) => {
                const err = new Error(resp?.error || 'GM request failed');
                err.status = resp?.status;
                err.body = resp;
                reject(err);
              },
              ontimeout: () => reject(new Error('Request timed out')),
            });
          } catch (e) {
            reject(e);
          }
        });
      }

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeout);
      try {
        const resp = await fetch(url, { method, headers, body: data, signal: controller.signal });
        const txt = await resp.text();
        let body = null;
        try {
          body = txt ? JSON.parse(txt) : null;
        } catch {
          body = txt;
        }
        if (!resp.ok) {
          const err = new Error(`HTTP ${resp.status}`);
          err.status = resp.status;
          err.body = body;
          throw err;
        }
        return body;
      } finally {
        clearTimeout(t);
      }
    }

    // ============================================
    // TORN API
    // ============================================
    async function tornGet(endpoint, selections = '') {
      if (!tornApiKey) {
        throw new Error('Torn API key not set');
      }

      // Build URL
      let url = `${CONFIG.torn.baseUrl}${endpoint}`;
      const params = new URLSearchParams();
      if (selections) params.set('selections', selections);
      params.set('key', tornApiKey);
      url += `?${params.toString()}`;

      // Check cache
      const cacheKey = `torn:${endpoint}:${selections}`;
      const cached = getCached(cacheKey, CONFIG.torn.cacheTime);
      if (cached) {
        return cached;
      }

      // Rate limit
      await waitForRateLimit('torn');

      try {
        const data = await requestJson(url, { timeout: 30000 });
        // Handle Torn API errors
        if (data.error) {
          const err = new Error(data.error.error || 'Torn API error');
          err.code = data.error.code;
          throw err;
        }

        setCache(cacheKey, data);
        return data;
      } catch (e) {
        error('[API] Torn request failed:', e);
        throw e;
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
        const data = await requestJson(url, { timeout: 30000 });
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
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const url = `${baseUrl}/${encodeURIComponent(tornStatsApiKey)}${cleanEndpoint}`;

      // Check cache
      const cacheKey = `ts:${endpoint}`;
      const cached = getCached(cacheKey, CONFIG.tornStats.cacheTime);
      if (cached) {
        return cached;
      }

      // Rate limit
      await waitForRateLimit('tornStats');

      try {
        const data = await requestJson(url, { timeout: 30000 });

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
      return tornStatsGet(`/spy/user/${playerId}`, 'v2');
    }

    /**
     * Get faction roster from TornStats
     */
    async function tornStatsFactionGet(factionId) {
      return tornStatsGet(`/faction/roster`, 'v1');
    }

    // ============================================
    // FFSCOUTER API
    // ============================================
    function getFFScouterKey() {
      return (ffScouterApiKey || tornApiKey || '').trim();
    }

    async function ffScouterGetStats(targets) {
      const key = getFFScouterKey();
      if (!key) throw new Error('FFScouter/Torn API key not set');

      const ids = Array.isArray(targets) ? targets : [targets];
      const idStr = ids.map(String).join(',');

      const params = new URLSearchParams();
      params.set('key', key);
      params.set('targets', idStr);

      const url = `${CONFIG.ffScouter.baseUrl}/get-stats?${params.toString()}`;

      const cacheKey = `ffs:get-stats:${idStr}`;
      const cached = getCached(cacheKey, CONFIG.ffScouter.cacheTime);
      if (cached) return cached;

      await waitForRateLimit('ffScouter');

      const data = await requestJson(url, { timeout: 30000 });
      setCache(cacheKey, data);
      return data;
    }

    async function ffScouterGetTargets(filters = {}) {
      const key = getFFScouterKey();
      if (!key) throw new Error('FFScouter/Torn API key not set');

      const params = new URLSearchParams();
      params.set('key', key);
      Object.entries(filters || {}).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        params.set(k, String(v));
      });

      const url = `${CONFIG.ffScouter.baseUrl}/get-targets?${params.toString()}`;

      const cacheKey = `ffs:get-targets:${params.toString()}`;
      const cached = getCached(cacheKey, CONFIG.ffScouter.cacheTime);
      if (cached) return cached;

      await waitForRateLimit('ffScouter');

      const data = await requestJson(url, { timeout: 30000 });
      setCache(cacheKey, data);
      return data;
    }

    // Legacy compat: ffScouterGet('/player/{id}') etc.
    async function ffScouterGet(endpoint) {
      const playerMatch = String(endpoint || '').match(/^\/player\/(\d+)/);
      if (playerMatch) return ffScouterPlayerGet(playerMatch[1]);

      const key = getFFScouterKey();
      const urlObj = new URL(`${CONFIG.ffScouter.baseUrl}${endpoint}`);
      if (key && !urlObj.searchParams.has('key')) urlObj.searchParams.set('key', key);

      const url = urlObj.toString();
      const cacheKey = `ffs:raw:${url}`;
      const cached = getCached(cacheKey, CONFIG.ffScouter.cacheTime);
      if (cached) return cached;

      await waitForRateLimit('ffScouter');

      const data = await requestJson(url, { timeout: 30000 });
      setCache(cacheKey, data);
      return data;
    }

    async function ffScouterPlayerGet(playerId) {
      const rows = await ffScouterGetStats(playerId);
      if (Array.isArray(rows)) {
        const row = rows.find((r) => String(r?.id) === String(playerId)) || rows[0];
        return row || null;
      }
      return rows || null;
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
      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      return `${baseUrl}/${encodeURIComponent(tornStatsApiKey)}${cleanEndpoint}`;
    }

    // ============================================
    // CONFIGURATION SETTERS
    // ============================================
    function setTornApiKey(key) {
      tornApiKey = (key || '').trim();
      log('[API] Torn API key set');
    }

    function setTornStatsApiKey(key) {
      tornStatsApiKey = (key || '').trim();
      log('[API] TornStats API key set');
    }

    function setFFScouterApiKey(key) {
      ffScouterApiKey = (key || '').trim();
      log('[API] FFScouter API key set');
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
      setFFScouterApiKey,
      ffScouterGet,
      ffScouterGetStats,
      ffScouterGetTargets,
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
        if (settings.ffScouterApiKey) {
          setFFScouterApiKey(settings.ffScouterApiKey);
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
