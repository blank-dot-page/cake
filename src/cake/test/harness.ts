import { userEvent } from "vitest/browser";
import { createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CakeEngine } from "../engine/cake-engine";
import type { Selection } from "../core/types";
import type { CakeExtension } from "../core/runtime";
import { bundledExtensions } from "../extensions";
import type { OverlayExtensionContext } from "../extensions/overlay-types";

export interface SelectionRectInfo {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface CaretInfo {
  top: number;
  left: number;
  height: number;
}

export interface TestHarness {
  container: HTMLDivElement;
  contentRoot: HTMLElement;
  engine: CakeEngine;
  selection: Selection;

  // Queries
  getLine(index: number): HTMLElement;
  getLineCount(): number;
  getLineRect(index: number): DOMRect;
  getTextNode(lineIndex?: number): Text;
  getCharRect(offset: number, lineIndex?: number): DOMRect;
  getSelectionRects(): SelectionRectInfo[];
  getCaretRect(): CaretInfo | null;

  // Actions
  clickLeftOf(offset: number, lineIndex?: number): Promise<void>;
  clickRightOf(offset: number, lineIndex?: number): Promise<void>;
  clickAt(offset: number, lineIndex?: number): Promise<void>;
  clickAtCoords(clientX: number, clientY: number): Promise<void>;
  doubleClick(offset: number, lineIndex: number): Promise<void>;
  tripleClick(lineIndex: number): Promise<void>;
  typeText(text: string): Promise<void>;
  pressEnter(): Promise<void>;
  pressBackspace(): Promise<void>;
  pressTab(): Promise<void>;
  pressShiftTab(): Promise<void>;
  pressKey(
    key: string,
    modifiers?: {
      meta?: boolean;
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
    },
  ): Promise<void>;
  focus(): Promise<void>;

  // Cleanup
  destroy(): void;
}

export interface TestHarnessOptions {
  value: string;
  css?: string;
  extensions?: CakeExtension[];
  renderOverlays?: boolean;
}

export function createTestHarness(
  valueOrOptions: string | TestHarnessOptions,
): TestHarness {
  const options =
    typeof valueOrOptions === "string"
      ? { value: valueOrOptions }
      : valueOrOptions;

  const container = document.createElement("div");
  container.style.width = "400px";
  container.style.height = "200px";
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  document.body.appendChild(container);

  let styleElement: HTMLStyleElement | null = null;
  if (options.css) {
    styleElement = document.createElement("style");
    styleElement.textContent = options.css;
    document.head.appendChild(styleElement);
  }

  const extensions = options.extensions ?? bundledExtensions;
  const engine = new CakeEngine({
    container,
    value: options.value,
    selection: { start: 0, end: 0, affinity: "forward" },
    extensions,
  });
  let overlayRoot: Root | null = null;
  if (options.renderOverlays) {
    const overlayContainer = engine.getOverlayRoot();
    const contentRoot = engine.getContentRoot();
    if (!overlayContainer || !contentRoot) {
      throw new Error("Missing overlay root for extensions");
    }
    const overlayContext: OverlayExtensionContext = {
      container,
      contentRoot,
      overlayRoot: overlayContainer,
      toOverlayRect: (rect) => {
        const containerRect = container.getBoundingClientRect();
        return {
          top: rect.top - containerRect.top,
          left: rect.left - containerRect.left,
          width: rect.width,
          height: rect.height,
        };
      },
      insertText: (text) => {
        engine.insertText(text);
      },
      replaceText: (oldText, newText) => {
        engine.replaceText(oldText, newText);
      },
      getSelection: () => {
        const selection = engine.getSelection();
        if (!selection) {
          return null;
        }
        const focus =
          selection.start === selection.end
            ? selection.start
            : Math.max(selection.start, selection.end);
        return { start: focus, end: focus };
      },
    };

    const overlayElements = extensions.flatMap((extension) => {
      if (!extension.renderOverlay) {
        return [];
      }
      const rendered = extension.renderOverlay(overlayContext);
      if (!rendered) {
        return [];
      }
      return [createElement(Fragment, { key: extension.name }, rendered)];
    });
    overlayRoot = createRoot(overlayContainer);
    overlayRoot.render(createElement(Fragment, null, ...overlayElements));
  }

  function getContentRoot(): HTMLElement {
    const root = container.querySelector(".cake-content");
    if (!root || !(root instanceof HTMLElement)) {
      throw new Error("Content root not found");
    }
    return root;
  }

  function getLine(index: number): HTMLElement {
    const line = container.querySelector(`[data-line-index="${index}"]`);
    if (!line || !(line instanceof HTMLElement)) {
      throw new Error(`Line ${index} not found`);
    }
    return line;
  }

  function getLineCount(): number {
    return container.querySelectorAll("[data-line-index]").length;
  }

  function getLineRect(index: number): DOMRect {
    return getLine(index).getBoundingClientRect();
  }

  function getTextNode(lineIndex = 0): Text {
    const line = getLine(lineIndex);
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!node || !(node instanceof Text)) {
      throw new Error(`No text node in line ${lineIndex}`);
    }
    return node;
  }

  function getTextNodes(lineIndex = 0): Text[] {
    const line = getLine(lineIndex);
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null = walker.nextNode();
    while (node) {
      if (node instanceof Text) {
        nodes.push(node);
      }
      node = walker.nextNode();
    }
    return nodes;
  }

