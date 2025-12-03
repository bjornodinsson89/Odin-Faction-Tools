// ==UserScript==
// @name         Odin Tools
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Faction Tools
// @author       BjornOdinsson89
// @match        https://www.torn.com/*
// @match        https://www2.torn.com/*
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @connect      github.com
// @connect      raw.githubusercontent.com
// @connect      api.torn.com
// @connect      worldtimeapi.org
// @connect      torn-war-room-default-rtdb.firebaseio.com
// @connect      torn-war-room.firebasestorage.app
// @require      https://raw.githubusercontent.com/bjornodinsson89/Odin-Faction-Tools/main/modules/freki.js
// ==/UserScript==

'use strict';

// Lightweight event bus for inter-module messaging
const Nexus = {
  _listeners: {},
  on(evt, fn) {
    (this._listeners[evt] = this._listeners[evt] || []).push(fn);
  },
  emit(evt, payload) {
    const L = this._listeners[evt];
    if (L) for (const fn of L) try { fn(payload); } catch (e) { console.error(e); }
  },
  log(msg) { console.log(`[ODIN:NEXUS] ${msg}`); }
};

window.OdinModules = window.OdinModules || [];

const dbName = "OdinDB";
const dbVersion = 3;
const maxTargets = 50;

let dbInstance = null;

async function getDB() {
  if (dbInstance === null) {
    dbInstance = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, dbVersion);
      request.onerror = (event) => reject("IndexedDB error: " + (event.target.error ? event.target.error.message : "Unknown"));
      request.onsuccess = (event) => resolve(event.target.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("targets")) {
          db.createObjectStore("targets", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("warTargets")) {
          db.createObjectStore("warTargets", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("factionMembers")) {
          db.createObjectStore("factionMembers", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("rankedWars")) {
          db.createObjectStore("rankedWars", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("enemyFactions")) {
          db.createObjectStore("enemyFactions", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("errors")) {
          db.createObjectStore("errors", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      };
    });
  }
  return dbInstance;
}

async function getFromDB(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onerror = (event) => reject("Get error: " + (event.target.error ? event.target.error.message : "Unknown"));
    request.onsuccess = (event) => resolve(event.target.result ? event.target.result.value : null);
  });
}

async function setToDB(storeName, key, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put({ key, value });
    request.onerror = (event) => {
      if (event.target.error.name === 'QuotaExceededError') {
        GM_notification("Storage full - attempting to clear cache.");
        clearStore('cache').then(() => {
          const retryRequest = store.put({ key, value });
          retryRequest.onsuccess = () => resolve();
          retryRequest.onerror = (event) => {
            if (event.target.error.name === 'QuotaExceededError') {
              GM_notification("Storage still full - clearing all stores.");
              clearAllStores().then(() => {
                const finalRetry = store.put({ key, value });
                finalRetry.onsuccess = () => resolve();
                finalRetry.onerror = (event) => reject("Final put error: " + (event.target.error ? event.target.error.message : "Unknown"));
              }).catch(() => reject("Failed to clear all stores."));
            } else {
              reject("Put error: " + (event.target.error ? event.target.error.message : "Unknown"));
            }
          };
        }).catch(() => reject("Failed to clear cache."));
      } else {
        reject("Put error: " + (event.target.error ? event.target.error.message : "Unknown"));
      }
    };
    request.onsuccess = () => resolve();
  });
}

async function deleteFromDB(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = (event) => reject("Delete error: " + (event.target.error ? event.target.error.message : "Unknown"));
    request.onsuccess = () => resolve();
  });
}

async function loadAllFromStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onerror = (event) => reject("GetAll error: " + (event.target.error ? event.target.error.message : "Unknown"));
    request.onsuccess = (event) => resolve(event.target.result);
  });
}

async function clearStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onerror = (event) => reject("Clear error: " + (event.target.error ? event.target.error.message : "Unknown"));
    request.onsuccess = () => resolve();
  });
}

async function clearAllStores() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const stores = ['cache', 'targets', 'warTargets', 'factionMembers', 'rankedWars', 'enemyFactions', 'errors', 'settings'];
    const transaction = db.transaction(stores, "readwrite");
    let cleared = 0;
    stores.forEach(storeName => {
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => {
        cleared++;
        if (cleared === stores.length) resolve();
      };
      request.onerror = (event) => reject("Clear error in " + storeName + ": " + (event.target.error ? event.target.error.message : "Unknown"));
    });
  });
}

