import { afterEach, describe, expect, it } from "vitest";
import { createRuntime } from "../core/runtime";
import { renderDoc } from "./render";
import { applyDomSelection, readDomSelection } from "./dom-selection";

function setSelectionRange(container: Node, start: number, end: number): void {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Missing selection");
  }
  const range = document.createRange();
  range.setStart(container, start);
  range.setEnd(container, end);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe("dom selection", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads element-anchored selections", () => {
    const runtime = createRuntime([]);
    const state = runtime.createState("a");
    const { root, map } = renderDoc(state.doc, runtime.dom);
    document.body.append(root);

    const paragraph = root.querySelector(".cake-line");
    if (!paragraph) {
      throw new Error("Missing paragraph element");
    }

    setSelectionRange(paragraph, 1, 1);
    const selection = readDomSelection(map);

    expect(selection).not.toBeNull();
    expect(selection?.start).toBe(1);
    expect(selection?.end).toBe(1);
  });

  it("reads selections inside empty paragraphs", () => {
    const runtime = createRuntime([]);
    const state = runtime.createState("");
    const { root, map } = renderDoc(state.doc, runtime.dom);
    document.body.append(root);

    const paragraph = root.querySelector(".cake-line");
    if (!paragraph) {
      throw new Error("Missing paragraph element");
    }

    setSelectionRange(paragraph, 0, 0);
    const selection = readDomSelection(map);

    expect(selection).not.toBeNull();
    expect(selection?.start).toBe(0);
    expect(selection?.end).toBe(0);
  });

  it("includes newline when selecting to a line start boundary", () => {
    const runtime = createRuntime([]);
    const state = runtime.createState("First line\nSecond line\nThird line");
    const { root, map } = renderDoc(state.doc, runtime.dom);
    document.body.append(root);

    const paragraphs = root.querySelectorAll(".cake-line");
    if (paragraphs.length < 2) {
      throw new Error("Missing paragraph elements");
    }

    const secondLineNode = findFirstTextNodeIn(paragraphs[1]);
    const secondLineStart = map.cursorAtDom(secondLineNode, 0);
    if (!secondLineStart) {
      throw new Error("Missing cursor position");
    }

    applyDomSelection(
      { start: 0, end: secondLineStart.cursorOffset, affinity: "backward" },
      map,
    );

    const selection = window.getSelection();
    expect(selection?.toString()).toBe("First line\n");
  });
});

function findFirstTextNodeIn(element: Element): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  if (!node || !(node instanceof Text)) {
    throw new Error("Missing text node");
  }
  return node;
}
