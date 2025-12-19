/* ============================================================
   FirebaseService v5.0.0 (SaaS Auth + Gatekeeper)
   - Initializes Firebase compat SDK
   - Calls Gatekeeper Cloud Function authenticateWithTorn (one-time API key use)
   - Tracks RTDB connectivity and auth state
   - Emits Nexus events:
       FIREBASE_CONNECTED / FIREBASE_DISCONNECTED
       AUTH_STATE_CHANGED
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

  window.OdinModules.push(function FirebaseServiceModuleInit(ctx) {
    const nexus = ctx.nexus;
    const store = ctx.store;
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
    let firestoreTestInterval = null;

    async function refreshClaims(user) {
      if (!user) {
        store.set('auth.user', null);
        store.set('auth.uid', null);
        store.set('auth.factionId', null);
        store.set('auth.tornId', null);
        nexus.emit('AUTH_STATE_CHANGED', { user: null, factionId: null });
        return;
      }

      let tokenResult = null;
      try {
        tokenResult = await user.getIdTokenResult(true);
      } catch (e) {
        tokenResult = null;
      }

      const claims = (tokenResult && tokenResult.claims) ? tokenResult.claims : {};
      const factionId = claims.factionId ? String(claims.factionId) : null;
      const tornId = claims.tornId ? String(claims.tornId) : null;

      store.set('auth.user', { uid: user.uid, email: user.email || null });
      store.set('auth.uid', user.uid);
      store.set('auth.factionId', factionId);
      store.set('auth.tornId', tornId);

      nexus.emit('AUTH_STATE_CHANGED', { user: { uid: user.uid }, factionId, tornId });
    }

    function setupConnectivity() {
      if (!db) return;
      try {
        const connRef = db.ref('.info/connected');
        unsubConn = connRef.on('value', (snap) => {
          const isConn = !!snap.val();
          if (isConn === connected) return;
          connected = isConn;
          store.set('firebase.connected', connected);
          nexus.emit(connected ? 'FIREBASE_CONNECTED' : 'FIREBASE_DISCONNECTED', { connected });
        });
      } catch (e) {
        log('[Firebase] Connectivity monitor failed:', e);
      }
    }

    function teardownConnectivity() {
      if (!db || !unsubConn) return;
      try {
        db.ref('.info/connected').off('value', unsubConn);
      } catch (_) {}
      unsubConn = null;

      if (firestoreTestInterval) {
        clearInterval(firestoreTestInterval);
        firestoreTestInterval = null;
      }
    }

    async function testFirestoreConnection() {
      if (!fs) return false;

      try {
        // Try to read from a test collection
        const testRef = fs.collection('_connection_test').doc('ping');
        await testRef.get();

        if (!firestoreReady) {
          firestoreReady = true;
          store.set('firebase.firestoreReady', true);
          nexus.emit('FIRESTORE_CONNECTED', { ready: true });
          log('[Firebase] Firestore connection established');
        }
        return true;
      } catch (e) {
        if (firestoreReady) {
          firestoreReady = false;
          store.set('firebase.firestoreReady', false);
          nexus.emit('FIRESTORE_DISCONNECTED', { error: e.message });
          log('[Firebase] Firestore connection lost:', e.message);
        }
        return false;
      }
    }

    function setupFirestoreMonitoring() {
      if (!fs) return;

      // Test connection immediately
      testFirestoreConnection();

      // Test periodically (every 30 seconds)
      if (firestoreTestInterval) clearInterval(firestoreTestInterval);
      firestoreTestInterval = setInterval(() => {
        testFirestoreConnection();
      }, 30000);
    }

    function initFirebase() {
      ensureFirebaseCompat();

      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        app = window.firebase.initializeApp(firebaseConfig);
      } else {
        app = window.firebase.app();
      }

      auth = window.firebase.auth();
      db = window.firebase.database();

      // Initialize Firestore with proper error handling
      try {
        if (typeof window.firebase.firestore === 'function') {
          fs = window.firebase.firestore();
          log('[Firebase] Firestore initialized successfully');
        } else {
          log('[Firebase] WARNING: Firestore SDK not loaded. Please add firestore-compat.js to your userscript @require directives.');
          fs = null;
        }
      } catch (e) {
        log('[Firebase] Firestore initialization failed:', e.message);
        fs = null;
      }

      // Functions must be bound to the initialized Firebase App; compat `firebase.functions()` does NOT accept region.
      // For regional callable (2nd gen in us-central1), use `app.functions('us-central1')`.
      try {
        fn = (app && typeof app.functions === 'function') ? app.functions('us-central1') : window.firebase.app().functions('us-central1');
      } catch (_) {
        try { fn = window.firebase.functions(); } catch (__) { fn = null; }
      }

      setupConnectivity();

      // Setup Firestore monitoring if available
      if (fs) {
        setupFirestoreMonitoring();
      }

      if (!unsubAuth) {
        unsubAuth = auth.onAuthStateChanged((user) => {
          refreshClaims(user);
        });
      }

      store.set('firebase.initialized', true);
      return true;
    }

    async function authenticateWithTorn(apiKey) {
      const key = safeStr(apiKey);
      if (!key) throw new Error('Missing Torn API key');

      if (!fn) {
        log('[Firebase] Functions not initialized, initializing Firebase...');
        initFirebase();
      }

      if (!fn) {
        throw new Error('Firebase Functions failed to initialize. Check console for details.');
      }

      log('[Firebase] Calling authenticateWithTorn cloud function...');

      try {
        const callable = fn.httpsCallable('authenticateWithTorn');
        const res = await callable({ apiKey: key });

        log('[Firebase] Cloud function response:', res);

        const token = res && res.data && res.data.token ? String(res.data.token) : '';
        if (!token) {
          const errorMsg = res && res.data && res.data.error ? res.data.error : 'Unknown error';
          throw new Error('Authentication failed: ' + errorMsg);
        }

        log('[Firebase] Signing in with custom token...');
        await auth.signInWithCustomToken(token);

        log('[Firebase] Successfully authenticated!');
        return true;
      } catch (error) {
        log('[Firebase] Authentication error:', error);

        // Extract meaningful error message
        if (error.code === 'functions/not-found') {
          throw new Error('Cloud function not found. The authenticateWithTorn function may not be deployed.');
        } else if (error.code === 'functions/internal') {
          throw new Error('Server error: ' + (error.message || 'Unknown internal error'));
        } else if (error.message) {
          throw new Error(error.message);
        } else {
          throw new Error('Unknown error: ' + String(error));
        }
      }
    }

    async function signOut() {
      if (!auth) return;
      await auth.signOut();
    }

    function isConnected() {
      return !!connected;
    }

    function getCurrentUser() {
      return auth ? auth.currentUser : null;
    }

    function ref(path) {
      if (!db) initFirebase();
      return db.ref(path);
    }

    function isFirestoreReady() {
      return !!firestoreReady && !!fs;
    }

    function collection(path) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      return fs.collection(path);
    }

    function doc(collectionPath, docId) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      return fs.collection(collectionPath).doc(docId);
    }

    async function getDoc(collectionPath, docId) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      const docRef = fs.collection(collectionPath).doc(docId);
      const snapshot = await docRef.get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    }

    async function setDoc(collectionPath, docId, data, options = {}) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      const docRef = fs.collection(collectionPath).doc(docId);
      if (options.merge) {
        await docRef.set(data, { merge: true });
      } else {
        await docRef.set(data);
      }
      return true;
    }

    async function updateDoc(collectionPath, docId, data) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      const docRef = fs.collection(collectionPath).doc(docId);
      await docRef.update(data);
      return true;
    }

    async function deleteDoc(collectionPath, docId) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      const docRef = fs.collection(collectionPath).doc(docId);
      await docRef.delete();
      return true;
    }

    async function queryCollection(collectionPath, queryFn) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }
      let query = fs.collection(collectionPath);
      if (typeof queryFn === 'function') {
        query = queryFn(query);
      }
      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    function onSnapshot(collectionOrDocPath, docId, callback, errorCallback) {
      if (!fs) {
        initFirebase();
        if (!fs) {
          if (errorCallback) errorCallback(new Error('Firestore not available'));
          return () => {};
        }
      }

      let ref;
      if (docId) {
        ref = fs.collection(collectionOrDocPath).doc(docId);
      } else {
        ref = fs.collection(collectionOrDocPath);
      }

      return ref.onSnapshot(
        (snapshot) => {
          if (snapshot.docs) {
            // Collection snapshot
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(docs);
          } else {
            // Document snapshot
            const data = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
            callback(data);
          }
        },
        errorCallback || ((err) => log('[Firebase] Snapshot error:', err))
      );
    }

    const firebaseFacade = {
      version: '5.0.0',
      firebaseConfig,
      init: initFirebase,
      authenticateWithTorn,
      signOut,
      isConnected,
      isFirestoreReady,
      getCurrentUser,
      auth: function () { if (!auth) initFirebase(); return auth; },
      rtdb: function () { if (!db) initFirebase(); return db; },
      firestore: function () { if (!fs) initFirebase(); return fs; },
      ref,
      // Firestore convenience methods
      collection,
      doc,
      getDoc,
      setDoc,
      updateDoc,
      deleteDoc,
      queryCollection,
      onSnapshot
    };

    function destroy() {
      teardownConnectivity();
      if (typeof unsubAuth === 'function') {
        try { unsubAuth(); } catch (_) {}
      }
      unsubAuth = null;
      store.set('firebase.initialized', false);
    }

    ctx.firebase = firebaseFacade;
    window.OdinFirebase = firebaseFacade;

    return { id: 'firebase-service', init: initFirebase, destroy };
  });
})();
