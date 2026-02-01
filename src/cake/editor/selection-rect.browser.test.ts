import { describe, it, expect, afterEach } from "vitest";
import { userEvent, page } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("selection rect positioning", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it("double-click selection rect stays on the clicked line", async () => {
    harness = createTestHarness("line 1\nline 2");

    await harness.doubleClick(0, 1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const selection = harness.selection;
    expect(selection.start).toBe(7);
    expect(selection.end).toBe(11);

    const selectionRects = harness.getSelectionRects();
    expect(selectionRects.length).toBe(1);

    // Rect should be on line 2, not line 1
    const line2Rect = harness.getLineRect(1);
    expect(selectionRects[0].top).toBe(line2Rect.top);
  });

  it("triple-click selection rect matches the line rect exactly", async () => {
    harness = createTestHarness("line 1\nline 2");

    await harness.tripleClick(1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const selection = harness.selection;
    expect(selection.start).toBe(7);
    expect(selection.end).toBe(13); // Includes the newline

    const selectionRects = harness.getSelectionRects();
    expect(selectionRects.length).toBe(1);

    // Rect should be on line 2
    const line2Rect = harness.getLineRect(1);
    expect(selectionRects[0].top).toBe(line2Rect.top);
    expect(selectionRects[0].left).toBe(0);
  });

  it("double-click on empty line places cursor on empty line", async () => {
    harness = createTestHarness("some text here\n\nsome text here");

    // Double-click on the empty line (line index 1)
    const line = harness.container.querySelectorAll(".cake-line")[1];
    await userEvent.dblClick(line);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const selection = harness.selection;
    const emptyLineRect = harness.getLineRect(1);

    // Selection should be on the empty line (position 15), not spanning to first line
    expect(selection.start).toBe(15);
    expect(selection.end).toBe(15);

    // Caret should be on the empty line
    const caretRect = harness.getCaretRect();
    expect(caretRect).not.toBeNull();
    expect(caretRect!.top).toBe(emptyLineRect.top);
  });

  it("triple-click on empty line selects the line with full-width rect", async () => {
    harness = createTestHarness("some text here\n\nsome text here");

    // Triple-click on the empty line (line index 1)
    await harness.tripleClick(1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const selection = harness.selection;
    const emptyLineRect = harness.getLineRect(1);

    // Selection should select the empty line (15-16)
    expect(selection.start).toBe(15);
    expect(selection.end).toBe(16);

    // Selection rect should be on the empty line and span full width
    const selectionRects = harness.getSelectionRects();
    expect(selectionRects.length).toBe(1);
    expect(selectionRects[0].top).toBe(emptyLineRect.top);
    expect(selectionRects[0].left).toBe(0);
    expect(selectionRects[0].width).toBe(emptyLineRect.width);
  });
});