const styleElement = document.createElement('style');
styleElement.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Pirata+One&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Arial&family=Helvetica&family=Times+New+Roman&family=Courier&family=Courier+New&family=Georgia&family=Verdana&family=Tahoma&family=Trebuchet+MS&family=Palatino&family=Garamond&family=Bookman&family=Comic+Sans+MS&family=Impact&family=Lucida+Sans+Unicode&family=Geneva&family=Monaco&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Roboto&family=Open+Sans&family=Lato&family=Montserrat&family=Raleway&family=Poppins&family=Oswald&family=Source+Sans+Pro&family=Nunito&family=Ubuntu&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Bangers&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Shadows+Into+Light&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Indie+Flower&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Lobster&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Chewy&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Nosifer&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Creepster&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Bungee&display=swap');

  #odin-overlay {
    color: var(--font-color);
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    box-shadow: 0 8px 32px rgba(0,0,0,0.6), var(--neon-glow);
    border-radius: 12px;
    font-family: var(--font-family), monospace;
    transition: all 0.3s ease;
    padding: 20px 10px 10px 10px;
    position: fixed !important;
  }

  #odin-overlay * {
    font-family: var(--font-family), monospace;
  }

  .odin-menu-btn, #odin-overlay button, #odin-overlay input, #odin-overlay select, #odin-overlay table th, #odin-overlay table td, #odin-overlay h3, #odin-overlay h4, #odin-overlay p, #odin-overlay a, #odin-overlay label, #tct-clock {
    font-family: var(--font-family), monospace;
  }

  #odin-menu {
    display: flex;
    justify-content: flex-start;
    border-bottom: 1px solid #404040;
    margin-bottom: 0;
    overflow-x: auto;
    white-space: nowrap;
    padding-left: 1.5%;
    background: #252525;
    position: relative;
    z-index: 20;
  }

  .odin-menu-btn {
    background: #303030;
    color: var(--font-color);
    border: 1px solid #505050;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    padding: 8px 12px;
    margin: 0 4px 0 0;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2), var(--neon-glow);
  }

  .odin-menu-btn:hover {
    background: #404040;
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.3), var(--neon-glow);
  }

  .odin-menu-btn.active {
    background: #252525;
    border: 1px solid #505050;
    border-bottom: none;
    box-shadow: 0 0 8px var(--neon-color), var(--neon-glow);
    color: var(--neon-color);
  }

  .odin-menu-btn:active {
    transform: scale(0.98);
    background-color: #353535;
  }

  #odin-overlay button {
    background: linear-gradient(135deg, #303030, #404040);
    color: var(--font-color);
    border: 1px solid #505050;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;
    border-radius: 6px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2), var(--neon-glow);
  }

  #odin-overlay button:hover {
    background: linear-gradient(135deg, #404040, #505050);
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.3), var(--neon-glow);
  }

  #odin-overlay button:active {
    transform: scale(0.98);
    background: #353535;
  }

  #odin-overlay input, #odin-overlay select {
    background: #252525;
    color: var(--font-color);
    border: 1px solid #505050;
    padding: 8px;
    font-size: 14px;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  #odin-overlay input:focus, #odin-overlay select:focus {
    border-color: var(--neon-color);
    box-shadow: 0 0 4px var(--neon-color), var(--neon-glow);
  }

  #odin-overlay table {
    color: var(--font-color);
    min-width: 100%;
    border-collapse: separate;
    border-spacing: 0 4px;
    table-layout: fixed;
    background: #252525;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: var(--neon-glow);
  }

  #odin-overlay h3 {
    color: var(--header-color);
    margin: 16px 0 12px;
    text-align: center;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    font-weight: 700;
  }

  #odin-overlay .faction-header {
    color: var(--header-color);
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
  }

  #odin-overlay p {
    color: var(--font-color);
    margin: 12px 0;
    text-align: center;
  }

  #odin-overlay table th, #odin-overlay table td {
    border: 1px solid #404040;
    padding: 8px 12px;
    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
    color: var(--font-color) !important;
    background: #303030;
  }

  #odin-overlay table th {
    background: #252525;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--neon-color);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  #odin-section-content {
    margin-top: 10px;
    padding-left: 3px;
    padding-right: 3px;
  }

  #odin-overlay a {
    color: var(--link-color);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  #odin-overlay a:hover {
    color: #4fc3f7;
    text-decoration: underline;
  }

  @media (max-width: 300px) {
    #odin-overlay .responsive-table { border: none; }
    #odin-overlay .responsive-table th { display: none; }
    #odin-overlay .responsive-table tr { margin-bottom: 10px; display: block; border: 1px solid #404040; border-radius: 8px; background: #303030; }
    #odin-overlay .responsive-table td { display: block; text-align: right; font-size: 13px; border: none; position: relative; padding-left: 50%; }
    #odin-overlay .responsive-table td:before { content: attr(data-label); position: absolute; left: 0; width: 50%; padding-left: 10px; font-weight: bold; text-align: left; }
  }

  .status-icon {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 6px;
    box-shadow: 0 0 4px rgba(255,255,255,0.2);
  }

  .status-icon.online { background-color: #4CAF50; }
  .status-icon.offline { background-color: #f44336; }
  .status-icon.idle { background-color: #ffeb3b; }

  .table-container {
    max-height: 300px;
    overflow: auto;
    width: 100%;
    border: 1px solid #ccc;
    position: relative;
  }

  #odin-content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  #odin-section-content {
    flex: 1;
    overflow-y: auto;
    margin-top: 10px;
  }

  .status-btn {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    margin-right: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    transition: transform 0.2s ease;
  }

  .status-btn:hover {
    transform: scale(1.1);
  }

  .status-btn.green { background: var(--neon-color); }
  .status-btn.yellow { background: #ffeb3b; }
  .status-btn.red { background: #f44336; }

  .button-group {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 0 10px;
  }

  .small-button-group button {
    padding: 2px 6px;
    font-size: 10px;
  }
  .small-button-group {
    padding-left: 5px;
    padding-right: 5px;
    box-sizing: border-box;
  }

  .add-form {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 0 10px;
  }

  .add-form input {
    flex: 1;
    max-width: 70%;
  }

  h4 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin: 6px 0;
    color: var(--neon-color);
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    font-weight: 700;
  }

  #tct-clock {
    text-align: center;
    color: var(--font-color);
    font-size: 18px;
    margin-bottom: 12px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    font-family: var(--font-family);
  }

  #odin-toggle-container {
    display: flex;
    gap: 10px;
    margin-left: 10px;
  }

  .odin-toggle-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
  }

  .odin-profile-btn {
    width: 60px;
    height: 60px;
    border-radius: 8px;
    background-color: #404040;
    border: none;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .odin-profile-btn img {
    width: 40px;
    height: 40px;
    filter: grayscale(100%) brightness(0.5);
    transition: filter 0.2s ease;
  }

  .odin-profile-btn.checked {
    background-color: var(--neon-color);
    box-shadow: 0 0 10px var(--neon-color);
  }

  .odin-profile-btn.checked img {
    filter: grayscale(0%) brightness(1);
  }

  .odin-profile-btn:active {
    transform: scale(0.95);
    box-shadow: 0 0 15px var(--neon-color) inset;
  }

  .odin-profile-btn:hover {
    box-shadow: 0 0 8px var(--neon-color);
  }

  .odin-toggle-label {
    color: var(--neon-color);
    font-size: 12px;
    text-shadow: 0 1px 1px rgba(0,0,0,0.2);
  }

  .odin-toggle { display: none; }

  .attack-btn {
    background: linear-gradient(135deg, var(--neon-color), #388E3C);
    color: white;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 4px;
    font-size: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2), var(--neon-glow);
  }

  .attack-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3), var(--neon-glow);
  }

  .attack-btn:active {
    transform: scale(0.95);
  }

  .attack-btn.disabled {
    background: #808080;
    cursor: not-allowed;
  }

  #odin-resize-handle-width {
    width: 12px;
    background: linear-gradient(90deg, #303030, #404040);
    cursor: ew-resize;
    position: absolute;
    top: 0;
    height: 100%;
    transition: background 0.2s ease;
  }

  #odin-resize-handle-width:hover {
    background: linear-gradient(90deg, #404040, #505050);
  }

  #odin-resize-handle-width::before, #odin-resize-handle-width::after {
    content: '↔';
    position: absolute;
    color: #a0a0a0;
    font-size: 12px;
  }

  #odin-resize-handle-width.left::before, #odin-resize-handle-width.left::after {
    right: 3px;
    left: auto;
  }

  #odin-resize-handle-width.right::before, #odin-resize-handle-width.right::after {
    left: 3px;
    right: auto;
  }

  #odin-resize-handle-width::before { top: 8px; }
  #odin-resize-handle-width::after { bottom: 8px; }

  #odin-resize-handle-height {
    height: 12px;
    background: linear-gradient(0deg, #303030, #404040);
    cursor: ns-resize;
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    transition: background 0.2s ease;
  }

  #odin-resize-handle-height:hover {
    background: linear-gradient(0deg, #404040, #505050);
  }

  #odin-resize-handle-height::before, #odin-resize-handle-height::after {
    content: '↕';
    position: absolute;
    color: #a0a0a0;
    font-size: 12px;
  }

  #odin-resize-handle-height::before { left: 8px; top: 3px; }
  #odin-resize-handle-height::after { right: 8px; top: 3px; }

  #odin-resize-handle-top {
    height: 12px;
    background: linear-gradient(180deg, #303030, #404040);
    cursor: ns-resize;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    transition: background 0.2s ease;
  }

  #odin-resize-handle-top:hover {
    background: linear-gradient(180deg, #404040, #505050);
  }

  #odin-resize-handle-top::before, #odin-resize-handle-top::after {
    content: '↕';
    position: absolute;
    color: #a0a0a0;
    font-size: 12px;
  }

  #odin-resize-handle-top::before { left: 8px; top: 3px; }
  #odin-resize-handle-top::after { right: 8px; top: 3px; }

  #odin-overlay table tr:hover td {
    background: #353535;
  }

  .remove-target, .remove-war-target, .remove-enemy-faction {
    background: linear-gradient(135deg, #f44336, #d32f2f);
    color: white;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 4px;
    font-size: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2), var(--neon-glow);
  }

  .remove-target:hover, .remove-war-target:hover, .remove-enemy-faction:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 6px rgba(0,0,0,0.3), var(--neon-glow);
  }

  .remove-target:active, .remove-war-target:active, .remove-enemy-faction:active {
    transform: scale(0.95);
  }

  .settings-group {
    margin-bottom: 20px;
    padding: 15px;
    background: #303030;
    border-radius: 8px;
    border: 1px solid #404040;
  }

  .settings-group h4 {
    margin-top: 0;
    color: var(--neon-color);
  }

  .settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  }

  .settings-row label {
    color: #d0d0d0;
  }

  #member-search, #enemy-search {
    position: sticky;
    z-index: 12;
    background: #252525;
    padding: 8px;
    width: 100%;
    margin: 0;
    box-sizing: border-box;
  }

  #odin-section-content > h3,
  #odin-section-content > h4 {
    position: sticky;
    top: 0;
    background: #252525;
    z-index: 11;
    margin-top: 0;
    margin-bottom: 0;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  #odin-overlay table tbody td {
    position: relative;
    z-index: 1;
  }

  .small-button-group {
    padding-left: 5px;
    padding-right: 5px;
    box-sizing: border-box;
  }

  .button-group, .add-form {
    padding: 0 10px;
  }

  #odin-api-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100000;
  }

  #odin-api-modal-content {
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    border: 2px solid #404040;
    border-radius: 12px;
    padding: 30px;
    width: 400px;
    max-width: 90%;
    text-align: center;
    color: #e0e0e0;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  }

  #odin-api-modal h3 {
    color: var(--neon-color);
    margin-bottom: 20px;
    font-size: 18px;
  }

  #odin-api-modal p {
    margin-bottom: 20px;
    font-size: 14px;
  }

  #odin-api-input {
    width: 100%;
    padding: 10px;
    margin-bottom: 20px;
    background: #252525;
    border: 1px solid #505050;
    border-radius: 6px;
    color: #d0d0d0;
    font-size: 14px;
    box-sizing: border-box;
  }

  #odin-api-input:focus {
    border-color: var(--neon-color);
    outline: none;
  }

  #odin-api-buttons {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  #odin-api-btn-enter, #odin-api-btn-cancel, #odin-api-btn-wait {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  #odin-api-btn-enter {
    background: linear-gradient(135deg, var(--neon-color), #0099CC);
    color: white;
  }

  #odin-api-btn-enter:hover {
    background: linear-gradient(135deg, #0099CC, var(--neon-color));
    transform: translateY(-2px);
  }

  #odin-api-btn-cancel {
    background: linear-gradient(135deg, #f44336, #d32f2f);
    color: white;
  }

  #odin-api-btn-cancel:hover {
    background: linear-gradient(135deg, #d32f2f, #f44336);
    transform: translateY(-2px);
  }

  #odin-api-btn-wait {
    background: linear-gradient(135deg, #FF9800, #F57C00);
    color: white;
  }

  #odin-api-btn-wait:hover {
    background: linear-gradient(135deg, #F57C00, #FF9800);
    transform: translateY(-2px);
  }

  #odin-close-btn {
    position: absolute;
    top: 5px;
    right: 5px;
    background: red;
    color: white;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
  }

  #odin-floating-btn {
    position: fixed !important;
    bottom: 10px;
    left: 27px;
    z-index: 100001999999 !important;
    background-color: #303030;
    color: #ffffff;
    font-size: 16px;
    width: 189px;
    height: 63px;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    left: 25px !important;
    top: auto !important;
    right: auto !important;
    bottom: -13px !important;
    box-shadow: none;
  }

  #odin-floating-btn:hover {
    background-color: #404040;
    transform: translateY(-2px);
  }

  #odin-floating-btn img {
    width: 38px;
    height: 38px;
    border-radius: 0;
    object-fit: contain;
  }
  .freki-score-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
  }
  .freki-score-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .freki-score-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    padding: 2px 6px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 11px;
    background: #333;
    color: #fff;
  }
  .freki-score-meta {
    opacity: 0.8;
    white-space: nowrap;
  }
  .freki-score-bar {
    position: relative;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: #262626;
    overflow: hidden;
  }
  .freki-score-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .freki-score-na {
    opacity: 0.4;
  }
  .freki-tier-s { background: linear-gradient(90deg,#ffd700,#ffa000); }
  .freki-tier-a { background: linear-gradient(90deg,#4caf50,#2e7d32); }
  .freki-tier-b { background: linear-gradient(90deg,#2196f3,#1976d2); }
  .freki-tier-c { background: linear-gradient(90deg,#9c27b0,#6a1b9a); }
  .freki-tier-d { background: linear-gradient(90deg,#616161,#424242); }
  .freki-tier-local { background: linear-gradient(90deg,#607d8b,#455a64); }
`;
document.head.appendChild(styleElement);

class Utils {
  static async sleep(ms) {
    return new Promise(e => setTimeout(e, ms));
  }

  static formatTime(seconds, alternateFormat = false) {
    seconds = Math.max(0, Math.floor(seconds));

    let hours = Math.floor(seconds / 3600);
    seconds -= hours * 3600;

    let minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;

    if (alternateFormat) {
      return (hours < 10 ? "0" : "") + hours + "h " + (minutes < 10 ? "0" : "") + minutes + "m " + (seconds < 10 ? "0" : "") + seconds + "s";
    } else {
      return "[" + (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds + "]";
    }
  }

  static debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  static escapeHtml(text) {
    if (text == null) return '';
    return text
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

function getStatusValue(status, mode) {
  if (mode === 0) {
    if (status === 'online') return 2;
    if (status === 'idle') return 1;
    if (status === 'offline') return 0;
  } else if (mode === 1) {
    if (status === 'idle') return 2;
    if (status === 'online') return 1;
    if (status === 'offline') return 0;
  } else if (mode === 2) {
    if (status === 'offline') return 2;
    if (status === 'idle') return 1;
    if (status === 'online') return 0;
  }
  return -1;
}

class AjaxModule {
  constructor() {
    this.ajaxListeners = [];
    this._overrideXhr();
    this._overrideFetch();
  }

  _overrideXhr() {
    let base = this;

    (function(original) {
      window.XMLHttpRequest = function() {
        let result = new original(...arguments);
        let stub;

        result.addEventListener("readystatechange", function() {
          if(this.readyState == 4 && ["", "text", "json"].includes(this.responseType) && this.responseText.trimStart()[0] == "{") {
            try {
              let json = JSON.parse(this.responseText);
              stub = base._runAjaxCallbacks(this.responseURL, false, json);
              if(stub) {
                Object.defineProperty(this, "responseText", {
                  get: function(){return JSON.stringify(stub)}
                });
                if (this.responseType === "json" || this.responseType === "") {
                  Object.defineProperty(this, "response", {
                    get: function(){return stub}
                  });
                }
              }
            } catch(e) {
              console.error("Failed to parse XHR response for URL " + this.responseURL, e);
            }
          }
        });

        return result;
      };
      window.XMLHttpRequest.prototype = original.prototype;
    })(window.XMLHttpRequest);
  }

  _overrideFetch() {
    let base = this;

    (function(original) {
      window.fetch = async function() {
        let url = arguments[0];
        if(!url.includes("page.php?sid=bhc")) {
          let preCall = base._runAjaxCallbacks(url, true);
          if(preCall){return new Response(JSON.stringify(preCall))};
          let result = await original.apply(this, arguments);
          const contentType = result.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            try {
              let json = await result.clone().json();
              let stub = base._runAjaxCallbacks(url, false, json);
              return stub ? new Response(JSON.stringify(stub)) : result;
            } catch(e) {
              console.error("Failed to parse fetch response for URL " + url, e);
              return result;
            }
          } else {
            return result;
          }
        } else {
          return await original.apply(this, arguments);
        }
      };
    })(window.fetch);
  }

  _runAjaxCallbacks(url, abortCall, json) {
    let stub;

    for(let listener of this.ajaxListeners) {
      if(url.toLowerCase().includes(listener.url.toLowerCase())) {
        if(abortCall == listener.abortCall) {
          stub = listener.callback(json);
        }
      }
    }

    return stub;
  }
}

class ApiQueue {
  constructor(concurrency = 3) {
    this.queue = [];
    this.running = 0;
    this.concurrency = concurrency;
  }

  add(task, priority = 4) {
    return new Promise((resolve, reject) => {
      this.queue.push({task, resolve, reject, priority});
      this.queue.sort((a, b) => a.priority - b.priority);
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    this.running++;
    const {task, resolve, reject} = this.queue.shift();
    try {
      resolve(await task());
    } catch (e) {
      reject(e);
    } finally {
      this.running--;
      this.process();
    }
  }
}

class ApiModule {
  constructor() {
    this.state = null;
    this.apiQueue = new ApiQueue(3);
    this.cacheLog = {};
    this.maxCacheSize = 200;
    this.apiKeyIsValid = false;
    this.alertedPermission = false;
    this.throttleLimit = 100;
    this.cleaningInterval = setInterval(async () => {
      const now = Date.now();
      for (const url of Object.keys(this.cacheLog)) {
        if (this.cacheLog[url].time + this.cacheLog[url].cacheDuration < now) {
          delete this.cacheLog[url];
          try {
            await deleteFromDB('cache', url);
          } catch (e) {
            console.error("Failed to delete from cache:", e);
            GM_notification("Storage error - clear browser data or check quota.");
          }
        }
      }
      if (Object.keys(this.cacheLog).length > this.maxCacheSize) {
        const sortedKeys = Object.keys(this.cacheLog).sort((a,b) => this.cacheLog[a].time - this.cacheLog[b].time);
        while (Object.keys(this.cacheLog).length > this.maxCacheSize) {
          const key = sortedKeys.shift();
          delete this.cacheLog[key];
          try {
            await deleteFromDB('cache', key);
          } catch (e) {
            console.error("Failed to delete from cache:", e);
            GM_notification("Storage error - clear browser data or check quota.");
          }
        }
      }
    }, 60000);
  }
  registerState(state) {
    this.state = state;
  }

  async saveCacheEntry(key, value) {
    try {
      await setToDB('cache', key, value);
    } catch (e) {
      console.error("Failed to save cache entry to IndexedDB:", e);
      GM_notification("Storage error - clear browser data or check quota.");
    }
  }

  async clearCache() {
    this.cacheLog = {};
    await clearStore('cache');
  }

  async fetch(url, cacheMs = 0, retries = 0) {
    let priority = 4;
    if (url.includes('selections=chain')) {
      priority = 1;
    } else if (url.match(/\/faction\/\d+\?/)) {
      priority = 2;
    } else if (url.includes('/user/') && (url.includes('profile') || url.includes('basic'))) {
      priority = 3;
    } else if (url.includes('/faction?')) {
      priority = 4;
    }

    return this.apiQueue.add(async () => {
      const now = Date.now();
      this.state.settings.callLog = this.state.settings.callLog.filter(e => e + 60000 >= now);

      if (this.cacheLog.hasOwnProperty(url) && this.cacheLog[url].time + this.cacheLog[url].cacheDuration >= now) {
        return this.cacheLog[url].json;
      }

      if (retries > 5) {
        throw new Error('Max retries exceeded for rate limit');
      }

      let attempts = 0;
      let maxAttempts = 10;
      while (this.state.settings.callLog.length >= (this.throttleLimit || 100) && attempts < maxAttempts) {
        const currentNow = Date.now();
        this.state.settings.callLog = this.state.settings.callLog.filter(e => e + 60000 >= currentNow);
        console.log('API calls in last minute:', this.state.settings.callLog.length);
        let delay = 1000 * Math.pow(2, attempts);
        await Utils.sleep(delay);
        attempts++;
      }
      if (attempts >= maxAttempts) {
        GM_notification("API rate limit reached. Please wait a minute and try again.");
        throw new Error("API rate limit stuck; too many calls.");
      }

      this.state.settings.callLog.push(now);
      this.state.saveToIDB();

      let response;
      let json;
      let retryCount = 0;
      const maxRetries = 3;
      while (retryCount < maxRetries) {
        try {
          response = await fetch(`https://api.torn.com${url}&key=${this.apiKey}`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          json = await response.json();
          if (json.error) {
            if (json.error.code === 6) {
              throw new Error('Rate limit');
            }
          }
          break;
        } catch (e) {
          retryCount++;
          if (retryCount >= maxRetries) {
            console.error("Fetch error after retries:", e);
            throw e;
          }
          await Utils.sleep(1000 * Math.pow(2, retryCount));
        }
      }

      if (json.error) {
        if (json.error.code === 2) {
          this.apiKeyIsValid = false;
          alert("API key invalid.");
        }
        throw new Error("API error: " + json.error.error);
      }
      const cacheDuration = cacheMs > 0 ? cacheMs : 0;
      if(!json.hasOwnProperty("error") && cacheDuration > 0) {
        const entry = {json: json, time: Date.now(), cacheDuration: cacheDuration};
        this.cacheLog[url] = entry;
        await this.saveCacheEntry(url, entry);
        if (Object.keys(this.cacheLog).length > this.maxCacheSize) {
          const oldestKey = Object.keys(this.cacheLog).sort((a,b) => this.cacheLog[a].time - this.cacheLog[b].time)[0];
          delete this.cacheLog[oldestKey];
          await deleteFromDB('cache', oldestKey);
        }
      }

      return json;
    }, priority);
  }

  setApiParams(apiKey, throttleLimit) {
    this.apiKey = apiKey;
    this.throttleLimit = throttleLimit;
  }

  async checkKeyValidity(key) {
    try {
      const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${key}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const json = await response.json();
      if (json.error) {
        console.error('API Key validity check returned error:', json.error);
        return false;
      }
      return json;
    } catch (e) {
      console.error("Key validity check error:", e);
      return false;
    }
  }
}

class BaseModule {
  static _ajaxModule = new AjaxModule();
  static _apiModule = new ApiModule();

  constructor() {
    this.user = {};

    this.addAjaxListener("TopBanner", false, json => {
      this.user = json.user;
      this.onUserLoaded();
    });
  }

  setApiParams(...params) {
    BaseModule._apiModule.setApiParams(...params);
  }

  isApiKeyValid() {
    return BaseModule._apiModule.apiKeyIsValid;
  }

  log(...data) {
    console.log(this.constructor.name + ":", ...data);
  }

  addAjaxListener(url, abortCall, callback) {
    BaseModule._ajaxModule.ajaxListeners.push({url: url, abortCall: abortCall, callback: callback});
  }

  async api() {
    return await BaseModule._apiModule.fetch(...arguments);
  }

  onUserLoaded() {}
}

class OdinState extends BaseModule {
  static errorLog = [];

  constructor() {
    super();
    this.targets = [];
    this.warTargets = [];
    this.rankedWars = {};
    this.enemyFactions = {};
    this.attackLog = {};
    this.factionMembers = {};
    this.factionName = 'Faction Members';
    this.defaultSettings = { enemyOnlineThreshold: 5, alertThreshold: 240, alertEnabled: true, popupEnabled: true, isOpen: true, overlaySide: 'left', overlayWidth: 364, overlayHeight: 40, overlayTop: 20, members_sort_col: 'status_icon', members_sort_asc: false, members_status_mode: '0', enemy_sort_col: 'status_icon', enemy_sort_asc: false, enemy_status_mode: '0', apiKey: '', callLog: [], lastPromptTime: 0, fontFamily: 'Orbitron', fontColor: '#e0e0e0', headerColor: '#ffffff', linkColor: '#81d4fa', buttonLeft: '27px', buttonTop: 'auto', buttonBottom: '18px', buttonRight: 'auto', neonEnabled: false, neonColor: '#00BFFF' };
    this.settings = { ...this.defaultSettings };
  }

  static async logError(err) {
    OdinState.errorLog.push({ timestamp: Date.now(), message: err.message || (err instanceof Error ? err.toString() : JSON.stringify(err)), stack: err.stack || '' });
    if (OdinState.errorLog.length > 100) {
      OdinState.errorLog.shift();
    }
    try {
      await setToDB("errors", "errors", OdinState.errorLog);
    } catch (e) {
      console.error("Failed to save errorLog to IndexedDB:", e);
      GM_notification("Storage error - clear browser data or check quota.");
    }
  }

  async loadFromIDB() {
    try {
      const [targets, warTargets, factionData, rankedWars, enemyFactions, userSettings, errors] = await Promise.all([
        getFromDB('targets', 'targets'),
        getFromDB('warTargets', 'warTargets'),
        getFromDB('factionMembers', 'factionMembers'),
        getFromDB('rankedWars', 'rankedWars'),
        getFromDB('enemyFactions', 'enemyFactions'),
        getFromDB('settings', 'userSettings'),
        getFromDB('errors', 'errors')
      ]);
      this.targets = targets || [];
      this.warTargets = warTargets || [];
      this.factionMembers = (factionData || {}).members || {};
      this.factionName = (factionData || {}).name || 'Faction Members';
      this.rankedWars = rankedWars || {};
      this.enemyFactions = enemyFactions || {};
      this.settings = { ...this.defaultSettings, ...(userSettings || {}) };
      OdinState.errorLog = errors || [];
    } catch (e) {
      console.error("Failed to load from IndexedDB:", e);
      OdinState.logError(e);
      GM_notification('Database error: ' + e.message);
    }
  }

  async saveToIDB() {
    try {
      await Promise.all([
        setToDB('targets', 'targets', this.targets),
        setToDB('warTargets', 'warTargets', this.warTargets),
        setToDB('factionMembers', 'factionMembers', { members: this.factionMembers, name: this.factionName }),
        setToDB('rankedWars', 'rankedWars', this.rankedWars),
        setToDB('enemyFactions', 'enemyFactions', this.enemyFactions),
        setToDB('settings', 'userSettings', this.settings)
      ]);
    } catch (e) {
      console.error("Failed to save to IndexedDB:", e);
      OdinState.logError(e);
      GM_notification('Database error: ' + e.message);
    }
  }

  async loadTargets() {
    try {
      this.targets = await getFromDB('targets', 'targets') || [];
    } catch (e) {
      console.error("Error loading targets:", e);
      OdinState.logError(e);
    }
  }

  async loadWarTargets() {
    try {
      this.warTargets = await getFromDB('warTargets', 'warTargets') || [];
    } catch (e) {
      console.error("Error loading war targets:", e);
      OdinState.logError(e);
    }
  }

  async saveTargets() {
    try {
      await setToDB('targets', 'targets', this.targets);
    } catch (e) {
      console.error("Error saving targets:", e);
      OdinState.logError(e);
    }
  }

  async saveWarTargets() {
    try {
      await setToDB('warTargets', 'warTargets', this.warTargets);
    } catch (e) {
      console.error("Error saving war targets:", e);
      OdinState.logError(e);
    }
  }

  saveEnemyOnlineThreshold(threshold) {
    this.settings.enemyOnlineThreshold = threshold;
    this.saveToIDB();
  }
}

class OdinLogic extends BaseModule {
  constructor(state, ui) {
    super();
    this.state = state;
    this.ui = ui;
    this.intervals = {};
    this.isPageVisible = !document.hidden;
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
    });
    this.intervals.background = setInterval(() => this.backgroundRefresh(), 300000);
    this.intervals.userRefresh = setInterval(() => this.refreshUser(), 600000);
    this.serverTimeInterval = null;
    this.membersInterval = null;
    this.enemyInterval = null;
    this.targetsInterval = null;
    this.warTargetsInterval = null;
    this.slowChainInterval = null;
    this.fastChainInterval = null;
    this.checkForUpdates();
    this.debouncedAddButtons = Utils.debounce(this.addProfileButtons.bind(this), 300);
    this.countdownIntervals = [];
    this.lastEnemyOnlineCheck = 0;
    this.lastEnemyOnlineNotification = 0;
    this.enemyOnlineThreshold = this.state.settings.enemyOnlineThreshold;
    this.isAddEnemyFocused = false;
    this.isAddWarFocused = false;
    this.chainCurrent = 0;
    this.chainMax = 0;
    this.chainTimeout = 0;
    this.alertThreshold = this.state.settings.alertThreshold;
    this.alertEnabled = this.state.settings.alertEnabled;
    this.popupEnabled = this.state.settings.popupEnabled;
    this.flashIntervalId = null;
    this.flashDiv = null;
    this.lastApiChainCheck = 0;
    this.clockInterval = null;
    this.alertTriggered = false;
    this.chainBonuses = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    this.triggeredBonuses = new Set();
    this.lastBonusNotifications = {};
    window.addEventListener('beforeunload', this.cleanup.bind(this));
    this.startChainAlert();
  }

  async refreshUser() {
    try {
      const userJson = await this.api('/user?selections=basic');
      if (!userJson.error) {
        this.user = userJson;
      }
    } catch (e) {
      console.error("Error refreshing user:", e);
      OdinState.logError(e);
    }
  }

  cleanup() {
    Object.values(this.intervals).forEach(interval => clearInterval(interval));
    if (this.serverTimeInterval) clearInterval(this.serverTimeInterval);
    if (this.membersInterval) clearInterval(this.membersInterval);
    if (this.enemyInterval) clearInterval(this.enemyInterval);
    if (this.targetsInterval) clearInterval(this.targetsInterval);
    if (this.warTargetsInterval) clearInterval(this.warTargetsInterval);
    if (this.slowChainInterval) clearInterval(this.slowChainInterval);
    if (this.fastChainInterval) clearInterval(this.fastChainInterval);
    this.stopChainAlert();
    this.clearCountdownIntervals();
  }

  async init() {
    try {
      await this.state.loadFromIDB();
    } catch (e) {
      console.error("Error loading from IDB:", e);
      OdinState.logError(e);
    }
    this.ui.renderOverlay();
  }

  async startServerTimeFetch() {
    if (this.serverTimeInterval) clearInterval(this.serverTimeInterval);
    await this.fetchServerTime();
    this.serverTimeInterval = setInterval(async () => await this.fetchServerTime(), 10000);
  }

  stopServerTimeFetch() {
    if (this.serverTimeInterval) {
      clearInterval(this.serverTimeInterval);
      this.serverTimeInterval = null;
    }
  }

  async startMembersPoll() {
    if (this.membersInterval) clearInterval(this.membersInterval);
    this.membersInterval = setInterval(async () => {
      if (!this.isPageVisible) return;
      try {
        await this.fetchFactionMembers();
      } catch (e) {
        console.error('Poll error:', e);
        OdinState.logError(e);
      }
      if (document.querySelector('.odin-menu-btn.active')?.dataset.section === 'members') {
        this.ui._refreshMemberListView();
      }
    }, 30000);
  }

  async startEnemyPoll() {
    if (this.enemyInterval) clearInterval(this.enemyInterval);
    this.enemyInterval = setInterval(async () => {
      if (!this.isPageVisible) return;
      if (this.isAddEnemyFocused) return;
      try {
        await this.fetchRankedWars();
        await this.fetchFactionMembers();
        const enemyPromises = Object.keys(this.state.enemyFactions).map(fid => this.fetchEnemyFactionMembers(fid));
        await Promise.all(enemyPromises);
      } catch (e) {
        console.error('Poll error:', e);
        OdinState.logError(e);
      }
      if (document.querySelector('.odin-menu-btn.active')?.dataset.section === 'enemy') {
        this.ui._refreshEnemyListView();
      }
    }, 30000);
  }

  startTargetsPoll() {
  }

  startWarTargetsPoll() {
  }

  async backgroundRefresh() {
    if (!this.isPageVisible) return;
    const overlay = document.querySelector('#odin-overlay');
    if (overlay && overlay.style.left !== '0px' && overlay.style.right !== '0px') return;
    try {
      if (!this.user || !this.user.factionID) {
        const userJson = await this.api('/user?selections=basic');
        if (!userJson.error) {
          this.user = userJson;
        }
      }
      if (this.user.factionID) {
        await this.fetchFactionMembers();
        await this.fetchRankedWars();
        const now = Date.now();
        const enemyPromises = [];
        for (const fid in this.state.enemyFactions) {
          if (now - this.state.enemyFactions[fid].lastUpdate > 300000) {
            enemyPromises.push(this.fetchEnemyFactionMembers(fid));
          }
        }
        await Promise.all(enemyPromises);
      }
      await Promise.all([
        this.refreshTargets(),
        this.refreshWarTargets()
      ]);
      await this.state.saveToIDB();
      this.checkEnemyOnlineAlert();
    } catch (e) {
      console.error('Background refresh error:', e);
      OdinState.logError(e);
    }
  }

  async fetchServerTime() {
    if (!this.isPageVisible) return;
    let retries = 0;
    const maxRetries = 3;
    while (retries < maxRetries) {
      try {
        const local_t1 = Date.now();
        const response = await fetch(`https://api.torn.com/user/?selections=basic&key=${BaseModule._apiModule.apiKey}`);
        const local_t2 = Date.now();
        const json = await response.json();
        if (json.error) {
          console.error("Torn time fetch failed:", json.error);
        } else {
          const rtt = local_t2 - local_t1;
          const estimated_server_at_t2 = json.server_time + (rtt / 1000 / 2);
          const newOffset = estimated_server_at_t2 - (local_t2 / 1000);
          this.offset = newOffset;
          return;
        }
      } catch (e) {
        console.error("Torn time fetch error:", e);
      }
      retries++;
      await Utils.sleep(1000 * Math.pow(2, retries));
    }
    try {
      const local_t1 = Date.now();
      const response = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: "https://worldtimeapi.org/api/timezone/Etc/UTC",
          onload: (res) => resolve(res),
          onerror: (err) => reject(err)
        });
      });
      const local_t2 = Date.now();
      const json = JSON.parse(response.responseText);
      const rtt = local_t2 - local_t1;
      const estimated_server_at_t2 = json.unixtime + (rtt / 1000 / 2);
      const newOffset = estimated_server_at_t2 - (local_t2 / 1000);
      this.offset = newOffset;
    } catch (ee) {
      console.error("Fallback time fetch failed:", ee);
      this.offset = 0;
    }
  }

  getServerNow() {
    return Date.now() / 1000 + (this.offset || 0);
  }

  clearCountdownIntervals() {
    this.countdownIntervals.forEach(interval => clearInterval(interval));
    this.countdownIntervals = [];
  }

  startCountdownTimers() {
    this.clearCountdownIntervals();
    const countdowns = document.querySelectorAll('.countdown');
    if (countdowns.length === 0) return;
    const interval = setInterval(() => {
      const now = this.getServerNow();
      countdowns.forEach(span => {
        if (!span.closest('body')) return;
        const until = parseFloat(span.dataset.until);
        const timer = until - now;
        if (timer > 0) {
          span.textContent = Utils.formatTime(timer, true);
        } else {
          span.textContent = '0s';
          const td = span.closest('td');
          if (td) {
            td.innerHTML = 'Okay';
          }
        }
      });
    }, 1000);
    this.countdownIntervals.push(interval);
  }

  async fetchAttackLog(force = false) {
    try {
      if (force) {
        const url = '/user?selections=attacks';
        delete BaseModule._apiModule.cacheLog[url];
        await deleteFromDB('cache', url);
      }
      const json = await this.api('/user?selections=attacks', force ? 0 : 60000);
      if (!json.error) {
        Object.values(json.attacks).forEach(attack => {
          if (attack.defender_id) {
            this.state.attackLog[attack.defender_id] = attack;
          }
        });
      }
    } catch (e) {
      console.error("Error fetching attack log:", e);
      OdinState.logError(e);
    }
  }

  checkForUpdates() {
    const updateURL = 'https://raw.githubusercontent.com/BjornOdinsson89/Odin/main/Odin.user.js';
    const metaURL = updateURL.replace('.user.js', '.meta.js');
    GM_xmlhttpRequest({
      method: 'GET',
      url: metaURL,
      onload: (response) => {
        const remoteVersionMatch = response.responseText.match(/@version\s+([\d.]+)/);
        const remoteVersion = remoteVersionMatch ? remoteVersionMatch[1] : null;
        const currentVersion = GM_info.script.version;
        if (remoteVersion && remoteVersion > currentVersion) {
          GM_notification({
            title: 'Odin Update Available',
            text: `Version ${remoteVersion} is available. Update now?`,
            onclick: () => window.open(updateURL, '_blank')
          });
          BaseModule._apiModule.clearCache();
        }
      },
      onerror: (err) => {
        console.error('Update check failed:', err);
      }
    });
  }

  addAjaxListeners() {
    this.addAjaxListener("attacks", false, json => {
      this.updateAttackLog(json);
      return json;
    });
  }

  updateAttackLog(json) {
    Object.values(json.attacks).forEach(attack => {
      if (attack.defender_id) {
        this.state.attackLog[attack.defender_id] = attack;
      }
    });
  }

  async refreshTargets(force = false) {
    await this.fetchAttackLog(force);
    const now = Date.now();
    const chunkSize = 5;
    const toRefresh = force ? this.state.targets : this.state.targets.filter(t => now - t.lastUpdate > 600000);

    for (let i = 0; i < toRefresh.length; i += chunkSize) {
      const chunk = toRefresh.slice(i, i + chunkSize);
      const promises = chunk.map(target => this.updateTarget(target, force));
      await Promise.all(promises);
      if (i + chunkSize < toRefresh.length) {
        await Utils.sleep(2000);
      }
    }
    this.state.saveTargets();
  }

  async refreshWarTargets(force = false) {
    await this.fetchAttackLog(force);
    const now = Date.now();
    const chunkSize = 5;
    const toRefresh = force ? this.state.warTargets : this.state.warTargets.filter(t => now - t.lastUpdate > 600000);

    for (let i = 0; i < toRefresh.length; i += chunkSize) {
      const chunk = toRefresh.slice(i, i + chunkSize);
      const promises = chunk.map(target => this.updateTarget(target, force));
      await Promise.all(promises);
      if (i + chunkSize < toRefresh.length) {
        await Utils.sleep(2000);
      }
    }
    this.state.saveWarTargets();
  }

  async refreshSpecificTargets(targetList, allList) {
    await this.fetchAttackLog();
    const chunkSize = 5;
    for (let i = 0; i < targetList.length; i += chunkSize) {
      const chunk = targetList.slice(i, i + chunkSize);
      const promises = chunk.map(target => this.updateTarget(target));
      await Promise.all(promises);
      if (i + chunkSize < targetList.length) {
        await Utils.sleep(2000);
      }
    }
    if (allList === this.state.targets) {
      this.state.saveTargets();
    } else if (allList === this.state.warTargets) {
      this.state.saveWarTargets();
    }
  }

  async updateTarget(target, force = false) {
    if (!this.isPageVisible) return;
    try {
      if (force) {
        const url = `/user/${target.id}?selections=profile`;
        delete BaseModule._apiModule.cacheLog[url];
        await deleteFromDB('cache', url);
      }
      let profile = await this.api(`/user/${target.id}?selections=profile`, force ? 0 : 30000);
      if (profile.error && profile.error.code === 14) {
        if (!BaseModule._apiModule.alertedPermission) {
          alert('API key lacks access to user profile. Please ensure full access or add "user" permission.');
          BaseModule._apiModule.alertedPermission = true;
        }
        profile = await this.api(`/user/${target.id}?selections=basic`, force ? 0 : 30000);
        if (profile.error) {
          const index = this.state.targets.findIndex(t => t.id === target.id);
          if (index !== -1) this.state.targets.splice(index, 1);
          const warIndex = this.state.warTargets.findIndex(t => t.id === target.id);
          if (warIndex !== -1) this.state.warTargets.splice(warIndex, 1);
          throw new Error('Basic profile fetch failed: ' + profile.error.error);
        }
        profile.life = { current: 'N/A', maximum: 'N/A' };
        profile.faction = { faction_name: 'N/A', faction_id: 0 };
      } else if (profile.error) {
        if (profile.error.code === 7) {
          const index = this.state.targets.findIndex(t => t.id === target.id);
          if (index !== -1) this.state.targets.splice(index, 1);
          const warIndex = this.state.warTargets.findIndex(t => t.id === target.id);
          if (warIndex !== -1) this.state.warTargets.splice(warIndex, 1);
        }
        target.name = 'Error fetching name';
        return;
      }
      if (typeof profile !== 'object' || !profile) {
        throw new Error('Invalid profile response');
      }
      if (!profile.name) {
        console.log('Missing name in response for ID ' + target.id, profile);
        target.name = 'Unidentified (ID: ' + target.id + ')';
      } else {
        target.name = profile.name;
      }
      let respectGain = null;
      if (this.state.attackLog[target.id]) {
        respectGain = this.state.attackLog[target.id].respect_gain;
      }
      target.lvl = profile.level;
      target.faction = profile.faction.faction_name;
      target.faction_id = profile.faction.faction_id;
      target.status = profile.status.state;
      target.status_description = profile.status.description;
      target.status_until = profile.status.until || 0;
      target.life = profile.life.current + '/' + profile.life.maximum;
      target.lastAction = profile.last_action.relative;
      target.respectGain = respectGain;
      target.lastUpdate = Date.now();
    } catch (e) {
      console.error(`Exception fetching profile for ${target.id}:`, e);
      OdinState.logError(e);
      target.name = 'Error fetching name';
    }
  }

  async fetchFactionMembers() {
    if (!this.isPageVisible) return;
    try {
      const json = await this.api('/faction?selections=basic', 60000);
      if (!json.error) {
        this.state.factionMembers = json.members;
        this.state.factionName = json.name || 'Faction Members';
        await setToDB('factionMembers', 'factionMembers', {members: this.state.factionMembers, name: this.state.factionName});
      } else {
        console.error("Error fetching faction members: " + json.error.error);
        OdinState.logError(new Error("Error fetching faction members: " + json.error.error));
      }
    } catch (e) {
      console.error("Error fetching faction members:", e);
      OdinState.logError(e);
    }
  }

  async fetchRankedWars() {
    if (!this.isPageVisible) return;
    try {
      const json = await this.api('/faction?selections=rankedwars', 60000);
      if (!json.error) {
        this.state.rankedWars = json.rankedwars;
        await setToDB('rankedWars', 'rankedWars', this.state.rankedWars);
      } else {
        console.error("Error fetching ranked wars: " + json.error.error);
        OdinState.logError(new Error("Error fetching ranked wars: " + json.error.error));
      }
    } catch (e) {
      console.error("Error fetching ranked wars:", e);
      OdinState.logError(e);
    }
  }

  async fetchEnemyFactionMembers(factionId) {
    if (!this.isPageVisible) return;
    try {
      const json = await this.api(`/faction/${factionId}?selections=basic`, 300000);
      if (!json.error) {
        this.state.enemyFactions[factionId] = {members: json.members, name: json.name, lastUpdate: Date.now()};
        await this.state.saveToIDB();
      } else {
        console.error("Error fetching enemy faction members: " + json.error.error);
        OdinState.logError(new Error("Error fetching enemy faction members: " + json.error.error));
      }
    } catch (e) {
      console.error("Error fetching enemy faction members:", e);
      OdinState.logError(e);
    }
  }

  async searchFactionByName(name) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://www.torn.com/factions.php?step=groupList&searchname=${encodeURIComponent(name)}`,
        onload: (response) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(response.responseText, 'text/html');
          const links = doc.querySelectorAll('a[href*="factions.php?step=profile&ID="]');
          if (links.length > 0) {
            const idMatch = links[0].href.match(/ID=(\d+)/);
            if (idMatch) {
              resolve(idMatch[1]);
            } else {
              reject('No faction ID found');
            }
          } else {
            reject('No faction found');
          }
        },
        onerror: (err) => {
          reject(err);
        }
      });
    });
  }

  async fetchEnemyFromWar() {
    try {
      await this.fetchRankedWars();
      const enemyPromises = [];
      for (const war of Object.values(this.state.rankedWars)) {
        const enemyId = Object.keys(war.factions).find(id => id != this.user.factionID);
        if (enemyId && !this.state.enemyFactions[enemyId]) {
          enemyPromises.push(this.fetchEnemyFactionMembers(enemyId));
        }
      }
      await Promise.all(enemyPromises);
      await this.state.saveToIDB();
    } catch (e) {
      console.error("Error fetching enemy from war:", e);
      OdinState.logError(e);
    }
  }

  async checkEnemyOnlineAlert() {
    if (Object.keys(this.state.enemyFactions).length === 0) return;
    const now = Date.now();
    if (now - this.lastEnemyOnlineCheck < 60000) return;
    this.lastEnemyOnlineCheck = now;
    let onlineCount = 0;
    for (const faction of Object.values(this.state.enemyFactions)) {
      onlineCount += Object.values(faction.members).filter(m => m.last_action.status === 'Online' || m.last_action.status === 'Idle').length;
    }
    if (onlineCount >= this.enemyOnlineThreshold && now - this.lastEnemyOnlineNotification > 600000) {
      GM_notification(`Alert: ${onlineCount} enemy members online!`);
      this.lastEnemyOnlineNotification = now;
    }
  }

  async addProfileButtons() {
    const actionDrawer = document.querySelector('#top-page-links-list');
    if (actionDrawer && !document.querySelector('#odin-toggle-container')) {
      const urlParams = new URLSearchParams(window.location.search);
      const profileId = parseInt(urlParams.get('XID'));
      if (!isNaN(profileId)) {
        try {
          let profile = await this.api(`/user/${profileId}?selections=profile`);
          if (profile.error && profile.error.code === 14) {
            if (!BaseModule._apiModule.alertedPermission) {
              alert('API key lacks access to user profile. Please ensure full access or add "user" permission.');
              BaseModule._apiModule.alertedPermission = true;
            }
            profile = await this.api(`/user/${profileId}?selections=basic`);
            if (profile.error) {
              console.error(`Error fetching basic profile for ${profileId}: ${profile.error.error}`);
              OdinState.logError(new Error(`Error fetching basic profile for ${profileId}: ${profile.error.error}`));
              return;
            }
            profile.life = { current: 'N/A', maximum: 'N/A' };
            profile.faction = { faction_name: 'N/A', faction_id: 0 };
          } else if (profile.error) {
            console.error(`Error fetching profile for ${profileId}: ${profile.error.error}`);
            OdinState.logError(new Error(`Error fetching profile for ${profileId}: ${profile.error.error}`));
            return;
          }
          this.visitedProfileID = profileId;
          this.visitedProfileName = profile.name;

          const container = GM_addElement(actionDrawer, 'div', {
            id: 'odin-toggle-container',
            style: 'display: flex; gap: 10px; margin-left: calc(10px + 3vw); align-items: center;'
          });

          const personalStatsLi = Array.from(actionDrawer.querySelectorAll('li')).find(li =>
            li.textContent.includes('Personal Stats') ||
            (li.querySelector('a') && li.querySelector('a').textContent.trim() === 'Personal Stats')
          );
          if (personalStatsLi && personalStatsLi.nextSibling) {
            actionDrawer.insertBefore(container, personalStatsLi.nextSibling);
          } else {
            actionDrawer.appendChild(container);
          }

          const targetBtn = GM_addElement(container, 'button', {
            class: 'odin-profile-btn',
            title: 'Toggle Target'
          });
          const isTarget = this.state.targets.some(t => t.id === profileId);
          if (isTarget) targetBtn.classList.add('checked');
          targetBtn.innerHTML = '<img src="https://i.ibb.co/bgM3FHBV/Screenshot-20251108-233856-Google-2.png" alt="Target">';

          targetBtn.addEventListener('click', async () => {
            const index = this.state.targets.findIndex(t => t.id === profileId);
            if (targetBtn.classList.contains('checked')) {
              if (index !== -1) {
                this.state.targets.splice(index, 1);
              }
              targetBtn.classList.remove('checked');
            } else {
              if (index === -1) {
                if (this.state.targets.length >= maxTargets) {
                  alert(`Maximum targets reached (${maxTargets}). Remove some first.`);
                  return;
                }
                this.state.targets.push({
                  id: profileId,
                  name: profile.name,
                  lvl: profile.level,
                  faction: profile.faction.faction_name,
                  faction_id: profile.faction.faction_id,
                  status: profile.status.state,
                  status_description: profile.status.description,
                  status_until: profile.status.until || 0,
                  life: profile.life.current + '/' + profile.life.maximum,
                  lastAction: profile.last_action.relative,
                  respectGain: null,
                  lastUpdate: Date.now()
                });
              }
              targetBtn.classList.add('checked');
            }
            await this.refreshTargets();
            this.state.saveTargets();
          });

          const warBtn = GM_addElement(container, 'button', {
            class: 'odin-profile-btn',
            title: 'Toggle War Target'
          });
          const isWarTarget = this.state.warTargets.some(t => t.id === profileId);
          if (isWarTarget) warBtn.classList.add('checked');
          warBtn.innerHTML = '<img src="https://i.ibb.co/SwSSQpR7/Screenshot-20251108-234119-Google-2.png" alt="War Target">';

          warBtn.addEventListener('click', async () => {
            const index = this.state.warTargets.findIndex(t => t.id === profileId);
            if (warBtn.classList.contains('checked')) {
              if (index !== -1) {
                this.state.warTargets.splice(index, 1);
              }
              warBtn.classList.remove('checked');
            } else {
              if (index === -1) {
                if (this.state.warTargets.length >= maxTargets) {
                  alert(`Maximum war targets reached (${maxTargets}). Remove some first.`);
                  return;
                }
                this.state.warTargets.push({
                  id: profileId,
                  name: profile.name,
                  lvl: profile.level,
                  faction: profile.faction.faction_name,
                  faction_id: profile.faction.faction_id,
                  status: profile.status.state,
                  status_description: profile.status.description,
                  status_until: profile.status.until || 0,
                  life: profile.life.current + '/' + profile.life.maximum,
                  lastAction: profile.last_action.relative,
                  respectGain: null,
                  lastUpdate: Date.now()
                });
              }
              warBtn.classList.add('checked');
            }
            await this.refreshWarTargets();
            this.state.saveWarTargets();
          });
        } catch (e) {
          console.error("Error adding profile toggles:", e);
          OdinState.logError(e);
          alert('Error loading profile toggles: ' + e.message);
        }
      }
    }
  }

  startChainAlert() {
    this.nearBonusTriggered20 = false;
    this.nearBonusTriggered10 = false;
    this.triggeredBonuses.clear();
    if (this.slowChainInterval) clearInterval(this.slowChainInterval);
    if (this.fastChainInterval) clearInterval(this.fastChainInterval);
    this.slowChainInterval = setInterval(() => this.watchChain(false), 60000);
  }

  stopChainAlert() {
    if (this.slowChainInterval) clearInterval(this.slowChainInterval);
    if (this.fastChainInterval) clearInterval(this.fastChainInterval);
    this.slowChainInterval = null;
    this.fastChainInterval = null;
    this.stopFlashing();
  }

  async watchChain(isFast = false) {
    if (!this.isPageVisible) return;
    try {
      const json = await this.api('/faction?selections=chain', 0);
      if (!json.error && json.chain) {
        const prevCurrent = this.chainCurrent;
        this.chainCurrent = json.chain.current || 0;
        this.chainMax = json.chain.max || 0;
        this.chainTimeout = json.chain.timeout || 0;
        this.checkChainBonuses(prevCurrent);
      } else {
        console.error('Chain API error:', json?.error);
        OdinState.logError(new Error('Chain API error: ' + JSON.stringify(json?.error)));
        this.chainCurrent = 0;
        this.chainMax = 0;
        this.chainTimeout = 0;
        this.nearBonusTriggered20 = false;
        this.nearBonusTriggered10 = false;
        this.triggeredBonuses.clear();
      }
    } catch (e) {
      console.error('Chain fetch error:', e);
      OdinState.logError(e);
    }

    const hasChain = this.chainTimeout > 0;

    if (hasChain && !this.fastChainInterval) {
      this.fastChainInterval = setInterval(() => this.watchChain(true), 5000);
    } else if (!hasChain && this.fastChainInterval) {
      clearInterval(this.fastChainInterval);
      this.fastChainInterval = null;
      this.nearBonusTriggered20 = false;
      this.nearBonusTriggered10 = false;
      this.triggeredBonuses.clear();
    }

    if (!this.alertEnabled) return;
    if (this.chainTimeout === 0) {
      this.stopFlashing();
      this.alertTriggered = false;
      return;
    }
    if (this.alertEnabled && this.chainTimeout > 0 && this.chainTimeout < this.alertThreshold) {
      this.startFlashing();
      if (this.popupEnabled && !this.alertTriggered) {
        GM_notification(`Chain timer is below ${this.alertThreshold / 60} minutes! (Hits: ${this.chainCurrent}/${this.chainMax})`);
        this.alertTriggered = true;
      }
    } else {
      this.stopFlashing();
      this.alertTriggered = false;
    }
    if (this.chainTimeout === 0) {
      this.stopFlashing();
      this.alertTriggered = false;
    }
  }

  checkChainBonuses(prevCurrent) {
    const nextBonus = this.chainBonuses.find(b => b > this.chainCurrent);
    if (!nextBonus) return;

    const hitsToNext = nextBonus - this.chainCurrent;

    const key20 = nextBonus + '_20';
    const key10 = nextBonus + '_10';
    const now = Date.now();

    if (hitsToNext <= 20 && hitsToNext > 10 && !this.triggeredBonuses.has(key20)) {
      if (!this.lastBonusNotifications[key20] || now - this.lastBonusNotifications[key20] > 300000) {
        GM_notification(`We are within 20 hits from ${nextBonus} bonus. Please slow down and check faction chat`);
        this.lastBonusNotifications[key20] = now;
      }
      this.triggeredBonuses.add(key20);
    } else if (hitsToNext <= 10 && hitsToNext >= 1 && !this.triggeredBonuses.has(key10) && nextBonus > 500) {
      if (!this.lastBonusNotifications[key10] || now - this.lastBonusNotifications[key10] > 300000) {
        GM_notification(`STOP ALL HITS! WATCH FACTION CHAT`);
        this.lastBonusNotifications[key10] = now;
      }
      this.triggeredBonuses.add(key10);
    }

    if (hitsToNext > 20) {
      this.triggeredBonuses.delete(key20);
      this.triggeredBonuses.delete(key10);
    } else if (hitsToNext > 10) {
      this.triggeredBonuses.delete(key10);
    }

    if (this.chainCurrent < prevCurrent) {
      for (const key of [...this.triggeredBonuses]) {
        const bonus = parseInt(key.split('_')[0]);
        if (bonus > this.chainCurrent) this.triggeredBonuses.delete(key);
      }
    }
  }

  startFlashing() {
    if (this.flashIntervalId) return;
    if (this.flashDiv) this.flashDiv.remove();
    this.flashDiv = document.createElement('div');
    this.flashDiv.style.position = 'fixed';
    this.flashDiv.style.top = '0';
    this.flashDiv.style.left = '0';
    this.flashDiv.style.width = '100vw';
    this.flashDiv.style.height = '100vh';
    this.flashDiv.style.backgroundColor = 'red';
    this.flashDiv.style.opacity = '0';
    this.flashDiv.style.zIndex = '100002';
    this.flashDiv.style.pointerEvents = 'none';
    this.flashDiv.style.transition = 'opacity 0.5s ease-in-out';
    document.body.appendChild(this.flashDiv);
    let visible = false;
    this.flashIntervalId = setInterval(() => {
      visible = !visible;
      this.flashDiv.style.opacity = visible ? '0.5' : '0';
    }, 1000);
  }

  stopFlashing() {
    if (this.flashIntervalId) {
      clearInterval(this.flashIntervalId);
      this.flashIntervalId = null;
    }
    if (this.flashDiv) {
      this.flashDiv.remove();
      this.flashDiv = null;
    }
  }

  onUserLoaded() {
    if (document.location.href.includes("profiles.php")) {
      this.addProfileButtons();
    }
  }
}

