# Firestore Connection Setup & Troubleshooting Guide

## What Was Fixed

Your script had **7 critical issues** preventing Firestore connectivity:

### ✅ Fixed Issues:

1. **Firebase SDKs Not Loaded** - Added proper `@require` directives in userscript header
2. **No Firestore Error Handling** - Added try-catch blocks and validation
3. **No Firestore Connection Monitoring** - Added periodic connection testing
4. **Missing Firestore Helper Methods** - Added convenience methods for CRUD operations
5. **No Firestore Usage** - Ready to use, see examples below
6. **Silent Failures** - Added logging and error reporting
7. **Missing Entry Point** - Created main userscript file with proper initialization

---

## Installation

### Option 1: Use the Main Userscript File (Recommended)

1. Install the new file: `odin-faction-tools.user.js`
2. This file automatically loads all Firebase SDKs and modules
3. Open browser console to see initialization logs

### Option 2: Manual Module Loading

If you prefer to load modules individually:

1. Add these `@require` directives to your userscript:

```javascript
// @require https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js
// @require https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js
// @require https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js
// @require https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js
// @require https://www.gstatic.com/firebasejs/9.23.0/firebase-functions-compat.js
```

2. Load modules in this order:
   - `odins-spear-core.js`
   - `NeuralNetwork.js`
   - `FirebaseService.js`
   - All other modules

---

## Testing Firestore Connection

### Step 1: Check Firebase Initialization

Open browser console on `https://www.torn.com` and run:

```javascript
OdinDiagnostics.checkFirebase()
```

**Expected Output:**
```
=== Firebase Diagnostics ===
Firebase SDK loaded: true
Firebase version: 9.23.0
Firebase initialized: true
RTDB connected: true
Firestore ready: true
Auth user: [your-uid] or None
```

### Step 2: Test Firestore Read/Write

```javascript
await OdinDiagnostics.testFirestore()
```

**Expected Output:**
```
=== Testing Firestore Connection ===
✓ Firestore instance obtained
✓ Created test reference
✓ Successfully read from Firestore
  Document exists: true
  Data: { ... }
```

### Step 3: Manual Firestore Test

```javascript
// Get Firebase service
const fb = window.OdinContext.firebase;

// Check if Firestore is ready
console.log('Firestore ready:', fb.isFirestoreReady());

// Try to read a document
const doc = await fb.getDoc('factions', 'test-faction-id');
console.log('Document:', doc);

// Try to write a document
await fb.setDoc('test_collection', 'test_doc', {
  message: 'Hello Firestore!',
  timestamp: Date.now()
});

// Try real-time listener
const unsubscribe = fb.onSnapshot(
  'test_collection',
  'test_doc',
  (data) => console.log('Real-time update:', data),
  (error) => console.error('Listener error:', error)
);

// Stop listening after 10 seconds
setTimeout(() => unsubscribe(), 10000);
```

---

## Using Firestore in Your Code

### Basic Operations

```javascript
const fb = window.OdinContext.firebase;

// Read a document
const faction = await fb.getDoc('factions', 'your-faction-id');

// Write a document
await fb.setDoc('factions', 'your-faction-id', {
  name: 'My Faction',
  members: 50
});

// Update a document
await fb.updateDoc('factions', 'your-faction-id', {
  members: 51
});

// Delete a document
await fb.deleteDoc('factions', 'your-faction-id');

// Query a collection
const allFactions = await fb.queryCollection('factions', (query) => {
  return query.where('members', '>', 40).limit(10);
});

// Real-time listener
const unsubscribe = fb.onSnapshot(
  'factions',
  'your-faction-id',
  (data) => {
    console.log('Faction updated:', data);
  }
);
```

### Advanced Queries

```javascript
// Complex query
const targets = await fb.queryCollection('targets', (query) => {
  return query
    .where('factionId', '==', 'your-faction-id')
    .where('claimed', '==', false)
    .orderBy('score', 'desc')
    .limit(20);
});

// Batch operations
const batch = fb.firestore().batch();
batch.set(fb.doc('targets', 'target1'), { name: 'Player 1' });
batch.set(fb.doc('targets', 'target2'), { name: 'Player 2' });
batch.update(fb.doc('targets', 'target3'), { claimed: true });
await batch.commit();
```

---

## Troubleshooting

### Issue: "Firestore not available" Error

**Cause:** Firestore SDK not loaded

**Solution:**
1. Check browser console for errors during script initialization
2. Verify `@require` directives are present in userscript header
3. Try refreshing the page
4. Check if Tampermonkey/Greasemonkey allows external resources

### Issue: "Permission denied" Error

**Cause:** Firestore security rules blocking access

**Solution:**
1. Authenticate first: `await fb.authenticateWithTorn('your-api-key')`
2. Check Firebase Console > Firestore > Rules
3. Ensure your authentication token has proper claims