  function getCharRect(offset: number, lineIndex = 0): DOMRect {
    const textNodes = getTextNodes(lineIndex);
    if (textNodes.length === 0) {
      throw new Error(`No text nodes in line ${lineIndex}`);
    }

    let remaining = offset;
    for (const textNode of textNodes) {
      const len = textNode.data.length;
      if (remaining < len) {
        const range = document.createRange();
        range.setStart(textNode, remaining);
        range.setEnd(textNode, remaining + 1);
        return range.getBoundingClientRect();
      }
      remaining -= len;
    }

    throw new Error(
      `Offset ${offset} out of bounds for line ${lineIndex} (len=${offset - remaining})`,
    );
  }

  async function clickAtPosition(
    offset: number,
    side: "left" | "right" | "center",
    lineIndex = 0,
  ): Promise<void> {
    const line = getLine(lineIndex);
    const lineRect = line.getBoundingClientRect();
    const charRect = getCharRect(offset, lineIndex);

    let clickX: number;
    if (side === "left") {
      clickX = charRect.left + 1;
    } else if (side === "right") {
      clickX = charRect.right - 1;
    } else {
      clickX = charRect.left + charRect.width / 2;
    }
    const clickY = charRect.top + charRect.height / 2;

    await userEvent.click(line, {
      position: {
        x: clickX - lineRect.left,
        y: clickY - lineRect.top,
      },
    });
  }

  async function doubleClick(offset: number, lineIndex: number): Promise<void> {
    const line = getLine(lineIndex);
    const lineRect = line.getBoundingClientRect();
    const charRect = getCharRect(offset, lineIndex);
    const clickX = charRect.left + charRect.width / 2;
    const clickY = charRect.top + charRect.height / 2;

    await userEvent.dblClick(line, {
      position: {
        x: clickX - lineRect.left,
        y: clickY - lineRect.top,
      },
    });
  }

  async function tripleClick(lineIndex: number): Promise<void> {
    const line = getLine(lineIndex);
    await userEvent.tripleClick(line);
  }

  async function clickAtCoords(
    clientX: number,
    clientY: number,
  ): Promise<void> {
    const contentRoot = getContentRoot();
    const rect = contentRoot.getBoundingClientRect();
    await userEvent.click(contentRoot, {
      position: {
        x: clientX - rect.left,
        y: clientY - rect.top,
      },
    });
  }

  function getSelectionRects(): SelectionRectInfo[] {
    const rects = container.querySelectorAll(".cake-selection-rect");
    return Array.from(rects).map((rect) => {
      const el = rect as HTMLElement;
      return {
        top: parseFloat(el.style.top),
        left: parseFloat(el.style.left),
        width: parseFloat(el.style.width),
        height: parseFloat(el.style.height),
      };
    });
  }

  function getCaretRect(): CaretInfo | null {
    const caret = container.querySelector(".cake-caret") as HTMLElement | null;
    if (!caret) {
      return null;
    }
    return {
      top: parseFloat(caret.style.top),
      left: parseFloat(caret.style.left),
      height: caret.offsetHeight,
    };
  }

  async function typeText(text: string): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
    for (const char of text) {
      const event = new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: char,
      });
      contentRoot.dispatchEvent(event);
    }
  }

  async function focus(): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
  }

  async function pressEnter(): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertParagraph",
    });
    contentRoot.dispatchEvent(event);
  }

  async function pressBackspace(): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "deleteContentBackward",
    });
    contentRoot.dispatchEvent(event);
  }

  async function pressTab(): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      code: "Tab",
    });
    contentRoot.dispatchEvent(event);
  }

  async function pressShiftTab(): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
      code: "Tab",
      shiftKey: true,
    });
    contentRoot.dispatchEvent(event);
  }

  async function pressKey(
    key: string,
    modifiers?: {
      meta?: boolean;
      ctrl?: boolean;
      shift?: boolean;
      alt?: boolean;
    },
  ): Promise<void> {
    const contentRoot = getContentRoot();
    contentRoot.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      metaKey: modifiers?.meta ?? false,
      ctrlKey: modifiers?.ctrl ?? false,
      shiftKey: modifiers?.shift ?? false,
      altKey: modifiers?.alt ?? false,
    });
    contentRoot.dispatchEvent(event);
  }

  function destroy(): void {
    overlayRoot?.unmount();
    engine.destroy();
    container.remove();
    if (styleElement) {
      styleElement.remove();
    }
  }

  return {
    container,
    get contentRoot() {
      return getContentRoot();
    },
    engine,
    get selection() {
      return engine.getSelection();
    },
    getLine,
    getLineCount,
    getLineRect,
    getTextNode,
    getCharRect,
    getSelectionRects,
    getCaretRect,
    clickLeftOf: (offset, lineIndex) =>
      clickAtPosition(offset, "left", lineIndex),
    clickRightOf: (offset, lineIndex) =>
      clickAtPosition(offset, "right", lineIndex),
    clickAt: (offset, lineIndex) =>
      clickAtPosition(offset, "center", lineIndex),
    clickAtCoords,
    doubleClick,
    tripleClick,
    typeText,
    pressEnter,
    pressBackspace,
    pressTab,
    pressShiftTab,
    pressKey,
    focus,
    destroy,
  };
}
