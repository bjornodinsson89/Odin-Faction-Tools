// odins-spear-core.js
// Headless faction war & chain coordination engine
// Version: 3.1.0
// Author: BjornOdinsson89

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinsSpearModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || {
      getJSON: () => null,
      setJSON: () => {},
      remove: () => {},
    };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const api = ctx.api || { tornGet: async () => ({ ok: false }), backendPost: async () => ({ ok: false }) };
    const firebase = ctx.firebase || { getFirestore: () => null, getRTDB: () => null };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const SPEAR_VERSION = '3.1.0';

    // ============================================
    // EVENT CONSTANTS
    // ============================================
    const EVENTS = {
      SPEAR_READY: 'SPEAR_READY',
      CHAIN_TICK: 'CHAIN_TICK',
      CHAIN_RISK_UPDATE: 'CHAIN_RISK_UPDATE',
      CHAIN_WARNING: 'CHAIN_WARNING',
      CLAIM_MADE: 'CLAIM_MADE',
      CLAIM_RELEASED: 'CLAIM_RELEASED',
      CLAIM_EXPIRED: 'CLAIM_EXPIRED',
      CLAIM_CONFLICT: 'CLAIM_CONFLICT',
      DIB_MADE: 'DIB_MADE',
      DIB_RELEASED: 'DIB_RELEASED',
      DIB_EXPIRED: 'DIB_EXPIRED',
      MED_DEAL_MADE: 'MED_DEAL_MADE',
      MED_DEAL_RELEASED: 'MED_DEAL_RELEASED',
      MED_DEAL_EXPIRED: 'MED_DEAL_EXPIRED',
      PRESENCE_UPDATE: 'PRESENCE_UPDATE',
      SPY_UPDATE: 'SPY_UPDATE',
      ATTACK_MODE_CHANGED: 'ATTACK_MODE_CHANGED',
      ATTACK_LOGGED: 'ATTACK_LOGGED',
      UNAUTHORIZED_ATTACK: 'UNAUTHORIZED_ATTACK',
      RETAL_CANDIDATE: 'RETAL_CANDIDATE',
      WATCHER_ALERT: 'WATCHER_ALERT',
      WATCHER_SHIFT_START: 'WATCHER_SHIFT_START',
      WATCHER_SHIFT_END: 'WATCHER_SHIFT_END',
      WAR_STARTED: 'WAR_STARTED',
      WAR_ENDED: 'WAR_ENDED',
      FACTION_UPDATED: 'FACTION_UPDATED',
    };

    // ============================================
    // STORAGE HELPER
    // ============================================
    const store = {
      get(key) {
        try {
          return storage.getJSON(`spear_${key}`);
        } catch (e) {
          error('[Store] Get error:', e);
          return null;
        }
      },
      set(key, value) {
        try {
          storage.setJSON(`spear_${key}`, value);
        } catch (e) {
          error('[Store] Set error:', e);
        }
      },
      remove(key) {
        try {
          storage.remove(`spear_${key}`);
        } catch (e) {
          error('[Store] Remove error:', e);
        }
      },
    };

    // ============================================
    // DIAGNOSTICS SERVICE
    // ============================================
    const DiagnosticsService = {
      errors: [],
      maxErrors: 100,
      logError(err, context = {}) {
        const entry = {
          message: err?.message || String(err),
          stack: err?.stack,
          context,
          timestamp: Date.now(),
        };
        this.errors.unshift(entry);
        if (this.errors.length > this.maxErrors) {
          this.errors.pop();
        }
        error('[Diagnostics]', entry);
      },
      getErrors() {
        return [...this.errors];
      },
      clearErrors() {
        this.errors = [];
      },
    };

    // ============================================
    // WAR CONFIG SERVICE
    // ============================================
    const WarConfigService = {
      _config: null,
      init() {
        this._config = store.get('warConfig') || this._getDefaults();
      },
      _getDefaults() {
        return {
          enemyFactionId: null,
          enemyFactionName: null,
          warType: 'chain', // 'chain', 'ranked', 'territory'
          warStarted: null,
          warEnded: null,
          isActive: false,
          attackMode: 'FARMING', // 'FARMING', 'FFA', 'TURTLE'
          claimTimeoutMinutes: 5,
          dibs: {
            enabled: true,
            ttlHours: 24,
            oneAtATime: true,
            clearIfTargetTravels: true,
            clearIfClaimerTravels: true,
            blockIfClaimerTraveling: true,
          },
          medDeals: {
            enabled: true,
            ttlHours: 24,
            oneAtATime: true,
          },
          spies: {
            enabled: false,
            cacheHours: 6,
            colorMode: false,
            ffThreshold: 2,
            whoreThreshold: 0.35,
          },
          presence: {
            enableLiveHooks: true,
          },
          chainWarningThreshold: 30,
          chainCriticalThreshold: 15,
          autoRefreshInterval: 10000,
          notifications: {
            chainWarning: true,
            claimConflicts: true,
            retalCandidates: true,
            watcherAlerts: true,
          },
        };
      },
      getConfig() {
        return { ...this._config };
      },
      updateConfig(updates) {
        const prev = this._config || {};
        const next = { ...prev, ...(updates || {}) };
        this._config = next;
        store.set('warConfig', this._config);

        if (updates && Object.prototype.hasOwnProperty.call(updates, 'attackMode') && updates.attackMode !== prev.attackMode) {
          nexus.emit(EVENTS.ATTACK_MODE_CHANGED, { from: prev.attackMode, to: updates.attackMode });
          if (updates.attackMode && updates.attackMode !== 'FARMING') {
            try { ClaimsService.clearAllClaims(); } catch (_) {}
            try { DibsService.clearAll(); } catch (_) {}
            try { MedDealsService.clearAll(); } catch (_) {}
          }
        }

        if (updates && Object.prototype.hasOwnProperty.call(updates, 'claimTimeoutMinutes')) {
          try { ClaimsService._claimTimeoutMs = Number(next.claimTimeoutMinutes || 5) * 60 * 1000; } catch (_) {}
        }

        return this._config;
      },
      setEnemy(factionId, factionName) {
        return this.updateConfig({
          enemyFactionId: factionId,
          enemyFactionName: factionName,
        });
      },
      startWar() {
        const config = this.updateConfig({
          isActive: true,
          warStarted: Date.now(),
          warEnded: null,
        });
        nexus.emit(EVENTS.WAR_STARTED, config);
        return config;
      },
      endWar() {
        const config = this.updateConfig({
          isActive: false,
          warEnded: Date.now(),
        });
        nexus.emit(EVENTS.WAR_ENDED, config);
        return config;
      },
      isWarActive() {
        return this._config?.isActive === true;
      },
    };

    // ============================================
    // CLAIMS SERVICE
    // ============================================
    const ClaimsService = {
      _claims: new Map(),
      _claimTimeoutMs: 5 * 60 * 1000,
      init() {
        const saved = store.get('claims') || [];
        saved.forEach((c) => this._claims.set(c.targetId, c));
        this._claimTimeoutMs = (WarConfigService.getConfig().claimTimeoutMinutes || 5) * 60 * 1000;
      },
      _save() {
        store.set('claims', Array.from(this._claims.values()));
      },
      makeClaim(targetId, attackerId, attackerName) {
        const existing = this._claims.get(targetId);
        if (existing && existing.status === 'active' && existing.attackerId !== attackerId) {
          nexus.emit(EVENTS.CLAIM_CONFLICT, { targetId, existing, attempted: { attackerId, attackerName } });
          return { success: false, reason: 'already_claimed', claimedBy: existing.attackerName };
        }
        const claim = {
          targetId,
          attackerId,
          attackerName,
          claimedAt: Date.now(),
          expiresAt: Date.now() + this._claimTimeoutMs,
          status: 'active',
        };
        this._claims.set(targetId, claim);
        this._save();
        nexus.emit(EVENTS.CLAIM_MADE, claim);
        return { success: true, claim };
      },
      releaseClaim(targetId, attackerId) {
        const claim = this._claims.get(targetId);
        if (!claim) return { success: false, reason: 'not_found' };
        if (claim.attackerId !== attackerId) return { success: false, reason: 'not_owner' };
        claim.status = 'released';
        claim.releasedAt = Date.now();
        this._save();
        nexus.emit(EVENTS.CLAIM_RELEASED, claim);
        return { success: true };
      },
      getClaim(targetId) {
        return this._claims.get(targetId) || null;
      },
      getActiveClaims() {
        return Array.from(this._claims.values()).filter((c) => c.status === 'active');
      },
      getClaimsByAttacker(attackerId) {
        return Array.from(this._claims.values()).filter((c) => c.attackerId === attackerId && c.status === 'active');
      },
      expireStaleClaims() {
        const now = Date.now();
        let expired = 0;
        this._claims.forEach((claim, targetId) => {
          if (claim.status === 'active' && now > claim.expiresAt) {
            claim.status = 'expired';
            claim.expiredAt = now;
            nexus.emit(EVENTS.CLAIM_EXPIRED, claim);
            expired++;
          }
        });
        if (expired > 0) {
          this._save();
        }
        return expired;
      },
      clearAllClaims() {
        this._claims.clear();
        this._save();
      },
    };

    // ============================================
    
    // ============================================
    // DIBS SERVICE
    // ============================================
    const DibsService = {
      _dibs: new Map(),

      init() {
        const saved = store.get('dibs') || [];
        saved.forEach((d) => this._dibs.set(String(d.targetId), d));
      },

      _save() {
        store.set('dibs', Array.from(this._dibs.values()));
      },

      _isEnabled() {
        const cfg = WarConfigService.getConfig() || {};
        if (cfg.attackMode && cfg.attackMode !== 'FARMING') return false;
        return cfg.dibs?.enabled !== false;
      },

      _ttlMs() {
        const cfg = WarConfigService.getConfig() || {};
        const hours = Number(cfg.dibs?.ttlHours || 24);
        return Math.max(1, hours) * 60 * 60 * 1000;
      },

      _clearExistingForAttacker(attackerId) {
        const aid = String(attackerId);
        let changed = false;
        Array.from(this._dibs.values()).forEach((d) => {
          if (d.status === 'active' && d.attackerId === aid) {
            d.status = 'released';
            d.releasedAt = Date.now();
            changed = true;
            nexus.emit(EVENTS.DIB_RELEASED, d);
          }
        });
        if (changed) this._save();
      },

      makeDib(targetId, attackerId, attackerName) {
        const cfg = WarConfigService.getConfig() || {};
        if (!this._isEnabled()) return { success: false, reason: 'disabled' };

        if (cfg.dibs?.blockIfClaimerTraveling) {
          const p = WarPresenceService.get(attackerId);
          const st = p?.state || '';
          if (st === 'Traveling' || st === 'Abroad') {
            return { success: false, reason: 'claimer_traveling' };
          }
        }

        const tid = String(targetId);
        const aid = String(attackerId);
        const existing = this._dibs.get(tid);

        if (existing && existing.status === 'active' && existing.attackerId !== aid) {
          return { success: false, reason: 'already_claimed', claimedBy: existing.attackerName, dib: existing };
        }

        if (cfg.dibs?.oneAtATime !== false) {
          this._clearExistingForAttacker(aid);
        }

        const dib = {
          targetId: tid,
          attackerId: aid,
          attackerName: attackerName || 'Unknown',
          status: 'active',
          createdAt: Date.now(),
          expiresAt: Date.now() + this._ttlMs(),
        };

        this._dibs.set(tid, dib);
        this._save();
        nexus.emit(EVENTS.DIB_MADE, dib);
        return { success: true, dib };
      },

      releaseDib(targetId, attackerId) {
        const tid = String(targetId);
        const dib = this._dibs.get(tid);
        if (!dib) return { success: false, reason: 'not_found' };
        if (String(dib.attackerId) !== String(attackerId)) return { success: false, reason: 'not_owner' };

        dib.status = 'released';
        dib.releasedAt = Date.now();
        this._save();
        nexus.emit(EVENTS.DIB_RELEASED, dib);
        return { success: true };
      },

      getDib(targetId) {
        return this._dibs.get(String(targetId)) || null;
      },

      getActiveDibs() {
        return Array.from(this._dibs.values()).filter((d) => d.status === 'active');
      },

      getDibsByAttacker(attackerId) {
        return Array.from(this._dibs.values()).filter((d) => d.status === 'active' && String(d.attackerId) === String(attackerId));
      },

      cleanupExpired() {
        const now = Date.now();
        let expired = 0;
        const cfg = WarConfigService.getConfig() || {};
        const clearTargetTravel = cfg.dibs?.clearIfTargetTravels !== false;
        const clearClaimerTravel = cfg.dibs?.clearIfClaimerTravels !== false;
        this._dibs.forEach((d, tid) => {
          if (d.status === 'active' && d.expiresAt && d.expiresAt <= now) {
            // expire by time
            d.status = 'expired';
            d.expiredAt = now;
            this._dibs.set(tid, d);
            expired++;
            nexus.emit(EVENTS.DIB_EXPIRED, d);
          }

          if (d.status === 'active') {
            if (clearTargetTravel) {
              const tp = WarPresenceService.get(d.targetId);
              const ts = tp?.state || '';
              if (ts === 'Traveling' || ts === 'Abroad') {
                d.status = 'released';
                d.releasedAt = now;
                this._dibs.set(tid, d);
                nexus.emit(EVENTS.DIB_RELEASED, d);
              }
            }
            if (clearClaimerTravel) {
              const cp = WarPresenceService.get(d.attackerId);
              const cs = cp?.state || '';
              if (cs === 'Traveling' || cs === 'Abroad') {
                d.status = 'released';
                d.releasedAt = now;
                this._dibs.set(tid, d);
                nexus.emit(EVENTS.DIB_RELEASED, d);
              }
            }
          }
        });
        if (expired > 0) this._save();
        return expired;
      },

      clearAll() {
        this._dibs.clear();
        this._save();
      },
    };

    // ============================================
    // MED DEALS SERVICE
    // ============================================
    const MedDealsService = {
      _deals: new Map(),

      init() {
        const saved = store.get('medDeals') || [];
        saved.forEach((d) => this._deals.set(String(d.targetId), d));
      },

      _save() {
        store.set('medDeals', Array.from(this._deals.values()));
      },

      _isEnabled() {
        const cfg = WarConfigService.getConfig() || {};
        if (cfg.attackMode && cfg.attackMode !== 'FARMING') return false;
        return cfg.medDeals?.enabled !== false;
      },

      _ttlMs() {
        const cfg = WarConfigService.getConfig() || {};
        const hours = Number(cfg.medDeals?.ttlHours || 24);
        return Math.max(1, hours) * 60 * 60 * 1000;
      },

      _clearExistingForAttacker(attackerId) {
        const aid = String(attackerId);
        let changed = false;
        Array.from(this._deals.values()).forEach((d) => {
          if (d.status === 'active' && d.attackerId === aid) {
            d.status = 'released';
            d.releasedAt = Date.now();
            changed = true;
            nexus.emit(EVENTS.MED_DEAL_RELEASED, d);
          }
        });
        if (changed) this._save();
      },

      makeDeal(targetId, attackerId, attackerName, note = '') {
        const cfg = WarConfigService.getConfig() || {};
        if (!this._isEnabled()) return { success: false, reason: 'disabled' };

        const tid = String(targetId);
        const aid = String(attackerId);
        const existing = this._deals.get(tid);

        if (existing && existing.status === 'active' && existing.attackerId !== aid) {
          return { success: false, reason: 'already_claimed', claimedBy: existing.attackerName, deal: existing };
        }

        if (cfg.medDeals?.oneAtATime !== false) {
          this._clearExistingForAttacker(aid);
        }

        const deal = {
          targetId: tid,
          attackerId: aid,
          attackerName: attackerName || 'Unknown',
          note: note || '',
          status: 'active',
          createdAt: Date.now(),
          expiresAt: Date.now() + this._ttlMs(),
        };

        this._deals.set(tid, deal);
        this._save();
        nexus.emit(EVENTS.MED_DEAL_MADE, deal);
        return { success: true, deal };
      },

      releaseDeal(targetId, attackerId) {
        const tid = String(targetId);
        const deal = this._deals.get(tid);
        if (!deal) return { success: false, reason: 'not_found' };
        if (String(deal.attackerId) !== String(attackerId)) return { success: false, reason: 'not_owner' };

        deal.status = 'released';
        deal.releasedAt = Date.now();
        this._save();
        nexus.emit(EVENTS.MED_DEAL_RELEASED, deal);
        return { success: true };
      },

      getDeal(targetId) {
        return this._deals.get(String(targetId)) || null;
      },

      getActiveDeals() {
        return Array.from(this._deals.values()).filter((d) => d.status === 'active');
      },

      cleanupExpired() {
        const now = Date.now();
        let expired = 0;
        this._deals.forEach((d, tid) => {
          if (d.status === 'active' && d.expiresAt && d.expiresAt <= now) {
            d.status = 'expired';
            d.expiredAt = now;
            this._deals.set(tid, d);
            expired++;
            nexus.emit(EVENTS.MED_DEAL_EXPIRED, d);
          }
        });
        if (expired > 0) this._save();
        return expired;
      },

      clearAll() {
        this._deals.clear();
        this._save();
      },
    };

    // ============================================
    // WAR PRESENCE SERVICE (HOSPITAL/TRAVEL)
    // ============================================
    const WarPresenceService = {
      _presence: new Map(),
      _countries: {
        'United Kingdom': 'UK',
        'South Africa': 'SA',
        Switzerland: 'SW',
        Japan: 'JP',
        'Cayman Islands': 'CI',
        Mexico: 'MX',
        Canada: 'CN',
        Argentina: 'AR',
        China: 'CH',
      },

      init() {
        const saved = store.get('presence') || [];
        saved.forEach((p) => this._presence.set(String(p.userId), p));
      },

      _save() {
        store.set('presence', Array.from(this._presence.values()));
      },

      get(userId) {
        return this._presence.get(String(userId)) || null;
      },

      getAll() {
        return Array.from(this._presence.values());
      },

      _splitTravel(desc, pattern) {
        const part = String(desc || '').split(pattern)[1] || '';
        return this._countries[part] || part;
      },

      _travelLabel(state, desc) {
        if (state === 'Traveling') {
          if (String(desc || '').includes('Returning')) return `<- ${this._splitTravel(desc, 'from ')}`;
          return `-> ${this._splitTravel(desc, 'to ')}`;
        }
        if (state === 'Abroad') {
          return this._splitTravel(desc, 'In ');
        }
        return '';
      },

      updateStatus(userId, statusObj) {
        const id = String(userId);
        const prev = this._presence.get(id) || { userId: id };
        const state = statusObj?.state || statusObj?.text || '';
        const until = statusObj?.until || statusObj?.updateAt || null;
        const desc = statusObj?.description || '';
        const travel = (state === 'Traveling' || state === 'Abroad') ? this._travelLabel(state, desc) : '';

        const next = {
          ...prev,
          userId: id,
          state,
          until: typeof until === 'number' ? until : prev.until,
          description: desc,
          travel,
          updatedAt: Date.now(),
        };

        this._presence.set(id, next);
        this._save();
        nexus.emit(EVENTS.PRESENCE_UPDATE, next);
      },

      updateFromWarJson(json) {
        if (!json) return;
        const members = (json.warDesc && json.warDesc.members) ? json.warDesc.members : (json.userStatuses || null);
        if (!members) return;

        Object.keys(members).forEach((k) => {
          const entry = members[k];
          const status = entry.status || entry;
          const id = entry.userID || k;
          if (!status) return;

          // Hospital timer in war data uses {text:'Hospital', updateAt:<unix>}
          const text = status.text || status.state || '';
          if (text === 'Hospital' && status.updateAt) {
            this.updateStatus(id, { text: 'Hospital', until: status.updateAt, description: status.description || '' });
          } else if (status.state) {
            this.updateStatus(id, status);
          } else {
            this.updateStatus(id, { text, until: status.updateAt, description: status.description || '' });
          }
        });
      },

      updateFromWebSocketMessage(dataStr) {
        let json = null;
        try { json = JSON.parse(dataStr); } catch (_) { return; }

        const statusUpdate =
          json?.push?.pub?.data?.message?.namespaces?.users?.actions?.updateStatus ||
          null;

        if (!statusUpdate || !statusUpdate.status) return;
        const id = statusUpdate.userId;
        const status = statusUpdate.status;
        this.updateStatus(id, { text: status.text, until: status.updateAt, description: status.description || '' });
      },
    };

    // ============================================
    // WAR LIVE HOOK SERVICE (FETCH / WEBSOCKET)
    // ============================================
    const WarLiveHookService = {
      _fetchWrapped: false,
      _wsWrapped: false,
      _oldFetch: null,
      _oldWebSocket: null,

      init() {
        const cfg = WarConfigService.getConfig() || {};
        if (cfg.presence?.enableLiveHooks === false) return;

        this.wrapFetch();
        this.wrapWebSocket();
      },

      wrapFetch() {
        if (this._fetchWrapped) return;
        if (typeof window.fetch !== 'function') return;

        this._fetchWrapped = true;
        this._oldFetch = window.fetch;

        window.fetch = async (...args) => {
          const req = args[0];
          const url = (req && req.url) ? req.url : String(req || '');

          const shouldInspect = url.includes('step=getwarusers') || url.includes('step=getProcessBarRefreshData');
          const response = await this._oldFetch(...args);

          if (!shouldInspect) return response;

          try {
            const clone = response.clone();
            clone.json().then((json) => {
              WarPresenceService.updateFromWarJson(json);
            }).catch(() => {});
          } catch (_) {}

          return response;
        };
      },

      wrapWebSocket() {
        if (this._wsWrapped) return;
        if (typeof window.WebSocket !== 'function') return;

        this._wsWrapped = true;
        this._oldWebSocket = window.WebSocket;

        const self = this;
        window.WebSocket = function (...args) {
          const socket = new self._oldWebSocket(...args);
          try {
            socket.addEventListener('message', (event) => {
              if (!event || typeof event.data !== 'string') return;
              WarPresenceService.updateFromWebSocketMessage(event.data);
            });
          } catch (_) {}
          return socket;
        };
      },

      destroy() {
        if (this._fetchWrapped && this._oldFetch) {
          window.fetch = this._oldFetch;
        }
        if (this._wsWrapped && this._oldWebSocket) {
          window.WebSocket = this._oldWebSocket;
        }
        this._fetchWrapped = false;
        this._wsWrapped = false;
        this._oldFetch = null;
        this._oldWebSocket = null;
      },
    };

    // ============================================
    // SPY SERVICE (TORNSTATS)
    // ============================================
    const SpyService = {
      _spies: new Map(),
      _myScore: 0,

      init() {
        const saved = store.get('spies') || [];
        saved.forEach((s) => this._spies.set(String(s.userId), s));
        this._myScore = Number(store.get('myBSScore') || 0) || 0;
      },

      _save() {
        store.set('spies', Array.from(this._spies.values()));
        store.set('myBSScore', this._myScore);
      },

      _isEnabled() {
        const cfg = WarConfigService.getConfig() || {};
        return cfg.spies?.enabled === true;
      },

      _cacheMs() {
        const cfg = WarConfigService.getConfig() || {};
        const hours = Number(cfg.spies?.cacheHours || 6);
        return Math.max(1, hours) * 60 * 60 * 1000;
      },

      getSpy(userId) {
        const s = this._spies.get(String(userId));
        if (!s) return null;
        const ageMs = Date.now() - (s.fetchedAt || 0);
        if (ageMs > this._cacheMs()) return null;
        return s;
      },

      async fetchSpy(userId) {
        if (!this._isEnabled()) return null;
        const id = String(userId);
        const existing = this.getSpy(id);
        if (existing) return existing;

        if (!api || !api.tornStatsSpyGet) return null;

        try {
          const data = await api.tornStatsSpyGet(id);

          // TornStats responses vary; we normalize a best-effort spy object
          const spy = (data && data.spy) ? data.spy : (data && data.data && data.data.spy) ? data.data.spy : data;
          const total = Number(spy?.total || spy?.battle_stats?.total || 0) || 0;
          const strength = Number(spy?.strength || spy?.battle_stats?.strength || 0) || 0;
          const defense = Number(spy?.defense || spy?.battle_stats?.defense || 0) || 0;
          const speed = Number(spy?.speed || spy?.battle_stats?.speed || 0) || 0;
          const dexterity = Number(spy?.dexterity || spy?.battle_stats?.dexterity || 0) || 0;
          const timestamp = Number(spy?.timestamp || spy?.updated_at || spy?.last_updated || 0) || 0;

          const enemyScore = Math.sqrt(strength) + Math.sqrt(defense) + Math.sqrt(speed) + Math.sqrt(dexterity);
          const ff = (this._myScore > 0 && enemyScore > 0) ? Math.min(3, Math.round((1 + (8 / 3) * (enemyScore / this._myScore)) * 100) / 100) : 0;

          const normalized = {
            userId: id,
            total,
            strength,
            defense,
            speed,
            dexterity,
            timestamp,
            enemyScore,
            ff,
            fetchedAt: Date.now(),
          };

          this._spies.set(id, normalized);
          this._save();
          nexus.emit(EVENTS.SPY_UPDATE, normalized);
          return normalized;
        } catch (_) {
          return null;
        }
      },

      setMyScoreFromSpy(spyObj) {
        if (!spyObj) return;
        const score = Math.sqrt(Number(spyObj.strength || 0)) +
          Math.sqrt(Number(spyObj.defense || 0)) +
          Math.sqrt(Number(spyObj.speed || 0)) +
          Math.sqrt(Number(spyObj.dexterity || 0));
        if (score > 0) {
          this._myScore = score;
          this._save();
        }
      },
    };
