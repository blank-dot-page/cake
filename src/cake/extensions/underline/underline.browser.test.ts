import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeEditor } from "../../editor/cake-editor";
import { bundledExtensions } from "../index";

describe("underline extension DOM rendering", () => {
  let container: HTMLDivElement;
  let engine: CakeEditor;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "600px";
    container.style.height = "400px";
    container.style.overflow = "auto";
    document.body.appendChild(container);
  });

  afterEach(() => {
    engine?.destroy();
    document.body.removeChild(container);
  });

  test("renders underline text with u element", () => {
    engine = new CakeEditor({
      container,
      value: "<u>underline</u>",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u");
    expect(underline).not.toBeNull();
    expect(underline?.textContent).toBe("underline");
  });

  test("renders underline with cake-underline class", () => {
    engine = new CakeEditor({
      container,
      value: "<u>underline</u>",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u.cake-underline");
    expect(underline).not.toBeNull();
    expect(underline?.textContent).toBe("underline");
  });

  test("renders multiple underline spans", () => {
    engine = new CakeEditor({
      container,
      value: "<u>first</u> normal <u>second</u>",
      extensions: bundledExtensions,
    });

    const underlines = container.querySelectorAll("u");
    expect(underlines.length).toBe(2);
    expect(underlines[0]?.textContent).toBe("first");
    expect(underlines[1]?.textContent).toBe("second");
  });

  test("renders underline with plain text around it", () => {
    engine = new CakeEditor({
      container,
      value: "before <u>underline</u> after",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.textContent).toBe("before underline after");

    const underline = line?.querySelector("u");
    expect(underline?.textContent).toBe("underline");
  });

  test("renders nested underline and bold", () => {
    engine = new CakeEditor({
      container,
      value: "<u>**bold underline**</u>",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u");
    expect(underline).not.toBeNull();

    const bold = underline?.querySelector("strong");
    expect(bold).not.toBeNull();
    expect(bold?.textContent).toBe("bold underline");
  });

  test("renders nested underline and italic", () => {
    engine = new CakeEditor({
      container,
      value: "<u>_italic underline_</u>",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u");
    expect(underline).not.toBeNull();

    const italic = underline?.querySelector("em");
    expect(italic).not.toBeNull();
    expect(italic?.textContent).toBe("italic underline");
  });

  test("renders nested underline and strikethrough", () => {
    engine = new CakeEditor({
      container,
      value: "<u>~~strike underline~~</u>",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u");
    expect(underline).not.toBeNull();

    const strike = underline?.querySelector("s");
    expect(strike).not.toBeNull();
    expect(strike?.textContent).toBe("strike underline");
  });

  test("renders underline inside heading", () => {
    engine = new CakeEditor({
      container,
      value: "# <u>Underline</u> Heading",
      extensions: bundledExtensions,
    });

    const heading = container.querySelector(".is-heading");
    expect(heading).not.toBeNull();

    const underline = heading?.querySelector("u");
    expect(underline).not.toBeNull();
    expect(underline?.textContent).toBe("Underline");
  });

  test("renders underline inside blockquote", () => {
    engine = new CakeEditor({
      container,
      value: "> <u>underline in quote</u>",
      extensions: bundledExtensions,
    });

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).not.toBeNull();

    const underline = blockquote?.querySelector("u");
    expect(underline).not.toBeNull();
    expect(underline?.textContent).toBe("underline in quote");
  });

  test("renders underline inside list item", () => {
    engine = new CakeEditor({
      container,
      value: "- <u>underline in list</u>",
      extensions: bundledExtensions,
    });

    const listItem = container.querySelector(".is-list");
    expect(listItem).not.toBeNull();

    const underline = listItem?.querySelector("u");
    expect(underline).not.toBeNull();
    expect(underline?.textContent).toBe("underline in list");
  });

  test("renders bold inside underline", () => {
    engine = new CakeEditor({
      container,
      value: "**<u>bold inside underline</u>**",
      extensions: bundledExtensions,
    });

    const bold = container.querySelector("strong");
    expect(bold).not.toBeNull();

    const underline = bold?.querySelector("u");
    expect(underline).not.toBeNull();
    expect(underline?.textContent).toBe("bold inside underline");
  });

  test("does not render unclosed underline tags", () => {
    engine = new CakeEditor({
      container,
      value: "<u>unclosed text",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u.cake-underline");
    expect(underline).toBeNull();
    expect(container.textContent).toContain("<u>unclosed text");
  });

  test("does not render mismatched tags", () => {
    engine = new CakeEditor({
      container,
      value: "<u>text</b>",
      extensions: bundledExtensions,
    });

    const underline = container.querySelector("u.cake-underline");
    expect(underline).toBeNull();
  });
});

describe("underline toggle command", () => {
  let container: HTMLDivElement;
  let engine: CakeEditor;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "600px";
    container.style.height = "400px";
    container.style.overflow = "auto";
    document.body.appendChild(container);
  });

  afterEach(() => {
    engine?.destroy();
    document.body.removeChild(container);
  });

  test("toggle-underline command adds underline tags to selected text", () => {
    engine = new CakeEditor({
      container,
      value: "hello world",
      extensions: bundledExtensions,
    });

    engine.setSelection({ start: 0, end: 5, affinity: "forward" });
    engine.executeCommand({ type: "toggle-underline" });

    expect(engine.getValue()).toBe("<u>hello</u> world");
  });

  test("toggle-underline command removes underline tags from underlined text", () => {
    engine = new CakeEditor({
      container,
      value: "<u>hello</u> world",
      extensions: bundledExtensions,
    });

    engine.setSelection({ start: 0, end: 5, affinity: "forward" });
    engine.executeCommand({ type: "toggle-underline" });

    expect(engine.getValue()).toBe("hello world");
  });

  test("toggle-underline command works on partial selection within underlined text", () => {
    engine = new CakeEditor({
      container,
      value: "<u>hello world</u>",
      extensions: bundledExtensions,
    });

    engine.setSelection({ start: 0, end: 5, affinity: "forward" });
    engine.executeCommand({ type: "toggle-underline" });

    expect(engine.getValue()).toBe("hello<u> world</u>");
  });

});
