# Patched file contents

## Odin Tools-2.6.user.js
```javascript
// Odin Tools v2.6 - Userscript
(function () {
  'use strict';

  const DB_NAME = 'odin-tools';
  const DB_VERSION = 1;

  const Utils = {
    escapeHtml(value) {
      if (value === undefined || value === null) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    uuid() {
      if (crypto.randomUUID) {
        return crypto.randomUUID();
      }
      const buffer = new Uint8Array(16);
      crypto.getRandomValues(buffer);
      buffer[6] = (buffer[6] & 0x0f) | 0x40;
      buffer[8] = (buffer[8] & 0x3f) | 0x80;
      const hex = [...buffer].map((b) => b.toString(16).padStart(2, '0'));
      return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
    },
  };

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getFromDB(store, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function setInDB(store, key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.objectStore(store).put(value, key);
    });
  }

  async function clearAllStores() {
    try {
      const db = await openDB();
      const storeNames = Array.from(db.objectStoreNames);
      await Promise.all(
        storeNames.map((name) => {
          try {
            return new Promise((resolve, reject) => {
              const tx = db.transaction(name, 'readwrite');
              tx.oncomplete = () => resolve();
              tx.onerror = () => reject(tx.error);
              tx.objectStore(name).clear();
            });
          } catch (error) {
            console.warn(`Unable to clear store ${name}:`, error);
            return Promise.resolve();
          }
        })
      );
    } catch (error) {
      console.warn('Unable to clear IndexedDB stores:', error);
    }
  }

  class Nexus {
    constructor() {
      this.channels = new Map();
    }

    on(channel, handler) {
      if (!this.channels.has(channel)) this.channels.set(channel, new Set());
      this.channels.get(channel).add(handler);
    }

    emit(channel, payload) {
      if (!this.channels.has(channel)) return;
      for (const handler of this.channels.get(channel)) {
        try {
          handler(payload);
        } catch (error) {
          console.error('Nexus handler error', error);
        }
      }
    }
  }

  class ApiModule {
    constructor(state) {
      this.state = state;
    }

    async fetch(url, options = {}) {
      let callLog = [];
      try {
        const stored = await getFromDB('settings', 'callLog');
        if (Array.isArray(stored)) {
          callLog = stored.filter((value) => Number.isFinite(value));
        }
      } catch (error) {
        console.warn('Unable to read call log from IndexedDB, continuing without throttling data.', error);
      }
      const now = Date.now();
      const windowMs = 1000;
      const limit = 30;
      const recentCalls = callLog.filter((t) => now - t < windowMs);
      if (recentCalls.length >= limit) {
        throw new Error('API call throttled');
      }

      recentCalls.push(now);
      try {
        await setInDB('settings', 'callLog', recentCalls);
      } catch (error) {
        console.warn('Unable to persist call log to IndexedDB.', error);
      }

      const response = await fetch(url, options);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text}`);
      }
      return response.json();
    }
  }

  class AjaxModule {
    async request(url, options = {}) {
      const result = await fetch(url, options);
      const contentType = result.headers.get('content-type') || '';
      if (!result.ok) {
        const errorText = await result.text();
        throw new Error(`Request failed: ${errorText}`);
      }
      if (contentType.includes('application/json')) {
        return result.json();
      }
      return result.text();
    }
  }

  class BaseModule {
    constructor(state) {
      this.state = state;
    }
  }

  class OdinUI {
    constructor(state) {
      this.state = state;
      this.injectStyles();
    }

    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .odin-tools-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 2147483647 !important;
        }
      `;
      document.head.appendChild(style);
    }

    renderTargetTable(targets) {
      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr><th>Name</th><th>Life</th></tr>
        </thead>
        <tbody>
          ${targets
            .map(
              (t) => `
                <tr>
                  <td>${Utils.escapeHtml(t.name)}</td>
                  <td>${Utils.escapeHtml(t.life)}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      `;
      return table;
    }
  }

  class OdinLogic {
    constructor(state, ui) {
      this.state = state;
      this.ui = ui;
      this.nexus = new Nexus();
    }

    init() {
      const container = this.ui.renderTargetTable(this.state.targets || []);
      document.body.appendChild(container);
    }
  }

  async function bootstrap() {
    const state = { targets: [] };
    const ui = new OdinUI(state);
    BaseModule._apiModule = new ApiModule(state);
    BaseModule._ajax = new AjaxModule();
    const logic = new OdinLogic(state, ui);
    if (Array.isArray(window.OdinModules)) {
      for (const moduleFn of window.OdinModules) {
        if (typeof moduleFn === 'function') {
          try {
            moduleFn({ state, api: BaseModule._apiModule, nexus: Nexus, logic });
          } catch (error) {
            console.error('Error running Odin module', error);
          }
        }
      }
    }
    logic.init();
  }

  if (!window.OdinModules) {
    window.OdinModules = [];
  }

  bootstrap().catch((error) => console.error('Bootstrap error', error));
})();
```

## odins-spear-core.js
```javascript
// Odin's Spear Core
(function () {
  'use strict';

  const CORE_ENDPOINT = '/auth/issueauthtoken';

  function getApiKey() {
    const key = localStorage.getItem('tornApiKey');
    if (!key) {
      throw new Error('Missing API key');
    }
    return key;
  }

  class FirebaseAuth {
    constructor(httpClient) {
      this.httpClient = httpClient;
    }

    async mintCustomToken(userId) {
      if (!userId) throw new Error('Missing user id');
      const payload = {
        userId,
        tornApiKey: getApiKey(),
      };
      const response = await this.httpClient.post(CORE_ENDPOINT, payload);
      if (!response || !response.token) {
        throw new Error('Failed to mint custom token');
      }
      return response.token;
    }
  }

  class HttpClient {
    constructor(base = '') {
      this.base = base;
    }

    async post(path, body) {
      const response = await fetch(`${this.base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Auth request failed: ${text}`);
      }
      return response.json();
    }
  }

  window.OdinAuth = { FirebaseAuth, HttpClient };
})();
```

## freki.js
```javascript
// Freki client identification utilities
(function () {
  'use strict';

  async function sha256(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function getClientId(userId) {
    if (userId) {
      return sha256(userId);
    }
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return sha256(`${Date.now()}-${Math.random()}`);
  }

  window.Freki = { getClientId };
})();
```
