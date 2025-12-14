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
      if (document.getElementById('odin-styles')) return;

      const style = document.createElement('style');
      style.id = 'odin-styles';

      style.textContent = STYLES + `
        /* Odin mobile hardening */
        #odin-toggle-btn,
        .odin-toggle-btn {
          z-index: 2147483647 !important;
          position: fixed !important;
          display: flex !important;
          visibility: visible !important;
          opacity: 0.98 !important;
          pointer-events: auto !important;
        }
        #odin-overlay,
        .odin-overlay {
          z-index: 2147483646 !important;
          position: fixed !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }
      `;
      document.head.appendChild(style);
    }


    // ============================================
    // VISIBILITY + PERSISTENCE GUARDS (MOBILE FIX)
    // ============================================
    let persistenceGuardsInstalled = false;
    let domPersistenceObserver = null;

    function installPersistenceGuards() {
      if (persistenceGuardsInstalled) return;
      persistenceGuardsInstalled = true;

      const parent = document.body || document.documentElement;
      if (!parent) return;

      const onMutate = () => {
        const p = document.body || document.documentElement;
        if (!p) return;

        // Re-inject styles if needed
        if (!document.getElementById('odin-styles')) {
          injectStyles();
        }

        // Re-attach toggle button / overlay if Torn replaces DOM nodes
        if (buttonElement && !p.contains(buttonElement)) {
          p.appendChild(buttonElement);
        }
        if (overlayElement && !p.contains(overlayElement)) {
          p.appendChild(overlayElement);
        }
      };

      domPersistenceObserver = new MutationObserver(() => onMutate());
      domPersistenceObserver.observe(parent, { childList: true, subtree: true });

      const onViewportChange = () => {
        ensureToggleButtonVisible();
        if (state.isOpen) ensureOverlayVisible();
      };

      window.addEventListener('resize', onViewportChange, { passive: true });
      window.addEventListener('orientationchange', onViewportChange, { passive: true });

      setTimeout(onViewportChange, 200);
    }

    function ensureToggleButtonVisible() {
      if (!buttonElement) return;

      // Force visibility in case external CSS meddles with it
      buttonElement.style.display = 'flex';
      buttonElement.style.visibility = 'visible';
      if (!buttonElement.style.opacity) buttonElement.style.opacity = '0.98';

      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      if (!vw || !vh) return;

      const r = buttonElement.getBoundingClientRect();
      const margin = 6;

      // If it's off-screen (or clipped), reset to safe bottom-left.
      const offscreen =
        r.width === 0 ||
        r.height === 0 ||
        r.right < margin ||
        r.bottom < margin ||
        r.left > (vw - margin) ||
        r.top > (vh - margin);

      if (offscreen) {
        buttonElement.style.left = '16px';
        buttonElement.style.right = 'auto';
        buttonElement.style.top = 'auto';
        buttonElement.style.bottom = 'calc(16px + env(safe-area-inset-bottom, 0px))';
      }
    }

    function ensureOverlayVisible() {
      if (!overlayElement) return;

      // Critical hardening
      overlayElement.style.position = 'fixed';
      overlayElement.style.zIndex = '2147483646';
      overlayElement.style.visibility = 'visible';
      overlayElement.style.pointerEvents = 'auto';

      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;
      if (!vw || !vh) return;

      // Clamp size (in case viewport changed, especially on mobile)
      const maxWidth = Math.max(280, vw - 24);
      const maxHeight = Math.max(320, vh - 24);

      const currentW = overlayElement.getBoundingClientRect().width || parseFloat(overlayElement.style.width) || initialWidth;
      const currentH = overlayElement.getBoundingClientRect().height || parseFloat(overlayElement.style.height) || initialHeight;

      const nextW = Math.min(currentW, maxWidth);
      const nextH = Math.min(currentH, maxHeight);

      overlayElement.style.width = `${nextW}px`;
      overlayElement.style.height = `${nextH}px`;

      // Clamp position
      const r = overlayElement.getBoundingClientRect();
      const pad = 8;

      let left = r.left;
      let top = r.top;

      // Convert right-based placement to left-based for clamping
      if (!Number.isFinite(left)) left = pad;
      if (!Number.isFinite(top)) top = pad;

      if (left < pad) left = pad;
      if (top < pad) top = pad;

      if (left + r.width > vw - pad) left = Math.max(pad, vw - r.width - pad);
      if (top + r.height > vh - pad) top = Math.max(pad, vh - r.height - pad);

      overlayElement.style.left = `${left}px`;
      overlayElement.style.right = 'auto';
      overlayElement.style.top = `${top}px`;
    }

    // PART 1: UPDATED TOGGLE BUTTON WITH RESPONSIVE POSITIONING
    function createToggleButton() {
      if (buttonElement) return;

      // Ensure styles are injected, but do not rely on them for visibility.
      injectStyles();

      buttonElement = document.createElement('button');
      buttonElement.className = 'odin-toggle-btn odin-menu-btn';
      buttonElement.id = 'odin-toggle-btn';
      buttonElement.innerHTML = `
        <div class="odin-toggle-btn-icon">🐺</div>
        <div class="odin-toggle-btn-text">ODIN</div>
      `;
      buttonElement.title = 'Odin Tools';

      // Inline styles as a hard fallback in case site CSS or style injection interferes.
      // Also uses safe-area inset for mobile devices (iOS/Android gesture bars).
      buttonElement.style.cssText = `
        position: fixed !important;
        left: 16px !important;
        right: auto !important;
        top: auto !important;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px)) !important;
        z-index: 2147483647 !important;
        width: 60px !important;
        height: 60px !important;
        border-radius: 12px !important;
        background: linear-gradient(135deg, #00c896 0%, #00b585 100%) !important;
        border: none !important;
        color: #ffffff !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25) !important;
        transition: all 0.2s ease !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 2px !important;
        opacity: 0.98 !important;
        pointer-events: auto !important;
      `;

      buttonElement.addEventListener('click', () => {
        try {
          toggleOverlay();
        } catch (e) {
          log('[UI Core] Toggle button click error:', e);
        }
      });

      // Append to DOM (body if available, otherwise html).
      const parent = document.body || document.documentElement;
      parent.appendChild(buttonElement);

      // Ensure it stays present even if Torn dynamically replaces DOM sections.
      installPersistenceGuards();

      // Ensure it's on-screen.
      setTimeout(() => {
        ensureToggleButtonVisible();
      }, 0);
    }

    // PART 1: UPDATED OVERLAY WITH RESPONSIVE SIZING
    function createOverlay() {
      if (overlayElement) return;

      // Ensure styles are injected, but do not rely on them for positioning/z-index.
      injectStyles();

      overlayElement = document.createElement('div');
      overlayElement.className = 'odin-overlay';
      overlayElement.id = 'odin-overlay';

      // Hard fallback styles (critical for visibility on mobile / CSP / style conflicts).
      overlayElement.style.position = 'fixed';
      overlayElement.style.zIndex = '2147483646';
      overlayElement.style.display = 'none';
      overlayElement.style.flexDirection = 'column';
      overlayElement.style.pointerEvents = 'auto';

      // Size and position with viewport awareness
      const viewportW = window.innerWidth || 1024;
      const viewportH = window.innerHeight || 768;

      const maxWidth = Math.max(280, viewportW - 24);
      const maxHeight = Math.max(320, viewportH - 24);

      const width = Math.min(state.size.width || initialWidth, maxWidth);
      const height = Math.min(state.size.height || initialHeight, maxHeight);

      overlayElement.style.width = `${width}px`;
      overlayElement.style.height = `${height}px`;

      const side = state.position.side || 'right';
      const sideOffset = viewportW < 600 ? 12 : 80;
      overlayElement.style.left = 'auto';
      overlayElement.style.right = 'auto';
      overlayElement.style[side] = `${sideOffset}px`;

      const top = state.position.top || 100;
      const maxTop = Math.max(12, viewportH - height - 12);
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

      // Close button
      header.querySelector('#odin-close')?.addEventListener('click', () => toggleOverlay(false));

      // Tab switching
      tabs.querySelectorAll('.odin-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.querySelectorAll('.odin-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          setActiveTab(tab.dataset.tab);
        });
      });

      const parent = document.body || document.documentElement;
      parent.appendChild(overlayElement);

      // Keep overlay in DOM even if Torn replaces content.
      installPersistenceGuards();

      // Make draggable and resizable
      makeDraggable(overlayElement, header);
      addResizeHandle(overlayElement);

      // Initial render
      renderContent();

      // Ensure overlay stays within viewport on mobile.
      setTimeout(() => {
        ensureOverlayVisible();
      }, 0);
    }

    function toggleOverlay(forceState) {
      state.isOpen = forceState !== undefined ? forceState : !state.isOpen;

      if (state.isOpen) {
        if (!overlayElement) {
          createOverlay();
        }
        overlayElement.style.display = 'flex';
        // Mobile hardening: keep overlay on-screen and the toggle button visible.
        ensureOverlayVisible();
        ensureToggleButtonVisible();
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
  // Prevent duplicates
  if (document.getElementById('odin-api-onboarding-backdrop')) return;

  // Guard: if user already has a key, don't show
  const currentSettings = getSettings();
  if (currentSettings && currentSettings.tornApiKey) return;

  const Z = 2147483647;

  // ===========================
  // Backdrop
  // ===========================
  const backdrop = document.createElement('div');
  backdrop.id = 'odin-api-onboarding-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  // Fully inline styles so it works even if CSS injection is blocked/overridden.
  backdrop.style.position = 'fixed';
  backdrop.style.top = '0';
  backdrop.style.left = '0';
  backdrop.style.right = '0';
  backdrop.style.bottom = '0';
  backdrop.style.background = 'rgba(0,0,0,0.72)';
  backdrop.style.zIndex = String(Z);
  backdrop.style.display = 'flex';
  backdrop.style.alignItems = 'center';
  backdrop.style.justifyContent = 'center';
  backdrop.style.padding = '12px';
  backdrop.style.pointerEvents = 'auto';

  // Prevent scrolling behind the modal (mobile friendly)
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  // ===========================
  // Modal shell
  // ===========================
  const modal = document.createElement('div');
  modal.className = 'odin-api-modal';
  modal.style.width = 'min(560px, 100%)';
  modal.style.maxWidth = '560px';
  modal.style.maxHeight = '88vh';
  modal.style.overflow = 'auto';
  modal.style.background = '#111827';
  modal.style.color = '#e5e7eb';
  modal.style.border = '1px solid rgba(255,255,255,0.14)';
  modal.style.borderRadius = '14px';
  modal.style.boxShadow = '0 16px 48px rgba(0,0,0,0.55)';
  modal.style.fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  modal.style.pointerEvents = 'auto';

  // ===========================
  // Header
  // ===========================
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '10px';
  header.style.padding = '12px 14px';
  header.style.borderBottom = '1px solid rgba(255,255,255,0.10)';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.flexDirection = 'column';
  titleWrap.style.gap = '2px';

  const title = document.createElement('div');
  title.textContent = 'Set your Torn API Key';
  title.style.fontSize = '16px';
  title.style.fontWeight = '700';
  title.style.letterSpacing = '0.2px';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Required for profile/faction data, targets, war tools, and predictions.';
  subtitle.style.fontSize = '12px';
  subtitle.style.color = 'rgba(229,231,235,0.85)';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.style.width = '34px';
  closeBtn.style.height = '34px';
  closeBtn.style.borderRadius = '10px';
  closeBtn.style.border = '1px solid rgba(255,255,255,0.14)';
  closeBtn.style.background = 'rgba(0,0,0,0.25)';
  closeBtn.style.color = '#e5e7eb';
  closeBtn.style.cursor = 'pointer';

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);

  // ===========================
  // Body (disclaimer)
  // ===========================
  const body = document.createElement('div');
  body.style.padding = '12px 14px';
  body.style.fontSize = '12px';
  body.style.lineHeight = '1.45';
  body.style.color = 'rgba(229,231,235,0.92)';

  const p1 = document.createElement('div');
  p1.innerHTML = '<strong>What this key is used for</strong><br/>Odin uses your Torn API key to make read-only requests to Torn\'s official API endpoints so it can show your profile data, faction data, target info, and other features inside the Odin UI.';
  p1.style.marginBottom = '10px';

  const p2 = document.createElement('div');
  p2.innerHTML = '<strong>How Odin stores your key</strong><br/>Your key is stored locally in your browser userscript storage (Odin settings). It is not automatically shared with other users.';
  p2.style.marginBottom = '10px';

  const p3 = document.createElement('div');
  p3.innerHTML = '<strong>How your key is sent</strong><br/>Torn\'s API expects the key as a <code>key=</code> parameter on the request URL. That means it can appear in browser/network logs. Odin only sends it to Torn (and to TornStats only if you configure that separately in Settings).';
  p3.style.marginBottom = '10px';

  const p4 = document.createElement('div');
  p4.innerHTML = '<strong>Security reminders</strong><ul style="margin:6px 0 0 18px; padding:0;"><li>Never share your API key in chat, screenshots, or streams.</li><li>If you think it\'s exposed, revoke/regenerate it in Torn immediately.</li><li>Only install Odin from a source you trust.</li></ul>';
  p4.style.marginBottom = '10px';

  const linkRow = document.createElement('div');
  linkRow.style.marginTop = '6px';
  linkRow.style.fontSize = '11px';
  linkRow.style.opacity = '0.95';
  linkRow.innerHTML = 'Create/manage keys on Torn: <a href="https://www.torn.com/api.html" target="_blank" rel="noopener" style="color:#93c5fd; text-decoration: underline;">torn.com/api.html</a>';

  body.appendChild(p1);
  body.appendChild(p2);
  body.appendChild(p3);
  body.appendChild(p4);
  body.appendChild(linkRow);

  // ===========================
  // Input
  // ===========================
  const inputWrap = document.createElement('div');
  inputWrap.style.padding = '0 14px 12px 14px';

  const label = document.createElement('label');
  label.textContent = 'Torn API Key';
  label.setAttribute('for', 'odin-api-key-input');
  label.style.display = 'block';
  label.style.fontSize = '12px';
  label.style.marginBottom = '6px';
  label.style.color = 'rgba(229,231,235,0.9)';

  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.alignItems = 'center';

  const input = document.createElement('input');
  input.type = 'password';
  input.id = 'odin-api-key-input';
  input.autocomplete = 'off';
  input.inputMode = 'text';
  input.placeholder = 'Paste your Torn API key here…';
  input.style.flex = '1';
  input.style.width = '100%';
  input.style.padding = '10px 12px';
  input.style.borderRadius = '10px';
  input.style.border = '1px solid rgba(255,255,255,0.14)';
  input.style.background = 'rgba(0,0,0,0.25)';
  input.style.color = '#e5e7eb';
  input.style.fontSize = '14px';
  input.style.outline = 'none';
  input.style.webkitTextFillColor = '#e5e7eb';

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.textContent = 'Show';
  revealBtn.style.padding = '10px 12px';
  revealBtn.style.borderRadius = '10px';
  revealBtn.style.border = '1px solid rgba(255,255,255,0.14)';
  revealBtn.style.background = 'rgba(0,0,0,0.25)';
  revealBtn.style.color = '#e5e7eb';
  revealBtn.style.cursor = 'pointer';
  revealBtn.style.whiteSpace = 'nowrap';

  revealBtn.addEventListener('click', () => {
    const isPw = input.type === 'password';
    input.type = isPw ? 'text' : 'password';
    revealBtn.textContent = isPw ? 'Hide' : 'Show';
    try { input.focus(); } catch (e) {}
  });

  row.appendChild(input);
  row.appendChild(revealBtn);

  const statusEl = document.createElement('div');
  statusEl.id = 'odin-api-status';
  statusEl.style.marginTop = '8px';
  statusEl.style.fontSize = '12px';
  statusEl.style.minHeight = '18px';
  statusEl.style.color = 'rgba(229,231,235,0.9)';

  inputWrap.appendChild(label);
  inputWrap.appendChild(row);
  inputWrap.appendChild(statusEl);

  // ===========================
  // Footer (buttons)
  // ===========================
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.flexWrap = 'wrap';
  footer.style.gap = '8px';
  footer.style.justifyContent = 'flex-end';
  footer.style.padding = '12px 14px';
  footer.style.borderTop = '1px solid rgba(255,255,255,0.10)';

  function styleBtn(btn, variant) {
    btn.style.padding = '10px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(255,255,255,0.14)';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '13px';
    btn.style.fontWeight = '600';
    btn.style.fontFamily = 'inherit';
    btn.style.whiteSpace = 'nowrap';
    if (variant === 'primary') {
      btn.style.background = 'rgba(102,126,234,0.95)';
      btn.style.color = '#0b1020';
      btn.style.border = '1px solid rgba(102,126,234,0.95)';
    } else if (variant === 'danger') {
      btn.style.background = 'rgba(239,68,68,0.92)';
      btn.style.color = '#0b1020';
      btn.style.border = '1px solid rgba(239,68,68,0.92)';
    } else {
      btn.style.background = 'rgba(0,0,0,0.25)';
      btn.style.color = '#e5e7eb';
    }
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Validate & Save';
  styleBtn(saveBtn, 'primary');

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.textContent = 'Skip 7 days';
  styleBtn(skipBtn, 'secondary');

  const closeBtn2 = document.createElement('button');
  closeBtn2.type = 'button';
  closeBtn2.textContent = 'Close';
  styleBtn(closeBtn2, 'secondary');

  footer.appendChild(skipBtn);
  footer.appendChild(closeBtn2);
  footer.appendChild(saveBtn);

  // ===========================
  // Close helpers
  // ===========================
  function closeModal() {
    try { document.documentElement.style.overflow = prevOverflow; } catch (e) {}
    try { backdrop.remove(); } catch (e) {}
  }

  closeBtn.addEventListener('click', closeModal);
  closeBtn2.addEventListener('click', closeModal);

  // ESC closes (desktop)
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }
  document.addEventListener('keydown', onKeyDown, true);

  // Ensure keydown handler removed when closing
  const originalClose = closeModal;
  closeModal = function () {
    try { document.removeEventListener('keydown', onKeyDown, true); } catch (e) {}
    originalClose();
  };

  // Don't close on backdrop click (prevents accidental close on mobile taps)
  // If you want this back later, we can add a toggle.

  // ===========================
  // Validation + Save
  // ===========================
  async function validateAndSave() {
    const key = (input.value || '').trim();
    statusEl.textContent = '';
    statusEl.style.color = 'rgba(229,231,235,0.9)';

    if (!key) {
      statusEl.textContent = 'Please paste your Torn API key.';
      statusEl.style.color = '#fca5a5';
      return;
    }
    if (key.length < 10) {
      statusEl.textContent = 'That key looks too short. Double-check you copied the full key.';
      statusEl.style.color = '#fca5a5';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Validating…';
    try {
      // Set key in API module first so validation request uses it
      if (ctx.api && typeof ctx.api.setTornApiKey === 'function') {
        ctx.api.setTornApiKey(key);
      }

      // Validate by calling a simple Torn API endpoint (if available)
      if (ctx.api && typeof ctx.api.getTornUser === 'function') {
        await ctx.api.getTornUser('', ['basic']);
      }

      // Persist to settings
      const s = getSettings();
      const updated = {
        ...s,
        tornApiKey: key,
        apiOnboardingDismissedUntil: 0,
      };
      saveSettings(updated);

      // If Settings UI input is present, update it live
      try {
        const settingsInput = document.getElementById('setting-torn-api-key');
        if (settingsInput) settingsInput.value = key;
      } catch (e) {}

      statusEl.textContent = 'Saved ✅  You can change/remove it anytime in Odin Settings.';
      statusEl.style.color = '#86efac';

      setTimeout(() => {
        closeModal();
      }, 800);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      statusEl.textContent = 'Could not validate the key. It may be invalid or blocked. Error: ' + msg;
      statusEl.style.color = '#fca5a5';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Validate & Save';
    }
  }

  saveBtn.addEventListener('click', validateAndSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateAndSave();
    }
  });

  skipBtn.addEventListener('click', () => {
    try {
      const s = getSettings();
      const updated = {
        ...s,
        apiOnboardingDismissedUntil: Date.now() + 7 * 24 * 60 * 60 * 1000,
      };
      saveSettings(updated);
    } catch (e) {}
    closeModal();
  });

  // ===========================
  // Compose
  // ===========================
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(inputWrap);
  modal.appendChild(footer);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Focus
  setTimeout(() => {
    try { input.focus(); } catch (e) {}
  }, 120);
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
          const backdrop = document.getElementById('odin-api-onboarding-backdrop');
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

      // If user snoozed onboarding, respect it until the timestamp expires
      const dismissedUntil = Number(settings.apiOnboardingDismissedUntil || 0);
      if (dismissedUntil && Date.now() < dismissedUntil) {
        log('[UI Core] API onboarding snoozed until', new Date(dismissedUntil).toISOString());
        return;
      }
