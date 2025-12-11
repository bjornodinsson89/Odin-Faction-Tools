// ui-chain.js
// Chain monitoring UI
// Version: 3.1.0 - Fixed: Uses ChainMonitorService.refreshNow(), added error feedback

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_ChainInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    // Event listener cleanup
    const _unsubs = [];

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderChain() {
      const UI = window.OdinUI?.helpers;
      const spear = window.OdinsSpear?.services;
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const chainState = spear?.ChainMonitorService?.getState() || {};
      const chainRisk = spear?.ChainRiskService?.getRisk() || {};

      // ============================================
      // ERROR FEEDBACK (A4)
      // ============================================
      if (chainState.permissionError || chainState.lastErrorMessage) {
        const errorSection = document.createElement('div');
        errorSection.className = 'odin-error-banner';
        errorSection.style.cssText = `
          background: rgba(229, 62, 62, 0.15);
          border: 1px solid rgba(229, 62, 62, 0.4);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 16px;
          color: #fc8181;
          font-size: 13px;
        `;
        
        let errorMsg = chainState.lastErrorMessage || 'Unknown error loading chain data.';
        if (chainState.permissionError) {
          errorMsg = 'Could not load chain data. Ensure your Torn API key has the user → bars permission.';
        }
        
        errorSection.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">⚠️</span>
            <span>${errorMsg}</span>
          </div>
        `;
        container.appendChild(errorSection);
      }

      // ============================================
      // CHAIN STATUS SECTION
      // ============================================
      const statusSection = UI.createSection('Chain Status', '🔗');

      const timeoutColor = chainState.timeout <= 30 ? '#e53e3e' : chainState.timeout <= 60 ? '#ed8936' : '#48bb78';

      const statusCard = UI.createCard(null, `
        <div style="text-align: center; padding: 20px;">
          <div style="font-size: 48px; font-weight: 700; color: #667eea;">
            ${chainState.current || 0}
          </div>
          <div style="font-size: 14px; color: #718096; margin-top: 4px;">
            Current Chain / ${chainState.max || '∞'} Max
          </div>
        </div>
        ${chainState.timeout > 0 ? `
          <div style="margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #a0aec0;">Timeout</span>
              <span style="font-size: 24px; font-weight: 600; color: ${timeoutColor};">
                ${formatTime(chainState.timeout)}
              </span>
            </div>
          </div>
        ` : `
          <div style="margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 8px; text-align: center;">
            <span style="color: #718096;">No active chain</span>
          </div>
        `}
        ${chainState.cooldown > 0 ? `
          <div style="margin-top: 8px; padding: 8px 12px; background: rgba(237, 137, 54, 0.2); border-radius: 6px;">
            <span style="color: #ed8936; font-size: 13px;">
              ⏳ Cooldown: ${formatTime(chainState.cooldown)}
            </span>
          </div>
        ` : ''}
      `);

      statusSection.appendChild(statusCard);
      container.appendChild(statusSection);

      // ============================================
      // RISK ASSESSMENT SECTION
      // ============================================
      if (chainState.current > 0 || chainState.timeout > 0) {
        const riskSection = UI.createSection('Risk Assessment', '⚡');

        const riskCard = UI.createCard(null, `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background: ${getRiskColor(chainRisk.level)};
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
            ">
              ${chainRisk.level === 'critical' ? '🚨' : chainRisk.level === 'warning' ? '⚠️' : chainRisk.level === 'elevated' ? '📊' : '✓'}
            </div>
            <div>
              <div style="font-weight: 600; color: ${getRiskColor(chainRisk.level)}; text-transform: uppercase;">
                ${chainRisk.level || 'Safe'}
              </div>
              <div style="font-size: 12px; color: #718096;">Risk Score: ${chainRisk.score || 0}</div>
            </div>
          </div>
          ${chainRisk.recommendation ? `
            <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px; color: #a0aec0; font-size: 13px;">
              💡 ${chainRisk.recommendation}
            </div>
          ` : ''}
          ${chainRisk.factors?.length > 0 ? `
            <div style="margin-top: 12px;">
              <div style="font-size: 12px; color: #718096; margin-bottom: 6px;">Contributing Factors:</div>
              ${chainRisk.factors.map((f) => `
                <div style="font-size: 12px; color: #a0aec0; padding: 4px 0;">• ${formatFactor(f)}</div>
              `).join('')}
            </div>
          ` : ''}
        `);

        riskSection.appendChild(riskCard);
        container.appendChild(riskSection);
      }

      // ============================================
      // BONUS HITS SECTION
      // ============================================
      if (chainState.bonusHits?.length > 0) {
        const bonusSection = UI.createSection('Upcoming Bonus Hits', '🎯');

        const bonusCard = UI.createCard(null, `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${chainState.bonusHits.map((bonus) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
                <span style="color: #667eea; font-weight: 600;">${bonus.target} hits</span>
                <span style="color: #a0aec0; font-size: 13px;">${bonus.remaining} more needed</span>
              </div>
            `).join('')}
          </div>
        `);

        bonusSection.appendChild(bonusCard);
        container.appendChild(bonusSection);
      }

      // ============================================
      // CONTROLS SECTION
      // ============================================
      const controlsSection = UI.createSection('Controls', '🎮');

      const isPolling = spear?.ChainMonitorService?.isPolling?.() || false;

      const controlsCard = UI.createCard(null, `
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button id="odin-start-monitoring" class="odin-btn odin-btn-success" ${isPolling ? 'disabled' : ''}>
            ▶️ Start Monitoring
          </button>
          <button id="odin-stop-monitoring" class="odin-btn odin-btn-warning" ${!isPolling ? 'disabled' : ''}>
            ⏹️ Stop Monitoring
          </button>
          <button id="odin-refresh-chain" class="odin-btn odin-btn-primary">
            🔄 Refresh Now
          </button>
        </div>
        <p style="margin-top: 12px; font-size: 12px; color: #718096;">
          ${isPolling ? '🟢 Auto-refresh is active' : '⚪ Auto-refresh is paused'}
          ${chainState.lastUpdated ? ` • Last updated: ${new Date(chainState.lastUpdated).toLocaleTimeString()}` : ''}
        </p>
      `);

      controlsSection.appendChild(controlsCard);
      container.appendChild(controlsSection);

      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    function getRiskColor(level) {
      const colors = { critical: '#e53e3e', warning: '#ed8936', elevated: '#ecc94b', safe: '#48bb78' };
      return colors[level] || colors.safe;
    }

    function formatTime(seconds) {
      if (seconds <= 0) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function formatFactor(factor) {
      const messages = {
        timeout_critical: `Critical timeout: ${factor.value}s remaining`,
        timeout_warning: `Low timeout: ${factor.value}s remaining`,
        high_chain: `High chain at risk: ${factor.value} hits`,
        approaching_bonus: `Approaching ${factor.value} bonus`,
      };
      return messages[factor.type] || `${factor.type}: ${factor.value}`;
    }

    // ============================================
    // EVENT LISTENERS
    // Fixed: Uses ChainMonitorService.refreshNow() instead of direct Torn calls
    // ============================================
    function attachEventListeners() {
      document.getElementById('odin-start-monitoring')?.addEventListener('click', () => {
        window.OdinsSpear?.services?.ChainMonitorService?.startPolling(10000);
        log('[Chain] Started monitoring');
        window.OdinUI?.refreshContent();
      });

      document.getElementById('odin-stop-monitoring')?.addEventListener('click', () => {
        window.OdinsSpear?.services?.ChainMonitorService?.stopPolling();
        log('[Chain] Stopped monitoring');
        window.OdinUI?.refreshContent();
      });

      // Fixed: Now uses ChainMonitorService.refreshNow() - no direct Torn API calls
      document.getElementById('odin-refresh-chain')?.addEventListener('click', async () => {
        try {
          await window.OdinsSpear?.services?.ChainMonitorService?.refreshNow();
        } catch (e) {
          log('[Chain] Refresh failed:', e.message);
        }
        window.OdinUI?.refreshContent();
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Chain] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('chain', renderChain);

      _unsubs.push(nexus.on('UI_READY', register));
      if (window.OdinUI) register();

      // Listen for chain updates to refresh the tab
      _unsubs.push(nexus.on('CHAIN_TICK', () => {
        if (window.OdinUI?.getState()?.activeTab === 'chain') {
          window.OdinUI.refreshContent();
        }
      }));
    }

    function destroy() {
      log('[UI Chain] Destroying...');
      
      // Clean up event listeners
      _unsubs.forEach(unsub => unsub());
      _unsubs.length = 0;
      
      log('[UI Chain] Destroyed');
    }

    return { id: 'ui-chain', init, destroy };
  });
})();
