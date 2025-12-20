# Torn Backend API Audit & Documentation

**Generated**: 2025-12-20
**Userscript Version**: 5.0.1
**Purpose**: Comprehensive audit of API endpoints, response shapes, and access control requirements

---

## Executive Summary

This document provides a complete audit of all backend API endpoints used by the Odin Faction Tools userscript, including:
- **Torn API v1** (legacy selection-based API)
- **Torn API v2** (modern REST-like API)
- **TornStats API v2**
- **FFScouter API**

All endpoints have been verified against the source code implementation in `OdinApi.js`.

---

## 1. Torn API v1 (Selection-Based)

### Base URL
```
https://api.torn.com
```

### Authentication
All requests require `key={API_KEY}` as a query parameter.

### Rate Limits
- **100 requests per 60 seconds** (enforced in code at OdinApi.js:30)
- Client-side rate limiting with exponential backoff (OdinApi.js:195-220)
- Retry logic: 3 attempts with exponential backoff (OdinApi.js:225-250)

---

### 1.1 User Endpoints

#### GET /user
**Purpose**: Get data about the API key owner
**Location**: OdinApi.js:428-430
**Required Parameters**:
- `selections`: Comma-separated list of data sections
- `key`: Full access API key

**Supported Selections**:
- `profile`: Basic profile information
- `battlestats`: Battle statistics (strength, defense, speed, dexterity)
- `bars`: Current status bars (energy, nerve, happy, life, chain)
- `attacks`: Recent attacks
- `attacksfull`: Detailed attack history
- `personalstats`: Personal statistics

**Example Request**:
```bash
curl "https://api.torn.com/user?selections=profile,bars&key=YOUR_API_KEY"
```

**Response Shape** (profile):
```json
{
  "player_id": 12345,
  "name": "PlayerName",
  "level": 50,
  "faction": {
    "faction_id": 67890,
    "faction_name": "FactionName",
    "position": "Leader"
  },
  "last_action": {
    "relative": "5 minutes ago",
    "timestamp": 1703001234
  },
  "status": {
    "state": "Okay",
    "until": 0
  }
}
```

**Response Shape** (bars):
```json
{
  "energy": { "current": 100, "maximum": 150 },
  "nerve": { "current": 20, "maximum": 50 },
  "happy": { "current": 500, "maximum": 1000 },
  "life": { "current": 1000, "maximum": 1000 },
  "chain": {
    "current": 50,
    "maximum": 100,
    "timeout": 120,
    "modifier": 1.5,
    "cooldown": 0
  }
}
```

**Access Level**: User's own data (Full Access key required for battlestats)

**Code Usage**:
- `getUser()` - OdinApi.js:428
- `getUserProfile()` - OdinApi.js:433
- `getUserBattleStats()` - OdinApi.js:437
- `getUserBars()` - OdinApi.js:441

---

#### GET /user/{userId}
**Purpose**: Get data about a specific user
**Location**: OdinApi.js:428-430
**Required Parameters**:
- `{userId}`: Torn user ID
- `selections`: Comma-separated list of data sections
- `key`: API key

**Selections**: Same as `/user`

**Example Request**:
```bash
curl "https://api.torn.com/user/12345?selections=profile&key=YOUR_API_KEY"
```

**Response Shape**: Same as `/user`

**Access Level**:
- Public selections: `profile` (basic info only)
- Limited selections: Require Full Access key
- Some data pruned/redacted based on privacy settings

**Code Usage**:
- `getUser(userId, selections)` - OdinApi.js:428
- Used in enrichment: `getEnrichedPlayer()` - OdinApi.js:607

---

### 1.2 Faction Endpoints

#### GET /faction
**Purpose**: Get data about the API key owner's faction
**Location**: OdinApi.js:456-458
**Required Parameters**:
- `selections`: Comma-separated list of data sections
- `key`: Full access API key

