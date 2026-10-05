'use strict';

const express = require('express');
const mongoose = require('mongoose');
const env = require('../config/env');
const onnxService = require('../services/onnx.service');

const scanRoutes = require('./scan.routes');
const historyRoutes = require('./history.routes');
const profileRoutes = require('./profile.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  const mongoStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    environment: env.NODE_ENV,
    dependencies: {
      mongo: mongoStates[mongoose.connection.readyState] ?? 'unknown',
      cloudinary: env.cloudinaryConfigured ? 'configured' : 'not_configured',
      models: onnxService.describeModels(),
    },
  });
});

router.use('/scans', scanRoutes);
router.use('/history', historyRoutes);
router.use('/profile', profileRoutes);

module.exports = router;
