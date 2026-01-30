import { describe, it, expect } from "vitest";
import { installExtensions } from "../../core/runtime";

/**
 * The scrollbar extension is a React-only overlay component.
 * It doesn't have pure parsing/serialization logic like other extensions.
 *
 * All functional tests for scrollbar behavior are in scrollbar.browser.test.tsx
 * which tests the actual React component rendering and interaction.
 */

describe("scrollbar extension", () => {
  describe("constants", () => {
    it("exports expected constants", async () => {
      // The scrollbar component uses internal constants
      // These are tested implicitly through browser tests
      // This test validates the module can be imported
      const module = await import("./index");
      expect(module.scrollbarExtension).toBeDefined();
      expect(typeof module.scrollbarExtension).toBe("function");

      const installed = installExtensions([module.scrollbarExtension]);
      expect(installed.ui.components.length).toBe(1);
    });
  });
});
