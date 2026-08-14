import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getProfile } from '../models/database.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.userId = decoded.sub;
    req.user = await getProfile(req.userId);
    if (!req.user) {
      return res.status(401).json({ error: 'User not found' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    req.userId = null;
    req.user = null;
    return next();
  }
  return authenticate(req, res, next);
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function generateToken(userId, role = 'user') {
  return jwt.sign({ sub: userId, role }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}