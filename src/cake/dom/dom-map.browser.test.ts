import { afterEach, describe, expect, it } from "vitest";
import { createRuntime } from "../core/runtime";
import {
  blockquoteExtension,
  boldExtension,
  linkExtension,
} from "../extensions";
import { renderDoc } from "./render";
import { readDomSelection, applyDomSelection } from "./dom-selection";

function findTextNode(root: HTMLElement, text: string): Text {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const matchText = text.length > 1 ? text[0] : text;
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.textContent?.includes(text)) {
      return current;
    }
    current = walker.nextNode();
  }
  if (matchText !== text) {
    const fallbackWalker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
    );
    let fallback = fallbackWalker.nextNode();
    while (fallback) {
      if (
        fallback instanceof Text &&
        fallback.textContent?.includes(matchText)
      ) {
        return fallback;
      }
      fallback = fallbackWalker.nextNode();
    }
  }
  throw new Error(`Missing text node: ${text}`);
}

function findFirstTextNodeIn(element: Element): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  if (!node || !(node instanceof Text)) {
    throw new Error("Missing text node");
  }
  return node;
}

function findLastTextNodeIn(element: Element): Text {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      last = current;
    }
    current = walker.nextNode();
  }
  if (!last) {
    throw new Error("Missing text node");
  }
  return last;
}

describe("dom map", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("maps cursor offsets for nested blockquote content", () => {
    const runtime = createRuntime([
      blockquoteExtension,
      boldExtension,
      linkExtension,
    ]);
    const source = "> **a** [b](u)";
    const state = runtime.createState(source);

    const { root, map } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    const node = findTextNode(root, "b");
    const cursor = map.cursorAtDom(node, 1);
    expect(cursor?.cursorOffset).toBeGreaterThan(0);

    const domPoint = map.domAtCursor(cursor!.cursorOffset, "forward");
    expect(domPoint?.node.textContent).toContain("b");
  });

  it("roundtrips selection for delete operations", () => {
    const runtime = createRuntime([
      blockquoteExtension,
      boldExtension,
      linkExtension,
    ]);
    const source = "> **a** [b](u)";
    const state = runtime.createState(source);

    const { root, map } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    const node = findTextNode(root, "b");
    const cursor = map.cursorAtDom(node, 1);
    if (!cursor) {
      throw new Error("Missing cursor position");
    }

    applyDomSelection(
      { start: cursor.cursorOffset, end: cursor.cursorOffset },
      map,
    );
    const selection = readDomSelection(map);
    expect(selection).not.toBeNull();

    const nextState = runtime.applyEdit(
      { type: "delete-backward" },
      { ...state, selection: selection! },
    );

    expect(nextState.source).toBe("> **a** ");
  });

  it("distinguishes boundary sides between blocks", () => {
    const runtime = createRuntime([]);
    const state = runtime.createState("one\ntwo");
    const { root, map } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    const paragraphs = root.querySelectorAll("[data-block='paragraph']");
    if (paragraphs.length < 2) {
      throw new Error("Missing paragraph elements");
    }
    const first = findLastTextNodeIn(paragraphs[0]);
    const second = findFirstTextNodeIn(paragraphs[1]);
    const endOfFirst = map.cursorAtDom(first, first.data.length);
    if (!endOfFirst) {
      throw new Error("Missing cursor position");
    }
    const newlineCursor = endOfFirst.cursorOffset + 1;
    const backwardPoint = map.domAtCursor(newlineCursor, "backward");
    const forwardPoint = map.domAtCursor(newlineCursor, "forward");

    expect(backwardPoint?.node).toBe(first);
    expect(backwardPoint?.offset).toBe(first.data.length);
    expect(forwardPoint?.node).toBe(second);
    expect(forwardPoint?.offset).toBe(0);
  });

  it("preserves affinity at text run boundaries", () => {
    // Test with bold formatting: **ab**cd has two text runs
    const runtime = createRuntime([boldExtension]);
    const state = runtime.createState("**ab**cd");
    const { root, map } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    // Find text nodes in the bold span and plain text
    const boldSpan = root.querySelector("strong");
    const boldTextNode = boldSpan ? findFirstTextNodeIn(boldSpan) : null;
    const plainTextNode = findTextNode(root, "cd");

    expect(boldTextNode).not.toBeNull();
    expect(plainTextNode).not.toBeNull();
    expect(boldTextNode).not.toBe(plainTextNode);

    // At end of bold text run (has next run): should be backward
    // to keep caret inside bold formatting context
    const atEndOfBold = map.cursorAtDom(
      boldTextNode!,
      boldTextNode!.data.length,
    );
    expect(atEndOfBold?.affinity).toBe("backward");

    // At start of plain text run (has prev run): should be forward
    // to keep caret in the plain text context
    const atStartOfPlain = map.cursorAtDom(plainTextNode, 0);
    expect(atStartOfPlain?.affinity).toBe("forward");
  });

  it("maps cursor at end of link text to correct position with forward affinity", () => {
    // "hello [world](http://test/)" - cursor 11 is at end of link text
    const runtime = createRuntime([linkExtension]);
    const state = runtime.createState("hello [world](http://test/)");
    const { root, map } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    // Verify cursor length
    expect(state.map.cursorLength).toBe(11);

    // Find the link and its text node
    const link = root.querySelector("a.cake-link");
    expect(link).not.toBeNull();
    const linkTextNode = findFirstTextNodeIn(link!);
    expect(linkTextNode.textContent).toBe("world");

    // Check DOM runs
    expect(map.runs.length).toBe(2);
    expect(map.runs[0].cursorStart).toBe(0);
    expect(map.runs[0].cursorEnd).toBe(6); // "hello "
    expect(map.runs[1].cursorStart).toBe(6);
    expect(map.runs[1].cursorEnd).toBe(11); // "world"

    // Clicking at end of "world" (offset 5 in text node) should give cursor 11
    const atEndOfLink = map.cursorAtDom(linkTextNode, 5);
    expect(atEndOfLink?.cursorOffset).toBe(11);
    // Since there's no next run, affinity should be forward
    expect(atEndOfLink?.affinity).toBe("forward");

    // With forward affinity at cursor 11, inserting should place text AFTER the link
    const sourcePos = state.map.cursorToSource(11, "forward");
    expect(sourcePos).toBe(27); // After the entire link syntax

    // Also verify offset 4 maps to cursor 10 (before 'd')
    const atOffset4 = map.cursorAtDom(linkTextNode, 4);
    expect(atOffset4?.cursorOffset).toBe(10);

    // Verify domAtCursor(11, "forward") returns offset 5 in the text node
    const domPoint = map.domAtCursor(11, "forward");
    expect(domPoint?.node).toBe(linkTextNode);
    expect(domPoint?.offset).toBe(5); // After "world"
  });

  it("cursorAtDom stays fast for large text nodes", () => {
    const runtime = createRuntime([]);
    const source = "a".repeat(24_000);
    const state = runtime.createState(source);
    const { root, map } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    const textNode = findFirstTextNodeIn(root);

    const iterations = 20_000;
    const offset = textNode.data.length;

    // Warm up (helps avoid first-run noise skewing the measurement)
    for (let i = 0; i < 100; i += 1) {
      map.cursorAtDom(textNode, offset);
    }

    let sum = 0;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      sum += map.cursorAtDom(textNode, offset)!.cursorOffset;
    }
    const elapsedMs = performance.now() - start;

    expect(sum).toBe(iterations * offset);
    expect(elapsedMs).toBeLessThan(300);
  });
});
