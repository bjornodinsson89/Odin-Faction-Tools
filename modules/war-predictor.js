// war-predictor.js
// Territory & Ranked War Outcome Predictor
// Version: 4.0.0 - AI-powered war analysis and prediction

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function WarPredictorModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const api = ctx.api || { tornGet: async () => ({ ok: false }) };
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const firebase = ctx.firebase || { getFirestore: () => null };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const VERSION = '4.0.0';

    // ============================================
    // STATE
    // ============================================
    let currentPrediction = null;
    let isAnalyzing = false;
    let historicalData = [];

    // ============================================
    // EVENTS
    // ============================================
    const EVENTS = {
      WAR_PREDICTOR_READY: 'WAR_PREDICTOR_READY',
      ANALYSIS_STARTED: 'ANALYSIS_STARTED',
      ANALYSIS_PROGRESS: 'ANALYSIS_PROGRESS',
      ANALYSIS_COMPLETED: 'ANALYSIS_COMPLETED',
      PREDICTION_UPDATED: 'PREDICTION_UPDATED',
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
      log('[WarPredictor] Initializing v' + VERSION);

      // Load historical war data
      historicalData = storage.getJSON('war_history') || [];

      nexus.emit(EVENTS.WAR_PREDICTOR_READY, { version: VERSION });
      log('[WarPredictor] Ready');
    }

    function destroy() {
      log('[WarPredictor] Destroying...');
      isAnalyzing = false;
    }

    // ============================================
    // ROSTER ANALYSIS
    // ============================================
    async function analyzeFaction(factionId) {
      try {
        log(`[WarPredictor] Analyzing faction ${factionId}...`);

        const factionData = await api.tornGet(`/faction/${factionId}`, 'basic,stats');

        if (factionData.error) {
          error('[WarPredictor] Faction load error:', factionData.error);
          return null;
        }

        const members = [];
        let totalLevel = 0;
        let totalEstimatedStats = 0;
        let activeMemberCount = 0;

        if (factionData.members) {
          for (const [id, member] of Object.entries(factionData.members)) {
            const level = member.level || 0;
            const estimatedStats = window.FrekiNeural?.estimateStats(level) || 0;

            // Consider active if last action within 7 days
            const isActive = !member.last_action?.relative?.includes('day') ||
                            parseInt(member.last_action.relative) < 7;

            if (isActive) {
              activeMemberCount++;
            }

            members.push({
              id: parseInt(id, 10),
              name: member.name,
              level,
              estimatedStats,
              battleScore: window.FrekiNeural?.calculateBattleScore(estimatedStats) || 0,
              status: member.status?.state || 'okay',
              isActive,
              position: member.position || 'Member',
            });

            totalLevel += level;
            totalEstimatedStats += estimatedStats;
          }
        }

        // Calculate aggregate metrics
        const analysis = {
          factionId,
          factionName: factionData.name,
          memberCount: members.length,
          activeMemberCount,
          respect: factionData.respect || 0,
          bestChain: factionData.best_chain || 0,
          age: factionData.age || 0,
          
          // Member metrics
          members,
          totalLevel,
          avgLevel: members.length > 0 ? totalLevel / members.length : 0,
          totalEstimatedStats,
          avgStats: members.length > 0 ? totalEstimatedStats / members.length : 0,

          // Power rankings
          topFighters: members
            .sort((a, b) => b.estimatedStats - a.estimatedStats)
            .slice(0, 10),

          // Activity metrics
          activityRate: members.length > 0 ? activeMemberCount / members.length : 0,

          analyzedAt: Date.now(),
        };

        log(`[WarPredictor] Faction ${factionData.name} analyzed: ${members.length} members, avg level ${analysis.avgLevel.toFixed(1)}`);

        return analysis;

      } catch (err) {
        error('[WarPredictor] Faction analysis error:', err);
        return null;
      }
    }

    // ============================================
    // WAR PREDICTION
    // ============================================
    async function predictWar(ourFactionId, enemyFactionId, warType = 'territory') {
      if (isAnalyzing) {
        return { success: false, reason: 'already_analyzing' };
      }

      isAnalyzing = true;
      nexus.emit(EVENTS.ANALYSIS_STARTED, { ourFactionId, enemyFactionId, warType });

      try {
        // Analyze both factions
        nexus.emit(EVENTS.ANALYSIS_PROGRESS, { stage: 'analyzing_our_faction', progress: 0 });
        const ourAnalysis = await analyzeFaction(ourFactionId);

        if (!ourAnalysis) {
          isAnalyzing = false;
          return { success: false, reason: 'our_faction_analysis_failed' };
        }

        nexus.emit(EVENTS.ANALYSIS_PROGRESS, { stage: 'analyzing_enemy_faction', progress: 50 });
        const enemyAnalysis = await analyzeFaction(enemyFactionId);

        if (!enemyAnalysis) {
          isAnalyzing = false;
          return { success: false, reason: 'enemy_faction_analysis_failed' };
        }

        // Calculate matchup predictions
        nexus.emit(EVENTS.ANALYSIS_PROGRESS, { stage: 'calculating_predictions', progress: 75 });
        const prediction = calculateWarPrediction(ourAnalysis, enemyAnalysis, warType);

        // Save prediction
        currentPrediction = {
          ...prediction,
          warType,
          predictedAt: Date.now(),
        };

        // Store in Firestore
        await savePrediction(currentPrediction);

        isAnalyzing = false;
        nexus.emit(EVENTS.ANALYSIS_COMPLETED, currentPrediction);
        nexus.emit(EVENTS.PREDICTION_UPDATED, currentPrediction);

        log('[WarPredictor] Prediction complete:', prediction.winProbability.toFixed(2));

        return { success: true, prediction: currentPrediction };

      } catch (err) {
        error('[WarPredictor] War prediction error:', err);
        isAnalyzing = false;
        return { success: false, reason: 'error', error: err.message };
      }
    }

    function calculateWarPrediction(ourFaction, enemyFaction, warType) {
      // Calculate power metrics
      const ourPower = calculateFactionPower(ourFaction);
      const enemyPower = calculateFactionPower(enemyFaction);

      // Power ratio (key factor)
      const powerRatio = ourPower.total / Math.max(enemyPower.total, 1);

      // Calculate win probability based on multiple factors
      let winProbability = 0.5; // Start at 50/50

      // Factor 1: Overall power (40% weight)
      if (powerRatio > 1) {
        winProbability += Math.min((powerRatio - 1) * 0.2, 0.4);
      } else {
        winProbability -= Math.min((1 - powerRatio) * 0.2, 0.4);
      }

      // Factor 2: Activity rate (20% weight)
      const activityDiff = ourFaction.activityRate - enemyFaction.activityRate;
      winProbability += activityDiff * 0.2;

      // Factor 3: Top fighter advantage (20% weight)
      const ourTopStats = ourFaction.topFighters.slice(0, 5).reduce((sum, f) => sum + f.estimatedStats, 0);
      const enemyTopStats = enemyFaction.topFighters.slice(0, 5).reduce((sum, f) => sum + f.estimatedStats, 0);
      const topFighterRatio = ourTopStats / Math.max(enemyTopStats, 1);
      
      if (topFighterRatio > 1) {
        winProbability += Math.min((topFighterRatio - 1) * 0.1, 0.2);
      } else {
        winProbability -= Math.min((1 - topFighterRatio) * 0.1, 0.2);
      }

      // Factor 4: Member count (10% weight)
      const memberCountRatio = ourFaction.activeMemberCount / Math.max(enemyFaction.activeMemberCount, 1);
      if (memberCountRatio > 1) {
        winProbability += Math.min((memberCountRatio - 1) * 0.05, 0.1);
      } else {
        winProbability -= Math.min((1 - memberCountRatio) * 0.05, 0.1);
      }

      // Factor 5: Experience (10% weight) - faction age and best chain
      const experienceScore = (
        (ourFaction.age / Math.max(enemyFaction.age, 1)) +
        (ourFaction.bestChain / Math.max(enemyFaction.bestChain, 1))
      ) / 2;

      if (experienceScore > 1) {
        winProbability += Math.min((experienceScore - 1) * 0.05, 0.1);
      } else {
        winProbability -= Math.min((1 - experienceScore) * 0.05, 0.1);
      }

      // Clamp probability between 0 and 1
      winProbability = Math.max(0, Math.min(1, winProbability));

      // Generate detailed matchup analysis
      const matchups = generateMatchupMatrix(ourFaction, enemyFaction);

      // Estimate expected outcomes
      const expectedScenarios = generateScenarios(winProbability, ourFaction, enemyFaction);

      return {
        ourFaction: {
          id: ourFaction.factionId,
          name: ourFaction.factionName,
          power: ourPower,
          analysis: ourFaction,
        },
        enemyFaction: {
          id: enemyFaction.factionId,
          name: enemyFaction.factionName,
          power: enemyPower,
          analysis: enemyFaction,
        },
        
        winProbability,
        confidence: calculateConfidence(ourFaction, enemyFaction),
        powerRatio,

        matchups,
        scenarios: expectedScenarios,

        recommendations: generateRecommendations(ourFaction, enemyFaction, matchups),

        keyFactors: [
          {
            factor: 'Overall Power',
            advantage: powerRatio > 1 ? 'our' : 'enemy',
            ratio: powerRatio,
            impact: 'high',
          },
          {
            factor: 'Activity Rate',
            advantage: ourFaction.activityRate > enemyFaction.activityRate ? 'our' : 'enemy',
            difference: (ourFaction.activityRate - enemyFaction.activityRate) * 100,
            impact: 'medium',
          },
          {
            factor: 'Top Fighters',
            advantage: topFighterRatio > 1 ? 'our' : 'enemy',
            ratio: topFighterRatio,
            impact: 'high',
          },
          {
            factor: 'Numbers',
            advantage: ourFaction.activeMemberCount > enemyFaction.activeMemberCount ? 'our' : 'enemy',
            difference: ourFaction.activeMemberCount - enemyFaction.activeMemberCount,
            impact: 'medium',
          },
        ],
      };
    }

    function calculateFactionPower(faction) {
      return {
        total: faction.totalEstimatedStats,
        average: faction.avgStats,
        peak: faction.topFighters.length > 0 ? faction.topFighters[0].estimatedStats : 0,
        depth: faction.topFighters.slice(0, 10).reduce((sum, f) => sum + f.estimatedStats, 0),
        activity: faction.activityRate,
        composite: (
          faction.totalEstimatedStats * 0.4 +
          faction.activeMemberCount * 1000000000 * 0.3 +
          faction.avgStats * faction.memberCount * 0.3
        ),
      };
    }

    function generateMatchupMatrix(ourFaction, enemyFaction) {
      // Create head-to-head matchup matrix
      const matrix = [];

      const ourTop10 = ourFaction.topFighters.slice(0, 10);
      const enemyTop10 = enemyFaction.topFighters.slice(0, 10);

      for (let i = 0; i < Math.max(ourTop10.length, enemyTop10.length); i++) {
        const ourFighter = ourTop10[i];
        const enemyFighter = enemyTop10[i];

        if (ourFighter && enemyFighter) {
          const ratio = ourFighter.estimatedStats / enemyFighter.estimatedStats;
          
          matrix.push({
            rank: i + 1,
            ourFighter: {
              name: ourFighter.name,
              level: ourFighter.level,
              stats: ourFighter.estimatedStats,
            },
            enemyFighter: {
              name: enemyFighter.name,
              level: enemyFighter.level,
              stats: enemyFighter.estimatedStats,
            },
            statRatio: ratio,
            advantage: ratio > 1.1 ? 'our' : ratio < 0.9 ? 'enemy' : 'even',
            expectedOutcome: ratio > 1.2 ? 'win' : ratio < 0.8 ? 'loss' : 'toss-up',
          });
        }
      }

      return matrix;
    }

    function generateScenarios(winProbability, ourFaction, enemyFaction) {
      const scenarios = {
        best: {
          description: 'Best case scenario',
          probability: Math.min(winProbability + 0.15, 1),
          expectedRespect: estimateRespect(ourFaction, enemyFaction, 'best'),
          outcome: 'Decisive victory',
        },
        likely: {
          description: 'Most likely scenario',
          probability: winProbability,
          expectedRespect: estimateRespect(ourFaction, enemyFaction, 'likely'),
          outcome: winProbability > 0.6 ? 'Victory' : winProbability < 0.4 ? 'Defeat' : 'Close fight',
        },
        worst: {
          description: 'Worst case scenario',
          probability: Math.max(winProbability - 0.15, 0),
          expectedRespect: estimateRespect(ourFaction, enemyFaction, 'worst'),
          outcome: 'Difficult fight',
        },
      };

      return scenarios;
    }

    function estimateRespect(ourFaction, enemyFaction, scenario) {
      // Rough respect estimation (very simplified)
      const baseRespect = enemyFaction.memberCount * 10;
      
      if (scenario === 'best') {
        return baseRespect * 1.5;
      } else if (scenario === 'worst') {
        return baseRespect * 0.5;
      }
      
      return baseRespect;
    }

    function generateRecommendations(ourFaction, enemyFaction, matchups) {
      const recommendations = [];

      // Analyze power balance
      const powerRatio = ourFaction.totalEstimatedStats / enemyFaction.totalEstimatedStats;

      if (powerRatio < 0.8) {
        recommendations.push({
          type: 'warning',
          priority: 'high',
          message: 'Enemy faction significantly stronger overall. Focus on hit-and-run tactics.',
        });
      }

      // Activity recommendations
      if (ourFaction.activityRate < enemyFaction.activityRate) {
        recommendations.push({
          type: 'warning',
          priority: 'medium',
          message: 'Enemy has higher activity rate. Ensure maximum participation.',
        });
      }

      // Matchup-specific recommendations
      const advantageousMatchups = matchups.filter(m => m.advantage === 'our').length;
      const disadvantageousMatchups = matchups.filter(m => m.advantage === 'enemy').length;

      if (disadvantageousMatchups > advantageousMatchups) {
        recommendations.push({
          type: 'strategy',
          priority: 'high',
          message: 'Target lower-level enemies. Avoid their top fighters.',
        });
      }

      // Timing recommendations
      recommendations.push({
        type: 'strategy',
        priority: 'medium',
        message: 'Monitor enemy activity patterns. Strike during their low-activity periods.',
      });

      // Numbers advantage
      if (ourFaction.activeMemberCount < enemyFaction.activeMemberCount * 0.7) {
        recommendations.push({
          type: 'warning',
          priority: 'high',
          message: 'Significantly outnumbered. Consider recruiting or seeking allies.',
        });
      }

      return recommendations;
    }

    function calculateConfidence(ourFaction, enemyFaction) {
      // Confidence based on data quality and faction characteristics
      let confidence = 1.0;

      // Reduce confidence if factions are very close in power
      const powerRatio = ourFaction.totalEstimatedStats / enemyFaction.totalEstimatedStats;
      if (powerRatio > 0.9 && powerRatio < 1.1) {
        confidence -= 0.2;
      }

      // Reduce confidence if activity rates are low
      if (ourFaction.activityRate < 0.5 || enemyFaction.activityRate < 0.5) {
        confidence -= 0.1;
      }

      // Reduce confidence if we have limited historical data
      const relevantHistory = historicalData.filter(h =>
        h.ourFactionId === ourFaction.factionId || 
        h.enemyFactionId === enemyFaction.factionId
      );

      if (relevantHistory.length < 3) {
        confidence -= 0.2;
      }

      return Math.max(0.3, Math.min(1, confidence));
    }

    // ============================================
    // PERSISTENCE
    // ============================================
    async function savePrediction(prediction) {
      try {
        const firestore = firebase.getFirestore?.();
        if (!firestore) return;

        await firestore.collection('warPredictions').add(prediction);

        log('[WarPredictor] Prediction saved to Firestore');
      } catch (err) {
        error('[WarPredictor] Save prediction error:', err);
      }
    }

    function saveToHistory(warData) {
      historicalData.unshift(warData);

      // Keep only last 100 wars
      if (historicalData.length > 100) {
        historicalData = historicalData.slice(0, 100);
      }

      storage.setJSON('war_history', historicalData);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const API = {
      version: VERSION,
      EVENTS,

      // Analysis
      analyzeFaction,
      predictWar,
      isAnalyzing: () => isAnalyzing,

      // Predictions
      getCurrentPrediction: () => currentPrediction ? { ...currentPrediction } : null,
      getHistory: () => [...historicalData],
      saveToHistory,

      // Utilities
      calculateFactionPower,
    };

    // Expose globally
    window.WarPredictor = API;

    return { id: 'war-predictor', init, destroy };
  });
})();
