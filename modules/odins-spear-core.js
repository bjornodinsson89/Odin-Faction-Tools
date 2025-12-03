// odins-spear-core.js
// Odin’s Spear – War Claims / Med Deals / Faction Notes / Watchers / Freki Bridge
// Headless core engine
//
// Exposed via:
//   window.OdinsSpear
//   OdinContext.odinsSpear
//
// Emits events on OdinContext.nexus (see CONFIG.EVENTS).

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinsSpearModuleInit(OdinContext) {
    const state = OdinContext.getState();
    const apiModule = OdinContext.api;
    const nexus = OdinContext.nexus;
    const logic = OdinContext.logic || null;

    // ---------------------------------------------------------------------------
    // CONFIG
    // ---------------------------------------------------------------------------

    const SPEAR_VERSION = '1.0.0-odin';

    const CONFIG = {
      VERSION: SPEAR_VERSION,

      // Backend HTTP gateways
      API_GET_URL: 'https://apiget-codod64xdq-uc.a.run.app',
      API_POST_URL: 'https://apipost-codod64xdq-uc.a.run.app',

      // Bundle endpoint (claims + notes + warConfig)
      API_BUNDLE_URL: 'https://getglobaldata-codod64xdq-uc.a.run.app',

      // Firebase-style auth
      FIREBASE: {
        projectId: 'tornuserstracker',
        apiKey: 'AIzaSyDScnXHu4Q7r696LSuK64dhUSlX_EvxpZY',
        customTokenUrl: 'https://issueauthtoken-codod64xdq-uc.a.run.app',
      },

      REFRESH: {
        ACTIVE_MS: 10_000,
        INACTIVE_MS: 60_000,
      },

      CLAIM_RULES_DEFAULTS: {
        keepClaimsUntilInactive: true,
        requireReclaimAfterSuccess: false,
        inactivityTimeoutSeconds: 300,
        maxHospitalReleaseMinutes: 0,
      },

      STORAGE: {
        SESSION_KEY: 'spear.session',
        SETTINGS_ROOT: 'odinsSpear',
        LOCAL_CLAIMS_KEY: 'spear.localClaims',
        LOCAL_NOTES_KEY: 'spear.localNotes',
        LOCAL_WAR_KEY: 'spear.localWarConfig',
        WATCHERS_KEY: 'spear.watchers',
      },

      LIMITS: {
        MAX_CLAIMS_PER_TARGET: 1,
        MAX_CLAIMS_PER_USER: 2,
        MAX_WATCHERS: 8,
        MAX_NOTE_LENGTH: 2000,
      },

      EVENTS: {
        READY: 'SPEAR_READY',

        CLAIMS_INIT: 'SPEAR_CLAIMS_INIT',
        CLAIMS_UPDATED: 'SPEAR_CLAIMS_UPDATED',
        CLAIM_CREATED: 'SPEAR_CLAIM_CREATED',
        CLAIM_COMPLETED: 'SPEAR_CLAIM_COMPLETED',
        CLAIM_CANCELLED: 'SPEAR_CLAIM_CANCELLED',
        CLAIM_EXPIRED: 'SPEAR_CLAIM_EXPIRED',

        WAR_INIT: 'SPEAR_WAR_INIT',
        WAR_UPDATED: 'SPEAR_WAR_UPDATED',

        NOTES_INIT: 'SPEAR_NOTES_INIT',
        NOTES_UPDATED: 'SPEAR_NOTES_UPDATED',

        WATCHERS_INIT: 'SPEAR_WATCHERS_INIT',
        WATCHERS_UPDATED: 'SPEAR_WATCHERS_UPDATED',
      },
    };

    // ---------------------------------------------------------------------------
    // HELPERS
    // ---------------------------------------------------------------------------

    function log(...args) {
      try {
        console.log('[ODIN:ODINS-SPEAR]', ...args);
      } catch (_) {}
    }

    function nowMs() {
      return Date.now();
    }

    function safeJsonParse(text, fallback) {
      if (!text || typeof text !== 'string') return fallback;
      try {
        return JSON.parse(text);
      } catch (_) {
        return fallback;
      }
    }

    function clamp(val, min, max) {
      val = Number(val);
      if (!Number.isFinite(val)) return min;
      if (val < min) return min;
      if (val > max) return max;
      return val;
    }

    function getUserId() {
      try {
        if (logic && logic.user) {
          return (
            logic.user.tornId ||
            logic.user.player_id ||
            logic.user.playerId ||
            logic.user.userID ||
            logic.user.userid ||
            null
          );
        }
        if (state && state.user) {
          return (
            state.user.tornId ||
            state.user.player_id ||
            state.user.playerId ||
            state.user.userID ||
            state.user.userid ||
            null
          );
        }
      } catch (_) {}
      return null;
    }

    function getFactionId() {
      try {
        if (logic && logic.user && logic.user.factionId) return logic.user.factionId;
        if (state && state.user && state.user.factionId) return state.user.factionId;
        if (state && state.user && state.user.faction && state.user.faction.id) {
          return state.user.faction.id;
        }
      } catch (_) {}
      return null;
    }

    function getApiKey() {
      try {
        if (apiModule && apiModule.apiKey) return apiModule.apiKey;
        if (state && state.settings && state.settings.apiKey) return state.settings.apiKey;
      } catch (_) {}
      return null;
    }

    // Settings namespaced under state.settings.odinsSpear
    const SettingsStore = {
      ensureRoot() {
        state.settings = state.settings || {};
        if (!state.settings[CONFIG.STORAGE.SETTINGS_ROOT]) {
          state.settings[CONFIG.STORAGE.SETTINGS_ROOT] = {};
        }
        return state.settings[CONFIG.STORAGE.SETTINGS_ROOT];
      },
      get(key, def) {
        try {
          const root = SettingsStore.ensureRoot();
          return Object.prototype.hasOwnProperty.call(root, key) ? root[key] : def;
        } catch (_) {
          return def;
        }
      },
      set(key, value) {
        try {
          const root = SettingsStore.ensureRoot();
          root[key] = value;
          if (typeof state.saveToIDB === 'function') {
            state.saveToIDB();
          }
        } catch (e) {
          log('SettingsStore.set error', e);
        }
      },
    };

    // ---------------------------------------------------------------------------
    // HTTP HELPERS
    // ---------------------------------------------------------------------------

    function gmRequest(opts) {
      return new Promise((resolve, reject) => {
        if (typeof GM_xmlhttpRequest !== 'function') {
          reject(new Error('GM_xmlhttpRequest not available'));
          return;
        }
        try {
          GM_xmlhttpRequest({
            method: opts.method || 'GET',
            url: opts.url,
            headers: opts.headers || {},
            data: opts.data,
            timeout: opts.timeout || 30_000,
            onload: (res) => resolve(res),
            onerror: (err) => reject(err),
            ontimeout: () => reject(new Error('Request timed out')),
          });
        } catch (e) {
          reject(e);
        }
      });
    }

    async function httpJson(method, url, body, extraHeaders) {
      const headers = Object.assign(
        { 'Content-Type': 'application/json' },
        extraHeaders || {}
      );
      const res = await gmRequest({
        method,
        url,
        headers,
        data: body ? JSON.stringify(body) : undefined,
      });
      const status = Number(res && res.status) || 0;
      const text = (res && typeof res.responseText === 'string') ? res.responseText : '';
      if (status < 200 || status >= 300) {
        const err = new Error(`HTTP ${status} for ${url}`);
        err.status = status;
        err.body = text;
        throw err;
      }
      if (!text) return {};
      return safeJsonParse(text, {});
    }

    async function httpForm(url, bodyObj) {
      const params = new URLSearchParams();
      Object.entries(bodyObj || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null) params.append(k, String(v));
      });
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      const res = await gmRequest({
        method: 'POST',
        url,
        headers,
        data: params.toString(),
      });
      const status = Number(res && res.status) || 0;
      const text = (res && typeof res.responseText === 'string') ? res.responseText : '';
      if (status < 200 || status >= 300) {
        const err = new Error(`HTTP ${status} for ${url}`);
        err.status = status;
        err.body = text;
        throw err;
      }
      if (!text) return {};
      return safeJsonParse(text, {});
    }

    // ---------------------------------------------------------------------------
    // AUTH LAYER (Firebase-style, custom token from backend)
    // ---------------------------------------------------------------------------

    const FirebaseAuth = (() => {
      const SESSION_KEY = CONFIG.STORAGE.SESSION_KEY;
      const fbCfg = CONFIG.FIREBASE || {};
      const API_KEY = fbCfg.apiKey || '';
      const CUSTOM_URL = fbCfg.customTokenUrl || '';

      const SIGN_IN_ENDPOINT = API_KEY
        ? `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`
        : null;
      const REFRESH_ENDPOINT = API_KEY
        ? `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`
        : null;

      let session = null;

      function keySnippet(apiKey) {
        if (!apiKey || typeof apiKey !== 'string') return null;
        const clean = apiKey.trim();
        if (clean.length <= 8) return clean;
        const head = clean.slice(0, 4);
        const tail = clean.slice(-4);
        return `${head}…${tail}`;
      }

      function computeExpiresAt(expiresInSec) {
        const now = nowMs();
        const secs = Number(expiresInSec) || 0;
        const ms = secs * 1000;
        return now + ms - 60_000;
      }

      function loadSession() {
        if (session) return session;
        const raw = SettingsStore.get(SESSION_KEY, null);
        if (!raw) return null;
        const parsed = typeof raw === 'string' ? safeJsonParse(raw, null) : raw;
        if (!parsed || !parsed.idToken || !parsed.refreshToken) return null;
        session = parsed;
        return session;
      }

      function saveSession(next) {
        session = next;
        if (!next) {
          SettingsStore.set(SESSION_KEY, null);
          return;
        }
        SettingsStore.set(SESSION_KEY, next);
      }

      async function mintCustomToken({ tornApiKey, tornId, factionId, version }) {
        if (!CUSTOM_URL) throw new Error('Custom auth endpoint not configured.');
        const payload = { tornApiKey, tornId, factionId, version };
        const json = await httpJson('POST', CUSTOM_URL, payload);
        if (!json || !json.customToken) {
          throw new Error('Custom auth endpoint did not return customToken.');
        }
        return json;
      }

      async function exchangeCustomToId(customToken) {
        if (!SIGN_IN_ENDPOINT) throw new Error('Firebase sign-in endpoint not configured.');
        const payload = { token: customToken, returnSecureToken: true };
        const json = await httpJson('POST', SIGN_IN_ENDPOINT, payload);
        if (!json || !json.idToken || !json.refreshToken || !json.expiresIn) {
          throw new Error('Firebase sign-in response missing fields.');
        }
        return json;
      }

      async function refreshIdToken(refreshToken) {
        if (!REFRESH_ENDPOINT) throw new Error('Firebase refresh endpoint not configured.');
        const payload = {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        };
        const json = await httpForm(REFRESH_ENDPOINT, payload);
        if (!json || !json.id_token || !json.refresh_token || !json.expires_in) {
          throw new Error('Firebase refresh response missing fields.');
        }
        return {
          idToken: json.id_token,
          refreshToken: json.refresh_token,
          expiresIn: json.expires_in,
        };
      }

      async function ensureIdToken({ allowAutoSignIn = true } = {}) {
        const cur = loadSession();
        const snippet = keySnippet(getApiKey() || '');
        const now = nowMs();

        if (cur && cur.idToken && cur.expiresAt && cur.refreshToken && cur.keySnippet === snippet) {
          if (now + 60_000 < cur.expiresAt) {
            return cur.idToken;
          }
          try {
            const refreshed = await refreshIdToken(cur.refreshToken);
            const next = {
              idToken: refreshed.idToken,
              refreshToken: refreshed.refreshToken,
              expiresAt: computeExpiresAt(refreshed.expiresIn),
              keySnippet: snippet,
              keyHash: cur.keyHash || null,
              tornId: cur.tornId || getUserId(),
              factionId: cur.factionId || getFactionId(),
            };
            saveSession(next);
            return next.idToken;
          } catch (e) {
            log('Firebase token refresh failed, clearing session', e);
            saveSession(null);
          }
        }

        if (!allowAutoSignIn) {
          throw new Error('No valid auth session; sign-in required.');
        }

        const tornApiKey = getApiKey();
        const tornId = getUserId();
        const factionId = getFactionId();
        if (!tornApiKey || !tornId) {
          throw new Error('Missing Torn API key or user ID for auth.');
        }

        const minted = await mintCustomToken({
          tornApiKey,
          tornId,
          factionId,
          version: CONFIG.VERSION,
        });
        const exchanged = await exchangeCustomToId(minted.customToken);

        const next = {
          idToken: exchanged.idToken,
          refreshToken: exchanged.refreshToken,
          expiresAt: computeExpiresAt(exchanged.expiresIn),
          keySnippet: snippet,
          keyHash: minted.keyHash || null,
          tornId: minted.user && minted.user.tornId ? minted.user.tornId : tornId,
          factionId: minted.user && minted.user.factionId ? minted.user.factionId : factionId || null,
        };
        saveSession(next);
        return next.idToken;
      }

      async function signInInteractive() {
        const tornApiKey = getApiKey();
        const tornId = getUserId();
        const factionId = getFactionId();
        if (!tornApiKey || !tornId) {
          throw new Error('Cannot sign in: missing Torn API key or user ID.');
        }

        const minted = await mintCustomToken({
          tornApiKey,
          tornId,
          factionId,
          version: CONFIG.VERSION,
        });
        const exchanged = await exchangeCustomToId(minted.customToken);
        const snippet = keySnippet(tornApiKey);

        const next = {
          idToken: exchanged.idToken,
          refreshToken: exchanged.refreshToken,
          expiresAt: computeExpiresAt(exchanged.expiresIn),
          keySnippet: snippet,
          keyHash: minted.keyHash || null,
          tornId: minted.user && minted.user.tornId ? minted.user.tornId : tornId,
          factionId: minted.user && minted.user.factionId ? minted.user.factionId : factionId || null,
        };
        saveSession(next);
        return next;
      }

      function clearSession() {
        saveSession(null);
      }

      return {
        ensureIdToken,
        signInInteractive,
        clearSession,
        getSession: () => loadSession(),
      };
    })();

    // ---------------------------------------------------------------------------
    // API CLIENT (actions + bundle)
    // ---------------------------------------------------------------------------

    const ApiClient = {
      async call(action, payload, opts = {}) {
        const method = (opts.method || 'POST').toUpperCase();
        const baseUrl = method === 'GET' ? CONFIG.API_GET_URL : CONFIG.API_POST_URL;
        if (!baseUrl) throw new Error('Odin’s Spear API base URL not configured.');

        const tornId = getUserId();
        const factionId = getFactionId();
        const idToken = await FirebaseAuth.ensureIdToken({ allowAutoSignIn: true });

        const envelope = {
          action,
          version: CONFIG.VERSION,
          tornId,
          factionId,
          clientTime: Math.floor(nowMs() / 1000),
          payload: payload || {},
        };

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        };

        const json = await httpJson(method, baseUrl, envelope, headers);

        if (json && json.error) {
          const err = new Error(json.error.message || json.error.code || 'Backend error');
          Object.assign(err, json.error);
          throw err;
        }
        return json && typeof json.result !== 'undefined' ? json.result : json;
      },

      async fetchBundle({ minClaimsTs, minWarTs, minNotesTs } = {}) {
        const tornId = getUserId();
        const factionId = getFactionId();
        const idToken = await FirebaseAuth.ensureIdToken({ allowAutoSignIn: true });

        const body = {
          version: CONFIG.VERSION,
          tornId,
          factionId,
          clientTime: Math.floor(nowMs() / 1000),
          timestamps: {
            claims: minClaimsTs || null,
            war: minWarTs || null,
            notes: minNotesTs || null,
          },
        };

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        };

        const json = await httpJson('POST', CONFIG.API_BUNDLE_URL, body, headers);
        if (json && json.error) {
          const err = new Error(json.error.message || 'Bundle error');
          Object.assign(err, json.error);
          throw err;
        }
        return json && json.result ? json.result : json;
      },

      async saveClaims(claimsArray, meta) {
        return this.call(
          'claims.save',
          { claims: claimsArray || [], meta: meta || {} },
          { method: 'POST' }
        );
      },

      async deleteClaim(claimId, meta) {
        return this.call(
          'claims.delete',
          { id: claimId, meta: meta || {} },
          { method: 'POST' }
        );
      },

      async setWarConfig(config, meta) {
        return this.call(
          'war.setConfig',
          { config, meta: meta || {} },
          { method: 'POST' }
        );
      },

      async addNote(playerId, text, meta) {
        return this.call(
          'notes.add',
          { playerId, text, meta: meta || {} },
          { method: 'POST' }
        );
      },

      async deleteNote(playerId, meta) {
        return this.call(
          'notes.delete',
          { playerId, meta: meta || {} },
          { method: 'POST' }
        );
      },
    };

    // ---------------------------------------------------------------------------
    // CORE STATE
    // ---------------------------------------------------------------------------

    const OdinsSpear = {
      version: CONFIG.VERSION,

      claims: [],
      warConfig: null,
      notesById: {},

      lastClaimsUpdate: 0,
      lastWarUpdate: 0,
      lastNotesUpdate: 0,

      watchers: [],

      ready: false,
      _syncTimer: null,
      _activityTrackingAttached: false,
    };

    // ---------------------------------------------------------------------------
    // NORMALISERS
    // ---------------------------------------------------------------------------

    function normalizeClaim(raw) {
      if (!raw) return null;
      const now = nowMs();
      const obj = {
        id: String(
          raw.id ||
            raw.claimId ||
            `${raw.targetId || raw.target || 'target'}:${raw.attackerId || raw.attacker || 'attacker'}:${raw.createdAt || now}`
        ),
        targetId: String(raw.targetId || raw.target || ''),
        targetName: raw.targetName || raw.target_name || raw.name || null,
        targetFactionId: raw.targetFactionId ? String(raw.targetFactionId) : null,
        targetFactionName: raw.targetFactionName || null,

        attackerId: String(raw.attackerId || raw.attacker || getUserId() || ''),
        attackerName: raw.attackerName || null,
        attackerFactionId: raw.attackerFactionId ? String(raw.attackerFactionId) : null,
        attackerFactionName: raw.attackerFactionName || null,

        warKey: raw.warKey || raw.warId || null,

        kind: raw.kind || raw.type || 'hit', // 'hit' | 'med' | 'assist' | 'retal' | 'other'
        status: raw.status || 'active', // 'active' | 'completed' | 'expired' | 'cancelled' | 'superseded'

        createdAt: Number(raw.createdAt || raw.created_at || now) || now,
        updatedAt: Number(raw.updatedAt || raw.updated_at || raw.createdAt || now) || now,
        expiresAt: raw.expiresAt ? Number(raw.expiresAt) : null,

        flags: raw.flags || {},
        meta: raw.meta || {},
      };

      if (!obj.targetId || !obj.attackerId) return null;
      return obj;
    }

    function normalizeNote(raw) {
      if (!raw) return null;
      const now = nowMs();
      let text = String(raw.text || '');
      if (text.length > CONFIG.LIMITS.MAX_NOTE_LENGTH) {
        text = text.slice(0, CONFIG.LIMITS.MAX_NOTE_LENGTH);
      }
      const obj = {
        playerId: String(raw.playerId || raw.id || raw.targetId || ''),
        text,
        authorId: raw.authorId ? String(raw.authorId) : null,
        authorName: raw.authorName || null,
        updatedAt: Number(raw.updatedAt || raw.updated_at || now) || now,
        createdAt: Number(raw.createdAt || raw.created_at || raw.updatedAt || now) || now,
      };
      if (!obj.playerId) return null;
      return obj;
    }

    function normalizeWarConfig(raw) {
      if (!raw || typeof raw !== 'object') raw = {};
      const defaults = CONFIG.CLAIM_RULES_DEFAULTS;
      return {
        warType: raw.warType || raw.type || 'Unknown',
        medDealsEnabled: !!(raw.medDealsEnabled ?? raw.medDeals ?? false),
        medDealNote: raw.medDealNote || '',

        keepClaimsUntilInactive:
          typeof raw.keepClaimsUntilInactive === 'boolean'
            ? raw.keepClaimsUntilInactive
            : defaults.keepClaimsUntilInactive,

        requireReclaimAfterSuccess:
          typeof raw.requireReclaimAfterSuccess === 'boolean'
            ? raw.requireReclaimAfterSuccess
            : defaults.requireReclaimAfterSuccess,

        inactivityTimeoutSeconds: clamp(
          raw.inactivityTimeoutSeconds ?? defaults.inactivityTimeoutSeconds,
          60,
          60 * 60
        ),

        maxHospitalReleaseMinutes: clamp(
          raw.maxHospitalReleaseMinutes ?? defaults.maxHospitalReleaseMinutes,
          0,
          24 * 60
        ),

        meta: raw.meta || {},
      };
    }

    // ---------------------------------------------------------------------------
    // LOCAL PERSISTENCE
    // ---------------------------------------------------------------------------

    const LocalCache = {
      loadClaims() {
        const raw = SettingsStore.get(CONFIG.STORAGE.LOCAL_CLAIMS_KEY, null);
        const arr = Array.isArray(raw) ? raw : safeJsonParse(raw, []);
        const out = [];
        for (const item of arr) {
          const c = normalizeClaim(item);
          if (c) out.push(c);
        }
        return out;
      },
      saveClaims(list) {
        try {
          SettingsStore.set(CONFIG.STORAGE.LOCAL_CLAIMS_KEY, list || []);
        } catch (_) {}
      },

      loadNotes() {
        const raw = SettingsStore.get(CONFIG.STORAGE.LOCAL_NOTES_KEY, null);
        const obj = raw && typeof raw === 'object' ? raw : safeJsonParse(raw, {});
        const result = {};
        if (!obj || typeof obj !== 'object') return {};
        Object.keys(obj).forEach((pid) => {
          const n = normalizeNote({ playerId: pid, ...(obj[pid] || {}) });
          if (n) result[pid] = n;
        });
        return result;
      },
      saveNotes(map) {
        try {
          SettingsStore.set(CONFIG.STORAGE.LOCAL_NOTES_KEY, map || {});
        } catch (_) {}
      },

      loadWarConfig() {
        const raw = SettingsStore.get(CONFIG.STORAGE.LOCAL_WAR_KEY, null);
        if (!raw) return null;
        const obj = typeof raw === 'object' ? raw : safeJsonParse(raw, null);
        return obj ? normalizeWarConfig(obj) : null;
      },
      saveWarConfig(cfg) {
        try {
          SettingsStore.set(CONFIG.STORAGE.LOCAL_WAR_KEY, cfg || null);
        } catch (_) {}
      },

      loadWatchers() {
        const raw = SettingsStore.get(CONFIG.STORAGE.WATCHERS_KEY, null);
        const list = Array.isArray(raw) ? raw : safeJsonParse(raw, []);
        const out = [];
        for (const w of list) {
          if (!w) continue;
          const id = String(w.id || w.playerId || w.tornId || w);
          if (!id) continue;
          out.push({
            id,
            name: w.name || w.playerName || null,
          });
          if (out.length >= CONFIG.LIMITS.MAX_WATCHERS) break;
        }
        return out;
      },
      saveWatchers(list) {
        try {
          SettingsStore.set(CONFIG.STORAGE.WATCHERS_KEY, list || []);
        } catch (_) {}
      },
    };

    // ---------------------------------------------------------------------------
    // EVENTS
    // ---------------------------------------------------------------------------

    function emit(eventName, payload) {
      try {
        if (nexus && typeof nexus.emit === 'function') {
          nexus.emit(eventName, payload || {});
        }
      } catch (e) {
        log('nexus.emit error', eventName, e);
      }
    }

    // ---------------------------------------------------------------------------
    // CORE MUTATORS
    // ---------------------------------------------------------------------------

    function setClaims(next, meta) {
      if (!Array.isArray(next)) next = [];
      OdinsSpear.claims = next.map(normalizeClaim).filter(Boolean);
      LocalCache.saveClaims(OdinsSpear.claims);
      OdinsSpear.lastClaimsUpdate = nowMs();
      emit(CONFIG.EVENTS.CLAIMS_UPDATED, {
        claims: OdinsSpear.claims,
        meta: meta || {},
      });
    }

    function mutateClaims(updater, meta) {
      try {
        const cur = OdinsSpear.claims || [];
        const next = updater(cur.slice()) || cur;
        setClaims(next, meta);
      } catch (e) {
        log('mutateClaims error', e);
      }
    }

    function setNotes(nextMap, meta) {
      OdinsSpear.notesById = nextMap || {};
      LocalCache.saveNotes(OdinsSpear.notesById);
      OdinsSpear.lastNotesUpdate = nowMs();
      emit(CONFIG.EVENTS.NOTES_UPDATED, {
        notesById: OdinsSpear.notesById,
        meta: meta || {},
      });
    }

    function setWarConfig(cfg, meta) {
      OdinsSpear.warConfig = cfg ? normalizeWarConfig(cfg) : null;
      LocalCache.saveWarConfig(OdinsSpear.warConfig);
      OdinsSpear.lastWarUpdate = nowMs();
      emit(CONFIG.EVENTS.WAR_UPDATED, {
        warConfig: OdinsSpear.warConfig,
        meta: meta || {},
      });
    }

    function setWatchers(list) {
      OdinsSpear.watchers = list || [];
      LocalCache.saveWatchers(OdinsSpear.watchers);
      emit(CONFIG.EVENTS.WATCHERS_UPDATED, {
        watchers: OdinsSpear.watchers,
      });
    }

    // ---------------------------------------------------------------------------
    // CLAIMS SERVICE
    // ---------------------------------------------------------------------------

    const ClaimsService = {
      getAll() {
        return OdinsSpear.claims.slice();
      },

      getForTarget(targetId) {
        const id = String(targetId || '');
        if (!id) return [];
        return OdinsSpear.claims.filter((c) => c.targetId === id);
      },

      getMyClaims(filter = {}) {
        const me = String(getUserId() || '');
        if (!me) return [];
        return OdinsSpear.claims.filter((c) => {
          if (c.attackerId !== me) return false;
          if (filter.kind && c.kind !== filter.kind) return false;
          if (filter.status && c.status !== filter.status) return false;
          return true;
        });
      },

      getMyActiveClaims(filter = {}) {
        return ClaimsService.getMyClaims({
          ...filter,
          status: 'active',
        });
      },

      hasTargetClaimed(targetId) {
        const id = String(targetId || '');
        if (!id) return false;
        return OdinsSpear.claims.some((c) => c.targetId === id && c.status === 'active');
      },

      getWarConfig() {
        return OdinsSpear.warConfig ? { ...OdinsSpear.warConfig } : null;
      },

      _enforceLimits(kind) {
        const me = String(getUserId() || '');
        if (!me) {
          const err = new Error('Not signed in; cannot create claim.');
          err.code = 'auth_required';
          throw err;
        }

        const myActive = ClaimsService.getMyActiveClaims({});
        const warCfg = OdinsSpear.warConfig || normalizeWarConfig({});

        if (myActive.length >= CONFIG.LIMITS.MAX_CLAIMS_PER_USER) {
          const err = new Error('You already have the maximum number of active claims.');
          err.code = 'claims_quota_reached';
          throw err;
        }

        const warType = (warCfg.warType || '').toLowerCase();
        const isTerm = warType.includes('term');

        if (isTerm) {
          const myActiveHits = myActive.filter((c) => c.kind === 'hit');
          const myActiveMeds = myActive.filter((c) => c.kind === 'med');

          if (kind === 'hit' && myActiveHits.length >= 1) {
            const err = new Error('You already have an active hit claim in current war.');
            err.code = 'claims_hit_limit';
            throw err;
          }
          if (kind === 'med' && myActiveMeds.length >= 1) {
            const err = new Error('You already have an active med agreement in current war.');
            err.code = 'claims_med_limit';
            throw err;
          }
        }
      },

      async createClaim({
        targetId,
        targetName,
        targetFactionId,
        targetFactionName,
        kind = 'hit',
        warKey = null,
        flags = {},
        meta = {},
      }) {
        const me = String(getUserId() || '');
        if (!me) throw new Error('Not signed in; cannot create claim.');

        const id = String(targetId || '');
        if (!id) throw new Error('Missing targetId.');

        const activeForTarget = ClaimsService.getForTarget(id).filter((c) => c.status === 'active');
        if (activeForTarget.length >= CONFIG.LIMITS.MAX_CLAIMS_PER_TARGET) {
          const err = new Error('Target already has an active claim.');
          err.code = 'claims_target_occupied';
          throw err;
        }

        ClaimsService._enforceLimits(kind);

        const now = nowMs();

        const claim = normalizeClaim({
          id: `claim:${me}:${id}:${now}`,
          targetId: id,
          targetName,
          targetFactionId,
          targetFactionName,
          attackerId: me,
          attackerName: logic && logic.user && logic.user.name,
          attackerFactionId: getFactionId(),
          warKey,
          kind,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          flags: flags || {},
          meta: meta || {},
        });

        mutateClaims(
          (cur) => cur.concat(claim),
          { source: 'local-create' }
        );

        emit(CONFIG.EVENTS.CLAIM_CREATED, { claim, meta: meta || {} });

        try {
          const result = await ApiClient.saveClaims(OdinsSpear.claims, {
            source: 'create',
          });
          if (result && Array.isArray(result.claims)) {
            const normalized = result.claims.map(normalizeClaim).filter(Boolean);
            setClaims(normalized, { source: 'server-ack' });
          }
        } catch (e) {
          log('saveClaims error after create', e);
        }

        return claim;
      },

      async completeClaim(claimId, payloadMeta = {}) {
        const id = String(claimId || '');
        if (!id) throw new Error('Missing claim id.');

        const now = nowMs();
        let completedClaim = null;

        mutateClaims(
          (cur) =>
            cur.map((c) => {
              if (c.id !== id) return c;
              const updated = {
                ...c,
                status: 'completed',
                updatedAt: now,
                meta: {
                  ...(c.meta || {}),
                  ...(payloadMeta || {}),
                  completedAt: now,
                },
              };
              completedClaim = updated;
              return updated;
            }),
          { source: 'local-complete', meta: payloadMeta || {} }
        );

        if (completedClaim) {
          emit(CONFIG.EVENTS.CLAIM_COMPLETED, {
            claim: completedClaim,
            meta: payloadMeta || {},
          });
        }

        try {
          await ApiClient.deleteClaim(id, {
            status: 'completed',
            ...payloadMeta,
          });
        } catch (e) {
          log('deleteClaim error (complete)', e);
        }
      },

      async cancelClaim(claimId, payloadMeta = {}) {
        const id = String(claimId || '');
        if (!id) throw new Error('Missing claim id.');

        const now = nowMs();
        let cancelledClaim = null;

        mutateClaims(
          (cur) =>
            cur.map((c) => {
              if (c.id !== id) return c;
              const updated = {
                ...c,
                status: 'cancelled',
                updatedAt: now,
                meta: {
                  ...(c.meta || {}),
                  ...(payloadMeta || {}),
                  cancelledAt: now,
                },
              };
              cancelledClaim = updated;
              return updated;
            }),
          { source: 'local-cancel', meta: payloadMeta || {} }
        );

        if (cancelledClaim) {
          emit(CONFIG.EVENTS.CLAIM_CANCELLED, {
            claim: cancelledClaim,
            meta: payloadMeta || {},
          });
        }

        try {
          await ApiClient.deleteClaim(id, {
            status: 'cancelled',
            ...payloadMeta,
          });
        } catch (e) {
          log('deleteClaim error (cancel)', e);
        }
      },

      async expireClaim(claimId, payloadMeta = {}) {
        const id = String(claimId || '');
        if (!id) throw new Error('Missing claim id.');

        const now = nowMs();
        let expiredClaim = null;

        mutateClaims(
          (cur) =>
            cur.map((c) => {
              if (c.id !== id) return c;
              const updated = {
                ...c,
                status: 'expired',
                updatedAt: now,
                meta: {
                  ...(c.meta || {}),
                  ...(payloadMeta || {}),
                  expiredAt: now,
                },
              };
              expiredClaim = updated;
              return updated;
            }),
          { source: 'local-expire', meta: payloadMeta || {} }
        );

        if (expiredClaim) {
          emit(CONFIG.EVENTS.CLAIM_EXPIRED, {
            claim: expiredClaim,
            meta: payloadMeta || {},
          });
        }

        try {
          await ApiClient.deleteClaim(id, {
            status: 'expired',
            ...payloadMeta,
          });
        } catch (e) {
          log('deleteClaim error (expire)', e);
        }
      },
    };

    // ---------------------------------------------------------------------------
    // NOTES SERVICE
    // ---------------------------------------------------------------------------

    const NotesService = {
      get(playerId) {
        const id = String(playerId || '');
        if (!id) return null;
        return OdinsSpear.notesById[id] || null;
      },

      getAll() {
        return { ...OdinsSpear.notesById };
      },

      async set(playerId, text) {
        const id = String(playerId || '');
        if (!id) throw new Error('Missing playerId for note.');

        text = String(text || '');
        if (text.length > CONFIG.LIMITS.MAX_NOTE_LENGTH) {
          text = text.slice(0, CONFIG.LIMITS.MAX_NOTE_LENGTH);
        }

        const now = nowMs();
        const me = String(getUserId() || '');

        const note = normalizeNote({
          playerId: id,
          text,
          authorId: me || null,
          authorName: logic && logic.user && logic.user.name,
          updatedAt: now,
        });

        const next = { ...OdinsSpear.notesById };
        if (text.trim()) {
          next[id] = note;
        } else {
          delete next[id];
        }

        setNotes(next, { source: 'local-set-note' });

        try {
          if (text.trim()) {
            const result = await ApiClient.addNote(id, text, {});
            if (result && result.notes && typeof result.notes === 'object') {
              const merged = {};
              Object.keys(result.notes).forEach((pid) => {
                const n = normalizeNote({
                  playerId: pid,
                  ...(result.notes[pid] || {}),
                });
                if (n) merged[pid] = n;
              });
              setNotes(merged, { source: 'server-ack' });
            }
          } else {
            await ApiClient.deleteNote(id, {});
          }
        } catch (e) {
          log('notes sync error', e);
        }

        return note;
      },
    };

    // ---------------------------------------------------------------------------
    // WAR CONFIG SERVICE
    // ---------------------------------------------------------------------------

    const WarService = {
      getConfig() {
        return OdinsSpear.warConfig ? { ...OdinsSpear.warConfig } : null;
      },

      async setConfig(nextCfg) {
        const cfg = normalizeWarConfig(nextCfg || {});
        setWarConfig(cfg, { source: 'local-set-war' });
        try {
          const result = await ApiClient.setWarConfig(cfg, {});
          if (result && result.config) {
            setWarConfig(result.config, { source: 'server-ack' });
          }
        } catch (e) {
          log('setWarConfig sync error', e);
        }
        return cfg;
      },
    };

    // ---------------------------------------------------------------------------
    // WATCHERS SERVICE
    // ---------------------------------------------------------------------------

    const WatchersService = {
      getAll() {
        return OdinsSpear.watchers.slice();
      },

      add({ id, name }) {
        id = String(id || '');
        if (!id) return;
        const exists = OdinsSpear.watchers.find((w) => w.id === id);
        if (exists) return;
        const list = OdinsSpear.watchers.slice();
        if (list.length >= CONFIG.LIMITS.MAX_WATCHERS) {
          list.shift();
        }
        list.push({ id, name: name || null });
        setWatchers(list);
      },

      remove(id) {
        id = String(id || '');
        if (!id) return;
        const list = OdinsSpear.watchers.filter((w) => w.id !== id);
        setWatchers(list);
      },

      toggle({ id, name }) {
        id = String(id || '');
        if (!id) return;
        const exists = OdinsSpear.watchers.find((w) => w.id === id);
        if (exists) {
          WatchersService.remove(id);
        } else {
          WatchersService.add({ id, name });
        }
      },
    };

    // ---------------------------------------------------------------------------
    // RETALIATION HELPER
    // ---------------------------------------------------------------------------

    const RetalService = {
      getRetalCandidates({ windowSeconds = 24 * 60 * 60 } = {}) {
        const logObj = state.attackLog || {};
        const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
        const seen = {};
        const out = [];

        Object.values(logObj).forEach((attack) => {
          if (!attack || typeof attack !== 'object') return;
          const ts =
            Number(attack.timestamp_ended || attack.timestamp_complete || attack.timestamp) || 0;
          if (!ts || ts < cutoff) return;

          const attackerId = String(
            attack.attacker_id ||
              attack.attacker ||
              attack.attackerID ||
              attack.attackerId ||
              ''
          );
          if (!attackerId) return;

          const prev = seen[attackerId];
          if (!prev || ts > prev.lastSeenAttack) {
            const candidate = {
              attackerId,
              attackerName: attack.attacker_name || null,
              lastSeenAttack: ts,
              rawAttack: attack,
            };
            seen[attackerId] = candidate;
          }
        });

        Object.values(seen).forEach((c) => out.push(c));
        out.sort((a, b) => b.lastSeenAttack - a.lastSeenAttack);
        return out;
      },
    };

    // ---------------------------------------------------------------------------
    // FREKI BRIDGE
    // ---------------------------------------------------------------------------

    const FrekiBridge = {
      isAvailable() {
        try {
          return typeof window.Freki === 'object' && window.Freki && window.Freki.ready;
        } catch (_) {
          return false;
        }
      },

      scoreTarget(target, opts) {
        if (!FrekiBridge.isAvailable()) return null;
        try {
          return window.Freki.scoreTarget(target, opts || {});
        } catch (e) {
          log('Freki.scoreTarget error', e);
          return null;
        }
      },

      rankTargets(targets, opts) {
        if (!FrekiBridge.isAvailable()) return targets || [];
        try {
          return window.Freki.rankTargets(targets, opts || {});
        } catch (e) {
          log('Freki.rankTargets error', e);
          return targets || [];
        }
      },

      getBucketStats(attackerLevel, opponentLevel, chainCount, isWar) {
        if (!FrekiBridge.isAvailable()) return null;
        try {
          return window.Freki.getBucketStats(
            attackerLevel,
            opponentLevel,
            chainCount,
            isWar
          );
        } catch (e) {
          log('Freki.getBucketStats error', e);
          return null;
        }
      },

      getTargetScoreDetails(target, opts) {
        if (!FrekiBridge.isAvailable()) return null;
        try {
          return window.Freki.getTargetScoreDetails(target, opts || {});
        } catch (e) {
          log('Freki.getTargetScoreDetails error', e);
          return null;
        }
      },
    };

    // ---------------------------------------------------------------------------
    // SYNC LOOP (bundle pull, activity-aware)
    // ---------------------------------------------------------------------------

    async function syncBundleOnce(reason) {
      try {
        const minClaimsTs = OdinsSpear.lastClaimsUpdate || 0;
        const minWarTs = OdinsSpear.lastWarUpdate || 0;
        const minNotesTs = OdinsSpear.lastNotesUpdate || 0;

        const result = await ApiClient.fetchBundle({
          minClaimsTs,
          minWarTs,
          minNotesTs,
        });

        if (result.claims && Array.isArray(result.claims)) {
          const list = result.claims.map(normalizeClaim).filter(Boolean);
          setClaims(list, { source: 'bundle', reason });
        }

        if (result.warConfig) {
          setWarConfig(result.warConfig, { source: 'bundle', reason });
        }

        if (result.notes && typeof result.notes === 'object') {
          const map = {};
          Object.keys(result.notes).forEach((pid) => {
            const n = normalizeNote({
              playerId: pid,
              ...(result.notes[pid] || {}),
            });
            if (n) map[pid] = n;
          });
          setNotes(map, { source: 'bundle', reason });
        }
      } catch (e) {
        log('syncBundleOnce error', e);
      }
    }

    function attachActivityTracking() {
      if (OdinsSpear._activityTrackingAttached) return;
      OdinsSpear._activityTrackingAttached = true;

      let lastActivity = nowMs();

      function markActivity() {
        lastActivity = nowMs();
      }

      try {
        if (nexus && typeof nexus.on === 'function') {
          nexus.on('ODIN_ACTIVITY', markActivity);
        }
      } catch (_) {}

      try {
        window.addEventListener('click', markActivity, true);
        window.addEventListener('keydown', markActivity, true);
        window.addEventListener('focus', markActivity, true);
      } catch (_) {}

      const activeMs = CONFIG.REFRESH.ACTIVE_MS;
      const inactiveMs = CONFIG.REFRESH.INACTIVE_MS;

      if (OdinsSpear._syncTimer) clearInterval(OdinsSpear._syncTimer);

      OdinsSpear._syncTimer = setInterval(() => {
        const idleMs = nowMs() - lastActivity;
        const usingInactive = idleMs > 5 * 60_000;
        if (usingInactive) {
          const sinceIntervalStart = idleMs % inactiveMs;
          if (sinceIntervalStart > activeMs) return;
        }
        syncBundleOnce('interval');
      }, activeMs);
    }

    // ---------------------------------------------------------------------------
    // INIT
    // ---------------------------------------------------------------------------

    (function init() {
      try {
        OdinsSpear.claims = LocalCache.loadClaims();
        OdinsSpear.notesById = LocalCache.loadNotes();
        OdinsSpear.warConfig = LocalCache.loadWarConfig();
        OdinsSpear.watchers = LocalCache.loadWatchers();

        emit(CONFIG.EVENTS.CLAIMS_INIT, { claims: OdinsSpear.claims });
        emit(CONFIG.EVENTS.NOTES_INIT, { notesById: OdinsSpear.notesById });
        emit(CONFIG.EVENTS.WAR_INIT, { warConfig: OdinsSpear.warConfig });
        emit(CONFIG.EVENTS.WATCHERS_INIT, { watchers: OdinsSpear.watchers });

        syncBundleOnce('boot');
        attachActivityTracking();

        OdinsSpear.ready = true;
        emit(CONFIG.EVENTS.READY, { version: OdinsSpear.version });
        log('Odin’s Spear core initialised', { version: OdinsSpear.version });
      } catch (e) {
        log('Odin’s Spear init error', e);
      }
    })();

    // ---------------------------------------------------------------------------
    // PUBLIC API
    // ---------------------------------------------------------------------------

    OdinsSpear.api = ApiClient;
    OdinsSpear.auth = FirebaseAuth;
    OdinsSpear.claimsService = ClaimsService;
    OdinsSpear.notesService = NotesService;
    OdinsSpear.warService = WarService;
    OdinsSpear.watchersService = WatchersService;
    OdinsSpear.retalService = RetalService;
    OdinsSpear.freki = FrekiBridge;
    OdinsSpear.config = CONFIG;

    window.OdinsSpear = OdinsSpear;
    try {
      OdinContext.odinsSpear = OdinsSpear;
    } catch (_) {}
  });
})();
