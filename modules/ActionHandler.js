/**
 * Odin Tools - Action Handler Module
 * Handles user actions like adding targets, claiming targets, notes, etc.
 * OFFLINE-TOLERANT:
 *  - Always updates local storage immediately
 *  - Mirrors storage state into ctx.store so UI updates instantly
 *  - Emits Nexus events for other modules
 * Version: 1.1.0
 * Author: BjornOdinsson89
 */

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function ActionHandlerModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const store = ctx.store || { set: () => {}, get: () => {} };

    const ACTION_VERSION = '1.1.0';

    // ============================================
    // LOCAL <-> STORE SYNC
    // ============================================
    function loadTargets() {
      return storage.getJSON('odin_targets', {}) || {};
    }

    function saveTargets(targets) {
      storage.setJSON('odin_targets', targets || {});
      store.set('targets', targets || {});
    }

    function loadClaims() {
      return storage.getJSON('odin_claims', {}) || {};
    }

    function saveClaims(claims) {
      storage.setJSON('odin_claims', claims || {});
      store.set('claims', claims || {});
    }

    function bootstrapStateFromStorage() {
      try {
        const targets = loadTargets();
        const claims = loadClaims();
        store.set('targets', targets);
        store.set('claims', claims);
      } catch (e) {
        log('[ActionHandler] bootstrapStateFromStorage failed:', e && e.message ? e.message : e);
      }
    }

    bootstrapStateFromStorage();

    // ============================================
    // ADD TARGET HANDLER
    // ============================================
    
    function mergeProfileIntoTarget(targetObj, profileData) {
        if (!targetObj || typeof targetObj !== 'object' || !profileData || typeof profileData !== 'object') return;
        // Core identity
        if (typeof profileData.name === 'string' && profileData.name) targetObj.targetName = profileData.name;
        if (typeof profileData.level === 'number') targetObj.level = profileData.level;
        if (profileData.faction && typeof profileData.faction.faction_name === 'string' && profileData.faction.faction_name) {
            targetObj.factionName = profileData.faction.faction_name;
        }

        // Status (hospital / jail / traveling / okay) + timers
        const st = profileData.status && typeof profileData.status === 'object' ? profileData.status : {};
        if (typeof st.state === 'string') targetObj.statusState = st.state;
        if (typeof st.description === 'string') targetObj.statusDescription = st.description;
        if (typeof st.until === 'number') targetObj.statusUntil = st.until;

        // Last action (online/offline) + timestamp
        const la = profileData.last_action && typeof profileData.last_action === 'object' ? profileData.last_action : {};
        if (typeof la.status === 'string') targetObj.lastActionStatus = la.status;
        if (typeof la.timestamp === 'number') targetObj.lastActionTimestamp = la.timestamp;
        targetObj.online = (String(targetObj.lastActionStatus || '').toLowerCase() === 'online');

        // Life
        const lf = profileData.life && typeof profileData.life === 'object' ? profileData.life : {};
        if (typeof lf.current === 'number') targetObj.lifeCurrent = lf.current;
        if (typeof lf.maximum === 'number') targetObj.lifeMax = lf.maximum;

        targetObj.updatedAt = Math.floor(Date.now() / 1000);
    }

    async function refreshOneTargetProfile(targetId, targetsObj) {
        try {
            const profileData = await ctx.api.getUserProfile(targetId);
            if (!profileData) return false;
            if (!targetsObj[targetId]) targetsObj[targetId] = { targetId: String(targetId) };
            mergeProfileIntoTarget(targetsObj[targetId], profileData);
            return true;
        } catch (err) {
            log.error('[ACTION] Failed to refresh target profile', { targetId, err });
            return false;
        }
    }

    let _refreshInFlight = false;
    async function handleRefreshTargets() {
        if (_refreshInFlight) return;
        _refreshInFlight = true;
        try {
            const targets = await loadTargets();
            const ids = Object.keys(targets || {});
            if (!ids.length) {
                nexus.emit('TARGETS_REFRESHED', { count: 0 });
                return;
            }
            let updated = 0;
            for (const targetId of ids) {
                const ok = await refreshOneTargetProfile(targetId, targets);
                if (ok) updated++;
            }
            await saveTargets(targets);
            nexus.emit('TARGETS_UPDATED', targets);
            nexus.emit('TARGETS_REFRESHED', { count: updated, total: ids.length });
        } finally {
            _refreshInFlight = false;
        }
    }

