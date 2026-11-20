// Long-running server entry point (local development, VPS, Docker).
// On Vercel the app is served by api/index.js instead.
import config from './config/index.js';
import app, { ready } from './app.js';

ready()
  .then((backend) => {
    app.listen(config.port, () => {
      console.log(`[server] API listening on http://localhost:${config.port} (storage: ${backend})`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to start:', err);
    process.exit(1);
  });