class OdinUserInterface extends BaseModule {
  constructor(state, logic = null) {
    super();
    this.logic = logic;
    this.state = state;
    this.isOpen = state.settings.isOpen;
    this.side = state.settings.overlaySide;
    this.width = state.settings.overlayWidth;
    this.height = state.settings.overlayHeight + "vh";
    this.top = state.settings.overlayTop + "vh";
    this.buttonLeft = state.settings.buttonLeft;
    this.buttonTop = state.settings.buttonTop;
    this.buttonBottom = state.settings.buttonBottom;
    this.buttonRight = state.settings.buttonRight;
  }

  applyCustomStyles() {
    const overlay = document.querySelector('#odin-overlay');
    if (overlay) {
      overlay.style.setProperty('--font-family', `"${this.state.settings.fontFamily}"`);
      overlay.style.setProperty('--font-color', this.state.settings.fontColor);
      overlay.style.setProperty('--header-color', this.state.settings.headerColor);
      overlay.style.setProperty('--link-color', this.state.settings.linkColor);
      overlay.style.setProperty('--neon-color', this.state.settings.neonColor);
      const neonGlow = this.state.settings.neonEnabled ? `0 0 5px ${this.state.settings.neonColor}, 0 0 10px ${this.state.settings.neonColor}, 0 0 20px ${this.state.settings.neonColor}` : 'none';
      overlay.style.setProperty('--neon-glow', neonGlow);
    }
  }

