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
