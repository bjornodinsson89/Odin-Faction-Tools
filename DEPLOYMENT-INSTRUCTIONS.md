# Deployment Instructions for Cloud Run Authentication Fix

## Changes Made

I've fixed the Cloud Run authentication error by:

1. **Removed manual CORS configuration** from the callable function
   - Firebase Cloud Functions v2 callable functions (`onCall`) automatically handle CORS
   - Manual CORS configuration was causing "internal" errors
   - Only HTTP functions (`onRequest`) need manual CORS

2. **Enhanced error logging** to help diagnose future issues

3. **Added troubleshooting guide** for Cloud Run IAM permissions

## Deploy Option 1: Create Pull Request (Recommended)

1. Go to: https://github.com/bjornodinsson89/Odin-Faction-Tools/pull/new/claude/fix-cloud-run-auth-SeZJD

2. Click "Create Pull Request"

3. Review the changes

4. Merge the PR

5. GitHub Actions will automatically deploy to Firebase (takes 2-3 minutes)

## Deploy Option 2: Manual Deploy with Firebase CLI

If you have Firebase CLI installed:

```bash
# Navigate to project root
cd /home/user/Odin-Faction-Tools

# Install dependencies
cd functions && npm install && cd ..

# Deploy only the functions
firebase deploy --only functions --project torn-war-room

# Or deploy everything
firebase deploy --project torn-war-room
```

## Deploy Option 3: Quick Test Deploy

If you want to test the fix immediately without merging to main:

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Set the project
firebase use torn-war-room

# Deploy
cd /home/user/Odin-Faction-Tools
firebase deploy --only functions
```

## After Deployment

### 1. Wait for deployment to complete
- Cloud Run deployments take 30-60 seconds
- Wait for "Deploy complete!" message

### 2. Test authentication
- Try authenticating with your Torn API key
- The error should be resolved

### 3. If issues persist, check Cloud Run logs

**View logs in Firebase Console:**
https://console.firebase.google.com/project/torn-war-room/functions/logs?search=authenticateWithTorn

**View logs in Google Cloud Console:**
https://console.cloud.google.com/run/detail/us-central1/authenticatewithtorn/logs?project=torn-war-room

**Filter for errors:**
```
Search for: "CRITICAL ERROR" or "Authentication error"
```

### 4. Check IAM Permissions (if still failing)

If you still get "internal" errors after deployment, the Cloud Run service account may need additional permissions:

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=torn-war-room

2. Find service account: `559747349324-compute@developer.gserviceaccount.com`

3. Add these roles:
   - **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`)
   - **Firebase Admin SDK Administrator Service Agent** (`roles/firebase.admin`)

See `check-cloud-run-permissions.md` for detailed IAM setup instructions.

## What Was The Problem?

The `onCall` function had this:
```javascript
exports.authenticateWithTorn = onCall({
  region: 'us-central1',
  cors: ['https://www.torn.com', ...] // ❌ THIS CAUSES ERRORS
}, async (request) => { ... });
```

Firebase Cloud Functions v2 callable functions **automatically handle CORS**. The manual CORS configuration conflicts with the automatic handling, causing "internal" errors.

The fix:
```javascript
exports.authenticateWithTorn = onCall({
  region: 'us-central1' // ✅ CORS handled automatically
}, async (request) => { ... });
```

**Note:** Only HTTP functions (`onRequest`) need manual CORS configuration!

## Questions?

If you continue to get errors after deployment:
1. Check the Cloud Run logs (links above)
2. Look for "[Auth] CRITICAL ERROR" messages
3. The enhanced logging will show exactly what's failing
