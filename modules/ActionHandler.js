/**
 * Odin Tools - Action Handler Module
 * Handles user actions like adding targets and claiming targets
 * Version: 1.0.0
 * Author: BjornOdinsson89
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function ActionHandlerModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };

    const store = ctx.store || null;

    function syncTargetsToStore(targetsObj) {
      if (!store || typeof store.set !== 'function' || typeof store.get !== 'function') return;
      // Store shape expected by UIManager: state.targets is an object map
      store.set('targets', targetsObj || {});
    }

    function syncClaimsToStore(claimsObj) {
      if (!store || typeof store.set !== 'function' || typeof store.get !== 'function') return;
      store.set('claims', claimsObj || {});
    }

    function loadTargetsFromStorageToStore() {
      try {
        const targets = storage.getJSON('odin_targets', {});
        syncTargetsToStore(targets || {});
      } catch (_) {}
    }

    function loadClaimsFromStorageToStore() {
      try {
        const claims = storage.getJSON('odin_claims', {});
        syncClaimsToStore(claims || {});
      } catch (_) {}
    }

    \1
    // ============================================
    // INITIAL STATE SYNC (Storage -> Store)
    // ============================================
    loadTargetsFromStorageToStore();
    loadClaimsFromStorageToStore();

    // ============================================
    // ADD TARGET HANDLER
    // ============================================
    async function handleAddTarget(payload) {
      const { targetId } = payload || {};

      if (!targetId) {
        log('[ActionHandler] No targetId provided');
        return;
      }

      log('[ActionHandler] Adding target:', targetId);

      try {
        // Get current targets from local storage
        const targets = storage.getJSON('odin_targets', {});

        // Check if target already exists
        if (targets[targetId]) {
          log('[ActionHandler] Target already exists:', targetId);
          nexus.emit('TARGET_ALREADY_EXISTS', { targetId });
          return;
        }

        // Add target with basic info
        targets[targetId] = {
          id: targetId,
          addedAt: Date.now(),
          addedBy: ctx.store?.get('auth.tornId', null),
          frekiScore: null,
          targetName: null,
          level: null,
          factionName: null
        };

        // Save to local storage
        \1
        syncTargetsToStore(targets);

        // Emit success event
        nexus.emit('TARGET_ADDED', { targetId, target: targets[targetId] });

        log('[ActionHandler] Target added successfully:', targetId);

        // Try to fetch target info from API if available
        if (ctx.api && ctx.api.getUserProfile) {
          try {
            const profile = await ctx.api.getUserProfile(targetId);
            if (profile) {
              targets[targetId].targetName = profile.name || null;
              targets[targetId].level = profile.level || null;
              targets[targetId].factionName = profile.faction?.faction_name || null;
              \1
              syncTargetsToStore(targets);

              nexus.emit('TARGET_INFO_UPDATED', { targetId, target: targets[targetId] });
            }
          } catch (e) {
            log('[ActionHandler] Failed to fetch target profile:', e.message);
          }
        }

        // If Firebase is available, sync to database
        if (ctx.firebase && ctx.firebase.ref) {
          const factionId = ctx.store?.get('auth.factionId', null);
          if (factionId) {
            try {
              await ctx.firebase.ref(`factions/${factionId}/targets/${targetId}`).set(targets[targetId]);
              log('[ActionHandler] Target synced to Firebase');
            } catch (e) {
              log('[ActionHandler] Failed to sync target to Firebase:', e.message);
            }
          }
        }

      } catch (error) {
        log('[ActionHandler] Error adding target:', error.message);
        nexus.emit('TARGET_ADD_ERROR', { targetId, error: error.message });
      }
    }

    // ============================================
    // CLAIM TARGET HANDLER
    // ============================================
    async function handleClaimTarget(payload) {
      const { targetId, type } = payload || {};

      if (!targetId) {
        log('[ActionHandler] No targetId provided for claim');
        return;
      }

      const claimType = type || 'attack';
      log('[ActionHandler] Claiming target:', targetId, 'type:', claimType);

      try {
        // Get current claims from local storage
        const claims = storage.getJSON('odin_claims', {});

        // Check if target is already claimed
        if (claims[targetId] && claims[targetId].status === 'active') {
          const existingClaim = claims[targetId];
          const claimedBy = existingClaim.claimedBy || 'Unknown';
          const isMyId = claimedBy === ctx.store?.get('auth.tornId', null);

          if (isMyId) {
            log('[ActionHandler] You already claimed this target');
            nexus.emit('CLAIM_ALREADY_EXISTS', { targetId, isOwnClaim: true });
          } else {
            log('[ActionHandler] Target already claimed by:', claimedBy);
            nexus.emit('CLAIM_ALREADY_EXISTS', { targetId, claimedBy, isOwnClaim: false });
          }
          return;
        }

        // Create claim
        const claim = {
          targetId: targetId,
          claimedBy: ctx.store?.get('auth.tornId', null),
          claimedByName: ctx.store?.get('auth.playerName', 'Unknown'),
          claimedAt: Date.now(),
          type: claimType,
          status: 'active',
          expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes expiry
        };

        claims[targetId] = claim;

        // Save to local storage
        \1
        syncClaimsToStore(claims);

        // Emit success event
        nexus.emit('TARGET_CLAIMED', { targetId, claim });

        log('[ActionHandler] Target claimed successfully:', targetId);

        // If Firebase is available, sync to database
        if (ctx.firebase && ctx.firebase.ref) {
          const factionId = ctx.store?.get('auth.factionId', null);
          if (factionId) {
            try {
              await ctx.firebase.ref(`factions/${factionId}/claims/${targetId}`).set(claim);
              log('[ActionHandler] Claim synced to Firebase');
            } catch (e) {
              log('[ActionHandler] Failed to sync claim to Firebase:', e.message);
            }
          }
        }

      } catch (error) {
        log('[ActionHandler] Error claiming target:', error.message);
        nexus.emit('CLAIM_ERROR', { targetId, error: error.message });
      }
    }

    // ============================================
    // RELEASE CLAIM HANDLER
    // ============================================
    async function handleReleaseClaim(payload) {
      const { targetId } = payload || {};

      if (!targetId) {
        log('[ActionHandler] No targetId provided for release');
        return;
      }

      log('[ActionHandler] Releasing claim:', targetId);

      try {
        const claims = storage.getJSON('odin_claims', {});

        if (!claims[targetId]) {
          log('[ActionHandler] No active claim found for target:', targetId);
          return;
        }

        // Mark as released
        claims[targetId].status = 'released';
        claims[targetId].releasedAt = Date.now();

        \1
        syncClaimsToStore(claims);

        nexus.emit('CLAIM_RELEASED', { targetId });

        log('[ActionHandler] Claim released successfully:', targetId);

        // If Firebase is available, update database
        if (ctx.firebase && ctx.firebase.ref) {
          const factionId = ctx.store?.get('auth.factionId', null);
          if (factionId) {
            try {
              await ctx.firebase.ref(`factions/${factionId}/claims/${targetId}`).set(claims[targetId]);
              log('[ActionHandler] Claim release synced to Firebase');
            } catch (e) {
              log('[ActionHandler] Failed to sync claim release to Firebase:', e.message);
            }
          }
        }

      } catch (error) {
        log('[ActionHandler] Error releasing claim:', error.message);
        nexus.emit('CLAIM_RELEASE_ERROR', { targetId, error: error.message });
      }
    }

    // ============================================
    // REMOVE TARGET HANDLER
    // ============================================
    async function handleRemoveTarget(payload) {
      const { targetId } = payload || {};

      if (!targetId) {
        log('[ActionHandler] No targetId provided for removal');
        return;
      }

      log('[ActionHandler] Removing target:', targetId);

      try {
        const targets = storage.getJSON('odin_targets', {});

        if (!targets[targetId]) {
          log('[ActionHandler] Target not found:', targetId);
          return;
        }

        delete targets[targetId];
        \1
        syncTargetsToStore(targets);

        nexus.emit('TARGET_REMOVED', { targetId });

        log('[ActionHandler] Target removed successfully:', targetId);

        // If Firebase is available, remove from database
        if (ctx.firebase && ctx.firebase.ref) {
          const factionId = ctx.store?.get('auth.factionId', null);
          if (factionId) {
            try {
              await ctx.firebase.ref(`factions/${factionId}/targets/${targetId}`).remove();
              log('[ActionHandler] Target removal synced to Firebase');
            } catch (e) {
              log('[ActionHandler] Failed to sync target removal to Firebase:', e.message);
            }
          }
        }

      } catch (error) {
        log('[ActionHandler] Error removing target:', error.message);
        nexus.emit('TARGET_REMOVE_ERROR', { targetId, error: error.message });
      }
    }

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[ActionHandler] Initializing v' + ACTION_VERSION);

      // Register event handlers
      nexus.on('ADD_TARGET', handleAddTarget);
      nexus.on('CLAIM_TARGET', handleClaimTarget);
      nexus.on('RELEASE_CLAIM', handleReleaseClaim);
      nexus.on('REMOVE_TARGET', handleRemoveTarget);

      log('[ActionHandler] Ready - Event handlers registered');
    }

    function destroy() {
      log('[ActionHandler] Destroying...');
      // Event handlers will be automatically cleaned up by nexus
    }

    return {
      id: 'action-handler',
      init,
      destroy
    };
  });
})();
