# Cake Editor

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
