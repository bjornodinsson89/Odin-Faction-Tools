/* ============================================================
   Odin's Spear Core v5.0.0
   - Nexus event bus
   - State store
   - Local storage abstraction (Tampermonkey GM_* with localStorage fallback)
   - Module loader for window.OdinModules
   ============================================================ */

(function() {
  'use strict';

  if (!window.OdinModules) if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function LogManagerModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    const LOG_VERSION = '1.0.0';
    const MAX_LOGS = 1000; // Maximum number of logs to keep in memory

    // ============================================
    // LOG STORAGE
    // ============================================
    const logs = {
      errors: [],
      apiCalls: [],
      databaseCalls: [],
      networkCalls: [],
      events: [],
      all: []
    };

    // ============================================
    // LOG ENTRY CREATION
    // ============================================
    function createLogEntry(type, data) {
      const entry = {
        id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        timestamp: Date.now(),
        type: type,
        ...data
      };

      // Add to specific category
      if (logs[type]) {
        logs[type].unshift(entry);
        if (logs[type].length > MAX_LOGS) {
          logs[type].length = MAX_LOGS;
        }
      }

      // Add to all logs
      logs.all.unshift(entry);
      if (logs.all.length > MAX_LOGS) {
        logs.all.length = MAX_LOGS;
      }

      // Emit log event
      nexus.emit('LOG_ENTRY_ADDED', { entry, type });

      return entry;
    }

    // ============================================
    // ERROR LOGGING
    // ============================================
    function logError(error, context = {}) {
      const errorData = {
        message: error.message || String(error),
        stack: error.stack || null,
        context: context,
        level: context.level || 'error'
      };

      return createLogEntry('errors', errorData);
    }

    // ============================================
    // API CALL LOGGING
    // ============================================
    function logApiCall(data) {
      const apiData = {
        service: data.service || 'unknown',
        endpoint: data.endpoint || '',
        url: data.url || '',
        method: data.method || 'GET',
        status: data.status || 'pending',
        statusCode: data.statusCode || null,
        duration: data.duration || 0,
        cached: data.cached || false,
        error: data.error || null,
        requestData: data.requestData || null,
        responseData: data.responseData || null
      };

      return createLogEntry('apiCalls', apiData);
    }

    // ============================================
    // DATABASE CALL LOGGING
    // ============================================
    function logDatabaseCall(data) {
      const dbData = {
        operation: data.operation || 'unknown', // read, write, update, delete
        path: data.path || '',
        direction: data.direction || 'out', // in or out
        status: data.status || 'pending',
        duration: data.duration || 0,
        error: data.error || null,
        dataSize: data.dataSize || 0,
        cached: data.cached || false
      };

      return createLogEntry('databaseCalls', dbData);
    }

    // ============================================
    // NETWORK CALL LOGGING
    // ============================================
    function logNetworkCall(data) {
      const networkData = {
        url: data.url || '',
        method: data.method || 'GET',
        direction: data.direction || 'out', // in or out
        status: data.status || 'pending',
        statusCode: data.statusCode || null,
        duration: data.duration || 0,
        size: data.size || 0,
        error: data.error || null
      };

      return createLogEntry('networkCalls', networkData);
    }

    // ============================================
    // EVENT LOGGING
    // ============================================
    function logEvent(eventName, data = {}) {
      const eventData = {
        eventName: eventName,
        data: data
      };

      return createLogEntry('events', eventData);
    }

    // ============================================
    // LOG RETRIEVAL
    // ============================================
    function getLogs(filter = {}) {
      const {
        type = 'all',
        limit = 100,
        startTime = null,
        endTime = null,
        search = null
      } = filter;

      let results = logs[type] || logs.all;

      // Filter by time range
      if (startTime || endTime) {
        results = results.filter(entry => {
          if (startTime && entry.timestamp < startTime) return false;
          if (endTime && entry.timestamp > endTime) return false;
          return true;
        });
      }

      // Filter by search term
      if (search) {
        const searchLower = search.toLowerCase();
        results = results.filter(entry => {
          const entryStr = JSON.stringify(entry).toLowerCase();
          return entryStr.includes(searchLower);
        });
      }

      // Apply limit
      return results.slice(0, limit);
    }

    // ============================================
    // LOG FORMATTING
    // ============================================
    function formatLogEntry(entry) {
      const timestamp = new Date(entry.timestamp).toISOString();
      const type = entry.type.toUpperCase();

      switch (entry.type) {
        case 'errors':
          return `[${timestamp}] [${type}] ${entry.message}${entry.stack ? '\n' + entry.stack : ''}`;

        case 'apiCalls':
          return `[${timestamp}] [${type}] ${entry.service} ${entry.method} ${entry.endpoint} - ${entry.status} (${entry.duration}ms)${entry.error ? ' ERROR: ' + entry.error : ''}`;

        case 'databaseCalls':
          return `[${timestamp}] [${type}] ${entry.operation} ${entry.path} [${entry.direction}] - ${entry.status} (${entry.duration}ms)${entry.error ? ' ERROR: ' + entry.error : ''}`;

        case 'networkCalls':
          return `[${timestamp}] [${type}] ${entry.method} ${entry.url} [${entry.direction}] - ${entry.status} (${entry.duration}ms)${entry.error ? ' ERROR: ' + entry.error : ''}`;

        case 'events':
          return `[${timestamp}] [${type}] ${entry.eventName} ${JSON.stringify(entry.data)}`;

        default:
          return `[${timestamp}] [${type}] ${JSON.stringify(entry)}`;
      }
    }

    // ============================================
    // LOG EXPORT
    // ============================================
    function exportLogs(filter = {}) {
      const logsToExport = getLogs(filter);
      return logsToExport.map(formatLogEntry).join('\n');
    }

    // ============================================
    // LOG REDACTION (for sensitive data)
    // ============================================
    function redactSensitiveData(data) {
      if (typeof data !== 'object' || data === null) {
        return data;
      }

      const redacted = Array.isArray(data) ? [...data] : { ...data };
      const sensitiveKeys = ['key', 'apiKey', 'apikey', 'api_key', 'password', 'token', 'secret', 'auth', 'authorization'];

      for (const key in redacted) {
        const keyLower = key.toLowerCase();

        // Redact sensitive keys
        if (sensitiveKeys.some(sk => keyLower.includes(sk))) {
          if (typeof redacted[key] === 'string' && redacted[key].length > 8) {
            redacted[key] = redacted[key].slice(0, 4) + '••••••••' + redacted[key].slice(-4);
          } else {
            redacted[key] = '••••••••';
          }
        }

        // Recursively redact nested objects
        else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
          redacted[key] = redactSensitiveData(redacted[key]);
        }
      }

      return redacted;
    }

    function exportLogsRedacted(filter = {}) {
      const logsToExport = getLogs(filter);
      const redactedLogs = logsToExport.map(entry => {
        const redacted = redactSensitiveData(entry);
        return formatLogEntry(redacted);
      });
      return redactedLogs.join('\n');
    }

    // ============================================
    // EMAIL LOGS
    // ============================================
    async function emailLogs(emailAddress, filter = {}) {
      try {
        const logsText = exportLogsRedacted(filter);
        const subject = encodeURIComponent('Odin Faction Tools - Log Report');
        const body = encodeURIComponent(
          'Odin Faction Tools Log Report\n' +
          'Generated: ' + new Date().toISOString() + '\n' +
          'Version: ' + LOG_VERSION + '\n' +
          '================================\n\n' +
          logsText
        );

        // Create mailto link
        const mailtoLink = `mailto:${emailAddress}?subject=${subject}&body=${body}`;

        // Open mailto link
        window.location.href = mailtoLink;

        return { success: true, message: 'Email client opened' };
      } catch (error) {
        return { success: false, message: error.message };
      }
    }

    // ============================================
    // CLEAR LOGS
    // ============================================
    function clearLogs(type = 'all') {
      if (type === 'all') {
        for (const key in logs) {
          logs[key] = [];
        }
      } else if (logs[type]) {
        logs[type] = [];
      }

      nexus.emit('LOGS_CLEARED', { type });
      log('[LogManager] Logs cleared:', type);
    }

    // ============================================
    // STATS
    // ============================================
    function getLogStats() {
      return {
        total: logs.all.length,
        errors: logs.errors.length,
        apiCalls: logs.apiCalls.length,
        databaseCalls: logs.databaseCalls.length,
        networkCalls: logs.networkCalls.length,
        events: logs.events.length,
        oldestTimestamp: logs.all[logs.all.length - 1]?.timestamp || null,
        newestTimestamp: logs.all[0]?.timestamp || null
      };
    }

    // ============================================
    // INTERCEPT CONSOLE ERRORS
    // ============================================
    function interceptConsoleErrors() {
      const originalError = console.error;
      console.error = function(...args) {
        // Log to our system
        logError(new Error(args.join(' ')), { source: 'console.error' });
        // Call original
        originalError.apply(console, args);
      };

      const originalWarn = console.warn;
      console.warn = function(...args) {
        // Log warnings as errors with lower level
        logError(new Error(args.join(' ')), { source: 'console.warn', level: 'warning' });
        // Call original
        originalWarn.apply(console, args);
      };

      // Intercept window errors
      window.addEventListener('error', (event) => {
        logError(event.error || new Error(event.message), {
          source: 'window.error',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        });
      });

      // Intercept unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        logError(new Error('Unhandled Promise Rejection: ' + event.reason), {
          source: 'unhandledrejection'
        });
      });
    }

    // ============================================
    // HOOK INTO API CALLS
    // ============================================
    function hookApiCalls() {
      // Listen to API call events from OdinApi module
      nexus.on('API_CALL_START', (data) => {
        logApiCall({
          ...data,
          status: 'pending'
        });
      });

      nexus.on('API_CALL_SUCCESS', (data) => {
        logApiCall({
          ...data,
          status: 'success'
        });
      });

      nexus.on('API_CALL_ERROR', (data) => {
        logApiCall({
          ...data,
          status: 'error'
        });
      });
    }

    // ============================================
    // HOOK INTO DATABASE CALLS
    // ============================================
    function hookDatabaseCalls() {
      nexus.on('DB_CALL_START', (data) => {
        logDatabaseCall({
          ...data,
          status: 'pending'
        });
      });

      nexus.on('DB_CALL_SUCCESS', (data) => {
        logDatabaseCall({
          ...data,
          status: 'success'
        });
      });

      nexus.on('DB_CALL_ERROR', (data) => {
        logDatabaseCall({
          ...data,
          status: 'error'
        });
      });
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const LogManagerAPI = {
      version: LOG_VERSION,
      logError,
      logApiCall,
      logDatabaseCall,
      logNetworkCall,
      logEvent,
      getLogs,
      exportLogs,
      exportLogsRedacted,
      emailLogs,
      clearLogs,
      getLogStats,
      formatLogEntry
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[LogManager] Initializing v' + LOG_VERSION);

      // Intercept console errors
      interceptConsoleErrors();

      // Hook into API and DB calls
      hookApiCalls();
      hookDatabaseCalls();

      // Expose globally
      window.OdinLogManager = LogManagerAPI;
      ctx.logManager = LogManagerAPI;

      log('[LogManager] Ready - Tracking all logs');
      nexus.emit('LOG_MANAGER_READY', { version: LOG_VERSION });
    }

    function destroy() {
      log('[LogManager] Destroying...');
      clearLogs('all');
      window.OdinLogManager = null;
      log('[LogManager] Destroyed');
    }

    return {
      id: 'log-manager',
      init,
      destroy
    };
  });
})();



