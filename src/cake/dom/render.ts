import type { Block, Doc, Inline } from "../core/types";
import type { CakeExtension } from "../core/runtime";
import type { DomRenderContext } from "./types";
import {
  createDomMap,
  createTextRun as createTextRunBase,
  type TextRun,
} from "./dom-map";

export type RenderResult = {
  root: HTMLElement;
  map: ReturnType<typeof createDomMap>;
};

export type RenderContentResult = {
  content: Node[];
  map: ReturnType<typeof createDomMap>;
};

function normalizeNodes(result: Node | Node[] | null): Node[] {
  if (!result) {
    return [];
  }
  return Array.isArray(result) ? result : [result];
}

export function renderDocContent(
  doc: Doc,
  extensions: CakeExtension[],
  _root?: HTMLElement,
): RenderContentResult {
  const runs: TextRun[] = [];
  let cursorOffset = 0;
  let lineIndex = 0;

  function createTextRun(node: Text): TextRun {
    const run = createTextRunBase(node, cursorOffset);
    cursorOffset = run.cursorEnd;
    runs.push(run);
    return run;
  }

  const context: DomRenderContext = {
    renderInline,
    renderBlock,
    renderBlocks,
    createTextRun,
    getLineIndex: () => lineIndex,
    incrementLineIndex: () => {
      lineIndex += 1;
    },
  };

  function renderInline(inline: Inline): Node[] {
    for (const extension of extensions) {
      const render = extension.renderInline;
      if (!render) {
        continue;
      }
      const result = render(inline, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (inline.type === "text") {
      const element = document.createElement("span");
      element.className = "cake-text";
      const node = document.createTextNode(inline.text);
      createTextRun(node);
      element.append(node);
      return [element];
    }

    if (inline.type === "inline-wrapper") {
      const element = document.createElement("span");
      element.setAttribute("data-inline", inline.kind);
      for (const child of inline.children) {
        for (const node of renderInline(child)) {
          element.append(node);
        }
      }
      return [element];
    }

    if (inline.type === "inline-atom") {
      const element = document.createElement("span");
      element.setAttribute("data-inline-atom", inline.kind);
      const node = document.createTextNode(" ");
      createTextRun(node);
      element.append(node);
      return [element];
    }

    return [];
  }

  function renderBlock(block: Block): Node[] {
    for (const extension of extensions) {
      const render = extension.renderBlock;
      if (!render) {
        continue;
      }
      const result = render(block, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (block.type === "paragraph") {
      const element = document.createElement("div");
      element.setAttribute("data-block", "paragraph");
      element.setAttribute("data-line-index", String(context.getLineIndex()));
      element.classList.add("cake-line");
      element.dataset.lineKind = "paragraph";
      context.incrementLineIndex();
      if (block.content.length === 0) {
        // Use <br> to maintain line height for empty lines (like v1)
        // Also create an empty text node for cursor positioning
        const textNode = document.createTextNode("");
        createTextRun(textNode);
        element.append(textNode);
        element.append(document.createElement("br"));
      } else {
        const mergedContent = mergeInlineForRender(block.content);
        for (const inline of mergedContent) {
          for (const node of renderInline(inline)) {
            element.append(node);
          }
        }
      }
      return [element];
    }

    if (block.type === "block-wrapper") {
      const element = document.createElement("div");
      element.setAttribute("data-block-wrapper", block.kind);
      for (const node of renderBlocks(block.blocks)) {
        element.append(node);
      }
      return [element];
    }

    if (block.type === "block-atom") {
      const element = document.createElement("div");
      element.setAttribute("data-block-atom", block.kind);
      element.setAttribute("data-line-index", String(context.getLineIndex()));
      element.classList.add("cake-line");
      context.incrementLineIndex();
      return [element];
    }

    return [];
  }

  function renderBlocks(blocks: Block[]): Node[] {
    const nodes: Node[] = [];
    blocks.forEach((block, index) => {
      nodes.push(...renderBlock(block));
      if (index < blocks.length - 1) {
        cursorOffset += 1;
      }
    });
    return nodes;
  }

  const contentNodes: Node[] = [];
  for (const node of renderBlocks(doc.blocks)) {
    contentNodes.push(node);
  }

  return { content: contentNodes, map: createDomMap(runs) };
}

export function renderDoc(
  doc: Doc,
  extensions: CakeExtension[],
): RenderResult {
  const root = document.createElement("div");
  root.className = "cake-content";
  root.setAttribute("contenteditable", "true");

  const runs: TextRun[] = [];
  let cursorOffset = 0;
  let lineIndex = 0;

  function createTextRun(node: Text): TextRun {
    const run = createTextRunBase(node, cursorOffset);
    cursorOffset = run.cursorEnd;
    runs.push(run);
    return run;
  }

  const context: DomRenderContext = {
    renderInline,
    renderBlock,
    renderBlocks,
    createTextRun,
    getLineIndex: () => lineIndex,
    incrementLineIndex: () => {
      lineIndex += 1;
    },
  };

  function renderInline(inline: Inline): Node[] {
    for (const extension of extensions) {
      const render = extension.renderInline;
      if (!render) {
        continue;
      }
      const result = render(inline, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (inline.type === "text") {
      const element = document.createElement("span");
      element.className = "cake-text";
      const node = document.createTextNode(inline.text);
      createTextRun(node);
      element.append(node);
      return [element];
    }

    if (inline.type === "inline-wrapper") {
      const element = document.createElement("span");
      element.setAttribute("data-inline", inline.kind);
      for (const child of inline.children) {
        for (const node of renderInline(child)) {
          element.append(node);
        }
      }
      return [element];
    }

    if (inline.type === "inline-atom") {
      const element = document.createElement("span");
      element.setAttribute("data-inline-atom", inline.kind);
      const node = document.createTextNode(" ");
      createTextRun(node);
      element.append(node);
      return [element];
    }

    return [];
  }

  function renderBlock(block: Block): Node[] {
    for (const extension of extensions) {
      const render = extension.renderBlock;
      if (!render) {
        continue;
      }
      const result = render(block, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (block.type === "paragraph") {
      const element = document.createElement("div");
      element.setAttribute("data-block", "paragraph");
      element.setAttribute("data-line-index", String(context.getLineIndex()));
      element.classList.add("cake-line");
      element.dataset.lineKind = "paragraph";
      context.incrementLineIndex();
      if (block.content.length === 0) {
        // Use <br> to maintain line height for empty lines (like v1)
        // Also create an empty text node for cursor positioning
        const textNode = document.createTextNode("");
        createTextRun(textNode);
        element.append(textNode);
        element.append(document.createElement("br"));
      } else {
        const mergedContent = mergeInlineForRender(block.content);
        for (const inline of mergedContent) {
          for (const node of renderInline(inline)) {
            element.append(node);
          }
        }
      }
      return [element];
    }

    if (block.type === "block-wrapper") {
      const element = document.createElement("div");
      element.setAttribute("data-block-wrapper", block.kind);
      for (const node of renderBlocks(block.blocks)) {
        element.append(node);
      }
      return [element];
    }

    if (block.type === "block-atom") {
      const element = document.createElement("div");
      element.setAttribute("data-block-atom", block.kind);
      element.setAttribute("data-line-index", String(context.getLineIndex()));
      element.classList.add("cake-line");
      context.incrementLineIndex();
      return [element];
    }

    return [];
  }

  function renderBlocks(blocks: Block[]): Node[] {
    const nodes: Node[] = [];
    blocks.forEach((block, index) => {
      nodes.push(...renderBlock(block));
      if (index < blocks.length - 1) {
        cursorOffset += 1;
      }
    });
    return nodes;
  }

  for (const node of renderBlocks(doc.blocks)) {
    root.append(node);
  }

  return { root, map: createDomMap(runs) };
}

export function mergeInlineForRender(inlines: Inline[]): Inline[] {
  const merged: Inline[] = [];
  let buffer = "";

  const flushText = () => {
    if (!buffer) {
      return;
    }
    merged.push({ type: "text", text: buffer });
    buffer = "";
  };

  for (const inline of inlines) {
    if (inline.type === "text") {
      buffer += inline.text;
      continue;
    }

    flushText();

    if (inline.type === "inline-wrapper") {
      merged.push({
        ...inline,
        children: mergeInlineForRender(inline.children),
      });
      continue;
    }

    merged.push(inline);
  }

  flushText();
  return merged;
}
