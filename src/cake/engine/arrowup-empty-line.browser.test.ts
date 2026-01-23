import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("Cake vertical navigation (browser)", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("ArrowUp from paragraph below a heading lands on the empty line between them", async () => {
    const value =
      "# Cake Demo\n\nTry **bold**, *italic*, ~~strike~~, and [links](https://example.com)";
    harness = createTestHarness(value);

    expect(harness.getLineCount()).toBe(3);

    const paragraphLineIndex = 2;
    const paragraphText = harness.getLine(paragraphLineIndex).textContent ?? "";
    expect(paragraphText.length).toBeGreaterThan(0);

    // Place caret at end of the paragraph line (rendered text, not markdown source).
    await harness.clickRightOf(paragraphText.length - 1, paragraphLineIndex);
    await harness.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    let arrowUpPrevented = false;
    harness.container.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        arrowUpPrevented = event.defaultPrevented;
      }
    });

    await userEvent.keyboard("{ArrowUp}");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(arrowUpPrevented).toBe(true);

    const headingTextLength = harness.getLine(0).textContent?.length ?? 0;
    const emptyLineCursorOffset = headingTextLength + 1; // newline between blocks
    expect(harness.selection).toEqual({
      start: emptyLineCursorOffset,
      end: emptyLineCursorOffset,
      affinity: "forward",
    });

    const caret = harness.getCaretRect();
    expect(caret).not.toBeNull();
    const emptyLineTop = harness.getLineRect(1).top;
    expect(Math.abs(caret!.top - emptyLineTop)).toBeLessThanOrEqual(3);
  });
});
