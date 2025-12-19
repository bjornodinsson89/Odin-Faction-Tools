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
    let unsubAuth = null;
    let unsubConn = null;

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
      fs = window.firebase.firestore();
      fn = window.firebase.functions('us-central1');

      setupConnectivity();

      if (!unsubAuth) {
        unsubAuth = auth.onAuthStateChanged((user) => {
          refreshClaims(user);
        });
      }

      store.set('firebase.initialized', true);
      return true;
    }


    function formatCallableError(e) {
      try {
        const code = e && typeof e.code === 'string' ? e.code : '';
        const message = e && typeof e.message === 'string' ? e.message : '';
        const details = (e && e.details !== undefined) ? e.details : null;
        let extra = '';
        if (details) {
          if (typeof details === 'string') extra = details;
          else {
            try { extra = JSON.stringify(details); } catch (_) { extra = String(details); }
          }
        }
        const bits = [];
        if (code) bits.push(code);
        if (message) bits.push(message);
        if (extra) bits.push(extra);
        const out = bits.join(' | ').trim();
        return out || 'Unknown Firebase callable error';
      } catch (_) {
        return 'Unknown Firebase callable error';
      }
    }
    async function authenticateWithTorn(apiKey) {
      const key = safeStr(apiKey);
      if (!key) throw new Error('Missing Torn API key');

      if (!fn) initFirebase();

      const callable = fn.httpsCallable('authenticateWithTorn');
      let res;
      try {
        res = await callable({ apiKey: key });
      } catch (e) {
        throw new Error(formatCallableError(e));
      }

      const token = res && res.data && res.data.token ? String(res.data.token) : '';
      if (!token) throw new Error('Gatekeeper did not return a token');

      await auth.signInWithCustomToken(token);

      return true;
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

    const firebaseFacade = {
      version: '5.0.0',
      firebaseConfig,
      init: initFirebase,
      authenticateWithTorn,
      signOut,
      isConnected,
      getCurrentUser,
      auth: function () { if (!auth) initFirebase(); return auth; },
      rtdb: function () { if (!db) initFirebase(); return db; },
      firestore: function () { if (!fs) initFirebase(); return fs; },
      ref
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
