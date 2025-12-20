/**
 * Odin Tools - Log Manager Module
 * Comprehensive logging system for debugging and support
 * Version: 1.0.0
 * Author: BjornOdinsson89
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

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
