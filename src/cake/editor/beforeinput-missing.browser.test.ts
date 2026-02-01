import { describe, it, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

describe("input reconciliation when beforeinput is missing", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  it("reconciles DOM-driven edits even when a previous beforeinput was handled in the same frame", async () => {
    harness = createTestHarness("abc");
    await harness.focus();
    harness.engine.setSelection({ start: 3, end: 3, affinity: "forward" });

    // Simulate a normal handled beforeinput edit that updates the model and re-renders.
    const handledBeforeInput = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "x",
    });
    harness.contentRoot.dispatchEvent(handledBeforeInput);
    expect(harness.engine.getText()).toBe("abcx");

    // Now simulate a fast follow-up keystroke where WebKit can fire `input`
    // without a matching `beforeinput` (e.g. dropped/collapsed beforeinput events).
    // We model this by mutating the DOM the way the browser would, then dispatching
    // an `input` event while the editor is still in the "beforeinput handled" window.
    const textNode = harness.getTextNode(0);
    textNode.textContent = "abcxy";

    const range = document.createRange();
    range.setStart(textNode, "abcxy".length);
    range.setEnd(textNode, "abcxy".length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const inputEvent = new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: "y",
    });
    harness.contentRoot.dispatchEvent(inputEvent);

    expect(harness.engine.getText()).toBe("abcxy");
  });
});
