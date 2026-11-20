import { rateLimit } from 'express-rate-limit';

const json = (message) => ({ error: message });
// Note: the default store is in-memory, i.e. per server instance. On serverless
// hosts each warm instance keeps its own counters, which still blunts abuse.
const base = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Behind Vercel/other proxies `trust proxy` is intentionally enabled (see config).
  validate: { trustProxy: false },
};

export const apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: json('Too many requests. Please slow down and try again shortly.'),
});

export const publicDocumentLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: json('Too many requests for this document. Please try again later.'),
});

export const signLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: json('Too many signing attempts. Please wait a few minutes and try again.'),
});

export const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: json('Too many failed sign-in attempts. Please try again in 15 minutes.'),
});

export const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 100,
  message: json('Upload limit reached. Please try again later.'),
});
