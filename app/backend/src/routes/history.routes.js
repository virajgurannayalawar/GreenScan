'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/history.controller');

const router = express.Router();

router.get('/', asyncHandler(controller.listHistory));
router.get('/summary', asyncHandler(controller.historySummary));

module.exports = router;
