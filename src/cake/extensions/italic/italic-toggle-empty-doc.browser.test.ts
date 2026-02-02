import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "../../test/harness";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };

describe("Toggle italic on empty doc regression", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("cmd+i twice on empty doc should return to empty state", async () => {
    h = createTestHarness("");

    await h.focus();

    // First cmd+i - should enable italic mode
    await h.pressKey("i", mod);

    // Verify italic is active (source has placeholder with markers)
    const valueAfterFirstToggle = h.engine.getValue();
    expect(valueAfterFirstToggle).toContain("*");

    // Second cmd+i - should disable italic mode and return to empty doc
    await h.pressKey("i", mod);

    // The doc should be empty again
    const valueAfterSecondToggle = h.engine.getValue();

    // Bug: Currently produces malformed state instead of ""
    expect(valueAfterSecondToggle).toBe("");
  });

  it("cmd+i twice on empty doc should not enable bold", async () => {
    h = createTestHarness("");

    await h.focus();

    // First cmd+i
    await h.pressKey("i", mod);

    // Second cmd+i
    await h.pressKey("i", mod);

    // Check the DOM - neither bold nor italics should be rendered
    const line = h.getLine(0);
    const strong = line.querySelector("strong");
    const em = line.querySelector("em");

    // Bug: Currently shows both bold and italics active
    expect(strong).toBeNull();
    expect(em).toBeNull();
  });

  it("cmd+i twice without typing should not corrupt the document", async () => {
    h = createTestHarness("");

    await h.focus();

    await h.pressKey("i", mod);
    await h.pressKey("i", mod);

    // Should not have any visible content
    expect(h.getLine(0).textContent).toBe("");

    // Should not have malformed markdown
    const value = h.engine.getValue();
    expect(value).not.toMatch(/\*{2,}/);
  });
});
