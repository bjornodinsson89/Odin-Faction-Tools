/**
 * Odin Tools - Freki AI Engine
 * Self-learning target scoring system
 * 
 * @version 3.1.0
 * @author Houston
 * @requires OdinApi, FirebaseService, NeuralNetwork
 */

class FrekiEngine {
    constructor(apiClient, firebaseService) {
        this.api = apiClient;
        this.firebase = firebaseService;
        this.neuralNetwork = null;
        this.statEstimates = new Map(); // Level -> estimated stats
        this.playerCache = new Map(); // Cache for player data
        this.initialized = false;
        
        // Feature normalization parameters
        this.normalization = {
            level: { min: 1, max: 100 },
            stats: { min: 1e6, max: 1e9 },
            chain: { min: 0, max: 1000 },
            respect: { min: 0.1, max: 100 }
        };

        // Scoring thresholds
        this.thresholds = {
            veryEasy: 0.9,
            easy: 0.75,
            moderate: 0.6,
            hard: 0.4,
            veryHard: 0.2
        };
    }

    /**
     * Initialize Freki engine
     */
    async initialize() {
        try {
            console.log('Initializing Freki AI Engine...');

            // Load neural network model from Firebase
            const modelData = await this.firebase.getNeuralNetworkModel();
            
            if (modelData) {
                this.neuralNetwork = NeuralNetwork.import(modelData);
                console.log('Loaded existing neural network model');
            } else {
                // Create new network if none exists
                this.neuralNetwork = new NeuralNetwork({
                    layers: [10, 8, 6, 1], // Input features, hidden layers, output
                    learningRate: 0.01,
                    momentum: 0.9,
                    regularization: 0.0001
                });
                console.log('Created new neural network model');
            }

            // Load stat estimates
            await this.loadStatEstimates();

            this.initialized = true;
            console.log('Freki AI Engine initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Freki:', error);
            throw error;
        }
    }

    /**
     * Load statistical estimates for level-to-stats mapping
     */
    async loadStatEstimates() {
        // This would ideally come from Firebase aggregated data
        // For now, using empirical estimates
        const estimates = {
            10: { total: 5e5, strength: 1.5e5, defense: 1.5e5, speed: 1e5, dexterity: 1e5 },
            20: { total: 2e6, strength: 6e5, defense: 6e5, speed: 4e5, dexterity: 4e5 },
            30: { total: 8e6, strength: 2.5e6, defense: 2.5e6, speed: 1.5e6, dexterity: 1.5e6 },
            40: { total: 2e7, strength: 6e6, defense: 6e6, speed: 4e6, dexterity: 4e6 },
            50: { total: 5e7, strength: 1.5e7, defense: 1.5e7, speed: 1e7, dexterity: 1e7 },
            60: { total: 1.2e8, strength: 3.5e7, defense: 3.5e7, speed: 2.5e7, dexterity: 2e7 },
            70: { total: 2.5e8, strength: 7.5e7, defense: 7.5e7, speed: 5e7, dexterity: 5e7 },
            80: { total: 5e8, strength: 1.5e8, defense: 1.5e8, speed: 1e8, dexterity: 1e8 },
            90: { total: 8e8, strength: 2.5e8, defense: 2.5e8, speed: 1.5e8, dexterity: 1.5e8 },
            100: { total: 1.5e9, strength: 4.5e8, defense: 4.5e8, speed: 3e8, dexterity: 3e8 }
        };

        for (const [level, stats] of Object.entries(estimates)) {
            this.statEstimates.set(parseInt(level), stats);
        }
    }

    /**
     * Estimate stats for a given level
     */
    estimateStatsForLevel(level) {
        // Linear interpolation between known levels
        const levels = Array.from(this.statEstimates.keys()).sort((a, b) => a - b);
        
        if (level <= levels[0]) {
            return this.statEstimates.get(levels[0]);
        }
        
        if (level >= levels[levels.length - 1]) {
            return this.statEstimates.get(levels[levels.length - 1]);
        }

        // Find surrounding levels
        let lowerLevel = levels[0];
        let upperLevel = levels[levels.length - 1];

        for (let i = 0; i < levels.length - 1; i++) {
            if (level >= levels[i] && level <= levels[i + 1]) {
                lowerLevel = levels[i];
                upperLevel = levels[i + 1];
                break;
            }
        }

        const lowerStats = this.statEstimates.get(lowerLevel);
        const upperStats = this.statEstimates.get(upperLevel);
        
        // Linear interpolation
        const ratio = (level - lowerLevel) / (upperLevel - lowerLevel);
        
        return {
            total: lowerStats.total + (upperStats.total - lowerStats.total) * ratio,
            strength: lowerStats.strength + (upperStats.strength - lowerStats.strength) * ratio,
            defense: lowerStats.defense + (upperStats.defense - lowerStats.defense) * ratio,
            speed: lowerStats.speed + (upperStats.speed - lowerStats.speed) * ratio,
            dexterity: lowerStats.dexterity + (upperStats.dexterity - lowerStats.dexterity) * ratio
        };
    }

