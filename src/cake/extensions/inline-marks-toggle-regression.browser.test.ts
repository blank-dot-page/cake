import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "../test/harness";

const mod =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac")
    ? { meta: true }
    : { ctrl: true };

describe("Inline mark toggling regression - asterisks leak into visible text", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("cmd+b, type 'bold', cmd+i multiple times should not leak asterisks", async () => {
    // Reproduce the bug:
    // 1. Start with empty doc
    // 2. cmd+b, type 'bold'
    // 3. Press cmd+i multiple times (3-4 times)
    // 4. Result: visible text becomes 'bold**' - asterisks leak into visible text

    h = createTestHarness("");
    await h.focus();

    // Step 1: Enable bold
    await h.pressKey("b", mod);

    // Step 2: Type 'bold'
    await h.typeText("bold");

    // Verify we have bold text
    const valueAfterTyping = h.engine.getValue();
    expect(valueAfterTyping).toBe("**bold**");
    expect(h.getLine(0).textContent).toBe("bold");

    // Step 3: Toggle italic multiple times
    await h.pressKey("i", mod);
    await h.pressKey("i", mod);
    await h.pressKey("i", mod);

    // Step 4: Verify no asterisks leak into visible text
    const visibleText = h.getLine(0).textContent ?? "";

    // The visible text should be "bold" possibly followed by a ZWS placeholder
    // (which is expected when a formatting state is pending), but NEVER asterisks
    expect(visibleText.replace(/\u200B/g, "")).toBe("bold");
    expect(visibleText).not.toContain("*");

    // Also verify the source doesn't have malformed markdown
    const value = h.engine.getValue();
    // Source should be well-formed - either **bold** or possibly with italic markers
    // but NOT have sequences like **bold**** or asterisks after the text
    expect(value).not.toMatch(/bold\*{2,}$/);
  });

  it("cmd+i, type 'italic', cmd+b multiple times should not leak asterisks", async () => {
    h = createTestHarness("");
    await h.focus();

    // Enable italic
    await h.pressKey("i", mod);

    // Type 'italic'
    await h.typeText("italic");

    // Verify we have italic text
    expect(h.engine.getValue()).toBe("*italic*");
    expect(h.getLine(0).textContent).toBe("italic");

    // Toggle bold multiple times
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);

    // Verify no asterisks leak into visible text
    const visibleText = h.getLine(0).textContent ?? "";
    // Visible text should be "italic" possibly followed by a ZWS placeholder
    expect(visibleText.replace(/\u200B/g, "")).toBe("italic");
    expect(visibleText).not.toContain("*");
  });

  it("toggling same mark multiple times after typing should not corrupt document", async () => {
    h = createTestHarness("");
    await h.focus();

    // Enable bold
    await h.pressKey("b", mod);

    // Type text
    await h.typeText("test");

    // Toggle bold off and on multiple times
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);

    // Visible text should just be 'test'
    expect(h.getLine(0).textContent).toBe("test");
  });

  it("mixed bold/italic toggles without typing should return to clean state", async () => {
    h = createTestHarness("");
    await h.focus();

    // Toggle bold
    await h.pressKey("b", mod);
    // Toggle italic
    await h.pressKey("i", mod);
    // Toggle bold off
    await h.pressKey("b", mod);
    // Toggle italic off
    await h.pressKey("i", mod);

    // Document should be empty or just a ZWS placeholder
    const value = h.engine.getValue();
    expect(value.replace(/\u200B/g, "")).toBe("");
    const visibleText = h.getLine(0).textContent ?? "";
    expect(visibleText.replace(/\u200B/g, "")).toBe("");
    expect(visibleText).not.toContain("*");
  });

  it("toggling italic at end of bold text should not corrupt", async () => {
    h = createTestHarness("**bold**");
    await h.focus();

    // Move cursor to end (after 'bold')
    h.engine.selectAll();
    const cursorEnd = h.selection.end;
    h.engine.setSelection({ start: cursorEnd, end: cursorEnd, affinity: "forward" });

    // Toggle italic multiple times at the end of bold text
    await h.pressKey("i", mod);
    await h.pressKey("i", mod);
    await h.pressKey("i", mod);

    // Visible text should be 'bold' (possibly with ZWS placeholder)
    const visibleText = h.getLine(0).textContent ?? "";
    expect(visibleText.replace(/\u200B/g, "")).toBe("bold");
    expect(visibleText).not.toContain("*");
  });

  it("consecutive mark toggles at cursor boundary should be idempotent", async () => {
    h = createTestHarness("normal");
    await h.focus();

    // Move to end of text
    h.engine.selectAll();
    const cursorEnd = h.selection.end;
    h.engine.setSelection({ start: cursorEnd, end: cursorEnd, affinity: "forward" });

    // Toggle bold on/off/on/off
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);

    // Document should be back to original
    expect(h.engine.getValue()).toBe("normal");
    expect(h.getLine(0).textContent).toBe("normal");
  });
});

