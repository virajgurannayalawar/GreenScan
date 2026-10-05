'use strict';

const fs = require('node:fs');
const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

let ort = null;
let appleClassifierSession = null;

function loadRuntime() {
  if (ort) return ort;
  ort = require('onnxruntime-node');
  return ort;
}

async function getAppleClassifierSession() {
  if (appleClassifierSession) return appleClassifierSession;

  if (!fs.existsSync(env.appleClassifierModelPath)) {
    throw ApiError.internal('Apple classifier model is missing.', {
      code: 'apple_classifier_missing',
    });
  }

  try {
    const runtime = loadRuntime();
    appleClassifierSession = await runtime.InferenceSession.create(env.appleClassifierModelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      intraOpNumThreads: env.ONNX_INTRA_OP_THREADS,
    });
    logger.info('onnx.session_ready', {
      key: 'appleClassifier',
      inputNames: appleClassifierSession.inputNames,
      outputNames: appleClassifierSession.outputNames,
    });
    return appleClassifierSession;
  } catch (error) {
    throw ApiError.internal('Failed to initialise the apple classifier.', {
      code: 'apple_classifier_init_failed',
      details: error.message,
    });
  }
}

async function warmUp() {
  await getAppleClassifierSession();
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}

const APPLE_CLASSES = ['Fresh', 'High', 'Low'];

async function runAppleQualityClassifier({ data, dims }) {
  const session = await getAppleClassifierSession();
  const runtime = loadRuntime();
  const inputName = session.inputNames[0];
  const tensor = new runtime.Tensor('float32', data, dims);
  const output = await session.run({ [inputName]: tensor });
  const logits = Array.from(output[session.outputNames[0]].data, Number);

  if (logits.length !== APPLE_CLASSES.length || logits.some((value) => !Number.isFinite(value))) {
    throw ApiError.internal('Apple classifier returned an invalid output.', {
      code: 'apple_classifier_output_invalid',
    });
  }

  const probabilities = softmax(logits);
  let classIndex = 0;
  for (let index = 1; index < probabilities.length; index += 1) {
    if (probabilities[index] > probabilities[classIndex]) classIndex = index;
  }

  return {
    label: APPLE_CLASSES[classIndex],
    confidence: Number(probabilities[classIndex].toFixed(4)),
    engine: 'onnxruntime-node',
  };
}

function describeModels() {
  return {
    gate: 'disabled',
    residue: 'disabled',
    appleClassifier: appleClassifierSession ? 'onnx' : 'unavailable',
  };
}

module.exports = { warmUp, runAppleQualityClassifier, describeModels };
