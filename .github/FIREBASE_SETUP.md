# Firebase Auto-Deploy Setup

This repository is configured to automatically deploy Firebase rules and indexes when you push changes to GitHub.

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

### 1. FIREBASE_TOKEN

Generate a Firebase CI token:

```bash
firebase login:ci
```

This will generate a token. Copy it and add it as a GitHub secret.

### 2. FIREBASE_PROJECT_ID

Your Firebase project ID (e.g., `odin-faction-tools`)

## Adding Secrets to GitHub

1. Go to your repository on GitHub
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add both secrets:
   - Name: `FIREBASE_TOKEN`, Value: `<your-token-from-firebase-login-ci>`
   -Name: `FIREBASE_PROJECT_ID`, Value: `<your-project-id>`

## How It Works

The workflow automatically deploys when you:
- Push changes to the `main` branch
- Modify any of these files:
  - `firestore.rules`
  - `firestore.indexes.json`
  - `database.rules.json`
  - `firebase.json`

## Manual Trigger

You can also manually trigger the deployment:
1. Go to **Actions** tab in GitHub
2. Select **Deploy Firebase Rules and Indexes**
3. Click **Run workflow**

## What Gets Deployed

- ✅ Firestore Security Rules
- ✅ Firestore Indexes
- ✅ Realtime Database Rules

Functions and Hosting are deployed separately.
