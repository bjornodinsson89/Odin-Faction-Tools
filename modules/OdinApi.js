/**
 * Odin Tools - API Client Module (FIXED VERSION)
 * Complete integration for Torn API, TornStats, and FFScouter
 * Version: 5.0.0
 * Author: BjornOdinsson89
 * 
 * FIXED: Added cache size limits and garbage collection
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinApiModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {}, get: () => null, set: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const API_VERSION = '5.0.1';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
      torn: {
        baseUrl: 'https://api.torn.com',
        v2BaseUrl: 'https://api.torn.com/v2',
        rateLimit: 100,
        rateLimitWindow: 60000,
        cacheTime: 30000
      },
      tornStats: {
        baseUrlV1: 'https://www.tornstats.com/api/v1',
        baseUrlV2: 'https://www.tornstats.com/api/v2',
        rateLimit: 60,
        rateLimitWindow: 60000,
        cacheTime: 300000
      },
      ffScouter: {
        baseUrl: 'https://ffscouter.com/api',
        rateLimit: 100,
        rateLimitWindow: 60000,
        cacheTime: 600000
      },
      cache: {
        maxSize: 500,
        cleanupInterval: 60000,
        defaultExpiry: 30000
      }
    };

    // ============================================
    // STATE
    // ============================================
    let tornApiKey = '';
    let tornStatsApiKey = '';
    let ffScouterApiKey = '';


    // ============================================
    // LOCAL SECRET STORAGE (Tampermonkey / Browser Only)
    // ============================================
    const SECRET_NS = 'odin_tools_secret';
    const _hasGMSecret =
      typeof GM_getValue === 'function' &&
      typeof GM_setValue === 'function' &&
      typeof GM_deleteValue === 'function';

    function _skey(k) {
      return SECRET_NS + ':' + String(k || '').trim();
    }

    function secretGet(k, def) {
      const kk = _skey(k);
      try {
        if (_hasGMSecret) return GM_getValue(kk, def);
        const v = localStorage.getItem(kk);
        return v === null ? def : v;
      } catch (_) {
        return def;
      }
    }

    function secretSet(k, val) {
      const kk = _skey(k);
      try {
        if (_hasGMSecret) GM_setValue(kk, val);
        else localStorage.setItem(kk, String(val));
      } catch (_) {}
    }

    function secretDel(k) {
      const kk = _skey(k);
      try {
        if (_hasGMSecret) GM_deleteValue(kk);
        else localStorage.removeItem(kk);
      } catch (_) {}
    }

    const requestCache = new Map();
    const rateLimiters = {
      torn: { callCount: 0, windowStart: Date.now(), queue: [] },
      tornStats: { callCount: 0, windowStart: Date.now(), queue: [] },
      ffScouter: { callCount: 0, windowStart: Date.now(), queue: [] }
    };

    // ============================================
    // CACHE MANAGEMENT (FIXED)
    // ============================================
    function startCacheCleanup() {
      setInterval(() => {
        const now = Date.now();
        let expiredCount = 0;

        // Remove expired entries
        for (const [key, cached] of requestCache) {
          const expiry = cached.expiry || CONFIG.cache.defaultExpiry;
          if (now - cached.timestamp > expiry) {
            requestCache.delete(key);
            expiredCount++;
          }
        }

        // Enforce size limit (keep 80% of max when cleanup triggered)
        if (requestCache.size > CONFIG.cache.maxSize) {
          const entries = Array.from(requestCache.entries());
          entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
          
          const toRemove = entries.length - Math.floor(CONFIG.cache.maxSize * 0.8);
          for (let i = 0; i < toRemove; i++) {
            requestCache.delete(entries[i][0]);
          }
          log('[API] Cache trimmed:', toRemove, 'old entries removed');
        }

        if (expiredCount > 0) {
          log('[API] Cache cleanup:', expiredCount, 'expired entries removed');
        }
      }, CONFIG.cache.cleanupInterval);
    }

    // ============================================
    // DIAGNOSTICS LOGGING
    // ============================================
    if (!window.__ODIN_NET_LOG__) window.__ODIN_NET_LOG__ = { api: [], db: [] };

    function logApiCall(entry) {
      try {
        const netLog = window.__ODIN_NET_LOG__;
        if (!Array.isArray(netLog.api)) netLog.api = [];
        netLog.api.unshift(entry);
        if (netLog.api.length > 300) netLog.api.length = 300;
      } catch (_) {}
    }

    // ============================================
    // CACHING
    // ============================================
    function getCacheKey(service, endpoint, params) {
      return `${service}:${endpoint}:${JSON.stringify(params || {})}`;
    }

    function getCached(key, maxAge) {
      const cached = requestCache.get(key);
      if (!cached) return null;
      
      const expiry = cached.expiry || maxAge || CONFIG.cache.defaultExpiry;
      if (Date.now() - cached.timestamp > expiry) {
        requestCache.delete(key);
        return null;
      }
      return cached.data;
    }

    function setCache(key, data, customExpiry = null) {
      // Prevent cache from growing too large
      if (requestCache.size >= CONFIG.cache.maxSize) {
        // Remove oldest entry
        const oldestKey = requestCache.keys().next().value;
        if (oldestKey) requestCache.delete(oldestKey);
      }
      
      requestCache.set(key, { 
        data, 
        timestamp: Date.now(),
        expiry: customExpiry || CONFIG.cache.defaultExpiry
      });
    }

    // ============================================
    // RATE LIMITING
    // ============================================
    async function waitForRateLimit(service) {
      const limiter = rateLimiters[service];
      const config = CONFIG[service];
      
      if (!limiter || !config) {
        error('[API] Unknown service for rate limiting:', service);
        return;
      }

      const now = Date.now();

      if (now - limiter.windowStart >= config.rateLimitWindow) {
        limiter.callCount = 0;
        limiter.windowStart = now;
      }

      if (limiter.callCount >= config.rateLimit) {
        const waitTime = config.rateLimitWindow - (now - limiter.windowStart) + 100;
        log('[API] Rate limit reached for', service, '- waiting', waitTime, 'ms');
        await new Promise(resolve => setTimeout(resolve, waitTime));
        limiter.callCount = 0;
        limiter.windowStart = Date.now();
      }

      limiter.callCount++;
    }

    // ============================================
    // REQUEST WITH RETRY
    // ============================================
    async function requestWithRetry(url, options = {}, retries = 3) {
      let lastError = null;
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const response = await window.requestJSON(url, options);
          return response;
        } catch (e) {
          lastError = e;
          
          // Don't retry on 4xx errors (client errors)
          if (e.status && e.status >= 400 && e.status < 500) {
            throw e;
          }
          
          // Exponential backoff
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            log('[API] Request failed, retrying in', delay, 'ms (attempt', attempt, 'of', retries, ')');
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      throw lastError;
    }

    // ============================================
    // TORN API V1
    // ============================================
    async function tornGet(endpoint, selections, id = null) {
      if (!tornApiKey) {
        throw new Error('Torn API key not configured');
      }

      const cacheKey = getCacheKey('torn', endpoint, { selections, id });
      const cached = getCached(cacheKey, CONFIG.torn.cacheTime);
      if (cached) {
        if (window.__ODIN_API_STATS__) window.__ODIN_API_STATS__.cacheHits++;
        return cached;
      }

      await waitForRateLimit('torn');

      const params = new URLSearchParams();
      if (selections) params.set('selections', selections);
      params.set('key', tornApiKey);

      let url = CONFIG.torn.baseUrl;
      if (endpoint.startsWith('/')) {
        url += endpoint;
      } else {
        url += '/' + endpoint;
      }
      url += '?' + params.toString();

      const startTime = performance.now();
      const logEntry = {
        ts: Date.now(),
        service: 'torn',
        endpoint,
        selections,
        ok: false,
        ms: 0
      };

      // Emit API call start event for logging
      nexus.emit?.('API_CALL_START', {
        service: 'torn',
        endpoint: endpoint,
        url: url,
        method: 'GET',
        cached: false
      });

      // VISIBLE LOGGING: Log API call to console for diagnostics
      const redactedKey = tornApiKey ? (tornApiKey.slice(0, 4) + '••••' + tornApiKey.slice(-4)) : '<none>';
      log('[API] ⬆️ TORN API REQUEST:', endpoint);
      log('[API]   → URL:', CONFIG.torn.baseUrl + endpoint);
      log('[API]   → Selections:', selections || 'none');
      log('[API]   → API Key:', redactedKey);

      try {
        const data = await requestWithRetry(url);
        const duration = Math.round(performance.now() - startTime);

        logEntry.ok = true;
        logEntry.ms = duration;
        logApiCall(logEntry);

        // VISIBLE LOGGING: Log successful API response
        log('[API] ⬇️ TORN API RESPONSE:', endpoint, '(' + duration + 'ms)');
        log('[API]   ✓ Success - Data received');

        if (data && data.error) {
          const err = new Error(`Torn API Error: ${data.error.error || data.error.message || 'Unknown'}`);
          err.code = data.error.code;

          // VISIBLE LOGGING: Log API error
          error('[API] ❌ TORN API ERROR:', endpoint);
          error('[API]   → Error code:', data.error.code);
          error('[API]   → Error message:', data.error.error || data.error.message);

          // Emit API call error event
          nexus.emit?.('API_CALL_ERROR', {
            service: 'torn',
            endpoint: endpoint,
            url: url,
            method: 'GET',
            error: err.message,
            duration: duration,
            statusCode: data.error.code
          });

          throw err;
        }

        // Emit API call success event
        nexus.emit?.('API_CALL_SUCCESS', {
          service: 'torn',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          duration: duration,
          cached: false
        });

        setCache(cacheKey, data, CONFIG.torn.cacheTime);
        return data;
      } catch (e) {
        const duration = Math.round(performance.now() - startTime);

        logEntry.ok = false;
        logEntry.ms = duration;
        logEntry.error = e.message;
        logApiCall(logEntry);

        // VISIBLE LOGGING: Log network/request error
        error('[API] ❌ TORN API REQUEST FAILED:', endpoint);
        error('[API]   → Error:', e.message);
        error('[API]   → Duration:', duration + 'ms');

        // Emit API call error event
        nexus.emit?.('API_CALL_ERROR', {
          service: 'torn',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          error: e.message,
          duration: duration
        });

        throw e;
      }
    }

    // ============================================
    // TORN API V2
    // ============================================
    async function tornV2Get(endpoint, params = {}) {
      if (!tornApiKey) {
        throw new Error('Torn API key not configured');
      }

      const cacheKey = getCacheKey('tornV2', endpoint, params);
      const cached = getCached(cacheKey, CONFIG.torn.cacheTime);
      if (cached) {
        if (window.__ODIN_API_STATS__) window.__ODIN_API_STATS__.cacheHits++;
        return cached;
      }

      await waitForRateLimit('torn');

      const urlParams = new URLSearchParams(params);
      urlParams.set('key', tornApiKey);

      let url = CONFIG.torn.v2BaseUrl;
      if (endpoint.startsWith('/')) {
        url += endpoint;
      } else {
        url += '/' + endpoint;
      }
      url += '?' + urlParams.toString();

      const startTime = performance.now();

      nexus.emit?.('API_CALL_START', {
        service: 'tornV2',
        endpoint: endpoint,
        url: url,
        method: 'GET'
      });

      try {
        const data = await requestWithRetry(url);
        const duration = Math.round(performance.now() - startTime);

        logApiCall({
          ts: Date.now(),
          service: 'tornV2',
          endpoint,
          ok: true,
          ms: duration
        });

        if (data && data.error) {
          const err = new Error(`Torn API V2 Error: ${data.error.error || data.error.message || 'Unknown'}`);
          err.code = data.error.code;

          nexus.emit?.('API_CALL_ERROR', {
            service: 'tornV2',
            endpoint: endpoint,
            url: url,
            method: 'GET',
            error: err.message,
            duration: duration,
            statusCode: data.error.code
          });

          throw err;
        }

        nexus.emit?.('API_CALL_SUCCESS', {
          service: 'tornV2',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          duration: duration
        });

        setCache(cacheKey, data, CONFIG.torn.cacheTime);
        return data;
      } catch (e) {
        const duration = Math.round(performance.now() - startTime);

        logApiCall({
          ts: Date.now(),
          service: 'tornV2',
          endpoint,
          ok: false,
          ms: duration,
          error: e.message
        });

        nexus.emit?.('API_CALL_ERROR', {
          service: 'tornV2',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          error: e.message,
          duration: duration
        });

        throw e;
      }
    }

    // ============================================
    // TORN API KEY VALIDATION
    // ============================================
    async function validateTornApiKey(key) {
      if (!key) throw new Error('No API key provided');

      const url = `${CONFIG.torn.baseUrl}/key?selections=info&key=${encodeURIComponent(key)}`;

      try {
        const data = await window.requestJSON(url);

        if (data.error) {
          throw new Error(data.error.error || 'Invalid API key');
        }

        return {
          valid: true,
          access_level: data.access_level,
          access_type: data.access_type,
          selections: data.selections || {}
        };
      } catch (e) {
        throw new Error(`API key validation failed: ${e.message}`);
      }
    }

    async function validateTornKeyCapabilities(key) {
      const info = await validateTornApiKey(key);
      
      const required = ['basic', 'profile', 'battlestats', 'bars'];
      const factionRequired = ['basic', 'attacks', 'chain'];
      
      const userSelections = info.selections.user || [];
      const factionSelections = info.selections.faction || [];

      const missingUser = required.filter(s => !userSelections.includes(s));
      const missingFaction = factionRequired.filter(s => !factionSelections.includes(s));

      return {
        ...info,
        capabilities: {
          user: userSelections,
          faction: factionSelections,
          missingUser,
          missingFaction,
          hasFullUser: missingUser.length === 0,
          hasFullFaction: missingFaction.length === 0
        }
      };
    }

    // ============================================
    // TORN API HELPER METHODS
    // ============================================
    async function getUser(userId = null, selections = 'profile') {
      const endpoint = userId ? `user/${userId}` : 'user';
      return tornGet(endpoint, selections);
    }

    async function getUserProfile(userId = null) {
      return getUser(userId, 'profile');
    }

    async function getUserBattleStats(userId = null) {
      return getUser(userId, 'battlestats');
    }

    async function getUserBars(userId = null) {
      return getUser(userId, 'bars');
    }

    async function getUserAttacks(userId = null) {
      return getUser(userId, 'attacks');
    }

    async function getUserAttacksFull(userId = null) {
      return getUser(userId, 'attacksfull');
    }

    // ============================================
    // FACTION API METHODS
    // ============================================
    async function getFaction(factionId = null, selections = 'basic') {
      const endpoint = factionId ? `faction/${factionId}` : 'faction';
      return tornGet(endpoint, selections);
    }

    async function getFactionBasic(factionId = null) {
      return getFaction(factionId, 'basic');
    }

    async function getFactionMembers(factionId = null) {
      return getFaction(factionId, 'basic');
    }

    async function getFactionChain(factionId = null) {
      return getFaction(factionId, 'chain');
    }

    async function getFactionAttacks(factionId = null) {
      return getFaction(factionId, 'attacks');
    }

    async function getFactionWars(factionId = null) {
      return getFaction(factionId, 'wars');
    }

    async function getFactionRankedWars(factionId = null) {
      return getFaction(factionId, 'rankedwars');
    }

    // ============================================
    // TORNSTATS API
    // ============================================
    async function tornStatsGet(endpoint, params = {}) {
      if (!tornStatsApiKey) {
        throw new Error('TornStats API key not configured');
      }

      const cacheKey = getCacheKey('tornStats', endpoint, params);
      const cached = getCached(cacheKey, CONFIG.tornStats.cacheTime);
      if (cached) return cached;

      await waitForRateLimit('tornStats');

      const url = `${CONFIG.tornStats.baseUrlV2}/${tornStatsApiKey}/${endpoint}`;
      const startTime = performance.now();

      nexus.emit?.('API_CALL_START', {
        service: 'tornStats',
        endpoint: endpoint,
        url: url,
        method: 'GET'
      });

      try {
        const data = await requestWithRetry(url);
        const duration = Math.round(performance.now() - startTime);

        logApiCall({
          ts: Date.now(),
          service: 'tornStats',
          endpoint,
          ok: true,
          ms: duration
        });

        nexus.emit?.('API_CALL_SUCCESS', {
          service: 'tornStats',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          duration: duration
        });

        setCache(cacheKey, data, CONFIG.tornStats.cacheTime);
        return data;
      } catch (e) {
        const duration = Math.round(performance.now() - startTime);

        logApiCall({
          ts: Date.now(),
          service: 'tornStats',
          endpoint,
          ok: false,
          ms: duration,
          error: e.message
        });

        nexus.emit?.('API_CALL_ERROR', {
          service: 'tornStats',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          error: e.message,
          duration: duration
        });

        throw e;
      }
    }

    async function getTornStatsSpy(playerId) {
      return tornStatsGet(`spy/${playerId}`);
    }

    async function getTornStatsFaction(factionId) {
      return tornStatsGet(`faction/${factionId}`);
    }

    async function getTornStatsBattleStats(playerId) {
      return tornStatsGet(`spy/${playerId}`);
    }

    // ============================================
    // FFSCOUTER API
    // ============================================
    async function ffScouterGet(endpoint, params = {}) {
      const cacheKey = getCacheKey('ffScouter', endpoint, params);
      const cached = getCached(cacheKey, CONFIG.ffScouter.cacheTime);
      if (cached) return cached;

      await waitForRateLimit('ffScouter');

      let url = `${CONFIG.ffScouter.baseUrl}/${endpoint}`;
      if (Object.keys(params).length > 0) {
        url += '?' + new URLSearchParams(params).toString();
      }

      const startTime = performance.now();

      nexus.emit?.('API_CALL_START', {
        service: 'ffScouter',
        endpoint: endpoint,
        url: url,
        method: 'GET'
      });

      try {
        const data = await requestWithRetry(url);
        const duration = Math.round(performance.now() - startTime);

        logApiCall({
          ts: Date.now(),
          service: 'ffScouter',
          endpoint,
          ok: true,
          ms: duration
        });

        nexus.emit?.('API_CALL_SUCCESS', {
          service: 'ffScouter',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          duration: duration
        });

        setCache(cacheKey, data, CONFIG.ffScouter.cacheTime);
        return data;
      } catch (e) {
        const duration = Math.round(performance.now() - startTime);

        logApiCall({
          ts: Date.now(),
          service: 'ffScouter',
          endpoint,
          ok: false,
          ms: duration,
          error: e.message
        });

        nexus.emit?.('API_CALL_ERROR', {
          service: 'ffScouter',
          endpoint: endpoint,
          url: url,
          method: 'GET',
          error: e.message,
          duration: duration
        });

        throw e;
      }
    }

    async function getFFScouterPlayer(playerId) {
      return ffScouterGet(`player/${playerId}`);
    }

    async function getFFScouterFaction(factionId) {
      return ffScouterGet(`faction/${factionId}`);
    }

    // ============================================
    // FACTION LEADER VERIFICATION
    // ============================================
    /**
     * Verify if the current user is a verified faction leader
     * Uses Torn API data to confirm leader/co-leader status
     * @returns {Promise<boolean>} True if verified as leader, false otherwise
     */
    async function isVerifiedFactionLeader() {
      try {
        // Get user's faction data via their own API key
        const userData = await tornGet('user', 'profile');

        if (!userData || !userData.faction) {
          return false; // Not in a faction
        }

        const position = (userData.faction.position || '').toLowerCase();

        // Leader positions: "Leader", "Co-leader"
        // Using case-insensitive comparison for robustness
        return position === 'leader' || position === 'co-leader';
      } catch (e) {
        // Fail closed - if we can't verify, assume not a leader
        log('[API] Leader verification failed:', e.message);
        return false;
      }
    }

    // ============================================
    // CHAIN INFORMATION ROUTING
    // ============================================
    /**
     * Get chain information with automatic routing based on permissions
     * Non-leaders: uses /user?selections=bars (bars.chain)
     * Leaders: uses /faction?selections=chain
     * @returns {Promise<Object>} Normalized chain data
     */
    async function getChainInfo() {
      const isLeader = await isVerifiedFactionLeader();

      if (isLeader) {
        // Use faction chain endpoint (more detailed, leader-only)
        try {
          const factionData = await tornGet('faction', 'chain');
          const chain = factionData.chain || {};

          return {
            current: chain.current || 0,
            maximum: chain.maximum || 0,
            timeout: chain.timeout || 0,
            modifier: chain.modifier || 1.0,
            cooldown: chain.cooldown || 0,
            start: chain.start || null,
            source: 'faction'
          };
        } catch (e) {
          log('[API] Faction chain access failed, falling back to user bars:', e.message);
          // Fall through to user bars
        }
      }

      // Non-leader or fallback: use user bars
      const userData = await tornGet('user', 'bars');
      const chain = userData.chain || {};

      return {
        current: chain.current || 0,
        maximum: chain.maximum || 0,
        timeout: chain.timeout || 0,
        modifier: chain.modifier || 1.0,
        cooldown: chain.cooldown || 0,
        start: null, // Not available in bars
        source: 'user'
      };
    }

    // ============================================
    // ENRICHED DATA
    // ============================================
    async function getEnrichedPlayer(playerId, options = {}) {
      const {
        includeTornStats = true,
        includeFFScouter = true
      } = options;

      const result = {
        id: playerId,
        torn: null,
        tornStats: null,
        ffScouter: null,
        enrichedAt: Date.now()
      };

      // Get basic Torn profile
      try {
        result.torn = await getUser(playerId, 'profile,personalstats');
      } catch (e) {
        log('[API] Torn profile error:', e.message);
      }

      // Get TornStats data if configured
      if (includeTornStats && tornStatsApiKey) {
        try {
          result.tornStats = await getTornStatsBattleStats(playerId);
        } catch (e) {
          log('[API] TornStats enrichment error:', e.message);
        }
      }

      // Get FFScouter data if configured
      if (includeFFScouter) {
        try {
          result.ffScouter = await getFFScouterPlayer(playerId);
        } catch (e) {
          log('[API] FFScouter enrichment error:', e.message);
        }
      }

      return result;
    }

    async function getEnrichedFaction(factionId, options = {}) {
      const {
        includeTornStats = true,
        includeFFScouter = true
      } = options;

      const result = {
        id: factionId,
        torn: null,
        tornStats: null,
        ffScouter: null,
        members: [],
        enrichedAt: Date.now()
      };

      try {
        result.torn = await getFaction(factionId, 'basic');
        
        if (result.torn && result.torn.members) {
          result.members = Object.entries(result.torn.members).map(([id, member]) => ({
            id: parseInt(id, 10),
            name: member.name,
            level: member.level || 0,
            position: member.position || 'Member',
            daysInFaction: member.days_in_faction || 0,
            lastAction: member.last_action?.relative || 'Unknown',
            lastActionTimestamp: member.last_action?.timestamp || 0,
            status: member.status?.state || 'ok',
            statusUntil: member.status?.until || 0
          }));
        }
      } catch (e) {
        log('[API] Torn faction error:', e.message);
      }

      if (includeTornStats && tornStatsApiKey) {
        try {
          result.tornStats = await getTornStatsFaction(factionId);
        } catch (e) {
          log('[API] TornStats faction error:', e.message);
        }
      }

      if (includeFFScouter) {
        try {
          result.ffScouter = await getFFScouterFaction(factionId);
        } catch (e) {
          log('[API] FFScouter faction error:', e.message);
        }
      }

      return result;
    }

    // ============================================
    // BATCH OPERATIONS
    // ============================================
    async function batchGetPlayers(playerIds, options = {}) {
      const results = {};
      const batchSize = options.batchSize || 5;
      const delay = options.delay || 500;

      for (let i = 0; i < playerIds.length; i += batchSize) {
        const batch = playerIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (id) => {
          try {
            results[id] = await getEnrichedPlayer(id, options);
          } catch (e) {
            results[id] = { id, error: e.message };
          }
        });

        await Promise.all(batchPromises);

        if (i + batchSize < playerIds.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      return results;
    }

    // ============================================
    // CONFIGURATION SETTERS
    // ============================================
    function setTornApiKey(key, opts) {
      const o = opts || {};
      tornApiKey = (key == null) ? '' : String(key).trim();
      if (o.persist !== false) secretSet('tornApiKey', tornApiKey);
      if (!o.silent) log('[API] Torn API key set');
      try { nexus.emit?.('API_KEYS_UPDATED', { service: 'torn', hasKey: !!tornApiKey }); } catch (_) {}
    }

    function setTornStatsApiKey(key, opts) {
      const o = opts || {};
      tornStatsApiKey = (key == null) ? '' : String(key).trim();
      if (o.persist !== false) secretSet('tornStatsApiKey', tornStatsApiKey);
      if (!o.silent) log('[API] TornStats API key set');
      try { nexus.emit?.('API_KEYS_UPDATED', { service: 'tornStats', hasKey: !!tornStatsApiKey }); } catch (_) {}
    }

    function setFFScouterApiKey(key, opts) {
      const o = opts || {};
      ffScouterApiKey = (key == null) ? '' : String(key).trim();
      if (o.persist !== false) secretSet('ffScouterApiKey', ffScouterApiKey);
      if (!o.silent) log('[API] FFScouter API key set');
      try { nexus.emit?.('API_KEYS_UPDATED', { service: 'ffScouter', hasKey: !!ffScouterApiKey }); } catch (_) {}
    }

    function getTornApiKey() {
      return tornApiKey;
    }

    function getTornStatsApiKey() {
      return tornStatsApiKey;
    }

    function getFFScouterApiKey() {
      return ffScouterApiKey;
    }


    function hasTornStatsKey() {
      return !!tornStatsApiKey;
    }

    function hasFFScouterKey() {
      return !!ffScouterApiKey;
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================
    function clearCache() {
      requestCache.clear();
      log('[API] Cache cleared');
    }

    function clearServiceCache(service) {
      for (const [key] of requestCache) {
        if (key.startsWith(service + ':')) {
          requestCache.delete(key);
        }
      }
      log('[API] Cache cleared for', service);
    }

    function getCacheStats() {
      return {
        entries: requestCache.size,
        maxSize: CONFIG.cache.maxSize,
        services: Object.keys(rateLimiters).map(s => ({
          name: s,
          callCount: rateLimiters[s].callCount,
          windowStart: rateLimiters[s].windowStart
        }))
      };
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const OdinApiConfig = {
      version: API_VERSION,

      // Torn API
      tornGet,
      tornV2Get,
      validateTornApiKey,
      validateTornKeyCapabilities,
      setTornApiKey,
      getTornApiKey,

      // User endpoints
      getUser,
      getUserProfile,
      getUserBattleStats,
      getUserBars,
      getUserAttacks,
      getUserAttacksFull,

      // Faction endpoints
      getFaction,
      getFactionBasic,
      getFactionMembers,
      getFactionChain,
      getFactionAttacks,
      getFactionWars,
      getFactionRankedWars,

      // Access Control & Routing
      isVerifiedFactionLeader,
      getChainInfo,

      // TornStats API
      tornStatsGet,
      getTornStatsSpy,
      getTornStatsFaction,
      getTornStatsBattleStats,
      setTornStatsApiKey,
      getTornStatsApiKey,
      hasTornStatsKey,

      // FFScouter API
      ffScouterGet,
      getFFScouterPlayer,
      getFFScouterFaction,
      setFFScouterApiKey,
      getFFScouterApiKey,
      hasFFScouterKey,

      // Enriched data
      getEnrichedPlayer,
      getEnrichedFaction,
      batchGetPlayers,

      // Cache management
      clearCache,
      clearServiceCache,
      getCacheStats,

      // Stats
      getStats() {
        return window.__ODIN_API_STATS__ || {
          totalCalls: 0,
          okCalls: 0,
          failCalls: 0,
          cacheHits: 0,
          bytesIn: 0,
          bytesOut: 0,
          log: []
        };
      },

      // Configuration
      getConfig() {
        return { ...CONFIG };
      }
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[API Config] Initializing v' + API_VERSION);

      // Start cache cleanup
      startCacheCleanup();

      // Load saved keys (LOCAL ONLY - never synced to Firebase)
      try {
        // Migrate any legacy keys out of odin_settings (if present)
        const legacy = storage.getJSON('odin_settings') || {};
        const legacyHadKeys = !!(legacy.tornApiKey || legacy.tornStatsApiKey || legacy.ffScouterApiKey);

        const localTorn = secretGet('tornApiKey', '') || legacy.tornApiKey || '';
        const localTornStats = secretGet('tornStatsApiKey', '') || legacy.tornStatsApiKey || '';
        const localFF = secretGet('ffScouterApiKey', '') || legacy.ffScouterApiKey || '';

        if (localTorn) setTornApiKey(localTorn, { persist: true, silent: true });
        if (localTornStats) setTornStatsApiKey(localTornStats, { persist: true, silent: true });
        if (localFF) setFFScouterApiKey(localFF, { persist: true, silent: true });

        if (legacyHadKeys) {
          delete legacy.tornApiKey;
          delete legacy.tornStatsApiKey;
          delete legacy.ffScouterApiKey;
          storage.setJSON('odin_settings', legacy);
        }
      } catch (e) {
        log('[API Config] Could not load local keys:', e);
      }
// Expose globally
      window.OdinApiConfig = OdinApiConfig;
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
