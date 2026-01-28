import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };

const linkShortcut = { ...mod, shift: true };

describe("link shortcut (Cmd+Shift+U)", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
    document.body.innerHTML = "";
  });

  it("wraps the selection in a link and opens the link popover", async () => {
    harness = createTestHarness({
      value: "hello world",
      renderOverlays: true,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    harness.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    await harness.focus();
    await harness.pressKey("u", linkShortcut);

    expect(harness.engine.getValue()).toBe("hello [world]()");

    // Popover opens after the engine schedules it on the next animation frame.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const popover = document.querySelector(".cake-link-popover");
    expect(popover).not.toBeNull();

    const input = document.querySelector(".cake-link-input");
    expect(input).not.toBeNull();
  });
});
