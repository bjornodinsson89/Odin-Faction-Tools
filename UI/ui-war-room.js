// ui-war-room.js
// War Room dashboard UI
// Version: 3.1.0 
// Author: BjornOdinsson89

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_WarRoomInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderWarRoom() {
      const UI = window.OdinUI?.helpers;
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const warConfig = spear?.WarConfigService?.getConfig() || {};
      const chainState = spear?.ChainMonitorService?.getState() || {};
      const chainRisk = spear?.ChainRiskService?.getRisk() || {};
      const attackStats = spear?.AttackLogService?.getStats() || {};
      const activeClaims = spear?.ClaimsService?.getActiveClaims() || [];
      const currentShift = spear?.WatchersService?.getCurrentShift();

      // ============================================
      // WAR STATUS SECTION
      // ============================================
      const statusSection = UI.createSection('War Status', '⚔️');

      const isActive = warConfig.isActive;
      const statusColor = isActive ? '#48bb78' : '#718096';
      const statusText = isActive ? 'WAR ACTIVE' : 'STANDBY';

      const statusCard = UI.createCard(`
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="
              width: 16px; height: 16px; 
              border-radius: 50%; 
              background: ${statusColor};
              ${isActive ? 'animation: pulse 2s infinite;' : ''}
            "></div>
            <span style="font-size: 20px; font-weight: 700; color: ${statusColor};">
              ${statusText}
            </span>
          </div>
          ${warConfig.enemyFactionName ? `
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #718096;">Enemy</div>
              <div style="font-size: 11px; color: #718096; margin-top: 6px;">War Type</div>
              <div style="color: #a0aec0; font-weight: 600;">${formatWarTypeLabel(warConfig.warType)}</div>
              <div style="color: #fc8181; font-weight: 600;">${warConfig.enemyFactionName}</div>
            </div>
          ` : ''}
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px;">
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #667eea;">${chainState.current || 0}</div>
            <div style="font-size: 11px; color: #718096;">Chain</div>
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: ${getRiskColor(chainRisk.level)};">
              ${chainState.timeout > 0 ? formatTime(chainState.timeout) : '--:--'}
            </div>
            <div style="font-size: 11px; color: #718096;">Timeout</div>
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #48bb78;">${activeClaims.length}</div>
            <div style="font-size: 11px; color: #718096;">Claims</div>
          </div>
          <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; text-align: center;">
            <div style="font-size: 24px; font-weight: 700; color: #ed8936;">${attackStats.wins || 0}</div>
            <div style="font-size: 11px; color: #718096;">Hits</div>
          </div>
        </div>

        ${chainRisk.recommendation ? `
          <div style="margin-top: 12px; padding: 10px; background: rgba(${chainRisk.level === 'critical' ? '229, 62, 62' : chainRisk.level === 'warning' ? '237, 137, 54' : '102, 126, 234'}, 0.15); border-radius: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">${chainRisk.level === 'critical' ? '🚨' : chainRisk.level === 'warning' ? '⚠️' : '💡'}</span>
              <span style="color: ${getRiskColor(chainRisk.level)}; font-size: 13px;">${chainRisk.recommendation}</span>
            </div>
          </div>
        ` : ''}
      `);

      statusSection.appendChild(statusCard);
      container.appendChild(statusSection);

      // ============================================
      // CURRENT WATCHER SECTION
      // ============================================
      if (currentShift) {
        const watcherSection = UI.createSection('Current Watcher', '👁️');

        const watcherCard = UI.createCard(`
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-weight: 600; color: #e2e8f0;">${currentShift.watcherName}</div>
              <div style="font-size: 12px; color: #718096;">On duty since ${new Date(currentShift.startTime).toLocaleTimeString()}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #718096;">Ends</div>
              <div style="color: #ed8936; font-weight: 500;">${new Date(currentShift.endTime).toLocaleTimeString()}</div>
            </div>
          </div>
        `);

        watcherSection.appendChild(watcherCard);
        container.appendChild(watcherSection);
      }

      // ============================================
      // ACTIVE CLAIMS SECTION
      // ============================================
      if (activeClaims.length > 0) {
        const claimsSection = UI.createSection(`Active Claims (${activeClaims.length})`, '🎯');

        const claimsCard = document.createElement('div');
        claimsCard.className = 'odin-card';
        claimsCard.innerHTML = `
          <div style="max-height: 200px; overflow-y: auto;">
            ${activeClaims.slice(0, 10).map((claim) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div>
                  <span style="color: #667eea;">Target #${claim.targetId}</span>
                  <span style="color: #718096; margin-left: 8px;">by ${claim.attackerName}</span>
                </div>
                <div style="font-size: 12px; color: ${getClaimTimeColor(claim.expiresAt)};">
                  ${formatClaimTime(claim.expiresAt)}
                </div>
              </div>
            `).join('')}
          </div>
        `;

        claimsSection.appendChild(claimsCard);
        container.appendChild(claimsSection);

        const dibsSection = UI.createSection('Active Dibs', '🪓');
        const dibs = spear?.DibsService?.getActiveDibs?.() || [];
        const dibsCard = UI.createCard(`
          ${dibs.length === 0 ? `<div style="color:#a0aec0;">No active dibs</div>` : `
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${dibs.map((d) => `
                <div style="display:flex; justify-content:space-between; gap:8px;">
                  <span><b>${d.attackerName || 'Unknown'}</b> dibbed <code>${d.targetId}</code></span>
                  <span style="color:#718096; font-size:11px;">${new Date(d.createdAt).toLocaleTimeString()}</span>
                </div>
              `).join('')}
            </div>
          `}
        `);
        dibsSection.appendChild(dibsCard);
        container.appendChild(dibsSection);

        const medSection = UI.createSection('Active Med Deals', '💉');
        const deals = spear?.MedDealsService?.getActiveDeals?.() || [];
        const medCard = UI.createCard(`
          ${deals.length === 0 ? `<div style="color:#a0aec0;">No active med deals</div>` : `
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${deals.map((d) => `
                <div style="display:flex; justify-content:space-between; gap:8px;">
                  <span><b>${d.attackerName || 'Unknown'}</b> med-dealed <code>${d.targetId}</code>${d.note ? ` — <span style="color:#a0aec0;">${d.note}</span>` : ''}</span>
                  <span style="color:#718096; font-size:11px;">${new Date(d.createdAt).toLocaleTimeString()}</span>
                </div>
              `).join('')}
            </div>
          `}
        `);
        medSection.appendChild(medCard);
        container.appendChild(medSection);

      }

      // ============================================
      // QUICK ACTIONS SECTION
      // ============================================
      const actionsSection = UI.createSection('Quick Actions', '⚡');

      const actionsCard = UI.createCard(`
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${isActive ? `
            <button id="war-end" class="odin-btn odin-btn-danger">
              🛑 End War
            </button>
          ` : `
            <button id="war-start" class="odin-btn odin-btn-success">
              ⚔️ Start War
            </button>
          `}
          <button id="war-refresh" class="odin-btn odin-btn-primary">
            🔄 Refresh All
          </button>
          <button id="war-clear-claims" class="odin-btn odin-btn-warning">
            🗑️ Clear Claims
          </button>
        </div>
      `);

      actionsSection.appendChild(actionsCard);
      container.appendChild(actionsSection);

      // ============================================
      // ATTACK STATS SECTION
      // ============================================
      const statsSection = UI.createSection('Session Stats', '📊');

      const statsCard = UI.createCard(`
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px;">
          <div style="text-align: center; padding: 8px; background: rgba(72, 187, 120, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #48bb78;">${attackStats.wins || 0}</div>
            <div style="font-size: 10px; color: #718096;">Wins</div>
          </div>
          <div style="text-align: center; padding: 8px; background: rgba(229, 62, 62, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #fc8181;">${attackStats.losses || 0}</div>
            <div style="font-size: 10px; color: #718096;">Losses</div>
          </div>
          <div style="text-align: center; padding: 8px; background: rgba(237, 137, 54, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #ed8936;">${attackStats.escapes || 0}</div>
            <div style="font-size: 10px; color: #718096;">Escapes</div>
          </div>
          <div style="text-align: center; padding: 8px; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
            <div style="font-size: 18px; font-weight: 700; color: #667eea;">${formatNumber(attackStats.totalRespect)}</div>
            <div style="font-size: 10px; color: #718096;">Respect</div>
          </div>
        </div>
        ${attackStats.avgFairFight ? `
          <div style="margin-top: 8px; text-align: center; font-size: 12px; color: #a0aec0;">
            Avg Fair Fight: <span style="color: #667eea; font-weight: 500;">${attackStats.avgFairFight}×</span>
          </div>
        ` : ''}
      `);

      statsSection.appendChild(statsCard);
      container.appendChild(statsSection);

      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    // ============================================
    // HELPER FUNCTIONS


function formatWarTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'ranked' || t === 'rankedwar' || t === 'rw') return 'Ranked War (RW)';
  if (t === 'territory' || t === 'territorywar' || t === 'tw') return 'Territory War (TW)';
  if (t === 'chain' || t === 'chainwar') return 'Chain War';
  if (!t) return '—';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
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

    function formatNumber(num) {
      if (!num && num !== 0) return '0';
      if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
      if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
      return num.toLocaleString();
    }

    function formatClaimTime(expiresAt) {
      const remaining = Math.max(0, expiresAt - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function getClaimTimeColor(expiresAt) {
      const remaining = expiresAt - Date.now();
      if (remaining <= 60000) return '#fc8181';
      if (remaining <= 120000) return '#ed8936';
      return '#48bb78';
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);

      document.getElementById('war-start')?.addEventListener('click', () => {
        spear?.WarConfigService?.startWar();
        spear?.ChainMonitorService?.startPolling(10000);
        window.OdinUI?.refreshContent();
        log('[War Room] War started');
      });

      document.getElementById('war-end')?.addEventListener('click', () => {
        if (confirm('End the current war session?')) {
          spear?.WarConfigService?.endWar();
          spear?.ChainMonitorService?.stopPolling();
          window.OdinUI?.refreshContent();
          log('[War Room] War ended');
        }
      });

      document.getElementById('war-refresh')?.addEventListener('click', async () => {
        try {
          await spear?.ChainMonitorService?.refreshNow();
        } catch (e) {
          log('[War Room] Refresh failed:', e.message);
        }
        window.OdinUI?.refreshContent();
      });

      document.getElementById('war-clear-claims')?.addEventListener('click', () => {
        if (confirm('Clear all active claims?')) {
          spear?.ClaimsService?.clearAllClaims();
          window.OdinUI?.refreshContent();
          log('[War Room] Claims cleared');
        }
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI War Room] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('war-room', renderWarRoom);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();

      // Listen for updates
      nexus.on('CHAIN_TICK', () => {
        if (window.OdinUI?.getState()?.activeTab === 'war-room') {
          window.OdinUI.refreshContent();
        }
      });

      nexus.on('CLAIM_MADE', () => {
        if (window.OdinUI?.getState()?.activeTab === 'war-room') {
          window.OdinUI.refreshContent();
        }
      });

      nexus.on('CLAIM_RELEASED', () => {
        if (window.OdinUI?.getState()?.activeTab === 'war-room') {
          window.OdinUI.refreshContent();
        }
      });
    }

    function destroy() {
      log('[UI War Room] Destroyed');
    }

    return { id: 'ui-war-room', init, destroy };
  });
})();
