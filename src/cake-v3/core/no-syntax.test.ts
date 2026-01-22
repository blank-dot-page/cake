import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ============================================================================
 * ⚠️  CRITICAL: DO NOT DELETE OR WEAKEN THIS TEST  ⚠️
 * ============================================================================
 *
 * This test enforces architectural boundaries in Cake v3:
 *
 * 1. CORE must be syntax-agnostic (no markdown syntax like **, [], >)
 * 2. DOM renderer must be extension-agnostic (no hardcoded "heading", "image", etc.)
 *
 * Extension-specific rendering belongs in EXTENSIONS, not in core or dom/.
 * The dom/ layer should only handle generic types (paragraph, text, inline-wrapper,
 * inline-atom, block-wrapper, block-atom) and delegate specific kinds to extensions.
 *
 * If this test fails, you are adding extension-specific code where it doesn't belong.
 * Move that code to the appropriate extension in extensions/.
 *
 * DO NOT:
 * - Delete this test
 * - Add exceptions/allowlists
 * - Weaken the patterns
 *
 * ============================================================================
 */

const cakeV3Dir = path.resolve(__dirname, "..");
const coreDir = path.resolve(__dirname);
const domDir = path.resolve(__dirname, "..", "dom");

const syntaxPatterns = [
  { name: "bold", regex: /['"`][^'"`\n]*\*\*[^'"`\n]*['"`]/ },
  { name: "link", regex: /['"`][^'"`\n]*\]\([^'"`\n]*['"`]/ },
  { name: "blockquote", regex: /['"`][^'"`\n]*> [^'"`\n]*['"`]/ },
  { name: "unordered-list", regex: /['"`]- ['"`]/ },
  { name: "ordered-list", regex: /['"`]\d+\. ['"`]/ },
  { name: "indent", regex: /['"`] {2,}['"`]|['"`]\t['"`]/ },
];

// Extension-specific kind strings that should NOT appear in dom/ or engine/ code
// These belong in extensions/, not in the generic DOM renderer or engine
const extensionKinds = [
  "heading",
  "image",
  "bold",
  "italic",
  "link",
  "blockquote",
  "code",
  "strikethrough",
  "list",
  "list-item",
  "ordered-list",
  "unordered-list",
  "checkbox",
  "task",
  "indent",
];

// Pattern to detect hardcoded extension kinds in string literals
// Matches: "heading", 'heading', `heading`, === "heading", .kind === "heading", etc.
const extensionKindPattern = new RegExp(
  `['"\`](${extensionKinds.join("|")})['"\`]`,
);

function collectFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isSourceFile(file: string): boolean {
  return (
    file.endsWith(".ts") &&
    !file.endsWith(".test.ts") &&
    !file.endsWith(".browser.test.ts")
  );
}

describe("core syntax isolation", () => {
  it("does not embed extension syntax in core", () => {
    const files = collectFiles(coreDir).filter(isSourceFile);
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of syntaxPatterns) {
        expect(content).not.toMatch(pattern.regex);
      }
    }
  });
});

describe("dom renderer extension isolation", () => {
  it("does not hardcode extension-specific kinds in dom/", () => {
    const files = collectFiles(domDir).filter(isSourceFile);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      const relativePath = path.relative(cakeV3Dir, file);

      const match = content.match(extensionKindPattern);
      if (match) {
        throw new Error(
          `\n` +
            `================================================================================\n` +
            `EXTENSION ISOLATION VIOLATION in ${relativePath}\n` +
            `================================================================================\n` +
            `\n` +
            `Found hardcoded extension kind: "${match[1]}"\n` +
            `\n` +
            `The dom/ layer must NOT contain extension-specific rendering logic.\n` +
            `Extension-specific kinds like "${match[1]}" belong in extensions/${match[1]}/.\n` +
            `\n` +
            `The dom/ renderer should only handle generic AST types:\n` +
            `  - paragraph, text, inline-wrapper, inline-atom, block-wrapper, block-atom\n` +
            `\n` +
            `Extensions provide their own renderBlock/renderInline functions that the\n` +
            `dom/ layer calls via the extension system.\n` +
            `\n` +
            `To fix: Move the "${match[1]}" rendering logic to extensions/${match[1]}/\n` +
            `================================================================================\n`,
        );
      }
    }
  });
});
