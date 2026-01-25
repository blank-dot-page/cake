import { describe, it, expect, afterEach } from "vitest";
import { page } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("CakeEngine click positioning", () => {
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

  describe("clicking at end of line that fills container width (no wrap)", () => {
    it("clicking on right edge of last char places caret at end", async () => {
      // Create a line that fills the container width but doesn't wrap
      // Default container is 400px, monospace at 16px is ~10px per char
      // So ~40 characters should fill it
      const longText = "abcdefghijklmnopqrstuvwxyz0123456789abcd"; // 40 chars
      harness = createTestHarness({
        value: longText,
        css: `
          .cake-content {
            width: 400px;
            font-family: monospace;
            font-size: 16px;
            white-space: nowrap;
            overflow: hidden;
          }
        `,
      });

      const lastCharIndex = longText.length - 1; // 'd' at position 39
      const lastCharRect = harness.getCharRect(lastCharIndex);

      // Verify the line doesn't wrap (single row)
      const firstCharRect = harness.getCharRect(0);
      expect(lastCharRect.top).toBe(firstCharRect.top);

      // Click just inside the right edge of the last character
      const clickX = lastCharRect.right - 1;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Caret should be at the end (position 40), not position 39
      expect(harness.selection.start).toBe(longText.length);
      expect(harness.selection.end).toBe(longText.length);
    });

    it("clicking past right edge of text on full-width line places caret at end", async () => {
      // Line that nearly fills the container
      const longText = "abcdefghijklmnopqrstuvwxyz012345"; // 32 chars
      harness = createTestHarness({
        value: longText,
        css: `
          .cake-content {
            width: 400px;
            font-family: monospace;
            font-size: 16px;
          }
        `,
      });

      const lastCharIndex = longText.length - 1;
      const lastCharRect = harness.getCharRect(lastCharIndex);
      const lineRect = harness.getLineRect(0);

      // Click past the right edge of the text, in the empty space
      const clickX = lastCharRect.right + 20;
      const clickY = lineRect.top + lineRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Caret should be at end (position 32), not second-to-last
      expect(harness.selection.start).toBe(longText.length);
      expect(harness.selection.end).toBe(longText.length);
    });
  });

  describe("clicking at end of word-break wrapped line (single long word)", () => {
    // This replicates the blankpage editor styles where long words break mid-word
    const WORD_BREAK_CSS = `
      .cake-content {
        width: 100px;
        font-family: monospace;
        font-size: 16px;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;

    it("clicking at end of first visual row of broken word places caret correctly", async () => {
      // A long string of 'd's that will break across multiple lines
      const longWord = "d".repeat(50);
      harness = createTestHarness({
        value: longWord,
        css: WORD_BREAK_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          // This char is on next row
          break;
        }
        lastCharOnFirstRow = i;
      }

      // Get the rect of the last character on the first row
      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);

      // Click on the right edge of the last character on the first visual row
      const clickX = lastCharRect.right - 1;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Wait to ensure any async selection updates have settled
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Take screenshot for visual verification
      await page.screenshot({ path: "click-position-test.png" });

      // Caret should be placed AFTER that character (at the break point)
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);

      // Assert caret is visually on the first row
      const caretRect = harness.getCaretRect();
      expect(caretRect).not.toBeNull();
      if (caretRect) {
        expect(caretRect.top).toBeLessThan(lastCharRect.bottom);
      }
    });

    it("clicking RIGHT side of last char on first visual row places caret at end of row", async () => {
      // This is the specific case: clicking on the right half of the last character
      // should place caret AFTER it and keep it visually on the same row
      const EDITOR_CSS = `
        .cake {
          font-family: "Cousine", monospace;
          line-height: 2;
        }
        .cake-content {
          width: 200px;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;

      const longWord = "d".repeat(100);
      harness = createTestHarness({
        value: longWord,
        css: EDITOR_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          break;
        }
        lastCharOnFirstRow = i;
      }

      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);

      // Click on the RIGHT side of the last character (past center)
      const clickX = lastCharRect.left + lastCharRect.width * 0.75;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      console.log("=== RIGHT SIDE OF LAST CHAR TEST ===");
      console.log("lastCharOnFirstRow:", lastCharOnFirstRow);
      console.log("lastCharRect:", JSON.stringify(lastCharRect));
      console.log("clickX:", clickX, "(75% into char)");

      await harness.clickAtCoords(clickX, clickY);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const caretRect = harness.getCaretRect();
      console.log("selection:", JSON.stringify(harness.selection));
      console.log("caretRect:", JSON.stringify(caretRect));

      // Selection should be after the last char on first row
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);

      // Caret should be visually on the first row, not jumped to second row
      expect(caretRect).not.toBeNull();
      if (caretRect) {
        expect(caretRect.top).toBeLessThan(lastCharRect.bottom);
      }
    });

    it("clicking in margin (outside contenteditable, inside cake) on first visual row", async () => {
      // A long string of 'd's that will break across multiple lines
      const longWord = "d".repeat(50);
      harness = createTestHarness({
        value: longWord,
        css: WORD_BREAK_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          break;
        }
        lastCharOnFirstRow = i;
      }

      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);

      // Click far to the right of the content - in the margin area
      // The container is 400px wide, content is 100px, so click at 200px
      const clickX = 200;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      // Click on the harness container (outside contenteditable but inside cake)
      const containerRect = harness.container.getBoundingClientRect();
      await (await import("vitest/browser")).userEvent.click(harness.container, {
        position: {
          x: clickX - containerRect.left,
          y: clickY - containerRect.top,
        },
      });

      // Wait to ensure any async selection updates have settled
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Take screenshot for visual verification
      await page.screenshot({ path: "click-margin-test.png" });

      // Caret should be placed at the end of the first visual row
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);
    });

    it("clicking in empty space after last char but inside contenteditable", async () => {
      // Use CSS that leaves some space after the last character on each row
      // Width 105px with ~10px chars means ~10 chars per row with ~5px leftover
      const PADDED_CSS = `
        .cake-content {
          width: 105px;
          font-family: monospace;
          font-size: 16px;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;

      const longWord = "d".repeat(50);
      harness = createTestHarness({
        value: longWord,
        css: PADDED_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          break;
        }
        lastCharOnFirstRow = i;
      }

      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);
      const contentRect = harness.contentRoot.getBoundingClientRect();

      // Click in the empty space between last char and contenteditable edge
      // This is INSIDE the contenteditable but AFTER the last character
      const clickX = lastCharRect.right + (contentRect.right - lastCharRect.right) / 2;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Wait to ensure any async selection updates have settled
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Take screenshot for visual verification
      await page.screenshot({ path: "click-empty-space-test.png" });

      // Caret should be placed at the end of the first visual row
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);
    });

    it("clicking in empty space with line-height: 2 (like blankpage editor)", async () => {
      // Replicates blankpage editor CSS exactly
      // Use width that doesn't evenly divide by char width to leave empty space
      const EDITOR_CSS = `
        .cake {
          font-family: "Cousine", monospace;
          line-height: 2;
        }
        .cake-content {
          width: 205px;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;

      const longWord = "d".repeat(100);
      harness = createTestHarness({
        value: longWord,
        css: EDITOR_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          break;
        }
        lastCharOnFirstRow = i;
      }

      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);
      const contentRect = harness.contentRoot.getBoundingClientRect();

      // Click in the empty space between last char and contenteditable edge
      const clickX = lastCharRect.right + (contentRect.right - lastCharRect.right) / 2;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      console.log("lastCharOnFirstRow:", lastCharOnFirstRow);
      console.log("lastCharRect:", JSON.stringify(lastCharRect));
      console.log("contentRect.right:", contentRect.right);
      console.log("clickX:", clickX, "clickY:", clickY);
      console.log("empty space width:", contentRect.right - lastCharRect.right);

      await harness.clickAtCoords(clickX, clickY);

      // Wait to ensure any async selection updates have settled
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Take screenshot for visual verification
      await page.screenshot({ path: "click-empty-space-line-height-test.png" });

      console.log("selection after click:", JSON.stringify(harness.selection));

      // Check caret position - it should be on the first row, not the second
      const caretRect = harness.getCaretRect();
      console.log("caretRect:", JSON.stringify(caretRect));
      console.log("firstRowTop:", firstRowTop);

      // Caret should be placed at the end of the first visual row
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);

      // Assert caret is visually on the first row (not jumped to second row)
      expect(caretRect).not.toBeNull();
      if (caretRect) {
        // Caret top should be close to the first row's top, not on the second row
        expect(caretRect.top).toBeLessThan(firstCharRect.bottom);
      }
    });

    it("clicking in empty space BELOW the character (in line-height gap)", async () => {
      // With line-height: 2, there's vertical space between lines
      // Test clicking in that gap area but still on the first row's horizontal space
      const EDITOR_CSS = `
        .cake {
          font-family: "Cousine", monospace;
          line-height: 2;
        }
        .cake-content {
          width: 205px;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;

      const longWord = "d".repeat(100);
      harness = createTestHarness({
        value: longWord,
        css: EDITOR_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          break;
        }
        lastCharOnFirstRow = i;
      }

      // Get first char on second row to understand the gap
      const firstCharSecondRow = harness.getCharRect(lastCharOnFirstRow + 1);
      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);
      const contentRect = harness.contentRoot.getBoundingClientRect();

      // Click in the empty space, but lower - in the line-height gap
      // Y position: just below the first char rect, but above the second row
      const clickX = lastCharRect.right + (contentRect.right - lastCharRect.right) / 2;
      const clickY = lastCharRect.bottom + (firstCharSecondRow.top - lastCharRect.bottom) / 2;

      console.log("=== LINE HEIGHT GAP TEST ===");
      console.log("lastCharOnFirstRow:", lastCharOnFirstRow);
      console.log("lastCharRect.bottom:", lastCharRect.bottom);
      console.log("firstCharSecondRow.top:", firstCharSecondRow.top);
      console.log("gap height:", firstCharSecondRow.top - lastCharRect.bottom);
      console.log("clickX:", clickX, "clickY:", clickY);

      await harness.clickAtCoords(clickX, clickY);

      // Wait to ensure any async selection updates have settled
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Take screenshot for visual verification
      await page.screenshot({ path: "click-line-height-gap-test.png" });

      console.log("selection after click:", JSON.stringify(harness.selection));

      // Caret should be placed at the end of the first visual row
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);
    });
  });

  describe("clicking at end of wrapped line visual row", () => {
    const NARROW_CSS = `
      .cake-content {
        width: 100px;
        font-family: monospace;
        font-size: 16px;
      }
    `;

    it("clicking on right edge of last char on first visual row places caret after it", async () => {
      // Create text that wraps in the narrow container
      // "the quick brown" at ~10px per char in 100px = about 10 chars per row
      harness = createTestHarness({
        value: "the quick brown fox",
        css: NARROW_CSS,
      });

      // Get first char's top position as reference for first visual row
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last non-whitespace character that's still on the first visual row
      // Spaces at line wrap points have nearly zero width, so we need to find
      // the last character with substantial width
      let lastVisibleCharOnFirstRow = 0;
      for (let i = 1; i < 19; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          // This char is on next row
          break;
        }
        // Only count characters with visible width (skip collapsed whitespace)
        if (charRect.width > 1) {
          lastVisibleCharOnFirstRow = i;
        }
      }

      // Get the rect of the last visible character on the first row (should be 'k')
      const lastCharRect = harness.getCharRect(lastVisibleCharOnFirstRow);

      // Click just inside the right edge of the last visible character
      const clickX = lastCharRect.right - 1;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);

      // Caret should be placed AFTER that character
      // Position 8 is 'k', so caret should be at position 9
      expect(harness.selection.start).toBe(lastVisibleCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastVisibleCharOnFirstRow + 1);
    });

    it("clicking at end of wrapped line places caret at document end", async () => {
      harness = createTestHarness({
        value: "the quick brown fox",
        css: NARROW_CSS,
      });

      // Click on the right side of the last character
      const lastCharIndex = 18; // 'x' in "fox"
      await harness.clickRightOf(lastCharIndex);

      // Should place caret at end (position 19)
      expect(harness.selection.start).toBe(19);
      expect(harness.selection.end).toBe(19);
    });
  });

  describe("arrow key navigation on wrapped lines", () => {
    const WRAP_CSS = `
      .cake {
        font-family: "Cousine", monospace;
        line-height: 2;
      }
      .cake-content {
        width: 200px;
        white-space: pre-wrap;
        word-break: break-word;
      }
    `;

    it("arrow left from start of second visual row moves caret to end of first row", async () => {
      harness = createTestHarness({
        value: "d".repeat(100),
        css: WRAP_CSS,
      });

      const rows = harness.getVisualRows();
      const row0 = rows[0];
      const row1 = rows[1];

      // Click at start of second visual row
      await harness.clickLeftOf(row1.startOffset);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // === ASSERT BEFORE STATE ===
      expect(harness.selection.start).toBe(row1.startOffset);
      harness.assertCaretAtStartOfVisualRow(1);

      // Press arrow left
      await harness.pressKey("ArrowLeft");
      await new Promise((resolve) => setTimeout(resolve, 100));

      // === ASSERT AFTER STATE ===
      // Selection should be at end of first row (position AFTER last char)
      expect(harness.selection.start).toBe(row0.endOffset + 1);

      // Caret should be visually at END of FIRST row
      harness.assertCaretAtEndOfVisualRow(0);
    });

    it("arrow right from end of first visual row moves caret to start of second row", async () => {
      const EDITOR_CSS = `
        .cake {
          font-family: "Cousine", monospace;
          line-height: 2;
        }
        .cake-content {
          width: 200px;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `;

      const longWord = "d".repeat(100);
      harness = createTestHarness({
        value: longWord,
        css: EDITOR_CSS,
      });

      // Get first char's position as reference
      const firstCharRect = harness.getCharRect(0);
      const firstRowTop = firstCharRect.top;

      // Find the last character on the first visual row
      let lastCharOnFirstRow = 0;
      for (let i = 1; i < longWord.length; i++) {
        const charRect = harness.getCharRect(i);
        if (charRect.top > firstRowTop + 5) {
          break;
        }
        lastCharOnFirstRow = i;
      }

      const lastCharRect = harness.getCharRect(lastCharOnFirstRow);
      const firstCharOnSecondRow = lastCharOnFirstRow + 1;
      const firstCharSecondRowRect = harness.getCharRect(firstCharOnSecondRow);

      // Click at the END of the first visual row (right side of last char)
      const clickX = lastCharRect.right - 1;
      const clickY = lastCharRect.top + lastCharRect.height / 2;

      await harness.clickAtCoords(clickX, clickY);
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("=== ARROW RIGHT FROM FIRST ROW END ===");
      console.log("lastCharOnFirstRow:", lastCharOnFirstRow);
      console.log("selection before arrow:", JSON.stringify(harness.selection));

      const caretBeforeRect = harness.getCaretRect();
      console.log("caretRect before arrow right:", JSON.stringify(caretBeforeRect));

      // Verify we're at the end of first row (position after last char)
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);

      // Press arrow right
      await harness.pressKey("ArrowRight");
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log("selection after arrow right:", JSON.stringify(harness.selection));

      const caretRect = harness.getCaretRect();
      console.log("caretRect after arrow right:", JSON.stringify(caretRect));

      // Selection should stay at position 25, but with forward affinity
      // (visually moving from end of row 0 to start of row 1)
      expect(harness.selection.start).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.end).toBe(lastCharOnFirstRow + 1);
      expect(harness.selection.affinity).toBe("forward");

      // Caret should now be visually on the SECOND row
      expect(caretRect).not.toBeNull();
      if (caretRect) {
        expect(caretRect.top).toBeGreaterThanOrEqual(firstCharSecondRowRect.top);
      }
    });
  });
});
