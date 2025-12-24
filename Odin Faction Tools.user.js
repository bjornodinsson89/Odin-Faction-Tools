// ==UserScript==
// @name         Odin Faction Tools
// @namespace    http://tampermonkey.net/
// @version      5.2.0
// @description  Torn City faction management tools with Firebase backend - NEW: Player Info Cards with comprehensive stats tracking, progress monitoring, and automatic updates
// @author       BjornOdinsson89
// @match        https://www.torn.com/*
// @icon         https://i.postimg.cc/BQ6bSYKM/file-000000004bb071f5a96fc52564bf26ad-(1).png
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      tornstats.com
// @connect      ffscouter.com
// @connect      torn-war-room.firebaseio.com
// @connect      firestore.googleapis.com
// @connect      firebase.googleapis.com
// @connect      identitytoolkit.googleapis.com
// @connect      securetoken.googleapis.com
// @connect      www.googleapis.com
// @connect      googleapis.com
// @connect      gstatic.com
// @connect      googleusercontent.com
// @connect      raw.githubusercontent.com
// @connect      torn-war-room-default-rtdb.firebaseio.com
// @run-at       document-start
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-functions-compat.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/odins-spear-core.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/FirebaseService.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/OdinApi.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/freki.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/odin-ui.js
// ==/UserScript==

