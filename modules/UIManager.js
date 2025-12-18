// ==============================================================================
// ODIN UI MANAGER - Main UI Controller 
// ==============================================================================
// Manages the overlay panel, tabs, and all UI state
// Version: 5.0.0 

(function() {
  'use strict';

  window.OdinModules = window.OdinModules || [];

  window.OdinModules.push(function OdinUIManagerModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const UI_VERSION = '4.2.0';

    // ============================================
    // UI STATE
    // ============================================
    let isVisible = false;
    let activeTab = 'warRoom';
    let panelElement = null;
    let toggleButton = null;
    let apiKeysDirty = { torn: false, tornStats: false, ffScouter: false };

    // ============================================
    // AUTH / CONNECTION STATE
    // ============================================
    let firebaseConnected = !!ctx.firebase?.isConnected?.();
    let authUserPresent = !!(ctx.firebase?.getCurrentUser?.() || ctx.firebase?.auth?.()?.currentUser);


    const tabs = {
      warRoom: { label: '⚔️ War Room', component: null },
      targets: { label: '🎯 Targets', component: null },
      chain: { label: '⛓️ Chain', component: null },
      schedule: { label: '📅 Schedule', component: null },
      leadership: { label: '👑 Leadership', component: null },
      personal: { label: '👤 Personal', component: null },
      settings: { label: '⚙️ Settings', component: null }
    };
    // ============================================
    // AUTH GATING
    // ============================================
    const AUTH_REQUIRED_TABS = new Set(['warRoom', 'targets', 'chain', 'schedule', 'leadership', 'personal']);

    function isAuthReady() {
      return !!firebaseConnected && !!authUserPresent;
    }

    function getSavedTornKey() {
      try { return (ctx.api && typeof ctx.api.getTornApiKey === 'function') ? (ctx.api.getTornApiKey() || '') : ''; } catch (_) { return ''; }
    }

    function renderAuthGate(tabId) {
      const saved = getSavedTornKey();
      const savedMasked = saved && saved.length > 8 ? (saved.slice(0, 4) + '••••••••' + saved.slice(-4)) : '';
      const status = firebaseConnected ? (authUserPresent ? 'Authenticated' : 'Connected') : 'Connecting';
      return `
        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">🔒 Authentication Required</div>
          </div>
          <div class="odin-empty" style="text-align:left;">
            <div style="margin-bottom:10px;">This tab requires Firebase authentication for your faction.</div>
            <div style="margin-bottom:10px; color:#a0a0a0; font-size:12px;">Status: ${status}</div>
            <div class="odin-auth-disclaimer">
  <div class="odin-auth-disclaimer-title">API Key Security &amp; Storage (Read Carefully)</div>
  <div class="odin-auth-disclaimer-body">
    <p><strong>Why this key is needed:</strong> Odin Tools uses your Torn <strong>Full Access</strong> API key only to prove to our Firebase backend that you are a valid Torn player. The key is sent to the Odin Gatekeeper once to request a Firebase authentication token for your account/faction.</p>
    <p><strong>How the key is used:</strong> When you press <em>Authenticate</em>, the script sends your key to the Torn API to validate it and to fetch your player/faction identifiers. The Gatekeeper then mints a Firebase custom token that allows read/write access limited by your identity and your faction permissions.</p>
    <p><strong>How the key is stored:</strong> If you choose to save it, the key is stored locally on <strong>your device</strong> using the script’s storage layer (Tampermonkey/GreaseMonkey storage when available, otherwise browser storage). It is <strong>not</strong> stored in the database. It is used to re-authenticate if your Firebase session expires.</p>
    <p><strong>Where the key can be exposed:</strong> Like any local secret, it can be exposed if your device is compromised, if your browser profile is synced/shared, or if you install malicious extensions/scripts. Treat it like a password. Do not paste it on shared devices.</p>
    <p><strong>What to do if you change your mind:</strong> You can remove the saved key at any time using the script’s settings (or by clearing Tampermonkey storage / site storage). You can also regenerate your Torn API key in Torn immediately if you suspect compromise.</p>
    <p><strong>Important:</strong> Until you acknowledge this notice, Odin Tools will not attempt authentication or load protected faction tabs.</p>
  </div>
</div>
<label class="odin-auth-ack">
  <input type="checkbox" id="odin-auth-ack" />
  I have read and understand how my Torn Full Access API key is used and stored.
</label>
<label class="odin-form-label">Torn API Key (used once to mint a Firebase token)</label>
            <input type="password" id="odin-auth-torn-key" class="odin-input" placeholder="${savedMasked ? 'Key saved (' + savedMasked + ') - paste to re-auth' : 'Paste your Torn API key'}" />
            <div style="display:flex; gap:8px; margin-top:10px;">
              <button class="odin-btn odin-btn-primary" id="odin-auth-btn">🔑 Authenticate</button>
              <button class="odin-btn odin-btn-secondary" id="odin-auth-use-saved">Use Saved</button>
            </div>
            <div id="odin-auth-msg" style="margin-top:10px; color:#a0a0a0; font-size:12px;"></div>
          </div>
        </div>`;
    }

    function attachAuthGateHandlers(tabId) {
      const msg = document.getElementById('odin-auth-msg');
      const input = document.getElementById('odin-auth-torn-key');
      const btn = document.getElementById('odin-auth-btn');
      const useSaved = document.getElementById('odin-auth-use-saved');
      const ack = document.getElementById('odin-auth-ack');
      const ackKey = 'odin_auth_ack_v1';
      if (ack && storage && typeof storage.getJSON === 'function') {
        const prior = storage.getJSON(ackKey);
        if (prior === true) ack.checked = true;
      }
      function applyAckState() {
        const ok = !!(ack && ack.checked);
        if (btn) btn.disabled = !ok;
        if (useSaved) useSaved.disabled = !ok;
        if (!ok) setMsg('Please read the notice and acknowledge it to enable authentication.', 'info');
        if (ok && msg && msg.textContent && msg.textContent.indexOf('acknowledge') !== -1) setMsg('', 'info');
        if (storage && typeof storage.setJSON === 'function') storage.setJSON(ackKey, ok);
      }
      if (ack) {
        ack.addEventListener('change', applyAckState, { passive: true });
      }
      applyAckState();
function setMsg(t, kind) {
        if (!msg) return;
        msg.textContent = t || '';
        msg.style.color = kind === 'error' ? '#ff6b6b' : (kind === 'success' ? '#2ecc71' : '#a0a0a0');
      }

      if (useSaved) {
        useSaved.onclick = () => {
          const saved = getSavedTornKey();
          if (input) input.value = saved || '';
          setMsg(saved ? 'Loaded saved key into the field.' : 'No saved key found. Paste a key to continue.', saved ? 'success' : 'error');
        };
      }

      if (btn) {
        btn.onclick = async () => {
          try {
            const ok = !!(ack && ack.checked);
            if (!ok) {
              setMsg('Please acknowledge the notice before authenticating.', 'error');
              return;
            }
            setMsg('Authenticating...', 'info');
            const key = (input && input.value) ? input.value.trim() : '';
            if (!key || key.length < 16) {
              setMsg('Please paste a valid Torn API key.', 'error');
              return;
            }
            if (ctx.api && typeof ctx.api.setTornApiKey === 'function') {
              ctx.api.setTornApiKey(key, { persist: true, silent: true });
            }
            if (!ctx.firebase || typeof ctx.firebase.authenticateWithTorn !== 'function') {
              setMsg('Firebase service is not ready yet. Try again in a moment.', 'error');
              return;
            }
            await ctx.firebase.authenticateWithTorn(key);
            setMsg('Authenticated. Loading tab...', 'success');
            // refresh auth state
            authUserPresent = !!(ctx.firebase.getCurrentUser && ctx.firebase.getCurrentUser());
            renderTabContent(tabId);
          } catch (e) {
            setMsg('Authentication failed: ' + (e && e.message ? e.message : String(e)), 'error');
          }
        };
      }
    }

    // ============================================
    // STYLES
    // ============================================
    function injectStyles() {
      if (document.getElementById('odin-ui-styles')) return;

      const styles = document.createElement('style');
      styles.id = 'odin-ui-styles';
      styles.textContent = `
        /* Toggle Button */
        #odin-toggle-btn {
  position: fixed;
  left: 10px;
  bottom: 10px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 2px solid #e94560;
  box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9999;
  padding: 0;
  overflow: hidden;
}
#odin-toggle-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
        #odin-toggle-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(233, 69, 96, 0.6);
        }
        #odin-toggle-btn.active {
          background: linear-gradient(135deg, #e94560 0%, #c73e54 100%);
        }

        /* Main Panel */
        #odin-panel {
          position: fixed;
          top: 60px;
          right: 20px;
          width: 440px;
          max-height: calc(100vh - 100px);
          background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%);
          border: 1px solid #e94560;
          border-radius: 12px;
          z-index: 99998;
          display: none;
          flex-direction: column;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #odin-panel.visible {
          display: flex;
        }

        /* Header */
        .odin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: linear-gradient(90deg, #16213e 0%, #1a1a2e 100%);
          border-bottom: 1px solid #e94560;
          border-radius: 11px 11px 0 0;
        }
        .odin-header-title {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #fff;
          font-size: 18px;
          font-weight: 600;
        }
        
        .odin-header-logo {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          object-fit: cover;
          margin-right: 8px;
          display: block;
          flex: 0 0 auto;
        }
        .odin-close-btn {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 1px solid rgba(233, 69, 96, 0.45);
          background: rgba(233, 69, 96, 0.12);
          color: #fff;
          font-size: 22px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          margin-left: 10px;
          flex: 0 0 auto;
        }
        .odin-close-btn:active {
          transform: scale(0.98);
        }
.odin-header-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .odin-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
        }
        .odin-status-dot.offline { background: #ef4444; }
        .odin-status-dot.connecting { background: #fbbf24; animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        /* Tab Navigation */
        .odin-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 8px;
          background: #16213e;
          border-bottom: 1px solid rgba(233, 69, 96, 0.3);
        }
        .odin-tab {
          flex: 1;
          min-width: 70px;
          padding: 8px 10px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          color: #a0a0a0;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
        }
        .odin-tab:hover { background: rgba(233, 69, 96, 0.1); color: #fff; }
        .odin-tab.active {
          background: linear-gradient(135deg, #e94560 0%, #c73e54 100%);
          color: #fff;
          border-color: #e94560;
        }

        /* Content Area */
        .odin-content {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          color: #e0e0e0;
          max-height: 550px;
        }
        .odin-content::-webkit-scrollbar { width: 6px; }
        .odin-content::-webkit-scrollbar-track { background: #1a1a2e; }
        .odin-content::-webkit-scrollbar-thumb { background: #e94560; border-radius: 3px; }

        /* Common Components */
        .odin-card {
          background: rgba(22, 33, 62, 0.8);
          border: 1px solid rgba(233, 69, 96, 0.2);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
        }
        .odin-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .odin-card-title {
          color: #fff;
          font-size: 14px;
          font-weight: 600;
        }
        .odin-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 500;
        }
        .odin-badge.success { background: #22c55e; color: #fff; }
        .odin-badge.warning { background: #f59e0b; color: #000; }
        .odin-badge.danger { background: #ef4444; color: #fff; }
        .odin-badge.info { background: #3b82f6; color: #fff; }
        .odin-badge.neutral { background: #6b7280; color: #fff; }

        .odin-btn {
          padding: 8px 16px;
          border-radius: 6px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .odin-btn-primary {
          background: linear-gradient(135deg, #e94560 0%, #c73e54 100%);
          color: #fff;
        }
        .odin-btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
        }
        .odin-btn-secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #e0e0e0;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .odin-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .odin-btn-small {
          padding: 4px 10px;
          font-size: 11px;
        }
        .odin-btn-success {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: #fff;
        }
        .odin-btn-danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
        }

        /* Form Elements */
        .odin-form-group {
          margin-bottom: 16px;
        }
        .odin-form-label {
          display: block;
          color: #a0a0a0;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .odin-input {
          width: 100%;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          font-size: 13px;
          box-sizing: border-box;
        }
        .odin-input:focus {
          outline: none;
          border-color: #e94560;
        }
        .odin-checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .odin-checkbox-group input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #e94560;
        }
        .odin-checkbox-group label {
          color: #e0e0e0;
          font-size: 13px;
        }
        .odin-select {
          width: 100%;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #fff;
          font-size: 13px;
        }

        /* Stats Grid */
        .odin-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .odin-stat-item {
          text-align: center;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
        }
        .odin-stat-value {
          font-size: 24px;
          font-weight: 700;
          color: #e94560;
        }
        .odin-stat-label {
          font-size: 11px;
          color: #a0a0a0;
          margin-top: 4px;
        }

        /* Target List */
        .odin-target-item {
          display: flex;
          align-items: center;
          padding: 10px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
          margin-bottom: 8px;
        }
        .odin-target-item.claimed {
          border-left: 3px solid #f59e0b;
        }
        .odin-score {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
        }
        .odin-score.high { background: #22c55e; color: #fff; }
        .odin-score.medium { background: #f59e0b; color: #000; }
        .odin-score.low { background: #ef4444; color: #fff; }
        .odin-target-info { flex: 1; margin-left: 12px; }
        .odin-target-name a { color: #60a5fa; text-decoration: none; }
        .odin-target-name a:hover { text-decoration: underline; }
        .odin-target-meta { font-size: 11px; color: #a0a0a0; margin-top: 2px; }
        .odin-target-actions { display: flex; gap: 6px; }

        /* Empty State */
        .odin-empty {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }
        .odin-empty-icon { font-size: 48px; margin-bottom: 12px; }

        /* Toast */
        .odin-toast {
          position: fixed;
          bottom: 90px;
          right: 20px;
          padding: 12px 20px;
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          z-index: 100000;
          animation: slideIn 0.3s ease;
        }
        .odin-toast.success { background: #22c55e; }
        .odin-toast.error { background: #ef4444; }
        .odin-toast.warning { background: #f59e0b; color: #000; }
        .odin-toast.info { background: #3b82f6; }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        /* Chain Timer */
        .odin-chain-timer {
          font-size: 48px;
          font-weight: 700;
          text-align: center;
          padding: 20px;
        }
        .odin-chain-timer.safe { color: #22c55e; }
        .odin-chain-timer.warning { color: #f59e0b; }
        .odin-chain-timer.danger { color: #ef4444; }

        /* Schedule Grid */
        .odin-schedule-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
        }
        .odin-schedule-slot {
          padding: 8px 4px;
          text-align: center;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          font-size: 10px;
          cursor: pointer;
        }
        .odin-schedule-slot.filled { background: rgba(34, 197, 94, 0.3); }
        .odin-schedule-slot.empty { background: rgba(239, 68, 68, 0.3); }
        .odin-schedule-slot.mine { background: rgba(59, 130, 246, 0.3); }

        /* Heatmap */
        .odin-heatmap {
          display: grid;
          grid-template-columns: 20px repeat(24, 1fr);
          gap: 2px;
        }
        .odin-heatmap-label { font-size: 9px; color: #6b7280; text-align: center; }
        .odin-heatmap-cell { height: 12px; border-radius: 2px; }

        /* Member List */
        .odin-member-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
          margin-bottom: 6px;
        }
        .odin-member-name { color: #60a5fa; font-size: 13px; }
        .odin-member-status { font-size: 11px; }
      

/* Mobile Responsiveness */
@media (max-width: 768px) {
  #odin-panel {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: 95vw;
    top: 54px;
    max-height: 72vh;
    border-radius: 14px;
  }

  .odin-header {
    padding: 10px 12px;
  }

  .odin-header-title {
    font-size: 16px;
  }

  .odin-close-btn {
    width: 44px;
    height: 44px;
  }

  .odin-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    padding: 6px 8px;
    gap: 6px;
  }

  .odin-tabs::-webkit-scrollbar { height: 6px; }
  .odin-tabs::-webkit-scrollbar-track { background: #1a1a2e; }
  .odin-tabs::-webkit-scrollbar-thumb { background: rgba(233, 69, 96, 0.8); border-radius: 3px; }

  .odin-tab {
    flex: 0 0 auto;
    min-width: 120px;
    padding: 8px 10px;
    font-size: 12px;
  }

  .odin-content {
    padding: 12px;
    max-height: none;
  }

  .odin-btn {
    padding: 12px 14px;
    font-size: 14px;
    border-radius: 10px;
  }

  input.odin-input, textarea.odin-input, select.odin-input,
  input.odin-form-input, textarea.odin-form-input, select.odin-form-input {
    font-size: 16px;
    padding: 12px 12px;
  }
}

`;
      document.head.appendChild(styles);
    }

    // ============================================
    // CREATE UI ELEMENTS
    // ============================================
    function createToggleButton() {
      toggleButton = document.createElement('button');
      toggleButton.id = 'odin-toggle-btn';
      toggleButton.innerHTML = `<img src=\"https://i.postimg.cc/BQ6bSYKM/file-000000004bb071f5a96fc52564bf26ad-(1).png\" alt=\"Odin Tools\" />`;
      toggleButton.title = 'Odin Faction Tools';
      toggleButton.onclick = togglePanel;
      document.body.appendChild(toggleButton);
    }

    function createPanel() {
      panelElement = document.createElement('div');
      panelElement.id = 'odin-panel';

      const connectionStatus = firebaseConnected ? 'connected' : 'connecting';

      panelElement.innerHTML = `
        <div class="odin-header">
          <div class="odin-header-title">
            <img class="odin-header-logo" src="https://i.postimg.cc/BQ6bSYKM/file-000000004bb071f5a96fc52564bf26ad-(1).png" alt="Odin Tools" />
            <span>Odin Tools</span>
          </div>
          <div class="odin-header-status">
            <div id="odin-status-dot" class="odin-status-dot ${connectionStatus === 'connected' ? '' : 'connecting'}"></div>
            <span id="odin-status-text" style="color: #a0a0a0; font-size: 11px;">
              ${connectionStatus === 'connected' ? 'Online' : 'Connecting...'}
            </span>
          </div>
        <button id="odin-panel-close" class="odin-close-btn" title="Close">✕</button>
        </div>
        <div class="odin-tabs">
          ${Object.entries(tabs).map(([id, tab]) => `
            <button class="odin-tab ${id === activeTab ? 'active' : ''}" data-tab="${id}">
              ${tab.label}
            </button>
          `).join('')}
        </div>
        <div class="odin-content" id="odin-tab-content">
          <!-- Content injected dynamically -->
        </div>
      `;

      

const closeBtn = panelElement.querySelector('#odin-panel-close');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    hidePanel();
  }, { passive: true });
}
// Tab click handlers
      panelElement.querySelectorAll('.odin-tab').forEach(tab => {
        tab.onclick = () => switchTab(tab.dataset.tab);
      });

      document.body.appendChild(panelElement);
      renderTabContent(activeTab);
    }

    function switchTab(tabId) {
      activeTab = tabId;
      panelElement.querySelectorAll('.odin-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
      });
      renderTabContent(tabId);
    }

    // ============================================
    // TAB RENDERERS
    // ============================================
    function renderTabContent(tabId) {
      const container = document.getElementById('odin-tab-content');
      if (!container) return;

      // Guard data-sensitive tabs until Firebase is connected AND auth user exists
      if (AUTH_REQUIRED_TABS.has(tabId) && !isAuthReady()) {
        container.innerHTML = renderAuthGate(tabId);
        attachAuthGateHandlers(tabId);
        return;
      }

      switch (tabId) {
        case 'warRoom':
          container.innerHTML = renderWarRoomTab();
          break;
        case 'targets':
          container.innerHTML = renderTargetsTab();
          break;
        case 'chain':
          container.innerHTML = renderChainTab();
          break;
        case 'schedule':
          container.innerHTML = renderScheduleTab();
          break;
        case 'leadership':
          container.innerHTML = renderLeadershipTab();
          break;
        case 'personal':
          container.innerHTML = renderPersonalTab();
          break;
        case 'settings':
          container.innerHTML = renderSettingsTab();
          attachSettingsHandlers();
          break;
        default:
          container.innerHTML = '<div class="odin-empty">Tab not found</div>';
      }
    }

    function renderWarRoomTab() {
      const state = ctx.spear?.getState?.() || {};
      const claims = state.claims || {};
      const dibs = state.dibs || {};
      const chain = state.chain || {};
      const presence = state.presence || {};

      const activeClaims = Object.values(claims).filter(c => c.status === 'active').length;
      const activeDibs = Object.values(dibs).filter(d => d.status === 'active').length;
      const onlineMembers = Object.values(presence).filter(p => p.status === 'online').length;

      return `
        <div class="odin-stats-grid">
          <div class="odin-stat-item">
            <div class="odin-stat-value">${activeClaims}</div>
            <div class="odin-stat-label">Active Claims</div>
          </div>
          <div class="odin-stat-item">
            <div class="odin-stat-value">${activeDibs}</div>
            <div class="odin-stat-label">Active Dibs</div>
          </div>
          <div class="odin-stat-item">
            <div class="odin-stat-value">${onlineMembers}</div>
            <div class="odin-stat-label">Online</div>
          </div>
          <div class="odin-stat-item">
            <div class="odin-stat-value">${chain.current || 0}</div>
            <div class="odin-stat-label">Chain</div>
          </div>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">⚡ Quick Actions</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="odin-btn odin-btn-primary" onclick="window.OdinUI.refreshClaims()">
              🔄 Refresh
            </button>
            <button class="odin-btn odin-btn-secondary" onclick="window.OdinUI.scoreAllTargets()">
              🎯 Score Targets
            </button>
            <button class="odin-btn odin-btn-secondary" onclick="window.OdinUI.startWatching()">
              👁️ Watch Mode
            </button>
          </div>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">📋 Recent Activity</div>
          </div>
          <div style="font-size: 12px; color: #a0a0a0;">
            ${renderRecentActivity()}
          </div>
        </div>
      `;
    }

    function renderTargetsTab() {
      const state = ctx.spear?.getState?.() || {};
      const targets = state.targets || {};
      const claims = state.claims || {};

      return `
        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">➕ Add Target</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="odin-add-target-input" class="odin-input" 
                   placeholder="Player ID or profile URL" style="flex: 1;">
            <button class="odin-btn odin-btn-primary" onclick="window.OdinUI.addTarget()">
              Add
            </button>
          </div>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">🎯 Faction Targets</div>
            <span class="odin-badge info">${Object.keys(targets).length}</span>
          </div>
          ${renderTargetList(targets, claims)}
        </div>
      `;
    }

    function renderChainTab() {
      const state = ctx.spear?.getState?.() || {};
      const chain = state.chain || {};
      const timeout = chain.timeout || 0;
      const timerClass = getChainTimerClass(timeout);

      return `
        <div class="odin-card">
          <div class="odin-chain-timer ${timerClass}">
            ${formatChainTimer(timeout)}
          </div>
          <div style="text-align: center; margin-bottom: 16px;">
            <span style="font-size: 24px; font-weight: 600; color: #fff;">
              ${chain.current || 0}
            </span>
            <span style="color: #6b7280;"> / ${chain.max || 0}</span>
          </div>
          <div style="display: flex; justify-content: center; gap: 8px;">
            <button class="odin-btn odin-btn-danger" onclick="window.OdinUI.alertChain()">
              🚨 Alert
            </button>
            <button class="odin-btn odin-btn-secondary" onclick="window.OdinUI.refreshClaims()">
              🔄 Refresh
            </button>
          </div>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">📊 Chain Stats</div>
          </div>
          <div class="odin-stats-grid">
            <div class="odin-stat-item">
              <div class="odin-stat-value">${chain.hitsToday || 0}</div>
              <div class="odin-stat-label">Hits Today</div>
            </div>
            <div class="odin-stat-item">
              <div class="odin-stat-value">${chain.respectEarned || 0}</div>
              <div class="odin-stat-label">Respect</div>
            </div>
          </div>
        </div>
      `;
    }

    function renderScheduleTab() {
      const state = ctx.spear?.getState?.() || {};
      const schedule = state.watcherSchedule || {};
      const myId = ctx.userId;

      return `
        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">📅 Watcher Schedule</div>
          </div>
          <div class="odin-schedule-grid">
            ${renderScheduleGrid(schedule, myId)}
          </div>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">✏️ Sign Up for Slot</div>
          </div>
          <div class="odin-form-group">
            <label class="odin-form-label">Select Day</label>
            <select id="odin-schedule-day" class="odin-select">
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </select>
          </div>
          <div class="odin-form-group">
            <label class="odin-form-label">Select Hour</label>
            <select id="odin-schedule-hour" class="odin-select">
              ${Array.from({length: 24}, (_, i) => 
                `<option value="${i}">${String(i).padStart(2, '0')}:00</option>`
              ).join('')}
            </select>
          </div>
          <button class="odin-btn odin-btn-primary" onclick="window.OdinUI.signUpForSlot()">
            Sign Up
          </button>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">🔥 Activity Heatmap</div>
          </div>
          <div class="odin-heatmap">
            ${renderHeatmap(schedule.heatmap || {})}
          </div>
        </div>
      `;
    }

    function renderLeadershipTab() {
      const canViewLeadership = ctx.access?.canViewLeadership?.() || false;
      
      if (!canViewLeadership) {
        return `
          <div class="odin-empty">
            <div class="odin-empty-icon">🔒</div>
            <div>Leadership features require elevated permissions</div>
          </div>
        `;
      }

      const state = ctx.spear?.getState?.() || {};
      const members = state.members || {};
      const presence = state.presence || {};

      return `
        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">👥 Faction Members</div>
            <span class="odin-badge info">${Object.keys(members).length}</span>
          </div>
          ${renderMemberList(members, presence)}
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">📊 Bulk Operations</div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="odin-btn odin-btn-secondary" onclick="window.OdinUI.exportData()">
              📤 Export Data
            </button>
            <button class="odin-btn odin-btn-secondary" onclick="window.OdinUI.clearExpired()">
              🧹 Clear Expired
            </button>
          </div>
        </div>
      `;
    }

    function renderPersonalTab() {
      const state = ctx.spear?.getState?.() || {};
      const favorites = state.favorites || {};
      const personalTargets = state.personalTargets || {};
      const frekiInfo = ctx.freki?.getModelInfo?.() || {};

      return `
        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">⭐ Favorites</div>
            <span class="odin-badge info">${Object.keys(favorites).length}</span>
          </div>
          ${renderFavoritesList(favorites)}
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">🎯 Personal Targets</div>
            <span class="odin-badge info">${Object.keys(personalTargets).length}</span>
          </div>
          ${renderPersonalTargetsList(personalTargets)}
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">🧠 Freki AI Stats</div>
          </div>
          <div style="font-size: 12px; color: #a0a0a0;">
            <div>Model Version: ${frekiInfo.version || 'Not loaded'}</div>
            <div>Training Samples: ${frekiInfo.trainingCount || 0}</div>
            <div>Cache Size: ${frekiInfo.cacheSize || 0}</div>
          </div>
          <button class="odin-btn odin-btn-secondary odin-btn-small" 
                  onclick="window.OdinUI.getRecommendations()" style="margin-top: 8px;">
            🎲 Get Recommendations
          </button>
        </div>
      `;
    }

    function renderSettingsTab() {
      const settings = ctx.settings || {};
      const tornKeyExists = !!(ctx.api?.getTornApiKey?.() && String(ctx.api.getTornApiKey()).length > 8);
            const tornStatsKeyExists = !!(ctx.api?.hasTornStatsKey?.());
            const ffScouterKeyExists = !!(ctx.api?.hasFFScouterKey?.());

      return `
        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">🔑 API Keys</div>
          </div>
          <div class="odin-form-group">
            <label class="odin-form-label">
              Torn API Key 
              ${tornKeyExists ? '<span class="odin-badge success">Configured</span>' : '<span class="odin-badge danger">Required</span>'}
            </label>
            <input type="password" id="odin-torn-api-key" class="odin-input" 
                   placeholder="${tornKeyExists ? 'Key saved - enter new key to change' : 'Enter your Torn API key'}"
                   data-has-key="${tornKeyExists}">
          </div>
          <div class="odin-form-group">
            <label class="odin-form-label">
              TornStats API Key
              ${tornStatsKeyExists ? '<span class="odin-badge success">Configured</span>' : '<span class="odin-badge neutral">Optional</span>'}
            </label>
            <input type="password" id="odin-tornstats-key" class="odin-input" 
                   placeholder="${tornStatsKeyExists ? 'Key saved - enter new key to change' : 'Optional - for enhanced stats'}"
                   data-has-key="${tornStatsKeyExists}">
          </div>
          <div class="odin-form-group">
            <label class="odin-form-label">
              FFScouter API Key
              ${ffScouterKeyExists ? '<span class="odin-badge success">Configured</span>' : '<span class="odin-badge neutral">Optional</span>'}
            </label>
            <input type="password" id="odin-ffscouter-key" class="odin-input" 
                   placeholder="${ffScouterKeyExists ? 'Key saved - enter new key to change' : 'Optional - for scouting data'}"
                   data-has-key="${ffScouterKeyExists}">
          </div>
          <button class="odin-btn odin-btn-primary" onclick="window.OdinUI.saveApiKeys()">
            💾 Save API Keys
          </button>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">⚙️ Preferences</div>
          </div>
          <div class="odin-checkbox-group">
            <input type="checkbox" id="odin-auto-score" ${settings.autoScore ? 'checked' : ''}>
            <label for="odin-auto-score">Auto-score targets on visit</label>
          </div>
          <div class="odin-checkbox-group">
            <input type="checkbox" id="odin-show-buttons" ${settings.showButtons !== false ? 'checked' : ''}>
            <label for="odin-show-buttons">Show buttons on profiles</label>
          </div>
          <div class="odin-checkbox-group">
            <input type="checkbox" id="odin-chain-alerts" ${settings.chainAlerts ? 'checked' : ''}>
            <label for="odin-chain-alerts">Enable chain alerts</label>
          </div>
          <div class="odin-form-group">
            <label class="odin-form-label">Claim Expiry (minutes)</label>
            <select id="odin-claim-expiry" class="odin-select">
              ${[5, 10, 15, 20, 30].map(m => 
                `<option value="${m}" ${settings.claimExpiry === m ? 'selected' : ''}>${m} minutes</option>`
              ).join('')}
            </select>
          </div>
          <button class="odin-btn odin-btn-secondary" onclick="window.OdinUI.savePreferences()">
            💾 Save Preferences
          </button>
        </div>

        <div class="odin-card">
          <div class="odin-card-header">
            <div class="odin-card-title">ℹ️ About</div>
          </div>
          <div style="font-size: 12px; color: #a0a0a0;">
            <div>Odin Faction Tools v${UI_VERSION}</div>
            <div>By BjornOdinsson89</div>
            <div style="margin-top: 8px;">
              Role: ${ctx.access?.getEffectiveRole?.() || 'Unknown'}
            </div>
          </div>
        </div>
      `;
    }

    // ============================================
    // SETTINGS HANDLERS (FIXED)
    // ============================================
    function attachSettingsHandlers() {
      // Mark keys as dirty when user types
      ['odin-torn-api-key', 'odin-tornstats-key', 'odin-ffscouter-key'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('input', () => {
            const keyType = id.replace('odin-', '').replace('-key', '').replace('-api', '');
            apiKeysDirty[keyType] = true;
          });
        }
      });
    }

    // ============================================
    // RENDER HELPERS
    // ============================================
    function renderRecentActivity() {
      const activity = ctx.spear?.getRecentActivity?.() || [];
      if (activity.length === 0) {
        return '<div style="text-align: center; padding: 10px;">No recent activity</div>';
      }
      return activity.slice(0, 5).map(a => `
        <div style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
          ${a.icon || '📌'} ${a.message || 'Unknown activity'}
          <span style="float: right; color: #6b7280;">${formatTimeAgo(a.timestamp)}</span>
        </div>
      `).join('');
    }

    function renderTargetList(targets, claims) {
      const targetArray = Object.entries(targets);
      if (targetArray.length === 0) {
        return '<div class="odin-empty"><div class="odin-empty-icon">🎯</div>No targets added</div>';
      }

      return targetArray.map(([targetId, target]) => {
        const isClaimed = claims[targetId];
        const scoreClass = target.frekiScore >= 70 ? 'high' : target.frekiScore >= 40 ? 'medium' : 'low';
        
        return `
          <div class="odin-target-item ${isClaimed ? 'claimed' : ''}">
            <div class="odin-score ${scoreClass}">${target.frekiScore || '?'}</div>
            <div class="odin-target-info">
              <div class="odin-target-name">
                <a href="https://www.torn.com/profiles.php?XID=${targetId}" target="_blank">
                  ${escapeHtml(target.targetName || targetId)}
                </a>
              </div>
              <div class="odin-target-meta">
                Level ${target.level || '?'} · ${escapeHtml(target.factionName || 'No Faction')}
                ${isClaimed ? ` · <span class="odin-badge warning">Claimed</span>` : ''}
              </div>
            </div>
            <div class="odin-target-actions">
              ${!isClaimed ? `
                <button class="odin-btn odin-btn-small odin-btn-primary" 
                        onclick="window.OdinUI.claimTarget('${targetId}')">Claim</button>
              ` : `
                <button class="odin-btn odin-btn-small odin-btn-secondary" 
                        onclick="window.OdinUI.releaseClaim('${targetId}')">Release</button>
              `}
              <button class="odin-btn odin-btn-small odin-btn-danger" 
                      onclick="window.OdinUI.removeTarget('${targetId}')">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderScheduleGrid(schedule, myId) {
      const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      let html = '';
      
      for (let day = 0; day < 7; day++) {
        const daySchedule = schedule[day] || {};
        const filledSlots = Object.keys(daySchedule).length;
        const isMine = Object.values(daySchedule).some(s => s.playerId === myId);
        
        html += `
          <div class="odin-schedule-slot ${filledSlots > 0 ? 'filled' : 'empty'} ${isMine ? 'mine' : ''}"
               onclick="window.OdinUI.viewDaySchedule(${day})"
               title="${days[day]}: ${filledSlots} slots filled">
            <div style="font-weight: 600;">${days[day]}</div>
            <div style="font-size: 8px;">${filledSlots}/24</div>
          </div>
        `;
      }
      
      return html;
    }

    function renderHeatmap(heatmap) {
      const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const hours = Array.from({ length: 24 }, (_, i) => i);

      let html = '<div class="odin-heatmap-label"></div>';
      
      hours.forEach(h => {
        if (h % 4 === 0) {
          html += `<div class="odin-heatmap-label">${h}</div>`;
        } else {
          html += `<div class="odin-heatmap-label"></div>`;
        }
      });

      days.forEach((day, dayIndex) => {
        html += `<div class="odin-heatmap-label">${day}</div>`;
        hours.forEach(hour => {
          const key = `${dayIndex}_${hour}`;
          const value = heatmap[key] || 0;
          const color = getHeatmapColor(value);
          html += `<div class="odin-heatmap-cell" style="background: ${color};" 
                       title="${day} ${hour}:00 - ${value} online"></div>`;
        });
      });

      return html;
    }

    function renderMemberList(members, presence) {
      const memberArray = Object.entries(members);
      if (memberArray.length === 0) {
        return '<div style="text-align: center; padding: 10px; color: #6b7280;">No members loaded</div>';
      }

      return memberArray.slice(0, 20).map(([id, member]) => {
        const status = presence[id]?.status || 'offline';
        const statusColor = status === 'online' ? '#22c55e' : status === 'away' ? '#f59e0b' : '#6b7280';
        
        return `
          <div class="odin-member-item">
            <div>
              <span class="odin-member-name">${escapeHtml(member.name || id)}</span>
              <div style="font-size: 10px; color: #6b7280;">Level ${member.level || '?'}</div>
            </div>
            <div class="odin-member-status" style="color: ${statusColor};">
              ● ${status}
            </div>
          </div>
        `;
      }).join('');
    }

    function renderFavoritesList(favorites) {
      const favArray = Object.entries(favorites);
      if (favArray.length === 0) {
        return '<div style="text-align: center; padding: 10px; color: #6b7280;">No favorites yet</div>';
      }

      return favArray.map(([id, fav]) => `
        <div class="odin-member-item">
          <a href="https://www.torn.com/profiles.php?XID=${id}" target="_blank" class="odin-member-name">
            ${escapeHtml(fav.name || id)}
          </a>
          <button class="odin-btn odin-btn-small odin-btn-danger" 
                  onclick="window.OdinUI.removeFavorite('${id}')">✕</button>
        </div>
      `).join('');
    }

    function renderPersonalTargetsList(targets) {
      const targetArray = Object.entries(targets);
      if (targetArray.length === 0) {
        return '<div style="text-align: center; padding: 10px; color: #6b7280;">No personal targets</div>';
      }

      return targetArray.map(([id, target]) => `
        <div class="odin-member-item">
          <a href="https://www.torn.com/profiles.php?XID=${id}" target="_blank" class="odin-member-name">
            ${escapeHtml(target.name || id)}
          </a>
          <span class="odin-badge ${target.frekiScore >= 70 ? 'success' : target.frekiScore >= 40 ? 'warning' : 'danger'}">
            ${target.frekiScore || '?'}
          </span>
        </div>
      `).join('');
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatChainTimer(timeout) {
      if (!timeout || timeout <= 0) return '00:00';
      const minutes = Math.floor(timeout / 60);
      const seconds = timeout % 60;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function getChainTimerClass(timeout) {
      if (!timeout || timeout <= 0) return 'danger';
      if (timeout < 60) return 'danger';
      if (timeout < 180) return 'warning';
      return 'safe';
    }

    function formatTimeAgo(timestamp) {
      if (!timestamp) return 'unknown';
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    }

    function getHeatmapColor(value) {
      if (value >= 8) return 'rgba(34, 197, 94, 0.8)';
      if (value >= 4) return 'rgba(245, 158, 11, 0.8)';
      if (value >= 1) return 'rgba(239, 68, 68, 0.5)';
      return 'rgba(107, 114, 128, 0.3)';
    }

    // ============================================
    // PANEL CONTROLS
    // ============================================
    function togglePanel() {
      isVisible = !isVisible;
      panelElement.classList.toggle('visible', isVisible);
      toggleButton.classList.toggle('active', isVisible);
      
      if (isVisible) {
        renderTabContent(activeTab);
      }
    }

    function showPanel() {
      isVisible = true;
      panelElement.classList.add('visible');
      toggleButton.classList.add('active');
      renderTabContent(activeTab);
    }

    function hidePanel() {
      isVisible = false;
      panelElement.classList.remove('visible');
      toggleButton.classList.remove('active');
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================
    function showToast(message, type = 'info') {
      const existing = document.querySelector('.odin-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = `odin-toast ${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 4000);
    }

    // ============================================
    // PUBLIC API ACTIONS (FIXED)
    // ============================================
    window.OdinUI = {
      refreshClaims: () => nexus.emit?.('REFRESH_CLAIMS'),
      addTarget: () => {
        const input = document.getElementById('odin-add-target-input');
        if (input?.value) {
          nexus.emit?.('ADD_TARGET', { targetId: input.value });
          input.value = '';
        }
      },
      claimTarget: (targetId) => nexus.emit?.('CLAIM_TARGET', { targetId, type: 'attack' }),
      releaseClaim: (targetId) => nexus.emit?.('RELEASE_CLAIM', { targetId }),
      removeTarget: (targetId) => nexus.emit?.('REMOVE_TARGET', { targetId }),
      scoreAllTargets: () => nexus.emit?.('SCORE_ALL_TARGETS'),
      startWatching: () => nexus.emit?.('START_WATCHING'),
      alertChain: () => nexus.emit?.('ALERT_CHAIN'),
      signUpForSlot: () => {
        const day = document.getElementById('odin-schedule-day')?.value;
        const hour = document.getElementById('odin-schedule-hour')?.value;
        if (day !== undefined && hour !== undefined) {
          nexus.emit?.('SIGN_UP_SLOT', { day: parseInt(day), hour: parseInt(hour) });
          showToast('Signed up for slot!', 'success');
        }
      },
      viewDaySchedule: (day) => {
        nexus.emit?.('VIEW_DAY_SCHEDULE', { day });
      },
      removeFavorite: (targetId) => nexus.emit?.('REMOVE_FAVORITE', { targetId }),
      getRecommendations: () => nexus.emit?.('GET_RECOMMENDATIONS'),
      exportData: () => nexus.emit?.('EXPORT_DATA'),
      clearExpired: () => nexus.emit?.('CLEAR_EXPIRED'),
      
      // FIXED: Only save keys that were actually changed
      saveApiKeys: () => {
        const tornKeyInput = document.getElementById('odin-torn-api-key');
        const tornStatsKeyInput = document.getElementById('odin-tornstats-key');
        const ffScouterKeyInput = document.getElementById('odin-ffscouter-key');

        const tornKey = tornKeyInput?.value?.trim();
        const tornStatsKey = tornStatsKeyInput?.value?.trim();
        const ffScouterKey = ffScouterKeyInput?.value?.trim();

        try {
          if (tornKey && tornKey.length > 8) {
            ctx.api?.setTornApiKey?.(tornKey, { persist: true, silent: true });
          }
          if (tornStatsKey && tornStatsKey.length > 8) {
            ctx.api?.setTornStatsApiKey?.(tornStatsKey, { persist: true, silent: true });
          }
          if (ffScouterKey && ffScouterKey.length > 8) {
            ctx.api?.setFFScouterApiKey?.(ffScouterKey, { persist: true, silent: true });
          }

          // Clear inputs after save
          if (tornKeyInput) tornKeyInput.value = '';
          if (tornStatsKeyInput) tornStatsKeyInput.value = '';
          if (ffScouterKeyInput) ffScouterKeyInput.value = '';

          apiKeysDirty = { torn: false, tornStats: false, ffScouter: false };

          showToast('API keys saved locally!', 'success');
          renderTabContent('settings');
        } catch (e) {
          showToast('Failed to save API keys: ' + (e && e.message ? e.message : String(e)), 'error');
        }
      },
      
      savePreferences: () => {
        const prefs = {
          autoScore: document.getElementById('odin-auto-score')?.checked,
          showButtons: document.getElementById('odin-show-buttons')?.checked,
          chainAlerts: document.getElementById('odin-chain-alerts')?.checked,
          claimExpiry: parseInt(document.getElementById('odin-claim-expiry')?.value) || 10
        };
        
        const settings = { ...ctx.settings, ...prefs };
        ctx.saveSettings(settings);
        nexus.emit?.('SAVE_PREFERENCES', prefs);
        showToast('Preferences saved!', 'success');
      },
      
      showToast,
      refresh: () => renderTabContent(activeTab)
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[UIManager] Initializing v' + UI_VERSION);

      injectStyles();
      createToggleButton();
      createPanel();

      // Subscribe to state changes
      nexus.on?.('STATE_CHANGED', () => {
        if (isVisible) {
          renderTabContent(activeTab);
        }
      });

      // Update connection status
      nexus.on?.('FIREBASE_CONNECTED', () => {
        firebaseConnected = true;
        const dot = document.getElementById('odin-status-dot');
        const text = document.getElementById('odin-status-text');
        if (dot) dot.className = 'odin-status-dot';
        if (text) text.textContent = 'Online';
        // Re-render current tab if visible and was previously gated
        if (isVisible && AUTH_REQUIRED_TABS.has(activeTab) && !authUserPresent) {
          renderTabContent(activeTab);
        }
      });


      nexus.on?.('FIREBASE_DISCONNECTED', () => {
        firebaseConnected = false;
        authUserPresent = false;
        const dot = document.getElementById('odin-status-dot');
        const text = document.getElementById('odin-status-text');
        if (dot) dot.className = 'odin-status-dot connecting';
        if (text) text.textContent = 'Offline';
        if (isVisible && AUTH_REQUIRED_TABS.has(activeTab)) {
          renderTabContent(activeTab);
        }
      });

      nexus.on?.('AUTH_STATE_CHANGED', (payload) => {
        authUserPresent = !!payload?.user;
        if (isVisible && AUTH_REQUIRED_TABS.has(activeTab)) {
          renderTabContent(activeTab);
        }
      });


      log('[UIManager] Ready');
    }

    function destroy() {
      log('[UIManager] Destroying...');
      
      if (panelElement) panelElement.remove();
      if (toggleButton) toggleButton.remove();
      
      const styles = document.getElementById('odin-ui-styles');
      if (styles) styles.remove();

      window.OdinUI = null;
      log('[UIManager] Destroyed');
    }

    return { 
      id: 'odin-ui-manager', 
      init, 
      destroy, 
      showToast, 
      showPanel, 
      hidePanel, 
      refresh: () => renderTabContent(activeTab) 
    };
  });
})();
