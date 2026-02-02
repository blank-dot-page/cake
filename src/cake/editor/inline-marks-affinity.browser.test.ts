import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "../test/harness";

describe("Inline marks affinity (browser)", () => {
  afterEach(() => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("typing after manually closing bold marks should not be bold", async () => {
    const h = createTestHarness("");

    await h.focus();

    // Type opening bold markers
    await h.typeText("**");

    // Type bold text
    await h.typeText("bold");

    // Type closing bold markers
    await h.typeText("**");

    // Type text after closing marks - this should NOT be bold
    await h.typeText(" normal");

    // Check the markdown value
    expect(h.engine.getValue()).toBe("**bold** normal");

    // Check the DOM structure
    const line = h.getLine(0);
    expect(line.textContent).toBe("bold normal");

    // The bold element should only contain "bold", not " normal"
    const strong = line.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("bold");

    // Ensure " normal" is not inside the strong element
    const strongParent = strong?.parentElement;
    const textAfterStrong = strong?.nextSibling?.textContent || "";
    expect(textAfterStrong).toBe(" normal");

    h.destroy();
  });

  it("typing after manually closing italic marks should not be italic", async () => {
    const h = createTestHarness("");

    await h.focus();

    // Type opening italic markers
    await h.typeText("*");

    // Type italic text
    await h.typeText("italic");

    // Type closing italic markers
    await h.typeText("*");

    // Type text after closing marks - this should NOT be italic
    await h.typeText(" normal");

    // Check the markdown value
    expect(h.engine.getValue()).toBe("*italic* normal");

    // Check the DOM structure
    const line = h.getLine(0);
    expect(line.textContent).toBe("italic normal");

    // The italic element should only contain "italic", not " normal"
    const em = line.querySelector("em");
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe("italic");

    // Ensure " normal" is not inside the em element
    const textAfterEm = em?.nextSibling?.textContent || "";
    expect(textAfterEm).toBe(" normal");

    h.destroy();
  });

  it("typing after manually closing strikethrough marks should not be strikethrough", async () => {
    const h = createTestHarness("");

    await h.focus();

    // Type opening strikethrough markers
    await h.typeText("~~");

    // Type strikethrough text
    await h.typeText("strike");

    // Type closing strikethrough markers
    await h.typeText("~~");

    // Type text after closing marks - this should NOT be strikethrough
    await h.typeText(" normal");

    // Check the markdown value
    expect(h.engine.getValue()).toBe("~~strike~~ normal");

    // Check the DOM structure
    const line = h.getLine(0);
    expect(line.textContent).toBe("strike normal");

    // The strikethrough element should only contain "strike", not " normal"
    const s = line.querySelector("s");
    expect(s).not.toBeNull();
    expect(s?.textContent).toBe("strike");

    // Ensure " normal" is not inside the s element
    const textAfterS = s?.nextSibling?.textContent || "";
    expect(textAfterS).toBe(" normal");

    h.destroy();
  });

  it("typing after manually closing underline marks should not be underlined", async () => {
    const h = createTestHarness("");

    await h.focus();

    // Type opening underline markers
    await h.typeText("<u>");

    // Type underline text
    await h.typeText("underline");

    // Type closing underline markers
    await h.typeText("</u>");

    // Type text after closing marks - this should NOT be underlined
    await h.typeText(" normal");

    // Check the markdown value
    expect(h.engine.getValue()).toBe("<u>underline</u> normal");

    // Check the DOM structure
    const line = h.getLine(0);
    expect(line.textContent).toBe("underline normal");

    // The underline element should only contain "underline", not " normal"
    const u = line.querySelector("u");
    expect(u).not.toBeNull();
    expect(u?.textContent).toBe("underline");

    // Ensure " normal" is not inside the u element
    const textAfterU = u?.nextSibling?.textContent || "";
    expect(textAfterU).toBe(" normal");

    h.destroy();
  });

  it("typing after manually closing nested marks should exit all formatting", async () => {
    const h = createTestHarness("");

    await h.focus();

    // Type opening bold+italic markers
    await h.typeText("***");

    // Type formatted text
    await h.typeText("both");

    // Type closing bold+italic markers
    await h.typeText("***");

    // Type text after closing marks - this should NOT be formatted
    await h.typeText(" normal");

    // Check the markdown value
    expect(h.engine.getValue()).toBe("***both*** normal");

    // Check the DOM structure
    const line = h.getLine(0);
    expect(line.textContent).toBe("both normal");

    // The formatted element should only contain "both", not " normal"
    const strong = line.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("both");

    const em = strong?.querySelector("em");
    expect(em).not.toBeNull();
    expect(em?.textContent).toBe("both");

    // Ensure " normal" is not inside any formatted element
    const textAfterFormatting = strong?.nextSibling?.textContent || "";
    expect(textAfterFormatting).toBe(" normal");

    h.destroy();
  });
});