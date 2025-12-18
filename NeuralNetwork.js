// ==============================================================================
// NEURAL NETWORK - Complete Backpropagation Implementation
// ==============================================================================
// Multi-layer perceptron with configurable architecture, training, and persistence
// For use with Freki AI scoring engine

class NeuralNetwork {
    constructor(config = {}) {
        // Network architecture
        this.layers = config.layers || [15, 24, 16, 1]; // Input, hidden1, hidden2, output
        this.learningRate = config.learningRate || 0.01;
        this.momentum = config.momentum || 0.9;
        this.batchSize = config.batchSize || 32;
        this.epochs = config.epochs || 100;
        this.minDelta = config.minDelta || 0.0001;
        this.patience = config.patience || 10;
        
        // Regularization
        this.l2Lambda = config.l2Lambda || 0.001;
        this.dropout = config.dropout || 0.2;
        this.useDropout = config.useDropout !== false;
        
        // Weight initialization
        this.weights = [];
        this.biases = [];
        this.velocityW = []; // For momentum
        this.velocityB = [];
        
        // Training state
        this.isTraining = false;
        this.trainingHistory = [];
        this.bestWeights = null;
        this.bestLoss = Infinity;
        this.patienceCounter = 0;
        
        // Feature normalization
        this.featureMeans = null;
        this.featureStds = null;
        
        // Initialize weights
        this._initializeWeights();
        
        console.log('[NeuralNetwork] Initialized:', this.layers.join(' → '));
    }
    
    // ==========================================================================
    // WEIGHT INITIALIZATION
    // ==========================================================================
    
    _initializeWeights() {
        this.weights = [];
        this.biases = [];
        this.velocityW = [];
        this.velocityB = [];
        
        for (let i = 0; i < this.layers.length - 1; i++) {
            const inputSize = this.layers[i];
            const outputSize = this.layers[i + 1];
            
            // Xavier/Glorot initialization for better gradient flow
            const limit = Math.sqrt(6 / (inputSize + outputSize));
            
            // Initialize weight matrix
            const weights = [];
            for (let j = 0; j < outputSize; j++) {
                const row = [];
                for (let k = 0; k < inputSize; k++) {
                    row.push((Math.random() * 2 - 1) * limit);
                }
                weights.push(row);
            }
            this.weights.push(weights);
            
            // Initialize bias vector (small positive values to avoid dead neurons)
            const biases = [];
            for (let j = 0; j < outputSize; j++) {
                biases.push(0.01);
            }
            this.biases.push(biases);
            
            // Initialize velocity matrices for momentum
            this.velocityW.push(this._createZeroMatrix(outputSize, inputSize));
            this.velocityB.push(new Array(outputSize).fill(0));
        }
    }
    
