#!/bin/bash
set -euo pipefail

echo "🔍 Testing Firebase deployment..."
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$ROOT_DIR/database"

if [ ! -d "$DB_DIR" ]; then
  echo "❌ Expected folder not found: $DB_DIR"
  exit 1
fi

cd "$DB_DIR"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
  echo "❌ Firebase CLI not found. Installing..."
  npm install -g firebase-tools
fi

PROJECT_ID="${FIREBASE_PROJECT_ID:-torn-war-room}"

echo "📋 Project: $PROJECT_ID"
echo ""

# Test authentication (requires 'firebase login' locally, or GOOGLE_APPLICATION_CREDENTIALS in CI)
echo "🔐 Testing authentication..."
set +e
firebase projects:list 2>&1 | grep -q "$PROJECT_ID"
AUTH_OK=$?
set -e

if [ $AUTH_OK -eq 0 ]; then
  echo "✅ Authentication looks good!"
else
  echo "⚠️  Could not confirm access to project '$PROJECT_ID' via 'firebase projects:list'."
  echo "If you're running locally, run: firebase login"
  echo "If you're running in CI, ensure GOOGLE_APPLICATION_CREDENTIALS is set."
fi

echo ""
echo "📝 Testing Firestore rules deployment..."
firebase deploy --only firestore:rules --project "$PROJECT_ID" --non-interactive --debug 2>&1 | tail -200

echo ""
echo "📊 Testing Firestore indexes deployment..."
firebase deploy --only firestore:indexes --project "$PROJECT_ID" --non-interactive --debug 2>&1 | tail -200

echo ""
echo "🗄️ Testing Realtime Database rules deployment..."
firebase deploy --only database --project "$PROJECT_ID" --non-interactive --debug 2>&1 | tail -200

echo ""
echo "⚙️ Testing Functions deployment (dry run not supported; this will deploy)..."
firebase deploy --only functions --project "$PROJECT_ID" --non-interactive --debug 2>&1 | tail -200

echo ""
echo "🌐 Testing Hosting deployment (this will deploy)..."
firebase deploy --only hosting --project "$PROJECT_ID" --non-interactive --debug 2>&1 | tail -200

echo ""
echo "✅ Done."
