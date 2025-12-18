/**
 * Odin Tools - Access Control Module
 * Role-based access control with developer override
 * Version: 4.1.0
 * Author: BjornOdinsson89
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinAccessControlModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const ACCESS_VERSION = '4.1.0';

    // ============================================
    // DEVELOPER ALLOWLIST
    // ============================================
    const DEV_ID_ALLOWLIST = new Set([
      3666214  // BjornOdinsson89
    ]);

    // ============================================
    // ROLE DEFINITIONS
    // ============================================
    const ROLES = {
      DEVELOPER: 'developer',
      LEADER: 'leader',
      COLEADER: 'coleader',
      ADMIN: 'admin',
      MEMBER: 'member',
      GUEST: 'guest'
    };

    const ROLE_HIERARCHY = {
      [ROLES.DEVELOPER]: 100,
      [ROLES.LEADER]: 90,
      [ROLES.COLEADER]: 80,
      [ROLES.ADMIN]: 70,
      [ROLES.MEMBER]: 50,
      [ROLES.GUEST]: 10
    };

    // ============================================
    // PERMISSIONS
    // ============================================
    const PERMISSIONS = {
      // War Management
      START_WAR: 'war.start',
      END_WAR: 'war.end',
      SET_WAR_CONFIG: 'war.config',
      SET_ATTACK_MODE: 'war.attackMode',

      // Target Management
      ADD_FACTION_TARGET: 'targets.add',
      REMOVE_FACTION_TARGET: 'targets.remove',
      CLAIM_TARGET: 'targets.claim',
      RELEASE_TARGET: 'targets.release',

      // Dibs & Med Deals
      CREATE_DIB: 'dibs.create',
      RELEASE_DIB: 'dibs.release',
      RELEASE_OTHERS_DIB: 'dibs.releaseOthers',
      CREATE_MEDDEAL: 'meddeals.create',
      RELEASE_MEDDEAL: 'meddeals.release',
      RELEASE_OTHERS_MEDDEAL: 'meddeals.releaseOthers',

      // Watchers
      MANAGE_WATCHERS: 'watchers.manage',
      SET_WATCHER_SCHEDULE: 'watchers.schedule',

      // Leadership
      VIEW_LEADERSHIP: 'leadership.view',
      MANAGE_MEMBERS: 'leadership.members',
      BULK_OPERATIONS: 'leadership.bulk',
      VIEW_UNAUTHORIZED: 'leadership.unauthorized',

      // Settings
      MANAGE_SETTINGS: 'settings.manage',
      EXPORT_DATA: 'settings.export',
      IMPORT_DATA: 'settings.import',

      // Notes
      CREATE_NOTE: 'notes.create',
      EDIT_NOTE: 'notes.edit',
      DELETE_NOTE: 'notes.delete'
    };

    // Permission mappings per role
    const ROLE_PERMISSIONS = {
      [ROLES.DEVELOPER]: Object.values(PERMISSIONS), // All permissions
      [ROLES.LEADER]: Object.values(PERMISSIONS),
      [ROLES.COLEADER]: [
        PERMISSIONS.SET_WAR_CONFIG,
        PERMISSIONS.SET_ATTACK_MODE,
        PERMISSIONS.ADD_FACTION_TARGET,
        PERMISSIONS.REMOVE_FACTION_TARGET,
        PERMISSIONS.CLAIM_TARGET,
        PERMISSIONS.RELEASE_TARGET,
        PERMISSIONS.CREATE_DIB,
        PERMISSIONS.RELEASE_DIB,
        PERMISSIONS.RELEASE_OTHERS_DIB,
        PERMISSIONS.CREATE_MEDDEAL,
        PERMISSIONS.RELEASE_MEDDEAL,
        PERMISSIONS.RELEASE_OTHERS_MEDDEAL,
        PERMISSIONS.MANAGE_WATCHERS,
        PERMISSIONS.SET_WATCHER_SCHEDULE,
        PERMISSIONS.VIEW_LEADERSHIP,
        PERMISSIONS.VIEW_UNAUTHORIZED,
        PERMISSIONS.EXPORT_DATA,
        PERMISSIONS.CREATE_NOTE,
        PERMISSIONS.EDIT_NOTE,
        PERMISSIONS.DELETE_NOTE
      ],
      [ROLES.ADMIN]: [
        PERMISSIONS.SET_ATTACK_MODE,
        PERMISSIONS.ADD_FACTION_TARGET,
        PERMISSIONS.CLAIM_TARGET,
        PERMISSIONS.RELEASE_TARGET,
        PERMISSIONS.CREATE_DIB,
        PERMISSIONS.RELEASE_DIB,
        PERMISSIONS.CREATE_MEDDEAL,
        PERMISSIONS.RELEASE_MEDDEAL,
        PERMISSIONS.MANAGE_WATCHERS,
        PERMISSIONS.VIEW_LEADERSHIP,
        PERMISSIONS.EXPORT_DATA,
        PERMISSIONS.CREATE_NOTE,
        PERMISSIONS.EDIT_NOTE
      ],
      [ROLES.MEMBER]: [
        PERMISSIONS.CLAIM_TARGET,
        PERMISSIONS.RELEASE_TARGET,
        PERMISSIONS.CREATE_DIB,
        PERMISSIONS.RELEASE_DIB,
        PERMISSIONS.CREATE_MEDDEAL,
        PERMISSIONS.RELEASE_MEDDEAL,
        PERMISSIONS.CREATE_NOTE
      ],
      [ROLES.GUEST]: []
    };

    // ============================================
    // STATE
    // ============================================
    let state = {
      myTornId: null,
      myTornName: null,
      myFactionId: null,
      myFactionName: null,
      myPosition: null,
      isDev: false,
      isLeaderFromTorn: false,
      isCoLeaderFromTorn: false,
      isLeaderFromClaims: false,
      customRole: null,
      initialized: false
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    async function initialize() {
      log('[AccessControl] Initializing v' + ACCESS_VERSION);

      // Get identity from Torn API
      try {
        if (ctx.api && ctx.api.getUser) {
          const me = await ctx.api.getUser(null, 'basic,profile');
          
          state.myTornId = me.player_id;
          state.myTornName = me.name;
          state.myFactionId = me.faction?.faction_id || me.faction?.id;
          state.myFactionName = me.faction?.faction_name || me.faction?.name;
          state.myPosition = me.faction?.position;

          state.isDev = DEV_ID_ALLOWLIST.has(state.myTornId);

          const posLower = (state.myPosition || '').toLowerCase();
          state.isLeaderFromTorn = posLower === 'leader';
          state.isCoLeaderFromTorn = posLower === 'co-leader' || posLower === 'coleader';

          log('[AccessControl] Torn identity:', {
            id: state.myTornId,
            name: state.myTornName,
            faction: state.myFactionName,
            position: state.myPosition,
            isDev: state.isDev
          });
        }
      } catch (e) {
        error('[AccessControl] Torn identity lookup failed:', e);
      }

      // Get identity from Firebase claims
      try {
        if (ctx.firebase) {
          const auth = ctx.firebase.getAuth?.();
          const user = auth?.currentUser;
          if (user && typeof user.getIdTokenResult === 'function') {
            const token = await user.getIdTokenResult();
            state.isLeaderFromClaims = token?.claims?.role === 'leader';
            state.customRole = token?.claims?.customRole || null;
          }
        }
      } catch (e) {
        log('[AccessControl] Firebase claims lookup failed:', e);
      }

      // Update context
      ctx.userId = state.myTornId;
      ctx.userName = state.myTornName;
      ctx.factionId = state.myFactionId;
      ctx.factionName = state.myFactionName;

      // Set Firebase context
      if (ctx.firebase && ctx.firebase.setUserContext) {
        ctx.firebase.setUserContext(state.myTornId, state.myFactionId);
      }

      state.initialized = true;
      nexus.emit('ACCESS_READY', getSnapshot());

      return getSnapshot();
    }

    // ============================================
    // ROLE DETERMINATION
    // ============================================
    function getEffectiveRole() {
      if (state.isDev) return ROLES.DEVELOPER;
      if (state.isLeaderFromTorn || state.isLeaderFromClaims) return ROLES.LEADER;
      if (state.isCoLeaderFromTorn) return ROLES.COLEADER;
      if (state.customRole) return state.customRole;

      // Determine from position
      const posLower = (state.myPosition || '').toLowerCase();
      if (posLower.includes('admin') || posLower.includes('officer')) return ROLES.ADMIN;
      if (state.myFactionId) return ROLES.MEMBER;

      return ROLES.GUEST;
    }

    function getRoleLevel() {
      const role = getEffectiveRole();
      return ROLE_HIERARCHY[role] || 0;
    }

    // ============================================
    // PERMISSION CHECKING
    // ============================================
    function hasPermission(permission) {
      const role = getEffectiveRole();
      const permissions = ROLE_PERMISSIONS[role] || [];
      return permissions.includes(permission);
    }

    function hasAnyPermission(permissions) {
      return permissions.some(p => hasPermission(p));
    }

    function hasAllPermissions(permissions) {
      return permissions.every(p => hasPermission(p));
    }

    function requirePermission(permission, errorMessage) {
      if (!hasPermission(permission)) {
        throw new Error(errorMessage || `Permission denied: ${permission}`);
      }
    }

    // ============================================
    // CONVENIENCE METHODS
    // ============================================
    function isLeaderEffective() {
      return state.isDev || state.isLeaderFromTorn || state.isLeaderFromClaims;
    }

    function canWriteLeaderOps() {
      return hasPermission(PERMISSIONS.START_WAR) || 
             hasPermission(PERMISSIONS.SET_WAR_CONFIG);
    }

    function canManageTargets() {
      return hasPermission(PERMISSIONS.ADD_FACTION_TARGET);
    }

    function canClaimTargets() {
      return hasPermission(PERMISSIONS.CLAIM_TARGET);
    }

    function canManageDibs() {
      return hasPermission(PERMISSIONS.CREATE_DIB);
    }

    function canManageOthersDibs() {
      return hasPermission(PERMISSIONS.RELEASE_OTHERS_DIB);
    }

    function canManageMedDeals() {
      return hasPermission(PERMISSIONS.CREATE_MEDDEAL);
    }

    function canManageOthersMedDeals() {
      return hasPermission(PERMISSIONS.RELEASE_OTHERS_MEDDEAL);
    }

    function canViewLeadership() {
      return hasPermission(PERMISSIONS.VIEW_LEADERSHIP);
    }

    function canManageWatchers() {
      return hasPermission(PERMISSIONS.MANAGE_WATCHERS);
    }

    // ============================================
    // SNAPSHOT
    // ============================================
    function getSnapshot() {
      return {
        myTornId: state.myTornId,
        myTornName: state.myTornName,
        myFactionId: state.myFactionId,
        myFactionName: state.myFactionName,
        myPosition: state.myPosition,
        isDev: state.isDev,
        isLeaderFromTorn: state.isLeaderFromTorn,
        isCoLeaderFromTorn: state.isCoLeaderFromTorn,
        isLeaderFromClaims: state.isLeaderFromClaims,
        isLeaderEffective: isLeaderEffective(),
        canWriteLeaderOps: canWriteLeaderOps(),
        effectiveRole: getEffectiveRole(),
        roleLevel: getRoleLevel(),
        initialized: state.initialized
      };
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const OdinAccess = {
      version: ACCESS_VERSION,
      ROLES,
      PERMISSIONS,

      // Initialization
      initialize,
      getSnapshot,

      // Role
      getEffectiveRole,
      getRoleLevel,

      // Permission checking
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      requirePermission,

      // Convenience
      isLeaderEffective,
      canWriteLeaderOps,
      canManageTargets,
      canClaimTargets,
      canManageDibs,
      canManageOthersDibs,
      canManageMedDeals,
      canManageOthersMedDeals,
      canViewLeadership,
      canManageWatchers,

      // State getters
      getMyTornId: () => state.myTornId,
      getMyTornName: () => state.myTornName,
      getMyFactionId: () => state.myFactionId,
      getMyFactionName: () => state.myFactionName,
      getMyPosition: () => state.myPosition,
      isDeveloper: () => state.isDev,
      isInitialized: () => state.initialized
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[AccessControl] Module initializing...');

      // Expose globally
      window.OdinAccess = OdinAccess;
      ctx.access = OdinAccess;

      // Auto-initialize after API is ready
      const doInit = async () => {
        if (ctx.api && ctx.api.getUser) {
          await initialize();
        } else {
          // Wait for API
          setTimeout(doInit, 500);
        }
      };

      setTimeout(doInit, 100);

      log('[AccessControl] Module ready');
    }

    function destroy() {
      log('[AccessControl] Destroying...');
      state = {
        myTornId: null,
        myTornName: null,
        myFactionId: null,
        myFactionName: null,
        myPosition: null,
        isDev: false,
        isLeaderFromTorn: false,
        isCoLeaderFromTorn: false,
        isLeaderFromClaims: false,
        customRole: null,
        initialized: false
      };
      window.OdinAccess = null;
      log('[AccessControl] Destroyed');
    }

    return { id: 'odin-access-control', init, destroy };
  });
})();
