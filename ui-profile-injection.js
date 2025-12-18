/**
 * Odin Tools - Profile Injection UI
 * Injects Add to Targets, Claim, Med Deal buttons on user profiles and attack pages
 * Version: 4.1.0
 * Author: BjornOdinsson89
 */

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIProfileInjectionInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const INJECTION_VERSION = '4.1.0';

    // ============================================
    // STATE
    // ============================================
    let injectionActive = false;
    let observerInstance = null;
    let lastInjectedProfileId = null;
    let lastInjectedAttackId = null;

    // ============================================
    // STYLES
    // ============================================
    const STYLES = `
      .odin-profile-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 10px 0;
        padding: 10px;
        background: linear-gradient(135deg, #1a1a1f 0%, #252530 100%);
        border-radius: 8px;
        border: 1px solid rgba(102, 126, 234, 0.3);
      }

      .odin-profile-btn {
        padding: 8px 14px;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        text-decoration: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .odin-profile-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .odin-profile-btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .odin-profile-btn-primary:hover:not(:disabled) {
        background: linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }

      .odin-profile-btn-success {
        background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
        color: white;
      }

      .odin-profile-btn-success:hover:not(:disabled) {
        background: linear-gradient(135deg, #38a169 0%, #2f855a 100%);
        transform: translateY(-1px);
      }

      .odin-profile-btn-warning {
        background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%);
        color: white;
      }

      .odin-profile-btn-warning:hover:not(:disabled) {
        background: linear-gradient(135deg, #dd6b20 0%, #c05621 100%);
        transform: translateY(-1px);
      }

      .odin-profile-btn-danger {
        background: linear-gradient(135deg, #e53e3e 0%, #c53030 100%);
        color: white;
      }

      .odin-profile-btn-danger:hover:not(:disabled) {
        background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%);
        transform: translateY(-1px);
      }

      .odin-profile-btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .odin-profile-btn-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
      }

      .odin-profile-btn-meddeal {
        background: linear-gradient(135deg, #9f7aea 0%, #805ad5 100%);
        color: white;
      }

      .odin-profile-btn-meddeal:hover:not(:disabled) {
        background: linear-gradient(135deg, #805ad5 0%, #6b46c1 100%);
        transform: translateY(-1px);
      }

      .odin-profile-btn-farm {
        background: linear-gradient(135deg, #38b2ac 0%, #319795 100%);
        color: white;
      }

      .odin-profile-btn-farm:hover:not(:disabled) {
        background: linear-gradient(135deg, #319795 0%, #2c7a7b 100%);
        transform: translateY(-1px);
      }

      .odin-profile-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        margin-top: 8px;
      }

      .odin-profile-status-claimed {
        background: rgba(237, 137, 54, 0.2);
        color: #ed8936;
        border: 1px solid rgba(237, 137, 54, 0.3);
      }

      .odin-profile-status-dib {
        background: rgba(72, 187, 120, 0.2);
        color: #48bb78;
        border: 1px solid rgba(72, 187, 120, 0.3);
      }

      .odin-profile-status-meddeal {
        background: rgba(159, 122, 234, 0.2);
        color: #9f7aea;
        border: 1px solid rgba(159, 122, 234, 0.3);
      }

      .odin-attack-container {
        margin: 10px;
        padding: 12px;
        background: linear-gradient(135deg, #1a1a1f 0%, #252530 100%);
        border-radius: 8px;
        border: 1px solid rgba(102, 126, 234, 0.3);
        text-align: center;
      }

      .odin-attack-header {
        color: #e2e8f0;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .odin-attack-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
      }

      .odin-claim-dropdown {
        position: relative;
        display: inline-block;
      }

      .odin-claim-dropdown-content {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        min-width: 140px;
        background: #1a1a1f;
        border: 1px solid rgba(102, 126, 234, 0.3);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        overflow: hidden;
      }

      .odin-claim-dropdown:hover .odin-claim-dropdown-content,
      .odin-claim-dropdown.active .odin-claim-dropdown-content {
        display: block;
      }

      .odin-claim-dropdown-item {
        display: block;
        width: 100%;
        padding: 10px 14px;
        border: none;
        background: transparent;
        color: #e2e8f0;
        text-align: left;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.15s;
      }

      .odin-claim-dropdown-item:hover {
        background: rgba(102, 126, 234, 0.2);
      }

      .odin-claim-dropdown-item.meddeal {
        color: #9f7aea;
      }

      .odin-claim-dropdown-item.farm {
        color: #38b2ac;
      }

      .odin-ownership-line {
        margin-top: 10px;
        font-size: 11px;
        color: #a0aec0;
      }
    `;

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function injectStyles() {
      if (document.getElementById('odin-profile-injection-styles')) return;

      const styleEl = document.createElement('style');
      styleEl.id = 'odin-profile-injection-styles';
      styleEl.textContent = STYLES;
      document.head.appendChild(styleEl);
    }

    function extractPlayerId(url) {
      const urlObj = new URL(url, window.location.origin);
      
      // Profile page: profiles.php?XID=xxx
      const xid = urlObj.searchParams.get('XID');
      if (xid) return xid;

      // Attack page: loader.php?sid=attack&user2ID=xxx
      const user2ID = urlObj.searchParams.get('user2ID');
      if (user2ID) return user2ID;

      return null;
    }

    function extractPlayerNameFromPage() {
      // Try various selectors
      const selectors = [
        '.profile-wrapper .user-info-value',
        '.profile-wrapper .info-table .value',
        '.profile-container [class*="userName"]',
        '.players___eKiHL span[class*="name"]',
        'span[id^="playername_"]',
        'span[id$="-name"]',
        '.basic-information .name'
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          return el.textContent.trim();
        }
      }

      return null;
    }

    function getSpearServices() {
      return ctx.spear?.services || window.OdinsSpear?.services || {};
    }

    function getMyUserId() {
      return ctx.userId || ctx.access?.getMyTornId?.() || 'unknown';
    }

    function getMyUserName() {
      return ctx.userName || ctx.access?.getMyTornName?.() || 'You';
    }

    // ============================================
    // STATUS CHECKING
    // ============================================
    function getTargetStatus(targetId) {
      const spear = getSpearServices();
      const tid = String(targetId);

      const claim = spear?.ClaimsService?.getClaim?.(tid);
      const dib = spear?.DibsService?.getDib?.(tid);
      const medDeal = spear?.MedDealsService?.getDeal?.(tid);

      const myId = String(getMyUserId());

      return {
        isClaimed: claim && claim.status === 'active',
        claimOwner: claim?.attackerName,
        isMyeClaim: claim?.attackerId === myId,

        hasDib: dib && dib.status === 'active',
        dibOwner: dib?.attackerName,
        isMyDib: dib?.attackerId === myId,

        hasMedDeal: medDeal && medDeal.status === 'active',
        medDealOwner: medDeal?.attackerName,
        isMyMedDeal: medDeal?.attackerId === myId
      };
    }

    // ============================================
    // BUTTON ACTIONS
    // ============================================
    function addToTargets(playerId, playerName) {
      const targets = storage.getJSON('odin_personal_targets') || [];
      
      if (targets.some(t => String(t.id) === String(playerId))) {
        showNotification('Target already in your list', 'warning');
        return;
      }

      targets.push({
        id: Number(playerId),
        name: playerName || `Player #${playerId}`,
        addedAt: Date.now(),
        source: 'profile-injection'
      });

      storage.setJSON('odin_personal_targets', targets);
      showNotification(`Added ${playerName || playerId} to personal targets`, 'success');
      nexus.emit('PERSONAL_TARGET_ADDED', { playerId, playerName });
    }

    function claimTarget(playerId, playerName, claimType = 'claim') {
      const spear = getSpearServices();
      const myId = getMyUserId();
      const myName = getMyUserName();

      if (claimType === 'meddeal') {
        const result = spear?.MedDealsService?.makeDeal?.(playerId, myId, myName, '');
        if (result?.success) {
          showNotification(`Med Deal set for ${playerName || playerId}`, 'success');
          nexus.emit('MED_DEAL_MADE', { targetId: playerId });
          refreshButtons();
        } else {
          showNotification(result?.reason || 'Failed to set Med Deal', 'error');
        }
      } else if (claimType === 'farm') {
        const result = spear?.DibsService?.makeDib?.(playerId, myId, myName);
        if (result?.success) {
          showNotification(`Farming dibs set for ${playerName || playerId}`, 'success');
          nexus.emit('DIB_MADE', { targetId: playerId });
          refreshButtons();
        } else {
          showNotification(result?.reason || 'Failed to set farm dibs', 'error');
        }
      } else {
        const result = spear?.ClaimsService?.makeClaim?.(playerId, myId, myName);
        if (result?.success) {
          showNotification(`Claimed ${playerName || playerId}`, 'success');
          nexus.emit('CLAIM_MADE', { targetId: playerId });
          refreshButtons();
        } else {
          showNotification(result?.reason || 'Failed to claim', 'error');
        }
      }
    }

    function releaseClaim(playerId, claimType = 'claim') {
      const spear = getSpearServices();
      const myId = getMyUserId();

      if (claimType === 'meddeal') {
        spear?.MedDealsService?.releaseDeal?.(playerId, myId);
        showNotification('Med Deal released', 'success');
        nexus.emit('MED_DEAL_RELEASED', { targetId: playerId });
      } else if (claimType === 'farm') {
        spear?.DibsService?.releaseDib?.(playerId, myId);
        showNotification('Farm dibs released', 'success');
        nexus.emit('DIB_RELEASED', { targetId: playerId });
      } else {
        spear?.ClaimsService?.releaseClaim?.(playerId, myId);
        showNotification('Claim released', 'success');
        nexus.emit('CLAIM_RELEASED', { targetId: playerId });
      }

      refreshButtons();
    }

    function showNotification(message, type = 'info') {
      if (window.OdinUI && window.OdinUI.showNotification) {
        window.OdinUI.showNotification(message, type);
      } else {
        // Fallback notification
        const notif = document.createElement('div');
        notif.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          background: ${type === 'error' ? '#e53e3e' : type === 'success' ? '#48bb78' : type === 'warning' ? '#ed8936' : '#667eea'};
          color: white;
          border-radius: 8px;
          font-family: -apple-system, sans-serif;
          font-size: 14px;
          z-index: 1000001;
          animation: slideIn 0.3s ease;
        `;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
      }
    }

    // ============================================
    // BUTTON RENDERING
    // ============================================
    function createProfileButtons(playerId, playerName) {
      const status = getTargetStatus(playerId);
      const container = document.createElement('div');
      container.className = 'odin-profile-buttons';
      container.id = 'odin-profile-buttons';

      // Add to Targets button
      const addBtn = document.createElement('button');
      addBtn.className = 'odin-profile-btn odin-profile-btn-primary';
      addBtn.innerHTML = '🎯 Add to Targets';
      addBtn.onclick = () => addToTargets(playerId, playerName);
      container.appendChild(addBtn);

      // Claim dropdown
      const claimDropdown = document.createElement('div');
      claimDropdown.className = 'odin-claim-dropdown';

      const claimBtn = document.createElement('button');
      claimBtn.className = 'odin-profile-btn odin-profile-btn-success';
      
      if (status.isClaimed && status.isMyeClaim) {
        claimBtn.innerHTML = '🔓 Release Claim';
        claimBtn.onclick = () => releaseClaim(playerId, 'claim');
      } else if (status.isClaimed) {
        claimBtn.innerHTML = `🔒 Claimed by ${status.claimOwner}`;
        claimBtn.disabled = true;
      } else {
        claimBtn.innerHTML = '✋ Claim ▼';
        claimBtn.onclick = (e) => {
          e.stopPropagation();
          claimDropdown.classList.toggle('active');
        };
      }
      claimDropdown.appendChild(claimBtn);

      // Dropdown content
      if (!status.isClaimed) {
        const dropdownContent = document.createElement('div');
        dropdownContent.className = 'odin-claim-dropdown-content';

        const claimNow = document.createElement('button');
        claimNow.className = 'odin-claim-dropdown-item';
        claimNow.innerHTML = '✋ Quick Claim';
        claimNow.onclick = () => {
          claimTarget(playerId, playerName, 'claim');
          claimDropdown.classList.remove('active');
        };
        dropdownContent.appendChild(claimNow);

        const medDealBtn = document.createElement('button');
        medDealBtn.className = 'odin-claim-dropdown-item meddeal';
        medDealBtn.innerHTML = '💉 Med Deal';
        medDealBtn.onclick = () => {
          claimTarget(playerId, playerName, 'meddeal');
          claimDropdown.classList.remove('active');
        };
        dropdownContent.appendChild(medDealBtn);

        const farmBtn = document.createElement('button');
        farmBtn.className = 'odin-claim-dropdown-item farm';
        farmBtn.innerHTML = '🌾 Farm (Dibs)';
        farmBtn.onclick = () => {
          claimTarget(playerId, playerName, 'farm');
          claimDropdown.classList.remove('active');
        };
        dropdownContent.appendChild(farmBtn);

        claimDropdown.appendChild(dropdownContent);
      }

      container.appendChild(claimDropdown);

      // Quick Med Deal button (if has existing)
      if (status.hasMedDeal) {
        const medStatus = document.createElement('button');
        medStatus.className = 'odin-profile-btn ' + (status.isMyMedDeal ? 'odin-profile-btn-meddeal' : 'odin-profile-btn-secondary');
        if (status.isMyMedDeal) {
          medStatus.innerHTML = '💉 Release Med Deal';
          medStatus.onclick = () => releaseClaim(playerId, 'meddeal');
        } else {
          medStatus.innerHTML = `💉 Med Deal: ${status.medDealOwner}`;
          medStatus.disabled = true;
        }
        container.appendChild(medStatus);
      }

      // Quick Farm button (if has existing)
      if (status.hasDib) {
        const dibStatus = document.createElement('button');
        dibStatus.className = 'odin-profile-btn ' + (status.isMyDib ? 'odin-profile-btn-farm' : 'odin-profile-btn-secondary');
        if (status.isMyDib) {
          dibStatus.innerHTML = '🌾 Release Farm';
          dibStatus.onclick = () => releaseClaim(playerId, 'farm');
        } else {
          dibStatus.innerHTML = `🌾 Farm: ${status.dibOwner}`;
          dibStatus.disabled = true;
        }
        container.appendChild(dibStatus);
      }

      // Status line
      const statusParts = [];
      if (status.isClaimed) statusParts.push(`Claim: ${status.claimOwner}`);
      if (status.hasDib) statusParts.push(`Dibs: ${status.dibOwner}`);
      if (status.hasMedDeal) statusParts.push(`Med Deal: ${status.medDealOwner}`);

      if (statusParts.length > 0) {
        const statusLine = document.createElement('div');
        statusLine.className = 'odin-ownership-line';
        statusLine.textContent = statusParts.join(' | ');
        container.appendChild(statusLine);
      }

      // Close dropdown on outside click
      document.addEventListener('click', (e) => {
        if (!claimDropdown.contains(e.target)) {
          claimDropdown.classList.remove('active');
        }
      }, { once: true });

      return container;
    }

    function createAttackPageButtons(playerId, playerName) {
      const status = getTargetStatus(playerId);
      const container = document.createElement('div');
      container.className = 'odin-attack-container';
      container.id = 'odin-attack-container';

      const header = document.createElement('div');
      header.className = 'odin-attack-header';
      header.innerHTML = `<span>⚔️</span> Odin Tools`;
      container.appendChild(header);

      const buttonsRow = document.createElement('div');
      buttonsRow.className = 'odin-attack-buttons';

      // Add to Targets
      const addBtn = document.createElement('button');
      addBtn.className = 'odin-profile-btn odin-profile-btn-primary';
      addBtn.innerHTML = '🎯 Target';
      addBtn.title = 'Add to personal targets';
      addBtn.onclick = () => addToTargets(playerId, playerName);
      buttonsRow.appendChild(addBtn);

      // Claim button
      const claimBtn = document.createElement('button');
      if (status.isClaimed && status.isMyeClaim) {
        claimBtn.className = 'odin-profile-btn odin-profile-btn-warning';
        claimBtn.innerHTML = '🔓 Release';
        claimBtn.onclick = () => releaseClaim(playerId, 'claim');
      } else if (status.isClaimed) {
        claimBtn.className = 'odin-profile-btn odin-profile-btn-secondary';
        claimBtn.innerHTML = `🔒 ${status.claimOwner}`;
        claimBtn.disabled = true;
      } else {
        claimBtn.className = 'odin-profile-btn odin-profile-btn-success';
        claimBtn.innerHTML = '✋ Claim';
        claimBtn.onclick = () => claimTarget(playerId, playerName, 'claim');
      }
      buttonsRow.appendChild(claimBtn);

      // Med Deal button
      const medBtn = document.createElement('button');
      if (status.hasMedDeal && status.isMyMedDeal) {
        medBtn.className = 'odin-profile-btn odin-profile-btn-meddeal';
        medBtn.innerHTML = '💉 Release';
        medBtn.onclick = () => releaseClaim(playerId, 'meddeal');
      } else if (status.hasMedDeal) {
        medBtn.className = 'odin-profile-btn odin-profile-btn-secondary';
        medBtn.innerHTML = `💉 ${status.medDealOwner}`;
        medBtn.disabled = true;
      } else {
        medBtn.className = 'odin-profile-btn odin-profile-btn-meddeal';
        medBtn.innerHTML = '💉 Med';
        medBtn.onclick = () => claimTarget(playerId, playerName, 'meddeal');
      }
      buttonsRow.appendChild(medBtn);

      // Farm button
      const farmBtn = document.createElement('button');
      if (status.hasDib && status.isMyDib) {
        farmBtn.className = 'odin-profile-btn odin-profile-btn-farm';
        farmBtn.innerHTML = '🌾 Release';
        farmBtn.onclick = () => releaseClaim(playerId, 'farm');
      } else if (status.hasDib) {
        farmBtn.className = 'odin-profile-btn odin-profile-btn-secondary';
        farmBtn.innerHTML = `🌾 ${status.dibOwner}`;
        farmBtn.disabled = true;
      } else {
        farmBtn.className = 'odin-profile-btn odin-profile-btn-farm';
        farmBtn.innerHTML = '🌾 Farm';
        farmBtn.onclick = () => claimTarget(playerId, playerName, 'farm');
      }
      buttonsRow.appendChild(farmBtn);

      container.appendChild(buttonsRow);

      // Ownership summary
      const statusParts = [];
      if (status.isClaimed) statusParts.push(`<span style="color: ${status.isMyeClaim ? '#48bb78' : '#ed8936'}">Claim: ${status.isMyeClaim ? 'You' : status.claimOwner}</span>`);
      if (status.hasDib) statusParts.push(`<span style="color: ${status.isMyDib ? '#38b2ac' : '#a0aec0'}">Dibs: ${status.isMyDib ? 'You' : status.dibOwner}</span>`);
      if (status.hasMedDeal) statusParts.push(`<span style="color: ${status.isMyMedDeal ? '#9f7aea' : '#a0aec0'}">Med: ${status.isMyMedDeal ? 'You' : status.medDealOwner}</span>`);

      if (statusParts.length > 0) {
        const ownershipLine = document.createElement('div');
        ownershipLine.className = 'odin-ownership-line';
        ownershipLine.innerHTML = statusParts.join(' • ');
        container.appendChild(ownershipLine);
      }

      return container;
    }

    // ============================================
    // INJECTION LOGIC
    // ============================================
    function injectProfileButtons() {
      const url = window.location.href;
      
      // Profile page
      if (url.includes('profiles.php') && url.includes('XID=')) {
        const playerId = extractPlayerId(url);
        if (!playerId || playerId === lastInjectedProfileId) return;

        // Find injection point
        const profileWrapper = document.querySelector('.profile-wrapper .profile-buttons') ||
                              document.querySelector('.profile-wrapper .profile-container') ||
                              document.querySelector('.profile-wrapper .user-information');

        if (!profileWrapper) return;

        // Remove existing
        const existing = document.getElementById('odin-profile-buttons');
        if (existing) existing.remove();

        const playerName = extractPlayerNameFromPage();
        const buttons = createProfileButtons(playerId, playerName);
        profileWrapper.insertAdjacentElement('afterend', buttons);

        lastInjectedProfileId = playerId;
        log('[Profile Injection] Injected buttons for player:', playerId);
      }
    }

    function injectAttackButtons() {
      const url = window.location.href;
      
      // Attack page
      if (url.includes('loader.php') && url.includes('sid=attack') && url.includes('user2ID=')) {
        const playerId = extractPlayerId(url);
        if (!playerId || playerId === lastInjectedAttackId) return;

        // Find injection point
        const attackWrapper = document.querySelector('.playersModelWrap___dkqHO') ||
                             document.querySelector('.players___eKiHL') ||
                             document.querySelector('#attack-app');

        if (!attackWrapper) return;

        // Remove existing
        const existing = document.getElementById('odin-attack-container');
        if (existing) existing.remove();

        const playerName = extractPlayerNameFromPage();
        const buttons = createAttackPageButtons(playerId, playerName);
        attackWrapper.insertAdjacentElement('afterend', buttons);

        lastInjectedAttackId = playerId;
        log('[Profile Injection] Injected attack buttons for player:', playerId);
      }
    }

    function refreshButtons() {
      lastInjectedProfileId = null;
      lastInjectedAttackId = null;
      injectProfileButtons();
      injectAttackButtons();
    }

    // ============================================
    // OBSERVER
    // ============================================
    function startObserver() {
      if (observerInstance) return;

      let debounceTimer = null;
      let lastRun = 0;
      const minInterval = 250;

      const scheduleInject = () => {
        const now = Date.now();
        const elapsed = now - lastRun;

        if (elapsed >= minInterval) {
          lastRun = now;
          injectProfileButtons();
          return;
        }

        if (debounceTimer) return;

        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          lastRun = Date.now();
          injectProfileButtons();
        }, minInterval - elapsed);
      };

      observerInstance = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            scheduleInject();
            break;
          }
        }
      });

      const target = document.getElementById('mainContainer') || document.getElementById('main') || document.body;

      observerInstance.observe(target, {
        childList: true,
        subtree: true
      });

      scheduleInject();
    }

    function stopObserver() {
      if (observerInstance) {
        observerInstance.disconnect();
        observerInstance = null;
      }
    }

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[Profile Injection] Initializing v' + INJECTION_VERSION);

      injectStyles();
      startObserver();

      // Initial injection
      setTimeout(() => {
        injectProfileButtons();
        injectAttackButtons();
      }, 500);

      // Listen for navigation events
      window.addEventListener('popstate', () => {
        lastInjectedProfileId = null;
        lastInjectedAttackId = null;
        setTimeout(() => {
          injectProfileButtons();
          injectAttackButtons();
        }, 300);
      });

      // Listen for claim updates
      nexus.on('CLAIM_MADE', refreshButtons);
      nexus.on('CLAIM_RELEASED', refreshButtons);
      nexus.on('DIB_MADE', refreshButtons);
      nexus.on('DIB_RELEASED', refreshButtons);
      nexus.on('MED_DEAL_MADE', refreshButtons);
      nexus.on('MED_DEAL_RELEASED', refreshButtons);

      injectionActive = true;
      log('[Profile Injection] Ready');
    }

    function destroy() {
      log('[Profile Injection] Destroying...');
      stopObserver();
      
      const profileButtons = document.getElementById('odin-profile-buttons');
      if (profileButtons) profileButtons.remove();

      const attackButtons = document.getElementById('odin-attack-container');
      if (attackButtons) attackButtons.remove();

      const styles = document.getElementById('odin-profile-injection-styles');
      if (styles) styles.remove();

      injectionActive = false;
      log('[Profile Injection] Destroyed');
    }

    return { id: 'ui-profile-injection', init, destroy };
  });
})();
