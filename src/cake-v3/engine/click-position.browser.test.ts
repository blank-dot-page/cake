import { describe, it, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("CakeV3Engine click positioning", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it("clicking right side of character places caret after it", async () => {
    harness = createTestHarness("hello world");

    await harness.clickRightOf(5); // right side of 'o'

    expect(harness.selection.start).toBe(6);
    expect(harness.selection.end).toBe(6);
  });

  it("clicking left side of character places caret before it", async () => {
    harness = createTestHarness("hello world");

    await harness.clickLeftOf(5); // left side of 'o'

    expect(harness.selection.start).toBe(5);
    expect(harness.selection.end).toBe(5);
  });

  describe("clicking in line area uses X coordinate for positioning", () => {
    it("clicking near end of line places caret near end, not at beginning", async () => {
      harness = createTestHarness("hello world");

      // Get the line element
      const line = harness.getLine(0);
      const lineRect = line.getBoundingClientRect();

      // Click near the right side of "world" (char index 10, the 'd')
      const charRect = harness.getCharRect(10);
      const clickX = charRect.right - 1;
      const clickY = lineRect.top + lineRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Should place caret near end of line (after 'd'), not at position 0
      expect(harness.selection.start).toBe(11);
      expect(harness.selection.end).toBe(11);
    });

    it("clicking in middle of line places caret in middle", async () => {
      harness = createTestHarness("hello world");

      const line = harness.getLine(0);
      const lineRect = line.getBoundingClientRect();

      // Click near the space between "hello" and "world" (char index 5)
      const charRect = harness.getCharRect(5);
      const clickX = charRect.left + charRect.width / 2;
      const clickY = lineRect.top + lineRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Should place caret at position 5 or 6
      expect(harness.selection.start).toBeGreaterThanOrEqual(5);
      expect(harness.selection.start).toBeLessThanOrEqual(6);
    });

    it("clicking past right edge of text places caret at end of line", async () => {
      harness = createTestHarness("short\nlonger line");

      // Click on line 1, but at an X position that's past the text
      // Line 1 is "short" (5 chars), line 2 is "longer line" (11 chars)
      const line1Rect = harness.getLineRect(0);
      const line2CharRect = harness.getCharRect(8, 1); // Position well into line 2's text area

      // Click at line 1's Y but at line 2's X (past line 1's text)
      const clickX = line2CharRect.left + line2CharRect.width / 2;
      const clickY = line1Rect.top + line1Rect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Should place caret at end of line 1 (position 5), not at beginning
      expect(harness.selection.start).toBe(5);
      expect(harness.selection.end).toBe(5);
    });
  });

  describe("clicking in gap between lines", () => {
    const LINE_GAP_CSS = `
      .cake-line {
        margin-bottom: 20px;
      }
    `;

    it("clicking in gap uses X coordinate to find closest character on nearest line", async () => {
      harness = createTestHarness({
        value: "line 1\nline 2",
        css: LINE_GAP_CSS,
      });

      const line1Rect = harness.getLineRect(0);
      const line2Rect = harness.getLineRect(1);

      // Verify there's actually a gap now
      expect(line2Rect.top).toBeGreaterThan(line1Rect.bottom);

      // Click in the gap, closer to line 2, at X position of 3rd character ("n")
      const gapY = line1Rect.bottom + (line2Rect.top - line1Rect.bottom) * 0.7;
      const charRect = harness.getCharRect(2, 1); // "n" in "line 2"
      const clickX = charRect.left + charRect.width / 2;

      await harness.clickAtCoords(clickX, gapY);

      // Should place caret at offset 2 on line 2 (document offset 9: 7 for "line 1\n" + 2)
      expect(harness.selection.start).toBe(9);
      expect(harness.selection.end).toBe(9);
    });

    it("clicking in gap near end of line places caret at correct X position", async () => {
      harness = createTestHarness({
        value: "line 1\nline 2",
        css: LINE_GAP_CSS,
      });

      const line1Rect = harness.getLineRect(0);
      const line2Rect = harness.getLineRect(1);

      // Click in the gap, closer to line 2, at X position past the end of text
      const gapY = line1Rect.bottom + (line2Rect.top - line1Rect.bottom) * 0.7;
      const charRect = harness.getCharRect(5, 1); // "2" in "line 2"
      const clickX = charRect.right + 10; // Past the end of the line

      await harness.clickAtCoords(clickX, gapY);

      // Should place caret at end of line 2 (document offset 13: 7 for "line 1\n" + 6)
      expect(harness.selection.start).toBe(13);
      expect(harness.selection.end).toBe(13);
    });
  });

  describe("clicking on wrapped lines", () => {
    const NARROW_CONTAINER_CSS = `
      .cake-content {
        width: 100px;
        font-family: monospace;
        font-size: 16px;
      }
    `;

    it("clicking on first visual row of wrapped line places caret at correct position", async () => {
      // Use a long line that will wrap in a narrow container
      harness = createTestHarness({
        value: "the quick brown fox jumps over",
        css: NARROW_CONTAINER_CSS,
      });

      const line = harness.getLine(0);
      const lineRect = line.getBoundingClientRect();

      // The line should wrap (height > single line height)
      expect(lineRect.height).toBeGreaterThan(25);

      // Click on "the" (chars 0-2) which is definitely on the first row
      const theRect = harness.getCharRect(1); // 'h' in "the"
      const clickX = theRect.left + theRect.width / 2;
      const clickY = theRect.top + theRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Should place caret at position 1 or 2 (around 'h' in "the")
      expect(harness.selection.start).toBeGreaterThanOrEqual(1);
      expect(harness.selection.start).toBeLessThanOrEqual(2);
    });

    it("clicking on second visual row places caret at correct position", async () => {
      harness = createTestHarness({
        value: "the quick brown fox jumps over",
        css: NARROW_CONTAINER_CSS,
      });

      const line = harness.getLine(0);
      const lineRect = line.getBoundingClientRect();

      // Verify line wraps
      expect(lineRect.height).toBeGreaterThan(25);

      // Find a character on the second visual row
      const firstRowChar = harness.getCharRect(0); // 't' - first row
      const secondRowChar = harness.getCharRect(10); // 'b' in "brown" - likely second row

      // These should be on different visual rows
      expect(secondRowChar.top).toBeGreaterThan(firstRowChar.bottom - 5);

      // Click on the second visual row at an X position in the middle of "brown"
      const char14Rect = harness.getCharRect(14); // 'o' in "brown"
      const clickX = char14Rect.left + char14Rect.width / 2;
      const clickY = secondRowChar.top + secondRowChar.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Should find position near char 14 on the second visual row
      expect(harness.selection.start).toBeGreaterThanOrEqual(13);
      expect(harness.selection.start).toBeLessThanOrEqual(15);
    });
  });
});