  observeProfileChanges() {
    const observer = new MutationObserver(() => {
      if (location.href.includes("profiles.php") && document.querySelector('#top-page-links-list') && !document.querySelector('#odin-toggle-container')) {
        this.logic.debouncedAddButtons();
      }
    });
    const targetNode = document.querySelector('.content-wrapper') || document.body;
    observer.observe(targetNode, { childList: true, subtree: true });
  }

  saveWidth() {
    this.state.settings.overlayWidth = this.width;
    this.state.saveToIDB();
  }

  saveHeight() {
    this.state.settings.overlayHeight = parseInt(this.height);
    this.state.saveToIDB();
  }

  saveTop() {
    this.state.settings.overlayTop = parseInt(this.top);
    this.state.saveToIDB();
  }

  setWidth(newWidth) {
    this.width = Math.max(150, Math.min(window.innerWidth - 20, newWidth));
    this.saveWidth();
    const overlay = document.getElementById('odin-overlay');
    const tab = document.getElementById('odin-tab');
    overlay.style.width = `${this.width}px`;
    const closedPos = `-${this.width + 2}px`;
    const isOpen = (this.side === 'left' ? overlay.style.left : overlay.style.right) === '0px';
    if (!isOpen) {
      if (this.side === 'left') {
        overlay.style.left = closedPos;
      } else {
        overlay.style.right = closedPos;
      }
    }
  }

  setHeight(newHeight) {
    this.height = Math.max(30, Math.min(100 - parseInt(this.top), newHeight)) + "vh";
    this.saveHeight();
    const overlay = document.getElementById('odin-overlay');
    overlay.style.height = this.height;
  }

  setTop(newTop) {
    this.top = Math.max(0, Math.min(100 - parseInt(this.height), newTop)) + "vh";
    this.saveTop();
    const overlay = document.getElementById('odin-overlay');
    overlay.style.top = this.top;
  }

  clampButtonPosition(button) {
    const rect = button.getBoundingClientRect();
    const buttonWidth = 189;
    let left = parseFloat(button.style.left);
    if (isNaN(left)) left = rect.left;

    left = Math.max(0, Math.min(left, window.innerWidth - buttonWidth));

    button.style.left = `${left}px`;
    button.style.top = 'auto';
    button.style.bottom = this.state.settings.buttonBottom || '18px';
    button.style.right = 'auto';

    this.state.settings.buttonLeft = `${left}px`;
    this.state.settings.buttonTop = 'auto';
    this.state.settings.buttonRight = 'auto';
    this.state.saveToIDB();
  }

  setButtonToNearestEdge() {
    const button = this.button;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const distLeft = rect.left;
    const distRight = winW - rect.right;
    const distTop = rect.top;
    const distBottom = winH - rect.bottom;
    let left = 'auto', right = 'auto', top = 'auto', bottom = 'auto';
    if (distLeft < distRight) {
      left = '40px';
    } else {
      right = '40px';
    }
    if (distTop < distBottom) {
      top = '20px';
    } else {
      bottom = '0px';
    }
    button.style.left = left;
    button.style.right = right;
    button.style.top = top;
    button.style.bottom = bottom;
    this.state.settings.buttonLeft = left;
    this.state.settings.buttonTop = top;
    this.state.settings.buttonBottom = bottom;
    this.state.settings.buttonRight = right;
    this.state.saveToIDB();
  }

  setStickyTops() {
    const sectionContent = document.querySelector('#odin-section-content');
    if (!sectionContent) return;
    let currentTop = 0;
    const h3 = sectionContent.querySelector('h3');
    if (h3) {
      h3.style.position = 'sticky';
      h3.style.top = `${currentTop}px`;
      h3.style.zIndex = '11';
      currentTop += h3.offsetHeight || 30;
    }
    const search = sectionContent.querySelector('#member-search, #enemy-search');
    if (search) {
      search.style.position = 'sticky';
      search.style.top = `${currentTop}px`;
      search.style.zIndex = '12';
      currentTop += search.offsetHeight || 40;
    }
    const h4s = Array.from(sectionContent.children).filter(el => el.tagName === 'H4');
    h4s.forEach(h4 => {
      h4.style.position = 'sticky';
      h4.style.top = `${currentTop}px`;
      h4.style.zIndex = '11';
      currentTop += (h4.offsetHeight || 30) + 8;
    });
  }

