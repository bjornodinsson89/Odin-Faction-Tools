// freki.js
// AI Target Scoring Engine with Self-Learning
// Version: 3.1.0 - TornStats and FFScouter integrations intact

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function FrekiModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const api = ctx.api || {};
    const firebase = ctx.firebase || { getRTDB: () => null };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const FREKI_VERSION = '3.1.0';
    const RTDB_VERSION = 'v1';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
      levelBucketSize: 5,
      minSamplesForConfidence: 10,
      maxCacheAge: 3600000, // 1 hour
      syncInterval: 300000, // 5 minutes
      maxLocalBuckets: 200,
      externalDataEnabled: true,
      useTornStats: true,
      useFFScouter: true,
    };

    // ============================================
    // STATE
    // ============================================
    let buckets = {};
    let externalStatCache = new Map();
    let currentModel = null;
    let lastSync = 0;
    let syncInterval = null;

    // ============================================
    // STORAGE HELPERS
    // ============================================
    function loadBuckets() {
      try {
        buckets = storage.getJSON('freki_buckets') || {};
      } catch (e) {
        error('[Freki] Load buckets failed:', e);
        buckets = {};
      }
    }

    function saveBuckets() {
      try {
        storage.setJSON('freki_buckets', buckets);
      } catch (e) {
        error('[Freki] Save buckets failed:', e);
      }
    }

    function loadStats() {
      try {
        return storage.getJSON('freki_stats') || { fights: 0, wins: 0, syncs: 0 };
      } catch (e) {
        return { fights: 0, wins: 0, syncs: 0 };
      }
    }

    function saveStats(stats) {
      try {
        storage.setJSON('freki_stats', stats);
      } catch (e) {
        error('[Freki] Save stats failed:', e);
      }
    }

    // ============================================
    // BUCKETING FUNCTIONS
    // ============================================
    function getLevelBucket(level) {
      const bucketSize = CONFIG.levelBucketSize;
      const lower = Math.floor(level / bucketSize) * bucketSize;
      const upper = lower + bucketSize - 1;
      return `L${lower}-${upper}`;
    }

    function getBucketKey(myLevel, targetLevel, chainRange = 'any', warStatus = 'any') {
      const myBucket = getLevelBucket(myLevel);
      const targetBucket = getLevelBucket(targetLevel);
      return `${myBucket}__${targetBucket}__${chainRange}__${warStatus}`;
    }

    function getChainRange(chainCount) {
      if (chainCount < 10) return 'C0-9';
      if (chainCount < 50) return 'C10-49';
      if (chainCount < 100) return 'C50-99';
      if (chainCount < 250) return 'C100-249';
      if (chainCount < 500) return 'C250-499';
      if (chainCount < 1000) return 'C500-999';
      return 'C1000+';
    }

    // ============================================
    // EXTERNAL DATA SOURCES
    // ============================================

    /**
     * Fetch stat estimate from TornStats
     */
    async function fetchTornStatsData(playerId) {
      if (!CONFIG.useTornStats) return null;

      const apiConfig = window.OdinApiConfig;
      if (!apiConfig?.tornStatsGet) return null;

      try {
        // Check cache first
        const cacheKey = `ts_${playerId}`;
        const cached = externalStatCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CONFIG.maxCacheAge) {
          return cached.data;
        }

        // Fetch from TornStats spy endpoint
        const data = await apiConfig.tornStatsGet(`/spy/${playerId}`);

        if (data && !data.error) {
          const result = {
            playerId,
            total: data.spy?.total || data.total || null,
            strength: data.spy?.strength || null,
            defense: data.spy?.defense || null,
            speed: data.spy?.speed || null,
            dexterity: data.spy?.dexterity || null,
            source: 'tornstats',
            timestamp: Date.now(),
          };

          externalStatCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (e) {
        log('[Freki] TornStats fetch failed:', e.message);
      }

      return null;
    }

    /**
     * Fetch battle score from Fair Fight Scouter
     */
    async function fetchFFScouterData(playerId) {
      if (!CONFIG.useFFScouter) return null;

      const apiConfig = window.OdinApiConfig;
      if (!apiConfig?.ffScouterGet) return null;

      try {
        // Check cache first
        const cacheKey = `ffs_${playerId}`;
        const cached = externalStatCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CONFIG.maxCacheAge) {
          return cached.data;
        }

        // Fetch from FFScouter
        const data = await apiConfig.ffScouterGet(`/player/${playerId}`);

        if (data && data.battleScore) {
          const result = {
            playerId,
            battleScore: data.battleScore,
            estimatedStats: data.estimatedStats || null,
            fairFightRange: data.fairFightRange || null,
            source: 'ffscouter',
            timestamp: Date.now(),
          };

          externalStatCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (e) {
        log('[Freki] FFScouter fetch failed:', e.message);
      }

      return null;
    }

    /**
     * Get combined external data for a player
     */
    async function getExternalData(playerId) {
      if (!CONFIG.externalDataEnabled) return null;

      const results = await Promise.allSettled([
        fetchTornStatsData(playerId),
        fetchFFScouterData(playerId),
      ]);

      const tornStats = results[0].status === 'fulfilled' ? results[0].value : null;
      const ffScouter = results[1].status === 'fulfilled' ? results[1].value : null;

      if (!tornStats && !ffScouter) return null;

      return {
        tornStats,
        ffScouter,
        bestEstimate: tornStats?.total || ffScouter?.estimatedStats || null,
        battleScore: ffScouter?.battleScore || null,
        confidence: (tornStats ? 0.5 : 0) + (ffScouter ? 0.5 : 0),
      };
    }

    // ============================================
    // SCORING FUNCTIONS
    // ============================================

    /**
     * Calculate Battle Stat Score from individual stats
     * BS = sqrt(STR) + sqrt(DEF) + sqrt(SPD) + sqrt(DEX)
     */
    function calculateBattleScore(stats) {
      if (!stats) return null;
      const { strength, defense, speed, dexterity } = stats;
      if (!strength || !defense || !speed || !dexterity) return null;

      return Math.sqrt(strength) + Math.sqrt(defense) + Math.sqrt(speed) + Math.sqrt(dexterity);
    }

    /**
     * Estimate fair fight multiplier from stat ratio
     */
    function estimateFairFight(myBattleScore, targetBattleScore) {
      if (!myBattleScore || !targetBattleScore) return null;

      const ratio = Math.min(myBattleScore, targetBattleScore) / Math.max(myBattleScore, targetBattleScore);

      // FF algorithm: >= 0.75 ratio = 3.0x, scales down to 1.0x
      if (ratio >= 0.75) return 3.0;
      return 1.0 + (ratio / 0.75) * 2.0;
    }

    /**
     * Score a matchup based on available data
     */
    function scoreMatchup(params) {
      const {
        myLevel,
        targetLevel,
        targetId = null,
        myStats = null,
        targetStats = null,
        externalData = null,
        chainCount = 0,
        warStatus = 'peace',
      } = params;

      // Start with level-based baseline
      const levelDiff = myLevel - targetLevel;
      let baseScore = 2.5; // Neutral

      // Level difference adjustment
      if (levelDiff > 20) baseScore += 1.5;
      else if (levelDiff > 10) baseScore += 1.0;
      else if (levelDiff > 5) baseScore += 0.5;
      else if (levelDiff < -20) baseScore -= 1.5;
      else if (levelDiff < -10) baseScore -= 1.0;
      else if (levelDiff < -5) baseScore -= 0.5;

      // Bucket data adjustment
      const bucketKey = getBucketKey(myLevel, targetLevel, getChainRange(chainCount), warStatus);
      const bucket = buckets[bucketKey];

      if (bucket && bucket.fights >= CONFIG.minSamplesForConfidence) {
        const winRate = bucket.wins / bucket.fights;
        // Adjust score based on historical win rate
        baseScore += (winRate - 0.5) * 2; // -1 to +1 adjustment
      }

      // External data adjustment
      if (externalData) {
        if (externalData.battleScore && myStats) {
          const myBattleScore = calculateBattleScore(myStats);
          if (myBattleScore) {
            const ff = estimateFairFight(myBattleScore, externalData.battleScore);
            if (ff) {
              // Higher FF means closer fight, adjust score
              baseScore += (ff - 2) * 0.5; // -0.5 to +0.5 adjustment
            }
          }
        }

        // Confidence boost
        baseScore = baseScore * (0.8 + externalData.confidence * 0.4);
      }

      // Model adjustment if available
      if (currentModel?.weights) {
        const modelScore = applyModel(params, currentModel);
        if (modelScore !== null) {
          baseScore = baseScore * 0.6 + modelScore * 0.4; // Blend with model
        }
      }

      // Clamp score to 0-5 range
      const score = Math.max(0, Math.min(5, baseScore));

      // Generate label
      let label = '';
      if (score >= 4.5) label = 'Easy';
      else if (score >= 3.5) label = 'Favorable';
      else if (score >= 2.5) label = 'Even';
      else if (score >= 1.5) label = 'Risky';
      else label = 'Dangerous';

      return {
        score,
        label,
        confidence: calculateConfidence(bucket, externalData),
        factors: {
          levelDiff,
          bucketWinRate: bucket ? bucket.wins / bucket.fights : null,
          externalData: !!externalData,
          modelApplied: !!currentModel,
        },
      };
    }

    function calculateConfidence(bucket, externalData) {
      let confidence = 0.3; // Base confidence

      if (bucket) {
        const sampleBonus = Math.min(0.3, bucket.fights / 100 * 0.3);
        confidence += sampleBonus;
      }

      if (externalData) {
        confidence += externalData.confidence * 0.3;
      }

      if (currentModel) {
        confidence += 0.1;
      }

      return Math.min(1, confidence);
    }

    function applyModel(params, model) {
      if (!model?.weights) return null;

      try {
        const features = [
          params.myLevel / 100,
          params.targetLevel / 100,
          (params.myLevel - params.targetLevel) / 50,
          params.chainCount ? Math.log10(params.chainCount + 1) / 5 : 0,
        ];

        let score = model.bias || 2.5;
        for (let i = 0; i < features.length && i < model.weights.length; i++) {
          score += features[i] * model.weights[i];
        }

        return Math.max(0, Math.min(5, score));
      } catch (e) {
        return null;
      }
    }

    // ============================================
    // FIGHT RECORDING
    // ============================================

    /**
     * Record a fight outcome for learning
     */
    function recordFight(params) {
      const {
        myLevel,
        targetLevel,
        targetId,
        result, // 'win', 'loss', 'escape', 'stalemate'
        respect = 0,
        fairFight = 1,
        chainCount = 0,
        warStatus = 'peace',
      } = params;

      const bucketKey = getBucketKey(myLevel, targetLevel, getChainRange(chainCount), warStatus);

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = {
          fights: 0,
          wins: 0,
          respect: 0,
          avgFairFight: 0,
          lastUpdated: Date.now(),
        };
      }

      const bucket = buckets[bucketKey];
      bucket.fights++;
      if (result === 'win' || result === 'hospitalized' || result === 'mugged') {
        bucket.wins++;
        bucket.respect += respect;
      }
      bucket.avgFairFight = (bucket.avgFairFight * (bucket.fights - 1) + fairFight) / bucket.fights;
      bucket.lastUpdated = Date.now();

      saveBuckets();

      // Update stats
      const stats = loadStats();
      stats.fights++;
      if (result === 'win') stats.wins++;
      saveStats(stats);

      // Queue for backend sync
      queueSample({
        bucketKey,
        myLevel,
        targetLevel,
        result,
        respect,
        fairFight,
        chainCount,
        warStatus,
        timestamp: Date.now(),
      });

      log('[Freki] Fight recorded:', bucketKey, result);
      nexus.emit('FREKI_FIGHT_RECORDED', { bucketKey, result });

      return bucket;
    }

    // ============================================
    // BACKEND SYNC
    // ============================================
    let pendingSamples = [];

    function queueSample(sample) {
      pendingSamples.push(sample);

      // Auto-sync when enough samples accumulated
      if (pendingSamples.length >= 10) {
        sendSamplesToBackend();
      }
    }

    async function sendSamplesToBackend() {
      if (pendingSamples.length === 0) return;

      const samples = [...pendingSamples];
      pendingSamples = [];

      try {
        const rtdb = firebase.getRTDB?.();
        if (rtdb) {
          // Write directly to RTDB
          const clientId = ctx.clientId || `client_${ctx.userId || 'anon'}`;
          const path = `freki/${RTDB_VERSION}/clients/${clientId}/samples`;

          const updates = {};
          samples.forEach((sample, i) => {
            updates[`${Date.now()}_${i}`] = sample;
          });

          await rtdb.ref(path).update(updates);
          log('[Freki] Synced', samples.length, 'samples to RTDB');
        } else if (api.backendPost) {
          // Fallback to backend API
          await api.backendPost('/freki/samples', { samples });
          log('[Freki] Synced', samples.length, 'samples via API');
        }

        const stats = loadStats();
        stats.syncs++;
        saveStats(stats);

      } catch (e) {
        error('[Freki] Backend sync failed:', e);
        // Re-queue failed samples
        pendingSamples = [...samples, ...pendingSamples];
      }
    }

    async function syncBucketsToBackend() {
      try {
        const rtdb = firebase.getRTDB?.();
        if (!rtdb) return;

        const clientId = ctx.clientId || `client_${ctx.userId || 'anon'}`;
        const path = `freki/${RTDB_VERSION}/clients/${clientId}/buckets`;

        await rtdb.ref(path).set(buckets);
        lastSync = Date.now();
        log('[Freki] Buckets synced to RTDB');

      } catch (e) {
        error('[Freki] Bucket sync failed:', e);
      }
    }

    // ============================================
    // MODEL REFRESH
    // ============================================

    async function refreshModel() {
      try {
        const rtdb = firebase.getRTDB?.();
        if (rtdb) {
          const snapshot = await rtdb.ref(`freki/${RTDB_VERSION}/model`).once('value');
          const model = snapshot.val();

          if (model && model.version !== currentModel?.version) {
            currentModel = model;
            log('[Freki] Model updated to version', model.version);
            nexus.emit('FREKI_MODEL_UPDATED', model);
          }
        } else if (api.backendGet) {
          const response = await api.backendGet('/freki/model');
          if (response?.model) {
            currentModel = response.model;
            log('[Freki] Model fetched from API');
          }
        }
      } catch (e) {
        error('[Freki] Model refresh failed:', e);
      }
    }

    async function refreshAggregates() {
      try {
        const rtdb = firebase.getRTDB?.();
        if (!rtdb) return;

        const snapshot = await rtdb.ref(`freki/${RTDB_VERSION}/aggregates/levelBuckets`).once('value');
        const aggregates = snapshot.val();

        if (aggregates) {
          // Merge aggregates into local buckets for scoring
          for (const [key, data] of Object.entries(aggregates)) {
            if (!buckets[key] || buckets[key].fights < data.fights) {
              buckets[key] = { ...buckets[key], ...data, source: 'aggregate' };
            }
          }
          log('[Freki] Aggregates merged:', Object.keys(aggregates).length);
        }
      } catch (e) {
        error('[Freki] Aggregates refresh failed:', e);
      }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const Freki = {
      version: FREKI_VERSION,

      /**
       * Score a potential matchup
       */
      scoreMatchup,

      /**
       * Score with async external data fetch
       */
      async scoreMatchupAsync(params) {
        let externalData = null;
        if (params.targetId && CONFIG.externalDataEnabled) {
          externalData = await getExternalData(params.targetId);
        }
        return scoreMatchup({ ...params, externalData });
      },

      /**
       * Record a fight outcome
       */
      recordFight,

      /**
       * Get bucket data
       */
      getBucket(myLevel, targetLevel) {
        const key = getBucketKey(myLevel, targetLevel);
        return buckets[key] || null;
      },

      /**
       * Get all buckets
       */
      getAllBuckets() {
        return { ...buckets };
      },

      /**
       * Get stats
       */
      getStats() {
        return loadStats();
      },

      /**
       * Get current model info
       */
      getModel() {
        return currentModel ? { ...currentModel } : null;
      },

      /**
       * Refresh model from backend
       */
      refreshModel,

      /**
       * Force sync to backend
       */
      async forceSync() {
        await sendSamplesToBackend();
        await syncBucketsToBackend();
      },

      /**
       * Get external data for a player
       */
      getExternalData,

      /**
       * Clear local data
       */
      clearData() {
        buckets = {};
        saveBuckets();
        saveStats({ fights: 0, wins: 0, syncs: 0 });
        externalStatCache.clear();
        log('[Freki] Data cleared');
      },

      /**
       * Update configuration
       */
      updateConfig(updates) {
        Object.assign(CONFIG, updates);
        log('[Freki] Config updated:', updates);
      },
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[Freki] Initializing v' + FREKI_VERSION);

      loadBuckets();

      // Expose globally
      window.Freki = Freki;

      // Start periodic sync
      syncInterval = setInterval(() => {
        sendSamplesToBackend();

        // Refresh model and aggregates every 5 minutes
        if (Date.now() - lastSync > CONFIG.syncInterval) {
          refreshModel();
          refreshAggregates();
          lastSync = Date.now();
        }
      }, 60000); // Check every minute

      // Initial model fetch
      setTimeout(() => {
        refreshModel();
        refreshAggregates();
      }, 5000);

      nexus.emit('FREKI_READY', { version: FREKI_VERSION });
      log('[Freki] Ready');
    }

    function destroy() {
      log('[Freki] Destroying...');

      if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
      }

      // Final sync attempt
      sendSamplesToBackend();

      window.Freki = null;
      log('[Freki] Destroyed');
    }

    return { id: 'freki', init, destroy };
  });
})();
