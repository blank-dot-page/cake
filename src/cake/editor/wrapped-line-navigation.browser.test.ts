import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../test/harness";
import { bundledExtensions } from "../extensions";

function collectVisualRowTops(harness: TestHarness, textLength: number) {
  const tops: number[] = [];
  for (let i = 0; i < textLength; i += 1) {
    const top = harness.getCharRect(i, 0).top;
    const hasTop = tops.some((existing) => Math.abs(existing - top) <= 1);
    if (!hasTop) {
      tops.push(top);
    }
  }
  return tops.sort((a, b) => a - b);
}

function findRowRightEdge(
  harness: TestHarness,
  textLength: number,
  rowTop: number,
): number {
  let rightEdge = -Infinity;
  for (let i = 0; i < textLength; i += 1) {
    const rect = harness.getCharRect(i, 0);
    if (Math.abs(rect.top - rowTop) <= 1) {
      rightEdge = Math.max(rightEdge, rect.right);
    }
  }
  return rightEdge;
}

describe("Cake wrapped-line navigation (browser)", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("ArrowUp from end of a wrapped line lands at end of previous visual row", async () => {
    const text =
      "Use midpoint logic for intuitive drop target positioning- Use midpoint logic for intuitive drop target positioning Use midpoint logic";

    harness = createTestHarness(text);

    // Force wrapping to be deterministic in the test runner viewport.
    harness.container.style.width = "250px";
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const firstCharRect = harness.getCharRect(0, 0);
    const lastCharRect = harness.getCharRect(text.length - 1, 0);
    expect(lastCharRect.top).toBeGreaterThan(firstCharRect.top + 2);

    await harness.clickRightOf(text.length - 1, 0);
    expect(harness.selection).toEqual(
      expect.objectContaining({ start: text.length, end: text.length }),
    );

    await harness.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const caretAtEnd = harness.getCaretRect();
    expect(caretAtEnd).not.toBeNull();
    expect(caretAtEnd!.height).toBeGreaterThan(0);
    expect(caretAtEnd!.top).toBeGreaterThan(0);
    let arrowUpPrevented = false;
    harness.container.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        arrowUpPrevented = event.defaultPrevented;
      }
    });
    await userEvent.keyboard("{ArrowUp}");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(arrowUpPrevented).toBe(true);

    const caret = harness.getCaretRect();
    expect(caret).not.toBeNull();
    expect(caret!.top).toBeLessThan(caretAtEnd!.top - 1);
    const containerRect = harness.container.getBoundingClientRect();
    const rowTops = collectVisualRowTops(harness, text.length);
    expect(rowTops.length).toBeGreaterThanOrEqual(2);

    const caretAtEndAbsTop = caretAtEnd!.top + containerRect.top;
    const caretRowTop =
      rowTops.find((top) => Math.abs(top - caretAtEndAbsTop) <= 2) ??
      rowTops[rowTops.length - 1];
    const caretRowIndex = rowTops.indexOf(caretRowTop);
    expect(caretRowIndex).toBeGreaterThan(0);

    const targetRowTop = rowTops[caretRowIndex - 1]!;
    const targetRowRightEdge = findRowRightEdge(
      harness,
      text.length,
      targetRowTop,
    );
    expect(targetRowRightEdge).toBeGreaterThan(0);
    const expectedCaretLeft = Math.min(
      caretAtEnd!.left,
      targetRowRightEdge - containerRect.left,
    );
    const expectedCaretTop = targetRowTop - containerRect.top;

    expect(Math.abs(caret!.left - expectedCaretLeft)).toBeLessThanOrEqual(6);
    expect(Math.abs(caret!.top - expectedCaretTop)).toBeLessThanOrEqual(3);
  });

  it("ArrowDown from end of first visual row moves to second visual row, not next logical line", async () => {
    // Setup:
    // [long line that wraps into two lines]
    // [empty line]
    // [another short line]
    //
    // Place caret at end of first visual line, press ArrowDown.
    // Expected: caret moves to end of second visual line (same logical line)
    // Bug: caret skips to the empty line (next logical line)
    const longText = "This is a long line that should wrap into multiple visual lines when the container is narrow enough";
    const content = `${longText}\n\nshort`;

    harness = createTestHarness({
      value: content,
      extensions: bundledExtensions,
    });

    harness.container.style.width = "200px";
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Verify we have multiple visual rows in the first logical line
    const rows = harness.getVisualRows(0);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Click at end of first visual row
    const firstRowEndOffset = rows[0].endOffset;
    await harness.clickRightOf(firstRowEndOffset, 0);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Verify caret is on the first visual row
    harness.assertCaretOnVisualRow(0, 0);
    const caretBefore = harness.getCaretRect();
    expect(caretBefore).not.toBeNull();

    // Press ArrowDown
    await userEvent.keyboard("{ArrowDown}");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const caretAfter = harness.getCaretRect();
    expect(caretAfter).not.toBeNull();

    // Caret should still be on the first logical line (line index 0),
    // but on the second visual row
    harness.assertCaretOnVisualRow(1, 0);

    // The caret Y should be on the second visual row of line 0,
    // not jumped to the empty line (line 1)
    const row1 = rows[1];
    expect(caretAfter!.top).toBeGreaterThanOrEqual(
      row1.top - harness.container.getBoundingClientRect().top - 3,
    );
    expect(caretAfter!.top).toBeLessThanOrEqual(
      row1.bottom - harness.container.getBoundingClientRect().top + 3,
    );
  });

  it("ArrowDown from end of first visual row (via setSelection) moves to second visual row", async () => {
    // Same test but using setSelection instead of click to ensure
    // we test the code path where lastFocusRect might not be accurate
    // Text chosen so first visual row is longer than second
    const longText = "This is a fairly long line that will wrap into two rows";
    const content = `${longText}\n\nshort`;

    harness = createTestHarness({
      value: content,
      extensions: bundledExtensions,
    });

    harness.container.style.width = "300px";
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const rows = harness.getVisualRows(0);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Set selection programmatically to end of first visual row
    const firstRowEndOffset = rows[0].endOffset;
    harness.engine.setSelection({
      start: firstRowEndOffset,
      end: firstRowEndOffset,
      affinity: "backward",
    });
    await harness.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Verify selection is at expected position
    expect(harness.selection.start).toBe(firstRowEndOffset);
    expect(harness.selection.end).toBe(firstRowEndOffset);

    const caretBefore = harness.getCaretRect();
    expect(caretBefore).not.toBeNull();
    // Verify caret is visually on first row
    harness.assertCaretOnVisualRow(0, 0);

    // Press ArrowDown
    await userEvent.keyboard("{ArrowDown}");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const caretAfter = harness.getCaretRect();
    expect(caretAfter).not.toBeNull();

    // Caret should move to second visual row of same line, not skip to next line
    harness.assertCaretOnVisualRow(1, 0);
  });

  it("ArrowDown from end of first visual row (via Cmd+ArrowRight) moves to second visual row", async () => {
    // This test replicates the editor bug - using Cmd+ArrowRight to position
    // at end of first visual row, then ArrowDown
    // Uses line-height: 2 like the actual editor
    const longText =
      "This is a fairly long line that will wrap into two rows";
    const content = `${longText}\n\nshort`;

    harness = createTestHarness({
      value: content,
      extensions: bundledExtensions,
      css: `.cake-content { font-family: monospace; line-height: 2; }`,
    });

    // Add cake class to container like the editor does
    harness.container.classList.add("cake");
    harness.container.style.width = "300px";
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const rows = harness.getVisualRows(0);
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Focus at start of document
    await harness.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Use Cmd+ArrowRight to position at end of first visual row
    await userEvent.keyboard("{Meta>}{ArrowRight}{/Meta}");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Verify Cmd+Right positioned us at end of first visual row
    // Note: The layout model uses exclusive endOffset (37), while getVisualRows uses inclusive (36)
    // Both represent the same cursor position - at the boundary between row 0 and row 1
    expect(harness.selection.start).toBe(rows[0].endOffset + 1);

    // Verify caret is visually on first row before ArrowDown
    harness.assertCaretOnVisualRow(0, 0);

    // Press ArrowDown
    await userEvent.keyboard("{ArrowDown}");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const caretAfter = harness.getCaretRect();
    expect(caretAfter).not.toBeNull();

    // Caret should move to second visual row of same line, not skip to next line
    harness.assertCaretOnVisualRow(1, 0);
  });
});