    /**
     * Calculate battle score (sqrt sum)
     */
    calculateBattleScore(stats) {
        return Math.sqrt(stats.strength) + 
               Math.sqrt(stats.defense) + 
               Math.sqrt(stats.speed) + 
               Math.sqrt(stats.dexterity);
    }

    /**
     * Calculate fair fight multiplier
     */
    calculateFairFight(attackerScore, defenderScore) {
        const ratio = Math.min(attackerScore, defenderScore) / Math.max(attackerScore, defenderScore);
        
        if (ratio >= 0.75) {
            return 3.0;
        }
        
        // Linear scale between 1.0 and 3.0
        return 1.0 + (ratio - 0) / (0.75 - 0) * 2.0;
    }

    /**
     * Normalize feature for neural network
     */
    normalize(value, feature) {
        const { min, max } = this.normalization[feature];
        return (value - min) / (max - min);
    }

    /**
     * Extract features for neural network
     */
    async extractFeatures(attackerData, defenderData, context = {}) {
        // Get or estimate battle stats
        let attackerStats = attackerData.battleStats;
        if (!attackerStats) {
            attackerStats = this.estimateStatsForLevel(attackerData.level);
        }

        let defenderStats = defenderData.battleStats;
        if (!defenderStats) {
            // Try to get from TornStats
            try {
                const spyData = await this.api.getTornStatsBattleStats(defenderData.id);
                if (spyData && spyData.total > 0) {
                    defenderStats = spyData;
                } else {
                    defenderStats = this.estimateStatsForLevel(defenderData.level);
                }
            } catch (e) {
                defenderStats = this.estimateStatsForLevel(defenderData.level);
            }
        }

        const attackerBS = this.calculateBattleScore(attackerStats);
        const defenderBS = this.calculateBattleScore(defenderStats);
        const fairFight = this.calculateFairFight(attackerBS, defenderBS);
        const statRatio = defenderBS / attackerBS;

        // Build feature vector
        const features = [
            this.normalize(attackerData.level, 'level'),
            this.normalize(defenderData.level, 'level'),
            this.normalize(attackerStats.total, 'stats'),
            this.normalize(defenderStats.total, 'stats'),
            statRatio,
            fairFight / 3.0, // Normalize FF
            this.normalize(context.chain || 0, 'chain'),
            context.inWar ? 1 : 0,
            defenderData.status === 'Okay' ? 1 : 0,
            defenderData.status === 'Hospital' ? 1 : 0
        ];

        return features;
    }

    /**
     * Score a matchup
     */
    async scoreMatchup(attackerData, defenderData, context = {}) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Extract features
            const features = await this.extractFeatures(attackerData, defenderData, context);

            // Get neural network prediction
            const aiScore = this.neuralNetwork.predict(features);

            // Get community data if available
            const communityData = await this.firebase.getFrekiPrediction(
                attackerData.level,
                defenderData.level,
                context.chain || 0,
                context.inWar || false
            );

            // Combine AI and community predictions
            let finalScore = aiScore;
            let confidence = 'medium';

            if (communityData && communityData.sampleSize >= 50) {
                // Weight by sample size (more samples = more trust in community data)
                const communityWeight = Math.min(communityData.sampleSize / 100, 0.5);
                const aiWeight = 1 - communityWeight;
                finalScore = aiScore * aiWeight + communityData.winRate * communityWeight;
                confidence = communityData.sampleSize >= 100 ? 'high' : 'medium';
            }

            // Calculate expected respect
            const baseRespect = defenderData.level * 0.25;
            const defenderStats = defenderData.battleStats || this.estimateStatsForLevel(defenderData.level);
            const attackerStats = attackerData.battleStats || this.estimateStatsForLevel(attackerData.level);
            const defenderBS = this.calculateBattleScore(defenderStats);
            const attackerBS = this.calculateBattleScore(attackerStats);
            const fairFight = this.calculateFairFight(attackerBS, defenderBS);
            
            const chainBonus = context.chain ? Math.min(1 + (context.chain / 10) * 0.5, 2.0) : 1.0;
            const warBonus = context.inWar ? 2.0 : 1.0;
            
            const expectedRespect = baseRespect * fairFight * chainBonus * warBonus;

            // Determine difficulty rating
            let difficulty;
            if (finalScore >= this.thresholds.veryEasy) difficulty = 'Very Easy';
            else if (finalScore >= this.thresholds.easy) difficulty = 'Easy';
            else if (finalScore >= this.thresholds.moderate) difficulty = 'Moderate';
            else if (finalScore >= this.thresholds.hard) difficulty = 'Hard';
            else difficulty = 'Very Hard';

