import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // During local development, forward API calls to the Node server.
    proxy: { '/api': `http://localhost:${process.env.JIREX_API_PORT || 4000}` },
  },
});
