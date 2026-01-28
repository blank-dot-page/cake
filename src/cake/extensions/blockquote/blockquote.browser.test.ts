import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeEditor } from "../../editor/cake-editor";
import { bundledExtensions } from "../index";

describe("blockquote extension DOM rendering", () => {
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

  test("renders blockquote with blockquote element", () => {
    engine = new CakeEditor({
      container,
      value: "> quoted text",
      extensions: bundledExtensions,
    });

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).not.toBeNull();
  });

  test("renders nested content inside blockquote", () => {
    engine = new CakeEditor({
      container,
      value: "> quoted text",
      extensions: bundledExtensions,
    });

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).not.toBeNull();
    expect(blockquote?.textContent).toBe("quoted text");
  });

  test("consecutive blockquote lines merge into single blockquote", () => {
    engine = new CakeEditor({
      container,
      value: "> first quote\n> second quote",
      extensions: bundledExtensions,
    });

    const blockquotes = container.querySelectorAll("blockquote");
    expect(blockquotes.length).toBe(1);

    const lines = blockquotes[0]?.querySelectorAll(".cake-line");
    expect(lines?.length).toBe(2);
  });

  test("renders separate blockquotes with non-quote line between", () => {
    engine = new CakeEditor({
      container,
      value: "> first\nregular text\n> second",
      extensions: bundledExtensions,
    });

    const blockquotes = container.querySelectorAll("blockquote");
    expect(blockquotes.length).toBe(2);
  });

  test("renders blockquote with bold content", () => {
    engine = new CakeEditor({
      container,
      value: "> **bold** text",
      extensions: bundledExtensions,
    });

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).not.toBeNull();

    const boldSpan = blockquote?.querySelector("strong");
    expect(boldSpan).not.toBeNull();
    expect(boldSpan?.textContent).toBe("bold");
  });

  test("renders blockquote with italic content", () => {
    engine = new CakeEditor({
      container,
      value: "> _italic_ text",
      extensions: bundledExtensions,
    });

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).not.toBeNull();

    const italicSpan = blockquote?.querySelector("em");
    expect(italicSpan).not.toBeNull();
    expect(italicSpan?.textContent).toBe("italic");
  });

  test("blockquote line has data-line-index attribute", () => {
    engine = new CakeEditor({
      container,
      value: "> quoted",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.getAttribute("data-line-index")).toBe("0");
  });

  test("renders mixed content with blockquotes and paragraphs", () => {
    engine = new CakeEditor({
      container,
      value: "paragraph\n> quote\nanother paragraph",
      extensions: bundledExtensions,
    });

    const allLines = container.querySelectorAll(".cake-line");
    expect(allLines.length).toBe(3);

    const blockquote = container.querySelector("blockquote");
    expect(blockquote).not.toBeNull();
  });
});
