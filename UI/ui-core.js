// ui-core.js
// Core UI framework for Odin Tools
// Version: 3.1.0

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUICoreModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const log = ctx.log || console.log;

    const UI_VERSION = '3.1.0';

    // ============================================
    // STATE - PART 1: RESPONSIVE DEFAULT SIZE
    // ============================================
    const viewportW = window.innerWidth || 1024;
    const viewportH = window.innerHeight || 768;

    const initialWidth = Math.max(280, Math.min(380, viewportW - 40));
    const initialHeight = Math.max(360, Math.min(600, viewportH - 120));

    let state = {
      isOpen: false,
      activeTab: 'war-room',
      position: { side: 'right', top: 100 },
      size: { width: initialWidth, height: initialHeight },
    };

    let tabRenderers = new Map();
    let overlayElement = null;
    let buttonElement = null;

    // ============================================
    // SHADOW DOM MOUNT (FAILSAFE UI INJECTION)
    // ============================================
    const UI_HOST_ID = 'odin-shadow-host';
    const UI_MOUNT_ID = 'odin-shadow-mount';
    const UI_STYLE_ID = 'odin-shadow-styles';
    let uiHostEl = null;
    let uiShadowRoot = null;
    let uiMountEl = null;
    let uiStyleEl = null;
    let uiGuardObserver = null;
    let uiGuardScheduled = false;

    function _cssEscape(val) {
      try {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(val));
      } catch (_) {}
      return String(val).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function ensureUIMount() {
      // Try to keep UI isolated and immune to site CSS/DOM churn.
      try {
        if (!uiHostEl || !uiHostEl.isConnected) {
          uiHostEl = document.getElementById(UI_HOST_ID);
        }
        if (!uiHostEl) {
          uiHostEl = document.createElement('div');
          uiHostEl.id = UI_HOST_ID;
          uiHostEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
          (document.documentElement || document.body || document).appendChild(uiHostEl);
        }

        // Shadow DOM preferred
        uiShadowRoot = uiHostEl.shadowRoot;
        if (!uiShadowRoot && typeof uiHostEl.attachShadow === 'function') {
          uiShadowRoot = uiHostEl.attachShadow({ mode: 'open' });
        }

        if (uiShadowRoot) {
          uiMountEl = uiShadowRoot.getElementById(UI_MOUNT_ID);
          if (!uiMountEl) {
            uiMountEl = document.createElement('div');
            uiMountEl.id = UI_MOUNT_ID;
            uiMountEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;';
            uiShadowRoot.appendChild(uiMountEl);
          }

          uiStyleEl = uiShadowRoot.getElementById(UI_STYLE_ID);
          if (!uiStyleEl) {
            uiStyleEl = document.createElement('style');
            uiStyleEl.id = UI_STYLE_ID;
            uiStyleEl.textContent = STYLES;
            uiShadowRoot.appendChild(uiStyleEl);
          }

          // Re-attach core UI nodes if they got detached
          if (buttonElement && !buttonElement.isConnected) uiMountEl.appendChild(buttonElement);
          if (overlayElement && !overlayElement.isConnected) uiMountEl.appendChild(overlayElement);
        } else {
          // No shadow support: fall back to normal document injection.
          uiMountEl = null;
          uiStyleEl = null;
        }

        startUIMountGuard();
      } catch (e) {
        // Never let UI injection break the rest of Odin.
        log('[UI Core] ensureUIMount error:', e);
      }
    }

    function startUIMountGuard() {
      if (uiGuardObserver) return;
      try {
        uiGuardObserver = new MutationObserver(() => {
          if (uiGuardScheduled) return;
          uiGuardScheduled = true;
          setTimeout(() => {
            uiGuardScheduled = false;
            if (!uiHostEl || !uiHostEl.isConnected) {
              uiHostEl = null;
              uiShadowRoot = null;
              uiMountEl = null;
              uiStyleEl = null;
            }
            ensureUIMount();
          }, 50);
        });
        uiGuardObserver.observe(document.documentElement || document.body, { childList: true, subtree: false });
      } catch (e) {
        // Ignore observer failures
      }
    }

    function getUIMount() {
      ensureUIMount();
      return uiMountEl || document.body || document.documentElement;
    }

    function appendToUIMount(el) {
      const root = getUIMount();
      try {
        root.appendChild(el);
      } catch (e) {
        try {
          (document.body || document.documentElement).appendChild(el);
        } catch (_) {}
      }
      return el;
    }

    function uiGetById(id) {
      ensureUIMount();
      if (uiMountEl) {
        return uiMountEl.querySelector('#' + _cssEscape(id));
      }
      return document.getElementById(id);
    }

    function removeUIMount() {
      try {
        if (uiGuardObserver) {
          uiGuardObserver.disconnect();
          uiGuardObserver = null;
        }
        if (uiHostEl && uiHostEl.isConnected) uiHostEl.remove();
      } catch (_) {}
      uiHostEl = null;
      uiShadowRoot = null;
      uiMountEl = null;
      uiStyleEl = null;
    }

    // ============================================
    // TAB DEFINITIONS
    // ============================================
    const TABS = [
      { id: 'war-room', label: 'War Room', icon: '⚔️' },
      { id: 'targets', label: 'Targets', icon: '🎯' },
      { id: 'chain', label: 'Chain', icon: '🔗' },
      { id: 'retals', label: 'Retals', icon: '💥' },
      { id: 'watchers', label: 'Watchers', icon: '👁️' },
      { id: 'faction', label: 'Faction', icon: '🏰' },
      { id: 'leadership', label: 'Leadership', icon: '👑' },
      { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    // ============================================
    // STYLES - PART 2: BUTTON STYLING
    // ============================================
    const STYLES = `
      /* ShadowDOM mount safety */
      #odin-shadow-mount {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
      }
      .odin-toggle-btn, .odin-overlay, #odin-api-onboarding-backdrop, .odin-notification {
        pointer-events: auto;
      }

      .odin-overlay {
        position: fixed;
        z-index: 999999;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e2e8f0;
        display: flex;
        flex-direction: column;
        overflow: hidden;

        --font-color: #e2e8f0;
        --neon-glow: 0 0 8px rgba(102, 126, 234, 0.6);
      }

      .odin-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        cursor: move;
        user-select: none;
      }

      .odin-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 16px;
      }

      .odin-header-logo {
        font-size: 24px;
      }

      .odin-header-close {
        background: none;
        border: none;
        color: #a0aec0;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.15s;
      }

      .odin-header-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #e2e8f0;
      }

      .odin-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      .odin-tab {
        padding: 6px 12px;
        background: transparent;
        border: none;
        color: #718096;
        font-size: 12px;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .odin-tab:hover {
        background: rgba(255, 255, 255, 0.05);
        color: #a0aec0;
      }

      .odin-tab.active {
        background: rgba(102, 126, 234, 0.2);
        color: #667eea;
      }

      .odin-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }

      .odin-content::-webkit-scrollbar {
        width: 6px;
      }

      .odin-content::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
      }

      .odin-content::-webkit-scrollbar-thumb {
        background: rgba(102, 126, 234, 0.5);
        border-radius: 3px;
      }

      .odin-section {
        margin-bottom: 20px;
      }

      .odin-section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        position: sticky;
        top: 0;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        z-index: 1;
      }

      .odin-section-title {
        font-weight: 600;
        font-size: 14px;
        color: #e2e8f0;
      }

      .odin-card {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
      }

      .odin-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .odin-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .odin-btn-primary {
        background: #667eea;
        color: white;
      }

      .odin-btn-primary:hover:not(:disabled) {
        background: #5a67d8;
      }

      .odin-btn-success {
        background: #48bb78;
        color: white;
      }

      .odin-btn-success:hover:not(:disabled) {
        background: #38a169;
      }

      .odin-btn-warning {
        background: #ed8936;
        color: white;
      }

      .odin-btn-warning:hover:not(:disabled) {
        background: #dd6b20;
      }

      .odin-btn-danger {
        background: #e53e3e;
        color: white;
      }

      .odin-btn-danger:hover:not(:disabled) {
        background: #c53030;
      }

      .odin-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #e2e8f0;
      }

      .odin-btn-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.15);
      }

      .odin-toggle-btn {
        position: fixed;
        z-index: 999998;
        width: 60px;
        height: 60px;
        border-radius: 12px;
        background: linear-gradient(135deg, #00c896 0%, #00b585 100%);
        border: none;
        color: white;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
        transition: all 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }

      .odin-toggle-btn:hover {
        background: linear-gradient(135deg, #00b585 0%, #00a376 100%);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
        transform: translateY(-2px);
      }
      
      .odin-toggle-btn-icon {
        font-size: 24px;
        line-height: 1;
      }
      
      .odin-toggle-btn-text {
        font-size: 9px;
        font-weight: 500;
        opacity: 0.9;
      }

      .odin-empty {
        text-align: center;
        padding: 32px;
        color: #718096;
      }

      .odin-empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }

      .odin-resize-handle {
        position: absolute;
        width: 12px;
        height: 12px;
        cursor: nwse-resize;
      }

      /* PART 2: GLOBAL BUTTON STYLING */
      #odin-overlay button {
        background: linear-gradient(135deg, #303030, #404040);
        color: var(--font-color);
        border: 1px solid #505050;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2), var(--neon-glow);
      }

      #odin-overlay button:hover {
        background: linear-gradient(135deg, #404040, #505050);
        color: #ffffff;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.3), var(--neon-glow);
      }

      #odin-overlay button:active {
        transform: scale(0.98);
        background: #353535;
      }

      .odin-menu-btn:active {
        transform: scale(0.98);
        background-color: #353535;
      }

      /* PART 3: API ONBOARDING MODAL STYLES */
      #odin-api-onboarding-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        z-index: 1000000;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .odin-api-modal {
        width: min(520px, 90vw);
        max-height: min(80vh, 640px);
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        display: flex;
        flex-direction: column;
        padding: 16px 18px;
        color: #e2e8f0;
      }

      .odin-api-modal h2 {
        margin: 0 0 8px 0;
        font-size: 18px;
        font-weight: 600;
        color: #667eea;
      }

      .odin-api-modal-body {
        margin-top: 8px;
        margin-bottom: 12px;
        padding-right: 4px;
        overflow-y: auto;
        flex: 1;
        font-size: 12px;
        line-height: 1.4;
      }

      .odin-api-modal-body::-webkit-scrollbar {
        width: 6px;
      }

      .odin-api-modal-body::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.2);
      }

      .odin-api-modal-body::-webkit-scrollbar-thumb {
        background: rgba(102, 126, 234, 0.5);
        border-radius: 3px;
      }

      .odin-api-modal-body p {
        margin: 8px 0;
        color: #cbd5e0;
      }

      .odin-api-modal-body ul {
        margin: 8px 0 8px 16px;
        color: #cbd5e0;
      }

      .odin-api-modal-body li {
        margin: 4px 0;
      }

      .odin-api-modal-body a {
        color: #667eea;
        text-decoration: none;
      }

      .odin-api-modal-body a:hover {
        text-decoration: underline;
      }

      .odin-api-input-row {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 8px;
      }

      .odin-api-input-row label {
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
      }

      .odin-api-input-row input {
        width: 100%;
        padding: 8px 10px;
        border-radius: 6px;
        border: 1px solid rgba(255,255,255,0.15);
        background: rgba(0,0,0,0.3);
        color: #e2e8f0;
        font-size: 13px;
      }

      .odin-api-input-row input:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
      }

      .odin-api-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 8px;
      }

      .odin-api-status {
        font-size: 11px;
        margin-top: 4px;
        color: #a0aec0;
      }

      .odin-api-status.error {
        color: #fc8181;
      }

      .odin-api-status.success {
        color: #68d391;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;

    // ============================================
    // UI HELPERS
    // ============================================
    const helpers = {
      createSection(title, icon = '') {
        const section = document.createElement('div');
        section.className = 'odin-section';

        const header = document.createElement('div');
        header.className = 'odin-section-header';
        header.innerHTML = `
          ${icon ? `<span>${icon}</span>` : ''}
          <h3 class="odin-section-title">${title}</h3>
        `;

        section.appendChild(header);
        return section;
      },

      createCard(content) {
        const card = document.createElement('div');
        card.className = 'odin-card';
        if (typeof content === 'string') {
          card.innerHTML = content;
        } else if (content instanceof Element) {
          card.appendChild(content);
        }
        return card;
      },

      createButton(text, options = {}) {
        const button = document.createElement('button');
        button.className = `odin-btn ${options.variant ? 'odin-btn-' + options.variant : ''}`;
        button.textContent = text;

        if (options.icon) {
          button.innerHTML = `<span>${options.icon}</span><span>${text}</span>`;
        }

        if (options.disabled) {
          button.disabled = true;
        }

        if (options.onClick) {
          button.addEventListener('click', options.onClick);
        }

        return button;
      },

      createEmptyState(icon, message) {
        return `
          <div class="odin-empty">
            <div class="odin-empty-icon">${icon}</div>
            <p>${message}</p>
          </div>
        `;
      },
    };

    // ============================================
    // PART 3: SETTINGS HELPERS
    // ============================================
    function getSettings() {
      try {
        return storage.getJSON('odin_settings') || {};
      } catch (e) {
        log('[UI Core] Error reading settings:', e);
        return {};
      }
    }

    function saveSettings(settings) {
      try {
        storage.setJSON('odin_settings', settings);
        if (nexus && typeof nexus.emit === 'function') {
          nexus.emit('SETTINGS_UPDATED', settings);
        }
      } catch (e) {
        log('[UI Core] Error saving settings:', e);
      }
    }

    // ============================================
    // CORE FUNCTIONS
    // ============================================
    function loadState() {
      try {
        const saved = storage.getJSON('odin_ui_state');
        if (saved) {
          state = { ...state, ...saved };
        }
      } catch (e) {
        log('[UI Core] Load state error:', e);
      }
    }

    function saveState() {
      try {
        storage.setJSON('odin_ui_state', {
          position: state.position,
          size: state.size,
          activeTab: state.activeTab,
        });
      } catch (e) {
        log('[UI Core] Save state error:', e);
      }
    }

    function injectStyles() {
      // In Shadow DOM mode, styles are injected by ensureUIMount().
      ensureUIMount();

      // Fallback: if Shadow DOM not available, inject into <head>.
      if (uiMountEl) return;

      try {
        if (document.getElementById('odin-styles')) return;
        const style = document.createElement('style');
        style.id = 'odin-styles';
        style.textContent = STYLES;
        if (document.head) {
          document.head.appendChild(style);
        } else {
          // Head not ready yet — retry shortly.
          setTimeout(() => {
            try {
              if (!document.getElementById('odin-styles') && document.head) document.head.appendChild(style);
            } catch (_) {}
          }, 250);
        }
      } catch (e) {
        log('[UI Core] injectStyles error:', e);
      }
    }

    // PART 1: UPDATED TOGGLE BUTTON WITH RESPONSIVE POSITIONING
    function createToggleButton() {
      if (buttonElement) return;

      ensureUIMount();

      buttonElement = document.createElement('button');
      buttonElement.className = 'odin-toggle-btn odin-menu-btn';
      buttonElement.innerHTML = `
        <div class="odin-toggle-btn-icon">🐺</div>
        <div class="odin-toggle-btn-text">ODIN</div>
      `;
      buttonElement.title = 'Odin Tools';

      // Essential inline styles (in case CSS injection is blocked/overridden)
      buttonElement.style.position = 'fixed';
      buttonElement.style.zIndex = '2147483647';
      buttonElement.style.width = '60px';
      buttonElement.style.height = '60px';
      buttonElement.style.borderRadius = '12px';
      buttonElement.style.border = 'none';
      buttonElement.style.padding = '0';
      buttonElement.style.margin = '0';
      buttonElement.style.display = 'flex';
      buttonElement.style.flexDirection = 'column';
      buttonElement.style.alignItems = 'center';
      buttonElement.style.justifyContent = 'center';
      buttonElement.style.gap = '2px';
      buttonElement.style.cursor = 'pointer';
      buttonElement.style.boxShadow = '0 3px 8px rgba(0,0,0,0.25)';
      buttonElement.style.color = '#fff';
      buttonElement.style.fontFamily = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
      buttonElement.style.background = 'linear-gradient(135deg, #00c896 0%, #00b585 100%)';
      buttonElement.style.pointerEvents = 'auto';

      // Position at bottom-left corner like Torn's chat buttons
      buttonElement.style.left = '16px';
      buttonElement.style.bottom = '16px';

      buttonElement.addEventListener('click', toggleOverlay);

      appendToUIMount(buttonElement);
    }

    // PART 1: UPDATED OVERLAY WITH RESPONSIVE SIZING
    function createOverlay() {
      if (overlayElement) return;

      ensureUIMount();

      overlayElement = document.createElement('div');
      overlayElement.className = 'odin-overlay';
      overlayElement.id = 'odin-overlay';

      // Essential inline styles for visibility (in case CSS injection is blocked)
      overlayElement.style.position = 'fixed';
      overlayElement.style.zIndex = '2147483647';
      overlayElement.style.display = 'none';
      overlayElement.style.flexDirection = 'column';
      overlayElement.style.borderRadius = '12px';
      overlayElement.style.overflow = 'hidden';
      overlayElement.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)';
      overlayElement.style.color = '#e2e8f0';
      overlayElement.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)';
      overlayElement.style.pointerEvents = 'auto';

      // Size and position with viewport awareness
      const viewportW = window.innerWidth || 1024;
      const viewportH = window.innerHeight || 768;

      const maxWidth = Math.max(280, viewportW - 40);
      const maxHeight = Math.max(320, viewportH - 80);

      const width = Math.min(state.size.width || initialWidth, maxWidth);
      const height = Math.min(state.size.height || initialHeight, maxHeight);

      overlayElement.style.width = `${width}px`;
      overlayElement.style.height = `${height}px`;

      const side = state.position.side || 'right';
      const sideOffset = viewportW < 600 ? 12 : 80;
      overlayElement.style[side] = `${sideOffset}px`;

      const top = state.position.top || 100;
      const maxTop = Math.max(20, viewportH - height - 20);
      overlayElement.style.top = `${Math.min(top, maxTop)}px`;

      // Header
      const header = document.createElement('div');
      header.className = 'odin-header';
      header.innerHTML = `
        <div class="odin-header-title">
          <span class="odin-header-logo">🐺</span>
          <span>Odin Tools</span>
        </div>
        <button class="odin-header-close" id="odin-close">✕</button>
      `;

      // Tabs
      const tabs = document.createElement('div');
      tabs.className = 'odin-tabs';
      tabs.innerHTML = TABS.map((tab) => `
        <button class="odin-tab ${state.activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
          <span>${tab.icon}</span>
          <span>${tab.label}</span>
        </button>
      `).join('');

      // Content
      const content = document.createElement('div');
      content.className = 'odin-content';
      content.id = 'odin-content';

      overlayElement.appendChild(header);
      overlayElement.appendChild(tabs);
      overlayElement.appendChild(content);

      // Event listeners
      header.addEventListener('mousedown', (e) => {
        if (e.target.id !== 'odin-close') {
          startDrag(e, overlayElement);
        }
      });

      overlayElement.querySelector('#odin-close').addEventListener('click', () => {
        toggleOverlay(false);
      });

      tabs.querySelectorAll('.odin-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          setActiveTab(tab.dataset.tab);
        });
      });

      appendToUIMount(overlayElement);

      // Make resizable
      addResizeHandle(overlayElement);

      // Initial render
      renderContent();
    }

    function toggleOverlay(forceState) {
      state.isOpen = forceState !== undefined ? forceState : !state.isOpen;

      if (state.isOpen) {
        if (!overlayElement) {
          createOverlay();
        }
        overlayElement.style.display = 'flex';
      } else if (overlayElement) {
        overlayElement.style.display = 'none';
      }
    }

    function setActiveTab(tabId) {
      state.activeTab = tabId;
      saveState();

      // Update tab buttons
      if (overlayElement) {
        overlayElement.querySelectorAll('.odin-tab').forEach((tab) => {
          tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
      }

      renderContent();
    }

    function renderContent() {
      const contentEl = document.getElementById('odin-content');
      if (!contentEl) {
        log('[UI Core] ERROR: Content element not found!');
        return;
      }

      const renderer = tabRenderers.get(state.activeTab);
      
      log('[UI Core] Rendering tab:', state.activeTab);
      log('[UI Core] Renderer found:', !!renderer);
      log('[UI Core] Total registered tabs:', tabRenderers.size);
      log('[UI Core] Registered tab IDs:', Array.from(tabRenderers.keys()));
      
      if (renderer) {
        try {
          log('[UI Core] Calling renderer for:', state.activeTab);
          const content = renderer();
          
          if (typeof content === 'string') {
            contentEl.innerHTML = content;
            log('[UI Core] Rendered string content, length:', content.length);
          } else if (content instanceof Element) {
            contentEl.innerHTML = '';
            contentEl.appendChild(content);
            log('[UI Core] Rendered element content');
          } else {
            log('[UI Core] WARNING: Renderer returned unexpected type:', typeof content);
            contentEl.innerHTML = `
              <div class="odin-empty">
                <div class="odin-empty-icon">⚠️</div>
                <p>Invalid content type returned</p>
                <p style="font-size: 12px; color: #718096;">Expected string or Element, got: ${typeof content}</p>
              </div>
            `;
          }
        } catch (e) {
          log('[UI Core] Render error for', state.activeTab, ':', e);
          console.error('[UI Core] Full error:', e);
          contentEl.innerHTML = `
            <div class="odin-empty">
              <div class="odin-empty-icon">⚠️</div>
              <p>Error rendering ${state.activeTab}</p>
              <p style="font-size: 12px; color: #fc8181; margin-top: 8px;">${e.message}</p>
              <p style="font-size: 11px; color: #718096; margin-top: 8px;">Check browser console for full error details</p>
            </div>
          `;
        }
      } else {
        // Show informative message about missing module
        const tab = TABS.find(t => t.id === state.activeTab);
        const tabName = tab ? tab.label : state.activeTab;
        const tabIcon = tab ? tab.icon : '📋';
        const registeredCount = tabRenderers.size;
        const registeredList = Array.from(tabRenderers.keys()).join(', ') || 'none';
        
        log('[UI Core] No renderer for:', state.activeTab);
        
        contentEl.innerHTML = `
          <div class="odin-empty">
            <div class="odin-empty-icon">${tabIcon}</div>
            <p style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">${tabName}</p>
            <p style="font-size: 13px; color: #a0aec0; margin-bottom: 16px;">
              Module not loaded
            </p>
            <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 6px; font-size: 11px; text-align: left;">
              <p style="margin-bottom: 8px;"><strong>Debug Info:</strong></p>
              <p style="color: #718096; margin: 4px 0;">Tab ID: <code style="background: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 3px;">${state.activeTab}</code></p>
              <p style="color: #718096; margin: 4px 0;">Registered Modules: ${registeredCount}</p>
              <p style="color: #718096; margin: 4px 0; word-break: break-all;">
                Loaded: ${registeredList}
              </p>
            </div>
            <p style="font-size: 11px; color: #718096; margin-top: 16px;">
              The ${tabName} module (ui-${state.activeTab}.js) needs to be loaded after ui-core.js
            </p>
          </div>
        `;
      }
    }

    // ============================================
    // DRAG AND RESIZE
    // ============================================
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    let dragElement = null;

    function makeDraggable(element, onEnd) {
      element.addEventListener('mousedown', (e) => {
        if (e.target !== element) return;
        startDrag(e, element, onEnd);
      });
    }

    function startDrag(e, element, onEnd) {
      isDragging = true;
      dragElement = element;
      dragOffset = {
        x: e.clientX - element.offsetLeft,
        y: e.clientY - element.offsetTop,
      };

      const onMove = (e) => {
        if (!isDragging) return;

        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;

        // Clamp to viewport
        const maxX = window.innerWidth - element.offsetWidth;
        const maxY = window.innerHeight - element.offsetHeight;

        element.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
        element.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        element.style.right = 'auto';
      };

      const onUp = () => {
        isDragging = false;

        if (onEnd) {
          const rect = element.getBoundingClientRect();
          const side = rect.left > window.innerWidth / 2 ? 'right' : 'left';
          onEnd({ side, top: rect.top });
        }

        // Save overlay position
        if (element === overlayElement) {
          const rect = element.getBoundingClientRect();
          state.position.top = rect.top;
          saveState();
        }

        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function addResizeHandle(element) {
      const handle = document.createElement('div');
      handle.className = 'odin-resize-handle';
      handle.style.bottom = '0';
      handle.style.right = '0';

      handle.addEventListener('mousedown', (e) => {
        e.stopPropagation();

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.offsetWidth;
        const startHeight = element.offsetHeight;

        const onMove = (e) => {
          const newWidth = Math.max(300, Math.min(600, startWidth + (e.clientX - startX)));
          const newHeight = Math.max(400, Math.min(800, startHeight + (e.clientY - startY)));

          element.style.width = `${newWidth}px`;
          element.style.height = `${newHeight}px`;
        };

        const onUp = () => {
          state.size.width = element.offsetWidth;
          state.size.height = element.offsetHeight;
          saveState();

          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      element.appendChild(handle);
    }

    // ============================================
    // PART 3: API KEY ONBOARDING MODAL
    // ============================================
    function renderApiOnboardingModal() {
      ensureUIMount();

      // Avoid duplicate modals
      const existing = uiGetById('odin-api-onboarding-backdrop');
      if (existing) return;
      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.id = 'odin-api-onboarding-backdrop';
      backdrop.style.position = 'fixed';
      backdrop.style.left = '0';
      backdrop.style.top = '0';
      backdrop.style.width = '100vw';
      backdrop.style.height = '100vh';
      backdrop.style.zIndex = '2147483647';
      backdrop.style.display = 'flex';
      backdrop.style.alignItems = 'center';
      backdrop.style.justifyContent = 'center';
      backdrop.style.background = 'rgba(0, 0, 0, 0.7)';
      backdrop.style.backdropFilter = 'blur(2px)';
      backdrop.style.pointerEvents = 'auto';

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'odin-api-modal';

      // Header
      const header = document.createElement('h2');
      header.textContent = '🐺 Welcome to Odin Tools';

      // Body with disclaimer
      const body = document.createElement('div');
      body.className = 'odin-api-modal-body';
      body.innerHTML = `
        <p><strong>Odin Tools uses the official Torn API to enhance your faction coordination experience.</strong></p>
        
        <p><strong>What is the Torn API?</strong></p>
        <p>The Torn API is designed as a read-only interface for fetching information about your Torn account (player, faction, etc.). It cannot be used to log in to your account, spend items, or perform in-game actions.</p>
        
        <p><strong>What Odin Tools does:</strong></p>
        <ul>
          <li>Uses your API key solely to fetch data needed for war tracking, chain watching, target information, and related game statistics</li>
          <li>Stores your API key locally only, using the userscript's browser storage (Tampermonkey GM storage / local IndexedDB)</li>
          <li>Sends only derived data (like aggregated war stats, chain logs, and watcher information) to Odin's backend databases—your API key is never transmitted to external servers</li>
          <li>Respects Torn's API rules, including call limits and caching</li>
        </ul>
        
        <p><strong>What Odin Tools will NEVER do:</strong></p>
        <ul>
          <li>Ask for your Torn password, email, or 2FA codes</li>
          <li>Send your API key to external databases or third-party servers</li>
          <li>Use your API key to perform in-game actions</li>
        </ul>
        
        <p><strong>Your Privacy & Security:</strong></p>
        <p>Your Torn API key is stored locally only and is designed to remain private. You can revoke your API key at any time via Torn's official settings page. You may also create a dedicated custom key for Odin Tools with only the selections you want this tool to use, as allowed by Torn's API documentation.</p>
        
        <p><strong>Important Note:</strong></p>
        <p>As with any third-party tool, you should only use Odin Tools if you're comfortable with how it accesses your data.</p>
        
        <p style="font-size: 11px; margin-top: 12px;">
          For full details about Torn's API and access levels, please see the official documentation at 
          <a href="https://www.torn.com/api.html" target="_blank" rel="noopener">https://www.torn.com/api.html</a>
        </p>
      `;

      // Input section
      const inputSection = document.createElement('div');
      inputSection.innerHTML = `
        <div class="odin-api-input-row">
          <label for="odin-api-key-input">
            Torn API Key 
            <span style="font-weight: normal; color: #a0aec0;">(Find in Torn → Settings → API Keys)</span>
          </label>
          <input 
            type="text" 
            id="odin-api-key-input" 
            placeholder="Enter your Torn API key..."
            autocomplete="off"
          />
          <div id="odin-api-status" class="odin-api-status"></div>
        </div>
      `;

      // Footer with buttons
      const footer = document.createElement('div');
      footer.className = 'odin-api-modal-footer';

      const openApiPageBtn = helpers.createButton('Open Torn API Settings', {
        variant: 'secondary',
        onClick: () => {
          window.open('https://www.torn.com/preferences.php#tab=api', '_blank', 'noopener');
        },
      });

      const validateBtn = helpers.createButton('Validate & Save', {
        variant: 'primary',
        onClick: handleValidateAndSave,
      });

      footer.appendChild(openApiPageBtn);
      footer.appendChild(validateBtn);

      // Assemble modal
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(inputSection);
      modal.appendChild(footer);

      backdrop.appendChild(modal);
      appendToUIMount(backdrop);

      // Focus input
      setTimeout(() => {
        document.getElementById('odin-api-key-input')?.focus();
      }, 100);

      // Handle Enter key
      document.getElementById('odin-api-key-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleValidateAndSave();
        }
      });
    }

    async function handleValidateAndSave() {
      const input = document.getElementById('odin-api-key-input');
      const statusEl = document.getElementById('odin-api-status');
      const validateBtn = document.querySelector('.odin-api-modal-footer .odin-btn-primary');

      if (!input || !statusEl || !validateBtn) return;

      const key = input.value.trim();

      if (!key) {
        statusEl.textContent = 'Please enter an API key';
        statusEl.className = 'odin-api-status error';
        return;
      }

      // Disable button and show loading
      validateBtn.disabled = true;
      validateBtn.textContent = 'Validating...';
      statusEl.textContent = 'Checking API key with Torn...';
      statusEl.className = 'odin-api-status';

      try {
        // Check if API module is available
        if (!ctx.api || !ctx.api.validateTornApiKey) {
          throw new Error('API module not initialized');
        }

        // Validate the key
        const keyInfo = await ctx.api.validateTornApiKey(key);

        // Show success info
        const selectionsCount = Object.keys(keyInfo.selections || {}).length;
        statusEl.textContent = `Valid! Access: ${keyInfo.access_type} (Level ${keyInfo.access_level}), ${selectionsCount} selection groups`;
        statusEl.className = 'odin-api-status success';

        // Save to settings
        const currentSettings = getSettings();
        const updatedSettings = { ...currentSettings, tornApiKey: key };
        saveSettings(updatedSettings);

        // Set in API module
        ctx.api.setTornApiKey(key);

        // Wait a moment for user to see success, then close modal
        setTimeout(() => {
          const backdrop = uiGetById('odin-api-onboarding-backdrop');
          if (backdrop) {
            backdrop.remove();
          }

          // Show notification
          if (window.OdinUI && window.OdinUI.showNotification) {
            window.OdinUI.showNotification('Torn API key saved successfully!', 'success');
          }

          log('[UI Core] API key validated and saved');
        }, 1500);

      } catch (error) {
        log('[UI Core] API key validation failed:', error);

        statusEl.textContent = `Error: ${error.message}`;
        statusEl.className = 'odin-api-status error';

        // Re-enable button
        validateBtn.disabled = false;
        validateBtn.textContent = 'Validate & Save';
      }
    }

    function checkAndShowApiOnboarding() {
      const settings = getSettings();
      
      // If no Torn API key exists, show the onboarding modal
      if (!settings.tornApiKey) {
        log('[UI Core] No API key found, showing onboarding modal');
        // Small delay to ensure DOM is ready
        setTimeout(renderApiOnboardingModal, 500);
      }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const OdinUI = {
      version: UI_VERSION,
      helpers,

      registerTabContent(tabId, renderer) {
        tabRenderers.set(tabId, renderer);
        log('[UI Core] Tab registered:', tabId);

        // Re-render if this is the active tab
        if (state.activeTab === tabId && state.isOpen) {
          renderContent();
        }
      },

      refreshContent() {
        renderContent();
      },

      setActiveTab,

      toggle(forceState) {
        toggleOverlay(forceState);
      },

      getState() {
        return { ...state };
      },

      showNotification(message, type = 'info') {
        // Simple notification implementation
        const notif = document.createElement('div');
        notif.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#48bb78' : '#667eea'};
          color: white;
          border-radius: 8px;
          font-family: -apple-system, sans-serif;
          font-size: 14px;
          z-index: 1000000;
          animation: slideIn 0.3s ease;
        `;
        notif.textContent = message;
        appendToUIMount(notif);

        setTimeout(() => {
          notif.remove();
        }, 3000);
      },
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[UI Core] Initializing v' + UI_VERSION);

      loadState();
      ensureUIMount();
      injectStyles();
      createToggleButton();

      // Failsafe: if Torn rebuilds DOM, re-attach the toggle button.
      setTimeout(() => {
        try {
          ensureUIMount();
          if (buttonElement && !buttonElement.isConnected) appendToUIMount(buttonElement);
        } catch (_) {}
      }, 750);

      // Expose globally
      window.OdinUI = OdinUI;

      // Emit ready event
      nexus.emit('UI_READY', { version: UI_VERSION });
      log('[UI Core] Ready');

      // PART 3: Check for API key and show onboarding if needed
      checkAndShowApiOnboarding();
    }

    function destroy() {
      log('[UI Core] Destroying...');

      if (overlayElement) {
        overlayElement.remove();
        overlayElement = null;
      }

      if (buttonElement) {
        buttonElement.remove();
        buttonElement = null;
      }

      const styles = document.getElementById('odin-styles');
      if (styles) styles.remove();
      // Shadow DOM styles are removed with the host
      removeUIMount();

      const onboardingBackdrop = uiGetById('odin-api-onboarding-backdrop');
      if (onboardingBackdrop) onboardingBackdrop.remove();

      window.OdinUI = null;
      log('[UI Core] Destroyed');
    }

    return { id: 'ui-core', init, destroy };
  });
})();
