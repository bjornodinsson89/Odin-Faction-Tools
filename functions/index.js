/**
 * Odin Tools - Firebase Cloud Functions
 * Gatekeeper authentication for Torn API keys
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

/**
 * Authenticate a user with their Torn API key
 * Validates the key with Torn API, creates/updates user, and returns custom token
 */
exports.authenticateWithTorn = onCall({region: 'us-central1'}, async (request) => {
  const apiKey = request.data.apiKey;

  // Enhanced input validation
  if (!apiKey || typeof apiKey !== 'string') {
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
    // Validate API key with Torn API
    console.log('[Auth] Validating Torn API key...');
    const response = await fetch(`https://api.torn.com/user/?selections=profile,faction&key=${sanitizedKey}`);

    if (!response.ok) {
      throw new HttpsError('invalid-argument', 'Failed to validate Torn API key');
    }

    const data = await response.json();

    // Check for Torn API errors
    if (data.error) {
      console.error('[Auth] Torn API error:', data.error);
      throw new HttpsError('invalid-argument', `Torn API error: ${data.error.error}`);
    }

    const playerId = data.player_id;
    const playerName = data.name;
    const playerLevel = data.level || 1;
    const factionId = data.faction?.faction_id || null;
    const factionName = data.faction?.faction_name || null;

    if (!playerId) {
      throw new HttpsError('internal', 'Failed to get player ID from Torn API');
    }

    console.log(`[Auth] Validated player: ${playerName} (${playerId}) Level ${playerLevel} from faction: ${factionName} (${factionId})`);

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
    }

    // Create custom claims for the token
    const claims = {
      tornId: String(playerId),
      factionId: factionId ? String(factionId) : null
    };

    // Create custom token for Firebase Auth
    const customToken = await admin.auth().createCustomToken(String(playerId), claims);

    console.log(`[Auth] Successfully authenticated player ${playerId}`);

    return {
      success: true,
      token: customToken,
      playerId: playerId,
      playerName: playerName,
      factionId: factionId,
      factionName: factionName
    };

  } catch (error) {
    console.error('[Auth] Authentication error:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', `Authentication failed: ${error.message}`);
  }
});
