// ui-settings.js
// Settings panel UI
// Version: 3.1.0 - Fixed: Single tab registration pattern

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
      const frekiSection = UI.createSection('Freki AI Engine', '🐺');

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
          <div style="font-size: 24px; margin-bottom: 8px;">🐺 Odin Tools</div>
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

        // Update API config if available
        if (window.OdinApiConfig) {
          window.OdinApiConfig.setTornApiKey(newSettings.tornApiKey);
          if (newSettings.tornStatsApiKey) {
            window.OdinApiConfig.setTornStatsApiKey(newSettings.tornStatsApiKey);
          }
        }

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
