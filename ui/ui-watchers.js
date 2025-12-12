// ui-watchers.js
// Watcher schedule UI
// Version: 3.1.0 - Fixed: Single tab registration pattern

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function OdinUIModule_WatchersInit(OdinContext) {
    const ctx = OdinContext || {};
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;

    // ============================================
    // RENDER FUNCTION
    // ============================================
    function renderWatchers() {
      const UI = window.OdinUI?.helpers;
      const spear = window.OdinsSpear?.services;
      if (!UI) return '<p>Loading...</p>';

      const container = document.createElement('div');
      const schedule = spear?.WatchersService?.getSchedule() || [];
      const currentShift = spear?.WatchersService?.getCurrentShift();
      const upcomingShifts = spear?.WatchersService?.getUpcomingShifts(24) || [];

      // ============================================
      // CURRENT WATCHER SECTION
      // ============================================
      const currentSection = UI.createSection('Current Watcher', '👁️');

      if (currentShift) {
        const now = Date.now();
        const endTime = new Date(currentShift.endTime).getTime();
        const remaining = Math.max(0, endTime - now);
        const remainingMins = Math.floor(remaining / 60000);
        const remainingSecs = Math.floor((remaining % 60000) / 1000);

        const currentCard = UI.createCard(`
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="
              width: 64px;
              height: 64px;
              border-radius: 50%;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
            ">
              👁️
            </div>
            <div style="flex: 1;">
              <div style="font-size: 20px; font-weight: 700; color: #e2e8f0;">
                ${currentShift.watcherName}
              </div>
              <div style="font-size: 12px; color: #718096; margin-top: 4px;">
                On duty since ${new Date(currentShift.startTime).toLocaleTimeString()}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 28px; font-weight: 700; color: #ed8936;">
                ${remainingMins}:${remainingSecs.toString().padStart(2, '0')}
              </div>
              <div style="font-size: 11px; color: #718096;">remaining</div>
            </div>
          </div>
        `);

        currentSection.appendChild(currentCard);
      } else {
        const emptyCard = UI.createCard(`
          <div style="text-align: center; padding: 24px;">
            <div style="font-size: 36px; margin-bottom: 12px;">🌙</div>
            <div style="color: #718096;">No active watcher</div>
          </div>
        `);
        currentSection.appendChild(emptyCard);
      }

      container.appendChild(currentSection);

      // ============================================
      // ADD SHIFT SECTION
      // ============================================
      const addSection = UI.createSection('Add Watcher Shift', '➕');

      const now = new Date();
      const defaultStart = new Date(now.getTime() + 3600000).toISOString().slice(0, 16);
      const defaultEnd = new Date(now.getTime() + 7200000).toISOString().slice(0, 16);

      const addCard = UI.createCard(`
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
              Watcher Name
            </label>
            <input type="text" id="watcher-name" 
              placeholder="Enter watcher name"
              style="
                width: 100%;
                padding: 10px 12px;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 6px;
                color: #e2e8f0;
                font-size: 14px;
              ">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
                Start Time
              </label>
              <input type="datetime-local" id="watcher-start" 
                value="${defaultStart}"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  background: rgba(0,0,0,0.3);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 6px;
                  color: #e2e8f0;
                  font-size: 14px;
                ">
            </div>
            <div>
              <label style="display: block; color: #a0aec0; font-size: 12px; margin-bottom: 6px;">
                End Time
              </label>
              <input type="datetime-local" id="watcher-end" 
                value="${defaultEnd}"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  background: rgba(0,0,0,0.3);
                  border: 1px solid rgba(255,255,255,0.1);
                  border-radius: 6px;
                  color: #e2e8f0;
                  font-size: 14px;
                ">
            </div>
          </div>
          <button id="add-shift" class="odin-btn odin-btn-success" style="width: 100%;">
            ➕ Add Shift
          </button>
        </div>
      `);

      addSection.appendChild(addCard);
      container.appendChild(addSection);

      // ============================================
      // UPCOMING SHIFTS SECTION
      // ============================================
      if (upcomingShifts.length > 0) {
        const upcomingSection = UI.createSection(`Upcoming Shifts (${upcomingShifts.length})`, '📅');

        const upcomingCard = document.createElement('div');
        upcomingCard.className = 'odin-card';
        upcomingCard.style.padding = '0';

        upcomingCard.innerHTML = upcomingShifts.map((shift, idx) => {
          const startTime = new Date(shift.startTime);
          const endTime = new Date(shift.endTime);
          const duration = (endTime - startTime) / 3600000;

          return `
            <div style="
              padding: 12px 16px;
              border-bottom: 1px solid rgba(255,255,255,0.05);
              background: ${idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'};
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <div>
                <div style="font-weight: 500; color: #e2e8f0;">${shift.watcherName}</div>
                <div style="font-size: 12px; color: #718096; margin-top: 2px;">
                  ${startTime.toLocaleString()} → ${endTime.toLocaleTimeString()}
                </div>
                <div style="font-size: 11px; color: #667eea; margin-top: 2px;">
                  ${duration.toFixed(1)}h shift
                </div>
              </div>
              <button class="shift-remove odin-btn odin-btn-danger" data-id="${shift.id}" style="padding: 4px 8px;">
                ✕
              </button>
            </div>
          `;
        }).join('');

        upcomingSection.appendChild(upcomingCard);
        container.appendChild(upcomingSection);
      }

      // ============================================
      // FULL SCHEDULE SECTION
      // ============================================
      if (schedule.length > 0) {
        const fullSection = UI.createSection(`Full Schedule (${schedule.length} shifts)`, '📋');

        const fullCard = document.createElement('div');
        fullCard.className = 'odin-card';
        fullCard.innerHTML = `
          <div style="max-height: 300px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: rgba(0,0,0,0.3); text-align: left;">
                  <th style="padding: 8px 12px; color: #a0aec0;">Watcher</th>
                  <th style="padding: 8px 12px; color: #a0aec0;">Start</th>
                  <th style="padding: 8px 12px; color: #a0aec0;">End</th>
                  <th style="padding: 8px 12px; color: #a0aec0;">Duration</th>
                  <th style="padding: 8px 12px; color: #a0aec0;"></th>
                </tr>
              </thead>
              <tbody>
                ${schedule.map((shift, idx) => {
                  const start = new Date(shift.startTime);
                  const end = new Date(shift.endTime);
                  const hours = ((end - start) / 3600000).toFixed(1);
                  const isPast = end.getTime() < Date.now();
                  
                  return `
                    <tr style="
                      background: ${idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)'};
                      ${isPast ? 'opacity: 0.5;' : ''}
                    ">
                      <td style="padding: 8px 12px; color: #e2e8f0;">${shift.watcherName}</td>
                      <td style="padding: 8px 12px; color: #a0aec0;">${start.toLocaleString()}</td>
                      <td style="padding: 8px 12px; color: #a0aec0;">${end.toLocaleTimeString()}</td>
                      <td style="padding: 8px 12px; color: #667eea;">${hours}h</td>
                      <td style="padding: 8px 12px;">
                        <button class="shift-remove" data-id="${shift.id}" 
                          style="background: transparent; border: none; color: #fc8181; cursor: pointer; font-size: 14px;">
                          ✕
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button id="clear-past-shifts" class="odin-btn odin-btn-warning">
              🗑️ Clear Past Shifts
            </button>
            <button id="clear-all-shifts" class="odin-btn odin-btn-danger">
              ⚠️ Clear All
            </button>
          </div>
        `;

        fullSection.appendChild(fullCard);
        container.appendChild(fullSection);
      }

      setTimeout(() => attachEventListeners(), 0);

      return container;
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
      const spear = window.OdinsSpear?.services;

      document.getElementById('add-shift')?.addEventListener('click', () => {
        const name = document.getElementById('watcher-name')?.value?.trim();
        const start = document.getElementById('watcher-start')?.value;
        const end = document.getElementById('watcher-end')?.value;

        if (!name) {
          alert('Please enter a watcher name');
          return;
        }

        if (!start || !end) {
          alert('Please select start and end times');
          return;
        }

        const startDate = new Date(start);
        const endDate = new Date(end);

        if (endDate <= startDate) {
          alert('End time must be after start time');
          return;
        }

        spear?.WatchersService?.addShift({
          watcherName: name,
          watcherId: `user_${Date.now()}`,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        });

        window.OdinUI?.refreshContent();
        log('[Watchers] Shift added:', name);
      });

      document.querySelectorAll('.shift-remove').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const shiftId = e.target.dataset.id;
          if (shiftId && confirm('Remove this shift?')) {
            spear?.WatchersService?.removeShift(shiftId);
            window.OdinUI?.refreshContent();
          }
        });
      });

      document.getElementById('clear-past-shifts')?.addEventListener('click', () => {
        const schedule = spear?.WatchersService?.getSchedule() || [];
        const now = Date.now();
        let removed = 0;

        schedule.forEach((shift) => {
          if (new Date(shift.endTime).getTime() < now) {
            spear?.WatchersService?.removeShift(shift.id);
            removed++;
          }
        });

        window.OdinUI?.refreshContent();
        log('[Watchers] Cleared', removed, 'past shifts');
      });

      document.getElementById('clear-all-shifts')?.addEventListener('click', () => {
        if (confirm('Clear all scheduled shifts?')) {
          spear?.WatchersService?.clearSchedule();
          window.OdinUI?.refreshContent();
        }
      });
    }

    // ============================================
    // MODULE INIT (Fixed: Single registration pattern)
    // ============================================
    function init() {
      log('[UI Watchers] Initializing v3.1.0');

      // Single registration helper (B cleanup)
      const register = () => window.OdinUI?.registerTabContent('watchers', renderWatchers);

      nexus.on('UI_READY', register);
      if (window.OdinUI) register();

      // Listen for shift changes
      nexus.on('WATCHER_SHIFT_START', () => {
        if (window.OdinUI?.getState()?.activeTab === 'watchers') {
          window.OdinUI.refreshContent();
        }
      });

      nexus.on('WATCHER_SHIFT_END', () => {
        if (window.OdinUI?.getState()?.activeTab === 'watchers') {
          window.OdinUI.refreshContent();
        }
      });
    }

    function destroy() {
      log('[UI Watchers] Destroyed');
    }

    return { id: 'ui-watchers', init, destroy };
  });
})();
