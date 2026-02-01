# Cake Editor

## Cursor vs Source vs Visible Text Positions

Cake has three position systems:

1. **Source positions**: Raw markdown character offsets (`getValue().length`)
2. **Cursor positions**: What `getSelection()`/`setSelection()` use - excludes syntax markers like `# `, `- `, `**`
3. **Visible text positions**: What `getTextSelection()`/`setTextSelection()` use - the rendered text the user sees

When writing tests with `setSelection()`, use `selectAll()` to discover the cursor length:

```typescript
harness.engine.selectAll();
const cursorLength = harness.selection.end; // Not getValue().length
```

## Browser Test Screenshots

When adding screenshots to browser tests, use `page.screenshot()` from `vitest/browser` and save to the `.vitest-screenshots/` directory at the project root:

```typescript
import { page } from "vitest/browser";

// Use relative path from test file to project root
await page.screenshot({
  path: "../../../.vitest-screenshots/my-screenshot-name.png",
});
```

The path should be relative from the test file location to the project root's `.vitest-screenshots/` folder.

## Testing

Browser tests use Vitest browser mode (`*.browser.test.ts`), not Playwright. Use `createTestHarness()` from `../test/harness` for all browser tests.

Playwright (`e2e/` folder) is only for debugging against the demo app with temporary tests. Do not use Playwright for actual test coverage - always use Vitest browser tests instead.
