import type { Selection } from "../../core/types";
import { resolveOffsetToLine, type LineInfo } from "./selection-layout";
import {
  createOffsetToXMeasurer,
  cursorOffsetToDomOffset,
  getLineElement,
  measureLayoutModelRangeFromDom,
  resolveDomPosition,
  toLayoutRect,
} from "./selection-layout-dom";
import {
  computeCaretRect,
  computeSelectionRects,
  type SelectionCaretMeasurement,
  type SelectionRect,
} from "./selection-geometry";

export type SelectionGeometry = {
  selectionRects: SelectionRect[];
  caretRect: SelectionRect | null;
  focusRect: SelectionRect | null;
};

export function getSelectionGeometry(params: {
  root: HTMLElement;
  container: HTMLElement;
  docLines: LineInfo[];
  selection: Selection;
}): SelectionGeometry {
  const { root, container, docLines, selection } = params;
  const normalized =
    selection.start <= selection.end
      ? selection
      : {
          start: selection.end,
          end: selection.start,
          affinity: selection.affinity,
        };
  const layout = shouldMeasureLayout(normalized)
    ? (() => {
        const startLine = resolveOffsetToLine(docLines, normalized.start);
        const endLine = resolveOffsetToLine(docLines, normalized.end);
        return measureLayoutModelRangeFromDom({
          lines: docLines,
          root,
          container,
          startLineIndex: startLine.lineIndex,
          endLineIndex: endLine.lineIndex,
        });
      })()
    : null;
  const containerRect = container.getBoundingClientRect();
  const scroll = { top: container.scrollTop, left: container.scrollLeft };
  const startLine = resolveOffsetToLine(docLines, normalized.start);
  const hasSelection = normalized.start !== normalized.end;

  if (!hasSelection) {
    const lineInfo = docLines[startLine.lineIndex];
    const lineElement = getLineElement(root, startLine.lineIndex);
    if (!lineInfo || !lineElement) {
      return { selectionRects: [], caretRect: null, focusRect: null };
    }
    const caret = getCaretRect({
      lineElement,
      lineInfo,
      offsetInLine: startLine.offsetInLine,
      affinity: selection.affinity ?? "forward",
    });
    if (!caret) {
      return { selectionRects: [], caretRect: null, focusRect: null };
    }
    const caretMeasurement: SelectionCaretMeasurement = {
      lineRect: toLayoutRect({
        rect: caret.lineRect,
        containerRect,
        scroll,
      }),
      caretRect: toLayoutRect({
        rect: caret.rect,
        containerRect,
        scroll,
      }),
      lineLength: lineInfo.cursorLength,
      fontSize: getComputedFontSize(lineElement),
      padding: getComputedVerticalPadding(lineElement),
    };
    const caretRect = computeCaretRect(caretMeasurement);
    return {
      selectionRects: [],
      caretRect,
      focusRect: caretRect,
    };
  }

  if (!layout) {
    return { selectionRects: [], caretRect: null, focusRect: null };
  }

  const measurer = createOffsetToXMeasurer({
    root,
    container,
    lines: docLines,
  });
  const focusOffset =
    normalized.affinity === "backward" ? normalized.start : normalized.end;
  const focusLine = resolveOffsetToLine(docLines, focusOffset);
  const focusLineElement = getLineElement(root, focusLine.lineIndex);
  let focusRect: SelectionRect | null = null;

  if (focusLineElement) {
    const lineInfo = docLines[focusLine.lineIndex];
    if (lineInfo) {
      const caret = getCaretRect({
        lineElement: focusLineElement,
        lineInfo,
        offsetInLine: focusLine.offsetInLine,
        affinity: selection.affinity ?? "forward",
      });
      if (caret) {
        const caretMeasurement: SelectionCaretMeasurement = {
          lineRect: toLayoutRect({
            rect: caret.lineRect,
            containerRect,
            scroll,
          }),
          caretRect: toLayoutRect({
            rect: caret.rect,
            containerRect,
            scroll,
          }),
          lineLength: lineInfo.cursorLength,
          fontSize: getComputedFontSize(focusLineElement),
          padding: getComputedVerticalPadding(focusLineElement),
        };
        focusRect = computeCaretRect(caretMeasurement);
      }
    }
  }

  return {
    selectionRects: computeSelectionRects(layout, normalized, measurer),
    caretRect: null,
    focusRect,
  };
}

function shouldMeasureLayout(selection: Selection): boolean {
  return selection.start !== selection.end;
}

