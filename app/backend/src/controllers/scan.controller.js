'use strict';

const Scan = require('../models/Scan');
const User = require('../models/User');
const cloudinaryService = require('../services/cloudinary.service');
const inferenceService = require('../services/inference.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

function parseMetadata(rawMetadata) {
  if (!rawMetadata) return {};
  try {
    return typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata;
  } catch {
    throw ApiError.badRequest('`metadata` must be valid JSON.');
  }
}

/**
 * POST /api/v1/scans
 *
 * Work-II from the client's perspective: archive the raw .tif in Cloudinary and
 * return the model verdict. Upload and inference run concurrently — neither
 * depends on the other, and the TIFF decode is the slow half.
 */
async function createScan(req, res) {
  if (!req.file) {
    throw ApiError.badRequest('No file received. Send the .tif as multipart field "file".');
  }

  const metadata = parseMetadata(req.body?.metadata);
  const deviceId = req.body?.deviceId || metadata.deviceId || req.get('x-device-id') || 'unknown';
  const clientScanId = req.body?.clientScanId || metadata.clientScanId;

  // Idempotency: a retried upload must not create a second record.
  if (clientScanId) {
    const existing = await Scan.findOne({ clientScanId });
    if (existing) {
      res.status(200).json({ ...existing.toClientJSON(), deduplicated: true });
      return;
    }
  }

  const { buffer, originalname, mimetype, size } = req.file;

  const [uploadOutcome, analysisOutcome] = await Promise.allSettled([
    cloudinaryService.uploadBuffer(buffer, {
      filename: originalname,
      context: { deviceId, clientScanId: clientScanId || '' },
    }),
    inferenceService.analyseTiff(buffer, { bandMapping: metadata.bandMapping }),
  ]);

  // A failed archive must not throw away a successful analysis — the user still
  // needs their result. It is recorded as a skipped asset instead.
  const asset =
    uploadOutcome.status === 'fulfilled'
      ? uploadOutcome.value
      : {
          skipped: true,
          skipReason: 'upload_failed',
          provider: 'cloudinary',
        };

  if (uploadOutcome.status === 'rejected') {
    logger.error('scan.upload_failed', { message: uploadOutcome.reason?.message });
  }

  if (analysisOutcome.status === 'rejected') {
    const error = analysisOutcome.reason;
    // Nothing usable was produced, so do not keep an orphaned Cloudinary object.
    if (!asset.skipped && asset.publicId) {
      await cloudinaryService.destroyAsset(asset.publicId);
    }
    throw error instanceof ApiError
      ? error
      : ApiError.internal('Analysis failed.', { details: error?.message });
  }

  const analysis = analysisOutcome.value;

  const scan = await Scan.create({
    clientScanId,
    deviceId,
    status: analysis.status,
    rejectionReason: analysis.rejectionReason,
    message: analysis.message,
    originalFilename: originalname,
    mimeType: mimetype,
    sizeBytes: size,
    raster: analysis.raster,
    asset,
    classification: analysis.classification,
    quality: analysis.quality,
    pesticide: analysis.pesticide,
    inference: analysis.inference,
    capturedAt: metadata.capturedAt ? new Date(metadata.capturedAt) : new Date(),
  });

  await User.findOneAndUpdate(
    { deviceId },
    {
      $inc: {
        'stats.totalScans': 1,
        'stats.rejectedScans': analysis.status === 'rejected' ? 1 : 0,
      },
      $set: { 'stats.lastScanAt': new Date() },
      $setOnInsert: { deviceId },
    },
    { upsert: true, new: true },
  );

  res.status(201).json(scan.toClientJSON());
}

/** GET /api/v1/scans/:id */
async function getScan(req, res) {
  const scan = await Scan.findById(req.params.id);
  if (!scan) throw ApiError.notFound('Scan not found.');
  res.json(scan.toClientJSON());
}

/** DELETE /api/v1/scans/:id — removes the record and its archived asset. */
async function deleteScan(req, res) {
  const scan = await Scan.findById(req.params.id);
  if (!scan) throw ApiError.notFound('Scan not found.');

  if (scan.asset?.publicId) {
    await cloudinaryService.destroyAsset(scan.asset.publicId);
  }
  await scan.deleteOne();

  res.status(204).send();
}

module.exports = { createScan, getScan, deleteScan };
