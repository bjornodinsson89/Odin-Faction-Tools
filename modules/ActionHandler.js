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

    const ACTION_VERSION = '5.1.0';

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
              targets[targetId].targetName = profile.name || null;
              targets[targetId].level = profile.level || null;

              // Torn V1 user profile can include faction object in some shapes
              const factionName =
                (profile.faction && (profile.faction.faction_name || profile.faction.name)) ||
                profile.faction_name ||
                null;

              targets[targetId].factionName = factionName;
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
    // PROFILE VIEW HANDLER (UI -> API Bridge)
    // ============================================
    /**
     * Handles PROFILE_VIEW_READY events from ui-profile-injection
     * This is the bridge between UI detection and API data fetching
     */
    async function handleProfileViewReady(payload) {
      const { playerId, url } = payload || {};
      if (!playerId || playerId === 'unknown') return;

      log('[ActionHandler] Profile view detected for player:', playerId);

      // Emit event to notify UI that a profile was detected
      nexus.emit('PROFILE_DETECTED', { playerId, url });

      // Fetch profile data to populate cache (best-effort, non-blocking)
      if (ctx.api && typeof ctx.api.getUserProfile === 'function') {
        try {
          log('[ActionHandler] Fetching profile data for:', playerId);
          const profile = await ctx.api.getUserProfile(playerId);

          if (profile) {
            // Update store with profile data
            const profileData = {
              id: playerId,
              name: profile.name || null,
              level: profile.level || null,
              factionId: profile.faction?.faction_id || null,
              factionName: profile.faction?.faction_name || profile.faction?.name || null,
              lastAction: profile.last_action || null,
              status: profile.status || null,
              fetchedAt: Date.now()
            };

            // Store in ctx.store for UI access
            const profiles = store.get('profiles') || {};
            profiles[playerId] = profileData;
            store.set('profiles', profiles);

            // Emit profile data event
            nexus.emit('PROFILE_DATA_LOADED', { playerId, profile: profileData });
            log('[ActionHandler] Profile data loaded and stored for:', playerId);
          }
        } catch (e) {
          log('[ActionHandler] Failed to fetch profile data (non-fatal):', e && e.message ? e.message : e);
        }
      }
    }

    // ============================================
    // EVENT WIRING
    // ============================================
    const offAdd = nexus.on ? nexus.on('ADD_TARGET', handleAddTarget) : null;
    const offClaim = nexus.on ? nexus.on('CLAIM_TARGET', handleClaimTarget) : null;
    const offUnclaim = nexus.on ? nexus.on('UNCLAIM_TARGET', handleUnclaimTarget) : null;
    const offRelease = nexus.on ? nexus.on('RELEASE_CLAIM', handleUnclaimTarget) : null;
    const offRemove = nexus.on ? nexus.on('REMOVE_TARGET', handleRemoveTarget) : null;
    const offProfileView = nexus.on ? nexus.on('PROFILE_VIEW_READY', handleProfileViewReady) : null;

    function destroy() {
      try { if (typeof offAdd === 'function') offAdd(); } catch (_) {}
      try { if (typeof offClaim === 'function') offClaim(); } catch (_) {}
      try { if (typeof offUnclaim === 'function') offUnclaim(); } catch (_) {}
      try { if (typeof offRelease === 'function') offRelease(); } catch (_) {}
      try { if (typeof offRemove === 'function') offRemove(); } catch (_) {}
      try { if (typeof offProfileView === 'function') offProfileView(); } catch (_) {}
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
