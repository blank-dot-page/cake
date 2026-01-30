import { describe, it, expect } from "vitest";
import type { CakeUIComponent } from "../../core/runtime";
import type { CakeEditor } from "../../editor/cake-editor";

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

      const uiComponents: CakeUIComponent[] = [];
      const editor = {
        registerUI: (component: CakeUIComponent) => {
          uiComponents.push(component);
          return () => {
            const index = uiComponents.indexOf(component);
            if (index >= 0) {
              uiComponents.splice(index, 1);
            }
          };
        },
      } as unknown as CakeEditor;

      module.scrollbarExtension(editor);
      expect(uiComponents.length).toBe(1);
    });
  });
});
