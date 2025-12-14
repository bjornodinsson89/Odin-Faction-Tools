// ==UserScript==
// @name         Odin Tools - Modular v4.0.2 (Diag)
// @namespace    http://tampermonkey.net/
// @version      4.0.7
// @description  Odin Tools loader with on-page diagnostics (Android-friendly) + OdinModules runner
// @author       BjornOdinsson89
// @match        https://www.torn.com/*
// @match        https://www2.torn.com/*
// @icon         https://www.torn.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @connect      api.torn.com
// @connect      tornstats.com
// @connect      www.tornstats.com
// @connect      ffscouter.com
// @connect      github.com
// @connect      raw.githubusercontent.com
// @connect      *.githubusercontent.com
// @connect      *.firebaseio.com
// @connect      firestore.googleapis.com
// @connect      identitytoolkit.googleapis.com
// @connect      www.googleapis.com
// @connect      www.gstatic.com
// @connect      torn-war-room-default-rtdb.firebaseio.com
// @require      https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js
// @require      https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js
// @require      https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js
// @require      https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/OdinApi.js
@require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/odin-api-config.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/FirebaseService.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/AccessControl.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/NeuralNetwork.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/FrekiEngine.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/odins-spear-core.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/faction-sync.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/war-predictor.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-core.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-settings.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-war-room.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-targets.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-chain.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-watchers.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-faction.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-personal-targets.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-retals.js
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-leadership.js
// @run-at       document-end
// ==/UserScript==

/* global OdinApi, FirebaseService, AccessControl */

