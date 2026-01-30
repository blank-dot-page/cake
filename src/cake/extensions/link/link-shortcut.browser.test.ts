import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
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
    // Wait for React to commit overlay effects
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    harness.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    await harness.focus();
    await harness.pressKey("u", linkShortcut);

    expect(harness.engine.getValue()).toBe("hello [world]()");

    // Popover opens after the engine schedules it on the next animation frame
    // and React commits the state update. Use expect.poll for retry.
    await expect.poll(() => document.querySelector(".cake-link-popover")).not.toBeNull();
    await expect.poll(() => document.querySelector(".cake-link-input")).not.toBeNull();
  });
});