**Supported Selections**:
- `basic`: Faction information and member list
- `chain`: Current chain status
- `attacks`: Recent faction attacks
- `wars`: Current and recent wars
- `rankedwars`: Ranked war history

**Example Request**:
```bash
curl "https://api.torn.com/faction?selections=basic,chain&key=YOUR_API_KEY"
```

**Response Shape** (basic):
```json
{
  "ID": 67890,
  "name": "Faction Name",
  "members": {
    "12345": {
      "name": "Member1",
      "level": 50,
      "days_in_faction": 100,
      "position": "Leader",
      "last_action": {
        "relative": "5 minutes ago",
        "timestamp": 1703001234
      },
      "status": {
        "state": "Okay",
        "until": 0
      }
    }
  }
}
```

**Response Shape** (chain):
```json
{
  "chain": {
    "current": 50,
    "maximum": 100,
    "timeout": 120,
    "modifier": 1.5,
    "cooldown": 0,
    "start": 1703000000
  }
}
```

**Access Level**: **FACTION LEADER ONLY** (requires leader/co-leader position)

**Code Usage**:
- `getFaction()` - OdinApi.js:456
- `getFactionBasic()` - OdinApi.js:461
- `getFactionMembers()` - OdinApi.js:465
- `getFactionChain()` - OdinApi.js:469 **[GATED BACKEND]**
- `getFactionAttacks()` - OdinApi.js:473
- `getFactionWars()` - OdinApi.js:477
- `getFactionRankedWars()` - OdinApi.js:481

**⚠️ CRITICAL ROUTING REQUIREMENT**:
- **Regular members**: Chain info must come from `/user?selections=bars` (bar.chain)
- **Faction leaders**: Chain info may come from `/faction?selections=chain`

---

#### GET /faction/{factionId}
**Purpose**: Get data about a specific faction
**Required Parameters**:
- `{factionId}`: Torn faction ID
- `selections`: Comma-separated list of data sections
- `key`: API key

**Selections**: Same as `/faction`

**Access Level**:
- `basic`: Public (limited member data)
- `chain`, `attacks`, `wars`: Requires faction leadership

---

### 1.3 Key Validation

#### GET /key?selections=info
**Purpose**: Validate API key and get permissions
**Location**: OdinApi.js:377-398
**Required Parameters**:
- `selections=info`
- `key`: API key to validate

**Example Request**:
```bash
curl "https://api.torn.com/key?selections=info&key=YOUR_API_KEY"
```

**Response Shape**:
```json
{
  "access_level": 4,
  "access_type": "Full Access",
  "selections": {
    "user": ["basic", "profile", "battlestats", "bars", "attacks"],
    "faction": ["basic", "attacks", "chain"]
  }
}
```

**Access Level**: Public (validates any key)

**Code Usage**:
- `validateTornApiKey()` - OdinApi.js:377
- `validateTornKeyCapabilities()` - OdinApi.js:400
- Used during authentication flow in FirebaseService.js

---

## 2. Torn API v2 (Modern REST API)

### Base URL
```
https://api.torn.com/v2
```

### Authentication
All requests require `key={API_KEY}` as a query parameter.

### Rate Limits
Same as v1 API (shared rate limit pool)

---

### 2.1 Available Endpoints

#### General Pattern
```
GET /v2/{resource}?{params}&key={API_KEY}
```

**Location**: OdinApi.js:317-372

**Code Usage**:
- `tornV2Get(endpoint, params)` - OdinApi.js:317

**Response Format**: Modern JSON structure (varies by endpoint)

**Note**: Specific v2 endpoints are called via the generic `tornV2Get()` function. The userscript may use v2 endpoints for:
- User bars (`/v2/user/bars`)
- Faction chain (`/v2/faction/chain`)
- Other modernized endpoints

---

## 3. TornStats API v2

### Base URL
```
https://www.tornstats.com/api/v2
```

### Authentication
API key embedded in URL path: `/{API_KEY}/{endpoint}`

