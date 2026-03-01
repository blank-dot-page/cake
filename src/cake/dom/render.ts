import type { Block, Doc, Inline } from "../core/types";
import type { Runtime } from "../core/runtime";
import { graphemeCount } from "../shared/segmenter";
import type { DomRenderContext } from "./types";
import {
  createDomMap,
  createTextRun as createTextRunBase,
  type TextRun,
} from "./dom-map";

export type RenderSnapshotBlock = {
  nodeStart: number;
  nodeEnd: number;
  runStart: number;
  runEnd: number;
  cursorStart: number;
  cursorEnd: number;
  lineStart: number;
  lineEnd: number;
};

export type RenderSnapshot = {
  blocks: RenderSnapshotBlock[];
  nodes: Node[];
  runs: TextRun[];
};

export type DirtyCursorRange = {
  previous: {
    start: number;
    end: number;
  };
  next: {
    start: number;
    end: number;
  };
};

export type RenderResult = {
  root: HTMLElement;
  map: ReturnType<typeof createDomMap>;
};

export type RenderContentResult = {
  content: Node[];
  map: ReturnType<typeof createDomMap>;
  snapshot: RenderSnapshot;
};

export type RenderDocContentOptions = {
  previousSnapshot?: RenderSnapshot | null;
  dirtyCursorRange?: DirtyCursorRange | null;
};

type MeasuredBlock = {
  cursorStart: number;
  cursorEnd: number;
  lineStart: number;
  lineEnd: number;
};

function normalizeNodes(result: Node | Node[] | null): Node[] {
  if (!result) {
    return [];
  }
  return Array.isArray(result) ? result : [result];
}

function isManagedRootNode(node: Node): boolean {
  if (!(node instanceof Element)) {
    return false;
  }
  return (
    node.hasAttribute("data-line-index") ||
    node.hasAttribute("data-block-wrapper") ||
    node.hasAttribute("data-block-atom") ||
    node.classList.contains("cake-line")
  );
}

function countInlineCursorUnits(inline: Inline): number {
  if (inline.type === "text") {
    return graphemeCount(inline.text);
  }

  if (inline.type === "inline-wrapper") {
    let total = 0;
    for (const child of inline.children) {
      total += countInlineCursorUnits(child);
    }
    return total;
  }

  if (inline.type === "inline-atom") {
    return 1;
  }

  return 0;
}

function measureBlock(block: Block): { cursorLength: number; lineCount: number } {
  if (block.type === "paragraph") {
    let cursorLength = 0;
    for (const inline of block.content) {
      cursorLength += countInlineCursorUnits(inline);
    }
    return { cursorLength, lineCount: 1 };
  }

  if (block.type === "block-atom") {
    return { cursorLength: 1, lineCount: 1 };
  }

  if (block.type === "block-wrapper") {
    let cursorLength = 0;
    let lineCount = 0;
    for (let i = 0; i < block.blocks.length; i += 1) {
      const child = block.blocks[i]!;
      const measured = measureBlock(child);
      cursorLength += measured.cursorLength;
      lineCount += measured.lineCount;
      if (i < block.blocks.length - 1) {
        cursorLength += 1;
      }
    }
    return { cursorLength, lineCount };
  }

  return { cursorLength: 0, lineCount: 0 };
}

function measureTopLevelBlocks(doc: Doc): MeasuredBlock[] {
  const measuredBlocks: MeasuredBlock[] = [];
  let cursorOffset = 0;
  let lineIndex = 0;

  doc.blocks.forEach((block, index) => {
    const measured = measureBlock(block);
    measuredBlocks.push({
      cursorStart: cursorOffset,
      cursorEnd: cursorOffset + measured.cursorLength,
      lineStart: lineIndex,
      lineEnd: lineIndex + measured.lineCount,
    });

    cursorOffset += measured.cursorLength;
    lineIndex += measured.lineCount;
    if (index < doc.blocks.length - 1) {
      cursorOffset += 1;
    }
  });

  return measuredBlocks;
}

function blockRangeForCursorRange(
  blocks: Array<{ cursorStart: number; cursorEnd: number }>,
  start: number,
  end: number,
): { start: number; end: number } {
  if (blocks.length === 0) {
    return { start: 0, end: 0 };
  }

  const rangeStart = Math.min(start, end);
  const rangeEnd = Math.max(start, end);

  let first = -1;
  let last = -1;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    const spanStart = block.cursorStart;
    const spanEnd =
      i < blocks.length - 1 ? block.cursorEnd + 1 : block.cursorEnd;

    if (spanEnd < rangeStart || spanStart > rangeEnd) {
      continue;
    }

    if (first === -1) {
      first = i;
    }
    last = i;
  }

  if (first === -1) {
    if (rangeEnd <= blocks[0]!.cursorStart) {
      return { start: 0, end: 0 };
    }
    return { start: blocks.length, end: blocks.length };
  }

  return { start: first, end: last + 1 };
}

