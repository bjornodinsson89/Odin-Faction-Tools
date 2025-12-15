/**
 * Odin Tools - Access Control (Dev Override)
 * - Dev override grants effective "leader UI + actions" for allowlisted Torn IDs.
 * - Database security must still be enforced by Firebase rules/claims.
 */
(function (global) {
  'use strict';

  const DEV_ID_ALLOWLIST = new Set([3666214]); // BjornOdinsson89

  function AccessControl(ctx) {
    this.ctx = ctx;
    this.myTornId = null;
    this.isDev = false;
    this.isLeaderFromTorn = false;
    this.isLeaderFromClaims = false;
  }

  AccessControl.prototype.init = async function () {
    // Identity from Torn
    try {
      const me = await this.ctx.api.getTornUser('', ['basic']);
      this.myTornId = Number(me?.player_id || me?.playerid || me?.user_id);
      this.isDev = DEV_ID_ALLOWLIST.has(this.myTornId);
      const pos = (me?.faction?.position || '').toLowerCase();
      this.isLeaderFromTorn = (pos === 'leader' || pos === 'co-leader' || pos === 'coleader');
    } catch (e) {
      console.warn('[AccessControl] Torn identity lookup failed', e);
    }

    // Identity from Firebase claims
    try {
      const auth = this.ctx.firebase?.getAuth?.();
      const user = auth?.currentUser;
      if (user && typeof user.getIdTokenResult === 'function') {
        const token = await user.getIdTokenResult();
        this.isLeaderFromClaims = token?.claims?.role === 'leader' ||
                                  token?.claims?.tornUserId === 3666214;
      }
    } catch (e) {}

    this.ctx.events.emit('ACCESS_READY', this.snapshot());
    return this.snapshot();
  };

  AccessControl.prototype.snapshot = function () {
    return {
      myTornId: this.myTornId,
      isDev: this.isDev,
      isLeaderFromTorn: this.isLeaderFromTorn,
      isLeaderFromClaims: this.isLeaderFromClaims,
      isLeaderEffective: this.isLeaderEffective(),
      canWriteLeaderOps: this.canWriteLeaderOps()
    };
  };

  AccessControl.prototype.isLeaderEffective = function () {
    return Boolean(this.isDev || this.isLeaderFromTorn || this.isLeaderFromClaims);
  };

  AccessControl.prototype.canWriteLeaderOps = function () {
    // Client-side gating only; server rules must enforce too.
    return Boolean(this.isDev || this.isLeaderFromClaims || this.isLeaderFromTorn);
  };

  global.AccessControl = AccessControl;
})(window);
