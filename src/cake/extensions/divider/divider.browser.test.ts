import { afterEach, describe, expect, test } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";

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

  test("backspace at the start of a paragraph after a divider deletes the divider", async () => {
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
});
