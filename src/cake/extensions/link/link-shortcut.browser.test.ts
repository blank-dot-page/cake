import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createTestHarness, type TestHarness } from "../../test/harness";
import { linkExtension } from "./link";

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
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    harness.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    await harness.focus();
    await harness.pressKey("u", linkShortcut);

    expect(harness.engine.getValue()).toBe("hello [world]()");

    // Popover opens after the engine schedules it on the next animation frame
    // and React commits the state update. Use expect.poll for retry.
    await expect
      .poll(() => document.querySelector(".cake-link-popover"))
      .not.toBeNull();
    await expect
      .poll(() => document.querySelector(".cake-link-input"))
      .not.toBeNull();
  });

  it("collapsed selection prompts and inserts [text](url)", async () => {
    let calls = 0;
    harness = createTestHarness({
      value: "hello ",
      extensions: [
        linkExtension({
          onRequestLinkInput: async () => {
            calls += 1;
            return { text: "world", url: "https://example.com" };
          },
        }),
      ],
    });

    harness.engine.setSelection({ start: 6, end: 6, affinity: "forward" });
    await harness.focus();
    await harness.pressKey("u", linkShortcut);

    await expect
      .poll(() => harness!.engine.getValue())
      .toBe("hello [world](https://example.com)");
    expect(calls).toBe(1);

    const selection = harness.engine.getSelection();
    expect(selection.start).toBe(selection.end);
    expect(selection.start).toBe(harness.engine.getText().length);
  });

  it("collapsed selection cancel does nothing", async () => {
    let calls = 0;
    harness = createTestHarness({
      value: "hello ",
      extensions: [
        linkExtension({
          onRequestLinkInput: async () => {
            calls += 1;
            return null;
          },
        }),
      ],
    });

    harness.engine.setSelection({ start: 6, end: 6, affinity: "forward" });
    await harness.focus();
    await harness.pressKey("u", linkShortcut);

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(harness.engine.getValue()).toBe("hello ");
    expect(calls).toBe(1);
  });

  it("collapsed selection inside a link opens the existing popover (no callback)", async () => {
    let calls = 0;
    harness = createTestHarness({
      value: "hello [world](https://example.com)",
      renderOverlays: true,
      extensions: [
        linkExtension({
          onRequestLinkInput: async () => {
            calls += 1;
            return { text: "x", url: "y" };
          },
        }),
      ],
    });
    // Wait for React to commit overlay effects
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    // Visible text: "hello world"; place caret within "world"
    harness.engine.setSelection({ start: 7, end: 7, affinity: "forward" });
    await harness.focus();
    await harness.pressKey("u", linkShortcut);

    await expect
      .poll(() => document.querySelector(".cake-link-popover"))
      .not.toBeNull();
    expect(calls).toBe(0);
  });

  it("collapsed selection callback rejection is treated as cancel (no unhandledrejection)", async () => {
    let unhandled = 0;
    const onUnhandled = () => {
      unhandled += 1;
    };
    window.addEventListener("unhandledrejection", onUnhandled);

    try {
      harness = createTestHarness({
        value: "hello ",
        extensions: [
          linkExtension({
            onRequestLinkInput: async () => {
              throw new Error("boom");
            },
          }),
        ],
      });

      harness.engine.setSelection({ start: 6, end: 6, affinity: "forward" });
      await harness.focus();
      await harness.pressKey("u", linkShortcut);

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(harness.engine.getValue()).toBe("hello ");
      expect(unhandled).toBe(0);
    } finally {
      window.removeEventListener("unhandledrejection", onUnhandled);
    }
  });
});
