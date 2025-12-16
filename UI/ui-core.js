// ui-core.js
// Core UI framework for Odin Tools
// Author: BjornOdinsson89
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
        background: linear-gradient(135deg, #0b0b0f 0%, #14141b 100%);
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
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        color: #b91c1c;
      }

      .odin-logo-svg {
        width: 24px;
        height: 24px;
        display: block;
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
        color: #4b5563;
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
        position: relative;
        
        background: transparent;
        
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
        background: #4b5563;
        color: white;
      }

      .odin-btn-primary:hover:not(:disabled) {
        background: #3b3f46;
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
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #1b1b20 0%, #000000 100%);
  border: 1px solid rgba(255,255,255,0.12);
  color: #e2e8f0;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.06);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

      .odin-toggle-btn:hover {
  background: linear-gradient(135deg, #232329 0%, #050505 100%);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255,255,255,0.10);
  transform: translateY(-1px);
}
      
      .odin-toggle-btn-icon {
  font-size: 22px;
  line-height: 1;
}
      
      .odin-toggle-btn-text {
  font-size: 8px;
  font-weight: 700;
  opacity: 0.9;
  letter-spacing: 0.6px;
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
        background: linear-gradient(135deg, #0b0b0f 0%, #14141b 100%);
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
        color: #4b5563;
      }

      .odin-api-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 18px 0 18px;
      }

      .odin-api-modal-header h2 {
        margin: 0;
        padding: 0;
      }

      .odin-api-modal-close {
        background: transparent;
        border: 0;
        color: #a0aec0;
        font-size: 18px;
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 8px;
      }

      .odin-api-modal-close:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
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
        color: #4b5563;
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
        border-color: #4b5563;
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
    // BRANDING
    // ============================================
    const ODIN_LOGO_SVG = `
      <svg class="odin-logo-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M12 26c0-8 6-14 14-14h2l4-6 4 6h2c8 0 14 6 14 14v14c0 10-8 18-18 18H30c-10 0-18-8-18-18V26z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
        <path d="M20 30c4-4 8-6 12-6s8 2 12 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M26 38c2 2 4 3 6 3s4-1 6-3" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <circle cx="26" cy="30" r="2.5" fill="currentColor"/>
        <circle cx="38" cy="30" r="2.5" fill="currentColor"/>
        <circle cx="38" cy="30" r="1.6" fill="#b91c1c"/>
      </svg>
    `;
    function getLogoMarkup() {
      return ODIN_LOGO_SVG;
    }


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
        buttonElement.style.left = '8px';
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
        <div class="odin-toggle-btn-icon">${getLogoMarkup()}</div>
        <div class="odin-toggle-btn-text">ODIN</div>
      `;
      buttonElement.title = 'Odin Tools';

      // Inline styles as a hard fallback in case site CSS or style injection interferes.
      // Also uses safe-area inset for mobile devices (iOS/Android gesture bars).
      buttonElement.style.cssText = `
  position: fixed !important;
  left: 8px !important;
  right: auto !important;
  top: auto !important;
  bottom: calc(8px + env(safe-area-inset-bottom, 0px)) !important;
  z-index: 2147483647 !important;
  width: 44px !important;
  height: 44px !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #1b1b20 0%, #000000 100%) !important;
  border: 1px solid rgba(255,255,255,0.12) !important;
  color: #e2e8f0 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.06) !important;
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
          <span class="odin-header-logo">${getLogoMarkup()}</span>
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
      // Create backdrop
      const backdrop = document.createElement('div');
      backdrop.id = 'odin-api-onboarding-backdrop';

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'odin-api-modal';

      // Header
      const headerWrap = document.createElement('div');
      headerWrap.className = 'odin-api-modal-header';

      const header = document.createElement('h2');
      header.textContent = ' Welcome to Odin Tools';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'odin-api-modal-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => {
        const bd = document.getElementById('odin-api-onboarding-backdrop');
        if (bd) bd.remove();
      });

      headerWrap.appendChild(header);
      headerWrap.appendChild(closeBtn);

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
      modal.appendChild(headerWrap);
      modal.appendChild(body);
      modal.appendChild(inputSection);
      modal.appendChild(footer);

      backdrop.appendChild(modal);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.remove();
        }
      });
      document.body.appendChild(backdrop);

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          const bd = document.getElementById('odin-api-onboarding-backdrop');
          if (bd) bd.remove();
          document.removeEventListener('keydown', onKeyDown);
        }
      };
      document.addEventListener('keydown', onKeyDown);

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
          background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#48bb78' : '#4b5563'};
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
      // If the saved active tab no longer exists (e.g. Personal tab removed), fall back safely.
      try {
        const validTabs = new Set(TABS.map(t => t.id));
        if (!validTabs.has(state.activeTab)) {
          state.activeTab = 'targets';
        }
      } catch (e) { /* ignore */ }

      injectStyles();
      createToggleButton();

      // Install persistence + visibility guards early (helps on Torn mobile where DOM can be replaced).
      installPersistenceGuards();

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
