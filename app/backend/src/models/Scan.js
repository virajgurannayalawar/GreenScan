'use strict';

const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'cloudinary' },
    publicId: { type: String },
    secureUrl: { type: String },
    resourceType: { type: String },
    format: { type: String },
    bytes: { type: Number },
    skipped: { type: Boolean, default: false },
    skipReason: { type: String },
  },
  { _id: false },
);

const RasterSchema = new mongoose.Schema(
  {
    width: Number,
    height: Number,
    bandCount: Number,
    bitsPerSample: Number,
    sampleFormat: String,
    compression: Number,
  },
  { _id: false },
);

const ClassificationSchema = new mongoose.Schema(
  {
    isVegetable: { type: Boolean, default: false },
    label: { type: String },
    confidence: { type: Number },
  },
  { _id: false },
);

const AppleClassificationSchema = new mongoose.Schema(
  {
    label: { type: String, enum: ['Fresh', 'High', 'Low'] },
    confidence: { type: Number },
  },
  { _id: false },
);

const QualitySchema = new mongoose.Schema(
  {
    sharpness: Number,
    isClear: Boolean,
    saturatedRatio: Number,
  },
  { _id: false },
);

const PesticideSchema = new mongoose.Schema(
  {
    percent: Number,
    level: { type: String, enum: ['none', 'low', 'moderate', 'high', 'severe'] },
    confidence: Number,
  },
  { _id: false },
);

const ScanSchema = new mongoose.Schema(
  {
    // Device-generated identifier so the client can correlate before the
    // server responds, and de-duplicate retried uploads.
    clientScanId: { type: String, index: true },
    deviceId: { type: String, index: true },

    status: {
      type: String,
      enum: ['ok', 'rejected', 'failed'],
      required: true,
      index: true,
    },
    rejectionReason: {
      type: String,
      enum: ['not_vegetable', 'unclear_image', 'unsupported_format', null],
      default: null,
    },
    message: { type: String },

    originalFilename: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },

    raster: RasterSchema,
    asset: AssetSchema,
    classification: ClassificationSchema,
    appleClassification: AppleClassificationSchema,
    quality: QualitySchema,
    pesticide: PesticideSchema,

    inference: {
      engine: { type: String, enum: ['onnxruntime-node', 'stub', 'n/a'] },
      durationMs: Number,
      modelVersions: {
        gate: String,
        residue: String,
        appleClassifier: String,
      },
    },

    capturedAt: { type: Date },
  },
  { timestamps: true },
);

ScanSchema.index({ deviceId: 1, createdAt: -1 });

ScanSchema.methods.toClientJSON = function toClientJSON() {
  return {
    id: this._id.toString(),
    clientScanId: this.clientScanId,
    status: this.status,
    rejectionReason: this.rejectionReason,
    message: this.message,
    originalFilename: this.originalFilename,
    sizeBytes: this.sizeBytes,
    raster: this.raster,
    asset: this.asset
      ? {
          secureUrl: this.asset.secureUrl,
          publicId: this.asset.publicId,
          bytes: this.asset.bytes,
          skipped: this.asset.skipped,
        }
      : undefined,
    appleClassification: this.appleClassification,
    quality: this.quality,
    inference: this.inference,
    capturedAt: this.capturedAt,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Scan', ScanSchema);
