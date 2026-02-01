import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { userEvent } from "vitest/browser";
import { CakeEditor } from "../../editor/cake-editor";
import { bundledExtensions } from "../index";
import { createTestHarness, type TestHarness } from "../../test/harness";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };
const modShift = { ...mod, shift: true };

describe("list extension DOM rendering", () => {
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

  test("renders unordered list with is-list class", () => {
    engine = new CakeEditor({
      container,
      value: "- item",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.classList.contains("is-list")).toBe(true);
    // textContent includes the list marker for DOM/accessibility compatibility
    expect(line?.textContent).toBe("- item");
  });

  test("renders ordered list with is-list class", () => {
    engine = new CakeEditor({
      container,
      value: "1. first",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line");
    expect(line).not.toBeNull();
    expect(line?.classList.contains("is-list")).toBe(true);
    // textContent includes the list marker for DOM/accessibility compatibility
    expect(line?.textContent).toBe("1. first");
  });

  test("renders multiple list items", () => {
    engine = new CakeEditor({
      container,
      value: "- one\n- two\n- three",
      extensions: bundledExtensions,
    });

    const lines = container.querySelectorAll(".cake-line.is-list");
    expect(lines.length).toBe(3);
    // textContent includes the list marker for DOM/accessibility compatibility
    expect(lines[0]?.textContent).toBe("- one");
    expect(lines[1]?.textContent).toBe("- two");
    expect(lines[2]?.textContent).toBe("- three");
  });

  test("renders mixed content with list items", () => {
    engine = new CakeEditor({
      container,
      value: "paragraph\n- list item\nanother paragraph",
      extensions: bundledExtensions,
    });

    const allLines = container.querySelectorAll(".cake-line");
    expect(allLines.length).toBe(3);

    expect(allLines[0]?.classList.contains("is-list")).toBe(false);
    expect(allLines[1]?.classList.contains("is-list")).toBe(true);
    expect(allLines[2]?.classList.contains("is-list")).toBe(false);
  });

  test("sets list marker CSS variable for text-indent", () => {
    engine = new CakeEditor({
      container,
      value: "- item",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line") as HTMLElement;
    expect(line).not.toBeNull();
    // CSS variable is used for text-indent, in ch units (marker + space length)
    const marker = line.style.getPropertyValue("--cake-list-marker");
    expect(marker).toBe("2ch");
  });

  test("sets list indent CSS variable for nested list", () => {
    engine = new CakeEditor({
      container,
      value: "  - indented",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line") as HTMLElement;
    expect(line).not.toBeNull();
    // Indent is in ch units (indent level * 2)
    const indent = line.style.getPropertyValue("--cake-list-indent");
    expect(indent).toBe("2ch");
  });

  test("renders list with bold content", () => {
    engine = new CakeEditor({
      container,
      value: "- **bold** item",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-list");
    expect(line).not.toBeNull();

    const boldSpan = line?.querySelector("strong, [data-inline='bold']");
    expect(boldSpan).not.toBeNull();
    expect(boldSpan?.textContent).toBe("bold");
  });

  test("renders list with italic content", () => {
    engine = new CakeEditor({
      container,
      value: "- _italic_ item",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-list");
    expect(line).not.toBeNull();

    const italicSpan = line?.querySelector("em, [data-inline='italic']");
    expect(italicSpan).not.toBeNull();
    expect(italicSpan?.textContent).toBe("italic");
  });

  test("empty list item renders correctly", () => {
    engine = new CakeEditor({
      container,
      value: "- ",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-list");
    expect(line).not.toBeNull();
    // textContent includes the list marker even for empty content
    expect(line?.textContent).toBe("- ");
  });

  test("asterisk marker creates list", () => {
    engine = new CakeEditor({
      container,
      value: "* item",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-list");
    expect(line).not.toBeNull();

    // CSS variable is in ch units for text-indent
    const marker = (line as HTMLElement).style.getPropertyValue(
      "--cake-list-marker",
    );
    expect(marker).toBe("2ch");
    // Verify marker is in text content
    expect(line?.textContent).toBe("* item");
  });

  test("plus marker creates list", () => {
    engine = new CakeEditor({
      container,
      value: "+ item",
      extensions: bundledExtensions,
    });

    const line = container.querySelector(".cake-line.is-list");
    expect(line).not.toBeNull();

    // CSS variable is in ch units for text-indent
    const marker = (line as HTMLElement).style.getPropertyValue(
      "--cake-list-marker",
    );
    expect(marker).toBe("2ch");
    // Verify marker is in text content
    expect(line?.textContent).toBe("+ item");
  });
});

describe("list extension Enter key behavior", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("Cmd+Shift+7 converts entire list even when selection is backward (end → beginning)", async () => {
    harness = createTestHarness("- one\n- two\n- three");

    await harness.focus();

    // Place caret at end of doc.
    harness.engine.selectAll();
    const end = harness.selection.end;
    harness.engine.setSelection({ start: end, end, affinity: "forward" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Create a backward selection (anchor at end, focus at beginning), like holding
    // Shift+ArrowLeft repeatedly from the end.
    const firstNode = harness.getTextNode(0);
    const lastNode = harness.getTextNode(2);
    const selection = window.getSelection();
    if (!selection) {
      throw new Error("Missing selection");
    }
    selection.removeAllRanges();
    selection.setBaseAndExtent(lastNode, lastNode.length, firstNode, 0);
    document.dispatchEvent(new Event("selectionchange"));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Convert to numbered list (Cmd+Shift+7 / Ctrl+Shift+7).
    await harness.pressKey("7", { ctrl: true, meta: true, shift: true });

    // Expected: all three items converted, regardless of selection direction.
    expect(harness.engine.getValue()).toBe("1. one\n2. two\n3. three");
  });

  test("Cmd+Backspace at end of bold numbered list deletes the last line without leaving stray markers", async () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
    harness = createTestHarness(
      "1. **adsdsaasdsaddadsadsadsa**\n2. **asddasads**",
    );

    await harness.focus();

    // Place caret at end of doc.
    harness.engine.selectAll();
    const end = harness.selection.end;
    harness.engine.setSelection({ start: end, end, affinity: "forward" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Cmd+Backspace should delete the entire last line (line delete), not leave `**`.
    await harness.pressKey("Backspace", { meta: true });

    expect(harness.engine.getValue()).toBe("1. **adsdsaasdsaddadsadsadsa**");

    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  test("Backspace repeatedly at end of bold numbered list does not drop the list item prefix", async () => {
    harness = createTestHarness(
      "1. **adsdsaasdsaddadsadsadsa**\n2. **asddasads**",
    );

    await harness.focus();

    // Place caret at end of doc.
    harness.engine.selectAll();
    const end = harness.selection.end;
    harness.engine.setSelection({ start: end, end, affinity: "forward" });
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Press backspace 6 times.
    for (let i = 0; i < 6; i += 1) {
      await harness.pressBackspace();
    }

    // Expected: still a numbered list item, only text changed.
    expect(harness.engine.getValue()).toBe(
      "1. **adsdsaasdsaddadsadsadsa**\n2. **asd**",
    );
  });

  test("pressing Enter after '- hello' creates new list item", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("- hello");

    // Verify we typed it correctly
    expect(harness.engine.getValue()).toBe("- hello");
    expect(harness.selection.start).toBe(7);

    // Press Enter
    await harness.pressEnter();

    // Should create a new line with "- "
    expect(harness.engine.getValue()).toBe("- hello\n- ");
    expect(harness.selection.start).toBe(10); // After "- hello\n- "
    expect(harness.getLineCount()).toBe(2);
  });

  test("pressing Enter in middle of list item splits content", async () => {
    harness = createTestHarness("- hello world");

    await harness.focus();
    // Position cursor after "- hello" (position 7)
    harness.engine.setSelection({ start: 7, end: 7, affinity: "forward" });

    await harness.pressEnter();

    // Should split into "- hello" and "- world"
    expect(harness.engine.getValue()).toBe("- hello\n-  world");
    expect(harness.selection.start).toBe(10); // After "- hello\n- "
  });

  test("pressing Enter on empty list item removes the marker", async () => {
    harness = createTestHarness("- hello\n- ");

    await harness.focus();
    // Position cursor at end of second line (position 10)
    harness.engine.setSelection({ start: 10, end: 10, affinity: "forward" });

    await harness.pressEnter();

    // Empty list item should become empty paragraph
    // "- hello\n- " (10 chars) -> "- hello\n" (8 chars) with cursor at start of empty line
    expect(harness.engine.getValue()).toBe("- hello\n");
    expect(harness.selection.start).toBe(8); // Cursor at start of (now empty) second line
  });
});

describe("list extension backspace/merge behavior", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("backspace at start of list content removes marker", async () => {
    harness = createTestHarness("- hello");

    await harness.focus();
    // Position cursor right after "- " (position 2)
    harness.engine.setSelection({ start: 2, end: 2, affinity: "forward" });

    await harness.pressBackspace();

    // Marker should be removed, leaving just "hello"
    expect(harness.engine.getValue()).toBe("hello");
    expect(harness.selection.start).toBe(0);
  });

  test("backspace at numbered list content start removes marker", async () => {
    harness = createTestHarness("1. one\n2. two");

    await harness.focus();
    // Position cursor at start of second list item content (after "2. ")
    // "1. one\n" = 7 chars, then "2. " = 3 chars, so position 10
    harness.engine.setSelection({ start: 10, end: 10, affinity: "forward" });

    await harness.pressBackspace();

    // Should remove the marker "2. " leaving just "two" on second line
    expect(harness.engine.getValue()).toBe("1. one\ntwo");
  });

  test("backspace at numbered list line start merges with previous", async () => {
    harness = createTestHarness("1. one\n2. two");

    await harness.focus();
    // Position cursor at absolute start of second line (position 7, right after newline)
    harness.engine.setSelection({ start: 7, end: 7, affinity: "forward" });

    await harness.pressBackspace();

    // Should merge list items: "1. one two" (content joined with space)
    expect(harness.engine.getValue()).toBe("1. one two");
  });

  test("backspace at line start merges with previous line", async () => {
    harness = createTestHarness("- one\n- two");

    await harness.focus();
    // Position cursor at absolute start of second line (position 6, right after newline)
    harness.engine.setSelection({ start: 6, end: 6, affinity: "forward" });

    await harness.pressBackspace();

    // Should merge list items: "- one two" (content joined with space)
    expect(harness.engine.getValue()).toBe("- one two");
  });

  test("backspace on empty line before list item removes the line", async () => {
    harness = createTestHarness("- one\n\n- two");

    await harness.focus();
    // Position cursor on the empty line (position 6)
    harness.engine.setSelection({ start: 6, end: 6, affinity: "forward" });

    await harness.pressBackspace();

    // Should remove the empty line
    expect(harness.engine.getValue()).toBe("- one\n- two");
  });
});

describe("list extension indent/outdent renumbering", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("indenting numbered list item renumbers both levels", async () => {
    // Input: "1. A\n2. B\n3. C" - indent the middle item
    harness = createTestHarness("1. A\n2. B\n3. C");

    await harness.focus();
    // Position cursor on "2. B" (position 8 = "1. A\n" + "2. ")
    harness.engine.setSelection({ start: 8, end: 8, affinity: "forward" });

    await harness.pressTab();

    // Expected: "1. A\n  1. B\n2. C"
    // - "2. B" becomes "  1. B" (indented, renumbered to 1)
    // - "3. C" becomes "2. C" (renumbered from 3 to 2)
    expect(harness.engine.getValue()).toBe("1. A\n  1. B\n2. C");
  });

  test("outdenting nested numbered list item renumbers both levels", async () => {
    // Input: "1. A\n  1. B\n2. C" - outdent the nested item
    harness = createTestHarness("1. A\n  1. B\n2. C");

    await harness.focus();
    // Position cursor on "  1. B" (position 10 = "1. A\n" + "  1. ")
    harness.engine.setSelection({ start: 10, end: 10, affinity: "forward" });

    await harness.pressShiftTab();

    // Expected: "1. A\n2. B\n3. C"
    // - "  1. B" becomes "2. B" (outdented, renumbered to 2)
    // - "2. C" becomes "3. C" (renumbered from 2 to 3)
    expect(harness.engine.getValue()).toBe("1. A\n2. B\n3. C");
  });

  test("indenting bullet list does not affect numbering", async () => {
    harness = createTestHarness("- one\n- two\n- three");

    await harness.focus();
    // Position cursor on second item
    harness.engine.setSelection({ start: 8, end: 8, affinity: "forward" });

    await harness.pressTab();

    // Just adds indent, no numbering changes
    expect(harness.engine.getValue()).toBe("- one\n  - two\n- three");
  });

  test("outdenting top-level bullet list removes prefix", async () => {
    harness = createTestHarness("- hello");

    await harness.focus();
    // Position cursor in the list item
    harness.engine.setSelection({ start: 4, end: 4, affinity: "forward" });

    await harness.pressShiftTab();

    // Should remove "- " prefix, leaving just "hello"
    expect(harness.engine.getValue()).toBe("hello");
  });

  test("outdenting top-level numbered list removes prefix and renumbers", async () => {
    harness = createTestHarness("1. one\n2. two\n3. three");

    await harness.focus();
    // Position cursor on second item
    harness.engine.setSelection({ start: 10, end: 10, affinity: "forward" });

    await harness.pressShiftTab();

    // Should remove "2. " prefix from second line, and renumber "3. three" to "2. three"
    expect(harness.engine.getValue()).toBe("1. one\ntwo\n2. three");
  });
});

describe("list extension caret and selection", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("typing '- hello' places caret at end of text", async () => {
    harness = createTestHarness("");

    await harness.focus();
    await harness.typeText("- hello");

    // The source should be "- hello"
    expect(harness.engine.getValue()).toBe("- hello");

    // Caret should be at end (cursor position 7 = after "- hello")
    expect(harness.selection.start).toBe(7);
    expect(harness.selection.end).toBe(7);

    // Wait for the overlay to update (uses requestAnimationFrame)
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Debug: Log the DOM structure
    const line = harness.getLine(0);
    console.log("Line textContent:", JSON.stringify(line.textContent));
    console.log("Line innerHTML:", line.innerHTML);

    // Find all text nodes in the line and measure their positions
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let textNodes: { text: string; length: number; rect: DOMRect }[] = [];
    while ((node = walker.nextNode() as Text | null)) {
      const r = document.createRange();
      r.selectNode(node);
      textNodes.push({
        text: node.data,
        length: node.data.length,
        rect: r.getBoundingClientRect(),
      });
    }
    console.log("Text nodes:", JSON.stringify(textNodes));

    // Check where offset 5 in the "hello" node actually is
    const helloNode = textNodes[1];
    if (helloNode) {
      // Get the walker again to find the actual node
      const walker2 = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      walker2.nextNode(); // skip "- "
      const helloTextNode = walker2.nextNode() as Text;
      const r = document.createRange();
      r.setStart(helloTextNode, 5);
      r.setEnd(helloTextNode, 5);
      const offset5Rect = r.getBoundingClientRect();
      console.log("Offset 5 in hello node:", offset5Rect.left);
    }

    // Get the caret's actual DOM position
    const caretRect = harness.getCaretRect();
    expect(caretRect).not.toBeNull();
    console.log("Caret rect:", caretRect);

    const lineRect = line.getBoundingClientRect();
    console.log("Line rect left:", lineRect.left);

    // Create a range that selects all text in the line to find the text extent
    const range = document.createRange();
    range.selectNodeContents(line);
    const textExtent = range.getBoundingClientRect();
    console.log("Text extent right:", textExtent.right);
    console.log(
      "Expected caret left (relative):",
      textExtent.right - lineRect.left,
    );

    // The caret left position should be at the end of the text
    expect(caretRect!.left).toBeCloseTo(textExtent.right - lineRect.left, 0);
  });

  test("selecting 'hello' in '- hello' shows correct selection rect", async () => {
    harness = createTestHarness("- hello");

    // Click first to place caret, then use engine to set selection programmatically
    await harness.focus();

    // Set selection to cover "hello" (cursor positions 2-7)
    harness.engine.setSelection({ start: 2, end: 7, affinity: "forward" });

    // Verify selection is set correctly
    expect(harness.selection.start).toBe(2);
    expect(harness.selection.end).toBe(7);

    // Wait for the overlay to update (uses requestAnimationFrame)
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Get the selection rect
    const selectionRects = harness.getSelectionRects();
    expect(selectionRects.length).toBe(1);

    const selRect = selectionRects[0];

    // The selection should have positive width (it covers "hello")
    expect(selRect.width).toBeGreaterThan(0);

    // Get line rect to verify selection is on the correct line
    const lineRect = harness.getLineRect(0);

    // Selection should be within the line bounds
    expect(selRect.top).toBeGreaterThanOrEqual(0);
    expect(selRect.left).toBeGreaterThan(0); // After "- "
    expect(selRect.left + selRect.width).toBeLessThanOrEqual(
      lineRect.width + 1,
    );
  });
});

describe("typing dash with selection to create list", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("typing dash with single line selected creates bullet list", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    // Select the entire line
    harness.engine.setSelection({ start: 0, end: 11, affinity: "forward" });

    // Type dash
    await harness.typeText("-");

    // Should create a bullet list
    expect(harness.engine.getValue()).toBe("- hello world");
  });

  test("typing dash with multiple lines selected creates bullet list for each line", async () => {
    harness = createTestHarness("line one\nline two\nline three");

    await harness.focus();
    // Select all lines
    harness.engine.setSelection({ start: 0, end: 28, affinity: "forward" });

    // Type dash
    await harness.typeText("-");

    // Should create bullet list for all lines
    expect(harness.engine.getValue()).toBe(
      "- line one\n- line two\n- line three",
    );
  });

  test("typing multiple lines then selectAll and dash creates bullet list for each line", async () => {
    harness = createTestHarness("");

    await harness.focus();

    // Type multiple lines using real keystrokes via vitest/browser userEvent
    await userEvent.type(harness.contentRoot, "first line");
    await userEvent.keyboard("{Enter}");
    await userEvent.type(harness.contentRoot, "second line");
    await userEvent.keyboard("{Enter}");
    await userEvent.type(harness.contentRoot, "third line");

    console.log(
      "Value after typing:",
      JSON.stringify(harness.engine.getValue()),
    );

    // Select all using real Cmd+A
    await userEvent.keyboard("{Meta>}a{/Meta}");

    console.log("Selection after Cmd+A:", harness.selection);

    // Type dash using real keystroke
    await userEvent.keyboard("-");

    console.log("Value after typing dash:", harness.engine.getValue());

    // Check that lines are now list items
    const listCount =
      harness.container.querySelectorAll(".cake-line.is-list").length;
    expect(listCount).toBe(3);

    // Also verify the value
    expect(harness.engine.getValue()).toBe(
      "- first line\n- second line\n- third line",
    );
  });

  test("typing dash with partial multi-line selection creates bullet list", async () => {
    // This test replicates the real bug: when selection doesn't perfectly align
    // with line boundaries (e.g., user selects from middle of first line to middle of last)
    harness = createTestHarness("first line\nsecond line\nthird line");

    await harness.focus();

    // Simulate partial selection - starting from character 2 of first line
    // to character 8 of last line (not aligned with line boundaries)
    // "first line\nsecond line\nthird line"
    //   ^-- start at 2 ("rst line\nsecond line\nthird li")
    //                                            ^-- end at 31
    harness.engine.setSelection({ start: 2, end: 31, affinity: "forward" });

    console.log("Source:", JSON.stringify(harness.engine.getValue()));
    console.log("Selection:", harness.selection);

    // Type dash using real keystroke
    await userEvent.keyboard("-");

    console.log("Value after typing dash:", harness.engine.getValue());

    // Should convert ALL THREE lines to list items, not just replace selection
    const listCount =
      harness.container.querySelectorAll(".cake-line.is-list").length;
    expect(listCount).toBe(3);

    expect(harness.engine.getValue()).toBe(
      "- first line\n- second line\n- third line",
    );
  });

  test("typing dash with numbered list selected converts to bullet list", async () => {
    harness = createTestHarness("1. item one\n2. item two\n3. item three");

    await harness.focus();
    // Select all lines (string length is 37)
    harness.engine.setSelection({ start: 0, end: 37, affinity: "forward" });

    // Type dash
    await harness.typeText("-");

    // Should convert to bullet list
    expect(harness.engine.getValue()).toBe(
      "- item one\n- item two\n- item three",
    );
  });

  test("typing dash to create list can be undone", async () => {
    const original = "line one\nline two\nline three";
    harness = createTestHarness(original);

    await harness.focus();
    // Select all lines
    harness.engine.setSelection({ start: 0, end: 28, affinity: "forward" });

    // Type dash to create list
    await harness.typeText("-");

    expect(harness.engine.getValue()).toBe(
      "- line one\n- line two\n- line three",
    );

    // Undo should restore original
    await harness.pressKey("z", mod);

    expect(harness.engine.getValue()).toBe(original);
  });

  test("typing dash to create list on single line can be undone", async () => {
    // Start with empty harness and type the text (like real user would)
    harness = createTestHarness("");

    await harness.focus();
    // Type the text first
    await harness.typeText("hello world");

    expect(harness.engine.getValue()).toBe("hello world");

    // Select the entire line
    harness.engine.setSelection({ start: 0, end: 11, affinity: "forward" });

    // Type dash to create list
    await harness.typeText("-");

    expect(harness.engine.getValue()).toBe("- hello world");

    // Undo should restore original (the typed text, not empty)
    await harness.pressKey("z", mod);

    expect(harness.engine.getValue()).toBe("hello world");
  });

  test("typing dash at start of existing list switches marker (no selection)", async () => {
    harness = createTestHarness("* item");

    await harness.focus();
    // Position cursor at the start (before the marker)
    harness.engine.setSelection({ start: 0, end: 0, affinity: "forward" });

    // Type dash
    await harness.typeText("-");

    // Should switch from asterisk to dash
    expect(harness.engine.getValue()).toBe("- item");
  });
});

describe("list toggle commands", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("toggle-bullet-list on single line creates bullet list", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    // Select the entire line
    harness.engine.setSelection({ start: 0, end: 11, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-bullet-list" });

    expect(harness.engine.getValue()).toBe("- hello world");
  });

  test("toggle-bullet-list on multiple lines creates bullet list for each", async () => {
    harness = createTestHarness("line one\nline two\nline three");

    await harness.focus();
    // Select all lines
    harness.engine.setSelection({ start: 0, end: 28, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-bullet-list" });

    expect(harness.engine.getValue()).toBe(
      "- line one\n- line two\n- line three",
    );
  });

  test("toggle-bullet-list removes bullet list when already a bullet list", async () => {
    harness = createTestHarness("- hello world");

    await harness.focus();
    // Select the entire line
    harness.engine.setSelection({ start: 0, end: 13, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-bullet-list" });

    expect(harness.engine.getValue()).toBe("hello world");
  });

  test("toggle-numbered-list on single line creates numbered list", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    // Select the entire line
    harness.engine.setSelection({ start: 0, end: 11, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-numbered-list" });

    expect(harness.engine.getValue()).toBe("1. hello world");
  });

  test("toggle-numbered-list on multiple lines creates numbered list with sequential numbers", async () => {
    harness = createTestHarness("line one\nline two\nline three");

    await harness.focus();
    // Select all lines
    harness.engine.setSelection({ start: 0, end: 28, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-numbered-list" });

    expect(harness.engine.getValue()).toBe(
      "1. line one\n2. line two\n3. line three",
    );
  });

  test("toggle-numbered-list removes numbered list when already a numbered list", async () => {
    harness = createTestHarness("1. hello world");

    await harness.focus();
    // Select the entire line
    harness.engine.setSelection({ start: 0, end: 14, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-numbered-list" });

    expect(harness.engine.getValue()).toBe("hello world");
  });
});

describe("typing dash with partial selection", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("selecting first word and typing dash replaces with dash", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    // Select only "hello" (positions 0-5)
    harness.engine.setSelection({ start: 0, end: 5, affinity: "forward" });

    await harness.typeText("-");

    // Should replace "hello" with "-", resulting in "- world"
    expect(harness.engine.getValue()).toBe("- world");
  });

  test("selecting last word and typing dash replaces with dash", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    // Select only "world" (positions 6-11)
    harness.engine.setSelection({ start: 6, end: 11, affinity: "forward" });

    await harness.typeText("-");

    // Should replace "world" with "-", no list created
    expect(harness.engine.getValue()).toBe("hello -");
  });
});

describe("keyboard shortcuts for list toggle", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("Cmd+Shift+8 toggles bullet list on plain text", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 11, affinity: "forward" });

    // Cmd+Shift+8 should toggle bullet list
    await harness.pressKey("8", modShift);

    expect(harness.engine.getValue()).toBe("- hello world");
  });

  test("Cmd+Shift+8 toggles bullet list off", async () => {
    harness = createTestHarness("- hello world");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 13, affinity: "forward" });

    // Cmd+Shift+8 should toggle bullet list off
    await harness.pressKey("8", modShift);

    expect(harness.engine.getValue()).toBe("hello world");
  });

  test("Cmd+Shift+7 toggles numbered list on plain text", async () => {
    harness = createTestHarness("hello world");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 11, affinity: "forward" });

    // Cmd+Shift+7 should toggle numbered list
    await harness.pressKey("7", modShift);

    expect(harness.engine.getValue()).toBe("1. hello world");
  });

  test("Cmd+Shift+7 toggles numbered list off", async () => {
    harness = createTestHarness("1. hello world");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 14, affinity: "forward" });

    // Cmd+Shift+7 should toggle numbered list off
    await harness.pressKey("7", modShift);

    expect(harness.engine.getValue()).toBe("hello world");
  });

  test("Cmd+Shift+8 converts numbered list to bullet list", async () => {
    harness = createTestHarness("1. item one\n2. item two");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 23, affinity: "forward" });

    await harness.pressKey("8", modShift);

    expect(harness.engine.getValue()).toBe("- item one\n- item two");
  });

  test("Cmd+Shift+7 converts bullet list to numbered list", async () => {
    harness = createTestHarness("- item one\n- item two");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 21, affinity: "forward" });

    await harness.pressKey("7", modShift);

    expect(harness.engine.getValue()).toBe("1. item one\n2. item two");
  });

  test("Cmd+Shift+8 on multiple plain lines creates bullet list", async () => {
    harness = createTestHarness("line one\nline two\nline three");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 28, affinity: "forward" });

    await harness.pressKey("8", modShift);

    expect(harness.engine.getValue()).toBe(
      "- line one\n- line two\n- line three",
    );
  });

  test("Cmd+Shift+7 on multiple plain lines creates numbered list", async () => {
    harness = createTestHarness("line one\nline two\nline three");

    await harness.focus();
    harness.engine.setSelection({ start: 0, end: 28, affinity: "forward" });

    await harness.pressKey("7", modShift);

    expect(harness.engine.getValue()).toBe(
      "1. line one\n2. line two\n3. line three",
    );
  });
});

describe("selecting multiple lines with keyboard and typing dash", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("selecting lines and typing dash creates list without affecting heading", async () => {
    // Document: "# Hello\none\ntwo\nthree" (21 source chars)
    // Cursor positions differ from source positions due to syntax markers.
    // The "# " prefix is 2 chars but contributes 0 cursor positions (it's a marker).
    // So cursorLength = 21 - 2 = 19
    harness = createTestHarness("# Hello\none\ntwo\nthree");

    // Verify document
    expect(harness.engine.getValue()).toBe("# Hello\none\ntwo\nthree");

    await harness.focus();

    // Use selectAll to find the cursor length, then select from after the heading
    harness.engine.selectAll();
    const cursorLength = harness.selection.end;

    // Select from after heading to end
    // Heading "# Hello" takes cursor positions 0-5 (Hello), newline at 6
    // So "one" starts at cursor position 6
    harness.engine.setSelection({
      start: 6,
      end: cursorLength,
      affinity: "forward",
    });

    // Verify selection does NOT include the heading (line 0)
    // Selection should start at line 1 (the "one" line)
    expect(harness.selection.start).toBe(6);
    expect(harness.selection.end).toBe(cursorLength);

    // Type dash to create bullet list
    await userEvent.keyboard("-");

    // The three lines (one, two, three) should become list items
    // The heading should remain unchanged - this is the bug we're tracking
    expect(harness.engine.getValue()).toBe("# Hello\n- one\n- two\n- three");
  });

  test("creating bullet list should select from start of first list marker", async () => {
    // Document: "# Hello\none\ntwo\nthree"
    // After creating list: "# Hello\n- one\n- two\n- three"
    // Selection should be: "# Hello\n<selstart>- one\n- two\n- three<selend>"
    // NOT: "# Hello\n- <selstart>one\n- two\n- three<selend>"
    harness = createTestHarness("# Hello\none\ntwo\nthree");

    await harness.focus();

    // Select from after heading to end
    harness.engine.selectAll();
    const cursorLength = harness.selection.end;
    harness.engine.setSelection({
      start: 6, // After "Hello\n"
      end: cursorLength,
      affinity: "forward",
    });

    // Type dash to create bullet list
    await userEvent.keyboard("-");

    // Verify the document
    expect(harness.engine.getValue()).toBe("# Hello\n- one\n- two\n- three");

    // Selection should start at the beginning of "- one" line, not after "- ".
    const selectionAfterToggle = { ...harness.selection };

    harness.engine.selectAll();
    const newCursorLength = harness.selection.end;

    // The selection start should be at the beginning of the first list item line
    // which is cursor position 6 (after "Hello" and newline)
    expect(selectionAfterToggle.start).toBe(6);
    expect(selectionAfterToggle.end).toBe(newCursorLength);
  });

  test("creating numbered list should select from start of first list marker", async () => {
    // Document: "# Hello\none\ntwo\nthree"
    // After creating list: "# Hello\n1. one\n2. two\n3. three"
    // Selection should be: "# Hello\n<selstart>1. one\n2. two\n3. three<selend>"
    harness = createTestHarness("# Hello\none\ntwo\nthree");

    await harness.focus();

    // Select from after heading to end
    harness.engine.selectAll();
    const cursorLength = harness.selection.end;
    harness.engine.setSelection({
      start: 6, // After "Hello\n"
      end: cursorLength,
      affinity: "forward",
    });

    // Use Cmd+Shift+7 to create numbered list
    await harness.pressKey("7", modShift);

    // Verify the document
    expect(harness.engine.getValue()).toBe("# Hello\n1. one\n2. two\n3. three");

    // Selection should start at the beginning of "1. one" line
    const selectionAfterToggle = { ...harness.selection };

    harness.engine.selectAll();
    const newCursorLength = harness.selection.end;

    expect(selectionAfterToggle.start).toBe(6);
    expect(selectionAfterToggle.end).toBe(newCursorLength);
  });

  test("removing bullet list should preserve selection over the same content", async () => {
    // Start with a list: "# Hello\n- one\n- two\n- three"
    // Select all list items: "# Hello\n<selstart>- one\n- two\n- three<selend>"
    // After removing list: "# Hello\n<selstart>one\ntwo\nthree<selend>"
    // The selection should still cover "one\ntwo\nthree", NOT "on<selstart>e\ntwo\nthree<selend>"
    harness = createTestHarness("# Hello\n- one\n- two\n- three");

    await harness.focus();

    // Select all list items (from start of "- one" to end)
    harness.engine.selectAll();
    const cursorLength = harness.selection.end;

    // Find where the list starts (after "Hello\n")
    // In "# Hello\n- one\n- two\n- three", cursor position 6 is start of "- one" line
    harness.engine.setSelection({
      start: 6,
      end: cursorLength,
      affinity: "forward",
    });

    // Type dash to remove the list
    await userEvent.keyboard("-");

    // Verify the document - list markers should be removed
    expect(harness.engine.getValue()).toBe("# Hello\none\ntwo\nthree");

    // Selection should cover "one\ntwo\nthree" starting from position 6
    // NOT shifted incorrectly like "on<selstart>e\ntwo\nthree<selend>"
    expect(harness.selection.start).toBe(6);

    // The end should be at the end of the document
    harness.engine.selectAll();
    const newCursorLength = harness.selection.end;
    // Restore our expected selection to check
    harness.engine.setSelection({
      start: 6,
      end: newCursorLength,
      affinity: "forward",
    });
    expect(harness.selection.end).toBe(newCursorLength);
  });

  test("removing numbered list should preserve selection over the same content", async () => {
    // Start with a list: "# Hello\n1. one\n2. two\n3. three"
    // Select all list items
    // After removing list: "# Hello\none\ntwo\nthree"
    // Selection should still cover "one\ntwo\nthree"
    harness = createTestHarness("# Hello\n1. one\n2. two\n3. three");

    await harness.focus();

    // Select all list items
    harness.engine.selectAll();
    const cursorLength = harness.selection.end;
    harness.engine.setSelection({
      start: 6,
      end: cursorLength,
      affinity: "forward",
    });

    // Use Cmd+Shift+7 to remove numbered list
    await harness.pressKey("7", modShift);

    // Verify the document - list markers should be removed
    expect(harness.engine.getValue()).toBe("# Hello\none\ntwo\nthree");

    // Selection should cover "one\ntwo\nthree" starting from position 6
    expect(harness.selection.start).toBe(6);

    harness.engine.selectAll();
    const newCursorLength = harness.selection.end;
    harness.engine.setSelection({
      start: 6,
      end: newCursorLength,
      affinity: "forward",
    });
    expect(harness.selection.end).toBe(newCursorLength);
  });
});

describe("list type conversion", () => {
  let harness: TestHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test("toggle-bullet-list converts numbered list to bullet list", async () => {
    harness = createTestHarness("1. item one\n2. item two\n3. item three");

    await harness.focus();
    // Select all lines
    harness.engine.setSelection({ start: 0, end: 38, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-bullet-list" });

    expect(harness.engine.getValue()).toBe(
      "- item one\n- item two\n- item three",
    );
  });

  test("toggle-numbered-list converts bullet list to numbered list", async () => {
    harness = createTestHarness("- item one\n- item two\n- item three");

    await harness.focus();
    // Select all lines
    harness.engine.setSelection({ start: 0, end: 35, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-numbered-list" });

    expect(harness.engine.getValue()).toBe(
      "1. item one\n2. item two\n3. item three",
    );
  });

  test("toggle-bullet-list on partial numbered list selection converts selected lines", async () => {
    harness = createTestHarness("1. first\n2. second\n3. third");

    await harness.focus();
    // Select only the first two lines: "1. first\n2. second" (18 chars)
    harness.engine.setSelection({ start: 0, end: 18, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-bullet-list" });

    // First two lines should become bullet, third stays numbered but renumbers to 1.
    expect(harness.engine.getValue()).toBe("- first\n- second\n3. third");
  });

  test("toggle-numbered-list on partial bullet list selection converts selected lines", async () => {
    harness = createTestHarness("- first\n- second\n- third");

    await harness.focus();
    // Select only the first two lines
    harness.engine.setSelection({ start: 0, end: 16, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-numbered-list" });

    // First two lines should become numbered, third stays bullet
    expect(harness.engine.getValue()).toBe("1. first\n2. second\n- third");
  });

  test("converting multi-level numbered list to bullet preserves indentation", async () => {
    harness = createTestHarness("1. A\n  1. B\n2. C");

    await harness.focus();
    // Select all
    harness.engine.setSelection({ start: 0, end: 16, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-bullet-list" });

    expect(harness.engine.getValue()).toBe("- A\n  - B\n- C");
  });

  test("converting multi-level bullet list to numbered renumbers correctly", async () => {
    harness = createTestHarness("- A\n  - B\n- C");

    await harness.focus();
    // Select all
    harness.engine.setSelection({ start: 0, end: 13, affinity: "forward" });

    harness.engine.executeCommand({ type: "toggle-numbered-list" });

    expect(harness.engine.getValue()).toBe("1. A\n  1. B\n2. C");
  });
});
