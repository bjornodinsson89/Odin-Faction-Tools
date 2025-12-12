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
    // STATE
    // ============================================
    let state = {
      isOpen: false,
      activeTab: 'war-room',
      position: { side: 'right', top: 100 },
      size: { width: 380, height: 600 },
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
    // STYLES
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
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .odin-toggle-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
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
        section.innerHTML = `
          <div class="odin-section-header">
            ${icon ? `<span>${icon}</span>` : ''}
            <span class="odin-section-title">${title}</span>
          </div>
        `;
        return section;
      },

      // HTML escaping helper for safety
      escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      },

      createCard(title, content) {
        const card = document.createElement('div');
        card.className = 'odin-card';
        if (title) {
          // Use textContent for title to prevent XSS
          const titleDiv = document.createElement('div');
          titleDiv.style.fontWeight = '600';
          titleDiv.style.marginBottom = '8px';
          titleDiv.textContent = title;
          card.appendChild(titleDiv);
        }
        if (typeof content === 'string') {
          // Content is trusted HTML from our templates
          const contentDiv = document.createElement('div');
          contentDiv.innerHTML = content;
          card.appendChild(contentDiv);
        } else if (content instanceof Element) {
          card.appendChild(content);
        }
        return card;
      },

      createButton(text, className = 'odin-btn-primary', onClick) {
        const btn = document.createElement('button');
        btn.className = `odin-btn ${className}`;
        btn.textContent = text;
        if (onClick) btn.addEventListener('click', onClick);
        return btn;
      },
    };

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
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    function createToggleButton() {
      if (buttonElement) return;

      buttonElement = document.createElement('button');
      buttonElement.className = 'odin-toggle-btn';
      buttonElement.innerHTML = '🐺';
      buttonElement.title = 'Odin Tools';

      // Position
      const side = state.position.side || 'right';
      buttonElement.style[side] = '20px';
      buttonElement.style.top = `${state.position.top || 100}px`;

      buttonElement.addEventListener('click', toggleOverlay);

      // Make draggable
      makeDraggable(buttonElement, (newPos) => {
        state.position = newPos;
        saveState();
      });

      document.body.appendChild(buttonElement);
    }

    function createOverlay() {
      if (overlayElement) return;

      overlayElement = document.createElement('div');
      overlayElement.className = 'odin-overlay';
      overlayElement.id = 'odin-overlay';

      // Size and position
      overlayElement.style.width = `${state.size.width}px`;
      overlayElement.style.height = `${state.size.height}px`;
      const side = state.position.side || 'right';
      overlayElement.style[side] = '80px';
      overlayElement.style.top = `${state.position.top || 100}px`;

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

      document.body.appendChild(overlayElement);

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
      if (!contentEl) return;

      const renderer = tabRenderers.get(state.activeTab);
      if (renderer) {
        try {
          const content = renderer();
          if (typeof content === 'string') {
            contentEl.innerHTML = content;
          } else if (content instanceof Element) {
            contentEl.innerHTML = '';
            contentEl.appendChild(content);
          }
        } catch (e) {
          contentEl.innerHTML = `
            <div class="odin-empty">
              <div class="odin-empty-icon">⚠️</div>
              <p>Error rendering tab</p>
              <p style="font-size: 12px; color: #718096;">${e.message}</p>
            </div>
          `;
          log('[UI Core] Render error:', e);
        }
      } else {
        contentEl.innerHTML = `
          <div class="odin-empty">
            <div class="odin-empty-icon">🔄</div>
            <p>Loading...</p>
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

      // Expose globally
      window.OdinUI = OdinUI;

      // Emit ready event
      nexus.emit('UI_READY', { version: UI_VERSION });
      log('[UI Core] Ready');
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

      window.OdinUI = null;
      log('[UI Core] Destroyed');
    }

    return { id: 'ui-core', init, destroy };
  });
})();
