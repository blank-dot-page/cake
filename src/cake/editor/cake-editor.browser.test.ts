import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { CakeEditor } from "./cake-editor";
import { createTestHarness, type TestHarness } from "../test/harness";
import { linkExtension } from "../extensions/link/link";
import { plainTextListExtension } from "../extensions/list/list";
import type { CakeExtension } from "../core/runtime";

const isMac =
  typeof navigator !== "undefined" &&
  typeof navigator.platform === "string" &&
  navigator.platform.toLowerCase().includes("mac");

type EngineSelection = {
  start: number;
  end: number;
  affinity?: "backward" | "forward";
};

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.contentEditable = "true";
  document.body.append(container);
  return container;
}

function getFirstTextNode(root: HTMLElement): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  if (!node || !(node instanceof Text)) {
    throw new Error("Missing text node");
  }
  return node;
}

function dispatchSelectionChange() {
  document.dispatchEvent(new Event("selectionchange"));
}

function setDomSelection(node: Node, start: number, end: number) {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Missing selection");
  }
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchSelectionChange();
}

function createSelection(start: number, end: number): EngineSelection {
  return { start, end, affinity: "forward" };
}

const cmdModifier = isMac ? { meta: true } : { ctrl: true };

describe("CakeEditor (browser)", () => {
  afterEach(() => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("Cmd+B then typing stays bold until Cmd+B toggles it off", async () => {
    const h = createTestHarness("");
    await h.focus();

    // Pressing both meta+ctrl makes this test platform-agnostic.
    await h.pressKey("b", { meta: true, ctrl: true });
    await h.typeText("a");
    expect(h.engine.getValue()).toBe("**a**");

    await h.pressKey("b", { meta: true, ctrl: true });
    await h.typeText("b");
    expect(h.engine.getValue()).toBe("**a**b");

    h.destroy();
  });

  it("Cmd+B after plain text enables bold mode and new input is bold", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("hello ");
    await h.pressKey("b", { meta: true, ctrl: true });
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);

    await h.typeText("world");
    expect(h.engine.getValue()).toBe("hello **world**");

    h.destroy();
  });

  it("meta-only Cmd+B after plain text enables bold mode and new input is bold", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("hello ");
    await h.pressKey("b", cmdModifier);
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);

    await h.typeText("world");
    expect(h.engine.getValue()).toBe("hello **world**");

    h.destroy();
  });

  it("Cmd+B on a new line enables bold mode and new input is bold", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("hello");
    await h.pressEnter();
    await h.pressKey("b", { meta: true, ctrl: true });
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);

    await h.typeText("world");
    expect(h.engine.getValue()).toBe("hello\n**world**");

    h.destroy();
  });

  it("Cmd+B on a new line keeps bold active after selectionchange settles", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("hello");
    await h.pressEnter();
    await h.pressKey("b", cmdModifier);
    await new Promise((r) => setTimeout(r, 80));

    expect(h.engine.getActiveMarks()).toEqual(["bold"]);

    h.destroy();
  });

  it("Cmd+I on a new line enables italic mode and new input is italic", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("hello");
    await h.pressEnter();
    await h.pressKey("i", { meta: true, ctrl: true });
    expect(h.engine.getActiveMarks()).toEqual(["italic"]);

    await h.typeText("world");
    expect(h.engine.getValue()).toBe("hello\n*world*");

    h.destroy();
  });

  it("Cmd+B then Cmd+I on a new line enables combined emphasis for new input", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("hello");
    await h.pressEnter();
    await h.pressKey("b", { meta: true, ctrl: true });
    await h.pressKey("i", { meta: true, ctrl: true });
    expect(h.engine.getActiveMarks()).toEqual(["bold", "italic"]);

    await h.typeText("world");
    expect(h.engine.getValue()).toBe("hello\n***world***");

    h.destroy();
  });

  it("selection toggle bold wraps selected text and keeps active mark", async () => {
    const h = createTestHarness("hello\nworld");
    h.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    expect(h.engine.executeCommand({ type: "toggle-bold" })).toBe(true);
    expect(h.engine.getValue()).toBe("hello\n**world**");
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);
    h.destroy();
  });

  it("selection toggle italic wraps selected text and keeps active mark", async () => {
    const h = createTestHarness("hello\nworld");
    h.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    expect(h.engine.executeCommand({ type: "toggle-italic" })).toBe(true);
    expect(h.engine.getValue()).toBe("hello\n*world*");
    expect(h.engine.getActiveMarks()).toEqual(["italic"]);
    h.destroy();
  });

  it("selection toggle bold then italic wraps selected text with both marks", async () => {
    const h = createTestHarness("hello\nworld");
    h.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    expect(h.engine.executeCommand({ type: "toggle-bold" })).toBe(true);
    expect(h.engine.executeCommand({ type: "toggle-italic" })).toBe(true);
    expect(h.engine.getValue()).toBe("hello\n***world***");
    expect(h.engine.getActiveMarks()).toEqual(["bold", "italic"]);
    h.destroy();
  });

  it("link mark is active for caret and full selection inside link text", () => {
    const h = createTestHarness("hello\n[world](https://example.com)");
    h.engine.setSelection({ start: 8, end: 8, affinity: "forward" });
    expect(h.engine.getActiveMarks()).toContain("link");

    h.engine.setSelection({ start: 6, end: 11, affinity: "forward" });
    expect(h.engine.getActiveMarks()).toContain("link");

    h.destroy();
  });

  it("Cmd+Enter inserts a line break", async () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    const h = createTestHarness("hello");
    await h.clickRightOf(4, 0);
    await h.focus();

    // Reported bug: Cmd+Enter does not insert a line break.
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

    expect(h.engine.getValue()).toBe("hello\n");

    h.destroy();
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("does not show placeholder when doc has only wrapped text (e.g. **bold**)", () => {
    const container = createContainer();
    container.dataset.placeholder = "Type here";
    const engine = new CakeEditor({
      container,
      value: "**bold**",
      selection: createSelection(0, 0),
    });

    engine.syncPlaceholder();
    expect(container.querySelector(".cake-placeholder")).toBeNull();

    engine.destroy();
  });

  it("handles beforeinput insertText", () => {
    const container = createContainer();
    let lastValue = "";
    let lastSelection: EngineSelection | null = null;
    const engine = new CakeEditor({
      container,
      value: "",
      onChange: (value, selection) => {
        lastValue = value;
        lastSelection = selection;
      },
    });

    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "a",
    });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lastValue).toBe("a");
    expect(lastSelection).not.toBeNull();
    expect(lastSelection).toEqual(expect.objectContaining({ start: 1 }));
    engine.destroy();
  });

  it("preserves non-managed children injected into the content root (e.g. Grammarly)", () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "",
    });

    const contentRoot = engine.getContentRoot();
    if (!contentRoot) {
      throw new Error("Missing content root");
    }
    const injected = document.createElement("grammarly-extension");
    injected.setAttribute("data-test", "1");
    contentRoot.appendChild(injected);

    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "a",
    });
    container.dispatchEvent(event);

    expect(
      contentRoot.querySelector("grammarly-extension[data-test='1']"),
    ).not.toBeNull();

    engine.destroy();
  });

  it("does not create an extensions overlay root unless requested", () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "",
    });

    expect(container.querySelector(".cake-extension-overlay")).toBeNull();

    engine.destroy();
  });

  it("preserves non-cake siblings in the container across initialization (e.g. Grammarly)", () => {
    const container = createContainer();
    const injected = document.createElement("grammarly-extension");
    injected.setAttribute("data-test", "1");
    container.appendChild(injected);

    const engine = new CakeEditor({
      container,
      value: "",
    });

    expect(
      container.querySelector("grammarly-extension[data-test='1']"),
    ).not.toBeNull();

    engine.destroy();
  });

  it("exposes visible text and selection helpers", () => {
    const h = createTestHarness(
      "Hello **bold** [Link](https://example.com)\nNext",
    );

    expect(h.engine.getText()).toBe("Hello bold Link\nNext");

    h.engine.setTextSelection({ start: 1, end: 3 });
    expect(h.engine.getTextSelection()).toEqual({ start: 1, end: 3 });

    h.destroy();
  });

  it("returns text before/around cursor in visible text space", () => {
    const h = createTestHarness("Hello **world**!!");

    // Place caret after "world"
    h.engine.setTextSelection({ start: 11, end: 11 });

    expect(h.engine.getTextBeforeCursor(5)).toBe("world");
    expect(h.engine.getTextAroundCursor(5, 2)).toEqual({
      before: "world",
      after: "!!",
    });

    h.destroy();
  });

  it("replaces visible text before cursor without touching markdown markers", () => {
    const h = createTestHarness("**bold** world");

    // Caret after "bold"
    h.engine.setTextSelection({ start: 4, end: 4 });
    h.engine.replaceTextBeforeCursor(4, "cool");

    expect(h.engine.getValue()).toBe("**cool** world");
    expect(h.engine.getText()).toBe("cool world");
    expect(h.engine.getTextSelection()).toEqual({ start: 4, end: 4 });

    h.destroy();
  });

  it("handles beforeinput insertReplacementText with targetRanges", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "ab",
      selection: createSelection(0, 0),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const textNode = getFirstTextNode(container);
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 1,
    });
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
      data: "z",
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [targetRange],
    });

    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lastValue).toBe("zb");
    engine.destroy();
  });

  it("handles beforeinput insertReplacementText without targetRanges", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "ab",
      selection: createSelection(1, 1),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
      data: "z",
    });

    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lastValue).toBe("azb");
    engine.destroy();
  });

  it("defers insertReplacementText when beforeinput data is null and reconciles on input", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "ab",
      selection: createSelection(0, 0),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const textNode = getFirstTextNode(container);
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 1,
    });

    const beforeInputEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertReplacementText",
      data: null,
    });
    Object.defineProperty(beforeInputEvent, "getTargetRanges", {
      value: () => [targetRange],
    });

    container.dispatchEvent(beforeInputEvent);
    expect(beforeInputEvent.defaultPrevented).toBe(false);
    expect(lastValue).toBe("");

    // Simulate the browser applying the replacement (e.g. Firefox spellcheck).
    textNode.data = "zb";
    setDomSelection(textNode, 1, 1);
    const inputEvent = new InputEvent("input", {
      bubbles: true,
      inputType: "insertReplacementText",
      data: null,
    });
    container.dispatchEvent(inputEvent);

    expect(lastValue).toBe("zb");
    engine.destroy();
  });

  it("handles insertText with non-collapsed targetRanges as replacement", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "ab",
      selection: createSelection(2, 2),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const textNode = getFirstTextNode(container);
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 1,
    });
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "z",
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [targetRange],
    });

    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lastValue).toBe("zb");
    engine.destroy();
  });

  it("ignores insertText targetRanges when collapsed and inserts at model selection", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "ab",
      selection: createSelection(2, 2),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const textNode = getFirstTextNode(container);
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 0,
    });
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "z",
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [targetRange],
    });

    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lastValue).toBe("abz");
    engine.destroy();
  });

  it("ignores deleteContentBackward targetRanges when selection is collapsed", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "ab",
      selection: createSelection(2, 2),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const textNode = getFirstTextNode(container);
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 1,
    });
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [targetRange],
    });

    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(lastValue).toBe("a");
    engine.destroy();
  });

  it("does not wrap pasted URLs into markdown when link extension is not installed", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: lastValue,
      extensions: [],
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", "example.com");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: dataTransfer,
    });

    contentRoot.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("example.com");
    engine.destroy();
  });

  it("wraps pasted URLs into markdown when link extension is installed", () => {
    const container = createContainer();
    let lastValue = "hello";
    const engine = new CakeEditor({
      container,
      value: lastValue,
      extensions: [linkExtension],
      onChange: (value) => {
        lastValue = value;
      },
    });

    // Select "hello"
    engine.setSelection({ start: 0, end: 5, affinity: "forward" });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", "example.com");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: dataTransfer,
    });

    contentRoot.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("[hello](https://example.com)");
    engine.destroy();
  });

  it("does not handle Ctrl+Shift+8 list toggle when list extension is not installed", () => {
    const container = createContainer();
    let lastValue = "hello";
    const engine = new CakeEditor({
      container,
      value: lastValue,
      extensions: [],
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "8",
      ctrlKey: true,
      shiftKey: true,
    });

    contentRoot.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(lastValue).toBe("hello");
    engine.destroy();
  });

  it("handles Ctrl+Shift+8 list toggle via the list extension", () => {
    const container = createContainer();
    let lastValue = "hello";
    const engine = new CakeEditor({
      container,
      value: lastValue,
      extensions: [plainTextListExtension],
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "8",
      ctrlKey: true,
      shiftKey: true,
    });

    contentRoot.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("- hello");
    engine.destroy();
  });

  it("resolves extension keybinding conflicts by extension order (first match wins)", () => {
    const container = createContainer();
    let lastValue = "";

    const aExtension: CakeExtension = (editor) => {
      editor.registerKeybindings([
        {
          key: "8",
          ctrl: true,
          shift: true,
          command: { type: "insert", text: "A" },
        },
      ]);
    };

    const bExtension: CakeExtension = (editor) => {
      editor.registerKeybindings([
        {
          key: "8",
          ctrl: true,
          shift: true,
          command: { type: "insert", text: "B" },
        },
      ]);
    };

    const engine = new CakeEditor({
      container,
      value: lastValue,
      // "b" is first, so it should win.
      extensions: [bExtension, aExtension],
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "8",
      ctrlKey: true,
      shiftKey: true,
    });

    contentRoot.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("B");
    engine.destroy();
  });

  it("does not prevent default when a keybinding command function returns null", () => {
    const container = createContainer();
    let lastValue = "";

    const nullBindingExtension: CakeExtension = (editor) => {
      editor.registerKeybindings([
        {
          key: "8",
          ctrl: true,
          shift: true,
          command: () => null,
        },
      ]);
    };

    const engine = new CakeEditor({
      container,
      value: lastValue,
      extensions: [nullBindingExtension],
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const keyEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "8",
      ctrlKey: true,
      shiftKey: true,
    });

    contentRoot.dispatchEvent(keyEvent);

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(lastValue).toBe("");
    engine.destroy();
  });

  it("falls back to default paste when onPasteText returns null", () => {
    const container = createContainer();
    let lastValue = "";

    const nullPasteExtension: CakeExtension = (editor) => {
      editor.registerOnPasteText(() => null);
    };

    const engine = new CakeEditor({
      container,
      value: lastValue,
      extensions: [nullPasteExtension],
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot) {
      throw new Error("Missing content root");
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", "hello");
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: dataTransfer,
    });

    contentRoot.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("hello");
    engine.destroy();
  });

  it("prevents default history undo/redo input", () => {
    const container = createContainer();
    let callCount = 0;
    const engine = new CakeEditor({
      container,
      value: "ab",
      onChange: () => {
        callCount += 1;
      },
    });

    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "historyUndo",
    });
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(callCount).toBe(0);
    engine.destroy();
  });

  it("syncs selectionchange inside the editor", async () => {
    const container = createContainer();
    let lastSelection: EngineSelection | null = null;
    const engine = new CakeEditor({
      container,
      value: "ab",
      onSelectionChange: (selection) => {
        lastSelection = selection;
      },
    });

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    const textNode = getFirstTextNode(container);
    setDomSelection(textNode, 1, 1);

    expect(lastSelection).not.toBeNull();
    expect(lastSelection).toEqual(
      expect.objectContaining({ start: 1, end: 1 }),
    );
    engine.destroy();
  });

  it("ignores selectionchange outside the editor", () => {
    const container = createContainer();
    let callCount = 0;
    const engine = new CakeEditor({
      container,
      value: "ab",
      onSelectionChange: () => {
        callCount += 1;
      },
    });

    const outside = document.createElement("div");
    outside.textContent = "outside";
    document.body.append(outside);
    const textNode = getFirstTextNode(outside);
    setDomSelection(textNode, 0, 1);

    expect(callCount).toBe(0);
    engine.destroy();
  });

  it("reconciles DOM text on compositionend", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "a",
      onChange: (value) => {
        lastValue = value;
      },
    });

    container.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    const textNode = getFirstTextNode(container);
    textNode.data = "b";
    container.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );

    expect(lastValue).toBe("b");
    engine.destroy();
  });

  it("reconciles IME composition in a link without breaking markdown", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "[hello](http://localhost:3000/)",
      onChange: (value) => {
        lastValue = value;
      },
    });

    container.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    const link = container.querySelector("a.cake-link");
    expect(link).not.toBeNull();
    const walker = document.createTreeWalker(link!, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    expect(textNode).toBeInstanceOf(Text);
    (textNode as Text).data = "bye";

    container.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );

    expect(lastValue).toBe("[bye](http://localhost:3000/)");
    engine.destroy();
  });

  it("reconciles IME composition at a bold boundary without duplicating markers", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "hello **world**",
      onChange: (value) => {
        lastValue = value;
      },
    });

    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    const walker = document.createTreeWalker(strong!, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    expect(textNode).toBeInstanceOf(Text);

    // Place DOM selection at end of the bold text and simulate an IME insertion.
    setDomSelection(textNode as Text, "world".length, "world".length);
    container.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    (textNode as Text).data = "world!";
    setDomSelection(textNode as Text, "world!".length, "world!".length);
    container.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );

    expect(lastValue).toBe("hello **world!**");
    engine.destroy();
  });

  it("reconciles insertText input that lands after compositionend (dead-key flow)", () => {
    const container = createContainer();
    let lastValue = "";
    let lastSelection: EngineSelection | null = null;
    const engine = new CakeEditor({
      container,
      value: "",
      onChange: (value, selection) => {
        lastValue = value;
        lastSelection = selection;
      },
    });

    container.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    container.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );

    const textNode = getFirstTextNode(container);
    textNode.data = "`";
    setDomSelection(textNode, 1, 1);

    const inputEvent = new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: "`",
    });
    container.dispatchEvent(inputEvent);

    expect(lastValue).toBe("`");
    expect(lastSelection).toEqual(
      expect.objectContaining({ start: 1, end: 1 }),
    );
    expect(engine.getValue()).toBe("`");
    expect(engine.getSelection()).toEqual(
      expect.objectContaining({ start: 1, end: 1 }),
    );

    engine.destroy();
  });

  it("syncs caret on post-composition insertText when text is already reconciled", () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "`",
      selection: createSelection(0, 0),
    });

    const textNode = getFirstTextNode(container);
    setDomSelection(textNode, 1, 1);

    container.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    container.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    );

    // Simulate a stale model selection while DOM caret is already at the end.
    engine.setSelection(createSelection(0, 0));
    setDomSelection(textNode, 1, 1);

    const inputEvent = new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: "`",
    });
    container.dispatchEvent(inputEvent);

    expect(engine.getValue()).toBe("`");
    expect(engine.getSelection()).toEqual(
      expect.objectContaining({ start: 1, end: 1 }),
    );

    engine.destroy();
  });

  it("advances caret across consecutive backtick composition commits", () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "",
    });

    const applyCompositionText = (text: string) => {
      container.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
      const textNode = getFirstTextNode(container);
      textNode.data = text;
      setDomSelection(textNode, text.length, text.length);
      container.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      );
    };

    applyCompositionText("`");
    expect(engine.getValue()).toBe("`");
    expect(engine.getSelection()).toEqual(
      expect.objectContaining({ start: 1, end: 1 }),
    );

    applyCompositionText("``");
    expect(engine.getValue()).toBe("``");
    expect(engine.getSelection()).toEqual(
      expect.objectContaining({ start: 2, end: 2 }),
    );

    applyCompositionText("```");
    expect(engine.getValue()).toBe("```");
    expect(engine.getSelection()).toEqual(
      expect.objectContaining({ start: 3, end: 3 }),
    );

    engine.destroy();
  });

  it("handles consecutive insertText events correctly", () => {
    const container = createContainer();
    let lastValue = "";
    let lastSelection: EngineSelection | null = null;
    const engine = new CakeEditor({
      container,
      value: "",
      onChange: (value, selection) => {
        lastValue = value;
        lastSelection = selection;
      },
    });

    const chars = "abcdef";
    for (const char of chars) {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: char,
      });
      container.dispatchEvent(event);
    }

    expect(lastValue).toBe("abcdef");
    expect(lastSelection).toEqual(
      expect.objectContaining({ start: 6, end: 6 }),
    );
    engine.destroy();
  });

  it("executeCommand toggle-bullet-list adds bullet marker", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "hello",
      selection: createSelection(0, 5),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const result = engine.executeCommand({ type: "toggle-bullet-list" });

    expect(result).toBe(true);
    expect(lastValue).toBe("- hello");
    engine.destroy();
  });

  it("executeCommand toggle-numbered-list adds numbered marker", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "hello",
      selection: createSelection(0, 5),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const result = engine.executeCommand({ type: "toggle-numbered-list" });

    expect(result).toBe(true);
    expect(lastValue).toBe("1. hello");
    engine.destroy();
  });

  it("executeCommand toggle-bullet-list on multiple lines", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "First item\nSecond item\nThird item",
      selection: createSelection(0, 33),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const result = engine.executeCommand({ type: "toggle-bullet-list" });

    expect(result).toBe(true);
    expect(lastValue).toContain("- First item");
    expect(lastValue).toContain("- Second item");
    expect(lastValue).toContain("- Third item");
    engine.destroy();
  });

  it("executeCommand preserves selection when switching between list types", () => {
    const container = createContainer();
    let lastValue = "";
    let lastSelection: { start: number; end: number } | null = null;
    const engine = new CakeEditor({
      container,
      value: "First\nSecond\nThird",
      selection: createSelection(0, 18), // Select all
      onChange: (value, selection) => {
        lastValue = value;
        lastSelection = { start: selection.start, end: selection.end };
      },
    });

    // Toggle to numbered list
    engine.executeCommand({ type: "toggle-numbered-list" });
    expect(lastValue).toBe("1. First\n2. Second\n3. Third");
    // Selection should cover all content
    expect(lastSelection).not.toBeNull();
    expect(lastSelection!.start).toBe(0);
    expect(lastSelection!.end).toBeGreaterThan(0);

    // Toggle to bullet list without re-selecting
    engine.executeCommand({ type: "toggle-bullet-list" });
    expect(lastValue).toBe("- First\n- Second\n- Third");
    // Selection should still be preserved
    expect(lastSelection).not.toBeNull();
    expect(lastSelection!.start).toBe(0);
    expect(lastSelection!.end).toBeGreaterThan(0);

    // Toggle back to numbered list
    engine.executeCommand({ type: "toggle-numbered-list" });
    expect(lastValue).toBe("1. First\n2. Second\n3. Third");
    expect(lastSelection).not.toBeNull();
    expect(lastSelection!.start).toBe(0);

    engine.destroy();
  });

  it("delete range leaves empty line when deleting all content on last line", () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "hello\nworld",
      selection: createSelection(6, 11), // Select "world"
      onChange: (value) => {
        lastValue = value;
      },
    });

    // Execute delete command
    const result = engine.executeCommand({ type: "delete-backward" });

    expect(result).toBe(true);
    expect(lastValue).toBe("hello\n");

    // Check DOM - should have 2 lines (second one empty)
    const lines = container.querySelectorAll("[data-line-index]");
    expect(lines.length).toBe(2);
    expect(lines[0].textContent).toBe("hello");
    expect(lines[1].textContent).toBe("");

    // Check the engine selection is positioned at the start of the second line
    const engineSelection = engine.getSelection();
    expect(engineSelection.start).toBe(6); // After "hello\n"
    expect(engineSelection.end).toBe(6);

    engine.destroy();
  });

  it("drag line to new position", async () => {
    const container = createContainer();
    container.style.width = "400px";
    container.style.height = "200px";
    container.style.position = "absolute";
    container.style.left = "0";
    container.style.top = "0";
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "Line One\nLine Two\nLine Three\nLine Four",
      selection: createSelection(0, 0),
      onChange: (value) => {
        lastValue = value;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Get the line elements
    const lines = container.querySelectorAll("[data-line-index]");
    expect(lines.length).toBe(4);
    const line1 = lines[1] as HTMLElement;
    const line3 = lines[3] as HTMLElement;

    // Simulate triple-click on line1 to select the full line
    const line1Box = line1.getBoundingClientRect();
    const tripleClickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: line1Box.left + line1Box.width / 2,
      clientY: line1Box.top + line1Box.height / 2,
      detail: 3, // Triple click
    });
    line1.dispatchEvent(tripleClickEvent);

    // Wait for selection to be applied
    await new Promise((r) => setTimeout(r, 100));

    // Verify the selection covers a range
    const sel = engine.getSelection();
    expect(sel.start).toBeLessThan(sel.end);

    // Get bounding box for line3
    const line3Box = line3.getBoundingClientRect();

    // Simulate pointerdown on line1 (inside the selection)
    const pointerDownEvent = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: line1Box.left + line1Box.width / 2,
      clientY: line1Box.top + line1Box.height / 2,
      button: 0,
      pointerId: 1,
    });
    container.dispatchEvent(pointerDownEvent);

    // Simulate pointermove to line3
    const pointerMoveEvent = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: line3Box.left + line3Box.width / 2,
      clientY: line3Box.top + line3Box.height + 5,
      button: 0,
      pointerId: 1,
    });
    container.dispatchEvent(pointerMoveEvent);

    // Simulate pointerup
    const pointerUpEvent = new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      clientX: line3Box.left + line3Box.width / 2,
      clientY: line3Box.top + line3Box.height + 5,
      button: 0,
      pointerId: 1,
    });
    container.dispatchEvent(pointerUpEvent);

    // Wait for state update
    await new Promise((r) => setTimeout(r, 50));

    // After drag: Line Two should be at the end (after Line Four)
    // Expected order: Line One, Line Three, Line Four, Line Two
    const expectedValue = "Line One\nLine Three\nLine Four\nLine Two";
    expect(lastValue).toBe(expectedValue);

    engine.destroy();
  });

  it("undo restores content after deleteByCut beforeinput", async () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "hello\nworld",
      selection: createSelection(6, 11), // Select "world"
      onChange: (value) => {
        lastValue = value;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Get the text node for "world" to use in targetRanges
    const lines = container.querySelectorAll("[data-line-index]");
    expect(lines.length).toBe(2);
    const line1 = lines[1] as HTMLElement;
    const textNode = line1.querySelector("span")?.firstChild as Text;
    expect(textNode).toBeInstanceOf(Text);
    expect(textNode.data).toBe("world");

    // Create a targetRange that selects "world"
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 5,
    });

    // Fire deleteByCut beforeinput (simulating Cmd+X cut)
    const cutEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteByCut",
    });
    cutEvent.getTargetRanges = () => [targetRange];
    container.dispatchEvent(cutEvent);

    expect(cutEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("hello\n");

    // Now simulate Cmd+Z keydown for undo
    const undoKeydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: isMac,
      ctrlKey: !isMac,
    });
    container.dispatchEvent(undoKeydown);

    // Should restore "hello\nworld"
    expect(lastValue).toBe("hello\nworld");
    expect(engine.getValue()).toBe("hello\nworld");

    engine.destroy();
  });

  it("undo restores content after text insertion then cut", async () => {
    const container = createContainer();
    let lastValue = "";
    const engine = new CakeEditor({
      container,
      value: "",
      selection: createSelection(0, 0),
      onChange: (value) => {
        lastValue = value;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Simulate typing "hello\nworld" via beforeinput events
    // This more closely matches what Playwright's insertText does
    const insertEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: "hello\nworld",
    });
    container.dispatchEvent(insertEvent);

    expect(lastValue).toBe("hello\nworld");
    expect(engine.getValue()).toBe("hello\nworld");

    // Wait a bit to ensure grouping timer has passed
    await new Promise((r) => setTimeout(r, 350));

    // Now select "world" and cut it
    engine.setSelection({ start: 6, end: 11, affinity: "forward" });

    // Wait for selection to be applied
    await new Promise((r) => setTimeout(r, 50));

    // Get the text node for "world" to use in targetRanges
    const lines = container.querySelectorAll("[data-line-index]");
    const line1 = lines[1] as HTMLElement;
    const textNode = line1.querySelector("span")?.firstChild as Text;

    // Create a targetRange that selects "world"
    const targetRange = new StaticRange({
      startContainer: textNode,
      startOffset: 0,
      endContainer: textNode,
      endOffset: 5,
    });

    // Fire deleteByCut beforeinput (simulating Cmd+X cut)
    const cutEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteByCut",
    });
    cutEvent.getTargetRanges = () => [targetRange];
    container.dispatchEvent(cutEvent);

    expect(cutEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("hello\n");

    // Now simulate Cmd+Z keydown for undo
    const undoKeydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: isMac,
      ctrlKey: !isMac,
    });
    container.dispatchEvent(undoKeydown);

    // Should restore "hello\nworld"
    expect(lastValue).toBe("hello\nworld");
    expect(engine.getValue()).toBe("hello\nworld");

    engine.destroy();
  });

  it("clicking at end of text places cursor at end", async () => {
    const container = createContainer();
    let lastSelection: EngineSelection = { start: 0, end: 0 };
    const engine = new CakeEditor({
      container,
      value: "hello",
      selection: createSelection(0, 0),
      onSelectionChange: (selection) => {
        lastSelection = selection;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Find the text node
    const textNode = getFirstTextNode(container);
    expect(textNode.textContent).toBe("hello");

    // Get the bounding box of the last character
    const range = document.createRange();
    range.setStart(textNode, 4); // 'o' character
    range.setEnd(textNode, 5);
    const charRect = range.getBoundingClientRect();

    // Click 2px from the right edge of the last character
    const clickX = charRect.right - 2;
    const clickY = charRect.top + charRect.height / 2;

    // Simulate pointerdown
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY,
      button: 0,
      pointerId: 1,
    });
    container.dispatchEvent(pointerDown);

    // Simulate click
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY,
      detail: 1,
    });
    container.dispatchEvent(click);

    // Wait for selection to be applied
    await new Promise((r) => setTimeout(r, 50));

    // Cursor should be at position 5 (end of "hello")
    expect(lastSelection.start).toBe(5);
    expect(lastSelection.end).toBe(5);

    engine.destroy();
  });

  it("clicking at end of bold text places cursor at end", async () => {
    const container = createContainer();
    let lastSelection: EngineSelection = { start: 0, end: 0 };
    const engine = new CakeEditor({
      container,
      value: "**Hello** world",
      selection: createSelection(0, 0),
      onSelectionChange: (selection) => {
        lastSelection = selection;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Find all text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let worldNode: Text | null = null;
    let node = walker.nextNode();
    while (node) {
      if (node instanceof Text && node.textContent?.includes("world")) {
        worldNode = node;
        break;
      }
      node = walker.nextNode();
    }
    expect(worldNode).not.toBeNull();
    expect(worldNode!.textContent).toBe(" world");

    // Get the bounding box of the last character ('d' in " world")
    const range = document.createRange();
    range.setStart(worldNode!, 5); // 'd' character (index 5 in " world")
    range.setEnd(worldNode!, 6);
    const charRect = range.getBoundingClientRect();

    // Click 2px from the right edge of the last character
    const clickX = charRect.right - 2;
    const clickY = charRect.top + charRect.height / 2;

    // Simulate pointerdown
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY,
      button: 0,
      pointerId: 1,
    });
    container.dispatchEvent(pointerDown);

    // Simulate click
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY,
      detail: 1,
    });
    container.dispatchEvent(click);

    // Wait for selection to be applied
    await new Promise((r) => setTimeout(r, 50));

    // "Hello" = 5 cursors, " world" = 6 cursors, total = 11
    // Cursor should be at position 11 (end of "Hello world")
    expect(lastSelection.start).toBe(11);
    expect(lastSelection.end).toBe(11);

    engine.destroy();
  });

  it("clicking on link element bounding box right edge places cursor at end", async () => {
    const container = createContainer();
    let lastSelection: EngineSelection = { start: 0, end: 0 };
    const engine = new CakeEditor({
      container,
      value: "hello [world](http://test/)",
      selection: createSelection(0, 0),
      onSelectionChange: (selection) => {
        lastSelection = selection;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Find the link element (simulating what the E2E test does)
    const link = container.querySelector("a.cake-link");
    expect(link).not.toBeNull();
    const box = link!.getBoundingClientRect();

    // Click 2px from the right edge of the link's bounding box
    // This is what the E2E test does
    const clickX = box.x + box.width - 2;
    const clickY = box.y + box.height / 2;

    // Simulate pointerdown
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY,
      button: 0,
      pointerId: 1,
    });
    container.dispatchEvent(pointerDown);

    // Simulate click
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: clickX,
      clientY: clickY,
      detail: 1,
    });
    container.dispatchEvent(click);

    // Wait for selection to be applied
    await new Promise((r) => setTimeout(r, 50));

    // "hello " = 6 cursors, "world" = 5 cursors, total = 11
    // Cursor should be at position 11 (end of link text)
    expect(lastSelection.start).toBe(11);
    expect(lastSelection.end).toBe(11);
    expect(lastSelection.affinity).toBe("forward");

    engine.destroy();
  });

  it("drag heading line via synthetic DragEvent moves the line", async () => {
    const container = createContainer();
    container.style.padding = "10px";
    container.style.width = "400px";

    let lastValue = "# Title\nBody text";
    const engine = new CakeEditor({
      container,
      value: lastValue,
      onChange: (value) => {
        lastValue = value;
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Find heading and paragraph lines
    const headingLine = container.querySelector('[data-line-index="0"]');
    const paragraphLine = container.querySelector('[data-line-index="1"]');
    expect(headingLine).not.toBeNull();
    expect(paragraphLine).not.toBeNull();

    const contentRoot = container.querySelector(".cake-content");
    expect(contentRoot).not.toBeNull();

    // Simulate triple-click to select the heading line
    // First set up the selection via the DOM API
    const headingText = headingLine!.querySelector("span")?.firstChild as Text;
    if (headingText) {
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(headingText, 0);
      range.setEnd(headingText, headingText.length);
      selection.removeAllRanges();
      selection.addRange(range);
      dispatchSelectionChange();
    }

    // Wait for selection to sync
    await new Promise((r) => setTimeout(r, 50));

    // Now dispatch drag events (similar to E2E test)
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("text/plain", window.getSelection()?.toString() ?? "");

    const dragStart = new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    contentRoot!.dispatchEvent(dragStart);

    const rect = paragraphLine!.getBoundingClientRect();
    const dropEvent = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
      clientX: rect.right - 2,
      clientY: rect.top + rect.height / 2,
    });
    contentRoot!.dispatchEvent(dropEvent);

    const dragEnd = new DragEvent("dragend", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    });
    contentRoot!.dispatchEvent(dragEnd);

    // Wait for changes to propagate
    await new Promise((r) => setTimeout(r, 100));

    // After drag, source should have "Body text" before "# Title"
    expect(lastValue).toBe("Body text\n# Title");

    engine.destroy();
  });

  it("getActiveMarks returns active marks at cursor position", async () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "**bold** *italic* ***both*** normal",
      selection: createSelection(0, 0),
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    // Test 1: Cursor in bold text
    engine.setSelection({ start: 3, end: 3 }); // Inside "bold"
    expect(engine.getActiveMarks()).toEqual(["bold"]);

    // Test 2: Cursor in italic text
    engine.setSelection({ start: 8, end: 8 }); // Inside "italic" (at 'l')
    expect(engine.getActiveMarks()).toEqual(["italic"]);

    // Test 3: Cursor in text with both bold and italic
    engine.setSelection({ start: 14, end: 14 }); // Inside "both" (at 't')
    expect(engine.getActiveMarks()).toEqual(["bold", "italic"]);

    // Test 4: Cursor in normal text
    engine.setSelection({ start: 19, end: 19 }); // Inside "normal" (at 'r')
    expect(engine.getActiveMarks()).toEqual([]);

    // Test 5: Selection fully inside a single mark
    engine.setSelection({ start: 1, end: 4 }); // Select "old" inside "**bold**"
    expect(engine.getActiveMarks()).toEqual(["bold"]);

    // Test 6: Selection fully covering a marked span
    engine.setSelection({ start: 0, end: 4 }); // Select entire "bold"
    expect(engine.getActiveMarks()).toEqual(["bold"]);

    // Test 7: Selection spanning multiple marks
    engine.setSelection({ start: 3, end: 8 }); // From "bold" to "italic"
    expect(engine.getActiveMarks()).toEqual([]);

    // Note: Boundary behavior (positions 0 and 4) is complex and depends on affinity
    // The main functionality works for positions clearly inside marks

    engine.destroy();
  });

  it("getActiveMarks keeps pending mark at placeholder on new line regardless of affinity", async () => {
    const h = createTestHarness("hello\n**\u200B**");
    h.engine.setSelection({ start: 6, end: 6, affinity: "forward" });
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);
    h.engine.setSelection({ start: 6, end: 6, affinity: "backward" });
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);
    h.engine.setSelection({ start: 6, end: 6 });
    expect(h.engine.getActiveMarks()).toEqual(["bold"]);
    h.destroy();
  });

  it("getActiveMarks on large ranged selection does not rescan per cursor unit", async () => {
    const paragraphs: string[] = [];
    let word = 0;
    for (let paragraphIndex = 0; paragraphIndex < 10; paragraphIndex += 1) {
      const words: string[] = [];
      for (let i = 0; i < 50; i += 1) {
        words.push(`w${word++}`);
      }
      if (paragraphIndex === 9) {
        words.unshift("targetstart");
      }
      paragraphs.push(words.join(" "));
    }
    const value = paragraphs.join("\n\n");

    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value,
      selection: createSelection(0, 0),
    });

    await new Promise((r) => setTimeout(r, 50));

    const targetStart = value.indexOf("targetstart");
    const targetEnd = value.length;
    engine.setSelection({
      start: targetStart,
      end: targetEnd,
      affinity: "forward",
    });

    const originalSegment = Intl.Segmenter.prototype.segment;
    let segmentCalls = 0;
    Object.defineProperty(Intl.Segmenter.prototype, "segment", {
      configurable: true,
      writable: true,
      value: function (...args: Parameters<typeof originalSegment>) {
        segmentCalls += 1;
        return originalSegment.apply(this, args);
      },
    });

    let marks: string[] = [];
    try {
      marks = engine.getActiveMarks();
    } finally {
      Object.defineProperty(Intl.Segmenter.prototype, "segment", {
        configurable: true,
        writable: true,
        value: originalSegment,
      });
    }

    expect(marks).toEqual([]);
    // One-pass traversal should only segment each text run once or a handful
    // of times, rather than once per selected cursor unit.
    expect(segmentCalls).toBeLessThan(50);

    engine.destroy();
  });
});

