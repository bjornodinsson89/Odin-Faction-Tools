/**
 * Odin Tools - Firebase Cloud Functions
 * Gatekeeper authentication for Torn API keys
 */

const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

/**
 * Authenticate a user with their Torn API key
 * Validates the key with Torn API, creates/updates user, and returns custom token
 */
exports.authenticateWithTorn = onCall({
  region: 'us-central1'
}, async (request) => {
  console.log('[Auth] ===== authenticateWithTorn ENTRY =====');
  console.log('[Auth] Request object type:', typeof request);
  console.log('[Auth] Request has data:', !!request.data);

  if (!request.data) {
    console.error('[Auth] CRITICAL: request.data is null or undefined');
    throw new HttpsError('invalid-argument', 'Request data is missing');
  }

  console.log('[Auth] Request data type:', typeof request.data);
  console.log('[Auth] Request data keys:', Object.keys(request.data));
  console.log('[Auth] Has apiKey:', 'apiKey' in request.data);
  console.log('[Auth] apiKey value type:', typeof request.data.apiKey);

  const apiKey = request.data.apiKey;

  if (!apiKey || typeof apiKey !== 'string') {
    console.error('[Auth] Validation failed: Invalid or missing API key');
    throw new HttpsError('invalid-argument', 'Invalid or missing Torn API key');
  }

  const sanitizedKey = apiKey.trim();

  if (sanitizedKey.length !== 16) {
    console.error('[Auth] Invalid API key length:', sanitizedKey.length);
    throw new HttpsError('invalid-argument', 'Torn API key must be exactly 16 characters');
  }

  if (!/^[a-zA-Z0-9]+$/.test(sanitizedKey)) {
    console.error('[Auth] Invalid API key format');
    throw new HttpsError('invalid-argument', 'Torn API key contains invalid characters');
  }

  try {
    console.log('[Auth] Validating Torn API key...');
    const tornEndpoint = `https://api.torn.com/v2/user/?selections=profile,faction&key=${sanitizedKey}`;

    const response = await fetch(tornEndpoint);
    console.log('[Auth] Torn API response status:', response.status);

    if (!response.ok) {
      console.error('[Auth] Torn API HTTP error:', response.status);
      throw new HttpsError('invalid-argument', `Failed to validate Torn API key (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('[Auth] Torn API error:', data.error.code, data.error.error);
      throw new HttpsError('invalid-argument', `Torn API error: ${data.error.error}`);
    }

    const profile = data.profile || data;
    const faction = data.faction || {};

    const playerId = profile.player_id || data.player_id;
    const playerName = profile.name || data.name;
    const playerLevel = profile.level || data.level || 1;
    const factionId = faction.faction_id || data.faction?.faction_id || null;
    const factionName = faction.faction_name || data.faction?.faction_name || null;

    if (!playerId) {
      console.error('[Auth] No player ID in Torn API response');
      throw new HttpsError('internal', 'Failed to get player ID from Torn API');
    }

    console.log(`[Auth] Validated player: ${playerName} (${playerId}) Level ${playerLevel}`);

    const userRef = admin.firestore().collection('users').doc(String(playerId));
    await userRef.set({
      playerId: playerId,
      playerName: playerName,
      level: playerLevel,
      factionId: factionId,
      factionName: factionName,
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('[Auth] User document written');

    if (factionId) {
      const factionMemberRef = admin.firestore()
        .collection('factions')
        .doc(String(factionId))
        .collection('members')
        .doc(String(playerId));

      await factionMemberRef.set({
        playerId: playerId,
        playerName: playerName,
        lastSeen: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log('[Auth] Faction member document written');
    }

    const claims = {
      tornId: String(playerId),
      factionId: factionId ? String(factionId) : null
    };

    const customToken = await admin.auth().createCustomToken(String(playerId), claims);

    console.log('[Auth] Custom token created, authentication successful');

    return {
      success: true,
      token: customToken,
      playerId: playerId,
      playerName: playerName,
      factionId: factionId,
      factionName: factionName
    };

  } catch (error) {
    console.error('[Auth] ERROR:', error.message);
    console.error('[Auth] Error code:', error?.code);
    console.error('[Auth] Stack:', error?.stack);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', `Authentication failed: ${error.message || 'Unknown error'}`);
  }
});

/**
 * Diagnostic HTTP endpoint for manual testing
 */
exports.authenticateWithTornHttp = onRequest({
  region: 'us-central1',
  cors: ['https://www.torn.com', 'https://www2.torn.com', 'https://torn.com']
}, async (req, res) => {
  console.log('[Auth-HTTP] Method:', req.method);
  console.log('[Auth-HTTP] Body:', JSON.stringify(req.body));

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = req.body?.apiKey;

  if (!apiKey || typeof apiKey !== 'string') {
    res.status(400).json({ success: false, error: 'Missing or invalid apiKey' });
    return;
  }

  try {
    const sanitizedKey = apiKey.trim();

    if (sanitizedKey.length !== 16) {
      throw new Error('Torn API key must be exactly 16 characters');
    }

    if (!/^[a-zA-Z0-9]+$/.test(sanitizedKey)) {
      throw new Error('Torn API key contains invalid characters');
    }

    console.log('[Auth-HTTP] Validating Torn API key...');
    const tornEndpoint = `https://api.torn.com/v2/user/?selections=profile,faction&key=${sanitizedKey}`;

    const response = await fetch(tornEndpoint);
    console.log('[Auth-HTTP] Torn API response status:', response.status);

    if (!response.ok) {
      throw new Error(`Failed to validate Torn API key (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.error) {
      res.status(400).json({ success: false, error: `Torn API error: ${data.error.error}` });
      return;
    }

    const profile = data.profile || data;
    const faction = data.faction || {};

    const playerId = profile.player_id || data.player_id;
    const playerName = profile.name || data.name;
    const playerLevel = profile.level || data.level || 1;
    const factionId = faction.faction_id || data.faction?.faction_id || null;
    const factionName = faction.faction_name || data.faction?.faction_name || null;

    if (!playerId) {
      throw new Error('Failed to get player ID from Torn API');
    }

    console.log(`[Auth-HTTP] Validated: ${playerName} (${playerId})`);

    const userRef = admin.firestore().collection('users').doc(String(playerId));
    await userRef.set({
      playerId: playerId,
      playerName: playerName,
      level: playerLevel,
      factionId: factionId,
      factionName: factionName,
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log('[Auth-HTTP] User document written');

    if (factionId) {
      const factionMemberRef = admin.firestore()
        .collection('factions')
        .doc(String(factionId))
        .collection('members')
        .doc(String(playerId));

      await factionMemberRef.set({
        playerId: playerId,
        playerName: playerName,
        lastSeen: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log('[Auth-HTTP] Faction member document written');
    }

    const claims = {
      tornId: String(playerId),
      factionId: factionId ? String(factionId) : null
    };

    const customToken = await admin.auth().createCustomToken(String(playerId), claims);
    console.log('[Auth-HTTP] Authentication successful');

    res.status(200).json({
      success: true,
      token: customToken,
      uid: String(playerId),
      playerId: playerId,
      playerName: playerName,
      factionId: factionId,
      factionName: factionName
    });

  } catch (error) {
    console.error('[Auth-HTTP] Error:', error?.message);

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});
