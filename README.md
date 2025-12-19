# Odin Faction Tools

Comprehensive Torn City faction management userscript with Firebase backend, AI target scoring, and real-time collaboration features.

## 🚀 Features

- **Firebase Integration**: Full support for Realtime Database and Firestore
- **AI Target Scoring**: Neural network-powered target analysis (Freki AI)
- **Real-time Collaboration**: Live faction data synchronization
- **Role-based Access Control**: Secure permission system
- **API Integration**: Torn API, TornStats, and FFScouter support
- **Modern UI**: Clean, responsive interface with multiple tabs

## 📦 Installation

### Quick Start

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Greasemonkey](https://www.greasespot.net/)
2. Install the userscript: `odin-faction-tools.user.js`
3. Navigate to https://www.torn.com
4. The script will automatically initialize

### Manual Installation

See [FIRESTORE_SETUP_GUIDE.md](FIRESTORE_SETUP_GUIDE.md) for detailed setup instructions.

## 🔧 Recent Fixes (v5.0.1)

**Fixed Critical Firestore Connection Issues:**

1. ✅ Added Firebase SDK loading via `@require` directives
2. ✅ Implemented Firestore connection monitoring and error handling
3. ✅ Created comprehensive Firestore helper methods
4. ✅ Added connection testing and diagnostics
5. ✅ Fixed silent initialization failures
6. ✅ Added real-time connection status events

**See FIRESTORE_SETUP_GUIDE.md for full details and troubleshooting.**

## 🧪 Testing Firestore Connection

Open browser console on Torn.com and run:

```javascript
// Check Firebase status
OdinDiagnostics.checkFirebase()

// Test Firestore connectivity
await OdinDiagnostics.testFirestore()

// List loaded modules
OdinDiagnostics.listModules()
```

## 📚 Documentation

- **Setup Guide**: [FIRESTORE_SETUP_GUIDE.md](FIRESTORE_SETUP_GUIDE.md)
- **Module Architecture**: See individual module files in `/modules`
- **API Reference**: Included in setup guide

## 🏗️ Architecture

```
odin-faction-tools.user.js       # Main entry point (loads Firebase SDKs)
├── modules/
│   ├── odins-spear-core.js      # Event system & state management
│   ├── FirebaseService.js       # Firebase & Firestore integration
│   ├── AccessControl.js         # Role-based permissions
│   ├── OdinApi.js              # External API integrations
│   ├── freki.js                # AI target scoring
│   ├── NeuralNetwork.js        # Neural network implementation
│   ├── UIManager.js            # UI controller
│   └── ui-profile-injection.js # Profile page integration
```

## 🔑 Firebase Services

### Realtime Database (RTDB)
- Connection monitoring
- Presence system
- Real-time sync

### Firestore
- Document storage
- Advanced querying
- Real-time listeners
- Batch operations

### Functions
- Torn API authentication
- Server-side validation
- Data processing

### Authentication
- Custom token auth via Torn API
- Role-based access control
- Secure claim validation

## 🛠️ Development

### Project Structure

- `/modules` - Individual service modules
- `odin-faction-tools.user.js` - Main userscript entry point
- `FIRESTORE_SETUP_GUIDE.md` - Setup and troubleshooting

### Adding a New Module

1. Create module in `/modules`
2. Register in `window.OdinModules` array
3. Add to load order in main userscript
4. Initialize via `OdinsSpear.init()`

### Debugging

```javascript
// Get current state
OdinDiagnostics.getState()

// Check Firebase status
OdinDiagnostics.checkFirebase()

// View network logs
console.log(window.__ODIN_NET_LOG__)
```

## 📝 License

See [LICENSE](LICENSE) file for details.

## 👤 Author

**BjornOdinsson89**

## 🐛 Known Issues

None currently - Firestore connection issues have been resolved in v5.0.1!

## 🔄 Changelog

### v5.0.1 (Latest)
- Fixed Firestore connection issues
- Added comprehensive error handling
- Implemented connection monitoring
- Created diagnostic utilities
- Added detailed setup guide

### v5.0.0
- Initial release
- Firebase integration
- AI target scoring
- UI management system
