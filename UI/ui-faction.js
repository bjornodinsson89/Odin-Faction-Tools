// ui-faction.js
// Faction Dashboard UI (read-only)
// Version: 3.1.0 - Full faction dashboard with FactionService integration

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_FactionInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    // Sort state
    let sortColumn = 'position';
    let sortDirection = 'asc';

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderFaction() {
      const UI = window.OdinUI?.helpers;
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const summary = spear?.FactionService?.getSummary();
      const members = spear?.FactionService?.getMembers() || [];
      const hasPermissionError = spear?.FactionService?.hasPermissionError();
      const lastError = spear?.FactionService?.getLastError();

      // ============================================
      // ERROR STATE
      // ============================================
      if (hasPermissionError || (!summary && lastError)) {
        const errorSection = document.createElement('div');
        errorSection.className = 'odin-error-banner';
        errorSection.style.cssText = `
          background: rgba(229, 62, 62, 0.15);
          border: 1px solid rgba(229, 62, 62, 0.4);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          color: #fc8181;
        `;
        
        errorSection.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 24px;">⚠️</span>
            <div>
              <div style="font-weight: 600; margin-bottom: 4px;">Unable to load faction data</div>
              <div style="font-size: 13px; color: #a0aec0;">
                ${hasPermissionError 
                  ? 'You need a Torn API key with faction access (Faction API Access / AA) to load faction-wide data.'
                  : lastError || 'An unknown error occurred.'}
              </div>
            </div>
          </div>
        `;
        container.appendChild(errorSection);
      }

      // ============================================
      // FACTION OVERVIEW CARD (C3)
      // ============================================
      if (summary) {
        const overviewSection = UI.createSection('Faction Overview', '🏰');

        const overviewCard = UI.createCard(`
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
            ${summary.tagImage ? `<img src="${summary.tagImage}" alt="${summary.tag}" style="width: 48px; height: 48px; border-radius: 8px;">` : ''}
            <div>
              <div style="font-size: 24px; font-weight: 700; color: #667eea;">
                ${summary.name || 'Unknown Faction'}
              </div>
              <div style="font-size: 14px; color: #718096;">
                ${summary.tag ? `[${summary.tag}]` : ''} • ID: ${summary.id || 'N/A'}
              </div>
            </div>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
            <div style="background: rgba(102, 126, 234, 0.1); padding: 12px; border-radius: 8px;">
              <div style="font-size: 12px; color: #718096;">Respect</div>
              <div style="font-size: 20px; font-weight: 600; color: #667eea;">${formatNumber(summary.respect)}</div>
            </div>
            <div style="background: rgba(72, 187, 120, 0.1); padding: 12px; border-radius: 8px;">
              <div style="font-size: 12px; color: #718096;">Members</div>
              <div style="font-size: 20px; font-weight: 600; color: #48bb78;">${summary.memberCount || 0}</div>
            </div>
            <div style="background: rgba(237, 137, 54, 0.1); padding: 12px; border-radius: 8px;">
              <div style="font-size: 12px; color: #718096;">Best Chain</div>
              <div style="font-size: 20px; font-weight: 600; color: #ed8936;">${formatNumber(summary.bestChain)}</div>
            </div>
            <div style="background: rgba(160, 174, 192, 0.1); padding: 12px; border-radius: 8px;">
              <div style="font-size: 12px; color: #718096;">Age (days)</div>
              <div style="font-size: 20px; font-weight: 600; color: #a0aec0;">${summary.age || 0}</div>
            </div>
          </div>
          
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
              ${summary.leaderName ? `
                <div>
                  <span style="color: #718096; font-size: 12px;">Leader:</span>
                  <span style="color: #e2e8f0; margin-left: 4px;">${summary.leaderName}</span>
                </div>
              ` : ''}
              ${summary.coLeaderName ? `
                <div>
                  <span style="color: #718096; font-size: 12px;">Co-Leader:</span>
                  <span style="color: #e2e8f0; margin-left: 4px;">${summary.coLeaderName}</span>
                </div>
              ` : ''}
            </div>
          </div>

          ${summary.rank?.name ? `
            <div style="margin-top: 12px; padding: 10px; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
              <span style="color: #718096; font-size: 12px;">Rank:</span>
              <span style="color: #667eea; margin-left: 4px; font-weight: 500;">
                #${summary.rank.position || '?'} - ${summary.rank.name}
              </span>
            </div>
          ` : ''}
        `);

        overviewSection.appendChild(overviewCard);
        container.appendChild(overviewSection);
      }

      // ============================================
      // ACTIVITY SNAPSHOT (C5)
      // ============================================
      if (members.length > 0) {
        const activitySection = UI.createSection('Activity Snapshot', '📊');

        const stats = calculateActivityStats(members || []);

        const activityCard = UI.createCard(`
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px;">
            <div style="text-align: center; padding: 12px; background: rgba(72, 187, 120, 0.1); border-radius: 8px;">
              <div style="font-size: 28px; font-weight: 700; color: #48bb78;">${stats.active24h}</div>
              <div style="font-size: 11px; color: #718096; margin-top: 4px;">Active (24h)</div>
            </div>
            <div style="text-align: center; padding: 12px; background: rgba(237, 137, 54, 0.1); border-radius: 8px;">
              <div style="font-size: 28px; font-weight: 700; color: #ed8936;">${stats.inactive7d}</div>
              <div style="font-size: 11px; color: #718096; margin-top: 4px;">Inactive (7d+)</div>
            </div>
            <div style="text-align: center; padding: 12px; background: rgba(102, 126, 234, 0.1); border-radius: 8px;">
              <div style="font-size: 28px; font-weight: 700; color: #667eea;">${stats.avgLevel}</div>
              <div style="font-size: 11px; color: #718096; margin-top: 4px;">Avg Level</div>
            </div>
            <div style="text-align: center; padding: 12px; background: rgba(160, 174, 192, 0.1); border-radius: 8px;">
              <div style="font-size: 28px; font-weight: 700; color: #a0aec0;">${stats.medianDays}</div>
              <div style="font-size: 11px; color: #718096; margin-top: 4px;">Median Days</div>
            </div>
          </div>

          <div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #718096; font-size: 12px;">Status Breakdown:</span>
              <div style="display: flex; gap: 12px; font-size: 12px;">
                <span style="color: #48bb78;">🟢 OK: ${stats.statusOk}</span>
                <span style="color: #fc8181;">🏥 Hosp: ${stats.statusHosp}</span>
                <span style="color: #ed8936;">⛓️ Jail: ${stats.statusJail}</span>
              </div>
            </div>
          </div>
        `);

        activitySection.appendChild(activityCard);
        container.appendChild(activitySection);
      }

      // ============================================
      // FACTION ROSTER TABLE (C4)
      // ============================================
      if (members.length > 0) {
        const rosterSection = UI.createSection(`Faction Roster (${members.length} members)`, '👥');

        const sortedMembers = sortMembers(members, sortColumn, sortDirection);

        const rosterCard = document.createElement('div');
        rosterCard.className = 'odin-card';
        rosterCard.innerHTML = `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: rgba(0,0,0,0.3); text-align: left;">
                  <th class="sortable-header" data-column="name" style="padding: 10px 12px; color: #a0aec0; font-weight: 500; cursor: pointer; white-space: nowrap;">
                    Name ${getSortIndicator('name')}
                  </th>
                  <th class="sortable-header" data-column="level" style="padding: 10px 12px; color: #a0aec0; font-weight: 500; cursor: pointer; white-space: nowrap;">
                    Level ${getSortIndicator('level')}
                  </th>
                  <th class="sortable-header" data-column="position" style="padding: 10px 12px; color: #a0aec0; font-weight: 500; cursor: pointer; white-space: nowrap;">
                    Position ${getSortIndicator('position')}
                  </th>
                  <th class="sortable-header" data-column="daysInFaction" style="padding: 10px 12px; color: #a0aec0; font-weight: 500; cursor: pointer; white-space: nowrap;">
                    Days ${getSortIndicator('daysInFaction')}
                  </th>
                  <th class="sortable-header" data-column="lastActionTimestamp" style="padding: 10px 12px; color: #a0aec0; font-weight: 500; cursor: pointer; white-space: nowrap;">
                    Last Action ${getSortIndicator('lastActionTimestamp')}
                  </th>
                  <th style="padding: 10px 12px; color: #a0aec0; font-weight: 500; white-space: nowrap;">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                ${sortedMembers.map((member, idx) => `
                  <tr class="roster-row" data-player-id="${member.id}" style="
                    background: ${idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)'};
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    cursor: pointer;
                    transition: background 0.15s;
                  ">
                    <td style="padding: 10px 12px; color: #e2e8f0;">
                      <a href="https://www.torn.com/profiles.php?XID=${member.id}" target="_blank" 
                         style="color: #667eea; text-decoration: none;"
                         onclick="event.stopPropagation();">
                        ${member.name}
                      </a>
                    </td>
                    <td style="padding: 10px 12px; color: #a0aec0;">${member.level}</td>
                    <td style="padding: 10px 12px; color: ${getPositionColor(member.position)}; font-weight: ${isLeadership(member.position) ? '600' : '400'};">
                      ${member.position}
                    </td>
                    <td style="padding: 10px 12px; color: #a0aec0;">${member.daysInFaction}</td>
                    <td style="padding: 10px 12px; color: ${getActivityColor(member.lastAction)}; font-size: 12px;">
                      ${member.lastAction}
                    </td>
                    <td style="padding: 10px 12px;">
                      ${getStatusBadge(member.status)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;

        rosterSection.appendChild(rosterCard);
        container.appendChild(rosterSection);
      }

      // ============================================
      // CONTROLS SECTION
      // ============================================
      const controlsSection = UI.createSection('Controls', '🔧');

      const lastFetched = spear?.FactionService?.getLastFetched();

      const controlsCard = UI.createCard(`
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button id="odin-refresh-faction" class="odin-btn odin-btn-primary">
            🔄 Refresh Faction Data
          </button>
        </div>
        <p style="margin-top: 12px; font-size: 12px; color: #718096;">
          ${lastFetched ? `Last updated: ${new Date(lastFetched).toLocaleString()}` : 'Data not yet loaded'}
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
    function formatNumber(num) {
      if (!num && num !== 0) return '0';
      if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
      if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
      if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
      return num.toLocaleString();
    }

    function calculateActivityStats(members) {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;

      let active24h = 0;
      let inactive7d = 0;
      let statusOk = 0;
      let statusHosp = 0;
      let statusJail = 0;
      let totalLevel = 0;
      const daysArray = [];

      members.forEach((m) => {
        // Activity based on lastAction text parsing
        const action = (m.lastAction || '').toLowerCase();
        if (action.includes('minute') || action.includes('hour') || action.includes('now')) {
          active24h++;
        } else if (action.includes('day')) {
          const match = action.match(/(\d+)\s*day/);
          if (match && parseInt(match[1], 10) >= 7) {
            inactive7d++;
          }
        } else if (action.includes('week') || action.includes('month') || action.includes('year')) {
          inactive7d++;
        }

        // Status
        const status = (m.status || 'ok').toLowerCase();
        if (status === 'ok' || status === 'okay') statusOk++;
        else if (status === 'hospital' || status === 'hosp') statusHosp++;
        else if (status === 'jail') statusJail++;
        else statusOk++;

        // Level
        totalLevel += m.level || 0;
        daysArray.push(m.daysInFaction || 0);
      });

      // Median days
      daysArray.sort((a, b) => a - b);
      const medianDays = daysArray.length > 0 ? daysArray[Math.floor(daysArray.length / 2)] : 0;

      // Average level
      const avgLevel = members.length > 0 ? Math.round(totalLevel / members.length) : 0;

      return {
        active24h,
        inactive7d,
        avgLevel,
        medianDays,
        statusOk,
        statusHosp,
        statusJail,
      };
    }

    function sortMembers(members, column, direction) {
      const positionOrder = {
        'Leader': 0,
        'Co-leader': 1,
        'Officer': 2,
        'Member': 3,
      };

      return [...members].sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        // Special handling for position sorting
        if (column === 'position') {
          aVal = positionOrder[a.position] ?? 10;
          bVal = positionOrder[b.position] ?? 10;
        }

        // Handle string comparison
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          return direction === 'asc' ? cmp : -cmp;
        }

        // Numeric comparison
        aVal = aVal || 0;
        bVal = bVal || 0;
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    function getSortIndicator(column) {
      if (sortColumn !== column) return '';
      return sortDirection === 'asc' ? '▲' : '▼';
    }

    function getPositionColor(position) {
      const colors = {
        'Leader': '#ffd700',
        'Co-leader': '#c0c0c0',
        'Officer': '#cd7f32',
      };
      return colors[position] || '#a0aec0';
    }

    function isLeadership(position) {
      return ['Leader', 'Co-leader', 'Officer'].includes(position);
    }

    function getActivityColor(lastAction) {
      const action = (lastAction || '').toLowerCase();
      if (action.includes('minute') || action.includes('now')) return '#48bb78';
      if (action.includes('hour')) return '#68d391';
      if (action.includes('day')) {
        const match = action.match(/(\d+)\s*day/);
        if (match && parseInt(match[1], 10) >= 7) return '#fc8181';
        return '#ed8936';
      }
      if (action.includes('week') || action.includes('month')) return '#fc8181';
      return '#a0aec0';
    }

    function getStatusBadge(status) {
      const s = (status || 'ok').toLowerCase();
      if (s === 'ok' || s === 'okay') {
        return '<span style="color: #48bb78; font-size: 11px;">🟢 OK</span>';
      }
      if (s === 'hospital' || s === 'hosp') {
        return '<span style="color: #fc8181; font-size: 11px;">🏥 Hosp</span>';
      }
      if (s === 'jail') {
        return '<span style="color: #ed8936; font-size: 11px;">⛓️ Jail</span>';
      }
      return '<span style="color: #a0aec0; font-size: 11px;">❓ ' + status + '</span>';
    }

    // ============================================
    // EVENT LISTENERS (C2: Uses FactionService only)
    // ============================================
    function attachEventListeners() {
      // Refresh button - uses FactionService.refreshFaction()
      document.getElementById('odin-refresh-faction')?.addEventListener('click', async () => {
        const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
        try {
          await spear?.FactionService?.refreshFaction();
          window.OdinUI?.refreshContent();
        } catch (e) {
          log('[Faction] Refresh failed:', e.message);
          window.OdinUI?.refreshContent(); // Still refresh to show error state
        }
      });

      // Sortable headers
      document.querySelectorAll('.sortable-header').forEach((header) => {
        header.addEventListener('click', () => {
          const column = header.dataset.column;
          if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortColumn = column;
            sortDirection = 'asc';
          }
          window.OdinUI?.refreshContent();
        });
      });

      // Row hover effect
      document.querySelectorAll('.roster-row').forEach((row) => {
        row.addEventListener('mouseenter', () => {
          row.style.background = 'rgba(102, 126, 234, 0.1)';
        });
        row.addEventListener('mouseleave', () => {
          const idx = Array.from(row.parentNode.children).indexOf(row);
          row.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)';
        });
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Faction] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('faction', renderFaction);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();

      // Listen for faction updates
      nexus.on('FACTION_UPDATED', () => {
        if (window.OdinUI?.getState()?.activeTab === 'faction') {
          window.OdinUI.refreshContent();
        }
      });

      // Auto-load faction data on init
      setTimeout(() => {
        const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
        if (spear?.FactionService && !spear.FactionService.getFaction()) {
          spear.FactionService.refreshFaction().catch((e) => {
            log('[UI Faction] Auto-load failed:', e.message);
          });
        }
      }, 1000);
    }

    function destroy() {
      log('[UI Faction] Destroyed');
    }

    return { id: 'ui-faction', init, destroy };
  });
})();
