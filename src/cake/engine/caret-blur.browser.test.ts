import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { createTestHarness } from "../test/harness";

function getCaretElement(container: HTMLElement): HTMLElement {
  const caret = container.querySelector(".cake-caret");
  if (!caret || !(caret instanceof HTMLElement)) {
    throw new Error("Missing .cake-caret element");
  }
  return caret;
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe("caret visibility on blur", () => {
  test("blurring by focusing another control hides caret", async () => {
    const h = createTestHarness("hello");
    await userEvent.click(h.contentRoot);
    await nextFrame();

    // Ensure caret is visible after focus.
    const caret = getCaretElement(h.container);
    expect(caret.style.display).not.toBe("none");

    // Blur by focusing a different control (matches demo checkbox behavior).
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.style.position = "absolute";
    // Keep it within the viewport across engines so a click reliably focuses it.
    checkbox.style.top = "10px";
    checkbox.style.left = "10px";
    checkbox.style.zIndex = "9999";
    document.body.appendChild(checkbox);

    // In WebKit headless, clicking doesn't always move focus reliably; focus
    // shift is what matters for caret visibility.
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
    // Focus/blur handlers schedule overlay updates in a microtask + rAF.
    // Give it two frames to ensure it has applied.
    await nextFrame();
    await nextFrame();

    // The editor no longer has focus; caret should be hidden.
    expect(h.engine.hasFocus()).toBe(false);
    expect(caret.style.display).toBe("none");

    checkbox.remove();
    h.destroy();
  });
});
