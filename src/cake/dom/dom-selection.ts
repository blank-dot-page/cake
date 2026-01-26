import type { Affinity, Selection } from "../core/types";
import type { DomMap } from "./dom-map";

export function applyDomSelection(selection: Selection, map: DomMap): void {
  const domSelection = window.getSelection();
  if (!domSelection) {
    return;
  }

  const isCollapsed = selection.start === selection.end;
  let anchorCursor = selection.start;
  let focusCursor = selection.end;
  let isForward = true;

  if (!isCollapsed) {
    // Selection values come from two sources:
    // - engine/model helpers (often normalized start<=end with `affinity` as direction)
    // - DOM reads (anchor/focus order, possibly start>end)
    //
    // Reconstruct anchor/focus in a way that preserves direction while keeping
    // the mapping extension-agnostic.
    if (selection.start > selection.end) {
      // DOM-style anchor/focus (start=end? handled above)
      anchorCursor = selection.start;
      focusCursor = selection.end;
      isForward = false;
    } else if (selection.affinity === "backward") {
      // Model-style backward selection: anchor is the higher edge.
      anchorCursor = selection.end;
      focusCursor = selection.start;
      isForward = false;
    } else {
      // Model-style forward selection (default)
      anchorCursor = selection.start;
      focusCursor = selection.end;
      isForward = true;
    }
  }

  const baseAnchorAffinity = isCollapsed
    ? (selection.affinity ?? "forward")
    : isForward
      ? "forward"
      : "backward";
  const baseFocusAffinity = isCollapsed
    ? (selection.affinity ?? "forward")
    : isForward
      ? "backward"
      : "forward";
  const anchorAffinity = normalizeAffinityForBlockBoundary(
    map,
    anchorCursor,
    baseAnchorAffinity,
    isCollapsed,
  );
  const focusAffinity = normalizeAffinityForBlockBoundary(
    map,
    focusCursor,
    baseFocusAffinity,
    isCollapsed,
  );

  const anchorPoint = map.domAtCursor(anchorCursor, anchorAffinity);
  const focusPoint = map.domAtCursor(focusCursor, focusAffinity);
  if (!anchorPoint || !focusPoint) {
    return;
  }

  if (
    domSelection.rangeCount > 0 &&
    domSelection.anchorNode === anchorPoint.node &&
    domSelection.anchorOffset === anchorPoint.offset &&
    domSelection.focusNode === focusPoint.node &&
    domSelection.focusOffset === focusPoint.offset
  ) {
    return;
  }

  if (isCollapsed) {
    domSelection.collapse(anchorPoint.node, anchorPoint.offset);
    return;
  }

  // Prefer APIs that preserve direction (anchor/focus).
  const selectionWithExtent = domSelection as unknown as {
    setBaseAndExtent?: (
      anchorNode: Node,
      anchorOffset: number,
      focusNode: Node,
      focusOffset: number,
    ) => void;
  };
  if (typeof selectionWithExtent.setBaseAndExtent === "function") {
    selectionWithExtent.setBaseAndExtent(
      anchorPoint.node,
      anchorPoint.offset,
      focusPoint.node,
      focusPoint.offset,
    );
    return;
  }
  if (typeof domSelection.extend === "function") {
    domSelection.collapse(anchorPoint.node, anchorPoint.offset);
    domSelection.extend(focusPoint.node, focusPoint.offset);
    return;
  }

  // Fallback: apply the selection as a range in document order.
  domSelection.removeAllRanges();
  const range = document.createRange();
  const rangeStart = isForward ? anchorPoint : focusPoint;
  const rangeEnd = isForward ? focusPoint : anchorPoint;
  range.setStart(rangeStart.node, rangeStart.offset);
  range.setEnd(rangeEnd.node, rangeEnd.offset);
  domSelection.addRange(range);
}

