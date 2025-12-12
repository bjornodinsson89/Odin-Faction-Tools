// ui-retals.js
// Retaliation management UI
// Version: 3.1.0 - Fixed: Single tab registration pattern

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_RetalsInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderRetals() {
      const UI = window.OdinUI?.helpers;
      const spear = window.OdinsSpear?.services;
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const candidates = spear?.RetalService?.getCandidates() || [];

      // ============================================
      // HEADER SECTION
      // ============================================
      const headerSection = UI.createSection(`Retaliation Candidates (${candidates.length})`, '🎯');

      if (candidates.length === 0) {
        const emptyCard = UI.createCard(`
          <div style="text-align: center; padding: 32px;">
            <div style="font-size: 48px; margin-bottom: 16px;">🕊️</div>
            <div style="color: #718096; font-size: 14px;">No retaliation candidates</div>
            <div style="color: #4a5568; font-size: 12px; margin-top: 8px;">
              Incoming attacks on faction members will appear here
            </div>
          </div>
        `);
        headerSection.appendChild(emptyCard);
        container.appendChild(headerSection);
        return container;
      }

      // ============================================
      // CANDIDATES LIST
      // ============================================
      const listCard = document.createElement('div');
      listCard.className = 'odin-card';
      listCard.style.padding = '0';

      listCard.innerHTML = candidates.map((candidate, idx) => {
        // Get Freki score if available
        let frekiScore = null;
        let frekiLabel = '';
        let frekiColor = '#718096';

        if (window.Freki && candidate.attackerLevel) {
          const scoreResult = window.Freki.scoreMatchup?.({
            targetLevel: candidate.attackerLevel,
            myLevel: ctx.userLevel || 50,
          });
          if (scoreResult) {
            frekiScore = scoreResult.score;
            frekiLabel = scoreResult.label;
            frekiColor = getFrekiColor(frekiScore);
          }
        }

        const priorityColor = {
          high: '#fc8181',
          normal: '#ed8936',
          low: '#48bb78',
        }[candidate.priority] || '#a0aec0';

        return `
          <div class="retal-row" data-attacker-id="${candidate.attackerId}" style="
            padding: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            background: ${idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'};
          ">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <a href="https://www.torn.com/profiles.php?XID=${candidate.attackerId}" target="_blank"
                   style="color: #667eea; text-decoration: none; font-weight: 600; font-size: 15px;">
                  ${candidate.attackerName}
                </a>
                <div style="font-size: 12px; color: #718096; margin-top: 2px;">
                  Level ${candidate.attackerLevel || '?'} • ${candidate.attacks} attack${candidate.attacks !== 1 ? 's' : ''}
                </div>
              </div>
              <div style="text-align: right;">
                <span style="
                  padding: 2px 8px;
                  border-radius: 4px;
                  font-size: 11px;
                  background: ${priorityColor}22;
                  color: ${priorityColor};
                  text-transform: uppercase;
                ">
                  ${candidate.priority}
                </span>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 12px; font-size: 12px; color: #a0aec0;">
                <span>First: ${formatTimeAgo(candidate.firstAttack)}</span>
                <span>Last: ${formatTimeAgo(candidate.lastAttack)}</span>
              </div>
              ${frekiScore !== null ? `
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 11px; color: #718096;">Freki:</span>
                  <span style="
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    font-weight: 600;
                    background: ${frekiColor}22;
                    color: ${frekiColor};
                  ">
                    ${frekiScore.toFixed(1)} ${frekiLabel}
                  </span>
                </div>
              ` : ''}
            </div>

            <div style="display: flex; gap: 8px; margin-top: 12px;">
              <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${candidate.attackerId}" target="_blank"
                 class="odin-btn odin-btn-success" style="flex: 1; text-align: center; text-decoration: none;">
                ⚔️ Attack
              </a>
              <button class="retal-dismiss odin-btn odin-btn-secondary" data-id="${candidate.attackerId}">
                ✕ Dismiss
              </button>
            </div>
          </div>
        `;
      }).join('');

      headerSection.appendChild(listCard);
      container.appendChild(headerSection);

      // ============================================
      // CONTROLS SECTION
      // ============================================
      const controlsSection = UI.createSection('Controls', '🎮');

      const controlsCard = UI.createCard(`
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button id="retal-refresh" class="odin-btn odin-btn-primary">
            🔄 Refresh
          </button>
          <button id="retal-clear-all" class="odin-btn odin-btn-danger">
            🗑️ Clear All
          </button>
        </div>
        <p style="margin-top: 12px; font-size: 12px; color: #718096;">
          ${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} • 
          ${candidates.reduce((sum, c) => sum + c.attacks, 0)} total attacks
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
    function formatTimeAgo(timestamp) {
      const diff = Date.now() - timestamp;
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (days > 0) return `${days}d ago`;
      if (hours > 0) return `${hours}h ago`;
      if (mins > 0) return `${mins}m ago`;
      return 'just now';
    }

    function getFrekiColor(score) {
      if (score >= 4) return '#48bb78';
      if (score >= 3) return '#68d391';
      if (score >= 2) return '#ecc94b';
      if (score >= 1) return '#ed8936';
      return '#fc8181';
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      const spear = window.OdinsSpear?.services;

      document.querySelectorAll('.retal-dismiss').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const attackerId = e.target.dataset.id;
          if (attackerId) {
            spear?.RetalService?.removeCandidate(attackerId);
            window.OdinUI?.refreshContent();
          }
        });
      });

      document.getElementById('retal-refresh')?.addEventListener('click', () => {
        window.OdinUI?.refreshContent();
      });

      document.getElementById('retal-clear-all')?.addEventListener('click', () => {
        if (confirm('Clear all retaliation candidates?')) {
          spear?.RetalService?.clearCandidates();
          window.OdinUI?.refreshContent();
        }
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Retals] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('retals', renderRetals);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();

      // Listen for new candidates
      nexus.on('RETAL_CANDIDATE', () => {
        if (window.OdinUI?.getState()?.activeTab === 'retals') {
          window.OdinUI.refreshContent();
        }
      });
    }

    function destroy() {
      log('[UI Retals] Destroyed');
    }

    return { id: 'ui-retals', init, destroy };
  });
})();
