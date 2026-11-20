import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import config from './config/index.js';
import store from './services/documentStore.js';
import { initFileStorage } from './services/fileStorage.js';
import adminRoutes from './routes/admin.js';
import documentRoutes from './routes/documents.js';
import { apiLimiter } from './middleware/rateLimiters.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

/**
 * Connects storage once per process. In serverless environments (Vercel) the
 * module stays warm between invocations, so the promise is reused; a failed
 * attempt is cleared so the next request retries.
 */
let readyPromise = null;
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const backend = await store.init();
      await initFileStorage();
      return backend;
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'wasm-unsafe-eval'"],
        'worker-src': ["'self'", 'blob:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'style-src': ["'self'", "'unsafe-inline'"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
  }),
);

if (config.corsOrigins.length) {
  // Only needed when the frontend calls the API cross-origin (not needed with the Vercel /api rewrite).
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.corsOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, X-Document-Token',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        Vary: 'Origin',
      });
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    return next();
  });
}

if (!config.isProduction) app.use(morgan('dev'));
app.use(cookieParser());

const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
api.get('/health', (req, res) => res.json({ ok: true }));
api.use(async (req, res, next) => {
  try {
    await ready();
    next();
  } catch (err) {
    console.error('[startup] storage unavailable:', err.message);
    res.status(503).json({ error: 'The service is temporarily unavailable. Please try again shortly.' });
  }
});
api.use(apiLimiter);
api.use('/admin', express.json({ limit: '100kb' }), adminRoutes);
api.use('/documents', documentRoutes);
api.use(notFound);
app.use('/api', api);

if (config.serveFrontend) {
  const indexHtml = path.join(config.frontendDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(indexHtml));
  } else {
    console.warn(`[server] SERVE_FRONTEND=true but ${indexHtml} was not found. Run "npm run build" in frontend/.`);
  }
}

app.use(notFound);
app.use(errorHandler);

export default app;
