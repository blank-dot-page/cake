import { describe, it, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("unfocused selection rendering", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  async function focusOutsideEditor() {
    const sink = document.createElement("button");
    sink.textContent = "focus-sink";
    document.body.appendChild(sink);
    sink.focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
    sink.remove();
  }

  it("renders selection rects when editor is unfocused and selection is a range", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    harness.engine.selectAll();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.getSelectionRects().length).toBeGreaterThan(0);

    await focusOutsideEditor();

    expect(harness.getSelectionRects().length).toBeGreaterThan(0);
    expect(harness.getCaretRect()).toBeNull();
  });

  it("does not render caret or selection rects when editor is unfocused and selection is collapsed", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    await harness.clickAt(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.getCaretRect()).not.toBeNull();
    expect(harness.getSelectionRects()).toHaveLength(0);

    await focusOutsideEditor();

    expect(harness.getCaretRect()).toBeNull();
    expect(harness.getSelectionRects()).toHaveLength(0);
  });
});