export function readDomSelection(map: DomMap): Selection | null {
  const domSelection = window.getSelection();
  if (!domSelection || domSelection.rangeCount === 0) {
    return null;
  }

  const anchorPoint = resolveTextPoint(
    domSelection.anchorNode,
    domSelection.anchorOffset,
  );
  const focusPoint = resolveTextPoint(
    domSelection.focusNode,
    domSelection.focusOffset,
  );
  if (!anchorPoint || !focusPoint) {
    return null;
  }

  const anchor = map.cursorAtDom(anchorPoint.node, anchorPoint.offset);
  const focus = map.cursorAtDom(focusPoint.node, focusPoint.offset);
  if (!anchor || !focus) {
    return null;
  }

  // Model selection contract:
  // - Always normalize to start <= end
  // - Encode direction in `affinity` for range selections
  // - Preserve caret-side affinity only for collapsed selections
  if (anchor.cursorOffset === focus.cursorOffset) {
    return {
      start: anchor.cursorOffset,
      end: anchor.cursorOffset,
      affinity: focus.affinity,
    };
  }
  if (anchor.cursorOffset < focus.cursorOffset) {
    return {
      start: anchor.cursorOffset,
      end: focus.cursorOffset,
      affinity: "forward",
    };
  }
  return {
    start: focus.cursorOffset,
    end: anchor.cursorOffset,
    affinity: "backward",
  };
}

function resolveTextPoint(
  node: Node | null,
  offset: number,
): { node: Text; offset: number } | null {
  if (!node) {
    return null;
  }
  if (node instanceof Text) {
    return { node, offset };
  }
  if (!(node instanceof Element)) {
    return null;
  }

  const children = node.childNodes;
  if (children.length === 0) {
    return null;
  }

  if (offset <= 0) {
    const first = findTextNodeAtOrAfter(children, 0);
    return first ? { node: first, offset: 0 } : null;
  }

  if (offset >= children.length) {
    const last = findTextNodeAtOrBefore(children, children.length - 1);
    return last ? { node: last, offset: last.data.length } : null;
  }

  const exact = findFirstTextNode(children[offset]);
  if (exact) {
    return { node: exact, offset: 0 };
  }

  const previous = findTextNodeAtOrBefore(children, offset - 1);
  if (previous) {
    return { node: previous, offset: previous.data.length };
  }

  const next = findTextNodeAtOrAfter(children, offset + 1);
  return next ? { node: next, offset: 0 } : null;
}

function normalizeAffinityForBlockBoundary(
  map: DomMap,
  cursorOffset: number,
  affinity: Affinity,
  isCollapsed: boolean,
): Affinity {
  if (isCollapsed || affinity !== "backward") {
    return affinity;
  }
  if (!isBlockBoundaryOffset(map, cursorOffset)) {
    return affinity;
  }
  return "forward";
}

function isBlockBoundaryOffset(map: DomMap, cursorOffset: number): boolean {
  const runs = map.runs;
  for (let i = 1; i < runs.length; i += 1) {
    const run = runs[i];
    const previous = runs[i - 1];
    if (cursorOffset > previous.cursorEnd && cursorOffset <= run.cursorStart) {
      return run.cursorStart > previous.cursorEnd;
    }
  }
  return false;
}

function findFirstTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return node;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const next = walker.nextNode();
  return next instanceof Text ? next : null;
}

function findLastTextNode(node: Node): Text | null {
  if (node instanceof Text) {
    return node;
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      last = current;
    }
    current = walker.nextNode();
  }
  return last;
}

function findTextNodeAtOrAfter(
  nodes: NodeListOf<ChildNode>,
  start: number,
): Text | null {
  for (let i = Math.max(0, start); i < nodes.length; i += 1) {
    const found = findFirstTextNode(nodes[i]);
    if (found) {
      return found;
    }
  }
  return null;
}

function findTextNodeAtOrBefore(
  nodes: NodeListOf<ChildNode>,
  start: number,
): Text | null {
  for (let i = Math.min(nodes.length - 1, start); i >= 0; i -= 1) {
    const found = findLastTextNode(nodes[i]);
    if (found) {
      return found;
    }
  }
  return null;
}
