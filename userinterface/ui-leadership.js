// ui-leadership.js
// Leadership controls UI
// Version: 3.1.0 - Fixed: Single tab registration pattern

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_LeadershipInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    // Event listener cleanup
    const _unsubs = [];

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderLeadership() {
      const UI = window.OdinUI?.helpers;
      const spear = window.OdinsSpear?.services;
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const warConfig = spear?.WarConfigService?.getConfig() || {};
      const diagnostics = spear?.DiagnosticsService?.getErrors() || [];
      const unauthorized = spear?.UnauthorizedAttackService?.getUnauthorized() || [];
      const adoption = spear?.AdoptionService?.getMetrics() || {};
      const warHistory = spear?.WarHistoryService?.getHistory(5) || [];

      // ============================================
      // WAR CONFIGURATION SECTION
      // ============================================
      const configSection = UI.createSection('War Configuration', '⚙️');

      const configCard = UI.createCard(null, `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div>
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              Enemy Faction ID
            </label>
            <div style="display: flex; gap: 8px;">
              <input type="number" id="config-enemy-id" 
                value="${warConfig.enemyFactionId || ''}"
                placeholder="Enter faction ID"
                style="
                  flex: 1;
                  padding: 10px 12px;
                  background: rgba(0,0,0,0.3);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 6px;
                  color: #e2e8f0;
                  font-size: 14px;
                ">
              <button id="config-set-enemy" class="odin-btn odin-btn-primary">
                Set
              </button>
            </div>
          </div>

          <div>
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              War Type
            </label>
            <select id="config-war-type" style="
              width: 100%;
              padding: 10px 12px;
              background: rgba(0,0,0,0.3);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 6px;
              color: #e2e8f0;
              font-size: 14px;
            ">
              <option value="chain" ${warConfig.warType === 'chain' ? 'selected' : ''}>Chain War</option>
              <option value="ranked" ${warConfig.warType === 'ranked' ? 'selected' : ''}>Ranked War</option>
              <option value="territory" ${warConfig.warType === 'territory' ? 'selected' : ''}>Territory War</option>
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
                Claim Timeout (min)
              </label>
              <input type="number" id="config-claim-timeout" 
                value="${warConfig.claimTimeoutMinutes || 5}"
                min="1" max="30"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  background: rgba(0,0,0,0.3);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 6px;
                  color: #e2e8f0;
                  font-size: 14px;
                ">
            </div>
            <div>
              <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
                Chain Warning (sec)
              </label>
              <input type="number" id="config-chain-warning" 
                value="${warConfig.chainWarningThreshold || 30}"
                min="10" max="120"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  background: rgba(0,0,0,0.3);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 6px;
                  color: #e2e8f0;
                  font-size: 14px;
                ">
            </div>
          </div>

          <button id="config-save" class="odin-btn odin-btn-success" style="width: 100%;">
            💾 Save Configuration
          </button>
        </div>
      `);

      configSection.appendChild(configCard);
      container.appendChild(configSection);

      // ============================================
      // UNAUTHORIZED ATTACKS SECTION
      // ============================================
      if (unauthorized.length > 0) {
        const unauthSection = UI.createSection(`Unauthorized Attacks (${unauthorized.length})`, '⚠️');

        const unauthCard = document.createElement('div');
        unauthCard.className = 'odin-card';
        unauthCard.innerHTML = `
          <div style="max-height: 200px; overflow-y: auto;">
            ${unauthorized.slice(0, 10).map((u) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div>
                  <span style="color: #fc8181;">${u.attackerName}</span>
                  <span style="color: #718096; margin-left: 8px;">→ Target #${u.targetId}</span>
                </div>
                <div style="font-size: 11px; color: #a0aec0;">
                  ${u.reason} • ${new Date(u.timestamp).toLocaleTimeString()}
                </div>
              </div>
            `).join('')}
          </div>
          <button id="clear-unauthorized" class="odin-btn odin-btn-warning" style="margin-top: 12px; width: 100%;">
            Clear All
          </button>
        `;

        unauthSection.appendChild(unauthCard);
        container.appendChild(unauthSection);
      }

      // ============================================
      // WAR HISTORY SECTION
      // ============================================
      if (warHistory.length > 0) {
        const historySection = UI.createSection('War History', '📜');

        const historyCard = document.createElement('div');
        historyCard.className = 'odin-card';
        historyCard.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${warHistory.map((war) => `
              <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: #e2e8f0; font-weight: 500;">${war.enemyFactionName || 'Unknown'}</span>
                  <span style="
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    background: ${war.result === 'win' ? 'rgba(72, 187, 120, 0.2)' : war.result === 'loss' ? 'rgba(229, 62, 62, 0.2)' : 'rgba(160, 174, 192, 0.2)'};
                    color: ${war.result === 'win' ? '#48bb78' : war.result === 'loss' ? '#fc8181' : '#a0aec0'};
                  ">
                    ${war.result || 'ended'}
                  </span>
                </div>
                <div style="font-size: 11px; color: #718096; margin-top: 4px;">
                  ${war.warType} • ${new Date(war.startedAt).toLocaleDateString()}
                </div>
              </div>
            `).join('')}
          </div>
        `;

        historySection.appendChild(historyCard);
        container.appendChild(historySection);
      }

      // ============================================
      // DIAGNOSTICS SECTION
      // ============================================
      const diagSection = UI.createSection('System Diagnostics', '🔧');

      const diagCard = UI.createCard(null, `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: 12px;">
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
          <div style="max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px;">
            ${diagnostics.slice(0, 5).map((err) => `
              <div style="font-size: 11px; color: #fc8181; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                ${err.message}
                <span style="color: #718096; margin-left: 8px;">${new Date(err.timestamp).toLocaleTimeString()}</span>
              </div>
            `).join('')}
          </div>
          <button id="clear-errors" class="odin-btn odin-btn-warning" style="margin-top: 8px;">
            Clear Errors
          </button>
        ` : `
          <div style="text-align: center; color: #48bb78; font-size: 13px;">
            ✓ No errors logged
          </div>
        `}
      `);

      diagSection.appendChild(diagCard);
      container.appendChild(diagSection);

      // ============================================
      // DATA MANAGEMENT SECTION
      // ============================================
      const dataSection = UI.createSection('Data Management', '💾');

      const dataCard = UI.createCard(null, `
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button id="data-clear-attacks" class="odin-btn odin-btn-warning">
            🗑️ Clear Attack Log
          </button>
          <button id="data-clear-history" class="odin-btn odin-btn-warning">
            🗑️ Clear War History
          </button>
          <button id="data-clear-notes" class="odin-btn odin-btn-warning">
            🗑️ Clear Notes
          </button>
          <button id="data-reset-all" class="odin-btn odin-btn-danger">
            ⚠️ Reset All Data
          </button>
        </div>
        <p style="margin-top: 12px; font-size: 11px; color: #718096;">
          ⚠️ These actions cannot be undone. Use with caution.
        </p>
      `);

      dataSection.appendChild(dataCard);
      container.appendChild(dataSection);

      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      const spear = window.OdinsSpear?.services;

      document.getElementById('config-set-enemy')?.addEventListener('click', async () => {
        const factionId = document.getElementById('config-enemy-id')?.value;
        if (factionId) {
          try {
            // Try to fetch faction name from Torn
            const ctx = window.OdinContext || {};
            const api = ctx.api || window.OdinApiConfig;
            const data = await api?.tornGet?.(`/faction/${factionId}`, 'basic');
            const name = data?.name || `Faction #${factionId}`;
            spear?.WarConfigService?.setEnemy(factionId, name);
            window.OdinUI?.refreshContent();
            log('[Leadership] Enemy set:', name);
          } catch (e) {
            spear?.WarConfigService?.setEnemy(factionId, `Faction #${factionId}`);
            window.OdinUI?.refreshContent();
          }
        }
      });

      document.getElementById('config-save')?.addEventListener('click', () => {
        const updates = {
          warType: document.getElementById('config-war-type')?.value || 'chain',
          claimTimeoutMinutes: parseInt(document.getElementById('config-claim-timeout')?.value, 10) || 5,
          chainWarningThreshold: parseInt(document.getElementById('config-chain-warning')?.value, 10) || 30,
        };
        spear?.WarConfigService?.updateConfig(updates);
        log('[Leadership] Config saved');
        alert('Configuration saved!');
      });

      document.getElementById('clear-unauthorized')?.addEventListener('click', () => {
        spear?.UnauthorizedAttackService?.clearUnauthorized();
        window.OdinUI?.refreshContent();
      });

      document.getElementById('clear-errors')?.addEventListener('click', () => {
        spear?.DiagnosticsService?.clearErrors();
        window.OdinUI?.refreshContent();
      });

      document.getElementById('data-clear-attacks')?.addEventListener('click', () => {
        if (confirm('Clear all attack logs?')) {
          spear?.AttackLogService?.clearLog();
          window.OdinUI?.refreshContent();
        }
      });

      document.getElementById('data-clear-history')?.addEventListener('click', () => {
        if (confirm('Clear all war history?')) {
          spear?.WarHistoryService?.clearHistory();
          window.OdinUI?.refreshContent();
        }
      });

      document.getElementById('data-clear-notes')?.addEventListener('click', () => {
        if (confirm('Clear all target notes?')) {
          const notes = spear?.NotesService?.getAllNotes() || [];
          notes.forEach((n) => spear?.NotesService?.deleteNote(n.targetId));
          window.OdinUI?.refreshContent();
        }
      });

      document.getElementById('data-reset-all')?.addEventListener('click', () => {
        if (confirm('⚠️ This will reset ALL Odin Tools data. Are you sure?')) {
          if (confirm('This cannot be undone. Final confirmation?')) {
            // Clear all stored data
            const storage = window.OdinContext?.storage || {};
            const keys = ['spear_warConfig', 'spear_claims', 'spear_watcherSchedule', 'spear_attackLog',
              'spear_unauthorizedAttacks', 'spear_retalCandidates', 'spear_chainState', 'spear_chainRisk',
              'spear_targetNotes', 'spear_warHistory', 'spear_adoptionMetrics', 'spear_factionData',
              'freki_buckets', 'freki_stats', 'odin_settings'];
            keys.forEach((k) => {
              try { storage.remove?.(k); } catch (e) { /* ignore */ }
            });
            alert('All data has been reset. Please refresh the page.');
          }
        }
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Leadership] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('leadership', renderLeadership);

      _unsubs.push(nexus.on('UI_READY', register));
      if (window.OdinUI) register();
    }

    function destroy() {
      log('[UI Leadership] Destroying...');
      
      // Clean up event listeners
      _unsubs.forEach(unsub => unsub());
      _unsubs.length = 0;
      
      log('[UI Leadership] Destroyed');
    }

    return { id: 'ui-leadership', init, destroy };
  });
})();