(function () {
  'use strict';

  window.OdinModules = window.OdinModules || [];

  // Diagnostics UI moved into Settings tab; keep a lightweight log store.
  (function initOdinDiagStore() {
    const MAX = 600;
    const st = { lines: [] };
    function now() { const d = new Date(); return d.toISOString().split('T')[1].replace('Z',''); }
    function push(line) { st.lines.push(line); if (st.lines.length > MAX) st.lines.splice(0, st.lines.length - MAX); }
    window.OdinDiag = window.OdinDiag || {
      log: (...args) => {
        const msg = args.map(a => {
          try { return (typeof a === 'string') ? a : JSON.stringify(a); } catch (e) { return String(a); }
        }).join(' ');
        push(`[${now()}] ${msg}`);
      },
      getLog: () => st.lines.slice(),
      clear: () => { st.lines.length = 0; }
    };
  })();

const elStatus = () => document.getElementById('odin-diag-status');
  const elReq = () => document.getElementById('odin-diag-requires');
  const elMods = () => document.getElementById('odin-diag-mods');
  const elUI = () => document.getElementById('odin-diag-ui');

  const logLines = [];
  function log(line) {
    const ts = new Date().toISOString().split('T')[1].replace('Z','');
    const s = `[${ts}] ${line}`;
    logLines.push(s);
    console.log(s);
  }

  function setRow(el, html) { try { el().innerHTML = html; } catch {} }

  document.getElementById('odin-diag-hide').addEventListener('click', () => diag.remove());
  document.getElementById('odin-diag-copy').addEventListener('click', async () => {
    const txt = logLines.join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      log('Copied diag log to clipboard.');
    } catch (e) {
      log('Clipboard copy failed: ' + (e?.message || e));
      alert(txt);
    }
  });

  const REQUIRE_URLS = [
    'https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/OdinApi.js',
    'https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/FirebaseService.js',
    'https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/Modules/AccessControl.js',
    'https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/UI/ui-core.js'
  ];

  function gmGet(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 15000,
        onload: (r) => resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, len: (r.responseText || '').length }),
        onerror: () => resolve({ ok: false, status: 0, len: 0 }),
        ontimeout: () => resolve({ ok: false, status: -1, len: 0 })
      });
    });
  }

  async function checkRequires() {
    setRow(elReq, `Requires: checking raw.githubusercontent.com…`);
    let okCount = 0;
    for (const url of REQUIRE_URLS) {
      const r = await gmGet(url);
      log(`REQUIRE CHECK ${r.ok ? 'OK' : 'FAIL'} ${r.status} ${url} (len=${r.len})`);
      if (r.ok && r.len > 50) okCount++;
    }
    const cls = okCount === REQUIRE_URLS.length ? 'ok' : 'bad';
    setRow(elReq, `Requires: <span class="${cls}">${okCount}/${REQUIRE_URLS.length} reachable</span>`);
    return okCount;
  }

  const FIREBASE_CONFIG_DEFAULT = {
    apiKey: "AIzaSyAXIP665pJj4g9L9i-G-XVBrcJ0eU5V4uw",
    authDomain: "torn-war-room.firebaseapp.com",
    databaseURL: "https://torn-war-room-default-rtdb.firebaseio.com",
    projectId: "torn-war-room",
    storageBucket: "torn-war-room.firebasestorage.app",
    messagingSenderId: "559747349324",
    appId: "1:559747349324:web:ec1c7d119e5fd50443ade9"
  };

  const Nexus = {
    _l: new Map(),
    on(evt, fn) {
      if (!this._l.has(evt)) this._l.set(evt, new Set());
      this._l.get(evt).add(fn);
      return () => this.off(evt, fn);
    },
    off(evt, fn) { this._l.get(evt)?.delete(fn); },
    emit(evt, data) { this._l.get(evt)?.forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
  };

  const Storage = {
  getJSON(key, fallback = null) {
    try {
      if (typeof GM_getValue === 'function') {
        const raw = GM_getValue(key, null);
        if (raw === null || raw === undefined || raw === '') return fallback;
        return JSON.parse(raw);
      }
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  setJSON(key, value) {
    try {
      const raw = JSON.stringify(value);
      if (typeof GM_setValue === 'function') {
        GM_setValue(key, raw);
        return;
      }
      localStorage.setItem(key, raw);
    } catch (e) {
      // ignore
    }
  },
  remove(key) {
    try {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
        return;
      }
      localStorage.removeItem(key);
    } catch (e) {
      // ignore
    }
  }
};

  const SETTINGS_KEY = 'odin_settings_v4';
  function loadSettings() { try { return JSON.parse(GM_getValue(SETTINGS_KEY, '{}')) || {}; } catch { return {}; } }
  function saveSettings(s) { GM_setValue(SETTINGS_KEY, JSON.stringify(s)); }

  async function runRegisteredModules(ctx) {
    const factories = Array.isArray(window.OdinModules) ? window.OdinModules.slice() : [];
    setRow(elMods, `Modules: <span class="${factories.length ? 'ok' : 'bad'}">${factories.length}</span> registered`);
    if (!factories.length) return { ran: 0, ok: 0, inits: 0, okInits: 0 };

    ctx._moduleRunLog = ctx._moduleRunLog || [];
    ctx._moduleInitLog = ctx._moduleInitLog || [];
    ctx._modules = ctx._modules || [];

    let ran = 0, ok = 0, inits = 0, okInits = 0;

    for (const fn of factories) {
      if (typeof fn !== 'function') continue;
      if (fn.__odin_ran) continue;
      fn.__odin_ran = true;

      ran++;
      const name = fn.name || '(anonymous module)';
      let mod = null;

      try {
        mod = fn(ctx);
        ok++;
        ctx._moduleRunLog.push({ name, ok: true });
      } catch (e) {
        console.error('[Odin] Module factory failed:', name, e);
        ctx._moduleRunLog.push({ name, ok: false, error: String(e?.message || e) });
        continue;
      }

      if (mod && typeof mod === 'object') {
        ctx._modules.push(mod);

        if (typeof mod.init === 'function') {
          inits++;
          try {
            // Support both init() and init(ctx)
            const ret = (mod.init.length >= 1) ? mod.init(ctx) : mod.init();
            if (ret && typeof ret.then === 'function') await ret;
            okInits++;
            ctx._moduleInitLog.push({ id: mod.id || name, ok: true });
          } catch (e) {
            console.error('[Odin] Module init failed:', mod.id || name, e);
            ctx._moduleInitLog.push({ id: mod.id || name, ok: false, error: String(e?.message || e) });
          }
        }
      }
    }

    return { ran, ok, inits, okInits };
  }



  async function main() {
    setRow(elStatus, `Status: <span class="muted">Booting…</span>`);
    log('Booting Odin diagnostics loader…');

    await checkRequires();

    const settings = loadSettings();

    // If these are missing, @require is not loading in this environment
    const missing = [];
    if (typeof OdinApi !== 'function') missing.push('OdinApi');
    if (typeof FirebaseService !== 'function') missing.push('FirebaseService');
    if (typeof AccessControl !== 'function') missing.push('AccessControl');

    if (missing.length) {
      setRow(elStatus, `Status: <span class="bad">Missing globals:</span> ${missing.join(', ')}`);
      setRow(elUI, `UI: <span class="bad">Not initialized</span>`);
      log('Missing globals (likely @require failed): ' + missing.join(', '));
      log('If raw checks show failures, Android/Firefox/Tampermonkey may be blocking raw GitHub. Try: enable "Allow scripts to access cross-origin" in TM, or test on desktop.');
      return;
    }

    const api = new OdinApi();
    api.setApiKeys({
      torn: settings.tornApiKey || settings.apiKey || '',
      tornStats: settings.tornStatsKey || '',
      ffScouter: settings.ffScouterKey || ''
    });

    const firebaseCfg = settings.firebaseConfig || FIREBASE_CONFIG_DEFAULT;
    const firebaseSvc = new FirebaseService(firebaseCfg);
    await firebaseSvc.initialize();

    if (typeof firebaseSvc.setRequestFn === 'function' && typeof api.makeRequest === 'function') {
      firebaseSvc.setRequestFn((url, opts) => api.makeRequest(url, opts));
    }

    let authMode = 'anonymous';
    try {
      if (settings.backendBaseUrl && (settings.tornApiKey || settings.apiKey) && typeof firebaseSvc.signInViaBackend === 'function') {
        await firebaseSvc.signInViaBackend(settings.backendBaseUrl, (settings.tornApiKey || settings.apiKey), 'v4.0.2');
        authMode = 'customToken';
      } else if (typeof firebaseSvc.signInAnonymously === 'function') {
        await firebaseSvc.signInAnonymously();
      }
    } catch (e) {
      log('Firebase auth failed, trying anonymous: ' + (e?.message || e));
      try { if (typeof firebaseSvc.signInAnonymously === 'function') await firebaseSvc.signInAnonymously(); } catch {}
    }

    let me = null;
    try { me = await api.getTornUser('', ['basic', 'profile']); } catch (e) { log('Torn user fetch failed (API key missing?): ' + (e?.message || e)); }
    const myId = Number(me?.player_id || me?.playerid || me?.user_id || 0);
    const factionId = Number(me?.faction?.faction_id || me?.faction?.factionid || 0) || null;

    if (typeof firebaseSvc.setUser === 'function') firebaseSvc.setUser(myId, factionId);

    const ctx = {
      version: '4.0.2',
      settings,
      saveSettings,
      api,
      firebase: firebaseSvc,
      nexus: Nexus,
      events: Nexus,
      storage: Storage,
      authMode,
      me: { id: myId, name: me?.name || '', factionId }
    };
    window.OdinContext = ctx;

    ctx.access = new AccessControl(ctx);
    await ctx.access.init();

    const r = await runRegisteredModules(ctx);

    // Determine if UI injected (we can only do a heuristic check)
    const uiFound = !!document.querySelector('[id*="odin"], [class*="odin"], #odin-ui, #odin-root, #odin-drawer');
    setRow(elUI, `UI: <span class="${uiFound ? 'ok' : 'bad'}">${uiFound ? 'Detected' : 'Not detected'}</span>`);

    setRow(elStatus, `Status: <span class="ok">Running</span> | auth=${authMode} | me=${myId || 'unknown'}`);
    log(`Started. auth=${authMode} me=${myId} faction=${factionId} modulesFactoriesRan=${r.ran} factoriesOk=${r.ok} initsRan=${r.inits} initsOk=${r.okInits}`);
    if (ctx._moduleRunLog?.length) log('Module run log: ' + JSON.stringify(ctx._moduleRunLog));
  }

  main().catch(e => {
    setRow(elStatus, `Status: <span class="bad">Fatal</span> ${String(e?.message || e)}`);
    log('FATAL: ' + (e?.stack || e?.message || e));
  });

})();