    _createZeroMatrix(rows, cols) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            matrix.push(new Array(cols).fill(0));
        }
        return matrix;
    }
    
    // ==========================================================================
    // ACTIVATION FUNCTIONS
    // ==========================================================================
    
    _relu(x) {
        return Math.max(0, x);
    }
    
    _reluDerivative(x) {
        return x > 0 ? 1 : 0;
    }
    
    _leakyRelu(x, alpha = 0.01) {
        return x > 0 ? x : alpha * x;
    }
    
    _leakyReluDerivative(x, alpha = 0.01) {
        return x > 0 ? 1 : alpha;
    }
    
    _sigmoid(x) {
        // Clamp to prevent overflow
        x = Math.max(-500, Math.min(500, x));
        return 1 / (1 + Math.exp(-x));
    }
    
    _sigmoidDerivative(output) {
        return output * (1 - output);
    }
    
    _tanh(x) {
        return Math.tanh(x);
    }
    
    _tanhDerivative(output) {
        return 1 - output * output;
    }
    
    // ==========================================================================
    // FORWARD PROPAGATION
    // ==========================================================================
    
    forward(input, training = false) {
        let activation = Array.isArray(input) ? input : [input];
        const activations = [activation];
        const preActivations = [];
        
        for (let layer = 0; layer < this.weights.length; layer++) {
            const weightMatrix = this.weights[layer];
            const biasVector = this.biases[layer];
            const isOutputLayer = layer === this.weights.length - 1;
            
            // Compute pre-activation (z = Wx + b)
            const z = [];
            for (let j = 0; j < weightMatrix.length; j++) {
                let sum = biasVector[j];
                for (let k = 0; k < activation.length; k++) {
                    sum += weightMatrix[j][k] * activation[k];
                }
                z.push(sum);
            }
            preActivations.push(z);
            
            // Apply activation function
            if (isOutputLayer) {
                // Sigmoid for output layer (probability between 0 and 1)
                activation = z.map(val => this._sigmoid(val));
            } else {
                // Leaky ReLU for hidden layers
                activation = z.map(val => this._leakyRelu(val));
                
                // Apply dropout during training
                if (training && this.useDropout && this.dropout > 0) {
                    activation = activation.map(val => {
                        if (Math.random() < this.dropout) {
                            return 0;
                        }
                        return val / (1 - this.dropout); // Scale to maintain expected value
                    });
                }
            }
            
            activations.push(activation);
        }
        
        return {
            output: activation,
            activations,
            preActivations
        };
    }
    
    predict(input) {
        const { output } = this.forward(input, false);
        return output[0]; // Return single value for binary classification
    }
    
    predictBatch(inputs) {
        return inputs.map(input => this.predict(input));
    }
    
    // ==========================================================================
    // BACKWARD PROPAGATION
    // ==========================================================================
    
    backward(input, target, activations, preActivations) {
        const gradW = [];
        const gradB = [];
        const numLayers = this.weights.length;
        
        // Initialize gradients
        for (let i = 0; i < numLayers; i++) {
            gradW.push(this._createZeroMatrix(this.weights[i].length, this.weights[i][0].length));
            gradB.push(new Array(this.biases[i].length).fill(0));
        }
        
        // Output layer error (Binary Cross-Entropy derivative)
        const outputActivation = activations[activations.length - 1];
        let delta = [];
        
        // For sigmoid output with BCE loss: delta = output - target
        for (let i = 0; i < outputActivation.length; i++) {
            const targetVal = Array.isArray(target) ? target[i] : target;
            delta.push(outputActivation[i] - targetVal);
        }
        
        // Backpropagate through layers
        for (let layer = numLayers - 1; layer >= 0; layer--) {
            const prevActivation = activations[layer];
            
            // Compute gradients for this layer
            for (let j = 0; j < this.weights[layer].length; j++) {
                gradB[layer][j] = delta[j];
                for (let k = 0; k < this.weights[layer][j].length; k++) {
                    gradW[layer][j][k] = delta[j] * prevActivation[k];
                    
                    // Add L2 regularization
                    gradW[layer][j][k] += this.l2Lambda * this.weights[layer][j][k];
                }
            }
            
            // Compute delta for previous layer (if not input layer)
            if (layer > 0) {
                const newDelta = new Array(this.weights[layer][0].length).fill(0);
                
                for (let k = 0; k < newDelta.length; k++) {
                    let sum = 0;
                    for (let j = 0; j < delta.length; j++) {
                        sum += delta[j] * this.weights[layer][j][k];
                    }
                    // Multiply by activation derivative (Leaky ReLU)
                    newDelta[k] = sum * this._leakyReluDerivative(preActivations[layer - 1][k]);
                }
                
                delta = newDelta;
            }
        }
        
        return { gradW, gradB };
    }
    
    // ==========================================================================
    // TRAINING
    // ==========================================================================
    
    async train(trainingData, validationData = null) {
        if (!trainingData || trainingData.length === 0) {
            console.warn('[NeuralNetwork] No training data provided');
            return { success: false, error: 'No training data' };
        }
        
        this.isTraining = true;
        this.trainingHistory = [];
        this.bestLoss = Infinity;
        this.patienceCounter = 0;
        
        // Normalize features
        this._computeNormalization(trainingData);
        const normalizedData = trainingData.map(sample => ({
            input: this._normalizeFeatures(sample.input),
            target: sample.target
        }));
        
        let normalizedValidation = null;
        if (validationData && validationData.length > 0) {
            normalizedValidation = validationData.map(sample => ({
                input: this._normalizeFeatures(sample.input),
                target: sample.target
            }));
        }
        
        console.log(`[NeuralNetwork] Starting training with ${normalizedData.length} samples`);
        
        for (let epoch = 0; epoch < this.epochs; epoch++) {
            // Shuffle training data
            const shuffled = this._shuffle(normalizedData);
            
            let epochLoss = 0;
            let batchCount = 0;
            
            // Process in batches
            for (let i = 0; i < shuffled.length; i += this.batchSize) {
                const batch = shuffled.slice(i, i + this.batchSize);
                
                // Accumulate gradients over batch
                const batchGradW = [];
                const batchGradB = [];
                
                for (let layer = 0; layer < this.weights.length; layer++) {
                    batchGradW.push(this._createZeroMatrix(
                        this.weights[layer].length,
                        this.weights[layer][0].length
                    ));
                    batchGradB.push(new Array(this.biases[layer].length).fill(0));
                }
                
                let batchLoss = 0;
                
                for (const sample of batch) {
                    const { output, activations, preActivations } = this.forward(sample.input, true);
                    const { gradW, gradB } = this.backward(
                        sample.input,
                        sample.target,
                        activations,
                        preActivations
                    );
                    
                    // Accumulate gradients
                    for (let layer = 0; layer < this.weights.length; layer++) {
                        for (let j = 0; j < gradW[layer].length; j++) {
                            batchGradB[layer][j] += gradB[layer][j];
                            for (let k = 0; k < gradW[layer][j].length; k++) {
                                batchGradW[layer][j][k] += gradW[layer][j][k];
                            }
                        }
                    }
                    
                    // Compute loss (Binary Cross-Entropy)
                    batchLoss += this._binaryCrossEntropy(output[0], sample.target);
                }
                
                // Average gradients and update weights
                const batchSizeActual = batch.length;
                
                for (let layer = 0; layer < this.weights.length; layer++) {
                    for (let j = 0; j < this.weights[layer].length; j++) {
                        // Update bias with momentum
                        const bGrad = batchGradB[layer][j] / batchSizeActual;
                        this.velocityB[layer][j] = this.momentum * this.velocityB[layer][j] - this.learningRate * bGrad;
                        this.biases[layer][j] += this.velocityB[layer][j];
                        
                        for (let k = 0; k < this.weights[layer][j].length; k++) {
                            // Update weight with momentum
                            const wGrad = batchGradW[layer][j][k] / batchSizeActual;
                            this.velocityW[layer][j][k] = this.momentum * this.velocityW[layer][j][k] - this.learningRate * wGrad;
                            this.weights[layer][j][k] += this.velocityW[layer][j][k];
                        }
                    }
                }
                
                epochLoss += batchLoss;
                batchCount++;
            }
            
            // Compute average loss
            const avgLoss = epochLoss / normalizedData.length;
            
            // Compute validation loss if provided
            let valLoss = null;
            let valAccuracy = null;
            
            if (normalizedValidation) {
                const valMetrics = this._evaluateValidation(normalizedValidation);
                valLoss = valMetrics.loss;
                valAccuracy = valMetrics.accuracy;
            }
            
            // Record history
            const historyEntry = {
                epoch,
                trainLoss: avgLoss,
                valLoss,
                valAccuracy,
                learningRate: this.learningRate
            };
            this.trainingHistory.push(historyEntry);
            
            // Early stopping check
            const checkLoss = valLoss !== null ? valLoss : avgLoss;
            
            if (checkLoss < this.bestLoss - this.minDelta) {
                this.bestLoss = checkLoss;
                this.bestWeights = this._cloneWeights();
                this.patienceCounter = 0;
            } else {
                this.patienceCounter++;
                
                if (this.patienceCounter >= this.patience) {
                    console.log(`[NeuralNetwork] Early stopping at epoch ${epoch}`);
                    break;
                }
            }
            
            // Log progress every 10 epochs
            if (epoch % 10 === 0 || epoch === this.epochs - 1) {
                let logMsg = `[NeuralNetwork] Epoch ${epoch}: loss=${avgLoss.toFixed(4)}`;
                if (valLoss !== null) {
                    logMsg += `, val_loss=${valLoss.toFixed(4)}, val_acc=${(valAccuracy * 100).toFixed(1)}%`;
                }
                console.log(logMsg);
            }
            
            // Allow UI to update
            if (epoch % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        
        // Restore best weights
        if (this.bestWeights) {
            this.weights = this.bestWeights.weights;
            this.biases = this.bestWeights.biases;
        }
        
        this.isTraining = false;
        
        const finalMetrics = validationData 
            ? this._evaluateValidation(normalizedValidation)
            : { loss: this.bestLoss, accuracy: null };
        
        console.log(`[NeuralNetwork] Training complete. Final loss: ${finalMetrics.loss.toFixed(4)}`);
        
        return {
            success: true,
            epochs: this.trainingHistory.length,
            finalLoss: finalMetrics.loss,
            finalAccuracy: finalMetrics.accuracy,
            history: this.trainingHistory
        };
    }
    
    _evaluateValidation(validationData) {
        let totalLoss = 0;
        let correct = 0;
        
        for (const sample of validationData) {
            const prediction = this.predict(sample.input);
            totalLoss += this._binaryCrossEntropy(prediction, sample.target);
            
            // Accuracy for binary classification
            const predictedClass = prediction >= 0.5 ? 1 : 0;
            const actualClass = sample.target >= 0.5 ? 1 : 0;
            if (predictedClass === actualClass) {
                correct++;
            }
        }
        
        return {
            loss: totalLoss / validationData.length,
            accuracy: correct / validationData.length
        };
    }
    
    _binaryCrossEntropy(predicted, actual) {
        // Clamp to avoid log(0)
        const eps = 1e-15;
        const p = Math.max(eps, Math.min(1 - eps, predicted));
        return -(actual * Math.log(p) + (1 - actual) * Math.log(1 - p));
    }
    
    // ==========================================================================
    // NORMALIZATION
    // ==========================================================================
    
    _computeNormalization(trainingData) {
        if (!trainingData || trainingData.length === 0) return;
        
        const numFeatures = trainingData[0].input.length;
        this.featureMeans = new Array(numFeatures).fill(0);
        this.featureStds = new Array(numFeatures).fill(0);
        
        // Compute means
        for (const sample of trainingData) {
            for (let i = 0; i < numFeatures; i++) {
                this.featureMeans[i] += sample.input[i];
            }
        }
        for (let i = 0; i < numFeatures; i++) {
            this.featureMeans[i] /= trainingData.length;
        }
        
        // Compute standard deviations
        for (const sample of trainingData) {
            for (let i = 0; i < numFeatures; i++) {
                const diff = sample.input[i] - this.featureMeans[i];
                this.featureStds[i] += diff * diff;
            }
        }
        for (let i = 0; i < numFeatures; i++) {
            this.featureStds[i] = Math.sqrt(this.featureStds[i] / trainingData.length);
            if (this.featureStds[i] < 1e-8) {
                this.featureStds[i] = 1; // Avoid division by zero
            }
        }
    }
    
    _normalizeFeatures(input) {
        if (!this.featureMeans || !this.featureStds) {
            return input;
        }
        
        return input.map((val, i) => {
            return (val - this.featureMeans[i]) / this.featureStds[i];
        });
    }
    
    // ==========================================================================
    // UTILITY METHODS
    // ==========================================================================
    
    _shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    _cloneWeights() {
        return {
            weights: this.weights.map(layer => 
                layer.map(row => [...row])
            ),
            biases: this.biases.map(layer => [...layer])
        };
    }
    
    // ==========================================================================
    // SERIALIZATION
    // ==========================================================================
    
    serialize() {
        return JSON.stringify({
            version: '1.0',
            layers: this.layers,
            learningRate: this.learningRate,
            momentum: this.momentum,
            l2Lambda: this.l2Lambda,
            dropout: this.dropout,
            weights: this.weights,
            biases: this.biases,
            featureMeans: this.featureMeans,
            featureStds: this.featureStds,
            trainingHistory: this.trainingHistory,
            bestLoss: this.bestLoss
        });
    }
    
    static deserialize(json) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        
        const network = new NeuralNetwork({
            layers: data.layers,
            learningRate: data.learningRate,
            momentum: data.momentum,
            l2Lambda: data.l2Lambda,
            dropout: data.dropout
        });
        
        network.weights = data.weights;
        network.biases = data.biases;
        network.featureMeans = data.featureMeans;
        network.featureStds = data.featureStds;
        network.trainingHistory = data.trainingHistory || [];
        network.bestLoss = data.bestLoss || Infinity;
        
        // Reinitialize velocity matrices
        network.velocityW = [];
        network.velocityB = [];
        for (let i = 0; i < network.weights.length; i++) {
            network.velocityW.push(network._createZeroMatrix(
                network.weights[i].length,
                network.weights[i][0].length
            ));
            network.velocityB.push(new Array(network.biases[i].length).fill(0));
        }
        
        return network;
    }
    
    toJSON() {
        return {
            layers: this.layers,
            weights: this.weights,
            biases: this.biases,
            featureMeans: this.featureMeans,
            featureStds: this.featureStds
        };
    }
    
    static fromJSON(json) {
        return NeuralNetwork.deserialize(json);
    }
    
    // ==========================================================================
    // DIAGNOSTICS
    // ==========================================================================
    
    getStats() {
        let totalParams = 0;
        
        for (let i = 0; i < this.weights.length; i++) {
            const weights = this.weights[i];
            const biases = this.biases[i];
            totalParams += weights.length * weights[0].length + biases.length;
        }
        
        return {
            architecture: this.layers.join(' → '),
            totalParameters: totalParams,
            learningRate: this.learningRate,
            momentum: this.momentum,
            dropout: this.dropout,
            l2Regularization: this.l2Lambda,
            isTraining: this.isTraining,
            trainedEpochs: this.trainingHistory.length,
            bestLoss: this.bestLoss,
            hasNormalization: this.featureMeans !== null
        };
    }
    
    getTrainingHistory() {
        return [...this.trainingHistory];
    }
}

// Export for use in Tampermonkey
if (typeof window !== 'undefined') {
    window.NeuralNetwork = NeuralNetwork;
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NeuralNetwork;
}
