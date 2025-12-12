// auto-targets.js
// Intelligent Target Suggestion Engine
// Version: 4.0.0 - AI-powered target recommendations with Freki Neural integration

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function AutoTargetsModuleInit(OdinContext) {
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
    let isScanning = false;
    let suggestions = [];
    let scanProgress = 0;
    let myProfile = null;
    let enemyRoster = [];
    let targetPreferences = null;

    // ============================================
    // EVENTS
    // ============================================
    const EVENTS = {
      AUTO_TARGETS_READY: 'AUTO_TARGETS_READY',
      SCAN_STARTED: 'SCAN_STARTED',
      SCAN_PROGRESS: 'SCAN_PROGRESS',
      SCAN_COMPLETED: 'SCAN_COMPLETED',
      SUGGESTIONS_UPDATED: 'SUGGESTIONS_UPDATED',
    };

    // ============================================
    // CONFIGURATION
    // ============================================
    const DEFAULT_PREFERENCES = {
      minFrekiScore: 5.0,           // Minimum score to consider
      maxLevelDiff: 10,             // Max level above/below
      preferHighFF: true,           // Prefer 3x fair fight targets
      preferStatRatio: 0.8,         // Prefer targets with 80%+ of your stats
      preferHospitalized: true,     // Boost hospitalized targets
      avoidTraveling: true,          // Avoid traveling targets
      minRespect: 1.0,              // Minimum base respect
      maxSuggestions: 20,           // Number of suggestions to return
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
      log('[AutoTargets] Initializing v' + VERSION);

      // Load preferences
      targetPreferences = storage.getJSON('auto_target_prefs') || DEFAULT_PREFERENCES;

      // Load my profile
      loadMyProfile();

      nexus.emit(EVENTS.AUTO_TARGETS_READY, { version: VERSION });
      log('[AutoTargets] Ready');
    }

    function destroy() {
      log('[AutoTargets] Destroying...');
      isScanning = false;
      suggestions = [];
    }

    // ============================================
    // PROFILE LOADING
    // ============================================
    async function loadMyProfile() {
      try {
        const profile = await api.tornGet('/user', 'profile,battlestats');
        
        if (profile.error) {
          error('[AutoTargets] Failed to load profile:', profile.error);
          return false;
        }

        // Calculate my battle score
        const myStats = {
          strength: profile.strength || 0,
          defense: profile.defense || 0,
          speed: profile.speed || 0,
          dexterity: profile.dexterity || 0,
          total: (profile.strength || 0) + (profile.defense || 0) + 
                 (profile.speed || 0) + (profile.dexterity || 0),
        };

        myProfile = {
          id: profile.player_id,
          name: profile.name,
          level: profile.level,
          stats: myStats,
          battleScore: window.FrekiNeural?.calculateBattleScore(myStats.total) || 0,
        };

        log('[AutoTargets] Profile loaded:', myProfile.name, 'Level', myProfile.level);
        return true;
      } catch (err) {
        error('[AutoTargets] Profile load error:', err);
        return false;
      }
    }

    // ============================================
    // ENEMY ROSTER LOADING
    // ============================================
    async function loadEnemyRoster(factionId) {
      try {
        log(`[AutoTargets] Loading enemy faction ${factionId}...`);

        const factionData = await api.tornGet(`/faction/${factionId}`, 'basic');

        if (factionData.error) {
          error('[AutoTargets] Failed to load enemy faction:', factionData.error);
          return [];
        }

        const members = [];
        
        if (factionData.members) {
          for (const [id, member] of Object.entries(factionData.members)) {
            members.push({
              id: parseInt(id, 10),
              name: member.name,
              level: member.level || 0,
              status: member.status?.state || 'okay',
              statusUntil: member.status?.until || 0,
              lastAction: member.last_action?.relative || 'Unknown',
              position: member.position || 'Member',
            });
          }
        }

        // Cache to Firestore for future reference
        const firestore = firebase.getFirestore?.();
        if (firestore && members.length > 0) {
          const rosterDoc = firestore.collection('enemyRosters').doc(String(factionId));
          await rosterDoc.set({
            factionId,
            factionName: factionData.name,
            memberCount: members.length,
            lastUpdated: firestore.FieldValue.serverTimestamp(),
          });

          // Save members
          const batch = firestore.batch();
          members.forEach(member => {
            const memberRef = rosterDoc.collection('members').doc(String(member.id));
            batch.set(memberRef, member);
          });
          await batch.commit();
        }

        enemyRoster = members;
        log(`[AutoTargets] Loaded ${members.length} enemy members`);
        return members;

      } catch (err) {
        error('[AutoTargets] Enemy roster load error:', err);
        return [];
      }
    }

    // ============================================
    // TARGET SCANNING
    // ============================================
    async function scanForTargets(enemyFactionId, options = {}) {
      if (isScanning) {
        return { success: false, reason: 'already_scanning' };
      }

      if (!myProfile) {
        await loadMyProfile();
        if (!myProfile) {
          return { success: false, reason: 'profile_load_failed' };
        }
      }

      isScanning = true;
      scanProgress = 0;
      suggestions = [];

      nexus.emit(EVENTS.SCAN_STARTED, { factionId: enemyFactionId });

      try {
        // Load enemy roster
        const roster = await loadEnemyRoster(enemyFactionId);
        
        if (roster.length === 0) {
          isScanning = false;
          return { success: false, reason: 'no_members_found' };
        }

        // Merge options with preferences
        const prefs = { ...targetPreferences, ...options };

        // Score each potential target
        const scoredTargets = [];

        for (let i = 0; i < roster.length; i++) {
          const target = roster[i];

          // Update progress
          scanProgress = ((i + 1) / roster.length) * 100;
          if (i % 10 === 0) {
            nexus.emit(EVENTS.SCAN_PROGRESS, { progress: scanProgress });
          }

          // Apply filters
          if (!passesFilters(target, prefs)) {
            continue;
          }

          // Get additional target info if available
          const targetData = await getTargetData(target.id);
          
          // Estimate target stats if not available
          const targetStats = targetData?.stats?.total || 
                              window.FrekiNeural?.estimateStats(target.level) || 0;

          // Prepare matchup data for Freki
          const matchupData = {
            myLevel: myProfile.level,
            myStats: myProfile.stats.total,
            targetLevel: target.level,
            targetStats,
            chainCount: ctx.currentChain || 0,
            inWar: ctx.inWar || false,
            targetStatus: target.status,
            myEnergy: 100, // Could fetch from API
          };

          // Get Freki prediction
          let frekiResult = null;
          if (window.FrekiNeural?.isReady()) {
            frekiResult = await window.FrekiNeural.predictMatchup(matchupData);
          }

          // Calculate composite score
          const compositeScore = calculateCompositeScore(target, targetData, frekiResult, prefs);

          scoredTargets.push({
            ...target,
            targetData,
            frekiResult,
            compositeScore,
            matchupData,
          });
        }

        // Sort by composite score (descending)
        scoredTargets.sort((a, b) => b.compositeScore - a.compositeScore);

        // Take top suggestions
        suggestions = scoredTargets.slice(0, prefs.maxSuggestions);

        isScanning = false;
        scanProgress = 100;

        nexus.emit(EVENTS.SCAN_COMPLETED, { 
          suggestions: suggestions.length,
          scanned: roster.length,
        });

        nexus.emit(EVENTS.SUGGESTIONS_UPDATED, suggestions);

        log(`[AutoTargets] Scan complete: ${suggestions.length} suggestions from ${roster.length} members`);

        return { success: true, suggestions, scanned: roster.length };

      } catch (err) {
        error('[AutoTargets] Scan error:', err);
        isScanning = false;
        return { success: false, reason: 'error', error: err.message };
      }
    }

    // ============================================
    // FILTERING & SCORING
    // ============================================
    function passesFilters(target, prefs) {
      // Level filter
      const levelDiff = Math.abs(target.level - myProfile.level);
      if (levelDiff > prefs.maxLevelDiff) {
        return false;
      }

      // Status filters
      if (prefs.avoidTraveling && target.status === 'traveling') {
        return false;
      }

      return true;
    }

    function calculateCompositeScore(target, targetData, frekiResult, prefs) {
      let score = 0;

      // Freki score (main factor)
      if (frekiResult) {
        score += frekiResult.frekiScore * 10; // 0-100 points
      } else {
        // Fallback: level-based estimate
        const levelDiff = myProfile.level - target.level;
        if (levelDiff >= 0) {
          score += Math.min(levelDiff * 5, 50);
        }
      }

      // Status bonuses
      if (target.status === 'hospital') {
        score += prefs.preferHospitalized ? 30 : 0;
      }

      if (target.status === 'jail') {
        score += 20;
      }

      // Fair fight bonus
      if (frekiResult && frekiResult.expectedFF >= 2.5 && prefs.preferHighFF) {
        score += 20;
      }

      // Activity penalty (inactive targets are better)
      if (target.lastAction) {
        if (target.lastAction.includes('hour')) {
          score += 10;
        } else if (target.lastAction.includes('day')) {
          score += 20;
        }
      }

      // Level proximity bonus
      const levelDiff = Math.abs(target.level - myProfile.level);
      score += Math.max(0, 10 - levelDiff);

      return Math.round(score);
    }

    // ============================================
    // TARGET DATA FETCHING
    // ============================================
    async function getTargetData(playerId) {
      try {
        // Try to get from cache first
        const cached = storage.getJSON(`target_cache_${playerId}`);
        if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
          return cached.data;
        }

        // Try TornStats
        if (ctx.tornstatsKey) {
          const tsData = await fetchTornStatsData(playerId);
          if (tsData) {
            const data = {
              stats: tsData.stats,
              battleScore: tsData.battleScore,
              lastSeen: tsData.lastSeen,
            };

            // Cache it
            storage.setJSON(`target_cache_${playerId}`, {
              data,
              timestamp: Date.now(),
            });

            return data;
          }
        }

        return null;
      } catch (err) {
        error('[AutoTargets] Failed to get target data:', err);
        return null;
      }
    }

    async function fetchTornStatsData(playerId) {
      try {
        const response = await fetch(
          `https://www.tornstats.com/api/v2/${ctx.tornstatsKey}/spy/${playerId}`
        );

        if (!response.ok) {
          return null;
        }

        const data = await response.json();

        if (data.status && data.spy) {
          return {
            stats: {
              total: data.spy.total || 0,
            },
            battleScore: data.spy.battleScore || 0,
            lastSeen: data.spy.timestamp || 0,
          };
        }

        return null;
      } catch (err) {
        return null;
      }
    }

    // ============================================
    // PREFERENCES MANAGEMENT
    // ============================================
    function getPreferences() {
      return { ...targetPreferences };
    }

    function setPreferences(prefs) {
      targetPreferences = { ...targetPreferences, ...prefs };
      storage.setJSON('auto_target_prefs', targetPreferences);
      return targetPreferences;
    }

    function resetPreferences() {
      targetPreferences = { ...DEFAULT_PREFERENCES };
      storage.setJSON('auto_target_prefs', targetPreferences);
      return targetPreferences;
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const API = {
      version: VERSION,
      EVENTS,

      // Scanning
      scanForTargets,
      isScanning: () => isScanning,
      getProgress: () => scanProgress,

      // Suggestions
      getSuggestions: () => [...suggestions],
      refreshSuggestions: (factionId) => scanForTargets(factionId),

      // Profile
      getMyProfile: () => myProfile ? { ...myProfile } : null,
      refreshProfile: loadMyProfile,

      // Roster
      getEnemyRoster: () => [...enemyRoster],
      loadEnemyRoster,

      // Preferences
      getPreferences,
      setPreferences,
      resetPreferences,
    };

    // Expose globally
    window.AutoTargets = API;

    return { id: 'auto-targets', init, destroy };
  });
})();
