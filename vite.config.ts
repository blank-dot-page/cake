import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: "src/index.ts",
      name: "Cake",
      fileName: (format) => (format === "cjs" ? "index.cjs" : "index.js"),
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "lucide-react",
        "@codemirror/state",
        "turndown",
      ],
    },
  },
});