/* =========================
   Embedded: PlayerInfo.js
   ========================= */

/**
 * Odin Tools - Player Information Module
 * Displays comprehensive player stats with progress tracking
 * Version: 1.0.0
 * Author: BjornOdinsson89
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function PlayerInfoModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {}, get: () => null, set: () => {} };
    const store = ctx.store || { get: () => null, set: () => {}, update: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    let offApiKeysUpdated = null;
    let offRefreshPlayerInfo = null;

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
      updateInterval: 300000, // Update every 5 minutes
      historyRetention: 31, // Keep 31 days of history
      storageKey: 'odin_player_history'
    };

    // ============================================
    // STATE
    // ============================================
    let updateTimer = null;
    let currentPlayerData = null;

    // ============================================
    // DATA MANAGEMENT
    // ============================================

    /**
     * Get stored player history
     */
    function getPlayerHistory() {
      try {
        const history = storage.getJSON(CONFIG.storageKey) || {};
        return {
          snapshots: history.snapshots || [],
          lastUpdate: history.lastUpdate || null
        };
      } catch (e) {
        error('[PlayerInfo] Failed to get history:', e);
        return { snapshots: [], lastUpdate: null };
      }
    }

    /**
     * Save player snapshot to history
     */
    function savePlayerSnapshot(data) {
      try {
        const history = getPlayerHistory();
        const now = Date.now();

        const snapshot = {
          timestamp: now,
          money: data.money || {},
          stats: data.battlestats || {},
          crimes: data.criminalrecord || {},
          personalStats: data.personalstats || {},
          networth: data.networth || {}
        };

        // Add to snapshots
        history.snapshots.push(snapshot);

        // Keep only recent history
        const cutoff = now - (CONFIG.historyRetention * 24 * 60 * 60 * 1000);
        history.snapshots = history.snapshots.filter(s => s.timestamp > cutoff);

        // Sort by timestamp
        history.snapshots.sort((a, b) => a.timestamp - b.timestamp);

        history.lastUpdate = now;

        storage.setJSON(CONFIG.storageKey, history);
        log('[PlayerInfo] Snapshot saved, total snapshots:', history.snapshots.length);

        return true;
      } catch (e) {
        error('[PlayerInfo] Failed to save snapshot:', e);
        return false;
      }
    }

    /**
     * Calculate changes over a time period
     */
    function calculateChanges(field, subfield, days) {
      try {
        const history = getPlayerHistory();
        if (!history.snapshots || history.snapshots.length === 0) return null;

        const now = Date.now();
        const targetTime = now - (days * 24 * 60 * 60 * 1000);

        // Find snapshot closest to target time
        let oldSnapshot = null;
        for (let i = history.snapshots.length - 1; i >= 0; i--) {
          if (history.snapshots[i].timestamp <= targetTime) {
            oldSnapshot = history.snapshots[i];
            break;
          }
        }

        if (!oldSnapshot) {
          // Use oldest snapshot if we don't have data going back that far
          oldSnapshot = history.snapshots[0];
        }

        const currentSnapshot = history.snapshots[history.snapshots.length - 1];

        const oldValue = oldSnapshot[field]?.[subfield] || 0;
        const newValue = currentSnapshot[field]?.[subfield] || 0;

        return {
          change: newValue - oldValue,
          oldValue,
          newValue,
          days: (currentSnapshot.timestamp - oldSnapshot.timestamp) / (24 * 60 * 60 * 1000)
        };
      } catch (e) {
        error('[PlayerInfo] Failed to calculate changes:', e);
        return null;
      }
    }

    /**
     * Calculate average daily gain
     */
    function calculateAvgDaily(field, subfield, days = 7) {
      try {
        const changes = calculateChanges(field, subfield, days);
        if (!changes || changes.days === 0) return 0;
        return changes.change / changes.days;
      } catch (e) {
        error('[PlayerInfo] Failed to calculate avg daily:', e);
        return 0;
      }
    }

    // ============================================
    // API DATA FETCHING
    // ============================================

    /**
     * Fetch comprehensive player data
     */
    async function fetchPlayerData() {
      try {
        if (!ctx.api?.getUser) {
          error('[PlayerInfo] API not available');
          return null;
        }

        log('[PlayerInfo] Fetching player data...');

        const selections = 'profile,bars,money,points,workstats,personalstats,battlestats,crimes,networth';
        const data = await ctx.api.getUser(null, selections);

        if (!data || data.error) {
          error('[PlayerInfo] API error:', data?.error?.error || 'Unknown error');
          return null;
        }

        currentPlayerData = data;

        // Save snapshot
        savePlayerSnapshot(data);

        // Update store for UI
        try {
          store.set('playerInfo.current', data);
          store.set('playerInfo.lastUpdate', Date.now());
        } catch (e) {
          error('[PlayerInfo] Store update failed:', e);
        }

        // Emit update event
        try {
          nexus.emit?.('PLAYER_INFO_UPDATED', { data });
        } catch (e) {
          error('[PlayerInfo] Event emit failed:', e);
        }

        log('[PlayerInfo] Player data updated');
        return data;

      } catch (e) {
        error('[PlayerInfo] Failed to fetch player data:', e);
        return null;
      }
    }

    /**
     * Start automatic updates
     */
    function startAutoUpdate() {
      try {
        if (updateTimer) {
          clearInterval(updateTimer);
        }

        // Fetch immediately
        fetchPlayerData();

        // Then set up interval
        updateTimer = setInterval(() => {
          fetchPlayerData();
        }, CONFIG.updateInterval);

        log('[PlayerInfo] Auto-update started (interval:', CONFIG.updateInterval / 1000, 'seconds)');
      } catch (e) {
        error('[PlayerInfo] Failed to start auto-update:', e);
      }
    }

    /**
     * Stop automatic updates
     */
    function stopAutoUpdate() {
      try {
        if (updateTimer) {
          clearInterval(updateTimer);
          updateTimer = null;
          log('[PlayerInfo] Auto-update stopped');
        }
      } catch (e) {
        error('[PlayerInfo] Failed to stop auto-update:', e);
      }
    }

    // ============================================
    // FORMATTING HELPERS
    // ============================================

    function formatNumber(num) {
      if (num == null || isNaN(num)) return '0';
      return Math.floor(num).toLocaleString();
    }

    function formatMoney(num) {
      if (num == null || isNaN(num)) return '$0';
      return '$' + Math.floor(num).toLocaleString();
    }

    function formatChange(num, isPositiveGood = true) {
      if (num == null || isNaN(num) || num === 0) return '<span style="color: #9ca3af;">+0</span>';

      const formatted = formatNumber(Math.abs(num));
      const sign = num > 0 ? '+' : '-';
      const color = num > 0
        ? (isPositiveGood ? '#10b981' : '#ef4444')
        : (isPositiveGood ? '#ef4444' : '#10b981');

      return `<span style="color: ${color}; font-weight: 600;">${sign}${formatted}</span>`;
    }

    function formatPercentChange(change, total) {
      if (!change || !total || total === 0) return '';
      const percent = (change / total) * 100;
      return ` (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`;
    }

    // ============================================
    // CARD RENDERING
    // ============================================

    /**
     * Render Money Info Card
     */
    function renderMoneyCard(data) {
      try {
        if (!data || !data.money) {
          return `
            <div class="odin-card">
              <div class="odin-card-header">
                <div class="odin-card-title">💰 Money Info</div>
              </div>
              <div style="padding: 10px; color: #9ca3af;">No data available. API key may not be set.</div>
            </div>
          `;
        }

        const money = data.money || {};
        const networth = data.networth || {};

        // Calculate changes
        const cashChange1d = calculateChanges('money', 'money_onhand', 1);
        const cashChange7d = calculateChanges('money', 'money_onhand', 7);
        const cashChange30d = calculateChanges('money', 'money_onhand', 30);

        const bankChange1d = calculateChanges('money', 'vault', 1);
        const bankChange7d = calculateChanges('money', 'vault', 7);
        const bankChange30d = calculateChanges('money', 'vault', 30);

        const networthChange1d = calculateChanges('networth', 'total', 1);
        const networthChange7d = calculateChanges('networth', 'total', 7);
        const networthChange30d = calculateChanges('networth', 'total', 30);

        const avgDailyIncome = calculateAvgDaily('networth', 'total', 7);

        return `
          <div class="odin-card">
            <div class="odin-card-header">
              <div class="odin-card-title">💰 Money Info</div>
              <span class="odin-badge success">Live</span>
            </div>
            <div class="odin-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
              <div class="odin-stat-item">
                <div class="odin-stat-label">Cash on Hand</div>
                <div class="odin-stat-value" style="font-size: 16px;">${formatMoney(money.money_onhand)}</div>
                <div style="font-size: 11px; margin-top: 4px;">
                  Daily: ${cashChange1d ? formatChange(cashChange1d.change) : '-'}<br>
                  Weekly: ${cashChange7d ? formatChange(cashChange7d.change) : '-'}<br>
                  Monthly: ${cashChange30d ? formatChange(cashChange30d.change) : '-'}
                </div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Bank Balance</div>
                <div class="odin-stat-value" style="font-size: 16px;">${formatMoney(money.vault)}</div>
                <div style="font-size: 11px; margin-top: 4px;">
                  Daily: ${bankChange1d ? formatChange(bankChange1d.change) : '-'}<br>
                  Weekly: ${bankChange7d ? formatChange(bankChange7d.change) : '-'}<br>
                  Monthly: ${bankChange30d ? formatChange(bankChange30d.change) : '-'}
                </div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Stocks Value</div>
                <div class="odin-stat-value" style="font-size: 16px;">${formatMoney(networth.stockmarket || 0)}</div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Total Networth</div>
                <div class="odin-stat-value" style="font-size: 16px;">${formatMoney(networth.total || 0)}</div>
                <div style="font-size: 11px; margin-top: 4px;">
                  Daily: ${networthChange1d ? formatChange(networthChange1d.change) : '-'}<br>
                  Weekly: ${networthChange7d ? formatChange(networthChange7d.change) : '-'}<br>
                  Monthly: ${networthChange30d ? formatChange(networthChange30d.change) : '-'}
                </div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Avg Daily Income</div>
                <div class="odin-stat-value" style="font-size: 16px; color: #10b981;">${formatMoney(avgDailyIncome)}</div>
                <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">Based on 7-day trend</div>
              </div>
            </div>
          </div>
        `;
      } catch (e) {
        error('[PlayerInfo] Failed to render money card:', e);
        return `<div class="odin-card"><div class="odin-card-header"><div class="odin-card-title">💰 Money Info</div></div><div style="padding: 10px; color: #ef4444;">Error rendering card</div></div>`;
      }
    }

    /**
     * Render Stats Info Card
     */
    function renderStatsCard(data) {
      try {
        if (!data || !data.battlestats) {
          return `
            <div class="odin-card">
              <div class="odin-card-header">
                <div class="odin-card-title">📊 Battle Stats</div>
              </div>
              <div style="padding: 10px; color: #9ca3af;">No data available. API key may not be set.</div>
            </div>
          `;
        }

        const stats = data.battlestats || {};
        const statNames = ['strength', 'speed', 'dexterity', 'defense'];
        const statIcons = { strength: '💪', speed: '⚡', dexterity: '🎯', defense: '🛡️' };

        let statsHtml = '';

        for (const stat of statNames) {
          const value = stats[stat] || 0;
          const change1d = calculateChanges('stats', stat, 1);
          const change7d = calculateChanges('stats', stat, 7);
          const change30d = calculateChanges('stats', stat, 30);
          const avgDaily = calculateAvgDaily('stats', stat, 7);

          statsHtml += `
            <div class="odin-stat-item">
              <div class="odin-stat-label">${statIcons[stat]} ${stat.charAt(0).toUpperCase() + stat.slice(1)}</div>
              <div class="odin-stat-value" style="font-size: 16px;">${formatNumber(value)}</div>
              <div style="font-size: 11px; margin-top: 4px;">
                Daily: ${change1d ? formatChange(change1d.change) : '-'}<br>
                Weekly: ${change7d ? formatChange(change7d.change) : '-'}<br>
                Monthly: ${change30d ? formatChange(change30d.change) : '-'}<br>
                <span style="color: #3b82f6;">Avg/day: ${formatNumber(avgDaily)}</span>
              </div>
            </div>
          `;
        }

        const total = stats.strength + stats.speed + stats.dexterity + stats.defense;
        const totalChange7d = calculateChanges('stats', 'strength', 7);
        const totalAvgDaily =
          calculateAvgDaily('stats', 'strength', 7) +
          calculateAvgDaily('stats', 'speed', 7) +
          calculateAvgDaily('stats', 'dexterity', 7) +
          calculateAvgDaily('stats', 'defense', 7);

        return `
          <div class="odin-card">
            <div class="odin-card-header">
              <div class="odin-card-title">📊 Battle Stats</div>
              <span class="odin-badge info">${formatNumber(total)} Total</span>
            </div>
            <div style="padding: 10px; font-size: 12px; color: #3b82f6; background: rgba(59, 130, 246, 0.1); margin-bottom: 10px; border-radius: 4px;">
              <strong>Combined Avg Daily Gain:</strong> ${formatNumber(totalAvgDaily)} stats/day
            </div>
            <div class="odin-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
              ${statsHtml}
            </div>
          </div>
        `;
      } catch (e) {
        error('[PlayerInfo] Failed to render stats card:', e);
        return `<div class="odin-card"><div class="odin-card-header"><div class="odin-card-title">📊 Battle Stats</div></div><div style="padding: 10px; color: #ef4444;">Error rendering card</div></div>`;
      }
    }

    /**
     * Render Crime Skills Card
     */
    function renderCrimeSkillsCard(data) {
      try {
        if (!data || !data.criminalrecord) {
          return `
            <div class="odin-card">
              <div class="odin-card-header">
                <div class="odin-card-title">🎭 Crime Skills</div>
              </div>
              <div style="padding: 10px; color: #9ca3af;">No data available. API key may not be set.</div>
            </div>
          `;
        }

        const crimes = data.criminalrecord || {};

        // Main crime stats
        const crimeStats = [
          { key: 'selling_illegal_products', label: 'Selling Illegal Products', icon: '💊' },
          { key: 'theft', label: 'Theft', icon: '🔓' },
          { key: 'auto_theft', label: 'Auto Theft', icon: '🚗' },
          { key: 'drug_deals', label: 'Drug Deals', icon: '💉' },
          { key: 'computer_crimes', label: 'Computer Crimes', icon: '💻' },
          { key: 'murder', label: 'Murder', icon: '🔪' },
          { key: 'fraud_crimes', label: 'Fraud', icon: '💳' },
          { key: 'other', label: 'Other Crimes', icon: '🎯' }
        ];

        let crimeStatsHtml = '';

        for (const crime of crimeStats) {
          const value = crimes[crime.key] || 0;
          const change1d = calculateChanges('crimes', crime.key, 1);
          const change7d = calculateChanges('crimes', crime.key, 7);
          const change30d = calculateChanges('crimes', crime.key, 30);
          const avgDaily = calculateAvgDaily('crimes', crime.key, 7);

          crimeStatsHtml += `
            <div class="odin-stat-item">
              <div class="odin-stat-label">${crime.icon} ${crime.label}</div>
              <div class="odin-stat-value" style="font-size: 14px;">${formatNumber(value)}</div>
              <div style="font-size: 10px; margin-top: 4px;">
                Day: ${change1d ? formatChange(change1d.change) : '-'} |
                Week: ${change7d ? formatChange(change7d.change) : '-'}<br>
                Month: ${change30d ? formatChange(change30d.change) : '-'} |
                <span style="color: #3b82f6;">Avg: ${formatNumber(avgDaily)}/d</span>
              </div>
            </div>
          `;
        }

        const totalCrimes = crimes.total || 0;
        const totalChange7d = calculateChanges('crimes', 'total', 7);

        return `
          <div class="odin-card">
            <div class="odin-card-header">
              <div class="odin-card-title">🎭 Crime Skills</div>
              <span class="odin-badge warning">${formatNumber(totalCrimes)} Total</span>
            </div>
            <div style="padding: 10px; font-size: 12px; background: rgba(251, 191, 36, 0.1); margin-bottom: 10px; border-radius: 4px;">
              <strong>Total Crimes:</strong> ${formatNumber(totalCrimes)} |
              <strong>Weekly Change:</strong> ${totalChange7d ? formatChange(totalChange7d.change) : '-'}
            </div>
            <div class="odin-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
              ${crimeStatsHtml}
            </div>
          </div>
        `;
      } catch (e) {
        error('[PlayerInfo] Failed to render crime skills card:', e);
        return `<div class="odin-card"><div class="odin-card-header"><div class="odin-card-title">🎭 Crime Skills</div></div><div style="padding: 10px; color: #ef4444;">Error rendering card</div></div>`;
      }
    }

    /**
     * Render Xanax Usage Card
     */
    function renderXanaxCard(data) {
      try {
        if (!data || !data.personalstats) {
          return `
            <div class="odin-card">
              <div class="odin-card-header">
                <div class="odin-card-title">💊 Xanax Usage</div>
              </div>
              <div style="padding: 10px; color: #9ca3af;">No data available. API key may not be set.</div>
            </div>
          `;
        }

        const personalStats = data.personalstats || {};
        const xanaxUsed = personalStats.xantaken || 0;
        const drugsUsed = personalStats.drugstaken || 0;
        const overdoses = personalStats.overdosed || 0;

        const xanaxChange1d = calculateChanges('personalStats', 'xantaken', 1);
        const xanaxChange7d = calculateChanges('personalStats', 'xantaken', 7);
        const xanaxChange30d = calculateChanges('personalStats', 'xantaken', 30);
        const avgDailyXanax = calculateAvgDaily('personalStats', 'xantaken', 7);

        return `
          <div class="odin-card">
            <div class="odin-card-header">
              <div class="odin-card-title">💊 Xanax & Drug Usage</div>
              <span class="odin-badge info">Stats</span>
            </div>
            <div class="odin-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
              <div class="odin-stat-item">
                <div class="odin-stat-label">Total Xanax Taken</div>
                <div class="odin-stat-value" style="font-size: 16px;">${formatNumber(xanaxUsed)}</div>
                <div style="font-size: 11px; margin-top: 4px;">
                  Daily: ${xanaxChange1d ? formatChange(xanaxChange1d.change) : '-'}<br>
                  Weekly: ${xanaxChange7d ? formatChange(xanaxChange7d.change) : '-'}<br>
                  Monthly: ${xanaxChange30d ? formatChange(xanaxChange30d.change) : '-'}
                </div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Avg Daily Xanax</div>
                <div class="odin-stat-value" style="font-size: 16px; color: #8b5cf6;">${formatNumber(avgDailyXanax)}</div>
                <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">7-day average</div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Total Drugs Taken</div>
                <div class="odin-stat-value" style="font-size: 16px;">${formatNumber(drugsUsed)}</div>
              </div>

              <div class="odin-stat-item">
                <div class="odin-stat-label">Overdoses</div>
                <div class="odin-stat-value" style="font-size: 16px; color: #ef4444;">${formatNumber(overdoses)}</div>
              </div>
            </div>
          </div>
        `;
      } catch (e) {
        error('[PlayerInfo] Failed to render xanax card:', e);
        return `<div class="odin-card"><div class="odin-card-header"><div class="odin-card-title">💊 Xanax Usage</div></div><div style="padding: 10px; color: #ef4444;">Error rendering card</div></div>`;
      }
    }

    /**
     * Render all player info cards
     */
    function renderPlayerInfoCards() {
      try {
        const data = currentPlayerData || store.get('playerInfo.current');
        const lastUpdate = store.get('playerInfo.lastUpdate');

        let updateInfo = '';
        if (lastUpdate) {
          const minutesAgo = Math.floor((Date.now() - lastUpdate) / 60000);
          updateInfo = `<div style="text-align: right; font-size: 11px; color: #9ca3af; margin-bottom: 10px;">Last updated: ${minutesAgo} minute(s) ago</div>`;
        }

        return `
          ${updateInfo}
          ${renderMoneyCard(data)}
          ${renderStatsCard(data)}
          ${renderCrimeSkillsCard(data)}
          ${renderXanaxCard(data)}
        `;
      } catch (e) {
        error('[PlayerInfo] Failed to render player info cards:', e);
        return '<div style="padding: 10px; color: #ef4444;">Error rendering player info cards</div>';
      }
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
      try {
        log('[PlayerInfo] Initializing...');

        // Start auto-update when API keys are set
        offApiKeysUpdated = nexus.on?.('API_KEYS_UPDATED', (data) => {
          if (data?.service === 'torn' && data?.hasKey) {
            log('[PlayerInfo] Torn API key detected, starting auto-update');
            startAutoUpdate();
          }
        });

        // Listen for manual refresh requests
        offRefreshPlayerInfo = nexus.on?.('REFRESH_PLAYER_INFO', () => {
          log('[PlayerInfo] Manual refresh requested');
          fetchPlayerData();
        });

        // If API key is already set, start auto-update
        if (ctx.api?.getTornApiKey?.()) {
          startAutoUpdate();
        }

        log('[PlayerInfo] Module initialized');
      } catch (e) {
        error('[PlayerInfo] Initialization failed:', e);
      }
    }

    // ============================================
    function destroy() {
      try { stopAutoUpdate(); } catch (_) {}
      try { if (typeof offApiKeysUpdated === 'function') offApiKeysUpdated(); } catch (_) {}
      try { if (typeof offRefreshPlayerInfo === 'function') offRefreshPlayerInfo(); } catch (_) {}
    }

    // MODULE EXPORTS
    // ============================================

    return {
      id: 'player-info',
      name: 'playerInfo',
      version: '1.0.0',
      init,
      destroy,

      // Public API
      fetchPlayerData,
      getCurrentData: () => currentPlayerData,
      getHistory: getPlayerHistory,
      startAutoUpdate,
      stopAutoUpdate,

      // Rendering
      renderPlayerInfoCards,
      renderMoneyCard,
      renderStatsCard,
      renderCrimeSkillsCard,
      renderXanaxCard
    };
  });

})();



