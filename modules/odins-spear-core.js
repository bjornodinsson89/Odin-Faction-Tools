// odins-spear-core.js
// Headless core engine
////////////////////////

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinsSpearModuleInit(OdinContext) {
    const state = OdinContext.getState();
    const apiModule = OdinContext.api;
    const nexus = OdinContext.nexus;
    const logic = OdinContext.logic || null;

    // ----------------------------
    // BASIC UTILS / ENV HELPERS
    // ----------------------------

    const SPEAR_VERSION = '1.0.0-odin';

    const CONFIG = {
      VERSION: SPEAR_VERSION,

      // Backend HTTP gateways
      API_GET_URL: 'https://torn-war-room-backend-559747349324.us-central1.run.app/spear/api',
      API_POST_URL: 'https://torn-war-room-backend-559747349324.us-central1.run.app/spear/api',

      // Bundle endpoint (claims + notes + warConfig + chain watchers)
      API_BUNDLE_URL: 'https://torn-war-room-backend-559747349324.us-central1.run.app/spear/bundle',

      FIREBASE: {
        projectId: 'torn-war-room',
        apiKey: 'AIzaSyC2uBtW8Rs7B5ZOEHQnnnU0Q2uObTXXsw4',
      },

      STORAGE: {
        SESSION_KEY: 'odins-spear-session',
        SETTINGS_ROOT: 'odinsSpear',
        LOCAL_CLAIMS_KEY: 'odinsSpearClaims',
        LOCAL_NOTES_KEY: 'odinsSpearNotes',
        LOCAL_WAR_KEY: 'odinsSpearWarConfig',
        WATCHERS_KEY: 'odinsSpearWatchers',
        WATCHERS_LOG_KEY: 'odinsSpearWatchersLog',
      },

      LIMITS: {
        MAX_CLAIMS_PER_TARGET: 3,
        MAX_CLAIMS_PER_USER: 15,
        MAX_NOTE_LENGTH: 2000,
        MAX_WATCHERS: 10,
      },

      REFRESH: {
        ACTIVE_MS: 10 * 1000,
        INACTIVE_MS: 60 * 1000,
        IDLE_AFTER_MS: 5 * 60 * 1000,
      },

      CLAIM_KINDS: {
        HIT: 'hit',
        MED: 'med',
      },

      WAR_TYPES: {
        NONE: 'none',
        STANDARD: 'standard',
        TERM: 'term',
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

        // New bridge events for Odin drawer / UI
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

    function safeParseInt(x) {
      const n = parseInt(x, 10);
      return Number.isFinite(n) ? n : 0;
    }

    function getUserId() {
      try {
        return String(state && state.profileId ? state.profileId : '').trim() || null;
      } catch (_) {}
      return null;
    }

    function getFactionId() {
      try {
        return String(state && state.factionId ? state.factionId : '').trim() || null;
      } catch (_) {}
      return null;
    }

    // Lightweight event adapter
    function emit(evt, payload) {
      try {
        if (!nexus || typeof nexus.emit !== 'function') return;
        nexus.emit(evt, payload);
      } catch (_) {}
    }

    // ---------------------------------------------------------------------------
    // STORAGE HELPERS
    // ---------------------------------------------------------------------------

    const SettingsStore = {
      getRoot() {
        state.settings = state.settings || {};
        state.settings[CONFIG.STORAGE.SETTINGS_ROOT] =
          state.settings[CONFIG.STORAGE.SETTINGS_ROOT] || {};
        return state.settings[CONFIG.STORAGE.SETTINGS_ROOT];
      },

      get(key, fallback) {
        try {
          const root = this.getRoot();
          return root.hasOwnProperty(key) ? root[key] : fallback;
        } catch (_) {
          return fallback;
        }
      },

      set(key, value) {
        try {
          const root = this.getRoot();
          root[key] = value;
          if (typeof state.saveToIDB === 'function') {
            state.saveToIDB();
          }
        } catch (e) {
          log('SettingsStore.set error', e);
        }
      },

      remove(key) {
        try {
          const root = this.getRoot();
          if (root.hasOwnProperty(key)) {
            delete root[key];
            if (typeof state.saveToIDB === 'function') {
              state.saveToIDB();
            }
          }
        } catch (e) {
          log('SettingsStore.remove error', e);
        }
      },
    };

    const LocalCache = {
      loadClaims() {
        try {
          return JSON.parse(localStorage.getItem(CONFIG.STORAGE.LOCAL_CLAIMS_KEY) || '[]');
        } catch (_) {
          return [];
        }
      },

      saveClaims(list) {
        try {
          localStorage.setItem(CONFIG.STORAGE.LOCAL_CLAIMS_KEY, JSON.stringify(list || []));
        } catch (_) {}
      },

      loadNotes() {
        try {
          return JSON.parse(localStorage.getItem(CONFIG.STORAGE.LOCAL_NOTES_KEY) || '{}');
        } catch (_) {
          return {};
        }
      },

      saveNotes(map) {
        try {
          localStorage.setItem(
            CONFIG.STORAGE.LOCAL_NOTES_KEY,
            JSON.stringify(map || {})
          );
        } catch (_) {}
      },

      loadWarConfig() {
        try {
          return JSON.parse(localStorage.getItem(CONFIG.STORAGE.LOCAL_WAR_KEY) || '{}');
        } catch (_) {
          return {};
        }
      },

      saveWarConfig(cfg) {
        try {
          localStorage.setItem(
            CONFIG.STORAGE.LOCAL_WAR_KEY,
            JSON.stringify(cfg || {})
          );
        } catch (_) {}
      },

      loadWatchers() {
        try {
          return JSON.parse(localStorage.getItem(CONFIG.STORAGE.WATCHERS_KEY) || '[]');
        } catch (_) {
          return [];
        }
      },

      saveWatchers(list) {
        try {
          localStorage.setItem(
            CONFIG.STORAGE.WATCHERS_KEY,
            JSON.stringify(list || [])
          );
        } catch (_) {}
      },

      loadWatchersLog() {
        try {
          return JSON.parse(
            localStorage.getItem(CONFIG.STORAGE.WATCHERS_LOG_KEY) || '[]'
          );
        } catch (_) {
          return [];
        }
      },

      saveWatchersLog(list) {
        try {
          localStorage.setItem(
            CONFIG.STORAGE.WATCHERS_LOG_KEY,
            JSON.stringify(list || [])
          );
        } catch (_) {}
      },
    };

    // ---------------------------------------------------------------------------
    // HTTP + GM WRAPPERS
    // ---------------------------------------------------------------------------

    function gmRequest(method, url, headers, data) {
      return new Promise((resolve, reject) => {
        try {
          if (typeof GM_xmlhttpRequest !== 'function') {
            reject(new Error('GM_xmlhttpRequest not available'));
            return;
          }

          GM_xmlhttpRequest({
            method,
            url,
            headers,
            data,
            onload: function (response) {
              resolve(response);
            },
            onerror: function (err) {
              reject(err && err.error ? err.error : err);
            },
          });
        } catch (e) {
          reject(e);
        }
      });
    }

    async function httpJson(method, url, body, headers) {
      const jsonHeaders = Object.assign(
        { 'Content-Type': 'application/json' },
        headers || {}
      );

      const text = body != null ? JSON.stringify(body) : null;

      const res = await gmRequest(method, url, jsonHeaders, text);
      if (!res || typeof res.responseText !== 'string') return null;
      try {
        return JSON.parse(res.responseText);
      } catch (e) {
        log('httpJson parse error', e);
      }
      return null;
    }

    async function httpForm(method, url, formBody, headers) {
      const formHeaders = Object.assign(
        { 'Content-Type': 'application/x-www-form-urlencoded' },
        headers || {}
      );
      const res = await gmRequest(method, url, formHeaders, formBody);
      if (!res || typeof res.responseText !== 'string') return null;
      try {
        return JSON.parse(res.responseText);
      } catch (e) {
        log('httpForm parse error', e);
      }
      return null;
    }

    // ---------------------------------------------------------------------------
    // AUTH + SESSION
    // ---------------------------------------------------------------------------

    function loadSession() {
      try {
        return JSON.parse(
          localStorage.getItem(CONFIG.STORAGE.SESSION_KEY) || 'null'
        );
      } catch (_) {
        return null;
      }
    }

    function saveSession(sess) {
      try {
        if (!sess) {
          localStorage.removeItem(CONFIG.STORAGE.SESSION_KEY);
          return;
        }
        localStorage.setItem(
          CONFIG.STORAGE.SESSION_KEY,
          JSON.stringify(sess)
        );
      } catch (_) {}
    }

    async function getTornApiKey() {
      try {
        const key = SettingsStore.get('tornApiKey', null);
        if (key && typeof key === 'string' && key.trim()) {
          return key.trim();
        }
      } catch (_) {}
      return null;
    }

    async function getOrCreateSession() {
      const apiKey = await getTornApiKey();
      if (!apiKey) return null;

      let sess = loadSession();
      const userId = getUserId() || '0';

      if (
        !sess ||
        !sess.refreshToken ||
        sess.userId !== userId ||
        sess.apiKeySnippet !== apiKey.slice(0, 8)
      ) {
        log('Creating new spear session for user', userId);
        const body = {
          action: 'auth.createCustomToken',
          version: CONFIG.VERSION,
          tornUserId: userId,
          tornApiKeySnippet: apiKey.slice(0, 8),
        };

        const json = await httpJson('POST', CONFIG.API_POST_URL, body);
        if (!json || !json.success || !json.customToken) {
          log('Failed to create spear custom token', json);
          return null;
        }

        const formBody =
          'grant_type=refresh_token&refresh_token=' +
          encodeURIComponent(json.refreshToken);

        const tokenRes = await httpForm(
          'POST',
          'https://securetoken.googleapis.com/v1/token?key=' +
            CONFIG.FIREBASE.apiKey,
          formBody
        );

        if (
          !tokenRes ||
          !tokenRes.id_token ||
          !tokenRes.refresh_token ||
          !tokenRes.user_id
        ) {
          log('Failed to exchange refresh token', tokenRes);
          return null;
        }

        sess = {
          userId: tokenRes.user_id,
          idToken: tokenRes.id_token,
          refreshToken: tokenRes.refresh_token,
          apiKeySnippet: apiKey.slice(0, 8),
          lastRefresh: nowMs(),
        };
        saveSession(sess);
      }

      return sess;
    }

    async function getIdToken() {
      const sess = loadSession();
      if (!sess || !sess.refreshToken) return null;

      const ageMs = nowMs() - (sess.lastRefresh || 0);
      const maxAgeMs = 45 * 60 * 1000;
      if (ageMs < maxAgeMs && sess.idToken) {
        return sess.idToken;
      }

      const formBody =
        'grant_type=refresh_token&refresh_token=' +
        encodeURIComponent(sess.refreshToken);

      const tokenRes = await httpForm(
        'POST',
        'https://securetoken.googleapis.com/v1/token?key=' +
          CONFIG.FIREBASE.apiKey,
        formBody
      );

      if (
        !tokenRes ||
        !tokenRes.id_token ||
        !tokenRes.refresh_token ||
        !tokenRes.user_id
      ) {
        log('Failed to refresh id token', tokenRes);
        saveSession(null);
        return null;
      }

      const updated = {
        userId: tokenRes.user_id,
        idToken: tokenRes.id_token,
        refreshToken: tokenRes.refresh_token,
        apiKeySnippet: sess.apiKeySnippet,
        lastRefresh: nowMs(),
      };
      saveSession(updated);

      return updated.idToken;
    }

    async function withIdToken(fn) {
      const token = await getIdToken();
      if (!token) {
        log('No id token available');
        return null;
      }
      return fn(token);
    }

    // ---------------------------------------------------------------------------
    // API CLIENT
    // ---------------------------------------------------------------------------

    const ApiClient = {
      async fetchBundle(minClaimsTs, minWarTs, minNotesTs, minWatchersTs, minWatchersLogTs) {
        const factionId = getFactionId();
        const userId = getUserId();
        if (!factionId || !userId) return null;

        return await withIdToken(async (idToken) => {
          const body = {
            action: 'bundle.fetch',
            version: CONFIG.VERSION,
            tornUserId: userId,
            tornFactionId: factionId,
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

          const json = await httpJson('POST', CONFIG.API_BUNDLE_URL, body, headers);
          if (json && json.success) {
            return json;
          }
          return null;
        });
      },

      async saveClaims(claims) {
        const factionId = getFactionId();
        const userId = getUserId();
        if (!factionId || !userId) return null;

        return await withIdToken(async (idToken) => {
          const body = {
            action: 'claims.save',
            version: CONFIG.VERSION,
            tornUserId: userId,
            tornFactionId: factionId,
            claims,
          };

          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          };

          const json = await httpJson('POST', CONFIG.API_POST_URL, body, headers);
          if (json && json.success) {
            return json;
          }
          return null;
        });
      },

      async saveNotes(notesMap) {
        const factionId = getFactionId();
        const userId = getUserId();
        if (!factionId || !userId) return null;

        return await withIdToken(async (idToken) => {
          const body = {
            action: 'notes.save',
            version: CONFIG.VERSION,
            tornUserId: userId,
            tornFactionId: factionId,
            notes: notesMap,
          };

          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          };

          const json = await httpJson('POST', CONFIG.API_POST_URL, body, headers);
          if (json && json.success) {
            return json;
          }
          return null;
        });
      },

      async saveWarConfig(cfg) {
        const factionId = getFactionId();
        const userId = getUserId();
        if (!factionId || !userId) return null;

        return await withIdToken(async (idToken) => {
          const body = {
            action: 'warConfig.save',
            version: CONFIG.VERSION,
            tornUserId: userId,
            tornFactionId: factionId,
            warConfig: cfg,
          };

          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          };

          const json = await httpJson('POST', CONFIG.API_POST_URL, body, headers);
          if (json && json.success) {
            return json;
          }
          return null;
        });
      },

      async saveWatchers(watchersList, watchersLogList) {
        const factionId = getFactionId();
        const userId = getUserId();
        if (!factionId || !userId) return null;

        return await withIdToken(async (idToken) => {
          const body = {
            action: 'watchers.save',
            version: CONFIG.VERSION,
            tornUserId: userId,
            tornFactionId: factionId,
            watchers: watchersList,
            watchersLog: watchersLogList,
          };

          const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          };

          const json = await httpJson('POST', CONFIG.API_POST_URL, body, headers);
          if (json && json.success) {
            return json;
          }
          return null;
        });
      },
    };

    // ---------------------------------------------------------------------------
    // LOCAL STATE
    // ---------------------------------------------------------------------------

    const OdinsSpear = {
      claims: [],
      notesById: {},
      warConfig: {},
      watchers: [],
      watchersLog: [],
      lastClaimsUpdate: 0,
      lastWarUpdate: 0,
      lastNotesUpdate: 0,
      lastWatchersUpdate: 0,
      lastWatchersLogUpdate: 0,
    };

    // Initialize from local cache
    (function bootstrapFromLocal() {
      try {
        OdinsSpear.claims = LocalCache.loadClaims();
        OdinsSpear.notesById = LocalCache.loadNotes();
        OdinsSpear.warConfig = LocalCache.loadWarConfig();
        OdinsSpear.watchers = LocalCache.loadWatchers();
        OdinsSpear.watchersLog = LocalCache.loadWatchersLog();
      } catch (e) {
        log('bootstrapFromLocal error', e);
      }
    })();

    // -----------------------------------
    // NORMALIZATION / HELPERS
    // -----------------------------------

    function normalizeClaim(raw) {
      if (!raw || typeof raw !== 'object') return null;

      const id = String(raw.id || '').trim();
      const targetId = String(raw.targetId || '').trim();
      if (!id || !targetId) return null;

      return {
        id,
        targetId,
        targetName: raw.targetName || '',
        targetLevel: safeParseInt(raw.targetLevel),
        kind: raw.kind || CONFIG.CLAIM_KINDS.HIT,
        createdAt: safeParseInt(raw.createdAt) || nowMs(),
        updatedAt: safeParseInt(raw.updatedAt) || nowMs(),
        status: raw.status || 'active',
        ownerId: String(raw.ownerId || '').trim(),
        ownerName: raw.ownerName || '',
        warKey: raw.warKey || '',
        meta: raw.meta || {},
      };
    }

    function normalizeNote(raw) {
      if (!raw || typeof raw !== 'object') return null;

      const id = String(raw.id || '').trim();
      if (!id) return null;

      let text = String(raw.text || '');
      if (text.length > CONFIG.LIMITS.MAX_NOTE_LENGTH) {
        text = text.slice(0, CONFIG.LIMITS.MAX_NOTE_LENGTH);
      }

      return {
        id,
        text,
        updatedAt: safeParseInt(raw.updatedAt) || nowMs(),
        byUserId: String(raw.byUserId || '').trim(),
        byUserName: raw.byUserName || '',
        meta: raw.meta || {},
      };
    }

    function normalizeWarConfig(raw) {
      const defaults = {
        warType: CONFIG.WAR_TYPES.NONE,
        medDealsEnabled: false,
        medDealNote: '',
        keepClaimsUntilInactive: false,
        requireReclaimAfterSuccess: false,
        inactivityTimeoutSeconds: 300,
        maxHospitalReleaseMinutes: 0,
      };

      const cfg = Object.assign({}, defaults, raw || {});

      cfg.inactivityTimeoutSeconds = Math.min(
        3600,
        Math.max(60, safeParseInt(cfg.inactivityTimeoutSeconds) || 300)
      );
      cfg.maxHospitalReleaseMinutes = Math.min(
        1440,
        Math.max(0, safeParseInt(cfg.maxHospitalReleaseMinutes) || 0)
      );

      if (!Object.values(CONFIG.WAR_TYPES).includes(cfg.warType)) {
        cfg.warType = CONFIG.WAR_TYPES.NONE;
      }

      return cfg;
    }

    function normalizeWatcher(raw) {
      if (!raw || typeof raw !== 'object') return null;

      const id = String(raw.id || '').trim();
      if (!id) return null;

      return {
        id,
        name: raw.name || '',
        startedAt: safeParseInt(raw.startedAt) || nowMs(),
        endedAt: raw.endedAt != null ? safeParseInt(raw.endedAt) : null,
        meta: raw.meta || {},
      };
    }

    // -----------------------------------
    // WATCHERS: ACTIVE + LOG
    // -----------------------------------

    function setWatchers(list, meta) {
      const normalized = (list || []).map(normalizeWatcher).filter(Boolean);
      OdinsSpear.watchers = normalized.filter((w) => w.endedAt == null);
      LocalCache.saveWatchers(OdinsSpear.watchers);
      OdinsSpear.lastWatchersUpdate = nowMs();
      emit(CONFIG.EVENTS.WATCHERS_UPDATED, {
        watchers: OdinsSpear.watchers,
        meta: meta || {},
      });

      emitOverlayState({ source: 'watchers', meta: meta || {} });
    }

    function setWatchersLog(list, meta) {
      const normalized = (list || []).map(normalizeWatcher).filter(Boolean);
      OdinsSpear.watchersLog = normalized.slice();
      LocalCache.saveWatchersLog(OdinsSpear.watchersLog);
      OdinsSpear.lastWatchersLogUpdate = nowMs();
      emit(CONFIG.EVENTS.WATCHERS_LOG_UPDATED, {
        watchersLog: OdinsSpear.watchersLog,
        meta: meta || {},
      });

      emitOverlayState({ source: 'watchersLog', meta: meta || {} });
    }

    // ----------------------------------------
    // OVERLAY STATE BRIDGE (for Odin drawer)
    // ----------------------------------------

    function buildOverlayState(meta) {
      const summary = {
        activeCount: Array.isArray(OdinsSpear.watchers)
          ? OdinsSpear.watchers.length
          : 0,
        logCount: Array.isArray(OdinsSpear.watchersLog)
          ? OdinsSpear.watchersLog.length
          : 0,
        lastWatchersUpdate: OdinsSpear.lastWatchersUpdate || 0,
        lastWatchersLogUpdate: OdinsSpear.lastWatchersLogUpdate || 0,
      };

      return {
        summary,
        watchers: Array.isArray(OdinsSpear.watchers)
          ? OdinsSpear.watchers.slice()
          : [],
        watchersLog: Array.isArray(OdinsSpear.watchersLog)
          ? OdinsSpear.watchersLog.slice()
          : [],
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

    // -----------------------------------
    // CLAIMS SERVICE
    // ------------------------------------

    const ClaimsService = {
      getAll() {
        return OdinsSpear.claims.slice();
      },

      getForTarget(targetId) {
        const id = String(targetId || '').trim();
        if (!id) return [];
        return OdinsSpear.claims.filter((c) => c.targetId === id);
      },

      getMyClaims() {
        const me = String(getUserId() || '');
        if (!me) return [];
        return OdinsSpear.claims.filter((c) => c.ownerId === me);
      },

      getMyActiveClaims() {
        const me = String(getUserId() || '');
        if (!me) return [];
        return OdinsSpear.claims.filter(
          (c) => c.ownerId === me && c.status === 'active'
        );
      },

      setFromServer(list) {
        const normalized =
          (list || []).map(normalizeClaim).filter(Boolean) || [];
        OdinsSpear.claims = normalized;
        LocalCache.saveClaims(OdinsSpear.claims);
        OdinsSpear.lastClaimsUpdate = nowMs();
        emit(CONFIG.EVENTS.CLAIMS_UPDATED, {
          claims: OdinsSpear.claims.slice(),
        });
      },

      async saveToServer() {
        const payload = OdinsSpear.claims.slice();
        const res = await ApiClient.saveClaims(payload);
        if (res && res.success && Array.isArray(res.claims)) {
          this.setFromServer(res.claims);
        }
      },
    };

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

    function setWatchers(list, meta) {
      const normalized = (list || []).map(normalizeWatcher).filter(Boolean);
      OdinsSpear.watchers = normalized.filter((w) => w.endedAt == null);
      LocalCache.saveWatchers(OdinsSpear.watchers);
      OdinsSpear.lastWatchersUpdate = nowMs();
      emit(CONFIG.EVENTS.WATCHERS_UPDATED, {
        watchers: OdinsSpear.watchers,
        meta: meta || {},
      });
    }

    function setWatchersLog(list, meta) {
      const normalized = (list || []).map(normalizeWatcher).filter(Boolean);
      OdinsSpear.watchersLog = normalized.slice();
      LocalCache.saveWatchersLog(OdinsSpear.watchersLog);
      OdinsSpear.lastWatchersLogUpdate = nowMs();
      emit(CONFIG.EVENTS.WATCHERS_LOG_UPDATED, {
        watchersLog: OdinsSpear.watchersLog,
        meta: meta || {},
      });
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
          (w) => w.id === me && (w.endedAt == null)
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
          // Drop any stale active entries formuser
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
          // Stop users active session and push it into the log
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

        setWatchers(nextActive, { source: 'local-chain-watch', meta, isOn });
        setWatchersLog(nextLog, { source: 'local-chain-watch', meta, isOn });

        try {
          const result = await ApiClient.setChainWatchStatus(isOn, meta);
          if (result) {
            if (Array.isArray(result.watchers)) {
              setWatchers(result.watchers, { source: 'server-ack', isOn });
            }
            if (Array.isArray(result.watchersLog)) {
              setWatchersLog(result.watchersLog, { source: 'server-ack', isOn });
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

    // ----------------------------
    // FREKI BRIDGE
    // ---------------------------

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
          setWatchersLog(result.watchersLog, { source: 'bundle', reason });
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

        emit(CONFIG.EVENTS.CLAIMS_INIT, { claims: OdinsSpear.claims });
        emit(CONFIG.EVENTS.NOTES_INIT, { notesById: OdinsSpear.notesById });
        emit(CONFIG.EVENTS.WAR_INIT, { warConfig: OdinsSpear.warConfig });
        emit(CONFIG.EVENTS.WATCHERS_INIT, { watchers: OdinsSpear.watchers });
        emit(CONFIG.EVENTS.WATCHERS_LOG_INIT, { watchersLog: OdinsSpear.watchersLog });

        syncBundleOnce('boot');
        attachActivityTracking();

        OdinsSpear.ready = true;
        emit(CONFIG.EVENTS.READY, { version: OdinsSpear.version });
        log('Odin’s Spear core initialised', { version: OdinsSpear.version });
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
    OdinsSpear.retalService = RetalService;
    OdinsSpear.freki = FrekiBridge;
    OdinsSpear.config = CONFIG;

    window.OdinsSpear = OdinsSpear;
    try {
      OdinContext.odinsSpear = OdinsSpear;
    } catch (_) {}
  });
})();
