import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";

describe("heading extension Enter behavior", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
    document.body.innerHTML = "";
  });

  it("pressing Enter at end of heading inserts new line and moves caret to next line", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("# title");

    expect(harness.engine.getValue()).toBe("# title");
    expect(harness.selection).toEqual(
      expect.objectContaining({ start: 5, end: 5 }),
    );

    await harness.pressEnter();

    expect(harness.engine.getValue()).toBe("# title\n");
    expect(harness.selection).toEqual(
      expect.objectContaining({ start: 6, end: 6 }),
    );
    expect(harness.getLineCount()).toBe(2);
  });
});