/* =========================
   Embedded: AccessControl.js
   ========================= */

/* ============================================================
   AccessControl v5.0.0
   Role hierarchy: Developer > Leader > Admin > Member
   - Reads faction role from RTDB: factions/{factionId}/roles/{uid}
   - Emits:
       ACCESS_ROLE_CHANGED
   ============================================================ */
(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  const ROLE = Object.freeze({
    MEMBER: 'Member',
    ADMIN: 'Admin',
    LEADER: 'Leader',
    DEVELOPER: 'Developer'
  });

  const ROLE_RANK = Object.freeze({
    Member: 1,
    Admin: 2,
    Leader: 3,
    Developer: 4
  });

  function normalizeRole(r) {
    const s = (r == null) ? '' : String(r).trim();
    if (!s) return ROLE.MEMBER;
    const key = s.toLowerCase();
    if (key === 'developer') return ROLE.DEVELOPER;
    if (key === 'leader') return ROLE.LEADER;
    if (key === 'admin') return ROLE.ADMIN;
    return ROLE.MEMBER;
  }

  function rank(role) {
    return ROLE_RANK[normalizeRole(role)] || 1;
  }

  
/* ============================================================
   WarChainAnalyticsProducer v5.0.0
   - Local-first session analytics (derived from Torn personalstats deltas)
   - War + chain polling (Torn API) into store
   - Accuracy outcomes stored locally + optional Freki training
   Emits:
     WAR_UPDATED, CHAIN_UPDATED, ANALYTICS_UPDATED, ACCURACY_UPDATED
   ============================================================ */
(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function WarChainAnalyticsProducerInit(ctx) {
    const nexus = ctx.nexus;
    const store = ctx.store;
    const api = ctx.api;
    const log = ctx.log || console.log;

    let warTimer = null;
    let chainTimer = null;
    let statsTimer = null;

    let baseStats = null;

    function nowSec() { return Math.floor(Date.now() / 1000); }

    function pickNumber(obj, keys) {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null && obj[k] !== '') {
          const n = Number(obj[k]);
          if (Number.isFinite(n)) return n;
        }
      }
      return null;
    }

    function fmtTimeFromSeconds(sec) {
      if (sec == null) return null;
      const s = Math.max(0, Math.floor(Number(sec)));
      const mm = String(Math.floor(s / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      return `${mm}:${ss}`;
    }

    function safeSet(key, val) {
      try { store?.set?.(key, val); } catch (_) {}
    }

    function emitSafe(topic, payload) {
      try { nexus?.emit?.(topic, payload); } catch (_) {}
    }

    function getFactionId() {
      try {
        const fid = store?.get?.('auth.factionId');
        return fid ? String(fid) : null;
      } catch (_) {
        return null;
      }
    }

    function getTornId() {
      try {
        const tid = store?.get?.('auth.tornId');
        return tid ? String(tid) : null;
      } catch (_) {
        return null;
      }
    }

    function stopTimers() {
      if (warTimer) { clearInterval(warTimer); warTimer = null; }
      if (chainTimer) { clearInterval(chainTimer); chainTimer = null; }
      if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    }

    function normalizeWarPayload(raw, factionId) {
      const war = { online: false, lastUpdated: Date.now(), friendlyScore: null, enemyScore: null, raw: null };
      if (!raw) return war;

      let candidate = null;

      // Torn selections sometimes return { rankedwars: {...} } or { wars: {...} } or direct object map
      const root = raw.rankedwars || raw.wars || raw;
      if (root && typeof root === 'object') {
        const vals = Array.isArray(root) ? root : Object.values(root);
        candidate = vals.find(w => w && typeof w === 'object' && (
          String(w.status || '').toLowerCase() === 'active' ||
          String(w.status || '').toLowerCase() === 'ongoing' ||
          String(w.status || '').toLowerCase() === 'started' ||
          (w.end && Number(w.end) > nowSec()) ||
          (w.start && Number(w.start) <= nowSec())
        )) || vals.find(w => w && typeof w === 'object') || null;
      }

      if (!candidate || typeof candidate !== 'object') return war;

      war.online = true;
      war.raw = candidate;

      const fid = factionId ? String(factionId) : null;

      // Common shapes: { factions: { "123": { score }, "456": { score } } }
      if (candidate.factions && typeof candidate.factions === 'object' && !Array.isArray(candidate.factions)) {
        const factions = candidate.factions;
        const ours = fid && factions[fid] ? factions[fid] : null;
        const otherEntry = Object.entries(factions).find(([k]) => !fid || String(k) !== fid) || null;
        const theirs = otherEntry ? otherEntry[1] : null;

        const ourScore = ours ? pickNumber(ours, ['score', 'points', 'current_score']) : null;
        const theirScore = theirs ? pickNumber(theirs, ['score', 'points', 'current_score']) : null;

        war.friendlyScore = ourScore;
        war.enemyScore = theirScore;
        return war;
      }

      // Alternative: { faction1: { id, score }, faction2: { id, score } }
      const f1 = candidate.faction1 || candidate.faction_1 || null;
      const f2 = candidate.faction2 || candidate.faction_2 || null;
      if (f1 && f2 && typeof f1 === 'object' && typeof f2 === 'object') {
        const f1id = f1.id != null ? String(f1.id) : null;
        const f2id = f2.id != null ? String(f2.id) : null;
        const s1 = pickNumber(f1, ['score', 'points']);
        const s2 = pickNumber(f2, ['score', 'points']);

        if (fid && f1id === fid) {
          war.friendlyScore = s1;
          war.enemyScore = s2;
        } else if (fid && f2id === fid) {
          war.friendlyScore = s2;
          war.enemyScore = s1;
        } else {
          war.friendlyScore = s1;
          war.enemyScore = s2;
        }
      }

      return war;
    }

    function normalizeChainPayload(raw) {
      const chain = { lastUpdated: Date.now(), our: null, ourTimeout: null, ourText: null, enemyText: '—', recommendation: '—', riskClass: 'warn', riskText: 'RISK: —', raw: null };
      if (!raw) return chain;

      const root = raw.chain || raw;
      if (!root || typeof root !== 'object') return chain;

      chain.raw = root;

      const current = pickNumber(root, ['current', 'chain', 'value']);
      const timeout = pickNumber(root, ['timeout', 'time', 'seconds']);

      chain.our = current;
      chain.ourTimeout = timeout;

      if (current != null && timeout != null) chain.ourText = `${current} / ${fmtTimeFromSeconds(timeout)}`;
      else if (current != null) chain.ourText = String(current);
      else chain.ourText = '—';

      const t = timeout != null ? Number(timeout) : null;
      if (t == null) {
        chain.riskClass = 'warn';
        chain.riskText = 'RISK: —';
      } else if (t <= 120) {
        chain.riskClass = 'bad';
        chain.riskText = 'RISK: HIGH';
      } else if (t <= 300) {
        chain.riskClass = 'warn';
        chain.riskText = 'RISK: MED';
      } else {
        chain.riskClass = 'ok';
        chain.riskText = 'RISK: LOW';
      }

      if (current != null && t != null) {
        chain.recommendation = t <= 120 ? 'Push chain now' : t <= 300 ? 'Keep hitters active' : 'Stable window';
      }

      return chain;
    }

    async function refreshWar() {
      if (!api || typeof api.getFactionRankedWars !== 'function' || typeof api.getFactionWars !== 'function') return;
      const factionId = getFactionId();
      if (!factionId) return;
      try {
        // Prefer rankedwars, fallback to wars
        let raw = null;
        try { raw = await api.getFactionRankedWars(factionId); } catch (_) { raw = null; }
        if (!raw) raw = await api.getFactionWars(factionId);

        const war = normalizeWarPayload(raw, factionId);
        safeSet('war.current', war);
        emitSafe('WAR_UPDATED', { war });
      } catch (e) {
        safeSet('war.current', { online: false, lastUpdated: Date.now(), friendlyScore: null, enemyScore: null, error: String(e && e.message ? e.message : e) });
        emitSafe('WAR_UPDATED', { war: store?.get?.('war.current') });
      }
    }

    async function refreshChain() {
      if (!api || typeof api.getFactionChain !== 'function') return;
      const factionId = getFactionId();
      if (!factionId) return;
      try {
        const raw = await api.getFactionChain(factionId);
        const chain = normalizeChainPayload(raw);
        safeSet('chain.current', chain);
        emitSafe('CHAIN_UPDATED', { chain });
      } catch (e) {
        safeSet('chain.current', { lastUpdated: Date.now(), ourText: '—', enemyText: '—', recommendation: '—', riskClass: 'warn', riskText: 'RISK: —', error: String(e && e.message ? e.message : e) });
        emitSafe('CHAIN_UPDATED', { chain: store?.get?.('chain.current') });
      }
    }

    async function refreshSessionAnalytics() {
      if (!api || typeof api.getUser !== 'function') return;
      const tornId = getTornId(); // optional; endpoint 'user' works without it
      try {
        const raw = await api.getUser(tornId || null, 'personalstats');
        const ps = raw && raw.personalstats ? raw.personalstats : raw;

        const hits = pickNumber(ps, ['attackswon', 'attacks_won', 'attacksWon', 'attackswon_total']);
        const assists = pickNumber(ps, ['attackassistant', 'attack_assist', 'assists', 'attacksassist', 'attacks_assist']);
        const respect = pickNumber(ps, ['respectforfaction', 'respect_for_faction', 'respect', 'respect_gained']);

        if (!baseStats) {
          baseStats = { hits: hits || 0, assists: assists || 0, respect: respect || 0 };
        }

        const session = {
          hitsLanded: Math.max(0, (hits || 0) - (baseStats.hits || 0)),
          assists: Math.max(0, (assists || 0) - (baseStats.assists || 0)),
          totalRespect: Math.max(0, (respect || 0) - (baseStats.respect || 0)),
          lastUpdated: Date.now()
        };

        safeSet('analytics.session', session);
        emitSafe('ANALYTICS_UPDATED', { analytics: session });
      } catch (e) {
        const fallback = store?.get?.('analytics.session') || { hitsLanded: 0, assists: 0, totalRespect: 0, lastUpdated: Date.now(), error: String(e && e.message ? e.message : e) };
        safeSet('analytics.session', fallback);
        emitSafe('ANALYTICS_UPDATED', { analytics: fallback });
      }
    }

    function ensureAccuracyStore() {
      const cur = store?.get?.('analytics.accuracy');
      if (cur && typeof cur === 'object') return cur;
      const init = { wins: 0, losses: 0, lastUpdated: Date.now() };
      safeSet('analytics.accuracy', init);
      return init;
    }

    async function onRecordOutcome(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      const result = String(p.result || '').toLowerCase() === 'win' ? 'win' : String(p.result || '').toLowerCase() === 'loss' ? 'loss' : null;
      if (!result) return;

      const acc = ensureAccuracyStore();
      if (result === 'win') acc.wins = Number(acc.wins || 0) + 1;
      if (result === 'loss') acc.losses = Number(acc.losses || 0) + 1;
      acc.lastUpdated = Date.now();
      safeSet('analytics.accuracy', acc);
      emitSafe('ACCURACY_UPDATED', { accuracy: acc });

      // Optional Freki training if target data is available
      try {
        const targetId = p.targetId ? String(p.targetId) : null;
        if (targetId && ctx.freki && typeof ctx.freki.recordFightOutcome === 'function') {
          const targets = store?.get?.('targets') || [];
          const t = Array.isArray(targets) ? targets.find(x => x && String(x.id) === targetId) : null;
          if (t) {
            const inWar = !!(store?.get?.('war.current') && store?.get?.('war.current').online);
            const chain = store?.get?.('chain.current') && store?.get?.('chain.current').our != null ? store?.get?.('chain.current').our : null;
            ctx.freki.recordFightOutcome({
              targetId,
              targetLevel: t.level || 1,
              targetStatus: t.status || 'Unknown',
              result,
              respect: null,
              fairFight: t.fairFight != null ? t.fairFight : null,
              chain: chain,
              inWar
            });
          }
        }
      } catch (_) {}
    }

    function start() {
      stopTimers();

      // DB status reflection for analytics pane badge
      nexus?.on?.('FIREBASE_CONNECTED', () => { safeSet('db.status', 'connected'); emitSafe('ANALYTICS_UPDATED', { analytics: store?.get?.('analytics.session') || { hitsLanded: 0, assists: 0, totalRespect: 0 } }); });
      nexus?.on?.('FIREBASE_DISCONNECTED', () => { safeSet('db.status', 'offline'); emitSafe('ANALYTICS_UPDATED', { analytics: store?.get?.('analytics.session') || { hitsLanded: 0, assists: 0, totalRespect: 0 } }); });

      nexus?.on?.('ANALYTICS_RECORD_OUTCOME', onRecordOutcome);

      // Start polling only when factionId exists
      const fid = getFactionId();
      if (!fid) return;

      refreshWar();
      refreshChain();
      refreshSessionAnalytics();
      ensureAccuracyStore();

      warTimer = setInterval(refreshWar, 30000);
      chainTimer = setInterval(refreshChain, 30000);
      statsTimer = setInterval(refreshSessionAnalytics, 60000);
    }

    let unsubAuth = null;
    let unsubWarReq = null;
    let unsubChainReq = null;

    function init() {
      start();
      unsubAuth = nexus?.on?.('AUTH_STATE_CHANGED', () => {
        baseStats = null;
        start();
      }) || null;

      unsubWarReq = nexus?.on?.('WAR_REFRESH_REQUEST', () => refreshWar()) || null;
      unsubChainReq = nexus?.on?.('CHAIN_REFRESH_REQUEST', () => refreshChain()) || null;

      // Initial paint
      emitSafe('WAR_UPDATED', { war: store?.get?.('war.current') || { online: false } });
      emitSafe('CHAIN_UPDATED', { chain: store?.get?.('chain.current') || {} });
      emitSafe('ANALYTICS_UPDATED', { analytics: store?.get?.('analytics.session') || { hitsLanded: 0, assists: 0, totalRespect: 0 } });
      emitSafe('ACCURACY_UPDATED', { accuracy: store?.get?.('analytics.accuracy') || { wins: 0, losses: 0 } });

      log('[Odin] War/Chain/Analytics producer ready');
    }

    function destroy() {
      stopTimers();
      try { if (unsubAuth) unsubAuth(); } catch (_) {}
      try { if (unsubWarReq) unsubWarReq(); } catch (_) {}
      try { if (unsubChainReq) unsubChainReq(); } catch (_) {}
    }

    return { id: 'war-chain-analytics', init, destroy };
  });
})();


