/* ============================================================
   UI Profile Injection v5.0.0
   - Handles Torn AJAX navigation via history hooks + MutationObserver
   - Emits:
       URL_CHANGED
       PROFILE_VIEW_READY
   ============================================================ */
(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  function parsePlayerIdFromUrl(href) {
    try {
      const u = new URL(href, window.location.origin);
      const p = u.searchParams;
      const xid = p.get('XID') || p.get('xid') || p.get('ID') || p.get('id') || p.get('userID') || p.get('userid');
      if (xid && /^\d+$/.test(xid)) return xid;
      return null;
    } catch (_) {
      return null;
    }
  }

  function findMainRoot() {
    return (
      document.querySelector('#mainContainer') ||
      document.querySelector('#content') ||
      document.querySelector('#main') ||
      document.body
    );
  }

  function findProfileContainer() {
    return (
      document.querySelector('.profile-wrapper') ||
      document.querySelector('[class*="profile"]') ||
      document.querySelector('[id*="profile"]') ||
      null
    );
  }

  window.OdinModules.push(function UiProfileInjectionModuleInit(ctx) {
    const nexus = ctx.nexus;
    const log = ctx.log || console.log;

    let lastHref = String(location.href);
    let lastProfileId = null;

    function onUrlMaybeChanged(source) {
      const href = String(location.href);
      if (href !== lastHref) {
        lastHref = href;
        nexus.emit('URL_CHANGED', { url: href, source: source || 'unknown' });
      }
      scanForProfile();
    }

    function scanForProfile() {
      const el = findProfileContainer();
      if (!el) return;

      const playerId = parsePlayerIdFromUrl(location.href);
      const sig = (playerId || 'unknown') + '|' + lastHref;

      if (sig === lastProfileId) return;
      lastProfileId = sig;

      nexus.emit('PROFILE_VIEW_READY', {
        url: lastHref,
        playerId: playerId,
        container: el
      });
    }

    function hookHistory() {
      if (window.__ODIN_HISTORY_HOOKED__) return;
      window.__ODIN_HISTORY_HOOKED__ = true;

      const origPush = history.pushState;
      const origReplace = history.replaceState;

      history.pushState = function () {
        const r = origPush.apply(this, arguments);
        onUrlMaybeChanged('pushState');
        return r;
      };

      history.replaceState = function () {
        const r = origReplace.apply(this, arguments);
        onUrlMaybeChanged('replaceState');
        return r;
      };

      window.addEventListener('popstate', () => onUrlMaybeChanged('popstate'));
      window.addEventListener('hashchange', () => onUrlMaybeChanged('hashchange'));
    }

    function startObserver() {
      const root = findMainRoot();
      if (!root) return;

      const obs = new MutationObserver(() => {
        // Torn uses AJAX transitions; DOM changes are a good signal to rescan
        onUrlMaybeChanged('mutation');
      });

      obs.observe(root, { childList: true, subtree: true });
      return obs;
    }

    function init() {
      hookHistory();

      const obs = startObserver();
      // Initial scan
      onUrlMaybeChanged('init');

      // Periodic sanity scan (lightweight)
      const t = setInterval(() => onUrlMaybeChanged('interval'), 2500);

      nexus.emit('PROFILE_INJECTION_READY', { ok: true });

      return { obs, t };
    }

    let handles = null;

    function destroy() {
      try {
        if (handles && handles.obs) handles.obs.disconnect();
      } catch (_) {}
      try {
        if (handles && handles.t) clearInterval(handles.t);
      } catch (_) {}
      handles = null;
      log('[ProfileInjection] destroyed');
    }

    return {
      id: 'ui-profile-injection',
      init: function () { handles = init(); },
      destroy
    };
  });
})();
