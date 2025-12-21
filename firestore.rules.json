rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthed() {
      return request.auth != null;
    }

    function factionMatch(factionId) {
      return isAuthed() && request.auth.token.factionId == factionId;
    }

    // Per-user documents (private to the signed-in user)
    match /users/{userId} {
      allow read, write: if isAuthed() && request.auth.uid == userId;
    }
    match /users/{userId}/{document=**} {
      allow read, write: if isAuthed() && request.auth.uid == userId;
    }

    // Faction-scoped documents (read/write for faction members)
    match /factions/{factionId} {
      allow read, write: if factionMatch(factionId);
    }
    match /factions/{factionId}/{document=**} {
      allow read, write: if factionMatch(factionId);
    }

    // Public, read-only Freki models
    match /freki/models/{document=**} {
      allow read: if true;
      allow write: if false;
    }

    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
