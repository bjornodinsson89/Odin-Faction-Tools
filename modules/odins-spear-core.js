// odins-spear-core.js
// Headless core engine
//////////////////////
(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinsSpearModuleInit(OdinContext) {
    // Dependency-safe extraction from OdinContext
    const ctx = OdinContext || {};
    const state =
      ctx && typeof ctx.getState === 'function'
        ? ctx.getState()
        : ctx.state || {};
    const api = ctx.api || null; // BaseModule._apiModule
    const nexus = ctx.nexus || null;
    const logic = ctx.logic || null;

    // ----------------------------
    // CONFIG
    // ----------------------------
    const SPEAR_VERSION = '1.0.0-odin';

    const CONFIG = {
  VERSION: SPEAR_VERSION,

  // Backend HTTP gateways
  API_GET_URL: 'https://us-central1-torn-war-room.cloudfunctions.net/api/spear/api',
  API_POST_URL: 'https://us-central1-torn-war-room.cloudfunctions.net/api/spear/api',

  // Bundle endpoint
  API_BUNDLE_URL: 'https://us-central1-torn-war-room.cloudfunctions.net/api/spear/bundle',

  FIREBASE: {
    projectId: 'torn-war-room',
    apiKey: 'AIzaSyAXIP665pJj4g9L9i-G-XVBrcJ0e5V4uw',
    customTokenUrl: 'https://us-central1-torn-war-room.cloudfunctions.net/api/auth/issueauthtoken',
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
        WATCHERS_KEY: 'spear.watchers', // active chain watchers
        WATCHERS_LOG_KEY: 'spear.watchersLog', // chain watcher session history
        ATTACK_LOG_KEY: 'spear.attackLog', // ranked war attack log (normalized)
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

        // Chain watcher state (active “green lights”)
        WATCHERS_INIT: 'SPEAR_WATCHERS_INIT',
        WATCHERS_UPDATED: 'SPEAR_WATCHERS_UPDATED',

        // Chain watcher session log (for leadership export / auditing)
        WATCHERS_LOG_INIT: 'SPEAR_WATCHERS_LOG_INIT',
        WATCHERS_LOG_UPDATED: 'SPEAR_WATCHERS_LOG_UPDATED',

        // Ranked war attack log
        ATTACK_LOG_INIT: 'SPEAR_ATTACK_LOG_INIT',
        ATTACK_LOG_UPDATED: 'SPEAR_ATTACK_LOG_UPDATED',

        // Bridge events for Odin’s Drawer / UI
        OVERLAY_STATE: 'SPEAR_OVERLAY_STATE',
        UI_EVENT: 'SPEAR_UI_EVENT',
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
        if (logic && logic.user && logic.user.factionId)
          return logic.user.factionId;
        if (state && state.user && state.user.factionId)
          return state.user.factionId;
        if (state && state.user && state.user.faction && state.user.faction.id) {
          return state.user.faction.id;
        }
      } catch (_) {}
      return null;
    }

    function getApiKey() {
      try {
        if (api && api.apiKey) return api.apiKey;
        if (state && state.settings && state.settings.apiKey)
          return state.settings.apiKey;
      } catch (_) {}
      return null;
    }

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
          return Object.prototype.hasOwnProperty.call(root, key)
            ? root[key]
            : def;
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
        extraHeaders || {},
      );
      const res = await gmRequest({
        method,
        url,
        headers,
        data: body ? JSON.stringify(body) : undefined,
      });
      const status = Number(res && res.status) || 0;
      const text =
        res && typeof res.responseText === 'string' ? res.responseText : '';
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
      const text =
        res && typeof res.responseText === 'string' ? res.responseText : '';
      if (status < 200 || status >= 300) {
        const err = new Error(`HTTP ${status} for ${url}`);
        err.status = status;
        err.body = text;
        throw err;
      }
      if (!text) return {};
      return safeJsonParse(text, {});
    }

    // ----------------------------
    // AUTH LAYER
    // ----------------------------
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
        // subtract 60s as a safety margin
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

      // Mint a Firebase custom token via backend gateway
      async function mintCustomToken({ tornId, factionId, version }) {
        if (!CUSTOM_URL) throw new Error('Custom auth endpoint not configured.');

        // REQUIRED: include Torn API key in payload, retrieved via helper
        const tornApiKey = getApiKey();
        if (!tornApiKey) {
          throw new Error('Missing Torn API key when minting custom token.');
        }

        const payload = { tornApiKey, tornId, factionId, version };
        const json = await httpJson('POST', CUSTOM_URL, payload);

        if (!json || !json.customToken) {
          throw new Error('Custom auth endpoint did not return customToken.');
        }
        return json;
      }

      async function exchangeCustomToId(customToken) {
        if (!SIGN_IN_ENDPOINT)
          throw new Error('Firebase sign-in endpoint not configured.');

        const payload = {
          token: customToken,
          returnSecureToken: true,
        };

        const json = await httpJson('POST', SIGN_IN_ENDPOINT, payload);
        if (!json || !json.idToken || !json.refreshToken || !json.expiresIn) {
          throw new Error('Firebase sign-in response missing fields.');
        }
        return json;
      }

      async function refreshIdToken(refreshToken) {
        if (!REFRESH_ENDPOINT)
          throw new Error('Firebase refresh endpoint not configured.');

        const payload = {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        };

        const json = await httpForm(REFRESH_ENDPOINT, payload);
        if (
          !json ||
          !json.id_token ||
          !json.refresh_token ||
          !json.expires_in
        ) {
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

        // Reuse if still valid, matches current API key snippet
        if (
          cur &&
          cur.idToken &&
          cur.expiresAt &&
          cur.refreshToken &&
          cur.keySnippet === snippet
        ) {
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

        const tornId = getUserId();
        const factionId = getFactionId();

        if (!tornId) {
          throw new Error('Missing Torn user ID for auth.');
        }

        const minted = await mintCustomToken({
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
          tornId:
            minted.user && minted.user.tornId ? minted.user.tornId : tornId,
          factionId:
            minted.user && minted.user.factionId
              ? minted.user.factionId
              : factionId || null,
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
          tornId:
            minted.user && minted.user.tornId ? minted.user.tornId : tornId,
          factionId:
            minted.user && minted.user.factionId
              ? minted.user.factionId
              : factionId || null,
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

    // ------------------------
    // API CLIENT
    // ------------------------
    const ApiClient = {
      async call(action, payload, opts = {}) {
        const method = (opts.method || 'POST').toUpperCase();
        const baseUrl =
          method === 'GET' ? CONFIG.API_GET_URL : CONFIG.API_POST_URL;
        if (!baseUrl)
          throw new Error('Odin’s Spear API base URL not configured.');

        const tornId = getUserId();
        const factionId = getFactionId();
        const idToken = await FirebaseAuth.ensureIdToken({
          allowAutoSignIn: true,
        });

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
          const err = new Error(
            json.error.message || json.error.code || 'Backend error',
          );
          Object.assign(err, json.error);
          throw err;
        }

        return json && typeof json.result !== 'undefined'
          ? json.result
          : json;
      },

      async fetchBundle({
        minClaimsTs,
        minWarTs,
        minNotesTs,
        minWatchersTs,
        minWatchersLogTs,
      } = {}) {
        const tornId = getUserId();
        const factionId = getFactionId();
        const idToken = await FirebaseAuth.ensureIdToken({
          allowAutoSignIn: true,
        });

        const body = {
          version: CONFIG.VERSION,
          tornId,
          factionId,
          clientTime: Math.floor(nowMs() / 1000),
          // All timestamps are ms since epoch (client view)
          timestamps: {
            claims: minClaimsTs || null,
            war: minWarTs || null,
            notes: minNotesTs || null,
            watchers: minWatchersTs || null,
            watchersLog: minWatchersLogTs || null,
          },
        };

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        };

        const json = await httpJson(
          'POST',
          CONFIG.API_BUNDLE_URL,
          body,
          headers,
        );

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
          { method: 'POST' },
        );
      },

      async deleteClaim(claimId, meta) {
        return this.call(
          'claims.delete',
          { id: claimId, meta: meta || {} },
          { method: 'POST' },
        );
      },

      async setWarConfig(config, meta) {
        return this.call(
          'war.setConfig',
          { config, meta: meta || {} },
          { method: 'POST' },
        );
      },

      async addNote(playerId, text, meta) {
        return this.call(
          'notes.add',
          { playerId, text, meta: meta || {} },
          { method: 'POST' },
        );
      },

      async deleteNote(playerId, meta) {
        return this.call(
          'notes.delete',
          { playerId, meta: meta || {} },
          { method: 'POST' },
        );
      },

      async setChainWatchStatus(isOn, meta) {
        return this.call(
          'chainWatch.setStatus',
          { isOn: !!isOn, meta: meta || {} },
          { method: 'POST' },
        );
      },
    };

    // ------------------------
    // CORE STATE
    // ------------------------
    const OdinsSpear = {
      version: CONFIG.VERSION,

      claims: [],
      warConfig: null,
      notesById: {},
      lastClaimsUpdate: 0,
      lastWarUpdate: 0,
      lastNotesUpdate: 0,

      watchers: [],
      watchersLog: [],
      lastWatchersUpdate: 0,
      lastWatchersLogUpdate: 0,

      // Ranked war attack log
      attacks: [],
      lastAttacksUpdate: 0,

      ready: false,
      _syncTimer: null,
      _activityTrackingAttached: false,
    };

    // --------------------------
    // NORMALISERS
    // --------------------------
    function normalizeClaim(raw) {
      if (!raw) return null;
      const now = nowMs();

      const obj = {
        id: String(
          raw.id ||
            raw.claimId ||
            `${raw.targetId || raw.target || 'target'}:${
              raw.attackerId || raw.attacker || 'attacker'
            }:${raw.createdAt || now}`,
        ),

        targetId: String(raw.targetId || raw.target || ''),
        targetName: raw.targetName || raw.target_name || raw.name || null,
        targetFactionId: raw.targetFactionId
          ? String(raw.targetFactionId)
          : null,
        targetFactionName: raw.targetFactionName || null,

        attackerId: String(
          raw.attackerId || raw.attacker || getUserId() || '',
        ),
        attackerName: raw.attackerName || null,
        attackerFactionId: raw.attackerFactionId
          ? String(raw.attackerFactionId)
          : null,
        attackerFactionName: raw.attackerFactionName || null,

        warKey: raw.warKey || raw.warId || null,
        kind: raw.kind || raw.type || 'hit', // 'hit' | 'med' | 'assist' | 'retal' | 'other'
        status: raw.status || 'active', // 'active' | 'completed' | 'expired' | 'cancelled' | 'superseded'

        createdAt: Number(raw.createdAt || raw.created_at || now) || now,
        updatedAt:
          Number(
            raw.updatedAt || raw.updated_at || raw.createdAt || now,
          ) || now,

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
        createdAt:
          Number(
            raw.createdAt || raw.created_at || raw.updatedAt || now,
          ) || now,
        meta: raw.meta || {},
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
          60 * 60,
        ),

        maxHospitalReleaseMinutes: clamp(
          raw.maxHospitalReleaseMinutes ?? defaults.maxHospitalReleaseMinutes,
          0,
          24 * 60,
        ),

        // Per-war claim limits
        maxClaimsPerTarget: clamp(
          raw.maxClaimsPerTarget ?? CONFIG.LIMITS.MAX_CLAIMS_PER_TARGET,
          1,
          10,
        ),

        maxClaimsPerUser: clamp(
          raw.maxClaimsPerUser ?? CONFIG.LIMITS.MAX_CLAIMS_PER_USER,
          1,
          20,
        ),

        maxMedClaimsPerUser:
          raw.maxMedClaimsPerUser != null
            ? clamp(raw.maxMedClaimsPerUser, 0, 10)
            : null,

        allowedTargetStatuses: Array.isArray(raw.allowedTargetStatuses)
          ? raw.allowedTargetStatuses.map((s) => String(s))
          : [],

        meta: raw.meta || {},
      };
    }

    function normalizeWatcher(raw) {
      if (!raw) return null;
      const now = nowMs();

      const id = String(raw.id || raw.playerId || raw.tornId || '');
      if (!id) return null;

      const startedAt =
        Number(
          raw.startedAt ||
            raw.startTime ||
            raw.started_at ||
            raw.createdAt ||
            raw.created_at ||
            now,
        ) || now;

      const endedRaw =
        raw.endedAt !== undefined
          ? raw.endedAt
          : raw.endTime !== undefined
          ? raw.endTime
          : raw.ended_at !== undefined
          ? raw.ended_at
          : null;

      const endedAt = endedRaw == null ? null : Number(endedRaw) || null;

      const updatedAt =
        Number(
          raw.updatedAt ||
            raw.updated_at ||
            (endedAt != null ? endedAt : startedAt) ||
            now,
        ) || now;

      return {
        id,
        name: raw.name || raw.playerName || null,
        factionId: raw.factionId ? String(raw.factionId) : null,
        startedAt,
        endedAt,
        updatedAt,
        meta: raw.meta || {},
      };
    }

    function normalizeAttack(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const now = nowMs();

      // IDs
      const attackerId =
        raw.attackerId ||
        raw.attacker_id ||
        (raw.attacker && raw.attacker.id) ||
        raw.attacker ||
        null;
      const defenderId =
        raw.defenderId ||
        raw.defender_id ||
        (raw.defender && raw.defender.id) ||
        raw.defender ||
        null;
      if (!attackerId || !defenderId) return null;

      const id =
        String(
          raw.id ||
            raw.attackId ||
            raw.attack_id ||
            raw.code ||
            `${attackerId}:${defenderId}:${
              raw.timestamp_ended ||
              raw.timestamp_complete ||
              raw.timestamp ||
              now
            }`,
        ) || null;

      const attackerName =
        (raw.attacker && raw.attacker.name) ||
        raw.attackerName ||
        raw.attacker_name ||
        null;
      const defenderName =
        (raw.defender && raw.defender.name) ||
        raw.defenderName ||
        raw.defender_name ||
        null;

      const attackerFactionId =
        (raw.attacker && raw.attacker.factionId) ||
        raw.attackerFactionId ||
        raw.attacker_faction ||
        null;
      const defenderFactionId =
        (raw.defender && raw.defender.factionId) ||
        raw.defenderFactionId ||
        raw.defender_faction ||
        null;

      // Timestamps (seconds or ms; we normalize to seconds)
      const endedSec =
        Number(
          raw.timestamp_ended ||
            raw.ended ||
            raw.end ||
            raw.finish ||
            raw.timestamp_complete ||
            raw.timestamp ||
            0,
        ) || 0;

      const startedSec =
        Number(
          raw.timestamp_started ||
            raw.started ||
            raw.start ||
            raw.begin ||
            endedSec ||
            0,
        ) || endedSec;

      const toSec = (v) => {
        if (!v) return 0;
        // If it looks like ms, downscale
        if (v > 3_000_000_000) return Math.floor(v / 1000);
        return Math.floor(v);
      };

      const startedAt = toSec(startedSec);
      const endedAt = toSec(endedSec);

      const result =
        raw.result ||
        raw.outcome ||
        raw.status ||
        raw.result_text ||
        'Unknown';

      const respectGain =
        Number(raw.respect_gain ?? raw.respectGain ?? raw.respect ?? 0) || 0;

      const chain =
        raw.chain != null
          ? Number(raw.chain) || 0
          : raw.chainId != null
          ? Number(raw.chainId) || 0
          : null;

      const chainGapSeconds =
        raw.time_since_last_attack != null
          ? Number(raw.time_since_last_attack) || 0
          : raw.chainGapSeconds != null
          ? Number(raw.chainGapSeconds) || 0
          : null;

      const chainSaver =
        !!(raw.chain_saver ?? raw.chainSaver ?? raw.isChainSaver ?? false);
      const overseas = !!(raw.overseas ?? raw.is_overseas ?? false);
      const outsideWar = !!(raw.outside_war ?? raw.outsideWar ?? false);
      const retaliation =
        !!(raw.retaliation ?? raw.isRetal ?? raw.retal ?? false);

      return {
        id,
        warId: raw.warId || raw.war_id || raw.warKey || null,
        attackerId: Number(attackerId),
        defenderId: Number(defenderId),
        attackerName,
        defenderName,
        attackerFactionId: attackerFactionId ? String(attackerFactionId) : null,
        defenderFactionId: defenderFactionId ? String(defenderFactionId) : null,
        startedAt,
        endedAt: endedAt || null,
        result,
        respectGain,
        chain,
        chainGapSeconds,
        overseas,
        outsideWar,
        retaliation,
        chainSaver,
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
        const obj =
          raw && typeof raw === 'object' ? raw : safeJsonParse(raw, {});
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
        const obj =
          typeof raw === 'object' ? raw : safeJsonParse(raw, null);
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
          const n = normalizeWatcher(w);
          if (!n) continue;
          if (n.endedAt == null) out.push(n);
        }
        return out;
      },

      saveWatchers(list) {
        try {
          SettingsStore.set(CONFIG.STORAGE.WATCHERS_KEY, list || []);
        } catch (_) {}
      },

      loadWatchersLog() {
        const raw = SettingsStore.get(
          CONFIG.STORAGE.WATCHERS_LOG_KEY,
          null,
        );
        const list = Array.isArray(raw) ? raw : safeJsonParse(raw, []);
        const out = [];
        for (const w of list) {
          const n = normalizeWatcher(w);
          if (!n) continue;
          out.push(n);
        }
        return out;
      },

      saveWatchersLog(list) {
        try {
          SettingsStore.set(CONFIG.STORAGE.WATCHERS_LOG_KEY, list || []);
        } catch (_) {}
      },

      loadAttackLog() {
        const raw = SettingsStore.get(CONFIG.STORAGE.ATTACK_LOG_KEY, null);
        const arr = Array.isArray(raw) ? raw : safeJsonParse(raw, []);
        const out = [];
        for (const item of arr) {
          const a = normalizeAttack(item);
          if (a) out.push(a);
        }
        return out;
      },

      saveAttackLog(list) {
        try {
          SettingsStore.set(CONFIG.STORAGE.ATTACK_LOG_KEY, list || []);
        } catch (_) {}
      },
    };

    // ------------------------
    // EVENTS
    // ------------------------
    function emit(eventName, payload) {
      try {
        if (nexus && typeof nexus.emit === 'function') {
          nexus.emit(eventName, payload || {});
        }
      } catch (e) {
        log('nexus.emit error', eventName, e);
      }
    }

    // ----------------------------------------
    // OVERLAY STATE BRIDGE FOR ODIN UI
    // ----------------------------------------
    function buildOverlayState(meta) {
      return {
        summary: {
          claimsCount: Array.isArray(OdinsSpear.claims)
            ? OdinsSpear.claims.length
            : 0,
          activeWatchersCount: Array.isArray(OdinsSpear.watchers)
            ? OdinsSpear.watchers.length
            : 0,
          watchersLogCount: Array.isArray(OdinsSpear.watchersLog)
            ? OdinsSpear.watchersLog.length
            : 0,
          lastClaimsUpdate: OdinsSpear.lastClaimsUpdate || 0,
          lastWarUpdate: OdinsSpear.lastWarUpdate || 0,
          lastNotesUpdate: OdinsSpear.lastNotesUpdate || 0,
          lastWatchersUpdate: OdinsSpear.lastWatchersUpdate || 0,
          lastWatchersLogUpdate:
            OdinsSpear.lastWatchersLogUpdate || 0,
        },

        claims: (OdinsSpear.claims || []).slice(),
        warConfig: OdinsSpear.warConfig
          ? { ...OdinsSpear.warConfig }
          : null,
        notesById: { ...(OdinsSpear.notesById || {}) },
        watchers: (OdinsSpear.watchers || []).slice(),
        watchersLog: (OdinsSpear.watchersLog || []).slice(),

        meta: meta || {},
      };
    }

    function emitOverlayState(meta) {
      try {
        emit(CONFIG.EVENTS.OVERLAY_STATE, buildOverlayState(meta));
      } catch (e) {
        log('emitOverlayState error', e);
      }
    }

    // -----------------------------
    // CORE MUTATORS
    // -----------------------------
    function setClaims(next, meta) {
      if (!Array.isArray(next)) next = [];
      OdinsSpear.claims = next.map(normalizeClaim).filter(Boolean);
      LocalCache.saveClaims(OdinsSpear.claims);
      OdinsSpear.lastClaimsUpdate = nowMs();

      const payloadMeta = meta || {};
      emit(CONFIG.EVENTS.CLAIMS_UPDATED, {
        claims: OdinsSpear.claims,
        meta: payloadMeta,
      });
      emitOverlayState(Object.assign({ source: 'claims' }, payloadMeta));
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

      const payloadMeta = meta || {};
      emit(CONFIG.EVENTS.NOTES_UPDATED, {
        notesById: OdinsSpear.notesById,
        meta: payloadMeta,
      });
      emitOverlayState(Object.assign({ source: 'notes' }, payloadMeta));
    }

    function setWarConfig(cfg, meta) {
      OdinsSpear.warConfig = cfg ? normalizeWarConfig(cfg) : null;
      LocalCache.saveWarConfig(OdinsSpear.warConfig);
      OdinsSpear.lastWarUpdate = nowMs();

      const payloadMeta = meta || {};
      emit(CONFIG.EVENTS.WAR_UPDATED, {
        warConfig: OdinsSpear.warConfig,
        meta: payloadMeta,
      });
      emitOverlayState(
        Object.assign({ source: 'warConfig' }, payloadMeta),
      );
    }

    function setWatchers(list, meta) {
      const normalized = (list || []).map(normalizeWatcher).filter(Boolean);
      OdinsSpear.watchers = normalized.filter((w) => w.endedAt == null);
      LocalCache.saveWatchers(OdinsSpear.watchers);
      OdinsSpear.lastWatchersUpdate = nowMs();

      const payloadMeta = meta || {};
      emit(CONFIG.EVENTS.WATCHERS_UPDATED, {
        watchers: OdinsSpear.watchers,
        meta: payloadMeta,
      });
      emitOverlayState(
        Object.assign({ source: 'watchers' }, payloadMeta),
      );
    }

    function setWatchersLog(list, meta) {
      const normalized = (list || []).map(normalizeWatcher).filter(Boolean);
      OdinsSpear.watchersLog = normalized.slice();
      LocalCache.saveWatchersLog(OdinsSpear.watchersLog);
      OdinsSpear.lastWatchersLogUpdate = nowMs();

      const payloadMeta = meta || {};
      emit(CONFIG.EVENTS.WATCHERS_LOG_UPDATED, {
        watchersLog: OdinsSpear.watchersLog,
        meta: payloadMeta,
      });
      emitOverlayState(
        Object.assign({ source: 'watchersLog' }, payloadMeta),
      );
    }

    function setAttackLog(list, meta) {
      const normalized = (list || []).map(normalizeAttack).filter(Boolean);
      OdinsSpear.attacks = normalized.slice();
      LocalCache.saveAttackLog(OdinsSpear.attacks);
      OdinsSpear.lastAttacksUpdate = nowMs();

      emit(CONFIG.EVENTS.ATTACK_LOG_UPDATED, {
        attacks: OdinsSpear.attacks,
        meta: meta || {},
      });
    }

    function mutateAttackLog(updater, meta) {
      try {
        const cur = OdinsSpear.attacks || [];
        const next = updater(cur.slice()) || cur;
        setAttackLog(next, meta);
      } catch (e) {
        log('mutateAttackLog error', e);
      }
    }

    // -----------------------------------
    // CLAIMS SERVICE
    // ------------------------------------
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
        return OdinsSpear.claims.some(
          (c) => c.targetId === id && c.status === 'active',
        );
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
        const maxPerUser =
          warCfg.maxClaimsPerUser != null
            ? warCfg.maxClaimsPerUser
            : CONFIG.LIMITS.MAX_CLAIMS_PER_USER;

        if (myActive.length >= maxPerUser) {
          const err = new Error(
            'You already have the maximum number of active claims.',
          );
          err.code = 'claims_quota_reached';
          throw err;
        }

        const warType = (warCfg.warType || '').toLowerCase();
        const isTerm = warType.includes('term');
        if (isTerm) {
          const myActiveHits = myActive.filter((c) => c.kind === 'hit');
          const myActiveMeds = myActive.filter((c) => c.kind === 'med');

          // Hits in termed wars: still 1 per user
          if (kind === 'hit' && myActiveHits.length >= 1) {
            const err = new Error(
              'You already have an active hit claim in current war.',
            );
            err.code = 'claims_hit_limit';
            throw err;
          }

          // Meds in termed wars: either a per-war override or default 1
          const maxMed =
            warCfg.maxMedClaimsPerUser != null
              ? warCfg.maxMedClaimsPerUser
              : 1;
          if (kind === 'med' && myActiveMeds.length >= maxMed) {
            const err = new Error(
              'You already have the maximum number of med agreements in current war.',
            );
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

        const warCfg = OdinsSpear.warConfig || normalizeWarConfig({});
        const maxPerTarget =
          warCfg.maxClaimsPerTarget != null
            ? warCfg.maxClaimsPerTarget
            : CONFIG.LIMITS.MAX_CLAIMS_PER_TARGET;

        const activeForTarget = ClaimsService.getForTarget(id).filter(
          (c) => c.status === 'active',
        );
        if (activeForTarget.length >= maxPerTarget) {
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

        mutateClaims((cur) => cur.concat(claim), {
          source: 'local-create',
        });

        emit(CONFIG.EVENTS.CLAIM_CREATED, { claim, meta: meta || {} });

        try {
          const result = await ApiClient.saveClaims(OdinsSpear.claims, {
            source: 'create',
          });
          if (result && Array.isArray(result.claims)) {
            const normalized = result.claims
              .map(normalizeClaim)
              .filter(Boolean);
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
          { source: 'local-complete', meta: payloadMeta || {} },
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
          { source: 'local-cancel', meta: payloadMeta || {} },
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
          { source: 'local-expire', meta: payloadMeta || {} },
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

    // ---------------------------------
    // NOTES SERVICE
    // ---------------------------------
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

    // -----------------------------------
    // WAR CONFIG SERVICE
    // -----------------------------------
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

    // ----------------------------------------------------------
    // CHAIN WATCHER SERVICE (green-light toggle + session log)
    // ----------------------------------------------------------
    const WatchersService = {
      // Active watchers (green lights)
      getActive() {
        return (OdinsSpear.watchers || [])
          .slice()
          .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      },

      getAll() {
        return this.getActive();
      },

      // Historical sessions (for leadership)
      getLog() {
        return (OdinsSpear.watchersLog || [])
          .slice()
          .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      },

      // Is the current user actively on chain watch?
      isMeActive() {
        const me = String(getUserId() || '');
        if (!me) return false;
        return (OdinsSpear.watchers || []).some(
          (w) => w.id === me && w.endedAt == null,
        );
      },

      // All my sessions (including active + history)
      getMySessions() {
        const me = String(getUserId() || '');
        if (!me) return [];
        const combined = []
          .concat(OdinsSpear.watchers || [])
          .concat(OdinsSpear.watchersLog || []);
        return combined.filter((w) => w.id === me);
      },

      // Core toggle, used by UI: flips the green light for the current user.
      async setStatus(isOn, meta = {}) {
        const me = String(getUserId() || '');
        if (!me) throw new Error('Not signed in; cannot toggle chain watch.');

        const now = nowMs();
        const currentlyOn = this.isMeActive();
        isOn = !!isOn;

        // No-op if state already matches requested value
        if (isOn === currentlyOn) {
          return {
            watchers: this.getActive(),
            watchersLog: this.getLog(),
          };
        }

        const currentActive = OdinsSpear.watchers || [];
        const currentLog = OdinsSpear.watchersLog || [];
        let nextActive = currentActive.slice();
        let nextLog = currentLog.slice();

        if (isOn) {
          // Start a new chain watch session for user
          const myName = logic && logic.user && logic.user.name;
          const factionId = getFactionId();

          // Drop any stale active entries for user
          nextActive = nextActive.filter((w) => w.id !== me);
          nextActive.push({
            id: me,
            name: myName || null,
            factionId: factionId ? String(factionId) : null,
            startedAt: now,
            endedAt: null,
            updatedAt: now,
          });
        } else {
          // Stop user's active session and push it into the log
          const remainingActive = [];
          let closedSession = null;

          for (const w of nextActive) {
            if (!closedSession && w.id === me && w.endedAt == null) {
              closedSession = {
                ...w,
                endedAt: now,
                updatedAt: now,
              };
            } else {
              remainingActive.push(w);
            }
          }

          nextActive = remainingActive;
          if (closedSession) {
            nextLog = nextLog.concat(closedSession);
          }
        }

        setWatchers(nextActive, {
          source: 'local-chain-watch',
          meta,
          isOn,
        });
        setWatchersLog(nextLog, {
          source: 'local-chain-watch',
          meta,
          isOn,
        });

        try {
          const result = await ApiClient.setChainWatchStatus(isOn, meta);
          if (result) {
            if (Array.isArray(result.watchers)) {
              setWatchers(result.watchers, {
                source: 'server-ack',
                isOn,
              });
            }
            if (Array.isArray(result.watchersLog)) {
              setWatchersLog(result.watchersLog, {
                source: 'server-ack',
                isOn,
              });
            }
          }
        } catch (e) {
          log('setChainWatchStatus error', e);
        }

        return {
          watchers: this.getActive(),
          watchersLog: this.getLog(),
        };
      },

      async start(meta = {}) {
        return this.setStatus(true, meta);
      },

      async stop(meta = {}) {
        return this.setStatus(false, meta);
      },
    };

    // -----------------------------
    // ATTACK LOG SERVICE
    // -----------------------------
    const AttackLogService = {
      // Return all normalized attacks
      getAll() {
        return (OdinsSpear.attacks || []).slice();
      },

      // Filter by warId + optional filters
      getForWar(warId, filter = {}) {
        const id = warId == null ? null : String(warId);
        const all = OdinsSpear.attacks || [];

        return all.filter((a) => {
          if (id && String(a.warId || '') !== id) return false;

          if (filter.attackerFactionId != null) {
            const fId = String(filter.attackerFactionId);
            if (String(a.attackerFactionId || '') !== fId) return false;
          }

          if (filter.defenderFactionId != null) {
            const fId = String(filter.defenderFactionId);
            if (String(a.defenderFactionId || '') !== fId) return false;
          }

          if (filter.since != null) {
            const since = Number(filter.since) || 0;
            if (!a.startedAt || a.startedAt < since) return false;
          }

          if (filter.until != null) {
            const until = Number(filter.until) || 0;
            if (!a.startedAt || a.startedAt > until) return false;
          }

          if (filter.onlyOurFaction) {
            const myFaction = getFactionId();
            if (!myFaction) return false;
            if (String(a.attackerFactionId || '') !== String(myFaction))
              return false;
          }

          return true;
        });
      },

      // Recent N attacks (optionally filtered)
      getRecent(limit = 100, filter = {}) {
        const all = (OdinsSpear.attacks || []).slice();
        all.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));

        const filtered =
          filter && Object.keys(filter).length
            ? all.filter((a) => this._matchFilter(a, filter))
            : all;

        return filtered.slice(0, limit);
      },

      _matchFilter(a, filter) {
        if (!filter) return true;

        if (filter.warId != null) {
          if (String(a.warId || '') !== String(filter.warId)) return false;
        }

        if (filter.attackerId != null) {
          if (String(a.attackerId || '') !== String(filter.attackerId))
            return false;
        }

        if (filter.defenderId != null) {
          if (String(a.defenderId || '') !== String(filter.defenderId))
            return false;
        }

        if (filter.onlyOurFaction) {
          const myFaction = getFactionId();
          if (!myFaction) return false;
          if (String(a.attackerFactionId || '') !== String(myFaction))
            return false;
        }

        return true;
      },

      // Replace entire local log (used when backend sends a full manifest)
      replaceAll(rawList, meta = {}) {
        const normalized = (rawList || [])
          .map(normalizeAttack)
          .filter(Boolean);
        setAttackLog(normalized, { source: 'attack-replace', meta });
        return this.getAll();
      },

      // Ingest additional attacks by merging into existing log (de-dup by id)
      ingest(rawList, meta = {}) {
        const additions = (rawList || [])
          .map(normalizeAttack)
          .filter(Boolean);
        if (!additions.length) return this.getAll();

        mutateAttackLog(
          (cur) => {
            const byId = {};
            cur.forEach((a) => {
              if (a && a.id) byId[a.id] = a;
            });

            additions.forEach((a) => {
              if (a && a.id) {
                const existing = byId[a.id];
                byId[a.id] =
                  existing && existing.endedAt && !a.endedAt
                    ? existing
                    : a;
              }
            });

            return Object.values(byId);
          },
          { source: 'attack-ingest', meta },
        );

        return this.getAll();
      },

      // CSV export for a given war (or all wars if warId is null)
      toCsv(warId, filter = {}) {
        const rows = this.getForWar(warId, filter);

        const headers = [
          'Time',
          'WarId',
          'AttackerId',
          'AttackerName',
          'DefenderId',
          'DefenderName',
          'AttackerFactionId',
          'DefenderFactionId',
          'Result',
          'RespectGain',
          'Chain',
          'ChainGapSeconds',
          'Overseas',
          'OutsideWar',
          'Retaliation',
          'ChainSaver',
        ];

        const fmtTime = (sec) => {
          if (!sec) return '';
          try {
            const d = new Date(sec * 1000);
            return d.toISOString();
          } catch (_) {
            return String(sec);
          }
        };

        const lines = [];
        lines.push(headers.join(','));

        rows.forEach((a) => {
          const line = [
            fmtTime(a.startedAt),
            a.warId || '',
            a.attackerId ?? '',
            a.attackerName ?? '',
            a.defenderId ?? '',
            a.defenderName ?? '',
            a.attackerFactionId ?? '',
            a.defenderFactionId ?? '',
            a.result ?? '',
            a.respectGain ?? '',
            a.chain ?? '',
            a.chainGapSeconds ?? '',
            a.overseas ? '1' : '0',
            a.outsideWar ? '1' : '0',
            a.retaliation ? '1' : '0',
            a.chainSaver ? '1' : '0',
          ]
            .map((v) => {
              const s = String(v ?? '');
              // basic CSV escaping
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(',');

          lines.push(line);
        });

        return lines.join('\n');
      },

      // Summary stats for a war
      summarizeWar(warId, filter = {}) {
        const rows = this.getForWar(warId, filter);
        if (!rows.length) {
          return {
            warId: warId || null,
            totalAttacks: 0,
            totalRespect: 0,
            avgRespectPerHit: 0,
            chains: {
              count: 0,
              longestChain: 0,
              avgChainGap: 0,
            },
            overseasHits: 0,
            retals: 0,
            outsideWarHits: 0,
          };
        }

        let totalAttacks = 0;
        let totalRespect = 0;
        let chainCount = 0;
        let longestChain = 0;
        let totalChainGap = 0;
        let overseasHits = 0;
        let retals = 0;
        let outsideWarHits = 0;

        rows.forEach((a) => {
          totalAttacks += 1;
          totalRespect += Number(a.respectGain || 0);

          if (a.chain != null && a.chain > 0) {
            chainCount += 1;
            if (a.chain > longestChain) longestChain = a.chain;
          }

          if (a.chainGapSeconds != null && a.chainGapSeconds > 0) {
            totalChainGap += a.chainGapSeconds;
          }

          if (a.overseas) overseasHits += 1;
          if (a.retaliation) retals += 1;
          if (a.outsideWar) outsideWarHits += 1;
        });

        const avgRespectPerHit = totalAttacks
          ? totalRespect / totalAttacks
          : 0;
        const avgChainGap =
          chainCount && totalChainGap ? totalChainGap / chainCount : 0;

        return {
          warId: warId || null,
          totalAttacks,
          totalRespect,
          avgRespectPerHit,
          chains: {
            count: chainCount,
            longestChain,
            avgChainGap,
          },
          overseasHits,
          retals,
          outsideWarHits,
        };
      },
    };

    // -----------------------------
    // UNAUTHORIZED ATTACK SERVICE
    // -----------------------------
    const UnauthorizedAttackService = {
      /**
       * rules: array of {
       *   type: 'hitMedDealTarget' |
       *         'hitOwnFaction' |
       *         'hitDisallowedStatus' |
       *         'hitBelowRespectThreshold' |
       *         'hitOutsideWar'
       * }
       */
      getViolations(warId, rules) {
        const ruleList = Array.isArray(rules) ? rules : [];
        if (!ruleList.length) return [];

        const warCfg = OdinsSpear.warConfig || normalizeWarConfig({});
        const myFactionId = getFactionId();
        if (!myFactionId) return [];

        const attacks = AttackLogService.getForWar(warId, {
          onlyOurFaction: true,
        });

        const activeClaims = ClaimsService.getAll().filter(
          (c) => c.status === 'active',
        );
        const violations = [];

        attacks.forEach((a) => {
          const violated = [];

          ruleList.forEach((rule) => {
            if (!rule || !rule.type) return;

            if (rule.type === 'hitOwnFaction') {
              if (
                String(a.defenderFactionId || '') === String(myFactionId) &&
                String(a.attackerFactionId || '') === String(myFactionId)
              ) {
                violated.push(rule);
              }
            }

            if (rule.type === 'hitOutsideWar') {
              if (a.outsideWar) {
                violated.push(rule);
              }
            }

            if (rule.type === 'hitBelowRespectThreshold') {
              const min = Number(rule.minRespect) || 0;
              if (Number(a.respectGain || 0) < min) {
                violated.push(rule);
              }
            }

            if (rule.type === 'hitMedDealTarget') {
              // Check if defender currently has an active med claim with our faction
              const targetId = String(a.defenderId || '');
              if (!targetId) return;

              const medClaims = activeClaims.filter(
                (c) =>
                  c.kind === 'med' &&
                  String(c.targetId || '') === targetId,
              );
              if (medClaims.length) {
                violated.push(rule);
              }
            }

            if (rule.type === 'hitDisallowedStatus') {
              // This requires status data in attack meta; we use a hint if present.
              const statuses = Array.isArray(rule.statuses)
                ? rule.statuses.map(String)
                : [];
              if (!statuses.length) return;

              const status =
                (a.meta && a.meta.targetStatus) ||
                (a.meta && a.meta.defenderStatus) ||
                null;
              if (status && statuses.includes(String(status))) {
                violated.push(rule);
              }
            }
          });

          if (violated.length) {
            violations.push({
              attack: a,
              rulesViolated: violated,
            });
          }
        });

        // Sort newest first
        violations.sort(
          (a, b) => (b.attack.startedAt || 0) - (a.attack.startedAt || 0),
        );
        return violations;
      },
    };

    // -----------------------------
    // RETALIATION HELPER
    // ----------------------------
    const RetalService = {
      getRetalCandidates({ windowSeconds = 24 * 60 * 60 } = {}) {
        const logObj = state.attackLog || {};
        const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
        const seen = {};
        const out = [];

        Object.values(logObj).forEach((attack) => {
          if (!attack || typeof attack !== 'object') return;

          const ts =
            Number(
              attack.timestamp_ended ||
                attack.timestamp_complete ||
                attack.timestamp,
            ) || 0;
          if (!ts || ts < cutoff) return;

          const attackerId = String(
            attack.attacker_id ||
              attack.attacker ||
              attack.attackerID ||
              attack.attackerId ||
              '',
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

    // ----------------------------
    // FREKI BRIDGE
    // ---------------------------
    const FrekiBridge = {
      isAvailable() {
        try {
          return (
            typeof window.Freki === 'object' &&
            window.Freki &&
            window.Freki.ready
          );
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
            isWar,
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

    // ----------------------------------------
    // SYNC LOOP (bundle pull, activity-aware)
    // ----------------------------------------
    async function syncBundleOnce(reason) {
      try {
        const minClaimsTs = OdinsSpear.lastClaimsUpdate || 0;
        const minWarTs = OdinsSpear.lastWarUpdate || 0;
        const minNotesTs = OdinsSpear.lastNotesUpdate || 0;
        const minWatchersTs = OdinsSpear.lastWatchersUpdate || 0;
        const minWatchersLogTs = OdinsSpear.lastWatchersLogUpdate || 0;

        const result = await ApiClient.fetchBundle({
          minClaimsTs,
          minWarTs,
          minNotesTs,
          minWatchersTs,
          minWatchersLogTs,
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

        if (Array.isArray(result.watchers)) {
          setWatchers(result.watchers, { source: 'bundle', reason });
        }

        if (Array.isArray(result.watchersLog)) {
          setWatchersLog(result.watchersLog, {
            source: 'bundle',
            reason,
          });
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
        const now = nowMs();
        const idleMs = now - lastActivity;

        // Auto turn off chain watch after ~4 minutes idle
        try {
          if (idleMs >= 4 * 60_000 && WatchersService.isMeActive()) {
            WatchersService.setStatus(false, {
              reason: 'autoIdle',
              idleMs,
            }).catch((e) => log('autoIdle watcher off failed', e));
          }
        } catch (e) {
          log('autoIdle watcher check failed', e);
        }

        const usingInactive = idleMs > 5 * 60_000;
        if (usingInactive) {
          const sinceIntervalStart = idleMs % inactiveMs;
          if (sinceIntervalStart > activeMs) return;
        }

        syncBundleOnce('interval');
      }, activeMs);
    }

    // ---------------------------
    // INIT
    // ---------------------------
    (function init() {
      try {
        OdinsSpear.claims = LocalCache.loadClaims();
        OdinsSpear.notesById = LocalCache.loadNotes();
        OdinsSpear.warConfig = LocalCache.loadWarConfig();
        OdinsSpear.watchers = LocalCache.loadWatchers();
        OdinsSpear.watchersLog = LocalCache.loadWatchersLog();
        OdinsSpear.attacks = LocalCache.loadAttackLog();

        emit(CONFIG.EVENTS.CLAIMS_INIT, { claims: OdinsSpear.claims });
        emit(CONFIG.EVENTS.NOTES_INIT, { notesById: OdinsSpear.notesById });
        emit(CONFIG.EVENTS.WAR_INIT, { warConfig: OdinsSpear.warConfig });
        emit(CONFIG.EVENTS.WATCHERS_INIT, {
          watchers: OdinsSpear.watchers,
        });
        emit(CONFIG.EVENTS.WATCHERS_LOG_INIT, {
          watchersLog: OdinsSpear.watchersLog,
        });
        emit(CONFIG.EVENTS.ATTACK_LOG_INIT, {
          attacks: OdinsSpear.attacks,
        });

        syncBundleOnce('boot');
        attachActivityTracking();

        OdinsSpear.ready = true;
        emit(CONFIG.EVENTS.READY, { version: OdinsSpear.version });

        // Initial overlay snapshot for Odin UI
        emitOverlayState({ source: 'init' });

        log('Odin’s Spear core initialised', {
          version: OdinsSpear.version,
        });
      } catch (e) {
        log('Odin’s Spear init error', e);
      }
    })();

    // -------------------------
    // PUBLIC API
    // -------------------------
    OdinsSpear.api = ApiClient;
    OdinsSpear.auth = FirebaseAuth;
    OdinsSpear.claimsService = ClaimsService;
    OdinsSpear.notesService = NotesService;
    OdinsSpear.warService = WarService;
    OdinsSpear.watchersService = WatchersService;
    OdinsSpear.attackLogService = AttackLogService;
    OdinsSpear.unauthorizedService = UnauthorizedAttackService;
    OdinsSpear.retalService = RetalService;
    OdinsSpear.freki = FrekiBridge;
    OdinsSpear.config = CONFIG;

    window.OdinsSpear = OdinsSpear;
    try {
      OdinContext.odinsSpear = OdinsSpear;
    } catch (_) {}
  });
})();
