import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.API_PORT || "8787";

export default defineConfig({
  build: {
    outDir: "dist/client",
    manifest: true,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`,
      "/uploads": `http://127.0.0.1:${apiPort}`,
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
