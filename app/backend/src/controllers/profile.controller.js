'use strict';

const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const EDITABLE_FIELDS = ['displayName', 'email', 'organisation', 'role', 'region'];

function resolveDeviceId(req) {
  const deviceId = req.query.deviceId || req.body?.deviceId || req.get('x-device-id');
  if (!deviceId) {
    throw ApiError.badRequest('A deviceId is required (query, body, or x-device-id header).');
  }
  return deviceId;
}

/** GET /api/v1/profile — upserts so a fresh install always gets a profile back. */
async function getProfile(req, res) {
  const deviceId = resolveDeviceId(req);

  const user = await User.findOneAndUpdate(
    { deviceId },
    { $setOnInsert: { deviceId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json(user.toClientJSON());
}

/** PATCH /api/v1/profile */
async function updateProfile(req, res) {
  const deviceId = resolveDeviceId(req);

  const update = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body?.[field] !== undefined) update[field] = req.body[field];
  }

  if (req.body?.preferences?.units !== undefined) {
    update['preferences.units'] = req.body.preferences.units;
  }
  if (req.body?.preferences?.bandMapping) {
    const { red, green, blue } = req.body.preferences.bandMapping;
    if (red !== undefined) update['preferences.bandMapping.red'] = red;
    if (green !== undefined) update['preferences.bandMapping.green'] = green;
    if (blue !== undefined) update['preferences.bandMapping.blue'] = blue;
  }

  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('No editable fields supplied.');
  }

  const user = await User.findOneAndUpdate(
    { deviceId },
    { $set: update, $setOnInsert: { deviceId } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );

  res.json(user.toClientJSON());
}

module.exports = { getProfile, updateProfile };
