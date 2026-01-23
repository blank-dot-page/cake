import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness } from "../test/harness";

function dispatchClipboardEvent(
  target: EventTarget,
  type: "copy" | "cut" | "paste",
  clipboardData: DataTransfer,
): ClipboardEvent {
  const event = new ClipboardEvent(type, {
    bubbles: true,
    cancelable: true,
    clipboardData,
  });
  target.dispatchEvent(event);
  return event;
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };
const strikeMod = { ...mod, shift: true };
const linkShortcut = { ...mod, shift: true };

describe("Cake formatting parity (browser)", () => {
  afterEach(() => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("toggle bold then type keeps all characters bold until toggled off", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("b", mod);
    await h.typeText("text");
    expect(h.engine.getValue()).toBe("**text**");

    await h.pressKey("b", mod);
    await h.typeText("x");
    expect(h.engine.getValue()).toBe("**text**x");
    h.destroy();
  });

  it("Cmd+B then typing, then Cmd+I then typing applies bold then bold+italic", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("b", mod);
    await h.typeText("bold");

    expect(h.engine.getValue()).toBe("**bold**");
    expect(h.getLine(0).textContent ?? "").toBe("bold");
    expect(h.getLine(0).querySelector("strong")?.textContent ?? "").toBe("bold");
    expect(h.getLine(0).querySelector("em")).toBeNull();

    await h.pressKey("i", mod);
    await h.typeText("italics");

    expect(h.engine.getValue()).toBe("**bold*italics***");
    const line = h.getLine(0);
    expect(line.textContent ?? "").toBe("bolditalics");
    const strong = line.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent ?? "").toBe("bolditalics");
    const italic = strong?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent ?? "").toBe("italics");
    h.destroy();
  });

  it("Cmd+B then Cmd+I then Cmd+I off preserves bold-only typing after italic span", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("b", mod);
    await h.typeText("bold");
    await h.pressKey("i", mod);
    await h.typeText("italics");
    await h.pressKey("i", mod);
    await h.typeText("plain");

    expect(h.engine.getValue()).toBe("**bold*italics*plain**");
    const line = h.getLine(0);
    expect(line.textContent ?? "").toBe("bolditalicsplain");
    const strong = line.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent ?? "").toBe("bolditalicsplain");
    const italic = strong?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent ?? "").toBe("italics");
    h.destroy();
  });

  it("Cmd+B on selected link text wraps the label in bold", async () => {
    const h = createTestHarness("[link](url)");

    await h.focus();
    await h.doubleClick(1, 0);
    await tick();
    await h.pressKey("b", mod);

    expect(h.engine.getValue()).toBe("[**link**](url)");
    const line = h.getLine(0);
    const anchor = line.querySelector("a.cake-link");
    expect(anchor).not.toBeNull();
    expect(anchor?.textContent ?? "").toBe("link");
    const strong = anchor?.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent ?? "").toBe("link");
    expect(anchor?.querySelector("em")).toBeNull();
    h.destroy();
  });

  it("Cmd+B then Cmd+I on selected link text wraps the label in bold+italic", async () => {
    const h = createTestHarness("[link](url)");

    await h.focus();
    await h.doubleClick(1, 0);
    await tick();
    await h.pressKey("b", mod);
    await h.pressKey("i", mod);

    expect(h.engine.getValue()).toBe("[***link***](url)");
    const line = h.getLine(0);
    const anchor = line.querySelector("a.cake-link");
    expect(anchor).not.toBeNull();
    expect(anchor?.textContent ?? "").toBe("link");
    const strong = anchor?.querySelector("strong");
    expect(strong).not.toBeNull();
    const italic = strong?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent ?? "").toBe("link");
    h.destroy();
  });

  it("Cmd+B then Cmd+Shift+U wraps bold selection in a link label", async () => {
    const h = createTestHarness({
      value: "bold",
      renderOverlays: true,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    await h.focus();
    await h.doubleClick(1, 0);
    await tick();
    await h.pressKey("b", mod);
    await h.pressKey("u", linkShortcut);

    expect(h.engine.getValue()).toBe("**[bold]()**");
    const line = h.getLine(0);
    const strong = line.querySelector("strong");
    expect(strong).not.toBeNull();
    const anchor = strong?.querySelector("a.cake-link");
    expect(anchor).not.toBeNull();
    expect(anchor?.textContent ?? "").toBe("bold");
    h.destroy();
  });

  it("toggle italic then type keeps all characters italic until toggled off (v1 uses '*')", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("i", mod);
    await h.typeText("text");
    expect(h.engine.getValue()).toBe("*text*");

    await h.pressKey("i", mod);
    await h.typeText("x");
    expect(h.engine.getValue()).toBe("*text*x");
    h.destroy();
  });

  it("toggle strikethrough then type keeps all characters struck until toggled off", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("x", strikeMod);
    await h.typeText("text");
    expect(h.engine.getValue()).toBe("~~text~~");

    await h.pressKey("x", strikeMod);
    await h.typeText("x");
    expect(h.engine.getValue()).toBe("~~text~~x");
    h.destroy();
  });

  it("Cmd+Shift+X then Cmd+B then typing produces bold inside strikethrough", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("x", strikeMod);
    await h.pressKey("b", mod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("~~**text**~~");
    h.destroy();
  });

  it("Cmd+B then Cmd+Shift+X then typing produces strikethrough inside bold", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("b", mod);
    await h.pressKey("x", strikeMod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("**~~text~~**");
    h.destroy();
  });

  it("Cmd+Shift+X then Cmd+I then typing produces italic inside strikethrough", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("x", strikeMod);
    await h.pressKey("i", mod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("~~*text*~~");
    h.destroy();
  });

  it("Cmd+I then Cmd+Shift+X then typing produces strikethrough inside italic", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("i", mod);
    await h.pressKey("x", strikeMod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("*~~text~~*");
    h.destroy();
  });

  it("Cmd+B then Cmd+I then Cmd+Shift+X then typing produces strikethrough inside bold+italic", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("b", mod);
    await h.pressKey("i", mod);
    await h.pressKey("x", strikeMod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("***~~text~~***");
    h.destroy();
  });

  it("Cmd+Shift+X then Cmd+B then Cmd+I then typing produces bold+italic inside strikethrough", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("x", strikeMod);
    await h.pressKey("b", mod);
    await h.pressKey("i", mod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("~~***text***~~");
    h.destroy();
  });

  it("clicking the right side of a bold character continues bold at the boundary", async () => {
    const h = createTestHarness("**a**b");
    await h.clickRightOf(0);
    await h.typeText("X");
    expect(h.engine.getValue()).toBe("**aX**b");
    h.destroy();
  });

  it("clicking the left side of the following plain character types outside bold", async () => {
    const h = createTestHarness("**a**b");
    await h.clickLeftOf(1);
    await h.typeText("X");
    expect(h.engine.getValue()).toBe("**a**Xb");
    h.destroy();
  });

  it("ArrowRight to a bold/plain boundary continues bold (v1 parity)", async () => {
    const h = createTestHarness("**a**b");

    await h.clickLeftOf(0);
    await h.pressKey("ArrowRight");
    await h.typeText("X");

    expect(h.engine.getValue()).toBe("**aX**b");
    h.destroy();
  });

  it("typing at the end of a bold span at end-of-line exits bold (v1 parity)", async () => {
    const h = createTestHarness("**a**");
    await h.clickRightOf(0);
    await h.typeText("X");
    expect(h.engine.getValue()).toBe("**a**X");
    h.destroy();
  });

  it("typing at the end boundary of a link does not extend the link (v1 parity)", async () => {
    const h = createTestHarness("[a](url)b");
    await h.clickRightOf(0);
    await h.typeText("X");
    expect(h.engine.getValue()).toBe("[a](url)Xb");
    h.destroy();
  });

  it("internal copy/paste preserves formatting (markdown in text/plain)", async () => {
    const source = "**bold**";
    const h1 = createTestHarness(source);

    await h1.focus();
    await h1.doubleClick(1, 0);
    await tick();

    const dt = new DataTransfer();
    dispatchClipboardEvent(h1.contentRoot, "copy", dt);
    expect(dt.getData("text/plain")).toBe(source);

    const h2 = createTestHarness("");
    const pasteDt = new DataTransfer();
    pasteDt.setData("text/plain", dt.getData("text/plain"));
    await h2.focus();
    dispatchClipboardEvent(h2.contentRoot, "paste", pasteDt);
    expect(h2.engine.getValue()).toBe(source);

    h1.destroy();
    h2.destroy();
  });

  it("pasting markdown over a selection replaces the selection and preserves formatting", async () => {
    const h = createTestHarness("hello world");
    await h.focus();
    await h.doubleClick(8, 0);
    await tick();
    const dt = new DataTransfer();
    dt.setData("text/plain", "**bold**");
    dispatchClipboardEvent(h.contentRoot, "paste", dt);
    expect(h.engine.getValue()).toBe("hello **bold**");
    h.destroy();
  });

  it("pasting HTML preserves bold formatting via html->markdown conversion", async () => {
    const h = createTestHarness("");
    await h.focus();
    const dt = new DataTransfer();
    dt.setData("text/html", "<strong>hey</strong>");
    dt.setData("text/plain", "hey");
    dispatchClipboardEvent(h.contentRoot, "paste", dt);
    expect(h.engine.getValue()).toBe("**hey**");
    h.destroy();
  });

  it("toggling bold on a selection preserves the selection for repeated toggles", async () => {
    const h = createTestHarness("hello world");

    await h.focus();
    // Select "hello" using keyboard selection (Shift+ArrowRight).
    for (let i = 0; i < 5; i += 1) {
      await h.pressKey("ArrowRight", { shift: true });
    }
    await tick();
    expect(Math.min(h.selection.start, h.selection.end)).toBe(0);
    expect(Math.max(h.selection.start, h.selection.end)).toBe(5);

    await h.pressKey("b", mod);
    expect(h.engine.getValue()).toBe("**hello** world");

    await h.pressKey("b", mod);
    expect(h.engine.getValue()).toBe("hello world");

    await h.pressKey("b", mod);
    expect(h.engine.getValue()).toBe("**hello** world");

    h.destroy();
  });

  it("Cmd+A then Cmd+B on multiline selection renders bold without markers and keeps selection", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.typeText("line 1");
    await h.pressEnter();
    await h.typeText("line 2");
    await tick();

    await h.pressKey("a", mod);
    await tick();
    expect(Math.min(h.selection.start, h.selection.end)).toBe(0);
    expect(Math.max(h.selection.start, h.selection.end)).toBe(13);

    await h.pressKey("b", mod);
    await tick();

    expect(h.getLine(0).textContent ?? "").toBe("line 1");
    expect(h.getLine(0).textContent ?? "").not.toContain("*");
    expect(h.getLine(0).querySelector("strong")?.textContent ?? "").toBe(
      "line 1",
    );

    expect(h.getLine(1).textContent ?? "").toBe("line 2");
    expect(h.getLine(1).textContent ?? "").not.toContain("*");
    expect(h.getLine(1).querySelector("strong")?.textContent ?? "").toBe(
      "line 2",
    );

    expect(Math.min(h.selection.start, h.selection.end)).toBe(0);
    expect(Math.max(h.selection.start, h.selection.end)).toBe(13);

    h.destroy();
  });

  it("Cmd+B on a keyboard-selected multiline range does not surface literal ** markers", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.typeText("hello");
    await h.pressEnter();
    await h.typeText("world");
    await tick();

    await h.clickAt(0, 0);
    for (let i = 0; i < 11; i += 1) {
      await h.pressKey("ArrowRight", { shift: true });
    }
    await tick();

    await h.pressKey("b", mod);
    await tick();

    expect(h.engine.getValue()).toBe("**hello**\n**world**");

    expect(h.getLine(0).textContent ?? "").toBe("hello");
    expect(h.getLine(0).textContent ?? "").not.toContain("*");
    expect(h.getLine(0).querySelector("strong")?.textContent ?? "").toBe(
      "hello",
    );

    expect(h.getLine(1).textContent ?? "").toBe("world");
    expect(h.getLine(1).textContent ?? "").not.toContain("*");
    expect(h.getLine(1).querySelector("strong")?.textContent ?? "").toBe(
      "world",
    );

    h.destroy();
  });

  it("Cmd+B then Cmd+I then typing produces combined emphasis", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.pressKey("b", mod);
    await h.pressKey("i", mod);
    await h.typeText("text");

    expect(h.engine.getValue()).toBe("***text***");
    h.destroy();
  });

  it("typing an unbalanced marker sequence (**hello*) renders literally (no partial italics)", async () => {
    const h = createTestHarness("");

    await h.focus();
    await h.typeText("**hello*");

    expect(h.engine.getValue()).toBe("**hello*");
    expect(h.getLine(0).textContent ?? "").toBe("**hello*");
    expect(h.getLine(0).querySelector("em")).toBeNull();
    expect(h.getLine(0).querySelector("strong")).toBeNull();

    h.destroy();
  });
});
