import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Share Vite's content-based asset names with the ordinary browser build.
export default defineConfig({
  plugins:[react()],
  build:{
    ssr:'src/public-render.jsx',
    outDir:'dist/render',
    emptyOutDir:true,
    rollupOptions:{output:{entryFileNames:'public-render.mjs'}},
  },
});
