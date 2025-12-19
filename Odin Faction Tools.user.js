// ==UserScript==
// @name         Odin Faction Tools
// @namespace    https://github.com/bjornodinsson89/Odin-Faction-Tools
// @version      5.0.0
// @description  Advanced faction management tools for Torn with Firebase integration
// @author       Bjorn Odinsson
// @match        https://www.torn.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @connect      torn-war-room.firebaseapp.com
// @connect      torn-war-room-default-rtdb.firebaseio.com
// @connect      firestore.googleapis.com
// @connect      us-central1-torn-war-room.cloudfunctions.net
// @connect      cloudfunctions.net
// @connect      googleapis.com
// @require      https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js
// @require      https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js
// @require      https://www.gstatic.com/firebasejs/9.23.0/firebase-functions-compat.js
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Odin%20Faction%20Tools.user.js
// @downloadURL  https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Odin%20Faction%20Tools.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('[Odin Faction Tools] Version 5.0.0 loaded');
        console.log('[Odin Faction Tools] Initializing on torn.com...');

        // Load core modules
        loadModules();
    }

    function loadModules() {
        // This is where you would load your modules
        // The actual module loading logic would go here
        console.log('[Odin Faction Tools] Loading modules...');

        // Example: Load modules in order
        // 1. Core (Nexus, Store, Storage)
        // 2. Firebase Service
        // 3. UI Modules
        // 4. Feature Modules
    }
})();
