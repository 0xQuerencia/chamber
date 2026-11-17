import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true } } }
});
