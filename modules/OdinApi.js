/**
 * Odin Tools - API Client Module
 * Complete integration for Torn API, TornStats, and FFScouter
 * Version: 4.2.0
 * Author: BjornOdinsson89
 * 
 * FIXED: Added cache size limit and periodic cleanup to prevent memory leaks
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinApiModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {}, get: () => null, set: () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const API_VERSION = '4.2.0';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
      torn: {
        baseUrl: 'https://api.torn.com',
        v2BaseUrl: 'https://api.torn.com/v2',
        rateLimit: 100,
        rateLimitWindow: 60000,
        minDelayMs: 650,
        cacheTime: 30000
      },
      tornStats: {
        baseUrlV1: 'https://www.tornstats.com/api/v1',
        baseUrlV2: 'https://www.tornstats.com/api/v2',
        rateLimit: 60,
        rateLimitWindow: 60000,
        minDelayMs: 1100,
        cacheTime: 300000
      },
      ffScouter: {
        baseUrl: 'https://ffscouter.com/api',
        rateLimit: 100,
        rateLimitWindow: 60000,
        cacheTime: 600000
      }
    };

    // ============================================
    // STATE
    // ============================================
    let tornApiKey = '';
    let tornStatsApiKey = '';
    let ffScouterApiKey = '';

    const requestCache = new Map();
    const MAX_CACHE_SIZE = 200; // Prevent unbounded growth
    const rateLimiters = {
      torn: { callCount: 0, windowStart: Date.now(), queue: [] },
      tornStats: { callCount: 0, windowStart: Date.now(), queue: [] },
      ffScouter: { callCount: 0, windowStart: Date.now(), queue: [] }
    };

    // Periodic cache cleanup (every 60 seconds)
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of requestCache) {
        // Remove expired entries
        const service = key.split(':')[0];
        const maxAge = CONFIG[service]?.cacheTime || 30000;
        if (now - value.timestamp > maxAge) {
          requestCache.delete(key);
        }
      }
      // Enforce size limit with LRU eviction
      if (requestCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(requestCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.length - Math.floor(MAX_CACHE_SIZE * 0.8);
        for (let i = 0; i < toRemove; i++) {
          requestCache.delete(entries[i][0]);
        }
      }
    }, 60000);

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
      if (Date.now() - cached.timestamp > maxAge) {
        requestCache.delete(key);
        return null;
      }
      return cached.data;
    }

    function setCache(key, data) {
      requestCache.set(key, { data, timestamp: Date.now() });
    }

    // ============================================
    // RATE LIMITING
    // ============================================
    async function waitForRateLimit(service) {
      const limiter = rateLimiters[service];
      const config = CONFIG[service];
      const now = Date.now();

      const minDelayMs = (typeof config.minDelayMs === 'number' && config.minDelayMs > 0)
        ? config.minDelayMs
        : Math.ceil(config.rateLimitWindow / Math.max(1, config.rateLimit)) + 50;

      if (!limiter.nextAllowedAt) limiter.nextAllowedAt = 0;
      if (!limiter.windowStart) limiter.windowStart = now;
      if (typeof limiter.callCount !== 'number') limiter.callCount = 0;

      if (now - limiter.windowStart >= config.rateLimitWindow) {
        limiter.callCount = 0;
        limiter.windowStart = now;
      }

      const earliest = Math.max(limiter.nextAllowedAt, now);
      let waitMs = earliest - now;

      if (limiter.callCount >= config.rateLimit) {
        const windowWait = config.rateLimitWindow - (now - limiter.windowStart) + 100;
        waitMs = Math.max(waitMs, windowWait);
      }

      if (waitMs > 0) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      limiter.callCount++;
      limiter.nextAllowedAt = Date.now() + minDelayMs;
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
          isFullAccess: missingUser.length === 0 && missingFaction.length === 0
        }
      };
    }

    // ============================================
    // USER API CALLS
    // ============================================
    async function getUser(userId = null, selections = 'basic,profile') {
      const endpoint = userId ? `/user/${userId}` : '/user';
      return tornGet(endpoint, selections);
    }

    async function getUserProfile(userId) {
      return getUser(userId, 'profile');
    }

    async function getUserBattleStats(userId = null) {
      return getUser(userId, 'battlestats');
    }

    async function getUserBars(userId = null) {
      return getUser(userId, 'bars');
    }

    async function getUserAttacks(limit = 100) {
      const data = await tornGet('/user', `attacks&limit=${limit}`);
      return data.attacks || {};
    }

    async function getUserAttacksFull(limit = 100) {
      const data = await tornGet('/user', `attacksfull&limit=${limit}`);
      return data.attacks || {};
    }

    // ============================================
    // FACTION API CALLS
    // ============================================
    async function getFaction(factionId = null, selections = 'basic') {
      const endpoint = factionId ? `/faction/${factionId}` : '/faction';
      return tornGet(endpoint, selections);
    }

    async function getFactionBasic(factionId = null) {
      return getFaction(factionId, 'basic');
    }

    async function getFactionMembers(factionId = null) {
      const data = await getFaction(factionId, 'basic');
      return data.members || {};
    }

    async function getFactionChain(factionId = null) {
      const data = await getFaction(factionId, 'chain');
      return data.chain || null;
    }

    async function getFactionAttacks(factionId = null) {
      const data = await getFaction(factionId, 'attacks');
      return data.attacks || {};
    }

    async function getFactionWars(factionId = null) {
      const data = await getFaction(factionId, 'wars');
      return data;
    }

    async function getFactionRankedWars(factionId = null) {
      const data = await getFaction(factionId, 'rankedwars');
      return data.rankedwars || {};
    }

    // ============================================
    // TORNSTATS API
    // ============================================
    async function tornStatsGet(endpoint, version = 'v2') {
      if (!tornStatsApiKey) {
        throw new Error('TornStats API key not configured');
      }

      const cacheKey = getCacheKey('tornStats', endpoint, { version });
      const cached = getCached(cacheKey, CONFIG.tornStats.cacheTime);
      if (cached) {
        if (window.__ODIN_API_STATS__) window.__ODIN_API_STATS__.cacheHits++;
        return cached;
      }

      await waitForRateLimit('tornStats');

      let url;
      if (version === 'v2') {
        url = `${CONFIG.tornStats.baseUrlV2}/${tornStatsApiKey}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
      } else {
        url = `${CONFIG.tornStats.baseUrlV1}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${tornStatsApiKey}`;
      }

      const startTime = performance.now();
      const logEntry = {
        ts: Date.now(),
        service: 'tornStats',
        endpoint,
        ok: false,
        ms: 0
      };

      try {
        const data = await window.requestJSON(url);
        logEntry.ok = true;
        logEntry.ms = Math.round(performance.now() - startTime);
        logApiCall(logEntry);

        if (data.status === false || data.error) {
          throw new Error(data.message || data.error || 'TornStats API error');
        }

        setCache(cacheKey, data);
        return data;
      } catch (e) {
        logEntry.ok = false;
        logEntry.ms = Math.round(performance.now() - startTime);
        logEntry.error = e.message;
        logApiCall(logEntry);
        throw e;
      }
    }

    async function getTornStatsSpy(playerId) {
      const pid = String(playerId).trim();
      if (!pid) throw new Error('Player ID required');

      try {
        return await tornStatsGet(`/spy/user/${encodeURIComponent(pid)}`, 'v2');
      } catch (e) {
        // Fallback to older endpoint
        return await tornStatsGet(`/spy/${encodeURIComponent(pid)}`, 'v2');
      }
    }

    async function getTornStatsFaction(factionId) {
      const fid = String(factionId).trim();
      if (!fid) throw new Error('Faction ID required');

      try {
        return await tornStatsGet(`/spy/faction/${encodeURIComponent(fid)}`, 'v2');
      } catch (e) {
        return await tornStatsGet(`/faction/${encodeURIComponent(fid)}`, 'v2');
      }
    }

    async function getTornStatsBattleStats(playerId) {
      try {
        const data = await getTornStatsSpy(playerId);
        if (!data || !data.spy) return null;

        return {
          total: data.spy.total || 0,
          strength: data.spy.strength || 0,
          defense: data.spy.defense || 0,
          speed: data.spy.speed || 0,
          dexterity: data.spy.dexterity || 0,
          timestamp: data.spy.timestamp || Date.now(),
          source: 'tornstats'
        };
      } catch (e) {
        log('[API] TornStats battle stats error:', e.message);
        return null;
      }
    }

    // ============================================
    // FFSCOUTER API
    // ============================================
    async function ffScouterGet(endpoint) {
      const url = `${CONFIG.ffScouter.baseUrl}${endpoint}`;

      const cacheKey = getCacheKey('ffScouter', endpoint, {});
      const cached = getCached(cacheKey, CONFIG.ffScouter.cacheTime);
      if (cached) {
        if (window.__ODIN_API_STATS__) window.__ODIN_API_STATS__.cacheHits++;
        return cached;
      }

      await waitForRateLimit('ffScouter');

      const startTime = performance.now();
      const logEntry = {
        ts: Date.now(),
        service: 'ffScouter',
        endpoint,
        ok: false,
        ms: 0
      };

      try {
        const headers = {};
        if (ffScouterApiKey) {
          headers['Authorization'] = `Bearer ${ffScouterApiKey}`;
        }

        const data = await window.requestJSON(url, { headers });
        logEntry.ok = true;
        logEntry.ms = Math.round(performance.now() - startTime);
        logApiCall(logEntry);

        setCache(cacheKey, data);
        return data;
      } catch (e) {
        logEntry.ok = false;
        logEntry.ms = Math.round(performance.now() - startTime);
        logEntry.error = e.message;
        logApiCall(logEntry);
        throw e;
      }
    }

    async function getFFScouterPlayer(playerId) {
      try {
        return await ffScouterGet(`/player/${playerId}`);
      } catch (e) {
        log('[API] FFScouter player error:', e.message);
        return null;
      }
    }

    async function getFFScouterFaction(factionId) {
      try {
        return await ffScouterGet(`/faction/${factionId}`);
      } catch (e) {
        log('[API] FFScouter faction error:', e.message);
        return null;
      }
    }

    // ============================================
    // ENRICHED DATA FETCHING
    // ============================================
    async function getEnrichedPlayer(playerId, options = {}) {
      const {
        includeTornStats = true,
        includeFFScouter = true,
        forceRefresh = false
      } = options;

      const result = {
        id: playerId,
        torn: null,
        tornStats: null,
        ffScouter: null,
        enrichedAt: Date.now()
      };

      // Get basic Torn data
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

      // Get basic Torn faction data
      try {
        result.torn = await getFaction(factionId, 'basic');
        
        // Parse members
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

      // Get TornStats faction data if configured
      if (includeTornStats && tornStatsApiKey) {
        try {
          result.tornStats = await getTornStatsFaction(factionId);
        } catch (e) {
          log('[API] TornStats faction error:', e.message);
        }
      }

      // Get FFScouter faction data if configured
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
    function setTornApiKey(key) {
      tornApiKey = key;
      log('[API] Torn API key set');
    }

    function setTornStatsApiKey(key) {
      tornStatsApiKey = key;
      log('[API] TornStats API key set');
    }

    function setFFScouterApiKey(key) {
      ffScouterApiKey = key;
      log('[API] FFScouter API key set');
    }

    function getTornApiKey() {
      return tornApiKey;
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

      // TornStats API
      tornStatsGet,
      getTornStatsSpy,
      getTornStatsFaction,
      getTornStatsBattleStats,
      setTornStatsApiKey,
      hasTornStatsKey,

      // FFScouter API
      ffScouterGet,
      getFFScouterPlayer,
      getFFScouterFaction,
      setFFScouterApiKey,
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
