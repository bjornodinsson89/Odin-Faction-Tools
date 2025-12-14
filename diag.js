// diag.js
// Odin Diagnostics Store (UI moved into Settings tab)
// Version: 4.0.7

(function () {
  'use strict';

  const MAX = 600;
  const state = {
    lines: [],
    startedAt: Date.now(),
  };

  function now() {
    const d = new Date();
    return d.toISOString().split('T')[1].replace('Z','');
  }

  function push(line) {
    state.lines.push(line);
    if (state.lines.length > MAX) state.lines.splice(0, state.lines.length - MAX);
  }

  function log(...args) {
    const msg = args.map(a => {
      try {
        if (typeof a === 'string') return a;
        return JSON.stringify(a);
      } catch (e) {
        return String(a);
      }
    }).join(' ');
    push(`[${now()}] ${msg}`);
  }

  window.OdinDiag = window.OdinDiag || {
    log,
    getLog: () => state.lines.slice(),
    clear: () => { state.lines.length = 0; },
  };
})();