describe("Edge cases for mark toggling", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("toggling at start of formatted region", async () => {
    h = createTestHarness("**bold text**");
    await h.focus();

    // Position cursor at start of bold text (cursor position 0)
    h.engine.setSelection({ start: 0, end: 0, affinity: "forward" });

    // Toggle italic
    await h.pressKey("i", mod);

    // Visible text should be 'bold text' (possibly with ZWS placeholder)
    const visibleText = h.getLine(0).textContent ?? "";
    expect(visibleText.replace(/\u200B/g, "")).toBe("bold text");
    expect(visibleText).not.toContain("*");
  });

  it("toggling at end of formatted region", async () => {
    h = createTestHarness("**bold text**");
    await h.focus();

    // Position cursor at end
    h.engine.selectAll();
    const cursorEnd = h.selection.end;
    h.engine.setSelection({ start: cursorEnd, end: cursorEnd, affinity: "backward" });

    // Toggle italic
    await h.pressKey("i", mod);

    // Should not corrupt visible text
    const visibleText = h.getLine(0).textContent ?? "";
    // Should not contain raw asterisks
    expect(visibleText).not.toContain("*");
  });

  it("toggling with mixed marks (italic inside bold)", async () => {
    // Use italic inside bold since the parser handles this correctly
    h = createTestHarness("**bold *italic* text**");
    await h.focus();

    // Position cursor inside 'italic'
    h.engine.setSelection({ start: 8, end: 8, affinity: "forward" });

    // Toggle italic off
    await h.pressKey("i", mod);

    // Visible text should not have raw asterisks (ZWS is OK for pending format)
    const visibleText = h.getLine(0).textContent ?? "";
    expect(visibleText).not.toContain("*");
  });

  it("cursor at boundary between formatted and unformatted text", async () => {
    h = createTestHarness("plain**bold**plain");
    await h.focus();

    // Position at the boundary (after 'plain', before bold)
    h.engine.setSelection({ start: 5, end: 5, affinity: "forward" });

    // Toggle bold multiple times
    await h.pressKey("b", mod);
    await h.pressKey("b", mod);

    // Should not corrupt
    const visibleText = h.getLine(0).textContent ?? "";
    expect(visibleText).not.toMatch(/\*{2,}/);
  });
});