describe("CakeEditor Cmd+Backspace then backspace", () => {
  let harness: TestHarness | null = null;
  const originalPlatform = navigator.platform;

  beforeEach(() => {
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
  });

  afterEach(() => {
    harness?.destroy();
    harness = null;
    Object.defineProperty(navigator, "platform", {
      value: originalPlatform,
      configurable: true,
    });
  });

  it("Cmd+Backspace deletes line content, then backspace merges with previous line", async () => {
    harness = createTestHarness("line one\nline two");

    await harness.focus();

    // Position cursor at end of second line
    harness.engine.setSelection({ start: 17, end: 17, affinity: "forward" });

    // Press Cmd+Backspace to delete entire second line content
    await harness.pressKey("Backspace", { meta: true });

    // Assert: first line intact, second line empty, cursor at start of second line
    expect(harness.engine.getValue()).toBe("line one\n");
    expect(harness.selection.start).toBe(9);
    expect(harness.selection.end).toBe(9);

    // Wait for microtask to reset the keydownHandledBeforeInput flag
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    // Press backspace to merge empty line with previous
    await harness.pressBackspace();

    // Assert: only first line remains, cursor at end
    expect(harness.engine.getValue()).toBe("line one");
    expect(harness.selection.start).toBe(8);
    expect(harness.selection.end).toBe(8);
  });

  it("backspace at start of empty trailing line merges with previous", async () => {
    // Start directly with the state we want to test
    harness = createTestHarness("line one\n");

    await harness.focus();

    // Position cursor at start of empty second line
    harness.engine.setSelection({ start: 9, end: 9, affinity: "forward" });

    // Press backspace
    await harness.pressBackspace();

    // Assert: empty line is deleted, cursor at end of first line
    expect(harness.engine.getValue()).toBe("line one");
    expect(harness.selection.start).toBe(8);
    expect(harness.selection.end).toBe(8);
  });

  it("typing after emoji inserts text correctly", async () => {
    harness = createTestHarness("");

    await harness.focus();

    // Type emoji
    await harness.typeText("👋");

    // Verify emoji was inserted and selection is after it
    expect(harness.engine.getValue()).toBe("👋");
    // Emoji is 2 code units, cursor length should reflect that
    const selectionAfterEmoji = harness.selection;
    expect(selectionAfterEmoji.start).toBe(selectionAfterEmoji.end); // Cursor should be collapsed

    // Type more text after emoji
    await harness.typeText("hello");

    // Assert: text should be emoji followed by hello
    expect(harness.engine.getValue()).toBe("👋hello");
  });
});