async function handleAddTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) return;

      log('[ActionHandler] Adding target:', targetId);

      try {
        const targets = loadTargets();

        if (targets[targetId]) {
          log('[ActionHandler] Target already exists:', targetId);
          nexus.emit('TARGET_ALREADY_EXISTS', { targetId });
          return;
        }

        targets[targetId] = {
          id: targetId,
          addedAt: Date.now(),
          addedBy: ctx?.firebase?.getCurrentUser?.()?.uid || null,
          targetName: null,
          level: null,
          factionName: null,
          lastUpdated: Date.now()
        };

        saveTargets(targets);

        nexus.emit('TARGET_ADDED', { targetId, target: targets[targetId] });

        // Fetch profile (best-effort)
        if (ctx.api && typeof ctx.api.getUserProfile === 'function') {
          try {
            const profile = await ctx.api.getUserProfile(targetId);
            if (profile) {
              mergeProfileIntoTarget(targets[targetId], profile);
              targets[targetId].lastUpdated = Date.now();
              saveTargets(targets);
              nexus.emit('TARGET_INFO_UPDATED', { targetId, target: targets[targetId] });
            }
          } catch (e) {
            log('[ActionHandler] Failed to fetch target profile (non-fatal):', e && e.message ? e.message : e);
          }
        }
} catch (e) {
        log('[ActionHandler] Error adding target:', e && e.message ? e.message : e);
        nexus.emit('TARGET_ADD_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // CLAIM TARGET HANDLER
    // ============================================
    async function handleClaimTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) return;

      try {
        const claims = loadClaims();
        const uid = ctx?.firebase?.getCurrentUser?.()?.uid || 'local';

        claims[targetId] = {
          targetId,
          claimedBy: uid,
          claimedAt: Date.now(),
          status: 'claimed'
        };

        saveClaims(claims);

        nexus.emit('TARGET_CLAIMED', { targetId, claim: claims[targetId] });

        // Best-effort backend sync if available
        if (ctx.firebase && typeof ctx.firebase.setDoc === 'function') {
          try {
            await ctx.firebase.setDoc('claims', String(targetId), claims[targetId], { merge: true });
          } catch (e) {
            // Non-fatal: queue handled in FirebaseService
          }
        }
      } catch (e) {
        log('[ActionHandler] Claim error:', e && e.message ? e.message : e);
        nexus.emit('TARGET_CLAIM_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // UNCLAIM TARGET HANDLER
    // ============================================
    async function handleUnclaimTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) return;

      try {
        const claims = loadClaims();
        if (claims[targetId]) delete claims[targetId];
        saveClaims(claims);

        nexus.emit('TARGET_UNCLAIMED', { targetId });

        if (ctx.firebase && typeof ctx.firebase.deleteDoc === 'function') {
          try {
            await ctx.firebase.deleteDoc('claims', String(targetId));
          } catch (e) {
            // queued/non-fatal
          }
        }
      } catch (e) {
        log('[ActionHandler] Unclaim error:', e && e.message ? e.message : e);
        nexus.emit('TARGET_UNCLAIM_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    

    // ============================================
    // REMOVE TARGET HANDLER
    // ============================================
    async function handleRemoveTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) return;

      try {
        const targets = loadTargets();
        if (targets[targetId]) delete targets[targetId];
        saveTargets(targets);

        // also remove claim if any
        const claims = loadClaims();
        if (claims[targetId]) {
          delete claims[targetId];
          saveClaims(claims);
        }

        nexus.emit('TARGET_REMOVED', { targetId });

        // best-effort backend cleanup
        if (ctx.firebase && typeof ctx.firebase.deleteDoc === 'function') {
          try { await ctx.firebase.deleteDoc('claims', String(targetId)); } catch (_) {}
        }
      } catch (e) {
        log('[ActionHandler] Remove target error:', e && e.message ? e.message : e);
        nexus.emit('TARGET_REMOVE_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }
// ============================================
    // EVENT WIRING
    // ============================================
    const offAdd = nexus.on ? nexus.on('ADD_TARGET', handleAddTarget) : null;
    const offClaim = nexus.on ? nexus.on('CLAIM_TARGET', handleClaimTarget) : null;
    const offUnclaim = nexus.on ? nexus.on('UNCLAIM_TARGET', handleUnclaimTarget) : null;
    const offRelease = nexus.on ? nexus.on('RELEASE_CLAIM', handleReleaseClaim) : null;
    const offRefreshTargets = nexus.on ? nexus.on('REFRESH_TARGETS', handleRefreshTargets) : null;
    const offRemove = nexus.on ? nexus.on('REMOVE_TARGET', handleRemoveTarget) : null;

    function destroy() {
      try { if (typeof offAdd === 'function') offAdd(); } catch (_) {}
      try { if (typeof offClaim === 'function') offClaim(); } catch (_) {}
      try { if (typeof offUnclaim === 'function') offUnclaim(); } catch (_) {}
      try { if (typeof offRelease === 'function') offRelease(); } catch (_) {}
      try { if (typeof offRemove === 'function') offRemove(); } catch (_) {}
    }

    return {
      id: 'action-handler',
      version: ACTION_VERSION,
      init: function () {
        bootstrapStateFromStorage();
      },
      destroy
    };
  });
})();
