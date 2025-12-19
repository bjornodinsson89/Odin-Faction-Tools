/* ============================================================
   FirebaseService v5.0.0 (SaaS Auth + Gatekeeper)
   - Initializes Firebase compat SDK
   - Calls Gatekeeper Cloud Function authenticateWithTorn (one-time API key use)
   - Tracks RTDB connectivity and auth state
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

  /* =========================
     Firebase Compat Loader
     ========================= */
  const FIREBASE_COMPAT_VERSION = '9.23.0';
  const FIREBASE_COMPAT_URLS = [
    `https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-auth-compat.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-database-compat.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-firestore-compat.js`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_COMPAT_VERSION}/firebase-functions-compat.js`
  ];

  let _firebaseLoadPromise = null;

  function _injectScript(src) {
    return new Promise((resolve, reject) => {
      try {
        const existing = document.querySelector(`script[data-odin-firebase="${src}"]`) || document.querySelector(`script[src="${src}"]`);
        if (existing) {
          if (existing.getAttribute('data-odin-loaded') === '1') return resolve(true);
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
          return;
        }

        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.defer = false;
        s.type = 'text/javascript';
        s.setAttribute('data-odin-firebase', src);
        s.addEventListener('load', () => {
          try { s.setAttribute('data-odin-loaded', '1'); } catch (_) {}
          resolve(true);
        }, { once: true });
        s.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        (document.head || document.documentElement).appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function _hasFirebaseCompatReady() {
    return !!(
      window.firebase &&
      typeof window.firebase.initializeApp === 'function' &&
      typeof window.firebase.auth === 'function' &&
      typeof window.firebase.database === 'function' &&
      typeof window.firebase.firestore === 'function' &&
      typeof window.firebase.functions === 'function'
    );
  }

  function ensureFirebaseCompat() {
    if (_hasFirebaseCompatReady()) return Promise.resolve(true);
    if (_firebaseLoadPromise) return _firebaseLoadPromise;
    _firebaseLoadPromise = (async () => {
      for (const url of FIREBASE_COMPAT_URLS) {
        await _injectScript(url);
      }
      if (!_hasFirebaseCompatReady()) {
        throw new Error('Firebase compat SDK failed to initialize after loading scripts');
      }
      return true;
    })();
    return _firebaseLoadPromise;
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
      if (store.get('firebase.initialized')) return true;

      if (!_hasFirebaseCompatReady()) {
        ensureFirebaseCompat()
          .then(() => {
            try { initFirebase(); } catch (e) {
              try { nexus && nexus.emit && nexus.emit('FIREBASE_DISCONNECTED', { error: e && e.message ? e.message : String(e) }); } catch (_) {}
            }
          })
          .catch((e) => {
            try { nexus && nexus.emit && nexus.emit('FIREBASE_DISCONNECTED', { error: e && e.message ? e.message : String(e) }); } catch (_) {}
          });

        return false;
      }

      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        app = window.firebase.initializeApp(firebaseConfig);
      } else {
        app = window.firebase.app();
      }

      auth = window.firebase.auth();
      db = window.firebase.database();
      fs = window.firebase.firestore();
      fn = window.firebase.functions();

      setupConnectivity();

      if (!unsubAuth) {
        unsubAuth = auth.onAuthStateChanged((user) => {
          refreshClaims(user);
        });
      }

      store.set('firebase.initialized', true);
      try { nexus && nexus.emit && nexus.emit('FIREBASE_CONNECTED'); } catch (_) {}
      return true;
    }

    async function authenticateWithTorn(apiKey) {
      const key = safeStr(apiKey);
      if (!key) throw new Error('Missing Torn API key');

      if (!fn) {
        const ok = initFirebase();
        if (!ok && _firebaseLoadPromise) {
          await _firebaseLoadPromise;
          initFirebase();
        }
      }

      if (!fn || !auth) {
        throw new Error('Firebase is not ready yet. Please try again.');
      }

      const callable = fn.httpsCallable('authenticateWithTorn');
      const res = await callable({ apiKey: key });

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
