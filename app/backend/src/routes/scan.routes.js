'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { singleTiff } = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/scan.controller');

const router = express.Router();

// Inference is CPU-bound; this keeps one device from saturating the box.
const scanLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { status: 'error', code: 'rate_limited', message: 'Too many scans. Try again shortly.' },
});

router.post('/', scanLimiter, singleTiff('file'), asyncHandler(controller.createScan));
router.get('/:id', asyncHandler(controller.getScan));
router.delete('/:id', asyncHandler(controller.deleteScan));

module.exports = router;
