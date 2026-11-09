import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// La API corre en :3001; Vite reenvía /api para no necesitar CORS.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${process.env.API_PORT ?? 3001}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
