import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CakeEditor } from "../../editor/cake-editor";
import { bundledExtensions } from "../index";
import { createTestHarness } from "../../test/harness";

describe("heading extension DOM rendering", () => {
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

  test("renders h1 heading with is-heading class", () => {
    engine = new CakeEditor({
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
    engine = new CakeEditor({
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
    engine = new CakeEditor({
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
    engine = new CakeEditor({
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
    engine = new CakeEditor({
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

  test("renders heading with bold content", () => {
    engine = new CakeEditor({
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
    engine = new CakeEditor({
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
    engine = new CakeEditor({
      container,
      value: "# ",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(
      ".cake-line.is-heading",
    ) as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.getAttribute("aria-placeholder")).toBe("Heading 1");
  });

  test("empty h2 heading shows placeholder", () => {
    engine = new CakeEditor({
      container,
      value: "## ",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(
      ".cake-line.is-heading",
    ) as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.getAttribute("aria-placeholder")).toBe("Heading 2");
  });

  test("has data-line-index attribute", () => {
    engine = new CakeEditor({
      container,
      value: "# Title",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.getAttribute("data-line-index")).toBe("0");
  });

  test("line indexes are sequential across headings and paragraphs", () => {
    engine = new CakeEditor({
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

  test("reports heading active marks at the caret and removes them when toggled off", () => {
    engine = new CakeEditor({
      container,
      value: "# Title",
      extensions: bundledExtensions,
    });

    engine.setSelection({ start: 2, end: 2, affinity: "forward" });
    expect(engine.getActiveMarks()).toContain("heading");

    engine.executeCommand({ type: "toggle-heading", level: 1 });
    expect(engine.getValue()).toBe("Title");
    expect(engine.getActiveMarks()).not.toContain("heading");
  });

  test("reports level-specific active marks for h2 headings", () => {
    engine = new CakeEditor({
      container,
      value: "## Subtitle",
      extensions: bundledExtensions,
    });

    engine.setSelection({ start: 3, end: 3, affinity: "forward" });
    expect(engine.getActiveMarks()).toContain("heading-2");
  });
});

describe("heading extension typing behavior (harness)", () => {
  const mod =
    typeof navigator !== "undefined" &&
    typeof navigator.platform === "string" &&
    navigator.platform.toLowerCase().includes("mac")
      ? { meta: true }
      : { ctrl: true };

  test("empty doc: typing '# ' renders an empty heading with placeholder", async () => {
    const h = createTestHarness("");
    await h.focus();
    await h.typeText("#");
    await h.typeText(" ");

    expect(h.engine.getValue()).toBe("# ");

    const line = h.getLine(0);
    expect(line.classList.contains("is-heading")).toBe(true);
    expect((line as HTMLElement).getAttribute("aria-placeholder")).toBe(
      "Heading 1",
    );
    h.destroy();
  });

  test("pressing Enter near heading start inserts a paragraph above instead of leaving an empty heading", async () => {
    const h = createTestHarness("# Title");
    await h.focus();

    await h.clickLeftOf(0, 0);
    await h.typeText(" ");
    await h.pressEnter();

    expect(h.getLineCount()).toBe(2);
    expect(h.getLine(0).classList.contains("is-heading")).toBe(false);
    expect(h.getLine(1).classList.contains("is-heading")).toBe(true);
    expect((h.getLine(1).textContent ?? "").trim()).toBe("Title");

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
    expect((h.getLine(0) as HTMLElement).getAttribute("aria-placeholder")).toBe(
      "Heading 1",
    );

    // Wait for microtask to reset the keydownHandledBeforeInput flag
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Backspace at the start of an empty heading should remove the heading line entirely.
    await h.pressBackspace();

    expect(h.engine.getValue()).toBe("");
    const line = h.getLine(0) as HTMLElement;
    expect(line.classList.contains("is-heading")).toBe(false);
    expect(line.getAttribute("aria-placeholder")).toBeNull();
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    h.destroy();
  });

  test("Cmd+A then Backspace deletes a document containing a heading", async () => {
    const h = createTestHarness("# Cake Demo\nhello");
    await h.focus();

    await h.pressKey("a", mod);
    await h.pressBackspace();

    expect(h.engine.getValue()).toBe("");
    expect(h.getLineCount()).toBe(1);
    expect(h.getLine(0).textContent ?? "").toBe("");
    h.destroy();
  });

  test("Backspace at start of paragraph after heading merges text into heading", async () => {
    const h = createTestHarness("# Cake Demo\nhello");
    await h.focus();

    // Click at start of "hello" then backspace should delete the newline and
    // move the paragraph text into the heading.
    await h.clickLeftOf(0, 1);
    await h.pressBackspace();

    expect(h.engine.getValue()).toBe("# Cake Demohello");
    expect(h.getLineCount()).toBe(1);
    expect(h.getLine(0).textContent ?? "").toBe("Cake Demohello");
    expect(h.getLine(0).classList.contains("is-heading")).toBe(true);
    h.destroy();
  });

  test("Backspace at start of empty paragraph after heading removes the empty line and moves caret into heading", async () => {
    const h = createTestHarness("# Cake Demo\n");
    await h.focus();

    // Click into the empty second line (can't use clickAt on empty line).
    const lineRect = h.getLineRect(1);
    await h.clickAtCoords(
      lineRect.left + 5,
      lineRect.top + lineRect.height / 2,
    );
    await h.pressBackspace();

    expect(h.engine.getValue()).toBe("# Cake Demo");
    expect(h.getLineCount()).toBe(1);
    expect(h.getLine(0).textContent ?? "").toBe("Cake Demo");
    expect(h.getLine(0).classList.contains("is-heading")).toBe(true);
    h.destroy();
  });

  test("copy and paste heading preserves content and formatting", async () => {
    const h = createTestHarness("# My Heading");
    await h.focus();

    // Select all (the heading)
    await h.pressKey("a", { meta: true });

    // Copy (Cmd+C)
    const clipboardStore: Record<string, string> = {};
    const copyEvent = new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    Object.defineProperty(copyEvent, "clipboardData", {
      value: {
        setData: (type: string, data: string) => {
          clipboardStore[type] = data;
        },
        getData: () => "",
      },
    });
    h.contentRoot.dispatchEvent(copyEvent);

    // Move to end and insert new line
    await h.pressKey("ArrowRight");
    await h.pressEnter();

    // Paste (Cmd+V)
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        getData: (type: string) => clipboardStore[type] ?? "",
      },
    });
    h.contentRoot.dispatchEvent(pasteEvent);

    // Assert exact copy: content and formatting
    // After Enter, we have an empty line, then paste inserts the heading
    expect(h.engine.getValue()).toBe("# My Heading\n\n# My Heading");
    expect(h.getLineCount()).toBe(3);
    expect(h.getLine(0).classList.contains("is-heading")).toBe(true);
    expect(h.getLine(2).classList.contains("is-heading")).toBe(true);
    expect(h.getLine(0).textContent).toBe("My Heading");
    expect(h.getLine(2).textContent).toBe("My Heading");

    h.destroy();
  });
});
