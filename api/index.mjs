// Vercel entry point: every /api/* request comes here (see vercel.json).
// The same Express app runs on your PC through server/src/index.js.
import { app, ready } from '../server/src/app.js';

export default async function handler(req, res) {
  try {
    await ready();
  } catch (err) {
    console.error('[startup]', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ code: 'server_error', error: 'The server is starting up. Try again in a moment.' }));
  }
  return app(req, res);
}
