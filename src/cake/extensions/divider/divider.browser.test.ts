import { afterEach, describe, expect, test } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";

describe("divider extension backspace behavior", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
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
});
