// Odin Tools MOBILE Diagnostic Script
// This shows results VISUALLY on the page (no console needed)
// Add this as your LAST @require

(function() {
  'use strict';
  
  // Wait a bit for everything to load
  setTimeout(() => {
    
    // Create a visual diagnostic panel
    const panel = document.createElement('div');
    panel.id = 'odin-diagnostic-panel';
    panel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 2px solid #667eea;
      border-radius: 12px;
      padding: 20px;
      z-index: 9999999;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    `;
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #667eea;">🔍 Odin Diagnostic</h2>
        <button id="close-diagnostic" style="
          background: #e53e3e;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        ">Close</button>
      </div>
      <div style="font-size: 14px; line-height: 1.6;">
    `;
    
    // Check 1: OdinModules
    if (!window.OdinModules) {
      html += `
        <div style="background: rgba(229, 62, 62, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #fc8181; margin-bottom: 8px;">❌ CRITICAL: OdinModules Missing</div>
          <div style="font-size: 12px;">
            <strong>Problem:</strong> window.OdinModules is not defined.<br>
            <strong>Cause:</strong> No module files loaded at all.<br>
            <strong>Fix:</strong> Check your @require URLs are correct and accessible.
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(72, 187, 120, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #48bb78;">✅ OdinModules Found</div>
          <div style="font-size: 12px;">
            Loaded: <strong>${window.OdinModules.length} modules</strong><br>
            Expected: 8-9 modules (ui-core + tab modules)
          </div>
        </div>
      `;
      
      if (window.OdinModules.length < 8) {
        html += `
          <div style="background: rgba(237, 137, 54, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #ed8936;">⚠️ Warning: Too Few Modules</div>
            <div style="font-size: 12px;">
              You have ${window.OdinModules.length} modules but should have 8-9.<br>
              Some module files may not be loading.
            </div>
          </div>
        `;
      }
    }
    
    // Check 2: OdinUI
    if (!window.OdinUI) {
      html += `
        <div style="background: rgba(229, 62, 62, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #fc8181; margin-bottom: 8px;">❌ CRITICAL: OdinUI Missing</div>
          <div style="font-size: 12px;">
            <strong>Problem:</strong> window.OdinUI is not defined.<br>
            <strong>Cause:</strong> ui-core.js didn't initialize OR modules aren't being initialized.<br>
            <strong>Fix:</strong> You need an initialization script that calls module.init() functions.
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(72, 187, 120, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #48bb78;">✅ OdinUI Exists</div>
          <div style="font-size: 12px;">
            Version: <strong>${window.OdinUI.version || 'unknown'}</strong><br>
            Helpers: ${window.OdinUI.helpers ? '✅ Available' : '❌ Missing'}
          </div>
        </div>
      `;
    }
    
    // Check 3: OdinContext
    if (!window.OdinContext) {
      html += `
        <div style="background: rgba(237, 137, 54, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #ed8936;">⚠️ OdinContext Missing</div>
          <div style="font-size: 12px;">
            <strong>Problem:</strong> window.OdinContext is not defined.<br>
            <strong>Impact:</strong> Modules will use fallback context with limited features.<br>
            <strong>Fix:</strong> You need to create OdinContext before initializing modules.
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(72, 187, 120, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #48bb78;">✅ OdinContext Exists</div>
          <div style="font-size: 12px;">
            Nexus: ${window.OdinContext.nexus ? '✅' : '❌'}<br>
            Storage: ${window.OdinContext.storage ? '✅' : '❌'}<br>
            API: ${window.OdinContext.api ? '✅' : '❌'}
          </div>
        </div>
      `;
    }
    
    // Check 4: UI Button
    const uiButton = document.querySelector('.odin-toggle-btn');
    if (uiButton) {
      html += `
        <div style="background: rgba(72, 187, 120, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #48bb78;">✅ Odin Button Found</div>
          <div style="font-size: 12px;">
            The Odin toggle button exists on the page.
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(237, 137, 54, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; color: #ed8936;">⚠️ Odin Button Not Found</div>
          <div style="font-size: 12px;">
            The Odin toggle button doesn't exist yet.<br>
            This means ui-core hasn't fully initialized.
          </div>
        </div>
      `;
    }
    
    // Summary
    html += `
      <div style="background: rgba(102, 126, 234, 0.2); padding: 16px; border-radius: 8px; margin-top: 16px;">
        <div style="font-weight: 600; color: #667eea; margin-bottom: 12px;">📋 Summary</div>
    `;
    
    if (!window.OdinModules) {
      html += `
        <div style="font-size: 13px; color: #fc8181; font-weight: 600;">
          🚨 PROBLEM: Module files aren't loading
        </div>
        <div style="font-size: 12px; margin-top: 8px;">
          <strong>Next Steps:</strong><br>
          1. Check your @require URLs are correct<br>
          2. Make sure the files are accessible from GitHub<br>
          3. Verify Tampermonkey is enabled for torn.com
        </div>
      `;
    } else if (!window.OdinUI) {
      html += `
        <div style="font-size: 13px; color: #fc8181; font-weight: 600;">
          🚨 PROBLEM: Modules loaded but not initialized
        </div>
        <div style="font-size: 12px; margin-top: 8px;">
          <strong>Next Steps:</strong><br>
          You need to add initialization code to your script.<br>
          Download the "odin-main-init-example.js" file I provided<br>
          and add that code to your userscript (NOT as @require).
        </div>
      `;
    } else if (!uiButton) {
      html += `
        <div style="font-size: 13px; color: #ed8936; font-weight: 600;">
          ⚠️ PROBLEM: UI initialized but button missing
        </div>
        <div style="font-size: 12px; margin-top: 8px;">
          <strong>Next Steps:</strong><br>
          The UI might be initializing slowly.<br>
          Wait a few seconds and check again.<br>
          Or there may be a timing issue with module initialization.
        </div>
      `;
    } else {
      html += `
        <div style="font-size: 13px; color: #48bb78; font-weight: 600;">
          ✅ Everything looks good!
        </div>
        <div style="font-size: 12px; margin-top: 8px;">
          If tabs aren't working, click the Odin button<br>
          and try switching tabs to see which ones load.
        </div>
      `;
    }
    
    html += `
      </div>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #718096;">
        Diagnostic run at: ${new Date().toLocaleTimeString()}
      </div>
    `;
    
    html += '</div>';
    panel.innerHTML = html;
    
    document.body.appendChild(panel);
    
    // Close button handler
    document.getElementById('close-diagnostic')?.addEventListener('click', () => {
      panel.remove();
    });
    
  }, 1000); // Wait 1 second for everything to load
  
})();
