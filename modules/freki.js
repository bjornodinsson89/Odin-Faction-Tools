// freki.js - Freki "Supermath" Brain for Odin
// Buckets fight data by myLevel / opponentLevel + chain + war flag,
// uploads anonymised stats to Firebase, and exposes scoring helpers.
//

(function () {
  'use strict';

  // Ensure OdinModules exists
  window.OdinModules = window.OdinModules || [];

  window.OdinModules.push(function FrekiModuleInit(OdinContext) {
    const state = OdinContext.getState();
    const api = OdinContext.api;       // BaseModule._apiModule
    const logic = OdinContext.logic;   // OdinLogic
    const nexus = OdinContext.nexus;   // Nexus bus if we want it

    const FREKI_VERSION = 'v1';
    const FIREBASE_ROOT =
      'https://torn-war-room-default-rtdb.firebaseio.com/freki/' + FREKI_VERSION;

    const Freki = {
      version: FREKI_VERSION,
      clientId: null,          // hashed client ID
      myUserId: null,          // my actual Torn userId (not stored remotely)
      myBuckets: {},           // this client's buckets (local aggregate)
      buckets: {},             // merged buckets from all clients
      lastAttackTs: 0,         // last processed attack timestamp
      ready: false,
      syncInterval: null,
      refreshInterval: null,
    };

    // ---------- Small helpers ----------

    // Lightweight non-crypto hash so we don't store raw IDs.
    function fnv1aHash(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return ('00000000' + h.toString(16)).slice(-8);
    }

    function levelBucket(level) {
      level = Number(level) || 0;
      if (level <= 0) return 'L0';
      const size = 5;
      const start = Math.floor((level - 1) / size) * size + 1;
      const end = start + size - 1;
      return `L${start}-${end}`;
    }

    function chainBucket(chainCount) {
      chainCount = Number(chainCount) || 0;
      if (chainCount < 10) return 'C0-9';
      if (chainCount < 50) return 'C10-49';
      if (chainCount < 100) return 'C50-99';
      if (chainCount < 250) return 'C100-249';
      if (chainCount < 500) return 'C250-499';
      if (chainCount < 1000) return 'C500-999';
      if (chainCount < 2500) return 'C1000-2499';
      if (chainCount < 5000) return 'C2500-4999';
      if (chainCount < 10000) return 'C5000-9999';
      return 'C10000+';
    }

    /**
     * KEY FORMAT:
     *   MyLevelBucket__OpponentLevelBucket__ChainBucket__WAR/PEACE
     * This is now strictly "me vs opponent", regardless of whether I was
     * attacker or defender in the original attack.
     */
    function getBucketKey(myLevel, oppLevel, chainCount, isWar) {
      const myB = levelBucket(myLevel);
      const oppB = levelBucket(oppLevel);
      const cB = chainBucket(chainCount);
      const wB = isWar ? 'WAR' : 'PEACE';
      return `${myB}__${oppB}__${cB}__${wB}`;
    }

    function updateLocalBucket(bucketKey, payload) {
      const {
        respect = 0,
        energy = 25,
        win = true,
        ts = 0,
      } = payload || {};

      let b = Freki.myBuckets[bucketKey];
      if (!b) {
        b = Freki.myBuckets[bucketKey] = {
          count: 0,
          win_count: 0,
          loss_count: 0,
          total_respect: 0,
          total_energy: 0,
          last_ts: 0,
        };
      }

      b.count += 1;
      if (win) b.win_count += 1;
      else b.loss_count += 1;
      b.total_respect += respect;
      b.total_energy += energy;
      if (ts > b.last_ts) b.last_ts = ts;
    }

    function mergeClientBuckets(clientsNode) {
      const merged = {};

      if (!clientsNode || typeof clientsNode !== 'object') {
        return merged;
      }

      for (const clientId in clientsNode) {
        const client = clientsNode[clientId];
        if (!client || !client.buckets) continue;
        const buckets = client.buckets;

        for (const key in buckets) {
          const b = buckets[key];
          if (!b) continue;

          if (!merged[key]) {
            merged[key] = {
              count: 0,
              win_count: 0,
              loss_count: 0,
              total_respect: 0,
              total_energy: 0,
              last_ts: 0,
              avg_respect: 0,
              avg_rpe: 0,
              win_rate: 0,
            };
          }

          const m = merged[key];

          m.count += Number(b.count || 0);
          m.win_count += Number(b.win_count || 0);
          m.loss_count += Number(b.loss_count || 0);
          m.total_respect += Number(b.total_respect || 0);
          m.total_energy += Number(b.total_energy || 0);
          if (b.last_ts && b.last_ts > m.last_ts) m.last_ts = b.last_ts;
        }
      }

      // ---- FIX #5: Safe math (no division by zero) ----
      for (const key in merged) {
        const m = merged[key];
        const cnt = Number(m.count) || 0;
        const totalRespect = Number(m.total_respect) || 0;
        const totalEnergy = Number(m.total_energy) || 0;

        if (cnt > 0) {
          m.avg_respect = totalRespect / cnt;
          m.win_rate = m.win_count / cnt;
        } else {
          m.avg_respect = 0;
          m.win_rate = 0;
        }

        if (totalEnergy > 0) {
          m.avg_rpe = totalRespect / totalEnergy;
        } else if (cnt > 0) {
          // Fallback: assume 25E hits if energy was somehow not recorded.
          m.avg_rpe = totalRespect / (cnt * 25);
        } else {
          m.avg_rpe = 0;
        }
      }

      return merged;
    }

    function getMyLevel() {
      if (logic && logic.user && logic.user.level) return logic.user.level;
      if (state && state.user && state.user.level) return state.user.level;
      return null;
    }

    function getMyUserId() {
      if (logic && logic.user) {
        return logic.user.player_id || logic.user.userID || logic.user.userid || null;
      }
      if (state && state.user) {
        return state.user.player_id || state.user.userID || state.user.userid || null;
      }
      return null;
    }

    // ---------- Firebase helpers ----------

    function firebasePut(path, data) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'PUT',
          url: `${FIREBASE_ROOT}/${path}.json`,
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify(data || {}),
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              resolve();
            } else {
              console.error('[FREKI] Firebase PUT error', res.status, res.responseText);
              reject(new Error('Firebase PUT error: ' + res.status));
            }
          },
          onerror: (err) => {
            console.error('[FREKI] Firebase PUT network error', err);
            reject(err);
          },
        });
      });
    }

    function firebaseGet(path) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `${FIREBASE_ROOT}/${path}.json`,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                const data =
                  res.responseText && res.responseText.length
                    ? JSON.parse(res.responseText)
                    : null;
                resolve(data);
              } catch (e) {
                console.error('[FREKI] Firebase GET parse error', e, res.responseText);
                reject(e);
              }
            } else {
              console.error('[FREKI] Firebase GET error', res.status, res.responseText);
              reject(new Error('Firebase GET error: ' + res.status));
            }
          },
          onerror: (err) => {
            console.error('[FREKI] Firebase GET network error', err);
            reject(err);
          },
        });
      });
    }

    // ---------- Core logic ----------

    Freki.init = async function init() {
      try {
        if (!state.settings) state.settings = {};

        // 1) Determine / create a client ID (hashed user ID)
        let userId = getMyUserId();

        if (!userId) {
          // Fallback: query the API once
          try {
            const u = await api.fetch('/user?selections=basic', 60000);
            if (!u.error) {
              userId = u.player_id || u.userID || u.userid || null;
              // Also cache this into logic.state if available
              if (logic) logic.user = logic.user || u;
            }
          } catch (e) {
            console.error('[FREKI] Could not fetch user for clientId', e);
          }
        }

        if (!userId) {
          console.warn('[FREKI] No userId, Freki will be disabled for this session.');
          return;
        }

        Freki.myUserId = String(userId);

        if (!state.settings.frekiClientId) {
          state.settings.frekiClientId = fnv1aHash('freki|' + userId);
          await state.saveToIDB();
        }

        Freki.clientId = state.settings.frekiClientId;

        // 2) Load previous local buckets + lastAttackTs from settings
        Freki.myBuckets = state.settings.frekiBuckets || {};
        Freki.lastAttackTs = state.settings.frekiLastAttackTs || 0;

        // ---- FIX #3: Duplicate ingestion guard ----
        // If lastAttackTs somehow got reset (0) but we still have local buckets,
        // that means state got out of sync and re-processing would double-count.
        if (!Freki.lastAttackTs && Freki.myBuckets && Object.keys(Freki.myBuckets).length > 0) {
          console.warn(
            '[FREKI] lastAttackTs was reset but buckets not empty. Clearing local Freki buckets to avoid double counting.'
          );
          Freki.myBuckets = {};
          state.settings.frekiBuckets = {};
          state.settings.frekiLastAttackTs = 0;
          await state.saveToIDB();
        }

        // 3) Immediately sync attacks once, then schedule periodic sync
        await Freki.syncAttacksToBuckets().catch((e) =>
          console.error('[FREKI] initial syncAttacksToBuckets error', e),
        );
        await Freki.pushMyBuckets().catch((e) =>
          console.error('[FREKI] initial pushMyBuckets error', e),
        );
        await Freki.refreshGlobalBuckets().catch((e) =>
          console.error('[FREKI] initial refreshGlobalBuckets error', e),
        );

        Freki.syncInterval = setInterval(() => {
          Freki.syncAttacksToBuckets()
            .then(() => Freki.pushMyBuckets())
            .catch((e) => console.error('[FREKI] periodic sync error', e));
        }, 2 * 60 * 1000); // every 2 min

        Freki.refreshInterval = setInterval(() => {
          Freki.refreshGlobalBuckets().catch((e) =>
            console.error('[FREKI] periodic refreshGlobalBuckets error', e),
          );
        }, 5 * 60 * 1000); // every 5 min

        console.log('[FREKI] Init complete. Client ID:', Freki.clientId);
      } catch (e) {
        console.error('[FREKI] init error', e);
      }
    };

    Freki.syncAttacksToBuckets = async function syncAttacksToBuckets() {
      if (!api || !api.apiKey) return;

      let json;
      try {
        json = await api.fetch('/user?selections=attacks', 60000);
      } catch (e) {
        console.error('[FREKI] Error fetching attacks', e);
        return;
      }

      if (!json || json.error || !json.attacks) {
        if (json && json.error) {
          console.warn('[FREKI] attacks error', json.error);
        }
        return;
      }

      const attacks = json.attacks;
      let maxTs = Freki.lastAttackTs || 0;
      let processed = 0;
      const myId = Freki.myUserId ? String(Freki.myUserId) : null;
      const myLevelFromState = getMyLevel();

      // We'll treat very large "chain" values as IDs, not counts.
      const MAX_REASONABLE_CHAIN = 120000;

      for (const [attackId, atk] of Object.entries(attacks)) {
        if (!atk) continue;

        const ts =
          Number(atk.timestamp_ended || atk.timestamp || atk.timestamp_started) ||
          0;
        if (!ts || ts <= Freki.lastAttackTs) {
          continue; // already processed (or invalid)
        }
        if (ts > maxTs) maxTs = ts;

        const respect = Number(atk.respect_gain || 0);
        if (!respect || respect <= 0) {
          // ignore zero-respect hits for now
          continue;
        }

        // ---- FIX #4: Energy calculation (Retaliation = 0 E) ----
        let energy = 25;
        if (atk.modifiers && typeof atk.modifiers === 'object') {
          let isRetal = false;

          // Direct fields first (most likely)
          if (atk.modifiers.retaliation || atk.modifiers.Retaliation) {
            isRetal = true;
          } else {
            // Fallback: scan for any key that contains "retaliation"
            for (const key of Object.keys(atk.modifiers)) {
              if (key.toLowerCase().includes('retaliation')) {
                isRetal = true;
                break;
              }
            }
          }

          if (isRetal) {
            energy = 0;
          }
        }

        // "War mode" from modifiers if present
        const isWar =
          !!(atk.modifiers && (atk.modifiers.ranked_war || atk.modifiers.war));

        // Attacker / defender levels
        const atkLevel = Number(atk.attacker_level || atk.level_attacker) || null;
        const defLevel = Number(atk.defender_level || atk.level_defender) || null;

        // Attacker / defender IDs
        const attackerId = String(
          atk.attacker_id ||
          atk.attacker ||
          atk.attackerID ||
          atk.attackerId ||
          ''
        );
        const defenderId = String(
          atk.defender_id ||
          atk.defender ||
          atk.defenderID ||
          atk.defenderId ||
          ''
        );

        // ---- FIX #1: Perspective bug ----
        // We want bucket key = MyLevel__OpponentLevel, *regardless* of
        // whether I attacked them or they attacked me.
        let myLevel = myLevelFromState || null;
        let mySideLevel = null;
        let oppLevel = null;

        const iAmAttacker = myId && attackerId && myId === attackerId;
        const iAmDefender = myId && defenderId && myId === defenderId;

        if (iAmAttacker && atkLevel && defLevel) {
          // I attacked them
          mySideLevel = atkLevel;
          oppLevel = defLevel;
        } else if (iAmDefender && atkLevel && defLevel) {
          // They attacked me
          mySideLevel = defLevel;
          oppLevel = atkLevel;
        } else if (!iAmAttacker && !iAmDefender && atkLevel && defLevel) {
          // Fallback if we can't clearly identify my side via IDs.
          // Try matching my known level to one of the sides.
          if (myLevel && myLevel === atkLevel) {
            mySideLevel = atkLevel;
            oppLevel = defLevel;
          } else if (myLevel && myLevel === defLevel) {
            mySideLevel = defLevel;
            oppLevel = atkLevel;
          }
        }

        // If we still don't know, give up on this attack (can't bucket meaningfully).
        if (!mySideLevel || !oppLevel) {
          continue;
        }

        // Ensure we have a "myLevel" for this session, even if we had to infer from logs.
        if (!myLevel) myLevel = mySideLevel;

        // ---- FIX #2: Chain ID vs Chain Count bug ----
        // Torn attack logs often store chain as an ID, not the current chain hit.
        // We try a few fields and apply a sanity check. If it's absurdly large,
        // we treat it as an ID and default to 0 (no chain bucket).
        let chainCount = 0;

        const candidates = [
          atk.chain,
          atk.chain_id,
          atk.chain_position,
          atk.chain_link,
          atk.chain_count,
          atk.modifiers && atk.modifiers.chain,
        ];

        for (const candidate of candidates) {
          const val = Number(candidate) || 0;
          if (val > 0 && val <= MAX_REASONABLE_CHAIN) {
            chainCount = val;
            break;
          }
        }

        // A "win" is approximated by positive respect.
        const win = respect > 0;

        const bucketKey = getBucketKey(mySideLevel, oppLevel, chainCount, isWar);

        updateLocalBucket(bucketKey, {
          respect,
          energy,
          win,
          ts,
        });

        processed++;
      }

      if (processed > 0) {
        Freki.lastAttackTs = maxTs;
        state.settings.frekiLastAttackTs = maxTs;
        state.settings.frekiBuckets = Freki.myBuckets;
        await state.saveToIDB();
        console.log('[FREKI] processed new attacks:', processed);
      }
    };

    Freki.pushMyBuckets = async function pushMyBuckets() {
      if (!Freki.clientId) return;
      const payload = {
        version: FREKI_VERSION,
        userHash: Freki.clientId,
        updatedAt: Math.floor(Date.now() / 1000),
        buckets: Freki.myBuckets || {},
      };
      await firebasePut('clients/' + Freki.clientId, payload);
    };

    Freki.refreshGlobalBuckets = async function refreshGlobalBuckets() {
      const clientsNode = await firebaseGet('clients');
      Freki.buckets = mergeClientBuckets(clientsNode);
      Freki.ready = true;
      console.log('[FREKI] merged buckets keys:', Object.keys(Freki.buckets).length);
    };

    // ---------- Public scoring API ----------

    /**
     * scoreTarget(target, opts?)
     *   target: Odin target object { lvl, respectGain, ... }
     *   opts: { attackerLevel?: number, chain?: number, war?: boolean }
     *
     * Score is essentially:
     *   win_rate * avg_respect_per_energy
     */
    Freki.scoreTarget = function scoreTarget(target, opts) {
      opts = opts || {};
      if (!target || !target.lvl) return 0;

      const attackerLevel =
        opts.attackerLevel != null ? opts.attackerLevel : getMyLevel();
      if (!attackerLevel) return 0;

      const chainCount =
        opts.chain != null
          ? opts.chain
          : (logic && logic.chainCurrent) || 0;
      const isWar = !!opts.war;

      const key = getBucketKey(attackerLevel, target.lvl, chainCount, isWar);
      const b = Freki.buckets[key];

      if (!b || b.count < 5) {
        // Not enough global data. Fall back to local respectGain if we have it.
        if (target.respectGain != null && target.respectGain > 0) {
          return target.respectGain / 25;
        }
        return 0;
      }

      // Main "supermath" score: win rate * avg respect per energy
      let score = (b.win_rate || 0) * (b.avg_rpe || 0);

      // Tiny tie-breaker from local respectGain if present
      if (target.respectGain != null && target.respectGain > 0) {
        score += target.respectGain / 10000;
      }

      return score;
    };

    /**
     * rankTargets(targets, opts?) -> new sorted array (highest score first)
     */
    Freki.rankTargets = function rankTargets(targets, opts) {
      if (!Array.isArray(targets) || targets.length === 0) return [];
      return targets
        .map((t) => ({
          t,
          score: Freki.scoreTarget(t, opts),
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.t);
    };

    // Expose globally so other modules (colonel, warcore, UI) can play with it
    window.Freki = Freki;

    // Kick it off
    Freki.init().catch((e) => console.error('[FREKI] init error', e));
  });
})();
