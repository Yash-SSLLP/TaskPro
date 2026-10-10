import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the web app calls /api on its own origin and Vite forwards it
// to the local API, so there is no CORS to configure. Set VITE_API_URL for a
// production build that talks to an API on another address.
const api = process.env.API_PROXY || 'http://localhost:5120';
// The public website (backend/src/site): the same paths vercel.json sends to
// the backend, "/" exactly. The Host is kept so the pages' links name this
// address. Its CSS and scripts are plain files in public/site/.
const site = { target: api, changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5121,
    proxy: {
      '/api': { target: api, changeOrigin: true },
      '^/(\\?.*)?$': site,
      '^/(features|for|about|contact|privacy|terms|blog|media)([/?].*)?$': site,
      '^/(rss\\.xml|sitemap\\.xml|robots\\.txt|llms\\.txt)(\\?.*)?$': site,
    },
  },
  preview: { port: 5121 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          vendor: ['@tanstack/react-query', 'zustand', 'sonner', 'clsx'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
