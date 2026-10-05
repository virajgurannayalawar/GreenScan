'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDatabase, disconnectDatabase } = require('./config/db');
const onnxService = require('./services/onnx.service');

let server = null;

async function start() {
  await connectDatabase();

  // Non-fatal: in stub mode the API is still useful without weights present.
  await onnxService.warmUp().catch((error) => {
    logger.error('onnx.warmup_failed', { message: error.message });
  });

  server = app.listen(env.PORT, () => {
    logger.info('server.listening', {
      port: env.PORT,
      environment: env.NODE_ENV,
      models: onnxService.describeModels(),
    });
  });
}

async function shutdown(signal) {
  logger.info('server.shutdown', { signal });
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('server.shutdown_failed', { message: error.message });
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', { reason: String(reason) });
});

start().catch((error) => {
  logger.error('server.start_failed', { message: error.message, stack: error.stack });
  process.exit(1);
});
