import type {
  LayoutMeasurer,
  LayoutModel,
  LayoutRect,
  LayoutRow,
  LineInfo,
} from "./selection-layout";
import { buildLayoutModel } from "./selection-layout";

export function toLayoutRect(params: {
  rect: DOMRect;
  containerRect: DOMRect;
  scroll: { top: number; left: number };
}): LayoutRect {
  return {
    top: params.rect.top - params.containerRect.top + params.scroll.top,
    left: params.rect.left - params.containerRect.left + params.scroll.left,
    width: params.rect.width,
    height: params.rect.height,
  };
}

function mergeDomRects(rects: DOMRect[]): DOMRect | null {
  if (rects.length === 0) {
    return null;
  }
  let left = rects[0]?.left ?? 0;
  let top = rects[0]?.top ?? 0;
  let right = left + (rects[0]?.width ?? 0);
  let bottom = top + (rects[0]?.height ?? 0);
  rects.forEach((rect) => {
    const rectRight = rect.left + rect.width;
    const rectBottom = rect.top + rect.height;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rectRight);
    bottom = Math.max(bottom, rectBottom);
  });
  return new DOMRect(left, top, right - left, bottom - top);
}

function rectsOverlapVertically(a: DOMRect, b: DOMRect): boolean {
  const aBottom = a.top + a.height;
  const bBottom = b.top + b.height;
  return a.top < bBottom && b.top < aBottom;
}

function groupDomRectsByRow(rects: DOMRect[]): DOMRect[] {
  if (rects.length === 0) {
    return [];
  }
  const sorted = [...rects].sort((a, b) =>
    a.top === b.top ? a.left - b.left : a.top - b.top,
  );
  const grouped: DOMRect[] = [];
  sorted.forEach((rect) => {
    const last = grouped[grouped.length - 1];
    if (last && rectsOverlapVertically(last, rect)) {
      grouped[grouped.length - 1] = mergeDomRects([last, rect]) ?? last;
      return;
    }
    grouped.push(rect);
  });
  return grouped;
}

function cursorOffsetToCodeUnit(
  cursorToCodeUnit: number[],
  offset: number,
): number {
  if (cursorToCodeUnit.length === 0) {
    return 0;
  }
  const clamped = Math.max(0, Math.min(offset, cursorToCodeUnit.length - 1));
  return cursorToCodeUnit[clamped] ?? 0;
}

function measureCharacterRect(params: {
  lineElement: HTMLElement;
  offset: number;
  lineLength: number;
  cursorToCodeUnit: number[];
}): DOMRect | null {
  if (params.lineLength <= 0) {
    return null;
  }
  const startCodeUnit = cursorOffsetToCodeUnit(
    params.cursorToCodeUnit,
    params.offset,
  );
  const endCodeUnit = cursorOffsetToCodeUnit(
    params.cursorToCodeUnit,
    Math.min(params.offset + 1, params.lineLength),
  );
  const startPosition = resolveDomPosition(params.lineElement, startCodeUnit);
  const endPosition = resolveDomPosition(params.lineElement, endCodeUnit);
  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  const rects = range.getClientRects();
  if (rects.length > 0) {
    return rects[0] ?? null;
  }
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }
  return rect;
}

function measureLineRows(params: {
  lineElement: HTMLElement;
  lineLength: number;
  lineRect: DOMRect;
  containerRect: DOMRect;
  scroll: { top: number; left: number };
  cursorToCodeUnit: number[];
  codeUnitLength: number;
}): LayoutRow[] {
  const fallbackLineBox = toLayoutRect({
    rect: params.lineRect,
    containerRect: params.containerRect,
    scroll: params.scroll,
  });

  if (params.lineLength === 0) {
    return [
      {
        startOffset: 0,
        endOffset: 0,
        rect: { ...fallbackLineBox, width: 0 },
      },
    ];
  }

  // Measure actual character positions to find row boundaries
  // This works correctly with variable-width fonts
  const rows: LayoutRow[] = [];
  let currentRowStart = 0;
  let currentRowTop: number | null = null;
  let currentRowRect: DOMRect | null = null;

  for (let offset = 0; offset < params.lineLength; offset++) {
    const charRect = measureCharacterRect({
      lineElement: params.lineElement,
      offset,
      lineLength: params.lineLength,
      cursorToCodeUnit: params.cursorToCodeUnit,
    });

    if (!charRect) {
      continue;
    }

    if (currentRowTop === null) {
      // First character
      currentRowTop = charRect.top;
      currentRowRect = charRect;
    } else if (Math.abs(charRect.top - currentRowTop) > 3) {
      // New row detected - save the previous row
      // endOffset is the boundary position (cursor position after last char on row)
      // which equals the startOffset of the next row
      if (currentRowRect) {
        rows.push({
          startOffset: currentRowStart,
          endOffset: offset,
          rect: toLayoutRect({
            rect: currentRowRect,
            containerRect: params.containerRect,
            scroll: params.scroll,
          }),
        });
      }
      currentRowStart = offset;
      currentRowTop = charRect.top;
      currentRowRect = charRect;
    } else if (currentRowRect) {
      // Same row - expand the rect
      currentRowRect = new DOMRect(
        Math.min(currentRowRect.left, charRect.left),
        Math.min(currentRowRect.top, charRect.top),
        Math.max(currentRowRect.right, charRect.right) -
          Math.min(currentRowRect.left, charRect.left),
        Math.max(currentRowRect.bottom, charRect.bottom) -
          Math.min(currentRowRect.top, charRect.top),
      );
    }
  }

  // Push the final row
  if (currentRowRect) {
    rows.push({
      startOffset: currentRowStart,
      endOffset: params.lineLength - 1,
      rect: toLayoutRect({
        rect: currentRowRect,
        containerRect: params.containerRect,
        scroll: params.scroll,
      }),
    });
  }

  // Fallback if no rows were detected
  if (rows.length === 0) {
    return [
      {
        startOffset: 0,
        endOffset: params.lineLength,
        rect: fallbackLineBox,
      },
    ];
  }

  // Ensure last row's endOffset is the full line length
  if (rows.length > 0) {
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      endOffset: params.lineLength,
    };
  }

  // For single-row lines, use the fallback line box dimensions for consistency
  if (rows.length === 1) {
    rows[0] = {
      ...rows[0],
      rect: {
        ...rows[0].rect,
        top: fallbackLineBox.top,
        height: fallbackLineBox.height,
      },
    };
  }

  return rows;
}