(function() {
  'use strict';

  /* ============================================================
     GLOBAL ERROR HOOKS
     ============================================================ */
  window.addEventListener('error', (e) => {
    try {
      console.error('[Odin] Uncaught error:', e.message, e.error || e);
    } catch (_) {}
  });

  window.addEventListener('unhandledrejection', (e) => {
    try {
      console.error('[Odin] Unhandled promise rejection:', e.reason || e);
    } catch (_) {}
  });

  /* ============================================================
     ODIN FACTION TOOLS - MAIN ENTRY POINT
     ============================================================ */

  console.log('[Odin] Initializing Odin Faction Tools v5.2.0 (Player Info Cards & Enhanced Error Handling)');

  // Verify Firebase is loaded
  if (typeof window.firebase === 'undefined') {
    console.error('[Odin] CRITICAL ERROR: Firebase SDK not loaded! Check @require directives in userscript header.');
    alert('Odin Tools Error: Firebase SDK failed to load. Please reinstall the script.');
    return;
  }

  console.log('[Odin] Firebase SDK loaded:', window.firebase.SDK_VERSION);

  // Verify all required Firebase services are available
  const requiredServices = ['auth', 'database', 'firestore', 'functions'];
  const missingServices = [];

  for (const service of requiredServices) {
    if (typeof window.firebase[service] !== 'function') {
      missingServices.push(service);
    }
  }

  if (missingServices.length > 0) {
    console.error('[Odin] Missing Firebase services:', missingServices.join(', '));
    console.error('[Odin] Please check @require directives for:', missingServices.map(s => `firebase-${s}-compat.js`).join(', '));
  } else {
    console.log('[Odin] All Firebase services available ✓');
  }

  /* ============================================================
     REQUEST JSON HELPER (for API calls)
     ============================================================ */
  window.requestJSON = function(url, options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: options.method || 'GET',
          url: url,
          headers: options.headers || {},
          timeout: options.timeout || 30000,
          onload: function(response) {
            try {
              const data = JSON.parse(response.responseText);
              try {
                const safeUrl = (url || '').replace(/(\?|&)key=[^&]+/ig, '$1key=<API_KEY>');
                console.log('[Odin][requestJSON]', (options.method || 'GET'), safeUrl, 'status=' + response.status);
              } catch (_) {}
              resolve(data);
            } catch (e) {
              reject(new Error('Failed to parse JSON response'));
            }
          },
          onerror: function(error) {
            reject(new Error('Network request failed: ' + error));
          },
          ontimeout: function() {
            reject(new Error('Request timeout'));
          }
        });
      } else {
        // Fallback to fetch
        fetch(url, options)
          .then(response => response.json())
          .then(resolve)
          .catch(reject);
      }
    });
  }; 

  function verifyModulesLoaded() {
    const moduleCount = Array.isArray(window.OdinModules) ? window.OdinModules.length : 0;
    console.log('[Odin] Modules registered via @require:', moduleCount);

    if (moduleCount === 0) {
      console.error('[Odin] CRITICAL: No modules registered! Check @require directives.');
      return false;
    }

    // Expected modules: 10
    if (moduleCount < 10) {
      console.warn('[Odin] WARNING: Expected 10 modules, found', moduleCount);
      console.warn('[Odin] Some modules may have failed to load. Check browser console for errors.');
    }

    return true;
  }

  /* ============================================================
     INITIALIZATION
     ============================================================ */
  async function initializeOdin() {
    console.log('[Odin] ========================================');
    console.log('[Odin] ODIN FACTION TOOLS v5.1.0 (Security Refactor)');
    console.log('[Odin] Initialization started at:', new Date().toISOString());
    console.log('[Odin] ========================================');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      console.log('[Odin] Waiting for DOMContentLoaded...');
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    console.log('[Odin] DOM ready (readyState:', document.readyState + ')');

    // Verify modules loaded via @require
    console.log('[Odin] Verifying module registration...');
    const modulesOk = verifyModulesLoaded();
    if (!modulesOk) {
      console.error('[Odin] Module verification failed. Cannot continue.');
      alert('Odin Tools Error: Modules failed to load. Please reinstall the script.');
      return;
    }

    // Verify OdinsSpear core exists
    if (!window.OdinsSpear || typeof window.OdinsSpear.init !== 'function') {
      console.error('[Odin] CRITICAL: OdinsSpear runtime not found!');
      console.error('[Odin] window.OdinsSpear:', window.OdinsSpear);
      console.error('[Odin] Registered modules:', window.OdinModules ? window.OdinModules.length : 0);
      alert('Odin Tools Error: Core runtime missing. Please reinstall the script.');
      return;
    }

    // ========================================
    // INITIALIZATION SEQUENCE - LOCAL-FIRST ARCHITECTURE
    // ========================================
    // The initialization follows a strict order to ensure:
    // 1. Utils and logging are available first
    // 2. Data layer (API, Storage) is ready before controllers
    // 3. Controllers (handlers, AI) are ready before UI
    // 4. UI starts immediately without waiting for Firebase connection
    //
    // CRITICAL: All module init() functions are SYNCHRONOUS and NON-BLOCKING.
    // Firebase connection happens in the background - the UI does NOT wait for it.
    // The app is fully functional offline using local storage.
    // ========================================

    console.log('[Odin] ========================================');
    console.log('[Odin] Initializing Odin\'s Spear runtime...');
    console.log('[Odin] This will initialize all registered modules in order');
    console.log('[Odin] LOCAL-FIRST: UI will render immediately, Firebase syncs in background');
    console.log('[Odin] ========================================');

    // Enforce deterministic module init sequence (prevents lost Nexus events)
    const moduleOrder = [
      'log-manager',        // Core: Logging system
      'odin-api-config',    // Data: Torn/TornStats/FFScouter API client
      'firebase-service',   // Data: Firebase (connects in background)
      'access-control',     // Controllers: Role management
      'action-handler',     // Controllers: Local-first targets/claims
      'freki-ai',           // Controllers: Freki AI scoring
      'player-info',        // Data: Player info auto-fetcher
      'odin-ui-manager',    // UI: Main UI manager
      'ui-profile-injection'// UI: Profile page injection
    ];

    if (Array.isArray(window.OdinModules)) {
      const extractId = (fn) => {
        try {
          const src = Function.prototype.toString.call(fn);
          const m = src.match(/\bid\s*:\s*['"]([^'"]+)['"]/);
          return m ? m[1] : null;
        } catch (_) { return null; }
      };

      const idxById = new Map(moduleOrder.map((id, i) => [id, i]));
      const weighted = window.OdinModules.map((fn, idx) => ({ fn, idx, id: extractId(fn) }));

      weighted.sort((a, b) => {
        const ai = idxById.has(a.id) ? idxById.get(a.id) : (10000 + a.idx);
        const bi = idxById.has(b.id) ? idxById.get(b.id) : (10000 + b.idx);
        return ai - bi;
      });

      window.OdinModules = weighted.map((x) => x.fn);

      try {
        console.log('[Odin] Module order enforced:', weighted.map((x) => x.id || '(unknown)').join(' → '));
      } catch (_) {}
    }

try {
      window.OdinsSpear.init();
      console.log('[Odin] ========================================');
      console.log('[Odin] ✓ Odin Faction Tools READY!');
      console.log('[Odin] ✓ Modules initialized:', window.OdinsSpear.modules?.length || 0);
      console.log('[Odin] ✓ Toggle button should be visible in bottom-left');
      console.log('[Odin] ========================================');
    } catch (err) {
      console.error('[Odin] ========================================');
      console.error('[Odin] INITIALIZATION FAILED!');
      console.error('[Odin] Error:', err.message);
      console.error('[Odin] Stack:', err.stack);
      console.error('[Odin] ========================================');
      throw err;
    }
  }

  // Start initialization
  initializeOdin().catch(err => {
    console.error('[Odin] Initialization failed:', err);
  });

  /* ============================================================
     DIAGNOSTIC COMMANDS
     ============================================================ */
  window.OdinDiagnostics = {
    checkFirebase: function() {
      console.log('=== Firebase Diagnostics ===');
      console.log('Firebase SDK loaded:', typeof window.firebase !== 'undefined');
      console.log('Firebase version:', window.firebase?.SDK_VERSION || 'N/A');

      if (window.OdinContext?.firebase) {
        const fb = window.OdinContext.firebase;
        console.log('Firebase initialized:', !!fb);
        console.log('RTDB connected:', fb.isConnected?.() || false);
        console.log('Firestore ready:', fb.isFirestoreReady?.() || false);
        console.log('Auth user:', fb.getCurrentUser?.()?.uid || 'None');
      } else {
        console.log('OdinContext.firebase not available');
      }
    },

    testFirestore: async function() {
      console.log('=== Testing Firestore Connection ===');

      if (!window.OdinContext?.firebase) {
        console.error('Firebase service not initialized');
        return;
      }

      const fb = window.OdinContext.firebase;

      try {
        // Try to access firestore
        const firestore = fb.firestore();
        console.log('✓ Firestore instance obtained');

        // Try to read a test document
        const testRef = firestore.collection('_test').doc('ping');
        console.log('✓ Created test reference');

        const snapshot = await testRef.get();
        console.log('✓ Successfully read from Firestore');
        console.log('  Document exists:', snapshot.exists);

        if (snapshot.exists) {
          console.log('  Data:', snapshot.data());
        }

        return true;
      } catch (e) {
        console.error('✗ Firestore test failed:', e.message);
        console.error('  Full error:', e);
        return false;
      }
    },

    listModules: function() {
      console.log('=== Loaded Modules ===');
      if (window.OdinsSpear?.modules) {
        window.OdinsSpear.modules.forEach((m, i) => {
          console.log(`${i + 1}. ${m.id || '(anonymous)'}`);
        });
      } else {
        console.log('No modules loaded');
      }
    },

    getState: function() {
      if (window.OdinContext?.store) {
        return window.OdinContext.store.snapshot();
      }
      return null;
    }
  };

  // Expose diagnostics globally
  console.log('[Odin] Diagnostics available: window.OdinDiagnostics');
  console.log('[Odin] Commands:');
  console.log('  - OdinDiagnostics.checkFirebase()');
  console.log('  - OdinDiagnostics.testFirestore()');
  console.log('  - OdinDiagnostics.listModules()');
  console.log('  - OdinDiagnostics.getState()');

})();