describe("Selection replacement with headings", () => {
  let harness: TestHarness;

  afterEach(() => {
    harness?.destroy();
  });

  it("selecting all text including heading and typing replaces the selection", async () => {
    // Initial value: heading + paragraph (like the demo default)
    harness = createTestHarness("# Cake Demo\n\nTry bold.");
    await harness.focus();

    // Select all
    await harness.pressKey("a", { meta: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify we have a non-collapsed selection starting at 0
    expect(harness.selection.start).toBe(0);
    expect(harness.selection.end).toBeGreaterThan(0);

    // Type replacement text
    await harness.typeText("replaced");
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should replace all content with new text
    expect(harness.engine.getValue()).toBe("replaced");
  });

  it("selecting heading text and typing replaces the text but keeps heading marker", async () => {
    harness = createTestHarness("# Hello World");
    await harness.focus();

    // Select all (cursor positions only, not source-only prefix)
    await harness.pressKey("a", { meta: true });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Type replacement
    await harness.typeText("new text");
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should replace the text but keep heading marker
    // (The "# " prefix is source-only and not part of cursor positions)
    expect(harness.engine.getValue()).toBe("# new text");
  });

  it("selecting partial heading content and typing replaces selection", async () => {
    harness = createTestHarness("# Hello");
    await harness.focus();

    // Select "llo" (cursor positions 2-5 in heading content "Hello")
    // "# Hello" has cursor positions 0-4 for "Hello" (5 chars)
    // Position 2 is after "He", position 5 is after "Hello"
    harness.engine.setSelection({ start: 2, end: 5 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Type replacement
    await harness.typeText("y");
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should keep heading marker and replace selected text
    expect(harness.engine.getValue()).toBe("# Hey");
  });
});

describe("Touch/Mobile selection support", () => {
  afterEach(() => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  function createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    container.contentEditable = "true";
    document.body.append(container);
    return container;
  }

  function dispatchSelectionChange() {
    document.dispatchEvent(new Event("selectionchange"));
  }

  function setDomSelection(node: Node, start: number, end: number) {
    const selection = window.getSelection();
    if (!selection) {
      throw new Error("Missing selection");
    }
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    selection.removeAllRanges();
    selection.addRange(range);
    dispatchSelectionChange();
  }

  function getFirstTextNode(root: HTMLElement): Text {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!node || !(node instanceof Text)) {
      throw new Error("Missing text node");
    }
    return node;
  }

  it("touch tap places caret at tapped position", async () => {
    const container = createContainer();
    let lastSelection: { start: number; end: number } | null = null;
    const engine = new CakeEditor({
      container,
      value: "hello world",
      selection: { start: 0, end: 0, affinity: "forward" },
      onSelectionChange: (selection) => {
        lastSelection = { start: selection.start, end: selection.end };
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    const textNode = getFirstTextNode(container);
    const range = document.createRange();
    range.setStart(textNode, 5); // Position after "hello"
    range.setEnd(textNode, 5);
    const rect = range.getBoundingClientRect();

    // Simulate a touch tap with pointerType="touch"
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left,
      clientY: rect.top + 5,
      button: 0,
      pointerId: 1,
      pointerType: "touch",
    });
    container.dispatchEvent(pointerDown);

    // Simulate native selection being set (browser behavior on touch)
    setDomSelection(textNode, 5, 5);

    // Wait for events to process
    await new Promise((r) => setTimeout(r, 100));

    // The caret should be at position 5 (after "hello")
    expect(lastSelection).not.toBeNull();
    expect(lastSelection!.start).toBe(5);
    expect(lastSelection!.end).toBe(5);

    engine.destroy();
  });

  it("touch drag creates selection", async () => {
    const container = createContainer();
    let lastSelection: { start: number; end: number } | null = null;
    const engine = new CakeEditor({
      container,
      value: "hello world",
      selection: { start: 0, end: 0, affinity: "forward" },
      onSelectionChange: (selection) => {
        lastSelection = { start: selection.start, end: selection.end };
      },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    const textNode = getFirstTextNode(container);

    // Simulate native selection being set via touch drag (browser handles this)
    setDomSelection(textNode, 0, 5); // Select "hello"

    // Wait for events to process
    await new Promise((r) => setTimeout(r, 100));

    // The selection should be 0-5
    expect(lastSelection).not.toBeNull();
    expect(lastSelection!.start).toBe(0);
    expect(lastSelection!.end).toBe(5);

    engine.destroy();
  });

  it("does not prevent default on touch pointerdown", async () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "hello",
      selection: { start: 0, end: 0, affinity: "forward" },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    const textNode = getFirstTextNode(container);
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.setEnd(textNode, 2);
    const rect = range.getBoundingClientRect();

    // Simulate a touch pointerdown
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left,
      clientY: rect.top + 5,
      button: 0,
      pointerId: 1,
      pointerType: "touch",
    });
    container.dispatchEvent(pointerDown);

    // Touch pointerdown should NOT prevent default (allow native selection)
    expect(pointerDown.defaultPrevented).toBe(false);

    engine.destroy();
  });

  it("hides custom caret overlay during touch interaction", async () => {
    const container = createContainer();
    const engine = new CakeEditor({
      container,
      value: "hello",
      selection: { start: 0, end: 0, affinity: "forward" },
    });

    // Wait for render
    await new Promise((r) => setTimeout(r, 50));

    const textNode = getFirstTextNode(container);
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.setEnd(textNode, 2);
    const rect = range.getBoundingClientRect();

    // Simulate a touch pointerdown
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left,
      clientY: rect.top + 5,
      button: 0,
      pointerId: 1,
      pointerType: "touch",
    });
    container.dispatchEvent(pointerDown);

    // Simulate native selection
    setDomSelection(textNode, 2, 2);

    // Wait for events to process
    await new Promise((r) => setTimeout(r, 100));

    // Custom caret should be hidden when in touch mode
    const caret = container.querySelector(".cake-caret") as HTMLElement | null;
    expect(caret?.style.display).toBe("none");

    engine.destroy();
  });
});
