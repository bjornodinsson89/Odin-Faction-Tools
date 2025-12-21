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
        store.set('userLevel', null);
        ctx.userLevel = null;
        nexus.emit('AUTH_STATE_CHANGED', { user: null, factionId: null });
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

      store.set('auth.user', { uid: user.uid, email: user.email || null });
      store.set('auth.uid', user.uid);
      store.set('auth.factionId', factionId);
      store.set('auth.tornId', tornId);

      // Auth-to-Store Bridge: Fetch user document from Firestore and populate userLevel
      if (fs && user.uid) {
        try {
          const userDocRef = fs.collection('users').doc(user.uid);
          const userDoc = await userDocRef.get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            const userLevel = userData && userData.level ? userData.level : null;
            if (userLevel) {
              store.set('userLevel', userLevel);
              ctx.userLevel = userLevel;
              log(`[Firebase] User level loaded: ${userLevel}`);
            }
          } else {
            log('[Firebase] User document not found in Firestore');
          }
        } catch (e) {
          log('[Firebase] Failed to fetch user document:', e.message);
        }
      }

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

      try { db.ref('.info/connected').off('value', unsubConn); } catch (_) {}
      unsubConn = null;

      if (firestoreTestInterval) {
        clearInterval(firestoreTestInterval);
        firestoreTestInterval = null;
      }
    }

    async function testFirestoreConnection() {
      if (!fs) return false;

      try {
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

      testFirestoreConnection();

      if (firestoreTestInterval) clearInterval(firestoreTestInterval);
      firestoreTestInterval = setInterval(() => {
        testFirestoreConnection();
      }, 30000);
    }

    function initFirebase() {
      try {
        ensureFirebaseCompat();
      } catch (e) {
        log('[Firebase] ========================================');
        log('[Firebase] FIREBASE SDK NOT LOADED');
        log('[Firebase] This is non-fatal - script will continue in offline mode');
        log('[Firebase] Error:', e.message);
        log('[Firebase] ========================================');
        store.set('firebase.initialized', false);
        store.set('firebase.available', false);
        nexus.emit('FIREBASE_UNAVAILABLE', { error: e.message });
        return false;
      }

      log('[Firebase] ========================================');
      log('[Firebase] INITIALIZING FIREBASE');
      log('[Firebase] ========================================');

      log('[Firebase] SDK Status:', {
        hasFirebase: typeof window.firebase !== 'undefined',
        hasAuth: typeof window.firebase?.auth === 'function',
        hasDatabase: typeof window.firebase?.database === 'function',
        hasFirestore: typeof window.firebase?.firestore === 'function',
        hasFunctions: typeof window.firebase?.app === 'function'
      });

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
        log('[Firebase] ✓ Auth and Database initialized');
      } catch (initError) {
        log('[Firebase] ========================================');
        log('[Firebase] FIREBASE INITIALIZATION FAILED');
        log('[Firebase] This is non-fatal - script will continue in offline mode');
        log('[Firebase] Error:', initError.message);
        log('[Firebase] ========================================');
        store.set('firebase.initialized', false);
        store.set('firebase.available', false);
        nexus.emit('FIREBASE_UNAVAILABLE', { error: initError.message });
        return false;
      }

      // Initialize Firestore with proper error handling and settings
      try {
        if (typeof window.firebase.firestore === 'function') {
          fs = window.firebase.firestore();

          // Apply Firestore settings BEFORE any usage (best-effort).
          // Do NOT re-apply if already applied or Firestore already started.
          try {
            if (fs && !fs.__odinSettingsApplied) {
              fs.__odinSettingsApplied = true;

              log('[Firebase] Applying Firestore settings...');
              fs.settings({
                experimentalAutoDetectLongPolling: true,
                experimentalForceLongPolling: true,
                useFetchStreams: false,
                ignoreUndefinedProperties: true
              });

              log('[Firebase] ✓ Firestore settings applied successfully');
              log('[Firebase]   - Long-polling transport: ENABLED (userscript-safe)');
              log('[Firebase]   - Ignore undefined properties: ENABLED');
            }
          } catch (settingsErr) {
            log('[Firebase] WARNING: Could not apply Firestore settings:', settingsErr.message);
          }

          log('[Firebase] ✓ Firestore initialized successfully');
        } else {
          log('[Firebase] WARNING: Firestore SDK not loaded. Please add firestore-compat.js to your userscript @require directives.');
          fs = null;
        }
      } catch (e) {
        log('[Firebase] Firestore initialization failed:', e.message);
        fs = null;
      }

      // Initialize Functions with us-central1 region
      try {
        if (!window.firebase.app) {
          throw new Error('firebase.app() is not available - Functions SDK not loaded');
        }
        if (typeof window.firebase.app().functions !== 'function') {
          throw new Error('firebase.app().functions() is not available - Functions SDK not loaded');
        }

        fn = window.firebase.app().functions('us-central1');
        if (!fn) throw new Error('Functions instance is null after initialization');
        if (typeof fn.httpsCallable !== 'function') throw new Error('Functions instance missing httpsCallable method');

        log('[Firebase] ✓ Functions initialized successfully');
        log('[Firebase] ✓ Region: us-central1');
        log('[Firebase] ✓ httpsCallable available:', typeof fn.httpsCallable);
      } catch (e) {
        log('[Firebase] ========================================');
        log('[Firebase] CRITICAL ERROR: Functions initialization failed!');
        log('[Firebase] Error:', e.message);
        log('[Firebase] This will prevent authentication from working.');
        log('[Firebase] ========================================');
        fn = null;
      }

      setupConnectivity();

      if (fs) setupFirestoreMonitoring();

      if (!unsubAuth && auth) {
        try {
          unsubAuth = auth.onAuthStateChanged((user) => {
            refreshClaims(user);
          });
        } catch (authErr) {
          log('[Firebase] WARNING: Could not set up auth state listener:', authErr.message);
        }
      }

      store.set('firebase.initialized', true);
      store.set('firebase.available', true);

      log('[Firebase] ========================================');
      log('[Firebase] ✓ FIREBASE FULLY INITIALIZED');
      log('[Firebase] ========================================');

      return true;
    }

    async function authenticateWithTorn(apiKey) {
      const key = safeStr(apiKey);
      if (!key) throw new Error('Missing Torn API key');

      if (!fn) {
        log('[Firebase] Functions not initialized, attempting initialization...');
        initFirebase();
      }
      if (!fn) throw new Error('Firebase Functions failed to initialize.');

      const callable = fn.httpsCallable('authenticateWithTorn');
      const res = await callable({ apiKey: key });

      const token = res && res.data && res.data.token ? String(res.data.token) : '';
      if (!token) {
        const errorMsg = res && res.data && res.data.error ? res.data.error : 'Unknown error';
        throw new Error('Authentication failed: ' + errorMsg);
      }

      // Wait for auth state to be fully established
      const authPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Authentication timeout - user state not established')), 10000);
        const unsubscribe = auth.onAuthStateChanged((user) => {
          if (user) {
            clearTimeout(timeout);
            unsubscribe();
            resolve(user);
          }
        });
      });

      await auth.signInWithCustomToken(token);
      await authPromise;

      nexus.emit('AUTH_SUCCESS', {
        uid: auth.currentUser?.uid,
        playerId: res.data?.playerId,
        playerName: res.data?.playerName,
        factionId: res.data?.factionId,
        factionName: res.data?.factionName
      });

      return true;
    }

    async function signOut() {
      if (!auth) return;
      await auth.signOut();
    }

    function isConnected() { return !!connected; }
    function getCurrentUser() { return auth ? auth.currentUser : null; }

    function ref(path) {
      if (!db) initFirebase();
      return db.ref(path);
    }

    function isFirestoreReady() { return !!firestoreReady && !!fs; }

    function firestore() { if (!fs) initFirebase(); return fs; }

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
      const docRef = doc(collectionPath, docId);
      const snapshot = await docRef.get();
      return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
    }

    async function setDoc(collectionPath, docId, data, options = {}) {
      const docRef = doc(collectionPath, docId);
      if (options.merge) await docRef.set(data, { merge: true });
      else await docRef.set(data);
      return true;
    }

    async function updateDoc(collectionPath, docId, data) {
      const docRef = doc(collectionPath, docId);
      await docRef.update(data);
      return true;
    }

    async function deleteDoc(collectionPath, docId) {
      const docRef = doc(collectionPath, docId);
      await docRef.delete();
      return true;
    }

    async function queryCollection(collectionPath, queryFn) {
      if (!fs) {
        initFirebase();
        if (!fs) throw new Error('Firestore not available. Please load firestore-compat.js');
      }

      let query = fs.collection(collectionPath);
      if (typeof queryFn === 'function') query = queryFn(query);

      const snapshot = await query.get();
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    function onSnapshot(collectionOrDocPath, docId, callback, errorCallback) {
      if (!fs) {
        initFirebase();
        if (!fs) {
          if (errorCallback) errorCallback(new Error('Firestore not available'));
          return () => {};
        }
      }

      let refObj;
      if (docId) refObj = fs.collection(collectionOrDocPath).doc(docId);
      else refObj = fs.collection(collectionOrDocPath);

      return refObj.onSnapshot(
        (snapshot) => {
          if (snapshot.docs) {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(docs);
          } else {
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
      firestore,
      ref,
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
