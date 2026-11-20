import crypto from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Cryptographically secure random string from a lowercase alphanumeric alphabet. */
function randomString(length) {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      // Rejection sampling keeps the distribution uniform (252 = 36 * 7).
      if (byte < 252) out += ALPHABET[byte % 36];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Document IDs look like `doc_1734567890_a8f92kq0x3m1` — a Unix timestamp plus
 * 12 random characters (~62 bits). The ID alone is NOT what protects access:
 * every public request must also present the document's access token.
 */
export function generateDocumentId() {
  return `doc_${Math.floor(Date.now() / 1000)}_${randomString(12)}`;
}

/** 256-bit, URL-safe access token embedded in the share link. */
export function generateAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Human-friendly signing transaction ID, e.g. `TXN-20261120-7F3K9Q2M4ZXA`. */
export function generateTransactionId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TXN-${date}-${randomString(12).toUpperCase()}`;
}

export const DOCUMENT_ID_PATTERN = /^doc_\d{9,12}_[a-z0-9]{6,32}$/;
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isValidDocumentId(id) {
  return typeof id === 'string' && DOCUMENT_ID_PATTERN.test(id);
}

/** Constant-time comparison of two tokens. */
export function tokensMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  if (!ACCESS_TOKEN_PATTERN.test(provided)) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