// WATCHERS SERVICE
    // ============================================
    const WatchersService = {
      _schedule: [],
      _currentShift: null,
      _checkInterval: null,
      init() {
        this._schedule = store.get('watcherSchedule') || [];
        this._startChecking();
      },
      destroy() {
        if (this._checkInterval) {
          clearInterval(this._checkInterval);
          this._checkInterval = null;
        }
      },
      _startChecking() {
        this._checkInterval = setInterval(() => this._checkShifts(), 30000);
        this._checkShifts();
      },
      _checkShifts() {
        const now = Date.now();
        const activeShift = this._schedule.find((s) => {
          const start = new Date(s.startTime).getTime();
          const end = new Date(s.endTime).getTime();
          return now >= start && now <= end;
        });
        if (activeShift && (!this._currentShift || this._currentShift.id !== activeShift.id)) {
          this._currentShift = activeShift;
          nexus.emit(EVENTS.WATCHER_SHIFT_START, activeShift);
        } else if (!activeShift && this._currentShift) {
          nexus.emit(EVENTS.WATCHER_SHIFT_END, this._currentShift);
          this._currentShift = null;
        }
      },
      getSchedule() {
        return [...this._schedule];
      },
      getCurrentShift() {
        return this._currentShift ? { ...this._currentShift } : null;
      },
      addShift(shift) {
        const newShift = {
          id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          watcherId: shift.watcherId,
          watcherName: shift.watcherName,
          startTime: shift.startTime,
          endTime: shift.endTime,
          createdAt: Date.now(),
        };
        this._schedule.push(newShift);
        this._schedule.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        store.set('watcherSchedule', this._schedule);
        return newShift;
      },
      removeShift(shiftId) {
        const idx = this._schedule.findIndex((s) => s.id === shiftId);
        if (idx >= 0) {
          this._schedule.splice(idx, 1);
          store.set('watcherSchedule', this._schedule);
          return true;
        }
        return false;
      },
      clearSchedule() {
        this._schedule = [];
        store.set('watcherSchedule', this._schedule);
      },
      getUpcomingShifts(limitHours = 24) {
        const now = Date.now();
        const limit = now + limitHours * 60 * 60 * 1000;
        return this._schedule.filter((s) => {
          const start = new Date(s.startTime).getTime();
          return start >= now && start <= limit;
        });
      },
    };

    // ============================================
    // ATTACK LOG SERVICE
    // ============================================
    const AttackLogService = {
      _attacks: [],
      _maxAttacks: 500,
      init() {
        this._attacks = store.get('attackLog') || [];
      },
      logAttack(attack) {
        const entry = {
          id: `atk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          attackerId: attack.attackerId,
          attackerName: attack.attackerName,
          targetId: attack.targetId,
          targetName: attack.targetName,
          result: attack.result,
          respect: attack.respect || 0,
          fairFight: attack.fairFight || 1,
          chain: attack.chain || 0,
          timestamp: Date.now(),
        };
        this._attacks.unshift(entry);
        if (this._attacks.length > this._maxAttacks) {
          this._attacks = this._attacks.slice(0, this._maxAttacks);
        }
        store.set('attackLog', this._attacks);
        nexus.emit(EVENTS.ATTACK_LOGGED, entry);
        return entry;
      },
      getAttacks(limit = 50) {
        return this._attacks.slice(0, limit);
      },
      getAttacksByPlayer(playerId, limit = 20) {
        return this._attacks.filter((a) => a.attackerId === playerId).slice(0, limit);
      },
      getStats() {
        const stats = {
          total: this._attacks.length,
          wins: 0,
          losses: 0,
          escapes: 0,
          stalemates: 0,
          totalRespect: 0,
          avgFairFight: 0,
        };
        this._attacks.forEach((a) => {
          if (a.result === 'win' || a.result === 'hospitalized' || a.result === 'mugged') {
            stats.wins++;
            stats.totalRespect += a.respect || 0;
          } else if (a.result === 'loss') {
            stats.losses++;
          } else if (a.result === 'escape') {
            stats.escapes++;
          } else if (a.result === 'stalemate') {
            stats.stalemates++;
          }
        });
        if (stats.wins > 0) {
          const ffSum = this._attacks
            .filter((a) => a.result === 'win')
            .reduce((sum, a) => sum + (a.fairFight || 1), 0);
          stats.avgFairFight = (ffSum / stats.wins).toFixed(2);
        }
        return stats;
      },
      clearLog() {
        this._attacks = [];
        store.set('attackLog', this._attacks);
      },
    };

    // ============================================
    // UNAUTHORIZED ATTACK SERVICE
    // ============================================
    const UnauthorizedAttackService = {
      _unauthorized: [],
      init() {
        this._unauthorized = store.get('unauthorizedAttacks') || [];
      },
      reportUnauthorized(attack) {
        const entry = {
          id: `unauth_${Date.now()}`,
          attackerId: attack.attackerId,
          attackerName: attack.attackerName,
          targetId: attack.targetId,
          targetName: attack.targetName,
          reason: attack.reason || 'no_claim',
          timestamp: Date.now(),
        };
        this._unauthorized.unshift(entry);
        if (this._unauthorized.length > 100) {
          this._unauthorized.pop();
        }
        store.set('unauthorizedAttacks', this._unauthorized);
        nexus.emit(EVENTS.UNAUTHORIZED_ATTACK, entry);
        return entry;
      },
      getUnauthorized(limit = 20) {
        return this._unauthorized.slice(0, limit);
      },
      clearUnauthorized() {
        this._unauthorized = [];
        store.set('unauthorizedAttacks', this._unauthorized);
      },
    };

    // ============================================
    // RETAL SERVICE
    // ============================================
    const RetalService = {
      _candidates: [],
      init() {
        this._candidates = store.get('retalCandidates') || [];
      },
      addCandidate(attack) {
        const existing = this._candidates.find((c) => c.attackerId === attack.attackerId);
        if (existing) {
          existing.attacks = (existing.attacks || 1) + 1;
          existing.lastAttack = Date.now();
        } else {
          this._candidates.unshift({
            id: `retal_${Date.now()}`,
            attackerId: attack.attackerId,
            attackerName: attack.attackerName,
            attackerLevel: attack.attackerLevel,
            attacks: 1,
            firstAttack: Date.now(),
            lastAttack: Date.now(),
            priority: attack.priority || 'normal',
          });
        }
        if (this._candidates.length > 50) {
          this._candidates.pop();
        }
        store.set('retalCandidates', this._candidates);
        nexus.emit(EVENTS.RETAL_CANDIDATE, this._candidates[0]);
      },
      getCandidates() {
        return [...this._candidates];
      },
      removeCandidate(attackerId) {
        const idx = this._candidates.findIndex((c) => c.attackerId === attackerId);
        if (idx >= 0) {
          this._candidates.splice(idx, 1);
          store.set('retalCandidates', this._candidates);
          return true;
        }
        return false;
      },
      clearCandidates() {
        this._candidates = [];
        store.set('retalCandidates', this._candidates);
      },
    };

    // ============================================
    // CHAIN MONITOR SERVICE
    // ============================================
    const ChainMonitorService = {
      _state: null,
      _pollInterval: null,
      _isPolling: false,
      init() {
        this._state = store.get('chainState') || this._getDefaultState();
      },
      destroy() {
        this.stopPolling();
      },
      _getDefaultState() {
        return {
          current: 0,
          max: 0,
          timeout: 0,
          cooldown: 0,
          bonusHits: [],
          lastUpdated: null,
          lastErrorMessage: null,
          permissionError: false,
        };
      },
      getState() {
        return { ...this._state };
      },
      updateState(chainData = {}) {
        const chain = chainData.chain || chainData;
        const { current, max, timeout, cooldown } = chain || {};
        this._state = {
          current: current || 0,
          max: max || 0,
          timeout: timeout || 0,
          cooldown: cooldown || 0,
          bonusHits: this._calculateBonusHits(current, max),
          lastUpdated: Date.now(),
          lastErrorMessage: null,
          permissionError: false,
        };
        store.set('chainState', this._state);
        nexus.emit(EVENTS.CHAIN_TICK, this._state);
        ChainRiskService.compute();
        return this._state;
      },
      _calculateBonusHits(current, max) {
        const bonusPoints = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
        const upcoming = [];
        const curr = current || 0;
        for (const bp of bonusPoints) {
          if (bp > curr) {
            upcoming.push({
              target: bp,
              remaining: bp - curr,
            });
            if (upcoming.length >= 3) break;
          }
        }
        return upcoming;
      },
      async startPolling(intervalMs = 10000) {
        if (this._isPolling) return;
        this._isPolling = true;
        const poll = async () => {
          try {
            const data = await api.tornGet('/user', 'bars');
            const chain = data?.bars?.chain || data?.chain;
            if (chain) {
              this.updateState(chain);
            }
          } catch (e) {
            error('[ChainMonitor] Poll failed:', e.message);
            this._state.lastErrorMessage = e.message || 'Unknown error';
            if (e.code === 16 || (e.message && e.message.includes('permission'))) {
              this._state.permissionError = true;
            }
            store.set('chainState', this._state);
          }
        };
        await poll();
        this._pollInterval = setInterval(poll, intervalMs);
        log('[ChainMonitor] Started polling every', intervalMs, 'ms');
      },
      stopPolling() {
        if (this._pollInterval) {
          clearInterval(this._pollInterval);
          this._pollInterval = null;
        }
        this._isPolling = false;
        log('[ChainMonitor] Stopped polling');
      },
      isPolling() {
        return this._isPolling;
      },
      async refreshNow() {
        try {
          const data = await api.tornGet('/user', 'bars');
          const chain = data?.bars?.chain || data?.chain;
          if (chain) {
            return this.updateState(chain);
          }
        } catch (e) {
          error('[ChainMonitor] Refresh failed:', e.message);
          this._state.lastErrorMessage = e.message || 'Unknown error';
          if (e.code === 16 || (e.message && e.message.includes('permission'))) {
            this._state.permissionError = true;
          }
          store.set('chainState', this._state);
          throw e;
        }
        return this._state;
      },
    };

    // ============================================
    // CHAIN RISK SERVICE
    // ============================================
    const ChainRiskService = {
      _risk: null,
      init() {
        this._risk = store.get('chainRisk') || this._getDefaultRisk();
      },
      _getDefaultRisk() {
        return {
          level: 'safe',
          score: 0,
          factors: [],
          recommendation: null,
        };
      },
      getRisk() {
        return { ...this._risk };
      },
      compute() {
        const chainState = ChainMonitorService.getState();
        const config = WarConfigService.getConfig();
        let score = 0;
        const factors = [];

        if (chainState.timeout > 0 && chainState.timeout <= config.chainCriticalThreshold) {
          score += 50;
          factors.push({ type: 'timeout_critical', value: chainState.timeout });
        } else if (chainState.timeout > 0 && chainState.timeout <= config.chainWarningThreshold) {
          score += 25;
          factors.push({ type: 'timeout_warning', value: chainState.timeout });
        }

        if (chainState.current >= 100 && chainState.timeout > 0 && chainState.timeout <= 60) {
          score += 20;
          factors.push({ type: 'high_chain', value: chainState.current });
        }

        const nextBonus = chainState.bonusHits?.[0];
        if (nextBonus && nextBonus.remaining <= 5 && chainState.timeout > 0 && chainState.timeout <= 45) {
          score += 15;
          factors.push({ type: 'approaching_bonus', value: nextBonus.target });
        }

        let level = 'safe';
        if (score >= 50) level = 'critical';
        else if (score >= 30) level = 'warning';
        else if (score >= 15) level = 'elevated';

        let recommendation = null;
        if (level === 'critical') {
          recommendation = 'IMMEDIATE HIT NEEDED - Chain about to break!';
        } else if (level === 'warning') {
          recommendation = 'Hit soon to maintain chain safety';
        } else if (level === 'elevated') {
          recommendation = 'Monitor chain timer closely';
        }

        this._risk = { level, score, factors, recommendation };
        store.set('chainRisk', this._risk);
        nexus.emit(EVENTS.CHAIN_RISK_UPDATE, this._risk);

        if (level === 'critical' || level === 'warning') {
          nexus.emit(EVENTS.CHAIN_WARNING, this._risk);
        }

        return this._risk;
      },
    };

    // ============================================
    // NOTES SERVICE
    // ============================================
    const NotesService = {
      _notes: new Map(),
      init() {
        const saved = store.get('targetNotes') || [];
        saved.forEach((n) => this._notes.set(n.targetId, n));
      },
      _save() {
        store.set('targetNotes', Array.from(this._notes.values()));
      },
      getNote(targetId) {
        return this._notes.get(targetId) || null;
      },
      setNote(targetId, content, tags = []) {
        const note = {
          targetId,
          content,
          tags,
          updatedAt: Date.now(),
        };
        this._notes.set(targetId, note);
        this._save();
        return note;
      },
      deleteNote(targetId) {
        const deleted = this._notes.delete(targetId);
        if (deleted) this._save();
        return deleted;
      },
      getAllNotes() {
        return Array.from(this._notes.values());
      },
      searchNotes(query) {
        const q = query.toLowerCase();
        return Array.from(this._notes.values()).filter(
          (n) => n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))
        );
      },
    };

    // ============================================
    // WAR HISTORY SERVICE
    // ============================================
    const WarHistoryService = {
      _history: [],
      init() {
        this._history = store.get('warHistory') || [];
      },
      recordWar(warData) {
        const entry = {
          id: `war_${Date.now()}`,
          enemyFactionId: warData.enemyFactionId,
          enemyFactionName: warData.enemyFactionName,
          warType: warData.warType,
          startedAt: warData.startedAt,
          endedAt: warData.endedAt,
          result: warData.result,
          stats: warData.stats || {},
          recordedAt: Date.now(),
        };
        this._history.unshift(entry);
        if (this._history.length > 50) {
          this._history.pop();
        }
        store.set('warHistory', this._history);
        return entry;
      },
      getHistory(limit = 10) {
        return this._history.slice(0, limit);
      },
      getWarById(warId) {
        return this._history.find((w) => w.id === warId) || null;
      },
      clearHistory() {
        this._history = [];
        store.set('warHistory', this._history);
      },
    };

    // ============================================
    // ADOPTION SERVICE
    // ============================================
    const AdoptionService = {
      _metrics: null,
      init() {
        this._metrics = store.get('adoptionMetrics') || {
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          sessionCount: 0,
          actionsPerformed: 0,
        };
        this._metrics.sessionCount++;
        this._metrics.lastSeen = Date.now();
        store.set('adoptionMetrics', this._metrics);
      },
      recordHeartbeat(data = {}) {
        this._metrics.lastSeen = Date.now();
        if (data.action) {
          this._metrics.actionsPerformed++;
        }
        store.set('adoptionMetrics', this._metrics);
      },
      getMetrics() {
        return { ...this._metrics };
      },
    };

    // ============================================
    // FACTION SERVICE
    // ============================================
    const FactionService = {
      _factionData: null,
      _members: [],
      _lastFetched: null,
      _hasPermissionError: false,
      _lastErrorMessage: null,
      init() {
        const saved = store.get('factionData');
        if (saved) {
          this._factionData = saved.data;
          this._members = saved.members || [];
          this._lastFetched = saved.lastFetched;
        }
      },
      async refreshFaction() {
        try {
          const data = await api.tornGet('/faction', 'basic');

          if (data && data.error) {
            const msg = data.error.error || 'Unknown API error';
            this._lastErrorMessage = msg;
            this._hasPermissionError = data.error.code === 16 || data.error.code === 7;
            throw new Error(msg);
          }

          this._hasPermissionError = false;
          this._lastErrorMessage = null;

          this._factionData = data;
          this._lastFetched = Date.now();
          this._members = this._parseMembers(data);

          store.set('factionData', {
            data: this._factionData,
            members: this._members,
            lastFetched: this._lastFetched,
          });

          nexus.emit(EVENTS.FACTION_UPDATED, { faction: this.getSummary(), members: this._members });
          return this._factionData;
        } catch (e) {
          error('[FactionService] Refresh failed:', e.message || e);

          const code =
            typeof e?.code === 'number' ? e.code : typeof e?.errorCode === 'number' ? e.errorCode : null;
          const msg = e?.message || 'Unknown error';
          this._lastErrorMessage = msg;

          if (code === 16 || code === 7) {
            this._hasPermissionError = true;
          } else if (msg && (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('access'))) {
            this._hasPermissionError = true;
          }

          throw e;
        }
      },
      _parseMembers(data) {
        if (!data.members) return [];
        const members = [];
        for (const [id, member] of Object.entries(data.members)) {
          members.push({
            id: parseInt(id, 10),
            name: member.name,
            level: member.level || 0,
            position: member.position || 'Member',
            daysInFaction: member.days_in_faction || 0,
            lastAction: member.last_action?.relative || 'Unknown',
            lastActionTimestamp: member.last_action?.timestamp || 0,
            status: member.status?.state || 'ok',
            statusUntil: member.status?.until || 0,
          });
        }
        return members;
      },
      getFaction() {
        return this._factionData ? { ...this._factionData } : null;
      },
      getMembers() {
        return [...this._members];
      },
      getSummary() {
        if (!this._factionData) return null;
        const data = this._factionData;
        return {
          id: data.ID || data.faction_id,
          name: data.name || 'Unknown',
          tag: data.tag || '',
          tagImage: data.tag_image || null,
          respect: data.respect || 0,
          age: data.age || 0,
          capacity: data.capacity || 0,
          memberCount: this._members.length || Object.keys(data.members || {}).length,
          leader: data.leader || null,
          leaderName: this._findMemberName(data.leader),
          coLeader: data['co-leader'] || null,
          coLeaderName: this._findMemberName(data['co-leader']),
          bestChain: data.best_chain || 0,
          territoryWars: data.territory_wars || {},
          raidWars: data.raid_wars || {},
          peace: data.peace || {},
          rank: data.rank || {},
          rankedWars: data.ranked_wars || {},
          war: data.war || null,
          lastFetched: this._lastFetched,
        };
      },
      _findMemberName(memberId) {
        if (!memberId) return null;
        const member = this._members.find((m) => m.id === memberId);
        return member?.name || null;
      },
      hasPermissionError() {
        return this._hasPermissionError;
      },
      getLastError() {
        return this._lastErrorMessage;
      },
      getLastFetched() {
        return this._lastFetched;
      },
    };

    // ============================================
    // SERVICE AGGREGATOR
    // ============================================
    const services = {
      DiagnosticsService,
      WarConfigService,
      ClaimsService,
      DibsService,
      MedDealsService,
      WarPresenceService,
      WarLiveHookService,
      SpyService,
      WatchersService,
      AttackLogService,
      UnauthorizedAttackService,
      RetalService,
      ChainMonitorService,
      ChainRiskService,
      NotesService,
      WarHistoryService,
      AdoptionService,
      FactionService,
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    let cleanupInterval = null;

    function init() {
      log("[Odin's Spear] Initializing v" + SPEAR_VERSION);

      try {
        WarConfigService.init();
        ClaimsService.init();
        DibsService.init();
        MedDealsService.init();
        WarPresenceService.init();
        SpyService.init();
        WarLiveHookService.init();
        WatchersService.init();
        AttackLogService.init();
        UnauthorizedAttackService.init();
        RetalService.init();
        ChainMonitorService.init();
        ChainRiskService.init();
        NotesService.init();
        WarHistoryService.init();
        AdoptionService.init();
        FactionService.init();

        // FIX: ensure ctx.services exists and is populated (no throwaway object)
        ctx.services = ctx.services || {};
        Object.assign(ctx.services, services);

        window.OdinsSpear = {
          version: SPEAR_VERSION,
          services,
          EVENTS,
        };

        cleanupInterval = setInterval(() => {
          ClaimsService.expireStaleClaims();
          DibsService.cleanupExpired();
          MedDealsService.cleanupExpired();
        }, 30000);

        if (ctx.userId) {
          AdoptionService.recordHeartbeat({ playerId: ctx.userId, action: 'init' });
        }

        ChainRiskService.compute();

        nexus.emit(EVENTS.SPEAR_READY, { version: SPEAR_VERSION, services: Object.keys(services) });

        log("[Odin's Spear] Ready with services:", Object.keys(services).join(', '));
      } catch (e) {
        error("[Odin's Spear] Init failed:", e);
        DiagnosticsService.logError(e, { phase: 'init' });
      }
    }

    function destroy() {
      log("[Odin's Spear] Destroying...");

      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }

      WarLiveHookService.destroy();
      ChainMonitorService.destroy();
      WatchersService.destroy();

      window.OdinsSpear = null;

      log("[Odin's Spear] Destroyed");
    }

    return { id: 'odins-spear-core', init, destroy };
  });
})();
