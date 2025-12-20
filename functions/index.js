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
  region: 'us-central1',
  cors: ['https://www.torn.com', 'https://www2.torn.com', 'https://torn.com']
}, async (request) => {
  // ===== ENTRY LOGGING =====
  console.log('[Auth] ===== authenticateWithTorn ENTRY =====');
  console.log('[Auth] ===== ENHANCED REQUEST DIAGNOSTICS =====');
  console.log('[Auth] 1. Request Type:', {
    isCallable: true,
    method: 'CALLABLE (not HTTP GET/POST)',
    note: 'This is a Cloud Callable Function, not an HTTP endpoint'
  });
  console.log('[Auth] 2. Request Data:', {
    hasData: !!request.data,
    dataType: typeof request.data,
    dataKeys: request.data ? Object.keys(request.data) : [],
    hasApiKey: !!(request.data && request.data.apiKey),
    apiKeyLength: (request.data && request.data.apiKey) ? request.data.apiKey.length : 0,
    apiKeyType: typeof request.data?.apiKey
  });
  console.log('[Auth] 3. Raw Request Info:', {
    hasRawRequest: !!request.rawRequest,
    rawMethod: request.rawRequest?.method || 'unknown',
    rawUrl: request.rawRequest?.url || 'unknown',
    rawHeaders: request.rawRequest?.headers ? Object.keys(request.rawRequest.headers) : [],
    contentType: request.rawRequest?.headers?.['content-type'] || 'unknown'
  });
  console.log('[Auth] 4. Auth Context:', {
    hasAuth: !!request.auth,
    isAuthenticated: !!request.auth?.uid,
    uid: request.auth?.uid || 'none (expected for initial auth)'
  });

  const apiKey = request.data.apiKey;

  // Enhanced input validation
  if (!apiKey || typeof apiKey !== 'string') {
    console.error('[Auth] Validation failed: Invalid or missing API key');
    throw new HttpsError('invalid-argument', 'Invalid or missing Torn API key');
  }

  // Sanitize and validate API key format
  const sanitizedKey = apiKey.trim();

  // Torn API keys are 16 characters, alphanumeric
  if (sanitizedKey.length !== 16) {
    throw new HttpsError('invalid-argument', 'Torn API key must be exactly 16 characters');
  }

  // Check for valid characters (alphanumeric only)
  if (!/^[a-zA-Z0-9]+$/.test(sanitizedKey)) {
    throw new HttpsError('invalid-argument', 'Torn API key contains invalid characters');
  }

  try {
    // Validate API key with Torn API v2
    console.log('[Auth] Validating Torn API key...');
    const tornEndpoint = `https://api.torn.com/v2/user/?selections=profile,faction&key=${sanitizedKey}`;
    console.log('[Auth] Calling Torn API v2 endpoint:', tornEndpoint.replace(sanitizedKey, '[REDACTED]'));

    const response = await fetch(tornEndpoint);

    console.log('[Auth] Torn API response status:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      console.error('[Auth] Torn API HTTP error:', {
        status: response.status,
        statusText: response.statusText
      });
      throw new HttpsError('invalid-argument', `Failed to validate Torn API key (HTTP ${response.status})`);
    }

    const data = await response.json();

    // Check for Torn API errors
    if (data.error) {
      console.error('[Auth] Torn API error:', {
        code: data.error.code,
        message: data.error.error
      });
      throw new HttpsError('invalid-argument', `Torn API error: ${data.error.error}`);
    }

    // Parse v2 response structure with backward compatibility
    // v2 structure: data.profile and data.faction
    // v1 structure: direct fields (backward compatibility)
    const profile = data.profile || data;
    const faction = data.faction || {};

    const playerId = profile.player_id || data.player_id;
    const playerName = profile.name || data.name;
    const playerLevel = profile.level || data.level || 1;
    const factionId = faction.faction_id || data.faction?.faction_id || null;
    const factionName = faction.faction_name || data.faction?.faction_name || null;

    if (!playerId) {
      throw new HttpsError('internal', 'Failed to get player ID from Torn API');
    }

    console.log(`[Auth] Validated player: ${playerName} (${playerId}) Level ${playerLevel} from faction: ${factionName} (${factionId})`);

    // ===== BEFORE DB WRITE =====
    console.log('[Auth] ===== BEFORE DATABASE WRITES =====');
    console.log('[Auth] Writing to Firestore:', {
      collection: 'users',
      docId: String(playerId),
      playerName: playerName,
      level: playerLevel,
      factionId: factionId
    });

    // Create or update user in Firestore
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

    console.log('[Auth] ✓ User document written successfully');

    // Update faction member list if in a faction
    if (factionId) {
      console.log('[Auth] Writing faction member:', {
        collection: `factions/${factionId}/members`,
        docId: String(playerId)
      });

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

      console.log('[Auth] ✓ Faction member document written successfully');
    }

    // ===== AFTER DB WRITE =====
    console.log('[Auth] ===== DATABASE WRITES COMPLETED =====');

    // Create custom claims for the token
    const claims = {
      tornId: String(playerId),
      factionId: factionId ? String(factionId) : null
    };

    // Create custom token for Firebase Auth
    const customToken = await admin.auth().createCustomToken(String(playerId), claims);

    console.log(`[Auth] ✓ Custom token created successfully`);
    console.log('[Auth] ===== AUTHENTICATION SUCCESSFUL =====');
    console.log(`[Auth] Returning success response for player ${playerId}`);

    return {
      success: true,
      token: customToken,
      playerId: playerId,
      playerName: playerName,
      factionId: factionId,
      factionName: factionName
    };

  } catch (error) {
    // Log only safe properties to avoid circular reference errors
    console.error('[Auth] Authentication error:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', `Authentication failed: ${error.message}`);
  }
});

