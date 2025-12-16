// ui-targets.js
// Target selection UI with Freki scoring
// Version: 3.1.0 - Fixed: Single tab registration pattern

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_TargetsInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {}, remove: () => {} };
    const log = ctx.log || console.log;

    // State
    let targets = [];
    let sortColumn = 'score';
    let sortDirection = 'desc';
    let filterStatus = 'all';

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderTargets() {
      const UI = window.OdinUI?.helpers;
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const warConfig = spear?.WarConfigService?.getConfig() || {};
      const claims = spear?.ClaimsService?.getActiveClaims() || [];
      const claimedIds = new Set(claims.map((c) => c.targetId));

      // ============================================
      // CONTROLS SECTION
      // ============================================
      const controlsSection = UI.createSection('Target Controls', '🎯');

      const controlsCard = UI.createCard(`
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
          <button id="targets-load" class="odin-btn odin-btn-primary">
            📥 Load Enemy Faction
          </button>
          <button id="targets-refresh" class="odin-btn odin-btn-secondary">
            🔄 Refresh Scores
          </button>
          <button id="targets-clear" class="odin-btn odin-btn-warning">
            🗑️ Clear
          </button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
          <label style="color: #718096; font-size: 12px;">Filter:</label>
          <select id="targets-filter" style="
            padding: 6px 10px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #e2e8f0;
            font-size: 12px;
          ">
            <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>All</option>
            <option value="available" ${filterStatus === 'available' ? 'selected' : ''}>Available</option>
            <option value="claimed" ${filterStatus === 'claimed' ? 'selected' : ''}>Claimed</option>
            <option value="hospital" ${filterStatus === 'hospital' ? 'selected' : ''}>In Hospital</option>
          </select>
          <span style="color: #718096; font-size: 12px; margin-left: 8px;">
            ${targets.length} target${targets.length !== 1 ? 's' : ''}
            ${warConfig.enemyFactionName ? ` from ${warConfig.enemyFactionName}` : ''}
          </span>
        </div>
      `);

      controlsSection.appendChild(controlsCard);
      container.appendChild(controlsSection);

      // ============================================
      // TARGETS TABLE
      // ============================================
      if (targets.length > 0) {
        const targetsSection = UI.createSection('Enemy Targets', '⚔️');

        // Filter targets
        let filteredTargets = [...targets];
        if (filterStatus === 'available') {
          filteredTargets = filteredTargets.filter((t) => !claimedIds.has(t.id) && t.status !== 'hospital');
        } else if (filterStatus === 'claimed') {
          filteredTargets = filteredTargets.filter((t) => claimedIds.has(t.id));
        } else if (filterStatus === 'hospital') {
          filteredTargets = filteredTargets.filter((t) => t.status === 'hospital');
        }

        // Sort targets
        filteredTargets = sortTargets(filteredTargets, sortColumn, sortDirection);

        const targetsCard = document.createElement('div');
        targetsCard.className = 'odin-card';
        targetsCard.style.padding = '0';
        targetsCard.innerHTML = `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: rgba(0,0,0,0.3); text-align: left;">
                  <th class="sortable-col" data-column="name" style="padding: 10px 12px; color: #a0aec0; cursor: pointer;">
                    Name ${getSortIndicator('name')}
                  </th>
                  <th class="sortable-col" data-column="level" style="padding: 10px 12px; color: #a0aec0; cursor: pointer;">
                    Level ${getSortIndicator('level')}
                  </th>
                  <th class="sortable-col" data-column="score" style="padding: 10px 12px; color: #a0aec0; cursor: pointer;">
                    Freki ${getSortIndicator('score')}
                  </th>
                  <th style="padding: 10px 12px; color: #a0aec0;">Status</th>
                  <th style="padding: 10px 12px; color: #a0aec0;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredTargets.map((target, idx) => {
                  const isClaimed = claimedIds.has(target.id);
                  const claim = isClaimed ? claims.find((c) => c.targetId === target.id) : null;
                  const scoreColor = getFrekiColor(target.score);

                  return `
                    <tr data-target-id="${target.id}" style="
                      background: ${idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'};
                      border-bottom: 1px solid rgba(255,255,255,0.05);
                      ${isClaimed ? 'opacity: 0.7;' : ''}
                    ">
                      <td style="padding: 10px 12px;">
                        <a href="https://www.torn.com/profiles.php?XID=${target.id}" target="_blank"
                           style="color: #667eea; text-decoration: none;">
                          ${target.name}
                        </a>
                      </td>
                      <td style="padding: 10px 12px; color: #a0aec0;">${target.level}</td>
                      <td style="padding: 10px 12px;">
                        <span style="
                          padding: 2px 8px;
                          border-radius: 4px;
                          font-weight: 600;
                          background: ${scoreColor}22;
                          color: ${scoreColor};
                        ">
                          ${target.score?.toFixed(1) || '?'} ${target.label || ''}
                        </span>
                      </td>
                      <td style="padding: 10px 12px;">
                        ${getStatusBadge(target.status, isClaimed, claim)}
                      </td>
                      <td style="padding: 10px 12px;">
                        <div style="display: flex; gap: 4px;">
                          ${!isClaimed ? `
                            <button class="target-claim odin-btn odin-btn-success" data-id="${target.id}" style="padding: 4px 8px; font-size: 11px;">
                              Claim
                            </button>
                          ` : `
                            <button class="target-release odin-btn odin-btn-warning" data-id="${target.id}" style="padding: 4px 8px; font-size: 11px;">
                              Release
                            </button>
                          `}
                          <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${target.id}" target="_blank"
                             class="odin-btn odin-btn-primary" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">
                            Attack
                          </a>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;

        targetsSection.appendChild(targetsCard);
        container.appendChild(targetsSection);
// ============================================
// PERSONAL TARGETS (moved into Targets tab)
// ============================================
const personalSection = UI.createSection('Personal Targets', '⭐');

const personalTargets = (() => {
  try {
    const saved = storage.getJSON('odin_personal_targets');
    if (Array.isArray(saved)) return saved;
    if (saved && typeof saved === 'object') return Object.values(saved);
    return [];
  } catch (e) {
    return [];
  }
})();

const personalCard = document.createElement('div');
personalCard.className = 'odin-card';
personalCard.style.padding = '0';

const personalRowsHtml = personalTargets.length
  ? personalTargets.map((t, i) => {
      const id = (t && (t.id || t.playerId)) ? String(t.id || t.playerId) : '';
      const name = (t && (t.name || t.playerName)) ? String(t.name || t.playerName) : (id ? `Player #${id}` : 'Unknown');
      return `
        <tr style="border-top: 1px solid rgba(255,255,255,0.06); background: ${i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.10)'};">
          <td style="padding: 10px 12px;">
            ${id ? `<a href="https://www.torn.com/profiles.php?XID=${id}" target="_blank" rel="noopener" style="color:#667eea; text-decoration:none;">${name}</a>` : name}
          </td>
          <td style="padding: 10px 12px; color:#a0aec0; font-size: 12px;">${id || '-'}</td>
          <td style="padding: 10px 12px; text-align:right;">
            <button class="odin-btn odin-btn-danger odin-personal-target-remove" data-id="${id}" style="padding: 4px 8px; font-size: 11px;">
              Remove
            </button>
          </td>
        </tr>
      `;
    }).join('')
  : `
      <tr style="border-top: 1px solid rgba(255,255,255,0.06);">
        <td colspan="3" style="padding: 12px; color: #718096; font-size: 12px;">
          No personal targets yet. Add one below.
        </td>
      </tr>
    `;

personalCard.innerHTML = `
  <div style="padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);">
    <div style="display: grid; grid-template-columns: 1fr 140px auto; gap: 10px; align-items: end;">
      <div>
        <label style="display:block; color:#a0aec0; font-size: 12px; margin-bottom: 6px;">Name (optional)</label>
        <input type="text" id="odin-personal-target-name" placeholder="Player name"
          style="width: 100%; padding: 10px 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #e2e8f0; font-size: 14px;">
      </div>
      <div>
        <label style="display:block; color:#a0aec0; font-size: 12px; margin-bottom: 6px;">Player ID</label>
        <input type="text" inputmode="numeric" id="odin-personal-target-id" placeholder="123456"
          style="width: 100%; padding: 10px 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #e2e8f0; font-size: 14px;">
      </div>
      <div>
        <button class="odin-btn odin-btn-primary" id="odin-personal-target-add" style="padding: 10px 12px; font-size: 13px;">
          Add
        </button>
      </div>
    </div>
    <div style="margin-top: 10px; color: #718096; font-size: 12px;">
      Tip: If Name is blank, Odin will try to fetch it from Torn when you add.
    </div>
  </div>

  <div style="overflow-x:auto;">
    <table style="width:100%; border-collapse: collapse;">
      <thead>
        <tr style="background: rgba(0,0,0,0.18);">
          <th style="text-align:left; padding: 10px 12px; font-size: 11px; color:#a0aec0; font-weight:600;">Name</th>
          <th style="text-align:left; padding: 10px 12px; font-size: 11px; color:#a0aec0; font-weight:600;">ID</th>
          <th style="text-align:right; padding: 10px 12px; font-size: 11px; color:#a0aec0; font-weight:600;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${personalRowsHtml}
      </tbody>
    </table>
  </div>
`;

personalSection.appendChild(personalCard);
container.appendChild(personalSection);

// ============================================
      // STATS SECTION
      // ============================================
      if (targets.length > 0) {
        const statsSection = UI.createSection('Target Stats', '📊');

        const available = targets.filter((t) => !claimedIds.has(t.id) && t.status !== 'hospital').length;
        const inHospital = targets.filter((t) => t.status === 'hospital').length;
        const avgScore = targets.reduce((sum, t) => sum + (t.score || 0), 0) / targets.length;

        const statsCard = UI.createCard(`
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px;">
            <div style="text-align: center; padding: 8px; background: rgba(72, 187, 120, 0.1); border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #48bb78;">${available}</div>
              <div style="font-size: 10px; color: #718096;">Available</div>
            </div>
            <div style="text-align: center; padding: 8px; background: rgba(102, 126, 234, 0.1); border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #667eea;">${claims.length}</div>
              <div style="font-size: 10px; color: #718096;">Claimed</div>
            </div>
            <div style="text-align: center; padding: 8px; background: rgba(229, 62, 62, 0.1); border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #fc8181;">${inHospital}</div>
              <div style="font-size: 10px; color: #718096;">Hospital</div>
            </div>
            <div style="text-align: center; padding: 8px; background: rgba(237, 137, 54, 0.1); border-radius: 6px;">
              <div style="font-size: 18px; font-weight: 700; color: #ed8936;">${avgScore.toFixed(1)}</div>
              <div style="font-size: 10px; color: #718096;">Avg Score</div>
            </div>
          </div>
        `);

        statsSection.appendChild(statsCard);
        container.appendChild(statsSection);
      }

      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    function sortTargets(list, column, direction) {
      return [...list].sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];

        if (typeof aVal === 'string') {
          const cmp = aVal.localeCompare(bVal);
          return direction === 'asc' ? cmp : -cmp;
        }

        aVal = aVal || 0;
        bVal = bVal || 0;
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    function getSortIndicator(column) {
      if (sortColumn !== column) return '';
      return sortDirection === 'asc' ? '▲' : '▼';
    }

    function getFrekiColor(score) {
      if (!score) return '#718096';
      if (score >= 4) return '#48bb78';
      if (score >= 3) return '#68d391';
      if (score >= 2) return '#ecc94b';
      if (score >= 1) return '#ed8936';
      return '#fc8181';
    }

    function getStatusBadge(status, isClaimed, claim) {
      if (isClaimed && claim) {
        return `<span style="color: #667eea; font-size: 11px;">🔒 ${claim.attackerName}</span>`;
      }
      if (status === 'hospital') {
        return '<span style="color: #fc8181; font-size: 11px;">🏥 Hospital</span>';
      }
      if (status === 'jail') {
        return '<span style="color: #ed8936; font-size: 11px;">⛓️ Jail</span>';
      }
      if (status === 'traveling') {
        return '<span style="color: #a0aec0; font-size: 11px;">✈️ Traveling</span>';
      }
      return '<span style="color: #48bb78; font-size: 11px;">✓ Available</span>';
    }

    async function loadEnemyFaction() {
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);
      const warConfig = spear?.WarConfigService?.getConfig() || {};

      if (!warConfig.enemyFactionId) {
        alert('No enemy faction set. Configure in Leadership tab.');
        return;
      }

      try {
        const api = ctx.api || window.OdinContext?.api;
        const data = await api?.tornGet?.(`/faction/${warConfig.enemyFactionId}`, 'basic');

        if (!data?.members) {
          alert('Failed to load faction data');
          return;
        }

        const myLevel = ctx.userLevel || 50;
        targets = [];

        for (const [id, member] of Object.entries(data.members)) {
          // Get Freki score
          let score = 2.5;
          let label = '';

          if (window.Freki) {
            const scoreResult = window.Freki.scoreMatchup?.({
              targetLevel: member.level,
              myLevel: myLevel,
            });
            if (scoreResult) {
              score = scoreResult.score;
              label = scoreResult.label;
            }
          }

          targets.push({
            id: parseInt(id, 10),
            name: member.name,
            level: member.level || 0,
            status: member.status?.state || 'ok',
            lastAction: member.last_action?.relative || 'Unknown',
            score: score,
            label: label,
          });
        }

        // Sort by score descending by default
        targets.sort((a, b) => (b.score || 0) - (a.score || 0));

        window.OdinUI?.refreshContent();
        log('[Targets] Loaded', targets.length, 'targets from', warConfig.enemyFactionName);

      } catch (e) {
        log('[Targets] Load failed:', e.message);
        alert('Failed to load faction: ' + e.message);
      }
    }

    function refreshScores() {
      const myLevel = ctx.userLevel || 50;

      targets = targets.map((target) => {
        let score = 2.5;
        let label = '';

        if (window.Freki) {
          const scoreResult = window.Freki.scoreMatchup?.({
            targetLevel: target.level,
            myLevel: myLevel,
          });
          if (scoreResult) {
            score = scoreResult.score;
            label = scoreResult.label;
          }
        }

        return { ...target, score, label };
      });

      window.OdinUI?.refreshContent();
      log('[Targets] Scores refreshed');
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      const spear = (ctx.spear?.services) || (window.OdinsSpear?.services);

      document.getElementById('targets-load')?.addEventListener('click', loadEnemyFaction);

      document.getElementById('targets-refresh')?.addEventListener('click', refreshScores);

      document.getElementById('targets-clear')?.addEventListener('click', () => {
        targets = [];
        window.OdinUI?.refreshContent();
      });

      document.getElementById('targets-filter')?.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        window.OdinUI?.refreshContent();
      });

      document.querySelectorAll('.sortable-col').forEach((col) => {
        col.addEventListener('click', () => {
          const column = col.dataset.column;
          if (sortColumn === column) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortColumn = column;
            sortDirection = column === 'score' ? 'desc' : 'asc';
          }
          window.OdinUI?.refreshContent();
        });
      });

      document.querySelectorAll('.target-claim').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const targetId = e.target.dataset.id;
          const result = spear?.ClaimsService?.makeClaim(
            targetId,
            ctx.userId || 'unknown',
            ctx.userName || 'You'
          );
          if (result?.success) {
            window.OdinUI?.refreshContent();
          } else {
            alert(result?.reason === 'already_claimed' 
              ? `Already claimed by ${result.claimedBy}`
              : 'Failed to claim target');
          }
        });
      });

      document.querySelectorAll('.target-release').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const targetId = e.target.dataset.id;
          spear?.ClaimsService?.releaseClaim(targetId, ctx.userId || 'unknown');
          window.OdinUI?.refreshContent();
        });
      });
    }


      const readPersonalTargets = () => {
        try {
          const saved = storage.getJSON('odin_personal_targets');
          if (Array.isArray(saved)) return saved;
          if (saved && typeof saved === 'object') return Object.values(saved);
          return [];
        } catch (e) {
          return [];
        }
      };

      const savePersonalTargets = (list) => {
        storage.setJSON('odin_personal_targets', list);
      };

      const guessNameFromUserResp = (data, fallback) => {
        return data?.name || data?.player?.name || data?.basic?.name || fallback;
      };

      const doAddPersonal = async () => {
        const idEl = document.getElementById('odin-personal-target-id');
        const nameEl = document.getElementById('odin-personal-target-name');
        const rawId = (idEl && idEl.value) ? String(idEl.value).trim() : '';
        const id = rawId.replace(/\D+/g, '');
        if (!id) {
          window.OdinUI?.showNotification?.('Enter a valid Player ID', 'warning');
          return;
        }

        const api = ctx.api || window.OdinContext?.api || window.OdinApiConfig || window.OdinApi;
        let name = (nameEl && nameEl.value) ? String(nameEl.value).trim() : '';
        if (!name) {
          try {
            const data = await api?.tornGet?.(`/user/${id}`, 'basic');
            name = guessNameFromUserResp(data, '');
          } catch (e) {
            name = '';
          }
        }
        if (!name) name = `Player #${id}`;

        let list = readPersonalTargets();
        if (list.some(t => String(t?.id || t?.playerId) === String(id))) {
          window.OdinUI?.showNotification?.('Target already in Personal Targets', 'warning');
          return;
        }

        list.push({
          id: Number(id),
          name,
          addedAt: Date.now(),
          frekiScore: null,
          lastUpdated: null,
          status: null,
          level: null,
          faction: null
        });

        savePersonalTargets(list);

        if (idEl) idEl.value = '';
        if (nameEl) nameEl.value = '';

        window.OdinUI?.refreshContent();
        window.OdinUI?.showNotification?.(`Added ${name}`, 'success');
      };

      const addBtn = document.getElementById('odin-personal-target-add');
      addBtn?.addEventListener('click', doAddPersonal);

      const idInput = document.getElementById('odin-personal-target-id');
      const nameInput = document.getElementById('odin-personal-target-name');
      const onEnter = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doAddPersonal();
        }
      };
      idInput?.addEventListener('keydown', onEnter);
      nameInput?.addEventListener('keydown', onEnter);

      document.querySelectorAll('.odin-personal-target-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget?.dataset?.id;
          if (!id) return;
          const list = readPersonalTargets().filter(t => String(t?.id || t?.playerId) !== String(id));
          savePersonalTargets(list);
          window.OdinUI?.refreshContent();
          window.OdinUI?.showNotification?.('Removed personal target', 'success');
        });
      });

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Targets] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('targets', renderTargets);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();

      // Listen for claim updates
      nexus.on('CLAIM_MADE', () => {
        if (window.OdinUI?.getState()?.activeTab === 'targets') {
          window.OdinUI.refreshContent();
        }
      });

      nexus.on('CLAIM_RELEASED', () => {
        if (window.OdinUI?.getState()?.activeTab === 'targets') {
          window.OdinUI.refreshContent();
        }
      });
    }

    function destroy() {
      log('[UI Targets] Destroyed');
      targets = [];
    }

    return { id: 'ui-targets', init, destroy };
  });
})();
