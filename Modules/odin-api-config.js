// odin-api-config.js
// Unified API configuration and wrapper
// Version: 3.1.0 - Torn API, TornStats, FFScouter integration

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
        baseUrlV1: 'https://api.torn.com',
        baseUrlV2: 'https://api.torn.com/v2',
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

    

    // Diagnostics (shared with Settings UI)
    const diagState = (window.OdinDiagnostics && window.OdinDiagnostics.log && window.OdinDiagnostics.services)
      ? window.OdinDiagnostics
      : (window.OdinDiagnostics = {
          log: [],
          services: {
            torn: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 },
            tornStats: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 },
            ffScouter: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 },
            backend: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 }
          },
          push(entry) {
            try {
              this.log.push(entry);
              if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
            } catch (_) {}
          },
          clear() {
            this.log.length = 0;
            for (const k of Object.keys(this.services)) {
              this.services[k] = { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 };
            }
          }
        });

    function recordDiag(service, entry) {
      const s = diagState.services[service] || (diagState.services[service] = { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 });
      if (entry && entry.phase === 'start') {
        diagState.push({ service, ...entry });
        return;
      }
      s.calls += 1;
      if (!entry.ok) s.errors += 1;
      s.bytesOut += (entry.bytesOut || 0);
      s.bytesIn += (entry.bytesIn || 0);
      s.lastAt = entry.ts || Date.now();
      diagState.push({ service, ...entry });
    }

    

    async function fetchJsonForService(service, url) {
      const started = performance.now();
      const bytesOut = (url ? url.length : 0);
      recordDiag(service, { ok: true, phase: 'start', ts: Date.now(), method: 'GET', url, bytesOut });

      const response = await fetch(url);
      const textBody = await response.text();
      const bytesIn = textBody ? textBody.length : 0;

      let data = null;
      try { data = JSON.parse(textBody); } catch (_) {
        const err = new Error('Invalid JSON response');
        err.status = response.status;
        throw err;
      }

      const ms = performance.now() - started;
      return { response, data, ms, bytesOut, bytesIn };
    }
function getDiagnostics() {
      return { services: diagState.services, log: diagState.log };
    }

    function clearDiagnostics() {
      diagState.clear();
    }
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
    async 
    async function tornGet(endpoint, selections = '', paramsObj = {}) {
      if (!tornApiKey) {
        throw new Error('Torn API key not set');
      }

      const selectionsStr = Array.isArray(selections) ? selections.join(',') : (selections || '');
      const params = new URLSearchParams();
      if (selectionsStr) params.set('selections', selectionsStr);
      params.set('key', tornApiKey);
      for (const [k, v] of Object.entries(paramsObj || {})) {
        if (v === undefined || v === null || v === '') continue;
        params.set(k, String(v));
      }

      const cacheKey = `torn:${endpoint}:${selectionsStr}:${JSON.stringify(paramsObj || {})}`;
      const cached = getCached(cacheKey, CONFIG.torn.cacheTime);
      if (cached) return cached;

      await waitForRateLimit('torn');

      const urlV2 = `${CONFIG.torn.baseUrlV2}${endpoint}?${params.toString()}`;
      const urlV1 = `${CONFIG.torn.baseUrlV1}${endpoint}?${params.toString()}`;

      const doFetch = async (url, apiVersion) => {
        const started = performance.now();
        const bytesOut = (url ? url.length : 0);
        recordDiag('torn', { ok: true, phase: 'start', ts: Date.now(), method: 'GET', url, selections: selectionsStr, apiVersion, bytesOut });

        try {
          const response = await fetch(url);
          const textBody = await response.text();
          const bytesIn = textBody ? textBody.length : 0;

          let data = null;
          try { data = JSON.parse(textBody); } catch (_) {
            const err = new Error('Invalid JSON response from Torn API');
            err.status = response.status;
            throw err;
          }

          const ms = performance.now() - started;

          if (data && data.error) {
            const err = new Error(data.error.error || 'Torn API error');
            err.code = data.error.code;
            err.status = response.status;
            err.apiVersion = apiVersion;
            err._tornError = data.error;
            throw err;
          }

          recordDiag('torn', { ok: response.ok, ts: Date.now(), ms, method: 'GET', url, selections: selectionsStr, apiVersion, status: response.status, bytesOut, bytesIn });
          putCached(cacheKey, data);
          return data;
        } catch (e) {
          const ms = performance.now() - started;
          recordDiag('torn', { ok: false, ts: Date.now(), ms, method: 'GET', url, selections: selectionsStr, apiVersion, status: e.status || null, bytesOut, bytesIn: 0, err: e.message || String(e), code: e.code || null });
          throw e;
        }
      };

      try {
        return await doFetch(urlV2, 'v2');
      } catch (e) {
        const code = e && (e.code || (e._tornError && e._tornError.code));
        if (code === 22 || code === 2 || code === 6 || e.status === 404 || e.status === 400) {
          return await doFetch(urlV1, 'v1');
        }
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
        const { response, data, ms, bytesOut, bytesIn } = await fetchJsonForService('tornStats', url);
if (data.error || data.status === 'error') {
          throw new Error(data.message || data.error || 'TornStats API error');
        }

        setCache(cacheKey, data);
        recordDiag('tornStats', { ok: response.ok, ts: Date.now(), ms, method: 'GET', url: url, status: response.status, bytesOut, bytesIn });
          return data;
      } catch(e) {
          recordDiag('tornStats', { ok: false, ts: Date.now(), ms: (typeof ms==='number'?ms:0), method: 'GET', url: url, status: (e && e.status) ? e.status : null, bytesOut: (typeof bytesOut==='number'?bytesOut:0), bytesIn: 0, err: (e && e.message) ? e.message : String(e) });
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
