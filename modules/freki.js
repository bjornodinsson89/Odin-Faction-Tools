// == Freki v2.1: 
// Author BjornOdinsson89
// This module estimates and enriches stat data for Torn players using TornStats, FFScouter, heuristics, and syncs via Firebase.

(function() {
  const Freki = {};
  const CACHE = new Map();

  function getStorage(ctx) {
    return ctx?.storage || {
      getJSON: () => null,
      setJSON: () => {}
    };
  }

  function nowSec() {
    return Math.floor(Date.now() / 1000);
  }

  function normalizeSource(name) {
    if (!name) return 'freki-estimate';
    return String(name).toLowerCase();
  }

  function tierFromScore(score) {
    if (score <= 0.33) return 'easy';
    if (score <= 0.66) return 'med';
    return 'hard';
  }

  function estimateStatsFromProfile(profile) {
    const lvl = profile?.level || 1;
    let total = Math.pow(lvl, 2.1) * 1000;
    if (profile?.rank && typeof profile.rank === 'string') {
      if (profile.rank.includes('Colonel') || profile.rank.includes('Director')) {
        total *= 1.4;
      } else if (profile.rank.includes('Leader')) {
        total *= 1.8;
      }
    }
    return Math.floor(total);
  }

  async function fetchTornStats(playerId) {
    if (!window.TornStats?.get) return null;
    try {
      const stats = await window.TornStats.get(playerId);
      if (!stats || !stats.total) return null;
      return {
        total: stats.total,
        source: 'tornstats'
      };
    } catch {
      return null;
    }
  }

  async function fetchFFScouter(playerId) {
    if (!window.FFScouter?.get) return null;
    try {
      const result = await window.FFScouter.get(playerId);
      if (!result || !result.intel || !result.intel.total) return null;
      return {
        total: result.intel.total,
        source: 'ffscouter'
      };
    } catch {
      return null;
    }
  }

  async function fetchRemote(ctx, playerId) {
    if (!ctx?.firebase?.getFirestore) return null;
    try {
      const db = ctx.firebase.getFirestore();
      const docRef = db.collection('freki_stats').doc(String(playerId));
      const snap = await docRef.get();
      if (!snap.exists) return null;
      return snap.data();
    } catch {
      return null;
    }
  }

  async function saveRemote(ctx, playerId, payload) {
    if (!ctx?.firebase?.getFirestore || !ctx?.access?.canWriteLeaderOps?.()) return false;
    try {
      const db = ctx.firebase.getFirestore();
      const docRef = db.collection('freki_stats').doc(String(playerId));
      await docRef.set(payload, { merge: true });
      return true;
    } catch {
      return false;
    }
  }

  function buildResult(playerId, estTotal, source, learnedFrom) {
    const matchupScore = 1 - 1 / (1 + Math.log10(1 + estTotal));
    return {
      playerId,
      estTotal,
      matchupScore,
      tier: tierFromScore(matchupScore),
      source: normalizeSource(source),
      learnedFrom: learnedFrom || [normalizeSource(source)],
      lastUpdated: nowSec()
    };
  }

  Freki.analyzeTarget = async function(ctx, playerId, profile, opts) {
    opts = opts || {};
    const {
      forceRefresh = false,
      allowRemoteFetch = true,
      allowRemoteWrite = true,
      useLocalStorage = true
    } = opts;

    const cacheKey = String(playerId);
    const storage = getStorage(ctx);

    if (!forceRefresh && CACHE.has(cacheKey)) {
      return CACHE.get(cacheKey);
    }

    let stored = null;
    if (!forceRefresh && useLocalStorage) {
      stored = storage.getJSON(`freki:learned:${playerId}`, null);
      if (stored && nowSec() - stored.lastUpdated < 604800) {
        CACHE.set(cacheKey, stored);
        return stored;
      }
    }

    const sources = await Promise.all([
      fetchTornStats(playerId),
      fetchFFScouter(playerId)
    ]);

    const real = sources.find(x => x && x.total);
    let result;

    if (real) {
      result = buildResult(playerId, real.total, real.source, sources.filter(x => x).map(x => x.source));
    } else {
      const est = estimateStatsFromProfile(profile);
      result = buildResult(playerId, est, 'freki-estimate', []);
    }

    CACHE.set(cacheKey, result);
    if (useLocalStorage) storage.setJSON(`freki:learned:${playerId}`, result);

    if (allowRemoteWrite && result.source !== 'freki-estimate') {
      void saveRemote(ctx, playerId, {
        ...result,
        learnedBy: {
          uid: ctx?.auth?.uid || 'anon',
          displayName: ctx?.auth?.displayName || 'Unknown',
          factionId: ctx?.auth?.factionId || null
        },
        version: 1
      });
    }

    if (!real && allowRemoteFetch) {
      const remote = await fetchRemote(ctx, playerId);
      if (remote && remote.estTotal) {
        const enriched = buildResult(playerId, remote.estTotal, 'learned-remote', ['learned-remote']);
        CACHE.set(cacheKey, enriched);
        if (useLocalStorage) storage.setJSON(`freki:learned:${playerId}`, enriched);
        return enriched;
      }
    }

    return result;
  };

  Freki.getCached = function(playerId) {
    return CACHE.get(String(playerId)) || null;
  };

  Freki.invalidate = function(playerId) {
    CACHE.delete(String(playerId));
  };

  Freki.getAllLocal = function(ctx) {
    const s = getStorage(ctx);
    const keys = (typeof GM_listValues === 'function' ? GM_listValues() : [])
      .filter(k => k.startsWith('freki:learned:'));
    return keys.map(k => s.getJSON(k, null)).filter(Boolean);
  };

  window.Freki = Freki;
})();
