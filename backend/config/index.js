import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseTrustProxy(value) {
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Number.isNaN(Number(value)) ? value : Number(value);
}

function resolveDir(value, fallback) {
  return path.resolve(ROOT_DIR, value || fallback);
}

const problems = [];

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (isProduction) {
    problems.push('JWT_SECRET must be set to a random string of at least 32 characters.');
  } else {
    jwtSecret = crypto.randomBytes(48).toString('hex');
    console.warn('[config] JWT_SECRET not set; using a random per-process secret (admin sessions reset on restart).');
  }
}

const adminPasswordHash = env.ADMIN_PASSWORD_HASH || '';
const adminPassword = env.ADMIN_PASSWORD || '';
if (!adminPasswordHash && !adminPassword) {
  problems.push('Set ADMIN_PASSWORD_HASH (recommended) or ADMIN_PASSWORD in backend/.env.');
}
if (isProduction && !adminPasswordHash && adminPassword.length < 12) {
  problems.push('In production use ADMIN_PASSWORD_HASH, or an ADMIN_PASSWORD of at least 12 characters.');
}

// Serverless hosts (Vercel) have no persistent disk: metadata and PDFs must live in MongoDB.
if (env.VERCEL && !env.MONGODB_URI) {
  problems.push('MONGODB_URI is required when running on Vercel (no persistent filesystem).');
}

if (problems.length) {
  const message = '[config] Invalid configuration:\n  - ' + problems.join('\n  - ');
  console.error('\n' + message + '\n');
  // In a serverless function, throwing surfaces the error in the logs without killing the runtime loop.
  if (env.VERCEL) throw new Error(message);
  process.exit(1);
}

const config = {
  isProduction,
  port: int(env.PORT, 5050),
  trustProxy: parseTrustProxy(env.TRUST_PROXY ?? (env.VERCEL ? 'true' : '')),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  publicAppUrl: (env.PUBLIC_APP_URL || '').replace(/\/+$/, ''),
  serveFrontend: env.SERVE_FRONTEND === 'true',
  frontendDist: resolveDir(env.FRONTEND_DIST, '../frontend/dist'),

  mongoUri: env.MONGODB_URI || '',
  dataDir: resolveDir(env.DATA_DIR, 'data'),
  uploadsDir: resolveDir(env.UPLOADS_DIR, 'uploads'),
  signedDir: resolveDir(env.SIGNED_DIR, 'signed-documents'),

  maxUploadBytes: int(env.MAX_UPLOAD_MB, 20) * 1024 * 1024,
  maxSignatureBytes: int(env.MAX_SIGNATURE_KB, 2048) * 1024,
  maxPages: int(env.MAX_PAGES, 500),

  admin: {
    username: env.ADMIN_USERNAME || 'admin',
    password: adminPassword,
    passwordHash: adminPasswordHash,
  },
  jwt: {
    secret: jwtSecret,
    expiresIn: env.JWT_EXPIRES_IN || '8h',
    cookieName: 'cs_admin',
  },
};

export default config;
