'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('*'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('pestiscan'),

  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
  CLOUDINARY_FOLDER: z.string().default('pestiscan/scans'),

  ONNX_APPLE_CLASSIFIER_MODEL_PATH: z.string().default('models/appleScanner_resnet18.onnx'),
  ONNX_INTRA_OP_THREADS: z.coerce.number().int().positive().default(2),

  SHARPNESS_THRESHOLD: z.coerce.number().min(0).default(35),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(80 * 1024 * 1024),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const raw = parsed.data;

const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  packageRoot: PACKAGE_ROOT,
  corsOrigins: raw.CORS_ORIGIN === '*' ? '*' : raw.CORS_ORIGIN.split(',').map((s) => s.trim()),
  appleClassifierModelPath: path.resolve(PACKAGE_ROOT, raw.ONNX_APPLE_CLASSIFIER_MODEL_PATH),
  cloudinaryConfigured: Boolean(
    raw.CLOUDINARY_CLOUD_NAME && raw.CLOUDINARY_API_KEY && raw.CLOUDINARY_API_SECRET,
  ),
};

module.exports = env;
