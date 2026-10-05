'use strict';

const Scan = require('../models/Scan');

/**
 * GET /api/v1/history
 * Query: deviceId, status, limit, cursor (ISO date), level
 *
 * Cursor pagination on createdAt rather than skip/limit — history grows
 * monotonically and new scans land at the head, so offsets would drift.
 */
async function listHistory(req, res) {
  const deviceId = req.query.deviceId || req.get('x-device-id');
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  const filter = {};
  if (deviceId) filter.deviceId = deviceId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.level) filter['pesticide.level'] = req.query.level;
  if (req.query.cursor) {
    const cursorDate = new Date(req.query.cursor);
    if (!Number.isNaN(cursorDate.valueOf())) {
      filter.createdAt = { $lt: cursorDate };
    }
  }

  // Fetch one extra to decide whether another page exists without a count query.
  const docs = await Scan.find(filter).sort({ createdAt: -1 }).limit(limit + 1);

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;

  res.json({
    items: page.map((doc) => doc.toClientJSON()),
    nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    hasMore,
  });
}

/** GET /api/v1/history/summary */
async function historySummary(req, res) {
  const deviceId = req.query.deviceId || req.get('x-device-id');
  const match = deviceId ? { deviceId } : {};

  const [aggregate] = await Scan.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        scored: { $sum: { $cond: [{ $eq: ['$status', 'ok'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        averagePercent: { $avg: '$pesticide.percent' },
        maxPercent: { $max: '$pesticide.percent' },
        lastScanAt: { $max: '$createdAt' },
      },
    },
  ]);

  const byLevel = await Scan.aggregate([
    { $match: { ...match, status: 'ok' } },
    { $group: { _id: '$pesticide.level', count: { $sum: 1 } } },
  ]);

  res.json({
    total: aggregate?.total ?? 0,
    scored: aggregate?.scored ?? 0,
    rejected: aggregate?.rejected ?? 0,
    averagePercent:
      aggregate?.averagePercent == null ? null : Number(aggregate.averagePercent.toFixed(2)),
    maxPercent: aggregate?.maxPercent ?? null,
    lastScanAt: aggregate?.lastScanAt ?? null,
    byLevel: byLevel.reduce((acc, row) => ({ ...acc, [row._id ?? 'unknown']: row.count }), {}),
  });
}

module.exports = { listHistory, historySummary };
