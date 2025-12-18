/**
 * Odin Tools - Firebase Service Module (FIXED VERSION)
 * Complete Firebase Realtime Database and Firestore operations
 * Version: 4.2.0
 * Author: BjornOdinsson89
 * 
 * FIXED: Added input validation
 * FIXED: Prevent orphaned user documents
 * FIXED: Better error handling
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinFirebaseServiceModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {}, get: () => null, set: () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const SERVICE_VERSION = '4.2.0';

    // ============================================
    // FIREBASE CONFIGURATION
    // ============================================
    const FIREBASE_CONFIG = ctx.firebaseConfig || {
      apiKey: "AIzaSyAXIP665pJj4g9L9i-G-XVBrcJ0eU5V4uw",
      authDomain: "torn-war-room.firebaseapp.com",
      databaseURL: "https://torn-war-room-default-rtdb.firebaseio.com",
      projectId: "torn-war-room",
      storageBucket: "torn-war-room.firebasestorage.app",
      messagingSenderId: "559747349324",
      appId: "1:559747349324:web:ec1c7d119e5fd50443ade9"
    };

    // ============================================
    // VALIDATION SCHEMAS
    // ============================================
    const SCHEMAS = {
      claim: {
        required: ['claimedBy', 'claimedAt', 'type'],
        validators: {
          claimedBy: (v) => typeof v === 'string' && v.length > 0 && v.length <= 50,
          claimedAt: (v) => typeof v === 'number' && v > 0,
          type: (v) => ['attack', 'medDeal', 'farm', 'dib'].includes(v),
          targetName: (v) => !v || (typeof v === 'string' && v.length <= 50),
          notes: (v) => !v || (typeof v === 'string' && v.length <= 500)
        }
      },
      target: {
        required: ['addedBy', 'addedAt'],
        validators: {
          addedBy: (v) => typeof v === 'string' && v.length > 0,
          addedAt: (v) => typeof v === 'number' && v > 0,
          targetName: (v) => !v || (typeof v === 'string' && v.length <= 50),
          level: (v) => !v || (typeof v === 'number' && v >= 1 && v <= 100),
          priority: (v) => !v || ['low', 'medium', 'high', 'critical'].includes(v),
          notes: (v) => !v || (typeof v === 'string' && v.length <= 1000)
        }
      },
      presence: {
        required: ['status', 'lastUpdated'],
        validators: {
          status: (v) => ['online', 'away', 'busy', 'offline'].includes(v),
          lastUpdated: (v) => typeof v === 'number' && v > 0,
          statusDescription: (v) => !v || (typeof v === 'string' && v.length <= 100)
        }
      },
      note: {
        required: ['content', 'author', 'updatedAt'],
        validators: {
          content: (v) => typeof v === 'string' && v.length <= 2000,
          author: (v) => typeof v === 'string' && v.length > 0,
          updatedAt: (v) => typeof v === 'number' && v > 0
        }
      }
    };

    function validate(data, schemaName) {
      const schema = SCHEMAS[schemaName];
      if (!schema) return { valid: true };

      const errors = [];

      // Check required fields
      for (const field of schema.required) {
        if (data[field] === undefined || data[field] === null) {
          errors.push(`Missing required field: ${field}`);
        }
      }

      // Run validators
      for (const [field, validator] of Object.entries(schema.validators)) {
        if (data[field] !== undefined && !validator(data[field])) {
          errors.push(`Invalid value for field: ${field}`);
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };
    }

    // ============================================
    // STATE
    // ============================================
    let firebaseApp = null;
    let rtdb = null;
    let firestore = null;
    let auth = null;
    let currentUser = null;
    let currentFaction = null;
    let firebaseUid = null;
    let connected = false;
    const listeners = new Map();
    const subscriptions = new Map();

    // ============================================
    // DIAGNOSTICS LOGGING
    // ============================================
    if (!window.__ODIN_NET_LOG__) window.__ODIN_NET_LOG__ = { api: [], db: [] };

    function logDbOp(entry) {
      try {
        const netLog = window.__ODIN_NET_LOG__;
        if (!Array.isArray(netLog.db)) netLog.db = [];
        netLog.db.unshift(entry);
        if (netLog.db.length > 300) netLog.db.length = 300;
      } catch (_) {}
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    async function initialize() {
      try {
        if (typeof firebase === 'undefined') {
          throw new Error('Firebase SDK not loaded');
        }

        // Initialize Firebase app
        if (!firebase.apps || firebase.apps.length === 0) {
          firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          firebaseApp = firebase.apps[0];
        }

        // Initialize services
        rtdb = firebase.database();
        firestore = firebase.firestore();
        auth = firebase.auth();

        // Monitor connection status
        const connectedRef = rtdb.ref('.info/connected');
        connectedRef.on('value', (snapshot) => {
          connected = snapshot.val() === true;
          emit('connectionChange', connected);
          log('[Firebase] Connection status:', connected ? 'connected' : 'disconnected');
        });

        log('[Firebase] Initialized successfully');
        return true;
      } catch (e) {
        error('[Firebase] Initialization error:', e);
        throw e;
      }
    }

    // ============================================
    // EVENT EMITTER
    // ============================================
    function emit(event, data) {
      const callbacks = listeners.get(event) || [];
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          error('[Firebase] Event callback error:', e);
        }
      });
      nexus.emit('FIREBASE_' + event.toUpperCase(), data);
    }

    function on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event).push(callback);
    }

    function off(event, callback) {
      if (!listeners.has(event)) return;
      const callbacks = listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }

    // ============================================
    // USER CONTEXT
    // ============================================
    function setUserContext(userId, factionId) {
      currentUser = userId;
      currentFaction = factionId;
      log('[Firebase] User context set:', { userId, factionId });
      ensureAccessArtifacts();
    }

    function getUserContext() {
      return { userId: currentUser, factionId: currentFaction };
    }

    
    // ============================================
    // IDENTITY & ACCESS TOKENS
    // ============================================
    let currentApiKey = null;
    let currentReclaimKey = null;

    async function sha256Hex(str) {
      const enc = new TextEncoder().encode(String(str));
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function ensureAccessArtifacts() {
      try {
        if (!rtdb || !auth || !auth.currentUser) return;
        if (!currentFaction || !currentUser || !currentApiKey) return;

        const uid = auth.currentUser.uid;
        const tornUserId = Number(currentUser);
        const factionId = String(currentFaction);
        const apiSnippet = String(currentApiKey).slice(0, 8);

        const token = await sha256Hex(`${factionId}:${apiSnippet}`);
        const reclaimKey = await sha256Hex(`odin:${String(currentApiKey)}`);

        currentReclaimKey = reclaimKey;

        const userRef = rtdb.ref(`users/${uid}`);
        await userRef.update({
          tornUserId,
          factionId,
          reclaimKey,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        await userRef.child(`tokens/${factionId}`).set(token);

        await rtdb.ref(`reclaimIndex/${reclaimKey}`).set({
          uid,
          tornUserId,
          factionId,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        const pendingRef = rtdb.ref(`factions/${factionId}/pendingTokens/${tornUserId}`);
        await pendingRef.set({
          token,
          uid,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });

        await reconcileOrphanedAnonymousAccount(uid, reclaimKey, factionId);
      } catch (e) {
        error('[Firebase] ensureAccessArtifacts error:', e);
      }
    }

    async function reconcileOrphanedAnonymousAccount(newUid, reclaimKey, factionId) {
      try {
        if (!rtdb) return;

        const snap = await rtdb.ref(`reclaimIndex/${reclaimKey}/uid`).once('value');
        const oldUid = snap.val();

        if (!oldUid || oldUid === newUid) return;

        await migrateUidInFaction(oldUid, newUid, factionId);

        await rtdb.ref(`reclaimIndex/${reclaimKey}`).update({
          uid: newUid,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (e) {
        error('[Firebase] reconcileOrphanedAnonymousAccount error:', e);
      }
    }

    async function migrateUidInFaction(oldUid, newUid, factionId) {
      if (!rtdb) return;

      const updates = {};

      const claimsSnap = await rtdb.ref(`factions/${factionId}/claims`).once('value');
      claimsSnap.forEach(child => {
        const v = child.val();
        if (v && v.claimedBy === oldUid) {
          updates[`factions/${factionId}/claims/${child.key}/claimedBy`] = newUid;
        }
      });

      const notesSnap = await rtdb.ref(`factions/${factionId}/notes`).once('value');
      notesSnap.forEach(child => {
        const v = child.val();
        if (v && v.author === oldUid) {
          updates[`factions/${factionId}/notes/${child.key}/author`] = newUid;
        }
      });

      if (Object.keys(updates).length > 0) {
        await rtdb.ref().update(updates);
      }
    }
// ============================================
    // AUTHENTICATION (FIXED - Prevent orphans)
    // ============================================
    async function signInWithTornApiKey(apiKey, tornUserId) {
      try {
        if (!auth) throw new Error('Firebase Auth not initialized');

        currentApiKey = apiKey;

        // Check if we have a saved UID for this Torn user
        const savedUidKey = `firebase_uid_${tornUserId}`;
        let savedUid = storage.get(savedUidKey);

        // Try to use existing anonymous session or create new one
        let credential;
        
        if (auth.currentUser) {
          // Already signed in
          credential = { user: auth.currentUser };
          log('[Firebase] Using existing auth session');
        } else {
          // Sign in anonymously
          credential = await auth.signInAnonymously();
          log('[Firebase] Created new anonymous session');
        }

        if (credential.user) {
          firebaseUid = credential.user.uid;
          
          // Save UID mapping to prevent orphans
          storage.set(savedUidKey, firebaseUid);
          
          // Update user mapping in Firestore
          await firestore.collection('users').doc(firebaseUid).set({
            tornUserId: tornUserId,
            linkedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          ensureAccessArtifacts();

          // Also update the members collection for faction lookup
          await firestore.collection('members').doc(firebaseUid).set({
            tornUserId: tornUserId,
            factionId: currentFaction,
            lastSeen: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        currentUser = tornUserId;
        emit('authStateChanged', { user: credential.user, tornUserId });
        return credential.user;
      } catch (e) {
        error('[Firebase] Sign in error:', e);
        throw e;
      }
    });
        throw e;
      }
    }

    async function signOut() {
      try {
        if (auth) {
          await auth.signOut();
        }
        currentUser = null;
        firebaseUid = null;
        emit('authStateChanged', { user: null });
      } catch (e) {
        error('[Firebase] Sign out error:', e);
      }
    }

    // ============================================
    // REALTIME DATABASE - FREKI AI
    // ============================================
    function generateFrekiBucket(fightData) {
      const attackerLevel = getLevelRange(fightData.attackerLevel || 1);
      const defenderLevel = getLevelRange(fightData.defenderLevel || 1);
      const chainRange = getChainRange(fightData.chain || 0);
      const warStatus = fightData.inWar ? 'WAR' : 'PEACE';
      return `L${attackerLevel}__L${defenderLevel}__C${chainRange}__${warStatus}`;
    }

    function getLevelRange(level) {
      const ranges = [
        [1, 5], [6, 10], [11, 15], [16, 20], [21, 25],
        [26, 30], [31, 35], [36, 40], [41, 45], [46, 50],
        [51, 55], [56, 60], [61, 65], [66, 70], [71, 75],
        [76, 80], [81, 85], [86, 90], [91, 95], [96, 100]
      ];

      for (const [min, max] of ranges) {
        if (level >= min && level <= max) {
          return `${min}-${max}`;
        }
      }
      return '100+';
    }

    function getChainRange(chain) {
      if (chain === 0) return '0';
      if (chain <= 9) return '1-9';
      if (chain <= 49) return '10-49';
      if (chain <= 99) return '50-99';
      if (chain <= 249) return '100-249';
      if (chain <= 499) return '250-499';
      return '500+';
    }

    async function submitFightOutcome(fightData) {
      if (!rtdb) throw new Error('RTDB not initialized');

      // Validate input
      if (!fightData || typeof fightData !== 'object') {
        throw new Error('Invalid fight data');
      }
      if (!['win', 'loss', 'escape', 'stalemate'].includes(fightData.result)) {
        throw new Error('Invalid fight result');
      }

      const bucket = generateFrekiBucket(fightData);
      const path = `freki/community/${bucket}`;
      const ref = rtdb.ref(path);

      const startTime = performance.now();
      const logEntry = { ts: Date.now(), db: 'rtdb', op: 'transaction', path, ok: false, ms: 0 };

      try {
        await ref.transaction((current) => {
          if (!current) {
            return {
              fights: 1,
              wins: fightData.result === 'win' ? 1 : 0,
              losses: fightData.result === 'loss' ? 1 : 0,
              escapes: fightData.result === 'escape' ? 1 : 0,
              totalRespect: fightData.respect || 0,
              totalEnergy: fightData.energy || 0,
              fairFightSum: fightData.fairFight || 0,
              lastUpdated: firebase.database.ServerValue.TIMESTAMP
            };
          }

          return {
            fights: (current.fights || 0) + 1,
            wins: (current.wins || 0) + (fightData.result === 'win' ? 1 : 0),
            losses: (current.losses || 0) + (fightData.result === 'loss' ? 1 : 0),
            escapes: (current.escapes || 0) + (fightData.result === 'escape' ? 1 : 0),
            totalRespect: (current.totalRespect || 0) + (fightData.respect || 0),
            totalEnergy: (current.totalEnergy || 0) + (fightData.energy || 0),
            fairFightSum: (current.fairFightSum || 0) + (fightData.fairFight || 0),
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
          };
        });

        logEntry.ok = true;
        logEntry.ms = Math.round(performance.now() - startTime);
        logDbOp(logEntry);

        return true;
      } catch (e) {
        logEntry.ok = false;
        logEntry.ms = Math.round(performance.now() - startTime);
        logEntry.error = e.message;
        logDbOp(logEntry);
        throw e;
      }
    }

    async function getFrekiPrediction(attackerLevel, defenderLevel, chain = 0, inWar = false) {
      if (!rtdb) throw new Error('RTDB not initialized');

      const bucket = generateFrekiBucket({
        attackerLevel,
        defenderLevel,
        chain,
        inWar
      });

      const path = `freki/community/${bucket}`;
      const ref = rtdb.ref(path);

      try {
        const snapshot = await ref.once('value');
        const data = snapshot.val();

        if (!data || !data.fights) {
          return { prediction: 0.5, confidence: 0, source: 'no_data' };
        }

        const winRate = data.wins / data.fights;
        const confidence = Math.min(1, data.fights / 100);
        const avgRespect = data.totalRespect / data.fights;
        const avgFF = data.fairFightSum / data.fights;

        return {
          prediction: winRate,
          confidence,
          sampleSize: data.fights,
          avgRespect,
          avgFF,
          source: 'community'
        };
      } catch (e) {
        error('[Firebase] Freki prediction error:', e);
        return { prediction: 0.5, confidence: 0, source: 'error' };
      }
    }

    async function submitTrainingData(trainingData) {
      if (!rtdb) throw new Error('RTDB not initialized');
      if (!currentUser) throw new Error('Not authenticated');

      const ref = rtdb.ref('freki/training').push();
      
      await ref.set({
        ...trainingData,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        submittedBy: firebaseUid || currentUser
      });

      return ref.key;
    }

    async function getNeuralNetworkModel() {
      if (!rtdb) throw new Error('RTDB not initialized');

      try {
        const snapshot = await rtdb.ref('freki/models/current').once('value');
        return snapshot.val();
      } catch (e) {
        error('[Firebase] Get neural network model error:', e);
        return null;
      }
    }

    // ============================================
    // PRESENCE
    // ============================================
    async function updatePresence(status, description = null, until = null) {
      if (!rtdb || !currentFaction || !currentUser) {
        throw new Error('No faction context');
      }

      const presenceData = {
        status,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP,
        playerName: ctx.userName || currentUser
      };

      if (description) presenceData.statusDescription = description;
      if (until) presenceData.statusUntil = until;

      // Validate
      const validation = validate(presenceData, 'presence');
      if (!validation.valid) {
        throw new Error('Invalid presence data: ' + validation.errors.join(', '));
      }

      const ref = rtdb.ref(`factions/${currentFaction}/presence/${currentUser}`);
      await ref.set(presenceData);

      return true;
    }

    function watchPresence(callback) {
      if (!rtdb || !currentFaction) return () => {};

      const ref = rtdb.ref(`factions/${currentFaction}/presence`);
      
      const listener = ref.on('value', (snapshot) => {
        const presence = {};
        snapshot.forEach((child) => {
          presence[child.key] = child.val();
        });
        callback(presence);
      });

      return () => ref.off('value', listener);
    }

    // ============================================
    // CLAIMS (with validation)
    // ============================================
    async function saveClaim(targetId, claimData) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const fullData = {
        ...claimData,
        claimedBy: currentUser,
        claimedAt: Date.now()
      };

      // Validate
      const validation = validate(fullData, 'claim');
      if (!validation.valid) {
        throw new Error('Invalid claim data: ' + validation.errors.join(', '));
      }

      const ref = rtdb.ref(`factions/${currentFaction}/claims/${targetId}`);
      await ref.set(fullData);
      
      return true;
    }

    async function removeClaim(targetId) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const ref = rtdb.ref(`factions/${currentFaction}/claims/${targetId}`);
      await ref.remove();
      
      return true;
    }

    function watchClaims(callback) {
      if (!rtdb || !currentFaction) return () => {};

      const ref = rtdb.ref(`factions/${currentFaction}/claims`);
      
      const listener = ref.on('value', (snapshot) => {
        const claims = {};
        snapshot.forEach((child) => {
          claims[child.key] = child.val();
        });
        callback(claims);
      });

      return () => ref.off('value', listener);
    }

    // ============================================
    // DIBS
    // ============================================
    async function saveDib(targetId, dibData) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const fullData = {
        ...dibData,
        type: 'dib',
        claimedBy: currentUser,
        claimedAt: Date.now()
      };

      const validation = validate(fullData, 'claim');
      if (!validation.valid) {
        throw new Error('Invalid dib data: ' + validation.errors.join(', '));
      }

      const ref = rtdb.ref(`factions/${currentFaction}/dibs/${targetId}`);
      await ref.set(fullData);
      
      return true;
    }

    async function removeDib(targetId) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const ref = rtdb.ref(`factions/${currentFaction}/dibs/${targetId}`);
      await ref.remove();
      
      return true;
    }

    function watchDibs(callback) {
      if (!rtdb || !currentFaction) return () => {};

      const ref = rtdb.ref(`factions/${currentFaction}/dibs`);
      
      const listener = ref.on('value', (snapshot) => {
        const dibs = {};
        snapshot.forEach((child) => {
          dibs[child.key] = child.val();
        });
        callback(dibs);
      });

      return () => ref.off('value', listener);
    }

    // ============================================
    // MED DEALS
    // ============================================
    async function saveMedDeal(targetId, medDealData) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const fullData = {
        ...medDealData,
        type: 'medDeal',
        claimedBy: currentUser,
        claimedAt: Date.now()
      };

      const validation = validate(fullData, 'claim');
      if (!validation.valid) {
        throw new Error('Invalid med deal data: ' + validation.errors.join(', '));
      }

      const ref = rtdb.ref(`factions/${currentFaction}/medDeals/${targetId}`);
      await ref.set(fullData);
      
      return true;
    }

    async function removeMedDeal(targetId) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const ref = rtdb.ref(`factions/${currentFaction}/medDeals/${targetId}`);
      await ref.remove();
      
      return true;
    }

    function watchMedDeals(callback) {
      if (!rtdb || !currentFaction) return () => {};

      const ref = rtdb.ref(`factions/${currentFaction}/medDeals`);
      
      const listener = ref.on('value', (snapshot) => {
        const medDeals = {};
        snapshot.forEach((child) => {
          medDeals[child.key] = child.val();
        });
        callback(medDeals);
      });

      return () => ref.off('value', listener);
    }

    // ============================================
    // TARGETS (with validation)
    // ============================================
    async function saveTarget(targetId, targetData) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const fullData = {
        ...targetData,
        addedBy: currentUser,
        addedAt: Date.now()
      };

      const validation = validate(fullData, 'target');
      if (!validation.valid) {
        throw new Error('Invalid target data: ' + validation.errors.join(', '));
      }

      const ref = rtdb.ref(`factions/${currentFaction}/targets/${targetId}`);
      await ref.set(fullData);
      
      return true;
    }

    async function getTargets() {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const snapshot = await rtdb.ref(`factions/${currentFaction}/targets`).once('value');
      const targets = {};
      snapshot.forEach((child) => {
        targets[child.key] = child.val();
      });
      return targets;
    }

    async function claimTarget(targetId, claimData) {
      return saveClaim(targetId, { ...claimData, type: 'attack' });
    }

    async function releaseTarget(targetId) {
      return removeClaim(targetId);
    }

    function watchTargets(callback) {
      if (!rtdb || !currentFaction) return () => {};

      const ref = rtdb.ref(`factions/${currentFaction}/targets`);
      
      const listener = ref.on('value', (snapshot) => {
        const targets = {};
        snapshot.forEach((child) => {
          targets[child.key] = child.val();
        });
        callback(targets);
      });

      return () => ref.off('value', listener);
    }

    // ============================================
    // PERSONAL TARGETS
    // ============================================
    async function savePersonalTarget(targetId, targetData) {
      if (!firestore || !firebaseUid) throw new Error('Not authenticated');

      await firestore
        .collection('users')
        .doc(firebaseUid)
        .collection('personalTargets')
        .doc(targetId.toString())
        .set({
          ...targetData,
          addedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

      return true;
    }

    async function getPersonalTargets() {
      if (!firestore || !firebaseUid) throw new Error('Not authenticated');

      const snapshot = await firestore
        .collection('users')
        .doc(firebaseUid)
        .collection('personalTargets')
        .get();

      const targets = {};
      snapshot.forEach(doc => {
        targets[doc.id] = doc.data();
      });
      return targets;
    }

    async function removePersonalTarget(targetId) {
      if (!firestore || !firebaseUid) throw new Error('Not authenticated');

      await firestore
        .collection('users')
        .doc(firebaseUid)
        .collection('personalTargets')
        .doc(targetId.toString())
        .delete();

      return true;
    }

    // ============================================
    // CHAIN STATS
    // ============================================
    async function saveChainHit(hitData) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const ref = rtdb.ref(`factions/${currentFaction}/chainHits`).push();
      await ref.set({
        ...hitData,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        hitBy: currentUser
      });

      return ref.key;
    }

    async function getChainStats() {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const snapshot = await rtdb.ref(`factions/${currentFaction}/chain`).once('value');
      return snapshot.val() || {};
    }

    // ============================================
    // MEMBERS
    // ============================================
    async function saveMember(memberId, memberData) {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const ref = rtdb.ref(`factions/${currentFaction}/members/${memberId}`);
      await ref.set({
        ...memberData,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });

      return true;
    }

    async function getMembers() {
      if (!rtdb || !currentFaction) throw new Error('No faction context');

      const snapshot = await rtdb.ref(`factions/${currentFaction}/members`).once('value');
      const members = {};
      snapshot.forEach((child) => {
        members[child.key] = child.val();
      });
      return members;
    }

    // ============================================
    // WATCHER SCHEDULE
    // ============================================
    async function saveWatcherSchedule(scheduleData) {
      if (!firestore || !currentFaction) throw new Error('No faction context');

      try {
        await firestore
          .collection('factions')
          .doc(currentFaction.toString())
          .collection('watcherSchedule')
          .doc(scheduleData.id || 'current')
          .set({
            ...scheduleData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser
          }, { merge: true });

        return true;
      } catch (e) {
        error('[Firebase] Save watcher schedule error:', e);
        throw e;
      }
    }

    async function getWatcherSchedule() {
      if (!firestore || !currentFaction) throw new Error('No faction context');

      try {
        const snapshot = await firestore
          .collection('factions')
          .doc(currentFaction.toString())
          .collection('watcherSchedule')
          .get();

        const schedule = [];
        snapshot.forEach(doc => {
          schedule.push({
            id: doc.id,
            ...doc.data()
          });
        });

        return schedule;
      } catch (e) {
        error('[Firebase] Get watcher schedule error:', e);
        throw e;
      }
    }

    // ============================================
    // WAR CONFIGURATION
    // ============================================
    async function saveWarConfig(warConfig) {
      if (!firestore || !currentFaction) throw new Error('No faction context');

      try {
        await firestore
          .collection('factions')
          .doc(currentFaction.toString())
          .set({
            warConfig: {
              ...warConfig,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
              updatedBy: currentUser
            }
          }, { merge: true });

        return true;
      } catch (e) {
        error('[Firebase] Save war config error:', e);
        throw e;
      }
    }

    async function getWarConfig() {
      if (!firestore || !currentFaction) throw new Error('No faction context');

      try {
        const doc = await firestore
          .collection('factions')
          .doc(currentFaction.toString())
          .get();

        return doc.exists ? doc.data().warConfig || null : null;
      } catch (e) {
        error('[Firebase] Get war config error:', e);
        return null;
      }
    }

    // ============================================
    // NOTES (with validation)
    // ============================================
    async function saveNote(targetId, noteData) {
      if (!firestore || !currentFaction) throw new Error('No faction context');

      const fullData = {
        ...noteData,
        author: currentUser,
        authorName: ctx.userName || currentUser,
        updatedAt: Date.now()
      };

      const validation = validate(fullData, 'note');
      if (!validation.valid) {
        throw new Error('Invalid note data: ' + validation.errors.join(', '));
      }

      try {
        await firestore
          .collection('factions')
          .doc(currentFaction.toString())
          .collection('notes')
          .doc(targetId.toString())
          .set({
            ...fullData,
            targetId: targetId,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

        return true;
      } catch (e) {
        error('[Firebase] Save note error:', e);
        throw e;
      }
    }

    async function getNotes() {
      if (!firestore || !currentFaction) throw new Error('No faction context');

      try {
        const snapshot = await firestore
          .collection('factions')
          .doc(currentFaction.toString())
          .collection('notes')
          .get();

        const notes = {};
        snapshot.forEach(doc => {
          notes[doc.id] = doc.data();
        });

        return notes;
      } catch (e) {
        error('[Firebase] Get notes error:', e);
        throw e;
      }
    }

    // ============================================
    // CLEANUP
    // ============================================
    function destroy() {
      // Remove all listeners
      if (rtdb) {
        rtdb.ref('.info/connected').off();
      }

      // Clear subscriptions
      subscriptions.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
      subscriptions.clear();
      listeners.clear();

      log('[Firebase] Service destroyed');
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const OdinFirebase = {
      version: SERVICE_VERSION,

      // Initialization
      initialize,
      destroy,

      // Auth
      signInWithTornApiKey,
      signOut,

      // Context
      setUserContext,
      getUserContext,
      isConnected: () => connected,

      // Event handling
      on,
      off,

      // Getters
      getFirestore: () => firestore,
      getRTDB: () => rtdb,
      getAuth: () => auth,

      // Freki AI
      submitFightOutcome,
      getFrekiPrediction,
      submitTrainingData,
      getNeuralNetworkModel,
      generateFrekiBucket,

      // Presence
      updatePresence,
      watchPresence,

      // Claims
      saveClaim,
      removeClaim,
      watchClaims,

      // Dibs
      saveDib,
      removeDib,
      watchDibs,

      // Med Deals
      saveMedDeal,
      removeMedDeal,
      watchMedDeals,

      // Targets
      saveTarget,
      getTargets,
      claimTarget,
      releaseTarget,
      watchTargets,

      // Personal Targets
      savePersonalTarget,
      getPersonalTargets,
      removePersonalTarget,

      // Chain
      saveChainHit,
      getChainStats,

      // Members
      saveMember,
      getMembers,

      // Watcher Schedule
      saveWatcherSchedule,
      getWatcherSchedule,

      // War Config
      saveWarConfig,
      getWarConfig,

      // Notes
      saveNote,
      getNotes,

      // Validation (exposed for testing)
      validate
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[Firebase Service] Initializing v' + SERVICE_VERSION);

      // Auto-initialize if Firebase is available
      if (typeof firebase !== 'undefined') {
        initialize().then(() => {
          log('[Firebase Service] Ready');
        }).catch(e => {
          error('[Firebase Service] Init failed:', e);
        });
      }

      // Expose globally
      window.OdinFirebase = OdinFirebase;
      ctx.firebase = OdinFirebase;

      // Load saved context
      try {
        const settings = storage.getJSON('odin_settings') || {};
        if (settings.userId && settings.factionId) {
          setUserContext(settings.userId, settings.factionId);
        }
      } catch (_) {}

      log('[Firebase Service] Module ready');
    }

    return { id: 'odin-firebase-service', init, destroy };
  });
})();
