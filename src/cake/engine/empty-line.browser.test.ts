import { describe, it, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("CakeEngine empty line handling", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  describe("empty line height", () => {
    it("empty line has same height as a line with content", async () => {
      // Create doc with one empty line and one line with content
      harness = createTestHarness("hello\n\nworld");

      const line0Rect = harness.getLineRect(0); // "hello"
      const line1Rect = harness.getLineRect(1); // empty line
      const line2Rect = harness.getLineRect(2); // "world"

      // Empty line should have same height as lines with content
      expect(line1Rect.height).toBe(line0Rect.height);
      expect(line1Rect.height).toBe(line2Rect.height);
    });

    it("empty line at start of document has correct height", async () => {
      harness = createTestHarness("\nhello");

      const line0Rect = harness.getLineRect(0); // empty line
      const line1Rect = harness.getLineRect(1); // "hello"

      expect(line0Rect.height).toBe(line1Rect.height);
    });

    it("empty line at end of document has correct height", async () => {
      harness = createTestHarness("hello\n");

      const line0Rect = harness.getLineRect(0); // "hello"
      const line1Rect = harness.getLineRect(1); // empty line

      expect(line1Rect.height).toBe(line0Rect.height);
    });

    it("multiple consecutive empty lines each have correct height", async () => {
      harness = createTestHarness("hello\n\n\nworld");

      const line0Rect = harness.getLineRect(0); // "hello"
      const line1Rect = harness.getLineRect(1); // empty line
      const line2Rect = harness.getLineRect(2); // empty line
      const line3Rect = harness.getLineRect(3); // "world"

      expect(line1Rect.height).toBe(line0Rect.height);
      expect(line2Rect.height).toBe(line0Rect.height);
      expect(line3Rect.height).toBe(line0Rect.height);
    });
  });

  describe("caret on empty line", () => {
    it("caret on empty line is positioned correctly", async () => {
      harness = createTestHarness("hello\n\nworld");

      // Click on empty line
      const line1Rect = harness.getLineRect(1);
      await harness.clickAtCoords(
        line1Rect.left + 5,
        line1Rect.top + line1Rect.height / 2,
      );

      // Caret should be at position 6 (after "hello\n")
      expect(harness.selection.start).toBe(6);
      expect(harness.selection.end).toBe(6);
    });

    it("caret height on empty line matches caret height on line with content", async () => {
      harness = createTestHarness("hello\n\nworld");

      // Get caret element
      const caretElement = harness.container.querySelector(".cake-caret");
      expect(caretElement).not.toBeNull();

      // Click on line with content
      await harness.clickAt(0, 0);
      const caretHeightOnContent = (caretElement as HTMLElement).offsetHeight;

      // Click on empty line
      const line1Rect = harness.getLineRect(1);
      await harness.clickAtCoords(
        line1Rect.left + 5,
        line1Rect.top + line1Rect.height / 2,
      );
      const caretHeightOnEmpty = (caretElement as HTMLElement).offsetHeight;

      expect(caretHeightOnEmpty).toBe(caretHeightOnContent);
    });
  });
});
