#!/bin/bash

echo "🔍 Testing Firebase deployment..."
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

echo "📋 Project: torn-war-room"
echo ""

# Test authentication
echo "🔐 Testing authentication..."
firebase projects:list 2>&1 | grep -q "torn-war-room"
if [ $? -eq 0 ]; then
    echo "✅ Authentication successful!"
else
    echo "❌ Authentication failed or project not found"
    echo "Run: firebase login:ci"
    exit 1
fi

echo ""
echo "📝 Testing Firestore rules deployment..."
firebase deploy --only firestore:rules --project torn-war-room --debug 2>&1 | tail -20

echo ""
echo "📊 Testing Firestore indexes deployment..."
firebase deploy --only firestore:indexes --project torn-war-room --debug 2>&1 | tail -20

echo ""
echo "🗄️ Testing Realtime Database rules deployment..."
firebase deploy --only database --project torn-war-room --debug 2>&1 | tail -20