function shiftRun(run: TextRun, delta: number): TextRun {
  if (delta === 0) {
    return run;
  }
  return {
    node: run.node,
    cursorStart: run.cursorStart + delta,
    cursorEnd: run.cursorEnd + delta,
    boundaryOffsets: run.boundaryOffsets,
  };
}

function snapshotMatchesRoot(root: HTMLElement, snapshot: RenderSnapshot): boolean {
  const managedChildren = Array.from(root.childNodes).filter(isManagedRootNode);
  if (managedChildren.length !== snapshot.nodes.length) {
    return false;
  }

  for (let i = 0; i < managedChildren.length; i += 1) {
    if (managedChildren[i] !== snapshot.nodes[i]) {
      return false;
    }
  }

  return true;
}

export function renderDocContent(
  doc: Doc,
  dom: Runtime["dom"],
  root?: HTMLElement,
  options?: RenderDocContentOptions,
): RenderContentResult {
  const measuredBlocks = measureTopLevelBlocks(doc);
  const previousSnapshot = options?.previousSnapshot ?? null;
  const dirtyCursorRange = options?.dirtyCursorRange ?? null;
  const canReuseSnapshot =
    Boolean(root && previousSnapshot && snapshotMatchesRoot(root, previousSnapshot));

  let oldDirtyStart = 0;
  let oldDirtyEnd = previousSnapshot?.blocks.length ?? 0;
  let newDirtyStart = 0;
  let newDirtyEnd = doc.blocks.length;

  if (canReuseSnapshot) {
    if (dirtyCursorRange) {
      const previousRange = blockRangeForCursorRange(
        previousSnapshot!.blocks,
        dirtyCursorRange.previous.start,
        dirtyCursorRange.previous.end,
      );
      const nextRange = blockRangeForCursorRange(
        measuredBlocks,
        dirtyCursorRange.next.start,
        dirtyCursorRange.next.end,
      );
      oldDirtyStart = previousRange.start;
      oldDirtyEnd = previousRange.end;
      newDirtyStart = nextRange.start;
      newDirtyEnd = nextRange.end;
    } else {
      oldDirtyStart = 0;
      oldDirtyEnd = 0;
      newDirtyStart = 0;
      newDirtyEnd = 0;
    }

    const oldDirtyLineCount = previousSnapshot!.blocks
      .slice(oldDirtyStart, oldDirtyEnd)
      .reduce((sum, block) => sum + (block.lineEnd - block.lineStart), 0);
    const newDirtyLineCount = measuredBlocks
      .slice(newDirtyStart, newDirtyEnd)
      .reduce((sum, block) => sum + (block.lineEnd - block.lineStart), 0);

    // If dirty blocks changed total line count, line indices shift for all trailing
    // blocks. Re-render tail to keep data-line-index attributes correct.
    if (oldDirtyLineCount !== newDirtyLineCount) {
      oldDirtyEnd = previousSnapshot!.blocks.length;
      newDirtyEnd = measuredBlocks.length;
    }

    let canReusePrefixSuffix = true;

    for (let i = 0; i < newDirtyStart; i += 1) {
      const oldBlock = previousSnapshot!.blocks[i];
      const nextMeasured = measuredBlocks[i];
      if (!oldBlock || !nextMeasured) {
        canReusePrefixSuffix = false;
        break;
      }
      if (
        oldBlock.cursorEnd - oldBlock.cursorStart !==
          nextMeasured.cursorEnd - nextMeasured.cursorStart ||
        oldBlock.lineEnd - oldBlock.lineStart !==
          nextMeasured.lineEnd - nextMeasured.lineStart
      ) {
        canReusePrefixSuffix = false;
        break;
      }
    }

    if (canReusePrefixSuffix) {
      for (let i = newDirtyEnd; i < measuredBlocks.length; i += 1) {
        const oldIndex = oldDirtyEnd + (i - newDirtyEnd);
        const oldBlock = previousSnapshot!.blocks[oldIndex];
        const nextMeasured = measuredBlocks[i];
        if (!oldBlock || !nextMeasured) {
          canReusePrefixSuffix = false;
          break;
        }
        if (
          oldBlock.cursorEnd - oldBlock.cursorStart !==
            nextMeasured.cursorEnd - nextMeasured.cursorStart ||
          oldBlock.lineEnd - oldBlock.lineStart !==
            nextMeasured.lineEnd - nextMeasured.lineStart
        ) {
          canReusePrefixSuffix = false;
          break;
        }
      }
    }

    if (!canReusePrefixSuffix) {
      oldDirtyStart = 0;
      oldDirtyEnd = previousSnapshot!.blocks.length;
      newDirtyStart = 0;
      newDirtyEnd = measuredBlocks.length;
    }
  }

  const runs: TextRun[] = [];
  const contentNodes: Node[] = [];
  const snapshotBlocks: RenderSnapshotBlock[] = [];
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
    getCursorOffset: () => cursorOffset,
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

  function isManagedBlockElement(element: Element): boolean {
    return (
      element.hasAttribute("data-line-index") ||
      element.hasAttribute("data-block-wrapper") ||
      element.hasAttribute("data-block-atom") ||
      element.classList.contains("cake-line")
    );
  }

  function canReuseRenderedBlockElement(
    existing: Element,
    rendered: Element,
  ): boolean {
    if (!isManagedBlockElement(existing) || !isManagedBlockElement(rendered)) {
      return false;
    }

    if (existing.tagName !== rendered.tagName) {
      return false;
    }

    return (
      existing.getAttribute("data-block-wrapper") ===
        rendered.getAttribute("data-block-wrapper") &&
      existing.getAttribute("data-block-atom") ===
        rendered.getAttribute("data-block-atom")
    );
  }

  function syncManagedBlockAttributes(existing: Element, rendered: Element) {
    if (existing.className !== rendered.className) {
      existing.className = rendered.className;
    }

    const existingStyle = existing.getAttribute("style");
    const renderedStyle = rendered.getAttribute("style");
    if (existingStyle !== renderedStyle) {
      if (renderedStyle === null) {
        existing.removeAttribute("style");
      } else {
        existing.setAttribute("style", renderedStyle);
      }
    }

    const managedAttributes = [
      "data-line-index",
      "data-block-wrapper",
      "data-block-atom",
      "aria-placeholder",
    ];

    for (const name of managedAttributes) {
      const next = rendered.getAttribute(name);
      if (next === null) {
        existing.removeAttribute(name);
      } else if (existing.getAttribute(name) !== next) {
        existing.setAttribute(name, next);
      }
    }
  }

  function reconcileRenderedBlockElement(
    existing: Element,
    rendered: Element,
  ): Element {
    syncManagedBlockAttributes(existing, rendered);

    const existingChildren = Array.from(existing.childNodes);
    const renderedChildren = Array.from(rendered.childNodes);
    const nextChildren = renderedChildren.map((child, index) => {
      const existingChild = existingChildren[index];
      if (
        child instanceof Element &&
        existingChild instanceof Element &&
        canReuseRenderedBlockElement(existingChild, child)
      ) {
        return reconcileRenderedBlockElement(existingChild, child);
      }
      return child;
    });

    existing.replaceChildren(...nextChildren);
    return existing;
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
        existingChild &&
        getInlineElementKey(existingChild) === getInlineKey(inline);
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
        const renderedNodes = normalizeNodes(result);
        const renderedElement =
          renderedNodes.length === 1 && renderedNodes[0] instanceof Element
            ? renderedNodes[0]
            : null;

        if (
          existing instanceof Element &&
          renderedElement &&
          canReuseRenderedBlockElement(existing, renderedElement)
        ) {
          return [reconcileRenderedBlockElement(existing, renderedElement)];
        }

        return renderedNodes;
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
      const nodes = reconcileBlock(block, existingChild);
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

  function appendBlockSnapshot(
    nodes: Node[],
    measured: MeasuredBlock,
    runsStart: number,
    runsEnd: number,
    cursorStart: number,
    lineStart: number,
  ) {
    const nodeStart = contentNodes.length;
    contentNodes.push(...nodes);
    const nodeEnd = contentNodes.length;
    const cursorEnd = cursorStart + (measured.cursorEnd - measured.cursorStart);
    const lineEnd = lineStart + (measured.lineEnd - measured.lineStart);

    snapshotBlocks.push({
      nodeStart,
      nodeEnd,
      runStart: runsStart,
      runEnd: runsEnd,
      cursorStart,
      cursorEnd,
      lineStart,
      lineEnd,
    });

    cursorOffset = cursorEnd;
    lineIndex = lineEnd;
  }

  function appendReusedBlock(oldIndex: number, newIndex: number): boolean {
    if (!previousSnapshot) {
      return false;
    }

    const oldBlock = previousSnapshot.blocks[oldIndex];
    const measured = measuredBlocks[newIndex];
    if (!oldBlock || !measured) {
      return false;
    }

    const nodes = previousSnapshot.nodes.slice(oldBlock.nodeStart, oldBlock.nodeEnd);
    if (nodes.length !== oldBlock.nodeEnd - oldBlock.nodeStart) {
      return false;
    }

    if (root) {
      for (const node of nodes) {
        if (node.parentNode !== root) {
          return false;
        }
      }
    }

    const blockRuns = previousSnapshot.runs.slice(oldBlock.runStart, oldBlock.runEnd);
    const runShift = cursorOffset - oldBlock.cursorStart;
    const runsStart = runs.length;
    for (const run of blockRuns) {
      runs.push(shiftRun(run, runShift));
    }
    const runsEnd = runs.length;

    const cursorStart = cursorOffset;
    const lineStart = lineIndex;
    appendBlockSnapshot(nodes, measured, runsStart, runsEnd, cursorStart, lineStart);

    if (newIndex < doc.blocks.length - 1) {
      cursorOffset += 1;
    }

    return true;
  }

  const managedChildren = root
    ? Array.from(root.childNodes).filter(isManagedRootNode)
    : [];

  let fallbackToFullRender = false;

  for (let i = 0; i < newDirtyStart; i += 1) {
    if (!appendReusedBlock(i, i)) {
      fallbackToFullRender = true;
      break;
    }
  }

  if (!fallbackToFullRender) {
    for (let i = newDirtyStart; i < newDirtyEnd; i += 1) {
      const block = doc.blocks[i];
      if (!block) {
        continue;
      }

      const oldIndex = oldDirtyStart + (i - newDirtyStart);
      const oldBlock = previousSnapshot?.blocks[oldIndex] ?? null;

      let existing: Element | null = null;
      if (oldBlock && previousSnapshot) {
        const oldNodes = previousSnapshot.nodes.slice(oldBlock.nodeStart, oldBlock.nodeEnd);
        if (oldNodes.length === 1 && oldNodes[0] instanceof Element) {
          existing = oldNodes[0];
        }
      } else {
        const existingNode = managedChildren[oldIndex] ?? null;
        existing = existingNode instanceof Element ? existingNode : null;
      }

      const runsStart = runs.length;
      const cursorStart = cursorOffset;
      const lineStart = lineIndex;
      const nodes = reconcileBlock(block, existing);
      const runsEnd = runs.length;
      const measured = measuredBlocks[i]!;
      appendBlockSnapshot(nodes, measured, runsStart, runsEnd, cursorStart, lineStart);

      if (i < doc.blocks.length - 1) {
        cursorOffset += 1;
      }
    }
  }

  if (!fallbackToFullRender) {
    for (let i = newDirtyEnd; i < doc.blocks.length; i += 1) {
      const oldIndex = oldDirtyEnd + (i - newDirtyEnd);
      if (!appendReusedBlock(oldIndex, i)) {
        fallbackToFullRender = true;
        break;
      }
    }
  }

  if (fallbackToFullRender) {
    runs.length = 0;
    contentNodes.length = 0;
    snapshotBlocks.length = 0;
    cursorOffset = 0;
    lineIndex = 0;

    doc.blocks.forEach((block, index) => {
      const existingNode = managedChildren[index] ?? null;
      const existing = existingNode instanceof Element ? existingNode : null;

      const runsStart = runs.length;
      const cursorStart = cursorOffset;
      const lineStart = lineIndex;
      const nodes = reconcileBlock(block, existing);
      const runsEnd = runs.length;
      const measured = measuredBlocks[index]!;
      appendBlockSnapshot(nodes, measured, runsStart, runsEnd, cursorStart, lineStart);

      if (index < doc.blocks.length - 1) {
        cursorOffset += 1;
      }
    });
  }

  return {
    content: contentNodes,
    map: createDomMap(runs),
    snapshot: {
      blocks: snapshotBlocks,
      nodes: contentNodes,
      runs,
    },
  };
}

export function renderDoc(doc: Doc, dom: Runtime["dom"]): RenderResult {
  const root = document.createElement("div");
  root.className = "cake-content";
  root.setAttribute("contenteditable", "true");

  const { content, map } = renderDocContent(doc, dom);
  root.append(...content);

  return { root, map };
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
