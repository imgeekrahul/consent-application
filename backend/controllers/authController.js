import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import { issueSession, clearSession, readSession } from '../middleware/auth.js';

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function passwordMatches(password) {
  if (config.admin.passwordHash) return bcrypt.compare(password, config.admin.passwordHash);
  return safeEqual(password, config.admin.password);
}

export async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  // Always evaluate both checks to keep timing uniform.
  const userOk = safeEqual(username.trim(), config.admin.username);
  const passOk = await passwordMatches(password);
  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  const expiresAt = issueSession(res, config.admin.username);
  return res.json({ user: { username: config.admin.username }, expiresAt });
}

export function logout(req, res) {
  clearSession(res);
  res.json({ ok: true });
}

export function me(req, res) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Not signed in.' });
  return res.json({ user: { username: session.sub } });
}