**Example Firestore Rules:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their faction data
    match /factions/{factionId} {
      allow read: if request.auth != null &&
                     request.auth.token.factionId == factionId;
      allow write: if request.auth != null &&
                      request.auth.token.factionId == factionId &&
                      request.auth.token.role in ['Leader', 'Developer'];
    }

    // Allow connection test
    match /_connection_test/{document=**} {
      allow read: if request.auth != null;
    }
  }
}
```

### Issue: Firestore connection test fails

**Cause:** Network, authentication, or security rules

**Debug Steps:**
```javascript
// 1. Check if Firebase SDK is loaded
console.log('Firebase:', typeof window.firebase);

// 2. Check if Firestore is initialized
const fb = window.OdinContext.firebase;
console.log('Firestore:', fb.firestore());

// 3. Check authentication
console.log('Auth user:', fb.getCurrentUser());

// 4. Try raw Firestore access
const fs = window.firebase.firestore();
const ref = fs.collection('_test').doc('ping');
ref.get()
  .then(snap => console.log('Success:', snap.exists))
  .catch(err => console.error('Error:', err));
```

### Issue: "Network error" or timeout

**Causes:**
- Firewall blocking Firebase
- Incorrect project configuration
- Network connectivity issues

**Solutions:**
1. Check browser network tab for failed requests
2. Verify Firebase project ID in `FirebaseService.js:19`
3. Test internet connectivity
4. Check if `@connect firestore.googleapis.com` is in userscript header

---

## Events You Can Listen To

The Firebase service now emits these events:

```javascript
const nexus = window.OdinContext.nexus;

// Firestore connection events
nexus.on('FIRESTORE_CONNECTED', (data) => {
  console.log('Firestore connected!', data);
});

nexus.on('FIRESTORE_DISCONNECTED', (data) => {
  console.log('Firestore disconnected:', data.error);
});

// Firebase RTDB events (already existed)
nexus.on('FIREBASE_CONNECTED', (data) => {
  console.log('RTDB connected!', data);
});

nexus.on('FIREBASE_DISCONNECTED', (data) => {
  console.log('RTDB disconnected');
});

// Authentication events
nexus.on('AUTH_STATE_CHANGED', (data) => {
  console.log('Auth changed:', data.user);
});
```

---

## Firebase Service API Reference

### Connection Status

- `fb.isConnected()` - Returns true if RTDB is connected
- `fb.isFirestoreReady()` - Returns true if Firestore is connected and ready

### Firestore Methods

- `fb.firestore()` - Get raw Firestore instance
- `fb.collection(path)` - Get collection reference
- `fb.doc(collectionPath, docId)` - Get document reference
- `fb.getDoc(collectionPath, docId)` - Read document
- `fb.setDoc(collectionPath, docId, data, options)` - Write document
- `fb.updateDoc(collectionPath, docId, data)` - Update document
- `fb.deleteDoc(collectionPath, docId)` - Delete document
- `fb.queryCollection(collectionPath, queryFn)` - Query collection
- `fb.onSnapshot(path, docId, callback, errorCallback)` - Real-time listener

### RTDB Methods (unchanged)

- `fb.rtdb()` - Get RTDB instance
- `fb.ref(path)` - Get RTDB reference

### Authentication

- `fb.authenticateWithTorn(apiKey)` - Authenticate with Torn API key
- `fb.signOut()` - Sign out
- `fb.getCurrentUser()` - Get current user
- `fb.auth()` - Get Auth instance

---

## Migration Checklist

If you want to migrate from RTDB to Firestore:

- [ ] Install updated `odin-faction-tools.user.js`
- [ ] Verify Firestore SDK loads: `OdinDiagnostics.checkFirebase()`
- [ ] Test connection: `await OdinDiagnostics.testFirestore()`
- [ ] Update Firestore security rules in Firebase Console
- [ ] Replace `fb.ref()` calls with `fb.collection()` / `fb.doc()`
- [ ] Replace `.on('value')` with `fb.onSnapshot()`
- [ ] Test all functionality
- [ ] Monitor console for errors

---

## Common Code Patterns

### Before (RTDB):
```javascript
const ref = fb.ref(`factions/${factionId}/targets`);
ref.on('value', (snapshot) => {
  const targets = snapshot.val();
  console.log(targets);
});
```

### After (Firestore):
```javascript
const unsubscribe = fb.onSnapshot('targets', null, (targets) => {
  console.log(targets);
});
```

---

## Support

If issues persist:

1. Check browser console for error messages
2. Run full diagnostics: `OdinDiagnostics.checkFirebase()`
3. Test Firestore: `await OdinDiagnostics.testFirestore()`
4. Check Firebase Console > Firestore > Usage
5. Verify security rules allow your authentication

**Logs Location:**
- All logs prefixed with `[Firebase]` or `[Odin]`
- Check: `window.__ODIN_NET_LOG__` for network diagnostics

---

## Summary

✅ **Firestore is now properly configured and ready to use!**

Key improvements:
- Firebase SDKs auto-load via userscript headers
- Firestore connection is monitored every 30 seconds
- Comprehensive error handling and logging
- Easy-to-use helper methods
- Real-time event listeners
- Full diagnostics suite

Run `OdinDiagnostics.checkFirebase()` to verify everything works!
