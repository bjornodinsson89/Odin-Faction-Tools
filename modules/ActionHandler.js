/**
 * Odin Tools - Action Handler Module
 * Handles user actions like adding targets, claiming targets, notes, etc.
 * OFFLINE-TOLERANT:
 * Always updates local storage immediately
 * Mirrors storage state into ctx.store so UI updates instantly
 * Emits Nexus events for other modules
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
    
    function mergeProfileIntoTarget(targetObj, userData) {
      if (!targetObj || !userData || typeof userData !== 'object') return targetObj;

      // Torn API responses can vary by selections. Normalize.
      const profile = (userData.profile && typeof userData.profile === 'object') ? userData.profile : null;
      const basic = (userData.basic && typeof userData.basic === 'object') ? userData.basic : null;
      const bars = (userData.bars && typeof userData.bars === 'object') ? userData.bars : null;

      const srcPrimary = profile || basic || userData;
      const srcSecondary = basic || profile || userData;

      const name = (srcPrimary && srcPrimary.name) ? srcPrimary.name : targetObj.name;
      const level = (srcPrimary && Number.isFinite(Number(srcPrimary.level))) ? Number(srcPrimary.level) :
        ((srcSecondary && Number.isFinite(Number(srcSecondary.level))) ? Number(srcSecondary.level) : targetObj.level);

      // status + last_action are usually on "basic", but can also appear on "profile" depending on key/selection.
      const statusRaw = (basic && basic.status) ? basic.status : ((profile && profile.status) ? profile.status : null);
      const lastActionRaw = (basic && basic.last_action) ? basic.last_action : ((profile && profile.last_action) ? profile.last_action : null);

      const factionRaw = (profile && profile.faction) ? profile.faction : ((basic && basic.faction) ? basic.faction : null);

      const merged = Object.assign({}, targetObj, {
        name,
        level,
        updatedAt: Date.now()
      });

      if (statusRaw && typeof statusRaw === 'object') {
        merged.status = Object.assign({}, merged.status || {}, {
          state: statusRaw.state || statusRaw.status || merged.status?.state || 'Unknown',
          description: statusRaw.description || statusRaw.details || merged.status?.description || '',
          until: Number.isFinite(Number(statusRaw.until)) ? Number(statusRaw.until) : (merged.status?.until || 0)
        });
      }

      if (lastActionRaw && typeof lastActionRaw === 'object') {
        merged.last_action = Object.assign({}, merged.last_action || {}, lastActionRaw);
      }

      if (factionRaw && typeof factionRaw === 'object') {
        merged.faction = Object.assign({}, merged.faction || {}, factionRaw);
      }

      if (bars && typeof bars === 'object') {
        merged.bars = Object.assign({}, merged.bars || {}, bars);
      }

      const laStatus = merged.last_action && merged.last_action.status ? String(merged.last_action.status) : '';
      merged.online = laStatus === 'Online';

      return merged;
    }

    async function refreshOneTargetProfile(targetId, targetsObj) {
        try {
            const profileData = await ctx.api.getUser(targetId, 'basic,profile,bars');
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
      if (!targetId) {
        console.error('[ActionHandler] ADD_TARGET called with no targetId');
        return;
      }

      console.log('[ActionHandler] ➕ Adding target:', targetId);

      try {
        const targets = loadTargets();

        if (targets[targetId]) {
          console.log('[ActionHandler] ⚠️ Target already exists:', targetId);
          nexus.emit('TARGET_ALREADY_EXISTS', { targetId });
          return;
        }

        // CRITICAL: Save to local storage IMMEDIATELY (local-first)
        const newTarget = {
          id: targetId,
          addedAt: Date.now(),
          addedBy: ctx?.firebase?.getCurrentUser?.()?.uid || 'local',
          targetName: null,
          level: null,
          factionName: null,
          lastUpdated: Date.now()
        };

        targets[targetId] = newTarget;
        saveTargets(targets);

        console.log('[ActionHandler] ✓ Target saved locally:', targetId);
        nexus.emit('TARGET_ADDED', { targetId, target: newTarget });

        // Background: Fetch profile (non-blocking, best-effort)
        if (ctx.api && typeof ctx.api.getUser === 'function') {
          // Don't await - run in background
          ctx.api.getUser(targetId, 'basic,profile,bars')
            .then((profile) => {
              if (profile) {
                const currentTargets = loadTargets();
                if (currentTargets[targetId]) {
                  mergeProfileIntoTarget(currentTargets[targetId], profile);
                  currentTargets[targetId].lastUpdated = Date.now();
                  saveTargets(currentTargets);
                  console.log('[ActionHandler] ✓ Profile data enriched for target:', targetId);
                  nexus.emit('TARGET_INFO_UPDATED', { targetId, target: currentTargets[targetId] });
                }
              }
            })
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Profile fetch failed (non-fatal):', targetId, e.message);
            });
        }

        // Background: Sync to Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.setDoc === 'function') {
          ctx.firebase.setDoc('targets', String(targetId), newTarget, { merge: true })
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase sync queued for target:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Error adding target:', e.message || e);
        nexus.emit('TARGET_ADD_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // CLAIM TARGET HANDLER
    // ============================================
    async function handleClaimTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] CLAIM_TARGET called with no targetId');
        return;
      }

      try {
        const claims = loadClaims();
        const uid = ctx?.firebase?.getCurrentUser?.()?.uid || 'local';

        // CRITICAL: Save to local storage IMMEDIATELY (local-first)
        const newClaim = {
          targetId,
          claimedBy: uid,
          claimedAt: Date.now(),
          status: 'claimed'
        };

        claims[targetId] = newClaim;
        saveClaims(claims);

        console.log('[ActionHandler] ✓ Claim saved locally:', targetId, 'by', uid);
        nexus.emit('TARGET_CLAIMED', { targetId, claim: newClaim });

        // Background: Sync to Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.setDoc === 'function') {
          ctx.firebase.setDoc('claims', String(targetId), newClaim, { merge: true })
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase sync queued for claim:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Claim error:', e.message || e);
        nexus.emit('TARGET_CLAIM_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // UNCLAIM TARGET HANDLER
    // ============================================
    async function handleUnclaimTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] UNCLAIM_TARGET called with no targetId');
        return;
      }

      try {
        const claims = loadClaims();

        // CRITICAL: Update local storage IMMEDIATELY (local-first)
        if (claims[targetId]) delete claims[targetId];
        saveClaims(claims);

        console.log('[ActionHandler] ✓ Unclaim saved locally:', targetId);
        nexus.emit('TARGET_UNCLAIMED', { targetId });

        // Background: Sync to Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.deleteDoc === 'function') {
          ctx.firebase.deleteDoc('claims', String(targetId))
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase sync queued for unclaim:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Unclaim error:', e.message || e);
        nexus.emit('TARGET_UNCLAIM_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // RELEASE CLAIM HANDLER (alias for unclaim)
    // ============================================
    async function handleReleaseClaim(payload) {
      return handleUnclaimTarget(payload);
    }

    

    // ============================================
    // REMOVE TARGET HANDLER
    // ============================================
    async function handleRemoveTarget(payload) {
      const { targetId } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] REMOVE_TARGET called with no targetId');
        return;
      }

      try {
        // CRITICAL: Update local storage IMMEDIATELY (local-first)
        const targets = loadTargets();
        if (targets[targetId]) delete targets[targetId];
        saveTargets(targets);

        // Also remove claim if any
        const claims = loadClaims();
        if (claims[targetId]) {
          delete claims[targetId];
          saveClaims(claims);
        }

        console.log('[ActionHandler] ✓ Target removed locally:', targetId);
        nexus.emit('TARGET_REMOVED', { targetId });

        // Background: Cleanup in Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.deleteDoc === 'function') {
          ctx.firebase.deleteDoc('claims', String(targetId))
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase cleanup queued for removed target:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Remove target error:', e.message || e);
        nexus.emit('TARGET_REMOVE_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }
// ============================================
    // EVENT WIRING
    // ============================================
        const offProfileDetected = nexus.on ? nexus.on('PROFILE_DETECTED', async (payload) => {
      const playerId = (payload && typeof payload === 'object') ? payload.playerId : payload;
      const id = String(playerId || '').trim();
      if (!id) return;

      try {
        if (!ctx.api || typeof ctx.api.getUser !== 'function') return;
        const data = await ctx.api.getUser(id, 'basic,profile,bars');
        store.update('profiles', (prev) => Object.assign({}, prev || {}, { [id]: data }));
      } catch (err) {
        // Non-fatal: profile panel can still work without prefetch
        log('[ActionHandler] PROFILE_DETECTED prefetch failed:', err.message);
      }
    }) : null;



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
