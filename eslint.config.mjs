import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

const restrictedImportNames = [
  "computeLineOffsets",
  "resolveOffsetInLines",
  "flattenDocToLines",
  "flattenInline",
  "buildCursorToCodeUnit",
  "buildLines",
];

const restrictedPaths = [
  "./internal/editor-text-model",
  "../internal/editor-text-model",
  "../../internal/editor-text-model",
  "../editor/internal/editor-text-model",
  "../../editor/internal/editor-text-model",
];

export default [
  {
    ignores: [
      "dist/**",
      "demo/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
    ],
  },
  {
    files: ["src/cake/**/*.ts", "src/cake/**/*.tsx"],
    ignores: ["src/cake/editor/internal/editor-text-model.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedPaths.map((name) => ({
            name,
            importNames: restrictedImportNames,
            message:
              "Flatten helpers are internal to EditorTextModel. Use model-backed APIs.",
          })),
        },
      ],
    },
  },
];
