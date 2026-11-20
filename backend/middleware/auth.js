import jwt from 'jsonwebtoken';
import config from '../config/index.js';

const { secret, cookieName } = config.jwt;

export function issueSession(res, username) {
  const token = jwt.sign({ sub: username, role: 'admin' }, secret, {
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256',
  });
  const { exp } = jwt.decode(token);
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    path: '/api',
    expires: new Date(exp * 1000),
  });
  return new Date(exp * 1000);
}

export function clearSession(res) {
  res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: config.isProduction, path: '/api' });
}

export function readSession(req) {
  const token = req.cookies?.[cookieName];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return payload.role === 'admin' ? payload : null;
  } catch {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Please sign in as an administrator.' });
  req.admin = session;
  return next();
}
