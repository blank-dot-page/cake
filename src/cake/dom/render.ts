import type { Block, Doc, Inline } from "../core/types";
import type { Runtime } from "../core/runtime";
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
  dom: Runtime["dom"],
  root?: HTMLElement,
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

  function getBlockKey(block: Block): string {
    if (block.type === "paragraph") {
      return "paragraph";
    }
    if (block.type === "block-wrapper") {
      return `block-wrapper:${block.kind}`;
    }
    if (block.type === "block-atom") {
      return `block-atom:${block.kind}`;
    }
    return "unknown";
  }

  function getElementKey(element: Element): string {
    if (element.classList.contains("cake-line")) {
      if (element.hasAttribute("data-block-atom")) {
        return `block-atom:${element.getAttribute("data-block-atom")}`;
      }
      return "paragraph";
    }
    if (element.hasAttribute("data-block-wrapper")) {
      return `block-wrapper:${element.getAttribute("data-block-wrapper")}`;
    }
    if (element.hasAttribute("data-block-atom")) {
      return `block-atom:${element.getAttribute("data-block-atom")}`;
    }
    return "unknown";
  }

  function getInlineKey(inline: Inline): string {
    if (inline.type === "text") {
      return "text";
    }
    if (inline.type === "inline-wrapper") {
      return `inline-wrapper:${inline.kind}`;
    }
    if (inline.type === "inline-atom") {
      return `inline-atom:${inline.kind}`;
    }
    return "unknown";
  }

  function getInlineElementKey(element: Element): string {
    if (element.classList.contains("cake-text")) {
      return "text";
    }
    for (const cls of Array.from(element.classList)) {
      if (cls.startsWith("cake-inline--")) {
        return `inline-wrapper:${cls.slice("cake-inline--".length)}`;
      }
      if (cls.startsWith("cake-inline-atom--")) {
        return `inline-atom:${cls.slice("cake-inline-atom--".length)}`;
      }
    }
    return "unknown";
  }

  function reconcileInline(inline: Inline, existing: Element | null): Node[] {
    for (const renderInline of dom.inlineRenderers) {
      const result = renderInline(inline, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (inline.type === "text") {
      const canReuse =
        existing &&
        existing instanceof HTMLSpanElement &&
        getInlineElementKey(existing) === "text";

      if (canReuse) {
        const textNode = existing.firstChild;
        if (textNode instanceof Text) {
          if (textNode.textContent !== inline.text) {
            textNode.textContent = inline.text;
          }
          createTextRun(textNode);
          return [existing];
        }
      }

      const element = document.createElement("span");
      element.className = "cake-text";
      const node = document.createTextNode(inline.text);
      createTextRun(node);
      element.append(node);
      return [element];
    }

    if (inline.type === "inline-wrapper") {
      const canReuse =
        existing &&
        existing instanceof HTMLSpanElement &&
        getInlineElementKey(existing) === getInlineKey(inline);

      if (canReuse) {
        existing.removeAttribute("data-inline");
        existing.classList.add("cake-inline", `cake-inline--${inline.kind}`);
        reconcileInlineChildren(existing, inline.children);
        return [existing];
      }

      const element = document.createElement("span");
      element.classList.add("cake-inline", `cake-inline--${inline.kind}`);
      for (const child of inline.children) {
        for (const node of reconcileInline(child, null)) {
          element.append(node);
        }
      }
      return [element];
    }

    if (inline.type === "inline-atom") {
      const canReuse =
        existing &&
        existing instanceof HTMLSpanElement &&
        getInlineElementKey(existing) === getInlineKey(inline);

      if (canReuse) {
        existing.removeAttribute("data-inline-atom");
        existing.classList.add(
          "cake-inline-atom",
          `cake-inline-atom--${inline.kind}`,
        );
        const textNode = existing.firstChild;
        if (textNode instanceof Text) {
          createTextRun(textNode);
          return [existing];
        }
      }

      const element = document.createElement("span");
      element.classList.add(
        "cake-inline-atom",
        `cake-inline-atom--${inline.kind}`,
      );
      const node = document.createTextNode(" ");
      createTextRun(node);
      element.append(node);
      return [element];
    }

    return [];
  }

  function reconcileInlineChildren(parent: Element, inlines: Inline[]) {
    const mergedInlines = mergeInlineForRender(inlines);
    const existingChildren = Array.from(parent.children);
    const newChildren: Node[] = [];

    mergedInlines.forEach((inline, i) => {
      const existingChild = existingChildren[i] ?? null;
      const canReuse =
        existingChild && getInlineElementKey(existingChild) === getInlineKey(inline);
      const nodes = reconcileInline(inline, canReuse ? existingChild : null);
      newChildren.push(...nodes);
    });

    if (
      newChildren.length === existingChildren.length &&
      newChildren.every((node, i) => node === existingChildren[i])
    ) {
      return;
    }

    parent.replaceChildren(...newChildren);
  }

  function renderInline(inline: Inline): Node[] {
    return reconcileInline(inline, null);
  }

  function reconcileBlock(block: Block, existing: Element | null): Node[] {
    for (const renderBlock of dom.blockRenderers) {
      const result = renderBlock(block, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (block.type === "paragraph") {
      const canReuse =
        existing &&
        existing instanceof HTMLDivElement &&
        getElementKey(existing) === "paragraph";

      const currentLineIndex = context.getLineIndex();
      context.incrementLineIndex();

      if (canReuse) {
        existing.setAttribute("data-line-index", String(currentLineIndex));
        existing.removeAttribute("data-block");
        delete existing.dataset.lineKind;
        delete existing.dataset.headingLevel;
        delete existing.dataset.headingPlaceholder;
        existing.removeAttribute("aria-placeholder");
        existing.className = "cake-line";
        existing.removeAttribute("style");

        if (block.content.length === 0) {
          const firstChild = existing.firstChild;
          if (firstChild instanceof Text && existing.querySelector("br")) {
            if (firstChild.textContent !== "") {
              firstChild.textContent = "";
            }
            createTextRun(firstChild);
            return [existing];
          }

          existing.replaceChildren();
          const textNode = document.createTextNode("");
          createTextRun(textNode);
          existing.append(textNode);
          existing.append(document.createElement("br"));
          return [existing];
        }

        reconcileInlineChildren(existing, block.content);
        return [existing];
      }

      const element = document.createElement("div");
      element.setAttribute("data-line-index", String(currentLineIndex));
      element.classList.add("cake-line");

      if (block.content.length === 0) {
        const textNode = document.createTextNode("");
        createTextRun(textNode);
        element.append(textNode);
        element.append(document.createElement("br"));
      } else {
        const mergedContent = mergeInlineForRender(block.content);
        for (const inline of mergedContent) {
          for (const node of reconcileInline(inline, null)) {
            element.append(node);
          }
        }
      }
      return [element];
    }

    if (block.type === "block-wrapper") {
      const canReuse =
        existing &&
        existing instanceof HTMLDivElement &&
        getElementKey(existing) === getBlockKey(block);

      if (canReuse) {
        reconcileBlockChildren(existing, block.blocks);
        return [existing];
      }

      const element = document.createElement("div");
      element.setAttribute("data-block-wrapper", block.kind);
      for (const node of renderBlocks(block.blocks)) {
        element.append(node);
      }
      return [element];
    }

    if (block.type === "block-atom") {
      const canReuse =
        existing &&
        existing instanceof HTMLDivElement &&
        getElementKey(existing) === getBlockKey(block);

      const currentLineIndex = context.getLineIndex();
      context.incrementLineIndex();

      if (canReuse) {
        existing.setAttribute("data-line-index", String(currentLineIndex));
        return [existing];
      }

      const element = document.createElement("div");
      element.setAttribute("data-block-atom", block.kind);
      element.setAttribute("data-line-index", String(currentLineIndex));
      element.classList.add("cake-line");
      return [element];
    }

    return [];
  }

  function reconcileBlockChildren(parent: Element, blocks: Block[]) {
    const existingChildren = Array.from(parent.children);
    const newChildren: Node[] = [];

    blocks.forEach((block, index) => {
      const existingChild = existingChildren[index] ?? null;
      const canReuse =
        existingChild && getElementKey(existingChild) === getBlockKey(block);
      const nodes = reconcileBlock(block, canReuse ? existingChild : null);
      newChildren.push(...nodes);
      if (index < blocks.length - 1) {
        cursorOffset += 1;
      }
    });

    if (
      newChildren.length === existingChildren.length &&
      newChildren.every((node, i) => node === existingChildren[i])
    ) {
      return;
    }

    parent.replaceChildren(...newChildren);
  }

  function renderBlock(block: Block): Node[] {
    return reconcileBlock(block, null);
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

  const existingChildren = root ? Array.from(root.children) : [];
  const contentNodes: Node[] = [];

  doc.blocks.forEach((block, index) => {
    const existingChild = existingChildren[index] ?? null;
    const canReuse =
      existingChild && getElementKey(existingChild) === getBlockKey(block);
    const nodes = reconcileBlock(block, canReuse ? existingChild : null);
    contentNodes.push(...nodes);
    if (index < doc.blocks.length - 1) {
      cursorOffset += 1;
    }
  });

  return { content: contentNodes, map: createDomMap(runs) };
}

export function renderDoc(
  doc: Doc,
  dom: Runtime["dom"],
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
    for (const renderInline of dom.inlineRenderers) {
      const result = renderInline(inline, context);
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
      element.classList.add("cake-inline", `cake-inline--${inline.kind}`);
      for (const child of inline.children) {
        for (const node of renderInline(child)) {
          element.append(node);
        }
      }
      return [element];
    }

    if (inline.type === "inline-atom") {
      const element = document.createElement("span");
      element.classList.add(
        "cake-inline-atom",
        `cake-inline-atom--${inline.kind}`,
      );
      const node = document.createTextNode(" ");
      createTextRun(node);
      element.append(node);
      return [element];
    }

    return [];
  }

  function renderBlock(block: Block): Node[] {
    for (const renderBlock of dom.blockRenderers) {
      const result = renderBlock(block, context);
      if (result) {
        return normalizeNodes(result);
      }
    }

    if (block.type === "paragraph") {
      const element = document.createElement("div");
      element.setAttribute("data-line-index", String(context.getLineIndex()));
      element.classList.add("cake-line");
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
