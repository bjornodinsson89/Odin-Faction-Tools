// ui-settings.js
// Settings panel UI
// Version: 3.1.0 
// Author: BjornOdinsson89

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_SettingsInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const log = ctx.log || console.log;

    // ============================================
    // SETTINGS DEFAULTS
    // ============================================
    const defaultSettings = {
      tornApiKey: '',
      tornStatsApiKey: '',
      ffScouterEnabled: false,
      theme: 'dark',
      compactMode: false,
      autoRefreshInterval: 10000,
      notifications: {
        chainWarning: true,
        claimConflicts: true,
        retalCandidates: true,
        watcherAlerts: true,
        sound: false,
      },
      display: {
        showFrekiScores: true,
        showClaimStatus: true,
        showMemberStatus: true,
        animationsEnabled: true,
      },
      freki: {
        useExternalData: true,
        useTornStats: true,
        useFFScouter: true,
        modelVersion: 'latest',
        autoSync: true,
      },
    };

    function getSettings() {
      const saved = storage.getJSON('odin_settings');
      return { ...defaultSettings, ...saved };
    }

    function saveSettings(settings) {
      storage.setJSON('odin_settings', settings);
      nexus.emit('SETTINGS_UPDATED', settings);
    }

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderSettings() {
      const UI = window.OdinUI?.helpers;
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const settings = getSettings();

      // ============================================
      // API CONFIGURATION SECTION
      // ============================================
      const apiSection = UI.createSection('API Configuration', '🔑');

      const apiCard = UI.createCard(`
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              Torn API Key
            </label>
            <input type="password" id="setting-torn-api-key" 
              value="${settings.tornApiKey || ''}"
              placeholder="Enter your Torn API key"
              style="
                width: 100%;
                padding: 10px 12px;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 6px;
                color: #e2e8f0;
                font-size: 14px;
              ">
            <p style="font-size: 11px; color: #718096; margin-top: 4px;">
              Required for basic functionality. Get your key from Torn Settings → API Key.
            </p>
          </div>

          <div>
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              TornStats API Key (Optional)
            </label>
            <input type="password" id="setting-tornstats-api-key" 
              value="${settings.tornStatsApiKey || ''}"
              placeholder="Enter your TornStats API key"
              style="
                width: 100%;
                padding: 10px 12px;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 6px;
                color: #e2e8f0;
                font-size: 14px;
              ">
            <p style="font-size: 11px; color: #718096; margin-top: 4px;">
              Enables enhanced stat estimates. Register at tornstats.com.
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-ffscouter-enabled" 
              ${settings.ffScouterEnabled ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-ffscouter-enabled" style="color: #e2e8f0; font-size: 14px;">
              Enable Fair Fight Scouter Integration
            </label>
          </div>
        </div>
      `);

      apiSection.appendChild(apiCard);
      container.appendChild(apiSection);

      // ============================================
      // DISPLAY SETTINGS SECTION
      // ============================================
      const displaySection = UI.createSection('Display Settings', '🎨');

      const displayCard = UI.createCard(`
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-compact-mode" 
              ${settings.compactMode ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-compact-mode" style="color: #e2e8f0; font-size: 14px;">
              Compact Mode
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-animations" 
              ${settings.display?.animationsEnabled !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-animations" style="color: #e2e8f0; font-size: 14px;">
              Enable Animations
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-show-freki" 
              ${settings.display?.showFrekiScores !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-show-freki" style="color: #e2e8f0; font-size: 14px;">
              Show Freki Scores on Targets
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-show-claims" 
              ${settings.display?.showClaimStatus !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-show-claims" style="color: #e2e8f0; font-size: 14px;">
              Show Claim Status Indicators
            </label>
          </div>
        </div>
      `);

      displaySection.appendChild(displayCard);
      container.appendChild(displaySection);

      // ============================================
      // NOTIFICATION SETTINGS SECTION
      // ============================================
      const notifSection = UI.createSection('Notifications', '🔔');

      const notifCard = UI.createCard(`
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-notif-chain" 
              ${settings.notifications?.chainWarning !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-notif-chain" style="color: #e2e8f0; font-size: 14px;">
              Chain Warning Alerts
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-notif-claims" 
              ${settings.notifications?.claimConflicts !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-notif-claims" style="color: #e2e8f0; font-size: 14px;">
              Claim Conflict Alerts
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-notif-retals" 
              ${settings.notifications?.retalCandidates !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-notif-retals" style="color: #e2e8f0; font-size: 14px;">
              Retaliation Candidate Alerts
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-notif-watchers" 
              ${settings.notifications?.watcherAlerts !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-notif-watchers" style="color: #e2e8f0; font-size: 14px;">
              Watcher Shift Alerts
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-notif-sound" 
              ${settings.notifications?.sound ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-notif-sound" style="color: #e2e8f0; font-size: 14px;">
              Enable Sound Effects
            </label>
          </div>
        </div>
      `);

      notifSection.appendChild(notifCard);
      container.appendChild(notifSection);

      // ============================================
      // FREKI AI SETTINGS SECTION
      // ============================================
      const frekiSection = UI.createSection('Freki AI Engine', '');

      const frekiCard = UI.createCard(`
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-freki-external" 
              ${settings.freki?.useExternalData !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-freki-external" style="color: #e2e8f0; font-size: 14px;">
              Use External Data Sources
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-freki-tornstats" 
              ${settings.freki?.useTornStats !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-freki-tornstats" style="color: #e2e8f0; font-size: 14px;">
              Integrate TornStats Data
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-freki-ffscouter" 
              ${settings.freki?.useFFScouter !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-freki-ffscouter" style="color: #e2e8f0; font-size: 14px;">
              Integrate FFScouter Data
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="setting-freki-autosync" 
              ${settings.freki?.autoSync !== false ? 'checked' : ''}
              style="width: 16px; height: 16px;">
            <label for="setting-freki-autosync" style="color: #e2e8f0; font-size: 14px;">
              Auto-sync Fight Data
            </label>
          </div>

          <div style="margin-top: 8px; padding: 10px; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
            <div style="font-size: 12px; color: #718096;">Model Version</div>
            <div style="font-size: 14px; color: #667eea; margin-top: 2px;">
              ${settings.freki?.modelVersion || 'latest'}
            </div>
          </div>
        </div>
      `);

      frekiSection.appendChild(frekiCard);
      container.appendChild(frekiSection);

      // ============================================
      // ACTIONS SECTION
      // ============================================
      const actionsSection = UI.createSection('Actions', '⚡');

      const actionsCard = UI.createCard(`
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button id="setting-save" class="odin-btn odin-btn-success">
            💾 Save Settings
          </button>
          <button id="setting-reset" class="odin-btn odin-btn-warning">
            🔄 Reset to Defaults
          </button>
          <button id="setting-export" class="odin-btn odin-btn-primary">
            📤 Export Data
          </button>
          <button id="setting-import" class="odin-btn odin-btn-primary">
            📥 Import Data
          </button>
        </div>
        <p id="setting-status" style="margin-top: 12px; font-size: 12px; color: #718096;"></p>
      `);

      actionsSection.appendChild(actionsCard);
      container.appendChild(actionsSection);

      // ============================================
      // VERSION INFO
      // ============================================
      const versionSection = UI.createSection('About', 'ℹ️');

      const versionCard = UI.createCard(`
        <div style="text-align: center; padding: 16px;">
          <div style="font-size: 24px; margin-bottom: 8px;"> Odin Tools</div>
          <div style="color: #a0aec0; font-size: 14px;">
            Version ${window.Odin?.version || '3.1.0'}
          </div>
          <div style="color: #718096; font-size: 12px; margin-top: 4px;">
            Odin's Spear: ${window.OdinsSpear?.version || 'N/A'} | 
            Freki AI: ${window.Freki?.version || 'N/A'}
          </div>
        </div>
      `);

      versionSection.appendChild(versionCard);
      container.appendChild(versionSection);


      // ============================================
      // SYSTEM DIAGNOSTICS SECTION (MOVED FROM LEADERSHIP)
      // ============================================
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
      const diagnostics = spear?.DiagnosticsService?.getErrors?.() || [];
      const adoption = spear?.AdoptionService?.getMetrics?.() || {};

      const diagSection = UI.createSection('System Diagnostics', '🔧');

      const diagCard = UI.createCard(`
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 12px;">
          <div style="text-align: center; padding: 8px; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #667eea;">${adoption.sessionCount || 0}</div>
            <div style="font-size: 10px; color: #718096;">Sessions</div>
          </div>
          <div style="text-align: center; padding: 8px; background: rgba(72, 187, 120, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #48bb78;">${adoption.actionsPerformed || 0}</div>
            <div style="font-size: 10px; color: #718096;">Actions</div>
          </div>
          <div style="text-align: center; padding: 8px; background: rgba(229, 62, 62, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #fc8181;">${diagnostics.length}</div>
            <div style="font-size: 10px; color: #718096;">Errors</div>
          </div>
        </div>

        ${diagnostics.length > 0 ? `
          <div style="max-height: 170px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px;">
            ${diagnostics.slice(0, 20).map((err) => `
              <div style="font-size: 11px; color: #fc8181; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                ${err.message}
                <span style="color: #718096; margin-left: 8px;">${new Date(err.timestamp).toLocaleTimeString()}</span>
              </div>
            `).join('')}
          </div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <button id="odin-diag-clear-errors" class="odin-btn odin-btn-warning">Clear Errors</button>
            <button id="odin-diag-refresh" class="odin-btn odin-btn-secondary">Refresh</button>
          </div>
        ` : `
          <div style="text-align: center; color: #48bb78; font-size: 13px;">
            ✓ No errors logged
          </div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; justify-content:center;">
            <button id="odin-diag-refresh" class="odin-btn odin-btn-secondary">Refresh</button>
          </div>
        `}
      `);

      diagSection.appendChild(diagCard);
      container.appendChild(diagSection);

      // ============================================
      // NETWORK CONSOLE SECTION
      // ============================================
      const net = window.__ODIN_NET_LOG__ || { api: [], db: [] };
      const apiCalls = Array.isArray(net.api) ? net.api : [];
      const dbCalls = Array.isArray(net.db) ? net.db : [];

      const netSection = UI.createSection('Network Console', '📡');

      const netCard = UI.createCard(`
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button id="odin-net-refresh" class="odin-btn odin-btn-secondary">Refresh</button>
          <button id="odin-net-clear" class="odin-btn odin-btn-warning">Clear</button>
        </div>

        <div style="display:grid; grid-template-columns: 1fr; gap:12px;">
          <div>
            <div style="font-weight:600; font-size:13px; margin-bottom:6px;">Outgoing API Calls <span style="color:#718096; font-weight:500;">(${apiCalls.length})</span></div>
            <div style="max-height: 220px; overflow:auto; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 8px;">
              ${apiCalls.slice(0, 200).map((c) => `
                <div style="font-size: 11px; padding:6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <span style="color:${c.ok ? '#48bb78' : '#fc8181'};">${c.ok ? 'OK' : 'FAIL'}</span>
                    <span style="color:#a0aec0;">${new Date(c.ts).toLocaleTimeString()}</span>
                  </div>
                  <div style="color:#e2e8f0; word-break: break-word;">${c.service || 'api'} • ${c.method || 'GET'} • ${c.url || ''}</div>
                  ${c.error ? `<div style="color:#fc8181; word-break: break-word;">${c.error}</div>` : ''}
                </div>
              `).join('') || `<div style="color:#718096; font-size:12px; padding:6px 0;">No API calls logged yet.</div>`}
            </div>
          </div>

          <div>
            <div style="font-weight:600; font-size:13px; margin-bottom:6px;">Outgoing DB Calls <span style="color:#718096; font-weight:500;">(${dbCalls.length})</span></div>
            <div style="max-height: 220px; overflow:auto; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 8px;">
              ${dbCalls.slice(0, 200).map((c) => `
                <div style="font-size: 11px; padding:6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                  <div style="display:flex; justify-content:space-between; gap:8px;">
                    <span style="color:${c.ok ? '#48bb78' : '#fc8181'};">${c.ok ? 'OK' : 'FAIL'}</span>
                    <span style="color:#a0aec0;">${new Date(c.ts).toLocaleTimeString()}</span>
                  </div>
                  <div style="color:#e2e8f0; word-break: break-word;">${c.db || 'db'} • ${c.op || ''} • ${c.path || ''}</div>
                  ${c.meta ? `<div style="color:#718096; word-break: break-word;">${c.meta}</div>` : ''}
                  ${c.error ? `<div style="color:#fc8181; word-break: break-word;">${c.error}</div>` : ''}
                </div>
              `).join('') || `<div style="color:#718096; font-size:12px; padding:6px 0;">No DB calls logged yet.</div>`}
            </div>
          </div>
        </div>
      `);

      netSection.appendChild(netCard);
      container.appendChild(netSection);

      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      const statusEl = document.getElementById('setting-status');

      function showStatus(message, type = 'success') {
        if (statusEl) {
          statusEl.textContent = message;
          statusEl.style.color = type === 'success' ? '#48bb78' : type === 'error' ? '#fc8181' : '#ed8936';
          setTimeout(() => {
            if (statusEl) statusEl.textContent = '';
          
      // Diagnostics log (moved from popup into Settings)
      const ta = document.getElementById('odin-diag-log');
      const statsEl = document.getElementById('odin-diag-stats');
      const copyBtn = document.getElementById('odin-btn-copy-diag');

      const refreshDiag = () => {
  try {
    // Diagnostics source priority:
    // 1) ctx.spear.Diagnostics.getLog()
    // 2) window.OdinDiag.getLog()
    // 3) Spear DiagnosticsService.getErrors()
    const spearObj = ctx.spear || window.OdinContext?.spear || window.OdinsSpear || null;
    const spearServices = spearObj?.services || spearObj || null;

    let lines = [];
    const getSpearLog = spearObj?.Diagnostics?.getLog || spearServices?.Diagnostics?.getLog;
    if (typeof getSpearLog === 'function') {
      const l = getSpearLog.call(spearObj?.Diagnostics || spearServices?.Diagnostics);
      if (Array.isArray(l)) lines = l.slice();
    } else if (window.OdinDiag?.getLog) {
      const l = window.OdinDiag.getLog();
      if (Array.isArray(l)) lines = l.slice();
    } else if (typeof spearServices?.DiagnosticsService?.getErrors === 'function') {
      const errs = spearServices.DiagnosticsService.getErrors() || [];
      if (Array.isArray(errs) && errs.length) {
        lines = errs.map((e) => {
          const ts = e && e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '';
          const msg = e && e.message ? e.message : String(e);
          return ts ? `[${ts}] ${msg}` : msg;
        });
      }
    }

    if (ta) ta.value = (lines || []).join('\n');

    // API stats (ctx.api canonical)
    let statsText = '';
    try {
      if (ctx.api && typeof ctx.api.getStats === 'function') {
        const s = ctx.api.getStats() || {};
        const calls = (typeof s.totalCalls === 'number') ? s.totalCalls : 0;
        const ok = (typeof s.okCalls === 'number') ? s.okCalls : 0;
        const fail = (typeof s.failCalls === 'number') ? s.failCalls : 0;
        const cache = (typeof s.cacheHits === 'number') ? s.cacheHits : 0;
        statsText = `Torn API: ${calls} calls (${ok} ok, ${fail} fail) • Cache hits: ${cache}`;
      } else if (ctx.api && typeof ctx.api.getCacheStats === 'function') {
        const cs = ctx.api.getCacheStats() || {};
        const entries = (typeof cs.entries === 'number') ? cs.entries : 0;
        statsText = `API cache entries: ${entries}`;
      }
    } catch (e) { /* ignore */ }

    if (statsEl) statsEl.textContent = statsText;
  } catch (e) {
    if (ta) ta.value = '';
    if (statsEl) statsEl.textContent = '';
  }
};

      refreshDiag();
      setTimeout(refreshDiag, 250);

      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          try {
            const txt = (ta && ta.value) ? ta.value : '';
            await navigator.clipboard.writeText(txt);
            window.OdinUI?.showNotification('Diagnostics copied', 'success');
          } catch (e) {
            window.OdinUI?.showNotification('Unable to copy diagnostics', 'error');
          }
        });
      }
}, 3000);
        }
      }

      document.getElementById('setting-save')?.addEventListener('click', () => {
        const newSettings = {
          tornApiKey: document.getElementById('setting-torn-api-key')?.value || '',
          tornStatsApiKey: document.getElementById('setting-tornstats-api-key')?.value || '',
          ffScouterEnabled: document.getElementById('setting-ffscouter-enabled')?.checked || false,
          compactMode: document.getElementById('setting-compact-mode')?.checked || false,
          display: {
            animationsEnabled: document.getElementById('setting-animations')?.checked ?? true,
            showFrekiScores: document.getElementById('setting-show-freki')?.checked ?? true,
            showClaimStatus: document.getElementById('setting-show-claims')?.checked ?? true,
          },
          notifications: {
            chainWarning: document.getElementById('setting-notif-chain')?.checked ?? true,
            claimConflicts: document.getElementById('setting-notif-claims')?.checked ?? true,
            retalCandidates: document.getElementById('setting-notif-retals')?.checked ?? true,
            watcherAlerts: document.getElementById('setting-notif-watchers')?.checked ?? true,
            sound: document.getElementById('setting-notif-sound')?.checked || false,
          },
          freki: {
            useExternalData: document.getElementById('setting-freki-external')?.checked ?? true,
            useTornStats: document.getElementById('setting-freki-tornstats')?.checked ?? true,
            useFFScouter: document.getElementById('setting-freki-ffscouter')?.checked ?? true,
            autoSync: document.getElementById('setting-freki-autosync')?.checked ?? true,
          },
        };

        saveSettings(newSettings);

        // Update API module if available (ctx.api is canonical)
try {
  if (ctx.api && typeof ctx.api.setTornApiKey === 'function') {
    ctx.api.setTornApiKey(newSettings.tornApiKey);
  }
  if (ctx.api && typeof ctx.api.setTornStatsApiKey === 'function' && newSettings.tornStatsApiKey) {
    ctx.api.setTornStatsApiKey(newSettings.tornStatsApiKey);
  }
} catch (e) { /* ignore */ }
showStatus('Settings saved successfully!', 'success');
        log('[Settings] Saved');
      });

      document.getElementById('setting-reset')?.addEventListener('click', () => {
        if (confirm('Reset all settings to defaults? This cannot be undone.')) {
          saveSettings(defaultSettings);
          showStatus('Settings reset to defaults', 'warning');
          window.OdinUI?.refreshContent();
        }
      });

      document.getElementById('setting-export')?.addEventListener('click', () => {
        const exportData = {
          settings: getSettings(),
          spearData: {
            warConfig: storage.getJSON('spear_warConfig'),
            watcherSchedule: storage.getJSON('spear_watcherSchedule'),
            targetNotes: storage.getJSON('spear_targetNotes'),
          },
          frekiData: storage.getJSON('freki_buckets'),
          exportedAt: new Date().toISOString(),
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `odin-tools-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showStatus('Data exported!', 'success');
      });

      document.getElementById('setting-import')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.settings) {
              saveSettings(data.settings);
            }
            if (data.spearData) {
              if (data.spearData.warConfig) storage.setJSON('spear_warConfig', data.spearData.warConfig);
              if (data.spearData.watcherSchedule) storage.setJSON('spear_watcherSchedule', data.spearData.watcherSchedule);
              if (data.spearData.targetNotes) storage.setJSON('spear_targetNotes', data.spearData.targetNotes);
            }
            if (data.frekiData) {
              storage.setJSON('freki_buckets', data.frekiData);
            }

            showStatus('Data imported successfully!', 'success');
            window.OdinUI?.refreshContent();
          } catch (err) {
            showStatus('Import failed: ' + err.message, 'error');
          }
        };
        input.click();
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Settings] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('settings', renderSettings);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();
    }

    function destroy() {
      log('[UI Settings] Destroyed');
    }

    return { id: 'ui-settings', init, destroy };
  });
})();