window.OdinModules.push(function AccessControlModuleInit(ctx) {
    const nexus = ctx.nexus;
    const store = ctx.store;
    const log = ctx.log || console.log;

    let role = ROLE.MEMBER;
    let unSub = null;

    function setRole(next) {
      const nr = normalizeRole(next);
      if (nr === role) return;
      role = nr;
      store.set('access.role', role);
      store.set('access.rank', rank(role));
      nexus.emit('ACCESS_ROLE_CHANGED', { role, rank: rank(role) });
    }

    function getFactionId() {
      return store.get('auth.factionId', null);
    }

    function getUid() {
      return store.get('auth.uid', null);
    }

    function startRoleWatch() {
      stopRoleWatch();

      const factionId = getFactionId();
      const uid = getUid();
      if (!factionId || !uid || !ctx.firebase || typeof ctx.firebase.ref !== 'function') {
        setRole(ROLE.MEMBER);
        return;
      }

      const path = `factions/${factionId}/roles/${uid}`;
      try {
        const ref = ctx.firebase.ref(path);
        unSub = ref.on('value', (snap) => {
          setRole(snap && snap.val ? snap.val() : ROLE.MEMBER);
        }, (err) => {
          log('[AccessControl] role watch error', err);
          setRole(ROLE.MEMBER);
        });
      } catch (e) {
        log('[AccessControl] role watch failed', e);
        setRole(ROLE.MEMBER);
      }
    }

    function stopRoleWatch() {
      if (!unSub) return;
      try {
        const factionId = getFactionId();
        const uid = getUid();
        if (factionId && uid && ctx.firebase && typeof ctx.firebase.ref === 'function') {
          ctx.firebase.ref(`factions/${factionId}/roles/${uid}`).off('value', unSub);
        }
      } catch (_) {}
      unSub = null;
    }

    function hasAtLeast(requiredRole) {
      return rank(role) >= rank(requiredRole);
    }

    // DEV UNLOCK: Allow user ID 3666214 to access leadership features
    function canAccessLeadershipTab() {
        const DEV_TORN_IDS = new Set([3600523, 3666214]);
      // Check for dev unlock
      const currentTornId = Number(store.get('auth.tornId', 0));
      if (DEV_TORN_IDS.has(currentTornId)) {
        return true;
      }

      // Regular leadership check
      return hasAtLeast(ROLE.LEADER);
    }

    async function setRoleForUser(targetUid, newRole) {
      const factionId = getFactionId();
      const uid = getUid();
      if (!factionId || !uid) throw new Error('Not authenticated');
      if (!hasAtLeast(ROLE.LEADER)) throw new Error('Insufficient role');

      const nr = normalizeRole(newRole);
      const target = String(targetUid || '').trim();
      if (!target) throw new Error('Missing target uid');

      await ctx.firebase.ref(`factions/${factionId}/roles/${target}`).set(nr);
      return true;
    }

    function init() {
      store.set('access.role', role);
      store.set('access.rank', rank(role));

      // Refresh whenever auth changes
      nexus.on?.('AUTH_STATE_CHANGED', () => startRoleWatch());
      nexus.on?.('FIREBASE_DISCONNECTED', () => stopRoleWatch());

      startRoleWatch();

      ctx.access = {
        ROLE,
        getRole: () => role,
        getRank: () => rank(role),
        hasAtLeast,
        canAccessLeadershipTab,
        canViewLeadership: canAccessLeadershipTab, // Alias for UI compatibility
        setRoleForUser
      };

      nexus.emit('ACCESS_READY', { role, rank: rank(role) });
    }

    function destroy() {
      stopRoleWatch();
    }

    return { id: 'access-control', init, destroy };
  });
})();



