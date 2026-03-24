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

function getLineSelection(
  harness: TestHarness,
  lineIndex: number,
): { start: number; end: number; affinity: "forward" } {
  const line = harness.engine.getLines()[lineIndex];
  if (!line) {
    throw new Error(`Missing line ${lineIndex}`);
  }

  const start = line.lineStartOffset;
  const end = start + line.cursorLength + (line.hasNewline ? 1 : 0);
  return { start, end, affinity: "forward" };
}

function getSelectionRectForLine(
  harness: TestHarness,
  lineIndex: number,
): { top: number; left: number; width: number; height: number } | undefined {
  const lineTop = harness.getLineRect(lineIndex).top;
  return harness
    .getSelectionRects()
    .find((rect) => Math.abs(rect.top - lineTop) <= 1);
}

function dispatchMouseClickAt(
  harness: TestHarness,
  clientX: number,
  clientY: number,
) {
  const target = document.elementFromPoint(clientX, clientY) ?? harness.container;
  harness.contentRoot.focus();

  target.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    }),
  );
  target.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 0,
    }),
  );
  target.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 0,
      detail: 1,
    }),
  );
}

async function clickDividerAt(
  harness: TestHarness,
  clientX: number,
  clientY: number,
) {
  dispatchMouseClickAt(harness, clientX, clientY);
  await new Promise((resolve) => setTimeout(resolve, 50));
}

async function pressKeyboardBackspace(harness: TestHarness) {
  harness.contentRoot.focus();
  harness.contentRoot.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
      code: "Backspace",
    }),
  );
  harness.contentRoot.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
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

  test("backspace on the empty line after a divider moves the caret before the divider", async () => {
    harness = createTestHarness("hello\n---\n");
    const emptyLineStart = harness.engine.getLines()[2]?.lineStartOffset;
    expect(emptyLineStart).toBeDefined();
    harness.engine.setSelection({
      start: emptyLineStart!,
      end: emptyLineStart!,
      affinity: "forward",
    });

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("hello\n---");
    expect(harness.engine.getSelection()).toEqual({
      start: 5,
      end: 5,
      affinity: "forward",
    });
  });

  test("backspace on the empty line after a leading divider deletes the divider", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("---");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.engine.getValue()).toBe("---\n");

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("");
    expect(harness.engine.getSelection()).toEqual({
      start: 0,
      end: 0,
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

  test("clicking the center of a divider selects it with a full-width selection rect", async () => {
    harness = createTestHarness("above\n---\nbelow");

    const dividerLineRect = harness.getLineRect(1);
    await clickDividerAt(
      harness,
      dividerLineRect.left + dividerLineRect.width / 2,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    expect(harness.selection).toEqual(getLineSelection(harness, 1));

    const selectionRect = getSelectionRectForLine(harness, 1);
    expect(selectionRect).toBeDefined();
    expect(selectionRect!.width).toBeGreaterThan(0);
    expect(selectionRect!.height).toBeGreaterThan(0);
    expect(Math.abs(selectionRect!.width - dividerLineRect.width)).toBeLessThanOrEqual(
      1,
    );
  });

  test("clicking the left edge of a divider selects it", async () => {
    harness = createTestHarness("above\n---\nbelow");

    const dividerLineRect = harness.getLineRect(1);
    await clickDividerAt(
      harness,
      dividerLineRect.left + 1,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    expect(harness.selection).toEqual(getLineSelection(harness, 1));
  });

  test("clicking the right edge of a divider selects it", async () => {
    harness = createTestHarness("above\n---\nbelow");

    const dividerLineRect = harness.getLineRect(1);
    await clickDividerAt(
      harness,
      dividerLineRect.right - 1,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    expect(harness.selection).toEqual(getLineSelection(harness, 1));
  });

  test("ArrowDown from a selected divider collapses the selection onto the line below", async () => {
    harness = createTestHarness("above\n---\nbelow");

    const dividerLineRect = harness.getLineRect(1);
    await clickDividerAt(
      harness,
      dividerLineRect.left + dividerLineRect.width / 2,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    await harness.pressKey("ArrowDown");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const belowLine = harness.engine.getLines()[2];
    expect(belowLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: belowLine!.lineStartOffset,
      end: belowLine!.lineStartOffset,
      affinity: "forward",
    });
  });

  test("ArrowUp from a selected divider collapses the selection onto the line above", async () => {
    harness = createTestHarness("above\n---\nbelow");

    const dividerLineRect = harness.getLineRect(1);
    await clickDividerAt(
      harness,
      dividerLineRect.left + dividerLineRect.width / 2,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    await harness.pressKey("ArrowUp");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const aboveLine = harness.engine.getLines()[0];
    expect(aboveLine).toBeDefined();
    const aboveLineEnd = aboveLine!.lineStartOffset + aboveLine!.cursorLength;
    expect(harness.selection).toEqual({
      start: aboveLineEnd,
      end: aboveLineEnd,
      affinity: "backward",
    });
  });

  test("clicking a divider then pressing backspace deletes it between paragraphs", async () => {
    harness = createTestHarness("above\n---\nbelow");

    const dividerLineRect = harness.getLineRect(1);
    await clickDividerAt(
      harness,
      dividerLineRect.left + dividerLineRect.width / 2,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("above\nbelow");
    const belowLine = harness.engine.getLines()[1];
    expect(belowLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: belowLine!.lineStartOffset,
      end: belowLine!.lineStartOffset,
      affinity: "forward",
    });
  });

  test("clicking a leading divider then pressing backspace deletes it and keeps the paragraph at the top", async () => {
    harness = createTestHarness("---\nbelow");

    const dividerLineRect = harness.getLineRect(0);
    await clickDividerAt(
      harness,
      dividerLineRect.left + dividerLineRect.width / 2,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("below");
    expect(harness.selection).toEqual({
      start: 0,
      end: 0,
      affinity: "forward",
    });
  });

  test("clicking the only divider then pressing backspace leaves an empty document", async () => {
    harness = createTestHarness("---");

    const dividerLineRect = harness.getLineRect(0);
    await clickDividerAt(
      harness,
      dividerLineRect.left + dividerLineRect.width / 2,
      dividerLineRect.top + dividerLineRect.height / 2,
    );

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("");
    expect(harness.selection).toEqual({
      start: 0,
      end: 0,
      affinity: "forward",
    });
  });
});
