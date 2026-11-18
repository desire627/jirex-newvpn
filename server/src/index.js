// Long-running server (your PC, Docker, a VPS). On Vercel, api/index.js uses app.js directly.
import { app, cleanup, ready } from './app.js';
import { config } from './config.js';
import { reconcileAll } from './peers.js';

const SYNC_EVERY_MS = 2 * 60 * 1000;

await ready();

app.listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
  reconcileAll();
  setInterval(reconcileAll, SYNC_EVERY_MS);
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000);
});
