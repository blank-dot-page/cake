import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@blankdotpage/cake": path.resolve(__dirname, "../src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["@blankdotpage/cake"],
  },
  server: {
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
