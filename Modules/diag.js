// diag.js
// Odin Diagnostics collector (UI moved into Settings)
// Version: 3.1.0

(function() {
  'use strict';

  if (!window.OdinDiagnostics) {
    window.OdinDiagnostics = {
      log: [],
      services: {
        torn: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 },
        tornStats: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 },
        ffScouter: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 },
        backend: { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 }
      },
      push(entry) {
        try {
          this.log.push(entry);
          if (this.log.length > 500) this.log.splice(0, this.log.length - 500);
        } catch (_) {}
      },
      clear() {
        this.log.length = 0;
        for (const k of Object.keys(this.services)) {
          this.services[k] = { calls:0, errors:0, bytesOut:0, bytesIn:0, lastAt:0 };
        }
      }
    };
  }
})();
