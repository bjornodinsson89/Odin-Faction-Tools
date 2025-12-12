// multiplayer-sync.js
// Real-time Multiplayer Coordination Module
// Version: 4.0.0 - Complete implementation with Firestore sync

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function MultiplayerSyncModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const firebase = ctx.firebase || { getFirestore: () => null, getRTDB: () => null };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const VERSION = '4.0.0';

    // ============================================
    // STATE
    // ============================================
    let firestore = null;
    let rtdb = null;
    let userId = null;
    let userFaction = null;
    let unsubscribers = [];
    let presenceRef = null;
    let presenceInterval = null;

    // Sync state
    let activeClaims = new Map();
    let factionNotes = [];
    let chainWatchers = [];
    let onlineMembers = new Map();
    let activityFeed = [];

    // ============================================
    // EVENTS
    // ============================================
    const EVENTS = {
      MULTIPLAYER_READY: 'MULTIPLAYER_READY',
      CLAIM_UPDATED: 'CLAIM_UPDATED',
      CLAIM_CONFLICT: 'CLAIM_CONFLICT',
      NOTE_ADDED: 'NOTE_ADDED',
      NOTE_UPDATED: 'NOTE_UPDATED',
      NOTE_DELETED: 'NOTE_DELETED',
      WATCHER_JOINED: 'WATCHER_JOINED',
      WATCHER_LEFT: 'WATCHER_LEFT',
      MEMBER_ONLINE: 'MEMBER_ONLINE',
      MEMBER_OFFLINE: 'MEMBER_OFFLINE',
      ACTIVITY_LOGGED: 'ACTIVITY_LOGGED',
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
      log('[MultiplayerSync] Initializing v' + VERSION);

      firestore = firebase.getFirestore?.();
      rtdb = firebase.getRTDB?.();

      if (!firestore) {
        error('[MultiplayerSync] Firestore not available');
        return;
      }

      userId = ctx.userId;
      userFaction = ctx.userFaction;

      if (!userId || !userFaction) {
        error('[MultiplayerSync] User ID or Faction not set');
        return;
      }

      // Start real-time listeners
      startClaimsSync();
      startNotesSync();
      startWatchersSync();
      startPresenceSync();
      startActivitySync();

      nexus.emit(EVENTS.MULTIPLAYER_READY, { version: VERSION });
      log('[MultiplayerSync] Ready');
    }

    function destroy() {
      log('[MultiplayerSync] Destroying...');

      // Unsubscribe from all Firestore listeners
      unsubscribers.forEach(unsub => unsub());
      unsubscribers = [];

      // Disconnect presence
      disconnectPresence();

      // Clear intervals
      if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
      }

      log('[MultiplayerSync] Destroyed');
    }

    // ============================================
    // CLAIMS SYNC
    // ============================================
    function startClaimsSync() {
      const claimsRef = firestore.collection('claims')
        .where('factionId', '==', userFaction)
        .where('status', '==', 'active');

      const unsubscribe = claimsRef.onSnapshot(
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const claimData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === 'added' || change.type === 'modified') {
              const existing = activeClaims.get(claimData.targetId);

              // Check for conflicts
              if (existing && existing.attackerId !== claimData.attackerId) {
                nexus.emit(EVENTS.CLAIM_CONFLICT, {
                  targetId: claimData.targetId,
                  existing,
                  incoming: claimData
                });
              }

              activeClaims.set(claimData.targetId, claimData);
              nexus.emit(EVENTS.CLAIM_UPDATED, claimData);
            } else if (change.type === 'removed') {
              activeClaims.delete(claimData.targetId);
              nexus.emit(EVENTS.CLAIM_UPDATED, { ...claimData, status: 'released' });
            }
          });
        },
        (err) => {
          error('[MultiplayerSync] Claims sync error:', err);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    async function makeClaim(targetId, targetName) {
      try {
        // Check for existing claim
        const existing = activeClaims.get(targetId);
        if (existing && existing.attackerId !== userId) {
          return { 
            success: false, 
            reason: 'already_claimed', 
            claimedBy: existing.attackerName 
          };
        }

        const claimData = {
          targetId: String(targetId),
          targetName,
          attackerId: userId,
          attackerName: ctx.userName || 'Unknown',
          factionId: userFaction,
          status: 'active',
          claimedAt: firestore.FieldValue.serverTimestamp(),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        };

        await firestore.collection('claims').add(claimData);

        // Log activity
        logActivity('claim_made', { targetId, targetName });

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Make claim failed:', err);
        return { success: false, reason: 'error', error: err.message };
      }
    }

    async function releaseClaim(targetId) {
      try {
        const claim = activeClaims.get(targetId);
        if (!claim) {
          return { success: false, reason: 'not_found' };
        }

        if (claim.attackerId !== userId) {
          return { success: false, reason: 'not_owner' };
        }

        await firestore.collection('claims').doc(claim.id).delete();

        // Log activity
        logActivity('claim_released', { targetId });

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Release claim failed:', err);
        return { success: false, reason: 'error', error: err.message };
      }
    }

    function getClaim(targetId) {
      return activeClaims.get(targetId) || null;
    }

    function getActiveClaims() {
      return Array.from(activeClaims.values());
    }

    function getMyClaims() {
      return Array.from(activeClaims.values()).filter(c => c.attackerId === userId);
    }

    // ============================================
    // NOTES SYNC
    // ============================================
    function startNotesSync() {
      const notesRef = firestore.collectionGroup('notes')
        .where('factionId', '==', userFaction)
        .orderBy('createdAt', 'desc')
        .limit(100);

      const unsubscribe = notesRef.onSnapshot(
        (snapshot) => {
          factionNotes = [];

          snapshot.forEach((doc) => {
            factionNotes.push({ id: doc.id, ...doc.data() });
          });

          snapshot.docChanges().forEach((change) => {
            const noteData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === 'added') {
              nexus.emit(EVENTS.NOTE_ADDED, noteData);
            } else if (change.type === 'modified') {
              nexus.emit(EVENTS.NOTE_UPDATED, noteData);
            } else if (change.type === 'removed') {
              nexus.emit(EVENTS.NOTE_DELETED, noteData);
            }
          });
        },
        (err) => {
          error('[MultiplayerSync] Notes sync error:', err);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    async function addNote(noteData) {
      try {
        const note = {
          ...noteData,
          factionId: userFaction,
          authorId: userId,
          authorName: ctx.userName || 'Unknown',
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        };

        await firestore.collection('factions')
          .doc(String(userFaction))
          .collection('notes')
          .add(note);

        // Log activity
        logActivity('note_added', { title: noteData.title });

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Add note failed:', err);
        return { success: false, error: err.message };
      }
    }

    async function updateNote(noteId, updates) {
      try {
        await firestore.collection('factions')
          .doc(String(userFaction))
          .collection('notes')
          .doc(noteId)
          .update({
            ...updates,
            updatedAt: firestore.FieldValue.serverTimestamp(),
          });

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Update note failed:', err);
        return { success: false, error: err.message };
      }
    }

    async function deleteNote(noteId) {
      try {
        await firestore.collection('factions')
          .doc(String(userFaction))
          .collection('notes')
          .doc(noteId)
          .delete();

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Delete note failed:', err);
        return { success: false, error: err.message };
      }
    }

    function getNotes(category = null) {
      if (!category) return [...factionNotes];
      return factionNotes.filter(n => n.category === category);
    }

    // ============================================
    // CHAIN WATCHERS SYNC
    // ============================================
    function startWatchersSync() {
      const watchersRef = firestore.collection('chainWatchers')
        .where('factionId', '==', userFaction)
        .where('isActive', '==', true);

      const unsubscribe = watchersRef.onSnapshot(
        (snapshot) => {
          chainWatchers = [];

          snapshot.forEach((doc) => {
            chainWatchers.push({ id: doc.id, ...doc.data() });
          });

          snapshot.docChanges().forEach((change) => {
            const watcherData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === 'added') {
              nexus.emit(EVENTS.WATCHER_JOINED, watcherData);
            } else if (change.type === 'removed') {
              nexus.emit(EVENTS.WATCHER_LEFT, watcherData);
            }
          });
        },
        (err) => {
          error('[MultiplayerSync] Watchers sync error:', err);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    async function joinChainWatch(shiftStart, shiftEnd) {
      try {
        const watcherData = {
          playerId: userId,
          playerName: ctx.userName || 'Unknown',
          factionId: userFaction,
          shiftStart: new Date(shiftStart),
          shiftEnd: new Date(shiftEnd),
          isActive: true,
          joinedAt: firestore.FieldValue.serverTimestamp(),
        };

        await firestore.collection('chainWatchers').add(watcherData);

        // Log activity
        logActivity('watcher_joined', { shiftStart, shiftEnd });

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Join chain watch failed:', err);
        return { success: false, error: err.message };
      }
    }

    async function leaveChainWatch() {
      try {
        const myWatch = chainWatchers.find(w => w.playerId === userId);
        if (!myWatch) {
          return { success: false, reason: 'not_watching' };
        }

        await firestore.collection('chainWatchers').doc(myWatch.id).delete();

        // Log activity
        logActivity('watcher_left', {});

        return { success: true };
      } catch (err) {
        error('[MultiplayerSync] Leave chain watch failed:', err);
        return { success: false, error: err.message };
      }
    }

    function getChainWatchers() {
      return [...chainWatchers];
    }

    function isWatching() {
      return chainWatchers.some(w => w.playerId === userId);
    }

    // ============================================
    // PRESENCE SYNC
    // ============================================
    function startPresenceSync() {
      const presenceRef = firestore.collection('presence')
        .where('factionId', '==', userFaction)
        .where('online', '==', true);

      const unsubscribe = presenceRef.onSnapshot(
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const presenceData = { id: change.doc.id, ...change.doc.data() };

            if (change.type === 'added' || change.type === 'modified') {
              onlineMembers.set(presenceData.playerId, presenceData);
              nexus.emit(EVENTS.MEMBER_ONLINE, presenceData);
            } else if (change.type === 'removed') {
              onlineMembers.delete(presenceData.playerId);
              nexus.emit(EVENTS.MEMBER_OFFLINE, presenceData);
            }
          });
        },
        (err) => {
          error('[MultiplayerSync] Presence sync error:', err);
        }
      );

      unsubscribers.push(unsubscribe);

      // Set own presence
      connectPresence();

      // Update presence heartbeat every 30 seconds
      presenceInterval = setInterval(() => {
        updatePresence();
      }, 30000);
    }

    async function connectPresence() {
      try {
        const presenceData = {
          playerId: userId,
          playerName: ctx.userName || 'Unknown',
          factionId: userFaction,
          online: true,
          lastSeen: firestore.FieldValue.serverTimestamp(),
        };

        presenceRef = await firestore.collection('presence').doc(`user_${userId}`).set(presenceData);
      } catch (err) {
        error('[MultiplayerSync] Connect presence failed:', err);
      }
    }

    async function updatePresence() {
      try {
        await firestore.collection('presence').doc(`user_${userId}`).update({
          lastSeen: firestore.FieldValue.serverTimestamp(),
        });
      } catch (err) {
        error('[MultiplayerSync] Update presence failed:', err);
      }
    }

    async function disconnectPresence() {
      try {
        await firestore.collection('presence').doc(`user_${userId}`).delete();
      } catch (err) {
        error('[MultiplayerSync] Disconnect presence failed:', err);
      }
    }

    function getOnlineMembers() {
      return Array.from(onlineMembers.values());
    }

    // ============================================
    // ACTIVITY FEED SYNC
    // ============================================
    function startActivitySync() {
      const activityRef = firestore.collection('activityLog')
        .where('factionId', '==', userFaction)
        .orderBy('timestamp', 'desc')
        .limit(50);

      const unsubscribe = activityRef.onSnapshot(
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const activityData = { id: change.doc.id, ...change.doc.data() };
              activityFeed.unshift(activityData);

              // Keep only last 50 activities
              if (activityFeed.length > 50) {
                activityFeed = activityFeed.slice(0, 50);
              }

              nexus.emit(EVENTS.ACTIVITY_LOGGED, activityData);
            }
          });
        },
        (err) => {
          error('[MultiplayerSync] Activity sync error:', err);
        }
      );

      unsubscribers.push(unsubscribe);
    }

    async function logActivity(type, data) {
      try {
        const activity = {
          type,
          playerId: userId,
          playerName: ctx.userName || 'Unknown',
          factionId: userFaction,
          data,
          timestamp: firestore.FieldValue.serverTimestamp(),
        };

        await firestore.collection('activityLog').add(activity);
      } catch (err) {
        error('[MultiplayerSync] Log activity failed:', err);
      }
    }

    function getActivityFeed() {
      return [...activityFeed];
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const API = {
      version: VERSION,
      EVENTS,

      // Claims
      makeClaim,
      releaseClaim,
      getClaim,
      getActiveClaims,
      getMyClaims,

      // Notes
      addNote,
      updateNote,
      deleteNote,
      getNotes,

      // Chain Watchers
      joinChainWatch,
      leaveChainWatch,
      getChainWatchers,
      isWatching,

      // Presence
      getOnlineMembers,

      // Activity
      logActivity,
      getActivityFeed,
    };

    // Expose globally
    window.MultiplayerSync = API;

    return { id: 'multiplayer-sync', init, destroy };
  });
})();
