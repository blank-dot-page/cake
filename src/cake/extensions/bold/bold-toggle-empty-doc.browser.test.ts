import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };

describe("Toggle bold on empty doc regression", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("cmd+b twice on empty doc should return to empty state", async () => {
    h = createTestHarness("");

    await h.focus();

    // First cmd+b - should enable bold mode
    await h.pressKey("b", mod);

    // Verify bold is active (source has placeholder with markers)
    const valueAfterFirstToggle = h.engine.getValue();
    expect(valueAfterFirstToggle).toContain("**");

    // Second cmd+b - should disable bold mode and return to empty doc
    await h.pressKey("b", mod);

    // The doc should be empty again (or just have an empty placeholder)
    const valueAfterSecondToggle = h.engine.getValue();

    // Bug: Currently produces "****​****" instead of "" or minimal state
    expect(valueAfterSecondToggle).toBe("");
  });

  it("cmd+b twice on empty doc should not enable italics", async () => {
    h = createTestHarness("");

    await h.focus();

    // First cmd+b
    await h.pressKey("b", mod);

    // Second cmd+b
    await h.pressKey("b", mod);

    // Check the DOM - neither bold nor italics should be rendered
    const line = h.getLine(0);
    const strong = line.querySelector("strong");
    const em = line.querySelector("em");

    // Bug: Currently shows both bold and italics active
    expect(strong).toBeNull();
    expect(em).toBeNull();
  });

  it("cmd+b twice without typing should not corrupt the document", async () => {
    h = createTestHarness("");

    await h.focus();

    await h.pressKey("b", mod);
    await h.pressKey("b", mod);

    const value = h.engine.getValue();

    // Should not have any visible content that includes literal asterisks
    // Bug: Currently the visible content shows "**" in the DOM
    expect(h.getLine(0).textContent).toBe("");

    // Should not have malformed markdown with multiple consecutive asterisks
    expect(value).not.toMatch(/\*{4,}/);
  });
});
