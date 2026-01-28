import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { readdirSync, statSync } from "fs";
import { join } from "path";

function getExtensionEntries() {
  const extensionsDir = "src/cake/extensions";
  const entries: Record<string, string> = {};

  for (const name of readdirSync(extensionsDir)) {
    const dirPath = join(extensionsDir, name);
    if (!statSync(dirPath).isDirectory()) continue;

    // Look for main entry file: index.ts(x), or {name}.ts(x)
    const candidates = [
      `index.tsx`,
      `index.ts`,
      `${name}.tsx`,
      `${name}.ts`,
    ];

    for (const candidate of candidates) {
      const fullPath = join(dirPath, candidate);
      try {
        statSync(fullPath);
        entries[`extensions/${name}`] = fullPath;
        break;
      } catch {
        // File doesn't exist, try next
      }
    }
  }

  return entries;
}

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ["src"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.browser.test.ts", "**/*.browser.test.tsx"],
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        ...getExtensionEntries(),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) =>
        format === "cjs" ? `${entryName}.cjs` : `${entryName}.js`,
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
    minify: false,
  },
});
