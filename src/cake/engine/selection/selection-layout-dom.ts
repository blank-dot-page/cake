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

export function groupDomRectsByRow(rects: DOMRect[]): DOMRect[] {
  if (rects.length === 0) {
    return [];
  }
  // IMPORTANT:
  // `Range.getClientRects()` returns one rect per line box fragment, but in some
  // engines (and/or with small line-heights) adjacent fragments can *overlap*
  // vertically. Grouping-by-overlap will incorrectly merge multiple rows into one.
  //
  // Instead, group by (approximately) equal `top` and merge only within that row.
  const ROW_TOP_EPS_PX = 1;

  const sorted = [...rects].sort((a, b) =>
    a.top === b.top ? a.left - b.left : a.top - b.top,
  );

  const grouped: DOMRect[] = [];
  for (const rect of sorted) {
    const last = grouped[grouped.length - 1];
    if (last && Math.abs(rect.top - last.top) <= ROW_TOP_EPS_PX) {
      grouped[grouped.length - 1] = mergeDomRects([last, rect]) ?? last;
      continue;
    }
    grouped.push(rect);
  }

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

  // If start and end are in different text nodes and end is at offset 0 of next node,
  // try measuring within the end node instead (the character lives there)
  if (
    startPosition.node !== endPosition.node &&
    startPosition.node instanceof Text &&
    endPosition.node instanceof Text &&
    startPosition.offset === startPosition.node.length &&
    endPosition.offset > 0
  ) {
    // The character is in the end node, measure from offset 0 to endPosition.offset
    params.range.setStart(endPosition.node, 0);
    params.range.setEnd(endPosition.node, endPosition.offset);
  } else {
    params.range.setStart(startPosition.node, startPosition.offset);
    params.range.setEnd(endPosition.node, endPosition.offset);
  }

  const rects = params.range.getClientRects();
  if (rects.length > 0) {
    // Some engines can include zero-width fragments for a single character
    // (notably at soft wrap boundaries). Prefer the largest rect.
    const list = Array.from(rects);
    let best = list[0] ?? null;
    let bestArea = best ? best.width * best.height : 0;
    for (const rect of list) {
      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = rect;
        bestArea = area;
      }
    }
    return bestArea > 0 ? best : (list[0] ?? null);
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
  const fullLineRects = groupDomRectsByRow(
    Array.from(scratchRange.getClientRects()),
  );
  if (fullLineRects.length === 0) {
    return [
      {
        startOffset: 0,
        endOffset: params.lineLength,
        rect: fallbackLineBox,
      },
    ];
  }

  // Convert fragment rects into non-overlapping row boxes by clamping each row's
  // height to the distance to the next row top. This avoids downstream logic
  // (hit-testing, center-based row selection, etc.) being affected by engines
  // that report overlapping line box heights.
  const rowRects: DOMRect[] = fullLineRects.map((rect, index) => {
    const nextTop = fullLineRects[index + 1]?.top ?? params.lineRect.bottom;
    const bottom = Math.max(rect.top, nextTop);
    const height = Math.max(0, bottom - rect.top);
    return new DOMRect(rect.left, rect.top, rect.width, height);
  });

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
    let top = rect ? rect.top : null;
    if (top === null) {
      // Some engines occasionally fail to return a usable rect for certain
      // characters (notably at soft-wrap boundaries). Fall back to measuring the
      // caret position at this offset so row detection remains stable.
      const codeUnitOffset = cursorOffsetToCodeUnit(params.cursorToCodeUnit, offset);
      const position = resolvePosition(codeUnitOffset);
      scratchRange.setStart(position.node, position.offset);
      scratchRange.setEnd(position.node, position.offset);
      const rects = scratchRange.getClientRects();
      if (rects.length > 0) {
        top = rects[0]?.top ?? null;
      } else {
        const caretRect = scratchRange.getBoundingClientRect();
        if (!(caretRect.width === 0 && caretRect.height === 0)) {
          top = caretRect.top;
        }
      }
    }
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
    const domRect = rowRects[rowIndex] ?? params.lineRect;

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

export type HitTestResult = {
  cursorOffset: number;
  pastRowEnd: boolean;
};

export function hitTestFromLayout(params: {
  clientX: number;
  clientY: number;
  root: HTMLElement;
  container: HTMLElement;
  lines: LineInfo[];
}): HitTestResult | null {
  const { clientX, clientY, root, container, lines } = params;
  const layout = measureLayoutModelFromDom({ lines, root, container });
  if (!layout || layout.lines.length === 0) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const scroll = { top: container.scrollTop, left: container.scrollLeft };

  // Convert client coordinates to container-relative coordinates
  const relativeX = clientX - containerRect.left + scroll.left;
  const relativeY = clientY - containerRect.top + scroll.top;

  // Collect all rows from all lines with their document offsets
  const allRows: Array<{
    lineIndex: number;
    lineStartOffset: number;
    row: LayoutRow;
    centerY: number;
  }> = [];

  for (const lineLayout of layout.lines) {
    for (const row of lineLayout.rows) {
      const centerY = row.rect.top + row.rect.height / 2;
      allRows.push({
        lineIndex: lineLayout.lineIndex,
        lineStartOffset: lineLayout.lineStartOffset,
        row,
        centerY,
      });
    }
  }

  if (allRows.length === 0) {
    return null;
  }

  // Find the closest row by Y center distance
  let targetRowInfo = allRows[0];
  let smallestCenterDistance = Math.abs(relativeY - targetRowInfo.centerY);
  for (let i = 1; i < allRows.length; i++) {
    const rowInfo = allRows[i];
    const distance = Math.abs(relativeY - rowInfo.centerY);
    if (distance < smallestCenterDistance) {
      smallestCenterDistance = distance;
      targetRowInfo = rowInfo;
    }
  }

  const { lineIndex, lineStartOffset, row } = targetRowInfo;
  const lineInfo = lines[lineIndex];
  if (!lineInfo) {
    return null;
  }

  const lineElement = getLineElement(root, lineIndex);
  if (!lineElement) {
    return null;
  }

  // Find the closest cursor offset by X within the target row.
  //
  // Measuring per-character client rects is brittle across engines at text-node
  // boundaries (e.g. when a trailing space lives in a text node that ends right
  // before an inline wrapper like <a>). Prefer collapsed ranges (caret positions)
  // and pick the fragment that belongs to the target visual row.
  const resolvePosition = createDomPositionResolver(lineElement);
  const scratchRange = document.createRange();
  const rowTop = row.rect.top;

  const approximateX = (cursorOffsetInLine: number): number => {
    const clamped = Math.max(
      row.startOffset,
      Math.min(cursorOffsetInLine, row.endOffset),
    );
    const rowLength = row.endOffset - row.startOffset;
    if (rowLength <= 0) {
      return row.rect.left;
    }
    const fraction = (clamped - row.startOffset) / rowLength;
    return row.rect.left + row.rect.width * fraction;
  };

  const measureCaretXOnRow = (cursorOffsetInLine: number): number | null => {
    const maxRowTopDelta = Math.max(2, row.rect.height / 2);

    const measureCharEdgeX = (
      from: number,
      to: number,
      edge: "left" | "right",
    ): number | null => {
      const fromCodeUnit = cursorOffsetToCodeUnit(lineInfo.cursorToCodeUnit, from);
      const toCodeUnit = cursorOffsetToCodeUnit(lineInfo.cursorToCodeUnit, to);
      const fromPos = resolvePosition(fromCodeUnit);
      const toPos = resolvePosition(toCodeUnit);
      // When the measured character boundary spans across text nodes (e.g. a
      // trailing space in one node right before an inline wrapper), some engines
      // can return empty rect lists for a cross-node range. Prefer measuring
      // inside the end node when the boundary lands at the end of the start node.
      if (
        fromPos.node !== toPos.node &&
        fromPos.node instanceof Text &&
        toPos.node instanceof Text &&
        fromPos.offset === fromPos.node.length &&
        toPos.offset > 0
      ) {
        scratchRange.setStart(toPos.node, 0);
        scratchRange.setEnd(toPos.node, toPos.offset);
      } else {
        scratchRange.setStart(fromPos.node, fromPos.offset);
        scratchRange.setEnd(toPos.node, toPos.offset);
      }
      const rects = scratchRange.getClientRects();
      const list =
        rects.length > 0
          ? Array.from(rects)
          : (() => {
              const rect = scratchRange.getBoundingClientRect();
              return rect.width === 0 && rect.height === 0 ? [] : [rect];
            })();
      if (list.length === 0) {
        return null;
      }
      // Pick rects from the visual row closest to `rowTop`, then take the
      // extreme edge across those rects. This avoids zero-width fragments
      // skewing the result (WebKit can include those at wrap boundaries).
      const DIST_EPS = 0.01;
      let bestTopDistance = Number.POSITIVE_INFINITY;
      const candidates: DOMRect[] = [];
      for (const rect of list) {
        const top = rect.top - containerRect.top + scroll.top;
        const distance = Math.abs(top - rowTop);
        if (distance + DIST_EPS < bestTopDistance) {
          bestTopDistance = distance;
          candidates.length = 0;
          candidates.push(rect);
        } else if (Math.abs(distance - bestTopDistance) <= DIST_EPS) {
          candidates.push(rect);
        }
      }
      if (candidates.length === 0 || bestTopDistance > maxRowTopDelta) {
        return null;
      }
      if (edge === "left") {
        let left = candidates[0]!.left;
        for (const rect of candidates) {
          left = Math.min(left, rect.left);
        }
        return left - containerRect.left + scroll.left;
      }
      let right = candidates[0]!.right;
      for (const rect of candidates) {
        right = Math.max(right, rect.right);
      }
      return right - containerRect.left + scroll.left;
    };

    // Prefer deriving boundary X from a neighboring character's rect. This is
    // more stable than collapsed-caret rects at wrap boundaries across engines.
    //
    // WebKit can report "trailing" spaces at the end of a text node (right before
    // an inline element like <a>) with a zero-width rect whose right edge equals
    // the previous character's boundary. In that case the caret boundary after
    // the space must be derived from the next visible character instead.
    const prevChar =
      cursorOffsetInLine > 0
        ? (lineInfo.text[cursorOffsetInLine - 1] ?? "")
        : "";
    const preferNextForPrevWhitespace =
      cursorOffsetInLine > row.startOffset &&
      cursorOffsetInLine < row.endOffset &&
      /\s/.test(prevChar);

    if (preferNextForPrevWhitespace) {
      const xNext = measureCharEdgeX(
        cursorOffsetInLine,
        cursorOffsetInLine + 1,
        "left",
      );
      if (xNext !== null) {
        return xNext;
      }
    }

    if (cursorOffsetInLine > row.startOffset) {
      const xPrev = measureCharEdgeX(
        cursorOffsetInLine - 1,
        cursorOffsetInLine,
        "right",
      );
      if (xPrev !== null) {
        return xPrev;
      }
    }

    if (cursorOffsetInLine < row.endOffset) {
      const xNext = measureCharEdgeX(
        cursorOffsetInLine,
        cursorOffsetInLine + 1,
        "left",
      );
      if (xNext !== null) {
        return xNext;
      }
    }

    const codeUnitOffset = cursorOffsetToCodeUnit(
      lineInfo.cursorToCodeUnit,
      cursorOffsetInLine,
    );
    const position = resolvePosition(codeUnitOffset);
    scratchRange.setStart(position.node, position.offset);
    scratchRange.setEnd(position.node, position.offset);
    const rects = scratchRange.getClientRects();
    const candidates =
      rects.length > 0
        ? Array.from(rects)
        : [scratchRange.getBoundingClientRect()];
    if (candidates.length === 0) {
      return null;
    }
    let best = candidates[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const rect of candidates) {
      const top = rect.top - containerRect.top + scroll.top;
      const distance = Math.abs(top - rowTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = rect;
      }
    }
    // If the caret rect we got belongs to a different visual row (common at wrap
    // boundaries in some engines), fall back to the layout-based approximation
    // to keep X monotonic within this row.
    if (bestDistance > maxRowTopDelta) {
      return null;
    }
    if (best.height <= 0) {
      return null;
    }
    return best.left - containerRect.left + scroll.left;
  };

  const caretX = (cursorOffsetInLine: number): number => {
    return measureCaretXOnRow(cursorOffsetInLine) ?? approximateX(cursorOffsetInLine);
  };

  // Binary search the insertion point for relativeX among monotonic caret Xs.
  let low = row.startOffset;
  let high = row.endOffset;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const xMid = caretX(mid);
    if (xMid < relativeX) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidateA = Math.max(row.startOffset, Math.min(low, row.endOffset));
  const candidateB = Math.max(
    row.startOffset,
    Math.min(candidateA - 1, row.endOffset),
  );
  const xA = caretX(candidateA);
  const xB = caretX(candidateB);
  const distA = Math.abs(relativeX - xA);
  const distB = Math.abs(relativeX - xB);
  const DIST_EPS_PX = 0.5;
  let closestOffset = (() => {
    if (distB + DIST_EPS_PX < distA) {
      return candidateB;
    }
    if (distA + DIST_EPS_PX < distB) {
      return candidateA;
    }
    // Near-ties: decide by midpoint between the two caret boundaries. This is
    // stable for narrow glyphs where subpixel jitter and integer mouse coords
    // would otherwise make left/right clicks ambiguous.
    const mid = (xA + xB) / 2;
    return relativeX >= mid ? candidateA : candidateB;
  })();

  const endX = caretX(row.endOffset);
  // Normalize within runs of *source-only* offsets that collapse to the same DOM
  // caret position (e.g. "[" in a markdown link). Multiple cursor offsets may map
  // to the same code unit offset; in that case clicks should prefer the earliest
  // cursor offset in that collapsed run.
  //
  // IMPORTANT: do not collapse offsets purely by X distance — engines may report
  // identical X for distinct, measurable caret boundaries (notably around trailing
  // spaces at inline boundaries in WebKit). Use code-unit equality as the signal
  // that the offsets are truly indistinguishable in the DOM.
  {
    const baseMeasuredX = measureCaretXOnRow(closestOffset);
    if (baseMeasuredX !== null) {
      const baseCodeUnit = cursorOffsetToCodeUnit(
        lineInfo.cursorToCodeUnit,
        closestOffset,
      );
      const COLLAPSE_EPS_PX = 0.25;
      while (closestOffset > row.startOffset) {
        const prev = closestOffset - 1;
        const prevCodeUnit = cursorOffsetToCodeUnit(lineInfo.cursorToCodeUnit, prev);
        if (prevCodeUnit !== baseCodeUnit) {
          break;
        }
        const prevMeasuredX = measureCaretXOnRow(prev);
        if (prevMeasuredX === null) {
          break;
        }
        if (Math.abs(prevMeasuredX - baseMeasuredX) > COLLAPSE_EPS_PX) {
          break;
        }
        closestOffset = prev;
      }
    }
  }

  const boundaryX = caretX(closestOffset);
  // If the click lands on the "left" side of the chosen caret boundary, treat it
  // as selecting the right edge of the previous character (backward affinity).
  // This preserves expected wrapper behavior at boundaries (e.g. bold continues
  // when clicking the right side of a bold character).
  const choseRightEdge =
    closestOffset > row.startOffset && relativeX < boundaryX - 0.01;

  // Determine if caret should have backward affinity when clicking past the end
  // of a wrapped visual row (i.e. beyond the row-end caret). EXCEPT: at end of
  // the logical line, prefer forward affinity (v1 parity: exit formatting).
  const isEndOfLine = row.endOffset === lineInfo.cursorLength;
  const atLineEnd = closestOffset === row.endOffset && isEndOfLine;
  const pastRowEnd =
    (!atLineEnd && choseRightEdge) ||
    (!atLineEnd &&
      closestOffset === row.endOffset &&
      row.endOffset < lineInfo.cursorLength &&
      relativeX > endX + 0.5);
  return {
    cursorOffset: lineStartOffset + closestOffset,
    pastRowEnd,
  };
}
