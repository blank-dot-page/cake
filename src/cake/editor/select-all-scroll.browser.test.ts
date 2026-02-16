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

    const observedDuringSelectAll: number[] = [scrollBeforeSelectAll];
    const trackSelectAllScroll = () => {
      observedDuringSelectAll.push(harness!.container.scrollTop);
    };
    harness.container.addEventListener("scroll", trackSelectAllScroll);
    await harness.pressKey("a", { meta: true, ctrl: true });
    await new Promise((resolve) => setTimeout(resolve, 140));
    harness.container.removeEventListener("scroll", trackSelectAllScroll);

    const scrollAfterSelectAll = harness.container.scrollTop;
    observedDuringSelectAll.push(scrollAfterSelectAll);
    const maxDriftDuringSelectAll = observedDuringSelectAll.reduce(
      (maxDrift, value) =>
        Math.max(maxDrift, Math.abs(value - scrollBeforeSelectAll)),
      0,
    );
    expect(maxDriftDuringSelectAll).toBeLessThanOrEqual(1);

    expect(Math.min(harness.selection.start, harness.selection.end)).toBe(0);
    expect(Math.max(harness.selection.start, harness.selection.end)).toBe(
      cursorLength,
    );
  });

  it("does not auto-scroll for non-collapsed selections when part of range is visible", async () => {
    const longDocument = Array.from(
      { length: 220 },
      (_, index) =>
        `Line ${index + 1}: This line forces overflow for range-selection scrolling coverage.`,
    ).join("\n");

    harness = createTestHarness(longDocument);
    harness.container.style.paddingTop = "88px";
    harness.container.style.paddingBottom = "80px";
    await harness.focus();

    const cursorLength = harness.engine.getCursorLength();
    const maxScrollTop =
      harness.container.scrollHeight - harness.container.clientHeight;
    expect(maxScrollTop).toBeGreaterThan(0);

    harness.container.scrollTop = maxScrollTop * 0.5;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const scrollBeforeSelection = harness.container.scrollTop;

    const visibleMidpoint = Math.floor(cursorLength * 0.5);
    const engineWithScrollSpy = harness.engine as unknown as {
      scrollCaretIntoView: () => void;
    };
    const originalScrollCaretIntoView = engineWithScrollSpy.scrollCaretIntoView;
    let scrollCaretIntoViewCalls = 0;
    engineWithScrollSpy.scrollCaretIntoView = () => {
      scrollCaretIntoViewCalls += 1;
      originalScrollCaretIntoView.call(harness.engine);
    };
    const observedDuringRangeSelection: number[] = [scrollBeforeSelection];
    const trackRangeSelectionScroll = () => {
      observedDuringRangeSelection.push(harness!.container.scrollTop);
    };
    harness.container.addEventListener("scroll", trackRangeSelectionScroll);
    harness.engine.setSelection({
      start: 0,
      end: visibleMidpoint,
      affinity: "backward",
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    harness.container.removeEventListener("scroll", trackRangeSelectionScroll);

    const scrollAfterSelection = harness.container.scrollTop;
    observedDuringRangeSelection.push(scrollAfterSelection);
    const maxDriftDuringRangeSelection = observedDuringRangeSelection.reduce(
      (maxDrift, value) =>
        Math.max(maxDrift, Math.abs(value - scrollBeforeSelection)),
      0,
    );
    engineWithScrollSpy.scrollCaretIntoView = originalScrollCaretIntoView;

    expect(scrollCaretIntoViewCalls).toBe(0);
    expect(maxDriftDuringRangeSelection).toBeLessThanOrEqual(1);

    expect(harness.selection.start).toBe(0);
    expect(harness.selection.end).toBe(visibleMidpoint);
    expect(harness.selection.start).not.toBe(harness.selection.end);
  });
});
