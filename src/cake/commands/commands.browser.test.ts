import { describe, test, expect, afterEach } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

/**
 * Tests for semantic commands defined by extensions.
 *
 * The goal is to have callers use semantic commands like:
 * - { type: "toggle-bold" }
 * - { type: "toggle-italic" }
 * - { type: "toggle-heading", level: 1 }
 *
 * NOT syntax-specific commands like:
 * - { type: "toggle-inline", marker: "**" }
 */
describe("semantic commands", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
  });

  describe("toggle-bold", () => {
    test("wraps selected text in bold", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      // Select "hello"
      await h.doubleClick(0, 0);

      // Use semantic command
      const result = h.engine.executeCommand({ type: "toggle-bold" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("**hello** world");
    });

    test("removes bold from already bold text", async () => {
      h = createTestHarness("**hello** world");
      await h.focus();
      // Select "hello"
      await h.doubleClick(0, 0);

      const result = h.engine.executeCommand({ type: "toggle-bold" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("hello world");
    });

    test("inserts bold placeholder at cursor with no selection", async () => {
      h = createTestHarness("hello");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({ type: "toggle-bold" });

      expect(result).toBe(true);
      // Should have inserted **placeholder** or similar
      const value = h.engine.getValue();
      expect(value).toContain("**");
    });
  });

  describe("toggle-italic", () => {
    test("wraps selected text in italic", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.doubleClick(0, 0);

      const result = h.engine.executeCommand({ type: "toggle-italic" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("*hello* world");
    });

    test("removes italic from already italic text", async () => {
      h = createTestHarness("*hello* world");
      await h.focus();
      await h.doubleClick(0, 0);

      const result = h.engine.executeCommand({ type: "toggle-italic" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("hello world");
    });
  });

  describe("toggle-strikethrough", () => {
    test("wraps selected text in strikethrough", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.doubleClick(0, 0);

      const result = h.engine.executeCommand({ type: "toggle-strikethrough" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("~~hello~~ world");
    });

    test("removes strikethrough from already struck text", async () => {
      h = createTestHarness("~~hello~~ world");
      await h.focus();
      await h.doubleClick(0, 0);

      const result = h.engine.executeCommand({ type: "toggle-strikethrough" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("hello world");
    });
  });

  describe("toggle-blockquote", () => {
    test("converts paragraph to blockquote", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({ type: "toggle-blockquote" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("> hello world");
      expect(h.container.querySelector("blockquote")).not.toBeNull();
    });

    test("removes blockquote when already quoted", async () => {
      h = createTestHarness("> hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({ type: "toggle-blockquote" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("hello world");
      expect(h.container.querySelector("blockquote")).toBeNull();
    });

    test("converts empty line to blockquote", async () => {
      h = createTestHarness("");
      await h.focus();

      const result = h.engine.executeCommand({ type: "toggle-blockquote" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("> ");
    });
  });

  describe("toggle-heading", () => {
    test("converts paragraph to heading level 1", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({
        type: "toggle-heading",
        level: 1,
      });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("# hello world");
      expect(h.getLine(0).classList.contains("is-heading-1")).toBe(true);
    });

    test("converts paragraph to heading level 2", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({
        type: "toggle-heading",
        level: 2,
      });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("## hello world");
      expect(h.getLine(0).classList.contains("is-heading-2")).toBe(true);
    });

    test("converts paragraph to heading level 3", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({
        type: "toggle-heading",
        level: 3,
      });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("### hello world");
      expect(h.getLine(0).classList.contains("is-heading-3")).toBe(true);
    });

    test("removes heading when already at that level", async () => {
      h = createTestHarness("# hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({
        type: "toggle-heading",
        level: 1,
      });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("hello world");
      expect(h.getLine(0).classList.contains("is-heading")).toBe(false);
    });

    test("changes heading level when at different level", async () => {
      h = createTestHarness("# hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({
        type: "toggle-heading",
        level: 2,
      });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("## hello world");
      expect(h.getLine(0).classList.contains("is-heading-2")).toBe(true);
    });

    test("defaults to level 1 when level not specified", async () => {
      h = createTestHarness("hello world");
      await h.focus();
      await h.clickAt(2, 0);

      const result = h.engine.executeCommand({ type: "toggle-heading" });

      expect(result).toBe(true);
      expect(h.engine.getValue()).toBe("# hello world");
    });
  });
});

describe("focus restoration", () => {
  let h: TestHarness;
  let toolbar: HTMLDivElement;

  afterEach(() => {
    h?.destroy();
    toolbar?.remove();
  });

  test("selection persists after executeCommand", async () => {
    h = createTestHarness("hello world");
    await h.focus();
    // Select "hello"
    await h.doubleClick(0, 0);

    // Execute command
    h.engine.executeCommand({ type: "toggle-bold" });

    // Selection should still be present (though offsets may change due to markers)
    const selectionAfter = h.engine.getSelection();
    // Selection should be a range, not collapsed
    expect(selectionAfter.start).not.toBe(selectionAfter.end);
  });

  test("can chain multiple formatting commands on same selection", async () => {
    h = createTestHarness("hello world");
    await h.focus();
    // Select "hello"
    await h.doubleClick(0, 0);

    // Apply bold
    h.engine.executeCommand({ type: "toggle-bold" });
    // Apply italic on the same (now bold) selection
    h.engine.executeCommand({ type: "toggle-italic" });

    // Should have both bold and italic
    const value = h.engine.getValue();
    expect(value).toContain("***hello***");
  });

  test("editor remains focused after executeCommand", async () => {
    h = createTestHarness("hello world");
    await h.focus();
    await h.doubleClick(0, 0);

    h.engine.executeCommand({ type: "toggle-bold" });

    // Check that content root is the active element
    expect(document.activeElement).toBe(h.contentRoot);
  });

  test("selection rects are visible after executeCommand", async () => {
    h = createTestHarness("hello world");
    await h.focus();
    // Select "hello"
    await h.doubleClick(0, 0);

    h.engine.executeCommand({ type: "toggle-bold" });

    // Selection overlay should still be visible
    const rects = h.getSelectionRects();
    expect(rects.length).toBeGreaterThan(0);
  });

  /**
   * REAL TOOLBAR SCENARIO: clicking a button outside the editor steals focus,
   * then we execute a command. This is what actually happens in a real toolbar.
   */
  test("clicking toolbar button then executing command preserves selection", async () => {
    h = createTestHarness("hello world");

    // Create a toolbar button outside the editor
    toolbar = document.createElement("div");
    toolbar.style.position = "absolute";
    toolbar.style.top = "250px"; // Below the editor
    const boldButton = document.createElement("button");
    boldButton.textContent = "Bold";
    toolbar.appendChild(boldButton);
    document.body.appendChild(toolbar);

    await h.focus();
    // Select "hello"
    await h.doubleClick(0, 0);

    // Verify selection is there
    const selBefore = h.engine.getSelection();
    expect(selBefore.start).toBe(0);
    expect(selBefore.end).toBe(5);

    // Click the toolbar button - this steals focus from the editor
    boldButton.focus();
    boldButton.click();

    // Now the editor is NOT focused
    expect(document.activeElement).toBe(boldButton);

    // Execute the command (like a real toolbar would)
    h.engine.executeCommand({ type: "toggle-bold" });

    // The command should have worked on the previously selected text
    expect(h.engine.getValue()).toBe("**hello** world");
  });

  test("clicking toolbar button then executing command, then refocusing shows selection", async () => {
    h = createTestHarness("hello world");

    // Create a toolbar button outside the editor
    toolbar = document.createElement("div");
    toolbar.style.position = "absolute";
    toolbar.style.top = "250px";
    const boldButton = document.createElement("button");
    boldButton.textContent = "Bold";
    toolbar.appendChild(boldButton);
    document.body.appendChild(toolbar);

    await h.focus();
    await h.doubleClick(0, 0);

    // Click toolbar - steals focus
    boldButton.focus();
    boldButton.click();

    // Execute command
    h.engine.executeCommand({ type: "toggle-bold" });

    // Refocus editor
    h.contentRoot.focus();

    // Selection should be visible and text still selected
    const sel = h.engine.getSelection();
    expect(sel.start).not.toBe(sel.end); // Should still have a range selection
    expect(h.getSelectionRects().length).toBeGreaterThan(0);
  });

  test("can immediately type after toolbar click + command to replace selected text", async () => {
    h = createTestHarness("hello world");

    toolbar = document.createElement("div");
    toolbar.style.position = "absolute";
    toolbar.style.top = "250px";
    const boldButton = document.createElement("button");
    boldButton.textContent = "Bold";
    toolbar.appendChild(boldButton);
    document.body.appendChild(toolbar);

    await h.focus();
    await h.doubleClick(0, 0); // Select "hello"

    // Click toolbar
    boldButton.focus();
    boldButton.click();

    // Execute bold
    h.engine.executeCommand({ type: "toggle-bold" });

    // Refocus and type - should replace the selected "hello"
    await h.focus();
    await h.typeText("hi");

    // "hello" should be replaced with "hi" (in bold)
    expect(h.engine.getValue()).toBe("**hi** world");
  });

  test("executeCommand with restoreFocus: true refocuses editor after toolbar click", async () => {
    h = createTestHarness("hello world");

    toolbar = document.createElement("div");
    toolbar.style.position = "absolute";
    toolbar.style.top = "250px";
    const boldButton = document.createElement("button");
    boldButton.textContent = "Bold";
    toolbar.appendChild(boldButton);
    document.body.appendChild(toolbar);

    await h.focus();
    await h.doubleClick(0, 0); // Select "hello"

    // Click toolbar - steals focus
    boldButton.focus();
    boldButton.click();
    expect(document.activeElement).toBe(boldButton);

    // Execute with restoreFocus option
    h.engine.executeCommand({ type: "toggle-bold" }, { restoreFocus: true });

    // Editor should be refocused
    expect(document.activeElement).toBe(h.contentRoot);
    // Selection should still be there
    const sel = h.engine.getSelection();
    expect(sel.start).not.toBe(sel.end);
  });

  test("executeCommand with restoreFocus: false (default) does not refocus", async () => {
    h = createTestHarness("hello world");

    toolbar = document.createElement("div");
    toolbar.style.position = "absolute";
    toolbar.style.top = "250px";
    const boldButton = document.createElement("button");
    boldButton.textContent = "Bold";
    toolbar.appendChild(boldButton);
    document.body.appendChild(toolbar);

    await h.focus();
    await h.doubleClick(0, 0);

    boldButton.focus();
    boldButton.click();

    // Execute without restoreFocus (default behavior)
    h.engine.executeCommand({ type: "toggle-bold" });

    // Focus should stay on button
    expect(document.activeElement).toBe(boldButton);
  });
});

describe("heading trigger (autoformat)", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
  });

  test("typing '# ' at start of line creates heading", async () => {
    h = createTestHarness("");
    await h.focus();
    await h.typeText("#");
    await h.typeText(" ");

    expect(h.engine.getValue()).toBe("# ");
    expect(h.getLine(0).classList.contains("is-heading")).toBe(true);
    expect(h.getLine(0).classList.contains("is-heading-1")).toBe(true);
  });

  test("typing '## ' at start of line creates h2 heading", async () => {
    h = createTestHarness("");
    await h.focus();
    await h.typeText("#");
    await h.typeText("#");
    await h.typeText(" ");

    expect(h.engine.getValue()).toBe("## ");
    expect(h.getLine(0).classList.contains("is-heading")).toBe(true);
    expect(h.getLine(0).classList.contains("is-heading-2")).toBe(true);
  });

  test("typing '### ' at start of line creates h3 heading", async () => {
    h = createTestHarness("");
    await h.focus();
    await h.typeText("#");
    await h.typeText("#");
    await h.typeText("#");
    await h.typeText(" ");

    expect(h.engine.getValue()).toBe("### ");
    expect(h.getLine(0).classList.contains("is-heading")).toBe(true);
    expect(h.getLine(0).classList.contains("is-heading-3")).toBe(true);
  });

  test("typing '# ' on new line after content creates heading", async () => {
    h = createTestHarness("some content");
    await h.focus();
    // Click at end of content
    await h.clickRightOf(11, 0); // after "t" in "content"
    await h.pressEnter();

    await h.typeText("#");
    await h.typeText(" ");

    expect(h.engine.getValue()).toBe("some content\n# ");
    expect(h.getLine(1).classList.contains("is-heading")).toBe(true);
  });

  test("typing heading text after trigger shows the text", async () => {
    h = createTestHarness("");
    await h.focus();
    await h.typeText("#");
    await h.typeText(" ");
    await h.typeText("Hello");

    expect(h.engine.getValue()).toBe("# Hello");
    expect(h.getLine(0).textContent).toBe("Hello");
  });
});
