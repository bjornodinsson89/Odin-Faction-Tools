# Cloud Run Authentication Error - Troubleshooting Guide

## Problem
Getting error: `Authentication failed: Server error: internal`

## Root Cause
Cloud Run (Firebase Functions v2) requires specific IAM permissions that might not be properly configured.

## Required Permissions for Cloud Run Service Account

The service account `SERVICE_PROJECT_NUMBER-compute@developer.gserviceaccount.com` needs:

1. **Firebase Admin SDK Access:**
   - `roles/firebase.admin` or individual roles:
     - `roles/firebaseauth.admin` - Create custom tokens
     - `roles/datastore.user` - Firestore access

2. **Service Account Token Creator:**
   - `roles/iam.serviceAccountTokenCreator` - Required for createCustomToken()

## Fix Steps

### Option 1: Using Firebase Console (Recommended)

1. Go to https://console.firebase.google.com/project/torn-war-room/settings/serviceaccounts/adminsdk
2. Click "Generate New Private Key" to verify the service account exists
3. Go to https://console.cloud.google.com/iam-admin/iam?project=torn-war-room
4. Find the service account: `559747349324-compute@developer.gserviceaccount.com`
5. Click "Edit" (pencil icon)
6. Add the following roles:
   - **Firebase Admin SDK Administrator Service Agent**
   - **Service Account Token Creator**
7. Save changes

### Option 2: Using gcloud CLI

```bash
# Set your project
gcloud config set project torn-war-room

# Get the service account email
SERVICE_ACCOUNT="559747349324-compute@developer.gserviceaccount.com"

# Grant necessary permissions
gcloud projects add-iam-policy-binding torn-war-room \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/firebase.admin"

gcloud projects add-iam-policy-binding torn-war-room \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### Option 3: Add Explicit Service Account to Function

Modify the function deployment to use a specific service account with proper permissions.

## Alternative: Check Cloud Run Logs Properly

To see the actual error, view logs at:
https://console.cloud.google.com/run/detail/us-central1/authenticatewithtorn/logs?project=torn-war-room

Or filter Cloud Run logs:
https://console.cloud.google.com/logs/query?project=torn-war-room

## Known Issues with Firebase Functions v2

1. **CORS Configuration**: Callable functions handle CORS automatically. Manual CORS config might conflict.
2. **Service Account Permissions**: Default compute service account might lack Firebase permissions.
3. **Region Configuration**: Client must specify `us-central1` region (already fixed in code).

## Testing

After applying permissions:
1. Wait 1-2 minutes for IAM changes to propagate
2. Try authentication again
3. Check Cloud Run logs for detailed error messages
