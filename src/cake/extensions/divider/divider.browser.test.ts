import { afterEach, describe, expect, test } from "vitest";
import { commands, userEvent } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../../test/harness";
import { hitTestFromLayout } from "../../editor/selection/selection-layout-dom";

declare module "vitest/browser" {
  interface BrowserCommands {
    clickAtCoordinates: (
      x: number,
      y: number,
      debug?: boolean,
    ) => Promise<void>;
  }
}

const PADDED_EDITOR_CSS = `
  .cake-content {
    box-sizing: border-box;
    padding: 12px 24px;
    font: 16px/24px Georgia, serif;
  }
`;

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

function getRenderedSelectionRectForLine(
  harness: TestHarness,
  lineIndex: number,
): DOMRect | undefined {
  const lineTop = harness.getLineRect(lineIndex).top;
  return harness
    .getRenderedSelectionRects()
    .find((rect) => Math.abs(rect.top - lineTop) <= 1);
}

function getContentBoxRect(harness: TestHarness): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const contentRect = harness.contentRoot.getBoundingClientRect();
  const styles = window.getComputedStyle(harness.contentRoot);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;

  return {
    left: contentRect.left + paddingLeft,
    top: contentRect.top + paddingTop,
    width: contentRect.width - paddingLeft - paddingRight,
    height: contentRect.height - paddingTop - paddingBottom,
  };
}

async function waitForOverlay() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

function dispatchMouseClickOnElement(
  element: HTMLElement,
  clientX: number,
  clientY: number,
) {
  element.dispatchEvent(
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    }),
  );
  element.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: 0,
    }),
  );
  element.dispatchEvent(
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
  lineIndex: number,
  horizontalPosition: "left" | "center" | "right" = "center",
) {
  const divider = harness.getLine(lineIndex);
  const dividerRect = divider.getBoundingClientRect();
  const clientX =
    horizontalPosition === "left"
      ? dividerRect.left + 1
      : horizontalPosition === "right"
        ? dividerRect.right - 1
        : dividerRect.left + dividerRect.width / 2;
  const clientY = dividerRect.top + dividerRect.height / 2;

  // Intentionally avoid pre-focusing the editor here. The user-facing bug is
  // about what a plain mouse click on the divider actually renders.
  dispatchMouseClickOnElement(divider, clientX, clientY);
  await waitForOverlay();
}

function getDividerHr(harness: TestHarness, lineIndex: number): HTMLHRElement {
  const dividerLine = harness.getLine(lineIndex);
  const divider = dividerLine.querySelector("hr");
  if (!(divider instanceof HTMLHRElement)) {
    throw new Error(`Missing divider hr on line ${lineIndex}`);
  }
  return divider;
}

async function clickDividerHrWithRealPointer(
  harness: TestHarness,
  lineIndex: number,
) {
  const divider = getDividerHr(harness, lineIndex);
  const dividerRect = divider.getBoundingClientRect();
  await commands.clickAtCoordinates(
    dividerRect.left + dividerRect.width / 2,
    dividerRect.top + dividerRect.height / 2,
  );
  await waitForOverlay();
}

async function getReferenceTextLineSelectionRect(
  extraHarnesses: TestHarness[],
): Promise<DOMRect> {
  const referenceHarness = createTestHarness({
    value: "reference\nline",
    css: PADDED_EDITOR_CSS,
  });
  extraHarnesses.push(referenceHarness);

  await referenceHarness.tripleClick(0);
  await waitForOverlay();

  const rect = getRenderedSelectionRectForLine(referenceHarness, 0);
  if (!rect) {
    throw new Error("Missing reference text selection rect");
  }
  return rect;
}

