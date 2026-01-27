import type {
  LayoutMeasurer,
  LayoutModel,
  LayoutRect,
  LayoutRow,
  LineInfo,
  LineLayout,
} from "./selection-layout";
import { buildLayoutModel, getLineOffsets } from "./selection-layout";

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

type DomPosition = { node: Node; offset: number };

function createDomPositionResolver(
  lineElement: HTMLElement,
): (offsetInLine: number) => DomPosition {
  const textNodes: Text[] = [];
  const cumulativeEnds: number[] = [];
  const walker = createTextWalker(lineElement);
  let current = walker.nextNode();
  let total = 0;

  while (current) {
    if (current instanceof Text) {
      const length = current.data.length;
      textNodes.push(current);
      total += length;
      cumulativeEnds.push(total);
    }
    current = walker.nextNode();
  }

  if (textNodes.length === 0) {
    return () => {
      if (!lineElement.textContent) {
        return { node: lineElement, offset: 0 };
      }
      return { node: lineElement, offset: lineElement.childNodes.length };
    };
  }

  return (offsetInLine: number) => {
    const clamped = Math.max(0, Math.min(offsetInLine, total));
    let low = 0;
    let high = cumulativeEnds.length - 1;
    while (low < high) {
      const mid = low + high >>> 1;
      if ((cumulativeEnds[mid] ?? 0) < clamped) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    const node = textNodes[low] ?? lineElement;
    const prevEnd = low > 0 ? (cumulativeEnds[low - 1] ?? 0) : 0;
    return { node, offset: clamped - prevEnd };
  };
}

function measureCharacterRect(params: {
  lineElement: HTMLElement;
  offset: number;
  lineLength: number;
  cursorToCodeUnit: number[];
  resolveDomPosition: (offset: number) => DomPosition;
  range: Range;
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
  const startPosition = params.resolveDomPosition(startCodeUnit);
  const endPosition = params.resolveDomPosition(endCodeUnit);
  params.range.setStart(startPosition.node, startPosition.offset);
  params.range.setEnd(endPosition.node, endPosition.offset);
  const rects = params.range.getClientRects();
  if (rects.length > 0) {
    return rects[0] ?? null;
  }
  const rect = params.range.getBoundingClientRect();
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

  const WRAP_THRESHOLD_PX = 3;

  const resolvePosition = createDomPositionResolver(params.lineElement);
  const scratchRange = document.createRange();
  const topCache = new Map<number, number | null>();

  const fullLineStart = resolvePosition(0);
  const fullLineEnd = resolvePosition(params.codeUnitLength);
  scratchRange.setStart(fullLineStart.node, fullLineStart.offset);
  scratchRange.setEnd(fullLineEnd.node, fullLineEnd.offset);
  const fullLineRects = groupDomRectsByRow(Array.from(scratchRange.getClientRects()));
  if (fullLineRects.length === 0) {
    return [
      {
        startOffset: 0,
        endOffset: params.lineLength,
        rect: fallbackLineBox,
      },
    ];
  }

  function offsetToTop(offset: number): number | null {
    if (topCache.has(offset)) {
      return topCache.get(offset) ?? null;
    }
    const rect = measureCharacterRect({
      lineElement: params.lineElement,
      offset,
      lineLength: params.lineLength,
      cursorToCodeUnit: params.cursorToCodeUnit,
      resolveDomPosition: resolvePosition,
      range: scratchRange,
    });
    const top = rect ? rect.top : null;
    topCache.set(offset, top);
    return top;
  }

  function findFirstMeasurableOffset(from: number): number | null {
    for (let offset = Math.max(0, from); offset < params.lineLength; offset++) {
      if (offsetToTop(offset) !== null) {
        return offset;
      }
    }
    return null;
  }

  function findNextRowStartOffset(
    fromExclusive: number,
    rowTop: number,
  ): number | null {
    const lastIndex = params.lineLength - 1;
    if (fromExclusive > lastIndex) {
      return null;
    }

    const isNewRowAt = (offset: number): boolean => {
      const top = offsetToTop(offset);
      return top !== null && Math.abs(top - rowTop) > WRAP_THRESHOLD_PX;
    };

    // Exponential search to find a point that lands on the next row.
    let step = 1;
    let lastSame = fromExclusive - 1;
    let probe = fromExclusive;
    while (probe <= lastIndex) {
      if (isNewRowAt(probe)) {
        break;
      }
      lastSame = probe;
      probe += step;
      step *= 2;
    }
    if (probe > lastIndex) {
      probe = lastIndex;
      if (!isNewRowAt(probe)) {
        return null;
      }
    }

    // Binary search for the first offset whose top differs (lower_bound).
    let low = Math.max(fromExclusive, lastSame + 1);
    let high = probe;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (isNewRowAt(mid)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    return low < params.lineLength ? low : null;
  }

  // Measure row boundaries using a log-time search per row rather than a full
  // per-character scan (important for very long lines).
  const rows: LayoutRow[] = [];
  const firstMeasurable = findFirstMeasurableOffset(0);
  if (firstMeasurable === null) {
    return [
      {
        startOffset: 0,
        endOffset: params.lineLength,
        rect: fallbackLineBox,
      },
    ];
  }

  let currentRowStart = 0;
  let currentRowTop = fullLineRects[0]?.top ?? params.lineRect.top;
  let searchFrom = firstMeasurable + 1;
  let rowIndex = 0;

  while (currentRowStart < params.lineLength) {
    const nextRowStart = findNextRowStartOffset(searchFrom, currentRowTop);
    const currentRowEnd = nextRowStart ?? params.lineLength;
    const domRect = fullLineRects[rowIndex] ?? params.lineRect;

    rows.push({
      startOffset: currentRowStart,
      endOffset: currentRowEnd,
      rect: toLayoutRect({
        rect: domRect,
        containerRect: params.containerRect,
        scroll: params.scroll,
      }),
    });

    if (nextRowStart === null) {
      break;
    }
    currentRowStart = nextRowStart;
    rowIndex += 1;
    const nextMeasurable = findFirstMeasurableOffset(currentRowStart);
    if (nextMeasurable === null) {
      break;
    }
    currentRowTop = fullLineRects[rowIndex]?.top ?? currentRowTop;
    searchFrom = nextMeasurable + 1;
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

export function measureLayoutModelRangeFromDom(params: {
  lines: LineInfo[];
  root: HTMLElement;
  container: HTMLElement;
  startLineIndex: number;
  endLineIndex: number;
}): LayoutModel | null {
  const measurer = createDomLayoutMeasurer({
    root: params.root,
    container: params.container,
    lines: params.lines,
  });
  if (!measurer) {
    return null;
  }

  const clampedStart = Math.max(0, Math.min(params.startLineIndex, params.lines.length - 1));
  const clampedEnd = Math.max(clampedStart, Math.min(params.endLineIndex, params.lines.length - 1));
  const lineOffsets = getLineOffsets(params.lines);
  let lineStartOffset = lineOffsets[clampedStart] ?? 0;

  const layouts: LineLayout[] = [];
  for (let lineIndex = clampedStart; lineIndex <= clampedEnd; lineIndex += 1) {
    const lineInfo = params.lines[lineIndex];
    if (!lineInfo) {
      continue;
    }
    const measurement = measurer.measureLine({
      lineIndex: lineInfo.lineIndex,
      lineText: lineInfo.text,
      lineLength: lineInfo.cursorLength,
      lineHasNewline: lineInfo.hasNewline,
      top: 0,
    });
    layouts.push({
      lineIndex: lineInfo.lineIndex,
      lineStartOffset,
      lineLength: lineInfo.cursorLength,
      lineHasNewline: lineInfo.hasNewline,
      lineBox: measurement.lineBox,
      rows: measurement.rows,
    });
    lineStartOffset += lineInfo.cursorLength + (lineInfo.hasNewline ? 1 : 0);
  }

  return { container: measurer.container, lines: layouts };
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
