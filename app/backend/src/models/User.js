'use strict';

const mongoose = require('mongoose');

/**
 * Profile record. Keyed on `deviceId` so the app works without a login screen;
 * swap the lookup for a real auth subject when you add authentication.
 */
const UserSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: 'Field Operator' },
    email: { type: String, lowercase: true, trim: true },
    organisation: { type: String },
    role: { type: String, default: 'operator' },
    region: { type: String },
    preferences: {
      units: { type: String, enum: ['ppm', 'percent'], default: 'percent' },
      // Default false-colour band assignment: NIR -> R, RedEdge -> G, Green -> B.
      bandMapping: {
        red: { type: Number, default: 3 },
        green: { type: Number, default: 4 },
        blue: { type: Number, default: 1 },
      },
    },
    stats: {
      totalScans: { type: Number, default: 0 },
      rejectedScans: { type: Number, default: 0 },
      lastScanAt: { type: Date },
    },
  },
  { timestamps: true },
);

UserSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    deviceId: this.deviceId,
    displayName: this.displayName,
    email: this.email,
    organisation: this.organisation,
    role: this.role,
    region: this.region,
    preferences: this.preferences,
    stats: this.stats,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', UserSchema);
