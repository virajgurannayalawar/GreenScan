'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

let connection = null;

async function connectDatabase() {
  if (connection) return connection;

  mongoose.connection.on('connected', () => logger.info('mongo.connected'));
  mongoose.connection.on('disconnected', () => logger.warn('mongo.disconnected'));
  mongoose.connection.on('error', (error) => logger.error('mongo.error', { message: error.message }));

  connection = await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10_000,
  });

  return connection;
}

async function disconnectDatabase() {
  if (!connection) return;
  await mongoose.disconnect();
  connection = null;
}

module.exports = { connectDatabase, disconnectDatabase };