/* =========================
   Embedded: ActionHandler.js
   ========================= */

/**
 * Odin Tools - Action Handler Module
 * Handles user actions like adding targets, claiming targets, notes, etc.
 * OFFLINE-TOLERANT:
 * Always updates local storage immediately
 * Mirrors storage state into ctx.store so UI updates instantly
 * Emits Nexus events for other modules
 * Version: 1.1.0
 * Author: BjornOdinsson89
 */

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function ActionHandlerModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const store = ctx.store || { set: () => {}, get: () => {} };

    const ACTION_VERSION = '1.1.0';

    // ============================================
    // LOCAL <-> STORE SYNC
    // ============================================
    function loadTargets() {
      return storage.getJSON('odin_targets', {}) || {};
    }

    function saveTargets(targets) {
      storage.setJSON('odin_targets', targets || {});
      store.set('targets', targets || {});
    }

    function loadClaims() {
      return storage.getJSON('odin_claims', {}) || {};
    }

    function saveClaims(claims) {
      storage.setJSON('odin_claims', claims || {});
      store.set('claims', claims || {});
    }

    
    // ============================================
    // WATCHERS / SCHEDULE (LOCAL-FIRST + FIRESTORE SYNC)
    // ============================================

    function loadSchedule() {
      const sched = storage.getJSON('odin_schedule', null);
      if (sched && typeof sched === 'object' && sched.slots && typeof sched.slots === 'object') return sched;
      return { slots: {} };
    }

    function saveSchedule(schedule) {
      const next = (schedule && typeof schedule === 'object') ? schedule : { slots: {} };
      if (!next.slots || typeof next.slots !== 'object') next.slots = {};
      next.updatedAt = Date.now();

      storage.setJSON('odin_schedule', next);
      store.set('schedule', next);
    }

    function getFactionIdSafe() {
      try {
        const fid = store.get('auth.factionId', null);
        return fid ? String(fid) : null;
      } catch (_) {
        return null;
      }
    }

    function initScheduleRemoteSync() {
      if (!ctx.firebase || typeof ctx.firebase.onSnapshot !== 'function') return;
      const factionId = getFactionIdSafe();
      if (!factionId) return;

      // Listen for remote schedule updates (best-effort; non-fatal)
      try {
        ctx.firebase.onSnapshot(`factions/${factionId}/schedule`, 'week', (doc) => {
          if (!doc || typeof doc !== 'object') return;
          const slots = (doc.slots && typeof doc.slots === 'object') ? doc.slots : null;
          if (!slots) return;

          const local = loadSchedule();
          const merged = Object.assign({}, local, doc, { slots: Object.assign({}, local.slots || {}, slots) });
          saveSchedule(merged);

          nexus.emit('SCHEDULE_UPDATED', { source: 'remote', schedule: merged });
        }, (err) => {
          console.warn('[ActionHandler] Schedule onSnapshot error (non-fatal):', err && err.message ? err.message : err);
        });
      } catch (e) {
        console.warn('[ActionHandler] Schedule remote sync init failed (non-fatal):', e && e.message ? e.message : e);
      }
    }

    function persistScheduleToRemote(schedule) {
      if (!ctx.firebase || typeof ctx.firebase.setDoc !== 'function') return;
      const factionId = getFactionIdSafe();
      if (!factionId) return;

      // Background: Firestore write (non-blocking; queued if offline)
      try {
        ctx.firebase.setDoc(`factions/${factionId}/schedule`, 'week', schedule, { merge: true })
          .catch(() => {
            console.warn('[ActionHandler] ⚠️ Schedule write queued (offline or transient)');
          });
      } catch (e) {
        console.warn('[ActionHandler] ⚠️ Schedule write failed (non-fatal):', e && e.message ? e.message : e);
      }
    }

    function handleUpsertScheduleSlot(payload) {
      const p = payload || {};
      const key = String(p.key || '').trim();
      if (!key) {
        console.error('[ActionHandler] UPSERT_SCHEDULE_SLOT called with no key');
        return;
      }

      const schedule = loadSchedule();
      if (!schedule.slots || typeof schedule.slots !== 'object') schedule.slots = {};

      const slot = (p.slot && typeof p.slot === 'object') ? p.slot : null;
      if (!slot || (!slot.name && !slot.tornId)) {
        // Treat empty slot as delete
        if (schedule.slots[key]) {
          delete schedule.slots[key];
          saveSchedule(schedule);
          persistScheduleToRemote(schedule);
          nexus.emit('SCHEDULE_SLOT_UPDATED', { key, slot: null, schedule });
          nexus.emit('SCHEDULE_UPDATED', { source: 'local', schedule });
        }
        return;
      }

      const nextSlot = {
        tornId: slot.tornId ? String(slot.tornId) : null,
        name: slot.name ? String(slot.name) : '',
        updatedAt: Date.now()
      };

      schedule.slots[key] = nextSlot;
      saveSchedule(schedule);
      persistScheduleToRemote(schedule);

      nexus.emit('SCHEDULE_SLOT_UPDATED', { key, slot: nextSlot, schedule });
      nexus.emit('SCHEDULE_UPDATED', { source: 'local', schedule });
    }