export function getCaretRect(params: {
  lineElement: HTMLElement;
  lineInfo: LineInfo;
  offsetInLine: number;
  affinity?: "forward" | "backward";
}): { rect: DOMRect; lineRect: DOMRect } | null {
  const { lineElement, lineInfo, offsetInLine, affinity } = params;
  const clampedOffset = Math.max(
    0,
    Math.min(offsetInLine, lineInfo.cursorLength),
  );
  const codeUnitOffset = cursorOffsetToDomOffset(
    lineInfo.cursorToCodeUnit,
    clampedOffset,
  );
  const position = resolveDomPosition(lineElement, codeUnitOffset);
  const caretRange = document.createRange();
  caretRange.setStart(position.node, position.offset);
  caretRange.setEnd(position.node, position.offset);
  if (typeof caretRange.getBoundingClientRect !== "function") {
    return null;
  }
  const lineRect = lineElement.getBoundingClientRect();

  const caretRects = caretRange.getClientRects();
  let caretRect: DOMRect;
  if (caretRects.length > 1 && affinity === "backward") {
    caretRect = caretRects[0];
    for (let i = 1; i < caretRects.length; i += 1) {
      if (caretRects[i].top < caretRect.top) {
        caretRect = caretRects[i];
      }
    }
  } else {
    caretRect = caretRange.getBoundingClientRect();
  }

  if (lineInfo.cursorLength > 0) {
    const canProbeBackward = clampedOffset > 0;
    const canProbeForward = clampedOffset < lineInfo.cursorLength;

    let backwardRect: DOMRect | null = null;
    let forwardRect: DOMRect | null = null;

    if (canProbeBackward) {
      const backStart = resolveDomPosition(
        lineElement,
        cursorOffsetToDomOffset(lineInfo.cursorToCodeUnit, clampedOffset - 1),
      );
      const backEnd = resolveDomPosition(
        lineElement,
        cursorOffsetToDomOffset(lineInfo.cursorToCodeUnit, clampedOffset),
      );
      const backRange = document.createRange();
      backRange.setStart(backStart.node, backStart.offset);
      backRange.setEnd(backEnd.node, backEnd.offset);
      const backRects = backRange.getClientRects();
      if (backRects.length > 0) {
        backwardRect = backRects[backRects.length - 1];
      }
    }

    if (canProbeForward) {
      const fwdStart = resolveDomPosition(
        lineElement,
        cursorOffsetToDomOffset(lineInfo.cursorToCodeUnit, clampedOffset),
      );
      const fwdEnd = resolveDomPosition(
        lineElement,
        cursorOffsetToDomOffset(lineInfo.cursorToCodeUnit, clampedOffset + 1),
      );
      const fwdRange = document.createRange();
      fwdRange.setStart(fwdStart.node, fwdStart.offset);
      fwdRange.setEnd(fwdEnd.node, fwdEnd.offset);
      const fwdRects = fwdRange.getClientRects();
      if (fwdRects.length > 0) {
        forwardRect = fwdRects[0];
      }
    }

    const atWrapBoundary =
      backwardRect &&
      forwardRect &&
      Math.abs(backwardRect.top - forwardRect.top) > 5;

    let probeRect: DOMRect | null = null;
    let useRightEdge = false;

    if (atWrapBoundary) {
      if (affinity === "backward" && backwardRect) {
        probeRect = backwardRect;
        useRightEdge = true;
      } else if (forwardRect) {
        probeRect = forwardRect;
        useRightEdge = false;
      } else if (backwardRect) {
        probeRect = backwardRect;
        useRightEdge = true;
      }
    } else {
      if (forwardRect) {
        probeRect = forwardRect;
        useRightEdge = false;
      } else if (backwardRect) {
        probeRect = backwardRect;
        useRightEdge = true;
      }
    }

    if (probeRect && probeRect.height > 0) {
      const left = useRightEdge ? probeRect.right : probeRect.left;
      caretRect = new DOMRect(left, probeRect.top, 0, probeRect.height);
    }
  }

  if (caretRect.height === 0 && lineRect.height === 0) {
    return null;
  }
  return { rect: caretRect, lineRect };
}

function getComputedVerticalPadding(lineElement: HTMLElement): {
  top: number;
  bottom: number;
} {
  const style = window.getComputedStyle(lineElement);
  const top = Number.parseFloat(style.paddingTop);
  const bottom = Number.parseFloat(style.paddingBottom);
  return {
    top: Number.isFinite(top) ? top : 0,
    bottom: Number.isFinite(bottom) ? bottom : 0,
  };
}

function getComputedFontSize(lineElement: HTMLElement): number {
  const fontSize = window.getComputedStyle(lineElement).fontSize;
  const parsed = Number.parseFloat(fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}
