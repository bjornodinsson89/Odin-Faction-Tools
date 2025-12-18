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
      if (!s || s.size === 0) return;
      Array.from(s).forEach((fn) => {
        try { fn(payload); } catch (e) { console.error('[Odin:Nexus] listener error', event, e); }
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

      // Settings (non-secret) persisted locally
      ctx.settings = ctx.settings || ctx.storage.getJSON('settings', {});
      ctx.saveSettings = ctx.saveSettings || function saveSettings(next) {
        const s = (next && typeof next === 'object') ? next : {};
        ctx.storage.setJSON('settings', s);
        ctx.settings = s;
        try { ctx.store.set('settings', s); } catch (_) {}
        try { ctx.nexus.emit('SETTINGS_UPDATED', s); } catch (_) {}
      };

      window.OdinContext = ctx;

      ctx.nexus.emit('CORE_READY', { version: runtime.version });

      const mods = Array.isArray(window.OdinModules) ? window.OdinModules.slice() : [];
      const handles = [];

      for (const modInit of mods) {
        try {
          if (typeof modInit !== 'function') continue;
          const handle = modInit(ctx);
          if (handle && typeof handle.init === 'function') {
            handle.init();
          }
          handles.push(handle || { id: '(anonymous)' });
          ctx.nexus.emit('MODULE_READY', { id: (handle && handle.id) || '(anonymous)' });
        } catch (e) {
          ctx.error('[Odin] Module init error', e);
          ctx.nexus.emit('MODULE_ERROR', { error: String(e && e.message ? e.message : e) });
        }
      }

      runtime.modules = handles;

      ctx.nexus.emit('RUNTIME_READY', { modules: handles.length });
      return runtime;
    }
  };

  window.OdinsSpear = runtime;
})();
