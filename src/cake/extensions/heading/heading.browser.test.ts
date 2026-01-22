import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeEngine } from "../../engine/cake-engine";
import { bundledExtensions } from "../index";
import { createTestHarness } from "../../test/harness";

describe("heading extension DOM rendering", () => {
  let container: HTMLDivElement;
  let engine: CakeEngine;

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

  test("renders h1 heading with is-heading class", () => {
    engine = new CakeEngine({
      container,
      value: "# Title",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.classList.contains("is-heading")).toBe(true);
    expect(line?.classList.contains("is-heading-1")).toBe(true);
    expect(line?.textContent).toBe("Title");
  });

  test("renders h2 heading with is-heading-2 class", () => {
    engine = new CakeEngine({
      container,
      value: "## Subtitle",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.classList.contains("is-heading")).toBe(true);
    expect(line?.classList.contains("is-heading-2")).toBe(true);
    expect(line?.textContent).toBe("Subtitle");
  });

  test("renders h3 heading with is-heading-3 class", () => {
    engine = new CakeEngine({
      container,
      value: "### Section",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.classList.contains("is-heading")).toBe(true);
    expect(line?.classList.contains("is-heading-3")).toBe(true);
    expect(line?.textContent).toBe("Section");
  });

  test("renders multiple headings", () => {
    engine = new CakeEngine({
      container,
      value: "# First\n## Second\n### Third",
      extensions: bundledExtensions,
    });

    const lines = container.querySelectorAll(".cake-line.is-heading");
    expect(lines.length).toBe(3);
    expect(lines[0]?.classList.contains("is-heading-1")).toBe(true);
    expect(lines[1]?.classList.contains("is-heading-2")).toBe(true);
    expect(lines[2]?.classList.contains("is-heading-3")).toBe(true);
  });

  test("renders mixed content with headings and paragraphs", () => {
    engine = new CakeEngine({
      container,
      value: "# Title\nparagraph\n## Subtitle",
      extensions: bundledExtensions,
    });

    const allLines = container.querySelectorAll(".cake-line");
    expect(allLines.length).toBe(3);

    expect(allLines[0]?.classList.contains("is-heading")).toBe(true);
    expect(allLines[1]?.classList.contains("is-heading")).toBe(false);
    expect(allLines[2]?.classList.contains("is-heading")).toBe(true);
  });

  test("sets data-heading-level attribute", () => {
    engine = new CakeEngine({
      container,
      value: "## Level 2",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line") as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.dataset.headingLevel).toBe("2");
  });

  test("renders heading with bold content", () => {
    engine = new CakeEngine({
      container,
      value: "# **Bold** Title",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-heading");
    expect(line).not.toBeNull();

    const boldSpan = line?.querySelector("strong, [data-inline='bold']");
    expect(boldSpan).not.toBeNull();
    expect(boldSpan?.textContent).toBe("Bold");
  });

  test("renders heading with italic content", () => {
    engine = new CakeEngine({
      container,
      value: "# _Italic_ Title",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-heading");
    expect(line).not.toBeNull();

    const italicSpan = line?.querySelector("em, [data-inline='italic']");
    expect(italicSpan).not.toBeNull();
    expect(italicSpan?.textContent).toBe("Italic");
  });

  test("empty heading shows placeholder", () => {
    engine = new CakeEngine({
      container,
      value: "# ",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(
      ".cake-line.is-heading",
    ) as HTMLElement;
    expect(line).not.toBeNull();
    expect(line?.dataset.headingPlaceholder).toBe("Heading 1");
  });

  test("empty h2 heading shows placeholder", () => {
    engine = new CakeEngine({
      container,
      value: "## ",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(
      ".cake-line.is-heading",
    ) as HTMLElement;
    expect(line).not.toBeNull();
    expect(line?.dataset.headingPlaceholder).toBe("Heading 2");
  });

  test("has data-line-index attribute", () => {
    engine = new CakeEngine({
      container,
      value: "# Title",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.getAttribute("data-line-index")).toBe("0");
  });

  test("line indexes are sequential across headings and paragraphs", () => {
    engine = new CakeEngine({
      container,
      value: "# Title\nparagraph\n## Subtitle",
      extensions: bundledExtensions,
    });

    const lines = container.querySelectorAll(".cake-line");
    expect(lines.length).toBe(3);
    expect(lines[0]?.getAttribute("data-line-index")).toBe("0");
    expect(lines[1]?.getAttribute("data-line-index")).toBe("1");
    expect(lines[2]?.getAttribute("data-line-index")).toBe("2");
  });
});

describe("heading extension typing behavior (harness)", () => {
  test("empty doc: typing '# ' renders an empty heading with placeholder", async () => {
    const h = createTestHarness("");
    await h.focus();
    await h.typeText("#");
    await h.typeText(" ");

    expect(h.engine.getValue()).toBe("# ");

    const line = h.getLine(0);
    expect(line.classList.contains("is-heading")).toBe(true);
    expect((line as HTMLElement).dataset.headingPlaceholder).toBe("Heading 1");
    h.destroy();
  });

  test("Cmd+Backspace clears heading text; then Backspace removes the heading entirely", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("#");
    await h.typeText(" ");
    await h.typeText("some text");

    const headingLine = h.getLine(0) as HTMLElement;
    expect(headingLine.classList.contains("is-heading")).toBe(true);
    expect(headingLine.classList.contains("is-heading-1")).toBe(true);

    // Cmd+Backspace should delete the line content (not the heading marker)
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
    const cursorEnd = h.selection.end;
    h.engine.setSelection({
      start: cursorEnd,
      end: cursorEnd,
      affinity: "forward",
    });
    await h.pressKey("Backspace", { meta: true });

    expect(h.engine.getValue()).toBe("# ");
    expect((h.getLine(0) as HTMLElement).dataset.headingPlaceholder).toBe(
      "Heading 1",
    );

    // Wait for microtask to reset the keydownHandledBeforeInput flag
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Backspace at the start of an empty heading should remove the heading line entirely.
    await h.pressBackspace();

    expect(h.engine.getValue()).toBe("");
    const line = h.getLine(0) as HTMLElement;
    expect(line.classList.contains("is-heading")).toBe(false);
    expect(line.dataset.headingPlaceholder).toBeUndefined();
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    h.destroy();
  });
});
