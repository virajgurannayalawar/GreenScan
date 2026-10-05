'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

let ort = null;
const sessions = new Map();

function loadRuntime() {
  if (ort) return ort;
  // Required lazily so a machine without the native binding can still boot the
  // API in stub mode.
  ort = require('onnxruntime-node');
  return ort;
}

/**
 * @returns {Promise<import('onnxruntime-node').InferenceSession|null>}
 *          null when the model file is absent and stub mode is allowed.
 */
async function getSession(key, modelPath) {
  if (sessions.has(key)) return sessions.get(key);

  if (!fs.existsSync(modelPath)) {
    if (!env.ALLOW_STUB_INFERENCE) {
      throw ApiError.internal(`ONNX model missing at ${modelPath}`, {
        code: 'model_missing',
      });
    }
    logger.warn('onnx.model_missing', { key, modelPath, mode: 'stub' });
    sessions.set(key, null);
    return null;
  }

  try {
    const runtime = loadRuntime();
    const session = await runtime.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: env.ONNX_INTRA_OP_THREADS,
    });
    logger.info('onnx.session_ready', {
      key,
      inputNames: session.inputNames,
      outputNames: session.outputNames,
    });
    sessions.set(key, session);
    return session;
  } catch (error) {
    if (env.ALLOW_STUB_INFERENCE) {
      logger.error('onnx.session_failed', { key, message: error.message, mode: 'stub' });
      sessions.set(key, null);
      return null;
    }
    throw ApiError.internal('Failed to initialise ONNX session.', {
      code: 'onnx_init_failed',
      details: error.message,
    });
  }
}

/** Warm both sessions at boot so the first real request is not slow. */
async function warmUp() {
  await Promise.all([
    getSession('gate', env.gateModelPath),
    getSession('residue', env.residueModelPath),
  ]);
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / total);
}

/**
 * Deterministic stand-in used until real .onnx weights are dropped in.
 * Derived from a hash of the tensor so the same file always yields the same
 * answer — otherwise end-to-end testing is impossible to reason about.
 */
function stubFromTensor(data, salt) {
  const hash = crypto.createHash('sha256');
  const stride = Math.max(1, Math.floor(data.length / 4096));
  const sampled = [];
  for (let i = 0; i < data.length; i += stride) sampled.push(data[i]);
  hash.update(salt);
  // Buffer.from over the backing store — hash.update rejects a bare ArrayBuffer.
  hash.update(Buffer.from(Float32Array.from(sampled).buffer));
  const digest = hash.digest();
  // Two independent 0..1 draws from different byte windows.
  return {
    a: digest.readUInt32BE(0) / 0xffffffff,
    b: digest.readUInt32BE(4) / 0xffffffff,
  };
}

async function runVegetableGate({ data, dims }) {
  const session = await getSession('gate', env.gateModelPath);

  if (!session) {
    const { a, b } = stubFromTensor(data, 'vegetable-gate');
    // Biased toward "vegetable" so the happy path is the common one in testing,
    // while still producing rejections for some inputs.
    const probability = 0.35 + a * 0.6;
    return {
      engine: 'stub',
      probability: Number(probability.toFixed(4)),
      label: probability >= env.VEGETABLE_CONFIDENCE_THRESHOLD ? 'vegetable' : 'not_vegetable',
      rawConfidence: Number(b.toFixed(4)),
    };
  }

  const runtime = loadRuntime();
  const inputName = session.inputNames[0];
  const tensor = new runtime.Tensor('float32', data, dims);
  const output = await session.run({ [inputName]: tensor });
  const logits = Array.from(output[session.outputNames[0]].data, Number);

  // Supports both a 2-logit classifier and a single sigmoid output.
  let probability;
  if (logits.length >= 2) {
    const probs = softmax(logits);
    probability = probs[1];
  } else {
    probability = 1 / (1 + Math.exp(-logits[0]));
  }

  return {
    engine: 'onnxruntime-node',
    probability: Number(probability.toFixed(4)),
    label: probability >= env.VEGETABLE_CONFIDENCE_THRESHOLD ? 'vegetable' : 'not_vegetable',
    rawConfidence: Number(probability.toFixed(4)),
  };
}

async function runResidueRegressor({ data, dims }) {
  const session = await getSession('residue', env.residueModelPath);

  if (!session) {
    const { a, b } = stubFromTensor(data, 'pesticide-residue');
    return {
      engine: 'stub',
      percent: Number((a * 48).toFixed(2)),
      confidence: Number((0.6 + b * 0.35).toFixed(4)),
    };
  }

  const runtime = loadRuntime();
  const inputName = session.inputNames[0];
  const tensor = new runtime.Tensor('float32', data, dims);
  const output = await session.run({ [inputName]: tensor });

  const primary = output[session.outputNames[0]];
  const values = Array.from(primary.data, Number);

  // A model may emit either a bare regression scalar or [percent, confidence].
  const percent = values[0];
  const confidence = values.length > 1 ? values[1] : undefined;

  return {
    engine: 'onnxruntime-node',
    percent: Number(Math.min(100, Math.max(0, percent)).toFixed(2)),
    confidence: confidence === undefined ? undefined : Number(Math.min(1, Math.max(0, confidence)).toFixed(4)),
  };
}

function describeModels() {
  return {
    gate: sessions.get('gate') ? 'onnx' : 'stub',
    residue: sessions.get('residue') ? 'onnx' : 'stub',
  };
}

module.exports = {
  warmUp,
  runVegetableGate,
  runResidueRegressor,
  describeModels,
};
