/* ============================================================
   NeuralNetwork v5.0.0
   - Feedforward neural network with backpropagation
   - Xavier/Glorot initialization
   - Momentum, Dropout (training only), L2 regularization
   - Global: window.NeuralNetwork
   ============================================================ */
(function () {
  'use strict';

  if (!window.OdinModules) window.OdinModules = [];

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

  window.OdinModules.push(function NeuralNetworkModuleInit(ctx) {
    ctx.NeuralNetwork = NeuralNetwork;
    ctx.nexus.emit('NEURAL_NETWORK_READY', { version: '5.0.0' });
    return { id: 'neural-network', init: function () {}, destroy: function () {} };
  });
})();