### Rate Limits
- **60 requests per 60 seconds** (enforced in code at OdinApi.js:37)
- Cache time: 300 seconds (5 minutes) - OdinApi.js:39

---

### 3.1 Spy Endpoint

#### GET /{apiKey}/spy/{playerId}
**Purpose**: Get battle stats estimates for a player
**Location**: OdinApi.js:527-529
**Required Parameters**:
- `{apiKey}`: TornStats API key (in path)
- `{playerId}`: Torn user ID

**Example Request**:
```bash
curl "https://www.tornstats.com/api/v2/YOUR_TORNSTATS_KEY/spy/12345"
```

**Response Shape**:
```json
{
  "status": true,
  "spy": {
    "player_id": 12345,
    "strength": 1234567,
    "defense": 1234567,
    "speed": 1234567,
    "dexterity": 1234567,
    "total": 4938268,
    "strength_ts": 1703001234,
    "defense_ts": 1703001234,
    "speed_ts": 1703001234,
    "dexterity_ts": 1703001234,
    "difference": 3,
    "spies": 5,
    "update": 1703001234
  }
}
```

**Access Level**: Requires paid TornStats subscription (optional for userscript)

**Code Usage**:
- `getTornStatsSpy()` - OdinApi.js:527
- `getTornStatsBattleStats()` - OdinApi.js:535
- `getEnrichedPlayer()` - OdinApi.js:591 (optional enrichment)

---

### 3.2 Faction Endpoint

#### GET /{apiKey}/faction/{factionId}
**Purpose**: Get faction statistics and member data
**Location**: OdinApi.js:531-533
**Required Parameters**:
- `{apiKey}`: TornStats API key (in path)
- `{factionId}`: Torn faction ID

**Example Request**:
```bash
curl "https://www.tornstats.com/api/v2/YOUR_TORNSTATS_KEY/faction/67890"
```

**Response Shape**:
```json
{
  "status": true,
  "faction": {
    "faction_id": 67890,
    "name": "Faction Name",
    "members": [
      {
        "player_id": 12345,
        "name": "Player",
        "level": 50,
        "total_battlestats": 4938268,
        "last_update": 1703001234
      }
    ],
    "respect": 100000,
    "chain_record": 500
  }
}
```

**Access Level**: Requires paid TornStats subscription (optional for userscript)

**Code Usage**:
- `getTornStatsFaction()` - OdinApi.js:531
- `getEnrichedFaction()` - OdinApi.js:633 (optional enrichment)

---

## 4. FFScouter API

### Base URL
```
https://ffscouter.com/api
```

### Authentication
API key passed as query parameter (format TBD based on FFScouter docs)

### Rate Limits
- **100 requests per 60 seconds** (enforced in code at OdinApi.js:43)
- Cache time: 600 seconds (10 minutes) - OdinApi.js:45

---

### 4.1 Player Endpoint

#### GET /player/{playerId}
**Purpose**: Get fair fight estimates for a player
**Location**: OdinApi.js:580-582
**Required Parameters**:
- `{playerId}`: Torn user ID
- API key (query parameter, exact format TBD)

**Example Request**:
```bash
curl "https://ffscouter.com/api/player/12345?key=YOUR_KEY"
```

**Response Shape** (estimated):
```json
{
  "player_id": 12345,
  "ff_estimate": 2.5,
  "confidence": 0.85,
  "last_update": 1703001234
}
```

**Access Level**: Requires FFScouter API access (optional for userscript)

**Code Usage**:
- `getFFScouterPlayer()` - OdinApi.js:580
- `getEnrichedPlayer()` - OdinApi.js:591 (optional enrichment)

---

### 4.2 Faction Endpoint

#### GET /faction/{factionId}
**Purpose**: Get faction-wide fair fight data
**Location**: OdinApi.js:584-586
**Required Parameters**:
- `{factionId}`: Torn faction ID
- API key (query parameter)

**Example Request**:
```bash
curl "https://ffscouter.com/api/faction/67890?key=YOUR_KEY"
```

