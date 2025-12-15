// ui-personal-targets.js
// Personal Targets List - User's custom watchlist
// Version: 4.0.0

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_PersonalTargetsInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const log = ctx.log || console.log;

    let personalTargets = [];
    let sortColumn = null;
    let sortDirection = 'asc';

    // ============================================
    // DATA MANAGEMENT
    // ============================================
    function loadTargets() {
      const saved = storage.getJSON('odin_personal_targets');
      personalTargets = saved || [];
    }

    function saveTargets() {
      storage.setJSON('odin_personal_targets', personalTargets);
    }

    function addTarget(playerId, playerName) {
      if (personalTargets.find(t => t.id === playerId)) {
        window.OdinUI?.showNotification('Target already in list', 'warning');
        return;
      }

      personalTargets.push({
        id: playerId,
        name: playerName,
        addedAt: Date.now(),
        frekiScore: null,
        lastUpdated: null,
        status: null,
        level: null,
        faction: null
      });

      saveTargets();
      window.OdinUI?.refreshContent();
      window.OdinUI?.showNotification(`Added ${playerName} to targets`, 'success');
    }

    function removeTarget(playerId) {
      personalTargets = personalTargets.filter(t => t.id !== playerId);
      saveTargets();
      window.OdinUI?.refreshContent();
    }

    async function updateTargetInfo(target) {
      if (!ctx.api || !ctx.api.getTornApiKey) return;

      try {
        const apiKey = ctx.api.getTornApiKey();
        if (!apiKey) return;

        const response = await fetch(`https://api.torn.com/user/${target.id}?selections=profile&key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
          log('[Personal Targets] API error:', data.error);
          return;
        }

        target.name = data.name;
        target.level = data.level;
        target.status = data.status;
        target.faction = data.faction;
        target.lastUpdated = Date.now();

        // Get Freki score if available
        if ((ctx.spear?.services) || (window.OdinsSpear?.services)?.FrekiService) {
          target.frekiScore = window.OdinsSpear.services.FrekiService.getScore(target.id);
        }

        saveTargets();
      } catch (error) {
        log('[Personal Targets] Error updating target:', error);
      }
    }

    async function refreshAllTargets() {
      for (const target of personalTargets) {
        await updateTargetInfo(target);
        await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
      }
      window.OdinUI?.refreshContent();
    }

    // ============================================
    // SORTING
    // ============================================
    function sortTargets(column) {
      if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = column;
        sortDirection = 'asc';
      }

      personalTargets.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
          case 'name':
            aVal = a.name?.toLowerCase() || '';
            bVal = b.name?.toLowerCase() || '';
            break;
          case 'level':
            aVal = a.level || 0;
            bVal = b.level || 0;
            break;
          case 'freki':
            aVal = a.frekiScore || 0;
            bVal = b.frekiScore || 0;
            break;
          case 'status':
            aVal = getStatusPriority(a.status);
            bVal = getStatusPriority(b.status);
            break;
          case 'added':
            aVal = a.addedAt || 0;
            bVal = b.addedAt || 0;
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });

      window.OdinUI?.refreshContent();
    }

    function getStatusPriority(status) {
      if (!status) return 5;
      if (status.state === 'Online') return 1;
      if (status.state === 'Offline') return 2;
      if (status.state === 'Hospital') return 3;
      if (status.state === 'Jail') return 4;
      return 5;
    }

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderPersonalTargets() {
      const UI = window.OdinUI?.helpers;
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');

      // Notice: Personal tab is deprecated; personal targets are now managed inside Targets.
      const notice = document.createElement('div');
      notice.className = 'odin-card';
      notice.style.marginBottom = '12px';
      notice.innerHTML = `
        <div style="display:flex; gap:12px; align-items:flex-start; justify-content:space-between;">
          <div style="flex:1;">
            <div style="font-size:13px; font-weight:700; color:#e2e8f0; margin-bottom:4px;">Personal targets moved</div>
            <div style="font-size:12px; color:#a0aec0; line-height:1.4;">Personal targets are now managed inside the <strong>Targets</strong> tab. This tab is kept for backward compatibility.</div>
          </div>
          <button id="odin-goto-targets" class="odin-btn odin-btn-primary" style="white-space:nowrap;">Go to Targets</button>
        </div>
      `;
      container.appendChild(notice);


      // ============================================
      // ADD TARGET SECTION
      // ============================================
      const addSection = UI.createSection('Add Target', '➕');
      
      const addCard = UI.createCard(`
        <div style="display: flex; gap: 8px; align-items: flex-end;">
          <div style="flex: 1;">
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              Player ID
            </label>
            <input 
              type="text" 
              id="add-target-id" 
              class="odin-input"
              placeholder="Enter player ID..."
              style="margin: 0;"
            />
          </div>
          <div style="flex: 1;">
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              Player Name (optional)
            </label>
            <input 
              type="text" 
              id="add-target-name" 
              class="odin-input"
              placeholder="Enter name..."
              style="margin: 0;"
            />
          </div>
          <button id="btn-add-target" class="odin-btn odin-btn-success">
            ➕ Add Target
          </button>
        </div>
      `);

      addSection.appendChild(addCard);
      container.appendChild(addSection);

      // ============================================
      // TARGETS LIST
      // ============================================
      const targetsSection = UI.createSection(`My Targets (${personalTargets.length})`, '📌');

      if (personalTargets.length === 0) {
        targetsSection.appendChild(UI.createCard(`
          <div style="text-align: center; padding: 40px 20px; color: #718096;">
            <div style="font-size: 48px; margin-bottom: 16px;">🎯</div>
            <div style="font-size: 16px; margin-bottom: 8px;">No personal targets yet</div>
            <div style="font-size: 13px;">Add players to track them here</div>
          </div>
        `));
      } else {
        const controlsCard = UI.createCard(`
          <div style="display: flex; gap: 8px; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 8px;">
              <button id="btn-refresh-all" class="odin-btn odin-btn-primary">
                🔄 Refresh All
              </button>
              <button id="btn-clear-all" class="odin-btn odin-btn-danger">
                🗑️ Clear All
              </button>
            </div>
            <div style="font-size: 12px; color: #718096;">
              Last updated: ${personalTargets[0]?.lastUpdated ? new Date(personalTargets[0].lastUpdated).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        `);
        targetsSection.appendChild(controlsCard);

        // Build table
        const tableCard = document.createElement('div');
        tableCard.className = 'odin-card';
        tableCard.style.padding = '0';
        tableCard.style.overflow = 'auto';

        const rows = personalTargets.map(target => [
          `<a href="https://www.torn.com/profiles.php?XID=${target.id}" target="_blank" style="color: #667eea; text-decoration: none;">${target.name || `[${target.id}]`}</a>`,
          target.level || '?',
          target.faction?.faction_name || '-',
          renderStatus(target.status),
          renderFrekiScore(target.frekiScore),
          `<div style="display: flex; gap: 4px;">
            <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${target.id}" target="_blank" class="odin-btn odin-btn-danger" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">
              ⚔️ Attack
            </a>
            <button class="odin-btn odin-btn-secondary" style="padding: 4px 8px; font-size: 11px;" data-remove="${target.id}">
              🗑️
            </button>
          </div>`
        ]);

        const headers = [
          { label: 'Player', column: 'name' },
          { label: 'Level', column: 'level' },
          { label: 'Faction', column: 'faction' },
          { label: 'Status', column: 'status' },
          { label: 'Freki', column: 'freki' },
          { label: 'Actions', column: null }
        ];

        const table = UI.createTable({
          headers,
          rows,
          sortable: true,
          onSort: (columnIndex) => {
            const header = headers[columnIndex];
            if (header.column) {
              sortTargets(header.column);
            }
          }
        });

        // Update sort indicators
        const ths = table.querySelectorAll('th');
        headers.forEach((header, index) => {
          if (header.column === sortColumn) {
            ths[index].classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
          }
        });

        tableCard.appendChild(table);
        targetsSection.appendChild(tableCard);
      }

      container.appendChild(targetsSection);

      // Attach event listeners
      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    function renderStatus(status) {
      if (!status) return '<span class="status-offline">Unknown</span>';

      const state = status.state;
      const until = status.until;

      if (state === 'Online') {
        return '<span class="status-online">🟢 Online</span>';
      } else if (state === 'Offline') {
        return '<span class="status-offline">⚪ Offline</span>';
      } else if (state === 'Hospital') {
        const remaining = until - Math.floor(Date.now() / 1000);
        const time = remaining > 0 ? formatTime(remaining) : 'Out';
        return `<span class="status-hospital">🏥 ${time}</span>`;
      } else if (state === 'Jail') {
        const remaining = until - Math.floor(Date.now() / 1000);
        const time = remaining > 0 ? formatTime(remaining) : 'Out';
        return `<span class="status-jail">🔒 ${time}</span>`;
      } else if (state === 'Traveling') {
        return '<span class="status-traveling">✈️ Traveling</span>';
      }

      return `<span style="color: #718096;">${state}</span>`;
    }

    function renderFrekiScore(score) {
      if (!score) return '<span style="color: #718096;">-</span>';

      const UI = window.OdinUI?.helpers;
      const className = UI.getFrekiScoreClass(score);
      const label = UI.getFrekiScoreLabel(score);

      return `<span class="${className}" style="font-weight: 600;">${score.toFixed(1)} (${label})</span>`;
    }

    function formatTime(seconds) {
      if (seconds <= 0) return '0m';
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      document.getElementById('odin-goto-targets')?.addEventListener('click', () => {
        window.OdinUI?.setActiveTab?.('targets');
      });
      document.getElementById('btn-add-target')?.addEventListener('click', () => {
        const idInput = document.getElementById('add-target-id');
        const nameInput = document.getElementById('add-target-name');
        
        const playerId = idInput?.value.trim();
        const playerName = nameInput?.value.trim() || `Player ${playerId}`;

        if (!playerId || isNaN(playerId)) {
          window.OdinUI?.showNotification('Please enter a valid player ID', 'error');
          return;
        }

        addTarget(parseInt(playerId), playerName);

        if (idInput) idInput.value = '';
        if (nameInput) nameInput.value = '';
      });

      document.getElementById('btn-refresh-all')?.addEventListener('click', async () => {
        window.OdinUI?.showNotification('Refreshing all targets...', 'info');
        await refreshAllTargets();
        window.OdinUI?.showNotification('Targets refreshed!', 'success');
      });

      document.getElementById('btn-clear-all')?.addEventListener('click', () => {
        if (confirm('Remove all personal targets?')) {
          personalTargets = [];
          saveTargets();
          window.OdinUI?.refreshContent();
          window.OdinUI?.showNotification('All targets cleared', 'info');
        }
      });

      // Remove buttons
      document.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const targetId = parseInt(e.currentTarget.dataset.remove);
          const target = personalTargets.find(t => t.id === targetId);
          if (confirm(`Remove ${target?.name || targetId} from targets?`)) {
            removeTarget(targetId);
          }
        });
      });
    }

    // ============================================
    // MODULE INIT
    // ============================================
    function init() {
      log('[Personal Targets] Initializing v4.0.0');

      loadTargets();

      const register = () => window.OdinUI?.registerTabContent('personal-targets', renderPersonalTargets);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();

      // Auto-refresh every 5 minutes
      setInterval(() => {
        if (window.OdinUI?.getState()?.activeTab === 'personal-targets') {
          refreshAllTargets();
        }
      }, 5 * 60 * 1000);
    }

    function destroy() {
      log('[Personal Targets] Destroyed');
    }

    return { id: 'ui-personal-targets', init, destroy };
  });
})();
