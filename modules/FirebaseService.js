/**
 * Odin Tools - Firebase Service Module
 * Handles all Firebase Realtime Database and Firestore operations
 * Version 3.1.0
 * Author BjornOdinsson89 
 * @requires firebase (loaded via CDN in userscript)
 */

class FirebaseService {
    constructor(config) {
        this.config = config;
        this.app = null;
        this.db = null; // Realtime Database
        this.firestore = null; // Firestore
        this.auth = null; // Auth
        this.currentUser = null;
        this.currentFaction = null;
        this.listeners = new Map();
        this.connected = false;
    }

    /**
     * Initialize Firebase
     */
    async initialize() {
        try {
            // Initialize Firebase app
            if (!firebase.apps.length) {
                this.app = firebase.initializeApp(this.config);
            } else {
                this.app = firebase.apps[0];
            }

            // Initialize services
            this.db = firebase.database();
            this.firestore = firebase.firestore();
            this.auth = firebase.auth();
            // ========================================
            // NETWORK DIAGNOSTICS (DB)
            // ========================================
            if (!window.__ODIN_NET_LOG__) window.__ODIN_NET_LOG__ = { api: [], db: [] };
            const odinDbLog = (entry) => {
                try {
                    const log = window.__ODIN_NET_LOG__;
                    if (!Array.isArray(log.db)) log.db = [];
                    log.db.unshift(entry);
                    if (log.db.length > 300) log.db.length = 300;
                } catch (e) { /* ignore */ }
            };

            const wrapRtdbRef = (ref, path) => {
                return new Proxy(ref, {
                    get(target, prop) {
                        const v = target[prop];
                        if (typeof v === 'function' && ['set','update','transaction','once','push','remove'].includes(prop)) {
                            return (...args) => {
                                const t0 = performance.now();
                                const entry = { ts: Date.now(), db: 'rtdb', op: String(prop), path: String(path || ''), ok: false, ms: 0 };
                                odinDbLog(entry);
                                try {
                                    const p = v.apply(target, args);
                                    if (p && typeof p.then === 'function') {
                                        return p.then((res) => {
                                            entry.ok = true;
                                            entry.ms = Math.round(performance.now() - t0);
                                            return res;
                                        }).catch((err) => {
                                            entry.ok = false;
                                            entry.ms = Math.round(performance.now() - t0);
                                            entry.error = (err && err.message) ? err.message : String(err);
                                            throw err;
                                        });
                                    }
                                    entry.ok = true;
                                    entry.ms = Math.round(performance.now() - t0);
                                    return p;
                                } catch (err) {
                                    entry.ok = false;
                                    entry.ms = Math.round(performance.now() - t0);
                                    entry.error = (err && err.message) ? err.message : String(err);
                                    throw err;
                                }
                            };
                        }
                        if (typeof v === 'function') return v.bind(target);
                        return v;
                    }
                });
            };

            const origDbRef = this.db.ref.bind(this.db);
            this.db.ref = (path) => wrapRtdbRef(origDbRef(path), path);

            const wrapFsDoc = (docRef, path) => {
                return new Proxy(docRef, {
                    get(target, prop) {
                        const v = target[prop];
                        if (typeof v === 'function' && ['set','update','get','delete'].includes(prop)) {
                            return (...args) => {
                                const t0 = performance.now();
                                const entry = { ts: Date.now(), db: 'firestore', op: String(prop), path: String(path || ''), ok: false, ms: 0 };
                                odinDbLog(entry);
                                try {
                                    const p = v.apply(target, args);
                                    return p.then((res) => {
                                        entry.ok = true;
                                        entry.ms = Math.round(performance.now() - t0);
                                        return res;
                                    }).catch((err) => {
                                        entry.ok = false;
                                        entry.ms = Math.round(performance.now() - t0);
                                        entry.error = (err && err.message) ? err.message : String(err);
                                        throw err;
                                    });
                                } catch (err) {
                                    entry.ok = false;
                                    entry.ms = Math.round(performance.now() - t0);
                                    entry.error = (err && err.message) ? err.message : String(err);
                                    throw err;
                                }
                            };
                        }
                        if (typeof v === 'function') return v.bind(target);
                        return v;
                    }
                });
            };

            const wrapFsCollection = (colRef, path) => {
                return new Proxy(colRef, {
                    get(target, prop) {
                        const v = target[prop];
                        if (prop === 'doc' && typeof v === 'function') {
                            return (id) => {
                                const d = v.call(target, id);
                                const p = path + '/' + (id || '(auto)');
                                return wrapFsDoc(d, p);
                            };
                        }
                        if (prop === 'add' && typeof v === 'function') {
                            return (...args) => {
                                const t0 = performance.now();
                                const entry = { ts: Date.now(), db: 'firestore', op: 'add', path: String(path || ''), ok: false, ms: 0 };
                                odinDbLog(entry);
                                try {
                                    return v.apply(target, args).then((res) => {
                                        entry.ok = true;
                                        entry.ms = Math.round(performance.now() - t0);
                                        return res;
                                    }).catch((err) => {
                                        entry.ok = false;
                                        entry.ms = Math.round(performance.now() - t0);
                                        entry.error = (err && err.message) ? err.message : String(err);
                                        throw err;
                                    });
                                } catch (err) {
                                    entry.ok = false;
                                    entry.ms = Math.round(performance.now() - t0);
                                    entry.error = (err && err.message) ? err.message : String(err);
                                    throw err;
                                }
                            };
                        }
                        if (typeof v === 'function') return v.bind(target);
                        return v;
                    }
                });
            };

            const origCollection = this.firestore.collection.bind(this.firestore);
            this.firestore.collection = (name) => wrapFsCollection(origCollection(name), name);

            // Monitor connection status
            const connectedRef = this.db.ref('.info/connected');
            connectedRef.on('value', (snapshot) => {
                this.connected = snapshot.val() === true;
                this.emit('connectionChange', this.connected);
            });

            console.log('Firebase initialized successfully');
            return true;
        } catch (error) {
            console.error('Firebase initialization error:', error);
            throw error;
        }
    }

