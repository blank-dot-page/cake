import { afterEach, describe, expect, it } from "vitest";
import { CakeEngine } from "./cake-engine";
import { createTestHarness } from "../test/harness";

type EngineSelection = {
  start: number;
  end: number;
  affinity?: "backward" | "forward";
};

function createSelection(start: number, end: number): EngineSelection {
  return { start, end, affinity: "forward" };
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

function getFirstTextNodeContaining(root: HTMLElement, needle: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node instanceof Text && node.data.includes(needle)) {
      return node;
    }
    node = walker.nextNode();
  }
  throw new Error(`Missing text node containing "${needle}"`);
}

function dispatchInput(
  root: HTMLElement,
  inputType: string,
  data: string | null,
) {
  const inputEvent = new InputEvent("input", {
    inputType,
    data,
    bubbles: true,
    cancelable: false,
  });
  root.dispatchEvent(inputEvent);
}

describe("CakeEngine - Grammarly-like flows (browser)", () => {
  afterEach(() => {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    document.body.innerHTML = "";
  });

  it("reconciles when Grammarly mutates the DOM and fires input insertText (issue #433)", () => {
    const h = createTestHarness("Waht is going on?");

    const textNode = getFirstTextNodeContaining(h.contentRoot, "Waht");
    const idx = textNode.data.indexOf("Waht");
    textNode.data =
      textNode.data.slice(0, idx) + "What" + textNode.data.slice(idx + 4);
    setDomSelection(textNode, idx + 4, idx + 4);

    dispatchInput(h.contentRoot, "insertText", "What");

    expect(h.engine.getValue()).toBe("What is going on?");
    expect(h.getLine(0).textContent ?? "").toBe("What is going on?");
    h.destroy();
  });

  it("reconciles a Grammarly correction inside **bold** text", () => {
    const h = createTestHarness("This is **importent** text");

    const textNode = getFirstTextNodeContaining(h.contentRoot, "importent");
    const idx = textNode.data.indexOf("importent");
    textNode.data =
      textNode.data.slice(0, idx) + "important" + textNode.data.slice(idx + 9);
    setDomSelection(textNode, idx + 9, idx + 9);

    dispatchInput(h.contentRoot, "insertText", "important");

    expect(h.engine.getValue()).toBe("This is **important** text");
    expect(h.contentRoot.querySelector("strong")?.textContent).toBe(
      "important",
    );
    h.destroy();
  });

  it("reconciles a Grammarly correction inside *italic* text with length change", () => {
    const h = createTestHarness("This is *realy* important");

    const textNode = getFirstTextNodeContaining(h.contentRoot, "realy");
    const idx = textNode.data.indexOf("realy");
    textNode.data =
      textNode.data.slice(0, idx) + "really" + textNode.data.slice(idx + 5);
    setDomSelection(textNode, idx + 6, idx + 6);

    dispatchInput(h.contentRoot, "insertText", "really");

    expect(h.engine.getValue()).toBe("This is *really* important");
    expect(h.contentRoot.querySelector("em")?.textContent).toBe("really");
    h.destroy();
  });

  it("reconciles a Grammarly correction inside a header line", () => {
    const h = createTestHarness("# Importent Heading");

    const textNode = getFirstTextNodeContaining(h.contentRoot, "Importent");
    const idx = textNode.data.indexOf("Importent");
    textNode.data =
      textNode.data.slice(0, idx) + "Important" + textNode.data.slice(idx + 9);
    setDomSelection(textNode, idx + 9, idx + 9);

    dispatchInput(h.contentRoot, "insertText", "Important");

    expect(h.engine.getValue()).toBe("# Important Heading");
    expect(h.getLine(0).textContent ?? "").toBe("Important Heading");
    h.destroy();
  });

  it("reconciles a Grammarly correction inside link text and preserves the URL", () => {
    const h = createTestHarness("Check out [teh website](https://example.com)");

    const textNode = getFirstTextNodeContaining(h.contentRoot, "teh");
    const idx = textNode.data.indexOf("teh");
    textNode.data =
      textNode.data.slice(0, idx) + "the" + textNode.data.slice(idx + 3);
    setDomSelection(textNode, idx + 3, idx + 3);

    dispatchInput(h.contentRoot, "insertText", "the");

    expect(h.engine.getValue()).toBe(
      "Check out [the website](https://example.com)",
    );
    expect(h.contentRoot.querySelector("a")).not.toBeNull();
    h.destroy();
  });

  it("does not append text when insertReplacementText targetRanges point outside the editor", () => {
    const container = document.createElement("div");
    container.contentEditable = "true";
    document.body.append(container);

    let lastValue = "The quik brown fox";
    const engine = new CakeEngine({
      container,
      value: lastValue,
      selection: createSelection(0, 0),
      onChange: (value) => {
        lastValue = value;
      },
    });

    const contentRoot = container.querySelector(".cake-content");
    if (!contentRoot || !(contentRoot instanceof HTMLElement)) {
      throw new Error("Missing content root");
    }

    const detachedNode = document.createTextNode("quik");
    const invalidRange = new StaticRange({
      startContainer: detachedNode,
      startOffset: 0,
      endContainer: detachedNode,
      endOffset: 4,
    });

    const beforeInputEvent = new InputEvent("beforeinput", {
      inputType: "insertReplacementText",
      data: "quick",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(beforeInputEvent, "getTargetRanges", {
      value: () => [invalidRange],
    });

    contentRoot.dispatchEvent(beforeInputEvent);

    expect(beforeInputEvent.defaultPrevented).toBe(true);
    expect(lastValue).toBe("The quik brown fox");
    engine.destroy();
  });

  it("preserves blank lines when Grammarly corrects text in the first paragraph", async () => {
    const h = createTestHarness("");
    await h.focus();

    await h.typeText("waht is going on?");
    await h.pressEnter();
    await h.pressEnter();
    await h.typeText("testing one two three");
    await h.pressEnter();
    await h.pressEnter();
    await h.typeText("this issue is solved");

    expect(h.getLineCount()).toBe(5);

    const firstLine = h.getLine(0);
    const textNode = getFirstTextNodeContaining(firstLine, "waht");
    const idx = textNode.data.indexOf("waht");
    textNode.data =
      textNode.data.slice(0, idx) + "What" + textNode.data.slice(idx + 4);
    setDomSelection(textNode, idx + 4, idx + 4);

    dispatchInput(h.contentRoot, "insertText", "What");

    expect(h.getLineCount()).toBe(5);
    expect(h.getLine(0).textContent ?? "").toBe("What is going on?");
    expect(h.getLine(1).textContent ?? "").toBe("");
    expect(h.getLine(2).textContent ?? "").toBe("testing one two three");
    expect(h.getLine(3).textContent ?? "").toBe("");
    expect(h.getLine(4).textContent ?? "").toBe("this issue is solved");

    h.destroy();
  });
});