  async renderOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'odin-overlay';
    overlay.style.position = 'fixed !important';
    overlay.style.top = this.top;
    overlay.style.height = this.height;
    overlay.style.width = `${this.width}px`;
    overlay.style.background = '#1e1e1e';
    overlay.style.transition = (this.side === 'left' ? 'left' : 'right') + ' 0.3s ease';
    overlay.style.zIndex = '100000';
    overlay.style.overflowY = 'hidden';
    overlay.style.boxSizing = 'border-box';
    if (this.side === 'left') {
      overlay.style.borderRight = '2px solid #333';
      overlay.style.borderRadius = '0 10px 10px 0';
      overlay.style.left = this.isOpen ? '0px' : `-${this.width + 2}px`;
      overlay.style.right = '';
    } else {
      overlay.style.borderLeft = '2px solid #333';
      overlay.style.borderRadius = '10px 0 0 10px';
      overlay.style.right = this.isOpen ? '0px' : `-${this.width + 2}px`;
      overlay.style.left = '';
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.id = 'odin-content';
    contentWrapper.style.height = '100%';
    contentWrapper.style.overflowY = 'hidden';

    const resizeHandleWidth = document.createElement('div');
    resizeHandleWidth.id = 'odin-resize-handle-width';
    resizeHandleWidth.classList.add(this.side);
    if (this.side === 'left') {
      resizeHandleWidth.style.right = '0';
    } else {
      resizeHandleWidth.style.left = '0';
    }

    const resizeHandleHeight = document.createElement('div');
    resizeHandleHeight.id = 'odin-resize-handle-height';

    const resizeHandleTop = document.createElement('div');
    resizeHandleTop.id = 'odin-resize-handle-top';

    overlay.appendChild(resizeHandleTop);
    overlay.appendChild(resizeHandleWidth);
    overlay.appendChild(resizeHandleHeight);

    overlay.appendChild(contentWrapper);
    document.body.appendChild(overlay);
    this.applyCustomStyles();

    let isResizingWidth = false;
    let isResizingHeight = false;
    let isResizingTop = false;

    function startResizeWidth(e) {
      isResizingWidth = true;
      document.body.style.cursor = 'ew-resize';
      if (e.preventDefault) e.preventDefault();
    }

    function startResizeHeight(e) {
      isResizingHeight = true;
      document.body.style.cursor = 'ns-resize';
      if (e.preventDefault) e.preventDefault();
    }

    function startResizeTop(e) {
      isResizingTop = true;
      document.body.style.cursor = 'ns-resize';
      if (e.preventDefault) e.preventDefault();
    }

    function resizeMove(e) {
      if (isResizingWidth) {
        const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
        const rect = overlay.getBoundingClientRect();
        let newWidth;
        if (this.side === 'left') {
          newWidth = clientX - rect.left;
        } else {
          newWidth = rect.right - clientX;
        }
        this.setWidth(newWidth);
        if (e.preventDefault) e.preventDefault();
      } else if (isResizingHeight) {
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        const rect = overlay.getBoundingClientRect();
        const newHeight = clientY - rect.top;
        this.setHeight(newHeight / window.innerHeight * 100);
        if (e.preventDefault) e.preventDefault();
      } else if (isResizingTop) {
        const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
        const rect = overlay.getBoundingClientRect();
        const deltaY = clientY - rect.top;
        const newTop = parseInt(this.top) + (deltaY / window.innerHeight * 100);
        const newHeight = parseInt(this.height) - (deltaY / window.innerHeight * 100);
        this.setTop(newTop);
        this.setHeight(newHeight);
        if (e.preventDefault) e.preventDefault();
      }
    }

    function endResize() {
      isResizingWidth = false;
      isResizingHeight = false;
      isResizingTop = false;
      document.body.style.cursor = '';
    }

    resizeHandleWidth.addEventListener('mousedown', startResizeWidth.bind(this));
    resizeHandleWidth.addEventListener('touchstart', startResizeWidth.bind(this), {passive: false});
    resizeHandleHeight.addEventListener('mousedown', startResizeHeight.bind(this));
    resizeHandleHeight.addEventListener('touchstart', startResizeHeight.bind(this), {passive: false});
    resizeHandleTop.addEventListener('mousedown', startResizeTop.bind(this));
    resizeHandleTop.addEventListener('touchstart', startResizeTop.bind(this), {passive: false});
    document.addEventListener('mousemove', resizeMove.bind(this));
    document.addEventListener('mouseup', endResize.bind(this));
    document.addEventListener('touchmove', resizeMove.bind(this), {passive: false});
    document.addEventListener('touchend', endResize.bind(this));

    const button = document.createElement('div');
    button.id = 'odin-floating-btn';
    button.innerHTML = '<img src="https://i.postimg.cc/XY5MtyWN/Screenshot-20251108-201642-Google.jpg" alt="Open Odin Tools">';
    button.style.backgroundColor = 'transparent';
    button.style.left = this.buttonLeft;
    button.style.right = this.buttonRight;
    button.style.top = this.buttonTop;
    button.style.bottom = this.buttonBottom;
    button.style.position = 'fixed !important';
    document.body.appendChild(button);
    this.button = button;

    this.clampButtonPosition(button);

    const resizeListener = () => {
      if (this.button) {
        this.clampButtonPosition(this.button);
      }
    };
    window.addEventListener('resize', resizeListener);

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      const closedPos = `-${this.width + 2}px`;
      const isOpen = (this.side === 'left' ? overlay.style.left : overlay.style.right) === '0px';
      this.state.settings.isOpen = !isOpen;
      this.state.saveToIDB();
      if (isOpen) {
        if (this.side === 'left') {
          overlay.style.left = closedPos;
        } else {
          overlay.style.right = closedPos;
        }
        this.logic.clearCountdownIntervals();
        if (this.logic.membersInterval) clearInterval(this.logic.membersInterval);
        if (this.logic.enemyInterval) clearInterval(this.logic.enemyInterval);
        if (this.logic.targetsInterval) clearInterval(this.logic.targetsInterval);
        if (this.logic.warTargetsInterval) clearInterval(this.logic.warTargetsInterval);
        this.logic.stopServerTimeFetch();
        if (this.logic.clockInterval) clearInterval(this.logic.clockInterval);
      } else {
        if (this.side === 'left') {
          overlay.style.left = '0px';
        } else {
          overlay.style.right = '0px';
        }
        await this.logic.startServerTimeFetch();
        this.renderContent(contentWrapper);
      }
    });

    const closeButton = document.createElement('button');
    closeButton.id = 'odin-close-btn';
    closeButton.innerText = 'X';
    overlay.appendChild(closeButton);

    closeButton.addEventListener('click', () => {
      const closedPos = `-${this.width + 2}px`;
      if (this.side === 'left') {
        overlay.style.left = closedPos;
      } else {
        overlay.style.right = closedPos;
      }
      this.state.settings.isOpen = false;
      this.state.saveToIDB();
      this.logic.clearCountdownIntervals();
      if (this.logic.membersInterval) clearInterval(this.logic.membersInterval);
      if (this.logic.enemyInterval) clearInterval(this.logic.enemyInterval);
      if (this.logic.targetsInterval) clearInterval(this.logic.targetsInterval);
      if (this.logic.warTargetsInterval) clearInterval(this.logic.warTargetsInterval);
      this.logic.stopServerTimeFetch();
      if (this.logic.clockInterval) clearInterval(this.logic.clockInterval);
    });

    if (this.isOpen) {
      await this.logic.startServerTimeFetch();
      this.renderContent(contentWrapper);
    }
  }

  async renderContent(container) {
    if (!this.isApiKeyValid()) {
      container.innerHTML = '<p>API key is invalid or missing. Limited functionality available. Please reload and enter a valid full access key.</p>';
      return;
    }
    let html = '';
    html += '<div style="display: flex; justify-content: center; align-items: center; margin-bottom: 12px;">';
    html += '<a href="https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&start=0&sub=medical&start=0" title="Medical Supplies" style="margin-right: 10px;">';
    html += '<img src="https://i.postimg.cc/Cdf6VFCk/large-4x-1.png" style="width: 30px; height: 30px;">';
    html += '</a>';
    html += '<span id="tct-clock"></span><button id="refresh-clock" style="margin-left: 10px;">Refresh Clock</button>';
    html += '</div>';
    html += '<div id="odin-menu"><button class="odin-menu-btn active" data-section="targets">Targets</button><button class="odin-menu-btn" data-section="wartargets">War Targets</button><button class="odin-menu-btn" data-section="members">Members</button><button class="odin-menu-btn" data-section="enemy">Enemy</button><button class="odin-menu-btn" data-section="errors">Errors</button><button class="odin-menu-btn" data-section="settings">Settings</button></div>';
    html += '<div id="odin-section-content"></div>';
    container.innerHTML = html;

    if (this.logic.clockInterval) clearInterval(this.logic.clockInterval);
    this.logic.clockInterval = setInterval(() => {
      const now = this.logic.getServerNow();
      const date = new Date(now * 1000);
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mm = String(date.getUTCMinutes()).padStart(2, '0');
      const ss = String(date.getUTCSeconds()).padStart(2, '0');
      const clock = container.querySelector('#tct-clock');
      if (clock) {
        clock.textContent = `${hh}:${mm}:${ss} TCT`;
      }
    }, 1000);

    const refreshClockBtn = container.querySelector('#refresh-clock');
    if (refreshClockBtn) {
      refreshClockBtn.addEventListener('click', async () => await this.logic.fetchServerTime());
    }

    container.querySelectorAll('.odin-menu-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        container.querySelectorAll('.odin-menu-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const sectionContent = container.querySelector('#odin-section-content');
        this.logic.clearCountdownIntervals();
        if (this.logic.membersInterval) clearInterval(this.logic.membersInterval);
        if (this.logic.enemyInterval) clearInterval(this.logic.enemyInterval);
        if (this.logic.targetsInterval) clearInterval(this.logic.targetsInterval);
        if (this.logic.warTargetsInterval) clearInterval(this.logic.warTargetsInterval);
        const section = e.target.dataset.section;
        if (section === 'targets') {
          if (this.logic.targetsInterval) clearInterval(this.logic.targetsInterval);
          this.logic.targetsInterval = setInterval(async () => {
            const now = Date.now();
            const hospitalTargets = this.state.targets.filter(t => t.status === 'Hospital' && now - t.lastUpdate > 10000);
            const otherTargets = this.state.targets.filter(t => t.status !== 'Hospital' && now - t.lastUpdate > 120000);
            if (hospitalTargets.length > 0 || otherTargets.length > 0) {
              await this.logic.refreshSpecificTargets([...hospitalTargets, ...otherTargets], this.state.targets);
            }
            if (document.querySelector('.odin-menu-btn.active')?.dataset.section === 'targets') {
              sectionContent.innerHTML = this.renderTargetTable(this.state.targets, false);
              this.attachSortListeners(sectionContent);
              this.attachTargetEventListeners(sectionContent);
              this.attachImportExportListeners(sectionContent);
              this.logic.startCountdownTimers();
              setTimeout(() => this.setStickyTops(), 10);
            }
          }, 30000);
          const now = Date.now();
          const hospitalTargets = this.state.targets.filter(t => t.status === 'Hospital' && now - t.lastUpdate > 10000);
          const otherTargets = this.state.targets.filter(t => t.status !== 'Hospital' && now - t.lastUpdate > 120000);
          if (hospitalTargets.length > 0 || otherTargets.length > 0) {
            await this.logic.refreshSpecificTargets([...hospitalTargets, ...otherTargets], this.state.targets);
          }
          sectionContent.innerHTML = this.renderTargetTable(this.state.targets, false);
          this.attachSortListeners(sectionContent);
          this.attachTargetEventListeners(sectionContent);
          this.attachImportExportListeners(sectionContent);
          this.logic.startCountdownTimers();
          setTimeout(() => this.setStickyTops(), 10);
          sectionContent.querySelector('#refresh-targets').addEventListener('click', async () => {
            const scrollLeft = sectionContent.querySelector('.table-container')?.scrollLeft || 0;
            await this.logic.refreshTargets(true).catch(e => {
              console.error("Error refreshing targets on button click:", e);
              OdinState.logError(e);
              alert('Error refreshing targets: ' + e.message);
            });
            sectionContent.innerHTML = this.renderTargetTable(this.state.targets, false);
            sectionContent.querySelector('.table-container').scrollLeft = scrollLeft;
            this.attachSortListeners(sectionContent);
            this.attachTargetEventListeners(sectionContent);
            this.attachImportExportListeners(sectionContent);
            this.logic.startCountdownTimers();
            setTimeout(() => this.setStickyTops(), 10);
          });
          sectionContent.querySelector('#add-target-btn').addEventListener('click', async () => {
            const idInput = sectionContent.querySelector('#add-target-id');
            const id = parseInt(idInput.value);
            if (!isNaN(id) && !this.state.targets.some(t => t.id === id)) {
              if (this.state.targets.length >= maxTargets) {
                alert(`Maximum targets reached (${maxTargets}). Remove some first.`);
                return;
              }
              try {
                const profile = await this.logic.api(`/user/${id}?selections=profile`, 30000);
                if (profile.error) {
                  if (profile.error.code === 7) {
                    alert('Invalid user ID.');
                  } else {
                    alert('Invalid ID or API error: ' + profile.error.error);
                  }
                  OdinState.logError(new Error('Invalid ID or API error when adding target: ' + id + ' - ' + profile.error.error));
                  if (profile.error.code === 14) {
                    if (!BaseModule._apiModule.alertedPermission) {
                      alert('API key lacks access to user profile. Please ensure full access or add "user" permission.');
                      BaseModule._apiModule.alertedPermission = true;
                    }
                  }
                  return;
                }
                this.state.targets.push({
                  id: id,
                  name: profile.name,
                  lvl: profile.level,
                  faction: profile.faction.faction_name,
                  faction_id: profile.faction.faction_id,
                  status: profile.status.state,
                  status_description: profile.status.description,
                  status_until: profile.status.until || 0,
                  life: profile.life.current + '/' + profile.life.maximum,
                  lastAction: profile.last_action.relative,
                  respectGain: null,
                  lastUpdate: Date.now()
                });
                await this.logic.refreshTargets().catch(e => {
                  console.error("Error refreshing after adding target:", e);
                  OdinState.logError(e);
                  alert('Error refreshing after adding target: ' + e.message);
                });
                this.state.saveTargets();
                sectionContent.innerHTML = this.renderTargetTable(this.state.targets, false);
                this.attachSortListeners(sectionContent);
                this.attachTargetEventListeners(sectionContent);
                this.attachImportExportListeners(sectionContent);
                this.logic.startCountdownTimers();
                setTimeout(() => this.setStickyTops(), 10);
              } catch (e) {
                alert('Error adding target: ' + e.message);
                console.error("Error adding target:", e);
                OdinState.logError(e);
              }
            }
            idInput.value = '';
          });
        } else if (section === 'wartargets') {
          if (this.logic.warTargetsInterval) clearInterval(this.logic.warTargetsInterval);
          this.logic.warTargetsInterval = setInterval(async () => {
            const now = Date.now();
            const hospitalTargets = this.state.warTargets.filter(t => t.status === 'Hospital' && now - t.lastUpdate > 10000);
            const otherTargets = this.state.warTargets.filter(t => t.status !== 'Hospital' && now - t.lastUpdate > 120000);
            if (hospitalTargets.length > 0 || otherTargets.length > 0) {
              await this.logic.refreshSpecificTargets([...hospitalTargets, ...otherTargets], this.state.warTargets);
            }
            if (document.querySelector('.odin-menu-btn.active')?.dataset.section === 'wartargets') {
              sectionContent.innerHTML = this.renderTargetTable(this.state.warTargets, true);
              this.attachSortListeners(sectionContent);
              this.attachWarTargetEventListeners(sectionContent);
              this.attachWarImportExportListeners(sectionContent);
              this.logic.startCountdownTimers();
              setTimeout(() => this.setStickyTops(), 10);
            }
          }, 30000);
          const now = Date.now();
          const hospitalTargets = this.state.warTargets.filter(t => t.status === 'Hospital' && now - t.lastUpdate > 10000);
          const otherTargets = this.state.warTargets.filter(t => t.status !== 'Hospital' && now - t.lastUpdate > 120000);
          if (hospitalTargets.length > 0 || otherTargets.length > 0) {
            await this.logic.refreshSpecificTargets([...hospitalTargets, ...otherTargets], this.state.warTargets);
          }
          sectionContent.innerHTML = this.renderTargetTable(this.state.warTargets, true);
          this.attachSortListeners(sectionContent);
          this.attachWarTargetEventListeners(sectionContent);
          this.attachWarImportExportListeners(sectionContent);
          this.logic.startCountdownTimers();
          setTimeout(() => this.setStickyTops(), 10);
          sectionContent.querySelector('#refresh-war-targets').addEventListener('click', async () => {
            const scrollLeft = sectionContent.querySelector('.table-container')?.scrollLeft || 0;
            await this.logic.refreshWarTargets(true).catch(e => {
              console.error("Error refreshing war targets on button click:", e);
              OdinState.logError(e);
              alert('Error refreshing war targets: ' + e.message);
            });
            sectionContent.innerHTML = this.renderTargetTable(this.state.warTargets, true);
            sectionContent.querySelector('.table-container').scrollLeft = scrollLeft;
            this.attachSortListeners(sectionContent);
            this.attachWarTargetEventListeners(sectionContent);
            this.attachWarImportExportListeners(sectionContent);
            this.logic.startCountdownTimers();
            setTimeout(() => this.setStickyTops(), 10);
          });
          const addWarInput = sectionContent.querySelector('#add-war-target-id');
          addWarInput.addEventListener('focus', () => { this.logic.isAddWarFocused = true; });
          addWarInput.addEventListener('blur', () => { this.logic.isAddWarFocused = false; });
          sectionContent.querySelector('#add-war-target-btn').addEventListener('click', async () => {
            const idInput = sectionContent.querySelector('#add-war-target-id');
            const id = parseInt(idInput.value);
            if (!isNaN(id) && !this.state.warTargets.some(t => t.id === id)) {
              if (this.state.warTargets.length >= maxTargets) {
                alert(`Maximum war targets reached (${maxTargets}). Remove some first.`);
                return;
              }
              try {
                const profile = await this.logic.api(`/user/${id}?selections=profile`, 30000);
                if (profile.error) {
                  if (profile.error.code === 7) {
                    alert('Invalid user ID.');
                  } else {
                    alert('Invalid ID or API error: ' + profile.error.error);
                  }
                  OdinState.logError(new Error('Invalid ID or API error when adding war target: ' + id + ' - ' + profile.error.error));
                  if (profile.error.code === 14) {
                    if (!BaseModule._apiModule.alertedPermission) {
                      alert('API key lacks access to user profile. Please ensure full access or add "user" permission.');
                      BaseModule._apiModule.alertedPermission = true;
                    }
                  }
                  return;
                }
                this.state.warTargets.push({
                  id: id,
                  name: profile.name,
                  lvl: profile.level,
                  faction: profile.faction.faction_name,
                  faction_id: profile.faction.faction_id,
                  status: profile.status.state,
                  status_description: profile.status.description,
                  status_until: profile.status.until || 0,
                  life: profile.life.current + '/' + profile.life.maximum,
                  lastAction: profile.last_action.relative,
                  respectGain: null,
                  lastUpdate: Date.now()
                });
                await this.logic.refreshWarTargets().catch(e => {
                  console.error("Error refreshing after adding war target:", e);
                  OdinState.logError(e);
                  alert('Error refreshing after adding war target: ' + e.message);
                });
                this.state.saveWarTargets();
                sectionContent.innerHTML = this.renderTargetTable(this.state.warTargets, true);
                this.attachSortListeners(sectionContent);
                this.attachWarTargetEventListeners(sectionContent);
                this.attachWarImportExportListeners(sectionContent);
                this.logic.startCountdownTimers();
                setTimeout(() => this.setStickyTops(), 10);
              } catch (e) {
                alert('Error adding war target: ' + e.message);
                console.error("Error adding war target:", e);
                OdinState.logError(e);
              }
            }
            idInput.value = '';
          });
        } else if (section === 'members') {
          this.logic.startMembersPoll();
          try {
            await this.logic.fetchFactionMembers();
          } catch (e) {
            console.error('Fetch error:', e);
            OdinState.logError(e);
          }
          this._refreshMemberListView();
        } else if (section === 'enemy') {
          this.logic.startEnemyPoll();
          this._refreshEnemyListView();
        } else if (section === 'errors') {
          sectionContent.innerHTML = this.renderErrorLog();
          this.attachSortListeners(sectionContent);
          setTimeout(() => this.setStickyTops(), 10);
          sectionContent.querySelector('#refresh-errors').addEventListener('click', () => {
            sectionContent.innerHTML = this.renderErrorLog();
            this.attachSortListeners(sectionContent);
            setTimeout(() => this.setStickyTops(), 10);
          });
          sectionContent.querySelector('#clear-errors').addEventListener('click', () => {
            if (confirm('Clear all errors?')) {
              OdinState.errorLog = [];
              setToDB("errors", "errors", OdinState.errorLog);
              sectionContent.innerHTML = this.renderErrorLog();
              this.attachSortListeners(sectionContent);
              setTimeout(() => this.setStickyTops(), 10);
            }
          });
          sectionContent.querySelector('#send-log').addEventListener('click', async () => {
            const logJson = JSON.stringify(OdinState.errorLog, null, 2);
            let username = 'Unknown';
            try {
              const userJson = await this.logic.api('/user?selections=basic');
              if (!userJson.error) {
                username = userJson.name;
              }
            } catch (e) {
              console.error("Error fetching username:", e);
              OdinState.logError(e);
            }
            const browserDetails = `User Agent: ${navigator.userAgent}\nPlatform: ${navigator.platform}\nScript Version: ${GM_info.script.version}`;
            const subject = 'Odin Error Log';
            const body = encodeURIComponent(`Username: ${username}\n\nBrowser Details:\n${browserDetails}\n\nError Report:\n${logJson}`);
            window.location.href = `mailto:bjornodinsson89@gmail.com?subject=${subject}&body=${body}`;
          });
        } else if (section === 'settings') {
          sectionContent.innerHTML = this.renderSettings();
          this.applyCustomStyles();
          setTimeout(() => this.setStickyTops(), 10);
          sectionContent.querySelector('#save-thresholds').addEventListener('click', () => {
            const timeoutInput = sectionContent.querySelector('#timeout-threshold');
            const enemyOnlineInput = sectionContent.querySelector('#enemy-online-threshold');
            this.state.settings.alertThreshold = parseInt(timeoutInput.value) || 240;
            this.state.settings.enemyOnlineThreshold = parseInt(enemyOnlineInput.value) || 5;
            this.logic.alertThreshold = this.state.settings.alertThreshold;
            this.logic.enemyOnlineThreshold = this.state.settings.enemyOnlineThreshold;
            this.state.saveToIDB();
            alert('Thresholds saved!');
          });
          sectionContent.querySelector('#alert-enabled').addEventListener('change', (e) => {
            this.state.settings.alertEnabled = e.target.checked;
            this.logic.alertEnabled = e.target.checked;
            this.state.saveToIDB();
            if (this.logic.alertEnabled) {
              this.logic.startChainAlert();
            } else {
              this.logic.stopChainAlert();
            }
          });
          sectionContent.querySelector('#popup-alert-enabled').addEventListener('change', (e) => {
            this.state.settings.popupEnabled = e.target.checked;
            this.logic.popupEnabled = e.target.checked;
            this.state.saveToIDB();
          });
          sectionContent.querySelector('#neon-enabled').addEventListener('change', (e) => {
            this.state.settings.neonEnabled = e.target.checked;
            this.state.saveToIDB();
            this.applyCustomStyles();
          });
          sectionContent.querySelector('#neon-color').addEventListener('change', (e) => {
            this.state.settings.neonColor = e.target.value;
            this.state.saveToIDB();
            this.applyCustomStyles();
          });
          sectionContent.querySelector('#clear-cache').addEventListener('click', () => {
            BaseModule._apiModule.clearCache();
            alert("Cache cleared.");
          });
          sectionContent.querySelector('#side-select').addEventListener('change', (e) => {
            this.state.settings.overlaySide = e.target.value;
            this.state.saveToIDB();
            alert('Reload page to apply side change.');
          });
          sectionContent.querySelector('#font-family').addEventListener('change', (e) => {
            this.state.settings.fontFamily = e.target.value;
            this.state.saveToIDB();
            this.applyCustomStyles();
          });
          sectionContent.querySelector('#font-color').addEventListener('change', (e) => {
            this.state.settings.fontColor = e.target.value;
            this.state.saveToIDB();
            this.applyCustomStyles();
          });
          sectionContent.querySelector('#header-color').addEventListener('change', (e) => {
            this.state.settings.headerColor = e.target.value;
            this.state.saveToIDB();
            this.applyCustomStyles();
          });
          sectionContent.querySelector('#link-color').addEventListener('change', (e) => {
            this.state.settings.linkColor = e.target.value;
            this.state.saveToIDB();
            this.applyCustomStyles();
          });
        }
      });
    });

    container.querySelector('.odin-menu-btn[data-section="targets"]').click();
  }

  _refreshMemberListView() {
    const sectionContent = document.querySelector('#odin-section-content');
    const scrollLeft = sectionContent.querySelector('.table-container')?.scrollLeft || 0;
    const oldSearch = sectionContent.querySelector('#member-search');
    const searchValue = oldSearch ? oldSearch.value : '';
    if (oldSearch) oldSearch.removeEventListener('input', oldSearch._listener);
    sectionContent.innerHTML = this.renderMembersList();
    sectionContent.querySelector('.table-container').scrollLeft = scrollLeft;
    this.attachSortListeners(sectionContent);
    const newSearch = sectionContent.querySelector('#member-search');
    newSearch.value = searchValue;
    const listener = Utils.debounce((e) => {
      this.filterMembersTable(e.target.value);
    }, 300);
    newSearch.addEventListener('input', listener);
    newSearch._listener = listener;
    this.attachStatusButtonListeners(sectionContent);
    const table = sectionContent.querySelector('#members-table');
    const sortCol = this.state.settings.members_sort_col || 'status_icon';
    const sortAsc = this.state.settings.members_sort_asc;
    const mode = this.state.settings.members_status_mode || '0';
    const btn = table.querySelector('.status-priority-btn');
    btn.dataset.mode = mode;
    btn.classList.add(mode === '0' ? 'green' : mode === '1' ? 'yellow' : 'red');
    this.sortTable(table, sortCol, sortAsc);
    this.logic.startCountdownTimers();
    setTimeout(() => this.setStickyTops(), 10);
  }

  _refreshEnemyListView() {
    const sectionContent = document.querySelector('#odin-section-content');
    const scrollPositions = {};
    sectionContent.querySelectorAll('.table-container').forEach(cont => {
      const fid = cont.dataset.factionId;
      if (fid) scrollPositions[fid] = cont.scrollLeft;
    });
    const addInputValue = sectionContent.querySelector('#add-enemy-faction')?.value || '';
    const enemySearchValue = sectionContent.querySelector('#enemy-search')?.value || '';
    const oldSearch = sectionContent.querySelector('#enemy-search');
    if (oldSearch) oldSearch.removeEventListener('input', oldSearch._listener);
    sectionContent.innerHTML = this.renderEnemyList();
    sectionContent.querySelector('#add-enemy-faction').value = addInputValue;
    sectionContent.querySelector('#enemy-search').value = enemySearchValue;
    sectionContent.querySelectorAll('.table-container').forEach(cont => {
      const fid = cont.dataset.factionId;
      if (fid && scrollPositions[fid] !== undefined) cont.scrollLeft = scrollPositions[fid];
    });
    this.attachSortListeners(sectionContent);
    const newSearch = sectionContent.querySelector('#enemy-search');
    const listener = Utils.debounce((e) => {
      this.filterEnemyTables(e.target.value);
    }, 300);
    newSearch.addEventListener('input', listener);
    newSearch._listener = listener;
    this.attachEnemyRemovalListeners(sectionContent);
    this.attachEnemyImportExportListeners(sectionContent);
    this.attachStatusButtonListeners(sectionContent);
    sectionContent.querySelectorAll('.enemy-members-table').forEach(table => {
      const mode = this.state.settings.enemy_status_mode || '0';
      const btn = table.querySelector('.status-priority-btn');
      btn.dataset.mode = mode;
      btn.classList.add(mode === '0' ? 'green' : mode === '1' ? 'yellow' : 'red');

      const sortCol = this.state.settings.enemy_sort_col;
      const sortAsc = this.state.settings.enemy_sort_asc;
      if (sortCol) {
        this.sortTable(table, sortCol, sortAsc);
      }
    });
    this.logic.startCountdownTimers();
    setTimeout(() => this.setStickyTops(), 10);
    sectionContent.querySelector('#add-enemy-btn').addEventListener('click', async () => {
      const input = sectionContent.querySelector('#add-enemy-faction').value.trim();
      if (input) {
        try {
          let factionId;
          if (!isNaN(parseInt(input))) {
            factionId = input;
          } else {
            factionId = await this.logic.searchFactionByName(input);
          }
          if (factionId) {
            await this.logic.fetchEnemyFactionMembers(factionId);
            this._refreshEnemyListView();
          } else {
            alert('Faction not found.');
          }
        } catch (e) {
          alert('Error adding enemy faction: ' + (e.message || e));
          console.error("Error adding enemy faction:", e);
          OdinState.logError(e);
        }
      }
    });
    sectionContent.querySelector('#auto-poll-enemy').addEventListener('click', async () => {
      await this.logic.fetchEnemyFromWar();
      this._refreshEnemyListView();
    });
    sectionContent.querySelector('#refresh-enemy').addEventListener('click', async () => {
      const enemyPromises = Object.keys(this.state.enemyFactions).map(fid => this.logic.fetchEnemyFactionMembers(fid));
      await Promise.all(enemyPromises);
      this._refreshEnemyListView();
    });
    const addEnemyInput = sectionContent.querySelector('#add-enemy-faction');
    addEnemyInput.addEventListener('focus', () => { this.logic.isAddEnemyFocused = true; });
    addEnemyInput.addEventListener('blur', () => { this.logic.isAddEnemyFocused = false; });
  }

  attachSortListeners(sectionContent) {
    sectionContent.querySelectorAll('th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const table = th.closest('table');
        const asc = th.dataset.asc !== 'true';
        th.dataset.asc = asc ? 'true' : 'false';
        this.sortTable(table, th.dataset.col, asc);

        if (table.id === 'members-table') {
          this.state.settings.members_sort_col = th.dataset.col;
          this.state.settings.members_sort_asc = asc;
          this.state.saveToIDB();
        } else if (table.classList.contains('enemy-members-table')) {
          this.state.settings.enemy_sort_col = th.dataset.col;
          this.state.settings.enemy_sort_asc = asc;
          this.state.saveToIDB();
        }
      });
    });
  }

  attachTargetEventListeners(sectionContent) {
    sectionContent.querySelectorAll('.remove-target').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        const target = this.state.targets.find(t => t.id === id);
        if (target && confirm(`Remove ${target.name} from targets?`)) {
          this.state.targets = this.state.targets.filter(t => t.id !== id);
          this.state.saveTargets();
          sectionContent.innerHTML = this.renderTargetTable(this.state.targets, false);
          this.attachSortListeners(sectionContent);
          this.attachTargetEventListeners(sectionContent);
          this.attachImportExportListeners(sectionContent);
          this.logic.startCountdownTimers();
          setTimeout(() => this.setStickyTops(), 10);
        }
      });
    });
    sectionContent.querySelectorAll('.attack-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${id}`;
      });
    });
  }

  attachWarTargetEventListeners(sectionContent) {
    sectionContent.querySelectorAll('.remove-war-target').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        const target = this.state.warTargets.find(t => t.id === id);
        if (target && confirm(`Remove ${target.name} from war targets?`)) {
          this.state.warTargets = this.state.warTargets.filter(t => t.id !== id);
          this.state.saveWarTargets();
          sectionContent.innerHTML = this.renderTargetTable(this.state.warTargets, true);
          this.attachSortListeners(sectionContent);
          this.attachWarTargetEventListeners(sectionContent);
          this.attachWarImportExportListeners(sectionContent);
          this.logic.startCountdownTimers();
          setTimeout(() => this.setStickyTops(), 10);
        }
      });
    });
    sectionContent.querySelectorAll('.attack-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${id}`;
      });
    });
  }

  attachImportExportListeners(sectionContent) {
    sectionContent.querySelector('#export-targets').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.state.targets, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'odin_targets.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    const importFile = sectionContent.querySelector('#import-file');
    sectionContent.querySelector('#import-targets').addEventListener('click', () => {
      importFile.click();
    });
    importFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
          const backup = [...this.state.targets];
          try {
            const imported = JSON.parse(ev.target.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format: not an array');
            imported.forEach(t => {
              if (typeof t.id !== 'number' || typeof t.name !== 'string' || typeof t.lvl !== 'number' || typeof t.status_until !== 'number' || (typeof t.respectGain !== 'number' && t.respectGain !== null) || typeof t.lastUpdate !== 'number') {
                throw new Error('Invalid target format');
              }
            });
            const uniqueImported = imported.filter((t, i, arr) => arr.findIndex(tt => tt.id === t.id) === i);
            const merged = [...this.state.targets, ...uniqueImported];
            const deduped = merged.filter((t, i, arr) => arr.findIndex(tt => tt.id === t.id) === i);
            if (deduped.length > maxTargets) {
              alert(`Import truncated to ${maxTargets} targets (max limit).`);
            }
            this.state.targets = deduped.slice(0, maxTargets);
            this.state.saveTargets();
            this.logic.refreshTargets().catch(err => {
              this.state.targets = backup;
            });
            sectionContent.innerHTML = this.renderTargetTable(this.state.targets, false);
            this.attachSortListeners(sectionContent);
            this.attachTargetEventListeners(sectionContent);
            this.attachImportExportListeners(sectionContent);
            this.logic.startCountdownTimers();
            setTimeout(() => this.setStickyTops(), 10);
          } catch (err) {
            this.state.targets = backup;
            alert('Invalid JSON: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  attachWarImportExportListeners(sectionContent) {
    sectionContent.querySelector('#export-war-targets').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.state.warTargets, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'odin_war_targets.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    const importFile = sectionContent.querySelector('#import-war-file');
    sectionContent.querySelector('#import-war-targets').addEventListener('click', () => {
      importFile.click();
    });
    importFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
          const backup = [...this.state.warTargets];
          try {
            const imported = JSON.parse(ev.target.result);
            if (!Array.isArray(imported)) throw new Error('Invalid format: not an array');
            imported.forEach(t => {
              if (typeof t.id !== 'number' || typeof t.name !== 'string' || typeof t.lvl !== 'number' || typeof t.status_until !== 'number' || (typeof t.respectGain !== 'number' && t.respectGain !== null) || typeof t.lastUpdate !== 'number') {
                throw new Error('Invalid target format');
              }
            });
            const uniqueImported = imported.filter((t, i, arr) => arr.findIndex(tt => tt.id === t.id) === i);
            const merged = [...this.state.warTargets, ...uniqueImported];
            const deduped = merged.filter((t, i, arr) => arr.findIndex(tt => tt.id === t.id) === i);
            if (deduped.length > maxTargets) {
              alert(`Import truncated to ${maxTargets} targets (max limit).`);
            }
            this.state.warTargets = deduped.slice(0, maxTargets);
            this.state.saveWarTargets();
            this.logic.refreshWarTargets().catch(err => {
              this.state.warTargets = backup;
            });
            sectionContent.innerHTML = this.renderTargetTable(this.state.warTargets, true);
            this.attachSortListeners(sectionContent);
            this.attachWarTargetEventListeners(sectionContent);
            this.attachWarImportExportListeners(sectionContent);
            this.logic.startCountdownTimers();
            setTimeout(() => this.setStickyTops(), 10);
          } catch (err) {
            this.state.warTargets = backup;
            alert('Invalid JSON: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  attachEnemyRemovalListeners(sectionContent) {
    sectionContent.querySelectorAll('.remove-enemy-faction').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fid = e.target.dataset.factionId;
        if (confirm(`Remove enemy faction ${this.state.enemyFactions[fid].name}?`)) {
          delete this.state.enemyFactions[fid];
          this.state.saveToIDB();
          this._refreshEnemyListView();
        }
      });
    });
  }

  attachEnemyImportExportListeners(sectionContent) {
    sectionContent.querySelector('#export-enemy').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.state.enemyFactions, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'odin_enemy_factions.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    const importFile = sectionContent.querySelector('#import-enemy-file');
    sectionContent.querySelector('#import-enemy').addEventListener('click', () => {
      importFile.click();
    });
    importFile.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => {
          const backup = {...this.state.enemyFactions};
          try {
            const imported = JSON.parse(ev.target.result);
            if (typeof imported !== 'object' || imported === null) throw new Error('Invalid format: not an object');
            Object.values(imported).forEach(f => {
              if (!f.members || typeof f.members !== 'object' || typeof f.name !== 'string') throw new Error('Invalid faction format');
            });
            this.state.enemyFactions = {...this.state.enemyFactions, ...imported};
            this.state.saveToIDB();
            this._refreshEnemyListView();
          } catch (err) {
            this.state.enemyFactions = backup;
            alert('Invalid JSON: ' + err.message);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  attachStatusButtonListeners(sectionContent) {
    sectionContent.querySelectorAll('.status-priority-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        let mode = parseInt(button.dataset.mode || '0', 10);
        mode = (mode + 1) % 3;
        button.dataset.mode = mode.toString();
        button.classList.remove('green', 'yellow', 'red');
        if (mode === 0) button.classList.add('green');
        else if (mode === 1) button.classList.add('yellow');
        else button.classList.add('red');
        const table = button.closest('table');
        this.sortTable(table, 'status_icon', false);
        if (table.id === 'members-table') {
          this.state.settings.members_status_mode = mode.toString();
          this.state.settings.members_sort_col = 'status_icon';
          this.state.settings.members_sort_asc = false;
          this.state.saveToIDB();
        } else if (table.classList.contains('enemy-members-table')) {
          this.state.settings.enemy_status_mode = mode.toString();
          this.state.settings.enemy_sort_col = 'status_icon';
          this.state.settings.enemy_sort_asc = false;
          this.state.saveToIDB();
        }
      });
    });
  }

  renderTargetTable(targets, isWar) {
    const prefix = isWar ? 'war-' : '';
    const title = isWar ? 'War Targets' : 'Targets';
    const now = this.logic.getServerNow();

    // same priority logic as before
    const sortedTargets = [...targets].sort((a, b) => {
      function getPriority(t) {
        const timer = Math.max(0, t.status_until - now);
        if (t.status === 'Okay') {
          return { group: 0, value: -(t.respectGain || 0) };
        } else if (t.status === 'Hospital') {
          return { group: 1, value: timer };
        } else if (t.status === 'Jail') {
          return { group: 2, value: timer };
        } else if (t.status === 'Traveling') {
          return { group: 3, value: timer };
        } else {
          return { group: 4, value: 0 };
        }
      }
      const pa = getPriority(a);
      const pb = getPriority(b);
      return pa.group - pb.group || pa.value - pb.value;
    });

    // enrich with Freki scoring info if available
    const enhanced = sortedTargets.map(t => {
      let details = null;
      if (window.Freki && typeof window.Freki.getTargetScoreDetails === 'function') {
        try {
          details = window.Freki.getTargetScoreDetails(t, {
            chain: this.logic.chainCurrent || 0,
            war: isWar
          });
        } catch (e) {
          console.error('[ODIN] Freki score error', e);
        }
      }
      return { target: t, freki: details };
    });

    const addButtonImg = isWar
      ? '<img src="https://i.ibb.co/SwSSQpR7/Screenshot-20251108-234119-Google-2.png" alt="Add War Target" style="width:auto;height:20px;">'
      : '<img src="https://i.ibb.co/bgM3FHBV/Screenshot-20251108-233856-Google-2.png" alt="Add Target" style="width:auto;height:20px;">';

    return `
<div class="button-group small-button-group">
  <button id="refresh-${prefix}targets">Refresh ${title}</button>
  <button id="export-${prefix}targets">Export ${title}</button>
  <button id="import-${prefix}targets">Import ${title}</button>
</div>
<input type="file" id="import-${prefix}file" accept=".json" style="display:none;">
<div class="add-form">
  <input type="text" id="add-${prefix}target-id" placeholder="Enter ${title} ID">
  <button id="add-${prefix}target-btn" style="margin-left:5px;">${addButtonImg}</button>
</div>
<p>Note: Respect from last 100 attacks only.</p>
<div class="table-container">
  <table id="${prefix}target-table" class="responsive-table">
    <thead>
      <tr>
        <th data-col="name">NAME</th>
        <th data-col="lvl">LEVEL</th>
        <th data-col="faction">FACTION</th>
        <th data-col="life">LIFE</th>
        <th data-col="status">Status</th>
        <th data-col="lastAction">Last Action</th>
        <th data-col="respectGain">Respect</th>
        <th data-col="score">Score</th>
        <th data-col="lastUpdate">Last Update</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody>
      ${enhanced.map(({target: t, freki}) => {
        const totalSeconds = Math.floor((Date.now() - t.lastUpdate) / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const timeAgo =
          (minutes < 10 ? '0' : '') + minutes + ':' +
          (seconds < 10 ? '0' : '') + seconds;

        const factionLink =
          t.faction_id && t.faction !== 'N/A'
            ? `<a href="https://www.torn.com/factions.php?step=profile&ID=${t.faction_id}">${Utils.escapeHtml(t.faction)}</a>`
            : (Utils.escapeHtml(t.faction) || 'N/A');

        const respectDisplay =
          t.respectGain != null ? t.respectGain : 'N/A';

        let statusDisplay = Utils.escapeHtml(t.status);
        let attackButton = '';

        if (t.status === 'Okay') {
          attackButton = `<button class="attack-btn" data-id="${t.id}">Attack</button>`;
        }

        if (t.status === 'Hospital' || t.status === 'Jail' || t.status === 'Traveling') {
          const timer = t.status_until - now;
          if (timer > 0) {
            statusDisplay +=
              ' (<span class="countdown" data-until="' + t.status_until + '">' +
              Utils.formatTime(timer, true) +
              '</span>)';
          }
        } else if (t.status_description) {
          statusDisplay += ' - ' + Utils.escapeHtml(t.status_description);
        }

        // ---------- Freki pretty score cell ----------
        let scoreHtml = '<span class="freki-score-na">—</span>';
        let scoreText = '';
        if (freki && freki.bucket && freki.bucket.count >= 5) {
          const score = Number(freki.score || 0);
          const rpe = Number(freki.bucket.avg_rpe || 0);
          const wr  = Number(freki.bucket.win_rate || 0);
          const n   = Number(freki.bucket.count || 0);

          const barWidth = Math.max(5, Math.min(100, Math.round((score / 3) * 100)));

          let tier = 'freki-tier-d';
          if (score >= 2.5) tier = 'freki-tier-s';
          else if (score >= 2.0) tier = 'freki-tier-a';
          else if (score >= 1.5) tier = 'freki-tier-b';
          else if (score >= 1.0) tier = 'freki-tier-c';

          scoreText = score.toFixed(2);

          scoreHtml = `
            <div class="freki-score-wrap">
              <div class="freki-score-head">
                <span class="freki-score-badge ${tier}">${score.toFixed(2)}</span>
                <span class="freki-score-meta">
                  WR ${(wr * 100).toFixed(0)}% · RPE ${rpe.toFixed(2)} · n=${n}
                </span>
              </div>
              <div class="freki-score-bar">
                <div class="freki-score-bar-fill ${tier}" style="width:${barWidth}%;"></div>
              </div>
            </div>`;
        } else if (t.respectGain != null && t.respectGain > 0) {
          const fallback = t.respectGain / 25;
          scoreText = fallback.toFixed(2);
          scoreHtml = `
            <div class="freki-score-wrap">
              <div class="freki-score-head">
                <span class="freki-score-badge freki-tier-local">${fallback.toFixed(2)}</span>
                <span class="freki-score-meta">local · ${t.respectGain.toFixed ? t.respectGain.toFixed(2) : t.respectGain} respect</span>
              </div>
            </div>`;
        }

        return `
          <tr data-id="${t.id}">
            <td data-label="NAME">
              <a href="https://www.torn.com/profiles.php?XID=${t.id}">
                ${Utils.escapeHtml(t.name || 'Unidentified')}
              </a>
            </td>
            <td data-label="LEVEL">[${t.lvl || 'N/A'}]</td>
            <td data-label="Faction">${factionLink}</td>
            <td data-label="Life">${t.life || 'N/A'}</td>
            <td data-label="Status">${statusDisplay} ${attackButton}</td>
            <td data-label="Last Action">${Utils.escapeHtml(t.lastAction || 'N/A')}</td>
            <td data-label="Respect">${respectDisplay}</td>
            <td data-label="Score">${scoreHtml}</td>
            <td data-label="Last Update">${timeAgo}</td>
            <td data-label="Action"><button class="remove-${prefix}target" data-id="${t.id}">Remove</button></td>
          </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
`;
  }
  renderMembersList() {
    const now = this.logic.getServerNow();
    return `
<h3 class="faction-header">${Utils.escapeHtml(this.state.factionName)}</h3>
<input type="text" id="member-search" placeholder="Search members..." style="width: 100%; margin-bottom: 0;">
<div class="table-container" style="margin-top: 0;">
  <table id="members-table" class="responsive-table" style="margin-top: 0;">
    <thead>
      <tr>
        <th data-col="status_icon"><button class="status-priority-btn status-btn green" data-mode="0"></button></th>
        <th data-col="name">Name</th>
        <th data-col="level">Level</th>
        <th data-col="position">Position</th>
        <th data-col="days_in_faction">Days in Faction</th>
        <th data-col="last_action">Last Action</th>
        <th data-col="status">Status</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(this.state.factionMembers).map(([userId, member]) => {
        const statusClass = member.last_action.status.toLowerCase();
        let statusDisplay = Utils.escapeHtml(member.status.state);
        if (member.status.state === 'Hospital' || member.status.state === 'Jail' || member.status.state === 'Traveling') {
          let timer = member.status.until - now;
          if (timer > 0) {
            statusDisplay += ` (<span class="countdown" data-until="${member.status.until}">${Utils.formatTime(timer, true)}</span>)`;
          }
        } else if (member.status.description) {
          statusDisplay += ` - ${Utils.escapeHtml(member.status.description)}`;
        }
        return `<tr>
          <td data-label=""><span class="status-icon ${statusClass}"></span></td>
          <td data-label="Name"><a href="https://${window.location.host}/profiles.php?XID=${userId}">${Utils.escapeHtml(member.name)}</a></td>
          <td data-label="Level">${member.level}</td>
          <td data-label="Position">${Utils.escapeHtml(member.position)}</td>
          <td data-label="Days in Faction">${member.days_in_faction}</td>
          <td data-label="Last Action">${Utils.escapeHtml(member.last_action.relative)}</td>
          <td data-label="Status">${statusDisplay}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
`;
  }

  renderEnemyList() {
    const now = this.logic.getServerNow();
    return `
<h3>Enemy</h3>
<div class="button-group small-button-group">
  <button id="refresh-enemy">Refresh Enemy</button>
  <button id="export-enemy">Export Enemy Factions</button>
  <button id="import-enemy">Import Enemy Factions</button>
</div>
<input type="file" id="import-enemy-file" accept=".json" style="display:none;">
<div class="add-form">
  <input type="text" id="add-enemy-faction" placeholder="Enter Faction Name or ID">
  <button id="add-enemy-btn" style="margin-left: 5px;">Add</button>
</div>
<div class="button-group small-button-group">
  <button id="auto-poll-enemy">Auto-Poll from War</button>
</div>
<input type="text" id="enemy-search" placeholder="Search enemy members..." style="width: 100%; margin-bottom: 0;">
${Object.entries(this.state.enemyFactions).map(([factionId, data]) => {
  const members = data.members || {};
  let warInfo = '';
  let factionName = data.name || 'Unknown';
  for (const [warId, war] of Object.entries(this.state.rankedWars)) {
    if (war.factions[factionId]) {
      const enemy = war.factions[factionId];
      factionName = enemy.name || factionName;
      const ourFaction = war.factions[this.logic.user.factionID];
      if (ourFaction) {
        const ourScore = ourFaction.score;
        const enemyScore = enemy.score;
        const difference = ourScore - enemyScore;
        const diffColor = difference >= 0 ? 'green' : 'red';
        warInfo = `<p>War vs ${Utils.escapeHtml(factionName)}: Score ${ourScore} - ${enemyScore} (Diff: <span style="color: ${diffColor};">${difference}</span>)</p>`;
      }
    }
  }
  return `
    <h4>${warInfo ? warInfo : Utils.escapeHtml(factionName)}<button class="remove-enemy-faction" data-faction-id="${factionId}">Remove</button></h4>
    <div class="table-container" data-faction-id="${factionId}">
      <table class="responsive-table enemy-members-table" style="margin-top: 0;">
        <thead>
          <tr>
            <th data-col="status_icon"><button class="status-priority-btn status-btn green" data-mode="0"></button></th>
            <th data-col="name">Name</th>
            <th data-col="level">Level</th>
            <th data-col="position">Position</th>
            <th data-col="days_in_faction">Days in Faction</th>
            <th data-col="last_action">Last Action</th>
            <th data-col="status">Status</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(members).map(([userId, member]) => {
            const statusClass = member.last_action.status.toLowerCase();
            let statusDisplay = Utils.escapeHtml(member.status.state);
            if (member.status.state === 'Hospital' || member.status.state === 'Jail' || member.status.state === 'Traveling') {
              let timer = member.status.until - now;
              if (timer > 0) {
                statusDisplay += ` (<span class="countdown" data-until="${member.status.until}">${Utils.formatTime(timer, true)}</span>)`;
              }
            } else if (member.status.description) {
              statusDisplay += ` - ${Utils.escapeHtml(member.status.description)}`;
            }
            return `<tr>
              <td data-label=""><span class="status-icon ${statusClass}"></span></td>
              <td data-label="Name"><a href="https://${window.location.host}/profiles.php?XID=${userId}">${Utils.escapeHtml(member.name)}</a></td>
              <td data-label="Level">${member.level}</td>
              <td data-label="Position">${Utils.escapeHtml(member.position)}</td>
              <td data-label="Days in Faction">${member.days_in_faction}</td>
              <td data-label="Last Action">${Utils.escapeHtml(member.last_action.relative)}</td>
              <td data-label="Status">${statusDisplay}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}).join('')}
${Object.keys(this.state.enemyFactions).length === 0 ? '<p>No enemy factions added.</p>' : ''}
`;
  }

  renderErrorLog() {
    const groups = new Map();
    OdinState.errorLog.forEach(err => {
      const key = err.message + '||' + (err.stack || '');
      if (groups.has(key)) {
        const group = groups.get(key);
        group.count++;
        if (err.timestamp > group.timestamp) group.timestamp = err.timestamp;
      } else {
        groups.set(key, {timestamp: err.timestamp, message: err.message, stack: err.stack || '', count: 1});
      }
    });
    const sortedGroups = Array.from(groups.values()).sort((a, b) => b.timestamp - a.timestamp);
    return `
<h3>Error Log</h3>
<div class="button-group">
  <button id="refresh-errors">Refresh</button>
  <button id="clear-errors">Clear</button>
  <button id="send-log">Send log to Bjorn</button>
</div>
<div class="table-container">
  <table class="responsive-table">
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Message</th>
        <th>Stack</th>
      </tr>
    </thead>
    <tbody>
      ${sortedGroups.map(group => {
        const time = new Date(group.timestamp).toLocaleString();
        const stackDisplay = group.stack + (group.count > 1 ? ` (x${group.count})` : '');
        return `<tr>
          <td data-label="Timestamp">${time}</td>
          <td data-label="Message">${Utils.escapeHtml(group.message)}</td>
          <td data-label="Stack">${Utils.escapeHtml(stackDisplay)}</td>
        </tr>`;
      }).join('')}
      ${sortedGroups.length === 0 ? '<tr><td colspan="3">No errors logged.</td></tr>' : ''}
    </tbody>
  </table>
</div>
`;
  }

  renderSettings() {
    const colorOptions = [
      {value: '#000000', name: 'Black'},
      {value: '#FFFFFF', name: 'White'},
      {value: '#FF0000', name: 'Red'},
      {value: '#00FF00', name: 'Green'},
      {value: '#0000FF', name: 'Blue'},
      {value: '#FFFF00', name: 'Yellow'},
      {value: '#FF00FF', name: 'Magenta'},
      {value: '#00FFFF', name: 'Cyan'},
      {value: '#808080', name: 'Gray'},
      {value: '#C0C0C0', name: 'Silver'},
      {value: '#800000', name: 'Maroon'},
      {value: '#808000', name: 'Olive'},
      {value: '#008000', name: 'Dark Green'},
      {value: '#800080', name: 'Purple'},
      {value: '#008080', name: 'Teal'},
      {value: '#000080', name: 'Navy'},
    ];
    const colorSelect = (id, selected) => `
      <select id="${id}" style="max-height: 200px; overflow-y: auto;">
        ${colorOptions.map(opt => `<option value="${opt.value}" style="color: ${opt.value};" ${opt.value === selected ? 'selected' : ''}>${opt.name}</option>`).join('')}
      </select>
    `;
    return `
<h3>Settings</h3>
<div class="settings-group">
  <h4>Chain Alerts</h4>
  <div class="settings-row">
    <label for="timeout-threshold">Timeout Alert Threshold (minutes):</label>
    <select id="timeout-threshold">
      ${[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5].map(minutes => {
        const seconds = minutes * 60;
        return `<option value="${seconds}" ${seconds === this.logic.alertThreshold ? 'selected' : ''}>${minutes}</option>`;
      }).join('')}
    </select>
  </div>
  <div class="settings-row">
    <label>Chain Alert Enabled:</label>
    <input type="checkbox" id="alert-enabled" ${this.logic.alertEnabled ? 'checked' : ''}>
  </div>
  <div class="settings-row">
    <label>Popup Alert Enabled:</label>
    <input type="checkbox" id="popup-alert-enabled" ${this.logic.popupEnabled ? 'checked' : ''}>
  </div>
</div>
<div class="settings-group">
  <h4>Enemy Alerts</h4>
  <div class="settings-row">
    <label for="enemy-online-threshold">Enemy Online Alert Threshold:</label>
    <input type="number" id="enemy-online-threshold" value="${this.logic.enemyOnlineThreshold}">
  </div>
</div>
<div class="settings-group">
  <h4>UI Customization</h4>
  <div class="settings-row">
    <label for="side-select">Overlay Side:</label>
    <select id="side-select">
      <option value="left" ${this.side === 'left' ? 'selected' : ''}>Left</option>
      <option value="right" ${this.side === 'right' ? 'selected' : ''}>Right</option>
    </select>
  </div>
  <div class="settings-row">
    <label>Enable Neon Effect:</label>
    <input type="checkbox" id="neon-enabled" ${this.state.settings.neonEnabled ? 'checked' : ''}>
  </div>
  <div class="settings-row">
    <label for="neon-color">Neon Glow Color:</label>
    ${colorSelect('neon-color', this.state.settings.neonColor)}
  </div>
  <div class="settings-row">
    <label for="font-family">Font Family:</label>
    <select id="font-family">
      <option value="Orbitron" style="font-family: Orbitron;" ${this.state.settings.fontFamily === 'Orbitron' ? 'selected' : ''}>Orbitron</option>
      <option value="Arial" style="font-family: Arial;" ${this.state.settings.fontFamily === 'Arial' ? 'selected' : ''}>Arial</option>
      <option value="Helvetica" style="font-family: Helvetica;" ${this.state.settings.fontFamily === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
      <option value="Times New Roman" style="font-family: 'Times New Roman';" ${this.state.settings.fontFamily === 'Times New Roman' ? 'selected' : ''}>Times New Roman</option>
      <option value="Courier" style="font-family: Courier;" ${this.state.settings.fontFamily === 'Courier' ? 'selected' : ''}>Courier</option>
      <option value="Courier New" style="font-family: 'Courier New';" ${this.state.settings.fontFamily === 'Courier New' ? 'selected' : ''}>Courier New</option>
      <option value="Georgia" style="font-family: Georgia;" ${this.state.settings.fontFamily === 'Georgia' ? 'selected' : ''}>Georgia</option>
      <option value="Verdana" style="font-family: Verdana;" ${this.state.settings.fontFamily === 'Verdana' ? 'selected' : ''}>Verdana</option>
      <option value="Tahoma" style="font-family: Tahoma;" ${this.state.settings.fontFamily === 'Tahoma' ? 'selected' : ''}>Tahoma</option>
      <option value="Trebuchet MS" style="font-family: 'Trebuchet MS';" ${this.state.settings.fontFamily === 'Trebuchet MS' ? 'selected' : ''}>Trebuchet MS</option>
      <option value="Palatino" style="font-family: Palatino;" ${this.state.settings.fontFamily === 'Palatino' ? 'selected' : ''}>Palatino</option>
      <option value="Garamond" style="font-family: Garamond;" ${this.state.settings.fontFamily === 'Garamond' ? 'selected' : ''}>Garamond</option>
      <option value="Bookman" style="font-family: Bookman;" ${this.state.settings.fontFamily === 'Bookman' ? 'selected' : ''}>Bookman</option>
      <option value="Comic Sans MS" style="font-family: 'Comic Sans MS';" ${this.state.settings.fontFamily === 'Comic Sans MS' ? 'selected' : ''}>Comic Sans MS</option>
      <option value="Impact" style="font-family: Impact;" ${this.state.settings.fontFamily === 'Impact' ? 'selected' : ''}>Impact</option>
      <option value="Lucida Sans Unicode" style="font-family: 'Lucida Sans Unicode';" ${this.state.settings.fontFamily === 'Lucida Sans Unicode' ? 'selected' : ''}>Lucida Sans Unicode</option>
      <option value="Geneva" style="font-family: Geneva;" ${this.state.settings.fontFamily === 'Geneva' ? 'selected' : ''}>Geneva</option>
      <option value="Monaco" style="font-family: Monaco;" ${this.state.settings.fontFamily === 'Monaco' ? 'selected' : ''}>Monaco</option>
      <option value="Roboto" style="font-family: Roboto;" ${this.state.settings.fontFamily === 'Roboto' ? 'selected' : ''}>Roboto</option>
      <option value="Open Sans" style="font-family: 'Open Sans';" ${this.state.settings.fontFamily === 'Open Sans' ? 'selected' : ''}>Open Sans</option>
      <option value="Lato" style="font-family: Lato;" ${this.state.settings.fontFamily === 'Lato' ? 'selected' : ''}>Lato</option>
      <option value="Montserrat" style="font-family: Montserrat;" ${this.state.settings.fontFamily === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
      <option value="Raleway" style="font-family: Raleway;" ${this.state.settings.fontFamily === 'Raleway' ? 'selected' : ''}>Raleway</option>
      <option value="Poppins" style="font-family: Poppins;" ${this.state.settings.fontFamily === 'Poppins' ? 'selected' : ''}>Poppins</option>
      <option value="Oswald" style="font-family: Oswald;" ${this.state.settings.fontFamily === 'Oswald' ? 'selected' : ''}>Oswald</option>
      <option value="Source Sans Pro" style="font-family: 'Source Sans Pro';" ${this.state.settings.fontFamily === 'Source Sans Pro' ? 'selected' : ''}>Source Sans Pro</option>
      <option value="Nunito" style="font-family: Nunito;" ${this.state.settings.fontFamily === 'Nunito' ? 'selected' : ''}>Nunito</option>
      <option value="Ubuntu" style="font-family: Ubuntu;" ${this.state.settings.fontFamily === 'Ubuntu' ? 'selected' : ''}>Ubuntu</option>
      <option value="Permanent Marker" style="font-family: 'Permanent Marker';" ${this.state.settings.fontFamily === 'Permanent Marker' ? 'selected' : ''}>Permanent Marker</option>
      <option value="Bangers" style="font-family: Bangers;" ${this.state.settings.fontFamily === 'Bangers' ? 'selected' : ''}>Bangers</option>
      <option value="Press Start 2P" style="font-family: 'Press Start 2P';" ${this.state.settings.fontFamily === 'Press Start 2P' ? 'selected' : ''}>Press Start 2P</option>
      <option value="Shadows Into Light" style="font-family: 'Shadows Into Light';" ${this.state.settings.fontFamily === 'Shadows Into Light' ? 'selected' : ''}>Shadows Into Light</option>
      <option value="Indie Flower" style="font-family: 'Indie Flower';" ${this.state.settings.fontFamily === 'Indie Flower' ? 'selected' : ''}>Indie Flower</option>
      <option value="Lobster" style="font-family: Lobster;" ${this.state.settings.fontFamily === 'Lobster' ? 'selected' : ''}>Lobster</option>
      <option value="Fredoka One" style="font-family: 'Fredoka One';" ${this.state.settings.fontFamily === 'Fredoka One' ? 'selected' : ''}>Fredoka One</option>
      <option value="Chewy" style="font-family: Chewy;" ${this.state.settings.fontFamily === 'Chewy' ? 'selected' : ''}>Chewy</option>
      <option value="Nosifer" style="font-family: Nosifer;" ${this.state.settings.fontFamily === 'Nosifer' ? 'selected' : ''}>Nosifer</option>
      <option value="Creepster" style="font-family: Creepster;" ${this.state.settings.fontFamily === 'Creepster' ? 'selected' : ''}>Creepster</option>
      <option value="Bungee" style="font-family: Bungee;" ${this.state.settings.fontFamily === 'Bungee' ? 'selected' : ''}>Bungee</option>
    </select>
  </div>
  <div class="settings-row">
    <label for="font-color">Font Color:</label>
    ${colorSelect('font-color', this.state.settings.fontColor)}
  </div>
  <div class="settings-row">
    <label for="header-color">Header Color:</label>
    ${colorSelect('header-color', this.state.settings.headerColor)}
  </div>
  <div class="settings-row">
    <label for="link-color">Link Color:</label>
    ${colorSelect('link-color', this.state.settings.linkColor)}
  </div>
</div>
<div class="button-group">
  <button id="save-thresholds">Save All Settings</button>
</div>
<div class="settings-group">
  <h4>API & Cache Management</h4>
  <div class="button-group">
    <button id="clear-cache">Clear Cache</button>
  </div>
</div>
`;
  }

  parseLastAction(str) {
    if (str === 'Online' || str === 'Just now' || str === 'A few moments ago') return 0;
    if (str === 'Idle') return 300;
    if (str.toLowerCase().includes('yesterday')) return 86400;
    str = str.replace(/a /gi, '1 ');
    str = str.replace(/an /gi, '1 ');
    const match = str.match(/(\d+)\s+(\w+) ago/);
    if (!match) {
      console.log('Unexpected last_action format:', str);
      return Infinity;
    }
    let val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('second')) val *= 1;
    else if (unit.startsWith('minute')) val *= 60;
    else if (unit.startsWith('hour')) val *= 3600;
    else if (unit.startsWith('day')) val *= 86400;
    else if (unit.startsWith('week')) val *= 604800;
    else if (unit.startsWith('month')) val *= 2592000;
    return val;
  }

  sortTable(table, col, asc = true) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.rows);
    const header = table.querySelector('thead tr');
    const colIndex = Array.from(header.children).findIndex(th => th.dataset.col === col);
    const button = table.querySelector('.status-priority-btn');
    rows.sort((a, b) => {
      let aText = a.querySelector(`td:nth-child(${colIndex + 1})`).textContent.trim();
      let bText = b.querySelector(`td:nth-child(${colIndex + 1})`).textContent.trim();
      let aVal, bVal;

      if (col === 'status_icon') {
        const mode = parseInt(button ? button.dataset.mode : '0', 10);
        const aStatus = a.querySelector('.status-icon').classList[1];
        const bStatus = b.querySelector('.status-icon').classList[1];
        aVal = getStatusValue(aStatus, mode);
        bVal = getStatusValue(bStatus, mode);
      } else if (
      col === 'lvl' ||
      col === 'level' ||
      col === 'days_in_faction' ||
      col === 'respectGain' ||
      col === 'score'
    ) {
        aVal = parseFloat(aText) || 0;
        bVal = parseFloat(bText) || 0;
      } else if (col === 'life') {
        aVal = parseFloat(aText.split('/')[0]) || 0;
        bVal = parseFloat(bText.split('/')[0]) || 0;
      } else if (col === 'lastUpdate') {
        let aParts = aText.split(':');
        let bParts = bText.split(':');
        aVal = (parseInt(aParts[0]) * 60 + parseInt(aParts[1])) || 0;
        bVal = (parseInt(bParts[0]) * 60 + parseInt(bParts[1])) || 0;
      } else if (col === 'lastAction' || col === 'last_action') {
        aVal = this.parseLastAction(aText);
        bVal = this.parseLastAction(bText);
      } else {
        aVal = aText;
        bVal = bText;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return asc ? aVal - bVal : bVal - aVal;
      } else {
        return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
    });
    tbody.innerHTML = '';
    rows.forEach(row => tbody.appendChild(row));
  }

  filterMembersTable(query) {
    const table = document.getElementById('members-table');
    if (!table) return;
    const tr = table.getElementsByTagName('tr');
    for (let i = 1; i < tr.length; i++) {
      tr[i].style.display = "";
      const td = tr[i].getElementsByTagName('td');
      let found = false;
      for (let j = 0; j < td.length; j++) {
        if (td[j].textContent.toUpperCase().indexOf(query.toUpperCase()) > -1) {
          found = true;
          break;
        }
      }
      if (!found) {
        tr[i].style.display = "none";
      }
    }
  }

  filterEnemyTables(query) {
    const tables = document.querySelectorAll('.enemy-members-table');
    tables.forEach(table => {
      const tr = table.getElementsByTagName('tr');
      for (let i = 1; i < tr.length; i++) {
        tr[i].style.display = "";
        const td = tr[i].getElementsByTagName('td');
        let found = false;
        for (let j = 0; j < td.length; j++) {
          if (td[j].textContent.toUpperCase().indexOf(query.toUpperCase()) > -1) {
            found = true;
            break;
          }
        }
        if (!found) {
          tr[i].style.display = "none";
        }
      }
    });
  }

  async promptForApiKey(force = false) {
    const now = Date.now();
    if (!force && now - this.state.settings.lastPromptTime < 60000) {
      return null;
    }

    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.id = 'odin-api-modal';
      modal.innerHTML = `
        <div id="odin-api-modal-content">
          <h3>Odin Tools API Key Required</h3>
          <p>Enter your Torn API key with full access. This key is stored locally.</p>
          <input type="text" id="odin-api-input" placeholder="Enter API Key">
          <div id="odin-api-buttons">
            <button id="odin-api-btn-enter">Enter</button>
            <button id="odin-api-btn-cancel">Cancel</button>
            <button id="odin-api-btn-wait">Skip for Now</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const input = modal.querySelector('#odin-api-input');
      input.focus();

      modal.querySelector('#odin-api-btn-enter').addEventListener('click', async () => {
        const key = input.value.trim();
        if (key) {
          const userJson = await BaseModule._apiModule.checkKeyValidity(key);
          if (userJson) {
            try {
              this.state.settings.lastPromptTime = Date.now();
              await this.state.saveToIDB();
              modal.parentNode.removeChild(modal);
              alert(`Welcome ${userJson.name}${userJson.faction ? ', ' + userJson.faction.position + ' of ' + userJson.faction.faction_name : ''}`);
              resolve(key);
            } catch (e) {
              console.error("Error saving settings after API key entry:", e);
              alert("API key accepted, but error saving settings: " + e.message + ". Please reload and try again.");
              resolve(null);
            }
          } else {
            alert("Invalid API key. Please try again.");
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      modal.querySelector('#odin-api-btn-cancel').addEventListener('click', () => {
        modal.parentNode.removeChild(modal);
        resolve(null);
      });

      modal.querySelector('#odin-api-btn-wait').addEventListener('click', () => {
        this.state.settings.lastPromptTime = Date.now();
        this.state.saveToIDB();
        modal.parentNode.removeChild(modal);
        resolve(null);
      });
    });
  }
}

const state = new OdinState();
BaseModule._apiModule.registerState(state);

(async () => {
  await state.loadFromIDB();
  const cacheEntries = await loadAllFromStore('cache');
  cacheEntries.forEach(entry => {
    BaseModule._apiModule.cacheLog[entry.key] = entry.value;
  });
  let apiKey = state.settings.apiKey;
  BaseModule._apiModule.apiKey = apiKey;
  BaseModule._apiModule.callLog = state.settings.callLog;
  const ui = new OdinUserInterface(state, null);
  const logic = new OdinLogic(state, ui);
  ui.logic = logic;

  const isValidKey = apiKey ? await BaseModule._apiModule.checkKeyValidity(apiKey) : false;

  if (!isValidKey) {
    apiKey = await ui.promptForApiKey(!apiKey);
    if (apiKey) {
      state.settings.apiKey = apiKey;
      state.saveToIDB();
      BaseModule._apiModule.clearCache();
      BaseModule._apiModule.apiKeyIsValid = true;
      BaseModule._apiModule.apiKey = apiKey;
      await logic.init();
    } else {
      alert("API key is required. Script will not run.");
    }
  } else {
    BaseModule._apiModule.apiKeyIsValid = true;
    BaseModule._apiModule.apiKey = apiKey;
    await logic.init();
    ui.observeProfileChanges();
    if (location.href.includes("profiles.php")) {
      logic.addProfileButtons();
    }
  }
  // === ODIN MODULE INITIALIZATION ===
try {
  const OdinContext = {
    nexus: Nexus,
    getState: () => Odin.state,
    updateState: (fn) => { fn(Odin.state); },
    api: BaseModule._apiModule,
    ui: OdinUserInterface
  };

  if (window.OdinModules && Array.isArray(window.OdinModules)) {
    for (const init of window.OdinModules) {
      try { init(OdinContext); } catch (e) { console.error("Module init failed:", e); }
    }
  }

  Nexus.emit("ODIN_STATE_READY", {});
} catch (e) {
  console.error("Odin module loader error:", e);
}
})();
