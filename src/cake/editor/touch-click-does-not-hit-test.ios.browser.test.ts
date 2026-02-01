import { describe, it, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("iOS-like WebKit: touch click does not hit-test selection", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it("does not programmatically set selection on click after a touch pointerdown", async () => {
    harness = createTestHarness({
      value: "hello world",
      css: `
        .cake {
          font-family: "Cousine", monospace;
          line-height: 2;
        }
      `,
    });
    await harness.focus();

    // Ensure iOS-like project actually puts us in touch mode.
    expect(harness.contentRoot.classList.contains("cake-touch-mode")).toBe(
      true,
    );

    // Start at a known selection.
    harness.engine.setSelection({ start: 0, end: 0, affinity: "forward" });
    expect(harness.selection.start).toBe(0);

    const target = harness.getLine(0);
    const clickRect = harness.getCharRect(3); // between 'l' and 'l'/'o' area
    const clientX = clickRect.left + clickRect.width / 2;
    const clientY = clickRect.top + clickRect.height / 2;

    // Touch pointerdown should mark "recent touch" and make click handling rely on native selection.
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: "touch",
      clientX,
      clientY,
    });
    target.dispatchEvent(pointerDown);

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
      clientX,
      clientY,
    });
    target.dispatchEvent(click);

    // In this synthetic test we don't simulate the browser's native caret placement.
    // The important assertion is that Cake does not override selection via click hit-testing.
    expect(harness.selection.start).toBe(0);
    expect(harness.selection.end).toBe(0);
  });
});