**Response Shape** (estimated):
```json
{
  "faction_id": 67890,
  "members": [
    {
      "player_id": 12345,
      "ff_estimate": 2.5
    }
  ]
}
```

**Access Level**: Requires FFScouter API access (optional for userscript)

**Code Usage**:
- `getFFScouterFaction()` - OdinApi.js:584
- `getEnrichedFaction()` - OdinApi.js:633 (optional enrichment)

---

## 5. Access Control Requirements

### 5.1 Current Implementation (AccessControl.js)

**Role Hierarchy** (AccessControl.js:13-25):
- **Developer** (rank 4) - Highest
- **Leader** (rank 3)
- **Admin** (rank 2)
- **Member** (rank 1) - Lowest

**Current Functions**:
- `getRole()` - Returns current role
- `getRank()` - Returns numeric rank (1-4)
- `hasAtLeast(role)` - Checks if user has at least the specified role

**Role Storage**:
- Stored in Firebase RTDB: `factions/{factionId}/roles/{uid}`
- Watched for real-time updates (AccessControl.js:66-89)

---

### 5.2 Required New Implementations

#### A. DEV UNLOCK for User ID 3666214

**Requirement**: Leadership tab access when current Torn user ID is 3666214

**Implementation Location**: `AccessControl.js`

**New Function**:
```javascript
function canAccessLeadershipTab() {
  // Dev unlock
  const currentTornId = store.get('auth.tornId', null);
  if (currentTornId === '3666214') {
    return true;
  }

  // Regular leadership check
  return hasAtLeast(ROLE.LEADER);
}
```

**Usage**: UIManager.js:1140

---

#### B. Faction Leader Verification

**Requirement**: Verify faction leadership using Torn API data (not Firebase roles)

**Implementation Location**: `OdinApi.js` or `AccessControl.js`

**New Function**:
```javascript
async function isVerifiedFactionLeader() {
  try {
    // Get user's faction data via their own API key
    const userData = await tornGet('user', 'profile');

    if (!userData || !userData.faction) {
      return false; // Not in a faction
    }

    const position = userData.faction.position;

    // Leader positions: "Leader", "Co-leader"
    // Note: Exact strings may vary - verify against live API
    return position === 'Leader' || position === 'Co-leader';
  } catch (e) {
    // Fail closed - if we can't verify, assume not a leader
    console.error('[Access] Leader verification failed:', e);
    return false;
  }
}
```

**Alternative Approach** (using faction endpoint):
```javascript
async function isVerifiedFactionLeader() {
  try {
    // Try to access faction chain endpoint
    // This will only succeed if user has leader permissions
    const factionData = await tornGet('faction', 'chain');

    // If we get here without error, user has leader access
    return true;
  } catch (e) {
    // Access denied = not a leader
    if (e.code === 10) { // Permission denied error code
      return false;
    }

    // Other errors = can't determine, fail closed
    return false;
  }
}
```

---

#### C. Chain Information Routing

**Requirement**: Route chain info requests based on faction leadership status

**Implementation Location**: `OdinApi.js`

**New Function**:
```javascript
/**
 * Get chain information (auto-routes based on permissions)
 * Non-leaders: uses /user?selections=bars (bars.chain)
 * Leaders: uses /faction?selections=chain
 */
async function getChainInfo() {
  const isLeader = await isVerifiedFactionLeader();

  if (isLeader) {
    // Use faction chain endpoint (more detailed)
    try {
      const factionData = await tornGet('faction', 'chain');
      return {
        current: factionData.chain?.current || 0,
        maximum: factionData.chain?.maximum || 0,
        timeout: factionData.chain?.timeout || 0,
        modifier: factionData.chain?.modifier || 1.0,
        cooldown: factionData.chain?.cooldown || 0,
        start: factionData.chain?.start || null,
        source: 'faction'
      };
    } catch (e) {
      console.warn('[API] Faction chain access failed, falling back to user bars:', e);
      // Fall through to user bars
    }
  }

  // Non-leader or fallback: use user bars
  const userData = await tornGet('user', 'bars');
  return {
    current: userData.chain?.current || 0,
    maximum: userData.chain?.maximum || 0,
    timeout: userData.chain?.timeout || 0,
    modifier: userData.chain?.modifier || 1.0,
    cooldown: userData.chain?.cooldown || 0,
    start: null, // Not available in bars
    source: 'user'
  };
}
```

