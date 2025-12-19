// ==UserScript==
// @name         Odin Faction Tools
// @namespace    http://tampermonkey.net/
// @version      5.0.1
// @description  Torn City faction management tools with Firebase backend
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
// @run-at       document-start
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js
// @require      https://www.gstatic.com/firebasejs/10.7.1/firebase-functions-compat.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/odins-spear-core.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/FirebaseService.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/AccessControl.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/OdinApi.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/NeuralNetwork.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/freki.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/UIManager.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/ui-profile-injection.js
// ==/UserScript==

(function() {
  'use strict';

  /* ============================================================
     ODIN FACTION TOOLS - MAIN ENTRY POINT
     ============================================================ */

  console.log('[Odin] Initializing Odin Faction Tools v5.0.1');

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

  /* ============================================================
     MODULE LOADER
     ============================================================ */
  const LOAD_ORDER = [
    'odins-spear-core.js',        // Core runtime
    'NeuralNetwork.js',            // Neural network for Freki
    'FirebaseService.js',          // Firebase + Firestore
    'AccessControl.js',            // Role management
    'OdinApi.js',                  // API client
    'freki.js',                    // AI scoring
    'UIManager.js',                // UI
    'ui-profile-injection.js'      // Profile injection
  ];

  function loadModuleScript(filename) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/${filename}`;
      script.onload = () => {
        console.log('[Odin] Loaded module:', filename);
        resolve();
      };
      script.onerror = () => {
        console.error('[Odin] Failed to load module:', filename);
        reject(new Error('Failed to load ' + filename));
      };
      document.head.appendChild(script);
    });
  }

  async function loadAllModules() {
    console.log('[Odin] Loading modules...');

    for (const filename of LOAD_ORDER) {
      try {
        await loadModuleScript(filename);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between modules
      } catch (e) {
        console.error('[Odin] Module loading error:', filename, e);
      }
    }

    console.log('[Odin] All modules loaded');
  }

  /* ============================================================
     INITIALIZATION
     ============================================================ */
  async function initializeOdin() {
    console.log('[Odin] Starting initialization sequence...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }

    console.log('[Odin] DOM ready');

    // Load all modules
    await loadAllModules();

    // Wait a bit for modules to register
    await new Promise(resolve => setTimeout(resolve, 500));

    // Initialize core
    if (window.OdinsSpear && typeof window.OdinsSpear.init === 'function') {
      console.log('[Odin] Initializing Odin\'s Spear runtime...');
      window.OdinsSpear.init();
      console.log('[Odin] ✓ Odin Faction Tools ready!');
    } else {
      console.error('[Odin] CRITICAL: OdinsSpear runtime not found!');
      console.error('[Odin] Registered modules:', window.OdinModules ? window.OdinModules.length : 0);
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
