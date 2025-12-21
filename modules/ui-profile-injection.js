/* ============================================================
   UI Profile Injection v5.1.0 - PURE PRESENTATION LAYER
   - Handles Torn AJAX navigation via history hooks + MutationObserver
   - PURE UI: Only DOM scanning and button rendering
   - NO API CALLS: Emits events for ActionHandler to orchestrate
   - Emits:
       URL_CHANGED - When URL changes
       PROFILE_VIEW_READY - When profile page detected (ActionHandler fetches data)
       CLAIM_TARGET - When user clicks Claim button
       ADD_TARGET - When user clicks Add Target button
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

  function findProfileHeader() {
    // Find the profile header with the user's name
    return (
      document.querySelector('.profile-container .profile-wrapper .basic-information') ||
      document.querySelector('.profile-wrapper .basic-information') ||
      document.querySelector('[class*="basic-information"]') ||
      document.querySelector('.content-title') ||
      null
    );
  }

  function injectProfileButtons(playerId, ctx) {
    const log = ctx.log || console.log;

    // Check if buttons already exist
    if (document.querySelector('.odin-profile-buttons')) {
      log('[ProfileInjection] Buttons already exist for player', playerId);
      return;
    }

    log('[ProfileInjection] ========================================');
    log('[ProfileInjection] INJECTING PROFILE BUTTONS');
    log('[ProfileInjection] Player ID:', playerId);
    log('[ProfileInjection] ========================================');

    const header = findProfileHeader();
    if (!header) {
      log('[ProfileInjection] ❌ Profile header not found - cannot inject buttons');
      log('[ProfileInjection] Tried selectors:');
      log('[ProfileInjection]   - .profile-container .profile-wrapper .basic-information');
      log('[ProfileInjection]   - .profile-wrapper .basic-information');
      log('[ProfileInjection]   - [class*="basic-information"]');
      log('[ProfileInjection]   - .content-title');
      return;
    }

    log('[ProfileInjection] ✓ Profile header found:', header.className);

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'odin-profile-buttons';
    buttonContainer.style.cssText = `
      display: inline-flex;
      gap: 8px;
      margin-left: 12px;
      vertical-align: middle;
    `;

    // Create Claim button
    const claimBtn = document.createElement('button');
    claimBtn.className = 'odin-profile-btn odin-claim-btn';
    claimBtn.textContent = '🎯 Claim';
    claimBtn.title = 'Claim this target for attack';
    claimBtn.style.cssText = `
      padding: 8px 14px;
      background: linear-gradient(135deg, #8B0000 0%, #6B0000 100%);
      color: #fff;
      border: 1px solid #8B0000;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 3px 8px rgba(139, 0, 0, 0.4);
      position: relative;
      overflow: hidden;
    `;

    // Add ripple effect on click
    const addRipple = (btn, e) => {
      const ripple = document.createElement('span');
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        left: ${x}px;
        top: ${y}px;
        transform: scale(0);
        animation: ripple-effect 0.6s ease-out;
        pointer-events: none;
      `;

      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    };

    // Add animation styles to document
    if (!document.getElementById('odin-profile-button-animations')) {
      const style = document.createElement('style');
      style.id = 'odin-profile-button-animations';
      style.textContent = `
        @keyframes ripple-effect {
          to {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    claimBtn.onmouseover = () => {
      claimBtn.style.transform = 'translateY(-3px) scale(1.05)';
      claimBtn.style.boxShadow = '0 6px 16px rgba(139, 0, 0, 0.6)';
    };
    claimBtn.onmouseout = () => {
      claimBtn.style.transform = 'translateY(0) scale(1)';
      claimBtn.style.boxShadow = '0 3px 8px rgba(139, 0, 0, 0.4)';
    };
    claimBtn.onclick = (e) => {
      addRipple(claimBtn, e);
      claimBtn.style.transform = 'scale(0.95)';
      setTimeout(() => {
        claimBtn.style.transform = 'translateY(0) scale(1)';
      }, 100);

      if (ctx.nexus) {
        ctx.nexus.emit('CLAIM_TARGET', { targetId: playerId, type: 'attack' });
        showProfileToast('Target claimed!', 'success');
      } else {
        showProfileToast('Odin Tools not initialized. Please reload the page.', 'error');
      }
    };

    // Create Target button
    const targetBtn = document.createElement('button');
    targetBtn.className = 'odin-profile-btn odin-target-btn';
    targetBtn.textContent = '📌 Add Target';
    targetBtn.title = 'Add to faction target list';
    targetBtn.style.cssText = `
      padding: 8px 14px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: #fff;
      border: 1px solid #3b82f6;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 3px 8px rgba(59, 130, 246, 0.4);
      position: relative;
      overflow: hidden;
    `;
    targetBtn.onmouseover = () => {
      targetBtn.style.transform = 'translateY(-3px) scale(1.05)';
      targetBtn.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.6)';
    };
    targetBtn.onmouseout = () => {
      targetBtn.style.transform = 'translateY(0) scale(1)';
      targetBtn.style.boxShadow = '0 3px 8px rgba(59, 130, 246, 0.4)';
    };
    targetBtn.onclick = (e) => {
      addRipple(targetBtn, e);
      targetBtn.style.transform = 'scale(0.95)';
      setTimeout(() => {
        targetBtn.style.transform = 'translateY(0) scale(1)';
      }, 100);

      if (ctx.nexus) {
        ctx.nexus.emit('ADD_TARGET', { targetId: playerId });
        showProfileToast('Added to target list!', 'success');
      } else {
        showProfileToast('Odin Tools not initialized. Please reload the page.', 'error');
      }
    };

    // Add buttons to container
    buttonContainer.appendChild(claimBtn);
    buttonContainer.appendChild(targetBtn);

    log('[ProfileInjection] ✓ Created 2 buttons (Claim, Add Target)');

    // Find a good place to insert the buttons
    // Try to find the name element
    const nameElement = header.querySelector('h4') || header.querySelector('.title-black') || header;

    if (nameElement) {
      // Insert after the name element
      if (nameElement.nextSibling) {
        nameElement.parentNode.insertBefore(buttonContainer, nameElement.nextSibling);
      } else {
        nameElement.parentNode.appendChild(buttonContainer);
      }
      log('[ProfileInjection] ✓ Buttons inserted after name element');
    } else {
      // Fallback: append to header
      header.appendChild(buttonContainer);
      log('[ProfileInjection] ✓ Buttons appended to header');
    }

    log('[ProfileInjection] ========================================');
    log('[ProfileInjection] ✓ PROFILE BUTTONS INJECTED SUCCESSFULLY');
    log('[ProfileInjection] ✓ Player:', playerId);
    log('[ProfileInjection] ✓ Button count: 2');
    log('[ProfileInjection] ✓ Event handlers: CLAIM_TARGET, ADD_TARGET');
    log('[ProfileInjection] ========================================');
  }

  function showProfileToast(message, type = 'info') {
    // Remove existing toast
    const existing = document.querySelector('.odin-profile-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'odin-profile-toast';
    toast.textContent = message;

    // Determine background based on type
    let background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
    if (type === 'success') background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
    if (type === 'error') background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    if (type === 'warning') background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';

    toast.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-100%);
      padding: 14px 24px;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      z-index: 999999;
      background: ${background};
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      min-width: 300px;
      text-align: center;
      opacity: 0;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    `;

    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';
      });
    });

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(-100%)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
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

      // Inject profile buttons if we have a valid player ID
      if (playerId && playerId !== 'unknown') {
        // Wait a bit for the page to fully render
        setTimeout(() => {
          injectProfileButtons(playerId, ctx);
        }, 500);
      }

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
      log('[ProfileInjection] ========================================');
      log('[ProfileInjection] INITIALIZING PROFILE INJECTION');
      log('[ProfileInjection] ========================================');

      log('[ProfileInjection] Step 1/3: Hooking history API...');
      hookHistory();
      log('[ProfileInjection] ✓ History hooks installed (pushState, replaceState)');

      log('[ProfileInjection] Step 2/3: Starting DOM observer...');
      const obs = startObserver();
      log('[ProfileInjection] ✓ MutationObserver active');

      log('[ProfileInjection] Step 3/3: Running initial page scan...');
      // Initial scan
      onUrlMaybeChanged('init');
      log('[ProfileInjection] ✓ Initial scan complete');

      // Periodic sanity scan (lightweight)
      log('[ProfileInjection] Starting periodic scan (every 2.5s)...');
      const t = setInterval(() => onUrlMaybeChanged('interval'), 2500);
      log('[ProfileInjection] ✓ Periodic scan active');

      log('[ProfileInjection] ========================================');
      log('[ProfileInjection] ✓ PROFILE INJECTION READY');
      log('[ProfileInjection] ✓ Will inject buttons on Torn profile pages');
      log('[ProfileInjection] ========================================');

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