describe("Fuzz-like testing for mark toggling", () => {
  let h: TestHarness;

  afterEach(() => {
    h?.destroy();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("cmd+i then many cmd+b should not leak asterisks", async () => {
    h = createTestHarness("");
    await h.focus();

    // cmd+i once
    await h.pressKey("i", mod);

    // cmd+b 10 times
    for (let i = 0; i < 10; i++) {
      await h.pressKey("b", mod);
      const visibleText = h.getLine(0).textContent ?? "";
      expect(visibleText).not.toContain("*");
    }
  });

  it("cmd+b then many cmd+i should not leak asterisks", async () => {
    h = createTestHarness("");
    await h.focus();

    // cmd+b once
    await h.pressKey("b", mod);

    // cmd+i 10 times
    for (let i = 0; i < 10; i++) {
      await h.pressKey("i", mod);
      const visibleText = h.getLine(0).textContent ?? "";
      expect(visibleText).not.toContain("*");
    }
  });

  it("alternating cmd+i and cmd+b should not leak asterisks", async () => {
    h = createTestHarness("");
    await h.focus();

    // Alternate between i and b 12 times
    for (let i = 0; i < 12; i++) {
      const key = i % 2 === 0 ? "i" : "b";
      await h.pressKey(key, mod);
      const visibleText = h.getLine(0).textContent ?? "";
      expect(visibleText).not.toContain("*");
    }
  });

  it("alternating cmd+b and cmd+i should not leak asterisks", async () => {
    h = createTestHarness("");
    await h.focus();

    // Alternate between b and i 12 times
    for (let i = 0; i < 12; i++) {
      const key = i % 2 === 0 ? "b" : "i";
      await h.pressKey(key, mod);
      const visibleText = h.getLine(0).textContent ?? "";
      expect(visibleText).not.toContain("*");
    }
  });

  it("random toggle sequences with typing should not leak asterisks", async () => {
    const testCases = [
      // [operations, expectedTextWithoutZWS]
      [["b", "type:x", "i", "i", "i"], "x"],
      [["i", "type:y", "b", "b", "b"], "y"],
      [["b", "type:a", "b", "type:b"], "ab"],
      [["b", "type:test", "i", "b", "i"], "test"],
    ];

    for (const [ops, expected] of testCases) {
      h?.destroy();
      h = createTestHarness("");
      await h.focus();

      for (const op of ops) {
        if (op === "b") {
          await h.pressKey("b", mod);
        } else if (op === "i") {
          await h.pressKey("i", mod);
        } else if (op.startsWith("type:")) {
          await h.typeText(op.slice(5));
        }
      }

      const visibleText = h.getLine(0).textContent ?? "";
      const textWithoutZWS = visibleText.replace(/\u200B/g, "");

      // Core invariant: visible text should never contain raw asterisks
      expect(visibleText).not.toContain("*");

      // Secondary check: text content should match expected
      expect(textWithoutZWS).toBe(expected);
    }
  });

  it("toggle on/off cycles should be idempotent for visible text", async () => {
    // Starting states to test
    const startStates = [
      "",
      "plain",
      "**bold**",
      "*italic*",
      "**bold *italic* text**",
    ];

    for (const startState of startStates) {
      h?.destroy();
      h = createTestHarness(startState);
      await h.focus();

      // Move to end
      h.engine.selectAll();
      const end = h.selection.end;
      h.engine.setSelection({ start: end, end: end, affinity: "forward" });

      const initialVisible = (h.getLine(0).textContent ?? "").replace(
        /\u200B/g,
        "",
      );

      // Toggle bold on/off 4 times (should return to roughly original state)
      await h.pressKey("b", mod);
      await h.pressKey("b", mod);
      await h.pressKey("b", mod);
      await h.pressKey("b", mod);

      const afterBoldToggle = (h.getLine(0).textContent ?? "").replace(
        /\u200B/g,
        "",
      );
      expect(afterBoldToggle).toBe(initialVisible);

      // Toggle italic on/off 4 times
      await h.pressKey("i", mod);
      await h.pressKey("i", mod);
      await h.pressKey("i", mod);
      await h.pressKey("i", mod);

      const afterItalicToggle = (h.getLine(0).textContent ?? "").replace(
        /\u200B/g,
        "",
      );
      expect(afterItalicToggle).toBe(initialVisible);
    }
  });

  it("re-toggling link after bold+italic+strikethrough+link removes link cleanly", async () => {
    h = createTestHarness("hello world");
    await h.focus();

    // Select "world"
    h.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    expect(h.engine.executeCommand({ type: "toggle-bold" })).toBe(true);
    expect(h.engine.executeCommand({ type: "toggle-italic" })).toBe(true);
    expect(h.engine.executeCommand({ type: "toggle-strikethrough" })).toBe(
      true,
    );
    expect(
      h.engine.executeCommand({
        type: "wrap-link",
        url: "https://example.com",
      }),
    ).toBe(true);

    // Re-toggling link should remove link while keeping other formatting.
    h.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    expect(
      h.engine.executeCommand({
        type: "wrap-link",
        url: "https://example.com",
      }),
    ).toBe(true);

    const visibleText = h.getLine(0).textContent ?? "";
    expect(visibleText.replace(/\u200B/g, "")).toBe("hello world");
    expect(visibleText).not.toContain("[");
    expect(visibleText).not.toContain("](");
    expect(visibleText).not.toContain(")");

    const source = h.engine.getValue();
    expect(source).not.toContain("](");
    expect(source).toContain("world");
  });
});

describe("Formatting matrix: apply/unapply order invariants", () => {
  let h: TestHarness;

  const TARGET_TEXT = "hello world";
  const TARGET_WORD = "world";
  const TARGET_START = 6;
  const TARGET_END = 11;
  const LINK_URL = "https://example.com";

  type FormatKind = "bold" | "italic" | "strikethrough" | "link";

  const FORMAT_KINDS: FormatKind[] = [
    "bold",
    "italic",
    "strikethrough",
    "link",
  ];

  afterEach(() => {
    h?.destroy();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) {
      return [items.slice()];
    }
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += 1) {
      const picked = items[i];
      const rest = [...items.slice(0, i), ...items.slice(i + 1)];
      for (const tail of permutations(rest)) {
        result.push([picked, ...tail]);
      }
    }
    return result;
  }

  function selectWord() {
    h.engine.setSelection({
      start: TARGET_START,
      end: TARGET_END,
      affinity: "forward",
    });
  }

  function toggleFormat(kind: FormatKind) {
    selectWord();

    if (kind === "bold") {
      expect(h.engine.executeCommand({ type: "toggle-bold" })).toBe(true);
      return;
    }
    if (kind === "italic") {
      expect(h.engine.executeCommand({ type: "toggle-italic" })).toBe(true);
      return;
    }
    if (kind === "strikethrough") {
      expect(h.engine.executeCommand({ type: "toggle-strikethrough" })).toBe(
        true,
      );
      return;
    }
    expect(
      h.engine.executeCommand({
        type: "wrap-link",
        url: LINK_URL,
      }),
    ).toBe(true);
  }

  function normalizeSource(source: string): string {
    return source
      .replace(/\u200B/g, "")
      .replace(/\[([^\]]*)\]\(https:\/\/example\.com\)/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/~~/g, "");
  }

  function assertState(active: Set<FormatKind>, phase: string) {
    const line = h.getLine(0);
    const visible = line.textContent ?? "";
    const visibleNoPlaceholder = visible.replace(/\u200B/g, "");
    if (visibleNoPlaceholder !== TARGET_TEXT) {
      throw new Error(
        `Visible text mismatch at ${phase}: visible=${JSON.stringify(
          visible,
        )} source=${JSON.stringify(h.engine.getValue())}`,
      );
    }
    expect(visibleNoPlaceholder).toBe(TARGET_TEXT);
    expect(visible).not.toContain("[");
    expect(visible).not.toContain("](");

    const source = h.engine.getValue();
    expect(normalizeSource(source)).toBe(TARGET_TEXT);

    const sourceLinks =
      source.match(/\[[^\]]*\]\(https:\/\/example\.com\)/g) ?? [];
    if (active.has("link")) {
      expect(sourceLinks).toHaveLength(1);
      const link = line.querySelector("a.cake-link");
      expect(link).not.toBeNull();
      expect((link?.textContent ?? "").replace(/\u200B/g, "")).toContain(
        TARGET_WORD,
      );
    } else {
      expect(sourceLinks).toHaveLength(0);
      expect(source).not.toContain("](");
      expect(line.querySelector("a.cake-link")).toBeNull();
    }

    if (active.has("bold")) {
      expect(line.querySelector("strong")).not.toBeNull();
    } else {
      expect(line.querySelector("strong")).toBeNull();
    }

    if (active.has("italic")) {
      expect(line.querySelector("em")).not.toBeNull();
    } else {
      expect(line.querySelector("em")).toBeNull();
    }

    if (active.has("strikethrough")) {
      expect(line.querySelector("s")).not.toBeNull();
    } else {
      expect(line.querySelector("s")).toBeNull();
    }
  }

  const applyOrders = permutations(FORMAT_KINDS);
  for (const applyOrder of applyOrders) {
    const applyLabel = applyOrder.join(" -> ");
    const unapplyOrders: Array<{ label: string; order: FormatKind[] }> = [
      { label: "same-order", order: [...applyOrder] },
      { label: "reverse-order", order: [...applyOrder].reverse() },
    ];

    for (const unapply of unapplyOrders) {
      it(`apply [${applyLabel}] then unapply [${unapply.label}] keeps source and DOM coherent`, async () => {
        h = createTestHarness(TARGET_TEXT);
        await h.focus();

        const active = new Set<FormatKind>();
        assertState(active, "initial");

        for (const kind of applyOrder) {
          toggleFormat(kind);
          active.add(kind);
          assertState(active, `after apply ${kind}`);
        }

        for (const kind of unapply.order) {
          toggleFormat(kind);
          active.delete(kind);
          assertState(active, `after unapply ${kind}`);
        }

        expect(h.engine.getValue()).toBe(TARGET_TEXT);
      });
    }
  }
});
