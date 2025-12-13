// Odin Content Diagnostic - Why are the cards empty?
// Add this AFTER all other requires

(function() {
  'use strict';
  
  setTimeout(() => {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 320px;
      max-height: 400px;
      overflow-y: auto;
      background: rgba(26, 26, 46, 0.98);
      border: 2px solid #667eea;
      border-radius: 12px;
      padding: 16px;
      z-index: 9999999;
      color: #e2e8f0;
      font-family: sans-serif;
      font-size: 13px;
    `;
    
    let html = `
      <div style="font-weight: 700; color: #667eea; margin-bottom: 12px; font-size: 14px;">
        🔍 Content Debug
      </div>
    `;
    
    // Check helpers
    const helpers = window.OdinUI?.helpers;
    html += `<div style="margin-bottom: 8px;">`;
    html += `<strong>UI Helpers:</strong><br>`;
    if (!helpers) {
      html += `❌ Not found<br>`;
    } else {
      html += `createSection: ${typeof helpers.createSection === 'function' ? '✅' : '❌'}<br>`;
      html += `createCard: ${typeof helpers.createCard === 'function' ? '✅' : '❌'}<br>`;
      html += `createButton: ${typeof helpers.createButton === 'function' ? '✅' : '❌'}<br>`;
    }
    html += `</div>`;
    
    // Check OdinsSpear
    html += `<div style="margin-bottom: 8px;">`;
    html += `<strong>OdinsSpear:</strong><br>`;
    if (!window.OdinsSpear) {
      html += `❌ <span style="color: #fc8181;">NOT LOADED!</span><br>`;
      html += `<div style="font-size: 11px; color: #a0aec0; margin-top: 4px;">
        This is why content is empty!<br>
        Tabs need OdinsSpear services for data.
      </div>`;
    } else {
      html += `✅ Loaded<br>`;
      const services = window.OdinsSpear.services;
      if (!services) {
        html += `Services: ❌ Missing<br>`;
      } else {
        html += `Services: ✅ Available<br>`;
        html += `<div style="font-size: 11px; margin-left: 8px;">`;
        html += `WarConfig: ${services.WarConfigService ? '✅' : '❌'}<br>`;
        html += `ChainMonitor: ${services.ChainMonitorService ? '✅' : '❌'}<br>`;
        html += `ChainRisk: ${services.ChainRiskService ? '✅' : '❌'}<br>`;
        html += `AttackLog: ${services.AttackLogService ? '✅' : '❌'}<br>`;
        html += `Claims: ${services.ClaimsService ? '✅' : '❌'}<br>`;
        html += `Watchers: ${services.WatchersService ? '✅' : '❌'}<br>`;
        html += `</div>`;
      }
    }
    html += `</div>`;
    
    // Test createCard
    html += `<div style="margin-bottom: 8px;">`;
    html += `<strong>Test createCard:</strong><br>`;
    if (helpers && helpers.createCard) {
      try {
        const testCard = helpers.createCard('<div>TEST</div>');
        if (testCard && testCard.innerHTML) {
          html += `✅ Function works<br>`;
        } else {
          html += `⚠️ Returns empty<br>`;
        }
      } catch (e) {
        html += `❌ Error: ${e.message}<br>`;
      }
    }
    html += `</div>`;
    
    // Check active tab
    const state = window.OdinUI?.getState();
    html += `<div style="margin-bottom: 8px;">`;
    html += `<strong>Active Tab:</strong> ${state?.activeTab || 'unknown'}<br>`;
    html += `</div>`;
    
    // Summary
    html += `<div style="margin-top: 12px; padding: 12px; background: rgba(102, 126, 234, 0.2); border-radius: 6px; font-size: 12px;">`;
    if (!window.OdinsSpear) {
      html += `<strong style="color: #fc8181;">PROBLEM FOUND:</strong><br>`;
      html += `OdinsSpear is missing! The UI tabs need backend services to display data.<br><br>`;
      html += `You need to load the core Odin modules (data services) before the UI modules.`;
    } else {
      html += `<strong style="color: #48bb78;">Services loaded!</strong><br>`;
      html += `If content is still empty, there may be a data issue.`;
    }
    html += `</div>`;
    
    html += `<button id="close-debug" style="
      margin-top: 12px;
      width: 100%;
      padding: 8px;
      background: #667eea;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 12px;
      cursor: pointer;
    ">Close</button>`;
    
    panel.innerHTML = html;
    document.body.appendChild(panel);
    
    document.getElementById('close-debug')?.addEventListener('click', () => {
      panel.remove();
    });
    
  }, 2000);
  
})();
