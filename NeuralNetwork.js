/**
 * Odin Tools - Neural Network Module
 * Complete feedforward neural network with backpropagation
 * 
 * @version 3.1.0
 * @author Houston
 */

class NeuralNetwork {
    constructor(config = {}) {
        this.layers = config.layers || [10, 8, 6, 1]; // Input, hidden layers, output
        this.learningRate = config.learningRate || 0.01;
        this.momentum = config.momentum || 0.9;
        this.regularization = config.regularization || 0.0001;
        
        // Initialize network
        this.weights = [];
        this.biases = [];
        this.velocities = []; // For momentum
        
        this.initializeNetwork();
        
        // Training state
        this.epoch = 0;
        this.trainingLoss = [];
        this.validationLoss = [];
    }

    /**
     * Initialize network weights and biases
     */
    initializeNetwork() {
        // Xavier/Glorot initialization
        for (let i = 0; i < this.layers.length - 1; i++) {
            const inputSize = this.layers[i];
            const outputSize = this.layers[i + 1];
            
            // Xavier initialization: sqrt(6 / (fan_in + fan_out))
            const limit = Math.sqrt(6 / (inputSize + outputSize));
            
            const layerWeights = this.createMatrix(
                outputSize,
                inputSize,
                () => (Math.random() * 2 - 1) * limit
            );
            
            const layerBiases = new Array(outputSize).fill(0).map(() => Math.random() * 0.01);
            
            this.weights.push(layerWeights);
            this.biases.push(layerBiases);
            
            // Initialize velocity matrices for momentum
            this.velocities.push({
                weights: this.createMatrix(outputSize, inputSize, () => 0),
                biases: new Array(outputSize).fill(0)
            });
        }
    }

    /**
     * Create matrix with initializer function
     */
    createMatrix(rows, cols, initializer) {
        return Array(rows).fill(null).map(() =>
            Array(cols).fill(null).map(initializer)
        );
    }

    /**
     * Activation functions
     */
    activations = {
        relu: (x) => Math.max(0, x),
        reluDerivative: (x) => x > 0 ? 1 : 0,
        
        sigmoid: (x) => 1 / (1 + Math.exp(-x)),
        sigmoidDerivative: (x) => {
            const sig = this.activations.sigmoid(x);
            return sig * (1 - sig);
        },
        
        tanh: (x) => Math.tanh(x),
        tanhDerivative: (x) => {
            const t = Math.tanh(x);
            return 1 - t * t;
        },
        
        linear: (x) => x,
        linearDerivative: (x) => 1,
        
        leakyRelu: (x) => x > 0 ? x : 0.01 * x,
        leakyReluDerivative: (x) => x > 0 ? 1 : 0.01
    };

    /**
     * Forward pass through network
     */
    forward(input, training = false) {
        let activation = input;
        const activations = [activation];
        const zValues = [];

        for (let i = 0; i < this.weights.length; i++) {
            // Compute z = W * a + b
            const z = this.matrixVectorMultiply(this.weights[i], activation);
            for (let j = 0; j < z.length; j++) {
                z[j] += this.biases[i][j];
            }
            zValues.push(z);

            // Apply activation function
            const activationFunc = i < this.weights.length - 1 
                ? this.activations.relu 
                : this.activations.sigmoid;
            
            activation = z.map(activationFunc);
            activations.push(activation);
        }

        if (training) {
            return { output: activation, activations, zValues };
        }
        
        return activation;
    }

    /**
     * Backward pass (backpropagation)
     */
    backward(input, target, forwardResult) {
        const { activations, zValues } = forwardResult;
        const output = activations[activations.length - 1];
        
        // Initialize gradients
        const weightGradients = [];
        const biasGradients = [];

        // Output layer error (using MSE loss)
        let delta = output.map((o, i) => 2 * (o - target[i]));
        
        // Backpropagate through layers
        for (let i = this.weights.length - 1; i >= 0; i--) {
            const activation = activations[i];
            const z = zValues[i];
            
            // Apply activation derivative
            const activationDerivFunc = i < this.weights.length - 1
                ? this.activations.reluDerivative
                : this.activations.sigmoidDerivative;
            
            delta = delta.map((d, j) => d * activationDerivFunc(z[j]));

            // Compute weight gradients
            const wGrad = this.outerProduct(delta, activation);
            weightGradients.unshift(wGrad);
            
            // Compute bias gradients
            biasGradients.unshift([...delta]);

            // Propagate error to previous layer
            if (i > 0) {
                delta = this.matrixVectorMultiply(
                    this.transposeMatrix(this.weights[i]),
                    delta
                );
            }
        }

        return { weightGradients, biasGradients };
    }

