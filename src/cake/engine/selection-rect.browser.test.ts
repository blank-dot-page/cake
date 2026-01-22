import { describe, it, expect, afterEach } from "vitest";
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
  });

  it("triple-click selection rect matches the line rect exactly", async () => {
    harness = createTestHarness("line 1\nline 2");

    await harness.tripleClick(1);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const selection = harness.selection;
    expect(selection.start).toBe(7);

    const selectionRects = harness.getSelectionRects();
    expect(selectionRects.length).toBe(1);
  });
});
