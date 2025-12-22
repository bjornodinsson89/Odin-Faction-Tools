/* ============================================================
   Odin's Spear Core v5.0.0
   - Nexus event bus
   - State store
   - Local storage abstraction (Tampermonkey GM_* with localStorage fallback)
   - Module loader for window.OdinModules
   ============================================================ */
(function () {
  'use strict';

  if (window.OdinsSpear && window.OdinsSpear.version) return;

  /* =========================
     Nexus Event Bus
     ========================= */
  function createNexus() {
    const listeners = new Map(); // event -> Set(fn)

    function on(event, fn) {
      if (!event || typeof fn !== 'function') return function noop() {};
      const set = listeners.get(event) || new Set();
      set.add(fn);
      listeners.set(event, set);
      return function off() {
        const s = listeners.get(event);
        if (!s) return;
        s.delete(fn);
        if (s.size === 0) listeners.delete(event);
      };
    }

    function once(event, fn) {
      const off = on(event, function wrapped(payload) {
        try { fn(payload); } finally { off(); }
      });
      return off;
    }

    function emit(event, payload) {
      const s = listeners.get(event);
      if (!s || s.size === 0) {
        // Log events with no listeners for debugging
        if (event && !event.startsWith('STATE_CHANGED')) {
          console.debug('[Nexus] Event emitted with no listeners:', event);
        }
        return;
      }

      // Log event emissions for debugging (except high-frequency events)
      if (!event.startsWith('STATE_CHANGED')) {
        console.debug('[Nexus] 📡 Event:', event, payload ? '(with payload)' : '');
      }

      Array.from(s).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error('[Nexus] ❌ Listener error for event:', event);
          console.error('[Nexus]   → Error:', e.message || e);
          console.error('[Nexus]   → Stack:', e.stack);
        }
      });
    }

    return { on, once, emit };
  }

  /* =========================
     Local Storage Adapter
     ========================= */
  function createStorage(namespace) {
    const ns = String(namespace || 'odin').trim() || 'odin';

    const hasGM =
      typeof GM_getValue === 'function' &&
      typeof GM_setValue === 'function' &&
      typeof GM_deleteValue === 'function';

    function k(key) {
      return ns + ':' + String(key || '').trim();
    }

    function getRaw(key, def) {
      const kk = k(key);
      try {
        if (hasGM) return GM_getValue(kk, def);
        const v = localStorage.getItem(kk);
        return v === null ? def : v;
      } catch (_) {
        return def;
      }
    }

    function setRaw(key, val) {
      const kk = k(key);
      if (hasGM) {
        GM_setValue(kk, val);
        return;
      }
      localStorage.setItem(kk, val);
    }

    function del(key) {
      const kk = k(key);
      try {
        if (hasGM) GM_deleteValue(kk);
        else localStorage.removeItem(kk);
      } catch (_) {}
    }

    function get(key, def) {
      return getRaw(key, def);
    }

    function set(key, val) {
      setRaw(key, val);
    }

    function getJSON(key, def) {
      const raw = getRaw(key, null);
      if (raw === null || raw === undefined || raw === '') return def;
      try {
        if (typeof raw === 'object') return raw; // GM_* can store objects
        return JSON.parse(String(raw));
      } catch (_) {
        return def;
      }
    }

    function setJSON(key, obj) {
      try {
        if (hasGM) setRaw(key, obj);
        else setRaw(key, JSON.stringify(obj));
      } catch (_) {
        setRaw(key, String(obj));
      }
    }

    return { get, set, del, getJSON, setJSON, _ns: ns };
  }

  /* =========================
     State Store
     ========================= */
  function createStore(nexus) {
    const state = Object.create(null);

    function get(path, def) {
      if (!path) return def;
      const parts = String(path).split('.');
      let cur = state;
      for (const p of parts) {
        if (!cur || typeof cur !== 'object' || !(p in cur)) return def;
        cur = cur[p];
      }
      return cur;
    }

    function set(path, value) {
      if (!path) return;
      const parts = String(path).split('.');
      let cur = state;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== 'object') cur[p] = Object.create(null);
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = value;

      nexus.emit('STATE_CHANGED', { path, value, state: snapshot() });
      nexus.emit('STATE_CHANGED:' + path, { path, value });
    }

    function update(path, patch) {
      const cur = get(path, Object.create(null));
      const next = Object.assign(Object.create(null), (cur && typeof cur === 'object') ? cur : {}, patch || {});
      set(path, next);
    }

    function subscribe(path, fn) {
      return nexus.on('STATE_CHANGED:' + path, fn);
    }

    function snapshot() {
      return JSON.parse(JSON.stringify(state));
    }

    return { get, set, update, subscribe, snapshot, _state: state };
  }

  /* =========================
     Core Runtime
     ========================= */
  const nexus = createNexus();
  const store = createStore(nexus);
  const storage = createStorage('odin_tools');

  const runtime = {
    version: '5.0.0',
    nexus,
    store,
    storage,
    modules: [],
    initialized: false,
    init: function init(ctxOverrides) {
      if (runtime.initialized) return runtime;
      runtime.initialized = true;

      const ctx = Object.assign(Object.create(null), ctxOverrides || {});
      ctx.nexus = ctx.nexus || nexus;
      ctx.store = ctx.store || store;
      ctx.storage = ctx.storage || storage;
      ctx.log = ctx.log || console.log.bind(console);
      ctx.warn = ctx.warn || console.warn.bind(console);
      ctx.error = ctx.error || console.error.bind(console);
      ctx.now = ctx.now || (() => Date.now());

// Activity buffer (used by UI)
const __activity = [];
const __pushActivity = (level, args) => {
  try {
    __activity.push({
      ts: ctx.now(),
      level,
      message: args && args.length ? String(args[0]) : '',
      args: Array.isArray(args) ? args.slice(0, 6) : []
    });
    if (__activity.length > 100) __activity.splice(0, __activity.length - 100);
  } catch (_) {}
};
const __wrapLog = (level, fn) => (...args) => {
  __pushActivity(level, args);
  return fn(...args);
};
ctx.log = __wrapLog('log', ctx.log);
ctx.warn = __wrapLog('warn', ctx.warn);
ctx.error = __wrapLog('error', ctx.error);
ctx.__activity = __activity;

      // Settings (non-secret) persisted locally
      ctx.settings = ctx.settings || ctx.storage.getJSON('settings', {});
      ctx.saveSettings = ctx.saveSettings || function saveSettings(next) {
        const s = (next && typeof next === 'object') ? next : {};
        ctx.storage.setJSON('settings', s);
        ctx.settings = s;
        try { ctx.store.set('settings', s); } catch (_) {}
        try { ctx.nexus.emit('SETTINGS_UPDATED', s); } catch (_) {}
      };

// Expose a small runtime API for modules/UI
ctx.spear = ctx.spear || {
  version: runtime.version,
  getState: () => ctx.store.snapshot(),
  getRecentActivity: () => (ctx.__activity ? ctx.__activity.slice().reverse() : [])
};

      window.OdinContext = ctx;

      ctx.log('[OdinsSpear] ========================================');
      ctx.log('[OdinsSpear] CORE RUNTIME v' + runtime.version);
      ctx.log('[OdinsSpear] Initializing modules...');
      ctx.log('[OdinsSpear] ========================================');

      ctx.nexus.emit('CORE_READY', { version: runtime.version });

      const mods = Array.isArray(window.OdinModules) ? window.OdinModules.slice() : [];
      const handles = [];

      ctx.log('[OdinsSpear] Registered modules:', mods.length);

      for (let i = 0; i < mods.length; i++) {
        const modInit = mods[i];
        try {
          if (typeof modInit !== 'function') {
            ctx.warn('[OdinsSpear] ⚠️ Module ' + (i + 1) + ' is not a function, skipping');
            continue;
          }

          ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] 🔧 Initializing module...');

          const handle = modInit(ctx);
          const moduleId = (handle && handle.id) || '(anonymous)';

          ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] 📦 Module loaded:', moduleId);

          if (handle && typeof handle.init === 'function') {
            ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] ⚙️ Calling init() for:', moduleId);

            // CRITICAL: Module init() should be synchronous and non-blocking
            // Any async operations (like Firebase connection) should happen in the background
            const initStartTime = Date.now();
            handle.init();
            const initDuration = Date.now() - initStartTime;

            if (initDuration > 100) {
              ctx.warn('[OdinsSpear] ⚠️ Module init took', initDuration, 'ms:', moduleId);
            }

            ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] ✓ Initialized:', moduleId, '(' + initDuration + 'ms)');
          } else {
            ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] ⚠️ No init() method for:', moduleId);
          }

          handles.push(handle || { id: moduleId });
          ctx.nexus.emit('MODULE_READY', { id: moduleId });
        } catch (e) {
          ctx.error('[OdinsSpear] ========================================');
          ctx.error('[OdinsSpear] ❌ MODULE INITIALIZATION ERROR!');
          ctx.error('[OdinsSpear] Module index:', i + 1);
          ctx.error('[OdinsSpear] Error:', e.message || e);
          ctx.error('[OdinsSpear] Stack:', e.stack);
          ctx.error('[OdinsSpear] ========================================');
          ctx.nexus.emit('MODULE_ERROR', { error: String(e && e.message ? e.message : e), index: i });

          // Continue with other modules even if one fails (resilience)
          ctx.warn('[OdinsSpear] ⚠️ Continuing with remaining modules...');
        }
      }

      runtime.modules = handles;

      ctx.log('[OdinsSpear] ========================================');
      ctx.log('[OdinsSpear] ✓ ALL MODULES INITIALIZED');
      ctx.log('[OdinsSpear] Total modules:', handles.length);
      ctx.log('[OdinsSpear] Module IDs:', handles.map(h => h.id || '(anonymous)').join(', '));
      ctx.log('[OdinsSpear] ========================================');

      ctx.nexus.emit('RUNTIME_READY', { modules: handles.length });
      return runtime;
    }
  };

  window.OdinsSpear = runtime;
})();