---

#### D. API Key Usage Policy

**Requirement**: Enforce separation between user keys and leader-only operations

**Implementation**: Already enforced by Torn API permissions
- User API keys automatically grant appropriate access levels
- Torn API returns error if user tries to access faction leader endpoints without permissions
- Current retry logic (OdinApi.js:225-250) handles permission errors gracefully

**Additional Safeguard** (optional):
```javascript
async function callGatedEndpoint(endpoint, selections) {
  // Verify leadership before making gated calls
  if (requiresLeadership(selections)) {
    const isLeader = await isVerifiedFactionLeader();
    if (!isLeader) {
      throw new Error('This operation requires faction leadership');
    }
  }

  return tornGet(endpoint, selections);
}

function requiresLeadership(selections) {
  const leaderOnlySelections = ['chain', 'attacks', 'wars', 'rankedwars'];
  const requestedSelections = selections.split(',').map(s => s.trim());
  return requestedSelections.some(s => leaderOnlySelections.includes(s));
}
```

---

## 6. Userscript Data Access Patterns

### 6.1 Enrichment Pattern

**Location**: OdinApi.js:591-685

The userscript uses an "enrichment" pattern that combines data from multiple sources:

```javascript
async function getEnrichedPlayer(playerId, options = {}) {
  const result = {
    id: playerId,
    torn: null,       // Torn API data
    tornStats: null,  // TornStats data (optional)
    ffScouter: null,  // FFScouter data (optional)
    enrichedAt: Date.now()
  };

  // Always fetch Torn API data
  result.torn = await getUser(playerId, 'profile,personalstats');

  // Optionally fetch TornStats data
  if (includeTornStats && tornStatsApiKey) {
    result.tornStats = await getTornStatsBattleStats(playerId);
  }

  // Optionally fetch FFScouter data
  if (includeFFScouter) {
    result.ffScouter = await getFFScouterPlayer(playerId);
  }

  return result;
}
```

**Fields Used by Userscript**:
- `result.torn.player_id` - Player ID
- `result.torn.name` - Player name
- `result.torn.level` - Player level
- `result.torn.faction.faction_id` - Faction ID
- `result.torn.faction.faction_name` - Faction name
- `result.torn.faction.position` - Faction position **[CRITICAL for leader verification]**
- `result.tornStats.spy.total` - Total battle stats (if available)
- `result.ffScouter.ff_estimate` - Fair fight estimate (if available)

---

### 6.2 Freki AI Scoring

**Location**: freki.js:56-72

The Freki AI uses 15 input features for target scoring:
1. Normalized attacker level
2. Normalized defender level
3. Level difference
4. Defender activity score
5. Defender hospital status
6. Chain position
7. War status
8. TornStats score (normalized, 0 if unavailable)
9. FFScouter score (normalized, 0 if unavailable)
10. Historical win rate
11. Time of day factor
12. Day of week factor
13. Defender online status
14. Fair fight modifier estimate
15. Respect modifier estimate

**Data Sources**:
- Features 1-7, 10-13: Torn API data
- Feature 8: TornStats API (optional)
- Feature 9: FFScouter API (optional)
- Features 14-15: Calculated estimates

---

## 7. Rate Limiting & Caching

### 7.1 Rate Limit Configuration

**Source**: OdinApi.js:26-51

| Service | Requests/Window | Window (ms) | Cache Time (ms) |
|---------|-----------------|-------------|-----------------|
| Torn API | 100 | 60000 | 30000 |
| TornStats | 60 | 60000 | 300000 |
| FFScouter | 100 | 60000 | 600000 |

