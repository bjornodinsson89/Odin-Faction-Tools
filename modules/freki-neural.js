// freki-neural.js
// Freki AI Neural Network Module
// Version: 4.0.0 - Complete self-learning implementation with TensorFlow.js

(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  window.OdinModules.push(function FrekiNeuralModuleInit(OdinContext) {
    const ctx = OdinContext || {};
    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const firebase = ctx.firebase || { getFirestore: () => null, getRTDB: () => null };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const VERSION = '4.0.0';

    // ============================================
    // STATE
    // ============================================
    let model = null;
    let isModelLoaded = false;
    let isTraining = false;
    let trainingData = [];
    let predictionCache = new Map();
    let statsEstimator = null;

    // Model configuration
    const MODEL_CONFIG = {
      inputFeatures: 10,
      hiddenLayers: [64, 32, 16],
      outputFeatures: 1,
      learningRate: 0.001,
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
    };

    // Stats estimation buckets
    let statsByLevel = new Map();

    // ============================================
    // EVENTS
    // ============================================
    const EVENTS = {
      NEURAL_READY: 'NEURAL_READY',
      MODEL_LOADED: 'MODEL_LOADED',
      TRAINING_STARTED: 'TRAINING_STARTED',
      TRAINING_PROGRESS: 'TRAINING_PROGRESS',
      TRAINING_COMPLETED: 'TRAINING_COMPLETED',
      PREDICTION_MADE: 'PREDICTION_MADE',
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    async function init() {
      log('[FrekiNeural] Initializing v' + VERSION);

      // Check if TensorFlow.js is available
      if (typeof tf === 'undefined') {
        error('[FrekiNeural] TensorFlow.js not loaded. Please include TensorFlow.js before this module.');
        return;
      }

      // Load stats estimator
      loadStatsEstimator();

      // Try to load existing model
      await loadModel();

      // If no model exists, create a new one
      if (!model) {
        await createModel();
      }

      isModelLoaded = true;
      nexus.emit(EVENTS.NEURAL_READY, { version: VERSION });
      log('[FrekiNeural] Ready');
    }

    function destroy() {
      log('[FrekiNeural] Destroying...');

      if (model) {
        model.dispose();
        model = null;
      }

      isModelLoaded = false;
      predictionCache.clear();

      log('[FrekiNeural] Destroyed');
    }

    // ============================================
    // MODEL MANAGEMENT
    // ============================================
    async function createModel() {
      try {
        log('[FrekiNeural] Creating new model...');

        const model = tf.sequential();

        // Input layer
        model.add(tf.layers.dense({
          inputShape: [MODEL_CONFIG.inputFeatures],
          units: MODEL_CONFIG.hiddenLayers[0],
          activation: 'relu',
          kernelInitializer: 'heNormal',
        }));

        model.add(tf.layers.dropout({ rate: 0.2 }));

        // Hidden layers
        for (let i = 1; i < MODEL_CONFIG.hiddenLayers.length; i++) {
          model.add(tf.layers.dense({
            units: MODEL_CONFIG.hiddenLayers[i],
            activation: 'relu',
            kernelInitializer: 'heNormal',
          }));

          model.add(tf.layers.dropout({ rate: 0.2 }));
        }

        // Output layer (sigmoid for win probability 0-1)
        model.add(tf.layers.dense({
          units: MODEL_CONFIG.outputFeatures,
          activation: 'sigmoid',
        }));

        // Compile model
        model.compile({
          optimizer: tf.train.adam(MODEL_CONFIG.learningRate),
          loss: 'binaryCrossentropy',
          metrics: ['accuracy', 'precision', 'recall'],
        });

        log('[FrekiNeural] Model created successfully');
        return model;
      } catch (err) {
        error('[FrekiNeural] Model creation failed:', err);
        return null;
      }
    }

    async function loadModel() {
      try {
        // Try to load from local storage
        const modelJSON = storage.getJSON('freki_neural_model');
        if (modelJSON) {
          log('[FrekiNeural] Loading model from storage...');
          model = await tf.loadLayersModel(tf.io.fromMemory(modelJSON));
          log('[FrekiNeural] Model loaded successfully');
          nexus.emit(EVENTS.MODEL_LOADED, { source: 'local' });
          return true;
        }

        // Try to load from Firestore (latest trained model)
        const firestore = firebase.getFirestore?.();
        if (firestore) {
          const modelsRef = firestore.collection('frekiModels')
            .orderBy('trainedAt', 'desc')
            .limit(1);

          const snapshot = await modelsRef.get();
          if (!snapshot.empty) {
            const modelDoc = snapshot.docs[0];
            const modelData = modelDoc.data();

            log('[FrekiNeural] Loading model from Firestore...');
            model = await tf.loadLayersModel(tf.io.fromMemory(modelData.modelJSON));
            
            // Cache locally
            storage.setJSON('freki_neural_model', modelData.modelJSON);

            log('[FrekiNeural] Model loaded successfully from Firestore');
            nexus.emit(EVENTS.MODEL_LOADED, { source: 'firestore', version: modelData.version });
            return true;
          }
        }

        return false;
      } catch (err) {
        error('[FrekiNeural] Model loading failed:', err);
        return false;
      }
    }

    async function saveModel() {
      try {
        if (!model) {
          error('[FrekiNeural] No model to save');
          return false;
        }

        log('[FrekiNeural] Saving model...');

        // Save to local storage
        const modelJSON = await model.save(tf.io.withSaveHandler(async (artifacts) => artifacts));
        storage.setJSON('freki_neural_model', modelJSON);

        // Save to Firestore for sharing across users
        const firestore = firebase.getFirestore?.();
        if (firestore) {
          await firestore.collection('frekiModels').add({
            modelJSON,
            version: VERSION,
            trainedAt: firestore.FieldValue.serverTimestamp(),
            accuracy: await evaluateModel(),
            sampleCount: trainingData.length,
          });
        }

        log('[FrekiNeural] Model saved successfully');
        return true;
      } catch (err) {
        error('[FrekiNeural] Model saving failed:', err);
        return false;
      }
    }

    // ============================================
    // STATS ESTIMATION
    // ============================================
    function loadStatsEstimator() {
      const saved = storage.getJSON('freki_stats_estimator');
      if (saved) {
        statsByLevel = new Map(Object.entries(saved));
      } else {
        // Initialize with community averages (from Journal of Torn Science)
        statsByLevel = new Map([
          [15, 5000000],
          [20, 15000000],
          [25, 40000000],
          [30, 80000000],
          [35, 150000000],
          [40, 250000000],
          [45, 400000000],
          [50, 600000000],
          [55, 900000000],
          [60, 1400000000],
          [65, 2000000000],
          [70, 3000000000],
          [75, 4500000000],
          [80, 7000000000],
          [85, 11000000000],
          [90, 17000000000],
          [95, 27000000000],
          [100, 45000000000],
        ]);
      }
    }

    function saveStatsEstimator() {
      const obj = Object.fromEntries(statsByLevel);
      storage.setJSON('freki_stats_estimator', obj);
    }

    function estimateStats(level) {
      // Find nearest known level
      const levels = Array.from(statsByLevel.keys()).map(Number).sort((a, b) => a - b);

      if (level <= levels[0]) {
        return statsByLevel.get(levels[0]);
      }

      if (level >= levels[levels.length - 1]) {
        return statsByLevel.get(levels[levels.length - 1]);
      }

      // Interpolate between two nearest levels
      let lowerLevel = levels[0];
      let upperLevel = levels[levels.length - 1];

      for (let i = 0; i < levels.length - 1; i++) {
        if (levels[i] <= level && level <= levels[i + 1]) {
          lowerLevel = levels[i];
          upperLevel = levels[i + 1];
          break;
        }
      }

      const lowerStats = statsByLevel.get(lowerLevel);
      const upperStats = statsByLevel.get(upperLevel);

      // Linear interpolation
      const ratio = (level - lowerLevel) / (upperLevel - lowerLevel);
      return lowerStats + ratio * (upperStats - lowerStats);
    }

    function updateStatsEstimate(level, stats) {
      // Update the estimate with real data
      const bucketLevel = Math.floor(level / 5) * 5;
      const current = statsByLevel.get(bucketLevel) || estimateStats(bucketLevel);
      
      // Weighted average (new data has 20% weight)
      const updated = current * 0.8 + stats * 0.2;
      statsByLevel.set(bucketLevel, updated);
      
      saveStatsEstimator();
    }

    function calculateBattleScore(stats) {
      // Battle score = sqrt(str) + sqrt(def) + sqrt(spd) + sqrt(dex)
      // If we only have total stats, estimate each stat as total/4
      const perStat = stats / 4;
      return 4 * Math.sqrt(perStat);
    }

    // ============================================
    // FEATURE ENGINEERING
    // ============================================
    function extractFeatures(matchupData) {
      const {
        myLevel,
        myStats,
        targetLevel,
        targetStats,
        chainCount = 0,
        inWar = false,
        targetStatus = 'okay',
        myEnergy = 100,
        fairFightObserved = null,
      } = matchupData;

      // Calculate battle scores
      const myBS = calculateBattleScore(myStats);
      const targetBS = calculateBattleScore(targetStats);

      // Stat ratio (key feature for fair fight)
      const statRatio = targetBS / myBS;

      // Level difference
      const levelDiff = targetLevel - myLevel;
      const levelRatio = targetLevel / Math.max(myLevel, 1);

      // Chain features
      const chainFactor = Math.log(chainCount + 1) / Math.log(100); // Normalized 0-1

      // Status features
      const statusOkay = targetStatus === 'okay' ? 1 : 0;
      const statusHospital = targetStatus === 'hospital' ? 1 : 0;

      // War bonus
      const warBonus = inWar ? 1 : 0;

      // Energy factor
      const energyFactor = myEnergy / 100;

      // Fair fight estimate
      let ffEstimate = 1.0;
      if (fairFightObserved) {
        ffEstimate = fairFightObserved;
      } else if (statRatio >= 0.75) {
        ffEstimate = 3.0;
      } else {
        ffEstimate = 1.0 + (statRatio / 0.75) * 2.0;
      }

      return [
        statRatio,           // 0: Most important - directly relates to fair fight
        levelDiff,           // 1: Level difference
        levelRatio,          // 2: Level ratio
        chainFactor,         // 3: Chain count (normalized)
        statusOkay,          // 4: Target is okay
        statusHospital,      // 5: Target in hospital
        warBonus,            // 6: War active
        energyFactor,        // 7: My energy level
        myBS / 1e9,          // 8: My battle score (normalized to billions)
        ffEstimate / 3.0,    // 9: Fair fight estimate (normalized 0-1)
      ];
    }

    // ============================================
    // TRAINING
    // ============================================
    async function addTrainingSample(sample) {
      trainingData.push(sample);

      // Keep only recent samples (last 10000)
      if (trainingData.length > 10000) {
        trainingData = trainingData.slice(-10000);
      }

      // Update stats estimator if we have actual stats
      if (sample.myStats && sample.myLevel) {
        updateStatsEstimate(sample.myLevel, sample.myStats);
      }
      if (sample.targetStats && sample.targetLevel) {
        updateStatsEstimate(sample.targetLevel, sample.targetStats);
      }

      // Auto-train every 100 samples
      if (trainingData.length % 100 === 0) {
        await trainModel();
      }
    }

    async function trainModel() {
      if (isTraining || trainingData.length < 50) {
        return { success: false, reason: 'insufficient_data' };
      }

      isTraining = true;
      nexus.emit(EVENTS.TRAINING_STARTED, { samples: trainingData.length });

      try {
        log(`[FrekiNeural] Training on ${trainingData.length} samples...`);

        // Prepare training data
        const features = trainingData.map(sample => extractFeatures(sample));
        const labels = trainingData.map(sample => sample.won ? 1 : 0);

        // Convert to tensors
        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels, [labels.length, 1]);

        // Train model
        const history = await model.fit(xs, ys, {
          epochs: MODEL_CONFIG.epochs,
          batchSize: MODEL_CONFIG.batchSize,
          validationSplit: MODEL_CONFIG.validationSplit,
          callbacks: {
            onEpochEnd: (epoch, logs) => {
              if (epoch % 10 === 0) {
                nexus.emit(EVENTS.TRAINING_PROGRESS, {
                  epoch,
                  loss: logs.loss,
                  accuracy: logs.acc,
                });
              }
            },
          },
        });

        // Clean up tensors
        xs.dispose();
        ys.dispose();

        // Save model
        await saveModel();

        // Clear prediction cache
        predictionCache.clear();

        isTraining = false;

        const finalLoss = history.history.loss[history.history.loss.length - 1];
        const finalAcc = history.history.acc[history.history.acc.length - 1];

        log(`[FrekiNeural] Training completed. Loss: ${finalLoss.toFixed(4)}, Accuracy: ${finalAcc.toFixed(4)}`);

        nexus.emit(EVENTS.TRAINING_COMPLETED, {
          loss: finalLoss,
          accuracy: finalAcc,
          samples: trainingData.length,
        });

        return { success: true, loss: finalLoss, accuracy: finalAcc };
      } catch (err) {
        error('[FrekiNeural] Training failed:', err);
        isTraining = false;
        return { success: false, error: err.message };
      }
    }

    async function evaluateModel() {
      if (!model || trainingData.length < 10) {
        return 0;
      }

      try {
        const features = trainingData.slice(-100).map(sample => extractFeatures(sample));
        const labels = trainingData.slice(-100).map(sample => sample.won ? 1 : 0);

        const xs = tf.tensor2d(features);
        const ys = tf.tensor2d(labels, [labels.length, 1]);

        const evaluation = await model.evaluate(xs, ys);
        const accuracy = await evaluation[1].data();

        xs.dispose();
        ys.dispose();
        evaluation.forEach(tensor => tensor.dispose());

        return accuracy[0];
      } catch (err) {
        error('[FrekiNeural] Evaluation failed:', err);
        return 0;
      }
    }

    // ============================================
    // PREDICTION
    // ============================================
    async function predictMatchup(matchupData) {
      if (!isModelLoaded || !model) {
        error('[FrekiNeural] Model not loaded');
        return null;
      }

      try {
        // Check cache
        const cacheKey = JSON.stringify(matchupData);
        if (predictionCache.has(cacheKey)) {
          return predictionCache.get(cacheKey);
        }

        // Extract features
        const features = extractFeatures(matchupData);

        // Make prediction
        const input = tf.tensor2d([features]);
        const prediction = model.predict(input);
        const winProbability = (await prediction.data())[0];

        // Clean up tensors
        input.dispose();
        prediction.dispose();

        // Calculate Freki score (0-10 scale)
        const frekiScore = calculateFrekiScore(winProbability, matchupData);

        // Calculate expected fair fight
        const expectedFF = calculateExpectedFF(matchupData);

        const result = {
          winProbability,
          frekiScore,
          difficulty: getFrekiDifficulty(frekiScore),
          expectedFF,
          confidence: getConfidence(matchupData),
        };

        // Cache result
        predictionCache.set(cacheKey, result);

        nexus.emit(EVENTS.PREDICTION_MADE, { matchupData, result });

        return result;
      } catch (err) {
        error('[FrekiNeural] Prediction failed:', err);
        return null;
      }
    }

    function calculateFrekiScore(winProbability, matchupData) {
      // Freki score: 0 = impossible, 10 = trivial
      // Factors: win probability, fair fight bonus, status
      
      let score = winProbability * 10;

      // Bonus for hospitalized targets
      if (matchupData.targetStatus === 'hospital') {
        score += 2;
      }

      // Penalty for traveling targets
      if (matchupData.targetStatus === 'traveling') {
        score -= 2;
      }

      // Bonus for high expected fair fight
      const statRatio = matchupData.targetStats / matchupData.myStats;
      if (statRatio >= 0.75) {
        score += 1;
      }

      return Math.max(0, Math.min(10, score));
    }

    function getFrekiDifficulty(score) {
      if (score >= 9) return 'Trivial';
      if (score >= 7) return 'Easy';
      if (score >= 5) return 'Moderate';
      if (score >= 3) return 'Hard';
      if (score >= 1) return 'Very Hard';
      return 'Impossible';
    }

    function calculateExpectedFF(matchupData) {
      const myBS = calculateBattleScore(matchupData.myStats);
      const targetBS = calculateBattleScore(matchupData.targetStats);
      const ratio = Math.min(targetBS, myBS) / Math.max(targetBS, myBS);

      if (ratio >= 0.75) return 3.0;
      if (ratio <= 0.25) return 1.0;

      // Linear interpolation
      return 1.0 + (ratio / 0.75) * 2.0;
    }

    function getConfidence(matchupData) {
      // Confidence based on how much training data we have for similar matchups
      const levelBucket = Math.floor(matchupData.targetLevel / 5) * 5;
      const similarSamples = trainingData.filter(s =>
        Math.abs(s.targetLevel - matchupData.targetLevel) <= 5 &&
        Math.abs(s.myLevel - matchupData.myLevel) <= 5
      ).length;

      if (similarSamples >= 50) return 'high';
      if (similarSamples >= 20) return 'medium';
      if (similarSamples >= 5) return 'low';
      return 'very_low';
    }

    async function batchPredict(matchupsArray) {
      if (!isModelLoaded || !model) {
        error('[FrekiNeural] Model not loaded');
        return [];
      }

      try {
        const features = matchupsArray.map(m => extractFeatures(m));
        const input = tf.tensor2d(features);
        const predictions = model.predict(input);
        const probabilities = await predictions.data();

        input.dispose();
        predictions.dispose();

        return matchupsArray.map((matchup, i) => {
          const winProbability = probabilities[i];
          const frekiScore = calculateFrekiScore(winProbability, matchup);

          return {
            ...matchup,
            winProbability,
            frekiScore,
            difficulty: getFrekiDifficulty(frekiScore),
            expectedFF: calculateExpectedFF(matchup),
            confidence: getConfidence(matchup),
          };
        });
      } catch (err) {
        error('[FrekiNeural] Batch prediction failed:', err);
        return [];
      }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const API = {
      version: VERSION,
      EVENTS,

      // Model management
      isReady: () => isModelLoaded,
      isTraining: () => isTraining,
      getModelInfo: () => ({
        isLoaded: isModelLoaded,
        trainingDataSize: trainingData.length,
        cacheSize: predictionCache.size,
      }),

      // Stats estimation
      estimateStats,
      updateStatsEstimate,
      calculateBattleScore,

      // Training
      addTrainingSample,
      trainModel,
      evaluateModel,

      // Prediction
      predictMatchup,
      batchPredict,

      // Utilities
      clearCache: () => predictionCache.clear(),
      clearTrainingData: () => { trainingData = []; },
    };

    // Expose globally
    window.FrekiNeural = API;

    return { id: 'freki-neural', init, destroy };
  });
})();
