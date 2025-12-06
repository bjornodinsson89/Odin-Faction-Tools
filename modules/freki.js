// freki.js - Freki "Supermath" Brain for Odin
// Buckets fight data by myLevel / opponentLevel + chain + war flag,
// uploads anonymised stats to Firebase, and exposes scoring helpers.
//
(function () {
  'use strict';

  // Ensure OdinModules exists
  window.OdinModules = window.OdinModules || [];

  window.OdinModules.push(function FrekiModuleInit(OdinContext) {
    // Bootstrap compatibility with OdinContext
    const state =
      OdinContext && typeof OdinContext.getState === 'function'
        ? OdinContext.getState()
        : OdinContext.state;
    const api = OdinContext.api; // BaseModule._apiModule
    const logic = OdinContext.logic; // OdinLogic
    const nexus = OdinContext.nexus;

    const FREKI_VERSION = 'v1';
    const FIREBASE_ROOT =
      'https://torn-war-room-default-rtdb.firebaseio.com/freki/' +
      FREKI_VERSION;

    const Freki = {
      version: FREKI_VERSION,
      clientId: null, // client ID (UUID v4, not derived from userId)
      myUserId: null, // Torn userId (not stored remotely)
      myBuckets: {}, // this client's buckets (local aggregate)
      buckets: {}, // merged buckets from all clients
      lastAttackTs: 0, // last processed attack timestamp
      ready: false,
      syncInterval: null,
      refreshInterval: null,
    };

    // ---------- Small helpers ----------

    /**
     * Generate a RFC4122 UUID v4.
     * Uses crypto.getRandomValues when available, falls back to Math.random.
     */
    function uuidv4() {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint8Array(16);
        crypto.getRandomValues(buf);

        // Per RFC 4122 section 4.4
        buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
        buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10

        const byteToHex = [];
        for (let i = 0; i < 256; i++) {
          byteToHex[i] = (i + 0x100).toString(16).substr(1);
        }

        return (
          byteToHex[buf[0]] +
          byteToHex[buf[1]] +
          byteToHex[buf[2]] +
          byteToHex[buf[3]] +
          '-' +
          byteToHex[buf[4]] +
          byteToHex[buf[5]] +
          '-' +
          byteToHex[buf[6]] +
          byteToHex[buf[7]] +
          '-' +
          byteToHex[buf[8]] +
          byteToHex[buf[9]] +
          '-' +
          byteToHex[buf[10]] +
          byteToHex[buf[11]] +
          byteToHex[buf[12]] +
          byteToHex[buf[13]] +
          byteToHex[buf[14]] +
          byteToHex[buf[15]]
        );
      }

      // Fallback – still reasonably unique, but without crypto
      let timestamp = new Date().getTime();
      if (
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
      ) {
        timestamp += performance.now();
      }

      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
        /[xy]/g,
        function (c) {
          const r = (timestamp + Math.random() * 16) % 16 | 0;
          timestamp = Math.floor(timestamp / 16);
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      );
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
     * This is now strictly "user vs opponent", regardless of whetherUser was
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
      const { respect = 0, energy = 25, win = true, ts = 0 } = payload || {};
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
        return (
          logic.user.player_id ||
          logic.user.userID ||
          logic.user.userid ||
          null
        );
      }
      if (state && state.user) {
        return (
          state.user.player_id ||
          state.user.userID ||
          state.user.userid ||
          null
        );
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
              console.error(
                '[FREKI] Firebase PUT error',
                res.status,
                res.responseText,
              );
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
                console.error(
                  '[FREKI] Firebase GET parse error',
                  e,
                  res.responseText,
                );
                reject(e);
              }
            } else {
              console.error(
                '[FREKI] Firebase GET error',
                res.status,
                res.responseText,
              );
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

        // Determine / create a client ID (UUID v4, not derived from userId)
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
          console.warn(
            '[FREKI] No userId, Freki will be disabled for this session.',
          );
          return;
        }

        Freki.myUserId = String(userId);

        if (!state.settings.frekiClientId) {
          // SECURITY: Use a random UUID v4 instead of a hash of userId
          state.settings.frekiClientId = uuidv4();
          await state.saveToIDB();
        }

        Freki.clientId = state.settings.frekiClientId;

        // 2) Load previous local buckets + lastAttackTs from settings
        Freki.myBuckets = state.settings.frekiBuckets || {};
        Freki.lastAttackTs = state.settings.frekiLastAttackTs || 0;

        if (
          !Freki.lastAttackTs &&
          Freki.myBuckets &&
          Object.keys(Freki.myBuckets).length > 0
        ) {
          console.warn(
            '[FREKI] lastAttackTs was reset but buckets not empty. Clearing local Freki buckets to avoid double counting.',
          );
          Freki.myBuckets = {};
          state.settings.frekiBuckets = {};
          state.settings.frekiLastAttackTs = 0;
          await state.saveToIDB();
        }

        // Immediately sync attacks once, then schedule periodic sync
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

      // Treat very large "chain" values as IDs, not counts.
      const MAX_REASONABLE_CHAIN = 120000;

      for (const [attackId, atk] of Object.entries(attacks)) {
        if (!atk) continue;

        const ts =
          Number(
            atk.timestamp_ended || atk.timestamp || atk.timestamp_started,
          ) || 0;

        if (!ts || ts <= Freki.lastAttackTs) {
          continue; // already processed (or invalid)
        }
        if (ts > maxTs) maxTs = ts;

        const respect = Number(atk.respect_gain || 0);
        if (!respect || respect <= 0) {
          // ignore zero-respect hits for now
          continue;
        }

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
          !!(atk.modifiers &&
            (atk.modifiers.ranked_war || atk.modifiers.war));

        // Attacker / defender levels
        const atkLevel =
          Number(atk.attacker_level || atk.level_attacker) || null;
        const defLevel =
          Number(atk.defender_level || atk.level_defender) || null;

        // Attacker / defender IDs
        const attackerId = String(
          atk.attacker_id ||
            atk.attacker ||
            atk.attackerID ||
            atk.attackerId ||
            '',
        );
        const defenderId = String(
          atk.defender_id ||
            atk.defender ||
            atk.defenderID ||
            atk.defenderId ||
            '',
        );

        let myLevel = myLevelFromState || null;
        let mySideLevel = null;
        let oppLevel = null;

        const iAmAttacker = myId && attackerId && myId === attackerId;
        const iAmDefender = myId && defenderId && myId === defenderId;

        if (iAmAttacker && atkLevel && defLevel) {
          // user attacked them
          mySideLevel = atkLevel;
          oppLevel = defLevel;
        } else if (iAmDefender && atkLevel && defLevel) {
          // They attacked user
          mySideLevel = defLevel;
          oppLevel = atkLevel;
        } else if (!iAmAttacker && !iAmDefender && atkLevel && defLevel) {
          // Fallback if Freki can't clearly identifyUsers side via IDs.
          // Try matching users known level to one of the sides.
          if (myLevel && myLevel === atkLevel) {
            mySideLevel = atkLevel;
            oppLevel = defLevel;
          } else if (myLevel && myLevel === defLevel) {
            mySideLevel = defLevel;
            oppLevel = atkLevel;
          }
        }

        // If Freki still doesn't know, give up on this attack (can't bucket meaningfully).
        if (!mySideLevel || !oppLevel) {
          continue;
        }

        // Ensure Freki have a "myLevel" for this session, even if it needs to infer from logs.
        if (!myLevel) myLevel = mySideLevel;

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
      console.log(
        '[FREKI] merged buckets keys:',
        Object.keys(Freki.buckets).length,
      );
    };

    // ---------- Public scoring API ----------

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
        // Not enough global data. Fall back to local respectGain if Freki has it.
        if (target.respectGain != null && target.respectGain > 0) {
          return target.respectGain / 25;
        }
        return 0;
      }

      // Main score: win rate * avg respect per energy
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

    Freki.getBucketStats = function getBucketStats(
      attackerLevel,
      opponentLevel,
      chainCount,
      isWar,
    ) {
      const key = getBucketKey(attackerLevel, opponentLevel, chainCount, isWar);
      const b = Freki.buckets[key];
      if (!b) return null;
      return {
        key,
        count: b.count || 0,
        win_count: b.win_count || 0,
        loss_count: b.loss_count || 0,
        total_respect: b.total_respect || 0,
        total_energy: b.total_energy || 0,
        avg_respect: b.avg_respect || 0,
        avg_rpe: b.avg_rpe || 0,
        win_rate: b.win_rate || 0,
        last_ts: b.last_ts || 0,
      };
    };

    Freki.getTargetScoreDetails = function getTargetScoreDetails(target, opts) {
      opts = opts || {};
      if (!target || !target.lvl) return null;

      const attackerLevel =
        opts.attackerLevel != null ? opts.attackerLevel : getMyLevel();
      if (!attackerLevel) return null;

      const chainCount =
        opts.chain != null ? opts.chain : (logic && logic.chainCurrent) || 0;
      const isWar = !!opts.war;

      const key = getBucketKey(attackerLevel, target.lvl, chainCount, isWar);
      const b = Freki.buckets[key];

      // If there's no global data at all for this bucket
      if (!b) {
        const fallback =
          target.respectGain != null && target.respectGain > 0
            ? target.respectGain / 25
            : 0;
        return {
          key,
          score: fallback,
          bucket: null,
          source: 'local-only',
          attackerLevel,
          chainCount,
          isWar,
        };
      }

      // If Freki has some data but not enough to fully trust
      if (b.count < 5) {
        const fallback =
          target.respectGain != null && target.respectGain > 0
            ? target.respectGain / 25
            : 0;
        return {
          key,
          score: fallback,
          bucket: {
            count: b.count,
            win_count: b.win_count,
            loss_count: b.loss_count,
            total_respect: b.total_respect,
            total_energy: b.total_energy,
            avg_respect: b.avg_respect,
            avg_rpe: b.avg_rpe,
            win_rate: b.win_rate,
            last_ts: b.last_ts,
          },
          source: 'global-insufficient',
          attackerLevel,
          chainCount,
          isWar,
        };
      }

      // Normal case – full Freki score
      let score = (b.win_rate || 0) * (b.avg_rpe || 0);

      // Tiny bias with local respect if present
      if (target.respectGain != null && target.respectGain > 0) {
        score += target.respectGain / 10000;
      }

      return {
        key,
        score,
        bucket: {
          count: b.count,
          win_count: b.win_count,
          loss_count: b.loss_count,
          total_respect: b.total_respect,
          total_energy: b.total_energy,
          avg_respect: b.avg_respect,
          avg_rpe: b.avg_rpe,
          win_rate: b.win_rate,
          last_ts: b.last_ts,
        },
        source: 'global',
        attackerLevel,
        chainCount,
        isWar,
      };
    };

    window.Freki = Freki;

    // Kick it off
    Freki.init().catch((e) => console.error('[FREKI] init error', e));
  });
})();
