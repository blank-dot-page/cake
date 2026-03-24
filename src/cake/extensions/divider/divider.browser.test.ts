import { afterEach, describe, expect, test } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";
import { hitTestFromLayout } from "../../editor/selection/selection-layout-dom";

function getCollapsedSelectionRect(): DOMRect {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.anchorNode) {
    throw new Error("Missing selection");
  }
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  const rect =
    rects.length > 0 ? rects[rects.length - 1]! : range.getBoundingClientRect();
  if (rect.top !== 0 || rect.left !== 0 || rect.width !== 0 || rect.height !== 0) {
    return rect;
  }

  const anchorElement =
    selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode.parentElement;
  const line = anchorElement?.closest("[data-line-index]");
  if (!(line instanceof HTMLElement)) {
    return rect;
  }
  return line.getBoundingClientRect();
}

describe("divider extension backspace behavior", () => {
  let harness: TestHarness | null = null;
  const extraHarnesses: TestHarness[] = [];

  afterEach(() => {
    harness?.destroy();
    harness = null;
    while (extraHarnesses.length > 0) {
      extraHarnesses.pop()?.destroy();
    }
  });

  test("backspace when the caret is on a divider deletes it", async () => {
    harness = createTestHarness("text\n---\nmore");
    harness.engine.setSelection({
      start: 6,
      end: 6,
      affinity: "forward",
    });

    await harness.pressBackspace();

    expect(harness.engine.getValue()).toBe("text\nmore");
    expect(harness.engine.getSelection()).toEqual({
      start: 5,
      end: 5,
      affinity: "forward",
    });
  });

  test("backspacing the last character on the empty line after a divider leaves the divider intact", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("---");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.engine.getValue()).toBe("---\n");

    await harness.typeText("hello");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.engine.getValue()).toBe("---\nhello");

    for (let index = 0; index < 5; index += 1) {
      await harness.pressBackspace();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.engine.getValue()).toBe("---\n");

    const emptyLineStart = harness.engine.getLines()[1]?.lineStartOffset;
    expect(emptyLineStart).toBeDefined();
    expect(harness.engine.getSelection()).toEqual({
      start: emptyLineStart!,
      end: emptyLineStart!,
      affinity: "forward",
    });

    await harness.pressBackspace();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.engine.getValue()).toBe("---\n");
    expect(harness.engine.getSelection()).toEqual({
      start: emptyLineStart!,
      end: emptyLineStart!,
      affinity: "forward",
    });
  });

  test("backspace after a leading divider deletes it and keeps the paragraph at the top", async () => {
    harness = createTestHarness("---\ntext");
    harness.engine.setSelection({
      start: 1,
      end: 1,
      affinity: "forward",
    });

    await harness.pressBackspace();

    expect(harness.engine.getValue()).toBe("text");
    expect(harness.engine.getSelection()).toEqual({
      start: 0,
      end: 0,
      affinity: "forward",
    });
  });

  test("typing three dashes renders an hr inside a non-editable divider block", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("---");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dividerBlock = harness.container.querySelector(
      '[data-block-atom="divider"][contenteditable="false"]',
    );
    expect(dividerBlock).not.toBeNull();
    expect(dividerBlock?.querySelector("hr")).not.toBeNull();
  });

  test("typing three dashes places the DOM selection below the divider", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("---");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const divider = harness.container.querySelector(
      '[data-block-atom="divider"] hr',
    );
    if (!(divider instanceof HTMLHRElement)) {
      throw new Error("Missing divider hr");
    }

    const selectionRect = getCollapsedSelectionRect();
    const dividerRect = divider.getBoundingClientRect();
    expect(selectionRect.top).toBeGreaterThan(dividerRect.bottom - 1);
  });

  test("selection overlay over a divider line matches a normal text line height", async () => {
    const textHarness = createTestHarness("text");
    extraHarnesses.push(textHarness);

    await textHarness.focus();
    textHarness.engine.selectAll();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const textSelectionRect = textHarness.getSelectionRects()[0];
    expect(textSelectionRect).toBeDefined();

    harness = createTestHarness("text\n---\nmore");
    await harness.focus();
    harness.engine.selectAll();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dividerLineTop = harness.getLineRect(1).top;
    const dividerSelectionRect = harness
      .getSelectionRects()
      .find((rect) => Math.abs(rect.top - dividerLineTop) <= 1);

    expect(dividerSelectionRect).toBeDefined();
    expect(
      Math.abs(dividerSelectionRect!.height - textSelectionRect!.height),
    ).toBeLessThanOrEqual(1);
  });

  test("selection overlay highlights the divider as soon as the selection reaches it", async () => {
    harness = createTestHarness("alpha\n---\nomega");

    await harness.focus();
    const dividerLineRect = harness.getLineRect(1);
    const hit = hitTestFromLayout({
      clientX: dividerLineRect.left + dividerLineRect.width / 2,
      clientY: dividerLineRect.top + dividerLineRect.height / 2,
      root: harness.contentRoot,
      container: harness.container,
      lines: harness.engine.getLines(),
    });

    expect(hit).not.toBeNull();

    harness.engine.setSelection({
      start: 0,
      end: hit!.cursorOffset,
      affinity: "forward",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dividerLineTop = dividerLineRect.top;
    const nextLineTop = harness.getLineRect(2).top;
    const dividerSelectionRect = harness
      .getSelectionRects()
      .find((rect) => Math.abs(rect.top - dividerLineTop) <= 1);
    const nextLineSelectionRect = harness
      .getSelectionRects()
      .find((rect) => Math.abs(rect.top - nextLineTop) <= 1);

    expect(dividerSelectionRect).toBeDefined();
    expect(nextLineSelectionRect).toBeUndefined();
  });
});