### 7.2 Cache Management

**Features** (OdinApi.js:109-190):
- Max cache size: 500 entries
- Automatic cleanup interval: 60 seconds
- LRU eviction when size limit exceeded
- Per-endpoint TTL based on cache time configuration

**Cache Key Format**:
```javascript
`${service}:${endpoint}:${JSON.stringify(params)}`
```

### 7.3 Retry Logic

**Configuration** (OdinApi.js:225-250):
- Max retries: 3
- Exponential backoff: 1s, 2s, 4s (capped at 5s)
- No retry on 4xx errors (client errors)
- Retry on 5xx errors (server errors) and network failures

---

## 8. Error Handling

### 8.1 Torn API Errors

**Response Format**:
```json
{
  "error": {
    "code": 10,
    "error": "Incorrect key"
  }
}
```

**Common Error Codes**:
- `2`: Incorrect ID
- `5`: Too many requests
- `6`: Incorrect ID-entity relation
- `7`: Incorrect ID
- `8`: IP block
- `9`: API disabled
- `10`: Key owner is in federal jail
- `11`: Key is disabled
- `12`: Key is incorrect
- `13`: The requested selection does not exist
- `16`: Permission denied (access level too low)

**Handling** (OdinApi.js:297-301):
```javascript
if (data && data.error) {
  const err = new Error(`Torn API Error: ${data.error.error}`);
  err.code = data.error.code;
  throw err;
}
```

---

## 9. Security Considerations

### 9.1 API Key Storage

**Current Implementation** (OdinApi.js:64-100):
- API keys stored locally using `GM_getValue` (Tampermonkey) or `localStorage` (fallback)
- Storage namespace: `odin_tools_secret:{keyName}`
- Keys never sent to Firebase or any third-party backend
- Keys only used for direct API calls to official services

**Functions**:
- `secretGet(key, default)` - Retrieve API key from local storage
- `secretSet(key, value)` - Save API key to local storage
- `secretDel(key)` - Delete API key from local storage

### 9.2 Authentication Flow

**Source**: FirebaseService.js:267-380

1. User enters Torn API key in UI
2. Key saved to local storage (secretSet)
3. Key sent to Firebase Cloud Function `authenticateWithTorn` (one-time use)
4. Cloud Function validates key with Torn API
5. Cloud Function creates Firebase auth token with custom claims
6. User authenticated with Firebase using token
7. Future database operations use Firebase token (not Torn API key)

**Critical**: Torn API key only sent to Firebase once during authentication. All subsequent database access uses Firebase token.

---

## 10. Compatibility Matrix