            return {
                score: finalScore,
                difficulty,
                confidence,
                expectedRespect,
                fairFight,
                communityData,
                features: {
                    attackerLevel: attackerData.level,
                    defenderLevel: defenderData.level,
                    statRatio: defenderBS / attackerBS,
                    battleScoreRatio: defenderBS / attackerBS
                }
            };
        } catch (error) {
            console.error('Error scoring matchup:', error);
            throw error;
        }
    }

    /**
     * Score multiple targets
     */
    async scoreTargets(attackerData, targets, context = {}) {
        const scores = [];

        for (const target of targets) {
            try {
                const score = await this.scoreMatchup(attackerData, target, context);
                scores.push({
                    target,
                    ...score
                });
            } catch (error) {
                console.error(`Failed to score target ${target.id}:`, error);
                scores.push({
                    target,
                    error: error.message
                });
            }
        }

        // Sort by score (highest first)
        scores.sort((a, b) => (b.score || 0) - (a.score || 0));

        return scores;
    }

    /**
     * Record fight outcome for learning
     */
    async recordFightOutcome(fightData) {
        try {
            // Submit to Firebase for community learning
            await this.firebase.submitFightOutcome({
                attackerLevel: fightData.attacker.level,
                defenderLevel: fightData.defender.level,
                result: fightData.result,
                respect: fightData.respect,
                energy: fightData.energy,
                fairFight: fightData.fairFight,
                chain: fightData.chain || 0,
                inWar: fightData.inWar || false
            });

            // Extract features and create training sample
            const features = await this.extractFeatures(
                fightData.attacker,
                fightData.defender,
                { chain: fightData.chain, inWar: fightData.inWar }
            );

            const target = fightData.result === 'win' ? [1] : [0];

            // Submit to training queue
            await this.firebase.submitTrainingData({
                input: features,
                target,
                metadata: {
                    attackerId: fightData.attacker.id,
                    defenderId: fightData.defender.id,
                    respect: fightData.respect,
                    timestamp: Date.now()
                }
            });

            return true;
        } catch (error) {
            console.error('Error recording fight outcome:', error);
            throw error;
        }
    }

    /**
     * Train model on new data (server-side typically)
     */
    async trainModel(trainingData, validationData = null) {
        if (!this.neuralNetwork) {
            throw new Error('Neural network not initialized');
        }

        console.log(`Training on ${trainingData.length} samples...`);

        const result = this.neuralNetwork.train(
            trainingData,
            validationData,
            100, // epochs
            32,  // batch size
            10   // early stopping patience
        );

        console.log('Training completed:', result);

        // Export and save model
        const modelData = this.neuralNetwork.export();
        await this.firebase.db.ref('freki/models/current').set(modelData);

        return result;
    }

    /**
     * Get recommendations for target selection
     */
    async getRecommendations(attackerData, availableTargets, criteria = {}) {
        const scores = await this.scoreTargets(attackerData, availableTargets, {
            chain: criteria.chain || 0,
            inWar: criteria.inWar || false
        });

        // Filter based on criteria
        let filtered = scores.filter(s => !s.error);

        if (criteria.minScore) {
            filtered = filtered.filter(s => s.score >= criteria.minScore);
        }

        if (criteria.maxDifficulty) {
            const difficultyOrder = ['Very Easy', 'Easy', 'Moderate', 'Hard', 'Very Hard'];
            const maxIndex = difficultyOrder.indexOf(criteria.maxDifficulty);
            filtered = filtered.filter(s => 
                difficultyOrder.indexOf(s.difficulty) <= maxIndex
            );
        }

        if (criteria.minRespect) {
            filtered = filtered.filter(s => s.expectedRespect >= criteria.minRespect);
        }

        // Sort by criteria priority
        if (criteria.sortBy === 'respect') {
            filtered.sort((a, b) => b.expectedRespect - a.expectedRespect);
        } else if (criteria.sortBy === 'difficulty') {
            filtered.sort((a, b) => b.score - a.score);
        } else {
            // Default: balance of score and respect
            filtered.sort((a, b) => {
                const scoreA = a.score * (a.expectedRespect / 10);
                const scoreB = b.score * (b.expectedRespect / 10);
                return scoreB - scoreA;
            });
        }

        return filtered.slice(0, criteria.limit || 20);
    }

    /**
     * Get model statistics
     */
    getModelStats() {
        if (!this.neuralNetwork) {
            return null;
        }

        return {
            epoch: this.neuralNetwork.epoch,
            layers: this.neuralNetwork.layers,
            trainingLoss: this.neuralNetwork.trainingLoss.slice(-10),
            validationLoss: this.neuralNetwork.validationLoss.slice(-10),
            lastTrainingLoss: this.neuralNetwork.trainingLoss[this.neuralNetwork.trainingLoss.length - 1],
            lastValidationLoss: this.neuralNetwork.validationLoss[this.neuralNetwork.validationLoss.length - 1]
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.playerCache.clear();
    }
}

// Export for use in userscript
if (typeof window !== 'undefined') {
    window.FrekiEngine = FrekiEngine;
}
