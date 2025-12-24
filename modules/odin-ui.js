// ==OdinModule==
// @name        Odin-ui.js
// @id          odin-ui-styles
// @version     4.0.0
// ==/OdinModule==

(function () {
  'use strict';

  window.OdinModules = window.OdinModules || [];

  window.OdinModules.push(function OdinUltimateUIModule(ctx) {
    const nexus = (ctx && ctx.nexus) || window.Nexus || { emit(){}, on(){}, off(){} };

  let __profileInjection = null;

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
              <span class="data-val" style="color:var(--odin-cyan)" id="war-friendly-score">—</span>
            </div>
            <div class="data-row">
              <span class="data-label">Enemy Score</span>
              <span class="data-val" style="color:var(--berserker-red)" id="war-enemy-score">—</span>
            </div>
            <div class="score-bar" aria-label="War score bar">
              <div class="score-friendly" id="war-friendly-bar" style="width: 50%;"></div>
              <div class="score-enemy" id="war-enemy-bar" style="width: 50%;"></div>
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
              <span class="data-val" style="color:var(--odin-cyan)" id="chain-our">—</span>
            </div>
            <div class="data-row">
              <span class="data-label">Enemy Chain</span>
              <span class="data-val" style="color:var(--berserker-red)" id="chain-enemy">—</span>
            </div>
            <div class="data-row">
              <span class="data-label">Recommendation</span>
              <span class="data-val" style="color:var(--freki-gold)" id="chain-rec">—</span>
            </div>

            <div class="row">
              <button class="odin-btn block" data-action="open-chain-tab">Open Chain Tab</button>
              <button class="odin-btn block btn-med" data-action="toggle-chain-sim">Simulate</button>
            </div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Active Watchers</span>
              <span class="badge ok" id="watcher-coverage">COVERAGE —</span>
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
              <span class="subtle">Real-time claims</span>
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
              Heatmap is visual-only. Cells represent lower-to-higher enemy activity (green → red).
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
              <span class="subtle">Freki score + claim controls</span>
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

            <div class="data-row"><span class="data-label">Hits Landed</span><span class="data-val" id="stat-hits">0</span></div>
            <div class="data-row"><span class="data-label">Total Respect</span><span class="data-val" id="stat-respect">0</span></div>
            <div class="data-row"><span class="data-label">Assists</span><span class="data-val" id="stat-assists">0</span></div>

            <div class="hr"></div>

            <div class="data-row"><span class="data-label">Freki Model</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Training Samples</span><span class="data-val">—</span></div>
            <div class="data-row"><span class="data-label">Connection</span><span class="data-val"><span class="badge cyan">UI MODE</span></span></div>
          </div>

          <div class="odin-card">
            <div class="card-header">
              <span>Accuracy Tracker</span>
              <span class="subtle">Metrics</span>
            </div>
            <div class="empty">
              —
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
              <span class="subtle">Local list </span>
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
            <div class="data-row"><span class="data-label">Mode</span><span class="data-val"><span class="badge cyan">LIVE</span></span></div>
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
          <small class="subtle">LIVE</small>
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
      ui: { open: false, minimized: false, x: null, y: null, xPct: null, yPct: null, w: 349, h: 646 },
      settings: {
        api: { torn: '', tornstats: '', ffscouter: '' },
        prefs: { autoscore: false, showclaims: true, claimExpiryMin: 20 }
      },
      targets: [],
      favorites: [],
      claims: [],
      watchers: [],
      schedule: { slots: {} },
      analytics: { hits: 0, respect: 0, assists: 0, wins: 0, losses: 0 }
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

  function normalizeFrekiPatch(analysis) {
    const patch = {};
    if (!analysis || typeof analysis !== 'object') return patch;

    // Accept several possible shapes without inventing new schema.
    const score = analysis.frekiScore ?? analysis.score ?? analysis.totalScore ?? analysis.overall ?? null;
    const win = analysis.winPct ?? analysis.winPercent ?? analysis.winChance ?? null;
    const diff = analysis.difficulty ?? analysis.risk ?? null;
    const pri = analysis.priority ?? null;

    if (Number.isFinite(Number(score))) patch.frekiScore = clamp(Math.round(Number(score)), 0, 99);
    if (Number.isFinite(Number(win))) patch.winPct = clamp(Math.round(Number(win)), 0, 99);
    if (diff != null) patch.difficulty = String(diff);
    if (pri != null) patch.priority = String(pri);

    patch.lastScoredAt = Date.now();
    return patch;
  }

  function formatInt(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return Math.round(v).toLocaleString();
  }

  function formatMoney(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '$—';
    return '$' + Math.round(v).toLocaleString();
  }

  function pick(obj, paths) {
    for (const p of paths) {
      const parts = p.split('.');
      let cur = obj;
      let ok = true;
      for (const part of parts) {
        if (!cur || typeof cur !== 'object' || !(part in cur)) { ok = false; break; }
        cur = cur[part];
      }
      if (ok && cur != null) return cur;
    }
    return null;
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
  const chainOur = document.getElementById('chain-our');

  const warFriendlyScore = document.getElementById('war-friendly-score');
  const warEnemyScore = document.getElementById('war-enemy-score');
  const warFriendlyBar = document.getElementById('war-friendly-bar');
  const warEnemyBar = document.getElementById('war-enemy-bar');
  const warConnBadge = document.getElementById('war-connection-badge');

  const watcherCoverage = document.getElementById('watcher-coverage');

  const analyticsFrekiModelVal = (() => {
    const pane = document.getElementById('pane-analytics');
    if (!pane) return null;
    const labels = pane.querySelectorAll('.data-row');
    for (const row of labels) {
      const lab = row.querySelector('.data-label');
      if (lab && lab.textContent && lab.textContent.trim() === 'Freki Model') {
        return row.querySelector('.data-val');
      }
    }
    return null;
  })();

  const analyticsTrainingSamplesVal = (() => {
    const pane = document.getElementById('pane-analytics');
    if (!pane) return null;
    const labels = pane.querySelectorAll('.data-row');
    for (const row of labels) {
      const lab = row.querySelector('.data-label');
      if (lab && lab.textContent && lab.textContent.trim() === 'Training Samples') {
        return row.querySelector('.data-val');
      }
    }
    return null;
  })();

  const analyticsConnBadge = (() => {
    const pane = document.getElementById('pane-analytics');
    if (!pane) return null;
    // Find the Connection row and return the inner badge element if present
    const rows = pane.querySelectorAll('.data-row');
    for (const row of rows) {
      const lab = row.querySelector('.data-label');
      if (lab && lab.textContent && lab.textContent.trim() === 'Connection') {
        return row.querySelector('.badge');
      }
    }
    return null;
  })();

  const accuracyEmpty = (() => {
    const pane = document.getElementById('pane-analytics');
    if (!pane) return null;
    const cards = pane.querySelectorAll('.odin-card');
    if (!cards || !cards.length) return null;
    // Accuracy Tracker is the second card in this pane
    for (const card of cards) {
      const header = card.querySelector('.card-header');
      if (header && header.textContent && header.textContent.includes('Accuracy Tracker')) {
        return card.querySelector('.empty');
      }
    }
    return null;
  })();

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


  function recomputeWatchersFromSchedule() {
    try {
      const sched = state.schedule && typeof state.schedule === 'object' ? state.schedule : { slots: {} };
      const slots = (sched.slots && typeof sched.slots === 'object') ? sched.slots : {};
      const today = new Date();
      const dayIdx = today.getDay(); // 0=Sun..6=Sat
      const out = [];

      for (let s = 0; s < SLOTS.length; s++) {
        const key = slotKey(dayIdx, s);
        const raw = slots[key];
        const name = (raw && typeof raw === 'object') ? String(raw.name || '').trim() : String(raw || '').trim();
        if (!name) continue;

        out.push({
          id: (raw && typeof raw === 'object' && raw.tornId) ? String(raw.tornId) : name,
          name,
          slot: SLOTS[s],
          status: '—'
        });
      }

      state.watchers = out;
    } catch (e) {
      // Non-fatal
    }
  }

  function syncScheduleFromStore() {
    try {
      const sched = (ctx && ctx.store && typeof ctx.store.get === 'function') ? ctx.store.get('schedule', null) : null;
      if (sched && typeof sched === 'object') {
        if (!state.schedule || typeof state.schedule !== 'object') state.schedule = { slots: {} };
        const nextSlots = (sched.slots && typeof sched.slots === 'object') ? sched.slots : {};
        state.schedule.slots = nextSlots;
        recomputeWatchersFromSchedule();
        renderSchedule();
        renderWatchers();
        saveState();
      }
    } catch (e) {
      // Non-fatal
    }
  }

  function renderWatchers() {
    watchersTbody.textContent = '';
    try {
      if (watcherCoverage) {
        const total = 7 * 6;
        const filled = state.schedule && state.schedule.slots ? Object.keys(state.schedule.slots).length : 0;
        const pct = total ? Math.round((filled / total) * 100) : 0;
        watcherCoverage.textContent = `COVERAGE ${pct}%`;
        watcherCoverage.classList.remove('ok', 'bad', 'cyan', 'warn');
        watcherCoverage.classList.add(pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad');
      }
    } catch (_) {}
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

  

  function fmtPts(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString() + ' pts';
  }

  function fmtNum(n, digits = 0) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtTimeFromSeconds(sec) {
    if (sec === null || sec === undefined || Number.isNaN(Number(sec))) return '—';
    const s = Math.max(0, Math.floor(Number(sec)));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function renderWar(war) {
    try {
      if (!war || typeof war !== 'object') return;

      if (warConnBadge) {
        const online = war.online === true;
        warConnBadge.textContent = online ? 'LIVE' : 'OFFLINE';
        warConnBadge.classList.remove('ok', 'bad', 'cyan', 'warn');
        warConnBadge.classList.add(online ? 'ok' : 'cyan');
      }

      if (warFriendlyScore) warFriendlyScore.textContent = war.friendlyScore != null ? fmtPts(war.friendlyScore) : '—';
      if (warEnemyScore) warEnemyScore.textContent = war.enemyScore != null ? fmtPts(war.enemyScore) : '—';

      const f = Number(war.friendlyScore || 0);
      const e = Number(war.enemyScore || 0);
      const total = Math.max(1, f + e);
      const fp = Math.max(0, Math.min(100, Math.round((f / total) * 100)));
      const ep = 100 - fp;

      if (warFriendlyBar) warFriendlyBar.style.width = `${fp}%`;
      if (warEnemyBar) warEnemyBar.style.width = `${ep}%`;
    } catch (e) {
      console.warn('[ODIN_UI] renderWar failed:', e);
    }
  }

  function renderChain(chain) {
    try {
      if (!chain || typeof chain !== 'object') return;

      if (chainOur) chainOur.textContent = chain.ourText || '—';
      if (chainEnemy) chainEnemy.textContent = chain.enemyText || '—';
      if (chainRec) chainRec.textContent = chain.recommendation || '—';

      if (chainRisk) {
        chainRisk.textContent = chain.riskText || 'RISK: —';
        chainRisk.classList.remove('ok', 'bad', 'cyan', 'warn');
        chainRisk.classList.add(chain.riskClass || 'warn');
      }
    } catch (e) {
      console.warn('[ODIN_UI] renderChain failed:', e);
    }
  }

  function renderAnalytics(analytics) {
    try {
      if (!analytics || typeof analytics !== 'object') return;

      if (statHits) statHits.textContent = fmtNum(analytics.hitsLanded || 0, 0);
      if (statRespect) statRespect.textContent = fmtNum(analytics.totalRespect || 0, 2);
      if (statAssists) statAssists.textContent = fmtNum(analytics.assists || 0, 0);

      if (analyticsFrekiModelVal) {
        const v = (ctx.freki && ctx.freki.version) ? `v${String(ctx.freki.version)}` : '—';
        analyticsFrekiModelVal.textContent = v;
      }
      if (analyticsTrainingSamplesVal) {
        let samples = null;
        try {
          if (ctx.freki && typeof ctx.freki.getTrainingStats === 'function') {
            const st = ctx.freki.getTrainingStats();
            if (st && typeof st.samples === 'number') samples = st.samples;
          }
        } catch (_) {}
        analyticsTrainingSamplesVal.textContent = samples != null ? fmtNum(samples, 0) : '—';
      }

      if (analyticsConnBadge) {
        const s = (ctx.store && typeof ctx.store.get === 'function') ? ctx.store.get('db.status') : null;
        const online = s && (s === 'connected' || s === 'online');
        analyticsConnBadge.textContent = online ? 'DB LIVE' : 'LOCAL';
        analyticsConnBadge.classList.remove('ok', 'bad', 'cyan', 'warn');
        analyticsConnBadge.classList.add(online ? 'ok' : 'cyan');
      }
    } catch (e) {
      console.warn('[ODIN_UI] renderAnalytics failed:', e);
    }
  }

  function renderAccuracy(acc) {
    try {
      if (!accuracyEmpty) return;
      const a = acc && typeof acc === 'object' ? acc : {};
      const wins = Number(a.wins || 0);
      const losses = Number(a.losses || 0);
      const total = wins + losses;
      const wr = total ? Math.round((wins / total) * 100) : 0;
      accuracyEmpty.textContent = total
        ? `Recorded outcomes: ${wins} win / ${losses} loss (Winrate ${wr}%).`
        : 'No outcomes recorded yet. Use the buttons below after fights to train Freki + track accuracy.';
    } catch (e) {
      console.warn('[ODIN_UI] renderAccuracy failed:', e);
    }
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
        const raw = (state.schedule && state.schedule.slots) ? state.schedule.slots[key] : null;
        const val = (raw && typeof raw === 'object') ? (raw.name || '') : (raw || '');
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
    const filled = Object.values((state.schedule && state.schedule.slots) ? state.schedule.slots : {}).filter(v => {
      if (!v) return false;
      if (typeof v === 'string') return !!v.trim();
      if (typeof v === 'object') return !!String(v.name || '').trim();
      return false;
    }).length;
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
  let viewportBound = false;
  let chainSimTimer = null;
  let claimTickTimer = null;

  function applySavedGeometry() {
  const { x, y, w, h, xPct, yPct } = state.ui;
  if (typeof w === 'number' && w > 0) wrapper.style.width = w + 'px';
  if (typeof h === 'number' && h > 0) wrapper.style.height = h + 'px';

  if (Number.isFinite(xPct) && Number.isFinite(yPct)) {
    if (applyNormalizedPosIfPresent(6)) {
      reconcileGeometryForViewport(6);
      return;
    }
  }

  if (typeof x === 'number' && typeof y === 'number') {
    wrapper.style.transform = 'none';
    wrapper.style.left = x + 'px';
    wrapper.style.top = y + 'px';
    reconcileGeometryForViewport(6);
  }
}

  }

  function openUI() {
    wrapper.style.display = 'flex';
    wrapper.setAttribute('aria-hidden', 'false');
    state.ui.open = true;
    if (state.ui.minimized) minimizeUI(true);
    applySavedGeometry();
reconcileGeometryForViewport(6);
if (!viewportBound) {
  viewportBound = true;
  window.addEventListener('resize', () => reconcileGeometryForViewport(6), { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(() => reconcileGeometryForViewport(6), 0), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => reconcileGeometryForViewport(6), { passive: true });
    window.visualViewport.addEventListener('scroll', () => reconcileGeometryForViewport(6), { passive: true });
  }
}

    try {
      renderWar(ctx.store?.get?.('war.current') || {});
      renderChain(ctx.store?.get?.('chain.current') || {});
      renderAnalytics(ctx.store?.get?.('analytics.session') || { hitsLanded: 0, totalRespect: 0, assists: 0 });
      renderAccuracy(ctx.store?.get?.('analytics.accuracy') || { wins: 0, losses: 0 });
      renderWatchers();
    } catch (_) {}
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

function getViewportRect() {
  const vv = window.visualViewport;
  if (vv) {
    return {
      left: Number(vv.offsetLeft) || 0,
      top: Number(vv.offsetTop) || 0,
      width: Number(vv.width) || window.innerWidth || document.documentElement.clientWidth,
      height: Number(vv.height) || window.innerHeight || document.documentElement.clientHeight
    };
  }
  return {
    left: 0,
    top: 0,
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight
  };
}

function clampWrapperToViewport(margin = 6) {
  try {
    const hasPxPos = wrapper.style.transform === 'none' && wrapper.style.left && wrapper.style.top;
    if (!hasPxPos) return;

    const vp = getViewportRect();
    const w = wrapper.offsetWidth || 0;
    const h = wrapper.offsetHeight || 0;

    const curX = parseFloat(wrapper.style.left) || 0;
    const curY = parseFloat(wrapper.style.top) || 0;

    const maxX = vp.left + vp.width - w - margin;
    const maxY = vp.top + vp.height - h - margin;

    const nx = clamp(curX, vp.left + margin, maxX);
    const ny = clamp(curY, vp.top + margin, maxY);

    if (nx !== curX) wrapper.style.left = nx + 'px';
    if (ny !== curY) wrapper.style.top = ny + 'px';

    state.ui.x = nx;
    state.ui.y = ny;
  } catch (_) {}
}

function updateNormalizedPosFromPx(margin = 6) {
  try {
    const hasPxPos = wrapper.style.transform === 'none' && wrapper.style.left && wrapper.style.top;
    if (!hasPxPos) return;

    const vp = getViewportRect();
    const w = wrapper.offsetWidth || 0;
    const h = wrapper.offsetHeight || 0;

    const x = parseFloat(wrapper.style.left) || 0;
    const y = parseFloat(wrapper.style.top) || 0;

    const denomX = Math.max(1, (vp.width - w - (margin * 2)));
    const denomY = Math.max(1, (vp.height - h - (margin * 2)));

    const xp = (x - (vp.left + margin)) / denomX;
    const yp = (y - (vp.top + margin)) / denomY;

    state.ui.xPct = clamp(xp, 0, 1);
    state.ui.yPct = clamp(yp, 0, 1);
  } catch (_) {}
}

function applyNormalizedPosIfPresent(margin = 6) {
  try {
    const xp = state.ui.xPct;
    const yp = state.ui.yPct;
    if (!Number.isFinite(xp) || !Number.isFinite(yp)) return false;

    const vp = getViewportRect();
    const w = wrapper.offsetWidth || 0;
    const h = wrapper.offsetHeight || 0;

    const maxXSpan = Math.max(0, vp.width - w - (margin * 2));
    const maxYSpan = Math.max(0, vp.height - h - (margin * 2));

    const nx = (vp.left + margin) + (xp * maxXSpan);
    const ny = (vp.top + margin) + (yp * maxYSpan);

    wrapper.style.transform = 'none';
    wrapper.style.left = nx + 'px';
    wrapper.style.top = ny + 'px';

    state.ui.x = nx;
    state.ui.y = ny;
    return true;
  } catch (_) { return false; }
}

function reconcileGeometryForViewport(margin = 6) {
  if (applyNormalizedPosIfPresent(margin)) {
    clampWrapperToViewport(margin);
    updateNormalizedPosFromPx(margin);
    return;
  }
  clampWrapperToViewport(margin);
  updateNormalizedPosFromPx(margin);
}


  function onMove(e) {
    if (drag.active) {
      const p = pointFromEvent(e);
      const vp = getViewportRect();

      const w = wrapper.offsetWidth;
      const h = wrapper.offsetHeight;

      const nx = clamp(p.x - drag.shiftX, vp.left + 6, vp.left + vp.width - w - 6);
      const ny = clamp(p.y - drag.shiftY, vp.top + 6, vp.top + vp.height - h - 6);

      wrapper.style.transform = 'none';
      wrapper.style.left = nx + 'px';
      wrapper.style.top = ny + 'px';

      state.ui.x = nx;
      state.ui.y = ny;
      updateNormalizedPosFromPx(6);
    }

    if (resize.active) {
      const p = pointFromEvent(e);
      const vp = getViewportRect();

      const nw = clamp(resize.startW + (p.x - resize.startX), 340, vp.width - 12);
      const nh = clamp(resize.startH + (p.y - resize.startY), 240, vp.height - 12);

      wrapper.style.width = nw + 'px';
      wrapper.style.height = nh + 'px';

      state.ui.w = nw;
      state.ui.h = nh;

      reconcileGeometryForViewport(6);
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
   reconcileGeometryForViewport(6);
  saveState();
}

  function startDrag(e) {
    if (state.ui.minimized) return;
    drag.active = true;
    const vp = getViewportRect();
const rect = wrapper.getBoundingClientRect();
const rectLeft = rect.left + vp.left;
const rectTop = rect.top + vp.top;

const p = pointFromEvent(e);
drag.shiftX = p.x - rectLeft;
drag.shiftY = p.y - rectTop;

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
    // No placeholder/prototype data. Only structural migration/normalization.
    if (!state.settings) state.settings = { api: { torn: '', tornstats: '', ffscouter: '' }, prefs: { autoscore: false, showclaims: true, claimExpiryMin: 20 } };
    if (!Array.isArray(state.targets)) state.targets = [];
    if (!Array.isArray(state.favorites)) state.favorites = [];
    if (!Array.isArray(state.claims)) state.claims = [];
    if (!Array.isArray(state.watchers)) state.watchers = [];
    if (!state.schedule || typeof state.schedule !== 'object') state.schedule = { slots: {} };
    if (!state.analytics || typeof state.analytics !== 'object') state.analytics = { hits: 0, respect: 0, assists: 0, wins: 0, losses: 0 };
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
    const id = String(targetId || '').trim();
    if (!id) return;

    if (!state.settings.prefs.showclaims) {
      toast('Enable claim buttons in Settings', 'warn');
      return;
    }

    const expiryMin = Number(state.settings.prefs.claimExpiryMin || 20);

    try {
      nexus.emit?.('CLAIM_TARGET', { targetId: id, claimType: (type || 'attack'), expiryMin });
      toast('Claiming…', 'info');
    } catch (e) {
      console.error('[ODIN_UI] Failed to emit CLAIM_TARGET:', e);
      toast('Claim failed', 'bad');
    }
  }

  function releaseClaim(targetId) {
    const id = String(targetId || '').trim();
    if (!id) return;

    try {
      nexus.emit?.('RELEASE_CLAIM', { targetId: id });
      toast('Releasing…', 'info');
    } catch (e) {
      console.error('[ODIN_UI] Failed to emit RELEASE_CLAIM:', e);
      toast('Release failed', 'bad');
    }
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

  wrapper.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'refresh-war') {
      try { nexus.emit?.('WAR_REFRESH_REQUEST', { reason: 'ui' }); } catch (e) { console.warn('[ODIN_UI] WAR_REFRESH_REQUEST failed:', e); }
      toast('Refreshing war data…', 'info');
      return;
    }
    if (action === 'broadcast-chain') {
      try { nexus.emit?.('CHAIN_BROADCAST_REQUEST', { reason: 'ui' }); } catch (e) { console.warn('[ODIN_UI] CHAIN_BROADCAST_REQUEST failed:', e); }
      toast('Broadcasting chain alert…', 'info');
      return;
    }
    if (action === 'open-chain-tab') { switchTab('analytics'); toast('Open Chain Tab', 'info'); return; }
    if (action === 'toggle-chain-sim') { toggleChainSim(); return; }
    if (action === 'open-schedule-tab') { switchTab('schedule'); return; }
    if (action === 'open-scheduler-modal') { openModal('SCHEDULE'); return; }

    if (action === 'add-target') {
      const parsed = parseTargetInput(targetInput.value);
      if (!parsed) { toast('Enter a valid Target ID or URL', 'bad'); return; }

      const pri = targetPriority.value || 'medium';

      try {
        nexus.emit?.('ADD_TARGET', { targetId: parsed.id, priority: pri });
      } catch (e) {
        console.error('[ODIN_UI] Failed to emit ADD_TARGET:', e);
        toast('Failed to add target', 'bad');
        return;
      }

      targetInput.value = '';
      toast('Adding target…', 'info');
      return;
    }

    if (action === 'bulk-score') {
      if (!state.targets.length) { toast('No targets to score', 'warn'); return; }
      if (!ctx.freki || typeof ctx.freki.analyzeTarget !== 'function') { toast('Freki AI not available', 'bad'); return; }

      toast('Scoring targets…', 'info');

      const ids = state.targets.map(t => t.id);
      const batchSize = 3;

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(async (id) => {
          const t = state.targets.find(x => x.id === id);
          if (!t) return;
          try {
            const analysis = await ctx.freki.analyzeTarget(id, t);
            const patch = normalizeFrekiPatch(analysis);
            nexus.emit?.('UPDATE_TARGET', { targetId: id, patch });
          } catch (e) {
            console.warn('[ODIN_UI] Bulk score failed for', id, e);
          }
        }));
      }

      toast('Scoring complete', 'ok');
      return;
    }

    if (action === 'clear-targets') {
      const ids = state.targets.map(t => t.id);
      for (const id of ids) {
        try { nexus.emit?.('REMOVE_TARGET', { targetId: id }); } catch (_) {}
      }
      state.favorites = [];
      saveState();
      toast('Clearing targets…', 'info');
      return;
    }

    if (action === 'attack') { toast(`Attack queued for #${btn.getAttribute('data-id')} `, 'info'); return; }

    if (action === 'score') {
      const id = btn.getAttribute('data-id');
      const t = state.targets.find(x => x.id === id);
      if (!id || !t) return;

      if (!ctx.freki || typeof ctx.freki.analyzeTarget !== 'function') { toast('Freki AI not available', 'bad'); return; }

      try {
        const analysis = await ctx.freki.analyzeTarget(id, t);
        const patch = normalizeFrekiPatch(analysis);
        nexus.emit?.('UPDATE_TARGET', { targetId: id, patch });
        toast(`Freki scored: ${patch.frekiScore ?? '—'}`, 'ok');
      } catch (e) {
        console.error('[ODIN_UI] Freki score failed:', e);
        toast('Freki score failed', 'bad');
      }
      return;
    }

    if (action === 'remove-target') {
      const id = btn.getAttribute('data-id');
      if (!id) return;

      try {
        nexus.emit?.('REMOVE_TARGET', { targetId: id });
      } catch (e) {
        console.error('[ODIN_UI] Failed to emit REMOVE_TARGET:', e);
        toast('Failed to remove target', 'bad');
        return;
      }

      // Local-only favorites cleanup
      state.favorites = state.favorites.filter(x => x !== id);
      saveState();

      toast('Removing target…', 'info');
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
        const key = slotKey(d, s);
        let me = null;
        try { me = (ctx && ctx.store && typeof ctx.store.get === 'function') ? ctx.store.get('playerInfo.current', null) : null; } catch (_) { me = null; }
        const meName = (me && typeof me === 'object' && me.name) ? String(me.name) : 'You';
        const meId = (me && typeof me === 'object' && (me.player_id || me.playerId)) ? String(me.player_id || me.playerId) : null;

        const slot = { tornId: meId, name: meName };
        // Local-first: ActionHandler will persist locally immediately and queue DB sync
        nexus.emit('UPSERT_SCHEDULE_SLOT', { key, dayIndex: d, slotIndex: s, slot });

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

      try {
        const torn = (state.settings.api && state.settings.api.torn) ? String(state.settings.api.torn).trim() : '';
        const tornstats = (state.settings.api && state.settings.api.tornstats) ? String(state.settings.api.tornstats).trim() : '';
        const ffscouter = (state.settings.api && state.settings.api.ffscouter) ? String(state.settings.api.ffscouter).trim() : '';

        nexus.emit?.('SET_API_KEYS', { torn, tornstats, ffscouter });
      } catch (e) {
        console.warn('[ODIN_UI] Failed to emit SET_API_KEYS:', e);
      }

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

  function syncTargetsFromStore() {
    try {
      const targetsObj = (ctx.store && typeof ctx.store.get === 'function') ? (ctx.store.get('targets') || {}) : {};
      const claimsObj = (ctx.store && typeof ctx.store.get === 'function') ? (ctx.store.get('claims') || {}) : {};

      const list = [];
      for (const [id, t] of Object.entries(targetsObj)) {
        if (!t || typeof t !== 'object') continue;
        const claim = claimsObj[id] || null;

        list.push({
          id: String(id),
          name: t.name || t.targetName || t.profile?.name || `#${id}`,
          level: t.level ?? t.profile?.level ?? null,
          status: t.status?.state || t.profile?.status?.state || t.status?.description || t.profile?.status?.description || '',
          life: (t.life && typeof t.life === 'object') ? `${t.life.current ?? '—'}/${t.life.maximum ?? '—'}` : '',
          frekiScore: t.frekiScore ?? null,
          winPct: t.winPct ?? null,
          difficulty: t.difficulty ?? '',
          priority: t.priority ?? '',
          claimedBy: claim?.claimedBy || '',
          claimType: claim?.claimType || '',
          claimExpiresAt: claim?.claimExpiresAt || 0
        });
      }

      state.targets = list;
      state.claims = Object.values(claimsObj || {});
      renderTargets();
      renderFavorites();
      renderClaims();
    } catch (e) {
      console.error('[ODIN_UI] syncTargetsFromStore failed:', e);
    }
  }

  function syncPlayerInfoFromStore() {
    try {
      const data = (ctx.store && typeof ctx.store.get === 'function') ? ctx.store.get('playerInfo.current') : null;
      if (data) renderPersonal(data);
    } catch (e) {
      console.error('[ODIN_UI] syncPlayerInfoFromStore failed:', e);
    }
  }

  function buildPersonalFieldMap() {
    const pane = document.getElementById('pane-personal');
    if (!pane) return null;

    const map = new Map();
    const rows = pane.querySelectorAll('.data-row');
    rows.forEach((row) => {
      const labelEl = row.querySelector('.data-label');
      const valEl = row.querySelector('.data-val');
      const label = labelEl ? labelEl.textContent.trim() : '';
      if (label && valEl) map.set(label, valEl);
    });
    return map;
  }

  const __personalMap = buildPersonalFieldMap();

  function setPersonal(label, value) {
    if (!__personalMap) return;
    const el = __personalMap.get(label);
    if (!el) return;
    el.textContent = (value == null || value === '') ? '—' : String(value);
  }

  function renderPersonal(data) {
    if (!data || typeof data !== 'object') return;

    setPersonal('Name', pick(data, ['name', 'profile.name']) || '—');
    setPersonal('Level', pick(data, ['level', 'profile.level']) || '—');
    setPersonal('Rank', pick(data, ['rank', 'profile.rank']) || '—');
    setPersonal('Age', pick(data, ['age', 'profile.age']) || '—');
    setPersonal('Marital status', pick(data, ['marital_status', 'profile.marital_status']) || '—');

    const money = pick(data, ['money_onhand', 'money_on_hand', 'money.cash', 'money']);
    setPersonal('Money', formatMoney(money));

    const points = pick(data, ['points', 'points.points', 'points_balance']);
    setPersonal('Points', Number.isFinite(Number(points)) ? formatInt(points) : '—');

    const bank = pick(data, ['money_inbank', 'money_in_bank', 'bank', 'money.bank']);
    setPersonal('Bank', formatMoney(bank));

    const lifeCur = pick(data, ['life.current', 'bars.life.current']);
    const lifeMax = pick(data, ['life.maximum', 'bars.life.maximum']);
    if (lifeCur != null || lifeMax != null) setPersonal('Life', `${lifeCur ?? '—'}/${lifeMax ?? '—'}`);

    const networth = pick(data, ['networth.total', 'networth.networth', 'networth']);
    setPersonal('Networth', formatMoney(networth));

    // Work stats
    const ml = pick(data, ['manual_labor', 'workstats.manual_labor']);
    const intel = pick(data, ['intelligence', 'workstats.intelligence']);
    const endu = pick(data, ['endurance', 'workstats.endurance']);

    setPersonal('Manual labor', ml != null ? formatInt(ml) : (pick(data, ['workstats.manual_labor']) != null ? formatInt(pick(data, ['workstats.manual_labor'])) : '—'));
    setPersonal('Intelligence', intel != null ? formatInt(intel) : '—');
    setPersonal('Endurance', endu != null ? formatInt(endu) : '—');

    // Battle stats
    const str = pick(data, ['strength', 'battlestats.strength']);
    const def = pick(data, ['defense', 'battlestats.defense']);
    const spd = pick(data, ['speed', 'battlestats.speed']);
    const dex = pick(data, ['dexterity', 'battlestats.dexterity']);

    setPersonal('Strength', str != null ? formatInt(str) : '—');
    setPersonal('Defense', def != null ? formatInt(def) : '—');
    setPersonal('Speed', spd != null ? formatInt(spd) : '—');
    setPersonal('Dexterity', dex != null ? formatInt(dex) : '—');
  }

  function wireNexusSubscriptions() {
    try {
      nexus.on?.('TARGETS_UPDATED', syncTargetsFromStore);
      nexus.on?.('TARGET_ADDED', syncTargetsFromStore);
      nexus.on?.('TARGET_REMOVED', syncTargetsFromStore);
      nexus.on?.('TARGET_INFO_UPDATED', syncTargetsFromStore);
      nexus.on?.('TARGET_CLAIMED', syncTargetsFromStore);
      nexus.on?.('TARGET_UNCLAIMED', syncTargetsFromStore);

      nexus.on?.('PLAYER_INFO_UPDATED', (payload) => {
        const data = payload && payload.data ? payload.data : payload;
        renderPersonal(data);
      });

      nexus.on?.('WAR_UPDATED', (payload) => {
        const war = payload && (payload.war || payload.data) ? (payload.war || payload.data) : payload;
        renderWar(war);
      });

      nexus.on?.('CHAIN_UPDATED', (payload) => {
        const chain = payload && (payload.chain || payload.data) ? (payload.chain || payload.data) : payload;
        renderChain(chain);
      });

      nexus.on?.('ANALYTICS_UPDATED', (payload) => {
        const a = payload && (payload.analytics || payload.data) ? (payload.analytics || payload.data) : payload;
        renderAnalytics(a || {});
        const acc = ctx.store?.get?.('analytics.accuracy');
        renderAccuracy(acc || {});
      });

      nexus.on?.('ACCURACY_UPDATED', (payload) => {
        const acc = payload && (payload.accuracy || payload.data) ? (payload.accuracy || payload.data) : payload;
        renderAccuracy(acc || {});
      });

      nexus.on?.('FIREBASE_CONNECTED', () => { try { setBadge('db-pill', 'ok'); } catch (_) {} });
      nexus.on?.('FIREBASE_DISCONNECTED', () => { try { setBadge('db-pill', 'bad'); } catch (_) {} });

      nexus.on?.('SCHEDULE_UPDATED', (payload) => {
        try {
          if (payload && payload.schedule && typeof payload.schedule === 'object') {
            if (!state.schedule || typeof state.schedule !== 'object') state.schedule = { slots: {} };
            state.schedule.slots = (payload.schedule.slots && typeof payload.schedule.slots === 'object') ? payload.schedule.slots : {};
            recomputeWatchersFromSchedule();
            renderSchedule();
            renderWatchers();
            saveState();
          } else {
            syncScheduleFromStore();
          }
        } catch (_) {}
      });
    } catch (e) {
      console.warn('[ODIN_UI] wireNexusSubscriptions failed:', e);
    }
  }

  wireNexusSubscriptions();
  syncTargetsFromStore();
  syncPlayerInfoFromStore();
  syncScheduleFromStore();
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

  });

    

  // =========================
  // Profile Injection Bootstrap
  // =========================
  try {
    if (!window.__profileInjection) window.__profileInjection = createProfileInjectionModule();
    __profileInjection = window.__profileInjection || null;
    if (__profileInjection && typeof __profileInjection.init === 'function') __profileInjection.init();
  } catch (e) {
    // Non-fatal; UI can run without profile injection
    if (ctx && ctx.logger && typeof ctx.logger.error === 'function') ctx.logger.error('ProfileInjection init failed', e);
  }
}

  // =========================
  //  ODIN PROFILE INJECTION (Merged)
  // =========================
  function createProfileInjectionModule() {
    if (!window.OdinModules) window.OdinModules = [];

      function parsePlayerIdFromUrl(href) {
        try {
          const u = new URL(href, window.location.origin);
          const p = u.searchParams;
          const xid = p.get('XID') || p.get('xid') || p.get('ID') || p.get('id') || p.get('userID') || p.get('userid');
          if (xid && /^\d+$/.test(xid)) return xid;
          return null;
        } catch (_) {
          return null;
        }
      }

      function findMainRoot() {
        return (
          document.querySelector('#mainContainer') ||
          document.querySelector('#content') ||
          document.querySelector('#main') ||
          document.body
        );
      }

      function findProfileContainer() {
        return (
          document.querySelector('.profile-wrapper') ||
          document.querySelector('[class*="profile"]') ||
          document.querySelector('[id*="profile"]') ||
          null
        );
      }

      function findProfileHeader() {
        // Find the profile header with the user's name
        return (
          document.querySelector('.profile-container .profile-wrapper .basic-information') ||
          document.querySelector('.profile-wrapper .basic-information') ||
          document.querySelector('[class*="basic-information"]') ||
          document.querySelector('.content-title') ||
          null
        );
      }

      function injectProfileButtons(playerId, ctx) {
        const log = ctx.log || console.log;

        // Check if buttons already exist
        if (document.querySelector('.odin-profile-buttons')) {
          log('[ProfileInjection] Buttons already exist for player', playerId);
          return;
        }

        log('[ProfileInjection] ========================================');
        log('[ProfileInjection] INJECTING PROFILE BUTTONS');
        log('[ProfileInjection] Player ID:', playerId);
        log('[ProfileInjection] ========================================');

        const header = findProfileHeader();
        if (!header) {
          log('[ProfileInjection] ❌ Profile header not found - cannot inject buttons');
          log('[ProfileInjection] Tried selectors:');
          log('[ProfileInjection]   - .profile-container .profile-wrapper .basic-information');
          log('[ProfileInjection]   - .profile-wrapper .basic-information');
          log('[ProfileInjection]   - [class*="basic-information"]');
          log('[ProfileInjection]   - .content-title');
          return;
        }

        log('[ProfileInjection] ✓ Profile header found:', header.className);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'odin-profile-buttons';
        buttonContainer.style.cssText = `
          display: inline-flex;
          gap: 8px;
          margin-left: 12px;
          vertical-align: middle;
        `;

        // Create Claim button
        const claimBtn = document.createElement('button');
        claimBtn.className = 'odin-profile-btn odin-claim-btn';
        claimBtn.textContent = '🎯 Claim';
        claimBtn.title = 'Claim this target for attack';
        claimBtn.style.cssText = `
          padding: 8px 14px;
          background: linear-gradient(135deg, #8B0000 0%, #6B0000 100%);
          color: #fff;
          border: 1px solid #8B0000;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 3px 8px rgba(139, 0, 0, 0.4);
          position: relative;
          overflow: hidden;
        `;

        // Add ripple effect on click
        const addRipple = (btn, e) => {
          const ripple = document.createElement('span');
          const rect = btn.getBoundingClientRect();
          const size = Math.max(rect.width, rect.height);
          const x = e.clientX - rect.left - size / 2;
          const y = e.clientY - rect.top - size / 2;

          ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.5);
            left: ${x}px;
            top: ${y}px;
            transform: scale(0);
            animation: ripple-effect 0.6s ease-out;
            pointer-events: none;
          `;

          btn.appendChild(ripple);
          setTimeout(() => ripple.remove(), 600);
        };

        // Add animation styles to document
        if (!document.getElementById('odin-profile-button-animations')) {
          const style = document.createElement('style');
          style.id = 'odin-profile-button-animations';
          style.textContent = `
            @keyframes ripple-effect {
              to {
                transform: scale(2);
                opacity: 0;
              }
            }
          `;
          document.head.appendChild(style);
        }

        claimBtn.onmouseover = () => {
          claimBtn.style.transform = 'translateY(-3px) scale(1.05)';
          claimBtn.style.boxShadow = '0 6px 16px rgba(139, 0, 0, 0.6)';
        };
        claimBtn.onmouseout = () => {
          claimBtn.style.transform = 'translateY(0) scale(1)';
          claimBtn.style.boxShadow = '0 3px 8px rgba(139, 0, 0, 0.4)';
        };
        claimBtn.onclick = (e) => {
          addRipple(claimBtn, e);
          claimBtn.style.transform = 'scale(0.95)';
          setTimeout(() => {
            claimBtn.style.transform = 'translateY(0) scale(1)';
          }, 100);

          if (ctx.nexus) {
            ctx.nexus.emit('CLAIM_TARGET', { targetId: playerId, type: 'attack' });
            showProfileToast('Target claimed!', 'success');
          } else {
            showProfileToast('Odin Tools not initialized. Please reload the page.', 'error');
          }
        };

        // Create Target button
        const targetBtn = document.createElement('button');
        targetBtn.className = 'odin-profile-btn odin-target-btn';
        targetBtn.textContent = '📌 Add Target';
        targetBtn.title = 'Add to faction target list';
        targetBtn.style.cssText = `
          padding: 8px 14px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: #fff;
          border: 1px solid #3b82f6;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 3px 8px rgba(59, 130, 246, 0.4);
          position: relative;
          overflow: hidden;
        `;
        targetBtn.onmouseover = () => {
          targetBtn.style.transform = 'translateY(-3px) scale(1.05)';
          targetBtn.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.6)';
        };
        targetBtn.onmouseout = () => {
          targetBtn.style.transform = 'translateY(0) scale(1)';
          targetBtn.style.boxShadow = '0 3px 8px rgba(59, 130, 246, 0.4)';
        };
        targetBtn.onclick = (e) => {
          addRipple(targetBtn, e);
          targetBtn.style.transform = 'scale(0.95)';
          setTimeout(() => {
            targetBtn.style.transform = 'translateY(0) scale(1)';
          }, 100);

          if (ctx.nexus) {
            ctx.nexus.emit('ADD_TARGET', { targetId: playerId });
            showProfileToast('Added to target list!', 'success');
          } else {
            showProfileToast('Odin Tools not initialized. Please reload the page.', 'error');
          }
        };

        // Add buttons to container
        buttonContainer.appendChild(claimBtn);
        buttonContainer.appendChild(targetBtn);

        log('[ProfileInjection] ✓ Created 2 buttons (Claim, Add Target)');

        // Find a good place to insert the buttons
        // Try to find the name element
        const nameElement = header.querySelector('h4') || header.querySelector('.title-black') || header;

        if (nameElement) {
          // Insert after the name element
          if (nameElement.nextSibling) {
            nameElement.parentNode.insertBefore(buttonContainer, nameElement.nextSibling);
          } else {
            nameElement.parentNode.appendChild(buttonContainer);
          }
          log('[ProfileInjection] ✓ Buttons inserted after name element');
        } else {
          // Fallback: append to header
          header.appendChild(buttonContainer);
          log('[ProfileInjection] ✓ Buttons appended to header');
        }

        log('[ProfileInjection] ========================================');
        log('[ProfileInjection] ✓ PROFILE BUTTONS INJECTED SUCCESSFULLY');
        log('[ProfileInjection] ✓ Player:', playerId);
        log('[ProfileInjection] ✓ Button count: 2');
        log('[ProfileInjection] ✓ Event handlers: CLAIM_TARGET, ADD_TARGET');
        log('[ProfileInjection] ========================================');
      }

      function showProfileToast(message, type = 'info') {
        // Remove existing toast
        const existing = document.querySelector('.odin-profile-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'odin-profile-toast';
        toast.textContent = message;

        // Determine background based on type
        let background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
        if (type === 'success') background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
        if (type === 'error') background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        if (type === 'warning') background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';

        toast.style.cssText = `
          position: fixed;
          top: 20px;
          left: 50%;
          transform: translateX(-50%) translateY(-100%);
          padding: 14px 24px;
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          z-index: 999999;
          background: ${background};
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          min-width: 300px;
          text-align: center;
          opacity: 0;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        `;

        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
          });
        });

        setTimeout(() => {
          toast.style.transform = 'translateX(-50%) translateY(-100%)';
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 400);
        }, 3000);
      }

    return { init, destroy };
  }


  function destroy() {

    // Profile injection cleanup
    try {
      if (__profileInjection && typeof __profileInjection.destroy === 'function') __profileInjection.destroy();
    } catch (e) {
      try { console.warn('[ODIN_UI] Profile injection destroy failed:', e); } catch {}
    }
    __profileInjection = null;

      const wrapper = document.getElementById('odin-wrapper');
      const trigger = document.getElementById('odin-trigger');
      if (wrapper) wrapper.remove();
      if (trigger) trigger.remove();
      initialized = false;
      nexus.emit('ui:destroyed', { id: 'odin-ui-manager' });
    }

    return {
      id: 'odin-ui-manager',
      init,
      destroy
    };
  

    });



  // =========================
  // PROFILE INJECTION MODULE
  // =========================
  window.OdinModules.push(function UIProfileInjectionModule(ctx) {
    let injection = null;

    function init() {
      try {
        injection = createProfileInjectionModule();
        if (injection && typeof injection.init === 'function') injection.init();
      } catch (e) {
        console.error('[UIProfileInjection] init failed:', e);
      }
    }

    function destroy() {
      try {
        if (injection && typeof injection.destroy === 'function') injection.destroy();
      } catch (_) {}
      injection = null;
    }

    return { id: 'ui-profile-injection', init, destroy };
  });

})();