/**
 * DIAGNOSTIC HTTP ENDPOINT (for manual testing with curl/Postman)
 *
 * This is NOT used by the userscript client.
 * The userscript MUST use the callable function above.
 *
 * Usage with curl:
 * curl -X POST https://us-central1-torn-war-room.cloudfunctions.net/authenticateWithTornHttp \
 *   -H "Content-Type: application/json" \
 *   -d '{"apiKey":"YOUR_16_CHAR_KEY"}'
 */
exports.authenticateWithTornHttp = onRequest({
  region: 'us-central1',
  cors: ['https://www.torn.com', 'https://www2.torn.com', 'https://torn.com']
}, async (req, res) => {
  console.log('[Auth-HTTP] ===== HTTP DIAGNOSTIC ENDPOINT CALLED =====');
  console.log('[Auth-HTTP] Method:', req.method);
  console.log('[Auth-HTTP] Headers:', JSON.stringify(req.headers));
  console.log('[Auth-HTTP] Body:', JSON.stringify(req.body));

  // Only accept POST
  if (req.method !== 'POST') {
    console.error('[Auth-HTTP] Invalid method:', req.method);
    res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
      note: 'This is a diagnostic endpoint. Userscripts should use the callable function, not this HTTP endpoint.'
    });
    return;
  }

  // Parse API key from request body
  const apiKey = req.body?.apiKey;

  if (!apiKey || typeof apiKey !== 'string') {
    console.error('[Auth-HTTP] Missing or invalid apiKey in request body');
    res.status(400).json({
      success: false,
      error: 'Missing or invalid apiKey in request body',
      expectedFormat: { apiKey: 'YOUR_16_CHAR_KEY' }
    });
    return;
  }

  try {
    // Validate API key format
    const sanitizedKey = apiKey.trim();

    if (sanitizedKey.length !== 16) {
      throw new Error('Torn API key must be exactly 16 characters');
    }

    if (!/^[a-zA-Z0-9]+$/.test(sanitizedKey)) {
      throw new Error('Torn API key contains invalid characters');
    }

    // Validate with Torn API v2
    console.log('[Auth-HTTP] Validating Torn API key...');
    const tornEndpoint = `https://api.torn.com/v2/user/?selections=profile,faction&key=${sanitizedKey}`;
    console.log('[Auth-HTTP] Calling Torn API v2 endpoint:', tornEndpoint.replace(sanitizedKey, '[REDACTED]'));

    const response = await fetch(tornEndpoint);

    console.log('[Auth-HTTP] Torn API response status:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      console.error('[Auth-HTTP] Torn API HTTP error:', {
        status: response.status,
        statusText: response.statusText
      });
      throw new Error(`Failed to validate Torn API key (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('[Auth-HTTP] Torn API error:', {
        code: data.error.code,
        message: data.error.error
      });
      res.status(400).json({
        success: false,
        error: `Torn API error: ${data.error.error}`,
        tornErrorCode: data.error.code
      });
      return;
    }

    // Parse v2 response structure with backward compatibility
    // v2 structure: data.profile and data.faction
    // v1 structure: direct fields (backward compatibility)
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

    console.log(`[Auth-HTTP] Validated: ${playerName} (${playerId}) Level ${playerLevel} from faction: ${factionName} (${factionId})`);

    // Create or update user in Firestore
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

    console.log('[Auth-HTTP] ✓ User document written');

    // Update faction member list if in a faction
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

      console.log('[Auth-HTTP] ✓ Faction member document written');
    }

    // Create custom claims for the token
    const claims = {
      tornId: String(playerId),
      factionId: factionId ? String(factionId) : null
    };

    // Create custom token
    const customToken = await admin.auth().createCustomToken(String(playerId), claims);

    console.log('[Auth-HTTP] ✓ Custom token created');
    console.log('[Auth-HTTP] ===== AUTHENTICATION SUCCESSFUL =====');

    // Return success response
    res.status(200).json({
      success: true,
      token: customToken,
      uid: String(playerId),
      playerId: playerId,
      playerName: playerName,
      factionId: factionId,
      factionName: factionName,
      note: 'Authentication successful. This diagnostic endpoint returns the same data as the callable function.'
    });

  } catch (error) {
    console.error('[Auth-HTTP] Error:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });

    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      note: 'This is a diagnostic endpoint. Check server logs for details.'
    });
  }
});