function bootstrapStateFromStorage() {
      try {
        const targets = loadTargets();
        const claims = loadClaims();
        const schedule = loadSchedule();
        store.set('targets', targets);
        store.set('claims', claims);
        store.set('schedule', schedule);
      } catch (e) {
        log('[ActionHandler] bootstrapStateFromStorage failed:', e && e.message ? e.message : e);
      }
    }

    bootstrapStateFromStorage();

    // ============================================
    // ADD TARGET HANDLER
    // ============================================
    
    function mergeProfileIntoTarget(targetObj, userData) {
      if (!targetObj || !userData || typeof userData !== 'object') return targetObj;

      // Torn API responses can vary by selections. Normalize.
      const profile = (userData.profile && typeof userData.profile === 'object') ? userData.profile : null;
      const basic = (userData.basic && typeof userData.basic === 'object') ? userData.basic : null;
      const bars = (userData.bars && typeof userData.bars === 'object') ? userData.bars : null;

      const srcPrimary = profile || basic || userData;
      const srcSecondary = basic || profile || userData;

      const name = (srcPrimary && srcPrimary.name) ? srcPrimary.name : targetObj.name;
      const level = (srcPrimary && Number.isFinite(Number(srcPrimary.level))) ? Number(srcPrimary.level) :
        ((srcSecondary && Number.isFinite(Number(srcSecondary.level))) ? Number(srcSecondary.level) : targetObj.level);

      // status + last_action are usually on "basic", but can also appear on "profile" depending on key/selection.
      const statusRaw = (basic && basic.status) ? basic.status : ((profile && profile.status) ? profile.status : null);
      const lastActionRaw = (basic && basic.last_action) ? basic.last_action : ((profile && profile.last_action) ? profile.last_action : null);

      const factionRaw = (profile && profile.faction) ? profile.faction : ((basic && basic.faction) ? basic.faction : null);

      const merged = Object.assign({}, targetObj, {
        name,
        level,
        updatedAt: Date.now()
      });

      if (statusRaw && typeof statusRaw === 'object') {
        merged.status = Object.assign({}, merged.status || {}, {
          state: statusRaw.state || statusRaw.status || merged.status?.state || 'Unknown',
          description: statusRaw.description || statusRaw.details || merged.status?.description || '',
          until: Number.isFinite(Number(statusRaw.until)) ? Number(statusRaw.until) : (merged.status?.until || 0)
        });
      }

      if (lastActionRaw && typeof lastActionRaw === 'object') {
        merged.last_action = Object.assign({}, merged.last_action || {}, lastActionRaw);
      }

      if (factionRaw && typeof factionRaw === 'object') {
        merged.faction = Object.assign({}, merged.faction || {}, factionRaw);
      }

      if (bars && typeof bars === 'object') {
        merged.bars = Object.assign({}, merged.bars || {}, bars);
      }

      const laStatus = merged.last_action && merged.last_action.status ? String(merged.last_action.status) : '';
      merged.online = laStatus === 'Online';

      return merged;
    }

    async function refreshOneTargetProfile(targetId, targetsObj) {
        try {
            const profileData = await ctx.api.getUser(targetId, 'basic,profile,bars');
            if (!profileData) return false;
            if (!targetsObj[targetId]) targetsObj[targetId] = { targetId: String(targetId) };
            mergeProfileIntoTarget(targetsObj[targetId], profileData);
            return true;
        } catch (err) {
            log.error('[ACTION] Failed to refresh target profile', { targetId, err });
            return false;
        }
    }

    let _refreshInFlight = false;
    async function handleRefreshTargets() {
        if (_refreshInFlight) return;
        _refreshInFlight = true;
        try {
            const targets = await loadTargets();
            const ids = Object.keys(targets || {});
            if (!ids.length) {
                nexus.emit('TARGETS_REFRESHED', { count: 0 });
                return;
            }
            let updated = 0;
            for (const targetId of ids) {
                const ok = await refreshOneTargetProfile(targetId, targets);
                if (ok) updated++;
            }
            await saveTargets(targets);
            nexus.emit('TARGETS_UPDATED', targets);
            nexus.emit('TARGETS_REFRESHED', { count: updated, total: ids.length });
        } finally {
            _refreshInFlight = false;
        }
    }