function ensureApiKeyFloatingButton() {
  try {
    const settings = getSettings();
    const dismissedUntil = Number(settings.apiOnboardingDismissedUntil || 0);
    if (dismissedUntil && Date.now() < dismissedUntil) return;

    if (settings.tornApiKey) {
      const existing = document.getElementById('odin-api-fab');
      if (existing) existing.remove();
      return;
    }

    if (document.getElementById('odin-api-fab')) return;

    const fab = document.createElement('button');
    fab.id = 'odin-api-fab';
    fab.type = 'button';
    fab.textContent = '🔑 Set API Key';
    fab.style.position = 'fixed';
    fab.style.left = '12px';
    fab.style.bottom = '12px';
    fab.style.zIndex = '2147483647';
    fab.style.padding = '10px 12px';
    fab.style.borderRadius = '999px';
    fab.style.border = '1px solid rgba(255,255,255,0.18)';
    fab.style.background = 'rgba(102,126,234,0.95)';
    fab.style.color = '#0b1020';
    fab.style.fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
    fab.style.fontSize = '13px';
    fab.style.fontWeight = '700';
    fab.style.cursor = 'pointer';
    fab.style.boxShadow = '0 10px 30px rgba(0,0,0,0.45)';
    fab.style.pointerEvents = 'auto';

    fab.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { renderApiOnboardingModal(); } catch (err) { log('[UI Core] Failed to open onboarding modal:', err); }
    });

    document.body.appendChild(fab);
  } catch (e) {}
}

      // If no Torn API key exists, show the onboarding modal
      if (!settings.tornApiKey) {
        // Avoid duplicates
        if (document.getElementById('odin-api-onboarding-backdrop')) return;

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
        document.body.appendChild(notif);

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
      injectStyles();
      createToggleButton();

      // Install persistence + visibility guards early (helps on Torn mobile where DOM can be replaced).
      installPersistenceGuards();

      // Auto-open on small screens the first time so users can actually find the UI.
      try {
        const flags = storage.getJSON('odin_ui_flags') || {};
        const isSmallViewport = (window.innerWidth || 0) < 700 || (window.innerHeight || 0) < 520;
        if (isSmallViewport && !flags.uiAutoOpened) {
          flags.uiAutoOpened = true;
          storage.setJSON('odin_ui_flags', flags);
          setTimeout(() => {
            try { toggleOverlay(true); } catch (e) {}
          }, 650);
        }
      } catch (e) {
        // ignore
      }

      // Expose globally
      window.OdinUI = OdinUI;

      // Emit ready event
      nexus.emit('UI_READY', { version: UI_VERSION });
      log('[UI Core] Ready');

      // PART 3: Check for API key and show onboarding if needed
      checkAndShowApiOnboarding();
          ensureApiKeyFloatingButton();
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

      const onboardingBackdrop = document.getElementById('odin-api-onboarding-backdrop');
      if (onboardingBackdrop) onboardingBackdrop.remove();

      if (domPersistenceObserver) {
        try { domPersistenceObserver.disconnect(); } catch (e) {}
        domPersistenceObserver = null;
      }
      persistenceGuardsInstalled = false;

      window.OdinUI = null;
      log('[UI Core] Destroyed');
    }

    return { id: 'ui-core', init, destroy };
  });
})();
