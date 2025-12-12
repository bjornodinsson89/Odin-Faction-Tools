// Odin Tools Diagnostic Script
// Add this AFTER all your other Odin modules load
// It will help identify what's working and what's not

(function() {
  'use strict';
  
  console.log('=== ODIN DIAGNOSTIC STARTING ===');
  
  // Check 1: OdinModules array
  if (!window.OdinModules) {
    console.error('❌ window.OdinModules is not defined!');
    console.log('   Make sure at least one Odin module has loaded.');
    return;
  }
  console.log(`✅ window.OdinModules exists with ${window.OdinModules.length} modules`);
  
  // Check 2: OdinUI global
  if (!window.OdinUI) {
    console.error('❌ window.OdinUI is not defined!');
    console.log('   This means ui-core.js has not initialized properly.');
    console.log('   Check that ui-core.js is loading and its init() is being called.');
  } else {
    console.log('✅ window.OdinUI exists');
    console.log('   Version:', window.OdinUI.version);
    console.log('   Helpers:', window.OdinUI.helpers ? 'Available' : 'Missing');
  }
  
  // Check 3: OdinContext
  if (!window.OdinContext) {
    console.warn('⚠️  window.OdinContext is not defined');
    console.log('   Modules will use fallback context with limited functionality');
  } else {
    console.log('✅ window.OdinContext exists');
    console.log('   Nexus:', window.OdinContext.nexus ? 'Available' : 'Missing');
    console.log('   Storage:', window.OdinContext.storage ? 'Available' : 'Missing');
    console.log('   API:', window.OdinContext.api ? 'Available' : 'Missing');
  }
  
  // Check 4: Registered tabs
  if (window.OdinUI && window.OdinUI.helpers) {
    // Try to access internal state (this is a hack for diagnostics)
    console.log('\n=== CHECKING TAB REGISTRATIONS ===');
    
    const expectedTabs = [
      'war-room', 'targets', 'chain', 'retals', 
      'watchers', 'faction', 'leadership', 'settings'
    ];
    
    expectedTabs.forEach(tabId => {
      // We can't directly access tabRenderers, so we'll try opening the UI
      // and checking if the tab renders
      console.log(`📋 Expected tab: ${tabId}`);
    });
    
    console.log('\nℹ️  To check if tabs are registered, open the Odin UI and try switching tabs.');
    console.log('   If you see "Loading..." that doesn\'t change, the tab isn\'t registered.');
  }
  
  // Check 5: Module initialization
  console.log('\n=== MODULE INITIALIZATION CHECK ===');
  console.log('ℹ️  If you\'re using Tampermonkey, check the console for:');
  console.log('   "[UI Core] Initializing vX.X.X"');
  console.log('   "[UI Core] Ready"');
  console.log('   "[UI War Room] Initializing vX.X.X"');
  console.log('   etc. for each module');
  console.log('\nIf you DON\'T see these messages, the modules aren\'t being initialized.');
  
  // Check 6: Event system
  if (window.OdinContext && window.OdinContext.nexus) {
    console.log('\n=== TESTING EVENT SYSTEM ===');
    let eventReceived = false;
    
    const unsubscribe = window.OdinContext.nexus.on('DIAGNOSTIC_TEST', () => {
      eventReceived = true;
      console.log('✅ Event system working - received test event');
    });
    
    window.OdinContext.nexus.emit('DIAGNOSTIC_TEST');
    
    setTimeout(() => {
      if (!eventReceived) {
        console.error('❌ Event system not working - test event not received');
      }
      unsubscribe();
    }, 100);
  }
  
  // Check 7: Common issues
  console.log('\n=== COMMON ISSUES CHECKLIST ===');
  console.log('1. Load order: ui-core.js must load FIRST');
  console.log('2. If using @require, make sure URLs are correct and accessible');
  console.log('3. Check browser console for any JavaScript errors');
  console.log('4. Make sure you have an OdinContext initialization script that runs BEFORE modules');
  console.log('5. Verify that all module init() functions are being called');
  
  console.log('\n=== DIAGNOSTIC COMPLETE ===\n');
  
  // Provide a helper function
  window.OdinDiagnostic = {
    checkUI: function() {
      if (!window.OdinUI) {
        console.error('OdinUI not available');
        return;
      }
      console.log('UI State:', window.OdinUI.getState());
    },
    
    listModules: function() {
      if (!window.OdinModules) {
        console.error('OdinModules not available');
        return;
      }
      console.log(`Total modules: ${window.OdinModules.length}`);
      window.OdinModules.forEach((mod, i) => {
        console.log(`${i + 1}. ${mod.name || 'Anonymous'}`);
      });
    },
    
    forceRefresh: function() {
      if (window.OdinUI && window.OdinUI.refreshContent) {
        window.OdinUI.refreshContent();
        console.log('Forced UI refresh');
      } else {
        console.error('Cannot refresh - OdinUI not available');
      }
    }
  };
  
  console.log('💡 Diagnostic helpers available:');
  console.log('   OdinDiagnostic.checkUI()      - Check UI state');
  console.log('   OdinDiagnostic.listModules()  - List loaded modules');
  console.log('   OdinDiagnostic.forceRefresh() - Force UI refresh');
  
})();
