import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("select-all viewport behavior", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it("selectAll preserves viewport scroll position in long documents", async () => {
    const longDocument = Array.from(
      { length: 220 },
      (_, index) =>
        `Line ${index + 1}: This line forces overflow for select-all scrolling coverage.`,
    ).join("\n");

    harness = createTestHarness(longDocument);
    harness.container.style.paddingTop = "88px";
    harness.container.style.paddingBottom = "80px";
    await harness.focus();

    const cursorLength = harness.engine.getCursorLength();
    harness.engine.setSelection({
      start: cursorLength,
      end: cursorLength,
      affinity: "forward",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const maxScrollTop =
      harness.container.scrollHeight - harness.container.clientHeight;
    expect(maxScrollTop).toBeGreaterThan(0);

    harness.container.scrollTop = maxScrollTop * 0.5;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const scrollBeforeSelectAll = harness.container.scrollTop;

    await harness.pressKey("a", { meta: true, ctrl: true });
    await new Promise((resolve) => setTimeout(resolve, 70));

    const scrollAfterSelectAll = harness.container.scrollTop;
    expect(
      Math.abs(scrollAfterSelectAll - scrollBeforeSelectAll),
    ).toBeLessThanOrEqual(2);

    expect(Math.min(harness.selection.start, harness.selection.end)).toBe(0);
    expect(Math.max(harness.selection.start, harness.selection.end)).toBe(
      cursorLength,
    );
  });
});
