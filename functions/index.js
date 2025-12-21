/**
 * Odin Tools - Firebase Cloud Functions (Gatekeeper)
 * - Callable auth: authenticateWithTorn
 * - HTTP auth (manual testing): authenticateWithTornHttp
 *
 * Key points:
 * - Uses Torn API v2 user endpoint to validate the key and extract player/faction.
 * - Mints a Firebase custom token whose UID is the Torn playerId (string).
 * - Adds custom claims: tornId, factionId.
 * - Writes/updates user + faction member documents in Firestore (Admin SDK; bypasses rules).
 */

'use strict';

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();

/* ============================================================
   Helpers
   ============================================================ */

function sanitizeKey(input) {
  const key = String(input || '').trim();
  // Torn keys are commonly 16 alphanumerics, but don't hard-fail if length differs
  // (some tooling uses longer/shorter keys). We still block obviously bad keys.
  if (!key || key.length < 8) return '';
  return key;
}

async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'OdinTools/1.0 (Firebase Functions)',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      throw new Error(`Non-JSON response from Torn (status=${res.status})`);
    }

    if (!res.ok) {
      // Torn may still return JSON with error info; surface it.
      const errMsg = json?.error?.error || json?.error || `HTTP ${res.status}`;
      const errCode = json?.error?.code;
      const msg = typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg);
      const codeStr = (errCode !== undefined && errCode !== null) ? ` (code=${errCode})` : '';
      throw new Error(`Torn HTTP error: ${msg}${codeStr}`);
    }

    return json;
  } catch (e) {
    if (e && (e.name === 'AbortError' || String(e).includes('aborted'))) {
      throw new Error(`Torn request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function extractProfileFaction(data) {
  if (!data || typeof data !== 'object') return { profile: null, faction: null };
  // Torn v2 user selections return { profile: {...}, faction: {...}, ... }
  const profile = data.profile && typeof data.profile === 'object' ? data.profile : null;
  const faction = data.faction && typeof data.faction === 'object' ? data.faction : null;
  return { profile, faction };
}

async function upsertUserAndFactionDocs({ playerId, playerName, playerLevel, factionId, factionName }) {
  const firestore = admin.firestore();

  // users/{uid}
  const userRef = firestore.collection('users').doc(String(playerId));
  await userRef.set({
    tornId: String(playerId),
    name: playerName || null,
    level: Number(playerLevel || 1),
    factionId: factionId ? String(factionId) : null,
    factionName: factionName || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // factions/{factionId}/members/{playerId}
  if (factionId) {
    const memberRef = firestore
      .collection('factions')
      .doc(String(factionId))
      .collection('members')
      .doc(String(playerId));

    await memberRef.set({
      playerId: String(playerId),
      playerName: playerName || null,
      factionId: String(factionId),
      factionName: factionName || null,
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
}

/* ============================================================
   Callable: authenticateWithTorn
   ============================================================ */

exports.authenticateWithTorn = onCall(
  { region: 'us-central1' },
  async (request) => {
    try {
      const data = request?.data || {};
      const key = sanitizeKey(data.apiKey);

      if (!key) {
        throw new HttpsError('invalid-argument', 'Missing or invalid Torn API key');
      }

      const tornEndpoint = `https://api.torn.com/v2/user/?selections=profile,faction&key=${encodeURIComponent(key)}`;
      console.log('[Auth] Torn endpoint (redacted):', tornEndpoint.replace(/key=[^&]+/i, 'key=<redacted>'));

      const tornData = await fetchJsonWithTimeout(tornEndpoint, 15000);

      if (tornData?.error) {
        const msg = tornData.error?.error || 'Torn API error';
        throw new HttpsError('invalid-argument', `Torn API error: ${msg}`);
      }

      const { profile, faction } = extractProfileFaction(tornData);

      const playerId = profile?.id;
      const playerName = profile?.name || null;
      const playerLevel = profile?.level || 1;

      const factionId = faction?.id || null;
      const factionName = faction?.name || null;

      if (!playerId) {
        console.error('[Auth] Missing profile.id in Torn response keys:', Object.keys(profile || {}));
        throw new HttpsError('internal', 'Failed to parse player ID from Torn response');
      }

      // Persist / refresh docs in Firestore (Admin SDK)
      await upsertUserAndFactionDocs({ playerId, playerName, playerLevel, factionId, factionName });

      // Add custom claims. NOTE: Claims are embedded into the custom token at mint time.
      const claims = {
        tornId: String(playerId),
        factionId: factionId ? String(factionId) : null
      };

      const token = await admin.auth().createCustomToken(String(playerId), claims);

      return {
        success: true,
        token,
        playerId: String(playerId),
        playerName,
        factionId: factionId ? String(factionId) : null,
        factionName
      };
    } catch (error) {
      console.error('[Auth] ERROR:', error?.message || String(error));
      console.error('[Auth] STACK:', error?.stack || 'no stack');

      if (error instanceof HttpsError) throw error;

      // Map common failures to clearer codes for the client
      const msg = String(error?.message || 'Unknown error');
      if (msg.toLowerCase().includes('timed out')) {
        throw new HttpsError('deadline-exceeded', msg);
      }
      if (msg.toLowerCase().includes('torn http error') || msg.toLowerCase().includes('torn api error')) {
        throw new HttpsError('invalid-argument', msg);
      }

      throw new HttpsError('internal', `Authentication failed: ${msg}`);
    }
  }
);

/* ============================================================
   HTTP endpoint: authenticateWithTornHttp (manual testing)
   ============================================================ */

exports.authenticateWithTornHttp = onRequest(
  {
    region: 'us-central1',
    cors: ['https://www.torn.com', 'https://www2.torn.com', 'https://torn.com']
  },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
        return;
      }

      const key = sanitizeKey(req?.body?.apiKey);

      if (!key) {
        res.status(400).json({ success: false, error: 'Missing or invalid Torn API key' });
        return;
      }

      const tornEndpoint = `https://api.torn.com/v2/user/?selections=profile,faction&key=${encodeURIComponent(key)}`;
      console.log('[Auth-HTTP] Torn endpoint (redacted):', tornEndpoint.replace(/key=[^&]+/i, 'key=<redacted>'));

      const tornData = await fetchJsonWithTimeout(tornEndpoint, 15000);

      if (tornData?.error) {
        res.status(400).json({ success: false, error: `Torn API error: ${tornData.error?.error || 'unknown'}` });
        return;
      }

      const { profile, faction } = extractProfileFaction(tornData);
      const playerId = profile?.id;
      const playerName = profile?.name || null;
      const playerLevel = profile?.level || 1;
      const factionId = faction?.id || null;
      const factionName = faction?.name || null;

      if (!playerId) {
        res.status(500).json({ success: false, error: 'Failed to parse player ID from Torn response' });
        return;
      }

      await upsertUserAndFactionDocs({ playerId, playerName, playerLevel, factionId, factionName });

      const claims = {
        tornId: String(playerId),
        factionId: factionId ? String(factionId) : null
      };

      const token = await admin.auth().createCustomToken(String(playerId), claims);

      res.status(200).json({
        success: true,
        token,
        playerId: String(playerId),
        playerName,
        factionId: factionId ? String(factionId) : null,
        factionName
      });
    } catch (error) {
      console.error('[Auth-HTTP] Error:', error?.message || String(error));
      res.status(500).json({ success: false, error: error?.message || 'Internal server error' });
    }
  }
);
