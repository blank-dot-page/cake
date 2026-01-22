import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../test/harness";

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

describe("Cake v3 wrapped-line navigation (browser)", () => {
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
});