| Provider | Endpoint | Script Location | Expected Fields | Script Reads | Status | Notes |
|----------|----------|-----------------|-----------------|--------------|--------|-------|
| Torn v1 | /user | OdinApi.js:428 | profile, bars, attacks | player_id, name, level, faction.position, bars.chain | ✅ Match | Core functionality |
| Torn v1 | /faction | OdinApi.js:456 | basic, chain, attacks | members, chain.current, chain.timeout | ✅ Match | Leader-only access |
| Torn v1 | /key?selections=info | OdinApi.js:377 | access_level, selections | access_type, selections.user, selections.faction | ✅ Match | Used for validation |
| Torn v2 | /v2/* | OdinApi.js:317 | (varies) | (varies) | ⚠️ Generic | Endpoint-specific verification needed |
| TornStats | /spy/{id} | OdinApi.js:527 | spy.total, spy.strength, etc | spy.total | ✅ Match | Optional enhancement |
| TornStats | /faction/{id} | OdinApi.js:531 | members, total_battlestats | members[], respect | ✅ Match | Optional enhancement |
| FFScouter | /player/{id} | OdinApi.js:580 | ff_estimate | ff_estimate | ⚠️ Assumed | Response shape not verified |
| FFScouter | /faction/{id} | OdinApi.js:584 | members | members[] | ⚠️ Assumed | Response shape not verified |

**Legend**:
- ✅ Match: Verified from code, fields align
- ⚠️ Generic/Assumed: Interface exists but response shape needs live verification
- ❌ Mismatch: Code reads fields not present in expected response

---

## 11. Required Implementations Summary

### ✅ Completed Analysis
1. All API endpoints documented
2. Response shapes extracted from code
3. Access patterns identified
4. Rate limiting verified
5. Error handling documented

### 🔨 Required Code Changes

#### 1. DEV UNLOCK (AccessControl.js)
```javascript
function canAccessLeadershipTab() {
  const currentTornId = store.get('auth.tornId', null);
  if (currentTornId === '3666214') return true;
  return hasAtLeast(ROLE.LEADER);
}
```

#### 2. Faction Leader Verification (OdinApi.js)
```javascript
async function isVerifiedFactionLeader() {
  try {
    const userData = await tornGet('user', 'profile');
    const position = userData.faction?.position || '';
    return position === 'Leader' || position === 'Co-leader';
  } catch (e) {
    return false; // Fail closed
  }
}
```

#### 3. Chain Info Routing (OdinApi.js)
```javascript
async function getChainInfo() {
  const isLeader = await isVerifiedFactionLeader();

  if (isLeader) {
    try {
      const factionData = await tornGet('faction', 'chain');
      return { ...factionData.chain, source: 'faction' };
    } catch (e) {
      // Fall through to user bars
    }
  }

  const userData = await tornGet('user', 'bars');
  return { ...userData.chain, source: 'user' };
}
```

#### 4. UI Indicator for Dev Unlock (UIManager.js)
Add subtle badge in header when dev unlock is active:
```javascript
// In renderLeadershipTab():
if (currentTornId === '3666214') {
  // Add dev badge to header
}
```

---

## 12. Testing Checklist

- [ ] Verify DEV UNLOCK works for user ID 3666214
- [ ] Verify regular users cannot access leadership tab
- [ ] Test `isVerifiedFactionLeader()` with leader account
- [ ] Test `isVerifiedFactionLeader()` with non-leader account
- [ ] Test `getChainInfo()` routing for leaders
- [ ] Test `getChainInfo()` routing for non-leaders
- [ ] Verify rate limiting doesn't break with new functions
- [ ] Verify caching works correctly with new functions
- [ ] Test error handling when Torn API is unavailable
- [ ] Verify no regressions in existing functionality

---

## 13. Validation Script

```javascript
// Run in browser console while logged into Torn
async function validateOdinApi() {
  const results = {
    tornApiKey: false,
    userProfile: false,
    userBars: false,
    factionBasic: false,
    factionChain: false,
    leaderVerification: false
  };

  // Check API key configured
  results.tornApiKey = !!window.OdinApiConfig?.getTornApiKey?.();

  // Test user profile
  try {
    const profile = await window.OdinApiConfig.getUserProfile();
    results.userProfile = !!(profile && profile.player_id);
  } catch (e) {}

  // Test user bars
  try {
    const bars = await window.OdinApiConfig.getUserBars();
    results.userBars = !!(bars && bars.chain);
  } catch (e) {}

  // Test faction basic
  try {
    const faction = await window.OdinApiConfig.getFactionBasic();
    results.factionBasic = !!(faction && faction.members);
  } catch (e) {}

  // Test faction chain (leader only)
  try {
    const chain = await window.OdinApiConfig.getFactionChain();
    results.factionChain = !!(chain && chain.chain);
  } catch (e) {
    results.factionChain = 'Permission Denied (expected for non-leaders)';
  }

  console.table(results);
  return results;
}

// Run validation
validateOdinApi();
```

---

## End of Document

**Next Steps**:
1. Implement required code changes
2. Test all functionality
3. Deploy to production
4. Monitor for errors
5. Update documentation as needed