    /**
     * Set current user context
     */
    setUser(userId, factionId) {
        this.currentUser = userId;
        this.currentFaction = factionId;
    }

    /**
     * Event emitter
     */
    emit(event, data) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(cb => cb(data));
    }

    /**
     * Event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    // ========================================
    // FREKI AI - REALTIME DATABASE OPERATIONS
    // ========================================

    /**
     * Submit fight outcome to Freki
     */
    async submitFightOutcome(fightData) {
        try {
            const bucket = this.generateFrekiBucket(fightData);
            const path = `freki/community/${bucket}`;
            const ref = this.db.ref(path);

            await ref.transaction((current) => {
                if (!current) {
                    return {
                        fights: 1,
                        wins: fightData.result === 'win' ? 1 : 0,
                        losses: fightData.result === 'loss' ? 1 : 0,
                        totalRespect: fightData.respect || 0,
                        totalEnergy: fightData.energy || 0,
                        fairFightSum: fightData.fairFight || 0,
                        lastUpdated: firebase.database.ServerValue.TIMESTAMP
                    };
                }

                return {
                    fights: (current.fights || 0) + 1,
                    wins: (current.wins || 0) + (fightData.result === 'win' ? 1 : 0),
                    losses: (current.losses || 0) + (fightData.result === 'loss' ? 1 : 0),
                    totalRespect: (current.totalRespect || 0) + (fightData.respect || 0),
                    totalEnergy: (current.totalEnergy || 0) + (fightData.energy || 0),
                    fairFightSum: (current.fairFightSum || 0) + (fightData.fairFight || 0),
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP
                };
            });

            return true;
        } catch (error) {
            console.error('Error submitting fight outcome:', error);
            throw error;
        }
    }

    /**
     * Generate Freki bucket key
     */
    generateFrekiBucket(fightData) {
        const attackerLevel = this.getLevelRange(fightData.attackerLevel);
        const defenderLevel = this.getLevelRange(fightData.defenderLevel);
        const chainRange = this.getChainRange(fightData.chain || 0);
        const warStatus = fightData.inWar ? 'WAR' : 'PEACE';

        return `L${attackerLevel}__L${defenderLevel}__C${chainRange}__${warStatus}`;
    }

    /**
     * Get level range for bucketing
     */
    getLevelRange(level) {
        const ranges = [
            [1, 5], [6, 10], [11, 15], [16, 20], [21, 25],
            [26, 30], [31, 35], [36, 40], [41, 45], [46, 50],
            [51, 55], [56, 60], [61, 65], [66, 70], [71, 75],
            [76, 80], [81, 85], [86, 90], [91, 95], [96, 100]
        ];

        for (const [min, max] of ranges) {
            if (level >= min && level <= max) {
                return `${min}-${max}`;
            }
        }

        return '100+';
    }

    /**
     * Get chain range for bucketing
     */
    getChainRange(chain) {
        if (chain === 0) return '0';
        if (chain >= 1 && chain <= 9) return '1-9';
        if (chain >= 10 && chain <= 49) return '10-49';
        if (chain >= 50 && chain <= 99) return '50-99';
        if (chain >= 100 && chain <= 249) return '100-249';
        if (chain >= 250 && chain <= 499) return '250-499';
        return '500+';
    }

    /**
     * Fetch Freki predictions for matchup
     */
    async getFrekiPrediction(attackerLevel, defenderLevel, chain = 0, inWar = false) {
        try {
            const bucket = this.generateFrekiBucket({
                attackerLevel,
                defenderLevel,
                chain,
                inWar
            });

            const path = `freki/community/${bucket}`;
            const snapshot = await this.db.ref(path).once('value');
            const data = snapshot.val();

            if (!data || data.fights < 10) {
                return null; // Not enough data
            }

            return {
                winRate: data.wins / data.fights,
                avgRespect: data.totalRespect / data.fights,
                avgEnergy: data.totalEnergy / data.fights,
                avgFairFight: data.fairFightSum / data.fights,
                sampleSize: data.fights,
                lastUpdated: data.lastUpdated
            };
        } catch (error) {
            console.error('Error fetching Freki prediction:', error);
            return null;
        }
    }

    /**
     * Submit neural network training data
     */
    async submitTrainingData(trainingData) {
        try {
            const path = `freki/training/${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.db.ref(path).set({
                ...trainingData,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });
            return true;
        } catch (error) {
            console.error('Error submitting training data:', error);
            throw error;
        }
    }

    /**
     * Get neural network model
     */
    async getNeuralNetworkModel() {
        try {
            const snapshot = await this.db.ref('freki/models/current').once('value');
            return snapshot.val();
        } catch (error) {
            console.error('Error fetching neural network model:', error);
            return null;
        }
    }

    // ========================================
    // FACTION COORDINATION - FIRESTORE OPERATIONS
    // ========================================

    /**
     * Create or update target
     */
    async saveTarget(targetData) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const docRef = this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('targets')
                .doc(targetData.id.toString());

            await docRef.set({
                ...targetData,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedBy: this.currentUser
            }, { merge: true });

            return true;
        } catch (error) {
            console.error('Error saving target:', error);
            throw error;
        }
    }

    /**
     * Get faction targets
     */
    async getTargets(filters = {}) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            let query = this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('targets');

            // Apply filters
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }
            if (filters.claimedBy) {
                query = query.where('claimedBy', '==', filters.claimedBy);
            }
            if (filters.priority) {
                query = query.where('priority', '==', filters.priority);
            }

            const snapshot = await query.get();
            const targets = [];

            snapshot.forEach(doc => {
                targets.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return targets;
        } catch (error) {
            console.error('Error fetching targets:', error);
            throw error;
        }
    }

    /**
     * Claim a target
     */
    async claimTarget(targetId, userId) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const docRef = this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('targets')
                .doc(targetId.toString());

            await docRef.update({
                claimedBy: userId,
                claimedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'claimed'
            });

            return true;
        } catch (error) {
            console.error('Error claiming target:', error);
            throw error;
        }
    }

    /**
     * Release a target claim
     */
    async releaseTarget(targetId) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const docRef = this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('targets')
                .doc(targetId.toString());

            await docRef.update({
                claimedBy: null,
                claimedAt: null,
                status: 'available'
            });

            return true;
        } catch (error) {
            console.error('Error releasing target:', error);
            throw error;
        }
    }

    /**
     * Watch targets for real-time updates
     */
    watchTargets(callback) {
        if (!this.currentFaction) {
            throw new Error('No faction context set');
        }

        const unsubscribe = this.firestore
            .collection('factions')
            .doc(this.currentFaction)
            .collection('targets')
            .onSnapshot((snapshot) => {
                const targets = [];
                snapshot.forEach(doc => {
                    targets.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                callback(targets);
            }, (error) => {
                console.error('Error watching targets:', error);
            });

        return unsubscribe;
    }

    /**
     * Save chain hit
     */
    async saveChainHit(hitData) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const docRef = this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('chainHits')
                .doc();

            await docRef.set({
                ...hitData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: this.currentUser
            });

            return true;
        } catch (error) {
            console.error('Error saving chain hit:', error);
            throw error;
        }
    }

    /**
     * Get chain statistics
     */
    async getChainStats(chainId) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const snapshot = await this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('chainHits')
                .where('chainId', '==', chainId)
                .get();

            const hits = [];
            let totalRespect = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                hits.push(data);
                totalRespect += data.respect || 0;
            });

            return {
                totalHits: hits.length,
                totalRespect,
                avgRespect: hits.length > 0 ? totalRespect / hits.length : 0,
                hits
            };
        } catch (error) {
            console.error('Error fetching chain stats:', error);
            throw error;
        }
    }

    /**
     * Save faction member data
     */
    async saveMember(memberData) {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const docRef = this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('members')
                .doc(memberData.id.toString());

            await docRef.set({
                ...memberData,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return true;
        } catch (error) {
            console.error('Error saving member:', error);
            throw error;
        }
    }

    /**
     * Get faction members
     */
    async getMembers() {
        try {
            if (!this.currentFaction) {
                throw new Error('No faction context set');
            }

            const snapshot = await this.firestore
                .collection('factions')
                .doc(this.currentFaction)
                .collection('members')
                .get();

            const members = [];
            snapshot.forEach(doc => {
                members.push({
                    id: doc.id,
                    ...doc.data()
                });
            });

            return members;
        } catch (error) {
            console.error('Error fetching members:', error);
            throw error;
        }
    }

    /**
     * Clean up listeners
     */
    destroy() {
        // Remove all listeners
        if (this.db) {
            this.db.ref('.info/connected').off();
        }

        this.listeners.clear();
    }
}

// Export for use in userscript
if (typeof window !== 'undefined') {
    window.FirebaseService = FirebaseService;
}
