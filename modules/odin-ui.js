// ==OdinModule==
// @name        Odin-ui.js
// @id          odin-ui-styles
// @version     4.0.10
// ==/OdinModule==
ĺ
(function () {
  'use strict';

  window.OdinModules = window.OdinModules || [];

  window.OdinModules.push(function OdinUltimateUIModule(ctx) {
    const nexus = (ctx && ctx.nexus) || window.Nexus || { emit(){}, on(){}, off(){} };

    let initialized = false;

    function init() {
      if (initialized) return;
      initialized = true;
      
        // =========================
  // 1) STYLES
  // =========================
  GM_addStyle(`
    :root {
      --obsidian: #050608;
      --slate: #0f1217;
      --odin-cyan: #00f2ff;
      --freki-gold: #e6b022;
      --berserker-red: #ff3333;
      --valhalla-green: #00ffa3;
      --text-main: #f3f4f6;
      --text-dim: #9ca3af;
      --glass: rgba(5, 6, 8, 0.98);
      --glass-2: rgba(5, 6, 8, 0.86);
      --border-heavy: 2px solid rgba(0, 242, 255, 0.5);
      --border-cell: 1px solid rgba(255, 255, 255, 0.15);
      --border-subtle: 1px solid rgba(255, 255, 255, 0.10);
      --radius: 4px;
      --font-size-xs: 10px;
      --font-size-sm: 11px;
      --font-size-md: 13px;
      --shadow-cyan: 0 0 12px rgba(0, 242, 255, 0.55);
      --shadow-deep: 0 0 60px rgba(0,0,0,0.98);
    }

    #odin-trigger {
      position: fixed;
      bottom: 15px; left: 15px;
      width: 28px; height: 28px;
      background: var(--obsidian);
      border: 1px solid var(--odin-cyan);
      border-radius: 2px;
      z-index: 10001;
      cursor: pointer;
      box-shadow: var(--shadow-cyan);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--odin-cyan);
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    #odin-wrapper {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 410px; height: 760px;
      min-width: 340px; min-height: 520px;
      max-width: 95vw; max-height: 95vh;
      background: var(--glass);
      z-index: 10000;
      display: none;
      flex-direction: column;
      color: var(--text-main);
      font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
      backdrop-filter: blur(25px);
      border: var(--border-heavy);
      border-radius: var(--radius);
      box-shadow: var(--shadow-deep);
      overflow: hidden;
      box-sizing: border-box;
      contain: content;
    }

    @media (max-width: 600px) {
      #odin-wrapper {
        width: 95vw !important;
        height: 88vh !important;
        min-width: 0 !important;
        min-height: 0 !important;
        top: 50% !important;
        left: 50% !important;
      }
    }

    #odin-hud {
      padding: 12px 14px;
      border-bottom: 2px solid rgba(0, 242, 255, 0.35);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: var(--font-size-md);
      letter-spacing: 1.4px;
      color: var(--odin-cyan);
      background: rgba(0,0,0,0.85);
      cursor: grab;
      font-weight: 800;
      flex-shrink: 0;
      user-select: none;
      touch-action: none;
    }

    #odin-hud:active { cursor: grabbing; }

    #odin-title {
      display: flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: calc(100% - 96px);
    }

    #odin-status-pill {
      font-size: var(--font-size-xs);
      letter-spacing: 0.8px;
      padding: 2px 6px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      color: var(--text-dim);
      background: rgba(255,255,255,0.04);
      text-transform: uppercase;
      flex: 0 0 auto;
    }

    #odin-close, #odin-minimize {
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 2px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: var(--text-main);
      font-size: 12px;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }
    #odin-close:hover, #odin-minimize:hover {
      border-color: rgba(0, 242, 255, 0.35);
      box-shadow: 0 0 10px rgba(0, 242, 255, 0.25);
      color: var(--odin-cyan);
    }

    #odin-main-content {
      flex: 1;
      overflow: auto;
      padding: 14px;
      scrollbar-width: thin;
      scrollbar-color: var(--odin-cyan) transparent;
      background: linear-gradient(180deg, rgba(0,0,0,0.00), rgba(0,0,0,0.25));
    }

    #odin-main-content::-webkit-scrollbar { width: 8px; }
    #odin-main-content::-webkit-scrollbar-thumb { background: rgba(0, 242, 255, 0.35); border-radius: 10px; }
    #odin-main-content::-webkit-scrollbar-track { background: transparent; }

    .odin-card {
      background: rgba(255,255,255,0.03);
      border: var(--border-cell);
      padding: 14px;
      margin-bottom: 14px;
      border-radius: 3px;
    }

    .card-header {
      font-size: var(--font-size-sm);
      color: var(--odin-cyan);
      margin-bottom: 10px;
      border-bottom: 1px solid rgba(0,242,255,0.25);
      padding-bottom: 6px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .subtle {
      color: var(--text-dim);
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: none;
      font-size: var(--font-size-xs);
      border: 0;
      padding: 0;
      margin: 0;
    }

    .data-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 8px;
      font-size: var(--font-size-sm);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      padding-bottom: 6px;
    }
    .data-row:last-child { border-bottom: 0; padding-bottom: 0; margin-bottom: 0; }

    .data-label { color: var(--text-dim); }
    .data-val { color: var(--text-main); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: var(--font-size-xs);
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.04);
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.7px;
      white-space: nowrap;
    }
    .badge.ok { border-color: rgba(0,255,163,0.35); color: var(--valhalla-green); background: rgba(0,255,163,0.06); }
    .badge.warn { border-color: rgba(230,176,34,0.40); color: var(--freki-gold); background: rgba(230,176,34,0.06); }
    .badge.bad { border-color: rgba(255,51,51,0.40); color: var(--berserker-red); background: rgba(255,51,51,0.06); }
    .badge.cyan { border-color: rgba(0,242,255,0.35); color: var(--odin-cyan); background: rgba(0,242,255,0.06); }

    /* Tables */
    .roster-wrap {
      width: 100%;
      overflow: auto;
      margin: 10px 0 0 0;
      border: var(--border-subtle);
      border-radius: 3px;
      background: rgba(0,0,0,0.25);
    }
    .odin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-size-xs);
      white-space: nowrap;
      min-width: 520px;
    }
    .odin-table th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #12161c;
      color: var(--odin-cyan);
      border: var(--border-cell);
      padding: 9px 8px;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.9px;
      user-select: none;
    }
    .odin-table th.sortable { cursor: pointer; }
    .odin-table th.sortable:hover { background: #171d25; }
    .odin-table td {
      padding: 8px;
      border: var(--border-cell);
      color: var(--text-main);
      vertical-align: middle;
    }
    .odin-table tr:nth-child(even) { background: rgba(255, 255, 255, 0.04); }

    .action-group { display: inline-flex; gap: 4px; align-items: center; }

    /* Progress bars */
    .score-bar { width: 100%; height: 10px; background: rgba(255,255,255,0.08); margin-top: 7px; border-radius: 999px; overflow: hidden; display: flex; }
    .score-friendly { height: 100%; background: var(--odin-cyan); box-shadow: 0 0 6px rgba(0,242,255,0.45); }
    .score-enemy { height: 100%; background: var(--berserker-red); box-shadow: 0 0 6px rgba(255,51,51,0.45); }

    /* Buttons & inputs */
    .odin-btn {
      background: none;
      border: 1px solid var(--odin-cyan);
      color: var(--odin-cyan);
      padding: 8px 10px;
      font-size: 10px;
      cursor: pointer;
      font-weight: 800;
      text-transform: uppercase;
      transition: 0.15s;
      border-radius: 2px;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }
    .odin-btn:hover { background: var(--odin-cyan); color: #000; box-shadow: 0 0 10px rgba(0,242,255,0.35); }
    .odin-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .odin-btn.block { width: 100%; }
    .odin-btn.mini { padding: 4px 7px; font-size: 9px; }

    .btn-claim { border-color: var(--freki-gold); color: var(--freki-gold); }
    .btn-claim:hover { background: var(--freki-gold); color: #000; box-shadow: 0 0 10px rgba(230,176,34,0.30); }
    .btn-med { border-color: var(--valhalla-green); color: var(--valhalla-green); }
    .btn-med:hover { background: var(--valhalla-green); color: #000; box-shadow: 0 0 10px rgba(0,255,163,0.30); }
    .btn-danger { border-color: var(--berserker-red); color: var(--berserker-red); }
    .btn-danger:hover { background: var(--berserker-red); color: #000; box-shadow: 0 0 10px rgba(255,51,51,0.30); }

    .odin-input, .odin-select {
      width: 100%;
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(0,242,255,0.28);
      color: var(--text-main);
      padding: 8px 10px;
      border-radius: 3px;
      font-size: 12px;
      box-sizing: border-box;
      outline: none;
    }
    .odin-input:focus, .odin-select:focus { border-color: rgba(0,242,255,0.55); box-shadow: 0 0 0 2px rgba(0,242,255,0.10); }
    .odin-input::placeholder { color: rgba(156,163,175,0.65); }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }
    @media (max-width: 600px) { .row { grid-template-columns: 1fr; } }

    .hr { height: 1px; background: rgba(255,255,255,0.08); margin: 12px 0; }

    /* Navigation */
    #odin-nav {
      height: 60px;
      background: rgba(0,0,0,0.96);
      display: flex;
      border-top: 1px solid rgba(255,255,255,0.18);
      flex-wrap: wrap;
      flex-shrink: 0;
      user-select: none;
    }
    .nav-item {
      flex: 1 1 33.33%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-dim);
      font-size: 10px;
      cursor: pointer;
      border-bottom: 3px solid transparent;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 1px;
      -webkit-tap-highlight-color: transparent;
    }
    .nav-item.active {
      color: var(--odin-cyan);
      background: rgba(0,242,255,0.14);
      border-bottom-color: var(--odin-cyan);
    }

    /* Resizer */
    #odin-resizer {
      width: 18px; height: 18px;
      position: absolute;
      right: 0; bottom: 0;
      cursor: nwse-resize;
      background: linear-gradient(135deg, transparent 50%, rgba(0,242,255,0.75) 50%);
      opacity: 0.65;
      z-index: 10002;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }

    /* Toasts */
    #odin-toasts {
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 10010;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: min(420px, 92vw);
      font-family: 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif;
    }
    .odin-toast {
      pointer-events: none;
      background: rgba(0,0,0,0.75);
      border: 1px solid rgba(255,255,255,0.14);
      border-left: 3px solid rgba(0,242,255,0.65);
      color: var(--text-main);
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 12px;
      box-shadow: 0 0 24px rgba(0,0,0,0.65);
      backdrop-filter: blur(8px);
    }
    .odin-toast.ok { border-left-color: rgba(0,255,163,0.75); }
    .odin-toast.warn { border-left-color: rgba(230,176,34,0.80); }
    .odin-toast.bad { border-left-color: rgba(255,51,51,0.80); }

    /* Modal */
    #odin-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      z-index: 10004;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 14px;
    }
    #odin-modal {
      width: min(420px, 96vw);
      background: var(--glass-2);
      border: 2px solid rgba(0,242,255,0.45);
      border-radius: 4px;
      box-shadow: 0 0 50px rgba(0,242,255,0.22);
      padding: 14px;
    }
    #odin-modal .card-header { margin-bottom: 8px; }
    #odin-modal small { color: var(--text-dim); }

    /* Heatmap */
    .heatmap {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 4px;
      margin-top: 10px;
    }
    .heatcell {
      height: 16px;
      border-radius: 2px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
      position: relative;
      overflow: hidden;
    }
    .heatcell::after {
      content: '';
      position: absolute;
      inset: 0;
      opacity: 0.65;
      background: linear-gradient(90deg, rgba(0,255,163,0.00), rgba(0,255,163,0.00));
      transition: 0.15s;
    }
    .heatcell.safe::after { background: rgba(0,255,163,0.22); }
    .heatcell.mid::after { background: rgba(230,176,34,0.22); }
    .heatcell.hot::after { background: rgba(255,51,51,0.22); }
    .heatcell:hover { border-color: rgba(0,242,255,0.35); }

    /* Empty + loading */
    .empty {
      padding: 10px;
      border: 1px dashed rgba(255,255,255,0.14);
      border-radius: 4px;
      color: var(--text-dim);
      background: rgba(255,255,255,0.02);
      font-size: 12px;
    }
  `);

  // =========================
  // 2) DOM
  // =========================
  const uiHTML = `
    <div id="odin-trigger" title="Odin Tools">🔱</div>

    <div id="odin-wrapper" aria-hidden="true">
      <div id="odin-hud">
        <div id="odin-title">
          <span>🔱 ODIN_ULTIMATE_V4.0</span>
          <span id="odin-status-pill" class="badge cyan">UI MODE</span>
        </div>
        <div class="action-group">
          <span id="odin-minimize" title="Minimize">—</span>
          <span id="odin-close" title="Close">✖</span>
        </div>
      </div>

      <div id="odin-main-content">

        <section id="pane-war" class="tab-panel">
          <div class="odin-card">
            <div class="card-header">
              <span>War Room Dashboard</span>
              <span class="badge cyan" id="war-connection-badge">OFFLINE</span>
            </div>

            <div class="data-row">
              <span class="data-label">Friendly Score</span>
              <span class="data-val" style="color:var(--odin-cyan)" id="war-friendly-score">14,285 pts</span>
            </div>
            <div class="data-row">
              <span class="data-label">Enemy Score</span>
              <span class="data-val" style="color:var(--berserker-red)" id="war-enemy-score">12,042 pts</span>
            </div>
            <div class="score-bar" aria-label="War score bar">
              <div class="score-friendly" id="war-friendly-bar" style="width: 55%;"></div>
              <div class="score-enemy" id="war-enemy-bar" style="width: 45%;"></div>
            </div>

            <div class="row">
              <button class="odin-btn block" data-action="refresh-war">Refresh</button>
              <button class="odin-btn block btn-claim" data-action="broadcast-chain">Chain Alert</button>
            </div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Chain Monitor</span>
              <span class="badge warn" id="chain-risk-badge">RISK: MED</span>
            </div>
            <div class="data-row">
              <span class="data-label">Our Chain</span>
              <span class="data-val" style="color:var(--odin-cyan)" id="chain-our">482 / 03:12</span>
            </div>
            <div class="data-row">
              <span class="data-label">Enemy Chain</span>
              <span class="data-val" style="color:var(--berserker-red)" id="chain-enemy">215 / 01:45</span>
            </div>
            <div class="data-row">
              <span class="data-label">Recommendation</span>
              <span class="data-val" style="color:var(--freki-gold)" id="chain-rec">High Window</span>
            </div>

            <div class="row">
              <button class="odin-btn block" data-action="open-chain-tab">Open Chain Tab</button>
              <button class="odin-btn block btn-med" data-action="toggle-chain-sim">Simulate</button>
            </div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Active Watchers</span>
              <span class="badge ok" id="watcher-coverage">COVERAGE 67%</span>
            </div>
            <div class="roster-wrap">
              <table class="odin-table" id="watchers-table">
                <thead>
                  <tr>
                    <th>WATCHER</th>
                    <th>SLOT</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div class="row">
              <button class="odin-btn block" data-action="open-schedule-tab">Open Schedule</button>
              <button class="odin-btn block btn-med" data-action="open-scheduler-modal">Sign Up</button>
            </div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Live Claims Feed</span>
              <span class="subtle">Real-time claims (UI prototype)</span>
            </div>
            <div class="roster-wrap">
              <table class="odin-table" id="claims-table">
                <thead>
                  <tr>
                    <th>CLAIMANT</th>
                    <th>TARGET</th>
                    <th>TYPE</th>
                    <th>EXPIRES</th>
                    <th>OPS</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Activity Heatmap</span>
              <span class="badge cyan">7×24</span>
            </div>
            <div class="empty" style="margin-bottom:10px">
              Heatmap is visual-only in this prototype. Cells represent lower-to-higher enemy activity (green → red).
            </div>
            <div class="heatmap" id="heatmap"></div>
          </div>
        </section>

        <section id="pane-targets" class="tab-panel" style="display:none">
          <div class="odin-card">
            <div class="card-header">
              <span>Target Management</span>
              <span class="badge cyan" id="targets-count">0 TARGETS</span>
            </div>

            <div class="row">
              <input class="odin-input" id="target-input" placeholder="Target ID or Profile URL" autocomplete="off">
              <select class="odin-select" id="target-priority">
                <option value="low">Priority: LOW</option>
                <option value="medium" selected>Priority: MEDIUM</option>
                <option value="high">Priority: HIGH</option>
                <option value="critical">Priority: CRITICAL</option>
              </select>
            </div>

            <div class="row">
              <button class="odin-btn block" data-action="add-target">Add Target</button>
              <button class="odin-btn block btn-med" data-action="bulk-score">Bulk Score</button>
            </div>

            <div class="hr"></div>

            <div class="row">
              <select class="odin-select" id="targets-sort">
                <option value="score_desc" selected>Sort: SCORE ↓</option>
                <option value="score_asc">Sort: SCORE ↑</option>
                <option value="level_desc">Sort: LEVEL ↓</option>
                <option value="level_asc">Sort: LEVEL ↑</option>
                <option value="name_asc">Sort: NAME A→Z</option>
              </select>
              <button class="odin-btn block" data-action="clear-targets">Clear</button>
            </div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Targets</span>
              <span class="subtle">Freki score + claim controls (UI prototype)</span>
            </div>
            <div class="roster-wrap">
              <table class="odin-table" id="targets-table">
                <thead>
                  <tr>
                    <th class="sortable" data-sort="name">TARGET</th>
                    <th class="sortable" data-sort="level">LVL</th>
                    <th class="sortable" data-sort="score">FREKI</th>
                    <th>WIN%</th>
                    <th>PRIORITY</th>
                    <th>CLAIM</th>
                    <th>OPS</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div class="empty" id="targets-empty" style="display:none; margin-top:10px;">
              No targets yet. Add a target above (ID or profile URL).
            </div>
          </div>
        </section>

        <section id="pane-analytics" class="tab-panel" style="display:none">
          <div class="odin-card">
            <div class="card-header">
              <span>Session Analytics</span>
              <span class="badge cyan">LOCAL</span>
            </div>

            <div class="data-row"><span class="data-label">Hits Landed</span><span class="data-val" id="stat-hits">142</span></div>
            <div class="data-row"><span class="data-label">Total Respect</span><span class="data-val" id="stat-respect">482.12</span></div>
            <div class="data-row"><span class="data-label">Assists</span><span class="data-val" id="stat-assists">12</span></div>

            <div class="hr"></div>

            <div class="data-row"><span class="data-label">Freki Model</span><span class="data-val">v4.0.0</span></div>
            <div class="data-row"><span class="data-label">Training Samples</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Connection</span><span class="data-val"><span class="badge cyan">UI MODE</span></span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Accuracy Tracker</span>
              <span class="subtle">Prototype metrics</span>
            </div>
            <div class="empty">
              Hook this to your real outcome recorder later. This UI is ready for: win/loss, confidence buckets, and drift graphs.
            </div>
            <div class="row">
              <button class="odin-btn block" data-action="record-win">Record WIN</button>
              <button class="odin-btn block btn-danger" data-action="record-loss">Record LOSS</button>
            </div>
          </div>
        </section>

        <section id="pane-schedule" class="tab-panel" style="display:none">
          <div class="odin-card">
            <div class="card-header">
              <span>Watcher Scheduling</span>
              <span class="badge cyan" id="schedule-week">WEEK</span>
            </div>

            <div class="empty">
              This is the 7-day × 6-slot grid (coverage planning + gap detection). Click a slot to sign up.
            </div>

            <div class="roster-wrap" style="margin-top:10px">
              <table class="odin-table" id="schedule-table">
                <thead>
                  <tr>
                    <th>SLOT</th>
                    <th>MON</th><th>TUE</th><th>WED</th><th>THU</th><th>FRI</th><th>SAT</th><th>SUN</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>

            <div class="row">
              <button class="odin-btn block btn-med" data-action="open-scheduler-modal">Sign Up</button>
              <button class="odin-btn block" data-action="analyze-coverage">Analyze</button>
            </div>

            <div class="hr"></div>

            <div class="data-row"><span class="data-label">Coverage</span><span class="data-val" id="schedule-coverage">—</span></div>
            <div class="data-row"><span class="data-label">Largest Gap</span><span class="data-val" id="schedule-gap">—</span></div>
          </div>
        </section>

        <section id="pane-personal" class="tab-panel" style="display:none">
          <!-- =========================
               USER TAB (REPRESENTATION ONLY)
               ========================= -->

          <div class="odin-card">
            <div class="card-header">
              <span>General Information</span>
              <span class="badge cyan">USER</span>
            </div>
            <div class="data-row"><span class="data-label">Name</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Money</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Points</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Level</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Bank</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Rank</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Life</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Age</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Marital status</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Networth</span><span class="data-val">$—</span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>(Live) Networth</span>
              <span class="badge ok">LIVE</span>
            </div>
            <div class="data-row"><span class="data-label">Cash (Wallet and Vault)</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Points</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Items</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Bazaar</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Stock Market</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Enlisted Cars</span><span class="data-val">$—</span></div>
            <div class="data-row"><span class="data-label">Total</span><span class="data-val" style="color:var(--valhalla-green)">$—</span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Working Stats</span>
              <span class="badge cyan">WORK</span>
            </div>
            <div class="data-row"><span class="data-label">Manual labor</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Intelligence</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Endurance</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Total</span><span class="data-val">—</span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Battle Stats</span>
              <span class="badge warn">BATTLE</span>
            </div>
            <div class="data-row"><span class="data-label">Strength</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Defense</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Speed</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Dexterity</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Total</span><span class="data-val">—</span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Effective Battle Stats</span>
              <span class="badge warn">EBS</span>
            </div>
            <div class="data-row"><span class="data-label">Strength</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Defense</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Speed</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Dexterity</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Total</span><span class="data-val">—</span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Skill Levels</span>
              <span class="badge cyan">SKILLS</span>
            </div>
            <div class="data-row"><span class="data-label">Search for Cash</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Shoplifting</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Graffiti</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Cracking</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Bootlegging</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Hunting</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Burglary</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Card Skimming</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Arson</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Racing</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Scamming</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Hustling</span><span class="data-val">—</span></div>
          </div>

          <!-- Existing Personal prototype blocks preserved below -->
          <div class="odin-card">
            <div class="card-header">
              <span>Favorites</span>
              <span class="subtle">Local list (prototype)</span>
            </div>
            <div class="roster-wrap">
              <table class="odin-table" id="favorites-table">
                <thead><tr><th>TARGET</th><th>FREKI</th><th>OPS</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
            <div class="empty" id="favorites-empty" style="display:none; margin-top:10px;">No favorites yet. Use ⭐ on a target.</div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>AI Recommendations</span>
              <span class="badge warn">FREKI</span>
            </div>
            <div class="empty" id="recs-empty">
              This pane is ready to be wired to Freki results: reasoning bullets, confidence, and difficulty tags.
            </div>
            <div class="row">
              <button class="odin-btn block btn-med" data-action="generate-recs">Generate</button>
              <button class="odin-btn block" data-action="clear-recs">Clear</button>
            </div>
            <div id="recs-list" style="margin-top:10px;"></div>
          </div>
        </section>

        <section id="pane-settings" class="tab-panel" style="display:none">
          <div class="odin-card">
            <div class="card-header">
              <span>Settings & Configuration</span>
              <span class="badge cyan">LOCAL</span>
            </div>

            <div class="row">
              <input type="password" class="odin-input" id="api-torn" placeholder="TORN API KEY (required)" autocomplete="off">
              <input type="password" class="odin-input" id="api-tornstats" placeholder="TORNSTATS KEY (optional)" autocomplete="off">
            </div>
            <div class="row" style="margin-top:10px">
              <input type="password" class="odin-input" id="api-ffscouter" placeholder="FFSCOUTER KEY (optional)" autocomplete="off">
              <select class="odin-select" id="pref-claim-expiry">
                <option value="10">Claim Expiry: 10 min</option>
                <option value="20" selected>Claim Expiry: 20 min</option>
                <option value="30">Claim Expiry: 30 min</option>
                <option value="45">Claim Expiry: 45 min</option>
              </select>
            </div>

            <div class="hr"></div>

            <div class="row">
              <label class="badge cyan" style="justify-content:flex-start; gap:10px; padding:6px 10px; border-radius:4px;">
                <input type="checkbox" id="pref-autoscore" style="accent-color: var(--odin-cyan);">
                Auto-score on profiles
              </label>
              <label class="badge cyan" style="justify-content:flex-start; gap:10px; padding:6px 10px; border-radius:4px;">
                <input type="checkbox" id="pref-showclaims" checked style="accent-color: var(--odin-cyan);">
                Show claim buttons
              </label>
            </div>

            <div class="row" style="margin-top:10px;">
              <button class="odin-btn block btn-med" data-action="save-settings">Save</button>
              <button class="odin-btn block" data-action="reset-settings">Reset</button>
            </div>

            <div class="hr"></div>

            <div class="data-row"><span class="data-label">UI Version</span><span class="data-val">4.0.10</span></div>
            <div class="data-row"><span class="data-label">Mode</span><span class="data-val"><span class="badge cyan">UI Prototype</span></span></div>
          </div>
        </section>

      </div>

      <nav id="odin-nav">
        <div class="nav-item active" data-pane="war">WAR</div>
        <div class="nav-item" data-pane="targets">HIT</div>
        <div class="nav-item" data-pane="analytics">DATA</div>
        <div class="nav-item" data-pane="schedule">TIME</div>
        <div class="nav-item" data-pane="personal">USER</div>
        <div class="nav-item" data-pane="settings">SET</div>
      </nav>

      <div id="odin-resizer" title="Resize"></div>
    </div>

    <div id="odin-modal-backdrop" role="dialog" aria-modal="true" aria-hidden="true">
      <div id="odin-modal">
        <div class="card-header">
          <span id="modal-title">Shield Wall Dispatch</span>
          <span class="badge cyan" id="modal-slot-pill">SLOT</span>
        </div>
        <div class="row">
          <input type="date" class="odin-input" id="modal-date">
          <input type="time" class="odin-input" id="modal-time">
        </div>

        <div class="hr"></div>

        <div class="card-header" style="border-bottom:0; margin-bottom:6px;">
          <span>Freki Recommendations</span>
          <small class="subtle">Prototype</small>
        </div>

        <button class="odin-btn block btn-claim" id="modal-rec-1" style="margin-bottom:10px;">
          GAP: 22 Dec @ 04:00 (High Risk)
        </button>

        <div style="display:flex; gap:10px; margin-top:10px;">
          <button class="odin-btn block" id="modal-cancel">Abort</button>
          <button class="odin-btn block btn-med" id="modal-confirm">Deploy</button>
        </div>
      </div>
    </div>

    <div id="odin-toasts" aria-live="polite" aria-atomic="true"></div>
  `;

  if (document.getElementById('odin-wrapper')) return;
  document.body.insertAdjacentHTML('beforeend', uiHTML);

  // =========================
  // 3) STATE + UTIL
  // =========================
  const LS_KEY = 'odin_ui_proto_v410';
  const now = () => Date.now();

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function loadState() {
    const base = {
      ui: { open: false, minimized: false, x: null, y: null, w: null, h: null },
      settings: {
        api: { torn: '', tornstats: '', ffscouter: '' },
        prefs: { autoscore: false, showclaims: true, claimExpiryMin: 20 }
      },
      targets: [],
      favorites: [],
      claims: [],
      watchers: [],
      schedule: { slots: {} },
      analytics: { hits: 142, respect: 482.12, assists: 12, wins: 0, losses: 0 }
    };
    const fromLS = safeJsonParse(localStorage.getItem(LS_KEY), null);
    if (!fromLS || typeof fromLS !== 'object') return base;

    const merged = base;
    merged.ui = Object.assign({}, base.ui, fromLS.ui || {});
    merged.settings = Object.assign({}, base.settings, fromLS.settings || {});
    merged.settings.api = Object.assign({}, base.settings.api, (fromLS.settings && fromLS.settings.api) || {});
    merged.settings.prefs = Object.assign({}, base.settings.prefs, (fromLS.settings && fromLS.settings.prefs) || {});
    merged.targets = Array.isArray(fromLS.targets) ? fromLS.targets : base.targets;
    merged.favorites = Array.isArray(fromLS.favorites) ? fromLS.favorites : base.favorites;
    merged.claims = Array.isArray(fromLS.claims) ? fromLS.claims : base.claims;
    merged.watchers = Array.isArray(fromLS.watchers) ? fromLS.watchers : base.watchers;
    merged.schedule = Object.assign({}, base.schedule, fromLS.schedule || {});
    merged.schedule.slots = (fromLS.schedule && typeof fromLS.schedule.slots === 'object' && fromLS.schedule.slots) ? fromLS.schedule.slots : {};
    merged.analytics = Object.assign({}, base.analytics, fromLS.analytics || {});
    return merged;
  }

  function saveState() {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function toast(message, kind = 'info') {
    const toasts = document.getElementById('odin-toasts');
    const el = document.createElement('div');
    el.className = 'odin-toast' + (kind === 'ok' ? ' ok' : kind === 'warn' ? ' warn' : kind === 'bad' ? ' bad' : '');
    el.textContent = message;
    toasts.appendChild(el);
    setTimeout(() => { el.remove(); }, 2600);
  }

  function formatMs(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function parseTargetInput(input) {
    const raw = (input || '').trim();
    if (!raw) return null;
    const idMatch = raw.match(/(\d{1,10})/);
    const id = idMatch ? idMatch[1] : null;
    return id ? { id } : null;
  }

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function makeTargetStub(id, priority) {
    const level = randomBetween(10, 100);
    const score = randomBetween(35, 96);
    const win = clamp(Math.round(score + (Math.random() * 10 - 5)), 1, 99);
    const name = 'Target_' + id;
    const difficulty = score >= 85 ? 'easy' : score >= 70 ? 'moderate' : score >= 55 ? 'challenging' : 'difficult';
    return {
      id,
      name,
      level,
      frekiScore: score,
      winPct: win,
      priority,
      difficulty,
      claimedBy: '',
      claimType: '',
      claimExpiresAt: 0,
      createdAt: now()
    };
  }

  // =========================
  // 4) ELEMENTS
  // =========================
  const wrapper = document.getElementById('odin-wrapper');
  const hud = document.getElementById('odin-hud');
  const resizer = document.getElementById('odin-resizer');
  const trigger = document.getElementById('odin-trigger');
  const btnClose = document.getElementById('odin-close');
  const btnMin = document.getElementById('odin-minimize');

  const modalBackdrop = document.getElementById('odin-modal-backdrop');
  const modalSlotPill = document.getElementById('modal-slot-pill');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');
  const modalDate = document.getElementById('modal-date');
  const modalTime = document.getElementById('modal-time');

  const targetsTbody = document.querySelector('#targets-table tbody');
  const targetsEmpty = document.getElementById('targets-empty');
  const targetsCount = document.getElementById('targets-count');
  const favoritesTbody = document.querySelector('#favorites-table tbody');
  const favoritesEmpty = document.getElementById('favorites-empty');

  const claimsTbody = document.querySelector('#claims-table tbody');
  const watchersTbody = document.querySelector('#watchers-table tbody');

  const statHits = document.getElementById('stat-hits');
  const statRespect = document.getElementById('stat-respect');
  const statAssists = document.getElementById('stat-assists');

  const chainEnemy = document.getElementById('chain-enemy');
  const chainRisk = document.getElementById('chain-risk-badge');
  const chainRec = document.getElementById('chain-rec');

  const scheduleTbody = document.querySelector('#schedule-table tbody');
  const scheduleCoverage = document.getElementById('schedule-coverage');
  const scheduleGap = document.getElementById('schedule-gap');

  const recsList = document.getElementById('recs-list');
  const recsEmpty = document.getElementById('recs-empty');

  const heatmap = document.getElementById('heatmap');

  const apiTorn = document.getElementById('api-torn');
  const apiTornStats = document.getElementById('api-tornstats');
  const apiFF = document.getElementById('api-ffscouter');
  const prefAutoscore = document.getElementById('pref-autoscore');
  const prefShowclaims = document.getElementById('pref-showclaims');
  const prefClaimExpiry = document.getElementById('pref-claim-expiry');

  const targetInput = document.getElementById('target-input');
  const targetPriority = document.getElementById('target-priority');
  const targetsSort = document.getElementById('targets-sort');

  // =========================
  // 5) RENDERERS
  // =========================
  function setBadge(el, text, kind) {
    el.textContent = text;
    el.classList.remove('ok', 'warn', 'bad', 'cyan');
    if (kind) el.classList.add(kind);
  }

  function renderTargets() {
    const showClaims = !!state.settings.prefs.showclaims;
    targetsTbody.textContent = '';

    const list = [...state.targets];
    const mode = (targetsSort && targetsSort.value) || 'score_desc';
    list.sort((a, b) => {
      if (mode === 'score_desc') return (b.frekiScore || 0) - (a.frekiScore || 0);
      if (mode === 'score_asc') return (a.frekiScore || 0) - (b.frekiScore || 0);
      if (mode === 'level_desc') return (b.level || 0) - (a.level || 0);
      if (mode === 'level_asc') return (a.level || 0) - (b.level || 0);
      if (mode === 'name_asc') return String(a.name || '').localeCompare(String(b.name || ''));
      return 0;
    });

    for (const t of list) {
      const tr = document.createElement('tr');
      const claimBadge = t.claimedBy
        ? `<span class="badge warn" title="Claim expires in ${formatMs(t.claimExpiresAt - now())}">${t.claimType.toUpperCase()} • ${t.claimedBy}</span>`
        : `<span class="badge cyan">OPEN</span>`;

      const priKind = t.priority === 'critical' ? 'bad' : t.priority === 'high' ? 'warn' : t.priority === 'medium' ? 'cyan' : '';
      const priText = t.priority.toUpperCase();

      const scoreKind = t.frekiScore >= 80 ? 'ok' : t.frekiScore >= 65 ? 'warn' : 'bad';

      tr.innerHTML = `
        <td>${t.name} <span class="subtle">[#${t.id}]</span></td>
        <td>${t.level}</td>
        <td><span class="badge ${scoreKind}">${t.frekiScore}</span></td>
        <td>${t.winPct}%</td>
        <td><span class="badge ${priKind}">${priText}</span></td>
        <td>${claimBadge}</td>
        <td>
          <span class="action-group">
            <button class="odin-btn mini" data-action="attack" data-id="${t.id}">ATTACK</button>
            <button class="odin-btn mini btn-med" data-action="score" data-id="${t.id}">SCORE</button>
            <button class="odin-btn mini" data-action="favorite" data-id="${t.id}">⭐</button>
            <button class="odin-btn mini btn-danger" data-action="remove-target" data-id="${t.id}">X</button>
          </span>
          ${showClaims ? `
          <div class="action-group" style="margin-top:6px;">
            <button class="odin-btn mini btn-claim" data-action="claim" data-type="attack" data-id="${t.id}">C</button>
            <button class="odin-btn mini btn-med" data-action="claim" data-type="med" data-id="${t.id}">M</button>
            <button class="odin-btn mini" data-action="claim" data-type="dib" data-id="${t.id}">D</button>
            <button class="odin-btn mini" data-action="release-claim" data-id="${t.id}">R</button>
          </div>
          ` : ''}
        </td>
      `;
      targetsTbody.appendChild(tr);
    }

    targetsCount.textContent = `${state.targets.length} TARGETS`;
    targetsEmpty.style.display = state.targets.length ? 'none' : 'block';
  }

  function renderFavorites() {
    favoritesTbody.textContent = '';
    for (const id of state.favorites) {
      const t = state.targets.find(x => x.id === id);
      const name = t ? t.name : `Target_${id}`;
      const score = t ? t.frekiScore : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${name} <span class="subtle">[#${id}]</span></td>
        <td>${score}</td>
        <td>
          <span class="action-group">
            <button class="odin-btn mini" data-action="attack" data-id="${id}">ATTACK</button>
            <button class="odin-btn mini btn-danger" data-action="unfavorite" data-id="${id}">REMOVE</button>
          </span>
        </td>
      `;
      favoritesTbody.appendChild(tr);
    }
    favoritesEmpty.style.display = state.favorites.length ? 'none' : 'block';
  }

  function renderClaims() {
    claimsTbody.textContent = '';
    const active = state.claims.filter(c => c.expiresAt > now()).sort((a, b) => a.expiresAt - b.expiresAt);
    for (const c of active) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.claimer}</td>
        <td>${c.targetName} <span class="subtle">[#${c.targetId}]</span></td>
        <td><span class="badge warn">${c.type.toUpperCase()}</span></td>
        <td>${formatMs(c.expiresAt - now())}</td>
        <td>
          <span class="action-group">
            <button class="odin-btn mini" data-action="release-claim" data-id="${c.targetId}">RELEASE</button>
          </span>
        </td>
      `;
      claimsTbody.appendChild(tr);
    }
    if (!active.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5"><div class="empty">No active claims.</div></td>`;
      claimsTbody.appendChild(tr);
    }
  }

  function renderWatchers() {
    watchersTbody.textContent = '';
    const list = state.watchers.slice(0, 12);
    for (const w of list) {
      const badgeClass = w.status === 'LIVE' ? 'ok' : w.status === 'AWAY' ? 'warn' : '';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${w.name}</td>
        <td>${w.slot}</td>
        <td><span class="badge ${badgeClass}">${w.status}</span></td>
        <td><button class="odin-btn mini btn-danger" data-action="remove-watcher" data-id="${w.id}">REMOVE</button></td>
      `;
      watchersTbody.appendChild(tr);
    }
    if (!list.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4"><div class="empty">No active watchers.</div></td>`;
      watchersTbody.appendChild(tr);
    }
  }

  function renderAnalytics() {
    statHits.textContent = String(state.analytics.hits ?? 0);
    statRespect.textContent = String(state.analytics.respect ?? 0);
    statAssists.textContent = String(state.analytics.assists ?? 0);
  }

  function renderHeatmap() {
    heatmap.textContent = '';
    const cells = 84;
    for (let i = 0; i < cells; i++) {
      const d = document.createElement('div');
      const r = Math.random();
      d.className = 'heatcell ' + (r < 0.55 ? 'safe' : r < 0.8 ? 'mid' : 'hot');
      d.title = r < 0.55 ? 'Low activity' : r < 0.8 ? 'Moderate activity' : 'High activity';
      heatmap.appendChild(d);
    }
  }

  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const SLOTS = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];

  function slotKey(dayIdx, slotIdx) {
    return `${dayIdx}:${slotIdx}`;
  }

  function renderSchedule() {
    scheduleTbody.textContent = '';

    for (let s = 0; s < SLOTS.length; s++) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.textContent = SLOTS[s];
      tr.appendChild(th);

      for (let d = 0; d < DAYS.length; d++) {
        const td = document.createElement('td');
        const key = slotKey(d, s);
        const val = state.schedule.slots[key] || '';
        const isGap = !val;
        const badge = isGap ? `<span class="badge bad">GAP</span>` : `<span class="badge ok">${val}</span>`;
        td.innerHTML = `
          <span class="action-group">
            ${badge}
            <button class="odin-btn mini" data-action="pick-slot" data-day="${d}" data-slot="${s}">EDIT</button>
          </span>
        `;
        tr.appendChild(td);
      }
      scheduleTbody.appendChild(tr);
    }

    const total = DAYS.length * SLOTS.length;
    const filled = Object.values(state.schedule.slots).filter(Boolean).length;
    const pct = Math.round((filled / total) * 100);
    scheduleCoverage.textContent = `${filled}/${total} (${pct}%)`;

    const gaps = total - filled;
    scheduleGap.textContent = gaps ? `${gaps} open slots` : 'None';
  }

  function renderChain() {
    const enemyText = chainEnemy.textContent || '';
    const m = enemyText.match(/(\d+)\s*\/\s*(\d{2}:\d{2})/);
    const time = m ? m[2] : '01:45';
    const parts = time.split(':').map(x => parseInt(x, 10));
    const secs = (parts[0] * 60) + parts[1];

    if (secs <= 45) {
      setBadge(chainRisk, 'RISK: HIGH', 'bad');
      chainRec.textContent = 'Immediate push / secure chain';
      chainRec.style.color = 'var(--berserker-red)';
    } else if (secs <= 120) {
      setBadge(chainRisk, 'RISK: MED', 'warn');
      chainRec.textContent = 'Prepare hitters + watchers';
      chainRec.style.color = 'var(--freki-gold)';
    } else {
      setBadge(chainRisk, 'RISK: LOW', 'ok');
      chainRec.textContent = 'Stable window';
      chainRec.style.color = 'var(--valhalla-green)';
    }
  }

  function renderAll() {
    renderTargets();
    renderFavorites();
    renderClaims();
    renderWatchers();
    renderAnalytics();
    renderSchedule();
    renderChain();
  }

  // =========================
  // 6) INTERACTIONS
  // =========================
  let state = loadState();
  let drag = { active: false, shiftX: 0, shiftY: 0 };
  let resize = { active: false, startX: 0, startY: 0, startW: 0, startH: 0 };
  let chainSimTimer = null;
  let claimTickTimer = null;

  function applySavedGeometry() {
    const { x, y, w, h } = state.ui;
    if (typeof w === 'number' && w > 0) wrapper.style.width = w + 'px';
    if (typeof h === 'number' && h > 0) wrapper.style.height = h + 'px';
    if (typeof x === 'number' && typeof y === 'number') {
      wrapper.style.transform = 'none';
      wrapper.style.left = x + 'px';
      wrapper.style.top = y + 'px';
    }
  }

  function openUI() {
    wrapper.style.display = 'flex';
    wrapper.setAttribute('aria-hidden', 'false');
    state.ui.open = true;
    if (state.ui.minimized) minimizeUI(true);
    applySavedGeometry();
    saveState();
  }

  function closeUI() {
    wrapper.style.display = 'none';
    wrapper.setAttribute('aria-hidden', 'true');
    state.ui.open = false;
    state.ui.minimized = false;
    wrapper.style.height = '';
    saveState();
  }

  function minimizeUI(force = false) {
    const isMin = force ? true : !state.ui.minimized;
    state.ui.minimized = isMin;
    if (isMin) {
      wrapper.style.height = '64px';
      toast('Minimized', 'info');
    } else {
      wrapper.style.height = (typeof state.ui.h === 'number' && state.ui.h > 0) ? state.ui.h + 'px' : '';
      toast('Restored', 'ok');
    }
    saveState();
  }

  function switchTab(pane) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => { p.style.display = 'none'; });
    const nav = document.querySelector(`.nav-item[data-pane="${pane}"]`);
    const panel = document.getElementById('pane-' + pane);
    if (nav) nav.classList.add('active');
    if (panel) panel.style.display = 'block';
  }

  function pointFromEvent(e) {
    if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onMove(e) {
    if (drag.active) {
      const p = pointFromEvent(e);
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

      const w = wrapper.offsetWidth;
      const h = wrapper.offsetHeight;

      const nx = clamp(p.x - drag.shiftX, 6, vw - w - 6);
      const ny = clamp(p.y - drag.shiftY, 6, vh - h - 6);

      wrapper.style.left = nx + 'px';
      wrapper.style.top = ny + 'px';

      state.ui.x = nx;
      state.ui.y = ny;
      saveState();
    }

    if (resize.active) {
      const p = pointFromEvent(e);
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

      const nw = clamp(resize.startW + (p.x - resize.startX), 340, vw - 12);
      const nh = clamp(resize.startH + (p.y - resize.startY), 240, vh - 12);

      wrapper.style.width = nw + 'px';
      wrapper.style.height = nh + 'px';

      state.ui.w = nw;
      state.ui.h = nh;
      saveState();
    }
  }

  function onUp() {
    drag.active = false;
    resize.active = false;
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    document.removeEventListener('touchmove', onMove, true);
    document.removeEventListener('touchend', onUp, true);
    document.removeEventListener('touchcancel', onUp, true);
  }

  function startDrag(e) {
    if (state.ui.minimized) return;
    drag.active = true;
    const rect = wrapper.getBoundingClientRect();
    const p = pointFromEvent(e);
    drag.shiftX = p.x - rect.left;
    drag.shiftY = p.y - rect.top;

    wrapper.style.transform = 'none';
    wrapper.style.left = rect.left + 'px';
    wrapper.style.top = rect.top + 'px';

    state.ui.x = rect.left;
    state.ui.y = rect.top;
    saveState();

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    document.addEventListener('touchmove', onMove, true);
    document.addEventListener('touchend', onUp, true);
    document.addEventListener('touchcancel', onUp, true);
  }

  function startResize(e) {
    if (state.ui.minimized) return;
    resize.active = true;
    const p = pointFromEvent(e);
    resize.startX = p.x;
    resize.startY = p.y;
    resize.startW = wrapper.offsetWidth;
    resize.startH = wrapper.offsetHeight;

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
    document.addEventListener('touchmove', onMove, true);
    document.addEventListener('touchend', onUp, true);
    document.addEventListener('touchcancel', onUp, true);
  }

  function openModal(slotLabel) {
    modalSlotPill.textContent = slotLabel || 'SLOT';
    modalBackdrop.style.display = 'flex';
    modalBackdrop.setAttribute('aria-hidden', 'false');

    try {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      modalDate.value = `${yyyy}-${mm}-${dd}`;
    } catch {}
    modalTime.value = '04:00';
  }

  function closeModal() {
    modalBackdrop.style.display = 'none';
    modalBackdrop.setAttribute('aria-hidden', 'true');
  }

  function ensureSeedData() {
    if (!state.watchers.length) {
      state.watchers = [
        { id: 'w1', name: 'Houston', slot: '04:00', status: 'LIVE' },
        { id: 'w2', name: 'Valkyrie', slot: '08:00', status: 'AWAY' },
        { id: 'w3', name: 'Fenrir', slot: '12:00', status: 'LIVE' }
      ];
    }

    if (!state.claims.length) {
      const exp1 = now() + 5 * 60 * 1000;
      const exp2 = now() + 12 * 60 * 1000;
      state.claims = [
        { targetId: '100001', targetName: 'Shadow_Stalker', claimer: 'Houston', type: 'attack', expiresAt: exp1 },
        { targetId: '100002', targetName: 'Steel_Viper', claimer: 'Valkyrie', type: 'med', expiresAt: exp2 }
      ];
    }

    const hasAny = Object.values(state.schedule.slots || {}).some(Boolean);
    if (!hasAny) {
      state.schedule.slots[slotKey(0, 1)] = 'Houston';
      state.schedule.slots[slotKey(3, 3)] = 'Valkyrie';
      state.schedule.slots[slotKey(5, 4)] = 'Fenrir';
    }

    saveState();
  }

  function applySettingsToInputs() {
    apiTorn.value = state.settings.api.torn || '';
    apiTornStats.value = state.settings.api.tornstats || '';
    apiFF.value = state.settings.api.ffscouter || '';
    prefAutoscore.checked = !!state.settings.prefs.autoscore;
    prefShowclaims.checked = !!state.settings.prefs.showclaims;
    prefClaimExpiry.value = String(state.settings.prefs.claimExpiryMin || 20);
  }

  function pullSettingsFromInputs() {
    state.settings.api.torn = (apiTorn.value || '').trim();
    state.settings.api.tornstats = (apiTornStats.value || '').trim();
    state.settings.api.ffscouter = (apiFF.value || '').trim();
    state.settings.prefs.autoscore = !!prefAutoscore.checked;
    state.settings.prefs.showclaims = !!prefShowclaims.checked;
    state.settings.prefs.claimExpiryMin = parseInt(prefClaimExpiry.value, 10) || 20;
  }

  function claimTarget(targetId, type) {
    const t = state.targets.find(x => x.id === targetId);
    if (!t) return;

    if (t.claimedBy && t.claimExpiresAt > now()) {
      toast(`Already claimed by ${t.claimedBy}`, 'warn');
      return;
    }

    const expiryMin = state.settings.prefs.claimExpiryMin || 20;
    const expiresAt = now() + expiryMin * 60 * 1000;

    t.claimedBy = 'You';
    t.claimType = type;
    t.claimExpiresAt = expiresAt;

    const claimObj = { targetId: t.id, targetName: t.name, claimer: 'You', type, expiresAt };
    const idx = state.claims.findIndex(c => c.targetId === t.id);
    if (idx === -1) state.claims.push(claimObj);
    else state.claims[idx] = claimObj;

    toast(`Claimed ${t.name} (${type.toUpperCase()})`, 'ok');
    saveState();
    renderTargets();
    renderClaims();
  }

  function releaseClaim(targetId) {
    const t = state.targets.find(x => x.id === targetId);
    if (t) {
      t.claimedBy = '';
      t.claimType = '';
      t.claimExpiresAt = 0;
    }
    state.claims = state.claims.filter(c => c.targetId !== targetId);
    toast('Claim released', 'info');
    saveState();
    renderTargets();
    renderClaims();
  }

  function tickClaims() {
    const before = state.claims.length;
    const tnow = now();
    state.claims = state.claims.filter(c => c.expiresAt > tnow);

    for (const t of state.targets) {
      if (t.claimExpiresAt && t.claimExpiresAt <= tnow) {
        t.claimedBy = '';
        t.claimType = '';
        t.claimExpiresAt = 0;
      }
    }

    if (state.claims.length !== before) saveState();
    renderClaims();
    renderTargets();
  }

  function startClaimTicker() {
    if (claimTickTimer) return;
    claimTickTimer = setInterval(tickClaims, 1000);
  }

  function toggleChainSim() {
    if (chainSimTimer) {
      clearInterval(chainSimTimer);
      chainSimTimer = null;
      toast('Chain sim stopped', 'info');
      return;
    }

    toast('Chain sim running', 'ok');
    chainSimTimer = setInterval(() => {
      const text = chainEnemy.textContent || '215 / 01:45';
      const m = text.match(/^(\d+)\s*\/\s*(\d{2}):(\d{2})$/);
      if (!m) return;
      const hits = parseInt(m[1], 10);
      let mm = parseInt(m[2], 10);
      let ss = parseInt(m[3], 10);
      let total = mm * 60 + ss;
      total = Math.max(0, total - 1);
      mm = Math.floor(total / 60);
      ss = total % 60;
      chainEnemy.textContent = `${hits} / ${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
      renderChain();
    }, 1000);
  }

  function recordOutcome(kind) {
    if (kind === 'win') state.analytics.wins = (state.analytics.wins || 0) + 1;
    if (kind === 'loss') state.analytics.losses = (state.analytics.losses || 0) + 1;
    state.analytics.hits = (state.analytics.hits || 0) + 1;
    state.analytics.respect = Math.round(((state.analytics.respect || 0) + (kind === 'win' ? 3.25 : 0.85)) * 100) / 100;
    saveState();
    renderAnalytics();
  }

  function generateRecs() {
    recsList.textContent = '';
    const list = [...state.targets].sort((a,b) => (b.frekiScore||0)-(a.frekiScore||0)).slice(0, 5);
    if (!list.length) {
      recsEmpty.style.display = 'block';
      toast('Add targets first', 'warn');
      return;
    }
    recsEmpty.style.display = 'none';

    for (const t of list) {
      const card = document.createElement('div');
      card.className = 'odin-card';
      card.style.marginBottom = '10px';
      const scoreKind = t.frekiScore >= 80 ? 'ok' : t.frekiScore >= 65 ? 'warn' : 'bad';
      card.innerHTML = `
        <div class="card-header">
          <span>${t.name} <span class="subtle">[#${t.id}]</span></span>
          <span class="badge ${scoreKind}">FREKI ${t.frekiScore}</span>
        </div>
        <div class="data-row"><span class="data-label">Win Probability</span><span class="data-val">${t.winPct}%</span></div>
        <div class="data-row"><span class="data-label">Reasoning</span><span class="data-val" style="color:var(--text-dim)">High score + favorable matchup</span></div>
        <div class="row">
          <button class="odin-btn block" data-action="attack" data-id="${t.id}">Attack</button>
          <button class="odin-btn block btn-claim" data-action="claim" data-type="attack" data-id="${t.id}">Claim</button>
        </div>
      `;
      recsList.appendChild(card);
    }
    toast('Recommendations generated', 'ok');
  }

  function clearRecs() {
    recsList.textContent = '';
    recsEmpty.style.display = 'block';
    toast('Cleared', 'info');
  }

  // =========================
  // 7) EVENT WIRING
  // =========================
  trigger.addEventListener('click', () => {
    if (wrapper.style.display === 'flex') closeUI();
    else openUI();
  });

  btnClose.addEventListener('click', closeUI);
  btnMin.addEventListener('click', () => minimizeUI(false));

  hud.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target && (e.target.id === 'odin-close' || e.target.id === 'odin-minimize')) return;
    startDrag(e);
  }, true);

  hud.addEventListener('touchstart', (e) => {
    if (e.target && (e.target.id === 'odin-close' || e.target.id === 'odin-minimize')) return;
    startDrag(e);
  }, { capture: true, passive: true });

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startResize(e);
  }, true);

  resizer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startResize(e);
  }, { capture: true, passive: false });

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  modalCancel.addEventListener('click', closeModal);
  modalConfirm.addEventListener('click', () => {
    const d = modalDate.value || '';
    const t = modalTime.value || '';
    toast(`Deployed watcher: ${d} ${t} (${modalSlotPill.textContent})`, 'ok');
    closeModal();
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.pane));
  });

  wrapper.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'refresh-war') { toast('War data refreshed (prototype)', 'ok'); return; }
    if (action === 'broadcast-chain') { toast('Chain alert broadcast (prototype)', 'warn'); return; }
    if (action === 'open-chain-tab') { switchTab('analytics'); toast('Open Chain Tab (prototype uses DATA pane)', 'info'); return; }
    if (action === 'toggle-chain-sim') { toggleChainSim(); return; }
    if (action === 'open-schedule-tab') { switchTab('schedule'); return; }
    if (action === 'open-scheduler-modal') { openModal('SCHEDULE'); return; }

    if (action === 'add-target') {
      const parsed = parseTargetInput(targetInput.value);
      if (!parsed) { toast('Enter a valid Target ID or URL', 'bad'); return; }
      if (state.targets.some(t => t.id === parsed.id)) { toast('Target already exists', 'warn'); return; }
      const pri = targetPriority.value || 'medium';
      state.targets.push(makeTargetStub(parsed.id, pri));
      targetInput.value = '';
      saveState();
      renderTargets();
      toast('Added target', 'ok');
      return;
    }

    if (action === 'bulk-score') {
      if (!state.targets.length) { toast('No targets to score', 'warn'); return; }
      for (const t of state.targets) {
        t.frekiScore = clamp(t.frekiScore + randomBetween(-4, 6), 1, 99);
        t.winPct = clamp(Math.round(t.frekiScore + (Math.random() * 10 - 5)), 1, 99);
      }
      saveState();
      renderTargets();
      toast('Bulk scored (prototype)', 'ok');
      return;
    }

    if (action === 'clear-targets') {
      state.targets = [];
      state.favorites = [];
      state.claims = [];
      saveState();
      renderAll();
      toast('Cleared targets', 'info');
      return;
    }

    if (action === 'attack') { toast(`Attack queued for #${btn.getAttribute('data-id')} (prototype)`, 'info'); return; }

    if (action === 'score') {
      const id = btn.getAttribute('data-id');
      const t = state.targets.find(x => x.id === id);
      if (!t) return;
      t.frekiScore = clamp(t.frekiScore + randomBetween(-2, 8), 1, 99);
      t.winPct = clamp(Math.round(t.frekiScore + (Math.random() * 10 - 5)), 1, 99);
      saveState();
      renderTargets();
      toast(`Freki scored: ${t.frekiScore}`, 'ok');
      return;
    }

    if (action === 'remove-target') {
      const id = btn.getAttribute('data-id');
      state.targets = state.targets.filter(x => x.id !== id);
      state.favorites = state.favorites.filter(x => x !== id);
      state.claims = state.claims.filter(c => c.targetId !== id);
      saveState();
      renderAll();
      toast('Removed target', 'info');
      return;
    }

    if (action === 'favorite') {
      const id = btn.getAttribute('data-id');
      if (!state.favorites.includes(id)) state.favorites.push(id);
      saveState();
      renderFavorites();
      toast('Added to favorites', 'ok');
      return;
    }

    if (action === 'unfavorite') {
      const id = btn.getAttribute('data-id');
      state.favorites = state.favorites.filter(x => x !== id);
      saveState();
      renderFavorites();
      toast('Removed from favorites', 'info');
      return;
    }

    if (action === 'claim') {
      const id = btn.getAttribute('data-id');
      const type = btn.getAttribute('data-type') || 'attack';
      if (!state.settings.prefs.showclaims) { toast('Enable claim buttons in Settings', 'warn'); return; }
      claimTarget(id, type);
      return;
    }

    if (action === 'release-claim') { releaseClaim(btn.getAttribute('data-id')); return; }

    if (action === 'remove-watcher') {
      const id = btn.getAttribute('data-id');
      state.watchers = state.watchers.filter(w => w.id !== id);
      saveState();
      renderWatchers();
      toast('Watcher removed', 'info');
      return;
    }

    if (action === 'pick-slot') {
      const d = parseInt(btn.getAttribute('data-day'), 10);
      const s = parseInt(btn.getAttribute('data-slot'), 10);
      const label = `${DAYS[d]} ${SLOTS[s]}`;
      openModal(label);
      modalConfirm.onclick = () => {
        state.schedule.slots[slotKey(d, s)] = 'You';
        saveState();
        renderSchedule();
        toast(`Signed up: ${label}`, 'ok');
        closeModal();
      };
      return;
    }

    if (action === 'analyze-coverage') { renderSchedule(); toast('Coverage analyzed', 'ok'); return; }

    if (action === 'save-settings') {
      pullSettingsFromInputs();
      saveState();
      renderTargets();
      toast('Settings saved', 'ok');
      return;
    }

    if (action === 'reset-settings') {
      state.settings = loadState().settings;
      saveState();
      applySettingsToInputs();
      renderTargets();
      toast('Settings reset', 'info');
      return;
    }

    if (action === 'record-win') { recordOutcome('win'); toast('Recorded WIN', 'ok'); return; }
    if (action === 'record-loss') { recordOutcome('loss'); toast('Recorded LOSS', 'bad'); return; }

    if (action === 'generate-recs') { generateRecs(); return; }
    if (action === 'clear-recs') { clearRecs(); return; }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalBackdrop.style.display === 'flex') closeModal();
      else if (wrapper.style.display === 'flex') closeUI();
    }
  });

  if (targetsSort) targetsSort.addEventListener('change', () => renderTargets());

  // =========================
  // 8) INIT
  // =========================
  ensureSeedData();
  applySavedGeometry();
  applySettingsToInputs();
  renderHeatmap();
  renderAll();
  startClaimTicker();

  if (state.ui.open) openUI();
  else closeUI();

  window.addEventListener('beforeunload', () => {
    if (claimTickTimer) clearInterval(claimTickTimer);
    if (chainSimTimer) clearInterval(chainSimTimer);

    }

    function destroy() {
      const wrapper = document.getElementById('odin-wrapper');
      const trigger = document.getElementById('odin-trigger');
      if (wrapper) wrapper.remove();
      if (trigger) trigger.remove();
      initialized = false;
      nexus.emit('ui:destroyed', { id: 'odin-ui-ultimate' });
    }

    return {
      id: 'odin-ui-ultimate',
      init,
      destroy
    };
  });
})();
