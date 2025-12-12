// ui-core.js
// Core UI: Drawer, Panel, Tab Bar, Toggle Button
// Version: 3.0.0

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_CoreInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const debug = ctx.debug || console.debug;

    // ============================================
    // CONSTANTS
    // ============================================
    const UI_VERSION = '3.0.0';
    const STORAGE_KEYS = {
      IS_OPEN: 'ui/isOpen',
      ACTIVE_TAB: 'ui/activeTab',
      TOGGLE_POSITION: 'ui/togglePosition',
      PANEL_WIDTH: 'ui/panelWidth',
      PANEL_HEIGHT: 'ui/panelHeight',
      PANEL_SIDE: 'ui/panelSide',
    };

    const EVENTS = {
      UI_READY: 'UI_READY',
      TAB_CHANGED: 'TAB_CHANGED',
      PANEL_TOGGLED: 'PANEL_TOGGLED',
      PANEL_RESIZED: 'PANEL_RESIZED',
    };

    const TABS = [
      { id: 'war-room', label: 'War Room', icon: '⚔️' },
      { id: 'chain', label: 'Chain', icon: '🔗' },
      { id: 'targets', label: 'Targets', icon: '🎯' },
      { id: 'retals', label: 'Retals', icon: '💥' },
      { id: 'watchers', label: 'Watchers', icon: '👁️' },
      { id: 'faction', label: 'Faction', icon: '🏛️' },
      { id: 'leadership', label: 'Leadership', icon: '👑' },
      { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    // ============================================
    // STATE
    // ============================================
    let state = {
      isOpen: false,
      activeTab: 'war-room',
      togglePosition: { top: 100, side: 'right' },
      panelWidth: 400,
      panelHeight: 600,
      panelSide: 'right',
    };

    let elements = {
      toggle: null,
      panel: null,
      tabBar: null,
      contentContainer: null,
      header: null,
      resizeHandle: null,
    };

    let tabContentRenderers = {};
    let isDragging = false;
    let isResizing = false;

    // ============================================
    // STYLES
    // ============================================
    const STYLES = `
      #odin-toggle-btn {
        position: fixed;
        z-index: 99999;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border: 2px solid #4a5568;
        cursor: move;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        transition: transform 0.2s, box-shadow 0.2s;
        user-select: none;
      }
      #odin-toggle-btn:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0,0,0,0.5);
        border-color: #667eea;
      }
      #odin-toggle-btn.active {
        border-color: #48bb78;
      }

      #odin-panel {
        position: fixed;
        z-index: 99998;
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        border: 1px solid #4a5568;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: opacity 0.2s, transform 0.2s;
      }
      #odin-panel.hidden {
        opacity: 0;
        pointer-events: none;
        transform: translateX(20px);
      }
      #odin-panel.left.hidden {
        transform: translateX(-20px);
      }

      .odin-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(0,0,0,0.3);
        border-bottom: 1px solid #4a5568;
        cursor: default;
      }
      .odin-header-title {
        font-size: 16px;
        font-weight: 600;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .odin-header-title span {
        font-size: 20px;
      }
      .odin-close-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: rgba(255,255,255,0.1);
        border: none;
        color: #a0aec0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        transition: background 0.2s, color 0.2s;
      }
      .odin-close-btn:hover {
        background: #e53e3e;
        color: white;
      }

      .odin-tab-bar {
        display: flex;
        flex-wrap: wrap;
        padding: 8px;
        gap: 4px;
        background: rgba(0,0,0,0.2);
        border-bottom: 1px solid #4a5568;
      }
      .odin-tab {
        flex: 1;
        min-width: 70px;
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #a0aec0;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .odin-tab:hover {
        background: rgba(255,255,255,0.1);
        color: #e2e8f0;
      }
      .odin-tab.active {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .odin-tab-icon {
        font-size: 16px;
      }
      .odin-tab-label {
        font-size: 10px;
        white-space: nowrap;
      }

      .odin-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        color: #e2e8f0;
      }
      .odin-content::-webkit-scrollbar {
        width: 8px;
      }
      .odin-content::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.2);
      }
      .odin-content::-webkit-scrollbar-thumb {
        background: #4a5568;
        border-radius: 4px;
      }
      .odin-content::-webkit-scrollbar-thumb:hover {
        background: #667eea;
      }

      .odin-resize-handle {
        position: absolute;
        width: 8px;
        height: 100%;
        top: 0;
        cursor: ew-resize;
        background: transparent;
        transition: background 0.2s;
      }
      .odin-resize-handle:hover {
        background: rgba(102, 126, 234, 0.3);
      }
      .odin-resize-handle.left {
        left: 0;
      }
      .odin-resize-handle.right {
        right: 0;
      }

      /* Section styles */
      .odin-section {
        margin-bottom: 20px;
      }
      .odin-section-header {
        position: sticky;
        top: -16px;
        background: linear-gradient(180deg, #1a1a2e 0%, rgba(26, 26, 46, 0.95) 100%);
        padding: 8px 0;
        margin: 0 -16px;
        padding-left: 16px;
        padding-right: 16px;
        z-index: 10;
        border-bottom: 1px solid #4a5568;
      }
      .odin-section-title {
        font-size: 14px;
        font-weight: 600;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Card styles */
      .odin-card {
        background: rgba(0,0,0,0.3);
        border: 1px solid #4a5568;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
      }
      .odin-card-title {
        font-size: 13px;
        font-weight: 600;
        color: #e2e8f0;
        margin-bottom: 8px;
      }
      .odin-card-content {
        font-size: 12px;
        color: #a0aec0;
      }

      /* Button styles */
      .odin-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .odin-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }
      .odin-btn-primary:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      .odin-btn-secondary {
        background: rgba(255,255,255,0.1);
        color: #e2e8f0;
        border: 1px solid #4a5568;
      }
      .odin-btn-secondary:hover {
        background: rgba(255,255,255,0.15);
      }
      .odin-btn-danger {
        background: #e53e3e;
        color: white;
      }
      .odin-btn-danger:hover {
        background: #c53030;
      }

      /* Input styles */
      .odin-input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #4a5568;
        background: rgba(0,0,0,0.3);
        color: #e2e8f0;
        font-size: 12px;
        transition: border-color 0.2s;
      }
      .odin-input:focus {
        outline: none;
        border-color: #667eea;
      }
      .odin-input::placeholder {
        color: #718096;
      }

      .odin-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #a0aec0;
        margin-bottom: 6px;
      }

      .odin-form-group {
        margin-bottom: 16px;
      }

      /* Toggle switch */
      .odin-toggle {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
      }
      .odin-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .odin-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #4a5568;
        border-radius: 24px;
        transition: 0.3s;
      }
      .odin-toggle-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        border-radius: 50%;
        transition: 0.3s;
      }
      .odin-toggle input:checked + .odin-toggle-slider {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      .odin-toggle input:checked + .odin-toggle-slider:before {
        transform: translateX(20px);
      }

      /* Badge */
      .odin-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
      }
      .odin-badge-success {
        background: #48bb78;
        color: white;
      }
      .odin-badge-warning {
        background: #ed8936;
        color: white;
      }
      .odin-badge-danger {
        background: #e53e3e;
        color: white;
      }
      .odin-badge-info {
        background: #4299e1;
        color: white;
      }

      /* Status indicator */
      .odin-status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }
      .odin-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
      }
      .odin-status-dot.green { background: #48bb78; }
      .odin-status-dot.yellow { background: #ed8936; }
      .odin-status-dot.red { background: #e53e3e; }
      .odin-status-dot.gray { background: #718096; }

      /* Loading spinner */
      .odin-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255,255,255,0.2);
        border-top-color: #667eea;
        border-radius: 50%;
        animation: odin-spin 0.8s linear infinite;
      }
      @keyframes odin-spin {
        to { transform: rotate(360deg); }
      }

      /* Empty state */
      .odin-empty {
        text-align: center;
        padding: 32px 16px;
        color: #718096;
      }
      .odin-empty-icon {
        font-size: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }
      .odin-empty-text {
        font-size: 14px;
      }

      /* List item */
      .odin-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: rgba(0,0,0,0.2);
        border-radius: 6px;
        margin-bottom: 8px;
        transition: background 0.2s;
      }
      .odin-list-item:hover {
        background: rgba(0,0,0,0.3);
      }
      .odin-list-item-content {
        flex: 1;
      }
      .odin-list-item-title {
        font-size: 13px;
        font-weight: 500;
        color: #e2e8f0;
      }
      .odin-list-item-subtitle {
        font-size: 11px;
        color: #718096;
        margin-top: 2px;
      }
      .odin-list-item-actions {
        display: flex;
        gap: 8px;
      }

      /* Difficulty colors */
      .difficulty-very-easy { color: #00FF00; }
      .difficulty-easy { color: #90EE90; }
      .difficulty-moderate { color: #FFA500; }
      .difficulty-hard { color: #FF4500; }
      .difficulty-very-hard { color: #FF0000; }
      .difficulty-impossible { color: #8B0000; }

      /* Source indicator */
      .odin-source {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(255,255,255,0.1);
        color: #a0aec0;
      }
      .odin-source.ffscouter { background: rgba(102, 126, 234, 0.3); color: #667eea; }
      .odin-source.tornstats { background: rgba(72, 187, 120, 0.3); color: #48bb78; }
      .odin-source.explicit { background: rgba(237, 137, 54, 0.3); color: #ed8936; }
    `;

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function injectStyles() {
      if (document.getElementById('odin-styles')) return;
      const styleEl = document.createElement('style');
      styleEl.id = 'odin-styles';
      styleEl.textContent = STYLES;
      document.head.appendChild(styleEl);
    }

    function loadState() {
      state.isOpen = storage.getJSON(STORAGE_KEYS.IS_OPEN, false);
      state.activeTab = storage.getJSON(STORAGE_KEYS.ACTIVE_TAB, 'war-room');
      state.togglePosition = storage.getJSON(STORAGE_KEYS.TOGGLE_POSITION, { top: 100, side: 'right' });
      state.panelWidth = storage.getJSON(STORAGE_KEYS.PANEL_WIDTH, 400);
      state.panelHeight = storage.getJSON(STORAGE_KEYS.PANEL_HEIGHT, 600);
      state.panelSide = storage.getJSON(STORAGE_KEYS.PANEL_SIDE, 'right');
    }

    function saveState() {
      storage.setJSON(STORAGE_KEYS.IS_OPEN, state.isOpen);
      storage.setJSON(STORAGE_KEYS.ACTIVE_TAB, state.activeTab);
      storage.setJSON(STORAGE_KEYS.TOGGLE_POSITION, state.togglePosition);
      storage.setJSON(STORAGE_KEYS.PANEL_WIDTH, state.panelWidth);
      storage.setJSON(STORAGE_KEYS.PANEL_HEIGHT, state.panelHeight);
      storage.setJSON(STORAGE_KEYS.PANEL_SIDE, state.panelSide);
    }

    // ============================================
    // TOGGLE BUTTON
    // ============================================
    function createToggleButton() {
      const btn = document.createElement('div');
      btn.id = 'odin-toggle-btn';
      btn.innerHTML = '🐺';
      btn.title = 'Odin Tools';

      updateTogglePosition(btn);

      btn.addEventListener('click', (e) => {
        if (!isDragging) {
          togglePanel();
        }
      });

      // Drag functionality
      let startY, startTop;
      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = false;
        startY = e.clientY;
        startTop = state.togglePosition.top;

        const onMove = (moveE) => {
          const deltaY = moveE.clientY - startY;
          if (Math.abs(deltaY) > 5) isDragging = true;
          state.togglePosition.top = Math.max(50, Math.min(window.innerHeight - 100, startTop + deltaY));
          updateTogglePosition(btn);
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          saveState();
          setTimeout(() => { isDragging = false; }, 100);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // Double-click to switch sides
      btn.addEventListener('dblclick', () => {
        state.togglePosition.side = state.togglePosition.side === 'right' ? 'left' : 'right';
        state.panelSide = state.togglePosition.side;
        updateTogglePosition(btn);
        updatePanelPosition();
        saveState();
      });

      document.body.appendChild(btn);
      elements.toggle = btn;
    }

    function updateTogglePosition(btn) {
      btn = btn || elements.toggle;
      if (!btn) return;

      btn.style.top = `${state.togglePosition.top}px`;
      if (state.togglePosition.side === 'right') {
        btn.style.right = '20px';
        btn.style.left = 'auto';
      } else {
        btn.style.left = '20px';
        btn.style.right = 'auto';
      }
    }

    // ============================================
    // PANEL
    // ============================================
    function createPanel() {
      const panel = document.createElement('div');
      panel.id = 'odin-panel';
      panel.className = state.isOpen ? '' : 'hidden';

      // Header
      const header = document.createElement('div');
      header.className = 'odin-header';
      header.innerHTML = `
        <div class="odin-header-title">
          <span>🐺</span>
          Odin Tools
        </div>
        <button class="odin-close-btn" title="Close">✕</button>
      `;
      header.querySelector('.odin-close-btn').addEventListener('click', () => togglePanel(false));
      panel.appendChild(header);
      elements.header = header;

      // Tab bar
      const tabBar = document.createElement('div');
      tabBar.className = 'odin-tab-bar';
      TABS.forEach((tab) => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `odin-tab ${tab.id === state.activeTab ? 'active' : ''}`;
        tabBtn.dataset.tabId = tab.id;
        tabBtn.innerHTML = `
          <span class="odin-tab-icon">${tab.icon}</span>
          <span class="odin-tab-label">${tab.label}</span>
        `;
        tabBtn.addEventListener('click', () => switchTab(tab.id));
        tabBar.appendChild(tabBtn);
      });
      panel.appendChild(tabBar);
      elements.tabBar = tabBar;

      // Content container
      const content = document.createElement('div');
      content.className = 'odin-content';
      content.id = 'odin-content';
      panel.appendChild(content);
      elements.contentContainer = content;

      // Resize handle
      const resizeHandle = document.createElement('div');
      resizeHandle.className = `odin-resize-handle ${state.panelSide === 'right' ? 'left' : 'right'}`;
      resizeHandle.addEventListener('mousedown', startResize);
      panel.appendChild(resizeHandle);
      elements.resizeHandle = resizeHandle;

      document.body.appendChild(panel);
      elements.panel = panel;

      updatePanelPosition();
      renderTabContent();
    }

    function updatePanelPosition() {
      const panel = elements.panel;
      if (!panel) return;

      panel.style.width = `${state.panelWidth}px`;
      panel.style.height = `${state.panelHeight}px`;
      panel.style.top = `${state.togglePosition.top - 50}px`;

      if (state.panelSide === 'right') {
        panel.style.right = '80px';
        panel.style.left = 'auto';
        panel.classList.remove('left');
      } else {
        panel.style.left = '80px';
        panel.style.right = 'auto';
        panel.classList.add('left');
      }

      // Update resize handle side
      if (elements.resizeHandle) {
        elements.resizeHandle.className = `odin-resize-handle ${state.panelSide === 'right' ? 'left' : 'right'}`;
      }
    }

    function startResize(e) {
      if (e.button !== 0) return;
      isResizing = true;
      const startX = e.clientX;
      const startWidth = state.panelWidth;

      const onMove = (moveE) => {
        const deltaX = moveE.clientX - startX;
        const newWidth = state.panelSide === 'right'
          ? startWidth - deltaX
          : startWidth + deltaX;
        state.panelWidth = Math.max(300, Math.min(800, newWidth));
        updatePanelPosition();
      };

      const onUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveState();
        nexus.emit(EVENTS.PANEL_RESIZED, { width: state.panelWidth, height: state.panelHeight });
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function togglePanel(forceState = null) {
      state.isOpen = forceState !== null ? forceState : !state.isOpen;

      if (elements.panel) {
        elements.panel.classList.toggle('hidden', !state.isOpen);
      }
      if (elements.toggle) {
        elements.toggle.classList.toggle('active', state.isOpen);
      }

      saveState();
      nexus.emit(EVENTS.PANEL_TOGGLED, { isOpen: state.isOpen });

      if (state.isOpen) {
        renderTabContent();
      }
    }

    // ============================================
    // TAB MANAGEMENT
    // ============================================
    function switchTab(tabId) {
      if (state.activeTab === tabId) return;

      state.activeTab = tabId;
      saveState();

      // Update tab button states
      const tabs = elements.tabBar.querySelectorAll('.odin-tab');
      tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tabId === tabId);
      });

      renderTabContent();
      nexus.emit(EVENTS.TAB_CHANGED, { tab: tabId });
    }

    function renderTabContent() {
      if (!elements.contentContainer) return;

      const renderer = tabContentRenderers[state.activeTab];
      if (renderer) {
        try {
          const content = renderer();
          if (typeof content === 'string') {
            elements.contentContainer.innerHTML = content;
          } else if (content instanceof HTMLElement) {
            elements.contentContainer.innerHTML = '';
            elements.contentContainer.appendChild(content);
          }
        } catch (e) {
          error('[UI] Tab render error:', e);
          elements.contentContainer.innerHTML = `
            <div class="odin-empty">
              <div class="odin-empty-icon">⚠️</div>
              <div class="odin-empty-text">Error loading tab content</div>
            </div>
          `;
        }
      } else {
        elements.contentContainer.innerHTML = `
          <div class="odin-empty">
            <div class="odin-empty-icon">🔧</div>
            <div class="odin-empty-text">Tab content not available</div>
          </div>
        `;
      }
    }

    function registerTabContent(tabId, renderer) {
      tabContentRenderers[tabId] = renderer;
      if (state.activeTab === tabId && state.isOpen) {
        renderTabContent();
      }
    }

    // ============================================
    // PUBLIC UI HELPERS
    // ============================================
    const UIHelpers = {
      createSection(title, icon = null) {
        const section = document.createElement('div');
        section.className = 'odin-section';

        const header = document.createElement('div');
        header.className = 'odin-section-header';
        header.innerHTML = `
          <div class="odin-section-title">
            ${icon ? `<span>${icon}</span>` : ''}
            ${title}
          </div>
        `;
        section.appendChild(header);

        return section;
      },

      createCard(title, content) {
        const card = document.createElement('div');
        card.className = 'odin-card';
        if (title) {
          const titleEl = document.createElement('div');
          titleEl.className = 'odin-card-title';
          titleEl.textContent = title;
          card.appendChild(titleEl);
        }
        const contentEl = document.createElement('div');
        contentEl.className = 'odin-card-content';
        if (typeof content === 'string') {
          contentEl.innerHTML = content;
        } else if (content instanceof HTMLElement) {
          contentEl.appendChild(content);
        }
        card.appendChild(contentEl);
        return card;
      },

      createListItem(title, subtitle, actions = []) {
        const item = document.createElement('div');
        item.className = 'odin-list-item';
        item.innerHTML = `
          <div class="odin-list-item-content">
            <div class="odin-list-item-title">${title}</div>
            ${subtitle ? `<div class="odin-list-item-subtitle">${subtitle}</div>` : ''}
          </div>
          <div class="odin-list-item-actions"></div>
        `;
        const actionsContainer = item.querySelector('.odin-list-item-actions');
        actions.forEach((action) => {
          const btn = document.createElement('button');
          btn.className = `odin-btn odin-btn-${action.type || 'secondary'}`;
          btn.textContent = action.label;
          btn.addEventListener('click', action.onClick);
          actionsContainer.appendChild(btn);
        });
        return item;
      },

      createFormGroup(label, inputType = 'text', options = {}) {
        const group = document.createElement('div');
        group.className = 'odin-form-group';

        const labelEl = document.createElement('label');
        labelEl.className = 'odin-label';
        labelEl.textContent = label;
        group.appendChild(labelEl);

        if (inputType === 'toggle') {
          const toggle = document.createElement('label');
          toggle.className = 'odin-toggle';
          toggle.innerHTML = `
            <input type="checkbox" ${options.checked ? 'checked' : ''}>
            <span class="odin-toggle-slider"></span>
          `;
          const input = toggle.querySelector('input');
          if (options.onChange) {
            input.addEventListener('change', () => options.onChange(input.checked));
          }
          group.appendChild(toggle);
        } else {
          const input = document.createElement('input');
          input.className = 'odin-input';
          input.type = inputType;
          if (options.value) input.value = options.value;
          if (options.placeholder) input.placeholder = options.placeholder;
          if (options.onChange) {
            input.addEventListener('input', () => options.onChange(input.value));
          }
          group.appendChild(input);
        }

        return group;
      },

      createButton(label, type = 'primary', onClick = null) {
        const btn = document.createElement('button');
        btn.className = `odin-btn odin-btn-${type}`;
        btn.textContent = label;
        if (onClick) btn.addEventListener('click', onClick);
        return btn;
      },

      createBadge(text, type = 'info') {
        return `<span class="odin-badge odin-badge-${type}">${text}</span>`;
      },

      createStatus(text, color = 'gray') {
        return `
          <div class="odin-status">
            <span class="odin-status-dot ${color}"></span>
            <span>${text}</span>
          </div>
        `;
      },

      createSourceBadge(source) {
        const sourceClass = source ? source.toLowerCase() : '';
        return `<span class="odin-source ${sourceClass}">${source || 'Unknown'}</span>`;
      },

      createDifficultyBadge(label, color) {
        return `<span style="color: ${color}; font-weight: 600;">${label}</span>`;
      },

      createEmptyState(icon, text) {
        return `
          <div class="odin-empty">
            <div class="odin-empty-icon">${icon}</div>
            <div class="odin-empty-text">${text}</div>
          </div>
        `;
      },

      createSpinner() {
        return '<div class="odin-spinner"></div>';
      },

      refreshContent() {
        renderTabContent();
      },
    };

    // ============================================
    // MODULE INTERFACE
    // ============================================
    function init() {
      log('[UI Core] Initializing v' + UI_VERSION);

      loadState();
      injectStyles();
      createToggleButton();
      createPanel();

      // Expose helpers
      window.OdinUI = {
        version: UI_VERSION,
        EVENTS,
        togglePanel,
        switchTab,
        registerTabContent,
        refreshContent: renderTabContent,
        helpers: UIHelpers,
        getState: () => ({ ...state }),
      };

      nexus.emit(EVENTS.UI_READY, { version: UI_VERSION });
      log('[UI Core] Ready');
    }

    function destroy() {
      log('[UI Core] Destroying...');

      if (elements.toggle) elements.toggle.remove();
      if (elements.panel) elements.panel.remove();

      const styles = document.getElementById('odin-styles');
      if (styles) styles.remove();

      window.OdinUI = null;
      log('[UI Core] Destroyed');
    }

    return { id: 'ui-core', init, destroy };
  });
})();
