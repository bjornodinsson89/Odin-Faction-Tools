// odins-spear-core.js
// Headless faction war & chain coordination engine
// Version: 3.1.0
// Author: BjornOdinsson89

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinsSpearModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
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
          claimTimeoutMinutes: 5,
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
        this._config = { ...this._config, ...updates };
        store.set('warConfig', this._config);
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
        return Array.from(this._claims.values()).filter(
          (c) => c.attackerId === attackerId && c.status === 'active'
        );
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
          const ffSum = this._attacks.filter((a) => a.result === 'win').reduce((sum, a) => sum + (a.fairFight || 1), 0);
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
    // Fixed: Now uses /user?selections=bars
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

      // Fixed: Now robust to both direct chain object and nested object
      updateState(chainData = {}) {
        // Handle both { current, max, timeout, cooldown } and { chain: { ... } }
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

      // Fixed: Now uses /user?selections=bars instead of /faction?selections=chain
      async startPolling(intervalMs = 10000) {
        if (this._isPolling) return;
        this._isPolling = true;

        const poll = async () => {
          try {
            const data = await api.tornGet('/user', 'bars');
            // Handle both data.bars.chain and data.chain structures
            const chain = data?.bars?.chain || data?.chain;
            if (chain) {
              this.updateState(chain);
            }
          } catch (e) {
            error('[ChainMonitor] Poll failed:', e.message);
            // Set error state for UI feedback
            this._state.lastErrorMessage = e.message || 'Unknown error';
            // Check for permission error (Torn API error code 16)
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

      // New helper: refreshNow() for manual refresh from UI
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

        // Timeout risk
        if (chainState.timeout > 0 && chainState.timeout <= config.chainCriticalThreshold) {
          score += 50;
          factors.push({ type: 'timeout_critical', value: chainState.timeout });
        } else if (chainState.timeout > 0 && chainState.timeout <= config.chainWarningThreshold) {
          score += 25;
          factors.push({ type: 'timeout_warning', value: chainState.timeout });
        }

        // High chain at risk
        if (chainState.current >= 100 && chainState.timeout > 0 && chainState.timeout <= 60) {
          score += 20;
          factors.push({ type: 'high_chain', value: chainState.current });
        }

        // Near bonus
        const nextBonus = chainState.bonusHits?.[0];
        if (nextBonus && nextBonus.remaining <= 5 && chainState.timeout > 0 && chainState.timeout <= 45) {
          score += 15;
          factors.push({ type: 'approaching_bonus', value: nextBonus.target });
        }

        // Determine level
        let level = 'safe';
        if (score >= 50) level = 'critical';
        else if (score >= 30) level = 'warning';
        else if (score >= 15) level = 'elevated';

        // Generate recommendation
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
    // FACTION SERVICE (NEW)
    // Fetches and caches user's own faction data
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
          // Fetch faction basic info (members already include `position`, so `positions` selection is not required)
          const data = await api.tornGet('/faction', 'basic');

          // Handle legacy-style responses if any caller injects `{error:{...}}` instead of throwing
          if (data && data.error) {
            const msg = data.error.error || 'Unknown API error';
            this._lastErrorMessage = msg;
            this._hasPermissionError = (data.error.code === 16 || data.error.code === 7);
            throw new Error(msg);
          }

          // Reset error state on success
          this._hasPermissionError = false;
          this._lastErrorMessage = null;

          // Store raw faction data
          this._factionData = data;
          this._lastFetched = Date.now();

          // Parse members from the response
          this._members = this._parseMembers(data);

          // Persist snapshot
          store.set('factionData', {
            data: this._factionData,
            members: this._members,
            lastFetched: this._lastFetched,
          });

          nexus.emit(EVENTS.FACTION_UPDATED, { faction: this.getSummary(), members: this._members });

          return this._factionData;
        } catch (e) {
          error('[FactionService] Refresh failed:', e.message || e);

          // Torn API throws are normalized by OdinApi with `.code` when possible
          const code = (typeof e?.code === 'number') ? e.code : (typeof e?.errorCode === 'number' ? e.errorCode : null);
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

        const positions = data.positions || {};
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
      log('[Odin\'s Spear] Initializing v' + SPEAR_VERSION);

      try {
        // Initialize all services
        WarConfigService.init();
        ClaimsService.init();
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

        // Attach services to context
        Object.assign(ctx.services || {}, services);

        // Expose globally
        window.OdinsSpear = {
          version: SPEAR_VERSION,
          services,
          EVENTS,
        };

        // Start periodic cleanup
        cleanupInterval = setInterval(() => {
          ClaimsService.expireStaleClaims();
        }, 30000);

        // Record adoption heartbeat
        if (ctx.userId) {
          AdoptionService.recordHeartbeat({ playerId: ctx.userId, action: 'init' });
        }

        // Compute initial chain risk
        ChainRiskService.compute();

        nexus.emit(EVENTS.SPEAR_READY, { version: SPEAR_VERSION, services: Object.keys(services) });
        log('[Odin\'s Spear] Ready with services:', Object.keys(services).join(', '));

      } catch (e) {
        error('[Odin\'s Spear] Init failed:', e);
        DiagnosticsService.logError(e, { phase: 'init' });
      }
    }

    function destroy() {
      log('[Odin\'s Spear] Destroying...');

      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
      }

      ChainMonitorService.destroy();
      WatchersService.destroy();

      window.OdinsSpear = null;
      log('[Odin\'s Spear] Destroyed');
    }

    return { id: 'odins-spear-core', init, destroy };
  });
})();