export function createDomLayoutMeasurer(params: {
  root: HTMLElement;
  container: HTMLElement;
  lines: LineInfo[];
}): LayoutMeasurer | null {
  const initialContainerRect = params.container.getBoundingClientRect();
  if (!Number.isFinite(initialContainerRect.width)) {
    return null;
  }

  return {
    container: {
      top: 0,
      left: 0,
      width: initialContainerRect.width,
      height: initialContainerRect.height,
    },
    measureLine: ({ lineIndex, lineLength, top }) => {
      const lineInfo = params.lines[lineIndex];
      const containerRect = params.container.getBoundingClientRect();
      const scroll = {
        top: params.container.scrollTop,
        left: params.container.scrollLeft,
      };
      const lineElement = getLineElement(params.root, lineIndex);
      if (!lineElement || !lineInfo) {
        return {
          lineBox: {
            top,
            left: 0,
            width: containerRect.width,
            height: 0,
          },
          rows: [],
        };
      }
      const lineRect = lineElement.getBoundingClientRect();
      return {
        lineBox: toLayoutRect({ rect: lineRect, containerRect, scroll }),
        rows: measureLineRows({
          lineElement,
          lineLength,
          lineRect,
          containerRect,
          scroll,
          cursorToCodeUnit: lineInfo.cursorToCodeUnit,
          codeUnitLength: lineInfo.text.length,
        }),
      };
    },
  };
}

export function measureLayoutModelFromDom(params: {
  lines: LineInfo[];
  root: HTMLElement;
  container: HTMLElement;
}): LayoutModel | null {
  const measurer = createDomLayoutMeasurer({
    root: params.root,
    container: params.container,
    lines: params.lines,
  });
  if (!measurer) {
    return null;
  }
  return buildLayoutModel(params.lines, measurer);
}

export function getLineElement(
  root: HTMLElement,
  lineIndex: number,
): HTMLElement | null {
  return root.querySelector(`[data-line-index="${lineIndex}"]`);
}

function createTextWalker(root: Node) {
  return document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
}

export function resolveDomPosition(
  lineElement: HTMLElement,
  offsetInLine: number,
): { node: Node; offset: number } {
  const walker = createTextWalker(lineElement);
  let remaining = offsetInLine;
  let current = walker.nextNode();

  while (current) {
    const length = current.textContent?.length ?? 0;
    if (remaining <= length) {
      return { node: current, offset: remaining };
    }
    remaining -= length;
    current = walker.nextNode();
  }
  if (!lineElement.textContent) {
    return { node: lineElement, offset: 0 };
  }
  return { node: lineElement, offset: lineElement.childNodes.length };
}

export function createOffsetToXMeasurer(params: {
  root: HTMLElement;
  container: HTMLElement;
  lines: LineInfo[];
}): (lineIndex: number, offsetInLine: number) => number | null {
  const { root, container, lines } = params;
  const containerRect = container.getBoundingClientRect();
  const scrollLeft = container.scrollLeft;

  return (lineIndex: number, offsetInLine: number): number | null => {
    const lineElement = getLineElement(root, lineIndex);
    const lineInfo = lines[lineIndex];
    if (!lineElement || !lineInfo) {
      return null;
    }
    const codeUnitOffset = cursorOffsetToCodeUnit(
      lineInfo.cursorToCodeUnit,
      offsetInLine,
    );
    const position = resolveDomPosition(lineElement, codeUnitOffset);
    const range = document.createRange();
    range.setStart(position.node, position.offset);
    range.setEnd(position.node, position.offset);

    const rects = range.getClientRects();
    if (rects.length > 0) {
      const rect = rects[0];
      return rect.left - containerRect.left + scrollLeft;
    }

    const boundingRect = range.getBoundingClientRect();
    if (boundingRect.width === 0 && boundingRect.left !== 0) {
      return boundingRect.left - containerRect.left + scrollLeft;
    }

    return null;
  };
}

export function cursorOffsetToDomOffset(
  cursorToCodeUnit: number[],
  offset: number,
): number {
  return cursorOffsetToCodeUnit(cursorToCodeUnit, offset);
}