    /**
     * Update weights using gradients
     */
    updateWeights(weightGradients, biasGradients, batchSize) {
        for (let i = 0; i < this.weights.length; i++) {
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) {
                    // Average gradient over batch
                    const gradient = weightGradients[i][j][k] / batchSize;
                    
                    // L2 regularization
                    const regTerm = this.regularization * this.weights[i][j][k];
                    
                    // Momentum update
                    this.velocities[i].weights[j][k] = 
                        this.momentum * this.velocities[i].weights[j][k] -
                        this.learningRate * (gradient + regTerm);
                    
                    // Update weight
                    this.weights[i][j][k] += this.velocities[i].weights[j][k];
                }
            }

            // Update biases
            for (let j = 0; j < this.biases[i].length; j++) {
                const gradient = biasGradients[i][j] / batchSize;
                
                this.velocities[i].biases[j] = 
                    this.momentum * this.velocities[i].biases[j] -
                    this.learningRate * gradient;
                
                this.biases[i][j] += this.velocities[i].biases[j];
            }
        }
    }

    /**
     * Train on batch of data
     */
    trainBatch(inputs, targets) {
        let totalLoss = 0;
        const batchSize = inputs.length;

        // Accumulate gradients
        let accumulatedWeightGradients = null;
        let accumulatedBiasGradients = null;

        for (let i = 0; i < batchSize; i++) {
            const input = inputs[i];
            const target = targets[i];

            // Forward pass
            const forwardResult = this.forward(input, true);
            const output = forwardResult.output;

            // Calculate loss
            const loss = this.calculateLoss(output, target);
            totalLoss += loss;

            // Backward pass
            const { weightGradients, biasGradients } = this.backward(input, target, forwardResult);

            // Accumulate gradients
            if (!accumulatedWeightGradients) {
                accumulatedWeightGradients = weightGradients.map(layer =>
                    layer.map(row => [...row])
                );
                accumulatedBiasGradients = biasGradients.map(layer => [...layer]);
            } else {
                for (let l = 0; l < weightGradients.length; l++) {
                    for (let j = 0; j < weightGradients[l].length; j++) {
                        for (let k = 0; k < weightGradients[l][j].length; k++) {
                            accumulatedWeightGradients[l][j][k] += weightGradients[l][j][k];
                        }
                    }
                    for (let j = 0; j < biasGradients[l].length; j++) {
                        accumulatedBiasGradients[l][j] += biasGradients[l][j];
                    }
                }
            }
        }

        // Update weights with accumulated gradients
        this.updateWeights(accumulatedWeightGradients, accumulatedBiasGradients, batchSize);

        return totalLoss / batchSize;
    }

    /**
     * Train for multiple epochs
     */
    train(trainingData, validationData = null, epochs = 100, batchSize = 32, earlyStoppingPatience = 10) {
        let bestValidationLoss = Infinity;
        let patienceCounter = 0;

        for (let epoch = 0; epoch < epochs; epoch++) {
            // Shuffle training data
            const shuffled = this.shuffleData(trainingData);
            
            // Process in batches
            let epochLoss = 0;
            const numBatches = Math.ceil(shuffled.length / batchSize);

            for (let b = 0; b < numBatches; b++) {
                const start = b * batchSize;
                const end = Math.min(start + batchSize, shuffled.length);
                const batch = shuffled.slice(start, end);

                const inputs = batch.map(d => d.input);
                const targets = batch.map(d => d.target);

                const batchLoss = this.trainBatch(inputs, targets);
                epochLoss += batchLoss;
            }

            epochLoss /= numBatches;
            this.trainingLoss.push(epochLoss);

            // Validation
            if (validationData) {
                const valLoss = this.evaluate(validationData);
                this.validationLoss.push(valLoss);

                // Early stopping
                if (valLoss < bestValidationLoss) {
                    bestValidationLoss = valLoss;
                    patienceCounter = 0;
                    this.saveCheckpoint();
                } else {
                    patienceCounter++;
                    if (patienceCounter >= earlyStoppingPatience) {
                        console.log(`Early stopping at epoch ${epoch + 1}`);
                        this.loadCheckpoint();
                        break;
                    }
                }
            }

            this.epoch++;

            // Log progress every 10 epochs
            if ((epoch + 1) % 10 === 0) {
                console.log(
                    `Epoch ${epoch + 1}/${epochs} - ` +
                    `Train Loss: ${epochLoss.toFixed(6)}` +
                    (validationData ? ` - Val Loss: ${valLoss.toFixed(6)}` : '')
                );
            }
        }

        return {
            trainingLoss: this.trainingLoss,
            validationLoss: this.validationLoss
        };
    }

    /**
     * Evaluate on dataset
     */
    evaluate(data) {
        let totalLoss = 0;

        for (const sample of data) {
            const output = this.forward(sample.input);
            const loss = this.calculateLoss(output, sample.target);
            totalLoss += loss;
        }

        return totalLoss / data.length;
    }

    /**
     * Make prediction
     */
    predict(input) {
        const output = this.forward(input);
        return output[0]; // Assuming single output neuron
    }

    /**
     * Calculate loss (Mean Squared Error)
     */
    calculateLoss(output, target) {
        let loss = 0;
        for (let i = 0; i < output.length; i++) {
            const diff = output[i] - target[i];
            loss += diff * diff;
        }
        return loss / output.length;
    }

    /**
     * Matrix-vector multiplication
     */
    matrixVectorMultiply(matrix, vector) {
        return matrix.map(row =>
            row.reduce((sum, val, i) => sum + val * vector[i], 0)
        );
    }

    /**
     * Outer product of two vectors
     */
    outerProduct(a, b) {
        return a.map(ai => b.map(bi => ai * bi));
    }

    /**
     * Transpose matrix
     */
    transposeMatrix(matrix) {
        return matrix[0].map((_, colIndex) =>
            matrix.map(row => row[colIndex])
        );
    }

    /**
     * Shuffle data
     */
    shuffleData(data) {
        const shuffled = [...data];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Save checkpoint
     */
    saveCheckpoint() {
        this.checkpoint = {
            weights: this.weights.map(layer => layer.map(row => [...row])),
            biases: this.biases.map(layer => [...layer]),
            velocities: {
                weights: this.velocities.map(v => v.weights.map(row => [...row])),
                biases: this.velocities.map(v => [...v.biases])
            }
        };
    }

    /**
     * Load checkpoint
     */
    loadCheckpoint() {
        if (!this.checkpoint) return;

        this.weights = this.checkpoint.weights.map(layer => layer.map(row => [...row]));
        this.biases = this.checkpoint.biases.map(layer => [...layer]);
        this.velocities = {
            weights: this.checkpoint.velocities.weights.map(layer => layer.map(row => [...row])),
            biases: this.checkpoint.velocities.biases.map(layer => [...layer])
        };
    }

    /**
     * Export model to JSON
     */
    export() {
        return {
            version: '3.1.0',
            layers: this.layers,
            weights: this.weights,
            biases: this.biases,
            learningRate: this.learningRate,
            momentum: this.momentum,
            regularization: this.regularization,
            epoch: this.epoch,
            trainingLoss: this.trainingLoss,
            validationLoss: this.validationLoss
        };
    }

    /**
     * Import model from JSON
     */
    static import(data) {
        const nn = new NeuralNetwork({
            layers: data.layers,
            learningRate: data.learningRate,
            momentum: data.momentum,
            regularization: data.regularization
        });

        nn.weights = data.weights;
        nn.biases = data.biases;
        nn.epoch = data.epoch || 0;
        nn.trainingLoss = data.trainingLoss || [];
        nn.validationLoss = data.validationLoss || [];

        return nn;
    }
}

// Export for use in userscript
if (typeof window !== 'undefined') {
    window.NeuralNetwork = NeuralNetwork;
}