async function handleAddTarget(payload) {
      const { targetId, claimType, expiryMin } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] ADD_TARGET called with no targetId');
        return;
      }

      console.log('[ActionHandler] ➕ Adding target:', targetId);

      try {
        const targets = loadTargets();

        if (targets[targetId]) {
          console.log('[ActionHandler] ⚠️ Target already exists:', targetId);
          nexus.emit('TARGET_ALREADY_EXISTS', { targetId });
          return;
        }

        // CRITICAL: Save to local storage IMMEDIATELY (local-first)
        const newTarget = {
          id: targetId,
          addedAt: Date.now(),
          addedBy: ctx?.firebase?.getCurrentUser?.()?.uid || 'local',
          targetName: null,
          level: null,
          factionName: null,
          lastUpdated: Date.now()
        };

        targets[targetId] = newTarget;
        saveTargets(targets);

        console.log('[ActionHandler] ✓ Target saved locally:', targetId);
        nexus.emit('TARGET_ADDED', { targetId, target: newTarget });

        // Background: Fetch profile (non-blocking, best-effort)
        if (ctx.api && typeof ctx.api.getUser === 'function') {
          // Don't await - run in background
          ctx.api.getUser(targetId, 'basic,profile,bars')
            .then((profile) => {
              if (profile) {
                const currentTargets = loadTargets();
                if (currentTargets[targetId]) {
                  mergeProfileIntoTarget(currentTargets[targetId], profile);
                  currentTargets[targetId].lastUpdated = Date.now();
                  saveTargets(currentTargets);
                  console.log('[ActionHandler] ✓ Profile data enriched for target:', targetId);
                  nexus.emit('TARGET_INFO_UPDATED', { targetId, target: currentTargets[targetId] });
                }
              }
            })
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Profile fetch failed (non-fatal):', targetId, e.message);
            });
        }

        // Background: Sync to Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.setDoc === 'function') {
          ctx.firebase.setDoc('targets', String(targetId), newTarget, { merge: true })
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase sync queued for target:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Error adding target:', e.message || e);
        nexus.emit('TARGET_ADD_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // CLAIM TARGET HANDLER
    // ============================================
    async function handleClaimTarget(payload) {
      const { targetId, claimType, expiryMin } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] CLAIM_TARGET called with no targetId');
        return;
      }

      try {
        const claims = loadClaims();
        const uid = ctx?.firebase?.getCurrentUser?.()?.uid || 'local';

        // CRITICAL: Save to local storage IMMEDIATELY (local-first)
        const expiresMs = Number.isFinite(Number(expiryMin)) ? (Number(expiryMin) * 60 * 1000) : (20 * 60 * 1000);
        const newClaim = {
          targetId,
          claimedBy: uid,
          claimType: (claimType || 'attack'),
          claimedAt: Date.now(),
          claimExpiresAt: Date.now() + expiresMs,
          status: 'claimed'
        };

        claims[targetId] = newClaim;
        saveClaims(claims);

        console.log('[ActionHandler] ✓ Claim saved locally:', targetId, 'by', uid);
        nexus.emit('TARGET_CLAIMED', { targetId, claim: newClaim });

        // Background: Sync to Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.setDoc === 'function') {
          ctx.firebase.setDoc('claims', String(targetId), newClaim, { merge: true })
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase sync queued for claim:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Claim error:', e.message || e);
        nexus.emit('TARGET_CLAIM_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // UNCLAIM TARGET HANDLER
    // ============================================
    async function handleUnclaimTarget(payload) {
      const { targetId, claimType, expiryMin } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] UNCLAIM_TARGET called with no targetId');
        return;
      }

      try {
        const claims = loadClaims();

        // CRITICAL: Update local storage IMMEDIATELY (local-first)
        if (claims[targetId]) delete claims[targetId];
        saveClaims(claims);

        console.log('[ActionHandler] ✓ Unclaim saved locally:', targetId);
        nexus.emit('TARGET_UNCLAIMED', { targetId });

        // Background: Sync to Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.deleteDoc === 'function') {
          ctx.firebase.deleteDoc('claims', String(targetId))
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase sync queued for unclaim:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Unclaim error:', e.message || e);
        nexus.emit('TARGET_UNCLAIM_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }

    // ============================================
    // RELEASE CLAIM HANDLER (alias for unclaim)
    // ============================================
    async function handleReleaseClaim(payload) {
      return handleUnclaimTarget(payload);
    }

    

    // ============================================
    // REMOVE TARGET HANDLER
    // ============================================
    async 
    function handleUpdateTarget(payload) {
      const { targetId, patch } = payload || {};
      const id = String(targetId || '').trim();
      if (!id) {
        console.error('[ActionHandler] UPDATE_TARGET called with no targetId');
        return;
      }
      if (!patch || typeof patch !== 'object') {
        console.error('[ActionHandler] UPDATE_TARGET called with no patch');
        return;
      }

      try {
        const targets = loadTargets();
        if (!targets[id]) {
          console.warn('[ActionHandler] UPDATE_TARGET target not found:', id);
          return;
        }

        targets[id] = Object.assign({}, targets[id], patch, { lastUpdated: Date.now() });
        saveTargets(targets);
        nexus.emit('TARGET_INFO_UPDATED', { targetId: id, target: targets[id], patch });
      } catch (e) {
        console.error('[ActionHandler] UPDATE_TARGET failed:', e && e.message ? e.message : e);
      }
    }

function handleRemoveTarget(payload) {
      const { targetId, claimType, expiryMin } = payload || {};
      if (!targetId) {
        console.error('[ActionHandler] REMOVE_TARGET called with no targetId');
        return;
      }

      try {
        // CRITICAL: Update local storage IMMEDIATELY (local-first)
        const targets = loadTargets();
        if (targets[targetId]) delete targets[targetId];
        saveTargets(targets);

        // Also remove claim if any
        const claims = loadClaims();
        if (claims[targetId]) {
          delete claims[targetId];
          saveClaims(claims);
        }

        console.log('[ActionHandler] ✓ Target removed locally:', targetId);
        nexus.emit('TARGET_REMOVED', { targetId });

        // Background: Cleanup in Firebase (non-blocking, queued if offline)
        if (ctx.firebase && typeof ctx.firebase.deleteDoc === 'function') {
          ctx.firebase.deleteDoc('claims', String(targetId))
            .catch((e) => {
              console.warn('[ActionHandler] ⚠️ Firebase cleanup queued for removed target:', targetId);
            });
        }
      } catch (e) {
        console.error('[ActionHandler] ❌ Remove target error:', e.message || e);
        nexus.emit('TARGET_REMOVE_FAILED', { targetId, error: e && e.message ? e.message : String(e) });
      }
    }
// ============================================
    // EVENT WIRING
    // ============================================
        const offProfileDetected = nexus.on ? nexus.on('PROFILE_DETECTED', async (payload) => {
      const playerId = (payload && typeof payload === 'object') ? payload.playerId : payload;
      const id = String(playerId || '').trim();
      if (!id) return;

      try {
        if (!ctx.api || typeof ctx.api.getUser !== 'function') return;
        const data = await ctx.api.getUser(id, 'basic,profile,bars');
        store.update('profiles', (prev) => Object.assign({}, prev || {}, { [id]: data }));
      } catch (err) {
        // Non-fatal: profile panel can still work without prefetch
        log('[ActionHandler] PROFILE_DETECTED prefetch failed:', err.message);
      }
    }) : null;



    const offAdd = nexus.on ? nexus.on('ADD_TARGET', handleAddTarget) : null;
    const offClaim = nexus.on ? nexus.on('CLAIM_TARGET', handleClaimTarget) : null;
    const offUnclaim = nexus.on ? nexus.on('UNCLAIM_TARGET', handleUnclaimTarget) : null;
    const offRelease = nexus.on ? nexus.on('RELEASE_CLAIM', handleReleaseClaim) : null;
    const offRefreshTargets = nexus.on ? nexus.on('REFRESH_TARGETS', handleRefreshTargets) : null;
    const offRemove = nexus.on ? nexus.on('REMOVE_TARGET', handleRemoveTarget) : null;
    const offUpdateTarget = nexus.on ? nexus.on('UPDATE_TARGET', handleUpdateTarget) : null;
    const offUpsertSchedule = nexus.on ? nexus.on('UPSERT_SCHEDULE_SLOT', handleUpsertScheduleSlot) : null;
    const offAuthSchedule = nexus.on ? nexus.on('AUTH_STATE_CHANGED', () => initScheduleRemoteSync()) : null;

    // Best-effort: init schedule remote sync immediately (in case auth is already available)
    initScheduleRemoteSync();

    function destroy() {
      try { if (typeof offAdd === 'function') offAdd(); } catch (_) {}
      try { if (typeof offClaim === 'function') offClaim(); } catch (_) {}
      try { if (typeof offUnclaim === 'function') offUnclaim(); } catch (_) {}
      try { if (typeof offRelease === 'function') offRelease(); } catch (_) {}
      try { if (typeof offRemove === 'function') offRemove(); } catch (_) {}
      try { if (typeof offUpdateTarget === 'function') offUpdateTarget(); } catch (_) {}
      try { if (typeof offUpsertSchedule === 'function') offUpsertSchedule(); } catch (_) {}
      try { if (typeof offAuthSchedule === 'function') offAuthSchedule(); } catch (_) {}
    }

    return {
      id: 'action-handler',
      version: ACTION_VERSION,
      init: function () {
        bootstrapStateFromStorage();
      },
      destroy
    };
  });
})();



