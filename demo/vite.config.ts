import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@blankdotpage/cake/react": path.resolve(
        __dirname,
        "../src/cake/react/index.tsx",
      ),
      "@blankdotpage/cake": path.resolve(__dirname, "../src/index.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["@blankdotpage/cake"],
  },
  server: {
    // Allow access via LAN/Tailscale (not just localhost).
    host: true,
    // Allow Tailscale MagicDNS hosts (and this machine name).
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".ts.net",
      "macbook",
      "Mohameds-MacBook-Pro.local",
      "Mohameds-MacBook-Pro",
    ],
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
});
