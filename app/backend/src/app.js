'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.corsOrigins, credentials: false }));

// Skip compression for the scan route: the response is small and the request
// body is a large binary that must not be touched.
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/v1/scans') && compression.filter(req, res) }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (!env.isProduction) {
  app.use(morgan('dev'));
}

app.use('/api/v1', routes);

app.get('/', (req, res) => {
  res.json({ name: 'pestiscan-backend', version: '0.1.0', docs: '/api/v1/health' });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