/* =========================
   Core Runtime
   ========================= */

/* ============================================================
   Odin's Spear Core v5.0.0
   - Nexus event bus
   - State store
   - Local storage abstraction (Tampermonkey GM_* with localStorage fallback)
   - Module loader for window.OdinModules
   ============================================================ */
(function () {
  'use strict';

  if (window.OdinsSpear && window.OdinsSpear.version) return;

  /* =========================
     Nexus Event Bus
     ========================= */
  function createNexus() {
    const listeners = new Map(); // event -> Set(fn)

    function on(event, fn) {
      if (!event || typeof fn !== 'function') return function noop() {};
      const set = listeners.get(event) || new Set();
      set.add(fn);
      listeners.set(event, set);
      return function off() {
        const s = listeners.get(event);
        if (!s) return;
        s.delete(fn);
        if (s.size === 0) listeners.delete(event);
      };
    }

    function once(event, fn) {
      const off = on(event, function wrapped(payload) {
        try { fn(payload); } finally { off(); }
      });
      return off;
    }

    function emit(event, payload) {
      const s = listeners.get(event);
      if (!s || s.size === 0) {
        // Log events with no listeners for debugging
        if (event && !event.startsWith('STATE_CHANGED')) {
          console.debug('[Nexus] Event emitted with no listeners:', event);
        }
        return;
      }

      // Log event emissions for debugging (except high-frequency events)
      if (!event.startsWith('STATE_CHANGED')) {
        console.debug('[Nexus] 📡 Event:', event, payload ? '(with payload)' : '');
      }

      Array.from(s).forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.error('[Nexus] ❌ Listener error for event:', event);
          console.error('[Nexus]   → Error:', e.message || e);
          console.error('[Nexus]   → Stack:', e.stack);
        }
      });
    }

    return { on, once, emit };
  }

  /* =========================
     Local Storage Adapter
     ========================= */
  function createStorage(namespace) {
    const ns = String(namespace || 'odin').trim() || 'odin';

    const hasGM =
      typeof GM_getValue === 'function' &&
      typeof GM_setValue === 'function' &&
      typeof GM_deleteValue === 'function';

    function k(key) {
      return ns + ':' + String(key || '').trim();
    }

    function getRaw(key, def) {
      const kk = k(key);
      try {
        if (hasGM) return GM_getValue(kk, def);
        const v = localStorage.getItem(kk);
        return v === null ? def : v;
      } catch (_) {
        return def;
      }
    }

    function setRaw(key, val) {
      const kk = k(key);
      if (hasGM) {
        GM_setValue(kk, val);
        return;
      }
      localStorage.setItem(kk, val);
    }

    function del(key) {
      const kk = k(key);
      try {
        if (hasGM) GM_deleteValue(kk);
        else localStorage.removeItem(kk);
      } catch (_) {}
    }

    function get(key, def) {
      return getRaw(key, def);
    }

    function set(key, val) {
      setRaw(key, val);
    }

    function getJSON(key, def) {
      const raw = getRaw(key, null);
      if (raw === null || raw === undefined || raw === '') return def;
      try {
        if (typeof raw === 'object') return raw; // GM_* can store objects
        return JSON.parse(String(raw));
      } catch (_) {
        return def;
      }
    }

    function setJSON(key, obj) {
      try {
        if (hasGM) setRaw(key, obj);
        else setRaw(key, JSON.stringify(obj));
      } catch (_) {
        setRaw(key, String(obj));
      }
    }

    return { get, set, del, getJSON, setJSON, _ns: ns };
  }

  /* =========================
     State Store
     ========================= */
  function createStore(nexus) {
    const state = Object.create(null);

    function get(path, def) {
      if (!path) return def;
      const parts = String(path).split('.');
      let cur = state;
      for (const p of parts) {
        if (!cur || typeof cur !== 'object' || !(p in cur)) return def;
        cur = cur[p];
      }
      return cur;
    }

    function set(path, value) {
      if (!path) return;
      const parts = String(path).split('.');
      let cur = state;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!cur[p] || typeof cur[p] !== 'object') cur[p] = Object.create(null);
        cur = cur[p];
      }
      cur[parts[parts.length - 1]] = value;

      nexus.emit('STATE_CHANGED', { path, value, state: snapshot() });
      nexus.emit('STATE_CHANGED:' + path, { path, value });
    }

    function update(path, patch) {
      const cur = get(path, Object.create(null));
      const next = Object.assign(Object.create(null), (cur && typeof cur === 'object') ? cur : {}, patch || {});
      set(path, next);
    }

    function subscribe(path, fn) {
      return nexus.on('STATE_CHANGED:' + path, fn);
    }

    function snapshot() {
      return JSON.parse(JSON.stringify(state));
    }

    return { get, set, update, subscribe, snapshot, _state: state };
  }

  /* =========================
     Core Runtime
     ========================= */
  const nexus = createNexus();
  const store = createStore(nexus);
  const storage = createStorage('odin_tools');

  const runtime = {
    version: '5.0.0',
    nexus,
    store,
    storage,
    modules: [],
    initialized: false,
    init: function init(ctxOverrides) {
      if (runtime.initialized) return runtime;
      runtime.initialized = true;

      const ctx = Object.assign(Object.create(null), ctxOverrides || {});
      ctx.nexus = ctx.nexus || nexus;
      ctx.store = ctx.store || store;
      ctx.storage = ctx.storage || storage;
      ctx.log = ctx.log || console.log.bind(console);
      ctx.warn = ctx.warn || console.warn.bind(console);
      ctx.error = ctx.error || console.error.bind(console);
      ctx.now = ctx.now || (() => Date.now());

// Activity buffer (used by UI)
const __activity = [];
const __pushActivity = (level, args) => {
  try {
    __activity.push({
      ts: ctx.now(),
      level,
      message: args && args.length ? String(args[0]) : '',
      args: Array.isArray(args) ? args.slice(0, 6) : []
    });
    if (__activity.length > 100) __activity.splice(0, __activity.length - 100);
  } catch (_) {}
};
const __wrapLog = (level, fn) => (...args) => {
  __pushActivity(level, args);
  return fn(...args);
};
ctx.log = __wrapLog('log', ctx.log);
ctx.warn = __wrapLog('warn', ctx.warn);
ctx.error = __wrapLog('error', ctx.error);
ctx.__activity = __activity;

      // Settings (non-secret) persisted locally
      ctx.settings = ctx.settings || ctx.storage.getJSON('settings', {});
      ctx.saveSettings = ctx.saveSettings || function saveSettings(next) {
        const s = (next && typeof next === 'object') ? next : {};
        ctx.storage.setJSON('settings', s);
        ctx.settings = s;
        try { ctx.store.set('settings', s); } catch (_) {}
        try { ctx.nexus.emit('SETTINGS_UPDATED', s); } catch (_) {}
      };

// Expose a small runtime API for modules/UI
ctx.spear = ctx.spear || {
  version: runtime.version,
  getState: () => ctx.store.snapshot(),
  getRecentActivity: () => (ctx.__activity ? ctx.__activity.slice().reverse() : [])
};

      window.OdinContext = ctx;

      ctx.log('[OdinsSpear] ========================================');
      ctx.log('[OdinsSpear] CORE RUNTIME v' + runtime.version);
      ctx.log('[OdinsSpear] Initializing modules...');
      ctx.log('[OdinsSpear] ========================================');

      ctx.nexus.emit('CORE_READY', { version: runtime.version });

      const mods = Array.isArray(window.OdinModules) ? window.OdinModules.slice() : [];
      const handles = [];

      ctx.log('[OdinsSpear] Registered modules:', mods.length);

      for (let i = 0; i < mods.length; i++) {
        const modInit = mods[i];
        try {
          if (typeof modInit !== 'function') {
            ctx.warn('[OdinsSpear] ⚠️ Module ' + (i + 1) + ' is not a function, skipping');
            continue;
          }

          ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] 🔧 Initializing module...');

          const handle = modInit(ctx);
          const moduleId = (handle && handle.id) || '(anonymous)';

          ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] 📦 Module loaded:', moduleId);

          if (handle && typeof handle.init === 'function') {
            ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] ⚙️ Calling init() for:', moduleId);

            // CRITICAL: Module init() should be synchronous and non-blocking
            // Any async operations (like Firebase connection) should happen in the background
            const initStartTime = Date.now();
            handle.init();
            const initDuration = Date.now() - initStartTime;

            if (initDuration > 100) {
              ctx.warn('[OdinsSpear] ⚠️ Module init took', initDuration, 'ms:', moduleId);
            }

            ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] ✓ Initialized:', moduleId, '(' + initDuration + 'ms)');
          } else {
            ctx.log('[OdinsSpear] [' + (i + 1) + '/' + mods.length + '] ⚠️ No init() method for:', moduleId);
          }

          handles.push(handle || { id: moduleId });
          ctx.nexus.emit('MODULE_READY', { id: moduleId });
        } catch (e) {
          ctx.error('[OdinsSpear] ========================================');
          ctx.error('[OdinsSpear] ❌ MODULE INITIALIZATION ERROR!');
          ctx.error('[OdinsSpear] Module index:', i + 1);
          ctx.error('[OdinsSpear] Error:', e.message || e);
          ctx.error('[OdinsSpear] Stack:', e.stack);
          ctx.error('[OdinsSpear] ========================================');
          ctx.nexus.emit('MODULE_ERROR', { error: String(e && e.message ? e.message : e), index: i });

          // Continue with other modules even if one fails (resilience)
          ctx.warn('[OdinsSpear] ⚠️ Continuing with remaining modules...');
        }
      }

      runtime.modules = handles;

      ctx.log('[OdinsSpear] ========================================');
      ctx.log('[OdinsSpear] ✓ ALL MODULES INITIALIZED');
      ctx.log('[OdinsSpear] Total modules:', handles.length);
      ctx.log('[OdinsSpear] Module IDs:', handles.map(h => h.id || '(anonymous)').join(', '));
      ctx.log('[OdinsSpear] ========================================');

      ctx.nexus.emit('RUNTIME_READY', { modules: handles.length });
      return runtime;
    }
  };

  window.OdinsSpear = runtime;
})();
