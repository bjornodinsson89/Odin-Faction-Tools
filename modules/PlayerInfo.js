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

        const selections = 'profile,money,personalstats,battlestats,crimes,networth';
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
        nexus.on?.('API_KEYS_UPDATED', (data) => {
          if (data?.service === 'torn' && data?.hasKey) {
            log('[PlayerInfo] Torn API key detected, starting auto-update');
            startAutoUpdate();
          }
        });

        // Listen for manual refresh requests
        nexus.on?.('REFRESH_PLAYER_INFO', () => {
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
    // MODULE EXPORTS
    // ============================================

    return {
      name: 'playerInfo',
      version: '1.0.0',
      init,

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
