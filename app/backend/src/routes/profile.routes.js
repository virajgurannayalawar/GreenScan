'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const controller = require('../controllers/profile.controller');

const router = express.Router();

router.get('/', asyncHandler(controller.getProfile));
router.patch('/', asyncHandler(controller.updateProfile));

module.exports = router;
