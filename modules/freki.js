/**
 * Odin Tools - Freki AI Target Scoring Engine
 * Self-learning neural network for target analysis
 * Version: 5.0.0
 * Author: BjornOdinsson89
 * Feedforward neural network with backpropagation
 * Xavier/Glorot initialization
 * Momentum, Dropout (training only), L2 regularization
 * Global: window.NeuralNetwork
 **/

(function() {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

  // ============================================================
  // EMBEDDED NEURAL NETWORK
  // ============================================================
  if (!window.NeuralNetwork) {
  function randUniform(min, max) {
      return min + Math.random() * (max - min);
    }
  
    function xavierLimit(fanIn, fanOut) {
      return Math.sqrt(6 / (fanIn + fanOut));
    }
  
    function sigmoid(x) {
      if (x < -45) return 0;
      if (x > 45) return 1;
      return 1 / (1 + Math.exp(-x));
    }
  
    function dsigmoid(y) {
      return y * (1 - y);
    }
  
    function tanh(x) {
      if (typeof Math.tanh === 'function') return Math.tanh(x);
      const e2 = Math.exp(2 * x);
      return (e2 - 1) / (e2 + 1);
    }
  
    function dtanh(y) {
      return 1 - (y * y);
    }
  
    function zeros(n) {
      const a = new Array(n);
      for (let i = 0; i < n; i++) a[i] = 0;
      return a;
    }
  
    function clone2D(mat) {
      return mat.map((row) => row.slice());
    }
  
    class NeuralNetwork {
      constructor(opts) {
        const o = opts || {};
        const layers = Array.isArray(o.layers) ? o.layers.slice() : null;
        if (!layers || layers.length < 2) {
          throw new Error('NeuralNetwork requires layers: [in, ..., out]');
        }
        this.layers = layers;
        this.learningRate = Number.isFinite(o.learningRate) ? o.learningRate : 0.01;
        this.momentum = Number.isFinite(o.momentum) ? o.momentum : 0.9;
        this.dropout = Number.isFinite(o.dropout) ? o.dropout : 0.0; // 0..1
        this.l2Lambda = Number.isFinite(o.l2Lambda) ? o.l2Lambda : 0.0;
  
        this.weights = [];
        this.biases = [];
        this.vW = [];
        this.vB = [];
  
        this._initParams();
      }
  
      _initParams() {
        this.weights.length = 0;
        this.biases.length = 0;
        this.vW.length = 0;
        this.vB.length = 0;
  
        for (let l = 0; l < this.layers.length - 1; l++) {
          const fanIn = this.layers[l];
          const fanOut = this.layers[l + 1];
          const lim = xavierLimit(fanIn, fanOut);
  
          const w = new Array(fanOut);
          const vw = new Array(fanOut);
          for (let i = 0; i < fanOut; i++) {
            w[i] = new Array(fanIn);
            vw[i] = new Array(fanIn);
            for (let j = 0; j < fanIn; j++) {
              w[i][j] = randUniform(-lim, lim);
              vw[i][j] = 0;
            }
          }
  
          const b = zeros(fanOut);
          const vb = zeros(fanOut);
  
          this.weights.push(w);
          this.biases.push(b);
          this.vW.push(vw);
          this.vB.push(vb);
        }
      }
  
      _forward(input, training) {
        const a = [];
        const z = [];
        const dropoutMask = [];
  
        a[0] = input.slice();
  
        for (let l = 0; l < this.weights.length; l++) {
          const w = this.weights[l];
          const b = this.biases[l];
  
          const outSize = w.length;
          const inSize = w[0].length;
  
          const zL = new Array(outSize);
          const aL = new Array(outSize);
  
          for (let i = 0; i < outSize; i++) {
            let sum = b[i];
            for (let j = 0; j < inSize; j++) sum += w[i][j] * a[l][j];
            zL[i] = sum;
  
            // hidden layers: tanh, output layer: sigmoid
            if (l === this.weights.length - 1) aL[i] = sigmoid(sum);
            else aL[i] = tanh(sum);
          }
  
          // Dropout on hidden layers during training
          if (training && this.dropout > 0 && l < this.weights.length - 1) {
            const keepProb = 1 - this.dropout;
            const mask = new Array(outSize);
            for (let i = 0; i < outSize; i++) {
              const keep = Math.random() < keepProb ? 1 : 0;
              mask[i] = keep;
              aL[i] = (aL[i] * keep) / keepProb;
            }
            dropoutMask[l] = mask;
          }
  
          z[l + 1] = zL;
          a[l + 1] = aL;
        }
  
        return { a, z, dropoutMask };
      }
  
      predict(input) {
        const x = Array.isArray(input) ? input : [];
        const { a } = this._forward(x, false);
        return a[a.length - 1].slice();
      }
  
      train(input, target) {
        const x = Array.isArray(input) ? input : [];
        const y = Array.isArray(target) ? target : [Number(target) || 0];
  
        const { a, z } = this._forward(x, true);
  
        // backprop deltas
        const deltas = new Array(this.layers.length);
  
        const L = this.layers.length - 1;
        deltas[L] = new Array(this.layers[L]);
  
        // output delta: (yhat - y) * dsigmoid(yhat)
        for (let i = 0; i < this.layers[L]; i++) {
          const yhat = a[L][i];
          const err = (yhat - (y[i] ?? 0));
          deltas[L][i] = err * dsigmoid(yhat);
        }
  
        // hidden layers
        for (let l = L - 1; l >= 1; l--) {
          deltas[l] = new Array(this.layers[l]);
          const wNext = this.weights[l]; // weights from l -> l+1 (index l because weights start at 0)
          for (let j = 0; j < this.layers[l]; j++) {
            let sum = 0;
            for (let i = 0; i < this.layers[l + 1]; i++) {
              sum += wNext[i][j] * deltas[l + 1][i];
            }
            const act = a[l][j];
            deltas[l][j] = sum * dtanh(act);
          }
        }
  
        // gradient update
        for (let l = 0; l < this.weights.length; l++) {
          const w = this.weights[l];
          const b = this.biases[l];
          const vw = this.vW[l];
          const vb = this.vB[l];
  
          const outSize = w.length;
          const inSize = w[0].length;
  
          for (let i = 0; i < outSize; i++) {
            // bias update
            const gradB = deltas[l + 1][i];
            vb[i] = (this.momentum * vb[i]) - (this.learningRate * gradB);
            b[i] += vb[i];
  
            for (let j = 0; j < inSize; j++) {
              const gradW = deltas[l + 1][i] * a[l][j] + (this.l2Lambda * w[i][j]);
              vw[i][j] = (this.momentum * vw[i][j]) - (this.learningRate * gradW);
              w[i][j] += vw[i][j];
            }
          }
        }
  
        // simple loss (MSE)
        let loss = 0;
        const yhat = a[L];
        for (let i = 0; i < yhat.length; i++) {
          const e = (yhat[i] - (y[i] ?? 0));
          loss += e * e;
        }
        loss /= yhat.length;
  
        return { loss };
      }
  
      trainBatch(samples) {
        if (!Array.isArray(samples) || samples.length === 0) return { loss: 0 };
        let total = 0;
        for (const s of samples) {
          const inp = s && s.input ? s.input : [];
          const out = s && s.output ? s.output : (s && s.target ? s.target : [0]);
          const r = this.train(inp, out);
          total += r.loss || 0;
        }
        return { loss: total / samples.length };
      }
  
      serialize() {
        return {
          type: 'NeuralNetwork',
          version: '5.0.0',
          layers: this.layers.slice(),
          learningRate: this.learningRate,
          momentum: this.momentum,
          dropout: this.dropout,
          l2Lambda: this.l2Lambda,
          weights: this.weights,
          biases: this.biases
        };
      }
  
      static deserialize(data) {
        const d = data && typeof data === 'object' ? data : null;
        if (!d || !Array.isArray(d.layers) || !Array.isArray(d.weights) || !Array.isArray(d.biases)) {
          throw new Error('Invalid NeuralNetwork model');
        }
        const nn = new NeuralNetwork({
          layers: d.layers,
          learningRate: d.learningRate,
          momentum: d.momentum,
          dropout: d.dropout,
          l2Lambda: d.l2Lambda
        });
        nn.weights = d.weights.map((m) => m.map((r) => r.slice()));
        nn.biases = d.biases.map((v) => v.slice());
  
        // reset velocities to zeros
        nn.vW = nn.weights.map((w) => w.map((row) => row.map(() => 0)));
        nn.vB = nn.biases.map((b) => b.map(() => 0));
  
        return nn;
      }
    }
  window.NeuralNetwork = NeuralNetwork;
  }

  window.OdinModules.push(function FrekiAIModuleInit(OdinContext) {
    const ctx = OdinContext || {};

    if (window.NeuralNetwork) {
      ctx.NeuralNetwork = window.NeuralNetwork;
      if (!window.__ODIN_NN_READY__) {
        window.__ODIN_NN_READY__ = true;
        try { ctx.nexus && typeof ctx.nexus.emit === 'function' && ctx.nexus.emit('NEURAL_NETWORK_READY', { version: '5.0.0', embedded: true }); } catch (e) {}
      }
    }

    const storage = ctx.storage || { getJSON: () => null, setJSON: () => {}, get: () => null, set: () => {} };
    const nexus = ctx.nexus || { emit: () => {}, on: () => () => {} };
    const log = ctx.log || console.log;
    const error = ctx.error || console.error;

    const FREKI_VERSION = '4.2.0';

    // ============================================
    // CACHE WITH EXPIRATION
    // ============================================
    const analysisCache = new Map();
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    const MAX_CACHE_SIZE = 500;

    // Periodic cache cleanup
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of analysisCache) {
        if (now - value.timestamp > CACHE_TTL) {
          analysisCache.delete(key);
        }
      }
      // Enforce size limit
      if (analysisCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(analysisCache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (let i = 0; i < entries.length - MAX_CACHE_SIZE * 0.8; i++) {
          analysisCache.delete(entries[i][0]);
        }
      }
    }, 60000);

    // ============================================
    // NEURAL NETWORK - USE ADVANCED IMPLEMENTATION
    // ============================================
    let neuralNet = null;
    let modelVersion = 'local-v2';
    let trainingData = [];

    // Feature specification:
    // 0: normalized attacker level (0-1)
    // 1: normalized defender level (0-1)
    // 2: level difference (normalized)
    // 3: defender activity score (0-1)
    // 4: defender hospital status (0/1)
    // 5: chain position (normalized)
    // 6: war status (0/1)
    // 7: TornStats score (normalized, 0 if unavailable)
    // 8: FFScouter score (normalized, 0 if unavailable)
    // 9: historical win rate against similar targets
    // 10: time of day factor (0-1)
    // 11: day of week factor (0-1)
    // 12: defender online status (0/1)
    // 13: fair fight modifier estimate
    // 14: respect modifier estimate

    // Output:
    // 0: win probability

    function initNeuralNetwork() {
      // Use advanced NeuralNetwork if available, otherwise create fallback
      if (window.NeuralNetwork) {
        neuralNet = new window.NeuralNetwork({
          layers: [15, 24, 16, 1],  // 15 inputs, 2 hidden layers, 1 output
          learningRate: 0.01,
          momentum: 0.9,
          dropout: 0.2,
          l2Lambda: 0.001
        });
        log('[Freki] Using advanced NeuralNetwork implementation');
      } else {
        // Fallback to simple implementation
        neuralNet = createSimpleNetwork(15, 24, 1);
        log('[Freki] Using fallback neural network');
      }

      // Try to load saved model
      try {
        const savedModel = storage.getJSON('freki_model_v2');
        if (savedModel) {
          if (window.NeuralNetwork && savedModel.layers) {
            neuralNet = window.NeuralNetwork.deserialize(savedModel);
          } else if (savedModel.weightsIH) {
            loadSimpleModel(savedModel);
          }
          modelVersion = savedModel.version || 'local-v2';
          log('[Freki] Loaded saved model:', modelVersion);
        }
      } catch (e) {
        log('[Freki] No saved model found, using fresh network');
      }

      // Load training data
      try {
        const savedTraining = storage.getJSON('freki_training_v2');
        if (Array.isArray(savedTraining)) {
          trainingData = savedTraining.slice(-1000); // Keep last 1000
          log('[Freki] Loaded', trainingData.length, 'training samples');
        }
      } catch (e) {
        log('[Freki] No training data found');
      }
    }

    // Fallback simple network for when advanced class isn't loaded
    function createSimpleNetwork(inputSize, hiddenSize, outputSize) {
      const scale = Math.sqrt(2.0 / (inputSize + hiddenSize));
      
      function initWeights(rows, cols) {
        const w = [];
        for (let i = 0; i < rows; i++) {
          w[i] = [];
          for (let j = 0; j < cols; j++) {
            w[i][j] = (Math.random() * 2 - 1) * scale;
          }
        }
        return w;
      }

      return {
        inputSize,
        hiddenSize,
        outputSize,
        weightsIH: initWeights(inputSize, hiddenSize),
        weightsHO: initWeights(hiddenSize, outputSize),
        biasH: new Array(hiddenSize).fill(0.01),
        biasO: new Array(outputSize).fill(0.01),
        learningRate: 0.01,

        sigmoid(x) {
          x = Math.max(-500, Math.min(500, x));
          return 1 / (1 + Math.exp(-x));
        },

        relu(x) {
          return Math.max(0, x);
        },

        predict(inputs) {
          // Input to hidden
          const hidden = [];
          for (let i = 0; i < this.hiddenSize; i++) {
            let sum = this.biasH[i];
            for (let j = 0; j < this.inputSize; j++) {
              sum += inputs[j] * this.weightsIH[j][i];
            }
            hidden[i] = this.relu(sum);
          }

          // Hidden to output
          let output = this.biasO[0];
          for (let j = 0; j < this.hiddenSize; j++) {
            output += hidden[j] * this.weightsHO[j][0];
          }
          return this.sigmoid(output);
        },

        train(inputs, target) {
          // Simple gradient descent training
          const prediction = this.predict(inputs);
          const outputError = target - prediction;
          
          // Compute hidden layer
          const hidden = [];
          for (let i = 0; i < this.hiddenSize; i++) {
            let sum = this.biasH[i];
            for (let j = 0; j < this.inputSize; j++) {
              sum += inputs[j] * this.weightsIH[j][i];
            }
            hidden[i] = this.relu(sum);
          }

          // Update output weights
          const outputDelta = outputError * prediction * (1 - prediction);
          for (let j = 0; j < this.hiddenSize; j++) {
            this.weightsHO[j][0] += this.learningRate * outputDelta * hidden[j];
          }
          this.biasO[0] += this.learningRate * outputDelta;

          // Update hidden weights
          for (let i = 0; i < this.hiddenSize; i++) {
            const hiddenError = outputDelta * this.weightsHO[i][0];
            const hiddenDelta = hidden[i] > 0 ? hiddenError : 0;
            for (let j = 0; j < this.inputSize; j++) {
              this.weightsIH[j][i] += this.learningRate * hiddenDelta * inputs[j];
            }
            this.biasH[i] += this.learningRate * hiddenDelta;
          }
        },

        serialize() {
          return {
            inputSize: this.inputSize,
            hiddenSize: this.hiddenSize,
            outputSize: this.outputSize,
            weightsIH: this.weightsIH,
            weightsHO: this.weightsHO,
            biasH: this.biasH,
            biasO: this.biasO,
            learningRate: this.learningRate
          };
        }
      };
    }

    function loadSimpleModel(data) {
      if (!neuralNet) return;
      neuralNet.weightsIH = data.weightsIH;
      neuralNet.weightsHO = data.weightsHO;
      neuralNet.biasH = data.biasH;
      neuralNet.biasO = data.biasO;
      neuralNet.learningRate = data.learningRate || 0.01;
    }

    function saveModel() {
      try {
        let modelData;
        if (neuralNet.serialize) {
          modelData = typeof neuralNet.serialize === 'function' 
            ? (typeof neuralNet.serialize() === 'string' 
              ? JSON.parse(neuralNet.serialize()) 
              : neuralNet.serialize())
            : neuralNet;
        } else {
          modelData = {
            weightsIH: neuralNet.weightsIH,
            weightsHO: neuralNet.weightsHO,
            biasH: neuralNet.biasH,
            biasO: neuralNet.biasO,
            learningRate: neuralNet.learningRate
          };
        }
        modelData.version = modelVersion;
        modelData.savedAt = Date.now();
        storage.setJSON('freki_model_v2', modelData);
      } catch (e) {
        error('[Freki] Failed to save model:', e);
      }
    }

    function saveTrainingData() {
      try {
        if (trainingData.length > 1000) {
          trainingData = trainingData.slice(-1000);
        }
        storage.setJSON('freki_training_v2', trainingData);
      } catch (e) {
        error('[Freki] Failed to save training data:', e);
      }
    }

    // ============================================
    // FEATURE EXTRACTION
    // ============================================
    function normalizeLevel(level) {
      return Math.min(1, level / 100);
    }

    function normalizeStats(total) {
      return Math.min(1, Math.log10(1 + total) / 10);
    }

    function getActivityScore(defenderData) {
      const lastAction = defenderData.lastAction || '';
      
      if (lastAction.includes('minute')) {
        return 1.0;
      }
      if (lastAction.includes('hour')) {
        const hours = parseInt(lastAction) || 1;
        return Math.max(0.3, 1 - (hours * 0.1));
      }
      if (lastAction.includes('day')) {
        const days = parseInt(lastAction) || 1;
        return Math.max(0.1, 0.3 - (days * 0.05));
      }
      return 0.5;
    }

    function extractFeatures(attackerData, defenderData, context = {}) {
      // Validate and sanitize inputs to prevent NaN
      const attackerLevel = Number(attackerData?.level) || 1;
      const defenderLevel = Number(defenderData?.level) || 1;
      const now = new Date();

      // Helper to ensure valid number in range [0, 1]
      function safeNormalize(value, defaultVal = 0) {
        const num = Number(value);
        if (!isFinite(num) || isNaN(num)) return defaultVal;
        return Math.max(0, Math.min(1, num));
      }

      const features = [
        safeNormalize(normalizeLevel(attackerLevel)),                     // 0
        safeNormalize(normalizeLevel(defenderLevel)),                     // 1
        safeNormalize((attackerLevel - defenderLevel + 100) / 200, 0.5),  // 2
        safeNormalize(getActivityScore(defenderData || {}), 0.5),         // 3
        defenderData?.status === 'Hospital' ? 1 : 0,                      // 4
        safeNormalize((context?.chain || 0) / 1000),                      // 5
        context?.inWar ? 1 : 0,                                           // 6
        defenderData?.tornStatsScore ? safeNormalize(normalizeStats(defenderData.tornStatsScore)) : 0, // 7
        defenderData?.ffScouterScore ? safeNormalize(normalizeStats(defenderData.ffScouterScore)) : 0, // 8
        safeNormalize(context?.historicalWinRate, 0.5),                   // 9
        safeNormalize(now.getHours() / 24),                               // 10
        safeNormalize(now.getDay() / 7),                                  // 11
        defenderData?.isOnline ? 1 : 0,                                   // 12
        safeNormalize((context?.estimatedFF || 3) / 8),                   // 13
        safeNormalize((context?.estimatedRespect || 2) / 10)              // 14
      ];

      // Final validation: ensure all features are valid numbers
      return features.map(f => isFinite(f) && !isNaN(f) ? f : 0);
    }

    // ============================================
    // HEURISTIC SCORING
    // ============================================
    function heuristicScore(attackerData, defenderData, context = {}) {
      let score = 50;

      const levelDiff = (attackerData.level || 50) - (defenderData.level || 50);
      score += levelDiff * 0.5;

      const activity = getActivityScore(defenderData);
      if (activity < 0.3) {
        score += 15;
      } else if (activity > 0.8) {
        score -= 10;
      }

      if (defenderData.status === 'Hospital') {
        score += 20;
      }

      if (context.inWar) {
        score += 10;
      }

      if (defenderData.tornStatsScore) {
        const statsRatio = (attackerData.tornStatsScore || 1e8) / defenderData.tornStatsScore;
        if (statsRatio > 2) score += 15;
        else if (statsRatio > 1) score += 10;
        else if (statsRatio < 0.5) score -= 15;
        else if (statsRatio < 1) score -= 5;
      }

      return Math.max(0, Math.min(100, Math.round(score)));
    }

    // ============================================
    // TARGET ANALYSIS
    // ============================================
    async function analyzeTarget(playerId, defenderData = {}, options = {}) {
      const cacheKey = String(playerId);
      
      // Check cache
      const cached = analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
      }

      // Get attacker data
      const attackerData = {
        level: ctx.userLevel || options.attackerLevel || 50,
        tornStatsScore: options.attackerStats || null
      };

      // Enrich defender data if needed
      if (!defenderData.level && ctx.api) {
        try {
          const apiData = await ctx.api.getUser(playerId, 'profile');
          defenderData = {
            ...defenderData,
            level: apiData.level,
            status: apiData.status?.state,
            lastAction: apiData.last_action?.relative,
            isOnline: apiData.last_action?.status === 'Online'
          };
        } catch (e) {
          log('[Freki] Failed to fetch player data:', e.message);
        }
      }

      // Calculate heuristic score
      const hScore = heuristicScore(attackerData, defenderData, options);

      // Calculate neural network score
      let nnScore = 50;
      let winProbability = 0.5;

      if (neuralNet) {
        try {
          const features = extractFeatures(attackerData, defenderData, options);
          
          if (typeof neuralNet.predict === 'function') {
            winProbability = neuralNet.predict(features);
          } else if (neuralNet.forward) {
            const result = neuralNet.forward(features);
            winProbability = result.output ? result.output[0] : result[0];
          }
          
          // Validate output
          if (isNaN(winProbability) || !isFinite(winProbability)) {
            winProbability = 0.5;
          }
          
          nnScore = Math.round(winProbability * 100);
        } catch (e) {
          error('[Freki] Neural network prediction failed:', e);
          nnScore = hScore;
        }
      }

      // Combine scores (weighted average)
      const trainingWeight = Math.min(0.7, trainingData.length / 200);
      const finalScore = Math.round(
        nnScore * trainingWeight + 
        hScore * (1 - trainingWeight)
      );

      // Determine tier
      let tier = 'low';
      if (finalScore >= 75) tier = 'excellent';
      else if (finalScore >= 60) tier = 'good';
      else if (finalScore >= 45) tier = 'moderate';
      else if (finalScore >= 30) tier = 'risky';

      const result = {
        playerId,
        score: finalScore,
        tier,
        confidence: Math.round(trainingWeight * 100),
        winProbability: Math.round(winProbability * 100),
        heuristicScore: hScore,
        neuralScore: nnScore,
        factors: {
          levelAdvantage: (attackerData.level || 50) - (defenderData.level || 50),
          activityScore: getActivityScore(defenderData),
          isHospitalized: defenderData.status === 'Hospital',
          inWar: options.inWar || false
        },
        timestamp: Date.now(),
        source: trainingData.length >= 20 ? 'neural' : 'heuristic',
        modelVersion
      };

      // Cache result
      analysisCache.set(cacheKey, { data: result, timestamp: Date.now() });

      return result;
    }

    // ============================================
    // SELF-LEARNING
    // ============================================
    function recordFightOutcome(fightData) {
      const {
        targetId,
        targetLevel,
        targetStatus,
        result,
        respect,
        fairFight,
        chain,
        inWar
      } = fightData;

      const attackerData = {
        level: ctx.userLevel || 50,
        tornStatsScore: null
      };

      const defenderData = {
        level: targetLevel || 1,
        status: targetStatus || 'Ok',
        lastAction: 'Unknown',
        tornStatsScore: null,
        ffScouterScore: null
      };

      const context = {
        chain: chain || 0,
        inWar: inWar || false,
        historicalWinRate: 0.5,
        estimatedFF: fairFight || 3,
        estimatedRespect: respect || 2
      };

      const features = extractFeatures(attackerData, defenderData, context);
      const targetValue = result === 'win' ? 1 : 0;

      // Add to training data
      trainingData.push({
        features,
        target: targetValue,
        timestamp: Date.now(),
        targetId,
        result,
        respect,
        fairFight
      });

      // Train network
      if (neuralNet && typeof neuralNet.train === 'function') {
        try {
          neuralNet.train(features, targetValue);
        } catch (e) {
          error('[Freki] Training failed:', e);
        }
      }

      // Save periodically
      if (trainingData.length % 10 === 0) {
        saveModel();
        saveTrainingData();
      }

      // Invalidate cache
      analysisCache.delete(String(targetId));

      // Submit to Firebase
      if (ctx.firebase && ctx.firebase.submitFightOutcome) {
        ctx.firebase.submitFightOutcome({
          attackerLevel: attackerData.level,
          defenderLevel: defenderData.level,
          result,
          respect,
          fairFight,
          chain,
          inWar
        }).catch(e => {
          log('[Freki] Failed to submit fight to Firebase:', e);
        });
      }

      log('[Freki] Recorded fight:', { targetId, result, trainingCount: trainingData.length });
    }

    // ============================================
    // BATCH ANALYSIS
    // ============================================
    async function analyzeTargets(targets, options = {}) {
      const results = [];
      
      for (const target of targets) {
        try {
          const analysis = await analyzeTarget(
            target.id || target.playerId,
            target,
            options
          );
          results.push(analysis);
        } catch (e) {
          error('[Freki] Failed to analyze target:', target.id, e);
          results.push({
            playerId: target.id || target.playerId,
            error: e.message,
            score: 50,
            tier: 'unknown',
            source: 'error'
          });
        }
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      return results;
    }

    // ============================================
    // COMMUNITY MODEL SYNC
    // ============================================
    async function syncCommunityModel() {
      if (!ctx.firebase || !ctx.firebase.getDoc) return false;

      try {
        // Fetch community model from Firestore
        const modelDoc = await ctx.firebase.getDoc('freki/models', 'community-v1');
        if (!modelDoc) {
          log('[Freki] No community model found');
          return false;
        }

        const communityModel = modelDoc;

        // Handle advanced NeuralNetwork format
        if (communityModel.type === 'NeuralNetwork' && communityModel.weights) {
          if (window.NeuralNetwork && neuralNet instanceof window.NeuralNetwork) {
            // Both are advanced networks - merge weights
            if (trainingData.length >= 20) {
              // Weighted merge: 70% local, 30% community
              for (let l = 0; l < neuralNet.weights.length && l < communityModel.weights.length; l++) {
                for (let i = 0; i < neuralNet.weights[l].length && i < communityModel.weights[l].length; i++) {
                  for (let j = 0; j < neuralNet.weights[l][i].length && j < communityModel.weights[l][i].length; j++) {
                    neuralNet.weights[l][i][j] =
                      0.7 * neuralNet.weights[l][i][j] +
                      0.3 * communityModel.weights[l][i][j];
                  }
                }
              }
              log('[Freki] Merged with community model (advanced format)');
            } else {
              // Use community model directly
              neuralNet = window.NeuralNetwork.deserialize(communityModel);
              log('[Freki] Loaded community model (advanced format)');
            }
          }
        }
        // Handle simple network format (legacy)
        else if (communityModel.weightsIH && communityModel.weightsHO) {
          if (neuralNet && neuralNet.weightsIH && trainingData.length >= 20) {
            // Weighted merge: 70% local, 30% community
            for (let i = 0; i < neuralNet.weightsIH.length && i < communityModel.weightsIH.length; i++) {
              for (let j = 0; j < neuralNet.weightsIH[i].length && j < communityModel.weightsIH[i].length; j++) {
                neuralNet.weightsIH[i][j] =
                  0.7 * neuralNet.weightsIH[i][j] +
                  0.3 * communityModel.weightsIH[i][j];
              }
            }
            for (let i = 0; i < neuralNet.weightsHO.length && i < communityModel.weightsHO.length; i++) {
              for (let j = 0; j < neuralNet.weightsHO[i].length && j < communityModel.weightsHO[i].length; j++) {
                neuralNet.weightsHO[i][j] =
                  0.7 * neuralNet.weightsHO[i][j] +
                  0.3 * communityModel.weightsHO[i][j];
              }
            }
            log('[Freki] Merged with community model (simple format)');
          } else {
            // Use community model directly for new users
            loadSimpleModel(communityModel);
            log('[Freki] Loaded community model (simple format)');
          }
        }

        modelVersion = communityModel.version || 'community-v1';
        saveModel();
        log('[Freki] Synced with community model:', modelVersion);
        return true;
      } catch (e) {
        error('[Freki] Failed to sync community model:', e);
        return false;
      }
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function getCached(playerId) {
      const cached = analysisCache.get(String(playerId));
      return cached ? cached.data : null;
    }

    function invalidateCache(playerId) {
      if (playerId) {
        analysisCache.delete(String(playerId));
      } else {
        analysisCache.clear();
      }
    }

    function getModelInfo() {
      return {
        version: modelVersion,
        trainingCount: trainingData.length,
        cacheSize: analysisCache.size,
        networkType: window.NeuralNetwork ? 'advanced' : 'simple',
        networkSize: neuralNet ? {
          input: neuralNet.inputSize || neuralNet.layers?.[0] || 15,
          hidden: neuralNet.hiddenSize || neuralNet.layers?.slice(1, -1).join('→') || 24,
          output: neuralNet.outputSize || neuralNet.layers?.[neuralNet.layers?.length - 1] || 1
        } : null
      };
    }

    function getTrainingStats() {
      if (trainingData.length === 0) return null;

      const wins = trainingData.filter(t => t.result === 'win').length;
      const losses = trainingData.filter(t => t.result === 'loss').length;
      const avgRespect = trainingData
        .filter(t => t.respect)
        .reduce((sum, t) => sum + t.respect, 0) / trainingData.length || 0;

      return {
        totalSamples: trainingData.length,
        wins,
        losses,
        winRate: wins / trainingData.length,
        avgRespect: Math.round(avgRespect * 100) / 100,
        oldestSample: trainingData[0]?.timestamp,
        newestSample: trainingData[trainingData.length - 1]?.timestamp
      };
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const Freki = {
      version: FREKI_VERSION,

      // Analysis
      analyzeTarget,
      analyzeTargets,

      // Self-learning
      recordFightOutcome,
      syncCommunityModel,

      // Cache
      getCached,
      invalidateCache,

      // Info
      getModelInfo,
      getTrainingStats,

      // Heuristics
      heuristicScore,
      getActivityScore
    };

    // ============================================
    // MODULE LIFECYCLE
    // ============================================
    function init() {
      log('[Freki AI] Initializing v' + FREKI_VERSION);

      initNeuralNetwork();

      // Expose globally
      window.Freki = Freki;
      ctx.freki = Freki;

      // Sync community model on startup (after delay)
      setTimeout(() => {
        syncCommunityModel();
      }, 5000);

      // Listen for fight outcomes
      nexus.on?.('FIGHT_OUTCOME', recordFightOutcome);

      log('[Freki AI] Ready with', trainingData.length, 'training samples');
    }

    function destroy() {
      log('[Freki AI] Destroying...');
      saveModel();
      saveTrainingData();
      analysisCache.clear();
      window.Freki = null;
      log('[Freki AI] Destroyed');
    }

    return { id: 'freki-ai', init, destroy };
  });
})();
