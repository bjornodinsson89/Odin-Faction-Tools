/* ============================================================
   FirebaseService (SaaS Auth + Gatekeeper) - Userscript-safe
   - Initializes Firebase compat SDK
   - Calls Gatekeeper Cloud Function authenticateWithTorn
   - Tracks RTDB connectivity and auth state
   - Provides Firestore facade that is OFFLINE-TOLERANT:
       * If Firestore transport is down, reads return null/[] and writes are queued locally
       * Queue flushes automatically when Firestore becomes reachable again
   - Emits Nexus events:
       FIREBASE_CONNECTED / FIREBASE_DISCONNECTED
       FIRESTORE_CONNECTED / FIRESTORE_DISCONNECTED
       AUTH_STATE_CHANGED
       AUTH_SUCCESS / AUTH_ERROR
   ============================================================ */
(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  const firebaseConfig = {
    apiKey: "AIzaSyAXIP665pJj4g9L9i-G-XVBrcJ0eU5V4uw",
    authDomain: "torn-war-room.firebaseapp.com",
    databaseURL: "https://torn-war-room-default-rtdb.firebaseio.com",
    projectId: "torn-war-room",
    storageBucket: "torn-war-room.firebasestorage.app",
    messagingSenderId: "559747349324",
    appId: "1:559747349324:web:ec1c7d119e5fd50443ade9"
  };

  function ensureFirebaseCompat() {
    if (typeof window.firebase === 'undefined' || !window.firebase) {
      throw new Error('Firebase compat SDK not loaded (firebase is undefined)');
    }
    if (typeof window.firebase.initializeApp !== 'function') {
      throw new Error('Firebase compat SDK missing initializeApp()');
    }
  }

  function safeStr(v) {
    return typeof v === 'string' ? v.trim() : '';
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

    function applyFirestoreSettingsOnce(fs, logFn) {
    if (!fs || typeof fs.settings !== 'function') return;
    if (window.__ODIN_FS_INIT__ === true) return;
    try {
      fs.settings({
        // These options are critical for userscript/mobile environments
        experimentalAutoDetectLongPolling: true,
        experimentalForceLongPolling: true,
        useFetchStreams: false,
        ignoreUndefinedProperties: true
      });
      window.__ODIN_FS_INIT__ = true;
      if (logFn) logFn('[Firebase] ✓ Firestore settings applied (userscript-safe)');
    } catch (e) {
      // Settings can only be applied before Firestore is used. If this fails, do not keep retrying.
      window.__ODIN_FS_INIT__ = true;
      if (logFn) logFn('[Firebase] WARNING: Could not apply Firestore settings:', e.message);
    }
  }

window.OdinModules.push(function FirebaseServiceModuleInit(ctx) {
    ctx = ctx || {};
    const nexus = ctx.nexus;
    const store = ctx.store;
    const storage = ctx.storage;
    const log = ctx.log || console.log;

    let app = null;
    let auth = null;
    let db = null;
    let fs = null;
    let fn = null;

    let connected = false;
    let firestoreReady = false;

    let unsubAuth = null;
    let unsubConn = null;

    // Firestore safety / offline queue
    let firestoreSettingsApplied = false;
    let firestoreTestInterval = null;

    // AUTH EVENTS (UI emits; FirebaseService performs auth)
    nexus.on('AUTH_WITH_TORN', async (payload) => {
      const apiKey = (payload && typeof payload === 'object') ? payload.apiKey : payload;
      try {
        await authenticateWithTorn(apiKey);
        nexus.emit('AUTH_WITH_TORN_SUCCESS', { ok: true });
      } catch (e) {
        nexus.emit('AUTH_WITH_TORN_FAILURE', { ok: false, error: (e && e.message) ? e.message : String(e) });
      }
    });

    let flushInProgress = false;

    const FS_QUEUE_KEY = 'firestore.queue.v1';
    const FS_QUEUE_MAX = 500;

    function getQueue() {
      const q = storage?.getJSON ? storage.getJSON(FS_QUEUE_KEY, []) : [];
      return Array.isArray(q) ? q : [];
    }

    function setQueue(q) {
      if (!storage?.setJSON) return;
      storage.setJSON(FS_QUEUE_KEY, Array.isArray(q) ? q : []);
    }

    function enqueueOp(op) {
      const q = getQueue();
      q.push(op);
      // keep bounded
      if (q.length > FS_QUEUE_MAX) q.splice(0, q.length - FS_QUEUE_MAX);
      setQueue(q);
      store?.set?.('firebase.fsQueueSize', q.length);
      nexus?.emit?.('FIRESTORE_QUEUE_UPDATED', { size: q.length });
    }

    async function flushQueue() {
      if (!fs || !firestoreReady) return false;
      if (flushInProgress) return false;
      flushInProgress = true;

      try {
        let q = getQueue();
        if (!q.length) {
          store?.set?.('firebase.fsQueueSize', 0);
          return true;
        }

        // flush sequentially to be gentle on rate limits / avoid bursts
        const remaining = [];
        for (const op of q) {
          try {
            if (!op || !op.t || !op.p) continue;

            if (op.t === 'set') {
              const ref = fs.collection(op.p.c).doc(op.p.id);
              if (op.p.merge) await ref.set(op.p.data || {}, { merge: true });
              else await ref.set(op.p.data || {});
            } else if (op.t === 'update') {
              const ref = fs.collection(op.p.c).doc(op.p.id);
              await ref.update(op.p.data || {});
            } else if (op.t === 'delete') {
              const ref = fs.collection(op.p.c).doc(op.p.id);
              await ref.delete();
            } else {
              // unknown op type, drop it
            }
          } catch (e) {
            // keep it for later
            remaining.push(op);
          }
        }

        setQueue(remaining);
        store?.set?.('firebase.fsQueueSize', remaining.length);
        if (remaining.length !== q.length) {
          nexus?.emit?.('FIRESTORE_QUEUE_FLUSHED', { before: q.length, after: remaining.length });
        }
        return remaining.length === 0;
      } finally {
        flushInProgress = false;
      }
    }

    async function refreshClaims(user) {
      if (!user) {
        store?.set?.('auth.user', null);
        store?.set?.('auth.uid', null);
        store?.set?.('auth.factionId', null);
        store?.set?.('auth.tornId', null);
        store?.set?.('userLevel', null);
        ctx.userLevel = null;
        nexus?.emit?.('AUTH_STATE_CHANGED', { user: null, factionId: null, tornId: null });
        return;
      }

      let tokenResult = null;
      try {
        tokenResult = await user.getIdTokenResult(true);
      } catch (_) {
        tokenResult = null;
      }

      const claims = (tokenResult && tokenResult.claims) ? tokenResult.claims : {};
      const factionId = claims.factionId ? String(claims.factionId) : null;
      const tornId = claims.tornId ? String(claims.tornId) : null;

      store?.set?.('auth.user', { uid: user.uid, email: user.email || null });
      store?.set?.('auth.uid', user.uid);
      store?.set?.('auth.factionId', factionId);
      store?.set?.('auth.tornId', tornId);

      // Auth-to-Store Bridge: best-effort user doc read (non-fatal if Firestore is down)
      if (fs && user.uid) {
        try {
          const userDocRef = fs.collection('users').doc(user.uid);
          const userDoc = await userDocRef.get();
          if (userDoc.exists) {
            const userData = userDoc.data() || {};
            const userLevel = userData.level ? userData.level : null;
            if (userLevel) {
              store?.set?.('userLevel', userLevel);
              ctx.userLevel = userLevel;
              log(`[Firebase] User level loaded: ${userLevel}`);
            }
          }
        } catch (e) {
          // Keep app functional even if Firestore is down
          log('[Firebase] User doc read failed (non-fatal):', e && e.message ? e.message : e);
        }
      }

      nexus?.emit?.('AUTH_STATE_CHANGED', { user: { uid: user.uid }, factionId, tornId });
    }

    function setupConnectivity() {
      if (!db) return;
      try {
        const connRef = db.ref('.info/connected');
        const handler = (snap) => {
          const isConn = !!snap.val();
          if (isConn === connected) return;
          connected = isConn;
          store?.set?.('firebase.connected', connected);
          nexus?.emit?.(connected ? 'FIREBASE_CONNECTED' : 'FIREBASE_DISCONNECTED', { connected });
        };
        connRef.on('value', handler);
        unsubConn = handler;
      } catch (e) {
        log('[Firebase] Connectivity monitor failed:', e);
      }
    }

    function teardownConnectivity() {
      if (!db || !unsubConn) return;
      try { db.ref('.info/connected').off('value', unsubConn); } catch (_) {}
      unsubConn = null;
    }

    function teardownFirestoreMonitoring() {
      if (firestoreTestInterval) {
        clearInterval(firestoreTestInterval);
        firestoreTestInterval = null;
      }
    }

    async function testFirestoreConnection() {
      if (!fs) return false;
      try {
        // lightweight read
        const testRef = fs.collection('_connection_test').doc('ping');
        await testRef.get();

        if (!firestoreReady) {
          firestoreReady = true;
          store?.set?.('firebase.firestoreReady', true);
          nexus?.emit?.('FIRESTORE_CONNECTED', { ready: true });
          log('[Firebase] Firestore connection established');
        }

        // once it's reachable, try flushing queued writes
        await flushQueue();
        return true;
      } catch (e) {
        if (firestoreReady) {
          firestoreReady = false;
          store?.set?.('firebase.firestoreReady', false);
          nexus?.emit?.('FIRESTORE_DISCONNECTED', { error: e && e.message ? e.message : String(e) });
          log('[Firebase] Firestore connection lost:', e && e.message ? e.message : e);
        }
        return false;
      }
    }

    function setupFirestoreMonitoring() {
      if (!fs) return;
      teardownFirestoreMonitoring();
      // immediate test (best-effort)
      testFirestoreConnection();
      // periodic test (30s)
      firestoreTestInterval = setInterval(() => { testFirestoreConnection(); }, 30000);
    }

    function initFirebase() {
      try {
        ensureFirebaseCompat();
      } catch (e) {
        log('[Firebase] Firebase SDK NOT LOADED (offline mode):', e.message);
        store?.set?.('firebase.initialized', false);
        store?.set?.('firebase.available', false);
        nexus?.emit?.('FIREBASE_UNAVAILABLE', { error: e.message });
        return false;
      }

      try {
        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          app = window.firebase.initializeApp(firebaseConfig);
          log('[Firebase] ✓ Firebase app initialized');
        } else {
          app = window.firebase.app();
          log('[Firebase] ✓ Using existing Firebase app');
        }

        auth = window.firebase.auth();
        db = window.firebase.database();
      } catch (e) {
        log('[Firebase] Firebase initialization failed (offline mode):', e.message);
        store?.set?.('firebase.initialized', false);
        store?.set?.('firebase.available', false);
        nexus?.emit?.('FIREBASE_UNAVAILABLE', { error: e.message });
        return false;
      }

      // Firestore init (userscript safe)
      try {
        if (typeof window.firebase.firestore === 'function') {
          fs = window.firebase.firestore();

          // Apply settings ONCE. Re-applying triggers "overriding original host" warnings.
          if (!firestoreSettingsApplied) {
            firestoreSettingsApplied = true;
            applyFirestoreSettingsOnce(fs, log);
          }

          setupFirestoreMonitoring();
        } else {
          fs = null;
          log('[Firebase] Firestore SDK not loaded');
        }
      } catch (e) {
        fs = null;
        log('[Firebase] Firestore init failed (non-fatal):', e && e.message ? e.message : e);
      }

      // Functions init
      try {
        if (!window.firebase.app) throw new Error('firebase.app() missing');
        if (typeof window.firebase.app().functions !== 'function') throw new Error('functions() missing');
        fn = window.firebase.app().functions('us-central1');
      } catch (e) {
        fn = null;
        log('[Firebase] Functions init failed:', e && e.message ? e.message : e);
      }

      setupConnectivity();

      if (!unsubAuth && auth) {
        try {
          unsubAuth = auth.onAuthStateChanged((user) => { refreshClaims(user); });
        } catch (e) {
          log('[Firebase] Auth listener failed:', e && e.message ? e.message : e);
        }
      }

      store?.set?.('firebase.initialized', true);
      store?.set?.('firebase.available', true);
      store?.set?.('firebase.fsQueueSize', getQueue().length);
      return true;
    }

    async function authenticateWithTorn(apiKey) {
      const key = safeStr(apiKey);
      if (!key) throw new Error('Missing Torn API key');

      if (!fn) initFirebase();
      if (!fn) throw new Error('Firebase Functions not available');

      try {
        const callable = fn.httpsCallable('authenticateWithTorn');
        const res = await callable({ apiKey: key });

        const token = res && res.data && res.data.token ? String(res.data.token) : '';
        if (!token) {
          const err = res && res.data && res.data.error ? String(res.data.error) : 'Unknown error';
          nexus?.emit?.('AUTH_ERROR', { error: err });
          throw new Error('Authentication failed: ' + err);
        }

        // Wait for auth state
        const authPromise = new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('Authentication timeout')), 10000);
          const unsub = auth.onAuthStateChanged((user) => {
            if (user) {
              clearTimeout(t);
              try { unsub(); } catch (_) {}
              resolve(user);
            }
          });
        });

        await auth.signInWithCustomToken(token);
        const user = await authPromise;

        nexus?.emit?.('AUTH_SUCCESS', {
          uid: user.uid,
          playerId: res.data?.playerId,
          playerName: res.data?.playerName,
          factionId: res.data?.factionId,
          factionName: res.data?.factionName
        });

        return true;
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        nexus?.emit?.('AUTH_ERROR', { error: msg });
        throw e;
      }
    }

    async function signOut() {
      if (!auth) return;
      await auth.signOut();
    }

    function isConnected() { return !!connected; }
    function isFirestoreReady() { return !!firestoreReady && !!fs; }
    function getCurrentUser() { return auth ? auth.currentUser : null; }

    function authFacade() { if (!auth) initFirebase(); return auth; }
    function rtdbFacade() { if (!db) initFirebase(); return db; }
    function firestoreFacade() { if (!fs) initFirebase(); return fs; }

    function ref(path) { if (!db) initFirebase(); return db.ref(path); }

    // ========= Firestore convenience with offline queue =========
    function collection(path) {
      if (!fs) initFirebase();
      if (!fs) throw new Error('Firestore not available');
      return fs.collection(path);
    }

    function doc(collectionPath, docId) {
      if (!fs) initFirebase();
      if (!fs) throw new Error('Firestore not available');
      return fs.collection(collectionPath).doc(docId);
    }

    async function getDoc(collectionPath, docId) {
      if (!fs) initFirebase();
      if (!fs) return null;
      try {
        const snap = await fs.collection(collectionPath).doc(docId).get();
        return snap.exists ? { id: snap.id, ...snap.data() } : null;
      } catch (_) {
        return null;
      }
    }

    async function setDoc(collectionPath, docId, data, options = {}) {
      if (!fs) initFirebase();
      const payload = { c: String(collectionPath), id: String(docId), data: data || {}, merge: !!options.merge };
      if (!fs || !firestoreReady) {
        enqueueOp({ t: 'set', p: payload, at: nowIso() });
        return { queued: true };
      }
      try {
        const r = fs.collection(payload.c).doc(payload.id);
        if (payload.merge) await r.set(payload.data, { merge: true });
        else await r.set(payload.data);
        return { queued: false };
      } catch (e) {
        enqueueOp({ t: 'set', p: payload, at: nowIso() });
        return { queued: true };
      }
    }

    async function updateDoc(collectionPath, docId, data) {
      if (!fs) initFirebase();
      const payload = { c: String(collectionPath), id: String(docId), data: data || {} };
      if (!fs || !firestoreReady) {
        enqueueOp({ t: 'update', p: payload, at: nowIso() });
        return { queued: true };
      }
      try {
        await fs.collection(payload.c).doc(payload.id).update(payload.data);
        return { queued: false };
      } catch (e) {
        enqueueOp({ t: 'update', p: payload, at: nowIso() });
        return { queued: true };
      }
    }

    async function deleteDoc(collectionPath, docId) {
      if (!fs) initFirebase();
      const payload = { c: String(collectionPath), id: String(docId) };
      if (!fs || !firestoreReady) {
        enqueueOp({ t: 'delete', p: payload, at: nowIso() });
        return { queued: true };
      }
      try {
        await fs.collection(payload.c).doc(payload.id).delete();
        return { queued: false };
      } catch (e) {
        enqueueOp({ t: 'delete', p: payload, at: nowIso() });
        return { queued: true };
      }
    }

    async function queryCollection(collectionPath, queryFn) {
      if (!fs) initFirebase();
      if (!fs) return [];
      try {
        let q = fs.collection(collectionPath);
        if (typeof queryFn === 'function') q = queryFn(q);
        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (_) {
        return [];
      }
    }

    // Listener with fallback: if onSnapshot fails due to transport, fallback to polling .get()
    function onSnapshot(collectionOrDocPath, docId, callback, errorCallback, opts = {}) {
      if (!fs) initFirebase();
      if (!fs) {
        if (typeof errorCallback === 'function') errorCallback(new Error('Firestore not available'));
        return () => {};
      }

      const pollMs = Math.max(2000, Number(opts.pollMs || 8000));
      let stop = false;
      let timer = null;
      let unsub = null;

      function startPolling(refObj, isCollection) {
        if (timer) clearInterval(timer);
        timer = setInterval(async () => {
          if (stop) return;
          try {
            const snap = await refObj.get();
            if (isCollection) {
              const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              callback(docs);
            } else {
              const data = snap.exists ? { id: snap.id, ...snap.data() } : null;
              callback(data);
            }
          } catch (e) {
            if (typeof errorCallback === 'function') errorCallback(e);
          }
        }, pollMs);
      }

      let refObj;
      let isCollection = false;

      if (docId) {
        refObj = fs.collection(collectionOrDocPath).doc(docId);
        isCollection = false;
      } else {
        refObj = fs.collection(collectionOrDocPath);
        isCollection = true;
      }

      try {
        unsub = refObj.onSnapshot(
          (snap) => {
            if (snap && snap.docs) {
              const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              callback(docs);
            } else {
              const data = snap.exists ? { id: snap.id, ...snap.data() } : null;
              callback(data);
            }
          },
          (err) => {
            // fallback to polling if transport breaks
            if (typeof errorCallback === 'function') errorCallback(err);
            startPolling(refObj, isCollection);
          }
        );
      } catch (e) {
        if (typeof errorCallback === 'function') errorCallback(e);
        startPolling(refObj, isCollection);
      }

      return function unsubscribe() {
        stop = true;
        try { if (typeof unsub === 'function') unsub(); } catch (_) {}
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    }

    const firebaseFacade = {
      version: '5.0.1',
      firebaseConfig,
      init: initFirebase,
      authenticateWithTorn,
      signOut,
      isConnected,
      isFirestoreReady,
      getCurrentUser,
      auth: authFacade,
      rtdb: rtdbFacade,
      firestore: firestoreFacade,
      ref,

      // Firestore convenience
      collection,
      doc,
      getDoc,
      setDoc,
      updateDoc,
      deleteDoc,
      queryCollection,
      onSnapshot,

      // Queue utilities
      flushQueue
    };

    function destroy() {
      teardownConnectivity();
      teardownFirestoreMonitoring();
      if (typeof unsubAuth === 'function') {
        try { unsubAuth(); } catch (_) {}
      }
      unsubAuth = null;
      store?.set?.('firebase.initialized', false);
    }

    ctx.firebase = firebaseFacade;
    window.OdinFirebase = firebaseFacade;

    return { id: 'firebase-service', init: initFirebase, destroy };
  });
})();
