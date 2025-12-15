// ui-combined.js
// Odin Tools - Unified Frontend (Shadow DOM + All Modules)
// Version: 4.1.0

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUICombinedInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const log = ctx.log || console.log;
    const api = ctx.api || {};
    const spear = window.OdinsSpear?.services || {};
    const freki = window.Freki || {};
    const access = ctx.access || { isLeaderEffective: () => false, canWriteLeaderOps: () => false };

    const UI_VERSION = '4.1.0';

    // ============================================
    // STATE & CONFIG
    // ============================================
    const viewportW = window.innerWidth || 1024;
    const initialWidth = Math.max(280, Math.min(380, viewportW - 40));
    const initialHeight = Math.max(400, Math.min(650, window.innerHeight - 120));

    let state = {
      isOpen: false,
      activeTab: 'war-room', // Default tab
      position: { side: 'right', top: 100 },
      size: { width: initialWidth, height: initialHeight },
      personalTargets: storage.getJSON('odin_personal_targets') || [],
      warTargetsSort: 'score' // 'score', 'level', 'respect'
    };

    // Load saved UI state
    try {
      const saved = storage.getJSON('odin_ui_state');
      if (saved) state = { ...state, ...saved };
    } catch (e) {}

    const TABS = [
      { id: 'war-room', label: 'War Room', icon: '⚔️' },
      { id: 'targets', label: 'Targets', icon: '🎯' },
      { id: 'chain', label: 'Chain', icon: '🔗' },
      { id: 'retals', label: 'Retals', icon: '💥' },
      { id: 'faction', label: 'Faction', icon: '🏰' },
      { id: 'leadership', label: 'Leadership', icon: '👑', role: 'leader' },
      { id: 'settings', label: 'Settings', icon: '⚙️' },
    ];

    // ============================================
    // STYLES (CSS Variables & Shadow DOM)
    // ============================================
    const STYLES = `
      :host {
        --bg-dark: #1a1a2e;
        --bg-panel: rgba(255, 255, 255, 0.05);
        --text-primary: #e2e8f0;
        --text-muted: #a0aec0;
        --accent-primary: #667eea;
        --accent-success: #48bb78;
        --accent-warning: #ed8936;
        --accent-danger: #e53e3e;
        --radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .odin-overlay {
        position: fixed;
        z-index: 2147483647;
        background: linear-gradient(135deg, #0b0b0f 0%, #14141b 100%);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
        color: var(--text-primary);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: auto;
      }

      /* HEADER */
      .odin-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        cursor: move;
        user-select: none;
      }
      .odin-header-title { font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px; }
      .odin-header-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }

      /* TABS */
      .odin-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .odin-tab {
        padding: 6px 10px;
        background: transparent;
        border: none;
        color: var(--text-muted);
        font-size: 12px;
        cursor: pointer;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.15s;
      }
      .odin-tab:hover { background: rgba(255,255,255,0.05); }
      .odin-tab.active { background: rgba(102, 126, 234, 0.2); color: var(--text-primary); }

      /* CONTENT */
      .odin-content { flex: 1; overflow-y: auto; padding: 16px; position: relative; }
      .odin-content::-webkit-scrollbar { width: 6px; }
      .odin-content::-webkit-scrollbar-thumb { background: rgba(102, 126, 234, 0.5); border-radius: 3px; }

      /* COMPONENTS */
      .odin-section { margin-bottom: 20px; }
      .odin-section-header {
        display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .odin-section-title { font-weight: 600; font-size: 14px; color: var(--text-primary); margin: 0; }
      
      .odin-card { background: var(--bg-panel); border-radius: var(--radius); padding: 12px; margin-bottom: 8px; }
      
      .odin-btn {
        padding: 8px 12px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600;
        cursor: pointer; display: inline-flex; align-items: center; gap: 6px; justify-content: center;
        transition: all 0.2s; color: white;
      }
      .odin-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .odin-btn-primary { background: var(--accent-primary); }
      .odin-btn-success { background: var(--accent-success); }
      .odin-btn-warning { background: var(--accent-warning); }
      .odin-btn-danger { background: var(--accent-danger); }
      .odin-btn-secondary { background: rgba(255,255,255,0.1); color: var(--text-primary); }
      .odin-btn-sm { padding: 4px 8px; font-size: 11px; }

      .odin-input, .odin-select {
        background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary);
        padding: 8px; border-radius: 4px; width: 100%; box-sizing: border-box; margin-bottom: 8px;
      }

      /* TABLES */
      .odin-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .odin-table th { text-align: left; color: var(--text-muted); padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); }
      .odin-table td { padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); }
      .odin-table tr:hover { background: rgba(255,255,255,0.02); }

      /* TOGGLE BUTTON */
      .odin-toggle-btn {
        position: fixed; z-index: 2147483647; width: 54px; height: 54px;
        border-radius: 12px; background: linear-gradient(135deg, #00c896 0%, #00b585 100%);
        border: none; color: white; cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        pointer-events: auto; transition: transform 0.2s;
      }
      .odin-toggle-btn:hover { transform: scale(1.05); }
      .odin-toggle-btn.alert { animation: pulse-red 2s infinite; background: var(--accent-danger); }

      @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(229, 62, 62, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(229, 62, 62, 0); } 100% { box-shadow: 0 0 0 0 rgba(229, 62, 62, 0); } }

      .odin-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
      .badge-green { background: rgba(72, 187, 120, 0.2); color: #48bb78; }
      .badge-red { background: rgba(229, 62, 62, 0.2); color: #fc8181; }
      .badge-yellow { background: rgba(237, 137, 54, 0.2); color: #ed8936; }
      
      .odin-resize-handle { position: absolute; bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; }
    `;

    // ============================================
    // SHADOW DOM MOUNTING
    // ============================================
    let uiMount, uiShadow, uiRoot;

    function ensureMount() {
      if (uiRoot && uiRoot.isConnected) return;
      
      // Host element attached to body
      uiMount = document.createElement('div');
      uiMount.id = 'odin-tools-host';
      uiMount.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
      
      // Shadow DOM
      uiShadow = uiMount.attachShadow({ mode: 'open' });
      
      // Style injection
      const style = document.createElement('style');
      style.textContent = STYLES;
      uiShadow.appendChild(style);
      
      // Root container for our elements
      uiRoot = document.createElement('div');
      uiRoot.id = 'odin-root';
      uiShadow.appendChild(uiRoot);
      
      document.body.appendChild(uiMount);
      
      // Re-render if state was open
      if (state.isOpen) renderOverlay();
      renderToggleButton();
    }

    // ============================================
    // CORE RENDERERS
    // ============================================

    function renderToggleButton() {
      const existing = uiRoot.querySelector('#odin-toggle');
      if (existing) existing.remove();

      const btn = document.createElement('button');
      btn.id = 'odin-toggle';
      btn.className = 'odin-toggle-btn';
      btn.innerHTML = `<div style="font-size: 24px;">🐺</div><div style="font-size: 9px; font-weight: 600;">ODIN</div>`;
      
      // Logic for alert state
      const chainRisk = spear?.ChainRiskService?.getRisk();
      if (chainRisk?.level === 'critical' || chainRisk?.level === 'warning') {
        btn.classList.add('alert');
      }

      // Responsive positioning logic (bottom left default)
      btn.style.bottom = '20px';
      btn.style.left = '20px';

      btn.addEventListener('click', () => toggleOverlay());
      uiRoot.appendChild(btn);
    }

    function toggleOverlay(force) {
      state.isOpen = force !== undefined ? force : !state.isOpen;
      if (state.isOpen) renderOverlay();
      else {
        const overlay = uiRoot.querySelector('.odin-overlay');
        if (overlay) overlay.remove();
      }
      saveState();
    }

    function renderOverlay() {
      const existing = uiRoot.querySelector('.odin-overlay');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'odin-overlay';
      overlay.style.width = `${state.size.width}px`;
      overlay.style.height = `${state.size.height}px`;
      overlay.style.top = `${state.position.top}px`;
      
      // Handle side positioning
      if (state.position.side === 'left') overlay.style.left = '80px';
      else overlay.style.right = '80px'; // Default to right

      // 1. Header
      const header = document.createElement('div');
      header.className = 'odin-header';
      header.innerHTML = `
        <div class="odin-header-title">
           <span>🐺 Odin Tools</span>
           ${spear?.WarConfigService?.isWarActive() ? '<span class="odin-badge badge-red">WAR</span>' : ''}
        </div>
        <button class="odin-header-close">✕</button>
      `;
      header.querySelector('.odin-header-close').addEventListener('click', () => toggleOverlay(false));
      makeDraggable(header, overlay);

      // 2. Tabs
      const tabsEl = document.createElement('div');
      tabsEl.className = 'odin-tabs';
      TABS.forEach(tab => {
        if (tab.role === 'leader' && !access.canWriteLeaderOps()) return; // Permission check
        const btn = document.createElement('button');
        btn.className = `odin-tab ${state.activeTab === tab.id ? 'active' : ''}`;
        btn.innerHTML = `${tab.icon} <span>${tab.label}</span>`;
        btn.onclick = () => {
          state.activeTab = tab.id;
          saveState();
          renderOverlay(); // Re-render full overlay to switch content
        };
        tabsEl.appendChild(btn);
      });

      // 3. Content
      const contentEl = document.createElement('div');
      contentEl.className = 'odin-content';
      
      // Route to correct renderer
      switch (state.activeTab) {
        case 'war-room': renderWarRoom(contentEl); break;
        case 'targets': renderTargets(contentEl); break;
        case 'chain': renderChain(contentEl); break;
        case 'retals': renderRetals(contentEl); break;
        case 'faction': renderFaction(contentEl); break;
        case 'leadership': renderLeadership(contentEl); break;
        case 'settings': renderSettings(contentEl); break;
        default: contentEl.innerHTML = `<div style="padding:20px; text-align:center;">Module ${state.activeTab} not found.</div>`;
      }

      // 4. Resize Handle
      const resize = document.createElement('div');
      resize.className = 'odin-resize-handle';
      makeResizable(resize, overlay);

      overlay.appendChild(header);
      overlay.appendChild(tabsEl);
      overlay.appendChild(contentEl);
      overlay.appendChild(resize);

      uiRoot.appendChild(overlay);
    }

    // ============================================
    // MODULE RENDERERS
    // ============================================

    // --- 1. WAR ROOM ---
    function renderWarRoom(root) {
      const config = spear?.WarConfigService?.getConfig() || {};
      const claims = spear?.ClaimsService?.getActiveClaims() || [];
      const stats = spear?.AttackLogService?.getStats() || {};
      const chain = spear?.ChainMonitorService?.getState() || {};
      const risk = spear?.ChainRiskService?.getRisk() || {};

      // Status Section
      const statusHtml = `
        <div class="odin-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
             <span style="font-weight:700; font-size:18px; color:${config.isActive ? 'var(--accent-success)' : 'var(--text-muted)'}">
               ${config.isActive ? 'WAR ACTIVE' : 'STANDBY'}
             </span>
             ${config.enemyFactionName ? `<span class="odin-badge badge-red">VS ${config.enemyFactionName}</span>` : ''}
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; text-align:center;">
             <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:4px;">
                <div style="font-size:18px; font-weight:700;">${chain.current || 0}</div>
                <div style="font-size:10px; color:var(--text-muted);">Chain</div>
             </div>
             <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:4px;">
                <div style="font-size:18px; font-weight:700; color:${getRiskColor(risk.level)}">${formatTime(chain.timeout)}</div>
                <div style="font-size:10px; color:var(--text-muted);">Timeout</div>
             </div>
             <div style="background:rgba(0,0,0,0.3); padding:8px; border-radius:4px;">
                <div style="font-size:18px; font-weight:700;">${claims.length}</div>
                <div style="font-size:10px; color:var(--text-muted);">Claims</div>
             </div>
          </div>
        </div>
      `;

      // Active Claims List
      let claimsHtml = '<div class="odin-section-title">Active Claims</div>';
      if (claims.length === 0) claimsHtml += '<div class="odin-card" style="text-align:center; color:var(--text-muted);">No active claims</div>';
      else {
        claimsHtml += claims.map(c => {
          const timeLeft = Math.max(0, c.expiresAt - Date.now()) / 1000;
          return `
            <div class="odin-card" style="display:flex; justify-content:space-between; align-items:center;">
               <div>
                 <div style="font-weight:600; color:var(--accent-primary);">Target #${c.targetId}</div>
                 <div style="font-size:11px; color:var(--text-muted);">by ${c.attackerName}</div>
               </div>
               <div class="odin-badge ${timeLeft < 60 ? 'badge-red' : 'badge-green'}">${formatTime(timeLeft)}</div>
            </div>
          `;
        }).join('');
      }

      root.innerHTML = statusHtml + claimsHtml;
      
      // Quick Actions
      const actions = document.createElement('div');
      actions.innerHTML = `<div class="odin-section-title" style="margin-top:16px;">Actions</div>`;
      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex'; btnRow.style.gap = '8px';

      const refreshBtn = createBtn('Refresh', 'primary', () => { 
        spear?.ChainMonitorService?.refreshNow(); 
        renderOverlay(); 
      });
      
      const clearBtn = createBtn('Clear Claims', 'warning', () => {
        if(confirm('Clear all local claims?')) spear?.ClaimsService?.clearAllClaims();
        renderOverlay();
      });

      btnRow.appendChild(refreshBtn);
      btnRow.appendChild(clearBtn);
      actions.appendChild(btnRow);
      root.appendChild(actions);
    }

    // --- 2. TARGETS (Unified) ---
    function renderTargets(root) {
      // Toggle Switch
      const mode = state.targetsMode || 'war'; // 'war' or 'personal'
      const toggleRow = document.createElement('div');
      toggleRow.style.display = 'flex'; toggleRow.style.gap = '8px'; toggleRow.style.marginBottom = '12px';
      
      const warBtn = createBtn('War Targets', mode === 'war' ? 'primary' : 'secondary', () => { state.targetsMode = 'war'; renderOverlay(); });
      const personalBtn = createBtn('Personal List', mode === 'personal' ? 'primary' : 'secondary', () => { state.targetsMode = 'personal'; renderOverlay(); });
      
      toggleRow.appendChild(warBtn); toggleRow.appendChild(personalBtn);
      root.appendChild(toggleRow);

      if (mode === 'war') {
        // WAR TARGETS LOGIC
        // Fetch enemy members if we have an enemy set
        const enemyId = spear?.WarConfigService?.getConfig()?.enemyFactionId;
        
        if (!enemyId) {
          root.innerHTML += `<div class="odin-card" style="text-align:center;">No enemy faction set.<br>Go to Leadership tab to configure.</div>`;
          return;
        }

        // We would typically cache this list, but for simplicity we'll check FactionService
        // Note: In a real app we'd need to fetch the enemy faction data explicitly.
        // Assuming FactionService might hold current enemy data if "switched" or separate service.
        // For this single-file, we'll placeholder the fetch logic:
        root.innerHTML += `<div class="odin-card" style="text-align:center; padding:20px;">
           <div>Fetching enemy roster (ID: ${enemyId})...</div>
           <div style="font-size:11px; color:var(--text-muted); margin-top:8px;">
             (Note: Auto-population requires FactionService to fetch external faction, which is a future backend expansion. 
             Currently displaying placeholder logic.)
           </div>
        </div>`;
      } else {
        // PERSONAL TARGETS LOGIC
        const list = state.personalTargets || [];
        
        // Input Form
        const form = document.createElement('div');
        form.className = 'odin-card';
        form.innerHTML = `
          <div style="display:flex; gap:8px;">
            <input type="number" id="pt-id" class="odin-input" placeholder="ID" style="flex:1; margin:0;">
            <input type="text" id="pt-name" class="odin-input" placeholder="Name" style="flex:2; margin:0;">
            <button id="pt-add" class="odin-btn odin-btn-success">Add</button>
          </div>
        `;
        form.querySelector('#pt-add').onclick = () => {
          const id = form.querySelector('#pt-id').value;
          const name = form.querySelector('#pt-name').value || `Target ${id}`;
          if (id) {
            state.personalTargets.push({ id, name, level: '?' });
            storage.setJSON('odin_personal_targets', state.personalTargets);
            renderOverlay();
          }
        };
        root.appendChild(form);

        // List
        if (list.length === 0) {
          root.innerHTML += `<div class="odin-card" style="text-align:center;">No personal targets.</div>`;
        } else {
          const table = document.createElement('table');
          table.className = 'odin-table';
          table.innerHTML = `<thead><tr><th>Name</th><th>ID</th><th>Actions</th></tr></thead><tbody></tbody>`;
          const tbody = table.querySelector('tbody');
          
          list.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td><a href="https://www.torn.com/profiles.php?XID=${t.id}" target="_blank" style="color:var(--accent-primary); text-decoration:none;">${t.name}</a></td>
              <td>${t.id}</td>
              <td style="display:flex; gap:6px;">
                 <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${t.id}" target="_blank" class="odin-btn odin-btn-danger odin-btn-sm">⚔️</a>
                 <button class="odin-btn odin-btn-secondary odin-btn-sm del-btn">🗑️</button>
              </td>
            `;
            tr.querySelector('.del-btn').onclick = () => {
               state.personalTargets = state.personalTargets.filter(x => x.id !== t.id);
               storage.setJSON('odin_personal_targets', state.personalTargets);
               renderOverlay();
            };
            tbody.appendChild(tr);
          });
          root.appendChild(table);
        }
      }
    }

    // --- 3. CHAIN ---
    function renderChain(root) {
      const c = spear?.ChainMonitorService?.getState() || {};
      const risk = spear?.ChainRiskService?.getRisk() || {};
      const watcher = spear?.WatchersService?.getCurrentShift();

      // Big Timer
      const timerCard = document.createElement('div');
      timerCard.className = 'odin-card';
      timerCard.style.textAlign = 'center';
      timerCard.style.background = c.timeout < 30 ? 'rgba(229, 62, 62, 0.2)' : 'var(--bg-panel)';
      timerCard.innerHTML = `
        <div style="font-size:48px; font-weight:800; color:${getRiskColor(risk.level)}">${formatTime(c.timeout)}</div>
        <div style="font-size:14px; color:var(--text-muted);">Current Chain: <span style="color:white; font-weight:bold;">${c.current}</span></div>
        ${c.cooldown ? `<div style="color:var(--accent-warning); margin-top:8px;">Cooldown: ${formatTime(c.cooldown)}</div>` : ''}
      `;
      root.appendChild(timerCard);

      // Watcher Info
      const watchCard = document.createElement('div');
      watchCard.className = 'odin-card';
      watchCard.innerHTML = `
        <div class="odin-section-title">Watcher Schedule</div>
        ${watcher ? `
          <div style="color:var(--accent-success); font-weight:bold;">🟢 On Duty: ${watcher.watcherName}</div>
          <div style="font-size:11px; color:var(--text-muted);">Ends: ${new Date(watcher.endTime).toLocaleTimeString()}</div>
        ` : `<div style="color:var(--text-muted);">No active watcher.</div>`}
      `;
      root.appendChild(watchCard);

      // Controls
      const controls = document.createElement('div');
      controls.style.display = 'flex'; controls.style.gap = '8px'; controls.style.marginTop = '12px';
      controls.appendChild(createBtn('Start Monitor', 'success', () => spear?.ChainMonitorService?.startPolling(10000)));
      controls.appendChild(createBtn('Stop', 'danger', () => spear?.ChainMonitorService?.stopPolling()));
      root.appendChild(controls);
    }

    // --- 4. FACTION ---
    function renderFaction(root) {
      const summary = spear?.FactionService?.getSummary();
      
      if (!summary) {
        root.innerHTML = `<div class="odin-card" style="text-align:center;">
          <p>No faction data loaded.</p>
          <button id="load-fac" class="odin-btn odin-btn-primary">Load My Faction</button>
        </div>`;
        root.querySelector('#load-fac').onclick = async () => {
           try { await spear?.FactionService?.refreshFaction(); renderOverlay(); }
           catch(e) { alert('Failed to load: ' + e.message); }
        };
        return;
      }

      root.innerHTML = `
        <div class="odin-card">
          <div style="font-size:20px; font-weight:bold; color:var(--accent-primary);">${summary.name} [${summary.tag}]</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;">
             <div><div style="color:var(--text-muted); font-size:11px;">Respect</div><div>${summary.respect}</div></div>
             <div><div style="color:var(--text-muted); font-size:11px;">Members</div><div>${summary.memberCount}</div></div>
             <div><div style="color:var(--text-muted); font-size:11px;">Best Chain</div><div>${summary.bestChain}</div></div>
             <div><div style="color:var(--text-muted); font-size:11px;">Rank</div><div>${summary.rank?.position || 'N/A'}</div></div>
          </div>
        </div>
      `;

      // Simple Roster Table
      const members = spear?.FactionService?.getMembers() || [];
      const table = document.createElement('table');
      table.className = 'odin-table';
      table.innerHTML = `<thead><tr><th>Name</th><th>Lvl</th><th>Status</th></tr></thead>`;
      const tbody = document.createElement('tbody');
      
      // Sort by level desc
      members.sort((a,b) => b.level - a.level).forEach(m => {
         const tr = document.createElement('tr');
         const statusColor = (m.status?.state === 'Hospital') ? 'var(--accent-danger)' : 'var(--accent-success)';
         tr.innerHTML = `
           <td>${m.name} <span style="font-size:10px; color:var(--text-muted);">[${m.id}]</span></td>
           <td>${m.level}</td>
           <td style="color:${statusColor}">${m.status?.state || 'Okay'}</td>
         `;
         tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      root.appendChild(table);
    }

    // --- 5. LEADERSHIP (Gated) ---
    function renderLeadership(root) {
      if (!access.canWriteLeaderOps()) {
        root.innerHTML = `<div class="odin-card" style="color:var(--accent-danger); text-align:center;">⛔ Access Denied</div>`;
        return;
      }

      const warConfig = spear?.WarConfigService?.getConfig() || {};

      root.innerHTML = `
        <div class="odin-section-title">War Configuration</div>
        <div class="odin-card">
          <label style="font-size:11px; color:var(--text-muted);">Enemy Faction ID</label>
          <input type="number" id="enemy-id" class="odin-input" value="${warConfig.enemyFactionId || ''}">
          
          <label style="font-size:11px; color:var(--text-muted);">War Type</label>
          <select id="war-type" class="odin-select">
            <option value="chain" ${warConfig.warType === 'chain' ? 'selected' : ''}>Chain</option>
            <option value="ranked" ${warConfig.warType === 'ranked' ? 'selected' : ''}>Ranked</option>
            <option value="territory" ${warConfig.warType === 'territory' ? 'selected' : ''}>Territory</option>
          </select>

          <label style="font-size:11px; color:var(--text-muted);">Rules of Engagement (Note)</label>
          <textarea id="roe-note" class="odin-input" rows="3" placeholder="Enter instructions for members..."></textarea>

          <button id="save-conf" class="odin-btn odin-btn-success" style="width:100%;">Save Configuration</button>
        </div>

        <div class="odin-section-title">Management</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
           <button id="clear-hist" class="odin-btn odin-btn-warning">Clear History</button>
           <button id="reset-data" class="odin-btn odin-btn-danger">Reset All Data</button>
        </div>
      `;

      root.querySelector('#save-conf').onclick = () => {
         const id = root.querySelector('#enemy-id').value;
         spear?.WarConfigService?.setEnemy(id, `Faction ${id}`); // Simplified name
         spear?.WarConfigService?.updateConfig({ 
            warType: root.querySelector('#war-type').value 
         });
         // Save ROE note would go to FactionService in full backend, simulated here
         alert('Saved.');
      };
    }

    // --- 6. SETTINGS ---
    function renderSettings(root) {
      const settings = storage.getJSON('odin_settings') || { tornApiKey: '' };
      
      root.innerHTML = `
        <div class="odin-section-title">API Keys</div>
        <div class="odin-card">
          <label style="font-size:11px; color:var(--text-muted);">Torn API Key</label>
          <input type="password" id="api-key" class="odin-input" value="${settings.tornApiKey || ''}">
          <button id="validate-key" class="odin-btn odin-btn-primary">Validate & Save</button>
          <div id="key-status" style="font-size:11px; margin-top:8px;"></div>
        </div>

        <div class="odin-section-title">Features</div>
        <div class="odin-card">
           <label style="display:flex; gap:8px; align-items:center;">
             <input type="checkbox" id="chk-anim" checked> Enable Animations
           </label>
           <label style="display:flex; gap:8px; align-items:center; margin-top:8px;">
             <input type="checkbox" id="chk-freki" checked> Show Freki Scores
           </label>
        </div>
      `;

      root.querySelector('#validate-key').onclick = async () => {
         const key = root.querySelector('#api-key').value;
         const stat = root.querySelector('#key-status');
         stat.textContent = 'Validating...';
         try {
           if(api.validateTornApiKey) {
             const res = await api.validateTornApiKey(key);
             stat.textContent = `Success! Access: ${res.access_type}`;
             stat.style.color = 'var(--accent-success)';
             storage.setJSON('odin_settings', { ...settings, tornApiKey: key });
             api.setTornApiKey(key);
           } else {
             stat.textContent = 'API Module not loaded.';
           }
         } catch(e) {
           stat.textContent = 'Error: ' + e.message;
           stat.style.color = 'var(--accent-danger)';
         }
      };
    }
    
    // --- 7. RETALS ---
    function renderRetals(root) {
        const candidates = spear?.RetalService?.getCandidates() || [];
        if (candidates.length === 0) {
            root.innerHTML = `<div class="odin-card" style="text-align:center; color:var(--text-muted);">No retaliation candidates.</div>`;
            return;
        }
        
        const list = document.createElement('div');
        candidates.forEach(c => {
            const card = document.createElement('div');
            card.className = 'odin-card';
            card.innerHTML = `
               <div style="display:flex; justify-content:space-between;">
                  <span style="font-weight:bold; color:var(--accent-warning);">${c.attackerName} [${c.attackerLevel}]</span>
                  <span style="font-size:10px; color:var(--text-muted);">${formatTime((Date.now() - c.lastAttack)/1000)} ago</span>
               </div>
               <div style="margin-top:8px; display:flex; gap:8px;">
                  <a href="https://www.torn.com/loader.php?sid=attack&user2ID=${c.attackerId}" target="_blank" class="odin-btn odin-btn-danger odin-btn-sm" style="flex:1;">Attack</a>
                  <button class="odin-btn odin-btn-secondary odin-btn-sm dismiss-btn">Dismiss</button>
               </div>
            `;
            card.querySelector('.dismiss-btn').onclick = () => {
                spear?.RetalService?.removeCandidate(c.attackerId);
                renderOverlay();
            };
            list.appendChild(card);
        });
        root.appendChild(list);
    }

    // ============================================
    // UTILS & HELPERS
    // ============================================

    function createBtn(text, variant, onClick) {
      const btn = document.createElement('button');
      btn.className = `odin-btn odin-btn-${variant}`;
      btn.textContent = text;
      btn.onclick = onClick;
      return btn;
    }

    function formatTime(sec) {
      if (sec < 0) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function getRiskColor(level) {
      if(level === 'critical') return 'var(--accent-danger)';
      if(level === 'warning') return 'var(--accent-warning)';
      return 'var(--text-primary)';
    }

    function saveState() {
      try {
        storage.setJSON('odin_ui_state', state);
      } catch (e) {}
    }

    function makeDraggable(handle, target) {
      let isDown = false, offX, offY;
      handle.addEventListener('mousedown', e => {
        isDown = true;
        offX = e.clientX - target.offsetLeft;
        offY = e.clientY - target.offsetTop;
      });
      document.addEventListener('mousemove', e => {
        if (!isDown) return;
        target.style.left = 'auto'; // Disable flex centering or right-align
        target.style.right = 'auto';
        target.style.top = (e.clientY - offY) + 'px';
        target.style.left = (e.clientX - offX) + 'px';
      });
      document.addEventListener('mouseup', () => { 
        if(isDown) { isDown = false; state.position = { top: parseInt(target.style.top), side: 'left' }; saveState(); } 
      });
    }

    function makeResizable(handle, target) {
      let isDown = false, startX, startY, startW, startH;
      handle.addEventListener('mousedown', e => {
        e.stopPropagation(); isDown = true;
        startX = e.clientX; startY = e.clientY;
        startW = parseInt(window.getComputedStyle(target).width);
        startH = parseInt(window.getComputedStyle(target).height);
      });
      document.addEventListener('mousemove', e => {
        if (!isDown) return;
        target.style.width = (startW + e.clientX - startX) + 'px';
        target.style.height = (startH + e.clientY - startY) + 'px';
      });
      document.addEventListener('mouseup', () => { 
         if(isDown) { isDown = false; state.size = { width: parseInt(target.style.width), height: parseInt(target.style.height) }; saveState(); }
      });
    }

    // ============================================
    // PROFILE INJECTION (Add to Targets)
    // ============================================
    function checkProfileInjection() {
      // Check if on profile page
      if (!window.location.href.includes('profiles.php')) return;
      
      const checkDom = setInterval(() => {
        const header = document.querySelector('.profile-wrapper'); // Selector might vary by Torn updates
        if (header && !document.getElementById('odin-add-target')) {
          // Attempt to find user ID from URL or DOM
          const urlParams = new URLSearchParams(window.location.search);
          const uid = urlParams.get('XID');
          
          if(uid) {
             const btn = document.createElement('button');
             btn.id = 'odin-add-target';
             btn.textContent = '+ Odin Target';
             btn.style.cssText = 'margin-left:10px; padding:4px 8px; background:#667eea; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;';
             btn.onclick = () => {
                const name = document.querySelector('a.user-name')?.textContent?.trim() || `Player ${uid}`;
                state.personalTargets.push({ id: uid, name, level: '?' });
                storage.setJSON('odin_personal_targets', state.personalTargets);
                btn.textContent = '✓ Saved';
                btn.style.background = '#48bb78';
             };
             
             // Try to append to name container
             const nameBox = document.querySelector('.profile-container .basic-information .user-information .name');
             if(nameBox) nameBox.appendChild(btn);
             else header.prepend(btn); // Fallback
          }
        }
      }, 1000);
    }

    // ============================================
    // INIT
    // ============================================
    function init() {
      log('[UI Combined] Initializing v' + UI_VERSION);
      
      // Mount Shadow DOM
      ensureMount();
      
      // Start Event Listeners
      nexus.on('CHAIN_TICK', () => { if(state.isOpen && state.activeTab === 'chain') renderOverlay(); });
      nexus.on('CLAIM_MADE', () => { if(state.isOpen && state.activeTab === 'war-room') renderOverlay(); });
      nexus.on('FACTION_UPDATED', () => { if(state.isOpen && state.activeTab === 'faction') renderOverlay(); });
      
      // Profile Injection
      checkProfileInjection();
    }

    return { id: 'ui-combined', init };
  });
})();
