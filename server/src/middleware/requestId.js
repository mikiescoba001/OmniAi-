/* ============================================
   OmniAI — Request ID Middleware
   Adds correlation ID to every request for observability.
   ============================================ */
'use strict';

const { v4: uuidv4 } = require('uuid');

function requestIdMiddleware(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = { requestIdMiddleware };