function expectRenderedDividerSelectionRect(
  harness: TestHarness,
  lineIndex: number,
  referenceLineHeight: number,
) {
  const containerRect = harness.container.getBoundingClientRect();
  const lineRect = harness.getLineRect(lineIndex);
  const contentBox = getContentBoxRect(harness);
  const styles = window.getComputedStyle(harness.contentRoot);
  const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const selectionRects = harness.getRenderedSelectionRects();
  const selectionRect = getRenderedSelectionRectForLine(harness, lineIndex);

  expect(selectionRect).toBeDefined();
  expect(selectionRects).toHaveLength(1);
  expect(harness.getRenderedCaretRect()).toBeNull();

  const leftWithinEditor = selectionRect!.left - containerRect.left;
  expect(leftWithinEditor).toBeGreaterThanOrEqual(paddingLeft - 1);
  expect(Math.abs(selectionRect!.left - lineRect.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(selectionRect!.width - contentBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(selectionRect!.width - lineRect.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(selectionRect!.height - referenceLineHeight)).toBeLessThanOrEqual(
    1,
  );

  return selectionRect!;
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
  await waitForOverlay();
}

function expectCaretOnLine(harness: TestHarness, lineIndex: number) {
  const caretRect = harness.getRenderedCaretRect();
  const lineRect = harness.getLineRect(lineIndex);

  expect(caretRect).not.toBeNull();
  expect(harness.getRenderedSelectionRects()).toHaveLength(0);

  const caretCenterY = caretRect!.top + caretRect!.height / 2;
  const lineCenterY = lineRect.top + lineRect.height / 2;
  expect(Math.abs(caretCenterY - lineCenterY)).toBeLessThanOrEqual(2);
  expect(caretRect!.left).toBeGreaterThanOrEqual(lineRect.left - 1);
}

describe("divider extension browser behavior", () => {
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

  test("backspace on the empty line after a leading divider moves the caret before the divider", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("---");
    await waitForOverlay();

    expect(harness.engine.getValue()).toBe("---\n");

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("---");
    expect(harness.engine.getSelection()).toEqual({
      start: 0,
      end: 0,
      affinity: "backward",
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
    await waitForOverlay();

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
    await waitForOverlay();

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
    const textSelectionRect = await getReferenceTextLineSelectionRect(extraHarnesses);

    harness = createTestHarness({
      value: "text\n---\nmore",
      css: PADDED_EDITOR_CSS,
    });
    await harness.focus();
    harness.engine.selectAll();
    await waitForOverlay();

    const dividerSelectionRect = getRenderedSelectionRectForLine(harness, 1);

    expect(dividerSelectionRect).toBeDefined();
    expect(
      Math.abs(dividerSelectionRect!.height - textSelectionRect!.height),
    ).toBeLessThanOrEqual(1);
  });

  test("selection overlay highlights the divider as soon as the selection reaches it", async () => {
    harness = createTestHarness({
      value: "alpha\n---\nomega",
      css: PADDED_EDITOR_CSS,
    });

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
    await waitForOverlay();

    const dividerLineTop = dividerLineRect.top;
    const nextLineTop = harness.getLineRect(2).top;
    const dividerSelectionRect = harness
      .getRenderedSelectionRects()
      .find((rect) => Math.abs(rect.top - dividerLineTop) <= 1);
    const nextLineSelectionRect = harness
      .getRenderedSelectionRects()
      .find((rect) => Math.abs(rect.top - nextLineTop) <= 1);

    expect(dividerSelectionRect).toBeDefined();
    expect(nextLineSelectionRect).toBeUndefined();
  });

  test("real browser click on a divider hr renders the divider selection rect instead of a collapsed caret", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerHrWithRealPointer(harness, 1);

    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);
  });

  test("real browser click on a divider hr then ArrowDown moves the caret to the line below", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerHrWithRealPointer(harness, 1);
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await userEvent.keyboard("{ArrowDown}");
    await waitForOverlay();

    const belowLine = harness.engine.getLines()[2];
    expect(belowLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: belowLine!.lineStartOffset,
      end: belowLine!.lineStartOffset,
      affinity: "forward",
    });
    expectCaretOnLine(harness, 2);
  });

  test("real browser click on a divider hr then ArrowUp moves the caret to the line above", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerHrWithRealPointer(harness, 1);
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await userEvent.keyboard("{ArrowUp}");
    await waitForOverlay();

    const aboveLine = harness.engine.getLines()[0];
    expect(aboveLine).toBeDefined();
    const aboveLineEnd = aboveLine!.lineStartOffset + aboveLine!.cursorLength;
    expect(harness.selection).toEqual({
      start: aboveLineEnd,
      end: aboveLineEnd,
      affinity: "backward",
    });
    expectCaretOnLine(harness, 0);
  });

  test("ArrowUp on a selected leading divider is a no-op", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerHrWithRealPointer(harness, 0);
    expectRenderedDividerSelectionRect(harness, 0, referenceRect.height);
    const selectionBeforeArrowUp = harness.engine.getSelection();

    await userEvent.keyboard("{ArrowUp}");
    await waitForOverlay();

    expect(harness.selection).toEqual(selectionBeforeArrowUp);
    expectRenderedDividerSelectionRect(harness, 0, referenceRect.height);
  });

  test("clicking a divider renders a full-width selection rect aligned to the padded content box", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1);

    expect(harness.selection).toEqual(getLineSelection(harness, 1));
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);
  });

  test("clicking the left edge of a divider keeps the rendered selection rect on the divider line", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1, "left");

    expect(harness.selection).toEqual(getLineSelection(harness, 1));
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);
  });

  test("clicking the right edge of a divider keeps the rendered selection rect on the divider line", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1, "right");

    expect(harness.selection).toEqual(getLineSelection(harness, 1));
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);
  });

  test("ArrowDown from a selected divider collapses the selection onto the line below", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1);
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await harness.pressKey("ArrowDown");
    await waitForOverlay();

    const belowLine = harness.engine.getLines()[2];
    expect(belowLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: belowLine!.lineStartOffset,
      end: belowLine!.lineStartOffset,
      affinity: "forward",
    });
  });

  test("ArrowUp from a selected divider collapses the selection onto the line above", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1);
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await harness.pressKey("ArrowUp");
    await waitForOverlay();

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
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1);
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

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

  test("real browser click on a divider hr then Backspace removes the divider from the DOM", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerHrWithRealPointer(harness, 1);
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await userEvent.keyboard("{Backspace}");
    await waitForOverlay();

    expect(harness.engine.getValue()).toBe("above\nbelow");
    expect(
      harness.container.querySelector('[data-block-atom="divider"]'),
    ).toBeNull();
    expect(harness.container.textContent).toContain("above");
    expect(harness.container.textContent).toContain("below");
  });

  test("clicking a leading divider then pressing backspace deletes it and keeps the paragraph at the top", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 0);
    expectRenderedDividerSelectionRect(harness, 0, referenceRect.height);

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("below");
    expect(harness.selection).toEqual({
      start: 0,
      end: 0,
      affinity: "forward",
    });
  });

  test("clicking the only divider then pressing backspace leaves an empty document", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "---",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 0);
    expectRenderedDividerSelectionRect(harness, 0, referenceRect.height);

    await pressKeyboardBackspace(harness);

    expect(harness.engine.getValue()).toBe("");
    expect(harness.selection).toEqual({
      start: 0,
      end: 0,
      affinity: "forward",
    });
  });

  test("pressing Enter on a selected trailing divider keeps the divider and moves the caret to a new empty line", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "text\n---",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1);
    expect(harness.selection).toEqual(getLineSelection(harness, 1));
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await harness.pressEnter();
    await waitForOverlay();

    expect(harness.engine.getValue()).toBe("text\n---\n");
    const newLine = harness.engine.getLines()[2];
    expect(newLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: newLine!.lineStartOffset,
      end: newLine!.lineStartOffset,
      affinity: "forward",
    });
    expectCaretOnLine(harness, 2);
  });

  test("pressing Enter on a selected leading divider keeps the divider and moves the caret to a new empty line", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "---",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 0);
    expect(harness.selection).toEqual(getLineSelection(harness, 0));
    expectRenderedDividerSelectionRect(harness, 0, referenceRect.height);

    await harness.pressEnter();
    await waitForOverlay();

    expect(harness.engine.getValue()).toBe("---\n");
    const newLine = harness.engine.getLines()[1];
    expect(newLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: newLine!.lineStartOffset,
      end: newLine!.lineStartOffset,
      affinity: "forward",
    });
    expectCaretOnLine(harness, 1);
  });

  test("pressing Enter on a selected middle divider inserts a new empty paragraph after it", async () => {
    const referenceRect = await getReferenceTextLineSelectionRect(extraHarnesses);
    harness = createTestHarness({
      value: "above\n---\nbelow",
      css: PADDED_EDITOR_CSS,
    });

    await clickDividerAt(harness, 1);
    expect(harness.selection).toEqual(getLineSelection(harness, 1));
    expectRenderedDividerSelectionRect(harness, 1, referenceRect.height);

    await harness.pressEnter();
    await waitForOverlay();

    expect(harness.engine.getValue()).toBe("above\n---\n\nbelow");
    const newLine = harness.engine.getLines()[2];
    expect(newLine).toBeDefined();
    expect(harness.selection).toEqual({
      start: newLine!.lineStartOffset,
      end: newLine!.lineStartOffset,
      affinity: "forward",
    });
    expectCaretOnLine(harness, 2);
  });
});
